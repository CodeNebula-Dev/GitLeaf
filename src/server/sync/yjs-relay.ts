import { WebSocketServer, WebSocket } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { ProjectManager } from '../fs/manager.js';
import { GitSync } from '../git/sync.js';

const messageSync = 0;
const messageAwareness = 1;

interface Room {
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  conns: Set<WebSocket>;
  projectId: string;
  filePath: string;
  saveTimeout: NodeJS.Timeout | null;
}

export class YjsSyncRelay {
  private rooms = new Map<string, Room>();
  private projectManager: ProjectManager;

  constructor(projectManager: ProjectManager) {
    this.projectManager = projectManager;
  }

  public setupWebSocket(wss: WebSocketServer) {
    wss.on('connection', (conn: WebSocket, req) => {
      conn.binaryType = 'arraybuffer';

      const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
      const rawRoom = url.pathname.replace(/^\/ws\/?/, '') || url.searchParams.get('room') || 'default';
      const [projectId, ...fileParts] = rawRoom.split(':');
      const filePath = fileParts.join(':') || 'main.tex';

      const room = this.getOrCreateRoom(projectId, filePath);
      room.conns.add(conn);

      // 1. Send Sync Step 1 to new connection
      const syncEncoder = encoding.createEncoder();
      encoding.writeVarUint(syncEncoder, messageSync);
      syncProtocol.writeSyncStep1(syncEncoder, room.doc);
      this.send(conn, encoding.toUint8Array(syncEncoder));

      // 2. Send Awareness states if any
      const awarenessStates = room.awareness.getStates();
      if (awarenessStates.size > 0) {
        const awarenessEncoder = encoding.createEncoder();
        encoding.writeVarUint(awarenessEncoder, messageAwareness);
        encoding.writeVarUint8Array(
          awarenessEncoder,
          awarenessProtocol.encodeAwarenessUpdate(room.awareness, Array.from(awarenessStates.keys()))
        );
        this.send(conn, encoding.toUint8Array(awarenessEncoder));
      }

      // 3. Handle incoming binary messages from client
      conn.on('message', (message: any) => {
        try {
          const uint8 = message instanceof Uint8Array ? message : new Uint8Array(message);
          const decoder = decoding.createDecoder(uint8);
          const messageType = decoding.readVarUint(decoder);

          switch (messageType) {
            case messageSync: {
              const replyEncoder = encoding.createEncoder();
              encoding.writeVarUint(replyEncoder, messageSync);
              syncProtocol.readSyncMessage(decoder, replyEncoder, room.doc, conn);
              if (encoding.length(replyEncoder) > 1) {
                this.send(conn, encoding.toUint8Array(replyEncoder));
              }
              break;
            }
            case messageAwareness: {
              awarenessProtocol.applyAwarenessUpdate(
                room.awareness,
                decoding.readVarUint8Array(decoder),
                conn
              );
              break;
            }
          }
        } catch (err) {
          console.error('Error handling Yjs message:', err);
        }
      });

      // 4. Handle connection close — clean up empty rooms
      conn.on('close', () => {
        room.conns.delete(conn);

        // If no more connections in this room, destroy it so next connect starts fresh from disk
        if (room.conns.size === 0) {
          // Save final state to disk before destroying
          if (room.saveTimeout) clearTimeout(room.saveTimeout);
          try {
            const currentProj = this.projectManager.getProject(room.projectId);
            if (currentProj) {
              const textContent = room.doc.getText('monaco').toString();
              if (textContent) {
                this.projectManager.writeFile(currentProj.rootPath, room.filePath, textContent);
              }
            }
          } catch {}

          room.doc.destroy();
          this.rooms.delete(`${room.projectId}:${room.filePath}`);
        }
      });
    });
  }

  private send(conn: WebSocket, m: Uint8Array) {
    if (conn.readyState === WebSocket.OPEN) {
      try {
        conn.send(m);
      } catch {}
    }
  }

  private getOrCreateRoom(projectId: string, filePath: string): Room {
    const roomKey = `${projectId}:${filePath}`;
    if (!this.rooms.has(roomKey)) {
      const doc = new Y.Doc();
      const awareness = new awarenessProtocol.Awareness(doc);

      // Load initial content from disk if exists
      const project = this.projectManager.getProject(projectId);
      if (project) {
        try {
          const diskContent = this.projectManager.readFile(project.rootPath, filePath);
          const yText = doc.getText('monaco');
          if (yText.length === 0 && diskContent) {
            yText.insert(0, diskContent);
          }
        } catch {}
      }

      const room: Room = {
        doc,
        awareness,
        conns: new Set(),
        projectId,
        filePath,
        saveTimeout: null,
      };

      // Broadcast Doc updates to other connected peers & persist to disk
      doc.on('update', (update: Uint8Array, origin: any) => {
        const updateEncoder = encoding.createEncoder();
        encoding.writeVarUint(updateEncoder, messageSync);
        syncProtocol.writeUpdate(updateEncoder, update);
        const message = encoding.toUint8Array(updateEncoder);

        for (const peer of room.conns) {
          if (peer !== origin && peer.readyState === WebSocket.OPEN) {
            this.send(peer, message);
          }
        }

        // Debounce saving file content to local disk
        if (room.saveTimeout) clearTimeout(room.saveTimeout);
        room.saveTimeout = setTimeout(() => {
          try {
            const currentProj = this.projectManager.getProject(projectId);
            if (currentProj) {
              const textContent = doc.getText('monaco').toString();
              this.projectManager.writeFile(currentProj.rootPath, filePath, textContent);
              
              // Automatically commit & push in background if Git remote is configured
              if (currentProj.gitRemote && GitSync.isGitRepo(currentProj.rootPath)) {
                GitSync.commitAndPushAsync(currentProj.rootPath, `GitLeaf auto-save: ${filePath}`);
              }
            }
          } catch (saveErr) {
            console.error(`Failed to persist ${filePath} to disk:`, saveErr);
          }
        }, 1000);
      });

      // Broadcast Awareness updates to all connected peers
      awareness.on('update', ({ added, updated, removed }: any, origin: any) => {
        const changedClients = added.concat(updated, removed);
        const awarenessEncoder = encoding.createEncoder();
        encoding.writeVarUint(awarenessEncoder, messageAwareness);
        encoding.writeVarUint8Array(
          awarenessEncoder,
          awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients)
        );
        const message = encoding.toUint8Array(awarenessEncoder);

        for (const peer of room.conns) {
          if (peer !== origin && peer.readyState === WebSocket.OPEN) {
            this.send(peer, message);
          }
        }
      });

      this.rooms.set(roomKey, room);
    }

    return this.rooms.get(roomKey)!;
  }
}

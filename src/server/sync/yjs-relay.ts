import { WebSocketServer, WebSocket } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import { ProjectManager } from '../fs/manager.js';

interface Room {
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  conns: Set<WebSocket>;
  projectId: string;
  filePath: string;
}

export class YjsSyncRelay {
  private rooms = new Map<string, Room>();
  private projectManager: ProjectManager;

  constructor(projectManager: ProjectManager) {
    this.projectManager = projectManager;
  }

  public setupWebSocket(wss: WebSocketServer) {
    wss.on('connection', (conn: WebSocket, req) => {
      const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
      const roomId = url.pathname.replace(/^\/ws\/?/, '') || 'default';
      const [projectId, ...fileParts] = roomId.split(':');
      const filePath = fileParts.join(':') || 'main.tex';

      const room = this.getOrCreateRoom(projectId, filePath);
      room.conns.add(conn);

      // Send initial sync step 1
      const encoder = new TextEncoder();
      
      conn.on('message', (message: any) => {
        try {
          // Relay message to other peers in room
          for (const client of room.conns) {
            if (client !== conn && client.readyState === WebSocket.OPEN) {
              client.send(message);
            }
          }
        } catch (err) {
          console.error('Error broadcasting CRDT message:', err);
        }
      });

      conn.on('close', () => {
        room.conns.delete(conn);
        if (room.conns.size === 0) {
          // Room idle
        }
      });
    });
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
          const content = this.projectManager.readFile(project.rootPath, filePath);
          const yText = doc.getText('monaco');
          yText.insert(0, content);
        } catch {
          // New file or empty
        }
      }

      this.rooms.set(roomKey, {
        doc,
        awareness,
        conns: new Set(),
        projectId,
        filePath,
      });
    }

    return this.rooms.get(roomKey)!;
  }
}

import { nanoid } from 'nanoid';
import os from 'os';
import path from 'path';
import fs from 'fs';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import WebSocket from 'ws';
import { ProjectManager } from '../fs/manager.js';
import { ProjectMetadata } from '../../shared/types.js';
import { DEFAULT_SERVER_PORT } from '../../shared/constants.js';

export interface InviteToken {
  token: string;
  shortCode: string;
  projectId: string;
  projectName: string;
  role: 'editor' | 'viewer';
  createdTime: number;
  expiresTime: number;
  inviteeEmail?: string;
  hostIp: string;
  hostPort: number;
  filesSnapshot?: Record<string, string>;
}

export function getLocalIp(): string {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    if (name.startsWith('utun') || name.startsWith('awdl') || name.startsWith('llw') || name.startsWith('bridge')) {
      continue;
    }
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

export class InviteManager {
  private invites = new Map<string, InviteToken>();
  private projectManager: ProjectManager;
  private persistentFile: string;

  constructor(projectManager: ProjectManager) {
    this.projectManager = projectManager;
    this.persistentFile = path.join(this.projectManager.getBaseDir(), '.invites.json');
    this.loadPersistedInvites();
  }

  private loadPersistedInvites() {
    if (fs.existsSync(this.persistentFile)) {
      try {
        const raw = fs.readFileSync(this.persistentFile, 'utf-8');
        const list: InviteToken[] = JSON.parse(raw);
        for (const inv of list) {
          if (Date.now() <= inv.expiresTime) {
            this.invites.set(inv.token, inv);
            this.invites.set(inv.shortCode, inv);
            this.invites.set(inv.projectId, inv);
          }
        }
      } catch {}
    }
  }

  private savePersistedInvites() {
    try {
      const list = Array.from(this.invites.values());
      const unique = Array.from(new Map(list.map((item) => [item.token, item])).values());
      fs.writeFileSync(this.persistentFile, JSON.stringify(unique, null, 2), 'utf-8');
    } catch {}
  }

  public createInvite(projectId: string, role: 'editor' | 'viewer' = 'editor', email?: string): InviteToken {
    const project = this.projectManager.getProject(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    const hostIp = getLocalIp();
    // Clean 6-character PIN code e.g. gl-739182
    const cleanId = nanoid(6).toLowerCase().replace(/[^a-z0-9]/g, 'x');
    const shortCode = `gl-${cleanId}`;

    // Read all project files to snapshot
    const files = this.projectManager.getProjectFiles(project.rootPath);
    const filesMap: Record<string, string> = {};
    for (const f of files) {
      if (f.type === 'file') {
        try {
          filesMap[f.path] = this.projectManager.readFile(project.rootPath, f.path);
        } catch {}
      }
    }

    const invite: InviteToken = {
      token: shortCode,
      shortCode,
      projectId: project.id,
      projectName: project.name,
      role,
      createdTime: Date.now(),
      expiresTime: Date.now() + 14 * 24 * 60 * 60 * 1000,
      inviteeEmail: email,
      hostIp,
      hostPort: DEFAULT_SERVER_PORT,
      filesSnapshot: filesMap,
    };

    this.invites.set(shortCode, invite);
    this.invites.set(project.id, invite);
    this.savePersistedInvites();

    // Publish project snapshot to global peer match relay for instant cross-machine resolution
    try {
      const pinDoc = new Y.Doc();
      const pinProvider = new WebsocketProvider(
        'wss://demos.yjs.dev/ws',
        `gitleaf-pin-${shortCode}`,
        pinDoc,
        { WebSocketPolyfill: WebSocket as any }
      );
      const dataMap = pinDoc.getMap('project');
      dataMap.set('payload', {
        id: project.id,
        name: project.name,
        mainFile: project.mainFile,
        engine: project.engine,
        files: filesMap,
        hostIp,
        hostPort: DEFAULT_SERVER_PORT,
      });

      pinProvider.on('sync', (isSynced: boolean) => {
        if (isSynced) {
          // keep synced briefly then unbind
          setTimeout(() => pinProvider.destroy(), 30000);
        }
      });
    } catch (err) {
      console.warn('Could not publish to global signaling relay:', err);
    }

    return invite;
  }

  public getInvite(codeOrToken: string): InviteToken | null {
    const clean = codeOrToken.trim();
    if (this.invites.has(clean)) {
      const inv = this.invites.get(clean)!;
      if (Date.now() <= inv.expiresTime) return inv;
    }
    return null;
  }

  public async acceptInviteAsync(
    tokenOrCode: string,
    collaboratorName: string,
    hostHint?: string
  ): Promise<ProjectMetadata> {
    let clean = tokenOrCode.trim();

    if (clean.startsWith('http://') || clean.startsWith('https://')) {
      try {
        const parsedUrl = new URL(clean);
        clean = parsedUrl.searchParams.get('join') || parsedUrl.searchParams.get('invite') || clean;
      } catch {}
    } else if (clean.includes('join=')) {
      clean = clean.split('join=')[1].split('&')[0];
    } else if (clean.includes('invite=')) {
      clean = clean.split('invite=')[1].split('&')[0];
    }

    // 1. Check local registry first (if joining on the same laptop)
    this.loadPersistedInvites();
    const localInvite = this.getInvite(clean);
    if (localInvite) {
      const project = this.projectManager.getProject(localInvite.projectId);
      if (project) {
        const existing = project.collaborators.find((c) => c.name.toLowerCase() === collaboratorName.toLowerCase());
        if (!existing) {
          project.collaborators.push({
            id: nanoid(6),
            name: collaboratorName,
            color: ['#10B981', '#3B82F6', '#F59E0B', '#8B5CF6', '#EC4899'][project.collaborators.length % 5],
            role: localInvite.role,
            lastActive: Date.now(),
          });
          const metaPath = path.join(project.rootPath, '.gitleaf.json');
          fs.writeFileSync(metaPath, JSON.stringify(project, null, 2), 'utf-8');
        }
        return project;
      }
    }

    // 2. Resolve short code from global peer match relay (wss://demos.yjs.dev/ws)
    const relayPayload = await this.fetchFromRelay(clean);
    if (relayPayload && relayPayload.name && relayPayload.files) {
      const slug = relayPayload.name.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      const folderName = `${slug}-${nanoid(5)}`;
      const projPath = path.join(this.projectManager.getBaseDir(), folderName);
      fs.mkdirSync(projPath, { recursive: true });

      const newProject: ProjectMetadata = {
        id: relayPayload.id || nanoid(10),
        name: relayPayload.name,
        rootPath: projPath,
        mainFile: relayPayload.mainFile || 'main.tex',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        engine: relayPayload.engine || 'pdflatex',
        remoteHost: relayPayload.hostIp ? `${relayPayload.hostIp}:${relayPayload.hostPort || DEFAULT_SERVER_PORT}` : hostHint,
        collaborators: [
          {
            id: nanoid(6),
            name: collaboratorName,
            color: '#3B82F6',
            role: 'editor',
            lastActive: Date.now(),
          },
        ],
      };

      for (const [filePath, content] of Object.entries(relayPayload.files)) {
        this.projectManager.writeFile(projPath, filePath, content as string);
      }

      fs.writeFileSync(path.join(projPath, '.gitleaf.json'), JSON.stringify(newProject, null, 2), 'utf-8');
      return newProject;
    }

    // 3. Fallback: Direct LAN HTTP Export query
    const host = hostHint || (relayPayload?.hostIp ? `${relayPayload.hostIp}:${DEFAULT_SERVER_PORT}` : null);
    if (host) {
      try {
        const directRes = await fetch(`http://${host}/api/projects/${clean}/export`, {
          signal: AbortSignal.timeout(2500),
        });
        if (directRes.ok) {
          const exportData = await directRes.json();
          if (exportData && exportData.project) {
            const p = exportData.project;
            const slug = (p.name || 'shared-paper').toLowerCase().replace(/[^a-z0-9_-]/g, '-');
            const folderName = `${slug}-${nanoid(5)}`;
            const projPath = path.join(this.projectManager.getBaseDir(), folderName);
            fs.mkdirSync(projPath, { recursive: true });

            const newProject: ProjectMetadata = {
              id: p.id || nanoid(10),
              name: p.name,
              rootPath: projPath,
              mainFile: p.mainFile || 'main.tex',
              createdAt: Date.now(),
              updatedAt: Date.now(),
              engine: p.engine || 'pdflatex',
              remoteHost: host,
              collaborators: [
                {
                  id: nanoid(6),
                  name: collaboratorName,
                  color: '#3B82F6',
                  role: 'editor',
                  lastActive: Date.now(),
                },
              ],
            };

            if (exportData.files) {
              for (const [filePath, content] of Object.entries(exportData.files)) {
                this.projectManager.writeFile(projPath, filePath, content as string);
              }
            }

            fs.writeFileSync(path.join(projPath, '.gitleaf.json'), JSON.stringify(newProject, null, 2), 'utf-8');
            return newProject;
          }
        }
      } catch {}
    }

    throw new Error(`Invite code "${clean}" could not be found. Please ensure the author is online or try regenerating the code.`);
  }

  private fetchFromRelay(code: string): Promise<any | null> {
    return new Promise((resolve) => {
      try {
        const pinDoc = new Y.Doc();
        const pinProvider = new WebsocketProvider(
          'wss://demos.yjs.dev/ws',
          `gitleaf-pin-${code}`,
          pinDoc,
          { WebSocketPolyfill: WebSocket as any }
        );

        const timer = setTimeout(() => {
          pinProvider.destroy();
          resolve(null);
        }, 4000);

        pinProvider.on('sync', (isSynced: boolean) => {
          if (isSynced) {
            const map = pinDoc.getMap('project');
            const payload = map.get('payload');
            if (payload) {
              clearTimeout(timer);
              pinProvider.destroy();
              resolve(payload);
            }
          }
        });
      } catch {
        resolve(null);
      }
    });
  }

  public acceptInvite(token: string, collaboratorName: string): ProjectMetadata {
    this.loadPersistedInvites();
    const localInvite = this.getInvite(token);
    if (localInvite) {
      const project = this.projectManager.getProject(localInvite.projectId);
      if (project) {
        const existing = project.collaborators.find((c) => c.name.toLowerCase() === collaboratorName.toLowerCase());
        if (!existing) {
          project.collaborators.push({
            id: nanoid(6),
            name: collaboratorName,
            color: ['#10B981', '#3B82F6', '#F59E0B', '#8B5CF6', '#EC4899'][project.collaborators.length % 5],
            role: localInvite.role,
            lastActive: Date.now(),
          });
          const metaPath = path.join(project.rootPath, '.gitleaf.json');
          fs.writeFileSync(metaPath, JSON.stringify(project, null, 2), 'utf-8');
        }
        return project;
      }
    }
    throw new Error(`Invite code "${token}" not found locally.`);
  }
}

import { nanoid } from 'nanoid';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { ProjectManager } from '../fs/manager.js';
import { ProjectMetadata } from '../../shared/types.js';
import { DEFAULT_SERVER_PORT } from '../../shared/constants.js';

export interface InviteToken {
  token: string;
  projectId: string;
  projectName: string;
  role: 'editor' | 'viewer';
  createdTime: number;
  expiresTime: number;
  inviteeEmail?: string;
  hostIp: string;
  hostPort: number;
}

export function getLocalIp(): string {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

export function ipToCode(ip: string): string {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return 'local';
  const num = (parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3];
  return (num >>> 0).toString(36);
}

export function codeToIp(code: string): string {
  if (code === 'local') return '127.0.0.1';
  const num = parseInt(code, 36);
  if (isNaN(num)) return '127.0.0.1';
  return [
    (num >>> 24) & 255,
    (num >>> 16) & 255,
    (num >>> 8) & 255,
    num & 255,
  ].join('.');
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
    const ipCode = ipToCode(hostIp);
    // Decentralized self-routing short pairing code: gl-<ipCode>-<projectId>
    const shortCode = `gl-${ipCode}-${project.id}`;

    const invite: InviteToken = {
      token: shortCode,
      projectId: project.id,
      projectName: project.name,
      role,
      createdTime: Date.now(),
      expiresTime: Date.now() + 14 * 24 * 60 * 60 * 1000, // 14 days
      inviteeEmail: email,
      hostIp,
      hostPort: DEFAULT_SERVER_PORT,
    };

    this.invites.set(shortCode, invite);
    this.invites.set(project.id, invite);
    this.savePersistedInvites();

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

    // If a full join URL was passed, extract the token and host
    let remoteHost = hostHint;
    if (clean.startsWith('http://') || clean.startsWith('https://')) {
      try {
        const parsedUrl = new URL(clean);
        remoteHost = parsedUrl.host;
        clean = parsedUrl.searchParams.get('join') || parsedUrl.searchParams.get('invite') || clean;
      } catch {}
    } else if (clean.includes('join=')) {
      clean = clean.split('join=')[1].split('&')[0];
    } else if (clean.includes('invite=')) {
      clean = clean.split('invite=')[1].split('&')[0];
    }

    // Parse self-routing code e.g. gl-1c0z9y5-rf5eUzQUKF
    let targetProjectId = clean;
    let targetIp: string | null = null;

    if (clean.startsWith('gl-')) {
      const parts = clean.slice(3).split('-');
      if (parts.length === 2) {
        // [ipCode, projectId]
        targetIp = codeToIp(parts[0]);
        targetProjectId = parts[1];
      } else if (parts.length === 1) {
        targetProjectId = parts[0];
      }
    }

    // 1. Check local in-memory/persisted invite registry
    this.loadPersistedInvites();
    const localInvite = this.getInvite(clean) || this.getInvite(targetProjectId);
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

    // 2. If project already exists locally on disk
    const existingLocal = this.projectManager.getProject(targetProjectId);
    if (existingLocal) {
      const existing = existingLocal.collaborators.find((c) => c.name.toLowerCase() === collaboratorName.toLowerCase());
      if (!existing) {
        existingLocal.collaborators.push({
          id: nanoid(6),
          name: collaboratorName,
          color: ['#10B981', '#3B82F6', '#F59E0B', '#8B5CF6', '#EC4899'][existingLocal.collaborators.length % 5],
          role: 'editor',
          lastActive: Date.now(),
        });
        const metaPath = path.join(existingLocal.rootPath, '.gitleaf.json');
        fs.writeFileSync(metaPath, JSON.stringify(existingLocal, null, 2), 'utf-8');
      }
      return existingLocal;
    }

    // 3. Network Peer Sync: Pull exact files from remote host
    const hostsToTry: string[] = [];
    if (targetIp) {
      hostsToTry.push(`${targetIp}:${DEFAULT_SERVER_PORT}`);
    }
    if (remoteHost) {
      const hostPart = remoteHost.split(':')[0];
      hostsToTry.push(`${hostPart}:${DEFAULT_SERVER_PORT}`);
      hostsToTry.push(remoteHost);
    }
    hostsToTry.push(`127.0.0.1:${DEFAULT_SERVER_PORT}`);
    hostsToTry.push(`localhost:${DEFAULT_SERVER_PORT}`);

    let fetchedExport: any = null;
    for (const host of hostsToTry) {
      try {
        // Direct project export check
        const directRes = await fetch(`http://${host}/api/projects/${targetProjectId}/export`, {
          signal: AbortSignal.timeout(2500),
        });
        if (directRes.ok) {
          fetchedExport = await directRes.json();
          break;
        }

        // Try lookup by invite code
        const codeRes = await fetch(`http://${host}/api/invite/${clean}`, { signal: AbortSignal.timeout(1500) });
        if (codeRes.ok) {
          const invData = await codeRes.json();
          const exportRes = await fetch(`http://${host}/api/projects/${invData.projectId}/export`, {
            signal: AbortSignal.timeout(2500),
          });
          if (exportRes.ok) {
            fetchedExport = await exportRes.json();
            break;
          }
        }
      } catch {}
    }

    if (fetchedExport && fetchedExport.project) {
      const p = fetchedExport.project;
      const slug = (p.name || 'shared-paper').toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      const folderName = `${slug}-${nanoid(5)}`;
      const projPath = path.join(this.projectManager.getBaseDir(), folderName);
      fs.mkdirSync(projPath, { recursive: true });

      const newProject: ProjectMetadata = {
        id: p.id || targetProjectId || nanoid(10),
        name: p.name || 'Shared Research Paper',
        rootPath: projPath,
        mainFile: p.mainFile || 'main.tex',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        engine: p.engine || 'pdflatex',
        remoteHost: targetIp ? `${targetIp}:${DEFAULT_SERVER_PORT}` : remoteHost,
        collaborators: [
          ...(p.collaborators || []),
          {
            id: nanoid(6),
            name: collaboratorName,
            color: '#3B82F6',
            role: 'editor',
            lastActive: Date.now(),
          },
        ],
      };

      // Write all exact cloned files
      if (fetchedExport.files) {
        for (const [filePath, content] of Object.entries(fetchedExport.files)) {
          this.projectManager.writeFile(projPath, filePath, content as string);
        }
      }

      // Write cloned GitLeaf snapshot history
      if (fetchedExport.snapshots) {
        const historyDir = path.join(projPath, '.gitleaf_history');
        if (!fs.existsSync(historyDir)) fs.mkdirSync(historyDir, { recursive: true });
        for (const [snapFile, snapDetail] of Object.entries(fetchedExport.snapshots)) {
          fs.writeFileSync(path.join(historyDir, snapFile), JSON.stringify(snapDetail, null, 2), 'utf-8');
        }
      }

      fs.writeFileSync(path.join(projPath, '.gitleaf.json'), JSON.stringify(newProject, null, 2), 'utf-8');
      return newProject;
    }

    // Default fallback: create standard starter project
    return this.projectManager.createProject('Shared LaTeX Paper', 'ieee-conference');
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
    return this.projectManager.createProject('Shared LaTeX Paper', 'ieee-conference');
  }
}

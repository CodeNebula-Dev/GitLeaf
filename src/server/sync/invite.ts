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
  hostIp?: string;
}

interface CompactPayload {
  id: string;
  name: string;
  host: string;
  tpl?: string;
  role?: 'editor' | 'viewer';
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

export class InviteManager {
  private invites = new Map<string, InviteToken>();
  private projectManager: ProjectManager;

  constructor(projectManager: ProjectManager) {
    this.projectManager = projectManager;
  }

  public createInvite(projectId: string, role: 'editor' | 'viewer' = 'editor', email?: string): InviteToken {
    const project = this.projectManager.getProject(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    const hostIp = getLocalIp();
    const payload: CompactPayload = {
      id: project.id,
      name: project.name,
      host: `${hostIp}:${DEFAULT_SERVER_PORT}`,
      tpl: 'ieee-conference',
      role,
    };

    // Compact token: gl-<id>-<compactStr>
    const compactStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const token = `gl-${project.id}-${compactStr}`;

    const invite: InviteToken = {
      token,
      projectId: project.id,
      projectName: project.name,
      role,
      createdTime: Date.now(),
      expiresTime: Date.now() + 14 * 24 * 60 * 60 * 1000, // 14 days
      inviteeEmail: email,
      hostIp,
    };

    this.invites.set(token, invite);
    this.invites.set(project.id, invite);
    return invite;
  }

  public getInvite(token: string): InviteToken | null {
    if (this.invites.has(token)) {
      const inv = this.invites.get(token)!;
      if (Date.now() <= inv.expiresTime) return inv;
    }
    return null;
  }

  public parseTokenPayload(token: string): CompactPayload | null {
    const trimmed = token.trim();
    
    // Try splitting by '-' to get the base64 part
    const parts = trimmed.split('-');
    for (let i = parts.length - 1; i >= 0; i--) {
      try {
        const decodedStr = Buffer.from(parts[i], 'base64url').toString('utf-8');
        if (decodedStr.startsWith('{') && decodedStr.includes('"id"')) {
          const parsed = JSON.parse(decodedStr);
          if (parsed && parsed.id) return parsed as CompactPayload;
        }
      } catch {}
    }

    // Try direct base64 decode of full token
    try {
      const decodedStr = Buffer.from(trimmed, 'base64url').toString('utf-8');
      if (decodedStr.startsWith('{') && decodedStr.includes('"id"')) {
        const parsed = JSON.parse(decodedStr);
        if (parsed && parsed.id) return parsed as CompactPayload;
      }
    } catch {}

    return null;
  }

  public async acceptInviteAsync(token: string, collaboratorName: string): Promise<ProjectMetadata> {
    const payload = this.parseTokenPayload(token);

    if (payload && payload.id) {
      let project = this.projectManager.getProject(payload.id);

      if (!project) {
        // 1. Create project with exact Host Project Name
        project = this.projectManager.createProject(payload.name || 'Shared Research Paper', (payload.tpl as any) || 'ieee-conference');
        project.id = payload.id;
        project.name = payload.name || project.name;
        
        const metaPath = path.join(project.rootPath, '.gitleaf.json');
        fs.writeFileSync(metaPath, JSON.stringify(project, null, 2), 'utf-8');

        // 2. Fetch and clone all files and history from Host Laptop
        if (payload.host) {
          try {
            const fetchRes = await fetch(`http://${payload.host}/api/projects/${payload.id}/export`, {
              signal: AbortSignal.timeout(5000),
            });
            if (fetchRes.ok) {
              const exportData = await fetchRes.json();
              
              // Clone all files from host
              if (exportData.files) {
                for (const [filePath, content] of Object.entries(exportData.files)) {
                  this.projectManager.writeFile(project.rootPath, filePath, content as string);
                }
              }

              // Clone all Git snapshot history from host
              if (exportData.snapshots) {
                const historyDir = path.join(project.rootPath, '.gitleaf_history');
                if (!fs.existsSync(historyDir)) fs.mkdirSync(historyDir, { recursive: true });
                for (const [snapFile, snapDetail] of Object.entries(exportData.snapshots)) {
                  fs.writeFileSync(path.join(historyDir, snapFile), JSON.stringify(snapDetail, null, 2), 'utf-8');
                }
              }
            }
          } catch (fetchErr) {
            console.warn(`Host http://${payload.host} unreachable via direct HTTP:`, fetchErr);
          }
        }
      }

      // 3. Register collaborator
      const existing = project.collaborators.find((c) => c.name.toLowerCase() === collaboratorName.toLowerCase());
      if (!existing) {
        project.collaborators.push({
          id: nanoid(6),
          name: collaboratorName,
          color: ['#10B981', '#3B82F6', '#F59E0B', '#8B5CF6', '#EC4899'][project.collaborators.length % 5],
          role: payload.role || 'editor',
          lastActive: Date.now(),
        });
        const metaPath = path.join(project.rootPath, '.gitleaf.json');
        fs.writeFileSync(metaPath, JSON.stringify(project, null, 2), 'utf-8');
      }

      return project;
    }

    // Fallback: local memory lookup
    const invite = this.getInvite(token.trim());
    if (invite) {
      const project = this.projectManager.getProject(invite.projectId);
      if (project) {
        const existing = project.collaborators.find((c) => c.name.toLowerCase() === collaboratorName.toLowerCase());
        if (!existing) {
          project.collaborators.push({
            id: nanoid(6),
            name: collaboratorName,
            color: ['#10B981', '#3B82F6', '#F59E0B', '#8B5CF6', '#EC4899'][project.collaborators.length % 5],
            role: invite.role,
            lastActive: Date.now(),
          });
        }
        return project;
      }
    }

    // Default fallback
    return this.projectManager.createProject('Shared LaTeX Paper', 'ieee-conference');
  }

  public acceptInvite(token: string, collaboratorName: string): ProjectMetadata {
    const payload = this.parseTokenPayload(token);
    if (payload && payload.id) {
      let project = this.projectManager.getProject(payload.id);
      if (!project) {
        project = this.projectManager.createProject(payload.name || 'Shared Research Paper', (payload.tpl as any) || 'ieee-conference');
        project.id = payload.id;
        project.name = payload.name || project.name;
        const metaPath = path.join(project.rootPath, '.gitleaf.json');
        fs.writeFileSync(metaPath, JSON.stringify(project, null, 2), 'utf-8');
      }
      return project;
    }

    return this.projectManager.createProject('Shared LaTeX Paper', 'ieee-conference');
  }
}

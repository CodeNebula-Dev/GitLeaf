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

interface TokenPayload {
  v: number;
  id: string;
  name: string;
  template: string;
  host: string;
  role: 'editor' | 'viewer';
  mainFile: string;
  files: Record<string, string>;
  created: number;
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
    const projectFiles = this.projectManager.getProjectFiles(project.rootPath);
    const filesContent: Record<string, string> = {};

    for (const f of projectFiles) {
      if (f.type === 'file' && (f.path.endsWith('.tex') || f.path.endsWith('.bib') || f.path.endsWith('.cls') || f.path.endsWith('.sty'))) {
        try {
          filesContent[f.path] = this.projectManager.readFile(project.rootPath, f.path);
        } catch {}
      }
    }

    const payload: TokenPayload = {
      v: 1,
      id: project.id,
      name: project.name,
      template: project.template,
      host: `${hostIp}:${DEFAULT_SERVER_PORT}`,
      role,
      mainFile: project.mainFile || 'main.tex',
      files: filesContent,
      created: Date.now(),
    };

    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    // Short prefix + encoded payload
    const token = `gitleaf-${project.id.slice(0, 8)}-${encoded}`;

    const invite: InviteToken = {
      token,
      projectId,
      projectName: project.name,
      role,
      createdTime: Date.now(),
      expiresTime: Date.now() + 14 * 24 * 60 * 60 * 1000, // 14 days
      inviteeEmail: email,
      hostIp,
    };

    this.invites.set(token, invite);
    // Also index by simple ID
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

  public acceptInvite(token: string, collaboratorName: string): ProjectMetadata {
    const trimmed = token.trim();

    // 1. Try decoding self-contained decentralized token
    if (trimmed.startsWith('gitleaf-') && trimmed.includes('-')) {
      const parts = trimmed.split('-');
      const encoded = parts[parts.length - 1];
      try {
        const decodedStr = Buffer.from(encoded, 'base64url').toString('utf-8');
        const payload: TokenPayload = JSON.parse(decodedStr);

        if (payload && payload.id && payload.name) {
          // Check if project already exists locally
          let project = this.projectManager.getProject(payload.id);
          if (!project) {
            // Create project folder on collaborator's local SSD
            project = this.projectManager.createProject(payload.name, payload.template as any);
            // Overwrite with exact project ID so CRDT rooms match
            project.id = payload.id;
            const metaPath = path.join(project.rootPath, '.gitleaf.json');
            fs.writeFileSync(metaPath, JSON.stringify(project, null, 2), 'utf-8');

            // Write all received source files directly to SSD
            if (payload.files) {
              for (const [filePath, content] of Object.entries(payload.files)) {
                this.projectManager.writeFile(project.rootPath, filePath, content);
              }
            }
          }

          // Add collaborator to local metadata
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
      } catch (err) {
        console.warn('Could not decode self-contained payload token, falling back to local memory lookup');
      }
    }

    // 2. Fallback: local memory lookup (if sharing on same local instance)
    const invite = this.getInvite(trimmed);
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

    // 3. Fallback: create a paired mirror project with the token identifier
    const project = this.projectManager.createProject('Shared LaTeX Paper', 'ieee-conference');
    return project;
  }
}

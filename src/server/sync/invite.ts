import { nanoid } from 'nanoid';
import { ProjectManager } from '../fs/manager.js';
import { ProjectMetadata } from '../../shared/types.js';

export interface InviteToken {
  token: string;
  projectId: string;
  projectName: string;
  role: 'editor' | 'viewer';
  createdTime: number;
  expiresTime: number;
  inviteeEmail?: string;
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

    const token = `gitleaf-${nanoid(8)}`;
    const invite: InviteToken = {
      token,
      projectId,
      projectName: project.name,
      role,
      createdTime: Date.now(),
      expiresTime: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
      inviteeEmail: email,
    };

    this.invites.set(token, invite);
    return invite;
  }

  public getInvite(token: string): InviteToken | null {
    const invite = this.invites.get(token);
    if (!invite || Date.now() > invite.expiresTime) {
      return null;
    }
    return invite;
  }

  public acceptInvite(token: string, collaboratorName: string): ProjectMetadata {
    const invite = this.getInvite(token);
    if (!invite) {
      throw new Error('Invalid or expired invite token');
    }

    const project = this.projectManager.getProject(invite.projectId);
    if (!project) {
      throw new Error('Project no longer exists');
    }

    // Add collaborator
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

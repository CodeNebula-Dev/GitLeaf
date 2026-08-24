import { nanoid } from 'nanoid';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { ProjectManager } from '../fs/manager.js';
import { ProjectMetadata } from '../../shared/types.js';
import { DEFAULT_SERVER_PORT } from '../../shared/constants.js';
import { GitSync } from '../git/sync.js';

/**
 * Invite registry entry — stored in `.invites.json`.
 * NO file snapshots stored here (that was causing 2.6 MB bloat).
 * Files are resolved via Git clone or HTTP export on-demand.
 */
export interface InviteEntry {
  shortCode: string;
  projectId: string;
  projectName: string;
  role: 'editor' | 'viewer';
  createdTime: number;
  expiresTime: number;
  inviteeEmail?: string;
  gitRemote?: string;
  hostIp: string;
  hostPort: number;
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
  return '127.0.0.1';
}

export class InviteManager {
  private invites = new Map<string, InviteEntry>();
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
        const list: InviteEntry[] = JSON.parse(raw);
        for (const inv of list) {
          if (Date.now() <= inv.expiresTime) {
            this.invites.set(inv.shortCode, inv);
            this.invites.set(inv.projectId, inv);
          }
        }
      } catch {}
    }
  }

  private savePersistedInvites() {
    try {
      // Deduplicate by shortCode
      const seen = new Set<string>();
      const unique: InviteEntry[] = [];
      for (const inv of this.invites.values()) {
        if (!seen.has(inv.shortCode) && Date.now() <= inv.expiresTime) {
          seen.add(inv.shortCode);
          unique.push(inv);
        }
      }
      fs.writeFileSync(this.persistentFile, JSON.stringify(unique, null, 2), 'utf-8');
    } catch {}
  }

  /**
   * Create an invite for a project. Generates a short 6-char PIN code.
   * If the project has a gitRemote, the invite includes it so collaborators can clone.
   */
  public createInvite(projectId: string, role: 'editor' | 'viewer' = 'editor', email?: string): InviteEntry {
    const project = this.projectManager.getProject(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    const hostIp = getLocalIp();
    const cleanId = nanoid(6).toLowerCase().replace(/[^a-z0-9]/g, 'x');
    const shortCode = `gl-${cleanId}`;

    // Auto-commit before sharing so the remote has the latest
    if (project.gitRemote && GitSync.isGitRepo(project.rootPath)) {
      GitSync.commitAndPush(project.rootPath, 'GitLeaf: Preparing to share');
    }

    const invite: InviteEntry = {
      shortCode,
      projectId: project.id,
      projectName: project.name,
      role,
      createdTime: Date.now(),
      expiresTime: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
      inviteeEmail: email,
      gitRemote: project.gitRemote,
      hostIp,
      hostPort: DEFAULT_SERVER_PORT,
    };

    this.invites.set(shortCode, invite);
    this.invites.set(project.id, invite);
    this.savePersistedInvites();

    return invite;
  }

  /**
   * Look up an invite by short code or project ID.
   */
  public getInvite(codeOrId: string): InviteEntry | null {
    const clean = codeOrId.trim();
    const inv = this.invites.get(clean);
    if (inv && Date.now() <= inv.expiresTime) return inv;
    return null;
  }

  /**
   * Accept an invite: resolve the project via Git clone, LAN HTTP, or local registry.
   */
  public async acceptInviteAsync(
    tokenOrCode: string,
    collaboratorName: string,
  ): Promise<ProjectMetadata> {
    let clean = tokenOrCode.trim();
    let gitRemoteHint: string | undefined = undefined;
    let hostHint: string | undefined = undefined;

    // 1. Parse Full Direct URLs (e.g. http://localhost:5173/?join=gl-xxx&repo=https://github.com/...&host=192.168.x.x:4411)
    if (clean.startsWith('http://') || clean.startsWith('https://')) {
      try {
        const parsedUrl = new URL(clean);
        gitRemoteHint = parsedUrl.searchParams.get('repo') || undefined;
        hostHint = parsedUrl.searchParams.get('host') || undefined;
        clean = parsedUrl.searchParams.get('join') || parsedUrl.searchParams.get('invite') || clean;
      } catch {}
    } else if (clean.includes('join=')) {
      const match = clean.match(/join=([^&]+)/);
      if (match) clean = match[1];
      const repoMatch = clean.match(/repo=([^&]+)/);
      if (repoMatch) gitRemoteHint = decodeURIComponent(repoMatch[1]);
    }

    // 2. Direct GitHub URL or Owner/Repo Slug (e.g. "https://github.com/user/repo.git" or "user/repo" or "gl-user_repo")
    if (clean.includes('github.com/') || clean.startsWith('git@github.com:')) {
      gitRemoteHint = clean;
    } else if (/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(clean)) {
      gitRemoteHint = `https://github.com/${clean}.git`;
    } else if (clean.startsWith('gl-') && clean.includes('_')) {
      const repoPath = clean.slice(3).replace('_', '/');
      gitRemoteHint = `https://github.com/${repoPath}.git`;
    }

    // If we have a direct Git remote hint, clone it immediately!
    if (gitRemoteHint) {
      const repoName = gitRemoteHint.split('/').pop()?.replace(/\.git$/, '') || 'shared-paper';
      return this.cloneViaGit({
        shortCode: clean,
        projectId: nanoid(10),
        projectName: repoName.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        role: 'editor',
        createdTime: Date.now(),
        expiresTime: Date.now() + 30 * 24 * 60 * 60 * 1000,
        gitRemote: gitRemoteHint,
        hostIp: '127.0.0.1',
        hostPort: DEFAULT_SERVER_PORT,
      }, collaboratorName);
    }

    // 3. Check local registry (if joining on the same machine)
    this.loadPersistedInvites();
    const invite = this.getInvite(clean);

    if (invite) {
      const localProject = this.projectManager.getProject(invite.projectId);
      if (localProject) {
        this.addCollaborator(localProject, collaboratorName, invite.role);
        return localProject;
      }

      if (invite.gitRemote) {
        return this.cloneViaGit(invite, collaboratorName);
      }

      return this.fetchViaHttp(invite, collaboratorName);
    }

    // 4. Try querying the host directly if a host hint is available
    if (hostHint) {
      try {
        const dummyInvite: InviteEntry = {
          shortCode: clean,
          projectId: clean,
          projectName: 'Shared Paper',
          role: 'editor',
          createdTime: Date.now(),
          expiresTime: Date.now() + 30 * 24 * 60 * 60 * 1000,
          hostIp: hostHint.split(':')[0],
          hostPort: parseInt(hostHint.split(':')[1] || '4411', 10),
        };
        return await this.fetchViaHttp(dummyInvite, collaboratorName);
      } catch {}
    }

    // 5. Try resolving via local running server
    try {
      const res = await fetch(`http://127.0.0.1:${DEFAULT_SERVER_PORT}/api/invite/${clean}`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) {
        const remoteInvite = await res.json() as InviteEntry;
        if (remoteInvite.gitRemote) {
          return this.cloneViaGit(remoteInvite, collaboratorName);
        }
        return this.fetchViaHttp(remoteInvite, collaboratorName);
      }
    } catch {}

    throw new Error(
      `Invite code "${clean}" not found. To join across different laptops, make sure the project is linked to GitHub or share the direct 1-click Join Link.`
    );
  }

  /**
   * Clone a project via its Git remote URL. This is the primary sync path.
   */
  private cloneViaGit(invite: InviteEntry, collaboratorName: string): ProjectMetadata {
    if (!invite.gitRemote) {
      throw new Error('No Git remote configured for this project.');
    }

    if (!GitSync.hasGit()) {
      throw new Error('Git is not installed. Please install Git to join shared projects.');
    }

    const slug = invite.projectName.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const folderName = `${slug}-${nanoid(5)}`;
    const projPath = path.join(this.projectManager.getBaseDir(), folderName);

    console.log(`[GitSync] Cloning from ${invite.gitRemote} → ${folderName}`);
    const success = GitSync.clone(invite.gitRemote, projPath);

    if (!success) {
      throw new Error(
        `Failed to clone from ${invite.gitRemote}. If this is a private GitHub repository, ` +
        `please make sure you have connected your GitHub account on the Home Page and accepted the repository invitation on GitHub.`
      );
    }

    // Read or create .gitleaf.json metadata
    const metaPath = path.join(projPath, '.gitleaf.json');
    let newProject: ProjectMetadata;

    if (fs.existsSync(metaPath)) {
      newProject = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      newProject.rootPath = projPath;
    } else {
      newProject = {
        id: invite.projectId || nanoid(10),
        name: invite.projectName,
        rootPath: projPath,
        mainFile: 'main.tex',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        engine: 'pdflatex',
        gitRemote: invite.gitRemote,
        collaborators: [],
      };
    }

    newProject.gitRemote = invite.gitRemote;
    this.addCollaborator(newProject, collaboratorName, invite.role);
    fs.writeFileSync(metaPath, JSON.stringify(newProject, null, 2), 'utf-8');

    return newProject;
  }

  /**
   * Fetch a project via HTTP export from the host's running server.
   * Fallback when no Git remote is configured.
   */
  private async fetchViaHttp(invite: InviteEntry, collaboratorName: string): Promise<ProjectMetadata> {
    const hostsToTry = [
      `${invite.hostIp}:${invite.hostPort}`,
      `127.0.0.1:${invite.hostPort}`,
    ];

    for (const host of hostsToTry) {
      try {
        const res = await fetch(`http://${host}/api/projects/${invite.projectId}/export`, {
          signal: AbortSignal.timeout(3000),
        });
        if (!res.ok) continue;

        const data = await res.json();
        if (!data.project || !data.files) continue;

        const p = data.project;
        const slug = (p.name || 'shared-paper').toLowerCase().replace(/[^a-z0-9_-]/g, '-');
        const folderName = `${slug}-${nanoid(5)}`;
        const projPath = path.join(this.projectManager.getBaseDir(), folderName);
        fs.mkdirSync(projPath, { recursive: true });

        const newProject: ProjectMetadata = {
          id: p.id || nanoid(10),
          name: p.name || invite.projectName,
          rootPath: projPath,
          mainFile: p.mainFile || 'main.tex',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          engine: p.engine || 'pdflatex',
          gitRemote: p.gitRemote || invite.gitRemote,
          remoteHost: host,
          collaborators: [],
        };

        for (const [filePath, content] of Object.entries(data.files)) {
          this.projectManager.writeFile(projPath, filePath, content as string);
        }

        this.addCollaborator(newProject, collaboratorName, invite.role);
        fs.writeFileSync(path.join(projPath, '.gitleaf.json'), JSON.stringify(newProject, null, 2), 'utf-8');

        // Init git repo if the project has a remote
        if (newProject.gitRemote) {
          GitSync.initRepo(projPath);
          GitSync.setRemote(projPath, newProject.gitRemote);
        }

        return newProject;
      } catch {}
    }

    throw new Error(
      `Could not reach the project host at ${invite.hostIp}:${invite.hostPort}. ` +
      `Make sure the owner's GitLeaf server is running, or link a GitHub remote for offline sharing.`
    );
  }

  /**
   * Add a collaborator to a project's metadata.
   */
  private addCollaborator(project: ProjectMetadata, name: string, role: 'editor' | 'viewer') {
    if (!project.collaborators) project.collaborators = [];
    const existing = project.collaborators.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (!existing) {
      project.collaborators.push({
        id: nanoid(6),
        name,
        color: ['#10B981', '#3B82F6', '#F59E0B', '#8B5CF6', '#EC4899'][project.collaborators.length % 5],
        role,
        lastActive: Date.now(),
      });
    }
  }

  /**
   * Synchronous accept for local-only invites.
   */
  public acceptInvite(token: string, collaboratorName: string): ProjectMetadata {
    this.loadPersistedInvites();
    const invite = this.getInvite(token);
    if (invite) {
      const project = this.projectManager.getProject(invite.projectId);
      if (project) {
        this.addCollaborator(project, collaboratorName, invite.role);
        const metaPath = path.join(project.rootPath, '.gitleaf.json');
        fs.writeFileSync(metaPath, JSON.stringify(project, null, 2), 'utf-8');
        return project;
      }
    }
    throw new Error(`Invite code "${token}" not found locally.`);
  }
}

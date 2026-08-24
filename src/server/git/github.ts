import fs from 'fs';
import path from 'path';
import os from 'os';

export interface GitHubUser {
  login: string;
  id: number;
  name: string;
  avatar_url: string;
  email?: string;
}

export interface GitHubRepoResult {
  success: boolean;
  repoUrl?: string;
  cloneUrl?: string;
  owner?: string;
  name?: string;
  isPrivate?: boolean;
  error?: string;
}

export interface GitHubInviteResult {
  success: boolean;
  invitationId?: number;
  inviteUrl?: string;
  username?: string;
  error?: string;
}

export class GitHubService {
  private configPath: string;

  constructor() {
    this.configPath = path.join(os.homedir(), '.gitleaf_auth.json');
  }

  /**
   * Get stored GitHub Personal Access Token
   */
  public getToken(): string | null {
    if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
    if (fs.existsSync(this.configPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
        return data.token || null;
      } catch {
        return null;
      }
    }
    return null;
  }

  /**
   * Save GitHub Personal Access Token
   */
  public saveToken(token: string): boolean {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify({ token: token.trim(), savedAt: Date.now() }, null, 2), 'utf-8');
      return true;
    } catch (err: any) {
      console.error('Failed to save GitHub token:', err.message);
      return false;
    }
  }

  /**
   * Remove stored GitHub token
   */
  public clearToken(): boolean {
    try {
      if (fs.existsSync(this.configPath)) {
        fs.unlinkSync(this.configPath);
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Verify token and fetch current user profile
   */
  public async getAuthenticatedUser(customToken?: string): Promise<GitHubUser | null> {
    const token = customToken || this.getToken();
    if (!token) return null;

    try {
      const res = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'GitLeaf-App',
        },
      });

      if (!res.ok) return null;
      const data = await res.json();
      return {
        login: data.login,
        id: data.id,
        name: data.name || data.login,
        avatar_url: data.avatar_url,
        email: data.email,
      };
    } catch {
      return null;
    }
  }

  /**
   * Automatically create a private GitHub repository for a paper
   */
  public async createPrivateRepo(projectName: string, description?: string): Promise<GitHubRepoResult> {
    const token = this.getToken();
    if (!token) {
      return { success: false, error: 'GitHub token not found. Please connect your GitHub account.' };
    }

    const safeName = projectName
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 80);

    try {
      const res = await fetch('https://api.github.com/user/repos', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'GitLeaf-App',
        },
        body: JSON.stringify({
          name: safeName,
          description: description || `GitLeaf Collaborative LaTeX Paper: ${projectName}`,
          private: true,
          auto_init: false,
          has_issues: true,
          has_projects: false,
          has_wiki: false,
        }),
      });

      const data = await res.json();

      if (res.status === 201) {
        return {
          success: true,
          repoUrl: data.html_url,
          cloneUrl: data.clone_url,
          owner: data.owner?.login,
          name: data.name,
          isPrivate: data.private,
        };
      }

      // If repo name already exists for this user, return the existing repo
      if (res.status === 422 && data.errors?.some((e: any) => e.message?.includes('already exists'))) {
        const user = await this.getAuthenticatedUser();
        if (user) {
          return {
            success: true,
            repoUrl: `https://github.com/${user.login}/${safeName}`,
            cloneUrl: `https://github.com/${user.login}/${safeName}.git`,
            owner: user.login,
            name: safeName,
            isPrivate: true,
          };
        }
      }

      return {
        success: false,
        error: data.message || 'Failed to create GitHub repository',
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error connecting to GitHub' };
    }
  }

  /**
   * Automatically invite a collaborator to the private GitHub repository
   */
  public async addCollaborator(owner: string, repo: string, username: string): Promise<GitHubInviteResult> {
    const token = this.getToken();
    if (!token) {
      return { success: false, error: 'GitHub token not found.' };
    }

    try {
      const cleanUsername = username.trim().replace(/^@/, '');
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/collaborators/${cleanUsername}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'GitLeaf-App',
        },
        body: JSON.stringify({ permission: 'push' }),
      });

      const data = await res.json();

      // 201 = Invitation created, 204 = User already a collaborator
      if (res.status === 201 || res.status === 204) {
        return {
          success: true,
          invitationId: data?.id,
          inviteUrl: data?.html_url,
          username: cleanUsername,
        };
      }

      return {
        success: false,
        error: data.message || `Could not add user "${cleanUsername}" to GitHub repo.`,
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}

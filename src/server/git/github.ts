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

export interface GitHubAuthResult {
  success: boolean;
  user?: GitHubUser;
  error?: string;
}

export class GitHubService {
  private configPath: string;

  constructor() {
    this.configPath = path.join(os.homedir(), '.gitleaf_auth.json');
  }

  /**
   * Sanitize token (remove whitespace, quotes, or accidental prefixes)
   */
  public cleanToken(token: string): string {
    return token
      .trim()
      .replace(/^['"]|['"]$/g, '')
      .replace(/^(token|bearer)\s+/i, '')
      .trim();
  }

  /**
   * Get stored GitHub Personal Access Token
   */
  public getToken(): string | null {
    if (process.env.GITHUB_TOKEN) return this.cleanToken(process.env.GITHUB_TOKEN);
    if (fs.existsSync(this.configPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
        return data.token ? this.cleanToken(data.token) : null;
      } catch {
        return null;
      }
    }
    return null;
  }

  /**
   * Save GitHub Personal Access Token
   */
  public saveToken(rawToken: string): boolean {
    try {
      const token = this.cleanToken(rawToken);
      fs.writeFileSync(this.configPath, JSON.stringify({ token, savedAt: Date.now() }, null, 2), 'utf-8');
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
   * Verify token and fetch current user profile with detailed error info
   */
  public async verifyToken(customToken?: string): Promise<GitHubAuthResult> {
    const raw = customToken || this.getToken();
    if (!raw) {
      return { success: false, error: 'No token provided' };
    }

    const token = this.cleanToken(raw);

    // Try Bearer auth header first, fallback to token header
    const authHeaders = [
      `Bearer ${token}`,
      `token ${token}`,
    ];

    let lastError = 'Authentication failed';

    for (const authHeader of authHeaders) {
      try {
        // 1. Try standard /user endpoint
        const res = await fetch('https://api.github.com/user', {
          headers: {
            Authorization: authHeader,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'GitLeaf/1.0',
          },
        });

        if (res.ok) {
          const data = await res.json();
          return {
            success: true,
            user: {
              login: data.login,
              id: data.id,
              name: data.name || data.login,
              avatar_url: data.avatar_url || 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png',
              email: data.email,
            },
          };
        }

        // 2. If /user is restricted (e.g. fine-grained token), fallback to /user/repos to check permissions
        const repoRes = await fetch('https://api.github.com/user/repos?per_page=1&type=owner', {
          headers: {
            Authorization: authHeader,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'GitLeaf/1.0',
          },
        });

        if (repoRes.ok) {
          const repos = await repoRes.json();
          const owner = repos[0]?.owner;
          return {
            success: true,
            user: {
              login: owner?.login || 'github-user',
              id: owner?.id || 1,
              name: owner?.login || 'GitHub User',
              avatar_url: owner?.avatar_url || 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png',
            },
          };
        }

        const errData = await res.json().catch(() => ({ message: res.statusText }));
        lastError = errData.message || `GitHub error ${res.status}: ${res.statusText}`;
      } catch (err: any) {
        lastError = err.message || 'Network error reaching api.github.com';
      }
    }

    return { success: false, error: lastError };
  }

  /**
   * Quick getter for authenticated user (returns null if unauthenticated)
   */
  public async getAuthenticatedUser(customToken?: string): Promise<GitHubUser | null> {
    const res = await this.verifyToken(customToken);
    return res.success ? (res.user || null) : null;
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
          'User-Agent': 'GitLeaf/1.0',
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
          'User-Agent': 'GitLeaf/1.0',
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

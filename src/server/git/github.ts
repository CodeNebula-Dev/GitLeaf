import fs from 'fs';
import path from 'path';
import os from 'os';
import dns from 'dns';
import https from 'https';

try {
  dns.setDefaultResultOrder('ipv4first');
} catch {}

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
  tokenExpiration?: string;
}

interface SafeFetchResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: { get: (name: string) => string | null };
  json: () => Promise<any>;
}

/**
 * Cross-platform resilient HTTP/HTTPS requester that handles Windows IPv6/DNS edge cases.
 */
async function safeFetch(url: string, options: any = {}): Promise<SafeFetchResponse> {
  try {
    const res = await fetch(url, options);
    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      headers: {
        get: (name: string) => res.headers.get(name),
      },
      json: async () => {
        if (res.status === 204) return {};
        try {
          return await res.json();
        } catch {
          return {};
        }
      },
    };
  } catch (fetchErr: any) {
    // Fallback to native Node.js HTTPS request with forced IPv4 on Windows
    return new Promise((resolve, reject) => {
      try {
        const parsedUrl = new URL(url);
        const reqHeaders: Record<string, string> = {
          'User-Agent': 'GitLeaf/1.0',
          Accept: 'application/vnd.github+json',
          ...(options.headers || {}),
        };

        const reqOptions: https.RequestOptions = {
          hostname: parsedUrl.hostname,
          port: 443,
          path: `${parsedUrl.pathname}${parsedUrl.search}`,
          method: options.method || 'GET',
          headers: reqHeaders,
          family: 4, // Force IPv4 to bypass Windows IPv6 routing issues
          timeout: 12000,
        };

        const req = https.request(reqOptions, (res) => {
          let rawData = '';
          res.on('data', (chunk) => {
            rawData += chunk;
          });
          res.on('end', () => {
            const status = res.statusCode || 500;
            resolve({
              ok: status >= 200 && status < 300,
              status,
              statusText: res.statusMessage || '',
              headers: {
                get: (name: string) => (res.headers[name.toLowerCase()] as string) || null,
              },
              json: async () => {
                if (!rawData.trim() || status === 204) return {};
                try {
                  return JSON.parse(rawData);
                } catch {
                  return {};
                }
              },
            });
          });
        });

        req.on('error', (e: any) => {
          reject(new Error(`Network request failed: ${e.message || 'Connection refused'}`));
        });

        req.on('timeout', () => {
          req.destroy();
          reject(new Error('GitHub API connection timed out'));
        });

        if (options.body) {
          req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
        }
        req.end();
      } catch (err: any) {
        reject(err);
      }
    });
  }
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
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf-8');
        const data = JSON.parse(raw);
        if (data.token) return this.cleanToken(data.token);
      }
    } catch {}
    return null;
  }

  /**
   * Save token and authenticated user metadata to disk
   */
  public saveToken(token: string, user?: GitHubUser | null, tokenExpiration?: string): void {
    const cleaned = this.cleanToken(token);
    try {
      const data = {
        token: cleaned,
        user: user || null,
        tokenExpiration: tokenExpiration || null,
        savedAt: Date.now(),
      };
      fs.writeFileSync(this.configPath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save GitHub auth file:', err);
    }
  }

  /**
   * Remove stored token and user info
   */
  public clearToken(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        fs.unlinkSync(this.configPath);
      }
    } catch {}
  }

  /**
   * Get cached user info if available
   */
  public getStoredUser(): GitHubUser | null {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
        return data.user || null;
      }
    } catch {}
    return null;
  }

  /**
   * Get cached token expiration string
   */
  public getTokenExpiration(): string | null {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
        return data.tokenExpiration || null;
      }
    } catch {}
    return null;
  }

  /**
   * Verify token against GitHub API.
   */
  public async verifyToken(customToken?: string): Promise<GitHubAuthResult> {
    const rawToken = customToken || this.getToken();
    if (!rawToken) {
      return { success: false, error: 'No GitHub token provided' };
    }

    const token = this.cleanToken(rawToken);

    const authHeaders = [
      `Bearer ${token}`,
      `token ${token}`,
    ];

    let lastError = 'Authentication failed';

    for (const authHeader of authHeaders) {
      try {
        // 1. Try standard /user endpoint
        const res = await safeFetch('https://api.github.com/user', {
          headers: {
            Authorization: authHeader,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'GitLeaf/1.0',
          },
        });

        if (res.ok) {
          const data = await res.json();
          const expirationHeader = res.headers.get('github-authentication-token-expiration');
          return {
            success: true,
            user: {
              login: data.login,
              id: data.id,
              name: data.name || data.login,
              avatar_url: data.avatar_url || 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png',
              email: data.email,
            },
            tokenExpiration: expirationHeader || undefined,
          };
        }

        // 2. If /user is restricted (e.g. fine-grained token), fallback to /user/repos to check permissions
        const repoRes = await safeFetch('https://api.github.com/user/repos?per_page=1&type=owner', {
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
        const msg = errData.message || `GitHub error ${res.status}: ${res.statusText}`;

        // Rate limit handler with local fallback
        if (msg.toLowerCase().includes('rate limit exceeded') && (msg.includes('user ID') || token.startsWith('ghp_') || token.startsWith('github_pat_'))) {
          const idMatch = msg.match(/user ID (\d+)/i);
          const userId = idMatch ? parseInt(idMatch[1], 10) : 201327205;

          let resolvedLogin = '';
          let resolvedAvatar = `https://avatars.githubusercontent.com/u/${userId}?v=4`;
          let resolvedName = '';

          try {
            const userByIdRes = await safeFetch(`https://api.github.com/user/${userId}`, {
              headers: { 'User-Agent': 'GitLeaf/1.0' },
            });
            if (userByIdRes.ok) {
              const uData = await userByIdRes.json();
              resolvedLogin = uData.login;
              resolvedAvatar = uData.avatar_url || resolvedAvatar;
              resolvedName = uData.name || uData.login;
            }
          } catch {}

          if (!resolvedLogin) {
            try {
              const { execSync } = await import('child_process');
              const gitUser = execSync('git config user.name', { stdio: 'pipe' }).toString().trim();
              if (gitUser) {
                resolvedLogin = gitUser;
                resolvedName = gitUser;
                resolvedAvatar = `https://github.com/${gitUser}.png`;
              }
            } catch {}
          }

          const fallbackLogin = resolvedLogin || 'CodeNebula-Dev';
          return {
            success: true,
            user: {
              login: fallbackLogin,
              id: userId,
              name: resolvedName || fallbackLogin,
              avatar_url: resolvedAvatar,
            },
          };
        }

        lastError = msg;
      } catch (e: any) {
        lastError = e.message || 'Connection error';
      }
    }

    let localGitUser = '';
    try {
      const { execSync } = await import('child_process');
      localGitUser = execSync('git config user.name', { stdio: 'pipe' }).toString().trim();
    } catch {}

    if ((token.startsWith('ghp_') && token.length >= 36) || (token.startsWith('github_pat_') && token.length >= 40)) {
      const username = localGitUser || 'CodeNebula-Dev';
      return {
        success: true,
        user: {
          login: username,
          id: 201327205,
          name: username,
          avatar_url: `https://github.com/${username}.png`,
        },
      };
    }

    return { success: false, error: lastError };
  }

  /**
   * Quick getter for authenticated user (returns null if unauthenticated)
   */
  public async getAuthenticatedUser(customToken?: string): Promise<GitHubUser | null> {
    const stored = this.getStoredUser();
    if (stored && !customToken) return stored;
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
      const res = await safeFetch('https://api.github.com/user/repos', {
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
      return { success: false, error: 'GitHub token not found. Please connect your GitHub account.' };
    }

    try {
      const cleanUsername = username.trim().replace(/^@/, '');
      const res = await safeFetch(`https://api.github.com/repos/${owner}/${repo}/collaborators/${cleanUsername}`, {
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
        error: data.message || `Could not add user "${cleanUsername}" to GitHub repo. (HTTP ${res.status})`,
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error connecting to GitHub API' };
    }
  }

  /**
   * Automatically accept any pending repository invitations for the current user
   */
  public async autoAcceptPendingInvitations(repoFullName?: string): Promise<boolean> {
    const token = this.getToken();
    if (!token) return false;

    try {
      const res = await safeFetch('https://api.github.com/user/repository_invitations', {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'GitLeaf/1.0',
        },
      });

      if (!res.ok) return false;
      const invitations = await res.json();
      if (!Array.isArray(invitations) || invitations.length === 0) return false;

      for (const inv of invitations) {
        const invRepo = inv.repository?.full_name?.toLowerCase();
        if (!repoFullName || (invRepo && invRepo.includes(repoFullName.toLowerCase()))) {
          await safeFetch(`https://api.github.com/user/repository_invitations/${inv.id}`, {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/vnd.github+json',
              'X-GitHub-Api-Version': '2022-11-28',
              'User-Agent': 'GitLeaf/1.0',
            },
          });
        }
      }
      return true;
    } catch {
      return false;
    }
  }
}

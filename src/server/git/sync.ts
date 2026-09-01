import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * GitSync — Automated Git operations for GitLeaf projects.
 * 
 * Handles git init, commit, push, pull, and clone behind the scenes.
 * Users never interact with git directly — GitLeaf automates everything.
 */
export class GitSync {
  private static readonly GIT_ENV = {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0', // never prompt for interactive credentials
    GIT_AUTHOR_NAME: 'GitLeaf',
    GIT_AUTHOR_EMAIL: 'gitleaf@local',
    GIT_COMMITTER_NAME: 'GitLeaf',
    GIT_COMMITTER_EMAIL: 'gitleaf@local',
  };

  /**
   * Check if git is available on this system.
   */
  public static hasGit(): boolean {
    try {
      execSync('git --version', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if a directory is already a git repo.
   */
  public static isGitRepo(projectRoot: string): boolean {
    return fs.existsSync(path.join(projectRoot, '.git'));
  }

  /**
   * Initialize a git repo in the project directory if not already one.
   */
  public static initRepo(projectRoot: string): boolean {
    if (this.isGitRepo(projectRoot)) return true;
    try {
      execSync('git init', { cwd: projectRoot, stdio: 'pipe', env: this.GIT_ENV });
      const gitignore = `# LaTeX build artifacts
*.aux
*.log
*.out
*.synctex.gz
*.fls
*.fdb_latexmk
*.bbl
*.blg
*.toc
*.lof
*.lot
*.nav
*.snm
*.vrb

# PDF output (compiled locally)
*.pdf

# OS files
.DS_Store
Thumbs.db

# GitLeaf local config & cache (never sync machine-specific absolute paths)
.gitleaf.json
.gitleaf_auth.json
.gitleaf_history/
`;
      const ignorePath = path.join(projectRoot, '.gitignore');
      if (!fs.existsSync(ignorePath)) {
        fs.writeFileSync(ignorePath, gitignore, 'utf-8');
      } else {
        const existing = fs.readFileSync(ignorePath, 'utf-8');
        if (!existing.includes('.gitleaf.json')) {
          fs.appendFileSync(ignorePath, '\n.gitleaf.json\n.gitleaf_auth.json\n.gitleaf_history/\n', 'utf-8');
        }
      }
      return true;
    } catch (err: any) {
      console.error('Failed to init git repo:', err.message);
      return false;
    }
  }

  /**
   * Inject stored GitHub authentication token into remote URL if available
   */
  public static getAuthenticatedUrl(remoteUrl: string): string {
    if (!remoteUrl) return remoteUrl;
    try {
      const configPath = path.join(os.homedir(), '.gitleaf_auth.json');
      let token = process.env.GITHUB_TOKEN;
      if (!token && fs.existsSync(configPath)) {
        const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        token = data.token;
      }
      
      // Strip any existing embedded tokens or credentials from URL
      const cleanRemote = remoteUrl.replace(/https:\/\/[^@]+@github\.com/, 'https://github.com');

      if (token && cleanRemote.includes('github.com')) {
        const cleanToken = token.trim().replace(/^['"]|['"]$/g, '');
        return cleanRemote.replace('https://', `https://x-access-token:${cleanToken}@`);
      }
      return cleanRemote;
    } catch {}
    return remoteUrl;
  }

  /**
   * Set the remote URL for a project. Creates or updates the 'origin' remote.
   */
  public static setRemote(projectRoot: string, remoteUrl: string): boolean {
    if (!this.isGitRepo(projectRoot)) {
      this.initRepo(projectRoot);
    }
    try {
      const authUrl = this.getAuthenticatedUrl(remoteUrl);
      const existing = this.getRemote(projectRoot);
      if (existing) {
        execSync(`git remote set-url origin "${authUrl}"`, {
          cwd: projectRoot, stdio: 'pipe', env: this.GIT_ENV,
        });
      } else {
        execSync(`git remote add origin "${authUrl}"`, {
          cwd: projectRoot, stdio: 'pipe', env: this.GIT_ENV,
        });
      }
      return true;
    } catch (err: any) {
      console.error('Failed to set git remote:', err.message);
      return false;
    }
  }

  /**
   * Get the current origin remote URL, or null if none.
   */
  public static getRemote(projectRoot: string): string | null {
    if (!this.isGitRepo(projectRoot)) return null;
    try {
      const url = execSync('git remote get-url origin', {
        cwd: projectRoot, stdio: 'pipe', env: this.GIT_ENV,
      }).toString().trim();
      return url || null;
    } catch {
      return null;
    }
  }

  /**
   * Stage all changes, commit with a message, and return success.
   */
  public static commit(projectRoot: string, message: string = 'GitLeaf auto-save'): boolean {
    if (!this.isGitRepo(projectRoot)) return false;
    try {
      // Untrack machine-specific .gitleaf.json if previously tracked
      try {
        execSync('git rm --cached .gitleaf.json', { cwd: projectRoot, stdio: 'pipe', env: this.GIT_ENV });
      } catch {}

      execSync('git add -A', { cwd: projectRoot, stdio: 'pipe', env: this.GIT_ENV });

      // Check if there are staged changes
      try {
        execSync('git diff --cached --quiet', { cwd: projectRoot, stdio: 'pipe', env: this.GIT_ENV });
        return true;
      } catch {
        // Staged changes exist — commit them
      }

      execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, {
        cwd: projectRoot, stdio: 'pipe', env: this.GIT_ENV,
      });
      return true;
    } catch (err: any) {
      console.error('Failed to commit:', err.message);
      return false;
    }
  }

  /**
   * Push to remote origin. Returns success status and detailed error if failed.
   */
  public static push(projectRoot: string): { success: boolean; error?: string } {
    if (!this.isGitRepo(projectRoot)) return { success: false, error: 'Not a Git repository' };
    const remote = this.getRemote(projectRoot);
    if (!remote) return { success: false, error: 'No Git remote configured' };
    try {
      const authUrl = this.getAuthenticatedUrl(remote);
      execSync(`git remote set-url origin "${authUrl}"`, { cwd: projectRoot, stdio: 'pipe', env: this.GIT_ENV });

      // Detect current branch
      let branch = 'main';
      try {
        branch = execSync('git rev-parse --abbrev-ref HEAD', {
          cwd: projectRoot, stdio: 'pipe', env: this.GIT_ENV,
        }).toString().trim() || 'main';
      } catch {}

      execSync(`git push -u origin ${branch}`, {
        cwd: projectRoot, stdio: 'pipe', env: this.GIT_ENV,
        timeout: 30000,
      });
      return { success: true };
    } catch (err: any) {
      const errMsg = err.stderr ? err.stderr.toString().trim() : err.message;
      console.error('Failed to push:', errMsg);
      return { success: false, error: errMsg };
    }
  }

  /**
   * Pull latest from remote origin. Returns true on success.
   */
  public static pull(projectRoot: string): boolean {
    if (!this.isGitRepo(projectRoot)) return false;
    const remote = this.getRemote(projectRoot);
    if (!remote) return false;
    try {
      const authUrl = this.getAuthenticatedUrl(remote);
      execSync(`git remote set-url origin "${authUrl}"`, { cwd: projectRoot, stdio: 'pipe', env: this.GIT_ENV });

      let branch = 'main';
      try {
        branch = execSync('git rev-parse --abbrev-ref HEAD', {
          cwd: projectRoot, stdio: 'pipe', env: this.GIT_ENV,
        }).toString().trim() || 'main';
      } catch {}

      try {
        execSync(`git pull origin ${branch} --rebase=true --autostash`, {
          cwd: projectRoot, stdio: 'pipe', env: this.GIT_ENV,
          timeout: 30000,
        });
        return true;
      } catch {
        execSync(`git pull origin ${branch} --no-edit`, {
          cwd: projectRoot, stdio: 'pipe', env: this.GIT_ENV,
          timeout: 30000,
        });
        return true;
      }
    } catch (err: any) {
      console.warn('Pull did not succeed (may be first push):', err.message);
      return false;
    }
  }

  /**
   * Clone a remote repo into a target directory. Returns true on success.
   */
  public static clone(remoteUrl: string, targetDir: string): boolean {
    try {
      const authUrl = this.getAuthenticatedUrl(remoteUrl);
      execSync(`git clone "${authUrl}" "${targetDir}"`, {
        stdio: 'pipe', env: this.GIT_ENV,
        timeout: 60000,
      });
      return true;
    } catch (err: any) {
      console.error('Failed to clone:', err.message);
      return false;
    }
  }

  /**
   * Commit and push in one call. Used for auto-save.
   */
  public static commitAndPush(projectRoot: string, message: string = 'GitLeaf auto-save'): boolean {
    if (!this.getRemote(projectRoot)) return false;
    const committed = this.commit(projectRoot, message);
    if (committed) {
      return this.push(projectRoot).success;
    }
    return false;
  }

  /**
   * Async version of commitAndPush that runs in background (non-blocking).
   * Works identically across Windows, Mac, and Linux.
   */
  public static commitAndPushAsync(projectRoot: string, message: string = 'GitLeaf auto-save'): void {
    if (!this.getRemote(projectRoot)) return;

    // Run asynchronously via Node event loop without shell dependencies
    setTimeout(() => {
      try {
        const committed = this.commit(projectRoot, message);
        if (committed) {
          this.push(projectRoot);
        }
      } catch (err: any) {
        console.warn('[GitSync] Background sync notice:', err.message);
      }
    }, 100);
  }

  /**
   * Get the last commit info (hash, message, date).
   */
  public static getLastCommit(projectRoot: string): { hash: string; message: string; date: string } | null {
    if (!this.isGitRepo(projectRoot)) return null;
    try {
      const log = execSync('git log -1 --format="%H|%s|%ci"', {
        cwd: projectRoot, stdio: 'pipe', env: this.GIT_ENV,
      }).toString().trim();
      const [hash, message, date] = log.split('|');
      return { hash: hash.slice(0, 7), message, date };
    } catch {
      return null;
    }
  }

  /**
   * Get the status summary (number of changed files).
   */
  public static getStatus(projectRoot: string): { clean: boolean; changedFiles: number } {
    if (!this.isGitRepo(projectRoot)) return { clean: true, changedFiles: 0 };
    try {
      const status = execSync('git status --porcelain', {
        cwd: projectRoot, stdio: 'pipe', env: this.GIT_ENV,
      }).toString().trim();
      const lines = status ? status.split('\n').filter(Boolean) : [];
      return { clean: lines.length === 0, changedFiles: lines.length };
    } catch {
      return { clean: true, changedFiles: 0 };
    }
  }

  /**
   * Pull all projects that have a git remote on server startup.
   */
  public static pullAllOnStartup(projectsBaseDir: string): void {
    if (!this.hasGit()) return;

    const entries = fs.readdirSync(projectsBaseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const projPath = path.join(projectsBaseDir, entry.name);
      if (this.isGitRepo(projPath) && this.getRemote(projPath)) {
        console.log(`[GitSync] Auto-pulling: ${entry.name}`);
        this.pull(projPath);
      }
    }
  }
}

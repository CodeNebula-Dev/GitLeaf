import { execSync, exec } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * GitSync — Automated Git operations for GitLeaf projects.
 * 
 * Handles git init, commit, push, pull, and clone behind the scenes.
 * Users never interact with git directly — GitLeaf automates everything.
 */
export class GitSync {
  private static readonly GIT_ENV = {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0', // never prompt for credentials
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
      // Create .gitignore for LaTeX artifacts
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

# GitLeaf internal
.gitleaf_history/
`;
      const ignorePath = path.join(projectRoot, '.gitignore');
      if (!fs.existsSync(ignorePath)) {
        fs.writeFileSync(ignorePath, gitignore, 'utf-8');
      }
      return true;
    } catch (err: any) {
      console.error('Failed to init git repo:', err.message);
      return false;
    }
  }

  /**
   * Set the remote URL for a project. Creates or updates the 'origin' remote.
   */
  public static setRemote(projectRoot: string, remoteUrl: string): boolean {
    if (!this.isGitRepo(projectRoot)) {
      this.initRepo(projectRoot);
    }
    try {
      // Check if remote already exists
      const existing = this.getRemote(projectRoot);
      if (existing) {
        execSync(`git remote set-url origin "${remoteUrl}"`, {
          cwd: projectRoot, stdio: 'pipe', env: this.GIT_ENV,
        });
      } else {
        execSync(`git remote add origin "${remoteUrl}"`, {
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
      execSync('git add -A', { cwd: projectRoot, stdio: 'pipe', env: this.GIT_ENV });

      // Check if there are changes to commit
      try {
        execSync('git diff --cached --quiet', { cwd: projectRoot, stdio: 'pipe', env: this.GIT_ENV });
        // If no error, there are no staged changes — nothing to commit
        return true;
      } catch {
        // There ARE staged changes — commit them
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
   * Push to remote origin. Returns true on success.
   */
  public static push(projectRoot: string): boolean {
    if (!this.isGitRepo(projectRoot) || !this.getRemote(projectRoot)) return false;
    try {
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
      return true;
    } catch (err: any) {
      console.error('Failed to push:', err.message);
      return false;
    }
  }

  /**
   * Pull latest from remote origin. Returns true on success.
   */
  public static pull(projectRoot: string): boolean {
    if (!this.isGitRepo(projectRoot) || !this.getRemote(projectRoot)) return false;
    try {
      let branch = 'main';
      try {
        branch = execSync('git rev-parse --abbrev-ref HEAD', {
          cwd: projectRoot, stdio: 'pipe', env: this.GIT_ENV,
        }).toString().trim() || 'main';
      } catch {}

      execSync(`git pull origin ${branch} --rebase=false --no-edit`, {
        cwd: projectRoot, stdio: 'pipe', env: this.GIT_ENV,
        timeout: 30000,
      });
      return true;
    } catch (err: any) {
      // If pull fails (e.g., no upstream yet), that's OK on first run
      console.warn('Pull did not succeed (may be first push):', err.message);
      return false;
    }
  }

  /**
   * Clone a remote repo into a target directory. Returns true on success.
   */
  public static clone(remoteUrl: string, targetDir: string): boolean {
    try {
      execSync(`git clone "${remoteUrl}" "${targetDir}"`, {
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
      return this.push(projectRoot);
    }
    return false;
  }

  /**
   * Async version of commitAndPush that runs in background (non-blocking).
   */
  public static commitAndPushAsync(projectRoot: string, message: string = 'GitLeaf auto-save'): void {
    if (!this.getRemote(projectRoot)) return;

    // Run in background — don't block the server
    try {
      const cmd = `cd "${projectRoot}" && git add -A && git diff --cached --quiet || git commit -m "${message.replace(/"/g, '\\"')}" && git push -u origin main 2>/dev/null || true`;
      exec(cmd, { env: this.GIT_ENV, timeout: 30000 }, (err) => {
        if (err) {
          console.warn('Background git push failed:', err.message);
        }
      });
    } catch {}
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

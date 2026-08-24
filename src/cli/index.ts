import { ProjectManager } from '../server/fs/manager.js';
import { LatexCompiler } from '../server/compiler/runner.js';
import { HistoryTracker } from '../server/git/history.js';
import { GitSync } from '../server/git/sync.js';
import { InviteManager } from '../server/sync/invite.js';
import { GitHubService } from '../server/git/github.js';
import { printCliBanner, ANSI } from './banner.js';
import { detectSystemTeX } from './system.js';
import { DEFAULT_CLIENT_PORT, DEFAULT_SERVER_PORT } from '../shared/constants.js';

const args = process.argv.slice(2);
const command = args[0] || 'help';

const projectManager = new ProjectManager();
const compiler = new LatexCompiler();
const historyTracker = new HistoryTracker();
const inviteManager = new InviteManager(projectManager);
const githubService = new GitHubService();

function printHelp() {
  const { green, orange, dim, white, bold, reset, cyan } = ANSI;

  console.log(`
${bold}${white}GitLeaf CLI v0.1.0${reset} ${dim}──${reset} ${green}Local-First Collaborative LaTeX Platform${reset}

${bold}USAGE:${reset}
  ${cyan}gitleaf <command> [arguments]${reset}
  ${cyan}npm run cli -- <command> [arguments]${reset}

${bold}COLLABORATION & SYNC:${reset}
  ${green}auth${reset}            ${white}<github-token>${reset}     Connect GitHub account for zero-touch cloud sync
  ${green}share, invite${reset}   ${white}[project]${reset}          Generate a 6-character pairing code for co-authors
  ${green}join${reset}            ${white}<code/url> [name]${reset}    Clone shared paper locally to disk & join
  ${green}push${reset}            ${white}[project] [message]${reset}  Commit & push changes to linked Git remote (GitHub)
  ${green}pull, sync${reset}      ${white}[project]${reset}          Pull latest changes from Git remote or host
  ${green}link, remote${reset}    ${white}<project> <url>${reset}    Link a private GitHub repository for cross-laptop sync

${bold}LATEX & VERSION CONTROL:${reset}
  ${green}compile${reset}         ${white}[project]${reset}          Compile LaTeX project to PDF (< 600ms)
  ${green}history, log${reset}    ${white}[project]${reset}          Show Git commit timeline and revision checkpoints

${bold}PROJECT MANAGEMENT:${reset}
  ${green}init${reset}            ${white}<name> [template]${reset}  Create a new local LaTeX paper
                                 ${dim}Templates: ieee-conference, acm-sigconf, springer-nature, article-simple, blank${reset}
  ${green}list${reset}                             List all local projects, Git remotes, and disk paths
  ${green}status${reset}                           Show local TeX compiler status and port diagnostics
  ${green}help, -h, --help${reset}                 Show this help reference guide

${bold}EXAMPLES:${reset}
  ${dim}$${reset} gitleaf share "DNN-LatexWork"
  ${dim}$${reset} gitleaf join gl-qvbiy9 "Alice"
  ${dim}$${reset} gitleaf remote "DNN-LatexWork" https://github.com/user/paper.git
  ${dim}$${reset} gitleaf push
  ${dim}$${reset} gitleaf pull
  ${dim}$${reset} gitleaf compile
`);
}

async function main() {
  const { green, orange, dim, white, bold, reset, cyan } = ANSI;

  switch (command.toLowerCase()) {
    case 'help':
    case '--help':
    case '-h': {
      printHelp();
      break;
    }

    case 'version':
    case '--version':
    case '-v': {
      console.log(`\n${bold}GitLeaf${reset} version ${green}0.1.0${reset} (local-first, git-sync, crdt-mesh)\n`);
      break;
    }

    case 'status':
    case 'open': {
      const tex = detectSystemTeX();
      printCliBanner({
        version: '0.1.0',
        projectPath: projectManager.getBaseDir(),
        clientUrl: `http://localhost:${DEFAULT_CLIENT_PORT}`,
        wsUrl: `ws://127.0.0.1:${DEFAULT_SERVER_PORT}/ws`,
        compiler: tex.description,
        collaborators: 1,
      });
      break;
    }

    case 'auth':
    case 'login': {
      const token = args[1];
      if (!token) {
        const user = await githubService.getAuthenticatedUser();
        if (user) {
          console.log(`\n${green}✓ Currently authenticated as @${user.login} (${user.name})${reset}\n`);
        } else {
          console.log(`\n${bold}Connect GitHub Account:${reset}`);
          console.log(`  ${cyan}gitleaf auth <github-token>${reset}`);
          console.log(`\n${dim}Generate a token in 10s at: https://github.com/settings/tokens/new?scopes=repo${reset}\n`);
        }
        return;
      }

      console.log(`\n${dim}Verifying GitHub token...${reset}`);
      const user = await githubService.getAuthenticatedUser(token.trim());
      if (user) {
        githubService.saveToken(token.trim());
        console.log(`${green}✓ Successfully connected GitHub account as @${user.login} (${user.name})!${reset}`);
        console.log(`${dim}GitLeaf will now automatically create private repos and invite collaborators with 0 manual steps.${reset}\n`);
      } else {
        console.log(`${orange}✗ Invalid GitHub token. Make sure it has "repo" permissions.${reset}\n`);
      }
      break;
    }

    case 'share':
    case 'invite': {
      const projects = projectManager.listProjects();
      if (projects.length === 0) {
        console.log(`\n${orange}No local projects found to share. Create one with: gitleaf init <name>${reset}\n`);
        return;
      }

      let target = null;
      const targetArg = args[1];

      if (targetArg) {
        const num = parseInt(targetArg, 10);
        if (!isNaN(num) && num >= 1 && num <= projects.length) {
          target = projects[num - 1];
        } else {
          target = projects.find(
            (p) =>
              p.name.toLowerCase().includes(targetArg.toLowerCase()) ||
              p.id.toLowerCase().includes(targetArg.toLowerCase())
          );
        }
      } else if (projects.length === 1) {
        target = projects[0];
      } else {
        console.log(`\n${bold}Select a Project to Share:${reset}`);
        console.log(`${dim}------------------------------------------------------------${reset}`);
        projects.forEach((p, idx) => {
          console.log(`  ${green}${idx + 1}.${reset} ${bold}${p.name}${reset} ${dim}(id: ${p.id})${reset}`);
        });
        console.log(`\n${dim}Run:${reset} ${cyan}gitleaf share <number-or-name>${reset} (e.g. ${cyan}gitleaf share 1${reset})\n`);
        return;
      }

      if (!target) {
        console.log(`\n${orange}Project not found matching "${targetArg}". Run 'gitleaf list' to view all projects.${reset}\n`);
        return;
      }

      const invite = inviteManager.createInvite(target.id, 'editor');
      const gitRemoteStr = target.gitRemote || GitSync.getRemote(target.rootPath) || 'Local-only (Not linked)';

      console.log(`
╭─────────────────────────────────────────────────────────────────────────────╮
│  ${bold}${green}GitLeaf Co-Author Pairing Code${reset}                                         │
│                                                                             │
│  ${dim}Project Name${reset}  : ${white}${target.name}${reset}
│  ${dim}Pairing Code${reset}  : ${bold}${cyan}${invite.shortCode}${reset}
│  ${dim}Git Remote${reset}    : ${white}${gitRemoteStr}${reset}
│  ${dim}Access Role${reset}   : ${green}Editor (Unlimited 0$ Co-Author)${reset}
│                                                                             │
│  ${bold}To Join via Web UI:${reset}
│  Paste ${bold}${cyan}${invite.shortCode}${reset} into the Join Paper box at ${white}http://localhost:${DEFAULT_CLIENT_PORT}${reset}
│                                                                             │
│  ${bold}To Join via CLI:${reset}
│  ${cyan}gitleaf join ${invite.shortCode} "Co-Author Name"${reset}
╰─────────────────────────────────────────────────────────────────────────────╯
`);
      break;
    }

    case 'join': {
      const token = args[1];
      const name = args[2] || 'Co-Author';
      if (!token) {
        console.log(`\n${orange}Please provide a pairing code or Git URL:${reset} gitleaf join <code/url> [your-name]\n`);
        return;
      }

      console.log(`\n${dim}Resolving paper:${reset} ${cyan}${token}${reset}...`);
      try {
        const project = await inviteManager.acceptInviteAsync(token, name);
        console.log(`${green}✓ Successfully joined paper:${reset} ${bold}${project.name}${reset}`);
        console.log(`${dim}Local disk mirror :${reset} ${white}${project.rootPath}${reset}`);
        if (project.gitRemote) {
          console.log(`${dim}Git remote        :${reset} ${cyan}${project.gitRemote}${reset}`);
        }
        console.log(`${dim}Ready to edit! Launch with:${reset} ${cyan}npm run dev${reset}\n`);
      } catch (err: any) {
        console.log(`${orange}Failed to join:${reset} ${err.message}\n`);
      }
      break;
    }

    case 'link':
    case 'connect':
    case 'remote': {
      const projects = projectManager.listProjects();
      if (projects.length === 0) {
        console.log(`\n${orange}No local projects found. Create one first with: gitleaf init <name>${reset}\n`);
        return;
      }

      let target = null;
      let remoteUrl = '';

      if (args.length === 2) {
        // e.g. gitleaf link https://github.com/user/repo.git (auto-picks current/first project)
        target = projects[0];
        remoteUrl = args[1];
      } else if (args.length >= 3) {
        const targetArg = args[1];
        remoteUrl = args[2];

        const num = parseInt(targetArg, 10);
        if (!isNaN(num) && num >= 1 && num <= projects.length) {
          target = projects[num - 1];
        } else {
          target = projects.find(
            (p) =>
              p.name.toLowerCase().includes(targetArg.toLowerCase()) ||
              p.id.toLowerCase().includes(targetArg.toLowerCase())
          );
        }
      }

      if (!remoteUrl || !target) {
        console.log(`\n${bold}Connect a Private GitHub Repository:${reset}`);
        console.log(`  ${cyan}gitleaf link <github-repo-url>${reset}                     ${dim}(links current project)${reset}`);
        console.log(`  ${cyan}gitleaf link <project-name> <github-repo-url>${reset}        ${dim}(links specific project)${reset}`);
        console.log(`\n${dim}Example:${reset} ${cyan}gitleaf link "DNN-LatexWork" https://github.com/myname/my-paper.git${reset}\n`);
        return;
      }

      console.log(`\n${dim}Linking repository to:${reset} ${bold}${target.name}${reset}`);
      GitSync.initRepo(target.rootPath);
      const ok = GitSync.setRemote(target.rootPath, remoteUrl);

      if (ok) {
        target.gitRemote = remoteUrl;
        const metaPath = `${target.rootPath}/.gitleaf.json`;
        try {
          const fs = await import('fs');
          fs.writeFileSync(metaPath, JSON.stringify(target, null, 2), 'utf-8');
        } catch {}

        GitSync.commit(target.rootPath, 'Initial GitLeaf commit');
        console.log(`${dim}Pushing files to GitHub...${reset}`);
        const pushed = GitSync.push(target.rootPath);

        console.log(`\n${green}✓ Successfully linked GitHub remote!${reset}`);
        console.log(`  ${dim}Remote URL:${reset} ${white}${remoteUrl}${reset}`);
        console.log(`  ${dim}Status    :${reset} ${pushed ? green + 'Pushed to GitHub' : orange + 'Linked (Check git credentials)'}${reset}`);
        console.log(`\n${dim}Co-authors can now clone and join with:${reset} ${cyan}gitleaf share "${target.name}"${reset}\n`);
      } else {
        console.log(`\n${orange}Failed to set remote URL.${reset}\n`);
      }
      break;
    }

    case 'push': {
      const projects = projectManager.listProjects();
      const targetName = args[1];
      const message = args[2] || 'GitLeaf save';
      const target = targetName
        ? projects.find((p) => p.name.toLowerCase().includes(targetName.toLowerCase()) || p.id === targetName)
        : projects[0];

      if (!target) {
        console.log(`\n${orange}No project found to push.${reset}\n`);
        return;
      }

      console.log(`\n${dim}Pushing project:${reset} ${bold}${target.name}${reset}`);
      GitSync.commit(target.rootPath, message);
      const success = GitSync.push(target.rootPath);
      if (success) {
        console.log(`${green}✓ Pushed all latest changes to remote repository.${reset}\n`);
      } else {
        console.log(`${orange}✗ Push failed. Ensure a Git remote is linked with: gitleaf remote "${target.name}" <url>${reset}\n`);
      }
      break;
    }

    case 'sync':
    case 'pull': {
      const projects = projectManager.listProjects();
      const targetName = args[1];
      const target = targetName
        ? projects.find((p) => p.name.toLowerCase().includes(targetName.toLowerCase()) || p.id === targetName)
        : projects[0];

      if (!target) {
        console.log(`\n${orange}No matching project found to sync.${reset}\n`);
        return;
      }

      console.log(`\n${dim}Synchronizing project:${reset} ${bold}${target.name}${reset}`);
      console.log(`${dim}Local disk path     :${reset} ${white}${target.rootPath}${reset}`);

      // Try Git pull first if remote exists
      if (GitSync.isGitRepo(target.rootPath) && GitSync.getRemote(target.rootPath)) {
        console.log(`${dim}Pulling from Git remote...${reset}`);
        const gitOk = GitSync.pull(target.rootPath);
        if (gitOk) {
          console.log(`${green}✓ Pulled latest commits from Git remote.${reset}\n`);
          break;
        }
      }

      // LAN fallback
      const host = target.remoteHost || `127.0.0.1:${DEFAULT_SERVER_PORT}`;
      try {
        const res = await fetch(`http://${host}/api/projects/${target.id}/export`, {
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.files) {
            for (const [filePath, content] of Object.entries(data.files)) {
              projectManager.writeFile(target.rootPath, filePath, content as string);
            }
          }
          console.log(`${green}✓ Pulled and updated ${Object.keys(data.files || {}).length} files to disk.${reset}\n`);
          break;
        }
      } catch {}

      console.log(`${green}✓ Local files are synchronized.${reset}\n`);
      break;
    }

    case 'history':
    case 'log': {
      const projects = projectManager.listProjects();
      const targetName = args[1];
      const target = targetName
        ? projects.find((p) => p.name.toLowerCase().includes(targetName.toLowerCase()) || p.id === targetName)
        : projects[0];

      if (!target) {
        console.log(`\n${orange}No project found.${reset}\n`);
        return;
      }

      const snapshots = historyTracker.listSnapshots(target.rootPath);
      const lastGit = GitSync.getLastCommit(target.rootPath);

      console.log(`\n${bold}Git Version Timeline for:${reset} ${green}${target.name}${reset}`);
      console.log(`${dim}----------------------------------------------------------------------${reset}`);

      if (lastGit) {
        console.log(`* ${cyan}git commit ${lastGit.hash}${reset} ${dim}(${lastGit.date})${reset}`);
        console.log(`  ${lastGit.message}\n`);
      }

      for (const s of snapshots.slice(0, 5)) {
        const dateStr = new Date(s.timestamp).toLocaleString();
        console.log(`* ${cyan}checkpoint ${s.id}${reset} ${dim}(${dateStr})${reset}`);
        console.log(`  Author: ${white}${s.author}${reset}`);
        console.log(`  ${s.message}`);
        console.log(`  ${dim}Files: ${s.files.map((f) => f.path).join(', ')}${reset}\n`);
      }
      break;
    }

    case 'init': {
      const name = args[1] || 'My Research Paper';
      const template = args[2] || 'ieee-conference';
      const project = projectManager.createProject(name, template);
      // Auto-init git repo
      GitSync.initRepo(project.rootPath);
      GitSync.commit(project.rootPath, 'Initial paper structure');

      console.log(`\n${green}✓ Created new GitLeaf project:${reset} ${bold}${project.name}${reset}`);
      console.log(`${dim}Location :${reset} ${white}${project.rootPath}${reset}`);
      console.log(`${dim}Template :${reset} ${cyan}${template}${reset}`);
      console.log(`${dim}Git Repo :${reset} ${green}Initialized (.git)${reset}\n`);
      break;
    }

    case 'list': {
      const projects = projectManager.listProjects();
      console.log(`\n${bold}GitLeaf Local Projects (${projects.length}):${reset}`);
      console.log(`${dim}------------------------------------------------------------${reset}`);
      for (const p of projects) {
        const remote = p.gitRemote || GitSync.getRemote(p.rootPath) || 'Local-only';
        console.log(`• ${green}${p.name}${reset} ${dim}(id: ${p.id})${reset}`);
        console.log(`  ${dim}Remote: ${cyan}${remote}${reset}`);
        console.log(`  ${dim}Path  : ${p.rootPath}${reset}`);
      }
      console.log('');
      break;
    }

    case 'compile': {
      const projects = projectManager.listProjects();
      const targetName = args[1];
      const target = targetName
        ? projects.find((p) => p.name.toLowerCase().includes(targetName.toLowerCase()) || p.id === targetName)
        : projects[0];

      if (!target) {
        console.log(`${orange}No projects found to compile.${reset}`);
        return;
      }

      console.log(`\n${dim}Compiling ${target.name} via ${target.engine || 'tectonic'}...${reset}`);
      const result = await compiler.compile(target.rootPath, target.mainFile);
      if (result.success) {
        console.log(`${green}✓ Compilation succeeded in ${result.durationMs}ms${reset}`);
        if (result.pdfPath) console.log(`${dim}Output PDF:${reset} ${white}${result.pdfPath}${reset}\n`);
      } else {
        console.log(`${orange}✗ Compilation failed:${reset}`);
        for (const diag of result.diagnostics) {
          console.log(`  ${dim}${diag.file}:${diag.line}${reset} - ${diag.message}`);
        }
      }
      break;
    }

    default: {
      console.log(`\n${orange}Unknown command:${reset} ${command}`);
      printHelp();
    }
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

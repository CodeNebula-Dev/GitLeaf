import express from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import fs from 'fs';
import zlib from 'zlib';
import { WebSocketServer } from 'ws';
import { ProjectManager } from './fs/manager.js';
import { LatexCompiler } from './compiler/runner.js';
import { YjsSyncRelay } from './sync/yjs-relay.js';
import { InviteManager } from './sync/invite.js';
import { HistoryTracker } from './git/history.js';
import { GitSync } from './git/sync.js';
import { GitHubService } from './git/github.js';
import { detectSystemTeX } from '../cli/system.js';
import { printCliBanner } from '../cli/banner.js';
import { DEFAULT_SERVER_PORT, DEFAULT_CLIENT_PORT } from '../shared/constants.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const pathname = request.url ? new URL(request.url, `http://${request.headers.host || 'localhost'}`).pathname : '';
  if (pathname.startsWith('/ws')) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

const projectManager = new ProjectManager();
const latexCompiler = new LatexCompiler();
const syncRelay = new YjsSyncRelay(projectManager);
const inviteManager = new InviteManager(projectManager);
const historyTracker = new HistoryTracker();

// Initialize WebSocket CRDT Relay
syncRelay.setupWebSocket(wss);

// 1. System Status
app.get('/api/system/status', (req, res) => {
  const status = detectSystemTeX();
  res.json({
    version: '0.1.0',
    tex: status,
    projectBaseDir: projectManager.getBaseDir(),
  });
});

// 2. List & Create Projects
app.get('/api/projects', (req, res) => {
  const projects = projectManager.listProjects();
  res.json(projects);
});

app.post('/api/projects', (req, res) => {
  const { name, template } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Project name is required' });
  }
  const project = projectManager.createProject(name, template);
  res.json(project);
});

app.delete('/api/projects/:id', (req, res) => {
  const success = projectManager.deleteProject(req.params.id);
  if (!success) {
    return res.status(404).json({ error: 'Project not found' });
  }
  res.json({ success: true, message: 'Project deleted from local disk' });
});

// 3. Project Detail & Files (Includes existing PDF check)
app.get('/api/projects/:id', (req, res) => {
  const project = projectManager.getProject(req.params.id);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }
  const files = projectManager.getProjectFiles(project.rootPath);
  
  const mainBase = (project.mainFile || 'main.tex').replace(/\.tex$/i, '');
  const pdfPath = path.join(project.rootPath, `${mainBase}.pdf`);
  const hasPdf = fs.existsSync(pdfPath);
  let pdfUrl: string | undefined = undefined;
  let pdfMtime = 0;

  if (hasPdf) {
    pdfMtime = fs.statSync(pdfPath).mtimeMs;
    pdfUrl = `/api/projects/${project.id}/pdf?t=${pdfMtime}`;
  }

  res.json({
    project,
    files,
    hasPdf,
    pdfUrl,
    pdfMtime,
  });
});

app.get('/api/projects/:id/files', (req, res) => {
  const project = projectManager.getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const files = projectManager.getProjectFiles(project.rootPath);
  res.json(files);
});

app.get('/api/projects/:id/file-content', (req, res) => {
  const project = projectManager.getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const filePath = (req.query.path as string) || 'main.tex';
  try {
    const content = projectManager.readFile(project.rootPath, filePath);
    res.json({ path: filePath, content });
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

app.put('/api/projects/:id/file-content', (req, res) => {
  const project = projectManager.getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const { path: filePath, content } = req.body;
  if (!filePath || content === undefined) {
    return res.status(400).json({ error: 'File path and content are required' });
  }
  try {
    projectManager.writeFile(project.rootPath, filePath, content);
    res.json({ success: true, path: filePath });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/projects/:id/files', (req, res) => {
  const project = projectManager.getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const { path: filePath, type } = req.body;
  if (!filePath) return res.status(400).json({ error: 'Path is required' });

  const fullPath = path.join(project.rootPath, filePath);
  if (type === 'directory') {
    fs.mkdirSync(fullPath, { recursive: true });
  } else {
    projectManager.writeFile(project.rootPath, filePath, '');
  }
  res.json({ success: true, path: filePath });
});

app.delete('/api/projects/:id/files', (req, res) => {
  const project = projectManager.getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const filePath = req.query.path as string;
  if (!filePath) return res.status(400).json({ error: 'Path is required' });
  projectManager.deleteFile(project.rootPath, filePath);
  res.json({ success: true });
});

// 4. LaTeX Compilation
app.post('/api/projects/:id/compile', async (req, res) => {
  const project = projectManager.getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const { mainFile, engine } = req.body;

  const result = await latexCompiler.compile(
    project.rootPath,
    mainFile || project.mainFile || 'main.tex',
    engine || project.engine
  );

  // Auto-record checkpoint snapshot on successful compilation
  if (result.success) {
    try {
      const files = projectManager.getProjectFiles(project.rootPath);
      const fileContents: Record<string, string> = {};
      for (const f of files) {
        if (f.type === 'file' && (f.path.endsWith('.tex') || f.path.endsWith('.bib'))) {
          fileContents[f.path] = projectManager.readFile(project.rootPath, f.path);
        }
      }
      historyTracker.createSnapshot(project.rootPath, 'Auto-checkpoint: Compiled PDF', 'GitLeaf Daemon', fileContents);
    } catch {}
  }

  res.json(result);
});

app.get('/api/projects/:id/pdf', (req, res) => {
  const project = projectManager.getProject(req.params.id);
  if (!project) return res.status(404).send('Project not found');

  const mainBase = (project.mainFile || 'main.tex').replace(/\.tex$/i, '');
  const pdfPath = path.join(project.rootPath, `${mainBase}.pdf`);

  if (!fs.existsSync(pdfPath)) {
    return res.status(404).send('PDF not yet compiled. Click Recompile in the editor.');
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${mainBase}.pdf"`);
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  fs.createReadStream(pdfPath).pipe(res);
});

app.get('/api/projects/:id/export', (req, res) => {
  const project = projectManager.getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const files = projectManager.getProjectFiles(project.rootPath);
  const filesMap: Record<string, string> = {};
  for (const f of files) {
    if (f.type === 'file') {
      try {
        filesMap[f.path] = projectManager.readFile(project.rootPath, f.path);
      } catch {}
    }
  }

  // Export Git snapshots
  const snapshots = historyTracker.listSnapshots(project.rootPath);
  const snapshotsMap: Record<string, any> = {};
  for (const s of snapshots) {
    const detail = historyTracker.getSnapshot(project.rootPath, s.id);
    if (detail) {
      snapshotsMap[`${s.id}.json`] = detail;
    }
  }

  res.json({ project, files: filesMap, snapshots: snapshotsMap });
});

// Download compressed portable .gitleaf bundle
app.get('/api/projects/:id/bundle', (req, res) => {
  const project = projectManager.getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const files = projectManager.getProjectFiles(project.rootPath);
  const filesMap: Record<string, string> = {};
  for (const f of files) {
    if (f.type === 'file') {
      try {
        filesMap[f.path] = projectManager.readFile(project.rootPath, f.path);
      } catch {}
    }
  }

  const snapshots = historyTracker.listSnapshots(project.rootPath);
  const snapshotsMap: Record<string, any> = {};
  for (const s of snapshots) {
    const detail = historyTracker.getSnapshot(project.rootPath, s.id);
    if (detail) snapshotsMap[`${s.id}.json`] = detail;
  }

  const bundleData = {
    gitleafVersion: '1.0',
    exportedAt: Date.now(),
    project: {
      name: project.name,
      mainFile: project.mainFile,
      engine: project.engine,
    },
    files: filesMap,
    snapshots: snapshotsMap,
  };

  const jsonStr = JSON.stringify(bundleData);
  const compressed = zlib.gzipSync(Buffer.from(jsonStr, 'utf-8'));
  const safeFilename = project.name.toLowerCase().replace(/[^a-z0-9_-]/g, '_');

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}.gitleaf"`);
  res.send(compressed);
});

// Import a .gitleaf bundle
app.post('/api/projects/import', (req, res) => {
  try {
    let bundleData = req.body;

    if (bundleData.compressed) {
      const buffer = Buffer.from(bundleData.compressed, 'base64');
      const decompressed = zlib.gunzipSync(buffer).toString('utf-8');
      bundleData = JSON.parse(decompressed);
    }

    if (!bundleData.files || !bundleData.project) {
      return res.status(400).json({ error: 'Invalid GitLeaf bundle format' });
    }

    const projectName = bundleData.project.name || 'Imported Paper';
    const newProject = projectManager.createProject(projectName, 'blank');

    for (const [filePath, content] of Object.entries(bundleData.files)) {
      projectManager.writeFile(newProject.rootPath, filePath, content as string);
    }

    if (bundleData.snapshots) {
      const historyDir = path.join(newProject.rootPath, '.gitleaf_history');
      if (!fs.existsSync(historyDir)) fs.mkdirSync(historyDir, { recursive: true });
      for (const [snapFile, snapDetail] of Object.entries(bundleData.snapshots)) {
        fs.writeFileSync(path.join(historyDir, snapFile), JSON.stringify(snapDetail, null, 2), 'utf-8');
      }
    }

    newProject.mainFile = bundleData.project.mainFile || 'main.tex';
    newProject.engine = bundleData.project.engine || 'pdflatex';
    const metaPath = path.join(newProject.rootPath, '.gitleaf.json');
    fs.writeFileSync(metaPath, JSON.stringify(newProject, null, 2), 'utf-8');

    res.json({ success: true, project: newProject });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to import bundle: ' + err.message });
  }
});

// 5. Invitations & Sharing
app.post('/api/projects/:id/invite', (req, res) => {
  const { role, email } = req.body;
  try {
    const invite = inviteManager.createInvite(req.params.id, role || 'editor', email);
    res.json(invite);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/invite/:code', (req, res) => {
  const invite = inviteManager.getInvite(req.params.code);
  if (!invite) return res.status(404).json({ error: 'Invite not found or expired' });
  res.json(invite);
});

app.post('/api/invite/join', async (req, res) => {
  const { token, collaboratorName, host } = req.body;
  if (!token || !collaboratorName) {
    return res.status(400).json({ error: 'Token and Name are required' });
  }
  try {
    const project = await inviteManager.acceptInviteAsync(token, collaboratorName);
    res.json({ success: true, project });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 6. Version History & Checkpoints
app.get('/api/projects/:id/history', (req, res) => {
  const project = projectManager.getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const snapshots = historyTracker.listSnapshots(project.rootPath);
  res.json(snapshots);
});

app.post('/api/projects/:id/history', (req, res) => {
  const project = projectManager.getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const { message, author } = req.body;

  const files = projectManager.getProjectFiles(project.rootPath);
  const fileContents: Record<string, string> = {};
  for (const f of files) {
    if (f.type === 'file' && (f.path.endsWith('.tex') || f.path.endsWith('.bib') || f.path.endsWith('.cls'))) {
      fileContents[f.path] = projectManager.readFile(project.rootPath, f.path);
    }
  }

  const snapshot = historyTracker.createSnapshot(
    project.rootPath,
    message || 'Manual Checkpoint',
    author || 'You',
    fileContents
  );
  res.json(snapshot);
});

app.get('/api/projects/:id/history/:snapshotId', (req, res) => {
  const project = projectManager.getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const snapshot = historyTracker.getSnapshot(project.rootPath, req.params.snapshotId);
  if (!snapshot) return res.status(404).json({ error: 'Snapshot not found' });
  res.json(snapshot);
});

// 7. Git Sync — Link Remote, Push, Pull, Status
app.post('/api/projects/:id/git/link-remote', (req, res) => {
  const project = projectManager.getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const { remoteUrl } = req.body;
  if (!remoteUrl) return res.status(400).json({ error: 'remoteUrl is required' });

  if (!GitSync.hasGit()) {
    return res.status(500).json({ error: 'Git is not installed on this machine.' });
  }

  GitSync.initRepo(project.rootPath);
  const success = GitSync.setRemote(project.rootPath, remoteUrl);
  if (!success) {
    return res.status(500).json({ error: 'Failed to set Git remote.' });
  }

  // Update project metadata
  project.gitRemote = remoteUrl;
  const metaPath = path.join(project.rootPath, '.gitleaf.json');
  fs.writeFileSync(metaPath, JSON.stringify(project, null, 2), 'utf-8');

  // Initial commit + push
  GitSync.commit(project.rootPath, 'Initial GitLeaf commit');
  const pushed = GitSync.push(project.rootPath);

  res.json({
    success: true,
    gitRemote: remoteUrl,
    pushed,
    message: pushed ? 'Remote linked and files pushed.' : 'Remote linked. Push manually if needed.',
  });
});

app.post('/api/projects/:id/git/push', (req, res) => {
  const project = projectManager.getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const message = req.body.message || 'GitLeaf save';
  GitSync.commit(project.rootPath, message);
  const pushed = GitSync.push(project.rootPath);

  res.json({ success: pushed, message: pushed ? 'Changes pushed to remote.' : 'Push failed — check Git credentials.' });
});

app.post('/api/projects/:id/git/pull', (req, res) => {
  const project = projectManager.getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const pulled = GitSync.pull(project.rootPath);
  res.json({ success: pulled, message: pulled ? 'Latest changes pulled.' : 'Pull failed or no remote configured.' });
});

const githubService = new GitHubService();

// 8. GitHub API Automation Endpoints
app.get('/api/github/user', async (req, res) => {
  const user = await githubService.getAuthenticatedUser();
  res.json({ authenticated: !!user, user: user || null });
});

app.post('/api/github/auth', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token is required' });

  const user = await githubService.getAuthenticatedUser(token.trim());
  if (!user) {
    return res.status(401).json({ error: 'Invalid GitHub token. Please ensure it has "repo" scope.' });
  }

  githubService.saveToken(token.trim());
  res.json({ success: true, user });
});

app.post('/api/github/disconnect', (req, res) => {
  githubService.clearToken();
  res.json({ success: true });
});

// Auto-create private GitHub repo & push project
app.post('/api/projects/:id/github/auto-create', async (req, res) => {
  const project = projectManager.getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const user = await githubService.getAuthenticatedUser();
  if (!user) {
    return res.status(401).json({ error: 'Please connect your GitHub account first.' });
  }

  // 1. Create Private Repository via GitHub API
  const repoRes = await githubService.createPrivateRepo(project.name);
  if (!repoRes.success || !repoRes.cloneUrl) {
    return res.status(500).json({ error: repoRes.error || 'Failed to create GitHub repository.' });
  }

  // 2. Initialize Git & Link Remote
  GitSync.initRepo(project.rootPath);
  GitSync.setRemote(project.rootPath, repoRes.cloneUrl);

  // 3. Update project metadata
  project.gitRemote = repoRes.cloneUrl;
  const metaPath = path.join(project.rootPath, '.gitleaf.json');
  fs.writeFileSync(metaPath, JSON.stringify(project, null, 2), 'utf-8');

  // 4. Initial commit & push
  GitSync.commit(project.rootPath, `Initial commit: ${project.name}`);
  const pushed = GitSync.push(project.rootPath);

  res.json({
    success: true,
    repoUrl: repoRes.repoUrl,
    cloneUrl: repoRes.cloneUrl,
    pushed,
    message: `Private repository "${repoRes.name}" created and synced to GitHub!`,
  });
});

// Auto-invite collaborator via GitHub API
app.post('/api/projects/:id/github/invite-collaborator', async (req, res) => {
  const project = projectManager.getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'GitHub username is required' });

  const remote = project.gitRemote || GitSync.getRemote(project.rootPath);
  if (!remote) {
    return res.status(400).json({ error: 'Project is not linked to GitHub yet. Click "Enable Cloud Sync" first.' });
  }

  // Parse owner and repo name from remote URL
  const match = remote.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(\.git)?$/);
  if (!match) {
    return res.status(400).json({ error: 'Could not parse GitHub repository owner and name from remote URL.' });
  }

  const owner = match[1];
  const repo = match[2];

  const inviteRes = await githubService.addCollaborator(owner, repo, username);
  if (!inviteRes.success) {
    return res.status(500).json({ error: inviteRes.error || 'Failed to invite collaborator on GitHub.' });
  }

  // Also create internal invite PIN for GitLeaf
  const pinInvite = inviteManager.createInvite(project.id, 'editor');

  res.json({
    success: true,
    username: inviteRes.username,
    shortCode: pinInvite.shortCode,
    message: `Successfully invited @${inviteRes.username} to GitHub repository!`,
  });
});

app.get('/api/projects/:id/git/status', (req, res) => {
  const project = projectManager.getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const remote = GitSync.getRemote(project.rootPath);
  const status = GitSync.getStatus(project.rootPath);
  const lastCommit = GitSync.getLastCommit(project.rootPath);
  const isRepo = GitSync.isGitRepo(project.rootPath);

  res.json({
    isGitRepo: isRepo,
    hasRemote: !!remote,
    remote: remote || null,
    clean: status.clean,
    changedFiles: status.changedFiles,
    lastCommit,
  });
});

// Auto-pull all Git-linked projects on startup
if (GitSync.hasGit()) {
  console.log('[GitSync] Pulling latest for all Git-linked projects...');
  GitSync.pullAllOnStartup(projectManager.getBaseDir());
}

// Ensure a default starter project exists
const existingProjects = projectManager.listProjects();
if (existingProjects.length === 0) {
  projectManager.createProject('GitLeaf Research Paper', 'ieee-conference');
}

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : DEFAULT_SERVER_PORT;

server.listen(PORT, '0.0.0.0', () => {
  const texInfo = detectSystemTeX();
  printCliBanner({
    version: '0.1.0',
    projectPath: projectManager.getBaseDir(),
    clientUrl: `http://localhost:${DEFAULT_CLIENT_PORT}`,
    wsUrl: `ws://127.0.0.1:${PORT}/ws`,
    compiler: texInfo.description,
    collaborators: 1,
  });
});

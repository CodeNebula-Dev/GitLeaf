import express from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { WebSocketServer } from 'ws';
import { ProjectManager } from './fs/manager.js';
import { LatexCompiler } from './compiler/runner.js';
import { YjsSyncRelay } from './sync/yjs-relay.js';
import { InviteManager } from './sync/invite.js';
import { HistoryTracker } from './git/history.js';
import { detectSystemTeX } from '../cli/system.js';
import { printCliBanner } from '../cli/banner.js';
import { DEFAULT_SERVER_PORT, DEFAULT_CLIENT_PORT } from '../shared/constants.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

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

app.post('/api/invite/join', (req, res) => {
  const { token, collaboratorName } = req.body;
  if (!token || !collaboratorName) {
    return res.status(400).json({ error: 'Token and Name are required' });
  }
  try {
    const project = inviteManager.acceptInvite(token, collaboratorName);
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

// Ensure a default starter project exists
const existingProjects = projectManager.listProjects();
if (existingProjects.length === 0) {
  projectManager.createProject('GitLeaf Research Paper', 'ieee-conference');
}

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : DEFAULT_SERVER_PORT;

server.listen(PORT, () => {
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

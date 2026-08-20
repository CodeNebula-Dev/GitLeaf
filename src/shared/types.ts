export interface ProjectFile {
  name: string;
  path: string; // relative to project root, e.g. "main.tex", "sections/intro.tex"
  type: 'file' | 'directory';
  size?: number;
  lastModified?: number;
  content?: string;
  isMain?: boolean;
}

export interface ProjectMetadata {
  id: string;
  name: string;
  rootPath: string;
  mainFile: string;
  createdAt: number;
  updatedAt: number;
  engine: 'pdflatex' | 'xelatex' | 'lualatex' | 'tectonic' | 'wasm';
  collaborators: Collaborator[];
  remoteHost?: string;
}

export interface Collaborator {
  id: string;
  name: string;
  color: string;
  avatar?: string;
  role: 'owner' | 'editor' | 'viewer';
  lastActive: number;
}

export interface CompilerDiagnostic {
  type: 'error' | 'warning' | 'info';
  file: string;
  line: number;
  message: string;
  raw?: string;
}

export interface CompilationResult {
  success: boolean;
  pdfUrl?: string;
  pdfPath?: string;
  diagnostics: CompilerDiagnostic[];
  log: string;
  durationMs: number;
  timestamp: number;
}

export interface GitSnapshot {
  id: string;
  message: string;
  author: string;
  timestamp: number;
  files: { path: string; size: number }[];
}

export interface SyncPresence {
  userId: string;
  userName: string;
  userColor: string;
  cursor?: { line: number; column: number };
  activeFile?: string;
}

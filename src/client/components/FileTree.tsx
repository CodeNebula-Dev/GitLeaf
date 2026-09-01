import React, { useState, useMemo } from 'react';
import { Trash2, ChevronRight, ChevronDown, FolderOpen, Folder, FileText, Wrench } from 'lucide-react';
import { ProjectFile } from '../../shared/types.js';

// Build artifact extensions that should be grouped into a collapsible section
const ARTIFACT_EXTENSIONS = new Set([
  '.log', '.aux', '.synctex.gz', '.synctex', '.out', '.toc',
  '.fdb_latexmk', '.fls', '.bbl', '.blg', '.nav', '.snm', '.vrb',
  '.lof', '.lot', '.idx', '.ind', '.ilg', '.gz', '.xdv',
]);

function isArtifactFile(name: string): boolean {
  const lower = name.toLowerCase();
  for (const ext of ARTIFACT_EXTENSIONS) {
    if (lower.endsWith(ext)) return true;
  }
  return false;
}

interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  isMain?: boolean;
  children: TreeNode[];
}

function buildTree(files: ProjectFile[]): TreeNode[] {
  const root: TreeNode[] = [];
  const dirMap = new Map<string, TreeNode>();

  // Sort: directories first, then alphabetically
  const sorted = [...files].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  for (const file of sorted) {
    const parts = file.path.split('/');

    if (parts.length === 1) {
      // Root-level file or directory
      const node: TreeNode = {
        name: file.name,
        path: file.path,
        type: file.type,
        isMain: file.isMain,
        children: [],
      };
      if (file.type === 'directory') {
        dirMap.set(file.path, node);
      }
      root.push(node);
    } else {
      // Nested file — find or create parent dirs
      let currentChildren = root;
      let currentPath = '';

      for (let i = 0; i < parts.length - 1; i++) {
        currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
        let dirNode = dirMap.get(currentPath);

        if (!dirNode) {
          dirNode = {
            name: parts[i],
            path: currentPath,
            type: 'directory',
            children: [],
          };
          dirMap.set(currentPath, dirNode);
          currentChildren.push(dirNode);
        }
        currentChildren = dirNode.children;
      }

      const node: TreeNode = {
        name: file.name,
        path: file.path,
        type: file.type,
        isMain: file.isMain,
        children: [],
      };
      if (file.type === 'directory') {
        dirMap.set(file.path, node);
      }
      currentChildren.push(node);
    }
  }

  return root;
}

interface FileTreeProps {
  files: ProjectFile[];
  activeFilePath: string;
  onSelectFile: (path: string) => void;
  onCreateFile: (path: string, type: 'file' | 'directory') => void;
  onDeleteFile: (path: string) => void;
  mainFile?: string;
}

export const FileTree: React.FC<FileTreeProps> = ({
  files,
  activeFilePath,
  onSelectFile,
  onCreateFile,
  onDeleteFile,
  mainFile = 'main.tex',
}) => {
  const [newFileInputOpen, setNewFileInputOpen] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [newFileType, setNewFileType] = useState<'file' | 'directory'>('file');
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [buildOutputOpen, setBuildOutputOpen] = useState(false);
  const [selectedDir, setSelectedDir] = useState<string | null>(null);

  // Partition files into user files and build artifacts
  const { userFiles, artifactFiles, tree } = useMemo(() => {
    const user: ProjectFile[] = [];
    const artifacts: ProjectFile[] = [];

    for (const f of files) {
      if (f.type === 'file' && isArtifactFile(f.name)) {
        artifacts.push(f);
      } else {
        user.push(f);
      }
    }

    return { userFiles: user, artifactFiles: artifacts, tree: buildTree(user) };
  }, [files]);

  const toggleDir = (dirPath: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) {
        next.delete(dirPath);
      } else {
        next.add(dirPath);
      }
      return next;
    });
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFileName.trim()) return;

    // Prefix with selected directory path if one is selected
    let finalPath = newFileName.trim();
    if (selectedDir) {
      finalPath = `${selectedDir}/${finalPath}`;
    }

    onCreateFile(finalPath, newFileType);
    setNewFileName('');
    setNewFileInputOpen(false);
    setSelectedDir(null);
  };

  const openCreateInDir = (dirPath: string | null, type: 'file' | 'directory') => {
    setSelectedDir(dirPath);
    setNewFileType(type);
    setNewFileInputOpen(true);
    if (dirPath) {
      setExpandedDirs((prev) => new Set([...prev, dirPath]));
    }
  };

  const renderNode = (node: TreeNode, depth: number = 0): React.ReactNode => {
    const isActive = node.path === activeFilePath;
    const isMainFile = node.path === mainFile || node.name === mainFile;
    const isExpanded = expandedDirs.has(node.path);

    if (node.type === 'directory') {
      return (
        <div key={node.path}>
          <div
            onClick={() => toggleDir(node.path)}
            className={`group flex items-center justify-between px-2.5 py-1.5 rounded-md cursor-pointer transition-colors text-dark-text hover:bg-dark-hover hover:text-white`}
            style={{ paddingLeft: `${8 + depth * 14}px` }}
          >
            <div className="flex items-center space-x-1.5 truncate">
              {isExpanded ? (
                <>
                  <ChevronDown className="w-3 h-3 text-dark-muted shrink-0" />
                  <FolderOpen className="w-3.5 h-3.5 text-leaf-400 shrink-0" />
                </>
              ) : (
                <>
                  <ChevronRight className="w-3 h-3 text-dark-muted shrink-0" />
                  <Folder className="w-3.5 h-3.5 text-leaf-400/70 shrink-0" />
                </>
              )}
              <span className="truncate text-dark-text">{node.name}</span>
            </div>

            <div className="opacity-0 group-hover:opacity-100 flex items-center space-x-0.5 transition-opacity">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openCreateInDir(node.path, 'file');
                }}
                className="px-1 py-0.5 rounded text-[10px] hover:bg-dark-border text-dark-muted hover:text-leaf-400"
                title="New file here"
              >
                +f
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openCreateInDir(node.path, 'directory');
                }}
                className="px-1 py-0.5 rounded text-[10px] hover:bg-dark-border text-dark-muted hover:text-leaf-400"
                title="New folder here"
              >
                +d
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Delete folder "${node.name}" and all its contents?`)) {
                    onDeleteFile(node.path);
                  }
                }}
                className="p-0.5 hover:text-red-400 rounded transition-opacity"
                title="Delete Folder"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>

          {isExpanded && (
            <div>
              {node.children.map((child) => renderNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    // File node
    return (
      <div
        key={node.path}
        onClick={() => onSelectFile(node.path)}
        className={`group flex items-center justify-between px-2.5 py-1.5 rounded-md cursor-pointer transition-colors ${
          isActive
            ? 'bg-leaf-500/15 text-leaf-300 font-semibold'
            : 'text-dark-text hover:bg-dark-hover hover:text-white'
        }`}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
      >
        <div className="flex items-center space-x-1.5 truncate">
          {isMainFile ? (
            <span className="text-leaf-400 font-bold select-none text-[10px]">★</span>
          ) : (
            <FileText className="w-3 h-3 text-dark-muted/50 shrink-0" />
          )}
          <span className={`truncate ${isMainFile ? 'text-leaf-300 font-medium' : ''}`}>
            {node.name}
          </span>
        </div>

        {!isMainFile && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`Delete ${node.name}?`)) {
                onDeleteFile(node.path);
              }
            }}
            className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-400 rounded transition-opacity"
            title="Delete File"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>
    );
  };

  return (
    <aside className="w-56 bg-dark-surface border-r border-dark-border flex flex-col h-full select-none">
      {/* Header & Quick Add */}
      <div className="h-9 px-3 border-b border-dark-border flex items-center justify-between font-mono">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-dark-muted">
          FILES
        </span>
        <div className="flex items-center space-x-1.5 text-xs">
          <button
            onClick={() => openCreateInDir(null, 'file')}
            className="px-1.5 py-0.5 rounded text-[11px] hover:bg-dark-hover text-dark-muted hover:text-leaf-400 transition-colors"
            title="New File"
          >
            + file
          </button>
          <button
            onClick={() => openCreateInDir(null, 'directory')}
            className="px-1.5 py-0.5 rounded text-[11px] hover:bg-dark-hover text-dark-muted hover:text-leaf-400 transition-colors"
            title="New Folder"
          >
            + dir
          </button>
        </div>
      </div>

      {/* Inline Create Input */}
      {newFileInputOpen && (
        <form onSubmit={handleCreate} className="p-2 border-b border-dark-border bg-dark-bg/60 font-mono">
          {selectedDir && (
            <div className="text-[10px] text-leaf-400/80 mb-1 truncate">
              📁 {selectedDir}/
            </div>
          )}
          <div className="flex items-center space-x-1">
            <span className="text-leaf-400 text-xs">{newFileType === 'file' ? '>' : '/'}</span>
            <input
              type="text"
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              placeholder={newFileType === 'file' ? 'chapter1.tex' : 'figures'}
              autoFocus
              className="w-full bg-dark-surface border border-dark-border px-2 py-1 text-xs text-white rounded focus:outline-none focus:border-leaf-500 font-mono"
            />
          </div>
          <div className="flex justify-end space-x-1 mt-1.5">
            <button
              type="button"
              onClick={() => {
                setNewFileInputOpen(false);
                setSelectedDir(null);
              }}
              className="text-[10px] px-2 py-0.5 rounded text-dark-muted hover:bg-dark-hover font-mono"
            >
              cancel
            </button>
            <button
              type="submit"
              className="text-[10px] px-2 py-0.5 rounded bg-leaf-500 text-white font-medium hover:bg-leaf-600 font-mono"
            >
              add
            </button>
          </div>
        </form>
      )}

      {/* User Files Tree */}
      <div className="flex-1 overflow-y-auto py-1 px-1.5 space-y-0.5 font-mono text-xs">
        {tree.map((node) => renderNode(node))}
      </div>

      {/* Build Output Artifacts (Collapsible) */}
      {artifactFiles.length > 0 && (
        <div className="border-t border-dark-border">
          <button
            onClick={() => setBuildOutputOpen(!buildOutputOpen)}
            className="w-full h-7 px-3 flex items-center justify-between text-[11px] font-mono text-dark-muted hover:text-white hover:bg-dark-hover/50 transition-colors"
          >
            <div className="flex items-center space-x-1.5">
              <Wrench className="w-3 h-3 text-dark-muted" />
              <span className="uppercase tracking-wider font-semibold">Build Output</span>
              <span className="text-[10px] text-dark-muted/70">({artifactFiles.length})</span>
            </div>
            {buildOutputOpen ? (
              <ChevronDown className="w-3 h-3 text-dark-muted" />
            ) : (
              <ChevronRight className="w-3 h-3 text-dark-muted" />
            )}
          </button>

          {buildOutputOpen && (
            <div className="px-1.5 pb-1 space-y-0.5 font-mono text-xs max-h-40 overflow-y-auto">
              {artifactFiles.map((file) => (
                <div
                  key={file.path}
                  onClick={() => onSelectFile(file.path)}
                  className={`group flex items-center justify-between px-2.5 py-1 rounded-md cursor-pointer transition-colors ${
                    file.path === activeFilePath
                      ? 'bg-dark-hover text-dark-text'
                      : 'text-dark-muted hover:bg-dark-hover hover:text-dark-text'
                  }`}
                >
                  <div className="flex items-center space-x-1.5 truncate">
                    <span className="text-dark-muted/40 select-none">·</span>
                    <span className="truncate opacity-70">{file.name}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </aside>
  );
};

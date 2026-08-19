import React, { useState } from 'react';
import {
  FileText,
  Folder,
  FolderOpen,
  FilePlus,
  FolderPlus,
  Trash2,
  Image,
  BookOpen,
  ChevronRight,
  ChevronDown,
  Star,
} from 'lucide-react';
import { ProjectFile } from '../../shared/types.js';

interface FileTreeProps {
  files: ProjectFile[];
  activeFilePath: string;
  onSelectFile: (path: string) => void;
  onCreateFile: (path: string, type: 'file' | 'directory') => void;
  onDeleteFile: (path: string) => void;
}

export const FileTree: React.FC<FileTreeProps> = ({
  files,
  activeFilePath,
  onSelectFile,
  onCreateFile,
  onDeleteFile,
}) => {
  const [newFileInputOpen, setNewFileInputOpen] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [newFileType, setNewFileType] = useState<'file' | 'directory'>('file');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFileName.trim()) return;
    onCreateFile(newFileName.trim(), newFileType);
    setNewFileName('');
    setNewFileInputOpen(false);
  };

  const getFileIcon = (file: ProjectFile) => {
    if (file.type === 'directory') return <Folder className="w-4 h-4 text-yellow-400" />;
    if (file.name.endsWith('.tex')) return <FileText className="w-4 h-4 text-leaf-400" />;
    if (file.name.endsWith('.bib')) return <BookOpen className="w-4 h-4 text-blue-400" />;
    if (file.name.match(/\.(png|jpg|jpeg|svg|eps)$/i)) return <Image className="w-4 h-4 text-purple-400" />;
    return <FileText className="w-4 h-4 text-dark-muted" />;
  };

  return (
    <aside className="w-60 bg-dark-surface border-r border-dark-border flex flex-col h-full select-none">
      {/* Header & Quick Add */}
      <div className="h-10 px-3 border-b border-dark-border flex items-center justify-between">
        <span className="text-xs font-mono font-semibold uppercase tracking-wider text-dark-muted">
          Project Files
        </span>
        <div className="flex items-center space-x-1">
          <button
            onClick={() => {
              setNewFileType('file');
              setNewFileInputOpen(true);
            }}
            className="p-1 rounded hover:bg-dark-hover text-dark-muted hover:text-white transition-colors"
            title="New File"
          >
            <FilePlus className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              setNewFileType('directory');
              setNewFileInputOpen(true);
            }}
            className="p-1 rounded hover:bg-dark-hover text-dark-muted hover:text-white transition-colors"
            title="New Folder"
          >
            <FolderPlus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Inline Create Input */}
      {newFileInputOpen && (
        <form onSubmit={handleCreate} className="p-2 border-b border-dark-border bg-dark-bg/60">
          <div className="flex items-center space-x-1.5">
            {newFileType === 'file' ? (
              <FilePlus className="w-3.5 h-3.5 text-leaf-400 shrink-0" />
            ) : (
              <FolderPlus className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
            )}
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
              onClick={() => setNewFileInputOpen(false)}
              className="text-[10px] px-2 py-0.5 rounded text-dark-muted hover:bg-dark-hover"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="text-[10px] px-2 py-0.5 rounded bg-leaf-500 text-white font-medium hover:bg-leaf-600"
            >
              Create
            </button>
          </div>
        </form>
      )}

      {/* File List */}
      <div className="flex-1 overflow-y-auto py-1 px-1.5 space-y-0.5">
        {files.map((file) => {
          const isActive = file.path === activeFilePath;
          return (
            <div
              key={file.path}
              onClick={() => file.type === 'file' && onSelectFile(file.path)}
              className={`group flex items-center justify-between px-2 py-1.5 rounded-md text-xs cursor-pointer transition-colors ${
                isActive
                  ? 'bg-leaf-500/15 text-leaf-300 font-medium'
                  : 'text-dark-text hover:bg-dark-hover hover:text-white'
              }`}
            >
              <div className="flex items-center space-x-2 truncate">
                {getFileIcon(file)}
                <span className="truncate font-mono">{file.name}</span>
                {file.isMain && (
                  <span title="Main Entry Document">
                    <Star className="w-3 h-3 text-yellow-400 fill-yellow-400/30 shrink-0" />
                  </span>
                )}
              </div>

              {!file.isMain && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Delete ${file.name}?`)) {
                      onDeleteFile(file.path);
                    }
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 rounded transition-opacity"
                  title="Delete File"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
};

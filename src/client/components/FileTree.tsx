import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
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

  return (
    <aside className="w-56 bg-dark-surface border-r border-dark-border flex flex-col h-full select-none">
      {/* Header & Quick Add */}
      <div className="h-9 px-3 border-b border-dark-border flex items-center justify-between font-mono">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-dark-muted">
          FILES
        </span>
        <div className="flex items-center space-x-1.5 text-xs">
          <button
            onClick={() => {
              setNewFileType('file');
              setNewFileInputOpen(true);
            }}
            className="px-1.5 py-0.5 rounded text-[11px] hover:bg-dark-hover text-dark-muted hover:text-leaf-400 transition-colors"
            title="New File"
          >
            + file
          </button>
          <button
            onClick={() => {
              setNewFileType('directory');
              setNewFileInputOpen(true);
            }}
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
              onClick={() => setNewFileInputOpen(false)}
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

      {/* File List */}
      <div className="flex-1 overflow-y-auto py-1 px-1.5 space-y-0.5 font-mono text-xs">
        {files.map((file) => {
          const isActive = file.path === activeFilePath;
          const isMain = file.isMain || file.name === 'main.tex';

          return (
            <div
              key={file.path}
              onClick={() => file.type === 'file' && onSelectFile(file.path)}
              className={`group flex items-center justify-between px-2.5 py-1.5 rounded-md cursor-pointer transition-colors ${
                isActive
                  ? 'bg-leaf-500/15 text-leaf-300 font-semibold'
                  : 'text-dark-text hover:bg-dark-hover hover:text-white'
              }`}
            >
              <div className="flex items-center space-x-1.5 truncate">
                {isMain ? (
                  <span className="text-leaf-400 font-bold select-none">*</span>
                ) : (
                  <span className="text-dark-muted select-none opacity-40">·</span>
                )}
                <span className={`truncate ${isMain ? 'text-leaf-300 font-medium' : ''}`}>
                  {file.name}
                </span>
              </div>

              {!isMain && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Delete ${file.name}?`)) {
                      onDeleteFile(file.path);
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
        })}
      </div>
    </aside>
  );
};

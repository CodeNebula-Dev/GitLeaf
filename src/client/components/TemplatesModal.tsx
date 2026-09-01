import React, { useState } from 'react';
import { X, FileText, Plus } from 'lucide-react';

interface TemplatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateProject: (name: string, template: string) => void;
}

export const TemplatesModal: React.FC<TemplatesModalProps> = ({
  isOpen,
  onClose,
  onCreateProject,
}) => {
  const [projectName, setProjectName] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) return;
    onCreateProject(projectName.trim(), 'blank');
    setProjectName('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md glass-dropdown rounded-xl border border-dark-border overflow-hidden animate-in fade-in zoom-in duration-150 shadow-2xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-dark-border flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-lg bg-leaf-500/20 text-leaf-400 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-base">New LaTeX Paper</h3>
              <p className="text-[11px] text-dark-muted">Create a clean, local-first LaTeX document</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-dark-hover text-dark-muted hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-dark-muted uppercase">Paper Title / Project Name</label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="e.g. Distributed Consensus in Edge Networks"
              autoFocus
              className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-dark-muted focus:outline-none focus:border-leaf-500 font-mono transition-colors"
            />
          </div>

          <div className="p-3 bg-dark-bg/60 border border-dark-border rounded-lg flex items-center space-x-3 text-xs text-dark-muted">
            <div className="w-2 h-2 rounded-full bg-leaf-400 shrink-0" />
            <span>Includes standard LaTeX preamble (<code className="text-leaf-300">amsmath</code>, <code className="text-leaf-300">graphicx</code>, <code className="text-leaf-300">hyperref</code>).</span>
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-2 pt-2 border-t border-dark-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-medium text-dark-muted hover:bg-dark-hover hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!projectName.trim()}
              className="px-4 py-2 rounded-lg bg-leaf-500 hover:bg-leaf-600 active:bg-leaf-700 text-white font-medium text-xs shadow-md shadow-leaf-500/20 disabled:opacity-50 flex items-center space-x-1.5 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Paper</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

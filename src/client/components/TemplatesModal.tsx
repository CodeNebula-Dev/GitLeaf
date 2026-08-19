import React, { useState } from 'react';
import { X, BookOpen, Layers, FileCode, CheckCircle } from 'lucide-react';
import { LATEX_TEMPLATES } from '../../shared/constants.js';

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
  const [selectedTemplate, setSelectedTemplate] = useState('ieee-conference');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) return;
    onCreateProject(projectName.trim(), selectedTemplate);
    setProjectName('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl glass-dropdown rounded-xl border border-dark-border overflow-hidden animate-in fade-in zoom-in duration-150">
        {/* Header */}
        <div className="px-5 py-4 border-b border-dark-border flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Layers className="w-5 h-5 text-leaf-400" />
            <h3 className="font-semibold text-white text-base">New LaTeX Paper</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-dark-hover text-dark-muted hover:text-white"
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
              className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-dark-muted focus:outline-none focus:border-leaf-500 font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-mono text-dark-muted uppercase">Select Academic Template</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto">
              {LATEX_TEMPLATES.map((tmpl) => {
                const isSelected = selectedTemplate === tmpl.id;
                return (
                  <div
                    key={tmpl.id}
                    onClick={() => setSelectedTemplate(tmpl.id)}
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-leaf-500/15 border-leaf-500/50 shadow-md shadow-leaf-500/10'
                        : 'bg-dark-bg/60 border-dark-border hover:bg-dark-hover hover:border-dark-border'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-semibold ${isSelected ? 'text-leaf-300' : 'text-white'}`}>
                        {tmpl.name}
                      </span>
                      {isSelected && <CheckCircle className="w-4 h-4 text-leaf-400" />}
                    </div>
                    <p className="text-[11px] text-dark-muted mt-1 leading-relaxed">
                      {tmpl.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-2 pt-2 border-t border-dark-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-medium text-dark-muted hover:bg-dark-hover hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!projectName.trim()}
              className="px-4 py-2 rounded-lg bg-leaf-500 hover:bg-leaf-600 active:bg-leaf-700 text-white font-medium text-xs shadow-md shadow-leaf-500/20 disabled:opacity-50"
            >
              Create Local Project
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { Play, Share2, History, Plus, ChevronDown, Check, Loader2, ArrowLeft, Laptop, ShieldCheck } from 'lucide-react';
import { ProjectMetadata } from '../../shared/types.js';
import { UserProfile } from '../hooks/useUser.js';

interface NavbarProps {
  currentProject: ProjectMetadata | null;
  projects: ProjectMetadata[];
  user: UserProfile | null;
  onSelectProject: (proj: ProjectMetadata) => void;
  onBackToDashboard: () => void;
  onCompile: () => void;
  isCompiling: boolean;
  isSaving: boolean;
  onOpenShare: () => void;
  onOpenHistory: () => void;
  onOpenTemplates: () => void;
  onOpenProfile: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentProject,
  projects,
  user,
  onSelectProject,
  onBackToDashboard,
  onCompile,
  isCompiling,
  isSaving,
  onOpenShare,
  onOpenHistory,
  onOpenTemplates,
  onOpenProfile,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  return (
    <header className="h-14 bg-dark-surface border-b border-dark-border px-4 flex items-center justify-between select-none z-30">
      {/* Left: Back to Dashboard & Project Selector */}
      <div className="flex items-center space-x-3">
        <button
          onClick={onBackToDashboard}
          className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg hover:bg-dark-hover text-dark-muted hover:text-white transition-colors text-xs font-mono border border-transparent hover:border-dark-border"
          title="Return to Projects Dashboard"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Projects</span>
        </button>

        <div className="h-5 w-[1px] bg-dark-border mx-0.5" />

        <div className="flex items-center space-x-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-leaf-500 to-leaf-700 flex items-center justify-center font-mono font-bold text-white text-xs shadow-md shadow-leaf-500/20">
            GL
          </div>
        </div>

        {/* Project Switcher Dropdown */}
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center space-x-2 px-2.5 py-1 rounded-md hover:bg-dark-hover text-sm font-medium text-dark-text transition-colors border border-transparent hover:border-dark-border"
          >
            <span className="truncate max-w-[180px] font-semibold text-white">{currentProject?.name || 'Project'}</span>
            <ChevronDown className="w-3.5 h-3.5 text-dark-muted" />
          </button>

          {dropdownOpen && (
            <div className="absolute top-full left-0 mt-1 w-64 glass-dropdown rounded-lg py-1.5 z-50">
              <div className="px-3 py-1 text-xs font-mono text-dark-muted uppercase tracking-wider">
                Local Projects ({projects.length})
              </div>
              <div className="max-h-60 overflow-y-auto my-1">
                {projects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      onSelectProject(p);
                      setDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-dark-hover transition-colors ${
                      p.id === currentProject?.id ? 'text-leaf-400 font-medium bg-leaf-500/10' : 'text-dark-text'
                    }`}
                  >
                    <span className="truncate">{p.name}</span>
                    {p.id === currentProject?.id && <Check className="w-4 h-4 text-leaf-400 shrink-0" />}
                  </button>
                ))}
              </div>
              <div className="border-t border-dark-border pt-1 px-1">
                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    onOpenTemplates();
                  }}
                  className="w-full text-left px-3 py-2 text-xs font-medium text-leaf-400 hover:bg-leaf-500/10 rounded flex items-center space-x-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New LaTeX Project</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Center: Compile Action */}
      <div className="flex items-center space-x-3">
        <button
          onClick={onCompile}
          disabled={isCompiling}
          className="flex items-center space-x-2 px-4 py-1.5 rounded-lg bg-leaf-500 hover:bg-leaf-600 active:bg-leaf-700 text-white font-medium text-xs shadow-md shadow-leaf-500/20 transition-all disabled:opacity-50 font-mono"
        >
          {isCompiling ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Compiling...</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>Recompile</span>
              <span className="text-[10px] font-mono opacity-75 bg-black/20 px-1 py-0.5 rounded ml-1">⌘↵</span>
            </>
          )}
        </button>

        {/* Save state */}
        <div className="text-[11px] font-mono text-dark-muted hidden md:block">
          {isSaving ? (
            <span className="text-yellow-400">Saving...</span>
          ) : (
            <span className="text-leaf-400/80">Saved locally</span>
          )}
        </div>
      </div>

      {/* Right: Actions & User Avatar */}
      <div className="flex items-center space-x-2">
        <button
          onClick={onOpenShare}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-dark-hover hover:bg-dark-border text-dark-text text-xs font-medium border border-dark-border transition-colors font-mono"
          title="Invite co-authors with unlimited free access"
        >
          <Share2 className="w-3.5 h-3.5 text-leaf-400" />
          <span>Share</span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-leaf-500/20 text-leaf-400 font-bold">
            0$
          </span>
        </button>

        <button
          onClick={onOpenHistory}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-dark-hover hover:bg-dark-border text-dark-text text-xs font-medium border border-dark-border transition-colors font-mono"
          title="View Git checkpoints and revisions"
        >
          <History className="w-3.5 h-3.5 text-git" />
          <span className="hidden sm:inline">History</span>
        </button>

        {/* User Profile Avatar */}
        <button
          onClick={onOpenProfile}
          className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs text-white border border-dark-border ml-1"
          style={{ backgroundColor: user?.color || '#10B981' }}
          title={`${user?.name || 'Author'} (${user?.email || 'local'})`}
        >
          {user?.name?.charAt(0).toUpperCase() || 'U'}
        </button>
      </div>
    </header>
  );
};

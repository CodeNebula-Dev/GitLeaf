import React, { useState, useRef, useEffect } from 'react';
import {
  Plus,
  Search,
  BookOpen,
  Laptop,
  Users,
  History,
  Trash2,
  ExternalLink,
  ShieldCheck,
  FolderSync,
  Clock,
  FileText,
  User,
  Key,
  ArrowRight,
  Upload,
  Sparkles,
  Github,
  CheckCircle2,
  Lock,
  AlertTriangle,
  Timer,
} from 'lucide-react';
import { ProjectMetadata } from '../../shared/types.js';
import { UserProfile } from '../hooks/useUser.js';
import { GitHubConnectModal } from './GitHubConnectModal.js';

interface DashboardProps {
  projects: ProjectMetadata[];
  user: UserProfile | null;
  onOpenProject: (project: ProjectMetadata) => void;
  onNewProject: () => void;
  onDeleteProject: (projectId: string) => void;
  onOpenProfile: () => void;
  onRefreshProjects?: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  projects,
  user,
  onOpenProject,
  onNewProject,
  onDeleteProject,
  onOpenProfile,
  onRefreshProjects,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [joinToken, setJoinToken] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [importing, setImporting] = useState(false);
  const [githubUser, setGithubUser] = useState<{ login: string; avatar_url: string; name: string } | null>(null);
  const [githubModalOpen, setGithubModalOpen] = useState(false);
  const [tokenExpiration, setTokenExpiration] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchGitHubUser = async () => {
    try {
      const res = await fetch('/api/github/user');
      if (res.ok) {
        const data = await res.json();
        setGithubUser(data.user);
        setTokenExpiration(data.tokenExpiration || null);
      }
    } catch {}
  };

  const getExpiryLabel = (): { text: string; warn: boolean } | null => {
    if (!tokenExpiration) return null;
    const expDate = new Date(tokenExpiration);
    if (isNaN(expDate.getTime())) return null;
    const now = Date.now();
    const diffMs = expDate.getTime() - now;
    if (diffMs <= 0) return { text: 'Token expired!', warn: true };
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (days > 30) return { text: `Expires in ${days} days`, warn: false };
    if (days > 0) return { text: `Expires in ${days} day${days > 1 ? 's' : ''}`, warn: days <= 7 };
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    return { text: `Expires in ${hours}h`, warn: true };
  };

  useEffect(() => {
    fetchGitHubUser();
  }, []);

  const filteredProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    let token = joinToken.trim();
    if (!token) return;

    // Handle full invite URLs if pasted directly
    if (token.includes('invite=')) {
      token = token.split('invite=')[1].split('&')[0];
    } else if (token.includes('join=')) {
      token = token.split('join=')[1].split('&')[0];
    }

    setJoinLoading(true);
    setJoinError('');
    try {
      const res = await fetch('/api/invite/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, collaboratorName: user?.name || 'Co-Author' }),
      });
      const data = await res.json();
      if (res.ok && data.project) {
        onRefreshProjects?.();
        onOpenProject(data.project);
      } else {
        setJoinError(data.error || 'Failed to join project');
      }
    } catch (err: any) {
      setJoinError(err.message || 'Connection error');
    } finally {
      setJoinLoading(false);
    }
  };

  const handleImportBundle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setJoinError('');
    try {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let base64 = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        base64 += String.fromCharCode(bytes[i]);
      }
      const b64Str = btoa(base64);

      const res = await fetch('/api/projects/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ compressed: b64Str }),
      });
      const data = await res.json();
      if (res.ok && data.project) {
        onRefreshProjects?.();
        onOpenProject(data.project);
      } else {
        setJoinError(data.error || 'Failed to import .gitleaf bundle');
      }
    } catch (err: any) {
      setJoinError('Import failed: ' + (err.message || 'Invalid bundle file'));
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const expiryInfo = getExpiryLabel();

  return (
    <div className="h-screen bg-dark-bg text-dark-text flex flex-col font-sans select-none overflow-hidden">
      {/* Top Navigation */}
      <header className="h-16 bg-dark-surface border-b border-dark-border px-6 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-leaf-500 to-leaf-700 flex items-center justify-center font-mono font-bold text-white text-base shadow-lg shadow-leaf-500/20">
            GL
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-white tracking-wide font-mono text-base">GitLeaf</span>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-leaf-500/10 text-leaf-400 border border-leaf-500/20 font-semibold">
                Local-First VCS
              </span>
            </div>
            <span className="text-[11px] text-dark-muted hidden sm:block">
              Free & Open Source LaTeX Collaboration Hub
            </span>
          </div>
        </div>

        {/* Right User & Actions */}
        <div className="flex items-center space-x-3">
          {/* GitHub Connection Badge / Button */}
          <button
            onClick={() => setGithubModalOpen(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-dark-hover hover:bg-dark-border text-white text-xs border border-dark-border transition-colors font-mono"
            title="GitHub Account for Cloud Sync"
          >
            <Github className="w-3.5 h-3.5 text-leaf-400" />
            {githubUser ? (
              <span className="flex items-center space-x-1">
                <span>@{githubUser.login}</span>
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              </span>
            ) : (
              <span className="text-dark-muted hover:text-white">Connect GitHub</span>
            )}
          </button>

          {/* Token Expiry Badge */}
          {githubUser && expiryInfo && (
            <span className={`text-[10px] font-mono px-2 py-1 rounded-md border flex items-center space-x-1 ${
              expiryInfo.warn
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                : 'bg-dark-hover text-dark-muted border-dark-border'
            }`}>
              <Timer className="w-3 h-3" />
              <span>{expiryInfo.text}</span>
            </span>
          )}

          {/* Import Paper Button */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportBundle}
            accept=".gitleaf,.json"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-dark-hover hover:bg-dark-border text-leaf-300 font-medium text-xs border border-dark-border transition-colors font-mono disabled:opacity-50"
            title="Import a .gitleaf portable paper bundle"
          >
            <Upload className="w-3.5 h-3.5 text-leaf-400" />
            <span>{importing ? 'Importing...' : 'Import .gitleaf'}</span>
          </button>

          {/* New Project Button */}
          <button
            onClick={onNewProject}
            className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-leaf-500 hover:bg-leaf-600 active:bg-leaf-700 text-white font-medium text-xs shadow-md shadow-leaf-500/20 transition-all font-mono"
          >
            <Plus className="w-4 h-4" />
            <span>New Project</span>
          </button>

          {/* User Profile Badge */}
          <button
            onClick={onOpenProfile}
            className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-dark-hover hover:bg-dark-border text-dark-text border border-dark-border transition-colors text-xs"
          >
            <div
              style={{ backgroundColor: user?.color || '#10B981' }}
              className="w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs text-white"
            >
              {user?.name?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="text-left hidden md:block">
              <div className="font-medium text-white text-xs truncate max-w-[120px]">{user?.name || 'Author'}</div>
              <div className="text-[10px] text-dark-muted font-mono truncate max-w-[120px]">{user?.email || 'local'}</div>
            </div>
          </button>
        </div>
      </header>

      {/* Main Dashboard Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8 space-y-6 overflow-y-auto">
        {/* GitHub Connection Required Banner */}
        {!githubUser ? (
          <div className="rounded-2xl border-2 border-amber-500/40 bg-amber-500/5 p-5 relative overflow-hidden">
            <div className="flex items-start space-x-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              </div>
              <div className="flex-1 space-y-1.5">
                <h2 className="text-base font-bold text-white">GitHub Connection Required for Collaboration</h2>
                <p className="text-xs text-dark-muted leading-relaxed">
                  To invite co-authors, create cloud-synced private repositories, and enable Push/Pull across laptops, you must first connect your <strong className="text-white">GitHub account</strong> with a Personal Access Token. This is a one-time setup.
                </p>
                <div className="flex items-center space-x-3 pt-2">
                  <button
                    onClick={() => setGithubModalOpen(true)}
                    className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-leaf-500 hover:bg-leaf-600 active:bg-leaf-700 text-white font-medium text-xs shadow-md shadow-leaf-500/20 transition-all font-mono"
                  >
                    <Github className="w-4 h-4" />
                    <span>Connect GitHub Account</span>
                  </button>
                  <span className="text-[11px] text-dark-muted font-mono">Takes ~10 seconds</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-medium text-emerald-300 font-mono">GitHub Connected — Cloud Sync Ready</span>
              {expiryInfo && (
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                  expiryInfo.warn
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                    : 'bg-dark-hover text-dark-muted border-dark-border'
                }`}>
                  {expiryInfo.text}
                </span>
              )}
            </div>
            <span className="text-[11px] text-dark-muted font-mono">@{githubUser.login}</span>
          </div>
        )}
        {/* Banner Card */}
        <div className="glass-panel rounded-2xl p-6 relative overflow-hidden">
          <div className="max-w-2xl space-y-2">
            <h1 className="text-2xl font-bold text-white tracking-tight">Your Local LaTeX Papers</h1>
            <p className="text-sm text-dark-muted leading-relaxed">
              Every document is stored directly on your laptop's disk with real-time multi-author CRDT sync, instant local compilation, and GitLeaf version control. No subscriptions. No author limits.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6 pt-4 border-t border-dark-border/60 text-xs font-mono">
            <div className="flex items-center space-x-2 text-dark-text">
              <Laptop className="w-4 h-4 text-leaf-400" />
              <span>100% Local Storage</span>
            </div>
            <div className="flex items-center space-x-2 text-dark-text">
              <Users className="w-4 h-4 text-leaf-400" />
              <span>Short Pairing Codes</span>
            </div>
            <div className="flex items-center space-x-2 text-dark-text">
              <ShieldCheck className="w-4 h-4 text-leaf-400" />
              <span>CRDT & Git History</span>
            </div>
          </div>
        </div>

        {/* Toolbar & Search */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-dark-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search your papers..."
              className="w-full bg-dark-surface border border-dark-border rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-dark-muted focus:outline-none focus:border-leaf-500 font-mono"
            />
          </div>

          {/* Join Shared Paper Input */}
          <form onSubmit={handleJoin} className="flex items-center space-x-2 w-full sm:w-auto">
            <div className="flex items-center space-x-1.5 bg-dark-surface border border-dark-border rounded-lg px-2.5 py-1.5 focus-within:border-leaf-500">
              <Key className="w-3.5 h-3.5 text-leaf-400 shrink-0" />
              <input
                type="text"
                value={joinToken}
                onChange={(e) => {
                  setJoinToken(e.target.value);
                  setJoinError('');
                }}
                placeholder="Paste Pairing Code (gl-xxxxxx)"
                className="bg-transparent text-xs text-white placeholder-dark-muted focus:outline-none font-mono w-52"
              />
            </div>
            <button
              type="submit"
              disabled={joinLoading || !joinToken.trim()}
              className="px-3 py-1.5 rounded-lg bg-dark-hover hover:bg-dark-border text-xs font-medium text-leaf-400 border border-dark-border flex items-center space-x-1 disabled:opacity-50 font-mono"
            >
              <span>{joinLoading ? 'Joining...' : 'Join Paper'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>

        {joinError && (
          <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300 font-mono">
            {joinError}
          </div>
        )}

        {/* Project List */}
        <div className="space-y-3">
          <div className="text-xs font-mono uppercase text-dark-muted tracking-wider font-semibold">
            All Papers ({filteredProjects.length})
          </div>

          {filteredProjects.length === 0 ? (
            <div className="glass-panel rounded-xl p-12 text-center space-y-3">
              <BookOpen className="w-10 h-10 text-dark-muted mx-auto" />
              <h3 className="text-base font-semibold text-white">No papers found</h3>
              <p className="text-xs text-dark-muted max-w-sm mx-auto">
                {searchQuery ? 'No papers match your search query.' : 'Create your first collaborative paper, import a .gitleaf bundle, or join with a pairing code.'}
              </p>
              <button
                onClick={onNewProject}
                className="inline-flex items-center space-x-2 px-4 py-2 rounded-lg bg-leaf-500 text-white font-medium text-xs shadow-md shadow-leaf-500/20"
              >
                <Plus className="w-4 h-4" />
                <span>Create New Paper</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {filteredProjects.map((p) => (
                <div
                  key={p.id}
                  onClick={() => onOpenProject(p)}
                  className="glass-panel hover:border-leaf-500/40 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 cursor-pointer transition-all hover:bg-dark-hover/40 group"
                >
                  {/* Left: Info */}
                  <div className="flex items-start space-x-3.5">
                    <div className="w-10 h-10 rounded-lg bg-leaf-500/10 border border-leaf-500/20 flex items-center justify-center text-leaf-400 group-hover:scale-105 transition-transform shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white group-hover:text-leaf-300 transition-colors flex items-center space-x-2">
                        <span>{p.name}</span>
                      </h3>
                      <div className="flex items-center space-x-3 mt-1 text-[11px] text-dark-muted font-mono">
                        <span className="flex items-center space-x-1">
                          <Clock className="w-3 h-3 text-dark-muted" />
                          <span>Modified {new Date(p.updatedAt).toLocaleDateString()}</span>
                        </span>
                        <span>•</span>
                        <span className="truncate max-w-[200px]">{p.rootPath}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Actions & Collaborators */}
                  <div className="flex items-center space-x-4 self-end sm:self-center">
                    {/* Collaborator Avatars */}
                    <div className="flex items-center -space-x-1.5">
                      {p.collaborators?.slice(0, 3).map((c, i) => (
                        <div
                          key={c.id || i}
                          style={{ backgroundColor: c.color || '#10B981' }}
                          className="w-6 h-6 rounded-full border-2 border-dark-surface flex items-center justify-center font-bold text-[10px] text-white"
                          title={c.name}
                        >
                          {c.name.charAt(0).toUpperCase()}
                        </div>
                      ))}
                      {(p.collaborators?.length || 0) > 3 && (
                        <div className="w-6 h-6 rounded-full bg-dark-border border-2 border-dark-surface flex items-center justify-center font-bold text-[10px] text-dark-text">
                          +{p.collaborators.length - 3}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center space-x-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenProject(p);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-leaf-500/10 hover:bg-leaf-500/20 text-leaf-400 font-mono text-xs font-medium border border-leaf-500/20 flex items-center space-x-1"
                      >
                        <span>Open</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete project "${p.name}"? This removes the local files.`)) {
                            onDeleteProject(p.id);
                          }
                        }}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-dark-muted hover:text-red-400 transition-colors"
                        title="Delete project"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* GitHub 1-Time Setup Modal */}
      <GitHubConnectModal
        isOpen={githubModalOpen}
        onClose={() => setGithubModalOpen(false)}
        onSuccess={fetchGitHubUser}
      />
    </div>
  );
};

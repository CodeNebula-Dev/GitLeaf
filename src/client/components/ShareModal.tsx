import React, { useState, useEffect } from 'react';
import {
  X,
  Copy,
  Check,
  Users,
  Link,
  Key,
  Download,
  PackageCheck,
  ArrowUpRight,
  ArrowDownLeft,
  Loader2,
  Github,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  UserPlus,
  Lock,
} from 'lucide-react';
import { ProjectMetadata } from '../../shared/types.js';
import { GitHubConnectModal } from './GitHubConnectModal.js';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: ProjectMetadata | null;
}

interface GitHubUser {
  login: string;
  name: string;
  avatar_url: string;
}

export const ShareModal: React.FC<ShareModalProps> = ({ isOpen, onClose, project }) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [shortCode, setShortCode] = useState<string>('');
  const [loading, setLoading] = useState(false);

  // GitHub Auth State
  const [githubUser, setGithubUser] = useState<GitHubUser | null>(null);
  const [showConnectModal, setShowConnectModal] = useState(false);

  // GitHub Auto-Repo & Invite State
  const [creatingRepo, setCreatingRepo] = useState(false);
  const [coauthorUsername, setCoauthorUsername] = useState('');
  const [invitingCoauthor, setInvitingCoauthor] = useState(false);
  const [currentGitRemote, setCurrentGitRemote] = useState<string | undefined>(project?.gitRemote);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [syncingGit, setSyncingGit] = useState<'push' | 'pull' | null>(null);

  useEffect(() => {
    if (isOpen && project) {
      setCurrentGitRemote(project.gitRemote);
      if (!shortCode) {
        generateInvite();
      }
      fetchGitHubUser();
      fetchGitStatus();
    }
  }, [isOpen, project]);

  if (!isOpen || !project) return null;

  const fetchGitHubUser = async () => {
    try {
      const res = await fetch('/api/github/user');
      if (res.ok) {
        const data = await res.json();
        setGithubUser(data.user);
      }
    } catch {}
  };

  const fetchGitStatus = async () => {
    try {
      const res = await fetch(`/api/projects/${project.id}/git/status`);
      if (res.ok) {
        const data = await res.json();
        if (data.remote) {
          setCurrentGitRemote(data.remote);
        }
      }
    } catch {}
  };

  const generateInvite = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'editor' }),
      });
      if (res.ok) {
        const data = await res.json();
        setShortCode(data.shortCode || data.token);
      }
    } catch (err) {
      console.error('Error generating invite:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAutoCreateRepo = async () => {
    setCreatingRepo(true);
    setStatusMsg(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/github/auto-create`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCurrentGitRemote(data.cloneUrl);
        setStatusMsg({ type: 'success', text: data.message });
        generateInvite();
      } else {
        setStatusMsg({ type: 'error', text: data.error || 'Failed to auto-create repo.' });
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Error creating repo.' });
    } finally {
      setCreatingRepo(false);
    }
  };

  const handleInviteCoauthor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!coauthorUsername.trim()) return;

    setInvitingCoauthor(true);
    setStatusMsg(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/github/invite-collaborator`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: coauthorUsername.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStatusMsg({ type: 'success', text: data.message });
        setCoauthorUsername('');
        if (data.shortCode) setShortCode(data.shortCode);
      } else {
        setStatusMsg({ type: 'error', text: data.error || 'Failed to invite collaborator.' });
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Error inviting user.' });
    } finally {
      setInvitingCoauthor(false);
    }
  };

  const handleGitPush = async () => {
    setSyncingGit('push');
    setStatusMsg(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/git/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'GitLeaf manual push' }),
      });
      const data = await res.json();
      if (data.success) {
        setStatusMsg({ type: 'success', text: 'Pushed latest changes to GitHub!' });
      } else {
        setStatusMsg({ type: 'error', text: data.message || 'Push failed.' });
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Push error.' });
    } finally {
      setSyncingGit(null);
    }
  };

  const handleGitPull = async () => {
    setSyncingGit('pull');
    setStatusMsg(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/git/pull`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        setStatusMsg({ type: 'success', text: 'Pulled latest changes from GitHub!' });
      } else {
        setStatusMsg({ type: 'error', text: data.message || 'Pull failed.' });
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Pull error.' });
    } finally {
      setSyncingGit(null);
    }
  };

  const gitMatch = (currentGitRemote || project.gitRemote)?.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(\.git)?$/);
  const repoSlug = gitMatch ? `${gitMatch[1]}/${gitMatch[2]}` : null;
  const codeToShow = repoSlug || shortCode || `gl-${project.id.slice(0, 6)}`;
  const hostParam = `${window.location.hostname}:4411`;
  const inviteUrl = (currentGitRemote || project.gitRemote)
    ? `${window.location.origin}?join=${encodeURIComponent(currentGitRemote || project.gitRemote || '')}&host=${hostParam}`
    : `${window.location.origin}?join=${codeToShow}&host=${hostParam}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(codeToShow);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleDownloadBundle = () => {
    window.open(`/api/projects/${project.id}/bundle`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg glass-dropdown rounded-2xl border border-dark-border overflow-hidden animate-in fade-in zoom-in duration-150 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-dark-border flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-leaf-500/10 border border-leaf-500/30 flex items-center justify-center text-leaf-400">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-sm">Collaborate & Share Paper</h3>
              <p className="text-[11px] text-dark-muted font-mono">{project.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-dark-hover text-dark-muted hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto">
          {/* Method 1: Ultra Compact 6-Character Pairing Code */}
          <div className="glass-panel p-4 rounded-xl border border-leaf-500/40 bg-leaf-500/5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-semibold uppercase text-leaf-400 flex items-center space-x-1.5">
                <Key className="w-3.5 h-3.5" />
                <span>Pairing Code</span>
              </span>
              <span className="text-[10px] font-mono text-leaf-400/80 bg-leaf-500/10 px-2 py-0.5 rounded border border-leaf-500/20">
                Instant Clone
              </span>
            </div>

            <div className="flex items-center justify-between bg-dark-bg/90 border border-dark-border rounded-lg px-4 py-3">
              {loading ? (
                <div className="flex items-center space-x-2 text-dark-muted text-xs font-mono">
                  <Loader2 className="w-4 h-4 animate-spin text-leaf-400" />
                  <span>Generating code...</span>
                </div>
              ) : (
                <span className="font-mono text-xl font-bold text-white tracking-widest selection:bg-leaf-500">
                  {codeToShow}
                </span>
              )}
              <button
                onClick={handleCopyCode}
                disabled={loading}
                className="px-3.5 py-1.5 rounded-lg bg-leaf-500 hover:bg-leaf-600 active:bg-leaf-700 text-white text-xs font-mono font-medium shadow-md shadow-leaf-500/20 flex items-center space-x-1.5 transition-all disabled:opacity-50"
              >
                {copiedCode ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-white" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Code</span>
                  </>
                )}
              </button>
            </div>
            <p className="text-[11px] text-dark-muted leading-relaxed">
              Your co-author pastes this code in their <strong>Join Paper</strong> box to clone and mirror the paper on their disk.
            </p>
          </div>

          {/* Method 2: Project-Specific Private GitHub Cloud Sync */}
          <div className="glass-panel p-4 rounded-xl border border-dark-border bg-dark-bg/60 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-semibold uppercase text-white flex items-center space-x-1.5">
                <Github className="w-3.5 h-3.5 text-leaf-400" />
                <span>GitHub Cloud Sync (This Project)</span>
              </span>
              {currentGitRemote ? (
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 flex items-center space-x-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Private Repo Active</span>
                </span>
              ) : (
                <span className="text-[10px] font-mono text-dark-muted bg-dark-surface px-2 py-0.5 rounded border border-dark-border">
                  Local-only
                </span>
              )}
            </div>

            {/* If GitHub is not connected globally */}
            {!githubUser ? (
              <div className="p-3 rounded-lg bg-dark-surface/60 border border-dark-border flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-white flex items-center space-x-1.5">
                    <Lock className="w-3.5 h-3.5 text-leaf-400" />
                    <span>Connect GitHub Account</span>
                  </div>
                  <p className="text-[11px] text-dark-muted">
                    Connect once on the Home Page to enable 1-click private repositories & cloud sync.
                  </p>
                </div>
                <button
                  onClick={() => setShowConnectModal(true)}
                  className="px-3.5 py-1.5 rounded-lg bg-leaf-500 hover:bg-leaf-600 text-white text-xs font-mono font-medium shrink-0 shadow-md shadow-leaf-500/20 transition-all"
                >
                  Connect
                </button>
              </div>
            ) : (
              /* Connected GitHub User Controls */
              <div className="space-y-3">
                <div className="flex items-center justify-between p-2 rounded-lg bg-dark-surface/40 border border-dark-border">
                  <div className="flex items-center space-x-2">
                    <img
                      src={githubUser.avatar_url}
                      alt={githubUser.login}
                      className="w-5 h-5 rounded-full border border-dark-border"
                    />
                    <span className="text-xs font-medium text-white">@{githubUser.login}</span>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                    Global Account Active
                  </span>
                </div>

                {!currentGitRemote ? (
                  /* 1-Click Auto-Create Private Repo for THIS Paper */
                  <div className="p-3 rounded-lg bg-leaf-500/10 border border-leaf-500/30 flex items-center justify-between">
                    <div className="space-y-0.5">
                      <div className="text-xs font-semibold text-leaf-300 flex items-center space-x-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-leaf-400" />
                        <span>1-Click Private Repo Creation</span>
                      </div>
                      <p className="text-[11px] text-dark-muted">
                        GitLeaf will create a dedicated private repo for this paper automatically.
                      </p>
                    </div>
                    <button
                      onClick={handleAutoCreateRepo}
                      disabled={creatingRepo}
                      className="px-3 py-1.5 rounded-lg bg-leaf-500 hover:bg-leaf-600 active:bg-leaf-700 text-white text-xs font-mono font-medium shrink-0 disabled:opacity-50 transition-all flex items-center space-x-1.5"
                    >
                      {creatingRepo ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Creating...</span>
                        </>
                      ) : (
                        <span>Auto-Create</span>
                      )}
                    </button>
                  </div>
                ) : (
                  /* Auto-Invite Co-Author & Sync Buttons */
                  <div className="space-y-3">
                    <form onSubmit={handleInviteCoauthor} className="space-y-1.5">
                      <label className="text-xs font-mono text-dark-muted flex items-center space-x-1">
                        <UserPlus className="w-3.5 h-3.5 text-leaf-400" />
                        <span>Optional: Invite Co-Author by GitHub Username</span>
                      </label>
                      <div className="flex items-center space-x-2">
                        <input
                          type="text"
                          placeholder="GitHub username (e.g. alice)"
                          value={coauthorUsername}
                          onChange={(e) => setCoauthorUsername(e.target.value)}
                          className="flex-1 bg-dark-bg border border-dark-border rounded-lg px-2.5 py-1.5 text-xs text-white font-mono placeholder:text-dark-muted focus:outline-none focus:border-leaf-500/50"
                        />
                        <button
                          type="submit"
                          disabled={invitingCoauthor || !coauthorUsername.trim()}
                          className="px-3 py-1.5 rounded-lg bg-dark-surface hover:bg-dark-hover text-leaf-400 border border-dark-border text-xs font-mono font-medium shrink-0 disabled:opacity-50 transition-all flex items-center space-x-1"
                        >
                          {invitingCoauthor ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>Invite</span>}
                        </button>
                      </div>
                    </form>

                    <div className="flex items-center space-x-2 pt-1">
                      <button
                        onClick={handleGitPush}
                        disabled={syncingGit !== null}
                        className="flex-1 px-3 py-1.5 rounded-lg bg-dark-surface hover:bg-dark-hover text-white text-xs font-mono flex items-center justify-center space-x-1.5 border border-dark-border transition-colors disabled:opacity-50"
                      >
                        {syncingGit === 'push' ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-leaf-400" />
                        ) : (
                          <ArrowUpRight className="w-3.5 h-3.5 text-leaf-400" />
                        )}
                        <span>Push Changes</span>
                      </button>
                      <button
                        onClick={handleGitPull}
                        disabled={syncingGit !== null}
                        className="flex-1 px-3 py-1.5 rounded-lg bg-dark-surface hover:bg-dark-hover text-white text-xs font-mono flex items-center justify-center space-x-1.5 border border-dark-border transition-colors disabled:opacity-50"
                      >
                        {syncingGit === 'pull' ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                        ) : (
                          <ArrowDownLeft className="w-3.5 h-3.5 text-cyan-400" />
                        )}
                        <span>Pull Changes</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {statusMsg && (
              <div
                className={`text-[11px] font-mono flex items-center space-x-1.5 p-2 rounded-lg ${
                  statusMsg.type === 'success'
                    ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                    : 'bg-red-500/10 text-red-300 border border-red-500/20'
                }`}
              >
                {statusMsg.type === 'success' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>{statusMsg.text}</span>
              </div>
            )}
          </div>

          {/* Method 3: 1-Click Direct Join Link */}
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-dark-muted uppercase flex items-center space-x-1">
              <Link className="w-3.5 h-3.5 text-leaf-400" />
              <span>Direct Join Link</span>
            </label>
            <div className="flex items-center space-x-2 bg-dark-bg border border-dark-border rounded-lg p-1.5">
              <input
                type="text"
                readOnly
                value={inviteUrl}
                className="flex-1 bg-transparent text-xs text-dark-text font-mono truncate px-2 focus:outline-none"
              />
              <button
                onClick={handleCopyLink}
                className="px-3 py-1.5 rounded-md bg-dark-hover hover:bg-dark-border text-xs font-medium text-white flex items-center space-x-1 transition-colors shrink-0 font-mono"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-leaf-400" />
                    <span className="text-leaf-400">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Link</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Method 4: Portable GitLeaf Bundle */}
          <div className="p-3 rounded-xl bg-dark-bg/60 border border-dark-border flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="text-xs font-medium text-white flex items-center space-x-1.5">
                <PackageCheck className="w-4 h-4 text-leaf-400" />
                <span>Offline Paper Archive</span>
              </div>
              <p className="text-[11px] text-dark-muted font-mono">
                Compressed .gitleaf bundle with all files & checkpoints
              </p>
            </div>
            <button
              onClick={handleDownloadBundle}
              className="px-3 py-1.5 rounded-lg bg-dark-surface hover:bg-dark-hover text-leaf-400 border border-dark-border text-xs font-mono font-medium flex items-center space-x-1.5 shrink-0 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>.gitleaf</span>
            </button>
          </div>
        </div>
      </div>

      {/* GitHub 1-Time Setup Modal */}
      <GitHubConnectModal
        isOpen={showConnectModal}
        onClose={() => setShowConnectModal(false)}
        onSuccess={() => {
          fetchGitHubUser();
          fetchGitStatus();
        }}
      />
    </div>
  );
};

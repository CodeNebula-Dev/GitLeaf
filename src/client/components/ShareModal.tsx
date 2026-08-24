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
  GitBranch,
  ArrowUpRight,
  ArrowDownLeft,
  Loader2,
  Github,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { ProjectMetadata } from '../../shared/types.js';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: ProjectMetadata | null;
}

export const ShareModal: React.FC<ShareModalProps> = ({ isOpen, onClose, project }) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [shortCode, setShortCode] = useState<string>('');
  const [loading, setLoading] = useState(false);

  // GitHub Remote State
  const [remoteUrlInput, setRemoteUrlInput] = useState('');
  const [linkingRemote, setLinkingRemote] = useState(false);
  const [gitStatusMsg, setGitStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [syncingGit, setSyncingGit] = useState<'push' | 'pull' | null>(null);
  const [currentGitRemote, setCurrentGitRemote] = useState<string | undefined>(project?.gitRemote);

  useEffect(() => {
    if (isOpen && project) {
      setCurrentGitRemote(project.gitRemote);
      if (!shortCode) {
        generateInvite();
      }
      fetchGitStatus();
    }
  }, [isOpen, project]);

  if (!isOpen || !project) return null;

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

  const handleLinkRemote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!remoteUrlInput.trim()) return;

    setLinkingRemote(true);
    setGitStatusMsg(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/git/link-remote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remoteUrl: remoteUrlInput.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCurrentGitRemote(remoteUrlInput.trim());
        setGitStatusMsg({ type: 'success', text: 'Linked & pushed to GitHub!' });
        setRemoteUrlInput('');
        // Regenerate invite so the PIN includes the gitRemote
        generateInvite();
      } else {
        setGitStatusMsg({ type: 'error', text: data.error || 'Failed to link remote.' });
      }
    } catch (err: any) {
      setGitStatusMsg({ type: 'error', text: err.message || 'Connection error.' });
    } finally {
      setLinkingRemote(false);
    }
  };

  const handleGitPush = async () => {
    setSyncingGit('push');
    setGitStatusMsg(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/git/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'GitLeaf manual push' }),
      });
      const data = await res.json();
      if (data.success) {
        setGitStatusMsg({ type: 'success', text: 'Pushed latest changes to GitHub!' });
      } else {
        setGitStatusMsg({ type: 'error', text: data.message || 'Push failed.' });
      }
    } catch (err: any) {
      setGitStatusMsg({ type: 'error', text: err.message || 'Push error.' });
    } finally {
      setSyncingGit(null);
    }
  };

  const handleGitPull = async () => {
    setSyncingGit('pull');
    setGitStatusMsg(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/git/pull`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        setGitStatusMsg({ type: 'success', text: 'Pulled latest changes from GitHub!' });
      } else {
        setGitStatusMsg({ type: 'error', text: data.message || 'Pull failed.' });
      }
    } catch (err: any) {
      setGitStatusMsg({ type: 'error', text: err.message || 'Pull error.' });
    } finally {
      setSyncingGit(null);
    }
  };

  const codeToShow = shortCode || `gl-${project.id.slice(0, 6)}`;
  const inviteUrl = `${window.location.origin}?join=${codeToShow}`;

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
                Direct Sync
              </span>
            </div>

            <div className="flex items-center justify-between bg-dark-bg/90 border border-dark-border rounded-lg px-4 py-3">
              {loading ? (
                <div className="flex items-center space-x-2 text-dark-muted text-xs font-mono">
                  <Loader2 className="w-4 h-4 animate-spin text-leaf-400" />
                  <span>Generating pairing code...</span>
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

          {/* Method 2: GitHub Remote (Offline Cross-Machine Sync) */}
          <div className="glass-panel p-4 rounded-xl border border-dark-border bg-dark-bg/60 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-semibold uppercase text-white flex items-center space-x-1.5">
                <Github className="w-3.5 h-3.5 text-leaf-400" />
                <span>GitHub Remote Sync</span>
              </span>
              {currentGitRemote ? (
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 flex items-center space-x-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Linked</span>
                </span>
              ) : (
                <span className="text-[10px] font-mono text-dark-muted bg-dark-surface px-2 py-0.5 rounded border border-dark-border">
                  Local-only
                </span>
              )}
            </div>

            {currentGitRemote ? (
              <div className="space-y-2.5">
                <div className="p-2.5 bg-dark-bg rounded-lg border border-dark-border text-xs font-mono text-dark-muted truncate">
                  <span className="text-dark-text">{currentGitRemote}</span>
                </div>
                <div className="flex items-center space-x-2">
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
                    <span>Push to GitHub</span>
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
                    <span>Pull from GitHub</span>
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleLinkRemote} className="space-y-2">
                <p className="text-[11px] text-dark-muted">
                  Link a private GitHub/GitLab repo to enable automatic cross-laptop sync when users are offline at different times:
                </p>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    placeholder="https://github.com/user/paper.git"
                    value={remoteUrlInput}
                    onChange={(e) => setRemoteUrlInput(e.target.value)}
                    className="flex-1 bg-dark-bg border border-dark-border rounded-lg px-2.5 py-1.5 text-xs text-white font-mono placeholder:text-dark-muted focus:outline-none focus:border-leaf-500/50"
                  />
                  <button
                    type="submit"
                    disabled={linkingRemote || !remoteUrlInput.trim()}
                    className="px-3 py-1.5 rounded-lg bg-leaf-500 hover:bg-leaf-600 active:bg-leaf-700 text-white text-xs font-mono font-medium shrink-0 disabled:opacity-50 transition-all flex items-center space-x-1"
                  >
                    {linkingRemote ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>Link</span>}
                  </button>
                </div>
              </form>
            )}

            {gitStatusMsg && (
              <div
                className={`text-[11px] font-mono flex items-center space-x-1.5 p-2 rounded-lg ${
                  gitStatusMsg.type === 'success'
                    ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                    : 'bg-red-500/10 text-red-300 border border-red-500/20'
                }`}
              >
                {gitStatusMsg.type === 'success' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>{gitStatusMsg.text}</span>
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
    </div>
  );
};

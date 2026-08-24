import React, { useState, useEffect } from 'react';
import { X, Github, Lock, ArrowUpRight, CheckCircle2, AlertCircle, Loader2, LogOut } from 'lucide-react';

interface GitHubConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface GitHubUser {
  login: string;
  name: string;
  avatar_url: string;
  email?: string;
}

export const GitHubConnectModal: React.FC<GitHubConnectModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [tokenInput, setTokenInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<GitHubUser | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchCurrentUser();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const fetchCurrentUser = async () => {
    try {
      const res = await fetch('/api/github/user');
      if (res.ok) {
        const data = await res.json();
        setCurrentUser(data.user);
      }
    } catch {}
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) return;

    setLoading(true);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/github/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenInput.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCurrentUser(data.user);
        setTokenInput('');
        setStatusMsg({ type: 'success', text: `Successfully connected as @${data.user.login}!` });
        if (onSuccess) onSuccess();
        setTimeout(() => onClose(), 1200);
      } else {
        setStatusMsg({ type: 'error', text: data.error || 'Invalid token. Ensure "repo" scope is checked.' });
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Connection error.' });
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    try {
      await fetch('/api/github/disconnect', { method: 'POST' });
      setCurrentUser(null);
      setStatusMsg({ type: 'success', text: 'GitHub account disconnected.' });
      if (onSuccess) onSuccess();
    } catch {}
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-md glass-dropdown rounded-2xl border border-dark-border overflow-hidden shadow-2xl p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-dark-bg border border-dark-border flex items-center justify-center text-white">
              <Github className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-sm">GitHub Account Connection</h3>
              <p className="text-[11px] text-dark-muted font-mono">1-Time Setup for Cloud Sync</p>
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
        {currentUser ? (
          /* Already Connected State */
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-dark-bg/80 border border-emerald-500/30 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <img
                  src={currentUser.avatar_url}
                  alt={currentUser.login}
                  className="w-10 h-10 rounded-full border border-dark-border"
                />
                <div>
                  <div className="font-medium text-white text-sm">@{currentUser.login}</div>
                  <div className="text-xs text-dark-muted font-mono">{currentUser.name}</div>
                </div>
              </div>
              <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20 flex items-center space-x-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Connected</span>
              </span>
            </div>

            <p className="text-xs text-dark-muted leading-relaxed">
              GitLeaf is linked to your GitHub account. All your LaTeX papers can now be auto-synced to private repositories with 1 click.
            </p>

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={handleDisconnect}
                disabled={loading}
                className="px-3.5 py-1.5 rounded-lg bg-dark-hover hover:bg-red-500/20 text-dark-muted hover:text-red-300 text-xs font-mono border border-dark-border transition-colors flex items-center space-x-1.5"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Disconnect</span>
              </button>
              <button
                onClick={onClose}
                className="px-4 py-1.5 rounded-lg bg-leaf-500 hover:bg-leaf-600 text-white text-xs font-mono font-medium shadow-md shadow-leaf-500/20 transition-all"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          /* Connect Form */
          <form onSubmit={handleConnect} className="space-y-4">
            <div className="p-3.5 rounded-xl bg-leaf-500/5 border border-leaf-500/20 text-xs text-dark-text space-y-2">
              <div className="font-medium text-white flex items-center space-x-1.5">
                <Lock className="w-3.5 h-3.5 text-leaf-400" />
                <span>Why connect GitHub?</span>
              </div>
              <p className="text-[11px] text-dark-muted leading-relaxed">
                Allows GitLeaf to automatically create private repositories for your papers & sync files between your laptops with zero manual configuration.
              </p>
              <div className="pt-1">
                <a
                  href="https://github.com/settings/tokens/new?scopes=repo&description=GitLeaf+LaTeX+Platform"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-leaf-400 hover:underline flex items-center space-x-1 font-mono font-medium"
                >
                  <span>1. Generate GitHub Personal Access Token (10s)</span>
                  <ArrowUpRight className="w-3 h-3" />
                </a>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-mono text-dark-muted uppercase font-semibold">
                Paste GitHub Token
              </label>
              <input
                type="password"
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                autoFocus
                className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-xs text-white font-mono placeholder:text-dark-muted focus:outline-none focus:border-leaf-500"
              />
            </div>

            {statusMsg && (
              <div
                className={`text-[11px] font-mono flex items-center space-x-1.5 p-2.5 rounded-lg ${
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

            <button
              type="submit"
              disabled={loading || !tokenInput.trim()}
              className="w-full py-2 rounded-lg bg-leaf-500 hover:bg-leaf-600 active:bg-leaf-700 text-white font-medium text-xs font-mono shadow-lg shadow-leaf-500/20 transition-all disabled:opacity-50 flex items-center justify-center space-x-1.5"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Connect GitHub Account</span>}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

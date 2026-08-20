import React, { useState, useEffect } from 'react';
import { X, Copy, Check, Users, Shield, Link, Key, Download, PackageCheck, Sparkles } from 'lucide-react';
import { ProjectMetadata } from '../../shared/types.js';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: ProjectMetadata | null;
}

export const ShareModal: React.FC<ShareModalProps> = ({ isOpen, onClose, project }) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteToken, setInviteToken] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && project && !inviteToken) {
      generateInvite();
    }
  }, [isOpen, project]);

  if (!isOpen || !project) return null;

  const generateInvite = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'editor', email: inviteEmail }),
      });
      if (res.ok) {
        const data = await res.json();
        setInviteToken(data.token);
      }
    } catch (err) {
      console.error('Error generating invite:', err);
    } finally {
      setLoading(false);
    }
  };

  const codeToShow = inviteToken || `gl-${project.id.slice(0, 6)}`;
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
      <div className="w-full max-w-lg glass-dropdown rounded-2xl border border-dark-border overflow-hidden animate-in fade-in zoom-in duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-dark-border flex items-center justify-between">
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
        <div className="p-6 space-y-5">
          {/* Method 1: Compact 6-Character Pairing Code */}
          <div className="glass-panel p-4 rounded-xl border border-leaf-500/30 bg-leaf-500/5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-semibold uppercase text-leaf-400 flex items-center space-x-1.5">
                <Key className="w-3.5 h-3.5" />
                <span>Pairing Code (Ultra Compact)</span>
              </span>
              <span className="text-[10px] font-mono text-dark-muted">Instant LAN Sync</span>
            </div>

            <div className="flex items-center justify-between bg-dark-bg/90 border border-dark-border rounded-lg px-3.5 py-2.5">
              <span className="font-mono text-base font-bold text-leaf-300 tracking-wider">
                {codeToShow}
              </span>
              <button
                onClick={handleCopyCode}
                className="px-3 py-1.5 rounded-md bg-leaf-500/20 hover:bg-leaf-500/30 text-leaf-300 text-xs font-mono font-medium border border-leaf-500/40 flex items-center space-x-1.5 transition-all"
              >
                {copiedCode ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-leaf-400" />
                    <span>Copied Code</span>
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
              Your co-author can simply paste this short code on their GitLeaf dashboard to immediately join and sync all files.
            </p>
          </div>

          {/* Method 2: Share Link */}
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-dark-muted uppercase flex items-center space-x-1">
              <Link className="w-3.5 h-3.5 text-leaf-400" />
              <span>1-Click Live Collaboration Link</span>
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
                className="px-3 py-1.5 rounded-md bg-dark-hover hover:bg-dark-border text-xs font-medium text-white flex items-center space-x-1 transition-colors shrink-0"
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

          {/* Method 3: Offline GitLeaf Bundle Export */}
          <div className="p-3.5 rounded-xl bg-dark-bg/60 border border-dark-border flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="text-xs font-medium text-white flex items-center space-x-1.5">
                <PackageCheck className="w-4 h-4 text-leaf-400" />
                <span>Export Portable GitLeaf Bundle</span>
              </div>
              <p className="text-[11px] text-dark-muted font-mono">
                Downloads full compressed paper (.gitleaf) with all files & Git history
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

          {/* Collaborators List */}
          <div className="space-y-2 pt-3 border-t border-dark-border">
            <span className="text-xs font-mono text-dark-muted uppercase">Active Co-Authors ({project.collaborators.length})</span>
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {project.collaborators.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-dark-bg/40 border border-dark-border text-xs"
                >
                  <div className="flex items-center space-x-2">
                    <div
                      style={{ backgroundColor: c.color }}
                      className="w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] text-white"
                    >
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-white font-medium">{c.name}</span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-leaf-500/10 text-leaf-400 border border-leaf-500/20 uppercase">
                    {c.role}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

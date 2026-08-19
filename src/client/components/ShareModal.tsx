import React, { useState } from 'react';
import { X, Copy, Check, Mail, Users, Shield, Link, Key } from 'lucide-react';
import { ProjectMetadata } from '../../shared/types.js';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: ProjectMetadata | null;
}

export const ShareModal: React.FC<ShareModalProps> = ({ isOpen, onClose, project }) => {
  const [copied, setCopied] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteToken, setInviteToken] = useState<string>('');
  const [loading, setLoading] = useState(false);

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

  const inviteUrl = inviteToken
    ? `${window.location.origin}?invite=${inviteToken}`
    : `${window.location.origin}?join=${project.id}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md glass-dropdown rounded-xl border border-dark-border overflow-hidden animate-in fade-in zoom-in duration-150">
        {/* Header */}
        <div className="px-5 py-4 border-b border-dark-border flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Users className="w-5 h-5 text-leaf-400" />
            <h3 className="font-semibold text-white text-base">Share & Collaborate</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-dark-hover text-dark-muted hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          <div className="bg-leaf-500/10 border border-leaf-500/30 rounded-lg p-3 flex items-start space-x-2.5 text-xs text-leaf-300">
            <Shield className="w-4 h-4 text-leaf-400 shrink-0 mt-0.5" />
            <p leading-relaxed>
              <strong>100% Free & Unlimited Co-Authors:</strong> Both laptops sync project folders in real-time with full version history and zero cloud paywalls.
            </p>
          </div>

          {/* Email Invite Box */}
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-dark-muted uppercase">Invite via Email / Peer Token</label>
            <div className="flex space-x-2">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="coauthor@university.edu"
                className="flex-1 bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-xs text-white placeholder-dark-muted focus:outline-none focus:border-leaf-500 font-mono"
              />
              <button
                onClick={generateInvite}
                disabled={loading}
                className="px-3 py-2 rounded-lg bg-leaf-500 hover:bg-leaf-600 active:bg-leaf-700 text-white font-medium text-xs flex items-center space-x-1 transition-colors"
              >
                <Key className="w-3.5 h-3.5" />
                <span>Pair</span>
              </button>
            </div>
          </div>

          {/* Share Link */}
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-dark-muted uppercase">Live Collaboration Link</label>
            <div className="flex items-center space-x-2 bg-dark-bg border border-dark-border rounded-lg p-1.5">
              <Link className="w-4 h-4 text-dark-muted ml-1.5 shrink-0" />
              <input
                type="text"
                readOnly
                value={inviteUrl}
                className="flex-1 bg-transparent text-xs text-dark-text font-mono truncate focus:outline-none"
              />
              <button
                onClick={handleCopy}
                className="px-3 py-1.5 rounded-md bg-dark-hover hover:bg-dark-border text-xs font-medium text-white flex items-center space-x-1 transition-colors shrink-0"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-leaf-400" />
                    <span className="text-leaf-400">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Collaborators List */}
          <div className="space-y-2 pt-2 border-t border-dark-border">
            <span className="text-xs font-mono text-dark-muted uppercase">Active Co-Authors</span>
            <div className="space-y-1.5">
              {project.collaborators.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-dark-bg/60 border border-dark-border text-xs"
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

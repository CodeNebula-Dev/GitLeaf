import React, { useState } from 'react';
import { User, Mail, Sparkles, Laptop, ShieldCheck } from 'lucide-react';
import { UserProfile } from '../hooks/useUser.js';

interface OnboardingModalProps {
  isOpen: boolean;
  onSave: (name: string, email: string) => void;
  currentUser?: UserProfile | null;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  onSave,
  currentUser,
}) => {
  const [name, setName] = useState(currentUser?.name || '');
  const [email, setEmail] = useState(currentUser?.email || '');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter your author name');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid academic/personal email');
      return;
    }
    onSave(name.trim(), email.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md glass-dropdown rounded-2xl border border-dark-border overflow-hidden shadow-2xl p-6">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-leaf-500 to-leaf-700 mx-auto flex items-center justify-center font-mono font-bold text-white text-lg shadow-lg shadow-leaf-500/30 mb-3">
            GL
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">Welcome to GitLeaf</h2>
          <p className="text-xs text-dark-muted mt-1 leading-relaxed">
            The free, local-first collaborative LaTeX workspace for researchers and students.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300 font-mono">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-mono text-dark-muted uppercase font-semibold">Your Full Name</label>
            <div className="flex items-center space-x-2 bg-dark-bg border border-dark-border rounded-lg px-3 py-2.5 focus-within:border-leaf-500">
              <User className="w-4 h-4 text-dark-muted shrink-0" />
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError('');
                }}
                placeholder="e.g. Marie Curie"
                autoFocus
                className="w-full bg-transparent text-sm text-white placeholder-dark-muted focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-mono text-dark-muted uppercase font-semibold">Email Address</label>
            <div className="flex items-center space-x-2 bg-dark-bg border border-dark-border rounded-lg px-3 py-2.5 focus-within:border-leaf-500">
              <Mail className="w-4 h-4 text-dark-muted shrink-0" />
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError('');
                }}
                placeholder="curie@university.edu"
                className="w-full bg-transparent text-sm text-white placeholder-dark-muted focus:outline-none font-mono"
              />
            </div>
          </div>

          <div className="bg-leaf-500/10 border border-leaf-500/20 rounded-lg p-3 text-[11px] text-leaf-300 flex items-start space-x-2">
            <ShieldCheck className="w-4 h-4 text-leaf-400 shrink-0 mt-0.5" />
            <p>
              Your profile is stored locally on your device and used to identify your live cursors and commits to co-authors.
            </p>
          </div>

          <button
            type="submit"
            className="w-full py-2.5 rounded-lg bg-leaf-500 hover:bg-leaf-600 active:bg-leaf-700 text-white font-medium text-sm shadow-lg shadow-leaf-500/20 transition-all font-mono"
          >
            Enter GitLeaf Workspace
          </button>
        </form>
      </div>
    </div>
  );
};

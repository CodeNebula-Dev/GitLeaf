import React, { useState, useEffect } from 'react';
import { X, GitCommit, Clock, ArrowLeft, Check, Plus, FileText } from 'lucide-react';
import { ProjectMetadata, GitSnapshot } from '../../shared/types.js';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: ProjectMetadata | null;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({ isOpen, onClose, project }) => {
  const [snapshots, setSnapshots] = useState<GitSnapshot[]>([]);
  const [selectedSnapshot, setSelectedSnapshot] = useState<any | null>(null);
  const [commitMessage, setCommitMessage] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchHistory = async () => {
    if (!project) return;
    try {
      const res = await fetch(`/api/projects/${project.id}/history`);
      if (res.ok) {
        const data = await res.json();
        setSnapshots(data);
      }
    } catch (err) {
      console.error('Error fetching history:', err);
    }
  };

  useEffect(() => {
    if (isOpen && project) {
      fetchHistory();
    }
  }, [isOpen, project]);

  const handleCreateCheckpoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commitMessage.trim() || !project) return;
    setCreating(true);
    try {
      await fetch(`/api/projects/${project.id}/history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: commitMessage.trim(), author: 'You' }),
      });
      setCommitMessage('');
      await fetchHistory();
    } catch (err) {
      console.error('Error creating checkpoint:', err);
    } finally {
      setCreating(false);
    }
  };

  const loadSnapshotDetail = async (id: string) => {
    if (!project) return;
    try {
      const res = await fetch(`/api/projects/${project.id}/history/${id}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedSnapshot(data);
      }
    } catch (err) {
      console.error('Error loading snapshot:', err);
    }
  };

  if (!isOpen || !project) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl glass-dropdown rounded-xl border border-dark-border overflow-hidden h-[540px] flex flex-col animate-in fade-in zoom-in duration-150">
        {/* Header */}
        <div className="px-5 py-4 border-b border-dark-border flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <GitCommit className="w-5 h-5 text-git" />
            <h3 className="font-semibold text-white text-base">Git Version History & Checkpoints</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-dark-hover text-dark-muted hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 flex overflow-hidden">
          {/* Timeline List */}
          <div className="w-1/2 border-r border-dark-border flex flex-col bg-dark-surface/50">
            {/* Create Checkpoint Form */}
            <form onSubmit={handleCreateCheckpoint} className="p-3 border-b border-dark-border bg-dark-bg/60">
              <div className="flex space-x-1.5">
                <input
                  type="text"
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  placeholder="Create manual checkpoint..."
                  className="flex-1 bg-dark-surface border border-dark-border rounded px-2.5 py-1.5 text-xs text-white placeholder-dark-muted font-mono focus:outline-none focus:border-leaf-500"
                />
                <button
                  type="submit"
                  disabled={creating || !commitMessage.trim()}
                  className="px-3 py-1.5 rounded bg-leaf-500 hover:bg-leaf-600 active:bg-leaf-700 text-white font-medium text-xs flex items-center space-x-1 disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Save</span>
                </button>
              </div>
            </form>

            {/* Snapshots Scroll */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {snapshots.length === 0 ? (
                <div className="text-center text-xs text-dark-muted py-8 font-mono">
                  No snapshots recorded yet. Checkpoints are automatically saved on every compilation.
                </div>
              ) : (
                snapshots.map((snap) => (
                  <div
                    key={snap.id}
                    onClick={() => loadSnapshotDetail(snap.id)}
                    className={`p-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                      selectedSnapshot?.id === snap.id
                        ? 'bg-leaf-500/15 border-leaf-500/40 text-leaf-300'
                        : 'bg-dark-bg/50 border-dark-border hover:bg-dark-hover text-dark-text'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono font-semibold text-[11px] px-1.5 py-0.2 rounded bg-dark-surface text-leaf-400 border border-dark-border">
                        #{snap.id}
                      </span>
                      <span className="text-[10px] text-dark-muted font-mono">
                        {new Date(snap.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="font-medium text-white line-clamp-1">{snap.message}</p>
                    <div className="flex items-center space-x-2 mt-1 text-[11px] text-dark-muted font-mono">
                      <span>{snap.author}</span>
                      <span>•</span>
                      <span>{snap.files?.length || 0} files</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Snapshot Inspector */}
          <div className="w-1/2 p-4 flex flex-col bg-dark-bg overflow-y-auto">
            {selectedSnapshot ? (
              <div className="space-y-3 font-mono text-xs">
                <div className="border-b border-dark-border pb-2">
                  <span className="text-leaf-400 font-bold text-sm">Checkpoint #{selectedSnapshot.id}</span>
                  <p className="text-white text-xs mt-0.5">{selectedSnapshot.message}</p>
                  <span className="text-[11px] text-dark-muted">
                    Saved on {new Date(selectedSnapshot.timestamp).toLocaleString()}
                  </span>
                </div>

                <div>
                  <span className="text-dark-muted uppercase text-[10px] font-bold">Snapshot Files:</span>
                  <div className="mt-1.5 space-y-1">
                    {selectedSnapshot.files?.map((f: any) => (
                      <div key={f.path} className="p-2 rounded bg-dark-surface border border-dark-border flex items-center justify-between text-xs">
                        <div className="flex items-center space-x-2">
                          <FileText className="w-3.5 h-3.5 text-leaf-400" />
                          <span className="text-white">{f.path}</span>
                        </div>
                        <span className="text-[10px] text-dark-muted">{f.size} bytes</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center text-dark-muted font-mono text-xs p-4">
                <Clock className="w-8 h-8 text-dark-border mb-2" />
                Select a checkpoint on the left to inspect file snapshots and revision history.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

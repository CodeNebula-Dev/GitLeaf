import React, { useState } from 'react';
import { AlertCircle, AlertTriangle, Info, Terminal, ChevronUp, ChevronDown, CheckCircle2 } from 'lucide-react';
import { CompilationResult } from '../../shared/types.js';

interface DiagnosticsDrawerProps {
  compilationResult: CompilationResult | null;
  onJumpToLine: (file: string, line: number) => void;
}

export const DiagnosticsDrawer: React.FC<DiagnosticsDrawerProps> = ({
  compilationResult,
  onJumpToLine,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'diagnostics' | 'rawLog'>('diagnostics');

  const diagnostics = compilationResult?.diagnostics || [];
  const errors = diagnostics.filter((d) => d.type === 'error');
  const warnings = diagnostics.filter((d) => d.type === 'warning');

  const hasIssues = errors.length > 0 || warnings.length > 0;

  return (
    <div className="border-t border-dark-border bg-dark-surface select-none z-20">
      {/* Drawer Bar */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="h-8 px-4 flex items-center justify-between cursor-pointer hover:bg-dark-hover transition-colors"
      >
        <div className="flex items-center space-x-3 text-xs font-mono">
          <div className="flex items-center space-x-1.5">
            {compilationResult?.success ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-leaf-400" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5 text-git" />
            )}
            <span className={compilationResult?.success ? 'text-leaf-400' : 'text-git'}>
              {compilationResult?.success ? 'Compilation Succeeded' : 'Compilation Issues'}
            </span>
          </div>

          {compilationResult && (
            <span className="text-[11px] text-dark-muted">
              ({compilationResult.durationMs}ms)
            </span>
          )}

          {errors.length > 0 && (
            <span className="px-1.5 py-0.2 rounded bg-red-500/20 text-red-400 text-[11px]">
              {errors.length} {errors.length === 1 ? 'Error' : 'Errors'}
            </span>
          )}

          {warnings.length > 0 && (
            <span className="px-1.5 py-0.2 rounded bg-yellow-500/20 text-yellow-400 text-[11px]">
              {warnings.length} {warnings.length === 1 ? 'Warning' : 'Warnings'}
            </span>
          )}
        </div>

        <div className="flex items-center space-x-2 text-dark-muted">
          <span className="text-[11px] font-mono">{isOpen ? 'Hide Logs' : 'View Logs'}</span>
          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </div>
      </div>

      {/* Drawer Body */}
      {isOpen && (
        <div className="h-48 border-t border-dark-border flex flex-col bg-dark-bg">
          {/* Sub-tabs */}
          <div className="h-7 bg-dark-surface border-b border-dark-border px-3 flex items-center space-x-2">
            <button
              onClick={() => setActiveTab('diagnostics')}
              className={`px-2.5 py-0.5 text-xs font-mono rounded ${
                activeTab === 'diagnostics' ? 'bg-dark-hover text-leaf-400 font-medium' : 'text-dark-muted hover:text-white'
              }`}
            >
              Diagnostics ({diagnostics.length})
            </button>
            <button
              onClick={() => setActiveTab('rawLog')}
              className={`px-2.5 py-0.5 text-xs font-mono rounded ${
                activeTab === 'rawLog' ? 'bg-dark-hover text-leaf-400 font-medium' : 'text-dark-muted hover:text-white'
              }`}
            >
              Raw TeX Log
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-2 font-mono text-xs">
            {activeTab === 'diagnostics' ? (
              <div className="space-y-1">
                {diagnostics.length === 0 ? (
                  <div className="text-dark-muted text-center py-4">No compiler errors or warnings found.</div>
                ) : (
                  diagnostics.map((diag, idx) => (
                    <div
                      key={idx}
                      onClick={() => onJumpToLine(diag.file, diag.line)}
                      className={`p-2 rounded cursor-pointer flex items-start space-x-2 border transition-colors ${
                        diag.type === 'error'
                          ? 'bg-red-500/10 border-red-500/30 hover:bg-red-500/15 text-red-300'
                          : diag.type === 'warning'
                          ? 'bg-yellow-500/10 border-yellow-500/30 hover:bg-yellow-500/15 text-yellow-300'
                          : 'bg-leaf-500/10 border-leaf-500/30 text-leaf-300'
                      }`}
                    >
                      {diag.type === 'error' ? (
                        <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      ) : diag.type === 'warning' ? (
                        <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
                      ) : (
                        <Info className="w-4 h-4 text-leaf-400 shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-white">{diag.file}:{diag.line}</span>
                          <span className="text-[10px] uppercase opacity-75">{diag.type}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-dark-text">{diag.message}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <pre className="text-dark-muted whitespace-pre-wrap font-mono text-[11px] leading-relaxed select-text">
                {compilationResult?.log || 'No compilation log recorded yet.'}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

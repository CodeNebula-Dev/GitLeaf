import React, { useState, useEffect } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, Download, ExternalLink, FileQuestion, Loader2, RefreshCw, AlertCircle } from 'lucide-react';
import { CompilationResult } from '../../shared/types.js';

interface PDFViewerProps {
  compilationResult: CompilationResult | null;
  isCompiling: boolean;
  projectName: string;
}

export const PDFViewer: React.FC<PDFViewerProps> = ({
  compilationResult,
  isCompiling,
  projectName,
}) => {
  const [zoom, setZoom] = useState<number>(100);
  const [refreshKey, setRefreshKey] = useState<number>(Date.now());

  useEffect(() => {
    if (compilationResult?.timestamp) {
      setRefreshKey(compilationResult.timestamp);
    }
  }, [compilationResult?.timestamp]);

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 15, 200));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 15, 50));
  const handleResetZoom = () => setZoom(100);
  const handleManualRefresh = () => setRefreshKey(Date.now());

  const pdfUrl = compilationResult?.pdfUrl;
  const fullPdfUrl = pdfUrl ? `${pdfUrl}&refresh=${refreshKey}` : null;
  const hasErrors = compilationResult && !compilationResult.success;

  return (
    <div className="h-full w-full flex flex-col bg-[#1A1F2C] border-l border-dark-border select-none overflow-hidden">
      {/* PDF Toolbar */}
      <div className="h-9 bg-dark-surface border-b border-dark-border px-3 flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center space-x-2">
          <span className="text-xs font-mono font-medium text-dark-text">PDF Preview</span>
          {isCompiling && (
            <div className="flex items-center space-x-1 text-[11px] text-leaf-400 font-mono">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Compiling LaTeX...</span>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center space-x-1.5">
          <button
            onClick={handleZoomOut}
            className="p-1 rounded hover:bg-dark-hover text-dark-muted hover:text-white"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-xs font-mono text-dark-muted min-w-[40px] text-center">
            {zoom}%
          </span>
          <button
            onClick={handleZoomIn}
            className="p-1 rounded hover:bg-dark-hover text-dark-muted hover:text-white"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleResetZoom}
            className="p-1 rounded hover:bg-dark-hover text-dark-muted hover:text-white"
            title="Reset Zoom (100%)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleManualRefresh}
            className="p-1 rounded hover:bg-dark-hover text-dark-muted hover:text-white"
            title="Force Refresh Preview"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          <div className="h-4 w-[1px] bg-dark-border mx-1" />

          {pdfUrl && (
            <>
              <a
                href={pdfUrl}
                target="_blank"
                rel="noreferrer"
                className="p-1 rounded hover:bg-dark-hover text-dark-muted hover:text-leaf-400"
                title="Open PDF in new tab"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <a
                href={pdfUrl}
                download={`${projectName || 'document'}.pdf`}
                className="p-1 rounded hover:bg-dark-hover text-dark-muted hover:text-leaf-400"
                title="Download PDF"
              >
                <Download className="w-3.5 h-3.5" />
              </a>
            </>
          )}
        </div>
      </div>

      {/* PDF View Container */}
      <div className="flex-1 overflow-auto flex flex-col items-center justify-start p-3 bg-[#141824] relative">
        {hasErrors && (
          <div className="w-full max-w-lg mb-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300 font-mono flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">LaTeX Compilation Failed:</span>
              <p className="mt-0.5 text-[11px] text-red-200">
                {compilationResult?.diagnostics?.[0]?.message || 'Please check the bottom Diagnostics log for syntax errors.'}
              </p>
            </div>
          </div>
        )}

        {fullPdfUrl ? (
          <div
            key={fullPdfUrl}
            style={{
              width: `${Math.max(100, zoom)}%`,
              height: '100%',
              minHeight: '750px',
            }}
            className="transition-all duration-100 ease-out shadow-2xl rounded-lg bg-white overflow-hidden flex flex-col"
          >
            <iframe
              src={`${fullPdfUrl}#view=FitH&toolbar=0`}
              title="Compiled LaTeX Document Preview"
              className="w-full h-full min-h-[750px] border-0 flex-1 bg-white"
            />
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 max-w-sm text-dark-muted my-auto">
            <div className="w-12 h-12 rounded-full bg-dark-surface border border-dark-border flex items-center justify-center mb-3">
              <FileQuestion className="w-6 h-6 text-leaf-400" />
            </div>
            <p className="font-mono text-sm text-dark-text mb-1">PDF not yet compiled</p>
            <p className="text-xs text-dark-muted leading-relaxed">
              Click <span className="text-leaf-400 font-mono font-semibold">Recompile (⌘↵)</span> in the top navbar to compile your paper with Tectonic TeX.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

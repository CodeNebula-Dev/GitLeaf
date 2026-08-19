import React, { useState } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, Download, ExternalLink, FileQuestion, Loader2 } from 'lucide-react';
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

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 15, 200));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 15, 50));
  const handleResetZoom = () => setZoom(100);

  const pdfUrl = compilationResult?.pdfUrl;

  return (
    <div className="h-full w-full flex flex-col bg-[#1A1F2C] border-l border-dark-border select-none">
      {/* PDF Toolbar */}
      <div className="h-9 bg-dark-surface border-b border-dark-border px-3 flex items-center justify-between z-10">
        <div className="flex items-center space-x-2">
          <span className="text-xs font-mono font-medium text-dark-text">PDF Preview</span>
          {isCompiling && (
            <div className="flex items-center space-x-1 text-[11px] text-leaf-400 font-mono">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Rendering...</span>
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

          <div className="h-4 w-[1px] bg-dark-border mx-1" />

          {pdfUrl && (
            <a
              href={pdfUrl}
              download={`${projectName || 'document'}.pdf`}
              className="p-1 rounded hover:bg-dark-hover text-dark-muted hover:text-leaf-400"
              title="Download PDF"
            >
              <Download className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>

      {/* PDF View Container */}
      <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-[#141824]">
        {pdfUrl ? (
          <div
            style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}
            className="transition-transform duration-150 ease-out shadow-2xl rounded bg-white w-full h-full max-w-[800px] flex items-center justify-center min-h-[700px]"
          >
            <iframe
              src={`${pdfUrl}#toolbar=0&navpanes=0`}
              title="Compiled LaTeX Document"
              className="w-full h-full min-h-[700px] border-0 rounded"
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center p-8 max-w-sm text-dark-muted">
            <div className="w-12 h-12 rounded-full bg-dark-surface border border-dark-border flex items-center justify-center mb-3">
              <FileQuestion className="w-6 h-6 text-leaf-400" />
            </div>
            <p className="font-mono text-sm text-dark-text mb-1">PDF not yet compiled</p>
            <p className="text-xs text-dark-muted leading-relaxed">
              Click <span className="text-leaf-400 font-mono">Recompile (⌘↵)</span> to generate your high-fidelity paper preview.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

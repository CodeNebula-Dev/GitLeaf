import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar.js';
import { FileTree } from './components/FileTree.js';
import { MonacoEditor } from './components/MonacoEditor.js';
import { PDFViewer } from './components/PDFViewer.js';
import { DiagnosticsDrawer } from './components/DiagnosticsDrawer.js';
import { ShareModal } from './components/ShareModal.js';
import { HistoryModal } from './components/HistoryModal.js';
import { TemplatesModal } from './components/TemplatesModal.js';
import { OnboardingModal } from './components/OnboardingModal.js';
import { Dashboard } from './components/Dashboard.js';
import { useProject } from './hooks/useProject.js';
import { useUser } from './hooks/useUser.js';
import { Laptop, Cpu, Radio } from 'lucide-react';
import { ProjectMetadata } from '../shared/types.js';
import { PeerUser } from './components/MonacoEditor.js';

export const App: React.FC = () => {
  const { user, saveUser, isLoggedIn } = useUser();
  const [viewMode, setViewMode] = useState<'dashboard' | 'workspace'>('dashboard');
  const [activePeers, setActivePeers] = useState<PeerUser[]>([]);

  const {
    projects,
    currentProject,
    setCurrentProject,
    files,
    activeFilePath,
    setActiveFilePath,
    activeFileContent,
    handleContentChange,
    compilationResult,
    isCompiling,
    isSaving,
    cursorPosition,
    setCursorPosition,
    targetJumpLine,
    setTargetJumpLine,
    compile,
    formatCode,
    createFile,
    deleteFile,
    createProject,
    deleteProject,
    jumpToLine,
    refreshProjects,
  } = useProject();

  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [templatesModalOpen, setTemplatesModalOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);

  // Auto-join if user arrived via share link (?invite=... or ?join=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const inviteToken = params.get('invite') || params.get('join');
    if (inviteToken) {
      const joinFromUrl = async () => {
        try {
          const res = await fetch('/api/invite/join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token: inviteToken,
              collaboratorName: user?.name || 'Co-Author',
            }),
          });
          const data = await res.json();
          if (res.ok && data.project) {
            refreshProjects();
            setCurrentProject(data.project);
            setViewMode('workspace');
            window.history.replaceState({}, document.title, window.location.pathname);
          }
        } catch (err) {
          console.error('Failed to auto-join from URL:', err);
        }
      };
      joinFromUrl();
    }
  }, [user?.name, refreshProjects]);

  const handleOpenProjectFromDashboard = (proj: ProjectMetadata) => {
    setCurrentProject(proj);
    setViewMode('workspace');
  };

  const handleBackToDashboard = () => {
    refreshProjects();
    setViewMode('dashboard');
  };

  const handleDeleteProject = async (projectId: string) => {
    await deleteProject(projectId);
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-dark-bg text-dark-text overflow-hidden font-sans">
      {/* View 1: Overleaf-like Dashboard */}
      {viewMode === 'dashboard' ? (
        <Dashboard
          projects={projects}
          user={user}
          onOpenProject={handleOpenProjectFromDashboard}
          onNewProject={() => setTemplatesModalOpen(true)}
          onDeleteProject={handleDeleteProject}
          onOpenProfile={() => setProfileModalOpen(true)}
          onRefreshProjects={refreshProjects}
        />
      ) : (
        /* View 2: Full LaTeX IDE Workspace */
        <div className="h-full w-full flex flex-col overflow-hidden">
          {/* Top Navbar */}
          <Navbar
            currentProject={currentProject}
            projects={projects}
            user={user}
            activePeers={activePeers}
            onSelectProject={setCurrentProject}
            onBackToDashboard={handleBackToDashboard}
            onCompile={compile}
            onFormat={formatCode}
            isCompiling={isCompiling}
            isSaving={isSaving}
            onOpenShare={() => setShareModalOpen(true)}
            onOpenHistory={() => setHistoryModalOpen(true)}
            onOpenTemplates={() => setTemplatesModalOpen(true)}
            onOpenProfile={() => setProfileModalOpen(true)}
          />

          {/* Main Split Workspace */}
          <div className="flex-1 flex overflow-hidden">
            {/* Left: Project File Tree */}
            <FileTree
              files={files}
              activeFilePath={activeFilePath}
              onSelectFile={setActiveFilePath}
              onCreateFile={createFile}
              onDeleteFile={deleteFile}
            />

            {/* Center: Monaco LaTeX Editor with Live CRDT sync */}
            <div className="flex-1 flex flex-col h-full min-w-[320px] overflow-hidden border-r border-dark-border">
              <MonacoEditor
                projectId={currentProject?.id}
                projectName={currentProject?.name}
                gitRemote={currentProject?.gitRemote}
                remoteHost={currentProject?.remoteHost}
                content={activeFileContent}
                onChange={handleContentChange}
                filePath={activeFilePath}
                user={user}
                onCompile={compile}
                onCursorChange={setCursorPosition}
                targetJumpLine={targetJumpLine}
                onJumpComplete={() => setTargetJumpLine(null)}
                diagnostics={compilationResult?.diagnostics || []}
                onActivePeersChange={setActivePeers}
              />
            </div>

            {/* Right: Live PDF Preview */}
            <div className="flex-1 flex flex-col h-full min-w-[360px] overflow-hidden">
              <PDFViewer
                compilationResult={compilationResult}
                isCompiling={isCompiling}
                projectName={currentProject?.name || 'document'}
              />
            </div>
          </div>

          {/* Bottom Diagnostics & Log Drawer */}
          <DiagnosticsDrawer
            compilationResult={compilationResult}
            onJumpToLine={jumpToLine}
          />

          {/* Bottom System Status Bar */}
          <footer className="h-6 bg-dark-surface border-t border-dark-border px-3 flex items-center justify-between text-[11px] font-mono text-dark-muted select-none">
            <div className="flex items-center space-x-4">
              {currentProject?.gitRemote ? (
                <div className="flex items-center space-x-1.5 text-leaf-400">
                  <span className="w-2 h-2 rounded-full bg-leaf-400 animate-pulse" />
                  <span className="font-medium">GitHub Cloud Sync Active (Auto Push / Pull)</span>
                </div>
              ) : (
                <div className="flex items-center space-x-1 text-leaf-400">
                  <Radio className="w-3 h-3 text-leaf-400 animate-pulse" />
                  <span>Local-First Workspace</span>
                </div>
              )}
              <div className="flex items-center space-x-1 text-dark-muted hidden sm:flex">
                <Laptop className="w-3 h-3 text-dark-muted" />
                <span className="truncate max-w-[200px]">{currentProject?.rootPath || 'Local Filesystem'}</span>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-1">
                <Cpu className="w-3 h-3 text-dark-muted" />
                <span>Engine: {currentProject?.engine || 'pdflatex'}</span>
              </div>
              <div>
                Ln {cursorPosition.line}, Col {cursorPosition.column}
              </div>
              <div className="text-leaf-400/80 font-semibold">GitLeaf v0.1.0</div>
            </div>
          </footer>
        </div>
      )}

      {/* Modals */}
      <OnboardingModal
        isOpen={!isLoggedIn || profileModalOpen}
        onSave={(name, email) => {
          saveUser(name, email);
          setProfileModalOpen(false);
        }}
        currentUser={user}
      />

      <ShareModal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        project={currentProject}
      />

      <HistoryModal
        isOpen={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        project={currentProject}
      />

      <TemplatesModal
        isOpen={templatesModalOpen}
        onClose={() => setTemplatesModalOpen(false)}
        onCreateProject={(name, template) => {
          createProject(name, template);
          setViewMode('workspace');
        }}
      />
    </div>
  );
};

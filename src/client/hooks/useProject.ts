import { useState, useEffect, useCallback, useRef } from 'react';
import { ProjectMetadata, ProjectFile, CompilationResult } from '../../shared/types.js';

export function useProject() {
  const [projects, setProjects] = useState<ProjectMetadata[]>([]);
  const [currentProject, setCurrentProject] = useState<ProjectMetadata | null>(null);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string>('main.tex');
  const [activeFileContent, setActiveFileContent] = useState<string>('');
  const [compilationResult, setCompilationResult] = useState<CompilationResult | null>(null);
  const [isCompiling, setIsCompiling] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isFileLoading, setIsFileLoading] = useState<boolean>(false);
  const [cursorPosition, setCursorPosition] = useState<{ line: number; column: number }>({ line: 1, column: 1 });
  const [targetJumpLine, setTargetJumpLine] = useState<number | null>(null);

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fileLoadedRef = useRef<boolean>(false);
  const currentPathRef = useRef<string>('main.tex');

  // 1. Fetch Projects
  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects');
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } catch (err) {
      console.error('Error fetching projects:', err);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // 2. Fetch Project Files when Current Project changes
  const fetchFiles = useCallback(async () => {
    if (!currentProject) return;
    try {
      const res = await fetch(`/api/projects/${currentProject.id}`);
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files);
        if (data.project) setCurrentProject(data.project);

        // If project already has a compiled PDF on disk, load it into preview immediately!
        if (data.hasPdf && data.pdfUrl) {
          setCompilationResult((prev) => {
            if (!prev || !prev.pdfUrl) {
              return {
                success: true,
                pdfUrl: data.pdfUrl,
                diagnostics: [],
                log: 'Loaded existing compiled PDF from disk.',
                durationMs: 0,
                timestamp: data.pdfMtime || Date.now(),
              };
            }
            return prev;
          });
        }

        // Ensure active file is valid
        if (!data.files.some((f: ProjectFile) => f.path === activeFilePath)) {
          const main = data.files.find((f: ProjectFile) => f.isMain || f.name === 'main.tex');
          if (main) {
            setActiveFilePath(main.path);
          }
        }
      }
    } catch (err) {
      console.error('Error fetching files:', err);
    }
  }, [currentProject, activeFilePath]);

  useEffect(() => {
    if (currentProject) {
      fetchFiles();
    }
  }, [currentProject, fetchFiles]);

  // 3. Fetch Active File Content Safely
  const fetchFileContent = useCallback(async (projectId: string, path: string) => {
    if (!projectId || !path) return;
    setIsFileLoading(true);
    fileLoadedRef.current = false;
    currentPathRef.current = path;

    try {
      const res = await fetch(`/api/projects/${projectId}/file-content?path=${encodeURIComponent(path)}`);
      if (res.ok) {
        const data = await res.json();
        // Only apply if we haven't switched to another file in the meantime
        if (currentPathRef.current === path) {
          setActiveFileContent(data.content || '');
          fileLoadedRef.current = true;
        }
      }
    } catch (err) {
      console.error('Error loading file content:', err);
    } finally {
      setIsFileLoading(false);
    }
  }, []);

  useEffect(() => {
    if (currentProject && activeFilePath) {
      fetchFileContent(currentProject.id, activeFilePath);
    }
  }, [currentProject?.id, activeFilePath, fetchFileContent]);

  // 4. Save Content (debounced / safe)
  const saveContent = useCallback(
    async (path: string, content: string) => {
      if (!currentProject || !fileLoadedRef.current || !path) return;
      setIsSaving(true);
      try {
        await fetch(`/api/projects/${currentProject.id}/file-content`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path, content }),
        });
        setIsSaving(false);
      } catch (err) {
        console.error('Error saving file:', err);
        setIsSaving(false);
      }
    },
    [currentProject]
  );

  const handleContentChange = useCallback(
    (newContent: string) => {
      if (!fileLoadedRef.current) return;
      setActiveFileContent(newContent);

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        saveContent(activeFilePath, newContent);
      }, 500);
    },
    [activeFilePath, saveContent]
  );

  // 5. Compile Project
  const compile = useCallback(async () => {
    if (!currentProject) return;
    setIsCompiling(true);

    // If file is loaded and has unsaved edits, save immediately before compiling
    if (fileLoadedRef.current && activeFilePath) {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      await saveContent(activeFilePath, activeFileContent);
    }

    try {
      const res = await fetch(`/api/projects/${currentProject.id}/compile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mainFile: currentProject.mainFile || 'main.tex',
          engine: currentProject.engine,
        }),
      });
      if (res.ok) {
        const data: CompilationResult = await res.json();
        setCompilationResult(data);
      }
    } catch (err) {
      console.error('Error compiling:', err);
    } finally {
      setIsCompiling(false);
    }
  }, [currentProject, activeFilePath, activeFileContent, saveContent]);

  // 6. Create File or Folder
  const createFile = async (relPath: string, type: 'file' | 'directory' = 'file') => {
    if (!currentProject) return;
    try {
      await fetch(`/api/projects/${currentProject.id}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: relPath, type }),
      });
      await fetchFiles();
      if (type === 'file') {
        setActiveFilePath(relPath);
      }
    } catch (err) {
      console.error('Error creating file:', err);
    }
  };

  // 7. Delete File
  const deleteFile = async (relPath: string) => {
    if (!currentProject) return;
    try {
      await fetch(`/api/projects/${currentProject.id}/files?path=${encodeURIComponent(relPath)}`, {
        method: 'DELETE',
      });
      await fetchFiles();
      if (activeFilePath === relPath) {
        setActiveFilePath('main.tex');
      }
    } catch (err) {
      console.error('Error deleting file:', err);
    }
  };

  // 8. Create New Project
  const createProject = async (name: string, template: string) => {
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, template }),
      });
      if (res.ok) {
        const newProj = await res.json();
        await fetchProjects();
        setCurrentProject(newProj);
        setActiveFilePath('main.tex');
        setCompilationResult(null);
      }
    } catch (err) {
      console.error('Error creating project:', err);
    }
  };

  // 9. Delete Project
  const deleteProject = async (projectId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await fetchProjects();
        if (currentProject?.id === projectId) {
          setCurrentProject(null);
          setFiles([]);
          setActiveFileContent('');
          setCompilationResult(null);
        }
      }
    } catch (err) {
      console.error('Error deleting project:', err);
    }
  };

  // 10. Format LaTeX Code Helper
  const formatCode = useCallback(() => {
    if (!activeFileContent) return;
    const lines = activeFileContent.split('\n');
    let indentLevel = 0;
    const formattedLines = lines.map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return '';

      // Decrease indent for \end{...} or \right or closing environments
      if (trimmed.startsWith('\\end{') || trimmed.startsWith('\\right') || trimmed.endsWith('}')) {
        indentLevel = Math.max(0, indentLevel - 1);
      }

      const indent = '\t'.repeat(indentLevel);
      const result = `${indent}${trimmed}`;

      // Increase indent for \begin{...} or \left or opening environments
      if (trimmed.startsWith('\\begin{') || trimmed.startsWith('\\left') || trimmed.endsWith('{')) {
        // Exclude inline single line begin/end
        if (!trimmed.includes('\\end{')) {
          indentLevel++;
        }
      }

      return result;
    });

    const newFormatted = formattedLines.join('\n');
    setActiveFileContent(newFormatted);
    saveContent(activeFilePath, newFormatted);
  }, [activeFileContent, activeFilePath, saveContent]);

  // 11. Jump to Diagnostic
  const jumpToLine = (file: string, line: number) => {
    if (file && file !== activeFilePath) {
      setActiveFilePath(file);
    }
    setTargetJumpLine(line);
  };

  return {
    projects,
    currentProject,
    setCurrentProject,
    files,
    activeFilePath,
    setActiveFilePath,
    activeFileContent,
    setActiveFileContent,
    handleContentChange,
    compilationResult,
    isCompiling,
    isSaving,
    isFileLoading,
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
    refreshFiles: fetchFiles,
    refreshProjects: fetchProjects,
  };
}

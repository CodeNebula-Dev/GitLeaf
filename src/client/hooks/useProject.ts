import { useState, useEffect, useCallback, useRef } from 'react';
import { ProjectMetadata, ProjectFile, CompilationResult } from '../../shared/types.js';

export function useProject() {
  const [projects, setProjects] = useState<ProjectMetadata[]>([]);
  const [currentProject, setCurrentProject] = useState<ProjectMetadata | null>(null);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [activeFilePath, setActiveFilePathRaw] = useState<string>('main.tex');
  const [activeFileContent, setActiveFileContent] = useState<string>('');
  const [compilationResult, setCompilationResult] = useState<CompilationResult | null>(null);
  const [isCompiling, setIsCompiling] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isPushing, setIsPushing] = useState<boolean>(false);
  const [isPulling, setIsPulling] = useState<boolean>(false);
  const [isFileLoading, setIsFileLoading] = useState<boolean>(false);
  const [cursorPosition, setCursorPosition] = useState<{ line: number; column: number }>({ line: 1, column: 1 });
  const [targetJumpLine, setTargetJumpLine] = useState<number | null>(null);

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fileLoadedRef = useRef<boolean>(false);
  const currentPathRef = useRef<string>('main.tex');
  const activeFileRef = useRef<string>('main.tex');
  activeFileRef.current = activeFilePath;

  // Wrapped setActiveFilePath: updates active path and clears stale content
  const setActiveFilePath = useCallback((newPath: string) => {
    currentPathRef.current = newPath;
    fileLoadedRef.current = false;
    setActiveFileContent(''); // Clear immediately so new editor doesn't show old text
    setActiveFilePathRaw(newPath);
  }, []);

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

        // Only auto-select main.tex if the currently active file doesn't exist in the file list
        const currentActive = activeFileRef.current;
        if (!data.files.some((f: ProjectFile) => f.path === currentActive)) {
          const main = data.files.find((f: ProjectFile) => f.isMain || f.name === 'main.tex');
          if (main) {
            setActiveFilePath(main.path);
          }
        }
      }
    } catch (err) {
      console.error('Error fetching files:', err);
    }
  }, [currentProject?.id]);

  useEffect(() => {
    if (currentProject) {
      fetchFiles();
    }
  }, [currentProject?.id, fetchFiles]);

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
    if (currentProject?.id && activeFilePath) {
      fetchFileContent(currentProject.id, activeFilePath);
    }
  }, [currentProject?.id, activeFilePath, fetchFileContent]);

  // 4. Save Content (debounced / safe)
  const saveContent = useCallback(
    async (path: string, content: string) => {
      if (!currentProject || !path) return;
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
    [currentProject?.id]
  );

  // 4. Periodic background Git sync check (every 4 seconds)
  useEffect(() => {
    if (!currentProject) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/projects/${currentProject.id}/git/sync-check`);
        if (res.ok) {
          const data = await res.json();
          if (data.updated) {
            fetchFiles();
            if (currentPathRef.current) {
              fetchFileContent(currentProject.id, currentPathRef.current);
            }
          }
        }
      } catch {}
    }, 4000);

    return () => clearInterval(interval);
  }, [currentProject?.id, fetchFiles, fetchFileContent]);

  const handleContentChange = useCallback(
    (newContent: string) => {
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

    const targetFile = currentProject.mainFile || 'main.tex';

    // Flush any pending save timeout
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    if (activeFilePath && activeFileContent) {
      saveContent(activeFilePath, activeFileContent);
    }

    try {
      const res = await fetch(`/api/projects/${currentProject.id}/compile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mainFile: targetFile,
          engine: currentProject.engine,
          content: activeFilePath === targetFile ? activeFileContent : undefined,
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
      const res = await fetch(`/api/projects/${currentProject.id}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: relPath, type }),
      });
      if (res.ok) {
        await fetchFiles();
        if (type === 'file') {
          setActiveFilePath(relPath);
          setActiveFileContent(''); // Blank initial content
        }
      }
    } catch (err) {
      console.error('Error creating file:', err);
    }
  };

  // 7. Delete File
  const deleteFile = async (relPath: string) => {
    if (!currentProject) return;
    try {
      const res = await fetch(`/api/projects/${currentProject.id}/files?path=${encodeURIComponent(relPath)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await fetchFiles();
        if (activeFilePath === relPath) {
          setActiveFilePath('main.tex');
        }
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

  // 10. Format LaTeX Code
  const formatCode = useCallback(() => {
    if (!activeFileContent) return;
    const lines = activeFileContent.split('\n');
    let indentLevel = 0;
    const formattedLines = lines.map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('\\end{') || trimmed.startsWith('}')) {
        indentLevel = Math.max(0, indentLevel - 1);
      }
      const indent = '  '.repeat(indentLevel);
      const formatted = `${indent}${trimmed}`;
      if (
        (trimmed.startsWith('\\begin{') && !trimmed.includes('\\end{')) ||
        (trimmed.endsWith('{') && !trimmed.startsWith('%'))
      ) {
        indentLevel++;
      }
      return formatted;
    });
    const result = formattedLines.join('\n');
    setActiveFileContent(result);
    saveContent(activeFilePath, result);
  }, [activeFileContent, activeFilePath, saveContent]);

  // 11. Git Push (Explicit user action)
  const gitPush = async (userName?: string) => {
    if (!currentProject) return;
    setIsPushing(true);

    if (fileLoadedRef.current && activeFilePath) {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      await saveContent(activeFilePath, activeFileContent);
    }

    try {
      const res = await fetch(`/api/projects/${currentProject.id}/git/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userName: userName || 'Author' }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchFiles();
      }
      return data;
    } catch (err: any) {
      return { success: false, error: err.message };
    } finally {
      setIsPushing(false);
    }
  };

  // 12. Git Pull (Explicit user action)
  const gitPull = async () => {
    if (!currentProject) return;
    setIsPulling(true);
    try {
      const res = await fetch(`/api/projects/${currentProject.id}/git/pull`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        await fetchFiles();
        if (currentPathRef.current) {
          await fetchFileContent(currentProject.id, currentPathRef.current);
        }
      }
      return data;
    } catch (err: any) {
      return { success: false, error: err.message };
    } finally {
      setIsPulling(false);
    }
  };

  const jumpToLine = useCallback((file: string, line: number) => {
    if (file && file !== currentPathRef.current) {
      setActiveFilePath(file);
    }
    setTargetJumpLine(line);
  }, [setActiveFilePath]);

  return {
    projects,
    currentProject,
    files,
    activeFilePath,
    activeFileContent,
    compilationResult,
    isCompiling,
    isSaving,
    isPushing,
    isPulling,
    isFileLoading,
    cursorPosition,
    targetJumpLine,
    setCurrentProject,
    setActiveFilePath,
    setActiveFileContent,
    handleContentChange,
    compile,
    createFile,
    deleteFile,
    createProject,
    deleteProject,
    formatCode,
    setCursorPosition,
    setTargetJumpLine,
    fetchProjects,
    fetchFiles,
    refreshProjects: fetchProjects,
    jumpToLine,
    gitPush,
    gitPull,
  };
}

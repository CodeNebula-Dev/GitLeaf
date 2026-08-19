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
  const [autoCompile, setAutoCompile] = useState<boolean>(false);
  const [cursorPosition, setCursorPosition] = useState<{ line: number; column: number }>({ line: 1, column: 1 });
  const [targetJumpLine, setTargetJumpLine] = useState<number | null>(null);

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Fetch Projects
  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects');
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
        if (data.length > 0 && !currentProject) {
          setCurrentProject(data[0]);
        }
      }
    } catch (err) {
      console.error('Error fetching projects:', err);
    }
  }, [currentProject]);

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

        // Ensure active file is valid
        if (!data.files.some((f: ProjectFile) => f.path === activeFilePath)) {
          const main = data.files.find((f: ProjectFile) => f.isMain || f.name === 'main.tex');
          if (main) setActiveFilePath(main.path);
        }
      }
    } catch (err) {
      console.error('Error fetching files:', err);
    }
  }, [currentProject, activeFilePath]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  // 3. Fetch Active File Content
  const fetchFileContent = useCallback(async (path: string) => {
    if (!currentProject || !path) return;
    try {
      const res = await fetch(`/api/projects/${currentProject.id}/file-content?path=${encodeURIComponent(path)}`);
      if (res.ok) {
        const data = await res.json();
        setActiveFileContent(data.content);
      }
    } catch (err) {
      console.error('Error loading file content:', err);
    }
  }, [currentProject]);

  useEffect(() => {
    if (activeFilePath) {
      fetchFileContent(activeFilePath);
    }
  }, [activeFilePath, fetchFileContent]);

  // 4. Save Content (debounced / immediate)
  const saveContent = useCallback(
    async (path: string, content: string) => {
      if (!currentProject) return;
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
      setActiveFileContent(newContent);
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        saveContent(activeFilePath, newContent);
      }, 600);
    },
    [activeFilePath, saveContent]
  );

  // 5. Compile Project
  const compile = useCallback(async () => {
    if (!currentProject) return;
    setIsCompiling(true);

    // Save active file first before compiling
    await saveContent(activeFilePath, activeFileContent);

    try {
      const res = await fetch(`/api/projects/${currentProject.id}/compile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mainFile: currentProject.mainFile || 'main.tex', engine: currentProject.engine }),
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

  // Initial compile on load if no result yet
  useEffect(() => {
    if (currentProject && !compilationResult && !isCompiling) {
      compile();
    }
  }, [currentProject]);

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

  // 9. Jump to Diagnostic
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
    handleContentChange,
    compilationResult,
    isCompiling,
    isSaving,
    autoCompile,
    setAutoCompile,
    cursorPosition,
    setCursorPosition,
    targetJumpLine,
    setTargetJumpLine,
    compile,
    createFile,
    deleteFile,
    createProject,
    jumpToLine,
    refreshFiles: fetchFiles,
  };
}

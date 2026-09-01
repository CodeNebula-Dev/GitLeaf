import fs from 'fs';
import path from 'path';
import { nanoid } from 'nanoid';
import { ProjectFile, ProjectMetadata } from '../../shared/types.js';
import { TEMPLATES } from './templates.js';

export class ProjectManager {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir || path.resolve(process.cwd(), 'projects');
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  public getBaseDir(): string {
    return this.baseDir;
  }

  public listProjects(): ProjectMetadata[] {
    const entries = fs.readdirSync(this.baseDir, { withFileTypes: true });
    const projects: ProjectMetadata[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const projPath = path.join(this.baseDir, entry.name);
        const metaPath = path.join(projPath, '.gitleaf.json');
        if (fs.existsSync(metaPath)) {
          try {
            const raw = fs.readFileSync(metaPath, 'utf-8');
            const meta = JSON.parse(raw) as ProjectMetadata;
            meta.rootPath = projPath;
            projects.push(meta);
          } catch {
            // fallback if meta corrupted
            projects.push(this.synthesizeMetadata(entry.name, projPath));
          }
        } else {
          projects.push(this.synthesizeMetadata(entry.name, projPath));
        }
      }
    }

    return projects.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  public createProject(name: string, templateId: string = 'blank'): ProjectMetadata {
    const slug = name.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const folderName = `${slug}-${nanoid(5)}`;
    const projPath = path.join(this.baseDir, folderName);
    fs.mkdirSync(projPath, { recursive: true });

    const template = TEMPLATES[templateId] || TEMPLATES['blank'];
    for (const [relPath, content] of Object.entries(template.files)) {
      const fullPath = path.join(projPath, relPath);
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const customContent = content
        .replace(/\\title\{Your Paper Title\}/g, `\\title{${name}}`)
        .replace(/\\title\{Paper Title\}/g, `\\title{${name}}`);
      fs.writeFileSync(fullPath, customContent, 'utf-8');
    }

    const meta: ProjectMetadata = {
      id: nanoid(10),
      name: name,
      rootPath: projPath,
      mainFile: template.mainFile || 'main.tex',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      engine: 'pdflatex',
      collaborators: [
        {
          id: 'local-owner',
          name: 'You (Owner)',
          color: '#10B981',
          role: 'owner',
          lastActive: Date.now(),
        },
      ],
    };

    fs.writeFileSync(path.join(projPath, '.gitleaf.json'), JSON.stringify(meta, null, 2), 'utf-8');
    return meta;
  }

  public getProject(projectIdOrSlug: string): ProjectMetadata | null {
    const projects = this.listProjects();
    const query = projectIdOrSlug.trim();
    const queryLower = query.toLowerCase();

    return (
      projects.find(
        (p) =>
          p.id === query ||
          path.basename(p.rootPath) === query ||
          path.basename(p.rootPath).endsWith(`-${query}`) ||
          path.basename(p.rootPath).includes(query) ||
          p.name.toLowerCase() === queryLower ||
          p.name.toLowerCase().replace(/[^a-z0-9_-]/g, '-').includes(queryLower)
      ) || null
    );
  }

  public getProjectFiles(projectRoot: string): ProjectFile[] {
    const files: ProjectFile[] = [];

    const walk = (dir: string, relDir: string = '') => {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') {
          continue;
        }

        const fullPath = path.join(dir, entry.name);
        // Always use forward slashes for paths (cross-platform compatibility)
        const relPath = (relDir ? `${relDir}/${entry.name}` : entry.name).replace(/\\/g, '/');

        if (entry.isDirectory()) {
          files.push({
            name: entry.name,
            path: relPath,
            type: 'directory',
          });
          walk(fullPath, relPath);
        } else {
          const stats = fs.statSync(fullPath);
          files.push({
            name: entry.name,
            path: relPath,
            type: 'file',
            size: stats.size,
            lastModified: stats.mtimeMs,
            isMain: entry.name === 'main.tex',
          });
        }
      }
    };

    walk(projectRoot);
    return files;
  }

  public readFile(projectRoot: string, relPath: string): string {
    const fullPath = path.join(projectRoot, relPath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found: ${relPath}`);
    }
    return fs.readFileSync(fullPath, 'utf-8');
  }

  public writeFile(projectRoot: string, relPath: string, content: string): void {
    const fullPath = path.join(projectRoot, relPath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(fullPath, content, 'utf-8');

    // Update metadata timestamp
    const metaPath = path.join(projectRoot, '.gitleaf.json');
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        meta.updatedAt = Date.now();
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
      } catch {}
    }
  }

  public deleteFile(projectRoot: string, relPath: string): void {
    const fullPath = path.join(projectRoot, relPath);
    if (fs.existsSync(fullPath)) {
      const stats = fs.statSync(fullPath);
      if (stats.isDirectory()) {
        fs.rmSync(fullPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(fullPath);
      }
    }
  }

  public deleteProject(projectIdOrSlug: string): boolean {
    const project = this.getProject(projectIdOrSlug);
    if (!project) return false;
    if (fs.existsSync(project.rootPath)) {
      fs.rmSync(project.rootPath, { recursive: true, force: true });
      return true;
    }
    return false;
  }

  private synthesizeMetadata(folderName: string, projPath: string): ProjectMetadata {
    return {
      id: folderName,
      name: folderName.replace(/-[a-zA-Z0-9]{5}$/, '').replace(/-/g, ' '),
      rootPath: projPath,
      mainFile: 'main.tex',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      engine: 'pdflatex',
      collaborators: [],
    };
  }
}

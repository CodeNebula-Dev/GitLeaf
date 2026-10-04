import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import PDFDocument from 'pdfkit';
import { CompilationResult, CompilerDiagnostic } from '../../shared/types.js';
import { parseLatexLog } from './parser.js';
import { detectSystemTeX } from '../../cli/system.js';

export function resolveMainDocument(projectRoot: string, preferredFile?: string): string {
  // 1. If preferredFile is given and exists, check if it contains a root magic comment or \documentclass
  if (preferredFile) {
    const fullPreferred = path.join(projectRoot, preferredFile);
    if (fs.existsSync(fullPreferred)) {
      try {
        const content = fs.readFileSync(fullPreferred, 'utf-8');
        // Check for TeX magic root comment: % !TeX root = ... or % !TEX root = ...
        const rootMatch = content.match(/%\s*!T[eE]X\s+root\s*=\s*([^\r\n]+)/i);
        if (rootMatch) {
          const rootTarget = rootMatch[1].trim();
          const resolvedRoot = path.normalize(path.join(path.dirname(preferredFile), rootTarget));
          if (fs.existsSync(path.join(projectRoot, resolvedRoot))) {
            return resolvedRoot.replace(/\\/g, '/');
          }
        }
        // If preferredFile actually has \documentclass, it's a valid root document
        if (content.includes('\\documentclass')) {
          return preferredFile;
        }
      } catch {}
    }
  }

  // 2. Read .gitleaf.json to see if a mainFile is configured and exists on disk
  const metaPath = path.join(projectRoot, '.gitleaf.json');
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      if (meta.mainFile && fs.existsSync(path.join(projectRoot, meta.mainFile))) {
        return meta.mainFile;
      }
    } catch {}
  }

  // 3. Check for standard root file names in projectRoot
  const standardNames = ['main.tex', 'document.tex', 'paper.tex', 'article.tex', 'index.tex'];
  for (const name of standardNames) {
    if (fs.existsSync(path.join(projectRoot, name))) {
      return name;
    }
  }

  // 4. Scan all .tex files in project to find the one with \documentclass
  try {
    const scanDir = (dir: string, relDir: string = ''): string | null => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'dist') continue;
        const full = path.join(dir, e.name);
        const rel = relDir ? `${relDir}/${e.name}` : e.name;
        if (e.isDirectory() && relDir === '') {
          const found = scanDir(full, rel);
          if (found) return found;
        } else if (e.isFile() && e.name.endsWith('.tex')) {
          const content = fs.readFileSync(full, 'utf-8');
          if (content.includes('\\documentclass')) {
            return rel.replace(/\\/g, '/');
          }
        }
      }
      return null;
    };
    const foundDoc = scanDir(projectRoot);
    if (foundDoc) return foundDoc;
  } catch {}

  // 5. Fallback
  return preferredFile || 'main.tex';
}

export class LatexCompiler {
  public async compile(projectRoot: string, mainFile: string = 'main.tex', engine?: string, projectId?: string): Promise<CompilationResult> {
    const startTime = Date.now();
    const systemStatus = detectSystemTeX();

    // Multi-file resolution: always compile the project's root document
    const resolvedMain = resolveMainDocument(projectRoot, mainFile);
    const fullMainPath = path.join(projectRoot, resolvedMain);

    if (!fs.existsSync(fullMainPath)) {
      return {
        success: false,
        diagnostics: [
          {
            type: 'error',
            file: resolvedMain,
            line: 1,
            message: `Root document "${resolvedMain}" not found in project.`,
          },
        ],
        log: `Error: Root document ${resolvedMain} does not exist.`,
        durationMs: Date.now() - startTime,
        timestamp: Date.now(),
      };
    }

    // Collect all project relative file paths for diagnostic normalization
    const projectFiles: string[] = [];
    try {
      const collectFiles = (dir: string, relDir: string = '') => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
          if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'dist') continue;
          const rel = relDir ? `${relDir}/${e.name}` : e.name;
          if (e.isDirectory()) {
            collectFiles(path.join(dir, e.name), rel);
          } else {
            projectFiles.push(rel.replace(/\\/g, '/'));
          }
        }
      };
      collectFiles(projectRoot);
    } catch {}

    // Determine which native engine to actually use, based on what's installed on this machine
    const hasAnyNative = systemStatus.hasTectonic || systemStatus.hasPdflatex || systemStatus.hasXelatex;

    if (hasAnyNative) {
      // Try native compilation first; if spawn fails, fall back to PDFKit
      const nativeRes = await this.runNativeCompiler(projectRoot, resolvedMain, systemStatus, startTime, engine, projectId, projectFiles);

      // If spawn itself failed (binary not found / ENOENT), fall back to PDFKit
      const spawnFailed = !nativeRes.success && nativeRes.log?.includes('Spawn error:');
      if (!spawnFailed) {
        return nativeRes;
      }
      console.warn('[Compiler] Native TeX spawn failed, falling back to PDFKit engine:', nativeRes.log);
    }

    // Fallback: High-Fidelity Multi-Page PDFKit Academic Engine (when no native TeX compiler works)
    return await this.runAcademicPdfEngine(projectRoot, resolvedMain, startTime, projectId);
  }

  private runNativeCompiler(
    projectRoot: string,
    mainFile: string,
    systemStatus: ReturnType<typeof detectSystemTeX>,
    startTime: number,
    engine?: string,
    projectId?: string,
    projectFiles: string[] = []
  ): Promise<CompilationResult> {
    return new Promise((resolve) => {
      let cmd: string;
      let args: string[];

      // Respect user's engine preference; default to pdflatex (matches Overleaf behavior)
      const preferred = (engine || 'pdflatex').toLowerCase();

      if (preferred === 'tectonic' && systemStatus.hasTectonic && systemStatus.tectonicPath) {
        cmd = systemStatus.tectonicPath;
        args = ['--synctex', '--keep-logs', '--print', mainFile];
      } else if (preferred === 'xelatex' && systemStatus.hasXelatex) {
        cmd = 'xelatex';
        args = ['-synctex=1', '-interaction=nonstopmode', '-file-line-error', mainFile];
      } else if (systemStatus.hasPdflatex) {
        // Default: pdflatex — most compatible with Overleaf
        cmd = systemStatus.pdflatexPath || 'pdflatex';
        args = ['-synctex=1', '-interaction=nonstopmode', '-file-line-error', mainFile];
      } else if (systemStatus.hasTectonic && systemStatus.tectonicPath) {
        // Fallback to Tectonic if pdflatex is not available
        cmd = systemStatus.tectonicPath;
        args = ['--synctex', '--keep-logs', '--print', mainFile];
      } else if (systemStatus.hasXelatex) {
        cmd = 'xelatex';
        args = ['-synctex=1', '-interaction=nonstopmode', '-file-line-error', mainFile];
      } else {
        // Should not reach here since caller checks hasAnyNative, but guard anyway
        return resolve({
          success: false,
          diagnostics: [{ type: 'error', file: mainFile, line: 1, message: 'No TeX compiler found on this system.' }],
          log: 'Spawn error: No TeX compiler binary found.',
          durationMs: Date.now() - startTime,
          timestamp: Date.now(),
        });
      }

      const isWindows = process.platform === 'win32';
      const envPath = isWindows
        ? (process.env.Path || process.env.PATH || '')
        : `/opt/homebrew/bin:/usr/local/bin:/Library/TeX/texbin:${process.env.PATH || ''}`;

      console.log(`[Compiler] Running: ${cmd} ${args.join(' ')} in ${projectRoot}`);

      const child = spawn(cmd, args, {
        cwd: projectRoot,
        shell: isWindows,  // Use shell on Windows to resolve .exe / .cmd wrappers
        env: {
          ...process.env,
          ...(isWindows ? { Path: envPath, PATH: envPath } : { PATH: envPath }),
        },
      });

      let stdout = '';
      let stderr = '';
      let resolved = false;

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (resolved) return;
        resolved = true;

        const fullLog = `${stdout}\n${stderr}`;
        const baseName = path.basename(mainFile).replace(/\.tex$/i, '');
        const candidate1 = path.join(projectRoot, `${baseName}.pdf`);
        const candidate2 = path.join(projectRoot, mainFile.replace(/\.tex$/i, '.pdf'));
        const pdfPath = fs.existsSync(candidate1) ? candidate1 : (fs.existsSync(candidate2) ? candidate2 : candidate1);
        const hasPdf = fs.existsSync(pdfPath);

        const diagnostics = parseLatexLog(fullLog, mainFile, projectFiles);

        // Demote errors from system/package files that are not part of the project
        for (const d of diagnostics) {
          if (
            d.type === 'error' &&
            d.file &&
            !projectFiles.some(pf => d.file === pf || d.file.endsWith(`/${pf}`) || pf.endsWith(`/${d.file}`))
          ) {
            d.type = 'warning';
          }
        }

        const hasErrors = diagnostics.some((d) => d.type === 'error');
        // Match Overleaf behavior: succeed when PDF exists and either exit code is 0 or no real errors parsed
        const success = hasPdf && (code === 0 || !hasErrors);

        // If compilation failed and no diagnostics parsed, extract meaningful error message
        if (!success && diagnostics.length === 0) {
          const errLine = fullLog.split('\n').filter(l => l.includes('error:') || l.includes('Error:') || l.startsWith('! ')).pop()
            || fullLog.trim().split('\n').filter(Boolean).pop()
            || 'LaTeX compilation failed.';
          diagnostics.push({
            type: 'error',
            file: mainFile,
            line: 1,
            message: errLine.replace(/^error:\s*/i, '').trim(),
            raw: fullLog,
          });
        }

        // Always serve the PDF if it exists, even when there are errors (matches Overleaf behavior)
        resolve({
          success,
          pdfUrl: hasPdf ? `/api/projects/${projectId || path.basename(projectRoot)}/pdf?t=${Date.now()}` : undefined,
          pdfPath: hasPdf ? pdfPath : undefined,
          diagnostics,
          log: fullLog,
          durationMs: Date.now() - startTime,
          timestamp: Date.now(),
        });
      });

      child.on('error', (err) => {
        if (resolved) return;
        resolved = true;

        resolve({
          success: false,
          diagnostics: [
            {
              type: 'error',
              file: mainFile,
              line: 1,
              message: `Failed to spawn ${cmd}: ${err.message}`,
            },
          ],
          log: `Spawn error: ${err.message}`,
          durationMs: Date.now() - startTime,
          timestamp: Date.now(),
        });
      });
    });
  }

  private async runAcademicPdfEngine(
    projectRoot: string,
    mainFile: string,
    startTime: number,
    projectId?: string
  ): Promise<CompilationResult> {
    return new Promise((resolve) => {
      try {
        const fullPath = path.join(projectRoot, mainFile);
        let rawTex = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf-8') : '';
        const baseName = path.basename(mainFile).replace(/\.tex$/i, '');
        const pdfPath = path.join(projectRoot, `${baseName}.pdf`);

        // Multi-file resolution: recursively expand all \input{...} and \include{...}
        rawTex = this.expandTexInputs(projectRoot, mainFile, rawTex);

        if (!rawTex.trim() || !rawTex.includes('\\begin{document}')) {
          // Remove stale PDF if document is invalid/empty
          if (fs.existsSync(pdfPath)) {
            try { fs.unlinkSync(pdfPath); } catch {}
          }
          return resolve({
            success: false,
            diagnostics: [
              {
                type: 'error',
                file: mainFile,
                line: 1,
                message: 'LaTeX document is empty or missing \\begin{document}.',
              },
            ],
            log: 'Error: Cannot compile empty LaTeX document.',
            durationMs: Date.now() - startTime,
            timestamp: Date.now(),
          });
        }

        // Parse essential TeX elements
        const titleMatch = rawTex.match(/\\title\{([\s\S]*?)\}(?=\s*\\author|\s*\\date|\s*\\begin\{document\}|\s*\\maketitle)/);
        const authorMatch = rawTex.match(/\\author\{([\s\S]*?)\}(?=\s*\\date|\s*\\begin\{document\}|\s*\\maketitle)/);
        const abstractMatch = rawTex.match(/\\begin\{abstract\}([\s\S]*?)\\end\{abstract\}/);
        const keywordsMatch = rawTex.match(/\\begin\{IEEEkeywords\}([\s\S]*?)\\end\{IEEEkeywords\}/);

        const title = titleMatch ? this.cleanTexText(titleMatch[1]) : 'Academic Research Paper';
        const authors = authorMatch ? this.cleanAuthorText(authorMatch[1]) : 'GitLeaf Co-Authors';
        const abstract = abstractMatch ? this.cleanTexText(abstractMatch[1]) : '';
        const keywords = keywordsMatch ? this.cleanTexText(keywordsMatch[1]) : '';

        // Extract sections and body text
        const sections = this.extractSections(rawTex);
        const references = this.extractBibliography(projectRoot, rawTex);

        // Generate PDF
        const doc = new PDFDocument({
          size: 'A4',
          margins: { top: 54, bottom: 54, left: 54, right: 54 },
          bufferPages: true,
        });

        const writeStream = fs.createWriteStream(pdfPath);
        doc.pipe(writeStream);

        // Header Title
        doc.fontSize(18).font('Helvetica-Bold').fillColor('#1E293B').text(title, { align: 'center' });
        doc.moveDown(0.5);

        // Authors
        doc.fontSize(9.5).font('Helvetica').fillColor('#475569').text(authors, { align: 'center' });
        doc.moveDown(1);

        // Abstract Box
        if (abstract) {
          doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#0F172A').text('Abstract—', { continued: true });
          doc.font('Helvetica-Oblique').fillColor('#334155').text(abstract);
          doc.moveDown(0.5);
        }

        if (keywords) {
          doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#0F172A').text('Index Terms—', { continued: true });
          doc.font('Helvetica').fillColor('#475569').text(keywords);
          doc.moveDown(1);
        }

        doc.moveTo(54, doc.y).lineTo(541, doc.y).strokeColor('#CBD5E1').stroke();
        doc.moveDown(1);

        // Render Sections
        for (let sIdx = 0; sIdx < sections.length; sIdx++) {
          const sec = sections[sIdx];
          doc.fontSize(11).font('Helvetica-Bold').fillColor('#1E293B').text(`${sIdx + 1}. ${sec.title.toUpperCase()}`);
          doc.moveDown(0.4);

          for (const item of sec.items) {
            if (item.type === 'paragraph') {
              doc.fontSize(9.5).font('Helvetica').fillColor('#334155').text(item.content, { lineGap: 3, align: 'justify' });
              doc.moveDown(0.5);
            } else if (item.type === 'equation') {
              doc.moveDown(0.2);
              doc.fontSize(10).font('Courier-Oblique').fillColor('#0F172A').text(`    ${item.content}`, { align: 'center' });
              doc.moveDown(0.4);
            } else if (item.type === 'subsection') {
              doc.fontSize(10).font('Helvetica-Bold').fillColor('#334155').text(`${item.prefix}. ${item.title}`);
              doc.moveDown(0.3);
            }
          }
          doc.moveDown(0.5);
        }

        // Render Bibliography
        if (references.length > 0) {
          doc.moveDown(0.5);
          doc.fontSize(11).font('Helvetica-Bold').fillColor('#1E293B').text('REFERENCES');
          doc.moveDown(0.4);

          for (let rIdx = 0; rIdx < references.length; rIdx++) {
            doc.fontSize(8.5).font('Helvetica').fillColor('#475569').text(`[${rIdx + 1}]  ${references[rIdx]}`, { lineGap: 2 });
            doc.moveDown(0.3);
          }
        }

        // Add page numbers
        const range = doc.bufferedPageRange();
        for (let i = range.start; i < range.start + range.count; i++) {
          doc.switchToPage(i);
          doc
            .fontSize(8)
            .fillColor('#9CA3AF')
            .text(`Page ${i + 1} of ${range.count}`, 54, 750, { align: 'center' });
        }

        doc.end();

        writeStream.on('finish', () => {
          resolve({
            success: true,
            pdfUrl: `/api/projects/${projectId || path.basename(projectRoot)}/pdf?t=${Date.now()}`,
            pdfPath,
            diagnostics: [
              {
                type: 'info',
                file: mainFile,
                line: 1,
                message: `Compiled successfully with GitLeaf Academic PDF Engine (${range.count} pages).`,
              },
            ],
            log: `GitLeaf High-Fidelity Academic Typesetter\nInput: ${mainFile}\nTitle: ${title}\nPages generated: ${range.count}\nOutput: ${baseName}.pdf\nStatus: Succeeded\n`,
            durationMs: Date.now() - startTime,
            timestamp: Date.now(),
          });
        });

        writeStream.on('error', (err) => {
          resolve({
            success: false,
            diagnostics: [{ type: 'error', file: mainFile, line: 1, message: err.message }],
            log: err.message,
            durationMs: Date.now() - startTime,
            timestamp: Date.now(),
          });
        });
      } catch (err: any) {
        resolve({
          success: false,
          diagnostics: [{ type: 'error', file: mainFile, line: 1, message: err.message }],
          log: `Render error: ${err.message}`,
          durationMs: Date.now() - startTime,
          timestamp: Date.now(),
        });
      }
    });
  }

  private cleanAuthorText(text: string): string {
    const blocks: string[] = [];
    const blockMatches = Array.from(text.matchAll(/\\IEEEauthorblockN\{([^}]+)\}[\s\S]*?\\IEEEauthorblockA\{([\s\S]*?)\}/g));
    
    if (blockMatches.length > 0) {
      for (const b of blockMatches) {
        const name = this.cleanTexText(b[1]);
        const aff = this.cleanTexText(b[2]).replace(/\n+/g, ', ');
        blocks.push(`${name} (${aff})`);
      }
      return blocks.join('   •   ');
    }

    return this.cleanTexText(text).replace(/\n+/g, '  |  ');
  }

  private cleanTexText(text: string): string {
    return text
      // Formatting macros
      .replace(/\\textbf\{([^}]+)\}/g, '$1')
      .replace(/\\textit\{([^}]+)\}/g, '$1')
      .replace(/\\emph\{([^}]+)\}/g, '$1')
      .replace(/\\underline\{([^}]+)\}/g, '$1')
      .replace(/\\cite\{([^}]+)\}/g, '[$1]')
      .replace(/\\ref\{([^}]+)\}/g, '$1')
      .replace(/\\label\{([^}]+)\}/g, '')
      .replace(/\\IEEEauthorblockN\{([^}]+)\}/g, '$1')
      .replace(/\\IEEEauthorblockA\{([^}]+)\}/g, '$1')
      .replace(/\\and/g, '  and  ')
      .replace(/\\\\/g, '\n')
      .replace(/\\begin\{[^}]+\}/g, '')
      .replace(/\\end\{[^}]+\}/g, '')
      .replace(/\\item/g, '• ')

      // Common Math LaTeX macros -> Readable Unicode symbols
      .replace(/\\alpha/g, 'α')
      .replace(/\\beta/g, 'β')
      .replace(/\\gamma/g, 'γ')
      .replace(/\\delta/g, 'δ')
      .replace(/\\epsilon/g, 'ε')
      .replace(/\\zeta/g, 'ζ')
      .replace(/\\eta/g, 'η')
      .replace(/\\theta/g, 'θ')
      .replace(/\\iota/g, 'ι')
      .replace(/\\kappa/g, 'κ')
      .replace(/\\lambda/g, 'λ')
      .replace(/\\mu/g, 'μ')
      .replace(/\\nu/g, 'ν')
      .replace(/\\xi/g, 'ξ')
      .replace(/\\pi/g, 'π')
      .replace(/\\rho/g, 'ρ')
      .replace(/\\sigma/g, 'σ')
      .replace(/\\tau/g, 'τ')
      .replace(/\\upsilon/g, 'υ')
      .replace(/\\phi/g, 'φ')
      .replace(/\\chi/g, 'χ')
      .replace(/\\psi/g, 'ψ')
      .replace(/\\omega/g, 'ω')
      .replace(/\\Gamma/g, 'Γ')
      .replace(/\\Delta/g, 'Δ')
      .replace(/\\Theta/g, 'Θ')
      .replace(/\\Lambda/g, 'Λ')
      .replace(/\\Xi/g, 'Ξ')
      .replace(/\\Pi/g, 'Π')
      .replace(/\\Sigma/g, 'Σ')
      .replace(/\\Phi/g, 'Φ')
      .replace(/\\Psi/g, 'Ψ')
      .replace(/\\Omega/g, 'Ω')
      .replace(/\\infty/g, '∞')
      .replace(/\\in/g, '∈')
      .replace(/\\notin/g, '∉')
      .replace(/\\subset/g, '⊂')
      .replace(/\\supset/g, '⊃')
      .replace(/\\cup/g, '∪')
      .replace(/\\cap/g, '∩')
      .replace(/\\sum/g, '∑')
      .replace(/\\prod/g, '∏')
      .replace(/\\int/g, '∫')
      .replace(/\\partial/g, '∂')
      .replace(/\\nabla/g, '∇')
      .replace(/\\cdot/g, '•')
      .replace(/\\times/g, '×')
      .replace(/\\div/g, '÷')
      .replace(/\\pm/g, '±')
      .replace(/\\leq/g, '≤')
      .replace(/\\geq/g, '≥')
      .replace(/\\neq/g, '≠')
      .replace(/\\approx/g, '≈')
      .replace(/\\equiv/g, '≡')
      .replace(/\\to/g, '→')
      .replace(/\\rightarrow/g, '→')
      .replace(/\\leftarrow/g, '←')
      .replace(/\\Rightarrow/g, '⇒')
      .replace(/\\Leftarrow/g, '⇐')
      .replace(/\\leftrightarrow/g, '↔')

      // Fractions and roots
      .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1/$2)')
      .replace(/\\sqrt\{([^}]+)\}/g, '√($1)')

      // Strip remaining structural commands safely while keeping macro text
      .replace(/\\[a-zA-Z]+\{([^}]+)\}/g, '$1')
      .replace(/\\[a-zA-Z]+/g, '')
      .replace(/[{}]/g, '')
      .replace(/\$/g, '')
      .replace(/  +/g, ' ')
      .trim();
  }

  private extractSections(rawTex: string): { title: string; items: any[] }[] {
    const sections: { title: string; items: any[] }[] = [];
    const rawSections = rawTex.split(/\\section\{([^}]+)\}/);

    for (let i = 1; i < rawSections.length; i += 2) {
      const title = this.cleanTexText(rawSections[i]);
      const content = rawSections[i + 1] || '';

      const items: any[] = [];
      const paragraphs = content.split(/\n\s*\n/);

      for (const p of paragraphs) {
        const trimmed = p.trim();
        if (!trimmed || trimmed.startsWith('\\begin{thebibliography}') || trimmed.startsWith('\\end{document}')) continue;

        // Check for equation
        const eqMatch = trimmed.match(/\\begin\{equation\}([\s\S]*?)\\end\{equation\}/);
        if (eqMatch) {
          items.push({ type: 'equation', content: this.cleanTexText(eqMatch[1]) });
        } else if (trimmed.includes('\\subsection{')) {
          const subMatch = trimmed.match(/\\subsection\{([^}]+)\}/);
          if (subMatch) {
            items.push({ type: 'subsection', prefix: 'A', title: this.cleanTexText(subMatch[1]) });
          }
        } else {
          items.push({ type: 'paragraph', content: this.cleanTexText(trimmed) });
        }
      }

      sections.push({ title, items });
    }

    return sections;
  }

  private expandTexInputs(
    projectRoot: string,
    filePath: string,
    content: string,
    visited = new Set<string>()
  ): string {
    const fullPath = path.resolve(projectRoot, filePath);
    if (visited.has(fullPath)) return content;
    visited.add(fullPath);

    const currentDir = path.dirname(filePath);

    return content.replace(/\\(?:input|include)\{([^}]+)\}/g, (match, includedPath) => {
      let candidate = includedPath.trim();
      if (!candidate.endsWith('.tex')) {
        candidate += '.tex';
      }
      // Try resolving relative to current file's directory first, then relative to projectRoot
      let targetRel = path.join(currentDir, candidate).replace(/\\/g, '/');
      let targetPath = path.resolve(projectRoot, targetRel);

      if (!fs.existsSync(targetPath)) {
        targetRel = candidate.replace(/\\/g, '/');
        targetPath = path.resolve(projectRoot, targetRel);
      }

      if (fs.existsSync(targetPath) && !visited.has(targetPath)) {
        try {
          const subContent = fs.readFileSync(targetPath, 'utf-8');
          return this.expandTexInputs(projectRoot, targetRel, subContent, visited);
        } catch {
          return match;
        }
      }
      return '';
    });
  }

  private extractBibliography(projectRoot: string, rawTex: string): string[] {
    const items: string[] = [];

    // 1. thebibliography environment in the document
    const bibMatch = rawTex.match(/\\begin\{thebibliography\}[\s\S]*?([\s\S]*?)\\end\{thebibliography\}/);
    if (bibMatch) {
      const rawBib = bibMatch[1];
      const bibEntries = rawBib.split(/\\bibitem\{[^}]+\}/);
      for (const entry of bibEntries) {
        const cleaned = this.cleanTexText(entry);
        if (cleaned) items.push(cleaned);
      }
    }

    // 2. Look for external .bib files (via \bibliography{...} or searching the project root)
    try {
      const bibFiles: string[] = [];
      const bibCmdMatches = Array.from(rawTex.matchAll(/\\(?:bibliography|addbibresource)\{([^}]+)\}/g));
      for (const m of bibCmdMatches) {
        const fileArgs = m[1].split(',');
        for (let arg of fileArgs) {
          arg = arg.trim();
          if (!arg.endsWith('.bib')) arg += '.bib';
          if (!bibFiles.includes(arg)) bibFiles.push(arg);
        }
      }

      // Also auto-detect any .bib files in the project root
      if (fs.existsSync(projectRoot)) {
        const rootEntries = fs.readdirSync(projectRoot);
        for (const e of rootEntries) {
          if (e.endsWith('.bib') && !bibFiles.includes(e)) {
            bibFiles.push(e);
          }
        }
      }

      for (const bibFile of bibFiles) {
        const bibPath = path.resolve(projectRoot, bibFile);
        if (fs.existsSync(bibPath)) {
          const bibContent = fs.readFileSync(bibPath, 'utf-8');
          const parsed = this.parseBibtexFile(bibContent);
          for (const item of parsed) {
            if (!items.includes(item)) items.push(item);
          }
        }
      }
    } catch {}

    return items;
  }

  private parseBibtexFile(content: string): string[] {
    const entries: string[] = [];
    const entryRegex = /@\w+\s*\{[^,]+,([\s\S]*?)(?=@\w+\s*\{|$)/g;
    let match;

    while ((match = entryRegex.exec(content)) !== null) {
      const body = match[1];
      const getField = (field: string) => {
        const fieldRegex = new RegExp(`${field}\\s*=\\s*["{]([\\s\\S]*?)["}],?`, 'i');
        const m = body.match(fieldRegex);
        return m ? this.cleanTexText(m[1].trim().replace(/\s+/g, ' ')) : '';
      };

      const author = getField('author');
      const title = getField('title');
      const journal = getField('journal') || getField('booktitle') || getField('publisher');
      const year = getField('year');

      const parts: string[] = [];
      if (author) parts.push(author);
      if (title) parts.push(`"${title}"`);
      if (journal) parts.push(journal);
      if (year) parts.push(year);

      if (parts.length > 0) {
        entries.push(parts.join(', ') + '.');
      }
    }

    return entries;
  }
}

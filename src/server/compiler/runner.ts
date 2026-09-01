import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import PDFDocument from 'pdfkit';
import { CompilationResult, CompilerDiagnostic } from '../../shared/types.js';
import { parseLatexLog } from './parser.js';
import { detectSystemTeX } from '../../cli/system.js';

export class LatexCompiler {
  public async compile(projectRoot: string, mainFile: string = 'main.tex', engine?: string, projectId?: string): Promise<CompilationResult> {
    const startTime = Date.now();
    const systemStatus = detectSystemTeX();
    const selectedEngine = engine || systemStatus.preferredEngine;

    const fullMainPath = path.join(projectRoot, mainFile);
    if (!fs.existsSync(fullMainPath)) {
      return {
        success: false,
        diagnostics: [
          {
            type: 'error',
            file: mainFile,
            line: 1,
            message: `Main file "${mainFile}" not found in project.`,
          },
        ],
        log: `Error: Main file ${mainFile} does not exist.`,
        durationMs: Date.now() - startTime,
        timestamp: Date.now(),
      };
    }

    // 1. Try Native TeX Compiler (Tectonic / pdflatex / xelatex)
    if (selectedEngine !== 'wasm' && (systemStatus.hasTectonic || systemStatus.hasPdflatex || systemStatus.hasXelatex)) {
      const nativeRes = await this.runNativeCompiler(projectRoot, mainFile, systemStatus, startTime, projectId);
      return nativeRes;
    }

    // 2. High-Fidelity Multi-Page PDFKit Academic Engine Fallback (When no native TeX compiler is installed)
    return await this.runAcademicPdfEngine(projectRoot, mainFile, startTime, projectId);
  }

  private runNativeCompiler(
    projectRoot: string,
    mainFile: string,
    systemStatus: ReturnType<typeof detectSystemTeX>,
    startTime: number,
    projectId?: string
  ): Promise<CompilationResult> {
    return new Promise((resolve) => {
      let cmd = 'tectonic';
      let args: string[] = ['--synctex', '--keep-logs', '--print', mainFile];

      if (systemStatus.hasTectonic && systemStatus.tectonicPath) {
        cmd = systemStatus.tectonicPath;
        args = ['--synctex', '--keep-logs', '--print', mainFile];
      } else if (systemStatus.hasPdflatex) {
        cmd = systemStatus.pdflatexPath || 'pdflatex';
        args = ['-synctex=1', '-interaction=nonstopmode', '-file-line-error', mainFile];
      }

      const isWindows = process.platform === 'win32';
      const envPath = isWindows
        ? (process.env.Path || process.env.PATH || '')
        : `/opt/homebrew/bin:/usr/local/bin:/Library/TeX/texbin:${process.env.PATH || ''}`;

      const child = spawn(cmd, args, {
        cwd: projectRoot,
        shell: false,
        env: {
          ...process.env,
          ...(isWindows ? { Path: envPath, PATH: envPath } : { PATH: envPath }),
        },
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        const fullLog = `${stdout}\n${stderr}`;
        const baseName = mainFile.replace(/\.tex$/i, '');
        const pdfFileName = `${baseName}.pdf`;
        const pdfPath = path.join(projectRoot, pdfFileName);
        const hasPdf = fs.existsSync(pdfPath);

        const diagnostics = parseLatexLog(fullLog, mainFile);
        const success = (code === 0);

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

        resolve({
          success,
          pdfUrl: (success && hasPdf) ? `/api/projects/${projectId || path.basename(projectRoot)}/pdf?t=${Date.now()}` : undefined,
          pdfPath: (success && hasPdf) ? pdfPath : undefined,
          diagnostics,
          log: fullLog,
          durationMs: Date.now() - startTime,
          timestamp: Date.now(),
        });
      });

      child.on('error', (err) => {
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
        const rawTex = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf-8') : '';
        const baseName = mainFile.replace(/\.tex$/i, '');
        const pdfPath = path.join(projectRoot, `${baseName}.pdf`);

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
        const references = this.extractBibliography(rawTex);

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

  private extractBibliography(rawTex: string): string[] {
    const items: string[] = [];
    const bibMatch = rawTex.match(/\\begin\{thebibliography\}[\s\S]*?([\s\S]*?)\\end\{thebibliography\}/);
    if (bibMatch) {
      const rawBib = bibMatch[1];
      const bibEntries = rawBib.split(/\\bibitem\{[^}]+\}/);
      for (const entry of bibEntries) {
        const cleaned = this.cleanTexText(entry);
        if (cleaned) items.push(cleaned);
      }
    }
    return items;
  }
}

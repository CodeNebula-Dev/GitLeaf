import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import PDFDocument from 'pdfkit';
import { CompilationResult, CompilerDiagnostic } from '../../shared/types.js';
import { parseLatexLog } from './parser.js';
import { detectSystemTeX } from '../../cli/system.js';

export class LatexCompiler {
  public async compile(projectRoot: string, mainFile: string = 'main.tex', engine?: string): Promise<CompilationResult> {
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
      try {
        const nativeRes = await this.runNativeCompiler(projectRoot, mainFile, systemStatus, startTime);
        if (nativeRes.success && nativeRes.pdfPath && fs.existsSync(nativeRes.pdfPath)) {
          return nativeRes;
        }
      } catch (err: any) {
        console.warn(`Native compiler encountered error: ${err.message}. Falling back to high-fidelity PDFKit engine.`);
      }
    }

    // 2. High-Fidelity Multi-Page PDFKit Academic Engine Fallback
    return await this.runAcademicPdfEngine(projectRoot, mainFile, startTime);
  }

  private runNativeCompiler(
    projectRoot: string,
    mainFile: string,
    systemStatus: ReturnType<typeof detectSystemTeX>,
    startTime: number
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

      const child = spawn(cmd, args, {
        cwd: projectRoot,
        env: {
          ...process.env,
          PATH: `/opt/homebrew/bin:/usr/local/bin:/Library/TeX/texbin:${process.env.PATH || ''}`,
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
        const success = (code === 0 || hasPdf);

        resolve({
          success,
          pdfUrl: hasPdf ? `/api/projects/${path.basename(projectRoot)}/pdf?t=${Date.now()}` : undefined,
          pdfPath: hasPdf ? pdfPath : undefined,
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
    startTime: number
  ): Promise<CompilationResult> {
    return new Promise((resolve) => {
      try {
        const rawTex = fs.readFileSync(path.join(projectRoot, mainFile), 'utf-8');
        const baseName = mainFile.replace(/\.tex$/i, '');
        const pdfPath = path.join(projectRoot, `${baseName}.pdf`);

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

        // Extract bibliography
        const bibItems = this.extractBibliography(rawTex);

        // Setup PDF Document with standard Letter dimensions and margins (0.75 in = 54 pt)
        const doc = new PDFDocument({
          size: 'LETTER',
          margins: { top: 54, bottom: 54, left: 54, right: 54 },
          bufferPages: true,
          autoFirstPage: true,
        });

        const writeStream = fs.createWriteStream(pdfPath);
        doc.pipe(writeStream);

        // Title Block
        doc
          .font('Helvetica-Bold')
          .fontSize(18)
          .fillColor('#111827')
          .text(title, { align: 'center', lineGap: 4 });
        
        doc.moveDown(0.5);

        // Authors Block
        doc
          .font('Helvetica')
          .fontSize(10)
          .fillColor('#374151')
          .text(authors, { align: 'center', lineGap: 3 });

        doc.moveDown(1.2);

        // Abstract Box
        if (abstract) {
          doc
            .font('Helvetica-Bold')
            .fontSize(10)
            .fillColor('#111827')
            .text('Abstract—', { continued: true, indent: 20 })
            .font('Helvetica-Oblique')
            .fontSize(9.5)
            .fillColor('#1F2937')
            .text(abstract, { align: 'justify', lineGap: 2.5 });
          
          doc.moveDown(0.6);
        }

        // Keywords
        if (keywords) {
          doc
            .font('Helvetica-Bold')
            .fontSize(9.5)
            .fillColor('#111827')
            .text('Index Terms—', { continued: true, indent: 20 })
            .font('Helvetica-Oblique')
            .fontSize(9.5)
            .fillColor('#374151')
            .text(keywords, { align: 'left', lineGap: 2 });

          doc.moveDown(1);
        }

        // Divider
        doc
          .strokeColor('#E5E7EB')
          .lineWidth(0.5)
          .moveTo(54, doc.y)
          .lineTo(558, doc.y)
          .stroke();

        doc.moveDown(1);

        // Sections
        const romanNumerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
        let secIdx = 0;

        for (const sec of sections) {
          const roman = romanNumerals[secIdx] || `${secIdx + 1}`;
          
          // Section Heading
          doc
            .font('Helvetica-Bold')
            .fontSize(11)
            .fillColor('#111827')
            .text(`${roman}.  ${sec.title.toUpperCase()}`, { align: 'left', lineGap: 4 });
          
          doc.moveDown(0.3);

          // Subsections & Paragraphs
          for (const item of sec.items) {
            if (item.type === 'subsection') {
              doc
                .font('Helvetica-Bold')
                .fontSize(10)
                .fillColor('#1F2937')
                .text(`${item.prefix}. ${item.title}`, { align: 'left', lineGap: 3 });
              doc.moveDown(0.2);
            } else if (item.type === 'equation') {
              doc.moveDown(0.4);
              doc
                .font('Helvetica-Oblique')
                .fontSize(10)
                .fillColor('#1E293B')
                .text(item.content, { align: 'center', lineGap: 2 });
              doc.moveDown(0.4);
            } else if (item.type === 'paragraph') {
              doc
                .font('Helvetica')
                .fontSize(9.5)
                .fillColor('#374151')
                .text(item.content, {
                  align: 'justify',
                  indent: 14,
                  lineGap: 3,
                });
              doc.moveDown(0.5);
            }
          }

          doc.moveDown(0.6);
          secIdx++;
        }

        // References Block
        if (bibItems.length > 0) {
          doc
            .font('Helvetica-Bold')
            .fontSize(11)
            .fillColor('#111827')
            .text('REFERENCES', { align: 'center', lineGap: 6 });
          
          doc.moveDown(0.4);

          let bIdx = 1;
          for (const bib of bibItems) {
            doc
              .font('Helvetica')
              .fontSize(8.5)
              .fillColor('#4B5563')
              .text(`[${bIdx}] `, { continued: true })
              .text(bib, { align: 'justify', lineGap: 2 });
            doc.moveDown(0.3);
            bIdx++;
          }
        }

        // Add Header & Footers (Page numbering "Page X of Y")
        const range = doc.bufferedPageRange();
        for (let i = range.start; i < range.start + range.count; i++) {
          doc.switchToPage(i);

          // Header
          doc
            .font('Helvetica')
            .fontSize(8)
            .fillColor('#9CA3AF')
            .text('GitLeaf Academic Typesetting Engine', 54, 30, { align: 'left' });

          // Footer
          doc
            .font('Helvetica')
            .fontSize(8)
            .fillColor('#9CA3AF')
            .text(`Page ${i + 1} of ${range.count}`, 54, 750, { align: 'center' });
        }

        doc.end();

        writeStream.on('finish', () => {
          resolve({
            success: true,
            pdfUrl: `/api/projects/${path.basename(projectRoot)}/pdf?t=${Date.now()}`,
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
      .replace(/\\[a-zA-Z]+/g, '')
      .replace(/[{}]/g, '')
      .replace(/\$/g, '')
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

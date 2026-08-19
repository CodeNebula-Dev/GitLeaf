import { CompilerDiagnostic } from '../../shared/types.js';

export function parseLatexLog(logContent: string, defaultFile: string = 'main.tex'): CompilerDiagnostic[] {
  const diagnostics: CompilerDiagnostic[] = [];
  const lines = logContent.split('\n');

  let currentFile = defaultFile;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // File name tracking e.g. (./sections/intro.tex
    const fileMatch = line.match(/\(((\.?\/)?[\w-]+\/[\w-]+\.tex)/);
    if (fileMatch) {
      currentFile = fileMatch[1].replace(/^\.\//, '');
    }

    // Standard file:line: error format (e.g. ./main.tex:24: Undefined control sequence.)
    const fileLineErrorMatch = line.match(/^(.+?):(\d+):\s*(.+)$/);
    if (fileLineErrorMatch) {
      diagnostics.push({
        type: 'error',
        file: fileLineErrorMatch[1].replace(/^\.\//, ''),
        line: parseInt(fileLineErrorMatch[2], 10),
        message: fileLineErrorMatch[3],
        raw: line,
      });
      continue;
    }

    // Traditional TeX error line format "! Error message" followed by "l.42 problematic text"
    if (line.startsWith('! ')) {
      const errorMsg = line.substring(2).trim();
      let lineNum = 1;
      let rawContext = line;

      // Look ahead up to 5 lines for "l.XX"
      for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
        const nextLine = lines[j];
        const lineMatch = nextLine.match(/^l\.(\d+)\s*(.*)$/);
        if (lineMatch) {
          lineNum = parseInt(lineMatch[1], 10);
          rawContext = `${line}\n${nextLine}`;
          break;
        }
      }

      diagnostics.push({
        type: 'error',
        file: currentFile,
        line: lineNum,
        message: errorMsg,
        raw: rawContext,
      });
      continue;
    }

    // LaTeX Warnings (e.g. LaTeX Warning: Reference `eq1` on page 1 undefined on input line 45.)
    if (line.includes('LaTeX Warning:') || line.includes('Package ') && line.includes('Warning:')) {
      const lineNumMatch = line.match(/input line (\d+)/i) || line.match(/line (\d+)/i);
      const lineNum = lineNumMatch ? parseInt(lineNumMatch[1], 10) : 1;

      diagnostics.push({
        type: 'warning',
        file: currentFile,
        line: lineNum,
        message: line.trim(),
        raw: line,
      });
    }
  }

  return diagnostics;
}

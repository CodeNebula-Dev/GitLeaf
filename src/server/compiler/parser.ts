import { CompilerDiagnostic } from '../../shared/types.js';

export function parseLatexLog(logContent: string, defaultFile: string = 'main.tex'): CompilerDiagnostic[] {
  const diagnostics: CompilerDiagnostic[] = [];
  const lines = logContent.split('\n');

  let currentFile = defaultFile;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // 1. Tectonic Error format: error: file.tex:line: message
    const tectonicErrorMatch = line.match(/^error:\s*(.+?):(\d+):\s*(.+)$/i);
    if (tectonicErrorMatch) {
      diagnostics.push({
        type: 'error',
        file: tectonicErrorMatch[1].trim(),
        line: parseInt(tectonicErrorMatch[2], 10),
        message: tectonicErrorMatch[3].trim(),
        raw: line,
      });
      continue;
    }

    // 2. Tectonic Warning format: warning: file.tex:line: message OR warning: message
    const tectonicWarnMatch = line.match(/^warning:\s*(?:(.+?):(\d+):\s*)?(.+)$/i);
    if (tectonicWarnMatch) {
      diagnostics.push({
        type: 'warning',
        file: tectonicWarnMatch[1]?.trim() || currentFile,
        line: tectonicWarnMatch[2] ? parseInt(tectonicWarnMatch[2], 10) : 1,
        message: tectonicWarnMatch[3].trim(),
        raw: line,
      });
      continue;
    }

    // 3. Skip info notes from Tectonic (e.g. note: Running TeX ...)
    if (line.startsWith('note:')) {
      continue;
    }

    // 4. File name tracking e.g. (./sections/intro.tex or (main.tex
    const fileMatch = line.match(/\(((\.?\/)?[\w-]+\/[\w-]+\.tex)/);
    if (fileMatch) {
      currentFile = fileMatch[1].replace(/^\.\//, '');
    }

    // 5. Standard TeX Warning line
    if (
      line.includes('LaTeX Warning:') ||
      line.includes('Package ') && line.includes('Warning:') ||
      line.includes('Overfull \\hbox') ||
      line.includes('Underfull \\hbox')
    ) {
      const lineNumMatch = line.match(/input line (\d+)/i) || line.match(/line (\d+)/i) || line.match(/lines (\d+)--\d+/i);
      const lineNum = lineNumMatch ? parseInt(lineNumMatch[1], 10) : 1;

      diagnostics.push({
        type: 'warning',
        file: currentFile,
        line: lineNum,
        message: line,
        raw: line,
      });
      continue;
    }

    // 6. Traditional TeX fatal error "! Error message" followed by "l.42 problematic text"
    if (line.startsWith('! ')) {
      const errorMsg = line.substring(2).trim();
      let lineNum = 1;
      let rawContext = line;

      // Look ahead up to 6 lines for "l.XX"
      for (let j = i + 1; j < Math.min(i + 7, lines.length); j++) {
        const nextLine = lines[j].trim();
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

    // 7. Standard pdflatex file:line: error format (e.g. ./main.tex:24: Undefined control sequence.)
    const fileLineErrorMatch = line.match(/^(\.?\/?[^:\s]+\.tex):(\d+):\s*(.+)$/i);
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
  }

  return diagnostics;
}

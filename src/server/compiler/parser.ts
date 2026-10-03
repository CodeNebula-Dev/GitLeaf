import { CompilerDiagnostic } from '../../shared/types.js';

export function parseLatexLog(
  logContent: string,
  defaultFile: string = 'main.tex',
  availableFiles: string[] = []
): CompilerDiagnostic[] {
  const rawDiagnostics: CompilerDiagnostic[] = [];
  const lines = logContent.split('\n');

  const fileStack: string[] = [defaultFile];
  let currentFile = defaultFile;

  // Normalization helper: maps log file paths (e.g. "./sections/intro.tex" or "intro.tex") to project files
  const normalizePath = (filePath: string): string => {
    const clean = filePath.replace(/^[./\\]+/, '').replace(/\\/g, '/').trim();
    if (!clean) return defaultFile;

    if (availableFiles.length > 0) {
      // 1. Exact match
      if (availableFiles.includes(clean)) return clean;
      // 2. Suffix match (e.g. "intro.tex" matches "sections/intro.tex")
      const matched = availableFiles.find(
        (f) => f === clean || f.endsWith(`/${clean}`) || clean.endsWith(`/${f}`)
      );
      if (matched) return matched;
    }
    return clean;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // 1. Tectonic Error format: error: file.tex:line: message
    const tectonicErrorMatch = line.match(/^error:\s*(.+?):(\d+):\s*(.+)$/i);
    if (tectonicErrorMatch) {
      const msg = tectonicErrorMatch[3].trim();

      // Demote box-overflow and other warning-class messages that Tectonic sometimes reports as "error:"
      const isActuallyWarning =
        /Overfull\s+\\[hv]box/i.test(msg) ||
        /Underfull\s+\\[hv]box/i.test(msg) ||
        /LaTeX Warning:/i.test(msg) ||
        /Package .+ Warning:/i.test(msg) ||
        /Font Warning:/i.test(msg);

      rawDiagnostics.push({
        type: isActuallyWarning ? 'warning' : 'error',
        file: normalizePath(tectonicErrorMatch[1]),
        line: parseInt(tectonicErrorMatch[2], 10),
        message: msg,
        raw: line,
      });
      continue;
    }

    // 2. Tectonic Warning format: warning: file.tex:line: message OR warning: message
    const tectonicWarnMatch = line.match(/^warning:\s*(?:(.+?):(\d+):\s*)?(.+)$/i);
    if (tectonicWarnMatch) {
      const warnMsg = tectonicWarnMatch[3].trim();
      // Skip benign rerun instructions that Tectonic resolves automatically
      if (
        warnMsg.includes('Rerun to get') ||
        warnMsg.includes('inputenc package ignored') ||
        warnMsg.includes('rerunfilecheck')
      ) {
        continue;
      }

      rawDiagnostics.push({
        type: 'warning',
        file: normalizePath(tectonicWarnMatch[1] || currentFile),
        line: tectonicWarnMatch[2] ? parseInt(tectonicWarnMatch[2], 10) : 1,
        message: warnMsg,
        raw: line,
      });
      continue;
    }

    // 3. Skip info notes from Tectonic (e.g. note: Running TeX ...)
    if (line.startsWith('note:')) {
      continue;
    }

    // 4. TeX file open/close tracking e.g. (./sections/intro.tex or (subfile.tex
    const fileOpenMatch = line.match(/\(([^\s()]+\.tex)/);
    if (fileOpenMatch) {
      const opened = normalizePath(fileOpenMatch[1]);
      fileStack.push(opened);
      currentFile = opened;
    }

    // Check for closing paren that might close the current file
    if (line.includes(')') && fileStack.length > 1) {
      const closeCount = (line.match(/\)/g) || []).length;
      const openCount = (line.match(/\(/g) || []).length;
      if (closeCount > openCount && fileStack.length > 1) {
        fileStack.pop();
        currentFile = fileStack[fileStack.length - 1];
      }
    }

    // 5. Standard TeX Warning line
    if (
      line.includes('LaTeX Warning:') ||
      (line.includes('Package ') && line.includes('Warning:')) ||
      line.includes('Overfull \\hbox') ||
      line.includes('Underfull \\hbox')
    ) {
      // Skip benign rerun instructions
      if (
        line.includes('Rerun to get') ||
        line.includes('inputenc package ignored') ||
        line.includes('rerunfilecheck')
      ) {
        continue;
      }

      const lineNumMatch =
        line.match(/input line (\d+)/i) ||
        line.match(/line (\d+)/i) ||
        line.match(/lines (\d+)--\d+/i);
      const lineNum = lineNumMatch ? parseInt(lineNumMatch[1], 10) : 1;

      rawDiagnostics.push({
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

      rawDiagnostics.push({
        type: 'error',
        file: currentFile,
        line: lineNum,
        message: errorMsg,
        raw: rawContext,
      });
      continue;
    }

    // 7. Standard pdflatex file:line: message format (e.g. ./main.tex:24: Undefined control sequence.)
    const fileLineErrorMatch = line.match(/^(\.?\/?[^:\s]+\.tex):(\d+):\s*(.+)$/i);
    if (fileLineErrorMatch) {
      const msg = fileLineErrorMatch[3].trim();

      // Determine if this is actually a warning rather than an error
      const isWarning =
        /Overfull\s+\\[hv]box/i.test(msg) ||
        /Underfull\s+\\[hv]box/i.test(msg) ||
        /LaTeX Warning:/i.test(msg) ||
        /Package .+ Warning:/i.test(msg) ||
        /Font Warning:/i.test(msg);

      // Skip entirely benign messages
      if (
        msg.includes('Rerun to get') ||
        msg.includes('inputenc package ignored') ||
        msg.includes('rerunfilecheck')
      ) {
        continue;
      }

      rawDiagnostics.push({
        type: isWarning ? 'warning' : 'error',
        file: normalizePath(fileLineErrorMatch[1]),
        line: parseInt(fileLineErrorMatch[2], 10),
        message: msg,
        raw: line,
      });
      continue;
    }
  }

  // Deduplicate diagnostics (type + file + line + simplified message)
  const seen = new Set<string>();
  const diagnostics: CompilerDiagnostic[] = [];

  for (const d of rawDiagnostics) {
    const simplifiedMsg = d.message.replace(/[^\w\s]/g, '').toLowerCase().slice(0, 30);
    const key = `${d.type}|${d.file}|${d.line}|${simplifiedMsg}`;
    if (!seen.has(key)) {
      seen.add(key);
      diagnostics.push(d);
    }
  }

  return diagnostics;
}

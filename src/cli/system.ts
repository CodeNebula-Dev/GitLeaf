import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface SystemTeXStatus {
  hasPdflatex: boolean;
  hasXelatex: boolean;
  hasLualatex: boolean;
  hasTectonic: boolean;
  tectonicPath?: string;
  pdflatexPath?: string;
  preferredEngine: 'pdflatex' | 'xelatex' | 'lualatex' | 'tectonic' | 'wasm';
  description: string;
}

export function detectSystemTeX(): SystemTeXStatus {
  const isWindows = process.platform === 'win32';
  const binName = isWindows ? (bin: string) => `${bin}.exe` : (bin: string) => bin;
  const checkBinary = (bin: string): { found: boolean; path?: string } => {
    // Check local bin directory first, then custom standard paths on macOS and Windows
    const candidatePaths = [
      path.resolve(process.cwd(), 'bin', binName(bin)),
      path.resolve(__dirname, '../../bin', binName(bin)),
      path.resolve(__dirname, '../../../bin', binName(bin)),
      `/opt/homebrew/bin/${bin}`,
      `/usr/local/bin/${bin}`,
      `/Library/TeX/texbin/${bin}`,
      `C:\\Program Files\\MiKTeX\\miktex\\bin\\x64\\${bin}.exe`,
      `C:\\Program Files (x86)\\MiKTeX\\miktex\\bin\\${bin}.exe`,
      `C:\\texlive\\2025\\bin\\windows\\${bin}.exe`,
      `C:\\texlive\\2024\\bin\\windows\\${bin}.exe`,
      `C:\\texlive\\2023\\bin\\windows\\${bin}.exe`,
      `C:\\tools\\tectonic\\${bin}.exe`,
    ];

    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        return { found: true, path: p };
      }
    }

    try {
      const lookupCmd = isWindows ? `where.exe ${bin}` : `which ${bin}`;
      const resolved = execSync(lookupCmd, { stdio: 'pipe' }).toString().trim().split('\r\n')[0].split('\n')[0];
      if (resolved && fs.existsSync(resolved)) {
        return { found: true, path: resolved };
      }
    } catch {}

    return { found: false };
  };

  const tectonicCheck = checkBinary('tectonic');
  const pdflatexCheck = checkBinary('pdflatex');
  const xelatexCheck = checkBinary('xelatex');
  const lualatexCheck = checkBinary('lualatex');

  let preferredEngine: 'pdflatex' | 'xelatex' | 'lualatex' | 'tectonic' | 'wasm' = 'wasm';
  let description = 'WASM Academic Engine (Zero-install ready)';

  if (tectonicCheck.found) {
    preferredEngine = 'tectonic';
    description = 'Tectonic Engine detected (Genuine TeX Compiler)';
  } else if (pdflatexCheck.found) {
    preferredEngine = 'pdflatex';
    description = 'pdflatex detected (Native TeX Live)';
  } else if (xelatexCheck.found) {
    preferredEngine = 'xelatex';
    description = 'xelatex detected (Unicode/OpenType TeX)';
  } else if (lualatexCheck.found) {
    preferredEngine = 'lualatex';
    description = 'lualatex detected (LuaTeX)';
  }

  return {
    hasPdflatex: pdflatexCheck.found,
    hasXelatex: xelatexCheck.found,
    hasLualatex: lualatexCheck.found,
    hasTectonic: tectonicCheck.found,
    tectonicPath: tectonicCheck.path,
    pdflatexPath: pdflatexCheck.path,
    preferredEngine,
    description,
  };
}

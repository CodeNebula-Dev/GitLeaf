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
  const userHome = process.env.USERPROFILE || process.env.HOME || '';
  const localAppData = process.env.LOCALAPPDATA || path.join(userHome, 'AppData', 'Local');

  const checkBinary = (bin: string): { found: boolean; path?: string } => {
    // Check local bin directory first, then standard paths on macOS and Windows
    const candidatePaths: string[] = [
      path.resolve(process.cwd(), 'bin', binName(bin)),
      path.resolve(__dirname, '../../bin', binName(bin)),
      path.resolve(__dirname, '../../../bin', binName(bin)),
    ];

    if (isWindows) {
      candidatePaths.push(
        // Scoop (most common on Windows for tectonic)
        path.join(userHome, 'scoop', 'shims', `${bin}.exe`),
        path.join(userHome, 'scoop', 'apps', bin, 'current', `${bin}.exe`),
        // Chocolatey
        `C:\\ProgramData\\chocolatey\\bin\\${bin}.exe`,
        // Cargo-installed tectonic
        path.join(userHome, '.cargo', 'bin', `${bin}.exe`),
        // Local AppData
        path.join(localAppData, 'Programs', bin, `${bin}.exe`),
        // MiKTeX
        `C:\\Program Files\\MiKTeX\\miktex\\bin\\x64\\${bin}.exe`,
        `C:\\Program Files (x86)\\MiKTeX\\miktex\\bin\\${bin}.exe`,
        path.join(localAppData, 'Programs', 'MiKTeX', 'miktex', 'bin', 'x64', `${bin}.exe`),
        // TeX Live
        `C:\\texlive\\2026\\bin\\windows\\${bin}.exe`,
        `C:\\texlive\\2025\\bin\\windows\\${bin}.exe`,
        `C:\\texlive\\2024\\bin\\windows\\${bin}.exe`,
        `C:\\texlive\\2023\\bin\\windows\\${bin}.exe`,
        `C:\\texlive\\2026\\bin\\win32\\${bin}.exe`,
        `C:\\texlive\\2025\\bin\\win32\\${bin}.exe`,
        `C:\\texlive\\2024\\bin\\win32\\${bin}.exe`,
        // Generic
        `C:\\tools\\tectonic\\${bin}.exe`,
      );
    } else {
      candidatePaths.push(
        `/opt/homebrew/bin/${bin}`,
        `/usr/local/bin/${bin}`,
        `/Library/TeX/texbin/${bin}`,
      );
    }

    for (const p of candidatePaths) {
      try {
        if (fs.existsSync(p)) {
          return { found: true, path: p };
        }
      } catch {}
    }

    try {
      const lookupCmd = isWindows ? `where.exe ${bin}` : `which ${bin}`;
      const resolved = execSync(lookupCmd, { stdio: 'pipe', timeout: 5000 }).toString().trim().split(/\r?\n/)[0];
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

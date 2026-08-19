import { execSync } from 'child_process';
import fs from 'fs';

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
  const checkBinary = (bin: string): { found: boolean; path?: string } => {
    // Check custom standard paths first on macOS
    const candidatePaths = [
      `/opt/homebrew/bin/${bin}`,
      `/usr/local/bin/${bin}`,
      `/Library/TeX/texbin/${bin}`,
    ];

    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        return { found: true, path: p };
      }
    }

    try {
      const resolved = execSync(`which ${bin}`, { stdio: 'pipe' }).toString().trim();
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

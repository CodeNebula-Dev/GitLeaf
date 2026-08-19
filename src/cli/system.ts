import { execSync } from 'child_process';

export interface SystemTeXStatus {
  hasPdflatex: boolean;
  hasXelatex: boolean;
  hasLualatex: boolean;
  hasTectonic: boolean;
  preferredEngine: 'pdflatex' | 'xelatex' | 'lualatex' | 'tectonic' | 'wasm';
  description: string;
}

export function detectSystemTeX(): SystemTeXStatus {
  const checkBinary = (bin: string): boolean => {
    try {
      execSync(`which ${bin}`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  };

  const hasPdflatex = checkBinary('pdflatex');
  const hasXelatex = checkBinary('xelatex');
  const hasLualatex = checkBinary('lualatex');
  const hasTectonic = checkBinary('tectonic');

  let preferredEngine: 'pdflatex' | 'xelatex' | 'lualatex' | 'tectonic' | 'wasm' = 'wasm';
  let description = 'WASM in-browser engine (Zero-install ready)';

  if (hasPdflatex) {
    preferredEngine = 'pdflatex';
    description = 'pdflatex detected (native fast-compile)';
  } else if (hasTectonic) {
    preferredEngine = 'tectonic';
    description = 'tectonic detected (modern native compiler)';
  } else if (hasXelatex) {
    preferredEngine = 'xelatex';
    description = 'xelatex detected (Unicode/OpenType ready)';
  } else if (hasLualatex) {
    preferredEngine = 'lualatex';
    description = 'lualatex detected (Lua scriptable TeX)';
  }

  return {
    hasPdflatex,
    hasXelatex,
    hasLualatex,
    hasTectonic,
    preferredEngine,
    description,
  };
}

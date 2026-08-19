export const ANSI = {
  green: '\x1b[38;2;34;197;94m',
  emerald: '\x1b[38;2;16;185;129m',
  cyan: '\x1b[38;2;45;212;191m',
  orange: '\x1b[38;2;249;115;22m',
  dim: '\x1b[38;2;100;116;139m',
  white: '\x1b[1;37m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
};

export interface BannerInfo {
  version: string;
  projectPath: string;
  clientUrl: string;
  wsUrl: string;
  compiler: string;
  collaborators: number;
}

export function printCliBanner(info: BannerInfo) {
  const { green, emerald, cyan, orange, dim, white, bold, reset } = ANSI;

  console.log(`
${dim}╭─────────────────────────────────────────────────────────────────────────────╮${reset}
${dim}│${reset}                                                                             ${dim}│${reset}
${dim}│${reset}   ${orange}██████╗ ██╗████████╗${reset}                                                     ${dim}│${reset}
${dim}│${reset}  ${orange}██╔════╝ ██║╚══██╔══╝${reset}       ${dim}════  ════  ════  ════  ════${reset}                   ${dim}│${reset}
${dim}│${reset}  ${orange}██║  ███╗██║   ██║${reset}         ${green}██╗     ███████╗ █████╗ ███████╗${reset}               ${dim}│${reset}
${dim}│${reset}  ${orange}██║   ██║██║   ██║${reset}         ${green}██║     ██╔════╝██╔══██╗██╔════╝${reset}               ${dim}│${reset}
${dim}│${reset}  ${orange}╚██████╔╝██║   ██║${reset}         ${green}██║     █████╗  ███████║█████╗${reset}                 ${dim}│${reset}
${dim}│${reset}   ${dim}═══════════════════${reset}       ${green}██║     ██╔══╝  ██╔══██║██╔══╝${reset}                 ${dim}│${reset}
${dim}│${reset}                             ${green}███████╗███████╗██║  ██║██║${reset}                     ${dim}│${reset}
${dim}│${reset}                             ${dim}════════════════════════════════${reset}               ${dim}│${reset}
${dim}│${reset}                                                                             ${dim}│${reset}
${dim}├─────────────────────────────────────────────────────────────────────────────┤${reset}
${dim}│${reset}  ${bold}GitLeaf v${info.version}${reset} ${dim}──${reset} ${emerald}Local-First Collaborative LaTeX Platform${reset}          ${dim}│${reset}
${dim}│${reset}                                                                             ${dim}│${reset}
${dim}│${reset}  ${dim}Local Workspace :${reset} ${white}${info.projectPath.padEnd(54)}${reset} ${dim}│${reset}
${dim}│${reset}  ${dim}Live Web UI     :${reset} ${cyan}${info.clientUrl.padEnd(54)}${reset} ${dim}│${reset}
${dim}│${reset}  ${dim}CRDT Sync Mesh  :${reset} ${green}● Ready${reset} ${dim}(${info.wsUrl})${reset}${' '.repeat(Math.max(0, 44 - info.wsUrl.length))}${dim}│${reset}
${dim}│${reset}  ${dim}LaTeX Compiler  :${reset} ${green}● ${info.compiler}${reset}${' '.repeat(Math.max(0, 52 - info.compiler.length))}${dim}│${reset}
${dim}│${reset}  ${dim}Team Limit      :${reset} ${green}Unlimited (0$ subscription)${reset}                              ${dim}│${reset}
${dim}╰─────────────────────────────────────────────────────────────────────────────╯${reset}
`);
}

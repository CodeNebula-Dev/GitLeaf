import { ProjectManager } from '../server/fs/manager.js';
import { LatexCompiler } from '../server/compiler/runner.js';
import { printCliBanner, ANSI } from './banner.js';
import { detectSystemTeX } from './system.js';
import { DEFAULT_CLIENT_PORT, DEFAULT_SERVER_PORT } from '../shared/constants.js';

const args = process.argv.slice(2);
const command = args[0] || 'status';

const projectManager = new ProjectManager();
const compiler = new LatexCompiler();

async function main() {
  const { green, orange, dim, white, bold, reset, cyan } = ANSI;

  switch (command) {
    case 'status':
    case 'open': {
      const tex = detectSystemTeX();
      printCliBanner({
        version: '0.1.0',
        projectPath: projectManager.getBaseDir(),
        clientUrl: `http://localhost:${DEFAULT_CLIENT_PORT}`,
        wsUrl: `ws://127.0.0.1:${DEFAULT_SERVER_PORT}/ws`,
        compiler: tex.description,
        collaborators: 1,
      });
      break;
    }

    case 'init': {
      const name = args[1] || 'My Research Paper';
      const template = args[2] || 'ieee-conference';
      const project = projectManager.createProject(name, template);
      console.log(`\n${green}✓ Created new GitLeaf project:${reset} ${bold}${project.name}${reset}`);
      console.log(`${dim}Location:${reset} ${white}${project.rootPath}${reset}`);
      console.log(`${dim}Template:${reset} ${cyan}${template}${reset}\n`);
      break;
    }

    case 'list': {
      const projects = projectManager.listProjects();
      console.log(`\n${bold}GitLeaf Local Projects (${projects.length}):${reset}`);
      console.log(`${dim}------------------------------------------------------------${reset}`);
      for (const p of projects) {
        console.log(`• ${green}${p.name}${reset} ${dim}(id: ${p.id})${reset}`);
        console.log(`  ${dim}Path: ${p.rootPath}${reset}`);
      }
      console.log('');
      break;
    }

    case 'compile': {
      const projects = projectManager.listProjects();
      if (projects.length === 0) {
        console.log(`${orange}No projects found to compile.${reset}`);
        return;
      }
      const target = projects[0];
      console.log(`\n${dim}Compiling ${target.name}...${reset}`);
      const result = await compiler.compile(target.rootPath, target.mainFile);
      if (result.success) {
        console.log(`${green}✓ Compilation succeeded in ${result.durationMs}ms${reset}`);
        if (result.pdfPath) console.log(`${dim}Output PDF:${reset} ${white}${result.pdfPath}${reset}\n`);
      } else {
        console.log(`${orange}✗ Compilation failed:${reset}`);
        for (const diag of result.diagnostics) {
          console.log(`  ${dim}${diag.file}:${diag.line}${reset} - ${diag.message}`);
        }
      }
      break;
    }

    default: {
      console.log(`
${bold}GitLeaf CLI Usage:${reset}
  gitleaf init <name> [template]   Create a new local LaTeX paper
  gitleaf list                     List all local projects
  gitleaf open                     Display status and launch URLs
  gitleaf compile                  Compile the current/latest project
`);
    }
  }
}

main().catch(console.error);

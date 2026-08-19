#!/usr/bin/env node
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cliPath = path.resolve(__dirname, '../src/cli/index.ts');

const isWindows = process.platform === 'win32';
const command = isWindows ? 'npx.cmd' : 'npx';

const result = spawnSync(command, ['tsx', cliPath, ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: isWindows,
  env: { ...process.env },
});

process.exit(result.status ?? 0);

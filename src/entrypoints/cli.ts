#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { installCliBrokenPipeExitHandlers } from './cli/broken-pipe.ts';

installCliBrokenPipeExitHandlers();

const cliEntryDir = path.dirname(fs.realpathSync(fileURLToPath(import.meta.url)));
const mainModuleExtension = path.extname(fileURLToPath(import.meta.url)) === '.ts' ? '.ts' : '.js';
const mainModuleUrl = pathToFileURL(path.join(cliEntryDir, 'cli', `main${mainModuleExtension}`)).href;
if (process.argv[2] === 'env' && process.argv[3] === 'run'
  && !process.argv.slice(4).includes('--help')) {
  const { runEnvironmentCommand } = await import('./cli/cases/runtime-environment-run-command.ts');
  try {
    await runEnvironmentCommand(process.argv.slice(4));
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ error: { code: 'runtime_environment_error', message: error instanceof Error ? error.message : String(error) } })}\n`);
    process.exitCode = 1;
  }
} else {
  const { main, handleCliMainError } = await import(mainModuleUrl);
  void main().catch(handleCliMainError);
}

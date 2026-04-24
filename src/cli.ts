#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const cliEntryDir = path.dirname(fs.realpathSync(fileURLToPath(import.meta.url)));
const mainModuleUrl = pathToFileURL(path.join(cliEntryDir, 'cli', 'main.ts')).href;
const { main, handleCliMainError } = await import(mainModuleUrl);

void main().catch(handleCliMainError);

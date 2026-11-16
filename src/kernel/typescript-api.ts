import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { API, type APIOptions } from 'typescript/unstable/sync';

function quoted(value: string) {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function nativeCompilerPath() {
  const packageName = `@typescript/typescript-${process.platform}-${process.arch}`;
  const manifest = fileURLToPath(import.meta.resolve(`${packageName}/package.json`));
  return path.join(path.dirname(manifest), 'lib', 'tsc');
}

/** Keep native compiler diagnostics separate from the caller's structured output. */
export function withTypescriptAPI<T>(options: APIOptions, read: (api: API) => T): T {
  // Windows uses the upstream named-pipe transport. The inherited stderr issue
  // observed here is the POSIX sync transport's signal-based shutdown path.
  if (process.platform === 'win32') {
    const api = new API(options);
    try { return read(api); } finally { api.close(); }
  }
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-typescript-api-'));
  const diagnostics = path.join(directory, 'stderr.log');
  const launcher = path.join(directory, 'tsc');
  let api: API | undefined;
  try {
    // exec preserves the API child's identity: close() terminates the compiler
    // itself, with no proxy process or pipe owner left behind.
    fs.writeFileSync(launcher, `#!/bin/sh\nexec ${quoted(options.tsserverPath ?? nativeCompilerPath())} "$@" 2>${quoted(diagnostics)}\n`, { mode: 0o700 });
    api = new API({ ...options, tsserverPath: launcher });
    return read(api);
  } catch (error) {
    let detail = '';
    try { detail = fs.readFileSync(diagnostics, 'utf8').trim().slice(-2_000); } catch { /* Startup may precede the log. */ }
    if (!detail) throw error;
    if (error instanceof Error) {
      error.message += `\nTypeScript native diagnostics: ${detail}`;
      throw error;
    }
    throw new Error(`${String(error)}\nTypeScript native diagnostics: ${detail}`, { cause: error });
  } finally {
    try { api?.close(); } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  }
}

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';

import { cliPath, repoRoot } from './constants.ts';

export function runCli(args: string[], envOverrides: Record<string, string> = {}) {
  return runCliInCwd(args, repoRoot, envOverrides);
}

export function runCliRaw(args: string[], envOverrides: Record<string, string> = {}) {
  return runCliRawInCwd(args, repoRoot, envOverrides);
}

export function runCliInCwd(
  args: string[],
  cwd: string,
  envOverrides: Record<string, string> = {},
) {
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', cliPath, ...args],
    {
      cwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        ...envOverrides,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

export function runCliRawInCwd(
  args: string[],
  cwd: string,
  envOverrides: Record<string, string> = {},
) {
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', cliPath, ...args],
    {
      cwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        ...envOverrides,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  return result;
}

export function runCliViaEntryPathInCwd(
  entryPath: string,
  args: string[],
  cwd: string,
  envOverrides: Record<string, string> = {},
) {
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', entryPath, ...args],
    {
      cwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        ...envOverrides,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

export function runCliFailure(args: string[], envOverrides: Record<string, string> = {}) {
  return runCliFailureInCwd(args, repoRoot, envOverrides);
}

export function runCliFailureInCwd(
  args: string[],
  cwd: string,
  envOverrides: Record<string, string> = {},
) {
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', cliPath, ...args],
    {
      cwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        ...envOverrides,
      },
    },
  );

  assert.notEqual(result.status, 0);
  return {
    status: result.status ?? 1,
    payload: JSON.parse(result.stderr),
  };
}

export async function runCliAsync(args: string[], envOverrides: Record<string, string> = {}) {
  return await new Promise<Record<string, unknown>>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--experimental-strip-types', cliPath, ...args],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          NODE_NO_WARNINGS: '1',
          ...envOverrides,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`CLI exited with code ${code}\nstdout=${stdout}\nstderr=${stderr}`));
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(error);
      }
    });
  });
}


import assert from 'node:assert/strict';
import {
  spawn,
  spawnSync,
  type SpawnSyncOptionsWithStringEncoding,
  type SpawnSyncReturns,
} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { parseJsonText } from '../../../../src/kernel/json-file.ts';

import { cliPath, repoRoot } from './constants.ts';

const CLI_TEST_MAX_BUFFER = 16 * 1024 * 1024;
const DEFAULT_CLI_TEST_TIMEOUT_MS = 30_000;
type InProcessCliResponse = {
  status: number;
  stdout: string;
  stderr: string;
};

let readOnlyInvocationQueue = Promise.resolve();
let isolatedStateDir: string | null = null;

type DetachedSpawnSyncOptions = SpawnSyncOptionsWithStringEncoding & {
  detached: true;
};

function cliTestStateDir() {
  if (!isolatedStateDir) {
    isolatedStateDir = fs.mkdtempSync(path.join(os.tmpdir(), `opl-cli-test-state-${process.pid}-`));
    process.once('exit', () => {
      if (isolatedStateDir) {
        fs.rmSync(isolatedStateDir, { recursive: true, force: true });
      }
    });
  }
  return isolatedStateDir;
}

function cliTestEnvOverrides(envOverrides: Record<string, string> = {}) {
  return {
    NODE_NO_WARNINGS: '1',
    OPL_STATE_DIR: cliTestStateDir(),
    ...envOverrides,
  };
}

function cliTestEnv(envOverrides: Record<string, string> = {}) {
  return {
    ...process.env,
    ...cliTestEnvOverrides(envOverrides),
  };
}

function cliTestTimeoutMs() {
  const raw = process.env.OPL_CLI_TEST_TIMEOUT_MS?.trim();
  if (!raw) {
    return DEFAULT_CLI_TEST_TIMEOUT_MS;
  }
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : DEFAULT_CLI_TEST_TIMEOUT_MS;
}

function spawnErrorCode(error: Error | undefined) {
  return error && 'code' in error ? String((error as NodeJS.ErrnoException).code) : null;
}

function cleanupTimedOutCli(result: SpawnSyncReturns<string>) {
  if (spawnErrorCode(result.error) !== 'ETIMEDOUT' || !result.pid) {
    return;
  }
  try {
    process.kill(-result.pid, 'SIGKILL');
  } catch {
    try {
      process.kill(result.pid, 'SIGKILL');
    } catch {
      // The assertion below reports the timed-out command; cleanup is best-effort.
    }
  }
}

function cliFailureMessage(
  args: string[],
  result: Pick<SpawnSyncReturns<string>, 'status' | 'stdout' | 'stderr'>
    & Partial<Pick<SpawnSyncReturns<string>, 'error' | 'signal'>>,
) {
  return [
    `CLI command failed: opl ${args.join(' ')}`,
    result.error ? `error=${result.error.message}` : null,
    `status=${result.status ?? 'null'}`,
    result.signal ? `signal=${result.signal}` : null,
    result.stdout ? `stdout=${result.stdout}` : null,
    result.stderr ? `stderr=${result.stderr}` : null,
  ].filter(Boolean).join('\n');
}

function runCliProcess(args: string[], cwd: string, envOverrides: Record<string, string> = {}) {
  const options: DetachedSpawnSyncOptions = {
    cwd,
    encoding: 'utf8',
    maxBuffer: CLI_TEST_MAX_BUFFER,
    env: cliTestEnv(envOverrides),
    timeout: cliTestTimeoutMs(),
    detached: true,
    killSignal: 'SIGTERM',
  };
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', cliPath, ...args],
    options,
  );
  cleanupTimedOutCli(result);
  return result;
}

export function runCli(args: string[], envOverrides: Record<string, string> = {}) {
  return runCliInCwd(args, repoRoot, envOverrides);
}

export async function runCliReadOnly(args: string[], envOverrides: Record<string, string> = {}) {
  return runCliReadOnlyInCwd(args, repoRoot, envOverrides);
}

export async function runCliReadOnlyInCwd(
  args: string[],
  cwd: string,
  envOverrides: Record<string, string> = {},
) {
  const result = await runCliReadOnlyRequest(args, cwd, envOverrides);
  assert.equal(result.status, 0, cliFailureMessage(args, result));
  return parseJsonText(result.stdout) as any;
}

export function runCliRaw(args: string[], envOverrides: Record<string, string> = {}) {
  return runCliRawInCwd(args, repoRoot, envOverrides);
}

export function runCliInCwd(
  args: string[],
  cwd: string,
  envOverrides: Record<string, string> = {},
) {
  const result = runCliProcess(args, cwd, envOverrides);

  assert.equal(result.status, 0, cliFailureMessage(args, result));
  return parseJsonText(result.stdout) as any;
}

export function runCliRawInCwd(
  args: string[],
  cwd: string,
  envOverrides: Record<string, string> = {},
) {
  const result = runCliProcess(args, cwd, envOverrides);

  assert.equal(result.status, 0, cliFailureMessage(args, result));
  return result;
}

export function runCliViaEntryPathInCwd(
  entryPath: string,
  args: string[],
  cwd: string,
  envOverrides: Record<string, string> = {},
) {
  const options: DetachedSpawnSyncOptions = {
    cwd,
    encoding: 'utf8',
    maxBuffer: CLI_TEST_MAX_BUFFER,
    env: cliTestEnv(envOverrides),
    timeout: cliTestTimeoutMs(),
    detached: true,
    killSignal: 'SIGTERM',
  };
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', entryPath, ...args],
    options,
  );
  cleanupTimedOutCli(result);

  assert.equal(result.status, 0, cliFailureMessage(args, result));
  return parseJsonText(result.stdout) as any;
}

export function runCliFailure(args: string[], envOverrides: Record<string, string> = {}) {
  return runCliFailureInCwd(args, repoRoot, envOverrides);
}

export async function runCliReadOnlyFailure(args: string[], envOverrides: Record<string, string> = {}) {
  return runCliReadOnlyFailureInCwd(args, repoRoot, envOverrides);
}

export async function runCliReadOnlyFailureInCwd(
  args: string[],
  cwd: string,
  envOverrides: Record<string, string> = {},
) {
  const result = await runCliReadOnlyRequest(args, cwd, envOverrides);
  assert.notEqual(result.status, 0);
  return {
    status: result.status,
    payload: parseJsonText(result.stderr) as any,
  };
}

export function runCliFailureInCwd(
  args: string[],
  cwd: string,
  envOverrides: Record<string, string> = {},
) {
  const result = runCliProcess(args, cwd, envOverrides);

  assert.notEqual(result.status, 0);
  return {
    status: result.status ?? 1,
    payload: parseJsonText(result.stderr) as any,
  };
}

export async function runCliAsync(args: string[], envOverrides: Record<string, string> = {}) {
  return await new Promise<Record<string, unknown>>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--experimental-strip-types', cliPath, ...args],
      {
        cwd: repoRoot,
        env: cliTestEnv(envOverrides),
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true,
      },
    );
    const timeout = setTimeout(() => {
      try {
        process.kill(-child.pid!, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
      reject(new Error(`CLI timed out after ${cliTestTimeoutMs()}ms: opl ${args.join(' ')}`));
    }, cliTestTimeoutMs());

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
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`CLI exited with code ${code}: opl ${args.join(' ')}\nstdout=${stdout}\nstderr=${stderr}`));
        return;
      }

      try {
        resolve(parseJsonText(stdout) as Record<string, unknown>);
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function runCliReadOnlyRequest(
  args: string[],
  cwd: string,
  envOverrides: Record<string, string>,
): Promise<InProcessCliResponse> {
  const invocation = readOnlyInvocationQueue.then(async () => {
    const originalCwd = process.cwd();
    const originalEnv = new Map<string, string | undefined>();
    let stdout = '';
    let stderr = '';
    let status = 0;

    try {
      process.chdir(cwd);
      for (const [name, value] of Object.entries(cliTestEnvOverrides(envOverrides))) {
        originalEnv.set(name, process.env[name]);
        process.env[name] = value;
      }
      const { main } = await import('../../../../src/entrypoints/cli/main.ts');
      await main({
        argv: args,
        stdout: { write: (chunk) => { stdout += String(chunk); return true; } },
        stdoutIsTTY: false,
      });
    } catch (error) {
      const { handleCliMainError } = await import('../../../../src/entrypoints/cli/main.ts');
      handleCliMainError(error, {
        stderr: { write: (chunk) => { stderr += String(chunk); return true; } },
        setExitCode: (exitCode) => { status = exitCode; },
      });
    } finally {
      for (const [name, value] of originalEnv) {
        if (value === undefined) {
          delete process.env[name];
        } else {
          process.env[name] = value;
        }
      }
      process.chdir(originalCwd);
    }

    return { status, stdout, stderr };
  });
  readOnlyInvocationQueue = invocation.then(() => undefined, () => undefined);
  return await invocation;
}

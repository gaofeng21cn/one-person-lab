import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { isRecord } from '@opl/core';
import { isWithinDirectory, resolveSafePackagePath, type ModuleOrCommandEntrypoint } from '@opl/pack';
import { DaemonRpcError } from '../errors.ts';

const DEFAULT_SUBPROCESS_TIMEOUT_MS = 10_000;
const MAX_STDOUT_BYTES = 2 * 1024 * 1024;
const MAX_STDERR_BYTES = 512 * 1024;

export interface SubprocessExecutionResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

function spawnWithStdin(
  command: string,
  args: readonly string[],
  options: {
    readonly cwd: string;
    readonly stdinText?: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly timeoutMs?: number;
  },
): Promise<SubprocessExecutionResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_SUBPROCESS_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGTERM');
      reject(new DaemonRpcError(-32000, 'ENTRYPOINT_TIMEOUT', `Entrypoint timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      if (stdout.length < MAX_STDOUT_BYTES) stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      if (stderr.length < MAX_STDERR_BYTES) stderr += chunk;
    });
    child.once('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new DaemonRpcError(-32000, 'ENTRYPOINT_SPAWN_FAILED', err.message));
    });
    child.once('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr,
      });
    });

    child.stdin.on('error', () => {
      // Ignore EPIPE when child closes stdin early
    });
    if (options.stdinText !== undefined) {
      child.stdin.write(options.stdinText);
    }
    child.stdin.end();
  });
}

function resolveCliExecutable(packageRoot: string, rawExecutable: string): string {
  if (rawExecutable.startsWith('./') || rawExecutable.startsWith('../') || rawExecutable.includes('/')) {
    if (path.isAbsolute(rawExecutable)) {
      const realRoot = fs.realpathSync(packageRoot);
      const resolved = path.resolve(rawExecutable);
      if (!isWithinDirectory(realRoot, resolved)) {
        throw new DaemonRpcError(
          -32003,
          'ENTRYPOINT_ESCAPE',
          `CLI entrypoint '${rawExecutable}' escapes package root.`,
        );
      }
      return resolved;
    }
    return resolveSafePackagePath(packageRoot, rawExecutable, { allowSymlinks: true });
  }
  return rawExecutable;
}

export async function runCliEntrypoint(
  packageRoot: string,
  entrypoint: { readonly argv: readonly string[]; readonly transport?: 'stdin_json_stdout_json' | 'argv_json' },
  payload: unknown,
  options: { readonly extraArgs?: readonly string[]; readonly timeoutMs?: number; readonly env?: NodeJS.ProcessEnv } = {},
): Promise<unknown> {
  if (!Array.isArray(entrypoint.argv) || entrypoint.argv.length === 0) {
    throw new DaemonRpcError(-32602, 'INVALID_ENTRYPOINT', 'CLI entrypoint requires non-empty argv.');
  }
  const executable = resolveCliExecutable(packageRoot, entrypoint.argv[0]!);
  const args = [...entrypoint.argv.slice(1), ...(options.extraArgs ?? [])];

  if (entrypoint.transport === 'argv_json') {
    args.push(JSON.stringify(payload));
  }

  const res = await spawnWithStdin(executable, args, {
    cwd: packageRoot,
    env: options.env,
    stdinText: entrypoint.transport === 'argv_json' ? undefined : `${JSON.stringify(payload)}\n`,
    timeoutMs: options.timeoutMs,
  });

  if (res.exitCode !== 0) {
    throw new DaemonRpcError(
      -32000,
      'ENTRYPOINT_FAILED',
      `CLI entrypoint exited with ${res.exitCode}: ${res.stderr.trim() || res.stdout.trim() || 'unknown error'}`,
    );
  }

  const trimmed = res.stdout.trim();
  if (!trimmed) return { ok: true };
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return { ok: true, output: trimmed };
  }
}

const ESM_RUNNER_SCRIPT = [
  "import fs from 'node:fs';",
  "import { pathToFileURL } from 'node:url';",
  'const [modPath, exportName, mode] = process.argv.slice(1);',
  'const stdinRaw = fs.readFileSync(0, "utf8").trim();',
  'const payload = stdinRaw ? JSON.parse(stdinRaw) : {};',
  'const mod = await import(pathToFileURL(modPath).href);',
  'const fn = exportName === "default" ? mod.default : mod[exportName];',
  'if (typeof fn !== "function") {',
  '  throw new Error(`Export "${exportName}" is not a function in ${modPath}`);',
  '}',
  'if (mode === "probe_cli_ext") {',
  '  const desc = await fn(payload);',
  '  process.stdout.write(JSON.stringify({',
  '    ok: true,',
  '    namespace: desc?.namespace ?? null,',
  '    commands: Array.isArray(desc?.commands) ? desc.commands : Object.keys(desc?.handlers ?? {}),',
  '    description: typeof desc?.description === "string" ? desc.description : null,',
  '  }) + "\\n");',
  '} else if (mode === "invoke_cli_ext") {',
  '  const desc = await fn(payload.context ?? {});',
  '  const cmd = payload.command;',
  '  const handler = desc?.handlers?.[cmd];',
  '  if (typeof handler !== "function") {',
  '    throw new Error(`Unknown extension command "${cmd}"`);',
  '  }',
  '  const out = await handler(payload.args ?? [], payload.options ?? {});',
  '  process.stdout.write(JSON.stringify(out === undefined ? { ok: true } : out) + "\\n");',
  '} else {',
  '  const out = await fn(payload);',
  '  process.stdout.write(JSON.stringify(out === undefined ? { ok: true } : out) + "\\n");',
  '}',
].join('\n');

export async function runEsmEntrypoint(
  packageRoot: string,
  entrypoint: { readonly module: string; readonly export: string },
  mode: 'probe_cli_ext' | 'invoke_cli_ext' | 'call',
  payload: unknown,
  options: { readonly timeoutMs?: number; readonly env?: NodeJS.ProcessEnv } = {},
): Promise<unknown> {
  const modPath = resolveSafePackagePath(packageRoot, entrypoint.module, { allowSymlinks: true });
  if (!fs.existsSync(modPath)) {
    throw new DaemonRpcError(
      -32602,
      'INVALID_ENTRYPOINT',
      `Module entrypoint does not exist: ${entrypoint.module}`,
    );
  }

  const res = await spawnWithStdin(
    process.execPath,
    ['--input-type=module', '-e', ESM_RUNNER_SCRIPT, modPath, entrypoint.export, mode],
    {
      cwd: packageRoot,
      stdinText: JSON.stringify(payload ?? {}),
      timeoutMs: options.timeoutMs,
      env: options.env,
    },
  );

  if (res.exitCode !== 0) {
    throw new DaemonRpcError(
      -32000,
      'ENTRYPOINT_FAILED',
      `ESM entrypoint '${entrypoint.module}#${entrypoint.export}' failed (exit ${res.exitCode}): ${res.stderr.trim() || res.stdout.trim()}`,
    );
  }

  const trimmed = res.stdout.trim();
  if (!trimmed) return { ok: true };
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    throw new DaemonRpcError(
      -32000,
      'INVALID_ENTRYPOINT_OUTPUT',
      `ESM entrypoint '${entrypoint.module}#${entrypoint.export}' emitted non-JSON output.`,
    );
  }
}

export async function runModuleOrCommandEntrypoint(
  packageRoot: string,
  entrypoint: ModuleOrCommandEntrypoint,
  payload: unknown,
  options: { readonly timeoutMs?: number; readonly env?: NodeJS.ProcessEnv } = {},
): Promise<unknown> {
  if (entrypoint.kind === 'cli') {
    return runCliEntrypoint(packageRoot, entrypoint, payload, options);
  }
  const out = await runEsmEntrypoint(packageRoot, entrypoint, 'call', payload, options);
  if (!isRecord(out)) return { ok: true, result: out };
  return out;
}

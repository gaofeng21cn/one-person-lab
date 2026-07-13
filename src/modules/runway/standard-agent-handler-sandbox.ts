import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { canonicalJsonText } from '../../kernel/canonical-json.ts';
import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';

const DEFAULT_HANDLER_TIMEOUT_MS = 120_000;
const DEFAULT_HANDLER_MAX_BUFFER = 16 * 1024 * 1024;
const SANDBOX_PROFILE = '(version 1) (allow default) (deny network*) (deny file-write*)';

export type StandardAgentHandlerBinding =
  | {
      kind: 'typescript_export';
      file: string;
      export: string;
    }
  | {
      kind: 'python_callable';
      module: string;
      callable: string;
    };

export type StandardAgentHandlerSandboxReceipt = {
  runtime_kind: 'node_permission_model' | 'python_audit_hook';
  sandbox_kind: 'macos_sandbox_exec';
  exit_code: number;
  timed_out: boolean;
  stdout_bytes: Buffer;
  stderr: string;
  output: unknown;
};

const NODE_BRIDGE = String.raw`
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

function canonical(value, at = '$') {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('non-finite number at ' + at);
    return value;
  }
  if (Array.isArray(value)) return value.map((entry, index) => canonical(entry, at + '/' + index));
  if (typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => {
      const entry = value[key];
      if (entry === undefined || ['bigint', 'function', 'symbol'].includes(typeof entry)) {
        throw new Error('unsupported JSON value at ' + at + '/' + key);
      }
      return [key, canonical(entry, at + '/' + key)];
    }));
  }
  throw new Error('unsupported JSON value at ' + at);
}

const originalWrite = process.stdout.write.bind(process.stdout);
const captured = [];
process.stdout.write = ((chunk, encoding, callback) => {
  captured.push(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk));
  if (typeof callback === 'function') callback();
  return true;
});

try {
  const [modulePath, exportName] = process.argv.slice(1);
  const request = JSON.parse(fs.readFileSync(0, 'utf8'));
  const imported = await import(pathToFileURL(modulePath).href);
  const handler = imported[exportName];
  if (typeof handler !== 'function') throw new Error('handler export is not callable: ' + exportName);
  const result = await handler(request);
  if (captured.some((entry) => entry.length > 0)) throw new Error('handler wrote to stdout');
  const encoded = JSON.stringify(canonical(result));
  process.stdout.write = originalWrite;
  originalWrite(encoded + '\n');
} catch (error) {
  process.stdout.write = originalWrite;
  process.stderr.write(JSON.stringify({
    surface_kind: 'opl_standard_agent_handler_failure',
    reason: error instanceof Error ? error.message : String(error),
  }) + '\n');
  process.exitCode = 1;
}
`;

const PYTHON_BRIDGE = String.raw`
import asyncio
import importlib
import inspect
import io
import json
import os
import sys
from contextlib import redirect_stdout

def deny(event, args):
    if event == "open":
        mode = args[1] if len(args) > 1 else "r"
        if isinstance(mode, str) and any(flag in mode for flag in ("w", "a", "x", "+")):
            raise PermissionError("filesystem write denied")
    if event in {"os.remove", "os.rename", "os.replace", "os.rmdir", "os.mkdir", "os.link", "os.symlink", "os.truncate"}:
        raise PermissionError("filesystem mutation denied")
    if event.startswith("socket.") or event in {"subprocess.Popen", "os.system", "os.posix_spawn", "os.posix_spawnp", "os.exec", "os.fork", "os.forkpty"}:
        raise PermissionError("network or subprocess denied")

def canonical_text(value):
    return json.dumps(value, ensure_ascii=False, allow_nan=False, sort_keys=True, separators=(",", ":"))

sys.addaudithook(deny)
checkout, module_name, callable_name = sys.argv[1:4]
for candidate in (checkout, os.path.join(checkout, "src"), os.path.join(checkout, "python")):
    if os.path.isdir(candidate):
        sys.path.insert(0, candidate)

try:
    request = json.loads(sys.stdin.read())
    captured = io.StringIO()
    with redirect_stdout(captured):
        module = importlib.import_module(module_name)
        handler = getattr(module, callable_name)
        result = handler(request)
        if inspect.isawaitable(result):
            result = asyncio.run(result)
    if captured.getvalue():
        raise RuntimeError("handler wrote to stdout")
    sys.stdout.write(canonical_text(result) + "\n")
except Exception as error:
    sys.stderr.write(canonical_text({
        "surface_kind": "opl_standard_agent_handler_failure",
        "reason": str(error),
    }) + "\n")
    raise SystemExit(1)
`;

function invalid(message: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, details);
}

function containedSourceFile(checkoutRoot: string, relativeFile: string) {
  if (!relativeFile.trim() || path.isAbsolute(relativeFile) || relativeFile.includes('\0')) {
    invalid('TypeScript handler file must be a managed-checkout-relative path.', { file: relativeFile });
  }
  const realRoot = fs.realpathSync.native(checkoutRoot);
  const resolved = path.resolve(realRoot, relativeFile);
  let realFile: string;
  try {
    realFile = fs.realpathSync.native(resolved);
  } catch {
    invalid('TypeScript handler file does not exist.', { file: relativeFile });
  }
  const relative = path.relative(realRoot, realFile!);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    invalid('TypeScript handler file escapes the managed checkout.', { file: relativeFile });
  }
  if (!/\.[cm]?[jt]sx?$/.test(realFile!)) {
    invalid('TypeScript handler binding must target a JavaScript or TypeScript module.', { file: relativeFile });
  }
  return { realRoot, realFile: realFile! };
}

function timeoutMs(value?: number) {
  const resolved = value ?? DEFAULT_HANDLER_TIMEOUT_MS;
  if (!Number.isSafeInteger(resolved) || resolved < 1) {
    invalid('Standard Agent handler timeout must be a positive integer.', { timeout_ms: value });
  }
  return resolved;
}

function controlledEnv(extra: NodeJS.ProcessEnv = {}) {
  return {
    PATH: process.env.PATH ?? '/usr/bin:/bin',
    HOME: process.env.HOME ?? '/',
    LANG: process.env.LANG ?? 'C.UTF-8',
    LC_ALL: process.env.LC_ALL ?? process.env.LANG ?? 'C.UTF-8',
    TMPDIR: process.env.TMPDIR ?? '/tmp',
    ...extra,
  };
}

function resolvePython(checkoutRoot: string) {
  const candidates = [
    process.env.OPL_STANDARD_AGENT_PYTHON,
    path.join(checkoutRoot, '.venv', 'bin', 'python'),
    path.join(checkoutRoot, '.venv', 'bin', 'python3'),
    '/opt/homebrew/bin/python3',
    '/usr/bin/python3',
  ].filter((entry): entry is string => Boolean(entry));
  const selected = candidates.find((entry) => entry.includes(path.sep) ? fs.existsSync(entry) : true);
  if (!selected) {
    throw new FrameworkContractError('surface_not_found', 'No Python runtime is available for the Standard Agent handler.', {
      checkout_root: checkoutRoot,
    });
  }
  return selected;
}

function parseSingleCanonicalJson(stdout: string) {
  const trimmed = stdout.trim();
  if (!trimmed || trimmed.includes('\n')) {
    invalid('Standard Agent handler stdout must contain exactly one JSON value.', {
      stdout_line_count: trimmed ? trimmed.split(/\r?\n/).length : 0,
    });
  }
  let output: unknown;
  try {
    output = parseJsonText(trimmed);
  } catch (error) {
    invalid('Standard Agent handler stdout is not valid JSON.', {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (canonicalJsonText(output) !== trimmed) {
    invalid('Standard Agent handler stdout is not canonical JSON.');
  }
  return output;
}

function processFailure(result: ReturnType<typeof spawnSync>, runtimeKind: string, timeout: number): never {
  const timedOut = result.error && 'code' in result.error && result.error.code === 'ETIMEDOUT';
  throw new FrameworkContractError('contract_shape_invalid', 'Standard Agent handler execution failed closed.', {
    runtime_kind: runtimeKind,
    exit_code: timedOut ? 124 : result.status ?? 1,
    timed_out: Boolean(timedOut),
    timeout_ms: timeout,
    signal: result.signal ?? null,
    stderr: String(result.stderr ?? '').trim().slice(0, 2_000),
    failure_code: 'standard_agent_handler_execution_failed',
  });
}

export function runStandardAgentHandlerSandbox(input: {
  checkoutRoot: string;
  binding: StandardAgentHandlerBinding;
  request: unknown;
  readRoots?: string[];
  timeoutMs?: number;
}): StandardAgentHandlerSandboxReceipt {
  const checkoutRoot = fs.realpathSync.native(input.checkoutRoot);
  const readRoots = [...new Set([
    checkoutRoot,
    ...(input.readRoots ?? []).map((entry) => fs.realpathSync.native(entry)),
  ])];
  const requestBytes = Buffer.from(`${canonicalJsonText(input.request)}\n`, 'utf8');
  const timeout = timeoutMs(input.timeoutMs);
  const commonOptions = {
    cwd: checkoutRoot,
    input: requestBytes,
    encoding: 'utf8' as const,
    env: controlledEnv({ PYTHONDONTWRITEBYTECODE: '1' }),
    maxBuffer: DEFAULT_HANDLER_MAX_BUFFER,
    timeout,
    killSignal: 'SIGKILL' as const,
  };

  if (input.binding.kind === 'typescript_export') {
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(input.binding.export)) {
      invalid('TypeScript handler export name is invalid.', { export: input.binding.export });
    }
    const target = containedSourceFile(checkoutRoot, input.binding.file);
    const result = spawnSync('/usr/bin/sandbox-exec', [
      '-p',
      SANDBOX_PROFILE,
      process.execPath,
      '--permission',
      ...readRoots.map((root) => `--allow-fs-read=${root}`),
      '--experimental-strip-types',
      '--input-type=module',
      '--eval',
      NODE_BRIDGE,
      target.realFile,
      input.binding.export,
    ], commonOptions);
    if (result.status !== 0 || result.error) processFailure(result, 'node_permission_model', timeout);
    const output = parseSingleCanonicalJson(result.stdout ?? '');
    return {
      runtime_kind: 'node_permission_model',
      sandbox_kind: 'macos_sandbox_exec',
      exit_code: 0,
      timed_out: false,
      stdout_bytes: Buffer.from(result.stdout ?? '', 'utf8'),
      stderr: result.stderr ?? '',
      output,
    };
  }

  if (!/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.test(input.binding.module)) {
    invalid('Python handler module is invalid.', { module: input.binding.module });
  }
  if (!/^[A-Za-z_]\w*$/.test(input.binding.callable)) {
    invalid('Python handler callable is invalid.', { callable: input.binding.callable });
  }
  const python = resolvePython(checkoutRoot);
  const result = spawnSync('/usr/bin/sandbox-exec', [
    '-p',
    SANDBOX_PROFILE,
    python,
    '-I',
    '-B',
    '-c',
    PYTHON_BRIDGE,
    checkoutRoot,
    input.binding.module,
    input.binding.callable,
  ], commonOptions);
  if (result.status !== 0 || result.error) processFailure(result, 'python_audit_hook', timeout);
  const output = parseSingleCanonicalJson(result.stdout ?? '');
  return {
    runtime_kind: 'python_audit_hook',
    sandbox_kind: 'macos_sandbox_exec',
    exit_code: 0,
    timed_out: false,
    stdout_bytes: Buffer.from(result.stdout ?? '', 'utf8'),
    stderr: result.stderr ?? '',
    output,
  };
}

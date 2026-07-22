import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { canonicalJsonText } from '../../kernel/canonical-json.ts';
import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';

const DEFAULT_HANDLER_TIMEOUT_MS = 120_000;
const DEFAULT_HANDLER_MAX_BUFFER = 16 * 1024 * 1024;
const BASE_SANDBOX_PROFILE = '(version 1) (allow default) (deny network*) (deny file-write*)';

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
        deny_workspace_read(args[0] if args else None)
    if event in {"os.listdir", "os.scandir", "os.chdir"}:
        deny_workspace_read(args[0] if args else None)
    if event in {"os.remove", "os.rename", "os.replace", "os.rmdir", "os.mkdir", "os.link", "os.symlink", "os.truncate"}:
        raise PermissionError("filesystem mutation denied")
    if event.startswith("socket.") or event in {"subprocess.Popen", "os.system", "os.posix_spawn", "os.posix_spawnp", "os.exec", "os.fork", "os.forkpty"}:
        raise PermissionError("network or subprocess denied")

def contained(root, candidate):
    try:
        return os.path.commonpath((root, candidate)) == root
    except (TypeError, ValueError):
        return False

def deny_workspace_read(candidate):
    if isinstance(candidate, int) or candidate is None:
        return
    try:
        resolved = os.path.realpath(os.fsdecode(os.fspath(candidate)))
    except (TypeError, ValueError):
        raise PermissionError("workspace read path is invalid")
    if contained(workspace_root, resolved) and not any(contained(root, resolved) for root in allowed_read_roots):
        raise PermissionError("workspace read outside the handler scope denied")

def canonical_text(value):
    return json.dumps(value, ensure_ascii=False, allow_nan=False, sort_keys=True, separators=(",", ":"))

checkout, module_name, callable_name, workspace_root, workspace_read_root = sys.argv[1:6]
workspace_root = os.path.realpath(workspace_root)
allowed_read_roots = tuple(os.path.realpath(root) for root in (checkout, workspace_read_root))
sys.addaudithook(deny)
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

function physicalDirectory(value: string, label: string, failureCode: string) {
  if (!path.isAbsolute(value) || value.includes('\0')) {
    invalid(`${label} must be an absolute physical directory.`, { path: value });
  }
  let realPath: string;
  try {
    realPath = fs.realpathSync.native(value);
  } catch (error) {
    invalid(`${label} does not exist.`, {
      path: value,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (!fs.statSync(realPath!).isDirectory()) {
    invalid(`${label} must be a directory.`, { path: value });
  }
  if (path.resolve(value) !== realPath) {
    invalid(`${label} must be its current physical canonical path.`, {
      path: value,
      resolved_path: realPath,
      failure_code: failureCode,
    });
  }
  return realPath!;
}

function canonicalDescendant(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function sandboxProfile(input: {
  checkoutRoot: string;
  workspaceRoot: string;
  workspaceReadRoot: string;
}) {
  if (input.workspaceReadRoot === input.workspaceRoot) return BASE_SANDBOX_PROFILE;
  const allowedWorkspaceRoots = [input.workspaceReadRoot];
  if (canonicalDescendant(input.workspaceRoot, input.checkoutRoot)) {
    allowedWorkspaceRoots.push(input.checkoutRoot);
  }
  const allowed = allowedWorkspaceRoots.length === 1
    ? `(subpath ${JSON.stringify(allowedWorkspaceRoots[0])})`
    : `(require-any ${allowedWorkspaceRoots.map((root) => `(subpath ${JSON.stringify(root)})`).join(' ')})`;
  return [
    BASE_SANDBOX_PROFILE,
    `(deny file-read* (require-all (subpath ${JSON.stringify(input.workspaceRoot)}) (require-not ${allowed})))`,
  ].join(' ');
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
  workspaceRoot: string;
  workspaceReadRoot: string;
  binding: StandardAgentHandlerBinding;
  request: unknown;
  timeoutMs?: number;
}): StandardAgentHandlerSandboxReceipt {
  const checkoutRoot = physicalDirectory(
    input.checkoutRoot,
    'Standard Agent handler checkout root',
    'standard_agent_handler_checkout_root_not_canonical',
  );
  const workspaceRoot = physicalDirectory(
    input.workspaceRoot,
    'Standard Agent handler workspace root',
    'standard_agent_handler_workspace_root_not_canonical',
  );
  const workspaceReadRoot = physicalDirectory(
    input.workspaceReadRoot,
    'Standard Agent handler workspace read root',
    'standard_agent_handler_read_root_not_canonical',
  );
  if (!canonicalDescendant(workspaceRoot, workspaceReadRoot)) {
    invalid('Standard Agent handler workspace read root escapes the workspace.', {
      workspace_root: workspaceRoot,
      workspace_read_root: workspaceReadRoot,
      failure_code: 'standard_agent_handler_read_root_escape',
    });
  }
  const readRoots = [...new Set([checkoutRoot, workspaceReadRoot])];
  const profile = sandboxProfile({ checkoutRoot, workspaceRoot, workspaceReadRoot });
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
      profile,
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
    profile,
    python,
    '-I',
    '-B',
    '-c',
    PYTHON_BRIDGE,
    checkoutRoot,
    input.binding.module,
    input.binding.callable,
    workspaceRoot,
    workspaceReadRoot,
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

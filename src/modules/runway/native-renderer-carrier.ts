import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';

import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';

export const NATIVE_RENDERER_EXECUTION_CONTRACT_REF =
  'contracts/opl-framework/native-renderer-execution-contract.json';

const RECEIPT_VERSION = 'opl-native-renderer-execution-receipt.v1';
const ALLOWED_TOOLS = new Set(['qlmanage', 'soffice', 'render_docx.py']);
const ALLOWED_ENV_KEYS = new Set(['LANG', 'LC_ALL', 'LC_CTYPE', 'PATH', 'SAL_USE_VCLPLUGIN']);
const ALLOWED_REQUEST_FIELDS = new Set([
  'surface_kind', 'schema_version', 'stage_run_id', 'attempt_id', 'capability_ref', 'tool', 'tool_path',
  'cwd', 'input_root', 'output_root', 'argv', 'env', 'timeout_seconds', 'tool_version',
]);
const QLMANAGE_PATH = '/usr/bin/qlmanage';
const SOFFICE_PATHS = new Set([
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  '/Applications/LibreOffice.app/Contents/MacOS/soffice.bin',
  '/usr/local/bin/soffice',
  '/opt/homebrew/bin/soffice',
]);
const PYTHON_PATHS = new Set(['/usr/bin/python3', '/usr/local/bin/python3', '/opt/homebrew/bin/python3']);

function fail(message: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, details);
}

function outside(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
}

function requireString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) fail(`${field} must be a non-empty string.`, { field });
  return value.trim();
}

function requirePath(value: unknown, field: string) {
  const result = requireString(value, field);
  if (result.includes('\0')) fail(`${field} contains a NUL byte.`, { field });
  return result;
}

function realDirectory(value: string, field: string) {
  const resolved = path.resolve(value);
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(resolved);
  } catch {
    fail(`${field} must exist and be a directory.`, { field, path: resolved });
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    fail(`${field} must be a non-symlink directory.`, { field, path: resolved });
  }
  return fs.realpathSync(resolved);
}

function containedFile(value: string, field: string, roots: string[]) {
  const resolved = path.resolve(value);
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(resolved);
  } catch {
    fail(`${field} must exist as a regular file.`, { field, path: resolved });
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    fail(`${field} must be a non-symlink regular file.`, { field, path: resolved });
  }
  const real = fs.realpathSync(resolved);
  if (roots.every((root) => outside(root, real))) {
    fail(`${field} must stay inside a declared root and must not be a symlink.`, { field, path: resolved });
  }
  return real;
}

function containedArgument(value: string, field: string, cwd: string, roots: string[]) {
  if (value.includes('\0') || value.startsWith('~') || value.includes('://')) {
    fail(`${field} contains an unsupported path form.`, { field, value });
  }
  if (value.startsWith('-')) return value;
  const pathLike = path.isAbsolute(value)
    || value.includes('/')
    || value.includes('\\')
    || value.startsWith('.')
    || fs.existsSync(path.resolve(cwd, value));
  if (!pathLike) return value;
  const candidate = path.isAbsolute(value) ? value : path.resolve(cwd, value);
  if (fs.existsSync(candidate) && fs.lstatSync(candidate).isSymbolicLink()) {
    fail(`${field} must not reference a symlink.`, { field, value });
  }
  const realCandidate = fs.existsSync(candidate) ? fs.realpathSync(candidate) : path.resolve(candidate);
  if (roots.every((root) => outside(root, realCandidate))) {
    fail(`${field} path escapes declared input/output roots.`, { field, value });
  }
  return value;
}

function parseRequest(requestPath: string) {
  const resolved = path.resolve(requestPath);
  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(resolved);
  } catch {
    throw new FrameworkContractError('contract_file_missing', `Native renderer request is missing: ${resolved}.`, {
      request: resolved,
    });
  }
  let value: unknown;
  try {
    value = parseJsonText(bytes.toString('utf8'));
  } catch (error) {
    throw new FrameworkContractError('contract_json_invalid', 'Native renderer request contains invalid JSON.', {
      request: resolved,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (!isRecord(value)) fail('Native renderer request root must be a JSON object.', { request: resolved });
  const unknownFields = Object.keys(value).filter((field) => !ALLOWED_REQUEST_FIELDS.has(field));
  if (unknownFields.length) fail('Native renderer request contains undeclared fields.', { fields: unknownFields });
  if (value.surface_kind !== 'opl_stage_native_renderer_request' || value.schema_version !== 'stage-native-renderer.v1') {
    fail('Native renderer request has an invalid surface_kind or schema_version.', { request: resolved });
  }
  const stageRunId = requireString(value.stage_run_id, 'stage_run_id');
  const attemptId = requireString(value.attempt_id, 'attempt_id');
  const capabilityRef = requireString(value.capability_ref, 'capability_ref');
  if (capabilityRef !== 'macos.native_renderer') fail('capability_ref must be macos.native_renderer.', { capability_ref: capabilityRef });
  const tool = requireString(value.tool, 'tool');
  if (!ALLOWED_TOOLS.has(tool)) fail('tool is not in the macOS native renderer allowlist.', { tool });
  const cwd = realDirectory(requirePath(value.cwd, 'cwd'), 'cwd');
  const inputRoot = realDirectory(requirePath(value.input_root, 'input_root'), 'input_root');
  const outputRoot = realDirectory(requirePath(value.output_root, 'output_root'), 'output_root');
  const roots = [inputRoot, outputRoot];
  const argvValue = value.argv;
  if (!Array.isArray(argvValue) || argvValue.some((entry) => typeof entry !== 'string')) {
    fail('argv must be a string array.', { field: 'argv' });
  }
  const argv = (argvValue as string[]).map((entry, index) => containedArgument(entry, `argv[${index}]`, cwd, roots));
  const timeoutSeconds = value.timeout_seconds ?? 300;
  if (typeof timeoutSeconds !== 'number' || !Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0 || timeoutSeconds > 3600) {
    fail('timeout_seconds must be a number in (0, 3600].', { timeout_seconds: timeoutSeconds });
  }
  const expectedToolVersion = value.tool_version === undefined ? null : requireString(value.tool_version, 'tool_version');
  const toolPath = value.tool_path === undefined ? null : requirePath(value.tool_path, 'tool_path');
  if (tool === 'render_docx.py' && !toolPath) fail('render_docx.py requires an explicit tool_path binding.');
  const envValue = value.env ?? {};
  if (!isRecord(envValue)) fail('env must be an object.', { field: 'env' });
  const env: Record<string, string> = {};
  for (const [key, entry] of Object.entries(envValue)) {
    if (!ALLOWED_ENV_KEYS.has(key) || typeof entry !== 'string' || entry.includes('\0')) {
      fail('env contains an undeclared key or invalid value.', { key });
    }
    if (key === 'PATH' && entry !== '/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin') {
      fail('env.PATH must use the fixed native renderer search path.', { key });
    }
    env[key] = entry;
  }
  return {
    requestPath: resolved,
    requestSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    stageRunId,
    attemptId,
    capabilityRef,
    tool,
    cwd,
    inputRoot,
    outputRoot,
    argv,
    timeoutSeconds,
    expectedToolVersion,
    toolPath,
    env,
  };
}

function executableSnapshot(executable: string, allowed: Set<string>, field: string) {
  const resolved = path.resolve(executable);
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(resolved);
  } catch {
    fail(`${field} is not available.`, { executable: resolved });
  }
  const trustedSystemAlias = field === 'qlmanage' && resolved === QLMANAGE_PATH;
  if (!stat.isFile() && !trustedSystemAlias) fail(`${field} must be a regular file.`, { executable: resolved });
  const real = fs.realpathSync(resolved);
  if ((!trustedSystemAlias && stat.isSymbolicLink()) || !allowed.has(real) && !allowed.has(resolved)) {
    fail(`${field} is outside the fixed executable allowlist.`, { executable: resolved, realpath: real });
  }
  return {
    path: real,
    sha256: crypto.createHash('sha256').update(fs.readFileSync(real)).digest('hex'),
  };
}

function resolveExecutable(tool: string, request: ReturnType<typeof parseRequest>) {
  if (tool === 'qlmanage') return executableSnapshot(QLMANAGE_PATH, new Set([QLMANAGE_PATH]), 'qlmanage');
  if (tool === 'soffice') {
    const found = [...SOFFICE_PATHS].find((candidate) => fs.existsSync(candidate));
    if (!found) fail('soffice is not installed at an allowlisted path.', { allowlist: [...SOFFICE_PATHS] });
    return executableSnapshot(found, SOFFICE_PATHS, 'soffice');
  }
  if (!request.toolPath) fail('official render_docx.py requires tool_path.');
  const script = path.resolve(request.toolPath);
  if (path.basename(script) !== 'render_docx.py') fail('tool_path must name render_docx.py.');
  const scriptSnapshot = containedFile(script, 'render_docx.py', [request.cwd, request.inputRoot]);
  const python = [...PYTHON_PATHS].find((candidate) => fs.existsSync(candidate));
  if (!python) fail('python3 is not installed at an allowlisted path.', { allowlist: [...PYTHON_PATHS] });
  return {
    path: executableSnapshot(python, PYTHON_PATHS, 'python3').path,
    sha256: executableSnapshot(python, PYTHON_PATHS, 'python3').sha256,
    script: { path: scriptSnapshot, sha256: crypto.createHash('sha256').update(fs.readFileSync(scriptSnapshot)).digest('hex') },
  };
}

function commandFor(request: ReturnType<typeof parseRequest>, executable: ReturnType<typeof resolveExecutable>) {
  if (request.tool === 'render_docx.py' && 'script' in executable) return { command: executable.path, args: [executable.script.path, ...request.argv] };
  return { command: executable.path, args: request.argv };
}

function controlledEnvironment(request: ReturnType<typeof parseRequest>) {
  const home = path.join(request.outputRoot, '.native-renderer-home');
  const tmp = path.join(request.outputRoot, '.native-renderer-tmp');
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(tmp, { recursive: true });
  return {
    PATH: '/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin',
    HOME: home,
    TMPDIR: tmp,
    LANG: request.env.LANG ?? 'en_US.UTF-8',
    LC_ALL: request.env.LC_ALL ?? 'C',
    LC_CTYPE: request.env.LC_CTYPE ?? 'UTF-8',
  };
}

function versionFor(executable: ReturnType<typeof resolveExecutable>, request: ReturnType<typeof parseRequest>) {
  const probeArgs = request.tool === 'qlmanage' ? ['-h'] : request.tool === 'soffice' ? ['--version'] : ['--version'];
  const probeArgsWithScript = request.tool === 'render_docx.py' && 'script' in executable
    ? [executable.script.path, ...probeArgs]
    : probeArgs;
  const probe = spawnSync(executable.path, probeArgsWithScript, {
    cwd: request.cwd,
    env: { ...controlledEnvironment(request), ...request.env },
    encoding: 'utf8',
    timeout: Math.min(10_000, Math.ceil(request.timeoutSeconds * 1000)),
    maxBuffer: 1024 * 1024,
  });
  const output = `${probe.stdout ?? ''}${probe.stderr ?? ''}`.trim();
  if (probe.error || probe.status === null) fail('native renderer tool version probe failed.', { tool: request.tool });
  if (request.expectedToolVersion && !output.includes(request.expectedToolVersion)) {
    fail('native renderer tool version does not match the declaration.', {
      tool: request.tool,
      expected: request.expectedToolVersion,
      observed: output,
    });
  }
  return output;
}

export function runNativeRenderer(requestPath: string) {
  if (process.platform !== 'darwin') {
    throw new FrameworkContractError('surface_not_found', 'macOS native renderer capability requires darwin.', {
      platform: process.platform,
    });
  }
  const request = parseRequest(requestPath);
  const executable = resolveExecutable(request.tool, request);
  const version = versionFor(executable, request);
  const command = commandFor(request, executable);
  const startedAt = new Date().toISOString();
  const execution: SpawnSyncReturns<string> = spawnSync(command.command, command.args, {
    cwd: request.cwd,
    env: { ...controlledEnvironment(request), ...request.env, OPL_NATIVE_HELPER_CARRIER: 'native_helper_carrier' },
    encoding: 'utf8',
    shell: false,
    timeout: Math.ceil(request.timeoutSeconds * 1000),
    maxBuffer: 64 * 1024 * 1024,
  });
  if (execution.error || execution.status === null || execution.status !== 0) {
    throw new FrameworkContractError('launcher_failed', `Native renderer failed: ${request.tool}.`, {
      tool: request.tool,
      exit_code: execution.status,
      signal: execution.signal,
      stderr: execution.stderr,
      error: execution.error?.message ?? null,
    });
  }
  const finishedAt = new Date().toISOString();
  return {
    version: 'g2',
    native_renderer_execution_receipt: {
      surface_kind: 'opl_native_renderer_execution_receipt',
      version: RECEIPT_VERSION,
      status: 'executed',
      contract_ref: NATIVE_RENDERER_EXECUTION_CONTRACT_REF,
      capability_ref: request.capabilityRef,
      stage_run_id: request.stageRunId,
      attempt_id: request.attemptId,
      tool: request.tool,
      executable: executable.path,
      executable_sha256: executable.sha256,
      tool_version: version,
      cwd: request.cwd,
      input_root: request.inputRoot,
      output_root: request.outputRoot,
      argv: command.args,
      env_keys: Object.keys(request.env).sort(),
      env_sha256: crypto.createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries({ ...controlledEnvironment(request), ...request.env }).sort(([a], [b]) => a.localeCompare(b))))).digest('hex'),
      timeout_seconds: request.timeoutSeconds,
      started_at: startedAt,
      finished_at: finishedAt,
      exit_code: execution.status,
      stdout_sha256: crypto.createHash('sha256').update(execution.stdout ?? '').digest('hex'),
      stderr_sha256: crypto.createHash('sha256').update(execution.stderr ?? '').digest('hex'),
      request_ref: request.requestPath,
      request_sha256: request.requestSha256,
      carrier: {
        role: 'native_helper_carrier',
        execution_route: 'opl_runway/native_helper_carrier',
        entered_codex_seatbelt: false,
        shell: false,
      },
      authority_boundary: {
        framework_owns_process_lifecycle: true,
        framework_owns_renderer_body: false,
        can_write_domain_truth: false,
        can_sign_owner_receipt: false,
        can_authorize_visual_quality: false,
        can_authorize_pdf_receipt: false,
        can_authorize_export_readiness: false,
      },
    },
  };
}

export function runNativeRendererCommand(args: string[]) {
  const filtered = args.filter((arg) => arg !== '--json');
  if (filtered.length !== 2 || filtered[0] !== '--request' || !filtered[1] || filtered[1].startsWith('--')) {
    throw new FrameworkContractError('cli_usage_error', 'pack native-helper render requires --request <request.json>.', {
      usage: 'opl pack native-helper render --request <request.json> --json',
    });
  }
  return runNativeRenderer(filtered[1]);
}

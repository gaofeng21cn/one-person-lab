import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';

const MAX_EVALUATION_OUTPUT_BYTES = 8 * 1024 * 1024;
const MAX_EVALUATION_STDERR_BYTES = 64 * 1024;

export type FoundryEvaluationPackSource = {
  label: 'candidate' | 'baseline';
  source_directory: string;
  files: Array<{
    path: string;
    sha256: string;
    byte_size: number;
  }>;
};

type SandboxProjection = {
  root: string;
  candidate_directory: string | null;
  baseline_directory: string | null;
};

function invalid(message: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, {
    failure_code: 'foundry_evaluation_sandbox_invalid',
    ...details,
  });
}

function sha256(bytes: Buffer) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function resolveExecutable(executable: string) {
  const candidates = path.isAbsolute(executable)
    ? [executable]
    : executable.includes(path.sep)
      ? [path.resolve(executable)]
      : (process.env.PATH ?? '/usr/bin:/bin').split(path.delimiter)
          .filter(Boolean)
          .map((directory) => path.join(directory, executable));
  for (const candidate of candidates) {
    try {
      const stat = fs.statSync(candidate);
      fs.accessSync(candidate, fs.constants.X_OK);
      if (stat.isFile()) return fs.realpathSync.native(candidate);
    } catch {
      // Continue through the configured PATH candidates.
    }
  }
  invalid('Foundry Evaluation Runtime executable is unavailable.', { executable });
}

function isCurrentNodeRuntime(executable: string) {
  return executable === fs.realpathSync.native(process.execPath);
}

function permissionFlag() {
  if (process.allowedNodeEnvironmentFlags.has('--permission')) return '--permission';
  if (process.allowedNodeEnvironmentFlags.has('--experimental-permission')) {
    return '--experimental-permission';
  }
  invalid('Foundry Evaluation Runtime requires a Node permission model capable runtime.', {
    platform: process.platform,
    node_version: process.version,
    failure_code: 'foundry_evaluation_sandbox_node_permission_unavailable',
  });
}

function assertSecureNodeArgs(args: string[]) {
  const forbidden = [
    '--allow-addons',
    '--allow-child-process',
    '--allow-fs-read',
    '--allow-fs-write',
    '--allow-inspector',
    '--allow-net',
    '--allow-wasi',
    '--allow-worker',
    '--permission',
    '--permission-audit',
    '--experimental-permission',
    '--no-permission',
    '--no-experimental-permission',
  ];
  const argument = args.find((entry) => {
    const normalized = entry.replaceAll('_', '-');
    return forbidden.some((flag) => normalized === flag || normalized.startsWith(`${flag}=`));
  });
  if (argument) {
    invalid('Foundry Evaluation Runtime arguments cannot widen sandbox permissions.', {
      argument,
      failure_code: 'foundry_evaluation_sandbox_permission_override',
    });
  }
  if (process.platform !== 'darwin' && !process.allowedNodeEnvironmentFlags.has('--allow-net')) {
    invalid('Foundry Evaluation Runtime requires Node network permission enforcement.', {
      platform: process.platform,
      node_version: process.version,
      failure_code: 'foundry_evaluation_sandbox_network_permission_unavailable',
    });
  }
}

function runtimeReadFiles(args: string[]) {
  return [...new Set(args.flatMap((argument) => {
    if (!path.isAbsolute(argument)) return [];
    try {
      const stat = fs.lstatSync(argument);
      if (!stat.isFile() || stat.isSymbolicLink()) return [];
      return [fs.realpathSync.native(argument)];
    } catch {
      return [];
    }
  }))];
}

function copyExactPack(root: string, pack: FoundryEvaluationPackSource) {
  const sourceRoot = fs.realpathSync.native(pack.source_directory);
  const targetRoot = path.join(root, 'packs', pack.label, path.basename(sourceRoot));
  fs.mkdirSync(targetRoot, { recursive: true, mode: 0o700 });
  for (const entry of pack.files) {
    const source = path.join(sourceRoot, entry.path);
    const relative = path.relative(sourceRoot, source);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      invalid('Foundry evaluation pack projection contains an unsafe path.', {
        pack_label: pack.label,
        candidate_path: entry.path,
      });
    }
    const descriptor = fs.openSync(
      source,
      fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0),
    );
    let bytes: Buffer;
    try {
      bytes = fs.readFileSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    if (bytes.byteLength !== entry.byte_size || sha256(bytes) !== entry.sha256) {
      invalid('Foundry evaluation pack changed while it was projected.', {
        pack_label: pack.label,
        candidate_path: entry.path,
      });
    }
    const target = path.join(targetRoot, entry.path);
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    fs.writeFileSync(target, bytes, { flag: 'wx', mode: 0o400 });
  }
  const directories = [targetRoot];
  for (const entry of pack.files) {
    let current = path.dirname(path.join(targetRoot, entry.path));
    while (current !== targetRoot && current.startsWith(`${targetRoot}${path.sep}`)) {
      directories.push(current);
      current = path.dirname(current);
    }
  }
  for (const directory of [...new Set(directories)].sort((left, right) => right.length - left.length)) {
    fs.chmodSync(directory, 0o500);
  }
  return targetRoot;
}

function createProjection(packs: FoundryEvaluationPackSource[]): SandboxProjection {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-evaluation-')));
  try {
    fs.chmodSync(root, 0o700);
    fs.mkdirSync(path.join(root, 'home'), { mode: 0o500 });
    fs.mkdirSync(path.join(root, 'tmp'), { mode: 0o500 });
    let candidateDirectory: string | null = null;
    let baselineDirectory: string | null = null;
    for (const pack of packs) {
      const projected = copyExactPack(root, pack);
      if (pack.label === 'candidate') candidateDirectory = projected;
      else baselineDirectory = projected;
    }
    return {
      root,
      candidate_directory: candidateDirectory,
      baseline_directory: baselineDirectory,
    };
  } catch (error) {
    removeProjection(root);
    throw error;
  }
}

function removeProjection(root: string) {
  const makeRemovable = (directory: string) => {
    fs.chmodSync(directory, 0o700);
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) makeRemovable(path.join(directory, entry.name));
    }
  };
  makeRemovable(root);
  fs.rmSync(root, { recursive: true, force: true });
}

function controlledEnv(root: string, executable: string): NodeJS.ProcessEnv {
  return {
    HOME: path.join(root, 'home'),
    TMPDIR: `${path.join(root, 'tmp')}${path.sep}`,
    PATH: [path.dirname(executable), '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(path.delimiter),
    LANG: 'C',
    LC_ALL: 'C',
  };
}

function sandboxProfile(input: {
  root: string;
  executable: string;
  runtimeReadFiles: string[];
}) {
  const systemReadRoots = ['/System', '/usr', '/bin', '/sbin', '/opt', '/Library', '/dev', '/etc', '/var/db'];
  const readRules = [
    `(allow file-read* (literal ${JSON.stringify('/')}))`,
    ...systemReadRoots.map((root) => `(allow file-read* (subpath ${JSON.stringify(root)}))`),
    `(allow file-read* (subpath ${JSON.stringify(input.root)}))`,
    `(allow file-read* (subpath ${JSON.stringify(path.dirname(input.executable))}))`,
    `(allow file-read* (literal ${JSON.stringify(input.executable)}))`,
    ...input.runtimeReadFiles.map((file) => `(allow file-read* (literal ${JSON.stringify(file)}))`),
  ];
  return [
    '(version 1)',
    '(allow default)',
    '(deny network*)',
    '(deny file-write*)',
    '(deny file-read*)',
    '(deny process-fork)',
    '(deny process-exec)',
    `(allow process-exec (literal ${JSON.stringify(input.executable)}))`,
    ...readRules,
  ].join(' ');
}

async function spawnSandboxed(input: {
  executable: string;
  args: string[];
  stdin: Buffer;
  timeoutMs: number;
  root: string;
}) {
  const executable = resolveExecutable(input.executable);
  const nodeRuntime = isCurrentNodeRuntime(executable);
  const readFiles = runtimeReadFiles(input.args);
  if (!nodeRuntime) {
    invalid('Foundry Evaluation Runtime requires the Framework Node runtime for protected execution.', {
      executable,
      platform: process.platform,
      failure_code: 'foundry_evaluation_sandbox_unsupported_runtime',
    });
  }
  assertSecureNodeArgs(input.args);
  const executableArgs = [
    permissionFlag(),
    `--allow-fs-read=${input.root}`,
    ...readFiles.map((file) => `--allow-fs-read=${file}`),
    ...input.args,
  ];

  const command = process.platform === 'darwin' ? '/usr/bin/sandbox-exec' : executable;
  const args = process.platform === 'darwin'
    ? ['-p', sandboxProfile({ root: input.root, executable, runtimeReadFiles: readFiles }), executable, ...executableArgs]
    : executableArgs;
  return new Promise<Buffer>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: input.root,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: controlledEnv(input.root, executable),
      shell: false,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    let pendingError: Error | null = null;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(Buffer.concat(stdout));
    };
    const terminate = (error: Error) => {
      if (pendingError) return;
      pendingError = error;
      child.kill('SIGKILL');
    };
    const timer = setTimeout(() => {
      terminate(new Error('Foundry Evaluation Runtime timed out.'));
    }, input.timeoutMs);
    child.on('error', (error) => finish(error));
    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_EVALUATION_OUTPUT_BYTES) {
        terminate(new Error('Foundry Evaluation Runtime exceeded its output limit.'));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderrBytes >= MAX_EVALUATION_STDERR_BYTES) return;
      const remaining = MAX_EVALUATION_STDERR_BYTES - stderrBytes;
      stderr.push(chunk.subarray(0, remaining));
      stderrBytes += Math.min(chunk.length, remaining);
    });
    child.stdin.on('error', () => undefined);
    child.on('close', (code, signal) => {
      if (pendingError) {
        finish(pendingError);
        return;
      }
      if (code !== 0) {
        finish(new Error(
          `Foundry Evaluation Runtime exited ${String(code)} (${String(signal)}): ${Buffer.concat(stderr).toString('utf8').slice(-4000)}`,
        ));
        return;
      }
      finish();
    });
    child.stdin.end(input.stdin);
  });
}

export async function executeFoundryEvaluationProcess(input: {
  executable: string;
  args: string[];
  packs?: FoundryEvaluationPackSource[];
  stdin: (projection: SandboxProjection) => Buffer;
  timeoutMs: number;
}) {
  const projection = createProjection(input.packs ?? []);
  try {
    return await spawnSandboxed({
      executable: input.executable,
      args: input.args,
      stdin: input.stdin(projection),
      timeoutMs: input.timeoutMs,
      root: projection.root,
    });
  } finally {
    removeProjection(projection.root);
  }
}

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

type Context = Record<string, any>;
type Target = { domainId: string; profileId: string; platformId: string; requirementProfilePath?: string; requirementProfileId?: string };

export function fileIdentity(filename: string) {
  try {
    const real = fs.realpathSync(filename);
    const stat = fs.statSync(real);
    return { path: real, size: stat.size, mtime_ms: stat.mtimeMs };
  } catch { return null; }
}

export function readPreparedContext(filename: string, target: Target): Context | null {
  if (!fs.existsSync(filename)) return null;
  const context = JSON.parse(fs.readFileSync(filename, 'utf8')) as Context;
  for (const [field, expected] of Object.entries({ domain_id: target.domainId, profile_id: target.profileId, platform_id: target.platformId })) {
    if (context[field] !== expected) throw new Error(`Prepared environment target mismatch: ${field}.`);
  }
  if (context.status !== 'prepared') return null;
  if (target.requirementProfilePath && context.requirement_profile_identity?.requirement_profile_ref !== target.requirementProfilePath) return null;
  if (target.requirementProfileId && (context.selected_requirement_profile_ids?.length !== 1
    || context.selected_requirement_profile_ids[0] !== target.requirementProfileId)) return null;
  for (const [filename, identity] of Object.entries(context.runtime_file_identities ?? {})) {
    if (JSON.stringify(fileIdentity(filename)) !== JSON.stringify(identity)) return null;
  }
  for (const [filename, digest] of Object.entries(context.requirement_file_digests ?? {})) {
    if (!fs.existsSync(filename) || crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex') !== digest) return null;
  }
  const managedPython = context.managed_python_environment_path;
  if (context.managed_required_python_packages?.length && (!managedPython || !fs.existsSync(path.join(managedPython, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')))) return null;
  if (context.managed_required_r_packages?.length && (!context.managed_r_library_path || !fs.existsSync(context.managed_r_library_path))) return null;
  return context;
}

function recordedCommand(command: string[]) {
  let redactNext = false;
  return command.map((arg) => {
    if (redactNext) { redactNext = false; return '[redacted]'; }
    if (/^--?(?:token|password|secret|api[-_]key|authorization)$/i.test(arg)) redactNext = true;
    return arg.replace(/((?:token|password|secret|api[-_]key|authorization)=)[^\s]+/ig, '$1[redacted]');
  });
}

export async function executeInPreparedEnvironment(input: {
  context: Context; artifactRoot: string; command: string[]; cwd: string; timeoutMs?: number;
}): Promise<number> {
  const { context } = input;
  const env = { ...process.env, ...context.env_vars } as NodeJS.ProcessEnv;
  const pythonRoot = context.managed_python_environment_path;
  const pythonBin = pythonRoot && path.join(pythonRoot, process.platform === 'win32' ? 'Scripts' : 'bin');
  const python = pythonBin && path.join(pythonBin, process.platform === 'win32' ? 'python.exe' : 'python');
  if (python && fs.existsSync(python)) {
    env.PATH = [pythonBin, env.PATH].filter(Boolean).join(path.delimiter);
    delete env.PYTHONHOME;
  } else {
    delete env.VIRTUAL_ENV;
    delete env.UV_PROJECT_ENVIRONMENT;
  }
  let executable = input.command[0];
  if (/^python(?:3(?:\.\d+)?)?(?:\.exe)?$/.test(executable)) executable = python && fs.existsSync(python) ? python : context.binary_paths?.python3 ?? executable;
  if (executable === 'Rscript') executable = context.binary_paths?.Rscript ?? executable;
  const id = crypto.randomUUID();
  const receiptPath = path.join(input.artifactRoot, 'build', 'executions', `${id}.json`);
  const started = Date.now();
  const receipt: Context = {
    surface_kind: 'opl_environment_execution', execution_id: id,
    environment_ref: context.environment_manifest_ref ?? context.lock_ref,
    environment_id: context.environment_id ?? context.lock_sha256,
    stage_attempt_ref: process.env.OPL_STAGE_ATTEMPT_REF ?? null,
    command: recordedCommand(input.command), executable, cwd: input.cwd,
    started_at: new Date(started).toISOString(), status: 'running',
  };
  const save = () => {
    try {
      fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
      const temp = `${receiptPath}.tmp`;
      fs.writeFileSync(temp, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
      fs.renameSync(temp, receiptPath);
    } catch {
      process.stderr.write('OPL: execution record could not be written.\n');
    }
  };
  save();
  return await new Promise<number>((resolve) => {
    const child = spawn(executable, input.command.slice(1), {
      cwd: input.cwd, env, stdio: 'inherit', detached: process.platform !== 'win32',
    });
    let timeout: NodeJS.Timeout | undefined;
    let killTimer: NodeJS.Timeout | undefined;
    let stoppedBy: string | null = null;
    let finished = false;
    const kill = (signal: NodeJS.Signals) => {
      try {
        if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, signal);
        else child.kill(signal);
      } catch { /* The process may have already exited. */ }
    };
    const stop = (reason: string, signal: NodeJS.Signals) => {
      stoppedBy ??= reason;
      kill(signal);
      killTimer ??= setTimeout(() => kill('SIGKILL'), 2000);
      killTimer.unref();
    };
    const interrupt = () => stop('SIGINT', 'SIGINT');
    const terminate = () => stop('SIGTERM', 'SIGTERM');
    process.on('SIGINT', interrupt);
    process.on('SIGTERM', terminate);
    const finish = (code: number | null, signal: string | null, error?: string) => {
      if (finished) return;
      finished = true;
      if (stoppedBy) kill('SIGKILL');
      clearTimeout(timeout); clearTimeout(killTimer);
      process.off('SIGINT', interrupt); process.off('SIGTERM', terminate);
      const exitCode = stoppedBy === 'timeout' ? 124 : stoppedBy === 'SIGINT' ? 130 : stoppedBy === 'SIGTERM' ? 143 : code ?? 1;
      Object.assign(receipt, { status: exitCode === 0 ? 'completed' : 'failed', exit_code: exitCode,
        signal, stop_reason: stoppedBy, error: error ?? null,
        finished_at: new Date().toISOString(), elapsed_ms: Date.now() - started });
      save(); resolve(exitCode);
    };
    child.once('error', (error) => finish(127, null, error.message));
    child.once('close', (code, signal) => finish(code, signal));
    if (input.timeoutMs) timeout = setTimeout(() => stop('timeout', 'SIGTERM'), input.timeoutMs);
  });
}

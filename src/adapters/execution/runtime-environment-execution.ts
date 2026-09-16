import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { EnvironmentOperation, EnvironmentInterruptedError, runEnvironmentProcess } from './runtime-environment-process.ts';

type Context = Record<string, any>;
type Target = { domainId: string; profileId: string; platformId: string; requirementProfilePath?: string; requirementProfileId?: string; requirementProfileIds?: string[] };

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
  const requested = target.requirementProfileIds ?? (target.requirementProfileId ? [target.requirementProfileId] : []);
  if (requested.length && JSON.stringify([...new Set(requested)].sort()) !== JSON.stringify([...(context.selected_requirement_profile_ids ?? [])].sort())) return null;
  for (const [filename, identity] of Object.entries(context.runtime_file_identities ?? {})) {
    if (JSON.stringify(fileIdentity(filename)) !== JSON.stringify(identity)) return null;
  }
  for (const [filename, digest] of Object.entries(context.requirement_file_digests ?? {})) {
    if (!fs.existsSync(filename) || crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex') !== digest) return null;
  }
  if (context.environment_ready_ref) {
    if (!fs.existsSync(context.environment_ready_ref)) return null;
    const current = JSON.parse(fs.readFileSync(context.environment_ready_ref, 'utf8'));
    if (current.environment_id !== context.environment_id) return null;
    context.environment_manifest_ref = current.environment_manifest_ref ?? context.environment_manifest_ref;
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
  timings?: Record<string, number>; started?: number; cacheOutcome?: string;
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
  const operation = new EnvironmentOperation(input.timeoutMs);
  operation.phase = 'command_execution';
  env.OPL_ENV_EXECUTION_ID = id;
  env.OPL_ENV_MANIFEST_REF = String(context.environment_manifest_ref ?? context.lock_ref ?? '');
  const receipt: Context = {
    surface_kind: 'opl_environment_execution', execution_id: id,
    environment_ref: context.environment_manifest_ref ?? context.lock_ref,
    environment_id: context.environment_id ?? context.lock_sha256,
    stage_attempt_ref: process.env.OPL_STAGE_ATTEMPT_REF ?? null,
    command: recordedCommand(input.command), executable, cwd: input.cwd,
    started_at: new Date(started).toISOString(), status: 'running',
    timings_ms: input.timings ?? {}, cache_outcome: input.cacheOutcome ?? 'artifact_hit',
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
  let exitCode = 1;
  try {
    const result = await runEnvironmentProcess(executable, input.command.slice(1), { cwd: input.cwd, env, stdio: 'inherit', operation });
    exitCode = result.status;
    receipt.signal = result.signal;
    if (result.status === 127) receipt.error = result.stderr;
  } catch (error) {
    exitCode = error instanceof EnvironmentInterruptedError ? error.exitCode : 1;
    receipt.stop_reason = error instanceof EnvironmentInterruptedError ? error.reason : null;
    receipt.error = error instanceof Error ? error.message : String(error);
  } finally {
    operation.close();
    const commandMs = performance.now() - operation.started;
    Object.assign(receipt, { status: exitCode === 0 ? 'completed' : 'failed', exit_code: exitCode,
      finished_at: new Date().toISOString(), elapsed_ms: commandMs,
      failure_phase: exitCode ? 'command_execution' : null,
      timings_ms: { ...input.timings, command: commandMs, total: performance.now() - (input.started ?? operation.started) },
    });
    save();
  }
  return exitCode;
}

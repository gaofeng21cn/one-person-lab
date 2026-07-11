import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';

export type DomainHelperCommand = {
  command: string;
  args: string[];
  source: 'explicit_env' | 'managed_runtime' | 'host_python';
  runtime_env: Record<string, string>;
};

function parseCommand(value: string) {
  const normalized = value.trim();
  if (normalized.startsWith('[')) {
    const parsed = JSON.parse(normalized) as unknown;
    if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== 'string') || parsed.length === 0) {
      throw new FrameworkContractError('cli_usage_error', 'Domain helper command JSON must be a non-empty string array.');
    }
    return { command: parsed[0] as string, args: parsed.slice(1) as string[] };
  }
  if (!normalized) {
    throw new FrameworkContractError('cli_usage_error', 'Domain helper command cannot be empty.');
  }
  return { command: normalized, args: [] };
}
function probePython(command: string, modules: string[], env: NodeJS.ProcessEnv) {
  const expression = [
    'import importlib.util, json, sys',
    `mods=${JSON.stringify(modules)}`,
    'missing=[m for m in mods if importlib.util.find_spec(m) is None]',
    'print(json.dumps({"executable":sys.executable,"missing":missing}))',
    'raise SystemExit(1 if missing else 0)',
  ].join('; ');
  return spawnSync(command, ['-c', expression], { encoding: 'utf8', env });
}

export function resolveDomainPythonCommand(input: {
  command_env?: string;
  env?: NodeJS.ProcessEnv;
  managed_python_path?: string;
  required_modules?: string[];
  cache_root?: string;
} = {}): DomainHelperCommand {
  const env = { ...process.env, ...(input.env ?? {}) };
  const requiredModules = [...new Set(input.required_modules ?? [])];
  const explicitValue = input.command_env ? env[input.command_env] : env.OPL_DOMAIN_PYTHON_COMMAND;
  const cacheRoot = path.resolve(input.cache_root ?? env.OPL_DOMAIN_HELPER_CACHE_ROOT ?? path.join(env.HOME ?? '.', '.cache/opl/domain-helper'));
  const runtimeEnv = {
    PYTHONDONTWRITEBYTECODE: '1',
    PYTHONPYCACHEPREFIX: path.join(cacheRoot, 'pycache'),
    PLAYWRIGHT_BROWSERS_PATH: env.PLAYWRIGHT_BROWSERS_PATH ?? path.join(cacheRoot, 'playwright-browsers'),
  };
  const candidates: Array<{ command: string; args: string[]; source: DomainHelperCommand['source'] }> = [];
  if (explicitValue?.trim()) {
    candidates.push({ ...parseCommand(explicitValue), source: 'explicit_env' });
  }
  const managed = input.managed_python_path ?? env.OPL_MANAGED_PYTHON;
  if (managed?.trim()) candidates.push({ command: path.resolve(managed), args: [], source: 'managed_runtime' });
  candidates.push({ command: 'python3', args: [], source: 'host_python' });

  for (const candidate of candidates) {
    if (candidate.command.includes(path.sep) && !fs.existsSync(candidate.command)) continue;
    const probe = probePython(candidate.command, requiredModules, { ...env, ...runtimeEnv });
    if (probe.status === 0) return { ...candidate, runtime_env: runtimeEnv };
  }
  throw new FrameworkContractError('surface_not_found', 'No OPL-managed Python runtime satisfies the domain helper requirements.', {
    required_modules: requiredModules,
    command_env: input.command_env ?? 'OPL_DOMAIN_PYTHON_COMMAND',
    fallback_installer_in_domain_repo: false,
  });
}

export function runDomainPythonHelper(input: {
  module: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  command_env?: string;
  managed_python_path?: string;
  required_modules?: string[];
  timeout_ms?: number;
}) {
  const resolved = resolveDomainPythonCommand(input);
  const result = spawnSync(resolved.command, [
    ...resolved.args,
    '-m',
    input.module,
    ...(input.args ?? []),
  ], {
    cwd: input.cwd,
    env: { ...process.env, ...(input.env ?? {}), ...resolved.runtime_env },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: input.timeout_ms,
  });
  return {
    surface_kind: 'opl_domain_helper_execution_receipt',
    command: resolved,
    module: input.module,
    exit_code: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    signal: result.signal ?? null,
    error: result.error?.message ?? null,
    authority_boundary: {
      framework_owns_helper_process_lifecycle: true,
      framework_owns_domain_helper_body: false,
      framework_can_authorize_artifact_mutation: false,
    },
  };
}

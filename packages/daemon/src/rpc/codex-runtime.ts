import path from 'node:path';
import { activateCodexRuntime, ensureCodexRuntime, resolveCodexBinary } from '@opl/runway';
import { DaemonRpcError } from '../errors.ts';

export const codexInstallAction = {
  action_id: 'codex_install',
  owner: 'one-person-lab',
  label: 'Install the local Codex runtime',
  delegated_surface: 'app.codexRuntime.ensure',
  mutates: 'local_codex_runtime',
  payload_fields: ['confirmed'],
  confirmation_required: true,
  dry_run_supported: true,
};

export function readCodexRuntime() {
  let binary: string | null = null;
  try {
    binary = resolveCodexBinary()?.path ?? null;
  } catch {
    // An invalid configured binary is unavailable and can be repaired explicitly.
  }
  return {
    runtime_activation: {
      status: binary ? 'active' : 'unavailable',
      codex: { runtime_binary_path: binary },
    },
  };
}

export async function activateAppCodexRuntime() {
  const result = await activateCodexRuntime();
  return {
    runtime_activation: {
      status: result.status,
      codex: { runtime_binary_path: result.runtime_binary_path },
    },
  };
}

export async function executeCodexInstall(
  payload: Record<string, unknown>,
  dryRun: boolean,
) {
  const fullRoot = payload.full_runtime_root;
  if (fullRoot != null && (typeof fullRoot !== 'string' || !path.isAbsolute(fullRoot))) {
    throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'A Full installation requires its absolute runtime directory.');
  }
  if (!dryRun && payload.confirmed !== true) {
    throw new DaemonRpcError(-32602, 'CONFIRMATION_REQUIRED', 'Confirm installation of the local Codex runtime.');
  }

  const env = { ...process.env };
  if (Object.hasOwn(payload, 'full_runtime_root')) {
    // A persistent daemon can serve both Standard and Full launches.
    delete env.OPL_FIRST_RUN_CODEX_PACKAGE_TARBALL;
    delete env.OPL_FIRST_RUN_CODEX_PLATFORM_PACKAGE_TARBALL;
    if (fullRoot) env.OPL_FULL_RUNTIME_HOME = fullRoot;
    else delete env.OPL_FULL_RUNTIME_HOME;
  }

  const result = dryRun ? readCodexRuntime().runtime_activation : await ensureCodexRuntime(env);
  return {
    ok: true,
    status: dryRun ? 'preview' : 'executed',
    app_action_execution: {
      surface_kind: 'opl_app_action_execution.v1',
      action_id: codexInstallAction.action_id,
      delegated_surface: codexInstallAction.delegated_surface,
      dry_run: dryRun,
      result,
    },
  };
}

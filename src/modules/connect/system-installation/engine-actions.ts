import { FrameworkContractError } from '../../charter/contracts.ts';
import type { FrameworkContracts } from '../../../kernel/types.ts';

import { resolveEngineActionSpec } from './engine-helpers.ts';
import { buildOplEnvironment } from './environment.ts';
import type { OplEngineAction, OplEngineId } from './shared.ts';
import { normalizeOutput } from './shared.ts';

function parseRuntimeUpdateReceipt(raw: string) {
  const normalized = raw.trim();
  if (!normalized) {
    return null;
  }
  try {
    const parsed = JSON.parse(normalized) as Record<string, unknown>;
    const receipt = parsed.opl_runtime_codex_update;
    return receipt && typeof receipt === 'object'
      ? receipt as Record<string, unknown>
      : null;
  } catch (_) {
    return null;
  }
}

function findEngineOrThrow(engineId: string): OplEngineId {
  const normalized = engineId.trim().toLowerCase();
  if (normalized === 'codex') {
    return normalized;
  }

  throw new FrameworkContractError(
    'cli_usage_error',
    'Unknown or retired OPL engine id.',
    {
      engine_id: engineId,
      available_engine_ids: ['codex'],
      retired_engine_ids: ['hermes'],
      retirement_boundary: 'The legacy hermes engine action target is retired. The canonical hermes_agent executor adapter remains available only through explicit AgentExecutionRequest selection, independent receipt/audit gates, and fail-closed proof; it is not installed or repaired through engine actions.',
    },
    2,
  );
}

export async function runOplEngineAction(
  contracts: FrameworkContracts,
  action: OplEngineAction,
  engineId: string,
) {
  const resolvedEngineId = findEngineOrThrow(engineId);
  const spec = resolveEngineActionSpec(resolvedEngineId, action);

  if (!spec.executable) {
    return {
      version: 'g2',
      engine_action: {
        engine_id: resolvedEngineId,
        action,
        status: 'manual_required',
        strategy: spec.strategy,
        command_preview: spec.command_preview,
        note: spec.note,
        stdout: '',
        stderr: '',
        system_environment: (await buildOplEnvironment(contracts)).system_environment,
      },
    };
  }

  const result = spec.executable();
  if (result.exitCode !== 0) {
    const runtimeUpdate = parseRuntimeUpdateReceipt(result.stderr);
    throw new FrameworkContractError(
      'build_command_failed',
      `Failed to run ${resolvedEngineId} ${action} command for OPL.`,
      {
        engine_id: resolvedEngineId,
        action,
        command_preview: spec.command_preview,
        stdout: result.stdout,
        stderr: result.stderr,
        ...(runtimeUpdate ? { runtime_update: runtimeUpdate } : {}),
      },
    );
  }

  return {
    version: 'g2',
    engine_action: {
      engine_id: resolvedEngineId,
      action,
      status: 'completed',
      strategy: spec.strategy,
      command_preview: spec.command_preview,
      note: spec.note,
      stdout: normalizeOutput(result.stdout, result.stderr),
      stderr: result.stderr,
      system_environment: (await buildOplEnvironment(contracts)).system_environment,
    },
  };
}

import { GatewayContractError } from '../contracts.ts';
import type { GatewayContracts } from '../types.ts';

import { resolveEngineActionSpec } from './engine-helpers.ts';
import { buildOplEnvironment } from './environment.ts';
import type { OplEngineAction } from './shared.ts';
import { normalizeOutput } from './shared.ts';

function findEngineOrThrow(engineId: string) {
  const normalized = engineId.trim().toLowerCase();
  if (normalized === 'codex' || normalized === 'hermes') {
    return normalized;
  }

  throw new GatewayContractError(
    'cli_usage_error',
    'Unknown OPL engine id.',
    {
      engine_id: engineId,
      available_engine_ids: ['codex', 'hermes'],
    },
    2,
  );
}

export async function runOplEngineAction(
  contracts: GatewayContracts,
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
    throw new GatewayContractError(
      'build_command_failed',
      `Failed to run ${resolvedEngineId} ${action} command for OPL.`,
      {
        engine_id: resolvedEngineId,
        action,
        command_preview: spec.command_preview,
        stdout: result.stdout,
        stderr: result.stderr,
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

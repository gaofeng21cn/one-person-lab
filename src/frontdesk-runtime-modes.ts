import fs from 'node:fs';

import { GatewayContractError } from './contracts.ts';
import { ensureFrontDeskStateDir, resolveFrontDeskStatePaths } from './frontdesk-state.ts';

export type FrontDeskAgentMode = 'codex' | 'hermes';

export type FrontDeskRuntimeModes = {
  version: 'g1';
  interaction_mode: FrontDeskAgentMode;
  execution_mode: FrontDeskAgentMode;
  updated_at: string;
};

function isFrontDeskAgentMode(value: unknown): value is FrontDeskAgentMode {
  return value === 'codex' || value === 'hermes';
}

export function buildDefaultFrontDeskRuntimeModes(): FrontDeskRuntimeModes {
  return {
    version: 'g1',
    interaction_mode: 'codex',
    execution_mode: 'codex',
    updated_at: new Date().toISOString(),
  };
}

export function readFrontDeskRuntimeModes(): FrontDeskRuntimeModes {
  const paths = ensureFrontDeskStateDir(resolveFrontDeskStatePaths());
  if (!fs.existsSync(paths.runtime_modes_file)) {
    return buildDefaultFrontDeskRuntimeModes();
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(paths.runtime_modes_file, 'utf8')) as Partial<FrontDeskRuntimeModes>;
    const defaults = buildDefaultFrontDeskRuntimeModes();
    return {
      version: 'g1',
      interaction_mode: isFrontDeskAgentMode(parsed.interaction_mode)
        ? parsed.interaction_mode
        : defaults.interaction_mode,
      execution_mode: isFrontDeskAgentMode(parsed.execution_mode)
        ? parsed.execution_mode
        : defaults.execution_mode,
      updated_at:
        typeof parsed.updated_at === 'string' && parsed.updated_at.trim().length > 0
          ? parsed.updated_at
          : defaults.updated_at,
    };
  } catch {
    return buildDefaultFrontDeskRuntimeModes();
  }
}

export function writeFrontDeskRuntimeModes(input: Partial<{
  interaction_mode: FrontDeskAgentMode;
  execution_mode: FrontDeskAgentMode;
}>): FrontDeskRuntimeModes {
  if (input.interaction_mode !== undefined && !isFrontDeskAgentMode(input.interaction_mode)) {
    throw new GatewayContractError(
      'cli_usage_error',
      'frontdesk interaction_mode must be codex or hermes.',
      {
        interaction_mode: input.interaction_mode,
      },
      2,
    );
  }

  if (input.execution_mode !== undefined && !isFrontDeskAgentMode(input.execution_mode)) {
    throw new GatewayContractError(
      'cli_usage_error',
      'frontdesk execution_mode must be codex or hermes.',
      {
        execution_mode: input.execution_mode,
      },
      2,
    );
  }

  const current = readFrontDeskRuntimeModes();
  const next: FrontDeskRuntimeModes = {
    version: 'g1',
    interaction_mode: input.interaction_mode ?? current.interaction_mode,
    execution_mode: input.execution_mode ?? current.execution_mode,
    updated_at: new Date().toISOString(),
  };

  const paths = ensureFrontDeskStateDir(resolveFrontDeskStatePaths());
  fs.writeFileSync(paths.runtime_modes_file, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}

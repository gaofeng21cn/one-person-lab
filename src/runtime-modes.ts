import fs from 'node:fs';

import { GatewayContractError } from './contracts.ts';
import { ensureOplStateDir, resolveOplStatePaths } from './runtime-state-paths.ts';

export type OplAgentMode = 'codex' | 'hermes';

export type OplRuntimeModes = {
  version: 'g1';
  interaction_mode: OplAgentMode;
  execution_mode: OplAgentMode;
  updated_at: string;
};

function isOplAgentMode(value: unknown): value is OplAgentMode {
  return value === 'codex' || value === 'hermes';
}

export function buildDefaultOplRuntimeModes(): OplRuntimeModes {
  return {
    version: 'g1',
    interaction_mode: 'codex',
    execution_mode: 'codex',
    updated_at: new Date().toISOString(),
  };
}

export function readOplRuntimeModes(): OplRuntimeModes {
  const paths = ensureOplStateDir(resolveOplStatePaths());
  if (!fs.existsSync(paths.runtime_modes_file)) {
    return buildDefaultOplRuntimeModes();
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(paths.runtime_modes_file, 'utf8')) as Partial<OplRuntimeModes>;
    const defaults = buildDefaultOplRuntimeModes();
    return {
      version: 'g1',
      interaction_mode: isOplAgentMode(parsed.interaction_mode)
        ? parsed.interaction_mode
        : defaults.interaction_mode,
      execution_mode: isOplAgentMode(parsed.execution_mode)
        ? parsed.execution_mode
        : defaults.execution_mode,
      updated_at:
        typeof parsed.updated_at === 'string' && parsed.updated_at.trim().length > 0
          ? parsed.updated_at
          : defaults.updated_at,
    };
  } catch {
    return buildDefaultOplRuntimeModes();
  }
}

export function writeOplRuntimeModes(input: Partial<{
  interaction_mode: OplAgentMode;
  execution_mode: OplAgentMode;
}>): OplRuntimeModes {
  if (input.interaction_mode !== undefined && !isOplAgentMode(input.interaction_mode)) {
    throw new GatewayContractError(
      'cli_usage_error',
      'OPL interaction_mode must be codex or hermes.',
      {
        interaction_mode: input.interaction_mode,
      },
      2,
    );
  }

  if (input.execution_mode !== undefined && !isOplAgentMode(input.execution_mode)) {
    throw new GatewayContractError(
      'cli_usage_error',
      'OPL execution_mode must be codex or hermes.',
      {
        execution_mode: input.execution_mode,
      },
      2,
    );
  }

  const current = readOplRuntimeModes();
  const next: OplRuntimeModes = {
    version: 'g1',
    interaction_mode: input.interaction_mode ?? current.interaction_mode,
    execution_mode: input.execution_mode ?? current.execution_mode,
    updated_at: new Date().toISOString(),
  };

  const paths = ensureOplStateDir(resolveOplStatePaths());
  fs.writeFileSync(paths.runtime_modes_file, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}

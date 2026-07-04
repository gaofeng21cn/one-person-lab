import fs from 'node:fs';

import { isRecord } from './contract-validation.ts';
import { readJsonFileOrNull } from './json-file.ts';
import { ensureOplStateDir, resolveOplStatePaths } from './runtime-state-paths.ts';

export type OplAgentMode = 'codex';

export type OplRuntimeModes = {
  version: 'g1';
  interaction_mode: OplAgentMode;
  execution_mode: OplAgentMode;
  updated_at: string;
};

function isOplAgentMode(value: unknown): value is OplAgentMode {
  return value === 'codex';
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
    const parsed = readJsonFileOrNull(paths.runtime_modes_file);
    const defaults = buildDefaultOplRuntimeModes();
    if (!isRecord(parsed)) {
      return defaults;
    }
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

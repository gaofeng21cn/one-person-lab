import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { GatewayContractError } from './contracts.ts';

export type LocalCodexDefaults = {
  config_path: string;
  model_provider: string | null;
  model: string;
  reasoning_effort: string | null;
  provider_name: string | null;
  provider_base_url: string | null;
  provider_api_key: string | null;
};

function normalizeOptionalString(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function stripTomlInlineComment(line: string) {
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const previous = index > 0 ? line[index - 1] : '';

    if (character === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (character === '"' && !inSingleQuote && previous !== '\\') {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (character === '#' && !inSingleQuote && !inDoubleQuote) {
      return line.slice(0, index).trim();
    }
  }

  return line.trim();
}

function parseTomlValue(rawValue: string) {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed) as string;
    } catch (error) {
      throw new GatewayContractError(
        'contract_shape_invalid',
        'Local Codex config contains an invalid quoted string literal.',
        {
          value: trimmed,
          cause: error instanceof Error ? error.message : 'Unknown TOML string parse failure.',
        },
      );
    }
  }

  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

export function resolveLocalCodexConfigPath() {
  const explicitCodexHome = normalizeOptionalString(process.env.CODEX_HOME);
  const homeDir = normalizeOptionalString(process.env.HOME) ?? os.homedir();
  const codexHome = explicitCodexHome ?? path.join(homeDir, '.codex');
  return path.join(codexHome, 'config.toml');
}

export function readLocalCodexDefaults(): LocalCodexDefaults {
  const configPath = resolveLocalCodexConfigPath();
  if (!fs.existsSync(configPath) || !fs.statSync(configPath).isFile()) {
    throw new GatewayContractError(
      'surface_not_found',
      'Local Codex config was not found. Configure Codex first so OPL can inherit the local default model profile.',
      {
        config_path: configPath,
      },
    );
  }

  const contents = fs.readFileSync(configPath, 'utf8');
  const rootValues = new Map<string, string>();
  const providerValues = new Map<string, Map<string, string>>();
  let currentSection: string[] = [];

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = stripTomlInlineComment(rawLine);
    if (!line) {
      continue;
    }

    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1]
        .split('.')
        .map((entry) => entry.trim())
        .filter(Boolean);
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1);
    const value = parseTomlValue(rawValue);

    if (currentSection.length === 0) {
      rootValues.set(key, value);
      continue;
    }

    if (currentSection.length === 2 && currentSection[0] === 'model_providers') {
      const providerId = currentSection[1];
      const providerEntry = providerValues.get(providerId) ?? new Map<string, string>();
      providerEntry.set(key, value);
      providerValues.set(providerId, providerEntry);
    }
  }

  const model = normalizeOptionalString(rootValues.get('model'));
  if (!model) {
    throw new GatewayContractError(
      'contract_shape_invalid',
      'Local Codex config is missing the default model entry.',
      {
        config_path: configPath,
      },
    );
  }

  const providerId = normalizeOptionalString(rootValues.get('model_provider'));
  const providerEntry = providerId ? providerValues.get(providerId) ?? null : null;

  return {
    config_path: configPath,
    model_provider: providerId,
    model,
    reasoning_effort: normalizeOptionalString(rootValues.get('model_reasoning_effort')),
    provider_name: normalizeOptionalString(providerEntry?.get('name')),
    provider_base_url: normalizeOptionalString(providerEntry?.get('base_url')),
    provider_api_key: normalizeOptionalString(providerEntry?.get('experimental_bearer_token')),
  };
}

export function readLocalCodexDefaultsIfAvailable() {
  try {
    return readLocalCodexDefaults();
  } catch {
    return null;
  }
}

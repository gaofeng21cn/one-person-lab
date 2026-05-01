import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

export type BootstrapLocalCodexDefaultsInput = Partial<{
  model_provider: string;
  model: string;
  reasoning_effort: string;
  provider_name: string;
  provider_base_url: string;
  provider_api_key: string;
  overwrite_existing: boolean;
}>;

export type CodexDefaultProfile = {
  surface_id: 'opl_codex_default_profile';
  version: string;
  model_provider: string;
  model: string;
  model_reasoning_effort: string | null;
  provider_name: string;
  base_url: string;
  base_url_role: string;
  model_profile_role: string;
  profile_generated_at: string;
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

function quoteTomlString(value: string) {
  return JSON.stringify(value);
}

export function resolveBundledCodexDefaultProfilePath() {
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'contracts',
    'opl-gateway',
    'codex-default-profile.json',
  );
}

function readRequiredProfileString(
  profile: Record<string, unknown>,
  key: keyof CodexDefaultProfile,
): string {
  const value = normalizeOptionalString(typeof profile[key] === 'string' ? profile[key] : undefined);
  if (!value) {
    throw new GatewayContractError(
      'contract_shape_invalid',
      `Bundled Codex default profile is missing ${key}.`,
      {
        profile_path: resolveBundledCodexDefaultProfilePath(),
        key,
      },
    );
  }
  return value;
}

export function readBundledCodexDefaultProfile(): CodexDefaultProfile {
  const profilePath = resolveBundledCodexDefaultProfilePath();
  const raw = fs.readFileSync(profilePath, 'utf8');
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const serialized = JSON.stringify(parsed);
  if (serialized.includes('experimental_bearer_token')) {
    throw new GatewayContractError(
      'contract_shape_invalid',
      'Bundled Codex default profile must not contain bearer tokens.',
      {
        profile_path: profilePath,
      },
    );
  }

  return {
    surface_id: 'opl_codex_default_profile',
    version: readRequiredProfileString(parsed, 'version'),
    model_provider: readRequiredProfileString(parsed, 'model_provider'),
    model: readRequiredProfileString(parsed, 'model'),
    model_reasoning_effort: normalizeOptionalString(
      typeof parsed.model_reasoning_effort === 'string' ? parsed.model_reasoning_effort : undefined,
    ),
    provider_name: readRequiredProfileString(parsed, 'provider_name'),
    base_url: readRequiredProfileString(parsed, 'base_url'),
    base_url_role: readRequiredProfileString(parsed, 'base_url_role'),
    model_profile_role: readRequiredProfileString(parsed, 'model_profile_role'),
    profile_generated_at: readRequiredProfileString(parsed, 'profile_generated_at'),
  };
}

function buildBootstrapInputFromProfile(profile: CodexDefaultProfile): BootstrapLocalCodexDefaultsInput {
  return {
    model_provider: profile.model_provider,
    model: profile.model,
    reasoning_effort: profile.model_reasoning_effort ?? undefined,
    provider_name: profile.provider_name,
    provider_base_url: profile.base_url,
  };
}

function compactBootstrapInput(input: BootstrapLocalCodexDefaultsInput): BootstrapLocalCodexDefaultsInput {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== null),
  ) as BootstrapLocalCodexDefaultsInput;
}

export function buildCodexDefaultProfileFromLocalConfig(
  generatedAt = new Date().toISOString(),
): CodexDefaultProfile {
  const defaults = readLocalCodexDefaults();
  if (!defaults.model_provider || !defaults.provider_base_url) {
    throw new GatewayContractError(
      'contract_shape_invalid',
      'Local Codex config cannot be exported as an OPL default profile without model_provider and base_url.',
      {
        config_path: defaults.config_path,
      },
    );
  }

  return {
    surface_id: 'opl_codex_default_profile',
    version: 'g1',
    model_provider: defaults.model_provider,
    model: defaults.model,
    model_reasoning_effort: defaults.reasoning_effort,
    provider_name: defaults.provider_name ?? defaults.model_provider,
    base_url: defaults.provider_base_url,
    base_url_role: 'product_default_provider_endpoint',
    model_profile_role: 'maintainer_current_initial_profile',
    profile_generated_at: generatedAt,
  };
}

function readBootstrapInputFromEnv(): BootstrapLocalCodexDefaultsInput {
  return {
    model_provider: normalizeOptionalString(process.env.OPL_CODEX_MODEL_PROVIDER)
      ?? normalizeOptionalString(process.env.CODEX_MODEL_PROVIDER)
      ?? undefined,
    model: normalizeOptionalString(process.env.OPL_CODEX_MODEL)
      ?? normalizeOptionalString(process.env.CODEX_MODEL)
      ?? undefined,
    reasoning_effort: normalizeOptionalString(process.env.OPL_CODEX_REASONING_EFFORT)
      ?? normalizeOptionalString(process.env.CODEX_REASONING_EFFORT)
      ?? undefined,
    provider_name: normalizeOptionalString(process.env.OPL_CODEX_PROVIDER_NAME)
      ?? normalizeOptionalString(process.env.CODEX_PROVIDER_NAME)
      ?? undefined,
    provider_base_url: normalizeOptionalString(process.env.OPL_CODEX_BASE_URL)
      ?? normalizeOptionalString(process.env.CODEX_BASE_URL)
      ?? normalizeOptionalString(process.env.OPENAI_BASE_URL)
      ?? undefined,
    provider_api_key: normalizeOptionalString(process.env.OPL_CODEX_API_KEY)
      ?? normalizeOptionalString(process.env.CODEX_API_KEY)
      ?? normalizeOptionalString(process.env.OPENAI_API_KEY)
      ?? undefined,
  };
}

export function bootstrapLocalCodexDefaults(input: BootstrapLocalCodexDefaultsInput = {}) {
  const defaultProfile = readBundledCodexDefaultProfile();
  const merged = {
    ...buildBootstrapInputFromProfile(defaultProfile),
    ...compactBootstrapInput(readBootstrapInputFromEnv()),
    ...compactBootstrapInput(input),
  };

  const model = normalizeOptionalString(merged.model);
  const providerBaseUrl = normalizeOptionalString(merged.provider_base_url);
  const providerApiKey = normalizeOptionalString(merged.provider_api_key);
  const configPath = resolveLocalCodexConfigPath();
  const existing = fs.existsSync(configPath) && fs.statSync(configPath).isFile()
    ? readLocalCodexDefaults()
    : null;

  if (existing?.provider_api_key && !merged.overwrite_existing) {
    return {
      status: 'skipped_existing_config' as const,
      config_path: configPath,
      wrote_config: false,
      provider_base_url: existing.provider_base_url,
      model: existing.model,
      reasoning_effort: existing.reasoning_effort,
      api_key_present: true,
      default_profile: defaultProfile,
    };
  }

  if (!model || !providerBaseUrl || !providerApiKey) {
    return {
      status: 'skipped_missing_input' as const,
      config_path: configPath,
      required_env: ['OPL_CODEX_API_KEY'],
      optional_env: ['OPL_CODEX_MODEL_PROVIDER', 'OPL_CODEX_REASONING_EFFORT', 'OPL_CODEX_PROVIDER_NAME'],
      wrote_config: false,
      provider_base_url: providerBaseUrl,
      model,
      reasoning_effort: normalizeOptionalString(merged.reasoning_effort),
      api_key_present: Boolean(providerApiKey),
      default_profile: defaultProfile,
    };
  }

  const providerId = normalizeOptionalString(merged.model_provider) ?? defaultProfile.model_provider;
  const providerName = normalizeOptionalString(merged.provider_name) ?? defaultProfile.provider_name;
  const reasoningEffort = normalizeOptionalString(merged.reasoning_effort);
  const configDir = path.dirname(configPath);
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(
    configPath,
    [
      `model_provider = ${quoteTomlString(providerId)}`,
      `model = ${quoteTomlString(model)}`,
      ...(reasoningEffort ? [`model_reasoning_effort = ${quoteTomlString(reasoningEffort)}`] : []),
      '',
      `[model_providers.${providerId}]`,
      `name = ${quoteTomlString(providerName)}`,
      `base_url = ${quoteTomlString(providerBaseUrl)}`,
      `experimental_bearer_token = ${quoteTomlString(providerApiKey)}`,
      '',
    ].join('\n'),
    { mode: 0o600 },
  );

  return {
    status: 'completed' as const,
    config_path: configPath,
    wrote_config: true,
    provider_base_url: providerBaseUrl,
    model,
    reasoning_effort: reasoningEffort,
    api_key_present: true,
    default_profile: defaultProfile,
  };
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

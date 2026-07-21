import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FrameworkContractError } from './contract-validation.ts';
import { parseJsonText, readJsonPayloadFile } from './json-file.ts';
import {
  readCodexAuthState,
  resolveLocalCodexAccessState,
} from './local-codex-defaults-parts/access-state.ts';
import {
  backupCodexConfig,
  readCodexConfigManagementReceipt,
  writeCodexConfigAtomically,
  writeCodexConfigManagementReceipt,
  type CodexConfigManagementReceipt,
} from './local-codex-defaults-parts/management-receipt.ts';

export type LocalCodexDefaults = {
  config_path: string;
  model_provider: string | null;
  model: string;
  reasoning_effort: string | null;
  provider_name: string | null;
  provider_base_url: string | null;
  provider_api_key: string | null;
  opl_gateway_configured: boolean;
  selected_provider_api_key_present: boolean;
};

export type LocalCodexModelAccessSource =
  | 'opl_gateway'
  | 'codex_login'
  | 'custom_provider'
  | 'env_api_key'
  | 'missing';

export type LocalCodexAccessState = {
  config_path: string;
  auth_path: string;
  config_found: boolean;
  auth_found: boolean;
  api_key_present: boolean;
  opl_gateway_configured: boolean;
  codex_login_present: boolean;
  env_api_key_present: boolean;
  model_access_ready: boolean;
  model_access_source: LocalCodexModelAccessSource;
  provider_base_url: string | null;
  model: string | null;
  reasoning_effort: string | null;
};

export type BootstrapLocalCodexDefaultsInput = Partial<{
  model_provider: string;
  model: string;
  reasoning_effort: string;
  provider_name: string;
  provider_base_url: string;
  provider_api_key: string;
}>;

export type CodexDefaultProfile = {
  surface_id: 'opl_codex_default_profile';
  version: 'g2';
  owner: 'one-person-lab';
  purpose: 'workflow_owned_codex_install_default_projection';
  state: 'generated_projection';
  machine_boundary: string;
  generated_projection: {
    source_owner: 'opl-flow';
    source_repo: 'gaofeng21cn/opl-flow';
    source_ref: string;
    source_field_refs: Record<string, string>;
    generator: 'scripts/export-codex-default-profile.mjs';
    generation_stage: 'development_or_release_sync';
    runtime_source_checkout_required: false;
  };
  model_provider: string;
  model: string;
  model_reasoning_effort: string | null;
  provider_name: string;
  base_url: string;
  base_url_role: string;
  model_profile_role: string;
};

export const OPL_GATEWAY_BASE_URL = 'https://gflabtoken.cn/v1';

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
      return parseJsonText(trimmed) as string;
    } catch (error) {
      throw new FrameworkContractError(
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

function resolveLocalCodexHome() {
  const explicitCodexHome = normalizeOptionalString(process.env.CODEX_HOME);
  const homeDir = normalizeOptionalString(process.env.HOME) ?? os.homedir();
  return explicitCodexHome ?? path.join(homeDir, '.codex');
}

function resolveLocalCodexConfigPath() {
  return path.join(resolveLocalCodexHome(), 'config.toml');
}

function resolveLocalCodexAuthPath() {
  return path.join(resolveLocalCodexHome(), 'auth.json');
}

function normalizeBaseUrl(value: string | null | undefined) {
  return normalizeOptionalString(value)?.replace(/\/+$/, '') ?? null;
}

function isOplGatewayBaseUrl(value: string | null | undefined) {
  return normalizeBaseUrl(value) === OPL_GATEWAY_BASE_URL;
}

function quoteTomlString(value: string) {
  return JSON.stringify(value);
}

function resolveBundledCodexDefaultProfilePath() {
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'contracts',
    'opl-framework',
    'codex-default-profile.json',
  );
}

function readRequiredProfileString(
  profile: Record<string, unknown>,
  key: keyof CodexDefaultProfile,
): string {
  const value = normalizeOptionalString(typeof profile[key] === 'string' ? profile[key] : undefined);
  if (!value) {
    throw new FrameworkContractError(
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

function readRequiredExactProfileString<const Expected extends string>(
  profile: Record<string, unknown>,
  key: keyof CodexDefaultProfile,
  expected: Expected,
): Expected {
  const value = readRequiredProfileString(profile, key);
  if (value !== expected) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `Bundled Codex default profile has invalid ${key}.`,
      {
        profile_path: resolveBundledCodexDefaultProfilePath(),
        key,
        expected,
        actual: value,
      },
    );
  }
  return expected;
}

function readGeneratedProjection(profile: Record<string, unknown>): CodexDefaultProfile['generated_projection'] {
  const projection = profile.generated_projection;
  if (!projection || typeof projection !== 'object' || Array.isArray(projection)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Bundled Codex default profile is missing generated_projection.',
      { profile_path: resolveBundledCodexDefaultProfilePath() },
    );
  }
  const values = projection as Record<string, unknown>;
  const exact = <Expected extends string>(key: string, expected: Expected): Expected => {
    const actual = normalizeOptionalString(typeof values[key] === 'string' ? values[key] : undefined);
    if (actual !== expected) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        `Bundled Codex default profile has invalid generated_projection.${key}.`,
        { profile_path: resolveBundledCodexDefaultProfilePath(), key, expected, actual },
      );
    }
    return expected;
  };
  const sourceFieldRefs = values.source_field_refs;
  if (!sourceFieldRefs || typeof sourceFieldRefs !== 'object' || Array.isArray(sourceFieldRefs)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Bundled Codex default profile is missing generated_projection.source_field_refs.',
      { profile_path: resolveBundledCodexDefaultProfilePath() },
    );
  }
  const normalizedSourceFieldRefs = Object.fromEntries(
    Object.entries(sourceFieldRefs).map(([key, value]) => [
      key,
      normalizeOptionalString(typeof value === 'string' ? value : undefined),
    ]),
  );
  if (Object.values(normalizedSourceFieldRefs).some((value) => !value)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Bundled Codex default profile contains an invalid generated projection source field ref.',
      { profile_path: resolveBundledCodexDefaultProfilePath() },
    );
  }
  const sourcePrefix = 'gaofeng21cn/opl-flow:contracts/workflow-policy.json';
  const expectedSourceFieldRefs = {
    model: `${sourcePrefix}#codex_model_policy.configured_default.model`,
    reasoning_effort: `${sourcePrefix}#codex_model_policy.configured_default.reasoning_effort`,
  };
  for (const [key, expected] of Object.entries(expectedSourceFieldRefs)) {
    if (normalizedSourceFieldRefs[key] !== expected) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        `Bundled Codex default profile has invalid generated projection source field ref ${key}.`,
        {
          profile_path: resolveBundledCodexDefaultProfilePath(),
          key,
          expected,
          actual: normalizedSourceFieldRefs[key] ?? null,
        },
      );
    }
  }
  if (values.runtime_source_checkout_required !== false) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Bundled Codex default profile must not require the App checkout at runtime.',
      { profile_path: resolveBundledCodexDefaultProfilePath() },
    );
  }
  return {
    source_owner: exact('source_owner', 'opl-flow'),
    source_repo: exact('source_repo', 'gaofeng21cn/opl-flow'),
    source_ref: exact(
      'source_ref',
      'gaofeng21cn/opl-flow:contracts/workflow-policy.json#codex_model_policy',
    ),
    source_field_refs: normalizedSourceFieldRefs as Record<string, string>,
    generator: exact('generator', 'scripts/export-codex-default-profile.mjs'),
    generation_stage: exact('generation_stage', 'development_or_release_sync'),
    runtime_source_checkout_required: false,
  };
}

export function readBundledCodexDefaultProfile(): CodexDefaultProfile {
  const profilePath = resolveBundledCodexDefaultProfilePath();
  const parsed = readJsonPayloadFile(profilePath) as Record<string, unknown>;
  const serialized = JSON.stringify(parsed);
  if (serialized.includes('experimental_bearer_token')) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Bundled Codex default profile must not contain bearer tokens.',
      {
        profile_path: profilePath,
      },
    );
  }

  return {
    surface_id: 'opl_codex_default_profile',
    version: readRequiredExactProfileString(parsed, 'version', 'g2'),
    owner: readRequiredExactProfileString(parsed, 'owner', 'one-person-lab'),
    purpose: readRequiredExactProfileString(
      parsed,
      'purpose',
      'workflow_owned_codex_install_default_projection',
    ),
    state: readRequiredExactProfileString(parsed, 'state', 'generated_projection'),
    machine_boundary: readRequiredProfileString(parsed, 'machine_boundary'),
    generated_projection: readGeneratedProjection(parsed),
    model_provider: readRequiredProfileString(parsed, 'model_provider'),
    model: readRequiredProfileString(parsed, 'model'),
    model_reasoning_effort: normalizeOptionalString(
      typeof parsed.model_reasoning_effort === 'string' ? parsed.model_reasoning_effort : undefined,
    ),
    provider_name: readRequiredProfileString(parsed, 'provider_name'),
    base_url: readRequiredProfileString(parsed, 'base_url'),
    base_url_role: readRequiredProfileString(parsed, 'base_url_role'),
    model_profile_role: readRequiredProfileString(parsed, 'model_profile_role'),
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

function readCompleteExistingCodexDefaultsForBootstrap(configPath: string): LocalCodexDefaults | null {
  if (!fs.existsSync(configPath) || !fs.statSync(configPath).isFile()) {
    return null;
  }

  try {
    return readLocalCodexDefaults();
  } catch (error) {
    if (
      error instanceof FrameworkContractError
      && error.code === 'contract_shape_invalid'
      && error.message === 'Local Codex config is missing the default model entry.'
    ) {
      return null;
    }
    throw error;
  }
}

function removeRootTomlKeys(text: string, keys: Set<string>) {
  const kept: string[] = [];
  let currentSection: string[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = stripTomlInlineComment(rawLine);
    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1]
        .split('.')
        .map((entry) => entry.trim())
        .filter(Boolean);
      kept.push(rawLine);
      continue;
    }

    const separatorIndex = line.indexOf('=');
    const key = separatorIndex > 0 ? line.slice(0, separatorIndex).trim() : null;
    if (currentSection.length === 0 && key && keys.has(key)) {
      continue;
    }

    kept.push(rawLine);
  }

  return kept.join('\n').trim();
}

function upsertTomlTableKeys(
  text: string,
  tableHeader: string,
  replacements: Array<[key: string, renderedValue: string | null]>,
) {
  const kept: string[] = [];
  const replacementKeys = new Set(replacements.map(([key]) => key));
  const replacementLines = replacements
    .filter(([, renderedValue]) => renderedValue !== null)
    .map(([key, renderedValue]) => `${key} = ${renderedValue}`);
  let foundTable = false;
  let inTargetTable = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = stripTomlInlineComment(rawLine);
    if (/^\[[^\]]+\]$/.test(line)) {
      inTargetTable = line === tableHeader;
      if (inTargetTable) {
        foundTable = true;
        kept.push(rawLine, ...replacementLines);
        continue;
      }
    }

    const separatorIndex = line.indexOf('=');
    const key = separatorIndex > 0 ? line.slice(0, separatorIndex).trim() : null;
    if (inTargetTable && key && replacementKeys.has(key)) continue;
    kept.push(rawLine);
  }

  if (!foundTable) {
    kept.push('', tableHeader, ...replacementLines);
  }
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function buildCodexConfigText(
  existingText: string,
  input: {
    providerId: string;
    providerName: string;
    providerBaseUrl: string;
    model: string;
    reasoningEffort: string | null;
    providerApiKey: string | null;
  },
) {
  const rootLines = [
    `model_provider = ${quoteTomlString(input.providerId)}`,
    `model = ${quoteTomlString(input.model)}`,
    ...(input.reasoningEffort ? [`model_reasoning_effort = ${quoteTomlString(input.reasoningEffort)}`] : []),
  ];
  const providerHeader = `[model_providers.${input.providerId}]`;
  const preserved = upsertTomlTableKeys(
    removeRootTomlKeys(existingText, new Set(['model_provider', 'model', 'model_reasoning_effort'])),
    providerHeader,
    [
      ['name', quoteTomlString(input.providerName)],
      ['base_url', quoteTomlString(input.providerBaseUrl)],
      ['experimental_bearer_token', input.providerApiKey ? quoteTomlString(input.providerApiKey) : null],
    ],
  );

  return [
    rootLines.join('\n'),
    preserved,
    '',
  ].filter((block) => block.length > 0).join('\n\n');
}

function buildCodexProviderOnlyConfigText(
  existingText: string,
  input: {
    providerId: string;
    providerName: string;
    providerBaseUrl: string;
    providerApiKey: string | null;
  },
) {
  const providerHeader = `[model_providers.${input.providerId}]`;
  const preserved = upsertTomlTableKeys(
    existingText,
    providerHeader,
    [
      ['name', quoteTomlString(input.providerName)],
      ['base_url', quoteTomlString(input.providerBaseUrl)],
      ['experimental_bearer_token', input.providerApiKey ? quoteTomlString(input.providerApiKey) : null],
    ],
  );
  return [preserved, '']
    .filter((block) => block.length > 0)
    .join('\n\n');
}

function providerRoute(baseUrl: string, active: boolean): CodexConfigManagementReceipt['provider_route'] {
  if (!active) return 'inactive_provider';
  const normalized = normalizeBaseUrl(baseUrl);
  if (normalized === normalizeBaseUrl(OPL_GATEWAY_BASE_URL)) return 'direct_gateway';
  return 'opl_custom_route';
}

function hasLocalOverride(existing: LocalCodexDefaults, receipt: CodexConfigManagementReceipt | null) {
  if (!receipt || receipt.config_path !== existing.config_path || receipt.provider_id !== existing.model_provider) {
    return false;
  }
  if (receipt.selection_mode === 'local_override') return true;
  if (receipt.selection_mode !== 'auto') return false;
  return existing.model !== receipt.last_applied_values.model
    || existing.reasoning_effort !== receipt.last_applied_values.model_reasoning_effort;
}

function isOplManagedActiveProvider(
  existing: LocalCodexDefaults | null,
  _receipt: CodexConfigManagementReceipt | null,
) {
  if (!existing?.model_provider) return false;
  return normalizeBaseUrl(existing.provider_base_url) === normalizeBaseUrl(OPL_GATEWAY_BASE_URL);
}

function selectInactiveProviderId(
  desiredProviderId: string,
  providerBaseUrl: string,
  providerValues: Map<string, Map<string, string>>,
) {
  const desiredEntry = providerValues.get(desiredProviderId);
  if (!desiredEntry || normalizeBaseUrl(desiredEntry.get('base_url')) === normalizeBaseUrl(providerBaseUrl)) {
    return desiredProviderId;
  }

  const existingOplAlias = [...providerValues.entries()].find(([, entry]) => (
    normalizeBaseUrl(entry.get('base_url')) === normalizeBaseUrl(providerBaseUrl)
  ));
  if (existingOplAlias) return existingOplAlias[0];

  let suffix = 1;
  while (true) {
    const candidate = suffix === 1 ? 'opl_gateway' : `opl_gateway_${suffix}`;
    if (!providerValues.has(candidate)) return candidate;
    suffix += 1;
  }
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
  const explicitProviderApiKey = normalizeOptionalString(input.provider_api_key);
  const oplEnvironmentProviderApiKey = normalizeOptionalString(process.env.OPL_CODEX_API_KEY);
  const merged = {
    ...buildBootstrapInputFromProfile(defaultProfile),
    ...compactBootstrapInput(readBootstrapInputFromEnv()),
    ...compactBootstrapInput(input),
  };

  const model = normalizeOptionalString(merged.model);
  const providerBaseUrl = normalizeOptionalString(merged.provider_base_url);
  const providerApiKey = normalizeOptionalString(merged.provider_api_key);
  const configPath = resolveLocalCodexConfigPath();
  const existing = readCompleteExistingCodexDefaultsForBootstrap(configPath);
  const receipt = readCodexConfigManagementReceipt();
  const oplProviderActive = isOplManagedActiveProvider(existing, receipt);
  const selectedProviderApiKey = oplProviderActive
    ? explicitProviderApiKey ?? oplEnvironmentProviderApiKey ?? existing?.provider_api_key ?? null
    : providerApiKey;
  if (existing && !oplProviderActive && !providerApiKey) {
    return {
      status: 'skipped_existing_config' as const,
      config_path: configPath,
      wrote_config: false,
      provider_base_url: existing.provider_base_url,
      model: existing.model,
      reasoning_effort: existing.reasoning_effort,
      api_key_present: Boolean(existing.provider_api_key),
      default_profile: defaultProfile,
      management_receipt: receipt,
    };
  }

  if (!model || !providerBaseUrl || !selectedProviderApiKey) {
    return {
      status: 'skipped_missing_input' as const,
      config_path: configPath,
      required_env: ['OPL_CODEX_API_KEY'],
      optional_env: ['OPL_CODEX_MODEL_PROVIDER', 'OPL_CODEX_REASONING_EFFORT', 'OPL_CODEX_PROVIDER_NAME'],
      wrote_config: false,
      provider_base_url: providerBaseUrl,
      model,
      reasoning_effort: normalizeOptionalString(merged.reasoning_effort),
      api_key_present: Boolean(selectedProviderApiKey),
      default_profile: defaultProfile,
      management_receipt: receipt,
    };
  }

  const requestedProviderId = normalizeOptionalString(merged.model_provider) ?? defaultProfile.model_provider;
  const requestedProviderName = normalizeOptionalString(merged.provider_name) ?? defaultProfile.provider_name;
  const reasoningEffort = normalizeOptionalString(merged.reasoning_effort);
  const existingText = fs.existsSync(configPath) && fs.statSync(configPath).isFile()
    ? fs.readFileSync(configPath, 'utf8')
    : '';
  const providerValues = existingText
    ? readLocalCodexConfigValues(configPath).providerValues
    : new Map<string, Map<string, string>>();
  const activeOplProvider = oplProviderActive && existing ? existing : null;
  const providerId = activeOplProvider?.model_provider
    ? activeOplProvider.model_provider
    : selectInactiveProviderId(requestedProviderId, providerBaseUrl, providerValues);
  const existingProviderName = normalizeOptionalString(providerValues.get(providerId)?.get('name'));
  const providerName = activeOplProvider
    ? activeOplProvider.provider_name ?? requestedProviderName
    : existingProviderName ?? requestedProviderName;
  const preserveLocalOverride = activeOplProvider
    ? hasLocalOverride(activeOplProvider, receipt)
    : false;
  const selectedModel = existing && !oplProviderActive
    ? existing.model
    : preserveLocalOverride
      ? activeOplProvider!.model
      : model;
  const selectedReasoningEffort = existing && !oplProviderActive
    ? existing.reasoning_effort
    : preserveLocalOverride
      ? activeOplProvider!.reasoning_effort
      : reasoningEffort;
  const selectedProviderBaseUrl = activeOplProvider?.provider_base_url
    ? activeOplProvider.provider_base_url
    : providerBaseUrl;
  const selectionMode = existing && !oplProviderActive
    ? 'inactive_provider' as const
    : preserveLocalOverride
      ? 'local_override' as const
      : 'auto' as const;
  const nextText = existing && !oplProviderActive
    ? buildCodexProviderOnlyConfigText(existingText, {
      providerId,
      providerName,
      providerBaseUrl,
      providerApiKey: selectedProviderApiKey,
    })
    : buildCodexConfigText(existingText, {
      providerId,
      providerName,
      providerBaseUrl: selectedProviderBaseUrl,
      model: selectedModel,
      reasoningEffort: selectedReasoningEffort,
      providerApiKey: selectedProviderApiKey,
    });
  const configDir = path.dirname(configPath);
  fs.mkdirSync(configDir, { recursive: true });
  const backupPath = existingText ? backupCodexConfig(configPath) : null;
  writeCodexConfigAtomically(configPath, nextText);
  const managementReceipt: CodexConfigManagementReceipt = {
    surface_kind: 'opl_codex_config_management_receipt.v1',
    config_path: configPath,
    provider_id: providerId,
    selection_mode: selectionMode,
    provider_route: providerRoute(selectedProviderBaseUrl, !existing || Boolean(activeOplProvider)),
    owned_keys: [
      ...(selectionMode === 'auto' ? [
        'model_provider',
        'model',
        'model_reasoning_effort',
      ] : []),
      `model_providers.${providerId}.name`,
      `model_providers.${providerId}.base_url`,
      ...(selectedProviderApiKey ? [`model_providers.${providerId}.experimental_bearer_token`] : []),
    ],
    last_applied_values: {
      model_provider: selectionMode === 'auto' ? providerId : existing?.model_provider ?? null,
      model: selectionMode === 'auto' ? selectedModel : existing?.model ?? null,
      model_reasoning_effort: selectionMode === 'auto'
        ? selectedReasoningEffort
        : existing?.reasoning_effort ?? null,
      provider_base_url: selectedProviderBaseUrl,
    },
    backup_path: backupPath,
    updated_at: new Date().toISOString(),
  };
  const managementReceiptPath = writeCodexConfigManagementReceipt(managementReceipt);

  return {
    status: 'completed' as const,
    config_path: configPath,
    wrote_config: true,
    provider_base_url: selectedProviderBaseUrl,
    model: selectedModel,
    reasoning_effort: selectedReasoningEffort,
    api_key_present: Boolean(selectedProviderApiKey),
    default_profile: defaultProfile,
    management_receipt: managementReceipt,
    management_receipt_path: managementReceiptPath,
  };
}

function readLocalCodexConfigValues(configPath: string) {
  if (!fs.existsSync(configPath) || !fs.statSync(configPath).isFile()) {
    throw new FrameworkContractError(
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

  return { rootValues, providerValues };
}

function readLocalCodexDefaults(): LocalCodexDefaults {
  const configPath = resolveLocalCodexConfigPath();
  const { rootValues, providerValues } = readLocalCodexConfigValues(configPath);
  const model = normalizeOptionalString(rootValues.get('model'));
  if (!model) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Local Codex config is missing the default model entry.',
      {
        config_path: configPath,
      },
    );
  }

  const providerId = normalizeOptionalString(rootValues.get('model_provider'));
  const providerEntry = providerId ? providerValues.get(providerId) ?? null : null;
  const providerBaseUrl = normalizeOptionalString(providerEntry?.get('base_url'));
  const providerApiKey = normalizeOptionalString(providerEntry?.get('experimental_bearer_token'));
  const directOplGatewayConfigured = [...providerValues.values()].some((entry) => (
    isOplGatewayBaseUrl(entry.get('base_url'))
    && Boolean(normalizeOptionalString(entry.get('experimental_bearer_token')))
  ));
  return {
    config_path: configPath,
    model_provider: providerId,
    model,
    reasoning_effort: normalizeOptionalString(rootValues.get('model_reasoning_effort')),
    provider_name: normalizeOptionalString(providerEntry?.get('name')),
    provider_base_url: providerBaseUrl,
    provider_api_key: providerApiKey,
    opl_gateway_configured: directOplGatewayConfigured,
    selected_provider_api_key_present: Boolean(providerApiKey),
  };
}

export function readLocalCodexDefaultsIfAvailable() {
  try {
    return readLocalCodexDefaults();
  } catch {
    return null;
  }
}

export function readLocalCodexAccessState(): LocalCodexAccessState {
  const configPath = resolveLocalCodexConfigPath();
  const authPath = resolveLocalCodexAuthPath();
  return resolveLocalCodexAccessState({
    configPath,
    authPath,
    defaults: readLocalCodexDefaultsIfAvailable(),
    auth: readCodexAuthState(authPath),
    env: process.env,
    isOplGatewayBaseUrl,
  });
}

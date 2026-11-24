import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseTomlRecord,
  parseTomlTablePath,
  removeRootTomlKeys,
  renderTomlKeyValue,
  upsertTomlTableKeys,
  validateTomlDocument,
} from './codex-toml-document.ts';

import { FrameworkContractError, isRecord } from './contract-validation.ts';
import { parseJsonText, readJsonFileOrNull, readJsonPayloadFile } from './json-file.ts';
import { ensureOplStateDir, resolveOplStatePaths } from './runtime-state-paths.ts';

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

type LocalCodexAuthState = {
  auth_found: boolean;
  codex_login_present: boolean;
  auth_api_key_present: boolean;
};

type ResolveLocalCodexAccessStateInput = {
  configPath: string;
  authPath: string;
  defaults: LocalCodexDefaults | null;
  auth: LocalCodexAuthState;
  env: Record<string, string | undefined>;
  isOplGatewayBaseUrl: (value: string | null | undefined) => boolean;
};

export type CodexConfigSelectionMode = 'auto' | 'local_override' | 'inactive_provider';

export type CodexConfigManagementReceipt = {
  surface_kind: 'opl_codex_config_management_receipt.v1';
  config_path: string;
  provider_id: string;
  selection_mode: CodexConfigSelectionMode;
  provider_route: 'direct_gateway' | 'opl_custom_route' | 'inactive_provider';
  owned_keys: string[];
  last_applied_values: {
    model_provider: string | null;
    model: string | null;
    model_reasoning_effort: string | null;
    provider_base_url: string;
  };
  backup_path: string | null;
  updated_at: string;
};

function receiptPath() {
  return path.join(ensureOplStateDir(resolveOplStatePaths()).state_dir, 'codex-config-management-receipt.json');
}

export function readCodexConfigManagementReceipt(): CodexConfigManagementReceipt | null {
  const filePath = receiptPath();
  if (!fs.existsSync(filePath)) return null;
  try {
    const value = JSON.parse(fs.readFileSync(filePath, 'utf8')) as CodexConfigManagementReceipt;
    if (
      value.surface_kind !== 'opl_codex_config_management_receipt.v1'
      || typeof value.config_path !== 'string'
      || typeof value.provider_id !== 'string'
      || !['auto', 'local_override', 'inactive_provider'].includes(value.selection_mode)
      || !value.last_applied_values
    ) {
      throw new Error('receipt shape is invalid');
    }
    return value;
  } catch (error) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'OPL Codex config management receipt is invalid; refusing to overwrite local Codex preferences.',
      {
        receipt_path: filePath,
        error: error instanceof Error ? error.message : String(error),
      },
    );
  }
}

export function backupCodexConfig(configPath: string, timestamp = new Date()) {
  if (!fs.existsSync(configPath) || !fs.statSync(configPath).isFile()) return null;
  const suffix = timestamp.toISOString().replace(/[:.]/g, '-');
  const backupPath = `${configPath}.opl-backup-${suffix}`;
  fs.copyFileSync(configPath, backupPath);
  fs.chmodSync(backupPath, 0o600);
  return backupPath;
}

export function writeCodexConfigAtomically(configPath: string, contents: string) {
  const tempPath = `${configPath}.opl-write-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(tempPath, contents, { mode: 0o600 });
    fs.renameSync(tempPath, configPath);
    fs.chmodSync(configPath, 0o600);
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
}

export function writeCodexConfigManagementReceipt(receipt: CodexConfigManagementReceipt) {
  const filePath = receiptPath();
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(tempPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(tempPath, filePath);
    fs.chmodSync(filePath, 0o600);
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
  return filePath;
}

export function readCodexAuthState(authPath: string): LocalCodexAuthState {
  if (!fs.existsSync(authPath) || !fs.statSync(authPath).isFile()) {
    return { auth_found: false, codex_login_present: false, auth_api_key_present: false };
  }
  try {
    const parsed = readJsonFileOrNull(authPath);
    const record = isRecord(parsed) ? parsed : {};
    const authMode = normalizeOptionalString(typeof record.auth_mode === 'string' ? record.auth_mode : undefined);
    const tokensPresent = record.tokens !== undefined && record.tokens !== null;
    const authApiKeyPresent = Boolean(
      normalizeOptionalString(typeof record.OPENAI_API_KEY === 'string' ? record.OPENAI_API_KEY : undefined),
    );
    return {
      auth_found: true,
      codex_login_present: authMode === 'chatgpt' && tokensPresent,
      auth_api_key_present: authApiKeyPresent,
    };
  } catch {
    return { auth_found: true, codex_login_present: false, auth_api_key_present: false };
  }
}

function envApiKeyPresent(env: Record<string, string | undefined>) {
  return Boolean(
    normalizeOptionalString(env.OPL_CODEX_API_KEY)
    ?? normalizeOptionalString(env.CODEX_API_KEY)
    ?? normalizeOptionalString(env.OPENAI_API_KEY),
  );
}

function resolveModelAccessSource(
  input: ResolveLocalCodexAccessStateInput,
  environmentApiKeyPresent: boolean,
): LocalCodexModelAccessSource {
  const selectedProviderHasBearerToken = Boolean(input.defaults?.selected_provider_api_key_present);
  const selectedProviderUsesOplGateway = input.isOplGatewayBaseUrl(input.defaults?.provider_base_url);
  if (selectedProviderHasBearerToken && selectedProviderUsesOplGateway) return 'opl_gateway';
  if (input.auth.codex_login_present) return 'codex_login';
  if ((selectedProviderHasBearerToken && !selectedProviderUsesOplGateway) || input.auth.auth_api_key_present) return 'custom_provider';
  if (environmentApiKeyPresent) return 'env_api_key';
  return 'missing';
}

export function resolveLocalCodexAccessState(input: ResolveLocalCodexAccessStateInput): LocalCodexAccessState {
  const environmentApiKeyPresent = envApiKeyPresent(input.env);
  const modelAccessSource = resolveModelAccessSource(input, environmentApiKeyPresent);
  return {
    config_path: input.configPath,
    auth_path: input.authPath,
    config_found: Boolean(input.defaults),
    auth_found: input.auth.auth_found,
    api_key_present: Boolean(input.defaults?.provider_api_key),
    opl_gateway_configured: Boolean(input.defaults?.opl_gateway_configured),
    codex_login_present: input.auth.codex_login_present,
    env_api_key_present: environmentApiKeyPresent,
    model_access_ready: modelAccessSource !== 'missing',
    model_access_source: modelAccessSource,
    provider_base_url: input.defaults?.provider_base_url ?? null,
    model: input.defaults?.model ?? null,
    reasoning_effort: input.defaults?.reasoning_effort ?? null,
  };
}

export {
  parseTomlTablePath,
} from './codex-toml-document.ts';

export type BootstrapLocalCodexDefaultsInput = Partial<{
  model_provider: string;
  model: string;
  reasoning_effort: string;
  provider_name: string;
  provider_base_url: string;
  provider_api_key: string;
}> & {
  activate_provider?: boolean;
};

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

export const OPL_GATEWAY_BASE_URL = 'https://gateway.medopl.com/v1';
export const OPL_GATEWAY_LEGACY_BASE_URLS = [
  'https://gflabtoken.cn/v1',
] as const;

function normalizeOptionalString(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
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
  const normalized = normalizeBaseUrl(value);
  return normalized === normalizeBaseUrl(OPL_GATEWAY_BASE_URL)
    || OPL_GATEWAY_LEGACY_BASE_URLS.some((legacy) => normalized === normalizeBaseUrl(legacy));
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
    renderTomlKeyValue('model_provider', input.providerId),
    renderTomlKeyValue('model', input.model),
    ...(input.reasoningEffort ? [renderTomlKeyValue('model_reasoning_effort', input.reasoningEffort)] : []),
  ];
  const preserved = upsertTomlTableKeys(
    removeRootTomlKeys(existingText, new Set(['model_provider', 'model', 'model_reasoning_effort'])),
    ['model_providers', input.providerId],
    [
      ['name', input.providerName],
      ['base_url', input.providerBaseUrl],
      ['experimental_bearer_token', input.providerApiKey ?? null],
    ],
  );

  const rendered = [
    rootLines.join('\n'),
    preserved,
    '',
  ].filter((block) => block.length > 0).join('\n\n');
  validateTomlDocument(rendered);
  return rendered;
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
  const preserved = upsertTomlTableKeys(
    existingText,
    ['model_providers', input.providerId],
    [
      ['name', input.providerName],
      ['base_url', input.providerBaseUrl],
      ['experimental_bearer_token', input.providerApiKey ?? null],
    ],
  );
  const rendered = [preserved, '']
    .filter((block) => block.length > 0)
    .join('\n\n');
  validateTomlDocument(rendered);
  return rendered;
}

function providerRoute(baseUrl: string, active: boolean): CodexConfigManagementReceipt['provider_route'] {
  if (!active) return 'inactive_provider';
  if (isOplGatewayBaseUrl(baseUrl)) return 'direct_gateway';
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
  return isOplGatewayBaseUrl(existing.provider_base_url);
}

function selectInactiveProviderId(
  desiredProviderId: string,
  providerBaseUrl: string,
  providerValues: Map<string, Map<string, string>>,
) {
  const desiredEntry = providerValues.get(desiredProviderId);
  if (desiredProviderId === 'oplgateway') {
    if (desiredEntry) return desiredProviderId;
    const existingLegacyAlias = [...providerValues.entries()].find(([id, entry]) => (
      ['gflab', 'gflabtoken'].includes(id)
      && isOplGatewayBaseUrl(entry.get('base_url'))
    ));
    return existingLegacyAlias?.[0] ?? desiredProviderId;
  }

  if (desiredEntry && (
    isOplGatewayBaseUrl(providerBaseUrl)
      ? isOplGatewayBaseUrl(desiredEntry.get('base_url'))
      : normalizeBaseUrl(desiredEntry.get('base_url')) === normalizeBaseUrl(providerBaseUrl)
  )) {
    return desiredProviderId;
  }

  const existingOplAlias = [...providerValues.entries()].find(([, entry]) => (
    isOplGatewayBaseUrl(providerBaseUrl)
      ? isOplGatewayBaseUrl(entry.get('base_url'))
      : normalizeBaseUrl(entry.get('base_url')) === normalizeBaseUrl(providerBaseUrl)
  ));
  if (existingOplAlias) return existingOplAlias[0];
  if (!desiredEntry) return desiredProviderId;

  let suffix = 2;
  while (true) {
    const candidate = `${desiredProviderId}_${suffix}`;
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
  const activateProvider = input.activate_provider === true;
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
  const reservedOplGatewaySelected = requestedProviderId === 'oplgateway' && providerId === 'oplgateway';
  const reservedOplGatewayIsActive = Boolean(
    existing
    && existing.model_provider === 'oplgateway'
    && reservedOplGatewaySelected
    && isOplGatewayBaseUrl(providerBaseUrl),
  );
  const existingProviderName = normalizeOptionalString(providerValues.get(providerId)?.get('name'));
  const existingProviderBaseUrl = normalizeOptionalString(providerValues.get(providerId)?.get('base_url'));
  const providerName = activeOplProvider
    ? activeOplProvider.provider_name ?? requestedProviderName
    : reservedOplGatewaySelected
      ? requestedProviderName
      : existingProviderName ?? requestedProviderName;
  const preserveLocalOverride = activeOplProvider
    ? hasLocalOverride(activeOplProvider, receipt)
    : false;
  const selectedModel = existing && !oplProviderActive && !activateProvider
    ? existing.model
    : preserveLocalOverride
      ? activeOplProvider!.model
      : model;
  const selectedReasoningEffort = existing && !oplProviderActive && !activateProvider
    ? existing.reasoning_effort
    : preserveLocalOverride
      ? activeOplProvider!.reasoning_effort
      : reasoningEffort;
  const selectedProviderBaseUrl = activeOplProvider?.provider_base_url
    ? activeOplProvider.provider_base_url
    : existingProviderBaseUrl && isOplGatewayBaseUrl(existingProviderBaseUrl) && isOplGatewayBaseUrl(providerBaseUrl)
      ? existingProviderBaseUrl
    : providerBaseUrl;
  const selectionMode = existing && !oplProviderActive && !reservedOplGatewayIsActive && !activateProvider
    ? 'inactive_provider' as const
    : preserveLocalOverride
      ? 'local_override' as const
      : 'auto' as const;
  const nextText = existing && !oplProviderActive && !reservedOplGatewayIsActive && !activateProvider
    ? buildCodexProviderOnlyConfigText(existingText, {
      providerId,
      providerName,
      providerBaseUrl: selectedProviderBaseUrl,
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
    provider_route: providerRoute(
      selectedProviderBaseUrl,
      activateProvider || !existing || Boolean(activeOplProvider) || reservedOplGatewayIsActive,
    ),
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

  let parsed: Record<string, unknown>;
  try {
    parsed = parseTomlRecord(fs.readFileSync(configPath, 'utf8'));
  } catch {
    // TOML parser diagnostics may quote credentials from the source line.
    throw new FrameworkContractError('contract_shape_invalid', 'Local Codex config is not valid TOML.');
  }
  const values = (value: unknown) => new Map<string, string>(
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.entries(value).flatMap(([key, entry]) => (
          ['string', 'number', 'boolean'].includes(typeof entry) ? [[key, String(entry)] as [string, string]] : []
        ))
      : [],
  );
  const rootValues = values(parsed);
  const providers = parsed.model_providers;
  const providerValues = new Map<string, Map<string, string>>(
    providers && typeof providers === 'object' && !Array.isArray(providers)
      ? Object.entries(providers).map(([key, entry]) => [key, values(entry)])
      : [],
  );
  return { rootValues, providerValues };
}

/** Internal execution boundary: callers must never serialize this connection. */
export function readLocalCodexModelConnection(input: {
  config_path?: string;
  env?: NodeJS.ProcessEnv;
} = {}) {
  const env = input.env ?? process.env;
  const configPath = input.config_path ?? path.join(
    env.CODEX_HOME?.trim() || path.join(env.HOME?.trim() || os.homedir(), '.codex'), 'config.toml',
  );
  const { rootValues, providerValues } = readLocalCodexConfigValues(configPath);
  const providerId = rootValues.get('model_provider');
  const provider = providerId ? providerValues.get(providerId) : undefined;
  const envKey = provider?.get('env_key');
  return {
    base_url: normalizeOptionalString(provider?.get('base_url')),
    credential: normalizeOptionalString(provider?.get('experimental_bearer_token'))
      ?? normalizeOptionalString(provider?.get('api_key'))
      ?? (envKey ? normalizeOptionalString(env[envKey]) : null),
  };
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

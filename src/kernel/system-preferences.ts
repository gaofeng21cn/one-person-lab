import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from './contract-validation.ts';
import { readJsonPayloadFile } from './json-file.ts';
import {
  ensureOplStateDir,
  resolveOplStatePaths,
} from './runtime-state-paths.ts';

export type OplUpdateChannel = 'stable' | 'preview';
export type OplDeveloperSupervisorEnabled = 'auto' | 'on' | 'off';
export type OplDeveloperSupervisorMode = 'external_observe' | 'developer_apply_safe';
export type OplModuleSourcePreference = 'auto' | 'managed' | 'developer';

export type OplWorkspaceRoot = {
  version: 'g1';
  selected_path: string | null;
  source: 'env' | 'state' | 'default_home';
  exists: boolean;
  writable: boolean;
  health_status: 'ready' | 'attention_needed' | 'missing';
  updated_at: string;
};

type OplWorkspaceRootFile = {
  version: 'g1';
  selected_path: string | null;
  updated_at: string;
};

type OplUpdateChannelFile = {
  version: 'g1';
  channel: OplUpdateChannel;
  updated_at: string;
};

export type OplDeveloperSupervisorConfigFile = {
  version: 'g1';
  enabled: OplDeveloperSupervisorEnabled;
  mode: OplDeveloperSupervisorMode;
  auto_enable_github_login: string;
  module_source_preferences?: Record<string, OplModuleSourcePreference>;
  updated_at: string;
  source: 'default' | 'user_config';
};

function normalizeModuleSourcePreferences(value: unknown): Record<string, OplModuleSourcePreference> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, OplModuleSourcePreference] =>
        Boolean(entry[0].trim()) && ['auto', 'managed', 'developer'].includes(String(entry[1])),
    ),
  );
}

function normalizeOptionalString(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function nowIso() {
  return new Date().toISOString();
}

function canWriteDirectory(directoryPath: string) {
  try {
    fs.accessSync(directoryPath, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function normalizeWorkspaceRootForWrite(inputPath: string) {
  const normalized = normalizeOptionalString(inputPath);
  if (!normalized) {
    throw new FrameworkContractError(
      'cli_usage_error',
      'workspace root set requires a non-empty directory path.',
      {
        workspace_root: inputPath,
      },
      2,
    );
  }

  const resolved = path.resolve(normalized);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new FrameworkContractError(
      'cli_usage_error',
      'workspace root set requires an existing directory.',
      {
        workspace_root: resolved,
      },
      2,
    );
  }

  return resolved;
}

function readWorkspaceRootFile(): OplWorkspaceRootFile | null {
  const paths = ensureOplStateDir(resolveOplStatePaths());
  if (!fs.existsSync(paths.workspace_root_file)) {
    return null;
  }

  try {
    const parsed = readJsonPayloadFile(paths.workspace_root_file) as Partial<OplWorkspaceRootFile>;
    return {
      version: 'g1',
      selected_path: normalizeOptionalString(parsed.selected_path),
      updated_at:
        typeof parsed.updated_at === 'string' && parsed.updated_at.trim().length > 0
          ? parsed.updated_at
          : nowIso(),
    };
  } catch (error) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Existing workspace root state is invalid JSON or has an invalid shape.',
      {
        file: paths.workspace_root_file,
        cause: error instanceof Error ? error.message : 'Unknown workspace root parse failure.',
      },
    );
  }
}

function writeWorkspaceRootFile(selectedPath: string | null) {
  const paths = ensureOplStateDir(resolveOplStatePaths());
  const payload: OplWorkspaceRootFile = {
    version: 'g1',
    selected_path: selectedPath,
    updated_at: nowIso(),
  };

  fs.writeFileSync(paths.workspace_root_file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return payload;
}

export function readOplWorkspaceRoot(): OplWorkspaceRoot {
  const paths = ensureOplStateDir(resolveOplStatePaths());
  const envSelectedPath = normalizeOptionalString(process.env.OPL_WORKSPACE_ROOT);
  const persisted = readWorkspaceRootFile();
  const selectedPath = envSelectedPath ?? persisted?.selected_path ?? paths.home_dir;
  const source: OplWorkspaceRoot['source'] =
    envSelectedPath
      ? 'env'
      : persisted?.selected_path
        ? 'state'
        : 'default_home';
  const exists = Boolean(selectedPath && fs.existsSync(selectedPath) && fs.statSync(selectedPath).isDirectory());
  const writable = Boolean(selectedPath && exists && canWriteDirectory(selectedPath));
  const healthStatus: OplWorkspaceRoot['health_status'] =
    !selectedPath
      ? 'missing'
      : exists && writable
        ? 'ready'
        : 'attention_needed';

  return {
    version: 'g1',
    selected_path: selectedPath,
    source,
    exists,
    writable,
    health_status: healthStatus,
    updated_at: persisted?.updated_at ?? nowIso(),
  };
}

export function writeOplWorkspaceRoot(workspaceRoot: string) {
  writeWorkspaceRootFile(normalizeWorkspaceRootForWrite(workspaceRoot));
  return readOplWorkspaceRoot();
}

export function buildOplWorkspaceRootStatus() {
  const workspaceRoot = readOplWorkspaceRoot();
  return {
    version: 'g2',
    workspace_root: workspaceRoot,
  };
}

function readUpdateChannelFile(): OplUpdateChannelFile | null {
  const paths = ensureOplStateDir(resolveOplStatePaths());
  if (!fs.existsSync(paths.update_channel_file)) {
    return null;
  }

  try {
    const parsed = readJsonPayloadFile(paths.update_channel_file) as Partial<OplUpdateChannelFile>;
    return {
      version: 'g1',
      channel: parsed.channel === 'preview' ? 'preview' : 'stable',
      updated_at:
        typeof parsed.updated_at === 'string' && parsed.updated_at.trim().length > 0
          ? parsed.updated_at
          : nowIso(),
    };
  } catch (error) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Existing OPL update channel state is invalid JSON or has an invalid shape.',
      {
        file: paths.update_channel_file,
        cause: error instanceof Error ? error.message : 'Unknown update channel parse failure.',
      },
    );
  }
}

export function readOplUpdateChannel(): OplUpdateChannelFile {
  const persisted = readUpdateChannelFile();
  return persisted ?? {
    version: 'g1',
    channel: 'stable',
    updated_at: nowIso(),
  };
}

export function writeOplUpdateChannel(channel: OplUpdateChannel) {
  const paths = ensureOplStateDir(resolveOplStatePaths());
  const payload: OplUpdateChannelFile = {
    version: 'g1',
    channel,
    updated_at: nowIso(),
  };
  fs.writeFileSync(paths.update_channel_file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return payload;
}

function normalizeDeveloperSupervisorEnabled(value: unknown): OplDeveloperSupervisorEnabled {
  return value === 'on' || value === 'off' || value === 'auto' ? value : 'auto';
}

function normalizeDeveloperSupervisorMode(value: unknown): OplDeveloperSupervisorMode {
  return value === 'developer_apply_safe' ? 'developer_apply_safe' : 'external_observe';
}

function normalizeAutoEnableGithubLogin(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : 'gaofeng21cn';
}

function readDeveloperSupervisorConfigFile(): OplDeveloperSupervisorConfigFile | null {
  const paths = ensureOplStateDir(resolveOplStatePaths());
  if (!fs.existsSync(paths.developer_supervisor_config_file)) {
    return null;
  }

  try {
    const parsed = readJsonPayloadFile(
      paths.developer_supervisor_config_file,
    ) as Partial<OplDeveloperSupervisorConfigFile>;
    return {
      version: 'g1',
      enabled: normalizeDeveloperSupervisorEnabled(parsed.enabled),
      mode: normalizeDeveloperSupervisorMode(parsed.mode),
      auto_enable_github_login: normalizeAutoEnableGithubLogin(parsed.auto_enable_github_login),
      module_source_preferences: normalizeModuleSourcePreferences(parsed.module_source_preferences),
      updated_at:
        typeof parsed.updated_at === 'string' && parsed.updated_at.trim().length > 0
          ? parsed.updated_at
          : nowIso(),
      source: 'user_config',
    };
  } catch (error) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Existing OPL developer supervisor state is invalid JSON or has an invalid shape.',
      {
        file: paths.developer_supervisor_config_file,
        cause: error instanceof Error ? error.message : 'Unknown developer supervisor parse failure.',
      },
    );
  }
}

export function readOplDeveloperSupervisorConfig(): OplDeveloperSupervisorConfigFile {
  const persisted = readDeveloperSupervisorConfigFile();
  return persisted ?? {
    version: 'g1',
    enabled: 'auto',
    mode: 'developer_apply_safe',
    auto_enable_github_login: 'gaofeng21cn',
    module_source_preferences: {},
    updated_at: nowIso(),
    source: 'default',
  };
}

export function writeOplDeveloperSupervisorConfig(input: Partial<{
  enabled: OplDeveloperSupervisorEnabled;
  mode: OplDeveloperSupervisorMode;
  auto_enable_github_login: string;
  module_source_preferences: Record<string, OplModuleSourcePreference>;
}>) {
  const paths = ensureOplStateDir(resolveOplStatePaths());
  const current = readOplDeveloperSupervisorConfig();
  const payload: OplDeveloperSupervisorConfigFile = {
    version: 'g1',
    enabled: input.enabled ?? current.enabled,
    mode: input.mode ?? current.mode,
    auto_enable_github_login: normalizeAutoEnableGithubLogin(
      input.auto_enable_github_login ?? current.auto_enable_github_login,
    ),
    module_source_preferences: (() => {
      const next = {
        ...current.module_source_preferences,
        ...normalizeModuleSourcePreferences(input.module_source_preferences),
      };
      for (const [moduleId, source] of Object.entries(next)) {
        if (source === 'auto') delete next[moduleId];
      }
      return next;
    })(),
    updated_at: nowIso(),
    source: 'user_config',
  };
  fs.writeFileSync(paths.developer_supervisor_config_file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return payload;
}

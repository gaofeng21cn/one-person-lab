import fs from 'node:fs';
import path from 'node:path';

import { GatewayContractError } from './contracts.ts';
import { ensureFrontDeskStateDir, resolveFrontDeskStatePaths } from './runtime-state-paths.ts';

export type FrontDeskUpdateChannel = 'stable' | 'preview';

export type FrontDeskWorkspaceRoot = {
  version: 'g1';
  selected_path: string | null;
  source: 'env' | 'state' | 'default_home';
  exists: boolean;
  writable: boolean;
  health_status: 'ready' | 'attention_needed' | 'missing';
  updated_at: string;
};

type FrontDeskWorkspaceRootFile = {
  version: 'g1';
  selected_path: string | null;
  updated_at: string;
};

type FrontDeskUpdateChannelFile = {
  version: 'g1';
  channel: FrontDeskUpdateChannel;
  updated_at: string;
};

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
    throw new GatewayContractError(
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
    throw new GatewayContractError(
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

function readWorkspaceRootFile(): FrontDeskWorkspaceRootFile | null {
  const paths = ensureFrontDeskStateDir(resolveFrontDeskStatePaths());
  if (!fs.existsSync(paths.workspace_root_file)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(paths.workspace_root_file, 'utf8')) as Partial<FrontDeskWorkspaceRootFile>;
    return {
      version: 'g1',
      selected_path: normalizeOptionalString(parsed.selected_path),
      updated_at:
        typeof parsed.updated_at === 'string' && parsed.updated_at.trim().length > 0
          ? parsed.updated_at
          : nowIso(),
    };
  } catch (error) {
    throw new GatewayContractError(
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
  const paths = ensureFrontDeskStateDir(resolveFrontDeskStatePaths());
  const payload: FrontDeskWorkspaceRootFile = {
    version: 'g1',
    selected_path: selectedPath,
    updated_at: nowIso(),
  };

  fs.writeFileSync(paths.workspace_root_file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return payload;
}

export function readFrontDeskWorkspaceRoot(): FrontDeskWorkspaceRoot {
  const paths = ensureFrontDeskStateDir(resolveFrontDeskStatePaths());
  const envSelectedPath = normalizeOptionalString(process.env.OPL_WORKSPACE_ROOT);
  const persisted = readWorkspaceRootFile();
  const selectedPath = envSelectedPath ?? persisted?.selected_path ?? paths.home_dir;
  const source: FrontDeskWorkspaceRoot['source'] =
    envSelectedPath
      ? 'env'
      : persisted?.selected_path
        ? 'state'
        : 'default_home';
  const exists = Boolean(selectedPath && fs.existsSync(selectedPath) && fs.statSync(selectedPath).isDirectory());
  const writable = Boolean(selectedPath && exists && canWriteDirectory(selectedPath));
  const healthStatus: FrontDeskWorkspaceRoot['health_status'] =
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

export function writeFrontDeskWorkspaceRoot(workspaceRoot: string) {
  writeWorkspaceRootFile(normalizeWorkspaceRootForWrite(workspaceRoot));
  return readFrontDeskWorkspaceRoot();
}

export function buildFrontDeskWorkspaceRootStatus() {
  const workspaceRoot = readFrontDeskWorkspaceRoot();
  return {
    version: 'g2',
    workspace_root: workspaceRoot,
  };
}

function readUpdateChannelFile(): FrontDeskUpdateChannelFile | null {
  const paths = ensureFrontDeskStateDir(resolveFrontDeskStatePaths());
  if (!fs.existsSync(paths.update_channel_file)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(paths.update_channel_file, 'utf8')) as Partial<FrontDeskUpdateChannelFile>;
    return {
      version: 'g1',
      channel: parsed.channel === 'preview' ? 'preview' : 'stable',
      updated_at:
        typeof parsed.updated_at === 'string' && parsed.updated_at.trim().length > 0
          ? parsed.updated_at
          : nowIso(),
    };
  } catch (error) {
    throw new GatewayContractError(
      'contract_shape_invalid',
      'Existing frontdesk update channel state is invalid JSON or has an invalid shape.',
      {
        file: paths.update_channel_file,
        cause: error instanceof Error ? error.message : 'Unknown update channel parse failure.',
      },
    );
  }
}

export function readFrontDeskUpdateChannel(): FrontDeskUpdateChannelFile {
  const persisted = readUpdateChannelFile();
  return persisted ?? {
    version: 'g1',
    channel: 'stable',
    updated_at: nowIso(),
  };
}

export function writeFrontDeskUpdateChannel(channel: FrontDeskUpdateChannel) {
  const paths = ensureFrontDeskStateDir(resolveFrontDeskStatePaths());
  const payload: FrontDeskUpdateChannelFile = {
    version: 'g1',
    channel,
    updated_at: nowIso(),
  };
  fs.writeFileSync(paths.update_channel_file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return payload;
}

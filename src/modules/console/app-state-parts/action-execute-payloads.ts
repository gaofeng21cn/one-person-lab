import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import { optionalString } from '../../../kernel/json-file.ts';
import type { OplUpdateChannel } from '../../../kernel/system-preferences.ts';
import {
  resolveOplDomainModuleSpec,
  type OplEngineAction,
  type OplModuleAction,
  type OplModuleId,
  type runOplAgentPackageInstall,
} from '../../connect/index.ts';

type JsonRecord = Record<string, unknown>;

export function stringPayloadField(payload: JsonRecord, field: string) {
  return optionalString(payload[field]);
}
export function releaseChannelPayload(payload: JsonRecord) {
  const channel = stringPayloadField(payload, 'channel');
  if (channel !== 'stable' && channel !== 'preview') {
    throw new FrameworkContractError('cli_usage_error', 'update_channel action requires payload.channel stable or preview.', {
      action_id: 'update_channel',
      allowed_channels: ['stable', 'preview'],
    });
  }
  return { channel: channel as OplUpdateChannel };
}

export function workspaceRootPayload(payload: JsonRecord) {
  const workspaceRoot = stringPayloadField(payload, 'path')
    ?? stringPayloadField(payload, 'workspace_root')
    ?? stringPayloadField(payload, 'workspaceRoot');
  if (!workspaceRoot) {
    throw new FrameworkContractError('cli_usage_error', 'workspace_root_set action requires payload.path.', {
      action_id: 'workspace_root_set',
      required: ['path'],
    });
  }
  return workspaceRoot;
}

export function scholarskillsWorkspaceRootPayload(payload: JsonRecord) {
  const workspaceRoot = stringPayloadField(payload, 'workspace_root')
    ?? stringPayloadField(payload, 'workspaceRoot')
    ?? stringPayloadField(payload, 'path');
  if (!workspaceRoot) {
    throw new FrameworkContractError('cli_usage_error', 'scholarskills_workspace_sync action requires payload.workspace_root.', {
      action_id: 'scholarskills_workspace_sync',
      required: ['workspace_root'],
    });
  }
  return workspaceRoot;
}

export function scholarskillsQuestRootPayload(payload: JsonRecord) {
  const questRoot = stringPayloadField(payload, 'quest_root')
    ?? stringPayloadField(payload, 'questRoot')
    ?? stringPayloadField(payload, 'path');
  if (!questRoot) {
    throw new FrameworkContractError('cli_usage_error', 'scholarskills_quest_sync action requires payload.quest_root.', {
      action_id: 'scholarskills_quest_sync',
      required: ['quest_root'],
    });
  }
  return questRoot;
}

export function settingsReloadCodexSurfacePayload(payload: JsonRecord): {
  scope: 'workspace' | 'quest';
  targetPath: string;
} {
  const scope = stringPayloadField(payload, 'scope');
  const targetPath = stringPayloadField(payload, 'target_path')
    ?? stringPayloadField(payload, 'targetPath')
    ?? stringPayloadField(payload, 'path');
  if (scope !== 'workspace' && scope !== 'quest') {
    throw new FrameworkContractError('cli_usage_error', 'settings_reload_codex_surface action requires payload.scope workspace or quest.', {
      action_id: 'settings_reload_codex_surface',
      allowed_scopes: ['workspace', 'quest'],
    });
  }
  if (!targetPath) {
    throw new FrameworkContractError('cli_usage_error', 'settings_reload_codex_surface action requires payload.target_path.', {
      action_id: 'settings_reload_codex_surface',
      required: ['target_path'],
    });
  }
  return { scope, targetPath };
}

export function booleanPayloadField(payload: JsonRecord, field: string, fallback = false) {
  const value = payload[field];
  return typeof value === 'boolean' ? value : fallback;
}

export function positiveIntegerPayloadField(payload: JsonRecord, field: string) {
  const value = payload[field];
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new FrameworkContractError('cli_usage_error', `${field} must be a positive integer.`, {
      field,
      value,
    });
  }
  return value;
}

export function parseCodexAction(actionId: string): OplEngineAction | null {
  const match = /^codex_(install|update|reinstall|remove)$/.exec(actionId);
  return match ? match[1] as OplEngineAction : null;
}

export function parseModuleAction(actionId: string): OplModuleAction | null {
  const match = /^module_(install|update|reinstall|remove)$/.exec(actionId);
  return match ? match[1] as OplModuleAction : null;
}

export function modulePayload(payload: JsonRecord): OplModuleId {
  const moduleId = stringPayloadField(payload, 'module_id')
    ?? stringPayloadField(payload, 'moduleId')
    ?? stringPayloadField(payload, 'module');
  if (!moduleId) {
    throw new FrameworkContractError('cli_usage_error', 'module action requires payload.module_id.', {
      required: ['module_id'],
    });
  }
  return resolveOplDomainModuleSpec(moduleId).module_id;
}

export function dockerWebuiSeedEnv(payload: JsonRecord) {
  const imageManifestPath = stringPayloadField(payload, 'image_manifest_path')
    ?? stringPayloadField(payload, 'imageManifestPath');
  const imageSeedDir = stringPayloadField(payload, 'image_seed_dir')
    ?? stringPayloadField(payload, 'imageSeedDir');
  return {
    imageManifestPath,
    imageSeedDir,
    commandPreview: [
      ...(imageManifestPath ? [`OPL_IMAGE_MANIFEST_PATH=${imageManifestPath}`] : []),
      ...(imageSeedDir ? [`OPL_IMAGE_SEED_DIR=${imageSeedDir}`] : []),
      'opl',
      'system',
      'startup-maintenance',
      '--json',
    ],
  };
}

export function settingsVerifyWorkspacePayload(payload: JsonRecord) {
  const workspacePath = stringPayloadField(payload, 'workspace_path')
    ?? stringPayloadField(payload, 'workspacePath')
    ?? stringPayloadField(payload, 'workspace')
    ?? stringPayloadField(payload, 'path');
  if (!workspacePath) {
    throw new FrameworkContractError('cli_usage_error', 'settings_verify_workspace action requires payload.workspace_path.', {
      action_id: 'settings_verify_workspace',
      required: ['workspace_path'],
    });
  }
  return workspacePath;
}

export function agentPackageRegistryUrlPayload(payload: JsonRecord) {
  const registryUrl = stringPayloadField(payload, 'registry_url')
    ?? stringPayloadField(payload, 'registryUrl')
    ?? stringPayloadField(payload, 'url');
  if (!registryUrl) {
    throw new FrameworkContractError('cli_usage_error', 'refresh_registry action requires payload.registry_url.', {
      action_id: 'refresh_registry',
      required: ['registry_url'],
    });
  }
  return registryUrl;
}

export function agentPackageInstallPayload(payload: JsonRecord, options: { allowPackageOnly?: boolean } = {}) {
  const manifestUrl = stringPayloadField(payload, 'manifest_url')
    ?? stringPayloadField(payload, 'manifestUrl');
  const registryUrl = stringPayloadField(payload, 'registry_url')
    ?? stringPayloadField(payload, 'registryUrl');
  const packageId = stringPayloadField(payload, 'package_id')
    ?? stringPayloadField(payload, 'packageId');
  const trustTier = stringPayloadField(payload, 'trust_tier')
    ?? stringPayloadField(payload, 'trustTier');
  const sourceKind = stringPayloadField(payload, 'source_kind')
    ?? stringPayloadField(payload, 'sourceKind');
  if (!manifestUrl && !(registryUrl && packageId) && !(options.allowPackageOnly && packageId)) {
    throw new FrameworkContractError('cli_usage_error', 'install_from_manifest_url action requires payload.manifest_url or payload.registry_url + payload.package_id.', {
      action_id: 'install_from_manifest_url',
      required: ['manifest_url or registry_url + package_id'],
    });
  }
  return {
    manifestUrl,
    registryUrl,
    packageId,
    trustTier,
    sourceKind: sourceKind as Parameters<typeof runOplAgentPackageInstall>[0]['sourceKind'],
  };
}

export function agentPackageIdPayload(actionId: string, payload: JsonRecord) {
  const packageId = stringPayloadField(payload, 'package_id')
    ?? stringPayloadField(payload, 'packageId');
  if (!packageId) {
    throw new FrameworkContractError('cli_usage_error', `${actionId} action requires payload.package_id.`, {
      action_id: actionId,
      required: ['package_id'],
    });
  }
  return { packageId };
}

export function agentPackagePreferencesPayload(payload: JsonRecord) {
  const { packageId } = agentPackageIdPayload('agent_package_preferences_set', payload);
  const exposureAction = stringPayloadField(payload, 'exposure_action')
    ?? stringPayloadField(payload, 'exposureAction');
  const shortcutId = stringPayloadField(payload, 'shortcut_id')
    ?? stringPayloadField(payload, 'shortcutId');

  if (
    exposureAction != null
    && exposureAction !== 'hide'
    && exposureAction !== 'unhide'
    && exposureAction !== 'enable'
    && exposureAction !== 'disable'
  ) {
    throw new FrameworkContractError('cli_usage_error', 'agent_package_preferences_set action requires payload.exposure_action hide, unhide, enable, or disable.', {
      action_id: 'agent_package_preferences_set',
      allowed_exposure_actions: ['hide', 'unhide', 'enable', 'disable'],
    });
  }
  if (!exposureAction && !shortcutId) {
    throw new FrameworkContractError('cli_usage_error', 'agent_package_preferences_set action requires payload.exposure_action or payload.shortcut_id.', {
      action_id: 'agent_package_preferences_set',
      required: ['exposure_action or shortcut_id'],
    });
  }
  if (exposureAction && shortcutId) {
    throw new FrameworkContractError('cli_usage_error', 'agent_package_preferences_set action accepts one preference target per request.', {
      action_id: 'agent_package_preferences_set',
      mutually_exclusive: ['exposure_action', 'shortcut_id'],
    });
  }
  const visible = typeof payload.visible === 'boolean' ? payload.visible : undefined;
  const sortOrder = typeof payload.sort_order === 'number' && Number.isFinite(payload.sort_order)
    ? payload.sort_order
    : typeof payload.sortOrder === 'number' && Number.isFinite(payload.sortOrder)
      ? payload.sortOrder
      : undefined;
  if (exposureAction) {
    return {
      packageId,
      exposureAction: exposureAction as 'hide' | 'unhide' | 'enable' | 'disable',
      visible,
      sortOrder,
    };
  }
  if (!shortcutId) {
    throw new FrameworkContractError('cli_usage_error', 'agent_package_preferences_set action requires payload.shortcut_id.', {
      action_id: 'agent_package_preferences_set',
      required: ['shortcut_id'],
    });
  }
  return {
    packageId,
    shortcutId,
    visible,
    sortOrder,
  };
}

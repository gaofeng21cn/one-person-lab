import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import { optionalString } from '../../../kernel/json-file.ts';
import type { OplUpdateChannel } from '../../../kernel/system-preferences.ts';
import { type OplEngineAction, type OplModuleAction, type OplModuleId } from '../../connect/index.ts';

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
  if (
    moduleId !== 'medautoscience'
    && moduleId !== 'medautogrant'
    && moduleId !== 'redcube'
    && moduleId !== 'oplmetaagent'
    && moduleId !== 'oplbookforge'
    && moduleId !== 'meddeepscientist'
  ) {
    throw new FrameworkContractError('cli_usage_error', 'module action requires a known payload.module_id.', {
      required: ['module_id'],
      allowed_module_ids: ['medautoscience', 'medautogrant', 'redcube', 'oplmetaagent', 'oplbookforge', 'meddeepscientist'],
    });
  }
  return moduleId;
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

export function schedulerTickArgs(payload: JsonRecord) {
  const args = ['scheduler', 'tick', '--provider', 'temporal'];
  if (booleanPayloadField(payload, 'force')) {
    args.push('--force');
  }
  const limit = positiveIntegerPayloadField(payload, 'limit');
  if (limit !== null) {
    args.push('--limit', String(limit));
  }
  const profile = stringPayloadField(payload, 'profile');
  if (profile) {
    args.push('--profile', profile);
  }
  if (payload.hydrate === false) {
    args.push('--no-hydrate');
  }
  return args;
}

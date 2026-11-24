import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import { optionalString } from '../../../kernel/json-file.ts';
import type { OplUpdateChannel } from '../../../kernel/system-preferences.ts';
import {
  resolveOplDomainModuleSpec,
  type OplEngineAction,
  type OplModuleAction,
  type OplModuleId,
} from '../../../adapters/integration/index.ts';

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

export function booleanPayloadField(payload: JsonRecord, field: string, fallback = false) {
  const value = payload[field];
  return typeof value === 'boolean' ? value : fallback;
}

export function packageContributionExecutePayload(payload: JsonRecord) {
  const actionId = 'package_contribution_execute';
  const requiredFields = ['package_id', 'ref', 'input', 'confirmed'];
  const unexpectedFields = Object.keys(payload).filter((field) => !requiredFields.includes(field));
  const missingFields = requiredFields.filter((field) => !(field in payload));
  if (unexpectedFields.length > 0 || missingFields.length > 0) {
    throw new FrameworkContractError('cli_usage_error', `${actionId} requires the exact payload shape.`, {
      action_id: actionId,
      required: requiredFields,
      missing_fields: missingFields,
      unexpected_fields: unexpectedFields,
    });
  }
  const packageId = stringPayloadField(payload, 'package_id');
  const ref = stringPayloadField(payload, 'ref');
  const input = payload.input;
  const confirmed = payload.confirmed;
  if (!packageId || !ref || !input || typeof input !== 'object' || Array.isArray(input) || typeof confirmed !== 'boolean') {
    throw new FrameworkContractError('cli_usage_error', `${actionId} payload fields are invalid.`, {
      action_id: actionId,
      required: requiredFields,
      package_id_valid: Boolean(packageId),
      ref_valid: Boolean(ref),
      input_must_be_object: true,
      confirmed_must_be_boolean: true,
    });
  }
  return {
    packageId,
    ref,
    input: input as JsonRecord,
    confirmed,
  };
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

export function agentPackageInstallPayload(payload: JsonRecord) {
  return agentPackageIdPayload('agent_package_install', payload);
}

export function agentPackageManifestInstallPayload(payload: JsonRecord) {
  const manifestUrl = stringPayloadField(payload, 'manifest_url');
  const trustTier = stringPayloadField(payload, 'trust_tier');
  if (!manifestUrl || (trustTier !== 'third_party_unverified' && trustTier !== 'third_party_verified')) {
    throw new FrameworkContractError('cli_usage_error', 'install_from_manifest_url requires manifest_url and an explicit trust_tier.', {
      action_id: 'install_from_manifest_url',
      required: ['manifest_url', 'trust_tier'],
      allowed_trust_tiers: ['third_party_unverified', 'third_party_verified'],
    });
  }
  return {
    manifestUrl,
    trustTier: trustTier as 'third_party_unverified' | 'third_party_verified',
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

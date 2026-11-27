import {
  checkPrivatePackageSource, configurePrivatePackageSource, disconnectPrivatePackageSource, listPrivatePackageSources,
} from '@opl/pack';
import { DaemonRpcError } from '../errors.ts';

const configure = {
  action_id: 'source_configure', label: 'Connect GitHub account',
  payload_fields: ['source_id', 'provider_id', 'credential_handle', 'enabled'],
  default_payload: { provider_id: 'github_packages', credential_handle: 'provider:github_packages:gh-cli', enabled: true },
  confirmation_required: true,
};

export const softwareSourceActions = [
  { action_id: 'source_list', label: 'List software sources', payload_fields: [], confirmation_required: false },
  configure,
  { action_id: 'source_check', label: 'Check access', payload_fields: ['source_id'], confirmation_required: false },
  { action_id: 'source_disconnect', label: 'Disconnect', payload_fields: ['source_id'], confirmation_required: true },
].map(action => ({ ...action, owner: 'opl-framework', route: 'opld app.action.execute', dry_run_supported: false }));

type SourceAction = typeof softwareSourceActions[number];

export function projectSoftwareSources(stateDir: string) {
  const entries = listPrivatePackageSources({ stateDir }).map(source => ({
    ...source,
    origin_basis: 'owner_projection',
    catalog_source: { manager: 'opl_packages', marketplace_id: source.source_id, delivery: 'marketplace' },
    available_actions: softwareSourceActions,
  }));
  return {
    surface_kind: 'opl_software_sources_projection.v1',
    status: entries.some(source => source.enabled && source.credential_handle_present && source.status !== 'authorized')
      ? 'attention_required' : 'available',
    entries,
    authority_boundary: { owner: 'opl_framework', credential_values_exposed: false },
  };
}

export async function executeSoftwareSourceAction(
  action: SourceAction, payload: Record<string, unknown>, dryRun: boolean, stateDir: string,
) {
  if (dryRun || Object.keys(payload).some(key => key !== 'confirmed' && !action.payload_fields.includes(key))) {
    throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'Unexpected software source action parameters.');
  }
  if (action.confirmation_required && payload.confirmed !== true) {
    throw new DaemonRpcError(-32602, 'CONFIRMATION_REQUIRED', 'Confirm this software source change.');
  }
  const sourceId = payload.source_id;
  let result;
  if (action.action_id === 'source_list') {
    result = { software_sources: projectSoftwareSources(stateDir) };
  } else if (typeof sourceId !== 'string') {
    throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'A software source ID is required.');
  } else if (action.action_id === 'source_configure') {
    if (payload.provider_id !== 'github_packages' || typeof payload.credential_handle !== 'string' ||
        typeof payload.enabled !== 'boolean') {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'Specify a GitHub Packages credential reference and enabled state.');
    }
    const source = configurePrivatePackageSource({ stateDir, sourceId, credentialHandle: payload.credential_handle, enabled: payload.enabled });
    result = { software_source: source.enabled ? await checkPrivatePackageSource({ stateDir, sourceId }) : source };
  } else if (action.action_id === 'source_check') {
    result = { software_source: await checkPrivatePackageSource({ stateDir, sourceId }) };
  } else {
    result = { software_source: disconnectPrivatePackageSource({ stateDir, sourceId }) };
  }
  return {
    ok: true, status: 'executed',
    app_action_execution: { surface_kind: 'opl_app_action_execution.v1', action_id: action.action_id, dry_run: false, result },
  };
}

import type { SqliteDb } from '@opl/core';
import {
  checkPrivatePackageSource, configurePrivatePackageSource, disconnectPrivatePackageSource, listPrivatePackageSources,
} from '@opl/pack';
import type { SoftwareCatalogSnapshot } from '../state/package-catalog.ts';
import { DaemonRpcError } from '../errors.ts';

const configure = {
  action_id: 'source_configure', label: 'Connect GitHub account',
  payload_fields: ['source_id', 'provider_id', 'credential_handle', 'enabled'],
  default_payload: { provider_id: 'github_packages', credential_handle: 'provider:github_packages:gh-cli', enabled: true },
  confirmation_required: true,
};

export const softwareSourceActions = [
  { action_id: 'source_refresh', label: 'Refresh software catalog', payload_fields: ['source_id'], confirmation_required: false, delegated_surface: 'pack.sources.refresh' },
  { action_id: 'source_list', label: 'List software sources', payload_fields: [], confirmation_required: false },
  configure,
  { action_id: 'source_check', label: 'Check access', payload_fields: ['source_id'], confirmation_required: false },
  { action_id: 'source_disconnect', label: 'Disconnect', payload_fields: ['source_id'], confirmation_required: true },
].map(action => ({ ...action, owner: 'opl-framework', route: 'opld app.action.execute', dry_run_supported: false }));

type SourceAction = typeof softwareSourceActions[number];

export function projectSoftwareSources(db: SqliteDb, catalogStatus: SoftwareCatalogSnapshot['status'] = 'loading') {
  const entries = listPrivatePackageSources(db).map(source => ({
    ...source,
    origin_basis: 'owner_projection',
    catalog_source: { manager: 'opl_packages', marketplace_id: source.source_id, delivery: 'marketplace' },
    available_actions: softwareSourceActions,
  }));
  return {
    surface_kind: 'opl_software_sources_projection.v1',
    status: entries.some(source => source.enabled && source.credential_handle_present && source.status !== 'authorized')
      ? 'attention_required' : 'available',
    entries: [...entries, {
      source_id: 'public-registry:opl',
      provider_id: 'opl_catalog',
      display_name: 'OPL Software Catalog',
      enabled: true,
      credential_handle_present: false,
      catalog_origin: 'opl',
      origin_basis: 'owner_projection',
      status: catalogStatus,
      catalog_source: { manager: 'opl_packages', marketplace_id: 'public-registry:opl', delivery: 'marketplace' },
      available_actions: softwareSourceActions.filter(action => action.action_id === 'source_refresh'),
    }],
    authority_boundary: { owner: 'opl_framework', credential_values_exposed: false },
  };
}

export async function executeSoftwareSourceAction(
  action: SourceAction, payload: Record<string, unknown>, dryRun: boolean, db: SqliteDb, onConfigured: () => void,
  refreshCatalog?: () => Promise<unknown>,
) {
  if (dryRun || Object.keys(payload).some(key => key !== 'confirmed' && !action.payload_fields.includes(key))) {
    throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'Unexpected software source action parameters.');
  }
  if (action.confirmation_required && payload.confirmed !== true) {
    throw new DaemonRpcError(-32602, 'CONFIRMATION_REQUIRED', 'Confirm this software source change.');
  }
  const sourceId = payload.source_id;
  let result;
  if (action.action_id === 'source_refresh') {
    if (!refreshCatalog || (sourceId !== undefined && sourceId !== 'public-registry:opl')) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'Expected the public software catalog source.');
    }
    result = await refreshCatalog();
  } else if (action.action_id === 'source_list') {
    result = { software_sources: projectSoftwareSources(db) };
  } else if (typeof sourceId !== 'string') {
    throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'A software source ID is required.');
  } else if (action.action_id === 'source_configure') {
    if (payload.provider_id !== 'github_packages' || typeof payload.credential_handle !== 'string' ||
        typeof payload.enabled !== 'boolean') {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'Specify a GitHub Packages credential reference and enabled state.');
    }
    const source = configurePrivatePackageSource(db, { sourceId, credentialHandle: payload.credential_handle, enabled: payload.enabled });
    onConfigured();
    result = { software_source: source.enabled ? await checkPrivatePackageSource(db, sourceId) : source };
  } else if (action.action_id === 'source_check') {
    result = { software_source: await checkPrivatePackageSource(db, sourceId) };
  } else {
    result = { software_source: disconnectPrivatePackageSource(db, sourceId) };
  }
  return {
    ok: true, status: 'executed',
    app_action_execution: { surface_kind: 'opl_app_action_execution.v1', action_id: action.action_id, dry_run: false, result },
  };
}

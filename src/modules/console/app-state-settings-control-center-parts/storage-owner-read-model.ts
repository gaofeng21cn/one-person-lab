import {
  agentPackageStorageNavigationAction,
  compactStorageOwnerInventorySnapshot,
  webuiHostActionRequired,
} from '../../connect/storage-owner-inventory-snapshot.ts';
import { asRecord } from './shared.ts';

export function buildStorageOwnerReadModel(value: unknown) {
  const snapshot = asRecord(compactStorageOwnerInventorySnapshot(value));
  const agentPackageStore = asRecord(snapshot.agent_package_store);
  const webuiDataVolume = asRecord(snapshot.webui_data_volume);
  return {
    surface_kind: 'opl_settings_storage_owner_read_model.v1',
    snapshot_updated_at: snapshot.snapshot_updated_at ?? null,
    agent_package_store: {
      status: 'unavailable',
      observed_at: null,
      stale: true,
      bytes: null,
      reclaimable_bytes: null,
      owner_route: '/settings/agents',
      projected_action: agentPackageStorageNavigationAction(),
      ...agentPackageStore,
      inventory_action_id: 'settings_inventory_agent_package_store',
      cleanup_action_id: 'agent_package_uninstall',
      cleanup_policy: 'existing_package_owner_transaction_only',
    },
    webui_data_volume: {
      status: 'unavailable',
      observed_at: null,
      stale: true,
      bytes: null,
      reclaimable_bytes: null,
      owner_route: '/settings/storage#webui-data',
      projected_action: webuiHostActionRequired(),
      ...webuiDataVolume,
      inventory_action_id: 'settings_inventory_webui_data_volume',
      destructive_action_owner: 'carrier_host',
      framework_execute_status: 'host_action_required',
    },
    action_surface: 'opl app action execute --json',
    owner_action_ids: [
      'settings_inventory_agent_package_store',
      'settings_inventory_webui_data_volume',
      'agent_package_uninstall',
    ],
    authority_boundary: {
      shell_direct_filesystem_mutation_allowed: false,
      shell_direct_package_mutation_allowed: false,
      generic_docker_prune_allowed: false,
    },
  };
}

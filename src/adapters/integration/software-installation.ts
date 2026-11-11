import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { discoverInstalledPackageDescriptors } from './agent-package-registry-parts/installed-codex-plugin-directory.ts';
import { executeSoftwareInstallationOwner } from './agent-package-registry-parts/software-installation-owner.ts';
import { packageSnapshot, directoryFrom } from './agent-package-registry-parts/registry-status-projection.ts';
import { runOplAgentPackageUpdate, runOplAgentPackageUninstall } from './agent-package-registry-parts/registry-lifecycle-actions.ts';

export const SOFTWARE_INSTALLATION_ACTION_ID = 'software_installation_execute';
export function softwareInstallationActionCatalog() {
  return [{ action_id: SOFTWARE_INSTALLATION_ACTION_ID, label: 'Manage selected installation',
    delegated_surface: 'installed_package_owner_installation_cli',
    payload_fields: ['package_id', 'expected_revision', 'operation'],
    mutates: 'selected_owner_installation', dry_run_supported: false, confirmation_required: true,
    danger_level: 'medium' as const, impact: 'Change only the selected software installation through its own installer; preserve source checkouts and business data.',
    follow_up_action_ids: [], verify_action_id: 'source_list' }];
}
export async function executeSoftwareInstallationAction(payload: Record<string, unknown>) {
  if (typeof payload.package_id !== 'string') throw new FrameworkContractError('cli_usage_error', 'package_id is required.');
  const descriptor = discoverInstalledPackageDescriptors({ packageId: payload.package_id, failClosedOnCarrierError: true }).get(payload.package_id);
  if (!descriptor?.readiness.installed) throw new FrameworkContractError('cli_usage_error', 'Install or update the software integration before managing its installations.');
  if (descriptor.manifest.entrypoints.some(entry => (entry.entrypoint_kind ?? entry.kind) === 'opl_software_installation_cli'))
    return executeSoftwareInstallationOwner(descriptor, payload);
  if (Object.keys(payload).some(key => !['package_id', 'installation_id', 'expected_revision', 'operation', 'version'].includes(key)))
    throw new FrameworkContractError('cli_usage_error', 'Unsupported installation fields.');
  const snapshot = packageSnapshot({ includeAvailable: true, failClosedOnCarrierError: true });
  const directory = directoryFrom(snapshot, 'fast');
  const product = directory.entries.find(item => item.package_id === payload.package_id);
  const row = product?.installations.find(item => item.installation_id === payload.installation_id);
  const candidate = row?.available_actions.find(item => isRecord(item.payload)
    && item.payload.operation === payload.operation && item.payload.expected_revision === payload.expected_revision
    && item.payload.version === payload.version);
  if (!candidate || row?.manager !== 'codex_plugin_manager')
    throw new FrameworkContractError('cli_usage_error', 'Refresh this installation before changing it.', { reason_code: 'software_installation_stale_or_unavailable' });
  const input = { packageId: payload.package_id };
  const result = payload.operation === 'update' ? await runOplAgentPackageUpdate(input)
    : await runOplAgentPackageUninstall(input);
  return { ...result, installations: directoryFrom(packageSnapshot({ includeAvailable: true }), 'fast').entries
    .find(item => item.package_id === payload.package_id)?.installations ?? [] };
}

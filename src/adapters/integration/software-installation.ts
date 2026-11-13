import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { execFileSync } from 'node:child_process';
import { writeOplDeveloperSupervisorConfig } from '../../kernel/system-preferences.ts';
import { executeSoftwareInstallationOwner, readSoftwareInstallationOwner, supplementalInstallationOwner } from './agent-package-registry-parts/software-installation-owner.ts';
import { packageSnapshot, directoryFrom } from './agent-package-registry-parts/registry-status-projection.ts';
import { runOplAgentPackageInstall, runOplAgentPackageUpdate, runOplAgentPackageUninstall } from './agent-package-registry-parts/registry-lifecycle-actions.ts';
import { getOplPackageSpecs } from './package-distribution.ts';
import { executeFrameworkSoftwareInstallation } from './software-sources-framework-installation.ts';

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
  if (payload.package_id === 'opl-framework') return executeFrameworkSoftwareInstallation(payload);
  const snapshot = packageSnapshot({ includeAvailable: true, failClosedOnCarrierError: true });
  let descriptor = snapshot.installed.get(payload.package_id);
  const owner = snapshot.currentOwner?.get(payload.package_id) ?? snapshot.descriptors.get(payload.package_id);
  if (owner && supplementalInstallationOwner(owner) && payload.profile !== undefined && payload.operation === 'install') {
    if (Object.keys(payload).some(key => !['package_id', 'expected_revision', 'operation', 'version', 'profile'].includes(key)))
      throw new FrameworkContractError('cli_usage_error', 'Unsupported installation profile fields.');
    const offered = readSoftwareInstallationOwner(descriptor ?? owner, owner)?.installation_actions;
    const selected = offered?.find(action => isRecord(action.payload)
      && action.payload.profile === payload.profile && action.payload.version === payload.version
      && action.payload.expected_revision === payload.expected_revision);
    if (!selected || snapshot.access.get(payload.package_id)?.download_allowed !== true)
      throw new FrameworkContractError('cli_usage_error', 'Refresh this installation before changing it.', { reason_code: 'software_installation_stale_or_unavailable' });
    // Install the small default carrier through its existing owner first. The
    // optional data installation never changes dependency resolution defaults.
    if (!descriptor || descriptor.manifest.version !== payload.version
      || descriptor.manifest.content_digest !== owner.manifest.content_digest
      || !supplementalInstallationOwner(descriptor)) {
      if (descriptor) await runOplAgentPackageUpdate({ packageId: payload.package_id });
      else await runOplAgentPackageInstall({ packageId: payload.package_id });
      descriptor = packageSnapshot({ includeAvailable: true, failClosedOnCarrierError: true }).installed.get(payload.package_id);
    }
    if (!descriptor || descriptor.manifest.version !== payload.version
      || !owner.manifest.content_digest || descriptor.manifest.content_digest !== owner.manifest.content_digest
      || !supplementalInstallationOwner(descriptor))
      throw new FrameworkContractError('contract_shape_invalid', 'The default carrier did not expose the selected installation profile.');
    const current = readSoftwareInstallationOwner(descriptor)?.installation_actions.find(action => isRecord(action.payload)
      && action.payload.profile === payload.profile && action.payload.version === payload.version);
    if (!current || !isRecord(current.payload))
      throw new FrameworkContractError('cli_usage_error', 'The selected installation profile changed while preparing its carrier.');
    return executeSoftwareInstallationOwner(descriptor, current.payload);
  }
  if (descriptor?.manifest.entrypoints.some(entry => (entry.entrypoint_kind ?? entry.kind) === 'opl_software_installation_cli')
    && (!supplementalInstallationOwner(descriptor)
      || readSoftwareInstallationOwner(descriptor)?.installations.some(row => row.installation_id === payload.installation_id)))
    return executeSoftwareInstallationOwner(descriptor, payload);
  if (Object.keys(payload).some(key => !['package_id', 'installation_id', 'expected_revision', 'operation', 'version'].includes(key)))
    throw new FrameworkContractError('cli_usage_error', 'Unsupported installation fields.');
  const directory = directoryFrom(snapshot, 'fast');
  const product = directory.entries.find(item => item.package_id === payload.package_id);
  const row = product?.installations.find(item => item.installation_id === payload.installation_id);
  const candidate = row?.available_actions.find(item => isRecord(item.payload)
    && item.payload.operation === payload.operation && item.payload.expected_revision === payload.expected_revision
    && item.payload.version === payload.version);
  if (!candidate || !row)
    throw new FrameworkContractError('cli_usage_error', 'Refresh this installation before changing it.', { reason_code: 'software_installation_stale_or_unavailable' });
  const input = { packageId: payload.package_id };
  let result: Record<string, unknown>;
  if (payload.operation === 'activate') {
    const spec = getOplPackageSpecs().find(item => item.package_id === payload.package_id);
    if (!spec) throw new FrameworkContractError('cli_usage_error', 'Installation has no source selection owner.');
    writeOplDeveloperSupervisorConfig({ module_source_preferences: { [spec.module_id]: row.mode === 'development' ? 'developer' : 'managed' } });
    result = { status: 'activated', package_id: payload.package_id };
  } else if (row.manager === 'codex_plugin_manager') {
    result = payload.operation === 'update' ? await runOplAgentPackageUpdate(input) : await runOplAgentPackageUninstall(input);
  } else if (row.manager === 'uv') {
    execFileSync('uv', ['tool', 'uninstall', payload.package_id], { encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'] });
    result = { status: payload.operation === 'unlink' ? 'unlinked' : 'uninstalled', package_id: payload.package_id };
  } else throw new FrameworkContractError('cli_usage_error', 'Use the declared installation owner.');
  const installations = directoryFrom(packageSnapshot({ includeAvailable: true }), 'fast').entries
    .find(item => item.package_id === payload.package_id)?.installations ?? [];
  const remaining = installations.find(item => item.installation_id === payload.installation_id);
  if (payload.operation === 'activate' ? remaining?.active !== true : payload.operation === 'update' ? remaining?.version !== payload.version : remaining !== undefined)
    throw new FrameworkContractError('contract_shape_invalid', 'The installation owner did not confirm the requested result.');
  return { ...result, installations };
}

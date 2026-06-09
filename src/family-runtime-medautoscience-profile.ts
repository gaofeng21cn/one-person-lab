import { getActiveWorkspaceBinding } from './workspace-registry.ts';
import type { FamilyRuntimeDomainProfiles } from './family-runtime-command.ts';

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function activeMedautoscienceWorkspaceProfile() {
  const binding = getActiveWorkspaceBinding('medautoscience');
  if (!binding) {
    return null;
  }
  const workspaceLocator = binding?.direct_entry.workspace_locator;
  const profileRef = workspaceLocator?.surface_kind === 'med_autoscience_workspace_profile'
    ? optionalString(workspaceLocator.profile_ref)
    : null;
  return profileRef
    ? {
        profileRef,
        binding,
      }
    : null;
}

export function resolveExplicitMedautoscienceDomainProfile(domainProfiles?: FamilyRuntimeDomainProfiles) {
  return optionalString(domainProfiles?.medautoscience)
    ?? optionalString(process.env.OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_PROFILE)
    ?? null;
}

export function resolveMedautoscienceDomainProfile(domainProfiles?: FamilyRuntimeDomainProfiles) {
  return resolveExplicitMedautoscienceDomainProfile(domainProfiles)
    ?? activeMedautoscienceWorkspaceProfile()?.profileRef
    ?? null;
}

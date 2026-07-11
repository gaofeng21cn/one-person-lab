import { optionalString } from '../../kernel/json-file.ts';
import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { listWorkspaceBindings } from '../workspace/index.ts';
import type { FamilyRuntimeDomainProfiles } from './family-runtime-command.ts';
import { runtimeManagerDomainProfiles } from './family-runtime-types.ts';

function profileEnvName(domainId: string) {
  return `OPL_FAMILY_RUNTIME_${domainId.toUpperCase().replace(/[^A-Z0-9]/g, '')}_PROFILE`;
}

export function resolveFamilyRuntimeDomainProfiles(
  domainProfiles?: FamilyRuntimeDomainProfiles,
): FamilyRuntimeDomainProfiles | undefined {
  const registeredDomainIds = runtimeManagerDomainProfiles().map((profile) => profile.domain_id);
  const unsupportedDomainIds = Object.keys(domainProfiles ?? {})
    .filter((domainId) => !registeredDomainIds.includes(domainId as typeof registeredDomainIds[number]));
  if (unsupportedDomainIds.length > 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Family runtime scheduler profiles require a registered runtime-manager domain.',
      {
        unsupported_domain_ids: unsupportedDomainIds,
        allowed_domain_ids: registeredDomainIds,
      },
    );
  }
  const domainIds = new Set(registeredDomainIds);
  const bindings = new Map(listWorkspaceBindings()
    .filter((binding) => binding.status === 'active')
    .map((binding) => [binding.project_id, binding]));
  const resolved = Object.fromEntries([...domainIds].flatMap((domainId) => {
    const profileRef = optionalString((domainProfiles as Record<string, string | undefined> | undefined)?.[domainId])
      ?? optionalString(process.env[profileEnvName(domainId)])
      ?? optionalString(bindings.get(domainId)?.direct_entry.workspace_locator?.profile_ref);
    return profileRef ? [[domainId, profileRef]] : [];
  })) as FamilyRuntimeDomainProfiles;
  return Object.keys(resolved).length > 0 ? resolved : undefined;
}

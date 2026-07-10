import { optionalString } from '../../kernel/json-file.ts';
import { loadFrameworkContracts } from '../charter/index.ts';
import { listWorkspaceBindings } from '../workspace/index.ts';
import type { FamilyRuntimeDomainProfiles } from './family-runtime-command.ts';

function profileEnvName(domainId: string) {
  return `OPL_FAMILY_RUNTIME_${domainId.toUpperCase().replace(/[^A-Z0-9]/g, '')}_PROFILE`;
}

export function resolveFamilyRuntimeDomainProfiles(
  domainProfiles?: FamilyRuntimeDomainProfiles,
): FamilyRuntimeDomainProfiles | undefined {
  const domainIds = new Set([
    ...loadFrameworkContracts().domains.domains.map((domain) => domain.domain_id),
    ...Object.keys(domainProfiles ?? {}),
  ]);
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

import { listProjectedOplPackageIds } from '../../kernel/standard-agent-registry.ts';
import { canonicalAgentPackageId } from './agent-package-identity.ts';

export function isFirstPartyPackage(packageId: string | null | undefined) {
  const canonicalId = canonicalAgentPackageId(packageId);
  return canonicalId !== null && listProjectedOplPackageIds().includes(canonicalId);
}

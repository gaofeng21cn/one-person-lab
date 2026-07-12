import { fileURLToPath } from 'node:url';

import { canonicalAgentPackageId } from './agent-package-identity.ts';

const FIRST_PARTY_PACKAGE_MANIFESTS = new Map([
  ['mas', 'mas.json'],
  ['mag', 'mag.json'],
  ['rca', 'rca.json'],
  ['oma', 'oma.json'],
  ['obf', 'obf.json'],
  ['opl-flow', 'opl-flow.json'],
  ['mas-scholar-skills', 'mas-scholar-skills.json'],
]);

export function resolveFirstPartyPackageManifest(packageId: string | null | undefined) {
  const canonicalId = canonicalAgentPackageId(packageId);
  if (!canonicalId) return null;
  const fileName = FIRST_PARTY_PACKAGE_MANIFESTS.get(canonicalId);
  if (!fileName) return null;
  return {
    canonicalId,
    manifestUrl: fileURLToPath(
      new URL(`../../../contracts/opl-framework/packages/${fileName}`, import.meta.url),
    ),
  };
}

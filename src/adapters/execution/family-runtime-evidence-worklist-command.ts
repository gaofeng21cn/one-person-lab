import { loadFrameworkContracts } from '../../authority/contracts/index.ts';
import { runFamilyRuntimeEvidenceWorklist } from './family-runtime-evidence-worklist.ts';
import type { RuntimeTraySnapshotProvider } from './runtime-tray-snapshot-provider.ts';
import type { DomainManifestCatalog } from './family-runtime-evidence-worklist/stage-readiness-input.ts';
import type { CordisOwnerDeltaObserverService } from '../../authority/evidence/index.ts';

export function runFamilyRuntimeEvidenceWorklistCommand(
  input: Parameters<typeof runFamilyRuntimeEvidenceWorklist>[1],
  options: {
    runtimeSnapshotProvider?: RuntimeTraySnapshotProvider;
    domainManifests?: DomainManifestCatalog;
    ownerDeltaObserver?: CordisOwnerDeltaObserverService;
  } = {},
) {
  return runFamilyRuntimeEvidenceWorklist(loadFrameworkContracts(), {
    ...input,
    ...(options.runtimeSnapshotProvider ? { runtimeSnapshotProvider: options.runtimeSnapshotProvider } : {}),
    ...(options.domainManifests ? { domainManifests: options.domainManifests } : {}),
    ownerDeltaObserver: options.ownerDeltaObserver ?? input.ownerDeltaObserver,
  });
}

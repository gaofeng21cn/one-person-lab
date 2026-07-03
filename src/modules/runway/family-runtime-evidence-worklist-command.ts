import { loadFrameworkContracts } from '../charter/index.ts';
import { runFamilyRuntimeEvidenceWorklist } from './family-runtime-evidence-worklist.ts';
import type { RuntimeTraySnapshotProvider } from './runtime-tray-snapshot-provider.ts';

export function runFamilyRuntimeEvidenceWorklistCommand(
  input: Parameters<typeof runFamilyRuntimeEvidenceWorklist>[1],
  options: { runtimeSnapshotProvider?: RuntimeTraySnapshotProvider } = {},
) {
  return runFamilyRuntimeEvidenceWorklist(loadFrameworkContracts(), {
    ...input,
    ...(options.runtimeSnapshotProvider ? { runtimeSnapshotProvider: options.runtimeSnapshotProvider } : {}),
  });
}

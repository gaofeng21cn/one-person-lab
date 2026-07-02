import { loadFrameworkContracts } from '../charter/contracts.ts';
import { runFamilyRuntimeEvidenceWorklist } from './family-runtime-evidence-worklist.ts';

export function runFamilyRuntimeEvidenceWorklistCommand(
  input: Parameters<typeof runFamilyRuntimeEvidenceWorklist>[1],
) {
  return runFamilyRuntimeEvidenceWorklist(loadFrameworkContracts(), input);
}

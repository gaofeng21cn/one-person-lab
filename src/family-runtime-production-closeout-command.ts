import { loadFrameworkContracts } from './contracts.ts';
import { runFamilyRuntimeProductionCloseout } from './family-runtime-production-closeout.ts';

export function runFamilyRuntimeProductionCloseoutCommand(
  input: Parameters<typeof runFamilyRuntimeProductionCloseout>[1],
) {
  return runFamilyRuntimeProductionCloseout(loadFrameworkContracts(), input);
}

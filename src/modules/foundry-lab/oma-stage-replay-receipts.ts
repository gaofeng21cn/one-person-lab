import { defaultOmaRepoDir } from './opl-meta-agent-consumption.ts';
import {
  omaProductionAcceptanceStageReplayReceipts,
  readOmaProductionAcceptance,
} from './opl-meta-agent-production-acceptance.ts';

export function repoTrackedOmaStageReplayMissingReceiptReceipts() {
  const omaRepoDir = defaultOmaRepoDir();
  if (!omaRepoDir) {
    return [];
  }
  const productionAcceptance = readOmaProductionAcceptance(omaRepoDir);
  if (productionAcceptance.status !== 'resolved') {
    return [];
  }
  return omaProductionAcceptanceStageReplayReceipts(productionAcceptance.payload);
}

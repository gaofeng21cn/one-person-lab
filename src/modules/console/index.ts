export const OPL_CONSOLE_SOURCE_MODULE = {
  moduleId: 'console',
  brandName: 'OPL Console',
  contractRef: 'contracts/opl-framework/source-module-map.json#modules.console',
  physicalRoot: 'src/modules/console',
} as const;

// Public cross-module surface generated from existing module consumers.
export { appReleaseUserPathEvidencePayloadPreflight, recordAppReleaseUserPathEvidenceReceipts, verifyAppReleaseUserPathEvidenceReceipt } from '../ledger/index.ts';
export type { AppReleaseUserPathEvidenceReceiptInput } from '../ledger/index.ts';
export { buildAppStageRunCockpit } from '../stagecraft/index.ts';
export { buildFamilyActionCatalogParity, projectFamilyAction, projectFamilyActionCatalog } from './family-action-catalog.ts';
export { normalizeFamilyActionCatalog } from './family-action-catalog-contract.ts';
export type { FamilyActionCatalog, FamilyActionCatalogAction, FamilyActionExportFormat } from './family-action-catalog-contract.ts';
export { buildRuntimeManager, runRuntimeManagerAction } from '../runway/index.ts';
export { readOplRuntimeModes } from '../../kernel/runtime-modes.ts';
export { buildAppReleaseUserPathEvidence, frameworkAppReleaseUserPathNextSafeAction } from './runtime-tray-app-operator-drilldown-parts/app-release-user-path.ts';
export { buildAppDrilldownRefsOnlyAuthorityBoundary } from './runtime-tray-app-operator-drilldown-parts/authority-boundary.ts';
export { frameworkDeveloperModeLiveCloseoutNextSafeAction } from './runtime-tray-app-operator-drilldown-parts/developer-mode-live-closeout.ts';
export { buildMemoryTraceProjection } from '../runway/index.ts';
export { buildRuntimeTraySnapshot } from './runtime-tray-snapshot.ts';
export { runOplFlowIntelligenceEnhancementAction } from './app-state-parts/codexcont-intelligence-mode.ts';
export type { JsonRecord } from './runtime-tray-snapshot-types.ts';
export { sourceRef, uniqueByRef } from './runtime-tray-snapshot-utils.ts';
export { buildAttemptGenericProjections } from '../runway/index.ts';
export { buildOplWorkspaceRootStatus, readOplDeveloperSupervisorConfig, readOplUpdateChannel, readOplWorkspaceRoot, writeOplDeveloperSupervisorConfig, writeOplUpdateChannel, writeOplWorkspaceRoot } from '../../kernel/system-preferences.ts';
export type { OplDeveloperSupervisorConfigFile, OplUpdateChannel } from '../../kernel/system-preferences.ts';

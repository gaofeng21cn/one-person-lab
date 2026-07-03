export const OPL_FOUNDRY_LAB_SOURCE_MODULE = {
  moduleId: 'foundry-lab',
  brandName: 'OPL Foundry Lab',
  contractRef: 'contracts/opl-framework/source-module-map.json#modules.foundry-lab',
  physicalRoot: 'src/modules/foundry-lab',
} as const;

// Public cross-module surface generated from existing module consumers.
export { buildAgentLabDomainFeedbackSelfEvolutionReadModel } from './agent-lab-control-read-models.ts';
export { buildDeveloperModeAgentLabRepairRouteReadModel } from './agent-lab-developer-mode.ts';
export { listDeveloperModeCloseoutReceipts, recordDeveloperModeCloseoutReceipts, verifyDeveloperModeCloseoutReceipt } from './developer-mode-closeout-ledger.ts';
export type { DeveloperModeCloseoutReceipt, DeveloperModeCloseoutReceiptInput, DeveloperModeCloseoutReceiptVerifyInput } from './developer-mode-closeout-ledger.ts';
export { buildFeedbackOpsReadModel } from './agent-lab-feedbackops.ts';
export { hasVerifiedAgentLabRiskTierAutoPromotionReceiptRef } from './agent-lab-risk-tier-promotion-ledger.ts';
export { buildAgentDefaultCallerReadinessForRepo, buildAgentDefaultCallerReadinessReport } from './agent-platform-surface-ownership.ts';
export { DEFAULT_CALLER_OWNER_DECISION_ACCEPTED_RESULT_SHAPES, DEFAULT_CALLER_OWNER_DECISION_NEXT_REQUIRED_ACTION, DEFAULT_CALLER_RETIREMENT_MANDATORY_GATE_IDS, DEFAULT_CALLER_RETIREMENT_NON_AUTHORIZING_SURFACES, DEFAULT_CALLER_RETIREMENT_TARGET_CLASSES, DEFAULT_CALLER_SAME_WORK_UNIT_LIVE_EVIDENCE_SCOPE, DEFAULT_CALLER_STATIC_RETIREMENT_PREREQUISITE_GATE_IDS } from './default-caller-retirement-guard.ts';
export { defaultCallerSurfaceGates } from './default-caller-surface-gates.ts';
export { buildStandardDomainAgentSkeletonInspection, runFamilyAgentLegacyCleanupApply } from './family-domain-agent-skeleton.ts';
export { splitOperatorAttentionCounts } from './framework-readiness-attention-counts.ts';
export { buildFunctionalPrivatizationAudit } from './functional-privatization-audit.ts';
export type { FunctionalPrivatizationAudit } from './functional-privatization-audit.ts';
export { buildFunctionalSourcePurityTailReadModel, compactFunctionalPrivatizationAuditEnvelope } from './functional-privatization-envelope.ts';
export { OMA_PRODUCTION_CONSUMPTION_ACTION_ID, OMA_PRODUCTION_CONSUMPTION_ACTION_KIND, omaProductionConsumptionPayloadRefHints, omaProductionConsumptionPayloadTemplate, omaProductionConsumptionPayloadWorkorder, omaProductionConsumptionRuntimeActionExecuteCommand } from './oma-production-consumption-action.ts';
export { recordOmaProductionConsumptionReceipts } from './oma-production-consumption-ledger.ts';
export type { OmaProductionConsumptionReceiptInput } from './oma-production-consumption-ledger.ts';
export { buildOplMetaAgentRegistryExtension, defaultOmaRepoDir } from './opl-meta-agent-consumption.ts';
export { withOplMetaAgentDescriptorEntry } from './opl-meta-agent-descriptor-adapter.ts';
export { omaProductionAcceptanceStageReplayReceipts, readOmaProductionAcceptance } from './opl-meta-agent-production-acceptance.ts';
export { repoTrackedOmaStageReplayMissingReceiptReceipts } from './oma-stage-replay-receipts.ts';
export { DEFAULT_STANDARD_DOMAIN_AGENT_REPOS, defaultStandardDomainAgentRepoInputs } from './standard-domain-agent-family-repos.ts';
export { buildStandardDomainAgentScaffold, buildStandardDomainAgentTemplateConsumptionReadModel } from './standard-domain-agent-scaffold.ts';
export { STANDARD_AGENT_PACK_ABI, STANDARD_PROGRESS_DELTA_POLICY, STANDARD_TYPED_BLOCKER_LINEAGE_POLICY } from './standard-domain-agent-scaffold-constants.ts';
export { STANDARD_FOUNDRY_AGENT_SERIES_CONTRACT } from './standard-domain-agent-scaffold-constants-parts/foundry-series.ts';

export const OPL_LEDGER_SOURCE_MODULE = {
  moduleId: 'ledger',
  brandName: 'OPL Ledger',
  contractRef: 'contracts/opl-framework/source-module-map.json#modules.ledger',
  physicalRoot: 'src/modules/ledger',
} as const;

export { buildWorkItemControlResolver, findWorkItemControl, readWorkItemControlLedger, setWorkItemControlState, setWorkItemVisibilityState, workItemControlKey, WORK_ITEM_USER_LIFECYCLE_STATES, WORK_ITEM_VISIBILITY_STATES } from './work-item-control-ledger.ts';
export type { SetWorkItemControlStateInput, SetWorkItemVisibilityStateInput, WorkItemControlEntry, WorkItemControlIdentity, WorkItemControlLedger, WorkItemControlProjectionRecord, WorkItemUserLifecycleState, WorkItemVisibilityState } from './work-item-control-ledger.ts';

// Public cross-module surface generated from existing module consumers.
export { buildEvidenceGroundedLedgerSubstrate } from './evidence-grounded-substrate.ts';
export { doctorArtifactProvenanceBundle, exportArtifactProvenanceBundle, inspectArtifactProvenanceBundle, recordArtifactProvenanceBundle, validateArtifactProvenanceBundle } from './artifact-provenance-bundle.ts';
export { buildSubstrateProvenanceSurface } from './substrate-provenance-surface.ts';
export type { SubstrateProvenanceSurfaceInput } from './substrate-provenance-surface.ts';
export { buildCurrentOwnerDeltaCacheRefreshRequiredReadModel, buildCurrentOwnerDeltaReadModel, buildDefaultNextActionFromCurrentOwnerDelta } from './current-owner-delta-projection.ts';
export { readCurrentOwnerDeltaReadModelProjectionCache, writeCurrentOwnerDeltaReadModelProjectionCache } from './current-owner-delta-read-model-cache.ts';
export { buildCurrentOwnerDeltaTopline } from './current-owner-delta-topline.ts';
export { buildDomainDispatchEvidenceIdentityGuidance, domainDispatchEvidenceIdentityGuidanceFromRoute } from './domain-dispatch-evidence-identity-guidance.ts';
export { assertDomainDispatchEvidencePayloadReady, preflightDomainDispatchEvidencePayload } from './domain-dispatch-evidence-payload-preflight.ts';
export { domainDispatchEvidencePayloadRefs } from './domain-dispatch-evidence-payload-refs.ts';
export { buildDomainDispatchEvidenceWorkorderPacket, compactDomainDispatchEvidenceWorkorderAttentionItems, compactDomainDispatchEvidenceWorkorderGroupAttentionItems } from './domain-dispatch-evidence-workorder-packet.ts';
export { assertDomainOwnerPayloadSummaryReceiptInputReady, domainOwnerPayloadSummaryTargetKey, listDomainOwnerPayloadSummaryReceipts, preflightDomainOwnerPayloadSummaryReceiptInput, recordDomainOwnerPayloadSummaryReceipts, verifyDomainOwnerPayloadSummaryReceipt } from './domain-owner-payload-summary-ledger.ts';
export type { DomainOwnerPayloadSummaryReceipt, DomainOwnerPayloadSummaryReceiptInput } from './domain-owner-payload-summary-ledger.ts';
export { buildEvidenceEnvelopeProjection, canonicalOwnerId, compactEvidenceEnvelopeProjection, evidenceEnvelopeOpenCount, evidenceEnvelopeSummary } from './evidence-envelope.ts';
export { EVIDENCE_REQUIREMENT_MODEL_VERSION, evidenceRequirementFromTailItem } from './evidence-requirement.ts';
export type { EvidenceRequirement } from './evidence-requirement.ts';
export { listExternalEvidenceReceipts, parseExternalEvidenceApplyArgs, runExternalEvidenceApply } from './external-evidence-ledger.ts';
export type { ExternalEvidenceReceipt } from './external-evidence-ledger.ts';
export { classifyExternalEvidenceReceiptRefs } from './external-evidence-receipt-classification.ts';
export { assertOwnerEvidenceSustainedConsumptionReceiptInputReady, listOwnerEvidenceSustainedConsumptionReceipts, ownerEvidenceSustainedConsumptionTargetKey, preflightOwnerEvidenceSustainedConsumptionReceiptInput, recordOwnerEvidenceSustainedConsumptionReceipts, verifyOwnerEvidenceSustainedConsumptionReceipt } from './owner-evidence-sustained-consumption-ledger.ts';
export type { OwnerEvidenceSustainedConsumptionReceipt, OwnerEvidenceSustainedConsumptionReceiptInput } from './owner-evidence-sustained-consumption-ledger.ts';
export { buildMemoryArtifactLifecycleEvidenceProjection, memoryArtifactLifecycleEvidenceAuthorityBoundary } from './memory-artifact-lifecycle-evidence-ledger.ts';
export { OPL_OBSERVABILITY_SEMANTIC_CONVENTIONS, appOperatorProjectionCommand, appOperatorProjectionRef, appOperatorProjectionTestRef, buildObservabilitySemanticConventionExportSeed, buildObservabilitySemanticConventionReadback, renderObservabilitySemanticConventionOpenMetrics } from './observability-semantic-conventions.ts';
export type { ObservabilityMetricInstrument, ObservabilitySemanticConventionInput } from './observability-semantic-conventions.ts';
export { buildAppDrilldownProductionEvidenceTailLedger, buildConformanceProductionEvidenceTailLedger, buildProductionTailNextActionLedger } from './production-evidence-tail-ledger.ts';
export { buildProgressDeltaReceipt, progressDeltaReceiptDeltaClassFromStageClassification, validateProgressDeltaReceipt } from './progress-delta-receipt.ts';
export type { StageProgressDeltaClassification } from './progress-delta-receipt.ts';
export { buildProviderLongSoakEvidenceProjection, listProviderLongSoakEvidenceReceipts } from './provider-long-soak-evidence-ledger.ts';
export { listStandardAgentTemplateConsumptionReceipts } from './standard-agent-template-consumption-ledger.ts';
export { appReleaseUserPathEvidencePayloadPreflight, listAppReleaseUserPathEvidenceReceipts, recordAppReleaseUserPathEvidenceReceipts, verifyAppReleaseUserPathEvidenceReceipt } from './app-release-user-path-evidence-ledger.ts';
export type { AppReleaseUserPathEvidenceReceiptInput } from './app-release-user-path-evidence-ledger.ts';
export { appReleaseUserPathPayloadRefHints, appReleaseUserPathPayloadTemplate, appReleaseUserPathPayloadWorkorder } from './app-release-user-path-evidence-payload.ts';
export {
  buildStandardAgentActionRunLedgerEntry,
  buildStandardAgentActionRunLedgerEvent,
} from './standard-agent-action-run-ledger.ts';
export type {
  StandardAgentActionRunBytesRef,
  StandardAgentActionRunLedgerEntry,
  StandardAgentActionRunLedgerEvent,
  StandardAgentActionRunLedgerInput,
  StandardAgentActionRunStatus,
} from './standard-agent-action-run-ledger.ts';

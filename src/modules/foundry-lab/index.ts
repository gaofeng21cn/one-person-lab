export const OPL_FOUNDRY_LAB_SOURCE_MODULE = {
  moduleId: 'foundry-lab',
  brandName: 'OPL Foundry Lab',
  contractRef: 'contracts/opl-framework/source-module-map.json#modules.foundry-lab',
  physicalRoot: 'src/modules/foundry-lab',
} as const;

// Public cross-module surface generated from existing module consumers.
export { buildAgentLabDomainFeedbackSelfEvolutionReadModel } from './agent-lab-control-read-models.ts';
export { buildDeveloperModeAgentLabRepairRoute, buildDeveloperModeAgentLabRepairRouteReadModel } from './agent-lab-developer-mode.ts';
export { loadStandardAgentEvaluationManifest, loadStandardAgentEvaluationManifests, validateStandardAgentEvaluationManifest } from './standard-agent-evaluation-manifest.ts';
export { buildEvidenceGroundedDecisionAgentProfileFoundryLabEvalSurface } from './evidence-grounded-profile-eval.ts';
export { buildFeedbackOpsReadModel } from './agent-lab-feedbackops.ts';
export { buildAgentDefaultCallerReadinessForRepo } from './agent-platform-surface-ownership.ts';
export { DEFAULT_CALLER_OWNER_DECISION_ACCEPTED_RESULT_SHAPES, DEFAULT_CALLER_OWNER_DECISION_NEXT_REQUIRED_ACTION, DEFAULT_CALLER_RETIREMENT_MANDATORY_GATE_IDS, DEFAULT_CALLER_RETIREMENT_NON_AUTHORIZING_SURFACES, DEFAULT_CALLER_RETIREMENT_TARGET_CLASSES, DEFAULT_CALLER_SAME_WORK_UNIT_LIVE_EVIDENCE_SCOPE, DEFAULT_CALLER_STATIC_RETIREMENT_PREREQUISITE_GATE_IDS, defaultCallerOwnerDecisionCloseoutReadout } from './default-caller-retirement-guard.ts';
export { defaultCallerSurfaceGates } from './default-caller-surface-gates.ts';
export { buildStandardDomainAgentSkeletonInspection } from './family-domain-agent-skeleton.ts';
export { splitOperatorAttentionCounts } from './framework-readiness-attention-counts.ts';
export { buildFunctionalSourcePurityTailReadModel, compactFunctionalPrivatizationAuditEnvelope } from './functional-privatization-envelope.ts';
export { buildStandardDomainAgentTemplateConsumptionReadModel } from './standard-domain-agent-scaffold.ts';
export {
  DEVELOPER_PATCH_WORK_ORDER_SCHEMA_REF,
  materializeWorkOrderRequest,
  WORK_ORDER_MATERIALIZATION_RECEIPT_SCHEMA_REF,
  WORK_ORDER_MATERIALIZATION_REQUEST_SCHEMA_REF,
  WORK_ORDER_OWNER_CLOSEOUT_RECEIPT_SCHEMA_REF,
} from './work-order-request-materialization.ts';
export type { WorkOrderMaterializationInput } from './work-order-request-materialization.ts';

export const OPL_PACK_SOURCE_MODULE = {
  moduleId: 'pack',
  brandName: 'OPL Pack',
  contractRef: 'contracts/opl-framework/source-module-map.json#modules.pack',
  physicalRoot: 'src/modules/pack',
} as const;

// Public cross-module surface generated from existing module consumers.
export {
  buildEvidenceGroundedDecisionAgentProfileReadback,
  EVIDENCE_GROUNDED_DECISION_AGENT_PROFILE_CONTRACT_REF,
  readEvidenceGroundedDecisionAgentProfileContract,
} from './evidence-grounded-decision-agent-profile.ts';
export {
  buildDomainPackCompilerList,
  buildGeneratedAgentInterfaces,
  buildRepoGeneratedInterfaceBundle,
} from './domain-pack-compiler.ts';
export { buildGeneratedInterfaceBundle } from './domain-pack-compiler/generated-interface-read-model.ts';
export {
  buildFunctionalPrivatizationAudit,
  FUNCTIONAL_PRIVATIZATION_AUDIT_CONTRACT,
} from './functional-privatization-audit.ts';
export type {
  FunctionalEvidenceGateProjection,
  FunctionalExternalEvidenceRequest,
  FunctionalExternalEvidenceRequestPack,
  FunctionalOplReplacementExpectation,
  FunctionalPrivatizationAudit,
  FunctionalPrivatizationAuditItem,
  FunctionalPrivatizationAuditVisibility,
  FunctionalPrivatizationMigrationClass,
  FunctionalPrivatizationStandardizationLayer,
} from './functional-privatization-audit.ts';
export {
  buildEmptyFunctionalEvidenceGateProjection,
  buildFunctionalPrivatizationAuditEnvelopeFromAudit,
  buildFunctionalSourcePurityTailReadModel,
  compactFunctionalPrivatizationAuditEnvelope,
  FUNCTIONAL_PRIVATIZATION_AUDIT_ENVELOPE_CONTRACT,
} from './functional-privatization-envelope.ts';
export type {
  FunctionalPrivatizationAuditEnvelope,
  FunctionalPrivatizationAuditSourceFieldRole,
} from './functional-privatization-envelope.ts';
export {
  buildPrivatePlatformResidueDeletionGate,
  privatePlatformResidueGateFromRecord,
} from './private-platform-residue-deletion-gate.ts';

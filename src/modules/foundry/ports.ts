import type {
  AgentBlueprint,
  DesignRequest,
  EvidenceBundle,
  EvolutionProposal,
  FoundryRiskTier,
} from './protocol.ts';
import type { FoundryRunEvent, FoundryRunSnapshot } from './state-machine.ts';
import type { FoundryEvaluationOperationIdentity } from './operation-result.ts';

export interface DesignerPort {
  readonly producer_id: string;
  design(request: DesignRequest, activity: FoundryActivityIdentity): Promise<AgentBlueprint>;
  diagnose(input: {
    request: DesignRequest;
    blueprint: AgentBlueprint;
    evidence: EvidenceBundle;
    activity: FoundryActivityIdentity;
  }): Promise<EvolutionProposal>;
}

export type FoundryActivityIdentity = {
  run_id: string;
  iteration: number;
  phase: 'design' | 'diagnose';
  input_digest: string;
};

export interface MaterializedCandidate {
  surface_kind: 'opl_foundry_materialized_candidate';
  target_agent_id: string;
  target_domain_id: string;
  blueprint_digest: string;
  candidate_digest: string;
  candidate_ref: string;
  manifest_digest: string;
}

export interface CandidateCompiler {
  materialize(input: {
    run_id: string;
    blueprint: AgentBlueprint;
    blueprint_digest: string;
  }): Promise<MaterializedCandidate>;
}

export interface EvaluationExecutor {
  readonly evaluator_id: string;
  evaluate(input: {
    operation_identity?: FoundryEvaluationOperationIdentity;
    run_id: string;
    request: DesignRequest;
    blueprint: AgentBlueprint;
    blueprint_digest: string;
    candidate: MaterializedCandidate;
    baseline_version: AgentVersion | null;
  }): Promise<EvidenceBundle>;
  canary(input: {
    operation_identity?: FoundryEvaluationOperationIdentity;
    run_id: string;
    request: DesignRequest;
    blueprint: AgentBlueprint;
    blueprint_digest: string;
    candidate: MaterializedCandidate;
    version: AgentVersion;
    baseline_version: AgentVersion | null;
  }): Promise<EvidenceBundle>;
}

export interface FoundryObjectStore {
  put<T>(value: T): Promise<{ digest: string; ref: string }>;
  get<T>(digest: string): Promise<T | null>;
}

export interface FoundryEventStore {
  create(input: {
    target_key: string;
    event: FoundryRunEvent;
  }): Promise<void>;
  append(input: {
    target_key: string;
    expected_revision: number;
    event: FoundryRunEvent;
  }): Promise<FoundryRunEvent>;
  read(runId: string): Promise<FoundryRunEvent[]>;
  list(): Promise<FoundryRunSnapshot[]>;
}

export type OwnerGateAction =
  | 'approve_canary'
  | 'reject_canary'
  | 'approve_active'
  | 'reject_active'
  | 'cancel'
  | 'rollback';

export type OwnerGateDecision = 'approve' | 'reject' | 'cancel' | 'rollback';

export interface OwnerGateVerificationContext {
  surface_kind: 'opl_foundry_owner_gate_verification_context';
  version: 'opl-foundry-owner-gate-verification-context.v1';
  authority_receipt_ref: string;
  action: OwnerGateAction;
  decision: OwnerGateDecision;
  target_agent_id: string;
  target_domain_id: string;
  run_id: string | null;
  version_digest: string | null;
  expected_revision: number;
  allowed_authority_refs: string[];
}

export interface OwnerAuthorityReceiptStatement {
  surface_kind: 'opl_foundry_owner_authority_receipt';
  version: 'opl-foundry-owner-authority-receipt.v1';
  receipt_id: string;
  authority_ref: string;
  action: OwnerGateAction;
  decision: OwnerGateDecision;
  target_agent_id: string;
  target_domain_id: string;
  run_id: string | null;
  version_digest: string | null;
  expected_revision: number;
  issued_at: string;
}

export interface OwnerAuthorityReceipt extends OwnerAuthorityReceiptStatement {
  receipt_digest: string;
  receipt_ref: string;
}

export interface OwnerGateVerification {
  surface_kind: 'opl_foundry_owner_gate_verification';
  version: 'opl-foundry-owner-gate-verification.v1';
  verifier_id: string;
  verification_ref: string;
  verified_at: string;
  covered_authority_ref: string;
  receipt: OwnerAuthorityReceipt;
}

export interface OwnerGate {
  verify(input: OwnerGateVerificationContext): Promise<OwnerGateVerification>;
}

export interface QualificationRecord {
  surface_kind: 'opl_foundry_qualification_record';
  qualification_id: string;
  qualification_digest: string;
  target_agent_id: string;
  target_domain_id: string;
  blueprint_digest: string;
  candidate_digest: string;
  evidence_digest: string;
  risk_tier: FoundryRiskTier;
  qualified_at: string;
}

export interface AgentVersion {
  surface_kind: 'opl_foundry_agent_version';
  version_id: string;
  version_digest: string;
  target_agent_id: string;
  target_domain_id: string;
  blueprint_digest: string;
  candidate_digest: string;
  candidate_ref: string;
  qualification_digest: string;
  created_at: string;
}

export interface ActivationPointer {
  surface_kind: 'opl_foundry_activation_pointer';
  target_agent_id: string;
  target_domain_id: string;
  active_version_digest: string | null;
  revision: number;
  updated_at: string | null;
}

export interface ActivationTransaction {
  surface_kind: 'opl_foundry_activation_transaction';
  transaction_id: string;
  transaction_kind: 'activate' | 'rollback';
  target_agent_id: string;
  target_domain_id: string;
  from_version_digest: string | null;
  to_version_digest: string;
  previous_revision: number;
  next_revision: number;
  authority_receipt_ref: string | null;
  occurred_at: string;
}

export interface VersionRegistry {
  register(input: {
    target_agent_id: string;
    target_domain_id: string;
    blueprint_digest: string;
    candidate: MaterializedCandidate;
    evidence_digest: string;
    risk_tier: FoundryRiskTier;
    qualified_at: string;
  }): Promise<{ version: AgentVersion; qualification: QualificationRecord }>;
  list(targetAgentId: string, targetDomainId: string): Promise<AgentVersion[]>;
  resolveVersion(ref: string | null, targetAgentId: string, targetDomainId: string): Promise<AgentVersion | null>;
  activation(targetAgentId: string, targetDomainId: string): Promise<ActivationPointer>;
  compareAndSwapActivation(input: {
    target_agent_id: string;
    target_domain_id: string;
    expected_revision: number;
    version_digest: string;
    occurred_at: string;
    authority_receipt_ref: string | null;
  }): Promise<ActivationTransaction>;
  rollback(input: {
    target_agent_id: string;
    target_domain_id: string;
    expected_revision: number;
    version_digest: string;
    occurred_at: string;
    authority_receipt_ref: string;
  }): Promise<ActivationTransaction>;
}

export interface FoundryClock {
  now(): string;
}

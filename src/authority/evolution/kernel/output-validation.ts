import type {
  AgentBlueprint,
  DesignRequest,
  EvidenceBundle,
} from '../protocol.ts';
import {
  assertSameTarget,
  foundryContentDigest,
} from '../protocol.ts';
import type { AgentVersion, MaterializedCandidate, VersionRegistry } from '../ports.ts';
import {
  assertEvaluationEvidenceFacts,
  foundryFrozenEvaluationPlanDigest,
} from '../evaluation-runtime.ts';
import type { FoundryRunSnapshot } from '../state-machine.ts';
import { fail } from './validation.ts';

export function assertMaterializedCandidate(
  input: { request: DesignRequest; run: FoundryRunSnapshot },
  candidate: MaterializedCandidate,
) {
  if (
    candidate.surface_kind !== 'opl_foundry_materialized_candidate'
    || candidate.target_agent_id !== input.request.target_agent_id
    || candidate.target_domain_id !== input.request.target_domain_id
    || candidate.blueprint_digest !== input.run.blueprint_digest
    || (input.run.candidate_digest !== null
      && candidate.candidate_digest !== input.run.candidate_digest)
    || !/^sha256:[a-f0-9]{64}$/.test(candidate.candidate_digest)
    || !/^sha256:[a-f0-9]{64}$/.test(candidate.manifest_digest)
    || !candidate.candidate_ref.trim()
  ) {
    fail('Materialized candidate identity does not match the FoundryRun.');
  }
}

export function assertEvaluationEvidence(input: {
  request: DesignRequest;
  run: FoundryRunSnapshot;
  blueprint: AgentBlueprint;
  evidence: EvidenceBundle;
  candidate: MaterializedCandidate;
  baseline: AgentVersion | null;
  designerProducerId: string;
  evaluatorId: string;
}) {
  assertSameTarget(input.request, input.evidence, 'EvidenceBundle');
  const expectedFrozenPlanDigest = foundryFrozenEvaluationPlanDigest(input.blueprint.eval_spec);
  const reviewerRef = input.evidence.independent_review.evaluator_ref.trim();
  const evaluationExecutionRef = input.evidence.independent_review.evaluation_execution_ref.trim();
  const reviewExecutionRef = input.evidence.independent_review.review_execution_ref.trim();
  if (
    input.evidence.blueprint_digest !== input.run.blueprint_digest
    || input.evidence.candidate_digest !== input.candidate.candidate_digest
    || input.evidence.baseline_version_digest !== (input.baseline?.version_digest ?? null)
    || input.evidence.frozen_test_plan_digest !== expectedFrozenPlanDigest
    || input.evidence.provenance.foundry_run_id !== input.run.run_id
    || input.evidence.provenance.generation !== input.run.generation
    || input.evidence.provenance.producer_id !== input.evaluatorId
    || reviewerRef === input.designerProducerId.trim()
    || reviewerRef === input.evaluatorId.trim()
    || evaluationExecutionRef === reviewExecutionRef
  ) {
    fail('EvidenceBundle provenance or content binding is stale.');
  }
  if (
    input.run.frozen_test_plan_digest
    && input.evidence.frozen_test_plan_digest !== input.run.frozen_test_plan_digest
  ) {
    fail('EvidenceBundle changed the frozen test plan during a FoundryRun.');
  }
  assertEvaluationEvidenceFacts({
    request: input.request,
    spec: input.blueprint.eval_spec,
    evidence: input.evidence,
    baseline_present: input.baseline !== null,
  });
}

export function assertRegisteredCandidate(input: {
  request: DesignRequest;
  run: FoundryRunSnapshot;
  candidate: MaterializedCandidate;
  registered: Awaited<ReturnType<VersionRegistry['register']>>;
}) {
  const { version, qualification } = input.registered;
  const { version_digest: versionDigest, ...versionBase } = version;
  const { qualification_digest: qualificationDigest, ...qualificationBase } = qualification;
  if (
    version.surface_kind !== 'opl_foundry_agent_version'
    || qualification.surface_kind !== 'opl_foundry_qualification_record'
    || version.target_agent_id !== input.request.target_agent_id
    || version.target_domain_id !== input.request.target_domain_id
    || version.blueprint_digest !== input.run.blueprint_digest
    || version.candidate_digest !== input.candidate.candidate_digest
    || version.candidate_ref !== input.candidate.candidate_ref
    || qualification.target_agent_id !== input.request.target_agent_id
    || qualification.target_domain_id !== input.request.target_domain_id
    || qualification.blueprint_digest !== input.run.blueprint_digest
    || qualification.candidate_digest !== input.candidate.candidate_digest
    || version.qualification_digest !== qualification.qualification_digest
    || foundryContentDigest(versionBase) !== versionDigest
    || foundryContentDigest(qualificationBase) !== qualificationDigest
  ) {
    fail('Version registry changed the qualified materialized candidate binding.');
  }
}

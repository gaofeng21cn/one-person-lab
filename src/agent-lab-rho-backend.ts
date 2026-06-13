import { AGENT_LAB_AUTHORITY_BOUNDARY } from './agent-lab-authority.ts';
import { stableId } from './family-runtime-ids.ts';

const RHO_AUTHORITY_BOUNDARY = {
  ...AGENT_LAB_AUTHORITY_BOUNDARY,
  backend: 'rho',
  apply_mode: 'no_apply',
  can_direct_apply: false,
  can_call_external_rho_cli: false,
  can_mutate_artifact_body: false,
  can_promote_default_agent: false,
};

function projectSlug(projectDir: string) {
  return projectDir
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'project';
}

export function buildAgentLabRhoBackendPlan(input: { projectDir: string }) {
  const projectRef = `project-ref:${input.projectDir}`;
  const slug = projectSlug(input.projectDir);
  const planId = stableId('oalrho', [projectRef, 'rho', 'no_apply']);
  const candidateRef = `rho-candidate-ref:${slug}/${planId}`;
  const trajectoryDigestRef = `rho-trajectory-digest-ref:${slug}/${planId}`;
  const diagnosisRef = `rho-diagnosis-ref:${slug}/${planId}`;
  const candidateHarnessRef = `rho-candidate-harness-ref:${slug}/${planId}`;
  const selfPreferenceScoreRef = `rho-self-preference-score-ref:${slug}/${planId}`;
  const winnerRef = `rho-winner-ref:${slug}/${planId}`;
  const candidateDiffRef = `rho-candidate-diff-ref:${slug}/${planId}`;
  const workOrderDraftRef = `rho-work-order-draft-ref:${slug}/${planId}`;
  const promotionEvidenceRef = `rho-promotion-evidence-ref:${slug}/${planId}`;

  return {
    surface_kind: 'opl_agent_lab_rho_backend_plan',
    version: 'opl-agent-lab.v1.rho-backend',
    plan_id: planId,
    backend: 'rho',
    backend_role: 'no_apply_sidecar_candidate_generator',
    apply_mode: 'no_apply',
    refs_only: true,
    project_ref: projectRef,
    project_dir: input.projectDir,
    trajectory_digest_refs: [trajectoryDigestRef],
    diagnosis_refs: [diagnosisRef],
    candidate_harness_refs: [candidateHarnessRef],
    self_preference_score_refs: [selfPreferenceScoreRef],
    candidate_refs: [candidateRef],
    winner_ref: winnerRef,
    candidate_diff_refs: [candidateDiffRef],
    work_order_draft_refs: [workOrderDraftRef],
    promotion_evidence_refs: [promotionEvidenceRef],
    no_apply_boundary_refs: [
      `no-apply-boundary-ref:agent-lab/rho/${planId}`,
      `no-forbidden-write-ref:agent-lab/rho/${planId}`,
    ],
    typed_blocker_refs: [],
    can_write_domain_truth: false,
    can_write_memory_body: false,
    can_mutate_artifact_body: false,
    can_write_owner_receipt: false,
    can_direct_apply: false,
    can_promote_default_agent: false,
    can_promote_default_agent_without_gate: false,
    authority_boundary: RHO_AUTHORITY_BOUNDARY,
  };
}

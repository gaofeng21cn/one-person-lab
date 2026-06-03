import {
  optionalString,
  record,
  recordList,
  refsArray,
  refsOnlyAuthorityBoundary,
  stringList,
  type JsonRecord,
} from './shared.ts';

const PATCH_LOOP_REF_FIELDS = [
  'blocked_suite_result_ref',
  'developer_patch_work_order_ref',
  'patch_traceability_matrix_ref',
  'failure_evidence_refs',
  'root_cause_refs',
  'targeted_fix_refs',
  'predicted_impact_refs',
  'next_run_falsification_refs',
  'target_repo_verification_refs',
  'target_runtime_read_model_consumption_ref',
  'workspace_environment_proof_ref',
  'no_forbidden_write_proof_ref',
  'target_owner_receipt_or_typed_blocker_ref',
  'patch_absorption_ref',
  'worktree_cleanup_ref',
  'agent_lab_re_evaluation_ref',
] as const;

const SELF_EVOLUTION_OPERATOR_QUESTIONS = [
  'failure_evidence',
  'root_cause',
  'targeted_fix',
  'predicted_impact',
  'next_run_falsification',
  'owner_receipt_or_typed_blocker',
] as const;

function firstString(values: unknown) {
  return stringList(values)[0] ?? null;
}

function refListOrFallback(value: unknown, fallback: string) {
  const refs = stringList(value);
  return refs.length > 0 ? refs : [fallback];
}

export function patchLoopCloseoutTargetRefs(scaleoutEvidence: JsonRecord) {
  const closeout = record(scaleoutEvidence.multi_target_scaleout_closeout);
  return recordList(closeout.target_agents).map((target) => {
    const domainId = optionalString(target.domain_id) ?? 'target-agent';
    const ownerReceiptOrBlocker = firstString(target.target_agent_owner_receipt_refs)
      ?? firstString(target.typed_blocker_refs)
      ?? `typed-blocker:opl-meta-agent/${domainId}/owner-receipt-or-blocker-missing`;
    const cleanupRef = firstString(target.cleanup_closeout_refs)
      ?? `worktree-cleanup:${domainId}/not-recorded`;
    const agentLabResultRef = firstString(target.agent_lab_result_refs)
      ?? `agent-lab-run-result:opl-meta-agent/${domainId}/not-recorded`;
    const noForbiddenWriteRef = firstString(target.no_forbidden_write_proof_refs)
      ?? `no-forbidden-write:${domainId}/not-recorded`;

    return {
      domain_id: domainId,
      status: ownerReceiptOrBlocker.startsWith('typed-blocker:')
        ? 'owner_typed_blocker_recorded'
        : 'owner_receipt_recorded',
      refs: {
        blocked_suite_result_ref: agentLabResultRef,
        developer_patch_work_order_ref: optionalString(target.developer_patch_work_order_ref)
          ?? `developer-patch-work-order:opl-meta-agent/${domainId}/agent-evidence`,
        patch_traceability_matrix_ref: optionalString(target.patch_traceability_matrix_ref)
          ?? `patch-traceability:opl-meta-agent/${domainId}/agent-evidence`,
        failure_evidence_refs: refListOrFallback(
          target.failure_evidence_refs,
          `typed-blocker:opl-meta-agent/${domainId}/failure-evidence-ref-missing`,
        ),
        root_cause_refs: refListOrFallback(
          target.root_cause_refs,
          `typed-blocker:opl-meta-agent/${domainId}/root-cause-ref-missing`,
        ),
        targeted_fix_refs: refListOrFallback(
          target.targeted_fix_refs,
          `typed-blocker:opl-meta-agent/${domainId}/targeted-fix-ref-missing`,
        ),
        predicted_impact_refs: refListOrFallback(
          target.predicted_impact_refs,
          `typed-blocker:opl-meta-agent/${domainId}/predicted-impact-ref-missing`,
        ),
        next_run_falsification_refs: refListOrFallback(
          target.next_run_falsification_refs,
          `typed-blocker:opl-meta-agent/${domainId}/next-run-falsification-ref-missing`,
        ),
        target_repo_verification_refs: stringList(target.target_repo_verification_refs).length > 0
          ? stringList(target.target_repo_verification_refs)
          : [`target-verification:${domainId}/agent-evidence`],
        target_runtime_read_model_consumption_ref:
          optionalString(target.target_runtime_read_model_consumption_ref)
            ?? `target-runtime-read-model:${domainId}/agent-evidence`,
        workspace_environment_proof_ref: optionalString(target.workspace_environment_proof_ref)
          ?? `workspace-environment-proof:${domainId}/agent-evidence`,
        no_forbidden_write_proof_ref: noForbiddenWriteRef,
        target_owner_receipt_or_typed_blocker_ref: ownerReceiptOrBlocker,
        patch_absorption_ref: optionalString(target.patch_absorption_ref)
          ?? `patch-absorption:${domainId}/agent-evidence`,
        worktree_cleanup_ref: cleanupRef,
        agent_lab_re_evaluation_ref: optionalString(target.agent_lab_re_evaluation_ref)
          ?? agentLabResultRef,
      },
    };
  });
}

export function flattenPatchLoopRefs(targets: ReturnType<typeof patchLoopCloseoutTargetRefs>) {
  const refs = targets.flatMap((target) =>
    Object.entries(target.refs).flatMap(([role, value]) => {
      const values = Array.isArray(value) ? value : [value];
      return values.map((ref) => ({
        ref,
        role,
        domain_id: target.domain_id,
        status: target.status,
      }));
    })
  );
  const seen = new Set<string>();
  return refs.filter((entry) => {
    const key = `${entry.domain_id}:${entry.role}:${entry.ref}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function targetSixQuestionReady(target: ReturnType<typeof patchLoopCloseoutTargetRefs>[number]) {
  return refsArray(target.refs.failure_evidence_refs).length > 0
    && refsArray(target.refs.root_cause_refs).length > 0
    && refsArray(target.refs.targeted_fix_refs).length > 0
    && refsArray(target.refs.predicted_impact_refs).length > 0
    && refsArray(target.refs.next_run_falsification_refs).length > 0
    && Boolean(optionalString(target.refs.target_owner_receipt_or_typed_blocker_ref));
}

export function buildSelfEvolutionCockpit(targets: ReturnType<typeof patchLoopCloseoutTargetRefs>) {
  const rows = targets.map((target) => ({
    domain_id: target.domain_id,
    status: target.status,
    six_question_ready: targetSixQuestionReady(target),
    failure_evidence_refs: refsArray(target.refs.failure_evidence_refs),
    root_cause_refs: refsArray(target.refs.root_cause_refs),
    targeted_fix_refs: refsArray(target.refs.targeted_fix_refs),
    predicted_impact_refs: refsArray(target.refs.predicted_impact_refs),
    next_run_falsification_refs: refsArray(target.refs.next_run_falsification_refs),
    owner_receipt_or_typed_blocker_ref:
      optionalString(target.refs.target_owner_receipt_or_typed_blocker_ref),
    blocked_suite_result_ref: optionalString(target.refs.blocked_suite_result_ref),
    developer_patch_work_order_ref: optionalString(target.refs.developer_patch_work_order_ref),
    patch_traceability_matrix_ref: optionalString(target.refs.patch_traceability_matrix_ref),
    target_repo_verification_refs: refsArray(target.refs.target_repo_verification_refs),
    target_runtime_read_model_consumption_ref:
      optionalString(target.refs.target_runtime_read_model_consumption_ref),
    workspace_environment_proof_ref: optionalString(target.refs.workspace_environment_proof_ref),
    no_forbidden_write_proof_ref: optionalString(target.refs.no_forbidden_write_proof_ref),
    patch_absorption_ref: optionalString(target.refs.patch_absorption_ref),
    worktree_cleanup_ref: optionalString(target.refs.worktree_cleanup_ref),
    agent_lab_re_evaluation_ref: optionalString(target.refs.agent_lab_re_evaluation_ref),
    authority_boundary: refsOnlyAuthorityBoundary(),
  }));

  return {
    surface_kind: 'opl_meta_agent_self_evolution_cockpit_read_model',
    status: rows.length > 0 ? 'refs_only_operator_cockpit_projected' : 'not_observed',
    operator_questions: [...SELF_EVOLUTION_OPERATOR_QUESTIONS],
    targets: rows,
    summary: {
      target_count: rows.length,
      six_question_ready_count: rows.filter((row) => row.six_question_ready).length,
      owner_receipt_or_typed_blocker_count:
        rows.filter((row) => Boolean(row.owner_receipt_or_typed_blocker_ref)).length,
      domain_ready_claim_count: 0,
      quality_verdict_claim_count: 0,
      default_promotion_claim_count: 0,
    },
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

export function patchLoopRefFields() {
  return [...PATCH_LOOP_REF_FIELDS];
}

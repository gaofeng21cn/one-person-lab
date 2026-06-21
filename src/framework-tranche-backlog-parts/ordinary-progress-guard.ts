import path from 'node:path';

import type { FrameworkContracts } from '../types.ts';
import { schemaIdentityFromContract } from './contract-readers.ts';
import { ORDINARY_PROGRESS_GUARD_AUTHORITY } from './shared.ts';

export function buildOrdinaryProgressGuardReadback(contracts: FrameworkContracts) {
  const contractsRoot = path.dirname(contracts.contractsDir);
  const ownerRouteSchema = schemaIdentityFromContract(
    path.join(contractsRoot, 'family-orchestration', 'family-owner-route.schema.json'),
    'family-owner-route.schema.json',
    ['surface_kind', 'version'],
  );
  const typedBlockerSchema = schemaIdentityFromContract(
    path.join(contracts.contractsDir, 'stage-typed-blocker.schema.json'),
    'stage-typed-blocker.schema.json',
    ['surface_kind', 'schema_version'],
  );
  const ownerAnswerSchema = schemaIdentityFromContract(
    path.join(contracts.contractsDir, 'owner-answer.schema.json'),
    'owner-answer.schema.json',
    ['surface_kind', 'schema_version'],
  );

  return {
    surface_kind: 'opl_ordinary_progress_owner_route_guard_readback',
    readback_role:
      'current_owner_delta_single_ordinary_route_guard_not_live_evidence_not_domain_ready',
    owner: 'one-person-lab',
    source_contract_refs: [
      'contracts/family-orchestration/family-owner-route.schema.json',
      'contracts/opl-framework/owner-answer.schema.json',
      'contracts/opl-framework/stage-typed-blocker.schema.json',
      'contracts/opl-framework/progress-delta-receipt.schema.json',
      'contracts/opl-framework/target-operating-architecture-contract.json',
    ],
    source_cli_readback_refs: [
      'opl framework readiness --family-defaults --json .framework_readiness.current_owner_delta',
      'opl framework readiness --family-defaults --json .framework_readiness.owner_delta_handoff_summary',
      'opl framework tranche-backlog --family-defaults --json .framework_tranche_backlog.ordinary_progress_guard',
    ],
    ordinary_route_policy: {
      default_planning_root: 'current_owner_delta',
      accepted_terminal_inputs: [
        'domain_owner_receipt',
        'domain_typed_blocker',
        'human_gate_decision',
        'quality_export_review_receipt',
        'app_release_verdict',
        'route_back_evidence',
        'progress_delta_receipt',
      ],
      next_delta_derivation: 'owner_answer_or_typed_blocker_or_human_gate_to_next_current_owner_delta',
      raw_worklist_policy: 'audit_sidecar_or_full_detail_only_not_default_next_action',
      provider_trace_policy: 'runway_repair_or_diagnostic_only_not_domain_owner_answer',
      private_residue_policy: 'cleanup_lane_only_requires_no_active_caller_and_owner_gate',
    },
    owner_answer_admission_gate: {
      surface_kind: 'opl_owner_answer_admission_gate_readback',
      gate_role:
        'ordinary_terminal_input_shape_guard_for_current_owner_delta_derivation_not_owner_authority',
      source_schema: {
        surface_kind: ownerAnswerSchema.consts.surface_kind,
        schema_version: ownerAnswerSchema.consts.schema_version,
        required_fields: ownerAnswerSchema.required,
        owner_answer_required_fields_present: [
          'answer_id',
          'domain',
          'answer_kind',
          'answer_status',
          'answer_ref',
          'target_delta_ref',
          'audit_refs',
          'authority_boundary',
        ].every((field) => ownerAnswerSchema.required.includes(field)),
      },
      accepted_answer_kinds: [
        'owner_receipt',
        'typed_blocker',
        'human_decision',
        'route_back',
      ],
      accepted_answer_statuses: [
        'accepted',
        'blocked',
        'rejected',
        'route_back',
        'needs_human',
      ],
      derives_next_current_owner_delta_from: [
        'owner_answer_ref',
        'target_delta_ref',
        'effective_delta_ref',
        'stage_ref',
        'attempt_ref',
        'audit_refs',
      ],
      default_next_action_source_priority: [
        'fresh_current_owner_delta',
        'owner_answer_admission_gate',
        'typed_blocker_or_human_gate_projection',
        'route_back_evidence',
      ],
      rejected_default_roots: [
        'raw_worklist',
        'provider_trace',
        'refs_only_evidence_ledger',
        'cleanup_work_order',
        'release_cohort_diagnostic',
        'brand_l5_evidence_tail',
        'stale_projection_cache',
      ],
      required_followthrough:
        'accepted_owner_answer_or_typed_blocker_or_human_decision_ref_then_rederive_current_owner_delta',
      authority_boundary: {
        opl_can_consume_owner_answer: true,
        opl_can_fold_answer_into_delta: true,
        opl_can_sign_domain_owner_answer: false,
        opl_can_create_typed_blocker: false,
        opl_can_make_human_decision: false,
        opl_can_infer_domain_truth_from_answer: false,
        opl_can_authorize_domain_ready: false,
        opl_can_authorize_quality_verdict: false,
        opl_can_mutate_artifact_body: false,
        owner_answer_readback_can_claim_live_evidence_complete: false,
      },
      false_ready_guard: {
        owner_answer_shape_valid_can_claim_domain_ready: false,
        owner_answer_ref_observed_can_claim_stage_success: false,
        route_back_ref_can_claim_progress_complete: false,
        human_decision_required_can_claim_human_decision_complete: false,
        progress_delta_receipt_can_replace_domain_owner_answer: false,
      },
    },
    owner_route_schema: {
      surface_kind: ownerRouteSchema.consts.surface_kind,
      version: ownerRouteSchema.consts.version,
      required_fields: ownerRouteSchema.required,
      owner_route_required_fields_present: [
        'target_domain_id',
        'route_id',
        'route_epoch',
        'source_fingerprint',
        'next_owner',
        'allowed_actions',
        'idempotency_key',
        'status',
        'handoff_refs',
        'projection_refs',
      ].every((field) => ownerRouteSchema.required.includes(field)),
      authority_role:
        'route_projection_for_current_truth_handoff_allowed_actions_idempotency_and_refs_only_projection',
    },
    typed_blocker_schema: {
      surface_kind: typedBlockerSchema.consts.surface_kind,
      schema_version: typedBlockerSchema.consts.schema_version,
      required_fields: typedBlockerSchema.required,
      typed_blocker_required_fields_present: [
        'blocker_id',
        'domain_id',
        'stage_id',
        'stage_run_id',
        'generation',
        'blocked_surface',
        'missing_or_failed_input',
        'required_owner',
        'next_safe_action',
        'stability_or_retry_policy',
        'authority_boundary',
      ].every((field) => typedBlockerSchema.required.includes(field)),
      authority_role:
        'domain_or_human_owner_signed_blocker_consumed_by_opl_not_created_by_opl',
    },
    human_gate_boundary: {
      surface_kind: 'opl_human_gate_boundary_projection',
      human_gate_is_accepted_terminal_input: true,
      opl_can_request_human_gate: true,
      opl_can_make_human_decision: false,
      human_gate_counts_as_ready_claim: false,
      required_followthrough: 'owner_or_human_decision_ref_then_next_current_owner_delta',
    },
    no_second_truth_guard: {
      active_gap_owner_ref: 'docs/active/current-state-vs-ideal-gap.md',
      tranche_backlog_is_execution_index_only: true,
      readiness_readback_is_projection_only: true,
      worklist_and_evidence_vault_are_audit_sidecars: true,
      app_operator_projection_can_not_replace_current_owner_delta: true,
    },
    authority_boundary: { ...ORDINARY_PROGRESS_GUARD_AUTHORITY },
    false_ready_guard: {
      current_owner_delta_present_can_claim_goal_complete: false,
      owner_route_current_can_claim_domain_ready: false,
      typed_blocker_ref_can_claim_stage_success: false,
      human_gate_ref_can_claim_human_decision_complete: false,
      progress_delta_receipt_can_claim_artifact_ready: false,
      provider_completion_can_claim_owner_answer: false,
      readback_guard_can_claim_live_evidence_complete: false,
    },
  };
}

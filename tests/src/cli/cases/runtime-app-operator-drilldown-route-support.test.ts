import {
  assert,
  test,
} from '../helpers.ts';
import {
  buildMasDomainRouteSupportProjection,
} from '../../../../src/family-runtime-mas-domain-route.ts';
import {
  buildAppOperatorDrilldown,
} from '../../../../src/runtime-tray-app-operator-drilldown.ts';

test('runtime App drilldown exposes MAS route support as refs-only runtime-manager projection', () => {
  const supportProjection = buildMasDomainRouteSupportProjection();
  assert.deepEqual(supportProjection.supported_task_kinds, [
    'domain_route/reconcile-apply',
    'publication_aftercare/analysis-queue-progress',
    'publication_aftercare/reviewer-refresh',
  ]);
  assert.deepEqual(supportProjection.action_refs, [
    'domain_route_reconcile_apply',
    'ai_reviewer_recheck_execute_dispatch',
  ]);

  const drilldown = buildAppOperatorDrilldown({
    stageAttemptWorkbench: { attempts: [] },
    providerContinuousProof: {},
    domainProjectionIngestion: {},
    domainManifestProjects: [],
    detailLevel: 'full',
  });

  assert.equal(
    drilldown.runtime_manager_route_support.surface_kind,
    'opl_app_drilldown_runtime_manager_route_support',
  );
  assert.deepEqual(
    drilldown.runtime_manager_route_support.mas_domain_route_projection.supported_task_kinds,
    supportProjection.supported_task_kinds,
  );
  assert.deepEqual(
    drilldown.runtime_manager_route_support.mas_domain_route_projection.action_refs,
    supportProjection.action_refs,
  );
  assert.equal(drilldown.summary.runtime_manager_mas_route_support_task_kind_count, 3);
  assert.equal(drilldown.summary.runtime_manager_mas_aftercare_route_support_count, 2);
  assert.equal(drilldown.summary.runtime_manager_mas_route_support_action_ref_count, 2);
  assert.equal(drilldown.runtime_manager_route_support.authority_boundary.can_write_domain_truth, false);
  assert.equal(drilldown.runtime_manager_route_support.authority_boundary.can_claim_domain_ready, false);
  assert.equal(drilldown.runtime_manager_route_support.authority_boundary.can_close_owner_chain, false);
  assert.equal(drilldown.runtime_manager_route_support.authority_boundary.can_record_owner_receipt, false);
  assert.equal(drilldown.runtime_manager_route_support.authority_boundary.can_authorize_publication_aftercare, false);

  const summaryDrilldown = buildAppOperatorDrilldown({
    stageAttemptWorkbench: { attempts: [] },
    providerContinuousProof: {},
    domainProjectionIngestion: {},
    domainManifestProjects: [],
  }) as unknown as {
    attention_first_payload: {
      evidence_after_contract: Record<string, unknown>;
      evidence_next_steps: Record<string, unknown>;
    };
  };
  const evidenceAfterContract = summaryDrilldown.attention_first_payload.evidence_after_contract;
  const evidenceNextSteps = summaryDrilldown.attention_first_payload.evidence_next_steps;
  assert.equal(
    evidenceAfterContract.surface_kind,
    'opl_app_drilldown_evidence_after_contract_attention',
  );
  assert.equal(evidenceAfterContract.status, 'clear');
  assert.equal(
    evidenceAfterContract.route_support_status,
    'catalog_available_refs_only',
  );
  assert.equal(
    evidenceAfterContract.runtime_manager_aftercare_route_support_count,
    2,
  );
  assert.equal(
    evidenceAfterContract.next_evidence_owner,
    null,
  );
  assert.equal(
    (evidenceAfterContract.authority_boundary as Record<string, unknown>).route_support_closes_domain_ready,
    false,
  );
  assert.equal(evidenceNextSteps.surface_kind, 'opl_app_drilldown_evidence_next_steps');
  assert.equal(evidenceNextSteps.total_count, 0);
  assert.equal(evidenceNextSteps.next_owner, null);
  assert.equal(evidenceNextSteps.can_execute_domain_action, false);
  assert.equal(evidenceNextSteps.can_create_owner_receipt, false);
});

test('runtime App drilldown exposes route-as-transition refs in one operator projection', () => {
  const drilldown = buildAppOperatorDrilldown({
    stageAttemptWorkbench: {
      attempts: [
        {
          stage_attempt_id: 'sat_mas_route_transition',
          task_id: 'task_mas_route_transition',
          domain_id: 'medautoscience',
          stage_id: 'publication_aftercare',
          status: 'dead_lettered',
          blocked_reason: 'retry_budget_exhausted',
          human_gate_refs: ['human-gate:mas/DM002/physician-decision'],
          dead_letter: {
            reason: 'retry_budget_exhausted',
            task: { status: 'dead_letter' },
          },
          route_impact: {
            decision: 'reviewer_refresh_owner_route_ref',
            transition_spec_ref: 'contracts/medautoscience.transition.json',
            transition_materialization_ref: 'contract-materialization:mas/transition',
            matrix_result_ref: 'matrix:mas/transition',
            owner_route_refs: ['owner-route:mas/DM002/ai-reviewer-refresh'],
            owner_receipt_refs: ['owner-receipt:mas/DM002/reviewer-feedback-intake'],
            typed_blocker_refs: ['typed-blocker:mas/DM002/reviewer-refresh-required'],
            human_gate_refs: ['human-gate:mas/DM002/release-gate'],
            dead_letter_refs: ['dead-letter:mas/DM002/retry-budget-exhausted'],
          },
        },
      ],
    },
    providerContinuousProof: {},
    domainProjectionIngestion: {
      items: [
        {
          domain_id: 'medautoscience',
          source_surface: 'mas_domain_route_projection',
          owner_route_refs: ['owner-route:mas/DM002/ai-reviewer-refresh'],
          owner_receipt_refs: ['owner-receipt:mas/DM002/reviewer-feedback-intake'],
          typed_blocker_refs: ['typed-blocker:mas/DM002/reviewer-refresh-required'],
        },
      ],
    },
    domainManifestProjects: [],
    detailLevel: 'full',
  });

  assert.equal(
    drilldown.route_transition_drilldown.surface_kind,
    'opl_app_drilldown_route_transition_drilldown',
  );
  assert.equal(
    drilldown.route_transition_drilldown.projection_policy,
    'refs_only_no_domain_truth_or_owner_receipt_generation',
  );
  assert.deepEqual(
    drilldown.route_transition_drilldown.mas_route_support.supported_task_kinds,
    buildMasDomainRouteSupportProjection().supported_task_kinds,
  );
  assert.deepEqual(
    drilldown.route_transition_drilldown.transition_spec_refs.map((ref: { ref: string }) => ref.ref),
    ['contracts/medautoscience.transition.json'],
  );
  assert.deepEqual(
    drilldown.route_transition_drilldown.materialization_refs.map((ref: { ref: string }) => ref.ref),
    ['contract-materialization:mas/transition', 'matrix:mas/transition'],
  );
  assert.deepEqual(
    drilldown.route_transition_drilldown.stage_attempt_refs.map((ref: { ref: string }) => ref.ref),
    ['/stage_attempt_workbench/attempts/sat_mas_route_transition/route_impact'],
  );
  assert.deepEqual(
    drilldown.route_transition_drilldown.owner_route_refs.map((ref: { ref: string }) => ref.ref),
    ['owner-route:mas/DM002/ai-reviewer-refresh'],
  );
  assert.deepEqual(
    drilldown.route_transition_drilldown.human_gate_refs.map((ref: { ref: string }) => ref.ref),
    [
      'human-gate:mas/DM002/release-gate',
      'human-gate:mas/DM002/physician-decision',
    ],
  );
  assert.deepEqual(
    drilldown.route_transition_drilldown.dead_letter_refs.map((ref: { ref: string }) => ref.ref),
    [
      'dead-letter:mas/DM002/retry-budget-exhausted',
      '/stage_attempt_workbench/attempts/sat_mas_route_transition/dead_letter',
    ],
  );
  assert.deepEqual(
    drilldown.route_transition_drilldown.typed_blocker_refs.map((ref: { ref: string }) => ref.ref),
    ['typed-blocker:mas/DM002/reviewer-refresh-required'],
  );
  assert.deepEqual(
    drilldown.route_transition_drilldown.owner_receipt_refs.map((ref: { ref: string }) => ref.ref),
    ['owner-receipt:mas/DM002/reviewer-feedback-intake'],
  );
  assert.equal(drilldown.route_transition_drilldown.authority_boundary.can_write_domain_truth, false);
  assert.equal(drilldown.route_transition_drilldown.authority_boundary.can_record_owner_receipt, false);
  assert.equal(drilldown.route_transition_drilldown.authority_boundary.can_close_owner_chain, false);
  assert.equal(drilldown.summary.route_transition_drilldown_stage_attempt_count, 1);
  assert.equal(drilldown.summary.route_transition_drilldown_owner_route_ref_count, 1);
  assert.equal(drilldown.summary.route_transition_drilldown_human_gate_ref_count, 2);
  assert.equal(drilldown.summary.route_transition_drilldown_dead_letter_ref_count, 2);
});

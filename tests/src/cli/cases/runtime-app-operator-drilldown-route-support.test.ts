import {
  assert,
  fs,
  os,
  path,
  test,
} from '../helpers.ts';
import {
  buildMasDomainRouteSupportProjection,
} from '../../../../src/modules/runway/family-runtime-mas-domain-route.ts';
import {
  buildAppOperatorDrilldown,
} from '../../../../src/modules/console/runtime-tray-app-operator-drilldown.ts';

function useTempState(t: { after: (fn: () => void) => void }, prefix: string) {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateRoot;
  t.after(() => {
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
  });
}

test('runtime App exposes MAS route support as refs-only runtime-manager projection', (t) => {
  useTempState(t, 'opl-app-route-support-');
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

  const projection = buildAppOperatorDrilldown({
    stageAttemptWorkbench: { attempts: [] },
    providerContinuousProof: {},
    domainProjectionIngestion: {},
    domainManifestProjects: [],
    detailLevel: 'full',
  });

  assert.equal(
    projection.runtime_manager_route_support.surface_kind,
    'opl_app_drilldown_runtime_manager_route_support',
  );
  assert.deepEqual(
    projection.runtime_manager_route_support.mas_domain_route_projection.supported_task_kinds,
    supportProjection.supported_task_kinds,
  );
  assert.deepEqual(
    projection.runtime_manager_route_support.mas_domain_route_projection.action_refs,
    supportProjection.action_refs,
  );
  assert.equal(projection.summary.runtime_manager_mas_route_support_task_kind_count, 3);
  assert.equal(projection.summary.runtime_manager_mas_aftercare_route_support_count, 2);
  assert.equal(projection.summary.runtime_manager_mas_route_support_action_ref_count, 2);
  assert.equal(projection.runtime_manager_route_support.authority_boundary.can_write_domain_truth, false);
  assert.equal(projection.runtime_manager_route_support.authority_boundary.can_claim_domain_ready, false);
  assert.equal(projection.runtime_manager_route_support.authority_boundary.can_close_owner_chain, false);
  assert.equal(projection.runtime_manager_route_support.authority_boundary.can_record_owner_receipt, false);
  assert.equal(projection.runtime_manager_route_support.authority_boundary.can_authorize_publication_aftercare, false);
});

test('runtime App exposes route-as-transition refs in one operator projection', () => {
  const projection = buildAppOperatorDrilldown({
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
  const routeTransition = projection.route_transition_drilldown;

  assert.equal(
    routeTransition.surface_kind,
    'opl_app_drilldown_route_transition_drilldown',
  );
  assert.equal(
    routeTransition.projection_policy,
    'refs_only_no_domain_truth_or_owner_receipt_generation',
  );
  assert.deepEqual(
    routeTransition.mas_route_support.supported_task_kinds,
    buildMasDomainRouteSupportProjection().supported_task_kinds,
  );
  assert.deepEqual(
    routeTransition.transition_spec_refs.map((ref: { ref: string }) => ref.ref),
    ['contracts/medautoscience.transition.json'],
  );
  assert.deepEqual(
    routeTransition.materialization_refs.map((ref: { ref: string }) => ref.ref),
    ['contract-materialization:mas/transition', 'matrix:mas/transition'],
  );
  assert.deepEqual(
    routeTransition.stage_attempt_refs.map((ref: { ref: string }) => ref.ref),
    ['/stage_attempt_workbench/attempts/sat_mas_route_transition/route_impact'],
  );
  assert.deepEqual(
    routeTransition.owner_route_refs.map((ref: { ref: string }) => ref.ref),
    ['owner-route:mas/DM002/ai-reviewer-refresh'],
  );
  assert.deepEqual(
    routeTransition.human_gate_refs.map((ref: { ref: string }) => ref.ref),
    [
      'human-gate:mas/DM002/release-gate',
      'human-gate:mas/DM002/physician-decision',
    ],
  );
  assert.deepEqual(
    routeTransition.dead_letter_refs.map((ref: { ref: string }) => ref.ref),
    [
      'dead-letter:mas/DM002/retry-budget-exhausted',
      '/stage_attempt_workbench/attempts/sat_mas_route_transition/dead_letter',
    ],
  );
  assert.deepEqual(
    routeTransition.typed_blocker_refs.map((ref: { ref: string }) => ref.ref),
    ['typed-blocker:mas/DM002/reviewer-refresh-required'],
  );
  assert.deepEqual(
    routeTransition.owner_receipt_refs.map((ref: { ref: string }) => ref.ref),
    ['owner-receipt:mas/DM002/reviewer-feedback-intake'],
  );
  assert.equal(routeTransition.authority_boundary.can_write_domain_truth, false);
  assert.equal(routeTransition.authority_boundary.can_record_owner_receipt, false);
  assert.equal(routeTransition.authority_boundary.can_close_owner_chain, false);
  assert.equal(projection.summary.route_transition_drilldown_stage_attempt_count, 1);
  assert.equal(projection.summary.route_transition_drilldown_owner_route_ref_count, 1);
  assert.equal(projection.summary.route_transition_drilldown_human_gate_ref_count, 2);
  assert.equal(projection.summary.route_transition_drilldown_dead_letter_ref_count, 2);
});

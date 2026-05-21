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
});

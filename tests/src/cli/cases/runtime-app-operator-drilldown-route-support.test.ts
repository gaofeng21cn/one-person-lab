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

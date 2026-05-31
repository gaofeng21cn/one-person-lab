import {
  assert,
  buildManifestCommand,
  createFamilyContractsFixtureRoot,
  fs,
  loadFamilyManifestFixtures,
  os,
  path,
  repoRoot,
  runCli,
  runCliFailure,
  test,
} from '../helpers.ts';

function withRcaPayloadSummaries(manifest: Record<string, unknown>) {
  return {
    ...manifest,
    operator_evidence_readiness_projection: {
      production_evidence_scaleout_refs: {
        owner_payload_item_summary: {
          surface_kind: 'rca_owner_payload_item_summary',
          owner: 'redcube_ai',
          consumer: 'one_person_lab',
          status: 'per_work_item_owner_payload_refs_ready',
          payload_kind: 'domain_owner_receipt_or_typed_blocker_refs',
          payload_path_policy: 'operator_must_choose_success_refs_path_or_domain_owned_typed_blocker_path_empty_template_blocks',
          payload_body_allowed: false,
          empty_payload_template_is_success_evidence: false,
          required_operator_payload_refs: [
            'domain_owner_receipt_refs',
            'no_regression_evidence_refs',
            'owner_chain_refs',
            'typed_blocker_refs',
          ],
          required_return_shapes: [
            'domain_owner_receipt_ref',
            'no_regression_evidence_ref',
            'owner_chain_ref',
            'typed_blocker_ref',
          ],
          accepted_payload_paths_ref: '/operator_evidence_readiness_projection/production_evidence_scaleout_refs/accepted_payload_paths',
          work_items: [
            {
              item_id: 'owner_chain_apply',
              sequence: 1,
              remaining_gap_id: 'owner_chain_apply_to_real_opl_attempt',
              workorder_item_ref: '/operator_evidence_readiness_projection/production_evidence_tail_workorder/work_items/0',
              payload_kind: 'domain_owner_receipt_or_typed_blocker_refs',
              current_payload_template: {
                domain_owner_receipt_refs: [],
                no_regression_evidence_refs: [],
                owner_chain_refs: [],
                typed_blocker_refs: [],
              },
              success_refs_path_payload: {
                domain_owner_receipt_refs: ['rca-owner-receipt:visual-stage:fixture'],
                no_regression_evidence_refs: ['rca-no-regression:visual-stage:fixture'],
                owner_chain_refs: ['contracts/production_acceptance/rca-production-acceptance.json'],
              },
              typed_blocker_path_payload: {
                typed_blocker_refs: ['rca-typed-blocker:controlled-soak:temporal-long-soak-pending'],
              },
              operator_payload_submitted: false,
              recommended_current_payload_path: 'typed_blocker_path',
              success_refs_visible_is_completion: false,
              payload_body_allowed: false,
              domain_readiness_claimed: false,
              production_readiness_claimed: false,
            },
            {
              item_id: 'memory_lifecycle_receipt_scaleout',
              sequence: 2,
              remaining_gap_id: 'real_memory_lifecycle_receipt_instances',
              workorder_item_ref: '/operator_evidence_readiness_projection/production_evidence_tail_workorder/work_items/1',
              payload_kind: 'domain_owner_receipt_or_typed_blocker_refs',
              current_payload_template: {
                domain_owner_receipt_refs: [],
                no_regression_evidence_refs: [],
                owner_chain_refs: [],
                typed_blocker_refs: [],
              },
              success_refs_path_payload: {
                owner_chain_refs: ['rca-memory-receipt:visual-pattern:fixture-accepted'],
              },
              typed_blocker_path_payload: {
                typed_blocker_refs: ['rca-typed-blocker:memory-lifecycle:real-receipt-instances-pending'],
              },
              operator_payload_submitted: false,
              recommended_current_payload_path: 'typed_blocker_path',
              success_refs_visible_is_completion: false,
              payload_body_allowed: false,
              domain_readiness_claimed: false,
              production_readiness_claimed: false,
            },
          ],
        },
      },
      opl_expected_receipt_monitor_freshness_handoff: {
        stage_expected_receipt_payload_summary: {
          surface_kind: 'rca_stage_expected_receipt_payload_summary',
          owner: 'redcube_ai',
          consumer: 'one_person_lab',
          status: 'per_stage_expected_receipt_payload_refs_ready',
          payload_kind: 'stage_expected_receipt_or_monitor_freshness_refs',
          payload_path_policy: 'operator_must_choose_success_refs_path_or_domain_owned_typed_blocker_path_empty_template_blocks',
          payload_body_allowed: false,
          empty_payload_template_is_success_evidence: false,
          required_operator_payload_refs: [
            'domain_receipt_refs',
            'monitor_freshness_refs',
            'runtime_event_refs',
            'typed_blocker_refs',
          ],
          required_return_shapes: [
            'domain_receipt_ref',
            'monitor_freshness_ref',
            'runtime_event_ref',
            'typed_blocker_ref',
          ],
          accepted_payload_paths_ref: '/operator_evidence_readiness_projection/owner_payload_workorder/accepted_payload_paths',
          stages: [
            {
              stage_id: 'visual_direction',
              sequence: 3,
              payload_kind: 'stage_expected_receipt_or_monitor_freshness_refs',
              current_payload_template: {
                domain_receipt_refs: [],
                monitor_freshness_refs: [],
                runtime_event_refs: [],
                typed_blocker_refs: [],
              },
              success_refs_path_payload: {
                monitor_freshness_refs: [
                  '/workspace_receipt_inventory_projection/stage_monitor_freshness/visual_direction',
                ],
                runtime_event_refs: [
                  'runtime_event:rca.visual_direction.expected_receipt_or_monitor_freshness',
                ],
              },
              typed_blocker_path_payload: {
                typed_blocker_refs: ['rca-typed-blocker:controlled-soak:temporal-long-soak-pending'],
              },
              monitor_status: 'workspace_receipt_scaleout_ref_model_pending',
              operator_payload_submitted: false,
              recommended_current_payload_path: 'typed_blocker_path',
              success_refs_visible_is_completion: false,
              payload_body_allowed: false,
              domain_readiness_claimed: false,
              production_readiness_claimed: false,
            },
          ],
        },
      },
    },
  };
}

test('runtime App drilldown exposes RCA owner payload summaries as refs-only guidance', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-rca-payload-summary-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const rcaManifest = withRcaPayloadSummaries(loadFamilyManifestFixtures().redcube);
  const env = {
    OPL_STATE_DIR: stateRoot,
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
  };
  runCli([
    'workspace',
    'bind',
    '--project',
    'redcube',
    '--path',
    repoRoot,
    '--manifest-command',
    buildManifestCommand(rcaManifest),
  ], env);

  const summary = runCli(['runtime', 'app-operator-drilldown'], env).app_operator_drilldown;
  assert.equal(summary.domain_owner_payload_summary_refs, undefined);
  assert.equal(summary.summary.domain_owner_payload_summary_domain_count, 1);
  assert.equal(summary.summary.domain_owner_payload_summary_owner_payload_item_summary_count, 1);
  assert.equal(summary.summary.domain_owner_payload_summary_work_item_count, 2);
  assert.equal(summary.summary.domain_owner_payload_summary_stage_expected_receipt_summary_count, 1);
  assert.equal(summary.summary.domain_owner_payload_summary_stage_count, 1);
  assert.equal(summary.summary.domain_owner_payload_summary_domain_ready_claim_count, 0);
  assert.equal(summary.summary.domain_owner_payload_summary_production_ready_claim_count, 0);
  const summaryAttention = summary.attention_first_payload.evidence_after_contract
    .domain_owner_payload_summary_attention;
  assert.equal(summaryAttention.surface_kind, 'opl_domain_owner_payload_summary_attention');
  assert.equal(
    summaryAttention.projection_policy,
    'bounded_refs_only_payload_summary_guidance_with_refs_only_ledger_route',
  );
  assert.equal(summaryAttention.domain_count, 1);
  assert.equal(summaryAttention.owner_payload_work_item_count, 2);
  assert.equal(summaryAttention.stage_expected_receipt_payload_stage_count, 1);
  assert.equal(summaryAttention.owner_payload_domains[0].domain_id, 'redcube');
  assert.equal(summaryAttention.owner_payload_domains[0].owner, 'redcube_ai');
  assert.equal(summaryAttention.owner_payload_domains[0].owner_payload_work_item_count, 2);
  assert.equal(summaryAttention.owner_payload_domains[0].stage_expected_receipt_payload_stage_count, 1);
  assert.equal(summaryAttention.owner_payload_domains[0].full_detail_section, 'domain_owner_payload_summary_refs');
  assert.equal(summaryAttention.payload_body_allowed_count, 0);
  assert.equal(summaryAttention.domain_ready_claim_count, 0);
  assert.equal(summaryAttention.production_ready_claim_count, 0);
  assert.equal(summaryAttention.authority_boundary.can_create_owner_receipt, false);
  assert.equal(summaryAttention.authority_boundary.can_generate_typed_blocker, false);
  assert.equal(summaryAttention.authority_boundary.can_claim_production_ready, false);

  const full = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], env)
    .app_operator_drilldown;
  const projection = full.domain_owner_payload_summary_refs;
  assert.equal(projection.surface_kind, 'opl_app_drilldown_domain_owner_payload_summary_refs');
  assert.equal(projection.summary.domain_count, 1);
  assert.equal(projection.summary.payload_body_allowed_count, 0);
  assert.equal(projection.summary.domain_ready_claim_count, 0);
  assert.equal(projection.summary.production_ready_claim_count, 0);
  assert.equal(projection.authority_boundary.can_write_domain_truth, false);
  assert.equal(projection.authority_boundary.can_create_owner_receipt, false);
  assert.equal(projection.authority_boundary.can_generate_typed_blocker, false);
  assert.equal(projection.authority_boundary.can_claim_production_ready, false);

  const ownerRecordRoute = full.operator_action_routing_refs.refs.find(
    (route: { action_kind: string; target_identity?: { item_id?: string } }) =>
      route.action_kind === 'domain_owner_payload_summary_receipt_record'
      && route.target_identity?.item_id === 'owner_chain_apply',
  );
  assert.ok(ownerRecordRoute);
  assert.equal(ownerRecordRoute.route_requires_domain_or_app_payload, true);
  assert.equal(ownerRecordRoute.payload_body_allowed, false);
  assert.equal(ownerRecordRoute.payload_workorder.authority_boundary.can_create_owner_receipt, false);
  assert.equal(ownerRecordRoute.payload_workorder.authority_boundary.can_close_domain_ready, false);
  assert.equal(ownerRecordRoute.payload_workorder.authority_boundary.can_claim_production_ready, false);
  const stageRecordRoute = full.operator_action_routing_refs.refs.find(
    (route: { action_kind: string; target_identity?: { stage_id?: string } }) =>
      route.action_kind === 'domain_owner_payload_summary_receipt_record'
      && route.target_identity?.stage_id === 'visual_direction',
  );
  assert.ok(stageRecordRoute);
  assert.deepEqual(stageRecordRoute.required_operator_payload_refs, [
    'domain_receipt_refs',
    'monitor_freshness_refs',
    'runtime_event_refs',
    'typed_blocker_refs',
  ]);
  const actionLedgerReceiptRefOnly = runCliFailure([
    'runtime',
    'action',
    'execute',
    '--action',
    stageRecordRoute.action_id,
    '--payload',
    JSON.stringify({
      receipt_ref: 'opl://domain-owner-payload-summary/stage-ledger-override',
    }),
  ], env);
  assert.equal(actionLedgerReceiptRefOnly.payload.error.code, 'cli_usage_error');
  assert.equal(
    actionLedgerReceiptRefOnly.payload.error.details.error_kind,
    'domain_owner_payload_summary_payload_preflight_blocked',
  );
  assert.deepEqual(
    actionLedgerReceiptRefOnly.payload.error.details.preflight.missing_payload_fields,
    ['domain_owner_or_stage_success_refs_or_typed_blocker_refs'],
  );

  const rca = projection.domains[0];
  assert.equal(rca.domain_id, 'redcube');
  assert.equal(rca.source_surface, 'operator_evidence_readiness_projection');
  assert.equal(rca.owner_payload_item_summary.work_item_count, 2);
  assert.deepEqual(
    rca.owner_payload_item_summary.work_items.map((item: { item_id: string }) => item.item_id),
    ['owner_chain_apply', 'memory_lifecycle_receipt_scaleout'],
  );
  assert.deepEqual(
    rca.owner_payload_item_summary.work_items[0].typed_blocker_path_payload,
    {
      typed_blocker_refs: ['rca-typed-blocker:controlled-soak:temporal-long-soak-pending'],
    },
  );
  assert.equal(rca.owner_payload_item_summary.work_items[0].success_refs_visible_is_completion, false);
  assert.equal(rca.owner_payload_item_summary.work_items[0].authority_boundary.can_close_owner_chain, false);
  assert.equal(rca.stage_expected_receipt_payload_summary.stage_count, 1);
  assert.equal(rca.stage_expected_receipt_payload_summary.stages[0].stage_id, 'visual_direction');
  assert.deepEqual(
    rca.stage_expected_receipt_payload_summary.stages[0].success_refs_path_payload.runtime_event_refs,
    ['runtime_event:rca.visual_direction.expected_receipt_or_monitor_freshness'],
  );
  assert.equal(
    rca.stage_expected_receipt_payload_summary.stages[0].authority_boundary.can_claim_domain_ready,
    false,
  );

  const readiness = runCli(['framework', 'readiness', '--family-defaults'], env)
    .framework_readiness;
  const readinessAttention = readiness.attention_first_payload.domain_owner_payload_summary_attention;
  assert.equal(readinessAttention.surface_kind, 'opl_domain_owner_payload_summary_attention');
  assert.equal(readinessAttention.source_command, 'opl runtime app-operator-drilldown --json');
  assert.equal(readinessAttention.domain_count, 1);
  assert.equal(readinessAttention.owner_payload_work_item_count, 2);
  assert.equal(readinessAttention.stage_expected_receipt_payload_stage_count, 1);
  assert.deepEqual(
    readinessAttention.owner_payload_domains.map((domain: { domain_id: string }) => domain.domain_id),
    ['redcube'],
  );
  assert.equal(readinessAttention.authority_boundary.can_write_domain_truth, false);
  assert.equal(readinessAttention.authority_boundary.can_create_owner_receipt, false);
  assert.equal(readinessAttention.authority_boundary.can_generate_typed_blocker, false);
  assert.equal(readinessAttention.authority_boundary.can_claim_domain_ready, false);
  assert.equal(readinessAttention.authority_boundary.can_claim_production_ready, false);
  assert.equal(
    readiness.domain_owner_payload_summary_attention.owner_payload_work_item_count,
    readinessAttention.owner_payload_work_item_count,
  );
});

test('runtime App drilldown blocks RCA legacy payload field alias resurrection', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-rca-payload-alias-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const rcaManifest = withRcaPayloadSummaries(loadFamilyManifestFixtures().redcube);
  const productionRefs = (
    rcaManifest.operator_evidence_readiness_projection as Record<string, Record<string, unknown>>
  ).production_evidence_scaleout_refs;
  productionRefs.legacy_payload_field_aliases = {
    domain_receipt_refs: ['domain_owner_receipt_refs'],
    no_regression_refs: ['no_regression_evidence_refs'],
  };
  const env = {
    OPL_STATE_DIR: stateRoot,
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
  };
  runCli([
    'workspace',
    'bind',
    '--project',
    'redcube',
    '--path',
    repoRoot,
    '--manifest-command',
    buildManifestCommand(rcaManifest),
  ], env);

  const summary = runCli(['runtime', 'app-operator-drilldown'], env)
    .app_operator_drilldown;
  assert.equal(
    summary.summary.domain_owner_payload_summary_naming_hygiene_blocker_count,
    1,
  );
  const summaryAttention = summary.attention_first_payload.evidence_after_contract
    .domain_owner_payload_summary_attention;
  assert.equal(summaryAttention.naming_hygiene_blocker_count, 1);
  assert.equal(
    summaryAttention.owner_payload_domains[0].status,
    'blocked_legacy_payload_field_aliases_resurrected',
  );
  assert.deepEqual(summaryAttention.owner_payload_domains[0].blocked_alias_fields, [
    'domain_receipt_refs',
    'no_regression_refs',
  ]);

  const readiness = runCli(['framework', 'readiness', '--family-defaults'], env)
    .framework_readiness;
  assert.equal(
    readiness.summary.domain_owner_payload_summary_naming_hygiene_blocker_count,
    1,
  );
  assert.equal(
    readiness.attention_first_payload.summary
      .domain_owner_payload_summary_naming_hygiene_blocker_count,
    1,
  );
  assert.equal(
    readiness.attention_first_payload.domain_owner_payload_summary_attention
      .naming_hygiene_blocker_count,
    1,
  );

  const worklist = runCli([
    'family-runtime',
    'evidence-worklist',
    '--family-defaults',
    '--provider',
    'temporal',
    '--executor-kind',
    'codex_cli',
    '--detail',
    'full',
  ], env).family_runtime_evidence_worklist;
  assert.equal(
    worklist.summary.domain_owner_payload_summary_naming_hygiene_blocker_count,
    1,
  );
  assert.equal(
    worklist.domain_owner_payload_summary_attention.surface_kind,
    'opl_domain_owner_payload_summary_attention',
  );
  assert.equal(
    worklist.domain_owner_payload_summary_attention.source_command,
    'opl runtime app-operator-drilldown --json',
  );
  assert.equal(worklist.domain_owner_payload_summary_attention.naming_hygiene_blocker_count, 1);
  assert.equal(
    worklist.domain_owner_payload_summary_attention.owner_payload_domains[0].status,
    'blocked_legacy_payload_field_aliases_resurrected',
  );
  assert.equal(
    worklist.worklist_items.some(
      (item: { action_kind: string }) =>
        item.action_kind === 'domain_owner_payload_summary_receipt_record',
    ),
    false,
  );

  const full = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], env)
    .app_operator_drilldown;
  const projection = full.domain_owner_payload_summary_refs;
  const rca = projection.domains[0];
  assert.equal(rca.status, 'blocked_legacy_payload_field_aliases_resurrected');
  assert.equal(rca.owner_payload_item_summary, null);
  assert.equal(rca.stage_expected_receipt_payload_summary, null);
  assert.deepEqual(rca.naming_hygiene_blocker.blocked_alias_fields, [
    'domain_receipt_refs',
    'no_regression_refs',
  ]);
  assert.equal(projection.summary.domain_count, 1);
  assert.equal(projection.summary.owner_payload_work_item_count, 0);
  assert.equal(projection.summary.stage_expected_receipt_payload_stage_count, 0);
  assert.equal(projection.summary.naming_hygiene_blocker_count, 1);
  const recordRoutes = full.operator_action_routing_refs.refs.filter(
    (route: { action_kind: string }) =>
      route.action_kind === 'domain_owner_payload_summary_receipt_record',
  );
  assert.equal(recordRoutes.length, 0);

  const attention = full.attention_first_payload.evidence_after_contract
    .domain_owner_payload_summary_attention;
  assert.equal(attention.naming_hygiene_blocker_count, 1);
  assert.equal(
    attention.owner_payload_domains[0].status,
    'blocked_legacy_payload_field_aliases_resurrected',
  );
  assert.deepEqual(attention.owner_payload_domains[0].blocked_alias_fields, [
    'domain_receipt_refs',
    'no_regression_refs',
  ]);
});

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

function withMasContractOnlyPayloadSurface(manifest: Record<string, unknown>) {
  return {
    ...manifest,
    provider_guarded_soak_read_model: {
      surface_kind: 'provider_guarded_soak_read_model',
      paper_line_guarded_apply_evidence: {
        surface_kind: 'mas_paper_line_guarded_apply_evidence_scaleout',
        mode: 'domain_owned_refs_only',
        owner: 'MedAutoScience',
        opl_ingestable_ref_contract: {
          per_paper_line_domain_dispatch_payload_surface:
            'paper_line_domain_dispatch_evidence_record_payloads',
          per_paper_line_owner_payload_summary_surface: 'paper_line_owner_payload_summary',
          closeout_requires_mas_owner_receipt_or_typed_blocker: true,
        },
      },
    },
  };
}

function withMasCanaryCloseoutPayloads(manifest: Record<string, unknown>) {
  return {
    ...withMasContractOnlyPayloadSurface(manifest),
    real_paper_autonomy_guarded_apply_proof: {
      surface: 'real_paper_autonomy_guarded_apply_proof',
      mode: 'mas_owned_guarded_apply_proof',
      paper_line_provider_canary_closeout: {
        surface_kind: 'mas_real_paper_line_owner_chain_closeout',
        closeout_status: 'closed_by_mas_owner_chain',
        selected_opl_ingestable_ref_surface:
          'product_entry_manifest.provider_guarded_soak_read_model.paper_line_guarded_apply_evidence',
        required_return_shape_satisfied: true,
        paper_line_owner_payload_summary: {
          paper_line_count: 2,
          success_payload_count: 1,
          typed_blocker_payload_count: 1,
          domain_ready_claim_count: 0,
          production_ready_claim_count: 0,
          artifact_mutation_authorized_count: 0,
        },
        stage_expected_receipt_payload_summary: {
          surface_kind: 'mas_stage_expected_receipt_payload_summary',
          owner: 'med-autoscience',
          consumer: 'one_person_lab',
          status: 'per_stage_expected_receipt_payload_refs_ready_with_live_evidence_typed_blockers',
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
          accepted_payload_paths_ref: (
            '/real_paper_autonomy_guarded_apply_proof/paper_line_provider_canary_closeout/'
            + 'stage_expected_receipt_payload_summary'
          ),
          stages: [
            {
              stage_id: 'finalize_and_publication_handoff',
              sequence: 6,
              payload_kind: 'stage_expected_receipt_or_monitor_freshness_refs',
              current_payload_template: {
                domain_receipt_refs: [],
                monitor_freshness_refs: [],
                runtime_event_refs: [],
                typed_blocker_refs: [],
              },
              success_refs_path_payload: {
                domain_receipt_refs: [
                  '/studies/002/artifacts/controller/repair_execution_receipts/latest.json',
                ],
                monitor_freshness_refs: [
                  '/studies/002/artifacts/controller/repair_execution_evidence/latest.json',
                ],
                runtime_event_refs: [],
              },
              typed_blocker_path_payload: {
                typed_blocker_refs: [
                  'mas_owner_apply_receipt_missing:003-dm-cvd-ehr-risk-calibration',
                ],
              },
              monitor_status: 'success_refs_observed_with_typed_blocker_tail',
              operator_payload_submitted: false,
              recommended_current_payload_path: 'typed_blocker_path',
              success_refs_visible_is_completion: false,
              payload_body_allowed: false,
              domain_readiness_claimed: false,
              production_readiness_claimed: false,
            },
          ],
        },
        paper_line_domain_dispatch_evidence_record_payloads: [
          {
            surface_kind: 'mas_domain_dispatch_evidence_record_payload',
            mode: 'refs_only_domain_owned_success_payload',
            domain_id: 'medautoscience',
            task_kind: 'paper_autonomy/guarded-apply',
            study_id: '002-dm-china-us-mortality-attribution',
            reason: 'owner_chain_receipt_observed',
            record_payload: {
              domain_owner_receipt_refs: [
                '/studies/002/artifacts/controller/repair_execution_receipts/latest.json',
              ],
              no_regression_evidence_refs: [
                'mas-no-forbidden-write-proof:medautoscience:dm002',
              ],
              owner_chain_refs: [
                'contracts/production_acceptance/mas-production-acceptance.json#/paper_line_guarded_apply_evidence',
              ],
              typed_blocker_refs: [],
            },
            domain_owner_receipt_refs: [
              '/studies/002/artifacts/controller/repair_execution_receipts/latest.json',
            ],
            no_regression_evidence_refs: [
              'mas-no-forbidden-write-proof:medautoscience:dm002',
            ],
            owner_chain_refs: [
              'contracts/production_acceptance/mas-production-acceptance.json#/paper_line_guarded_apply_evidence',
            ],
            typed_blocker_refs: [],
            body_included: false,
            domain_ready_claimed: false,
            publication_ready_claimed: false,
            artifact_mutation_authorized: false,
            current_package_mutation_authorized: false,
          },
          {
            surface_kind: 'mas_domain_dispatch_evidence_record_payload',
            mode: 'refs_only_domain_owned_typed_blocker_payload',
            domain_id: 'medautoscience',
            task_kind: 'paper_autonomy/guarded-apply',
            study_id: '003-dm-cvd-ehr-risk-calibration',
            reason: 'owner_chain_receipt_pending',
            record_payload: {
              domain_owner_receipt_refs: [],
              no_regression_evidence_refs: [
                'mas-no-forbidden-write-proof:medautoscience:dm003',
              ],
              owner_chain_refs: [
                'contracts/production_acceptance/mas-production-acceptance.json#/paper_line_guarded_apply_evidence',
              ],
              typed_blocker_refs: [
                'mas_owner_apply_receipt_missing:003-dm-cvd-ehr-risk-calibration',
              ],
            },
            domain_owner_receipt_refs: [],
            no_regression_evidence_refs: [
              'mas-no-forbidden-write-proof:medautoscience:dm003',
            ],
            owner_chain_refs: [
              'contracts/production_acceptance/mas-production-acceptance.json#/paper_line_guarded_apply_evidence',
            ],
            typed_blocker_refs: [
              'mas_owner_apply_receipt_missing:003-dm-cvd-ehr-risk-calibration',
            ],
            body_included: false,
            domain_ready_claimed: false,
            publication_ready_claimed: false,
            artifact_mutation_authorized: false,
            current_package_mutation_authorized: false,
          },
        ],
      },
    },
  };
}

test('runtime App drilldown does not treat MAS contract-only payload surface as owner evidence', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-mas-payload-contract-only-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const masManifest = withMasContractOnlyPayloadSurface(loadFamilyManifestFixtures().medautoscience);
  const env = {
    OPL_STATE_DIR: stateRoot,
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
  };
  runCli([
    'workspace',
    'bind',
    '--project',
    'medautoscience',
    '--path',
    repoRoot,
    '--manifest-command',
    buildManifestCommand(masManifest),
  ], env);

  const summary = runCli(['runtime', 'app-operator-drilldown'], env).app_operator_drilldown;
  assert.equal(summary.summary.domain_owner_payload_summary_domain_count, 0);
  assert.equal(
    summary.attention_first_payload.evidence_after_contract
      .domain_owner_payload_summary_attention.status,
    'clear',
  );
});

test('runtime action execute records MAS owner payload summaries into a refs-only OPL ledger', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-mas-owner-payload-ledger-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const masManifest = withMasCanaryCloseoutPayloads(loadFamilyManifestFixtures().medautoscience);
  const env = {
    OPL_STATE_DIR: stateRoot,
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
  };
  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(masManifest),
    ], env);

    const initial = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], env)
      .app_operator_drilldown;
    const recordRoute = initial.operator_action_routing_refs.refs.find(
      (route: { action_kind: string; target_identity?: { item_id?: string } }) =>
        route.action_kind === 'domain_owner_payload_summary_receipt_record'
        && route.target_identity?.item_id === '002-dm-china-us-mortality-attribution',
    );
    assert.ok(recordRoute);
    assert.equal(recordRoute.owner, 'opl');
    assert.equal(recordRoute.route_target_kind, 'opl_cli');
    assert.equal(recordRoute.execution_surface, 'opl runtime action execute');
    assert.equal(recordRoute.route_requires_domain_or_app_payload, true);
    assert.equal(recordRoute.payload_body_allowed, false);
    assert.equal(recordRoute.can_create_owner_receipt, false);
    assert.equal(recordRoute.can_close_domain_ready, false);
    assert.equal(recordRoute.can_claim_production_ready, false);
    assert.equal(
      recordRoute.payload_workorder.accepted_payload_paths.success_refs_path
        .closes_owner_chain,
      false,
    );

    const pollutedPayloadExecution = runCliFailure([
      'runtime',
      'action',
      'execute',
      '--action',
      recordRoute.action_id,
      '--payload',
      JSON.stringify({
        domain_owner_receipt_refs: [
          '/studies/002/artifacts/controller/repair_execution_receipts/latest.json',
        ],
        body_included: true,
        readiness_claims: {
          claims_publication_ready: true,
        },
      }),
    ], env);
    assert.equal(pollutedPayloadExecution.payload.error.code, 'cli_usage_error');
    assert.equal(
      pollutedPayloadExecution.payload.error.details.error_kind,
      'domain_owner_payload_summary_payload_authority_claims_or_body_forbidden',
    );
    assert.equal(pollutedPayloadExecution.payload.error.details.receipt_recorded, false);
    assert.equal(
      pollutedPayloadExecution.payload.error.details.preflight.can_record_refs_only_receipt,
      false,
    );

    const ledgerReceiptRefOnlyExecution = runCliFailure([
      'runtime',
      'domain-owner-payload-summary',
      'record',
      '--target-identity',
      JSON.stringify({
        domain_id: 'redcube',
        source_surface: 'operator_evidence_readiness_projection',
        summary_kind: 'stage_expected_receipt',
        stage_id: 'visual_direction',
        payload_kind: 'stage_expected_receipt_or_monitor_freshness_refs',
      }),
      '--payload',
      JSON.stringify({
        receipt_ref: 'opl://domain-owner-payload-summary/manual-ledger-ref',
      }),
    ], env);
    assert.equal(ledgerReceiptRefOnlyExecution.payload.error.code, 'cli_usage_error');
    assert.equal(
      ledgerReceiptRefOnlyExecution.payload.error.details.error_kind,
      'domain_owner_payload_summary_payload_preflight_blocked',
    );
    assert.equal(ledgerReceiptRefOnlyExecution.payload.error.details.receipt_recorded, false);
    assert.deepEqual(
      ledgerReceiptRefOnlyExecution.payload.error.details.preflight.missing_payload_fields,
      ['domain_owner_or_stage_success_refs_or_typed_blocker_refs'],
    );

    const recordExecution = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      recordRoute.action_id,
      '--payload',
      JSON.stringify({
        domain_owner_receipt_refs: [
          '/studies/002/artifacts/controller/repair_execution_receipts/latest.json',
        ],
        no_regression_evidence_refs: [
          'mas-no-forbidden-write-proof:medautoscience:dm002',
        ],
        owner_chain_refs: [
          'contracts/production_acceptance/mas-production-acceptance.json#/paper_line_guarded_apply_evidence',
        ],
      }),
    ], env).runtime_operator_action_execution;
    assert.equal(recordExecution.execution.execution_kind, 'opl_cli_domain_owner_payload_summary_apply');
    assert.equal(recordExecution.execution.execution_status, 'executed');
    const recordOutput =
      recordExecution.execution.result.domain_owner_payload_summary_ledger_record;
    assert.equal(recordOutput.status, 'recorded');
    assert.equal(recordOutput.recorded_receipt_count, 1);
    assert.equal(recordOutput.receipts[0].payload_path, 'success_refs_path');
    assert.equal(recordOutput.receipts[0].target_identity.item_id, '002-dm-china-us-mortality-attribution');
    assert.equal(recordOutput.receipts[0].authority_boundary.refs_only, true);
    assert.equal(recordOutput.receipts[0].authority_boundary.can_create_owner_receipt, false);
    assert.equal(recordOutput.receipts[0].authority_boundary.can_close_domain_ready, false);
    assert.equal(recordOutput.receipts[0].authority_boundary.can_claim_production_ready, false);
    assert.equal(
      recordOutput.ledger_file,
      path.join(stateRoot, 'domain-owner-payload-summary-ledger.json'),
    );

    const replacementReceiptRef = 'opl://domain-owner-payload-summary/manual-replacement';
    const replacementRecord = runCli([
      'runtime',
      'domain-owner-payload-summary',
      'record',
      '--target-identity',
      JSON.stringify(recordOutput.receipts[0].target_identity),
      '--payload',
      JSON.stringify({
        receipt_ref: replacementReceiptRef,
        typed_blocker_refs: [
          'typed-blocker:mas:dm002:owner-payload-replacement',
        ],
      }),
    ], env).domain_owner_payload_summary_ledger_record;
    assert.equal(replacementRecord.status, 'recorded');
    assert.equal(replacementRecord.receipt_refs[0], replacementReceiptRef);
    assert.equal(replacementRecord.receipts[0].payload_path, 'typed_blocker_path');

    const replacementLedger = runCli(['runtime', 'domain-owner-payload-summary', 'list'], env)
      .domain_owner_payload_summary_ledger;
    assert.equal(replacementLedger.receipt_count, 1);
    assert.equal(replacementLedger.receipts[0].receipt_ref, replacementReceiptRef);
    assert.deepEqual(replacementLedger.receipts[0].typed_blocker_refs, [
      'typed-blocker:mas:dm002:owner-payload-replacement',
    ]);

    const pending = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], env)
      .app_operator_drilldown;
    assert.equal(pending.summary.domain_owner_payload_summary_recorded_ledger_receipt_ref_count, 1);
    assert.equal(pending.summary.domain_owner_payload_summary_verified_ledger_receipt_ref_count, 0);
    const verifyRoute = pending.operator_action_routing_refs.refs.find(
      (route: { action_kind: string; receipt_ref?: string }) =>
        route.action_kind === 'domain_owner_payload_summary_receipt_verify'
        && route.receipt_ref === replacementReceiptRef,
    );
    assert.ok(verifyRoute);
    assert.equal(verifyRoute.route_requires_domain_or_app_payload, false);
    assert.equal(verifyRoute.can_close_without_domain_or_app_payload, true);
    assert.equal(verifyRoute.can_close_domain_ready, false);

    const verifyExecution = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      verifyRoute.action_id,
    ], env).runtime_operator_action_execution;
    assert.equal(
      verifyExecution.execution.result.domain_owner_payload_summary_ledger_verify.status,
      'verified',
    );

    const verified = runCli(['runtime', 'domain-owner-payload-summary', 'list'], env)
      .domain_owner_payload_summary_ledger;
    assert.equal(verified.receipt_count, 1);
    assert.equal(verified.verified_receipt_count, 1);
    assert.equal(verified.authority_boundary.can_write_domain_truth, false);
    assert.equal(verified.authority_boundary.can_create_owner_receipt, false);
    assert.equal(verified.authority_boundary.can_claim_production_ready, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('runtime App drilldown exposes MAS paper-line owner payloads only from explicit canary closeout', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-mas-paper-line-payload-summary-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const masManifest = withMasCanaryCloseoutPayloads(loadFamilyManifestFixtures().medautoscience);
  const env = {
    OPL_STATE_DIR: stateRoot,
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
  };
  runCli([
    'workspace',
    'bind',
    '--project',
    'medautoscience',
    '--path',
    repoRoot,
    '--manifest-command',
    buildManifestCommand(masManifest),
  ], env);

  const summary = runCli(['runtime', 'app-operator-drilldown'], env).app_operator_drilldown;
  assert.equal(summary.summary.domain_owner_payload_summary_domain_count, 1);
  assert.equal(summary.summary.domain_owner_payload_summary_owner_payload_item_summary_count, 1);
  assert.equal(summary.summary.domain_owner_payload_summary_work_item_count, 2);
  assert.equal(summary.summary.domain_owner_payload_summary_stage_expected_receipt_summary_count, 1);
  assert.equal(summary.summary.domain_owner_payload_summary_stage_count, 1);
  assert.equal(summary.summary.domain_owner_payload_summary_domain_ready_claim_count, 0);
  assert.equal(summary.summary.domain_owner_payload_summary_production_ready_claim_count, 0);

  const attention = summary.attention_first_payload.evidence_after_contract
    .domain_owner_payload_summary_attention;
  assert.equal(attention.status, 'owner_payload_summary_available');
  assert.equal(attention.owner_payload_domains[0].domain_id, 'medautoscience');
  assert.equal(attention.owner_payload_domains[0].owner, 'med-autoscience');
  assert.equal(attention.owner_payload_domains[0].owner_payload_work_item_count, 2);
  assert.equal(attention.owner_payload_domains[0].stage_expected_receipt_payload_stage_count, 1);
  assert.equal(
    attention.owner_payload_domains[0].stage_expected_receipt_payload_status,
    'per_stage_expected_receipt_payload_refs_ready_with_live_evidence_typed_blockers',
  );
  assert.equal(attention.owner_payload_domains[0].source_surface, 'real_paper_autonomy_guarded_apply_proof');
  assert.equal(attention.owner_payload_domains[0].copyable_runtime_action_execute_commands, undefined);
  assert.equal(attention.authority_boundary.can_create_owner_receipt, false);
  assert.equal(attention.authority_boundary.can_generate_typed_blocker, false);

  const full = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], env)
    .app_operator_drilldown;
  const projection = full.domain_owner_payload_summary_refs;
  assert.equal(projection.summary.domain_count, 1);
  const mas = projection.domains[0];
  assert.equal(mas.domain_id, 'medautoscience');
  assert.equal(mas.source_surface, 'real_paper_autonomy_guarded_apply_proof');
  assert.equal(mas.owner_payload_item_summary.work_item_count, 2);
  assert.deepEqual(
    mas.owner_payload_item_summary.work_items.map((item: { item_id: string }) => item.item_id),
    [
      '002-dm-china-us-mortality-attribution',
      '003-dm-cvd-ehr-risk-calibration',
    ],
  );
  assert.deepEqual(
    mas.owner_payload_item_summary.work_items[0].success_refs_path_payload,
    {
      domain_owner_receipt_refs: [
        '/studies/002/artifacts/controller/repair_execution_receipts/latest.json',
      ],
      no_regression_evidence_refs: [
        'mas-no-forbidden-write-proof:medautoscience:dm002',
      ],
      owner_chain_refs: [
        'contracts/production_acceptance/mas-production-acceptance.json#/paper_line_guarded_apply_evidence',
      ],
    },
  );
  assert.deepEqual(
    mas.owner_payload_item_summary.work_items[1].typed_blocker_path_payload,
    {
      typed_blocker_refs: [
        'mas_owner_apply_receipt_missing:003-dm-cvd-ehr-risk-calibration',
      ],
    },
  );
  assert.equal(mas.owner_payload_item_summary.work_items[0].payload_body_allowed, false);
  assert.equal(mas.owner_payload_item_summary.work_items[0].domain_readiness_claimed, false);
  assert.equal(mas.owner_payload_item_summary.work_items[0].production_readiness_claimed, false);
  assert.equal(mas.stage_expected_receipt_payload_summary.stage_count, 1);
  assert.equal(
    mas.stage_expected_receipt_payload_summary.stages[0].stage_id,
    'finalize_and_publication_handoff',
  );
  assert.deepEqual(
    mas.stage_expected_receipt_payload_summary.stages[0].success_refs_path_payload
      .domain_receipt_refs,
    ['/studies/002/artifacts/controller/repair_execution_receipts/latest.json'],
  );
  assert.deepEqual(
    mas.stage_expected_receipt_payload_summary.stages[0].typed_blocker_path_payload,
    {
      typed_blocker_refs: [
        'mas_owner_apply_receipt_missing:003-dm-cvd-ehr-risk-calibration',
      ],
    },
  );
  assert.equal(
    mas.stage_expected_receipt_payload_summary.stages[0].success_refs_visible_is_completion,
    false,
  );
  assert.equal(
    mas.stage_expected_receipt_payload_summary.stages[0].authority_boundary
      .can_claim_domain_ready,
    false,
  );
  const stageRecordRoute = full.operator_action_routing_refs.refs.find(
    (route: {
      action_kind: string;
      target_identity?: { stage_id?: string; summary_kind?: string };
      payload_workorder?: {
        accepted_payload_paths?: {
          success_refs_path?: { closes_expected_receipt_refs?: boolean };
        };
      };
    }) =>
      route.action_kind === 'domain_owner_payload_summary_receipt_record'
      && route.target_identity?.summary_kind === 'stage_expected_receipt'
      && route.target_identity?.stage_id === 'finalize_and_publication_handoff',
  );
  assert.ok(stageRecordRoute);
  assert.equal(stageRecordRoute.payload_body_allowed, false);
  assert.equal(stageRecordRoute.can_create_owner_receipt, false);
  assert.equal(stageRecordRoute.can_close_domain_ready, false);
  assert.equal(
    stageRecordRoute.payload_workorder?.accepted_payload_paths?.success_refs_path
      ?.closes_expected_receipt_refs,
    false,
  );

  const readiness = runCli(['framework', 'readiness', '--family-defaults'], env)
    .framework_readiness;
  assert.equal(
    readiness.attention_first_payload.domain_owner_payload_summary_attention
      .owner_payload_domains[0].domain_id,
    'medautoscience',
  );
  assert.equal(
    readiness.attention_first_payload.domain_owner_payload_summary_attention
      .owner_payload_work_item_count,
    2,
  );
  assert.equal(
    readiness.attention_first_payload.domain_owner_payload_summary_attention
      .stage_expected_receipt_payload_stage_count,
    1,
  );
});

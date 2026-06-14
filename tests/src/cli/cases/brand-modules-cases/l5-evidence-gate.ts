import { assert, createContractsFixtureRoot, fs, loadFrameworkContracts, os, path, repoRoot, runCli, runCliFailure, test } from '../../helpers.ts';
import { expectedModuleIds, type L5Module } from './shared.ts';

test('brand module L5 evidence gate is executable but does not claim production maturity', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-brand-l5-status-state-'));
  const env = { OPL_STATE_DIR: stateDir };

  try {
    const contracts = loadFrameworkContracts(repoRoot);
    const status = runCli(['brand-modules', 'l5-status'], env).brand_module_l5_status;

    assert.equal(status.surface_kind, 'opl_brand_module_l5_status');
    assert.equal(status.baseline_level, 'L4_structural_baseline');
    assert.equal(status.target_level, 'L5_production_operating_maturity');
    assert.equal(status.module_count, 10);
    assert.equal(status.l5_complete_module_count, 0);
    assert.deepEqual(status.l5_complete_module_ids, []);
    assert.deepEqual(status.evidence_required_module_ids, expectedModuleIds);
    assert.equal(status.l5_claim_policy.contract_validation_counts_as_l5, false);
    assert.equal(status.evidence_classes.length, 13);
    assert.equal(
      status.evidence_classes.some((entry: { class_id: string }) =>
        entry.class_id === 'capability_fail_open_boundary'
      ),
      true,
    );
    assert.equal(
      status.evidence_classes.some((entry: { class_id: string }) =>
        entry.class_id === 'cross_agent_foundry_agent_os_adoption'
      ),
      true,
    );
    assert.equal(status.modules.every((entry: { l5_can_be_claimed: boolean }) => entry.l5_can_be_claimed === false), true);
    assert.equal(status.owner_route_work_order_policy.surface_kind, 'opl_brand_module_l5_owner_route_work_order_policy');
    assert.equal(status.owner_route_work_order_policy.work_orders_close_l5, false);
    assert.equal(status.owner_route_work_order_policy.work_orders_can_create_owner_receipt, false);
    assert.equal(status.owner_route_work_order_policy.work_orders_can_create_typed_blocker, false);
    assert.equal(
      status.owner_route_work_order_policy.accepted_route_ref_shapes.includes('owner_acceptance_ref'),
      true,
    );
    assert.equal(
      status.owner_route_work_order_policy.accepted_route_ref_shapes.includes('typed_blocker_ref'),
      true,
    );
    for (const entry of status.modules as L5Module[]) {
      assert.equal(entry.evidence_required, true);
      assert.equal(entry.l5_can_be_claimed, false);
      assert.equal(entry.l5_completion_status, 'evidence_required');
      assert.equal(entry.open_requirement_count, 12);
      assert.equal(entry.blocked_requirement_count, 1);
      assert.equal(entry.owner_followthrough_summary.owner_followthrough_required, true);
      assert.equal(entry.owner_followthrough_summary.owner_followthrough_required_count, 9);
      assert.equal(entry.owner_followthrough_summary.missing_owner_evidence_requirement_count, 0);
      assert.equal(entry.owner_followthrough_summary.typed_blocker_followthrough_requirement_count, 9);
      assert.equal(entry.owner_followthrough_summary.observed_refs_not_l5_claim_requirement_count, 4);
      assert.equal(entry.owner_followthrough_summary.observed_ref_requirement_count, 13);
      assert.equal(
        entry.owner_followthrough_summary.next_followthrough_action,
        'resolve_typed_blocker_or_record_owner_acceptance_ref',
      );
      assert.equal(
        entry.owner_followthrough_summary.next_followthrough_work_order_id,
        `w7-brand-module-l5-${entry.module_id}-live_user_path`,
      );
      assert.equal(
        entry.owner_followthrough_summary.owner_followthrough_work_order_ids.includes(
          `w7-brand-module-l5-${entry.module_id}-live_user_path`,
        ),
        true,
      );
      assert.equal(
        entry.owner_followthrough_summary.observed_refs_not_l5_claim_work_order_ids.includes(
          `w7-brand-module-l5-${entry.module_id}-current_owner_delta_default_read`,
        ),
        true,
      );
      assert.equal(entry.owner_followthrough_summary.false_completion_guard.observed_refs_close_l5, false);
      assert.equal(entry.owner_followthrough_summary.false_completion_guard.typed_blocker_refs_close_l5, false);
      assert.equal(
        entry.owner_followthrough_summary.false_completion_guard.owner_followthrough_closes_l5_without_owner_acceptance,
        false,
      );
      assert.equal(entry.owner_followthrough_summary.false_completion_guard.ready_claim_authorized, false);
      assert.equal(entry.owner_evidence_routes.length, status.evidence_classes.length);
      assert.equal(entry.next_action_summary.module_id, entry.module_id);
      assert.equal(entry.next_action_summary.status, 'evidence_required');
      assert.equal(entry.next_action_summary.l5_can_be_claimed, false);
      assert.equal(
        entry.next_action_summary.next_owner_action,
        'resolve_typed_blocker_or_record_owner_acceptance_ref',
      );
      assert.equal(
        entry.next_action_summary.next_work_order_id,
        `w7-brand-module-l5-${entry.module_id}-live_user_path`,
      );
      assert.equal(entry.next_action_summary.next_evidence_class_id, 'live_user_path');
      assert.equal(
        typeof entry.next_action_summary.next_owner_repo === 'string'
          && entry.next_action_summary.next_owner_repo.length > 0,
        true,
      );
      assert.equal(
        entry.next_action_summary.next_accepted_ref_shapes?.includes('typed_blocker_ref'),
        true,
      );
      assert.equal(
        entry.next_action_summary.next_forbidden_opl_claims?.includes('brand_module_l5_complete'),
        true,
      );
      assert.equal(
        entry.next_action_summary.next_stop_loss?.includes(
          'if observed refs exist but l5_can_be_claimed is false, do not add more OPL projection evidence for this requirement',
        ),
        true,
      );
      assert.equal(entry.next_action_summary.missing_owner_evidence_class_count, 0);
      assert.equal(entry.next_action_summary.observed_refs_not_l5_claim_class_count, 4);
      assert.equal(entry.next_action_summary.typed_blocker_recorded_class_count, 9);
      assert.equal(entry.next_action_summary.verified_receipt_class_count, 0);
      assert.deepEqual(
        entry.next_action_summary.missing_evidence_groups.missing_owner_evidence_class_ids,
        [],
      );
      assert.deepEqual(
        entry.next_action_summary.missing_evidence_groups.observed_refs_not_l5_claim_class_ids,
        [
          'no_second_truth_regression',
          'pack_compile_parity',
          'current_owner_delta_default_read',
          'domain_authority_false_boundary',
        ],
      );
      assert.deepEqual(
        entry.next_action_summary.missing_evidence_groups.typed_blocker_recorded_class_ids,
        [
          'live_user_path',
          'ordinary_app_experience',
          'cross_agent_scaleout',
          'long_soak_recovery',
          'release_install_evidence',
          'operator_repair_loop',
          'owner_acceptance',
          'capability_fail_open_boundary',
          'cross_agent_foundry_agent_os_adoption',
        ],
      );
      assert.deepEqual(
        entry.next_action_summary.missing_evidence_groups.verified_receipt_class_ids,
        [],
      );
      assert.equal(entry.next_action_summary.false_completion_guard.refs_only_inputs_close_l5, false);
      assert.equal(entry.next_action_summary.false_completion_guard.work_order_projection_closes_l5, false);
      assert.equal(entry.next_action_summary.false_completion_guard.verified_ledger_closes_l5, false);
      assert.equal(entry.next_action_summary.false_completion_guard.ready_claim_authorized, false);
      assert.equal(
        entry.next_action_summary.next_command_examples?.record_evidence.payload_template.evidence_refs[0],
        `owner-evidence-ref:opl-brand-l5/${entry.module_id}/live_user_path/<owner-evidence-id>`,
      );
      assert.equal(
        entry.next_action_summary.next_command_examples?.record_typed_blocker_ref.creates_typed_blocker,
        false,
      );
      assert.equal(
        entry.next_action_summary.next_command_examples?.list_requirement_refs.command,
        `opl runtime brand-module-l5-evidence list --module ${entry.module_id} --evidence-class live_user_path --json`,
      );

      const contractModule = contracts.brandModuleL5OperatingEvidence.modules.find((candidate) =>
        candidate.module_id === entry.module_id
      );
      for (const route of entry.owner_evidence_routes) {
        const contractRequirement = contractModule?.evidence_requirements.find((candidate) =>
          candidate.class_id === route.class_id
        );
        assert.equal(route.module_id, entry.module_id);
        assert.equal(route.class_id.length > 0, true);
        assert.equal(route.owner.length > 0, true);
        assert.equal(route.owner_route_ref, contractRequirement?.owner_route_ref);
        assert.equal(route.owner_repo_ref, contractRequirement?.owner_repo_ref);
        assert.equal(route.owner_repo_ref, route.owner_repo);
        assert.equal(route.owner_repo.length > 0, true);
        assert.equal(route.work_order_id, `w7-brand-module-l5-${entry.module_id}-${route.class_id}`);
        assert.equal(route.owner_acceptance_required, true);
        assert.equal(route.ready_claim_authorized, false);
        assert.equal(route.closing_ref_source, 'brand_module_owner_evidence_ref_or_owner_acceptance_ref_for_requirement');
        assert.equal(route.typed_blocker_source, 'brand_module_owner_l5_typed_blocker_ref_for_requirement');
        assert.equal(route.record_evidence_command, 'opl runtime brand-module-l5-evidence record --payload <json>');
        assert.equal(route.typed_blocker_payload_template.module_id, entry.module_id);
        assert.equal(route.typed_blocker_payload_template.evidence_class_id, route.class_id);
        assert.equal(
          route.typed_blocker_payload_template.typed_blocker_refs[0],
          `typed-blocker:opl-brand-l5/${entry.module_id}/${route.class_id}/owner-evidence-pending`,
        );
        assert.equal(
          route.typed_blocker_payload_template.receipt_ref,
          `opl://brand-module-l5-evidence/${entry.module_id}/${route.class_id}/typed-blocker-pending`,
        );
        assert.equal(route.evidence_payload_template.module_id, entry.module_id);
        assert.equal(route.evidence_payload_template.evidence_class_id, route.class_id);
        assert.equal(
          route.evidence_payload_template.evidence_refs[0],
          `owner-evidence-ref:opl-brand-l5/${entry.module_id}/${route.class_id}/<owner-evidence-id>`,
        );
        assert.equal(
          route.verification_command,
          `opl runtime brand-module-l5-evidence verify --receipt-ref opl://brand-module-l5-evidence/${entry.module_id}/${route.class_id}/typed-blocker-pending`,
        );
        assert.equal(route.owner_route_command_examples.record_evidence.command, 'opl runtime brand-module-l5-evidence record --payload <json> --json');
        assert.equal(route.owner_route_command_examples.record_evidence.closes_l5, false);
        assert.equal(route.owner_route_command_examples.record_typed_blocker_ref.closes_l5, false);
        assert.equal(route.owner_route_command_examples.record_typed_blocker_ref.creates_typed_blocker, false);
        assert.equal(route.owner_route_command_examples.verify_receipt.closes_l5, false);
        assert.equal(route.owner_route_command_examples.list_requirement_refs.closes_l5, false);
        assert.equal(
          route.owner_route_command_examples.list_requirement_refs.command,
          `opl runtime brand-module-l5-evidence list --module ${entry.module_id} --evidence-class ${route.class_id} --json`,
        );
        assert.equal(Array.isArray(route.existing_evidence_refs), true);
        assert.equal(Array.isArray(route.existing_blocker_refs), true);
        assert.equal(route.observed_receipt_count, 0);
        assert.equal(route.verified_receipt_count, 0);
        assert.equal(route.accepted_ref_shapes.includes('typed_blocker_ref'), true);
        assert.equal(route.accepted_ref_shapes.some((shape) => shape !== 'typed_blocker_ref'), true);
        assert.equal(route.non_closing_inputs.includes('contract_validation'), true);
        assert.equal(route.non_closing_inputs.includes('docs_foldback'), true);
        assert.equal(route.non_closing_inputs.includes('conformance_pass'), true);
        assert.equal(route.non_closing_inputs.includes('provider_completion'), true);
        assert.equal(route.non_closing_inputs.includes('app_projection'), true);
        assert.equal(route.non_closing_inputs.includes('verified_refs_only_ledger'), true);
        assert.equal(route.forbidden_opl_claims.includes('brand_module_l5_complete'), true);
        assert.equal(route.forbidden_opl_claims.includes('production_ready'), true);
        assert.equal(route.forbidden_opl_claims.includes('typed_blocker_created_by_opl'), true);
        assert.equal(
          route.stop_loss.includes(
            'if only contract validation, docs foldback, conformance pass, App projection, provider completion, or verified refs-only ledger exists, keep ready_claim_authorized=false',
          ),
          true,
        );
        assert.equal(route.authority_boundary.route_is_refs_only, true);
        assert.equal(route.authority_boundary.route_can_claim_l5, false);
        assert.equal(route.authority_boundary.route_can_claim_production_ready, false);
        assert.equal(route.authority_boundary.route_can_create_owner_receipt, false);
        assert.equal(route.authority_boundary.route_can_create_typed_blocker, false);
      }

      for (const classId of [
        'current_owner_delta_default_read',
        'domain_authority_false_boundary',
        'no_second_truth_regression',
        'pack_compile_parity',
      ]) {
        const route = entry.owner_evidence_routes.find((candidate) => candidate.class_id === classId);
        assert.equal(route?.owner_route_status, 'owner_evidence_observed_not_l5_claimed');
        assert.equal(route?.blocker_state, 'owner_route_refs_observed_not_l5_claim');
        assert.equal(route?.next_owner_action, 'continue_collecting_l5_owner_evidence_or_owner_acceptance_ref');
        assert.equal(route?.owner_evidence_closure_state, 'owner_evidence_recorded_not_l5_claim');
        assert.equal(route?.existing_evidence_refs.length, 2);
        assert.equal(route?.existing_blocker_refs.length, 0);
        assert.deepEqual(route?.observed_evidence_refs, route?.existing_evidence_refs);
        assert.equal(route?.observed_ref_count, 2);
        assert.equal(route?.l5_claim_status, 'owner_evidence_refs_observed_not_l5_claimed');
      }

      const ownerAcceptance = entry.owner_evidence_routes.find((candidate) =>
        candidate.class_id === 'owner_acceptance'
      );
      assert.equal(ownerAcceptance?.owner_route_status, 'owner_typed_blocker_recorded');
      assert.equal(ownerAcceptance?.blocker_state, 'typed_blocker_recorded');
      assert.equal(ownerAcceptance?.next_owner_action, 'resolve_typed_blocker_or_record_owner_acceptance_ref');
      assert.equal(ownerAcceptance?.owner_evidence_closure_state, 'owner_typed_blocker_recorded');
      assert.equal(ownerAcceptance?.existing_evidence_refs.length, 0);
      assert.deepEqual(ownerAcceptance?.existing_blocker_refs, [
        `typed-blocker:opl-brand-l5/${entry.module_id}/owner_acceptance/brand-owner-acceptance-pending-20260612`,
      ]);
      assert.deepEqual(ownerAcceptance?.observed_evidence_refs, ownerAcceptance?.existing_blocker_refs);
      assert.deepEqual(ownerAcceptance?.observed_ref_shapes, ['typed_blocker_ref']);
      assert.equal(ownerAcceptance?.observed_ref_count, 1);
      assert.equal(ownerAcceptance?.observed_typed_blocker_ref_count, 1);
      assert.equal(ownerAcceptance?.l5_claim_status, 'owner_typed_blocker_recorded_not_l5_claimed');

      for (const classId of [
        'live_user_path',
        'ordinary_app_experience',
        'cross_agent_scaleout',
        'long_soak_recovery',
        'release_install_evidence',
        'operator_repair_loop',
        'capability_fail_open_boundary',
        'cross_agent_foundry_agent_os_adoption',
      ]) {
        const route = entry.owner_evidence_routes.find((candidate) => candidate.class_id === classId);
        assert.equal(route?.owner_route_status, 'owner_typed_blocker_recorded');
        assert.equal(route?.blocker_state, 'typed_blocker_recorded');
        assert.equal(route?.next_owner_action, 'resolve_typed_blocker_or_record_owner_acceptance_ref');
        assert.equal(route?.owner_evidence_closure_state, 'owner_typed_blocker_recorded');
        assert.equal(route?.existing_evidence_refs.length, 0);
        assert.deepEqual(route?.existing_blocker_refs, [
          `typed-blocker:opl-brand-l5/${entry.module_id}/${classId}/owner-evidence-needed-20260612`,
        ]);
        assert.deepEqual(route?.observed_evidence_refs, route?.existing_blocker_refs);
        assert.deepEqual(route?.observed_ref_shapes, ['typed_blocker_ref']);
        assert.equal(route?.observed_ref_count, 1);
        assert.equal(route?.observed_typed_blocker_ref_count, 1);
        assert.equal(route?.l5_claim_status, 'owner_typed_blocker_recorded_not_l5_claimed');
      }
    }
    assert.equal(status.owner_route_work_order_policy.work_orders_close_l5, false);
    assert.equal(status.owner_route_work_order_policy.work_orders_can_claim_production_ready, false);
    assert.equal(status.not_claims.includes('production_ready'), true);
    assert.equal(status.authority_boundary.can_claim_production_ready, false);
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});

test('brand module L5 can be claimed only with satisfied owner acceptance success refs', () => {
  const { fixtureRoot, fixtureContractsRoot } = createContractsFixtureRoot((contractsRoot) => {
    const contractPath = path.join(contractsRoot, 'brand-module-l5-operating-evidence.json');
    const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8')) as {
      modules: Array<{
        module_id: string;
        l5_completion_status: string;
        l5_can_be_claimed: boolean;
        evidence_requirements: Array<{
          class_id: string;
          current_state: string;
          evidence_refs?: string[];
          owner_acceptance_refs?: string[];
          blocker_refs?: string[];
        }>;
      }>;
    };
    const charter = contract.modules.find((entry) => entry.module_id === 'charter');
    assert.ok(charter);
    charter.l5_completion_status = 'complete';
    charter.l5_can_be_claimed = true;
    for (const requirement of charter.evidence_requirements) {
      requirement.current_state = 'satisfied';
      delete requirement.blocker_refs;
      requirement.evidence_refs = [
        `owner-evidence-ref:opl-brand-l5/charter/${requirement.class_id}/live-closeout-20260614`,
      ];
      requirement.owner_acceptance_refs = [
        `owner-acceptance-ref:opl-brand-l5/charter/${requirement.class_id}/brand-owner-accepted-20260614`,
      ];
    }
    fs.writeFileSync(contractPath, `${JSON.stringify(contract, null, 2)}\n`, 'utf8');
  });
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-brand-l5-owner-acceptance-state-'));
  const env = { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateDir };

  try {
    const status = runCli(['brand-modules', 'l5-status'], env).brand_module_l5_status;
    assert.equal(status.l5_complete_module_count, 1);
    assert.deepEqual(status.l5_complete_module_ids, ['charter']);
    assert.equal(status.evidence_required_module_count, 9);
    assert.deepEqual(status.evidence_required_module_ids, expectedModuleIds.filter((moduleId) => moduleId !== 'charter'));

    const charter = status.modules.find((entry: { module_id: string }) => entry.module_id === 'charter');
    assert.equal(charter.l5_completion_status, 'complete');
    assert.equal(charter.l5_can_be_claimed, true);
    assert.equal(charter.evidence_required, false);
    assert.equal(charter.open_requirement_count, 0);
    assert.equal(charter.blocked_requirement_count, 0);
    assert.equal(charter.owner_followthrough_summary.owner_followthrough_required, false);
    assert.equal(charter.owner_followthrough_summary.owner_followthrough_required_count, 0);
    assert.equal(charter.owner_followthrough_summary.missing_owner_evidence_requirement_count, 0);
    assert.equal(charter.owner_followthrough_summary.typed_blocker_followthrough_requirement_count, 0);
    assert.equal(charter.owner_followthrough_summary.observed_refs_not_l5_claim_requirement_count, 13);
    assert.equal(charter.owner_followthrough_summary.observed_ref_requirement_count, 13);
    assert.equal(charter.owner_followthrough_summary.next_followthrough_action, null);
    assert.equal(charter.owner_followthrough_summary.next_followthrough_work_order_id, null);
    assert.deepEqual(charter.owner_followthrough_summary.owner_followthrough_work_order_ids, []);
    assert.equal(charter.owner_followthrough_summary.false_completion_guard.observed_refs_close_l5, false);
    assert.equal(charter.owner_followthrough_summary.false_completion_guard.ready_claim_authorized, false);
    assert.equal(charter.next_action_summary.status, 'complete');
    assert.equal(charter.next_action_summary.l5_can_be_claimed, true);
    assert.equal(charter.next_action_summary.false_completion_guard.ready_claim_authorized, false);

    const livePath = charter.owner_evidence_routes.find((route: { class_id: string }) =>
      route.class_id === 'live_user_path'
    );
    assert.equal(livePath.owner_route_status, 'owner_evidence_recorded_not_l5_claimed');
    assert.equal(livePath.blocker_state, 'refs_observed_not_l5_claim');
    assert.equal(livePath.existing_owner_acceptance_refs.length, 1);
    assert.equal(
      livePath.existing_owner_acceptance_refs[0],
      'owner-acceptance-ref:opl-brand-l5/charter/live_user_path/brand-owner-accepted-20260614',
    );
    assert.equal(
      livePath.observed_evidence_refs.includes(livePath.existing_owner_acceptance_refs[0]),
      true,
    );
    assert.equal(livePath.observed_ref_shapes.includes('owner_acceptance_ref'), true);
    assert.equal(livePath.ready_claim_authorized, false);

    const atlas = status.modules.find((entry: { module_id: string }) => entry.module_id === 'atlas');
    assert.equal(atlas.l5_can_be_claimed, false);
    assert.equal(atlas.evidence_required, true);
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('brand module L5 requirement rejects success refs mixed with blocker refs', () => {
  const { fixtureRoot, fixtureContractsRoot } = createContractsFixtureRoot((contractsRoot) => {
    const contractPath = path.join(contractsRoot, 'brand-module-l5-operating-evidence.json');
    const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8')) as {
      modules: Array<{
        module_id: string;
        evidence_requirements: Array<{
          class_id: string;
          evidence_refs?: string[];
          blocker_refs?: string[];
        }>;
      }>;
    };
    const charter = contract.modules.find((entry) => entry.module_id === 'charter');
    assert.ok(charter);
    const livePath = charter.evidence_requirements.find((entry) => entry.class_id === 'live_user_path');
    assert.ok(livePath);
    livePath.evidence_refs = ['owner-evidence-ref:opl-brand-l5/charter/live_user_path/mixed-success'];
    assert.ok(livePath.blocker_refs);
    fs.writeFileSync(contractPath, `${JSON.stringify(contract, null, 2)}\n`, 'utf8');
  });
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-brand-l5-mixed-success-blocker-state-'));
  const env = { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateDir };

  try {
    const failure = runCliFailure(['brand-modules', 'l5-status'], env);
    assert.equal(failure.payload.error.code, 'contract_shape_invalid');
    assert.match(
      failure.payload.error.message,
      /success refs cannot be mixed with blocker_refs/,
    );
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('runtime owner acceptance ledger refs remain non-closing without contract owner acceptance', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-brand-l5-ledger-owner-acceptance-state-'));
  const env = { OPL_STATE_DIR: stateDir };

  try {
    const record = runCli([
      'runtime',
      'brand-module-l5-evidence',
      'record',
      '--payload',
      JSON.stringify({
        module_id: 'runway',
        evidence_class_id: 'long_soak_recovery',
        owner_acceptance_refs: ['owner-acceptance-ref:opl-brand-l5/runway/long_soak_recovery/operator-accepted'],
      }),
      '--json',
    ], env).brand_module_l5_evidence_ledger_record;
    runCli([
      'runtime',
      'brand-module-l5-evidence',
      'verify',
      '--receipt-ref',
      record.receipt.receipt_ref,
      '--json',
    ], env);

    const status = runCli(['brand-modules', 'l5-status', '--module', 'runway'], env).brand_module_l5_status;
    const runway = status.modules[0];
    const route = runway.owner_evidence_routes.find((candidate: { class_id: string }) =>
      candidate.class_id === 'long_soak_recovery'
    );
    assert.equal(runway.l5_can_be_claimed, false);
    assert.equal(status.evidence_required_module_count, 10);
    assert.equal(runway.owner_followthrough_summary.owner_followthrough_required, true);
    assert.equal(runway.owner_followthrough_summary.owner_followthrough_required_count, 8);
    assert.equal(runway.owner_followthrough_summary.missing_owner_evidence_requirement_count, 0);
    assert.equal(runway.owner_followthrough_summary.typed_blocker_followthrough_requirement_count, 8);
    assert.equal(runway.owner_followthrough_summary.observed_refs_not_l5_claim_requirement_count, 5);
    assert.equal(runway.owner_followthrough_summary.observed_ref_requirement_count, 13);
    assert.equal(
      runway.owner_followthrough_summary.typed_blocker_followthrough_work_order_ids.includes(
        'w7-brand-module-l5-runway-long_soak_recovery',
      ),
      false,
    );
    assert.equal(
      runway.owner_followthrough_summary.observed_refs_not_l5_claim_work_order_ids.includes(
        'w7-brand-module-l5-runway-long_soak_recovery',
      ),
      true,
    );
    assert.equal(runway.owner_followthrough_summary.false_completion_guard.observed_refs_close_l5, false);
    assert.equal(route.verified_receipt_count, 1);
    assert.equal(route.observed_ref_shapes.includes('owner_acceptance_ref'), true);
    assert.equal(route.l5_claim_status, 'owner_evidence_refs_observed_not_l5_claimed');
    assert.equal(route.ready_claim_authorized, false);
    assert.equal(route.owner_evidence_closure_state, 'owner_evidence_recorded_not_l5_claim');
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});

test('runtime L5 evidence ledger projects contract-specific ref shapes without closing L5', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-brand-l5-ledger-ref-shapes-state-'));
  const env = { OPL_STATE_DIR: stateDir };

  try {
    const record = runCli([
      'runtime',
      'brand-module-l5-evidence',
      'record',
      '--payload',
      JSON.stringify({
        module_id: 'foundry-lab',
        evidence_class_id: 'cross_agent_scaleout',
        evidence_refs: [
          'scaleout_receipt_ref://opl-meta-agent/real-target-agent-scaleout/2026-05-20',
          'per_agent_receipt_ref://opl-meta-agent/med-autoscience/agent-evidence/2026-05-20',
          'per_agent_receipt_ref://opl-meta-agent/med-autogrant/agent-evidence/2026-05-20',
        ],
      }),
      '--json',
    ], env).brand_module_l5_evidence_ledger_record;
    runCli([
      'runtime',
      'brand-module-l5-evidence',
      'verify',
      '--receipt-ref',
      record.receipt.receipt_ref,
      '--json',
    ], env);

    const status = runCli(['brand-modules', 'l5-status', '--module', 'foundry-lab'], env).brand_module_l5_status;
    const foundryLab = status.modules[0];
    const route = foundryLab.owner_evidence_routes.find((candidate: { class_id: string }) =>
      candidate.class_id === 'cross_agent_scaleout'
    );

    assert.equal(foundryLab.l5_can_be_claimed, false);
    assert.equal(route.verified_receipt_count, 1);
    assert.equal(route.observed_ref_shapes.includes('ledger_receipt_ref'), true);
    assert.equal(route.observed_ref_shapes.includes('scaleout_receipt_ref'), true);
    assert.equal(route.observed_ref_shapes.includes('per_agent_receipt_ref'), true);
    assert.equal(route.observed_ref_shapes.includes('evidence_ref'), false);
    assert.equal(route.owner_evidence_closure_state, 'owner_evidence_recorded_not_l5_claim');
    assert.equal(route.ready_claim_authorized, false);
    assert.equal(route.l5_claim_status, 'owner_evidence_refs_observed_not_l5_claimed');
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});

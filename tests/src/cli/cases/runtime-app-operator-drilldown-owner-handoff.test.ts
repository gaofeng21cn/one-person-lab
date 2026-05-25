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
  test,
} from '../helpers.ts';
import {
  assertOwnerPayloadWorkorderProjection,
} from './owner-payload-workorder-assertions.ts';

type JsonRecord = Record<string, unknown>;

function buildManyStageManifest(stageCount: number) {
  const manifest = structuredClone(loadFamilyManifestFixtures().medautoscience) as JsonRecord;
  manifest.family_stage_control_plane = {
    surface_kind: 'family_stage_control_plane',
    version: 'family-stage-control-plane.v1',
    plane_id: 'owner_handoff_stage_control_plane',
    target_domain_id: 'medautoscience',
    owner: 'med-autoscience',
    authority_boundary: { opl_role: 'projection_consumer_only' },
    stages: Array.from({ length: stageCount }, (_entry, index) => ({
      stage_id: `write_${index}`,
      stage_kind: 'creation',
      title: `Write ${index}`,
      summary: 'Write from explicit refs.',
      goal: 'Produce refs under MAS authority.',
      owner: 'med-autoscience',
      domain_stage_refs: [`write_${index}`],
      inputs: [],
      knowledge_refs: [],
      skills: [],
      prompt_refs: [],
      allowed_action_refs: [],
      outputs: [],
      evaluation: [],
      handoff: null,
      source_refs: [],
      freshness: null,
      action_parity: null,
      stage_contract: {
        requires: ['sources_ready'],
        ensures: ['draft_ready'],
        boundary_assumptions: ['domain_truth_remains_domain_owned'],
        properties: [],
        runtime_assumptions: [],
        monitor_refs: [{ ref_kind: 'metric_ref', ref: `metric:write-${index}`, role: 'monitor' }],
        source_scope_refs: [{ ref_kind: 'source_ref', ref: `source:dataset-${index}`, role: 'source_scope' }],
        cohort_query_refs: [{ ref_kind: 'query_ref', ref: `cohort:write-${index}`, role: 'cohort_query' }],
        trigger_refs: [{ ref_kind: 'queue_ref', ref: `queue:write-${index}`, role: 'trigger' }],
        metric_refs: [{ ref_kind: 'metric_ref', ref: `metric:write-${index}`, role: 'metric' }],
        dashboard_metric_refs: [],
        artifact_scope_refs: [],
        workspace_scope_refs: [],
      },
      trust_boundary: {
        lane: 'domain_agent',
        static_check_eligible: true,
        effect_boundary: false,
        records_runtime_events: false,
      },
      authority_boundary: {
        opl_role: 'projection_consumer_only',
        expected_receipt_refs: [`receipt:write-closeout-${index}`],
        can_write_domain_truth: false,
      },
    })),
    notes: [],
  };
  return manifest;
}

test('runtime App drilldown projects bounded owner handoff packet without authority claims', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-owner-handoff-state-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(buildManyStageManifest(8)),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    for (let index = 0; index < 8; index += 1) {
      const attempt = runCli([
        'family-runtime',
        'attempt',
        'create',
        '--domain',
        'medautoscience',
        '--stage',
        `write_${index}`,
        '--provider',
        'local_sqlite',
        '--workspace-locator',
        JSON.stringify({
          workspace_root: `/tmp/mas-owner-handoff-${index}`,
          artifact_root: `/tmp/mas-owner-handoff-${index}/artifacts`,
          source_refs: [`source:dataset-${index}`],
        }),
        '--task',
        `task-owner-handoff-${index}`,
        '--checkpoint-ref',
        `checkpoint:write-start-${index}`,
      ], {
        OPL_STATE_DIR: stateRoot,
        OPL_CONTRACTS_DIR: fixtureContractsRoot,
      });
      const attemptId = attempt.family_runtime_stage_attempt.attempt.stage_attempt_id;
      runCli([
        'family-runtime',
        'attempt',
        'fixture-run',
        attemptId,
        '--closeout-packet',
        JSON.stringify({
          surface_kind: 'stage_attempt_closeout_packet',
          closeout_refs: [`receipt:write-closeout-${index}`],
          consumed_refs: [`artifact:table-${index}`],
          consumed_memory_refs: [`memory:route-policy-${index}`],
          writeback_receipt_refs: [`memory-writeback:receipt-${index}`],
          next_owner: 'med-autoscience',
          domain_ready_verdict: 'domain_gate_pending',
          route_impact: {
            decision: 'bounded_repair',
            owner_receipt_refs: [`owner-receipt:summary-${index}`],
            typed_blocker_refs: [],
            quality_refs: [`publication_eval/${index}.json`],
            readiness_refs: [`controller_decisions/${index}.json`],
            repair_command: `medautosci domain-handler dispatch --task task-${index}.json --format json`,
            package_refs: [`package:submission-${index}`],
            export_refs: [`export:current-package-${index}`],
          },
        }),
      ], {
        OPL_STATE_DIR: stateRoot,
        OPL_CONTRACTS_DIR: fixtureContractsRoot,
      });
    }

    const summaryOutput = runCli(['runtime', 'app-operator-drilldown'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const summaryPacket =
      summaryOutput.app_operator_drilldown.attention_first_payload
        .evidence_after_contract.owner_handoff_packet;
    assert.equal(summaryPacket.surface_kind, 'opl_app_operator_owner_handoff_packet');
    assert.equal(
      summaryPacket.projection_policy,
      'bounded_owner_handoff_refs_only_no_domain_action_execution_or_receipt_creation',
    );
    assert.equal(summaryPacket.status, 'handoff_required');
    assert.equal(summaryPacket.owners.length <= 5, true);
    assert.equal(
      summaryPacket.owner_count,
      summaryPacket.owners.length + summaryPacket.owner_omitted_count,
    );
    assert.equal(summaryPacket.authority_boundary.can_execute_domain_action, false);
    assert.equal(summaryPacket.authority_boundary.can_write_domain_truth, false);
    assert.equal(summaryPacket.authority_boundary.can_create_owner_receipt, false);
    assert.equal(summaryPacket.authority_boundary.can_create_typed_blocker, false);
    assert.equal(summaryPacket.authority_boundary.can_close_owner_chain, false);
    assert.equal(summaryPacket.authority_boundary.can_close_domain_ready, false);
    assert.equal(summaryPacket.authority_boundary.can_claim_production_ready, false);

    const ownerHandoff = summaryPacket.owners[0];
    assert.equal(typeof ownerHandoff.owner, 'string');
    assert.equal(ownerHandoff.status, 'handoff_required');
    assert.equal(ownerHandoff.attention_count > 0, true);
    assert.equal(
      ownerHandoff.owner_payload_group_count + ownerHandoff.domain_dispatch_group_count > 0,
      true,
    );
    assert.equal(ownerHandoff.payload_owner, 'domain_repository_or_app_live_operator');
    assert.equal(ownerHandoff.required_refs_any_of.length > 0, true);
    assertOwnerPayloadWorkorderProjection(ownerHandoff);
    if (ownerHandoff.domain_dispatch_group_count > 0) {
      assert.equal(
        ownerHandoff.required_return_shapes.includes('domain_owner_receipt_ref'),
        true,
      );
      assert.equal(
        ownerHandoff.payload_path_policy,
        'operator_must_choose_success_refs_path_or_domain_owned_typed_blocker_path_empty_template_blocks',
      );
      assert.equal(
        ownerHandoff.accepted_payload_paths.success_refs_path
          .typed_blocker_refs_must_be_absent,
        true,
      );
      assert.equal(
        ownerHandoff.accepted_payload_paths.typed_blocker_path.success_claimed,
        false,
      );
      assert.equal(
        ownerHandoff.payload_preflight_policy,
        'domain_dispatch_evidence_payload_must_pass_success_refs_or_typed_blocker_path_preflight',
      );
      assert.equal(
        ownerHandoff.payload_preflight_blocked_error_kind,
        'domain_dispatch_evidence_payload_preflight_blocked',
      );
    }
    assert.equal(ownerHandoff.full_detail_sections.length > 0, true);
    assert.equal(ownerHandoff.can_execute_domain_action, false);
    assert.equal(ownerHandoff.can_write_domain_truth, false);
    assert.equal(ownerHandoff.can_create_owner_receipt, false);
    assert.equal(ownerHandoff.can_close_owner_chain, false);
    assert.equal(ownerHandoff.can_close_domain_ready, false);
    assert.equal(ownerHandoff.can_claim_production_ready, false);
    assert.equal(ownerHandoff.authority_boundary.refs_only, true);
    assert.equal(ownerHandoff.authority_boundary.can_create_owner_receipt, false);
    assert.equal(ownerHandoff.authority_boundary.can_close_owner_chain, false);

    const fullOutput = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    assert.deepEqual(
      fullOutput.app_operator_drilldown.attention_first_payload
        .evidence_after_contract.owner_handoff_packet,
      summaryPacket,
    );
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

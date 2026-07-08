import {
  assert,
  buildManifestCommand,
  createFamilyContractsFixtureRoot,
  fs,
  os,
  path,
  repoRoot,
  runCli,
  test,
} from '../helpers.ts';
import './wrapper-aware-read-model.test.ts';
import { buildOplAionRuntimeConsumptionContract } from '../../../../src/modules/console/aionui-acp-shell.ts';
import { openQueueDb } from '../../../../src/modules/runway/family-runtime-store.ts';
import { createStageAttempt, runStageAttemptFixtureActivity } from '../../../../src/modules/runway/family-runtime-stage-attempts.ts';
import { buildManyStageManifest } from './runtime-app-operator-drilldown-summary-fixtures.ts';
import {
  assertAppReleaseUserPathAttention,
  assertAppReleaseUserPathAttentionCounts,
  assertAppReleaseUserPathProductionEvidenceLane,
  assertAppReleaseUserPathNextStep,
  assertAppReleaseUserPathSummary,
} from './runtime-app-operator-drilldown-summary-app-release-assertions.ts';
import {
  assertOmaAppWorkbenchSectionSummary,
  assertOmaProductionConsumptionAttention,
  assertOmaProductionConsumptionFullDetail,
  assertOmaProductionConsumptionNextStep,
  assertOmaProductionConsumptionSummary,
  assertOmaTrajectoryLearningFullDetail,
} from './runtime-app-operator-drilldown-summary-oma-assertions.ts';
import {
  assertFunctionalPrivatizationFullDetail,
  assertFunctionalPrivatizationNextStep,
  assertFunctionalPrivatizationReviewRequiredSummary,
  markFunctionalPrivatizationReviewRequired,
} from './runtime-app-operator-drilldown-summary-functional-privatization.ts';
import { createOmaContractFixture } from './runtime-app-operator-drilldown-helpers.ts';
import {
  assertMemoryArtifactLifecycleEvidence,
} from './runtime-app-operator-drilldown-summary-memory-lifecycle.ts';
import { assertOwnerDeltaTopline } from './runtime-app-operator-drilldown-owner-delta-topline-assertions.ts';

const SUMMARY_COMMAND = ['runtime', 'app-operator-drilldown'];
const FULL_DETAIL_COMMAND = [...SUMMARY_COMMAND, '--detail', 'full'];
const HIDDEN_FULL_DETAIL_SECTIONS = [
  'route_graph_refs',
  'operator_action_routing_refs',
  'domain_dispatch_evidence',
  'stage_production_evidence',
  'standard_agent_template_consumption_refs',
  'functional_privatization_audit_refs',
];

function seedSummaryStageAttempts(count: number) {
  const { db } = openQueueDb();
  try {
    for (let index = 0; index < count; index += 1) {
      const attempt = createStageAttempt(db, {
        domainId: 'medautoscience',
        stageId: `write_${index}`,
        providerKind: 'temporal',
        workspaceLocator: {
          workspace_root: `/tmp/mas-${index}`,
          artifact_root: `/tmp/mas-${index}/artifacts`,
          source_refs: [`source:dataset-${index}`],
        },
        taskId: `task-app-operator-${index}`,
        checkpointRefs: [`checkpoint:write-start-${index}`],
      }).attempt;
      runStageAttemptFixtureActivity(db, {
        stageAttemptId: attempt.stage_attempt_id,
        closeoutPacket: {
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
        },
      });
    }
  } finally {
    db.close();
  }
}

function assertFalseAuthority(boundary: Record<string, unknown>) {
  for (const field of [
    'can_write_domain_truth',
    'can_execute_domain_action',
    'can_create_owner_receipt',
    'can_claim_production_ready',
  ]) {
    if (field in boundary) {
      assert.equal(boundary[field], false);
    }
  }
}

test('runtime app operator defaults to summary-first refs and keeps full refs explicit', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-operator-summary-state-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const previousStateDir = process.env.OPL_STATE_DIR;
  const previousOmaRepoDir = process.env.OPL_META_AGENT_REPO_DIR;
  try {
    process.env.OPL_META_AGENT_REPO_DIR = createOmaContractFixture(fixtureRoot);
    const manyStageManifest = buildManyStageManifest(12);
    markFunctionalPrivatizationReviewRequired(manyStageManifest);
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(manyStageManifest),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    process.env.OPL_STATE_DIR = stateRoot;
    seedSummaryStageAttempts(12);

    const summaryOutput = runCli(SUMMARY_COMMAND, {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const summaryDrilldown = summaryOutput.app_operator_drilldown;
    assert.equal(summaryDrilldown.detail_level, 'summary');
    assert.equal(summaryDrilldown.summary.stage_attempt_count, 12);
    assert.equal(summaryDrilldown.summary.route_graph_ref_count, 12);
    assert.equal(summaryDrilldown.summary.operator_action_route_count > 36, true);
    assert.equal(
      summaryDrilldown.summary.stage_production_attempt_request_route_count,
      summaryDrilldown.summary.stage_production_evidence_missing_caller_stage_count,
    );
    for (const section of HIDDEN_FULL_DETAIL_SECTIONS) {
      assert.equal(summaryDrilldown[section], undefined);
    }
    assert.equal(
      summaryDrilldown.summary.functional_privatization_audit_default_policy,
      'audit_action_required_first_full_inventory_via_explicit_drilldown',
    );
    assertFunctionalPrivatizationReviewRequiredSummary(summaryDrilldown);
    assert.equal(
      summaryDrilldown.summary.standard_agent_template_consumption_status,
      'explicit_repeat_consumption_proof_command_available',
    );
    assert.equal(summaryDrilldown.summary.standard_agent_template_consumption_proof_command_count, 1);
    assert.equal(summaryDrilldown.summary.standard_agent_template_consumption_domain_ready_claim_count, 0);
    assert.equal(summaryDrilldown.summary.standard_agent_template_consumption_production_ready_claim_count, 0);
    assert.equal(summaryDrilldown.summary.standard_agent_template_consumption_artifact_authority_claim_count, 0);

    const metaAgentBound = summaryDrilldown.summary.opl_meta_agent_registry_status === 'resolved';
    assert.equal(['resolved', 'not_bound'].includes(summaryDrilldown.summary.opl_meta_agent_registry_status), true);
    assertOmaAppWorkbenchSectionSummary(summaryDrilldown, metaAgentBound);
    assertOmaProductionConsumptionSummary(summaryDrilldown, metaAgentBound);
    assertAppReleaseUserPathSummary(summaryDrilldown);
    assert.equal(summaryDrilldown.summary.opl_meta_agent_claims_domain_ready, false);
    assert.equal(summaryDrilldown.summary.opl_meta_agent_claims_quality_verdict, false);
    assert.equal(summaryDrilldown.summary.opl_meta_agent_claims_default_promotion, false);
    assert.deepEqual(summaryDrilldown.attention_first_payload.full_detail_args, ['--detail', 'full']);
    assertOwnerDeltaTopline(summaryDrilldown);
    assert.equal(summaryDrilldown.codex_app_runtime_role, undefined);

    const attention = summaryDrilldown.attention_first_payload.evidence_after_contract;
    assert.equal(attention.status, 'attention_required');
    assert.equal(attention.domain_dispatch_attention_count, summaryDrilldown.summary.domain_dispatch_attention_count);
    assert.equal(
      attention.evidence_envelope_attention_count,
      summaryDrilldown.summary.evidence_envelope_open_count
        + summaryDrilldown.summary.evidence_envelope_blocked_count,
    );
    assert.equal(attention.authority_boundary.route_support_closes_owner_chain, false);
    assert.equal(attention.authority_boundary.attention_count_is_hard_blocker, false);
    assertAppReleaseUserPathAttentionCounts(summaryDrilldown);
    assertMemoryArtifactLifecycleEvidence(summaryDrilldown);
    assertOmaProductionConsumptionAttention(summaryDrilldown, metaAgentBound);
    assertAppReleaseUserPathAttention(summaryDrilldown);

    const dispatchSummary = attention.domain_dispatch_evidence_workorder_packet_summary;
    assert.equal(
      dispatchSummary.workorder_count,
      summaryDrilldown.summary.domain_dispatch_evidence_receipt_record_requires_domain_or_app_payload_count,
    );
    assert.equal(dispatchSummary.route_requires_domain_or_app_payload_count, dispatchSummary.workorder_count);
    assert.equal(
      dispatchSummary.domain_id_policy,
      'canonical_owner_facing_ids_only_workorder_items_keep_command_domain_ids_for_action_routes',
    );
    assert.equal(
      dispatchSummary.domain_ids.every((domainId: string) => domainId.includes('-')),
      true,
    );
    assert.equal(attention.domain_dispatch_evidence_workorder_attention_items.length, Math.min(dispatchSummary.workorder_count, 10));
    const firstDispatchWorkorder = attention.domain_dispatch_evidence_workorder_attention_items[0];
    if (firstDispatchWorkorder) {
      assert.equal(firstDispatchWorkorder.payload_owner, 'domain_repository_or_app_live_operator');
      assert.equal(firstDispatchWorkorder.route_requires_domain_or_app_payload, true);
      assertFalseAuthority(firstDispatchWorkorder);
    }

    assert.equal(attention.owner_payload_group_attention_policy, 'top_owner_payload_groups_by_open_then_blocked_counts_refs_only');
    assert.equal(attention.owner_payload_groups.length <= 5, true);
    const firstOwnerPayloadGroup = attention.owner_payload_groups[0];
    assert.equal(firstOwnerPayloadGroup.full_detail_section, 'evidence_envelope');
    assert.equal(firstOwnerPayloadGroup.attention_count > 0, true);
    assertFalseAuthority(firstOwnerPayloadGroup.authority_boundary);

    const nextSteps = summaryDrilldown.attention_first_payload.evidence_next_steps;
    assert.equal(nextSteps.selection_policy, 'balanced_first_item_per_step_kind_then_original_order_refs_only');
    assert.equal(nextSteps.payload_owner, 'domain_repository_or_app_live_operator');
    assert.equal(nextSteps.can_execute_domain_action, false);
    assert.equal(nextSteps.can_create_owner_receipt, false);
    assertOmaProductionConsumptionNextStep(summaryDrilldown, metaAgentBound);
    assertAppReleaseUserPathNextStep(summaryDrilldown);
    assertFunctionalPrivatizationNextStep(summaryDrilldown);
    assert.equal(nextSteps.items.length <= 5, true);
    assert.equal(nextSteps.items.some((item: { step_kind: string }) => item.step_kind === 'evidence_envelope_scaleout'), true);
    assert.equal(new Set(nextSteps.items.map((item: { step_kind: string }) => item.step_kind)).size > 1, true);

    const dispatchWorkorderStep = nextSteps.items.find(
      (item: { step_kind: string }) => item.step_kind === 'domain_dispatch_evidence_workorder',
    );
    if (dispatchWorkorderStep) {
      assert.equal(dispatchWorkorderStep.full_detail_section, 'domain_dispatch_evidence');
      assert.equal(dispatchWorkorderStep.payload_owner, 'domain_repository_or_app_live_operator');
      assert.equal(dispatchWorkorderStep.payload_preflight_blocked_error_kind, 'domain_dispatch_evidence_payload_preflight_blocked');
      assert.equal(dispatchWorkorderStep.accepted_payload_paths.typed_blocker_path.success_claimed, false);
    }

    const missingEvidence = summaryDrilldown.attention_first_payload.missing_evidence.items[0];
    assert.equal(summaryDrilldown.attention_first_payload.missing_evidence.items.length <= 5, true);
    assert.equal(typeof missingEvidence.owner, 'string');
    assert.equal(missingEvidence.owner.includes('-'), true);
    assert.equal(
      missingEvidence.payload_requirement,
      'domain_app_or_live_refs_payload_required_to_record_stage_expected_receipt_source_scope_runtime_event_or_monitor_freshness',
    );
    assert.equal(missingEvidence.route_requires_domain_or_app_payload, true);
    assertAppReleaseUserPathProductionEvidenceLane(summaryDrilldown);
    assert.equal(summaryDrilldown.attention_first_payload.provider_health.health_status, 'attention_required');
    assert.equal(
      ['operator_action_routing_refs', 'standard_agent_template_consumption_refs', 'functional_privatization_audit_refs']
        .every((section) => summaryDrilldown.attention_first_payload.lazy_load_targets.some(
          (target: { section: string; detail_args: string[] }) =>
            target.section === section && target.detail_args.join(' ') === '--detail full',
        )),
      true,
    );

    const aionConsumption = buildOplAionRuntimeConsumptionContract();
    assert.deepEqual(aionConsumption.default_read_model_command, ['app', 'state', '--profile', 'fast']);
    assert.deepEqual(aionConsumption.full_detail_command, FULL_DETAIL_COMMAND);
    assert.equal(aionConsumption.action_submission.surface, summaryDrilldown.attention_first_payload.next_safe_action.submit_via);
    assertFalseAuthority(aionConsumption.authority_boundary);
    assert.deepEqual(aionConsumption.bridge_contract.summary_command, [...SUMMARY_COMMAND, '--json']);
    assert.equal(aionConsumption.bridge_contract.shell_adapter_may_replace_ui_without_runtime_protocol_change, true);

    const fullOutput = runCli(FULL_DETAIL_COMMAND, {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const fullDrilldown = fullOutput.app_operator_drilldown;
    assert.equal(fullDrilldown.detail_level, 'full');
    assert.deepEqual(fullDrilldown.attention_first_payload.full_detail_args, []);
    assertOwnerDeltaTopline(fullDrilldown);
    assert.equal(fullDrilldown.opl_meta_agent_workbench_refs.status, metaAgentBound ? 'resolved' : 'not_bound');
    assert.equal(
      fullDrilldown.standard_agent_template_consumption_refs.surface_kind,
      'opl_standard_agent_template_consumption_read_model',
    );
    assert.deepEqual(
      fullDrilldown.standard_agent_template_consumption_refs.proof_command,
      ['agents', 'scaffold', '--consumption-evidence'],
    );
    assert.equal(fullDrilldown.standard_agent_template_consumption_refs.summary.default_consumption_sample_count, 3);
    assert.equal(fullDrilldown.standard_agent_template_consumption_refs.summary.repeat_consumption_supported, true);
    assert.equal(fullDrilldown.standard_agent_template_consumption_refs.authority_boundary.can_claim_domain_ready, false);
    assert.equal(fullDrilldown.standard_agent_template_consumption_refs.summary.production_ready_claim_count, 0);
    assert.equal(
      fullDrilldown.standard_agent_template_consumption_refs.ledger_projection
        .authority_boundary.can_claim_production_ready,
      false,
    );
    assert.equal(
      fullDrilldown.opl_meta_agent_workbench_refs.authority_boundary.can_promote_default_agent_without_gate,
      false,
    );
    if (metaAgentBound) {
      assert.equal(
        fullDrilldown.opl_meta_agent_workbench_refs.summary.evidence_after_contract_status,
        'target_owner_receipt_or_typed_blocker_refs_projected',
      );
      assertOmaProductionConsumptionFullDetail(fullDrilldown);
      assertOmaTrajectoryLearningFullDetail(fullDrilldown);
      assert.equal(fullDrilldown.oma_sections.patch_loop_closeout.refs.length >= 11, true);
      assert.equal(fullDrilldown.oma_sections.self_evolution_cockpit.targets.length, 2);
      assert.equal(
        fullDrilldown.oma_sections.patch_loop_closeout.authority_boundary.can_write_target_domain_truth,
        false,
      );
      assert.equal(
        fullDrilldown.oma_sections.self_evolution_cockpit.authority_boundary.can_write_target_domain_truth,
        false,
      );
    }
    assert.equal(fullDrilldown.route_graph_refs.refs.length, 12);
    assertFunctionalPrivatizationFullDetail(summaryDrilldown, fullDrilldown);
    assert.equal(fullDrilldown.domain_dispatch_evidence.attempts.length, 12);
    assert.equal(fullDrilldown.stage_production_evidence.stages.length, 12);
    assert.equal(
      fullDrilldown.operator_action_routing_refs.refs.filter(
        (route: { action_kind: string }) => route.action_kind === 'stage_production_attempt_request',
      ).length,
      summaryDrilldown.summary.stage_production_attempt_request_route_count,
    );
    assert.equal(
      fullDrilldown.production_evidence_tail_ledger.tail_items.length,
      summaryDrilldown.summary.app_operator_production_evidence_tail_item_count,
    );
    assert.equal(fullDrilldown.operator_action_routing_refs.refs.length, summaryDrilldown.summary.operator_action_route_count);
    assert.equal(Object.hasOwn(summaryDrilldown.summary, 'deprecated_alias_metadata'), false);
  } finally {
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
    if (previousOmaRepoDir === undefined) {
      delete process.env.OPL_META_AGENT_REPO_DIR;
    } else {
      process.env.OPL_META_AGENT_REPO_DIR = previousOmaRepoDir;
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

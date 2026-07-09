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
import { createOmaContractFixture } from './runtime-app-operator-drilldown-helpers.ts';

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
    if (field in boundary) assert.equal(boundary[field], false, field);
  }
}

test('runtime app operator defaults to summary refs and exposes full drilldown explicitly', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-operator-summary-state-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const previousStateDir = process.env.OPL_STATE_DIR;
  const previousOmaRepoDir = process.env.OPL_META_AGENT_REPO_DIR;
  try {
    process.env.OPL_META_AGENT_REPO_DIR = createOmaContractFixture(fixtureRoot);
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(buildManyStageManifest(12)),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    process.env.OPL_STATE_DIR = stateRoot;
    seedSummaryStageAttempts(12);

    const summaryDrilldown = runCli(SUMMARY_COMMAND, {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).app_operator_drilldown;

    assert.equal(summaryDrilldown.detail_level, 'summary');
    assert.equal(summaryDrilldown.summary.stage_attempt_count, 12);
    assert.equal(summaryDrilldown.summary.route_graph_ref_count, 12);
    assert.equal(summaryDrilldown.summary.operator_action_route_count > 36, true);
    assert.deepEqual(summaryDrilldown.attention_first_payload.full_detail_args, ['--detail', 'full']);
    for (const section of HIDDEN_FULL_DETAIL_SECTIONS) {
      assert.equal(summaryDrilldown[section], undefined, section);
    }
    assert.equal(summaryDrilldown.summary.opl_meta_agent_claims_domain_ready, false);
    assert.equal(summaryDrilldown.summary.opl_meta_agent_claims_quality_verdict, false);
    assert.equal(summaryDrilldown.summary.opl_meta_agent_claims_default_promotion, false);
    assert.equal(summaryDrilldown.attention_first_payload.evidence_after_contract.status, 'attention_required');
    assert.equal(
      summaryDrilldown.attention_first_payload.evidence_next_steps.payload_owner,
      'domain_repository_or_app_live_operator',
    );
    assertFalseAuthority(summaryDrilldown.attention_first_payload.evidence_next_steps);

    const aionConsumption = buildOplAionRuntimeConsumptionContract();
    assert.deepEqual(aionConsumption.default_read_model_command, ['app', 'state', '--profile', 'fast']);
    assert.deepEqual(aionConsumption.full_detail_command, FULL_DETAIL_COMMAND);
    assert.equal(aionConsumption.action_submission.surface, summaryDrilldown.attention_first_payload.next_safe_action.submit_via);
    assertFalseAuthority(aionConsumption.authority_boundary);

    const fullDrilldown = runCli(FULL_DETAIL_COMMAND, {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).app_operator_drilldown;

    assert.equal(fullDrilldown.detail_level, 'full');
    assert.deepEqual(fullDrilldown.attention_first_payload.full_detail_args, []);
    assert.equal(fullDrilldown.route_graph_refs.refs.length, 12);
    assert.equal(fullDrilldown.domain_dispatch_evidence.attempts.length, 12);
    assert.equal(fullDrilldown.stage_production_evidence.stages.length, 12);
    assert.equal(
      fullDrilldown.operator_action_routing_refs.refs.length,
      summaryDrilldown.summary.operator_action_route_count,
    );
    assert.equal(
      fullDrilldown.standard_agent_template_consumption_refs.surface_kind,
      'opl_standard_agent_template_consumption_read_model',
    );
    assert.equal(
      fullDrilldown.standard_agent_template_consumption_refs.authority_boundary.can_claim_domain_ready,
      false,
    );
    assert.equal(
      fullDrilldown.opl_meta_agent_workbench_refs.authority_boundary.can_promote_default_agent_without_gate,
      false,
    );
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

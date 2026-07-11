import {
  assert,
  buildManifestCommand,
  createFamilyContractsFixtureRoot,
  fs,
  loadFamilyManifestFixtures,
  os,
  path,
  runCli,
  test,
} from '../helpers.ts';
import {
  familyRuntimeEnv,
  withEvidenceWorklistSurfaces,
} from './family-runtime-evidence-worklist-helpers.ts';
import { createAdmittedStagePackFixture } from './workspace-domain-test-helper.ts';

const requestId = 'stage_production_evidence:medautoscience:review';
const actionId = 'stage-production-evidence:medautoscience:review:record';

function bindReviewStage(stateRoot: string, fixtureContractsRoot: string) {
  const manifest = withEvidenceWorklistSurfaces(
    loadFamilyManifestFixtures().medautoscience,
    ['review'],
  );
  const masPack = createAdmittedStagePackFixture(manifest, 'med-autoscience', 'MedAutoScience');
  runCli([
    'workspace',
    'bind',
    '--project',
    'medautoscience',
    '--path',
    masPack.repoDir,
    '--manifest-command',
    buildManifestCommand(masPack.manifest),
  ], familyRuntimeEnv(stateRoot, fixtureContractsRoot));
  return masPack.repoDir;
}

function applyAndVerify(
  stateRoot: string,
  fixtureContractsRoot: string,
  receiptRef: string,
  evidenceArgs: string[],
) {
  const env = familyRuntimeEnv(stateRoot, fixtureContractsRoot);
  runCli([
    'agents',
    'evidence',
    'apply',
    '--domain',
    'medautoscience',
    '--request-id',
    requestId,
    '--request-pack-id',
    'medautoscience.stage_production_evidence',
    '--source-ref',
    '/runtime_tray_snapshot/app_operator_drilldown/stage_production_evidence/med-autoscience/review',
    '--receipt-ref',
    receiptRef,
    ...evidenceArgs,
  ], env);
  runCli([
    'agents',
    'evidence',
    'apply',
    '--domain',
    'medautoscience',
    '--request-id',
    requestId,
    '--mode',
    'verify',
    '--receipt-ref',
    receiptRef,
  ], env);
}

function readWorklist(stateRoot: string, fixtureContractsRoot: string) {
  return runCli([
    'family-runtime',
    'evidence-worklist',
    '--family-defaults',
    '--provider',
    'temporal',
    '--executor-kind',
    'codex_cli',
    '--detail',
    'full',
  ], familyRuntimeEnv(stateRoot, fixtureContractsRoot)).family_runtime_evidence_worklist;
}

test('evidence worklist keeps stage record open until domain refs cover source and runtime obligations', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-worklist-open-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  let repoDir: string | null = null;
  try {
    repoDir = bindReviewStage(stateRoot, fixtureContractsRoot);
    applyAndVerify(
      stateRoot,
      fixtureContractsRoot,
      'mas-stage-review-partial-receipt',
      [
        '--evidence-ref',
        'metric:review:currentness',
        '--domain-receipt-ref',
        'owner_receipt:review',
      ],
    );

    const worklist = readWorklist(stateRoot, fixtureContractsRoot);
    const item = worklist.worklist_items.find(
      (entry: { action_id: string }) => entry.action_id === actionId,
    );
    const workorder = worklist.stage_evidence_workorder_packet.workorders.find(
      (entry: { action_id: string }) => entry.action_id === actionId,
    );
    assert.equal(item.status, 'open_safe_action_request_route_available');
    assert.equal(item.route_requires_domain_or_app_payload, true);
    assert.equal(item.can_close_without_domain_or_app_payload, false);
    assert.equal(item.worklist_item_is_completion_claim, false);
    assert.deepEqual(workorder.unobserved_source_scope_refs, ['source:review']);
    assert.deepEqual(workorder.unobserved_runtime_event_refs, [
      'runtime_event:review.owner_receipt_recorded',
    ]);
    assert.equal(
      worklist.next_action_ledger.next_action_items.some(
        (entry: { source_tail_item_id: string }) => entry.source_tail_item_id === item.item_id,
      ),
      false,
    );
    assert.equal(worklist.authority_boundary.can_write_domain_truth, false);
    assert.equal(worklist.authority_boundary.can_claim_production_ready, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    if (repoDir) fs.rmSync(repoDir, { recursive: true, force: true });
  }
});

test('evidence worklist closes a stage requirement only with a verified domain typed blocker', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-worklist-blocker-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  let repoDir: string | null = null;
  try {
    repoDir = bindReviewStage(stateRoot, fixtureContractsRoot);
    const blockerRef = 'mas-stage-typed-blocker:review:owner-receipt-or-monitor-freshness-pending';
    applyAndVerify(
      stateRoot,
      fixtureContractsRoot,
      'mas-stage-review-typed-blocker-receipt',
      ['--typed-blocker-ref', blockerRef],
    );

    const worklist = readWorklist(stateRoot, fixtureContractsRoot);
    const item = worklist.worklist_items.find(
      (entry: { action_id: string }) => entry.action_id === actionId,
    );
    assert.equal(item.status, 'closed_by_domain_owned_typed_blocker');
    assert.equal(item.receipt_ref, 'mas-stage-review-typed-blocker-receipt');
    assert.deepEqual(item.typed_blocker_refs, [blockerRef]);
    assert.equal(item.worklist_item_is_completion_claim, false);
    assert.equal(
      worklist.stage_evidence_workorder_packet.workorders.some(
        (entry: { action_id: string }) => entry.action_id === actionId,
      ),
      false,
    );
    assert.equal(
      worklist.evidence_requirement_ledger.requirements.find(
        (entry: { requirement_id: string }) => entry.requirement_id === item.item_id,
      ).status,
      'domain_owned_typed_blocker',
    );
    assert.equal(worklist.summary.domain_ready_authorized, false);
    assert.equal(worklist.summary.production_ready_authorized, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    if (repoDir) fs.rmSync(repoDir, { recursive: true, force: true });
  }
});

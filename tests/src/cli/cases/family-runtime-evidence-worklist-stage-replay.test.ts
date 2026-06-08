import {
  assert,
  buildManifestCommand,
  createFamilyContractsFixtureRoot,
  fs,
  loadFrameworkContracts,
  loadFamilyManifestFixtures,
  os,
  path,
  repoRoot,
  runCli,
  test,
} from '../helpers.ts';
import { runFamilyRuntimeEvidenceWorklist } from '../../../../src/family-runtime-evidence-worklist.ts';
import {
  createFamilyWorkspaceFixture,
  createOmaContractFixture,
} from './runtime-app-operator-drilldown-helpers.ts';

type JsonRecord = Record<string, unknown>;

function attachManifestSurface(payload: JsonRecord, field: string, value: JsonRecord) {
  if (payload.product_entry_manifest && typeof payload.product_entry_manifest === 'object') {
    return {
      ...payload,
      product_entry_manifest: {
        ...(payload.product_entry_manifest as JsonRecord),
        [field]: value,
      },
    };
  }
  return { ...payload, [field]: value };
}

function buildActionCatalog(targetDomainId: string) {
  return {
    surface_kind: 'family_action_catalog',
    version: 'family-action-catalog.v1',
    catalog_id: `${targetDomainId}_human_gate_catalog`,
    target_domain_id: targetDomainId,
    owner: targetDomainId,
    authority_boundary: { opl_role: 'projection_consumer_only' },
    actions: [
      {
        action_id: 'review_gate_action',
        title: 'Review gate action',
        summary: 'Requires a human gate before replay can be certified.',
        owner: targetDomainId,
        effect: 'read_only',
        source_command: { command: `${targetDomainId} review-gate`, surface_kind: 'domain_cli' },
        input_schema_ref: 'schemas/review-gate.input.json',
        output_schema_ref: 'schemas/review-gate.output.json',
        workspace_locator_fields: ['workspace_root'],
        human_gate_ids: ['publication_quality_gate'],
        supported_surfaces: { cli: null, mcp: null, skill: null, product_entry: null, openai: null, ai_sdk: null },
        authority_boundary: { opl_role: 'projection_consumer_only' },
      },
    ],
    notes: [],
  };
}

function buildStageControlPlane(targetDomainId: string) {
  const stageIds = [
    'review_gate',
    ...Array.from({ length: 11 }, (_, index) =>
      `review_gate_${String(index + 2).padStart(2, '0')}`
    ),
  ];
  return {
    surface_kind: 'family_stage_control_plane',
    version: 'family-stage-control-plane.v1',
    plane_id: `${targetDomainId}_human_gate_stage_plane`,
    target_domain_id: targetDomainId,
    owner: targetDomainId,
    authority_boundary: { opl_role: 'projection_consumer_only' },
    replay_evidence_refs: [
      { ref_kind: 'append_only_event_log_ref', ref: `event-log:${targetDomainId}/stages`, role: 'append_only_event_log_ref' },
      { ref_kind: 'attempt_ledger_ref', ref: `attempt-ledger:opl/${targetDomainId}`, role: 'attempt_ledger_ref' },
    ],
    stages: stageIds.map((stageId) => ({
      stage_id: stageId,
      stage_kind: 'review',
      title: `Review gate ${stageId}`,
      summary: 'Human-gated replay fixture.',
      goal: 'Expose missing human gate receipt as refs-only operator attention.',
      owner: targetDomainId,
      domain_stage_refs: [stageId],
      inputs: [],
      knowledge_refs: [],
      skills: [],
      prompt_refs: [],
      allowed_action_refs: ['review_gate_action'],
      outputs: [],
      evaluation: [],
      handoff: null,
      source_refs: [],
      freshness: null,
      action_parity: null,
      stage_contract: {
        requires: ['draft_ready'],
        ensures: ['review_gate_ready'],
        boundary_assumptions: ['domain_truth_remains_domain_owned'],
        runtime_event_refs: [`runtime_event:${targetDomainId}.${stageId}`],
        expected_receipt_refs: [
          { ref_kind: 'receipt_ref', ref: `owner_receipt:${stageId}`, role: 'domain_owner_receipt_ref' },
        ],
        replay_evidence_refs: [
          { role: 'recorded_runtime_event_ref', ref: `runtime_event:${targetDomainId}.${stageId}` },
          { role: 'domain_owner_receipt_ref', ref: `owner_receipt:${stageId}` },
        ],
        properties: [],
        runtime_assumptions: [],
        monitor_refs: [],
        source_scope_refs: [],
        cohort_query_refs: [],
        trigger_refs: [],
        dashboard_metric_refs: [],
        artifact_scope_refs: [],
        workspace_scope_refs: [],
      },
      trust_boundary: {
        lane: 'human_gate',
        static_check_eligible: false,
        effect_boundary: true,
        runtime_guard_required: true,
        records_runtime_events: true,
        runtime_event_refs: [`runtime_event:${targetDomainId}.${stageId}`],
      },
      authority_boundary: { opl_role: 'projection_consumer_only', can_write_domain_truth: false },
    })),
    notes: [],
  };
}

function withReplayMissingHumanGateManifest(payload: JsonRecord, targetDomainId: string) {
  return attachManifestSurface(
    attachManifestSurface(payload, 'family_action_catalog', buildActionCatalog(targetDomainId)),
    'family_stage_control_plane',
    buildStageControlPlane(targetDomainId),
  );
}

test('family-runtime evidence-worklist projects stage replay missing receipt workorders as refs-only attention', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-evidence-worklist-stage-replay-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const manifest = withReplayMissingHumanGateManifest(
    loadFamilyManifestFixtures().medautoscience as JsonRecord,
    'med-autoscience',
  );

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(manifest),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    const output = runCli([
      'family-runtime',
      'evidence-worklist',
      '--family-defaults',
      '--provider',
      'temporal',
      '--executor-kind',
      'codex_cli',
      '--detail',
      'full',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const worklist = output.family_runtime_evidence_worklist;
    const packet = worklist.stage_replay_missing_receipt_workorder_packet;

    assert.equal(packet.surface_kind, 'opl_stage_replay_missing_receipt_workorder_packet');
    assert.equal(packet.summary.workorder_count, packet.workorders.length);
    assert.equal(packet.summary.workorder_count >= 1, true);
    assert.equal(packet.summary.domain_count >= 1, true);
    assert.equal(packet.summary.stage_count >= 1, true);
    assert.equal(packet.summary.human_gate_missing_ref_count >= 1, true);
    assert.equal(
      worklist.summary.stage_replay_missing_receipt_workorder_count,
      packet.summary.workorder_count,
    );
    assert.equal(
      worklist.summary.stage_replay_missing_human_gate_ref_count,
      packet.summary.human_gate_missing_ref_count,
    );
    assert.equal(worklist.stage_replay_missing_receipt_workorder_attention_items.length >= 1, true);
    assert.equal(
      worklist.stage_replay_missing_receipt_workorder_attention_summary.surface_kind,
      'opl_stage_replay_missing_receipt_workorder_attention_summary',
    );
    assert.equal(
      worklist.stage_replay_missing_receipt_workorder_attention_summary.total_workorder_count,
      packet.summary.workorder_count,
    );
    assert.equal(
      worklist.stage_replay_missing_receipt_workorder_attention_summary.attention_item_count,
      worklist.stage_replay_missing_receipt_workorder_attention_items.length,
    );
    assert.equal(
      worklist.stage_replay_missing_receipt_workorder_attention_summary.omitted_workorder_count,
      packet.summary.workorder_count
        - worklist.stage_replay_missing_receipt_workorder_attention_items.length,
    );
    assert.equal(
      worklist.stage_replay_missing_receipt_workorder_attention_summary.omitted_workorder_count > 0,
      true,
    );
    assert.equal(
      worklist.stage_replay_missing_receipt_workorder_attention_summary.omitted_domain_counts.some(
        (entry: { domain_id: string; workorder_count: number }) =>
          entry.domain_id === 'med-autoscience' && entry.workorder_count > 0,
      ),
      true,
    );
    assert.equal(
      worklist.stage_replay_missing_receipt_workorder_attention_summary.omitted_status_counts.some(
        (entry: { status: string; workorder_count: number }) =>
          entry.status === 'blocked_by_missing_replay_receipt_ref' && entry.workorder_count > 0,
      ),
      true,
    );
    assert.equal(
      worklist.stage_replay_missing_receipt_workorder_attention_summary.authority_boundary
        .can_create_owner_receipt,
      false,
    );
    assert.equal(
      worklist.worklist_items.some(
        (entry: { item_id: string }) => entry.item_id?.startsWith('stage-replay-missing-receipt-workorder:'),
      ),
      false,
    );
    assert.equal(
      worklist.attention_queue.some(
        (entry: { item_id: string }) => entry.item_id?.startsWith('stage-replay-missing-receipt-workorder:'),
      ),
      false,
    );
    assert.equal(
      worklist.summary.open_safe_action_item_count,
      worklist.summary.open_worklist_item_count,
    );

    const item = packet.workorders.find((entry: { domain_id: string; stage_id: string }) =>
      entry.domain_id === 'med-autoscience' && entry.stage_id === 'review_gate'
    );
    assert.ok(item);
    assert.equal(item.domain_id, 'med-autoscience');
    assert.equal(item.stage_id, 'review_gate');
    assert.equal(item.missing_ref, 'human_gate:publication_quality_gate');
    assert.equal(item.missing_ref_kind, 'human_gate_ref');
    assert.deepEqual(item.required_return_shapes, ['human_gate_receipt_ref', 'typed_blocker_ref']);
    assert.deepEqual(item.target_identity, {
      domain_id: 'med-autoscience',
      stage_id: 'review_gate',
      missing_ref: 'human_gate:publication_quality_gate',
      target_key: 'med-autoscience/review_gate/human_gate:publication_quality_gate',
    });
    assert.equal(
      item.direct_ledger_handoff.record_success_command,
      'opl runtime stage-replay-missing-receipt record --target-identity \'{"domain_id":"med-autoscience","stage_id":"review_gate","missing_ref":"human_gate:publication_quality_gate","target_key":"med-autoscience/review_gate/human_gate:publication_quality_gate"}\' --payload \'{"receipt_refs":["human_gate:publication_quality_gate"]}\'',
    );
    assert.equal(
      item.direct_ledger_handoff.record_typed_blocker_command.includes(
        'opl runtime stage-replay-missing-receipt record --target-identity',
      ),
      true,
    );
    assert.equal(item.direct_ledger_handoff.verify_command, 'opl runtime stage-replay-missing-receipt verify --receipt-ref <receipt_ref>');
    assert.equal(item.direct_ledger_handoff.can_submit_to_safe_action_shell, false);
    assert.equal(item.direct_ledger_handoff.can_execute_domain_action, false);
    assert.equal(item.direct_ledger_handoff.can_requery_human, false);
    assert.equal(item.direct_ledger_handoff.can_create_owner_receipt, false);
    assert.equal(item.direct_ledger_handoff.can_claim_production_ready, false);
    assert.equal(item.default_next_action_guidance.action_kind, 'record_payload');
    assert.equal(item.default_next_action_guidance.step_kind, 'record_stage_replay_missing_receipt_payload');
    assert.equal(item.default_next_action_guidance.owner, 'domain_or_human_gate_owner');
    assert.equal(item.default_next_action_guidance.payload_path, 'success_refs_path');
    assert.equal(
      item.default_next_action_guidance.record_command,
      item.direct_ledger_handoff.record_success_command,
    );
    assert.equal(
      item.default_next_action_guidance.verify_command,
      item.direct_ledger_handoff.verify_command,
    );
    assert.deepEqual(item.default_next_action_guidance.alternative_action_kinds, [
      'record_typed_blocker_payload',
      'ask_human',
    ]);
    assert.equal(item.default_next_action_guidance.can_submit_to_safe_action_shell, false);
    assert.equal(item.default_next_action_guidance.can_execute_domain_action, false);
    assert.equal(item.default_next_action_guidance.can_create_owner_receipt, false);
    assert.equal(item.default_next_action_guidance.can_claim_production_ready, false);
    const compactItem = worklist.stage_replay_missing_receipt_workorder_attention_items.find(
      (entry: { item_id: string }) => entry.item_id === item.item_id,
    );
    assert.ok(compactItem);
    assert.deepEqual(compactItem.target_identity, item.target_identity);
    assert.equal(compactItem.direct_ledger_handoff.record_success_command, item.direct_ledger_handoff.record_success_command);
    assert.deepEqual(compactItem.default_next_action_guidance, item.default_next_action_guidance);
    assert.equal(compactItem.next_safe_action_ref, null);
    assert.equal(item.worklist_item_is_completion_claim, false);
    assert.equal(item.payload_workorder.authority_boundary.can_requery_human, false);
    assert.equal(item.payload_workorder.authority_boundary.can_create_owner_receipt, false);
    assert.equal(item.payload_workorder.authority_boundary.can_write_domain_truth, false);
    assert.equal(item.payload_workorder.authority_boundary.can_close_domain_ready, false);
    assert.equal(item.payload_workorder.authority_boundary.can_claim_production_ready, false);
    assert.equal(packet.authority_boundary.can_execute_domain_action, false);
    assert.equal(packet.authority_boundary.can_requery_human, false);
    assert.equal(packet.authority_boundary.closes_domain_ready, false);
    assert.equal(packet.authority_boundary.closes_production_ready, false);
    assert.equal(worklist.not_authorized_claims.includes('production_ready'), true);
    assert.equal(
      worklist.source_refs.stage_replay_missing_receipt_workorder_ref,
      '/family_stage_readiness/domains/warnings/payload_workorder',
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime evidence-worklist consumes OMA repo-tracked stage replay typed blocker refs', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-evidence-worklist-oma-stage-replay-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const omaRepoDir = createOmaContractFixture(fixtureRoot, { productionAcceptance: true });

  try {
    const output = runCli([
      'family-runtime',
      'evidence-worklist',
      '--family-defaults',
      '--provider',
      'temporal',
      '--executor-kind',
      'codex_cli',
      '--detail',
      'full',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_META_AGENT_REPO_DIR: omaRepoDir,
    });
    const worklist = output.family_runtime_evidence_worklist;
    const packet = worklist.stage_replay_missing_receipt_workorder_packet;
    const item = packet.workorders.find((entry: { domain_id: string; stage_id: string }) =>
      entry.domain_id === 'opl-meta-agent' && entry.stage_id === 'stage-decomposition'
    );

    assert.ok(item);
    assert.equal(item.missing_ref, 'human_gate:oma_baseline_owner_review');
    assert.equal(item.status, 'blocked_by_domain_owned_typed_blocker_ref');
    assert.equal(
      item.stage_replay_missing_receipt_ledger_status,
      'verified_typed_blocker_recorded_still_blocked',
    );
    assert.deepEqual(item.typed_blocker_refs, [
      'oma-typed-blocker:stage-replay-human-gate:stage-decomposition:oma_baseline_owner_review/baseline-owner-review-receipt-pending',
    ]);
    assert.deepEqual(item.typed_blocker_receipt_refs, [
      'opl://stage-replay-missing-receipt/contracts%2Fproduction_acceptance%2Fmeta-agent-production-acceptance.json%23%2Fstage_replay_human_gate_blocker_summary',
    ]);
    assert.equal(packet.summary.typed_blocker_recorded_count >= 1, true);
    assert.equal(packet.summary.success_receipt_verified_count, 0);
    assert.equal(item.worklist_item_is_completion_claim, false);
    assert.equal(item.authority_boundary.can_create_owner_receipt, false);
    assert.equal(item.authority_boundary.can_claim_production_ready, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime evidence-worklist uses manifest projection cache for replay missing receipt attention', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-evidence-worklist-stage-replay-cache-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const manifest = withReplayMissingHumanGateManifest(
    loadFamilyManifestFixtures().medautoscience as JsonRecord,
    'med-autoscience',
  );
  const manifestPath = path.join(stateRoot, 'manifest.json');
  const commandPath = path.join(stateRoot, 'replay-cache-manifest.cjs');

  try {
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`, 'utf8');
    fs.writeFileSync(
      commandPath,
      `const fs = require('node:fs');\n`
        + `if (process.env.OPL_TEST_FORCE_MANIFEST_FAILURE === '1') process.exit(42);\n`
        + `process.stdout.write(fs.readFileSync(${JSON.stringify(manifestPath)}, 'utf8'));\n`,
      'utf8',
    );
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      repoRoot,
      '--manifest-command',
      `${process.execPath} ${commandPath}`,
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    runCli(['domain', 'manifests'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    const previousStateDir = process.env.OPL_STATE_DIR;
    const previousContractsDir = process.env.OPL_CONTRACTS_DIR;
    process.env.OPL_STATE_DIR = stateRoot;
    process.env.OPL_CONTRACTS_DIR = fixtureContractsRoot;
    process.env.OPL_TEST_FORCE_MANIFEST_FAILURE = '1';
    try {
      const worklist = (await runFamilyRuntimeEvidenceWorklist(loadFrameworkContracts(), {
        familyDefaults: true,
        providerKind: 'temporal',
        executorKind: 'codex_cli',
        detailLevel: 'full',
      })).family_runtime_evidence_worklist as JsonRecord;
      const packet = worklist.stage_replay_missing_receipt_workorder_packet as JsonRecord;
      const packetSummary = packet.summary as JsonRecord;
      const worklistSummary = worklist.summary as JsonRecord;
      const packetWorkorders = packet.workorders as JsonRecord[];
      const worklistItems = worklist.worklist_items as JsonRecord[];
      const attentionQueue = worklist.attention_queue as JsonRecord[];
      assert.equal((packetSummary.workorder_count as number) >= 1, true);
      assert.equal((packetSummary.domain_ids as string[]).includes('med-autoscience'), true);
      assert.equal(
        worklistSummary.stage_replay_missing_receipt_workorder_count,
        packetSummary.workorder_count,
      );
      assert.equal(
        packetWorkorders.some((item) =>
          item.domain_id === 'med-autoscience'
          && item.stage_id === 'review_gate'
          && item.missing_ref === 'human_gate:publication_quality_gate'
        ),
        true,
      );
      assert.equal(
        worklistItems.some(
          (entry) => typeof entry.item_id === 'string'
            && entry.item_id.startsWith('stage-replay-missing-receipt-workorder:'),
        ),
        false,
      );
      assert.equal(
        attentionQueue.some(
          (entry) => typeof entry.item_id === 'string'
            && entry.item_id.startsWith('stage-replay-missing-receipt-workorder:'),
        ),
        false,
      );
    } finally {
      restoreEnvVar('OPL_STATE_DIR', previousStateDir);
      restoreEnvVar('OPL_CONTRACTS_DIR', previousContractsDir);
      delete process.env.OPL_TEST_FORCE_MANIFEST_FAILURE;
    }
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('direct family-runtime evidence-worklist matches framework readiness replay attention', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-evidence-worklist-framework-match-'));
  const familyWorkspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-evidence-worklist-framework-family-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const { omaRepoDir, workspaceRoot } = createFamilyWorkspaceFixture(familyWorkspaceRoot);
  const manifest = withReplayMissingHumanGateManifest(
    loadFamilyManifestFixtures().medautoscience as JsonRecord,
    'med-autoscience',
  );
  const env = {
    OPL_STATE_DIR: stateRoot,
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
    OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
    OPL_META_AGENT_REPO_DIR: omaRepoDir,
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
      buildManifestCommand(manifest),
    ], env);

    const readiness = runCli(['framework', 'readiness', '--family-defaults'], env).framework_readiness;
    const directWorklist = runCli([
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
      directWorklist.stage_replay_missing_receipt_workorder_packet.summary.workorder_count,
      readiness.evidence_worklist.stage_replay_missing_receipt_workorder_count,
    );
    assert.equal(
      directWorklist.stage_replay_missing_receipt_workorder_packet.summary.missing_ref_count,
      readiness.evidence_worklist.stage_replay_missing_receipt_ref_count,
    );
    assert.equal(
      directWorklist.stage_replay_missing_receipt_workorder_attention_summary.omitted_workorder_count,
      readiness.evidence_worklist.stage_replay_missing_receipt_workorder_attention_summary
        .omitted_workorder_count,
    );
    assert.deepEqual(
      directWorklist.stage_replay_missing_receipt_workorder_attention_items.map(
        (item: { item_id: string }) => item.item_id,
      ),
      readiness.evidence_worklist.stage_replay_missing_receipt_workorder_attention_items.map(
        (item: { item_id: string }) => item.item_id,
      ),
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(familyWorkspaceRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('runtime stage-replay-missing-receipt ledger records owner payload without creating owner receipts', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-replay-missing-receipt-ledger-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const previousOmaRepoDir = process.env.OPL_META_AGENT_REPO_DIR;
  const manifest = withReplayMissingHumanGateManifest(
    loadFamilyManifestFixtures().medautoscience as JsonRecord,
    'med-autoscience',
  );

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
      buildManifestCommand(manifest),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    const initial = runCli([
      'family-runtime',
      'evidence-worklist',
      '--family-defaults',
      '--provider',
      'temporal',
      '--executor-kind',
      'codex_cli',
      '--detail',
      'full',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).family_runtime_evidence_worklist;
    assert.equal(
      initial.stage_replay_missing_receipt_workorder_packet.workorders.some(
        (item: { domain_id: string; stage_id: string; missing_ref: string }) =>
          item.domain_id === 'med-autoscience'
          && item.stage_id === 'review_gate'
          && item.missing_ref === 'human_gate:publication_quality_gate',
      ),
      true,
    );

    const targetIdentity = {
      domain_id: 'med-autoscience',
      stage_id: 'review_gate',
      missing_ref: 'human_gate:publication_quality_gate',
    };
    const blockerRecord = runCli([
      'runtime',
      'stage-replay-missing-receipt',
      'record',
      '--target-identity',
      JSON.stringify(targetIdentity),
      '--payload',
      JSON.stringify({
        typed_blocker_refs: ['typed_blocker:med-autoscience/review-gate-human-gate-pending'],
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).stage_replay_missing_receipt_ledger_record;
    assert.equal(blockerRecord.status, 'recorded');
    assert.equal(blockerRecord.receipts[0].payload_path, 'typed_blocker_path');
    assert.equal(blockerRecord.receipts[0].authority_boundary.refs_only, true);
    assert.equal(blockerRecord.receipts[0].authority_boundary.can_create_owner_receipt, false);
    assert.equal(blockerRecord.receipts[0].authority_boundary.can_requery_human, false);
    assert.equal(blockerRecord.receipts[0].authority_boundary.can_close_replay_receipt_ref, false);
    assert.equal(blockerRecord.receipts[0].authority_boundary.can_claim_production_ready, false);
    assert.equal(
      blockerRecord.ledger_file,
      path.join(stateRoot, 'stage-replay-missing-receipt-ledger.json'),
    );
    runCli([
      'runtime',
      'stage-replay-missing-receipt',
      'verify',
      '--receipt-ref',
      blockerRecord.receipt_refs[0],
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const blocked = runCli([
      'family-runtime',
      'evidence-worklist',
      '--family-defaults',
      '--provider',
      'temporal',
      '--executor-kind',
      'codex_cli',
      '--detail',
      'full',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).family_runtime_evidence_worklist;
    assert.equal(
      blocked.stage_replay_missing_receipt_workorder_packet.workorders.some(
        (item: { domain_id: string; stage_id: string; missing_ref: string }) =>
          item.domain_id === 'med-autoscience'
          && item.stage_id === 'review_gate'
          && item.missing_ref === 'human_gate:publication_quality_gate',
      ),
      true,
    );
    assert.equal(
      blocked.stage_replay_missing_receipt_workorder_packet.summary.typed_blocker_recorded_count,
      1,
    );
    const blockedItem = blocked.stage_replay_missing_receipt_workorder_packet.workorders.find(
      (item: { domain_id: string; stage_id: string; missing_ref: string }) =>
        item.domain_id === 'med-autoscience'
        && item.stage_id === 'review_gate'
        && item.missing_ref === 'human_gate:publication_quality_gate',
    );
    assert.ok(blockedItem);
    assert.deepEqual(blockedItem.typed_blocker_refs, [
      'typed_blocker:med-autoscience/review-gate-human-gate-pending',
    ]);
    assert.equal(blockedItem.direct_ledger_handoff.typed_blocker_refs[0], 'typed_blocker:med-autoscience/review-gate-human-gate-pending');
    assert.equal(blockedItem.direct_ledger_handoff.can_create_owner_receipt, false);
    assert.equal(
      blocked.stage_replay_missing_receipt_workorder_packet.summary.workorder_count,
      initial.stage_replay_missing_receipt_workorder_packet.summary.workorder_count,
    );

    const successRecord = runCli([
      'runtime',
      'stage-replay-missing-receipt',
      'record',
      '--target-identity',
      JSON.stringify(targetIdentity),
      '--payload',
      JSON.stringify({
        receipt_refs: ['human_gate:publication_quality_gate'],
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).stage_replay_missing_receipt_ledger_record;
    assert.equal(successRecord.status, 'recorded');
    assert.equal(successRecord.receipts[0].payload_path, 'success_refs_path');
    assert.equal(successRecord.receipts[0].authority_boundary.can_create_owner_receipt, false);
    assert.equal(successRecord.receipts[0].authority_boundary.closes_domain_ready, false);
    assert.equal(successRecord.receipts[0].authority_boundary.closes_production_ready, false);
    const verifyOutput = runCli([
      'runtime',
      'stage-replay-missing-receipt',
      'verify',
      '--receipt-ref',
      successRecord.receipt_refs[0],
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).stage_replay_missing_receipt_ledger_verify;
    assert.equal(verifyOutput.status, 'verified');
    assert.equal(verifyOutput.receipt.receipt_status, 'verified');

    const resolved = runCli([
      'family-runtime',
      'evidence-worklist',
      '--family-defaults',
      '--provider',
      'temporal',
      '--executor-kind',
      'codex_cli',
      '--detail',
      'full',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).family_runtime_evidence_worklist;
    assert.equal(
      resolved.stage_replay_missing_receipt_workorder_packet.workorders.some(
        (item: { domain_id: string; stage_id: string; missing_ref: string }) =>
          item.domain_id === 'med-autoscience'
          && item.stage_id === 'review_gate'
          && item.missing_ref === 'human_gate:publication_quality_gate',
      ),
      false,
    );
    assert.equal(
      resolved.summary.stage_replay_missing_receipt_workorder_count,
      initial.summary.stage_replay_missing_receipt_workorder_count - 1,
    );
    assert.equal(
      resolved.stage_replay_missing_receipt_workorder_packet.summary.success_receipt_verified_count,
      1,
    );
    assert.equal(
      resolved.stage_replay_missing_receipt_workorder_packet.authority_boundary.closes_domain_ready,
      false,
    );

    const listOutput = runCli([
      'runtime',
      'stage-replay-missing-receipt',
      'list',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).stage_replay_missing_receipt_ledger;
    assert.equal(listOutput.receipt_count, 1);
    assert.equal(listOutput.verified_receipt_count, 1);
    assert.equal(listOutput.authority_boundary.can_create_owner_receipt, false);
    assert.equal(listOutput.authority_boundary.can_claim_production_ready, false);
  } finally {
    if (previousOmaRepoDir === undefined) {
      delete process.env.OPL_META_AGENT_REPO_DIR;
    } else {
      process.env.OPL_META_AGENT_REPO_DIR = previousOmaRepoDir;
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

function restoreEnvVar(name: string, previousValue: string | undefined): void {
  if (previousValue === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = previousValue;
  }
}

import { assert, buildManifestCommand, createFamilyContractsFixtureRoot, fs, loadFamilyManifestFixtures, os, path, repoRoot, runCli, test } from '../helpers.ts';

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

function buildAdmittedActionCatalog(
  targetDomainId: string,
  owner: string,
  options: { stage2HumanGate?: boolean } = {},
) {
  return {
    surface_kind: 'family_action_catalog',
    version: 'family-action-catalog.v1',
    catalog_id: `${targetDomainId.replace(/[^a-z0-9]+/gi, '_')}_action_catalog`,
    target_domain_id: targetDomainId,
    owner,
    authority_boundary: { opl_role: 'projection_consumer_only' },
    actions: Array.from({ length: 6 }, (_entry, index) => ({
      action_id: `stage_${index + 1}_action`,
      title: `Stage ${index + 1} action`,
      summary: `Project stage ${index + 1} action metadata.`,
      owner,
      effect: 'read_only',
      source_command: { command: `${owner} stage-${index + 1}`, surface_kind: 'domain_cli' },
      input_schema_ref: `schemas/stage-${index + 1}.input.json`,
      output_schema_ref: `schemas/stage-${index + 1}.output.json`,
      workspace_locator_fields: ['workspace_root'],
      human_gate_ids: options.stage2HumanGate && index === 1 ? ['publication_quality_gate'] : [],
      supported_surfaces: { cli: null, mcp: null, skill: null, product_entry: null, openai: null, ai_sdk: null },
      authority_boundary: { opl_role: 'projection_consumer_only' },
    })),
    notes: [],
  };
}

function buildAdmittedStagePlane(targetDomainId: string, owner: string) {
  const progressFirstPolicies = {
    progress_delta_policy: {
      surface_kind: 'opl_stage_progress_delta_policy',
      version: 'progress-delta-policy.v1',
      required_fields: [
        'progress_delta_classification',
        'deliverable_progress_delta',
        'platform_repair_delta',
        'next_forced_delta',
      ],
      classification_values: [
        'deliverable_progress',
        'platform_repair',
        'mixed',
        'typed_blocker',
        'human_gate',
        'stop_loss',
      ],
      platform_only_is_not_deliverable_progress: true,
    },
    typed_blocker_lineage_policy: {
      surface_kind: 'family-stall-lineage.v1',
      repeat_budget: {
        mechanism_repair_after_repeat_count: 2,
        human_gate_or_stop_loss_after_repeat_count: 3,
      },
      required_fields: [
        'blocker_family',
        'study_id_or_domain_identity',
        'work_unit_id',
        'source_fingerprint',
        'repeat_count',
        'next_forced_delta',
        'escalation_owner',
      ],
    },
  };
  return {
    surface_kind: 'family_stage_control_plane',
    version: 'family-stage-control-plane.v1',
    plane_id: `${targetDomainId.replace(/[^a-z0-9]+/gi, '_')}_stage_control_plane`,
    target_domain_id: targetDomainId,
    owner,
    authority_boundary: { opl_role: 'projection_consumer_only' },
    replay_evidence_refs: [
      {
        ref_kind: 'append_only_event_log_ref',
        ref: `event-log:${targetDomainId}/stages`,
        role: 'append_only_event_log_ref',
      },
      {
        ref_kind: 'attempt_ledger_ref',
        ref: `attempt-ledger:opl/${targetDomainId}`,
        role: 'attempt_ledger_ref',
      },
    ],
    stages: Array.from({ length: 6 }, (_entry, index) => {
      const stageNumber = index + 1;
      return {
        stage_id: `stage_${stageNumber}`,
        stage_kind: 'creation',
        title: `Stage ${stageNumber}`,
        summary: `Runtime-enforced stage ${stageNumber} descriptor.`,
        goal: `Expose stage ${stageNumber} as admitted runtime projection metadata.`,
        owner,
        domain_stage_refs: [`domain_stage_${stageNumber}`],
        inputs: [],
        knowledge_refs: [],
        skills: [],
        prompt_refs: [],
        allowed_action_refs: [`stage_${stageNumber}_action`],
        outputs: [],
        evaluation: [],
        handoff: null,
        source_refs: [],
        freshness: null,
        action_parity: null,
        stage_contract: {
          ...progressFirstPolicies,
          requires: [`stage_${stageNumber}_input_ready`],
          ensures: [`stage_${stageNumber}_receipt_ready`],
          boundary_assumptions: ['domain_truth_remains_domain_owned'],
          runtime_event_refs: [`runtime_event:${targetDomainId}.stage_${stageNumber}`],
          expected_receipt_refs: [
            {
              ref_kind: 'receipt_ref',
              ref: `owner_receipt:stage_${stageNumber}`,
              role: 'domain_owner_receipt_ref',
            },
          ],
          replay_evidence_refs: [
            {
              role: 'recorded_runtime_event_ref',
              ref: `runtime_event:${targetDomainId}.stage_${stageNumber}`,
            },
            {
              ref_kind: 'receipt_ref',
              role: 'domain_owner_receipt_ref',
              ref: `owner_receipt:stage_${stageNumber}`,
            },
          ],
          properties: [],
          runtime_assumptions: [],
          monitor_refs: [{ ref_kind: 'json_pointer', ref: `/runtime_inventory/stage_${stageNumber}`, role: 'runtime_assumption_monitor' }],
          source_scope_refs: [{ ref_kind: 'json_pointer', ref: `/source_scope/stage_${stageNumber}`, role: 'launch_source_scope' }],
          cohort_query_refs: [{ ref_kind: 'json_pointer', ref: `/cohort_query/stage_${stageNumber}`, role: 'cohort_query' }],
          trigger_refs: [{ ref_kind: 'queue_ref', ref: `queue:${targetDomainId}/stage_${stageNumber}`, role: 'launch_trigger' }],
          dashboard_metric_refs: [{ ref_kind: 'metric_ref', ref: `metric:${targetDomainId}.stage_${stageNumber}`, role: 'operator_metric' }],
          artifact_scope_refs: [],
          workspace_scope_refs: [],
        },
        trust_boundary: {
          lane: 'domain_agent',
          static_check_eligible: false,
          effect_boundary: false,
          runtime_guard_required: true,
          records_runtime_events: true,
          runtime_event_refs: [`runtime_event:${targetDomainId}.stage_${stageNumber}`],
        },
        authority_boundary: { opl_role: 'projection_consumer_only', can_write_domain_truth: false },
      };
    }),
    notes: [],
  };
}

function withReplayEvidenceStagePack(
  payload: JsonRecord,
  targetDomainId: string,
  owner: string,
  options: { stage2HumanGate?: boolean } = {},
) {
  return attachManifestSurface(
    attachManifestSurface(payload, 'family_action_catalog', buildAdmittedActionCatalog(targetDomainId, owner, options)),
    'family_stage_control_plane',
    buildAdmittedStagePlane(targetDomainId, owner),
  );
}

test('family stage replay drilldowns consume declared replay evidence refs by default', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-stage-replay-drilldown-state-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  const manifest = withReplayEvidenceStagePack(fixtures.medautoscience as JsonRecord, 'med-autoscience', 'MedAutoScience');

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
    ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });

    const replay = runCli(['stages', 'replay-certification', '--domain', 'mas'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    }).family_stage_replay_certification.certification;
    const sourceSpec = runCli(['stages', 'source-spec', '--domain', 'mas'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    }).family_stage_pack_source_spec.source_spec;

    assert.equal(replay.replay_status, 'replay_ready');
    assert.equal(replay.summary.blocker_count, 0);
    assert.equal(replay.summary.append_only_event_log_ref_count, 1);
    assert.equal(replay.summary.attempt_ledger_ref_count, 1);
    assert.equal(replay.summary.missing_runtime_event_ref_count, 0);
    assert.equal(replay.summary.missing_receipt_ref_count, 0);
    assert.equal(sourceSpec.diff_keys.replay_status, 'replay_ready');
    assert.equal(sourceSpec.diff_keys.replay_evidence_refs.length, 12);
    assert.equal(sourceSpec.diff_keys.replay_evidence_refs.includes('runtime_event:med-autoscience.stage_1'), true);
    assert.equal(sourceSpec.diff_keys.replay_evidence_refs.includes('owner_receipt:stage_1'), true);
    assert.equal(replay.authority_boundary.can_write_domain_truth, false);
    assert.equal(replay.authority_boundary.can_authorize_quality_verdict, false);
    assert.equal(sourceSpec.body_policy.includes_artifact_body, false);
    assert.equal(sourceSpec.body_policy.executes_stage, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family stage readiness exposes missing human gate replay refs as refs-only workorders', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-stage-human-gate-workorder-state-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  const manifest = withReplayEvidenceStagePack(
    fixtures.medautoscience as JsonRecord,
    'med-autoscience',
    'MedAutoScience',
    { stage2HumanGate: true },
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
    ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });

    const readiness = runCli(['stages', 'readiness', '--domain', 'mas', '--detail', 'full'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    }).family_stage_readiness.family_stage_readiness;
    const replay = runCli(['stages', 'replay-certification', '--domain', 'mas'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    }).family_stage_replay_certification.certification;

    assert.equal(readiness.launch_readiness_status, 'launch_warning');
    assert.equal(readiness.summary.hard_blocker_count, 0);
    assert.equal(readiness.summary.replay_evidence_warning_count, 1);
    const replayWarning = readiness.warnings.find((entry: { code: string; stage_id: string }) => (
      entry.code === 'expected_receipt_ref_missing' && entry.stage_id === 'stage_2'
    ));
    assert.equal(replayWarning?.payload_workorder.surface_kind, 'opl_stage_replay_missing_receipt_workorder');
    assert.equal(replayWarning?.payload_workorder.missing_ref, 'human_gate:publication_quality_gate');
    assert.equal(replayWarning?.payload_workorder.missing_ref_kind, 'human_gate_ref');
    assert.deepEqual(replayWarning?.payload_workorder.required_return_shapes, [
      'human_gate_receipt_ref',
      'typed_blocker_ref',
    ]);
    assert.equal(replayWarning?.payload_workorder.accepted_payload_paths.success_refs_path.closes_domain_ready, false);
    assert.equal(replayWarning?.payload_workorder.accepted_payload_paths.typed_blocker_path.success_claimed, false);
    assert.equal(replayWarning?.payload_workorder.authority_boundary.can_requery_human, false);
    assert.equal(replayWarning?.payload_workorder.authority_boundary.can_create_owner_receipt, false);
    assert.equal(replay.replay_status, 'blocked');
    assert.equal(replay.summary.missing_receipt_ref_count, 1);
    assert.equal(replay.blockers[0]?.payload_workorder.required_success_ref, 'human_gate:publication_quality_gate');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('OMA stage decomposition consumes hosted replay refs and preserves baseline owner review gate', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-oma-stage-replay-state-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();

  try {
    const readinessOutput = runCli(['stages', 'readiness', '--domain', 'oma', '--detail', 'full'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    }).family_stage_readiness as JsonRecord;
    const readiness = (
      ((readinessOutput.family_stage_readiness as JsonRecord | undefined)?.family_stage_readiness as JsonRecord | undefined)
      ?? readinessOutput.family_stage_readiness
      ?? readinessOutput
    ) as {
      summary: { hard_blocker_count: number };
      blockers?: Array<{ code: string }>;
      hard_blockers?: Array<{ code: string }>;
      warnings: Array<{ code: string; minimal_counterexample?: { missing_ref?: string } }>;
    };
    const blockerCodes = (readiness.blockers ?? readiness.hard_blockers ?? [])
      .map((finding: { code: string }) => finding.code);
    const replayWarnings = readiness.warnings.filter((finding: {
      code: string;
      minimal_counterexample?: { missing_ref?: string };
    }) => finding.code === 'expected_receipt_ref_missing');
    const missingReplayRefs = replayWarnings.map((finding: {
      minimal_counterexample?: { missing_ref?: string };
    }) => finding.minimal_counterexample?.missing_ref);
    const warningCodes = readiness.warnings.map((finding: { code: string }) => finding.code);

    assert.equal(readiness.summary.hard_blocker_count, 0);
    assert.equal(blockerCodes.includes('missing_progress_delta_policy'), false);
    assert.equal(blockerCodes.includes('missing_typed_blocker_lineage_policy'), false);
    assert.equal(warningCodes.includes('append_only_event_log_ref_missing'), false);
    assert.equal(warningCodes.includes('attempt_ledger_ref_missing'), false);
    assert.equal(missingReplayRefs.includes('stage-attempt-receipt-ref:stage-decomposition'), false);
    assert.equal(missingReplayRefs.includes('executor-receipt-ref:stage-decomposition/codex-cli'), false);
    assert.equal(missingReplayRefs.includes('independent-gate-receipt-ref:stage-decomposition'), false);
    assert.equal(missingReplayRefs.includes('human_gate:oma_baseline_owner_review'), true);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

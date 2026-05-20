import { spawnSync } from 'node:child_process';

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

function familyRuntimeEnv(
  stateRoot: string,
  fixtureContractsRoot: string,
  extra: Record<string, string> = {},
) {
  return {
    OPL_STATE_DIR: stateRoot,
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
    ...extra,
  };
}

function productionCloseoutStage(stageId: string, owner: string) {
  return {
    stage_id: stageId,
    stage_kind: 'creation',
    title: stageId,
    summary: null,
    goal: `Produce ${stageId} refs under domain authority.`,
    owner,
    domain_stage_refs: [stageId],
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
      requires: [`${stageId}:input_ready`],
      ensures: [`${stageId}:output_ready`],
      boundary_assumptions: ['domain_truth_remains_domain_owned'],
      properties: [],
      runtime_event_refs: [`runtime_event:${stageId}.owner_receipt_recorded`],
      runtime_assumptions: [],
      monitor_refs: [{ ref_kind: 'metric_ref', ref: `metric:${stageId}:freshness`, role: 'monitor' }],
      source_scope_refs: [{ ref_kind: 'source_ref', ref: `source:${stageId}`, role: 'source_scope' }],
      cohort_query_refs: [],
      trigger_refs: [],
      metric_refs: [],
      dashboard_metric_refs: [],
      artifact_scope_refs: [],
      workspace_scope_refs: [],
    },
    trust_boundary: {
      lane: 'domain_agent',
      static_check_eligible: false,
      effect_boundary: true,
      records_runtime_events: true,
      runtime_event_refs: [`runtime_event:${stageId}.owner_receipt_recorded`],
      owner_receipt_required: true,
    },
    authority_boundary: {
      opl_role: 'projection_consumer_only',
      expected_receipt_refs: [`owner_receipt:${stageId}`],
      can_write_domain_truth: false,
      can_authorize_quality_verdict: false,
    },
  };
}

function insertProviderCapabilityReceipts(stateRoot: string) {
  runCli(['family-runtime', 'events', 'export'], {
    OPL_STATE_DIR: stateRoot,
  });
  const queueDb = path.join(stateRoot, 'family-runtime', 'queue.sqlite');
  const createdAt = new Date().toISOString();
  const result = spawnSync(process.execPath, [
    '--experimental-strip-types',
    '-e',
    `import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(${JSON.stringify(queueDb)});
const checks = {
  external_temporal_server_reachable: true,
  managed_worker_ready: true,
  worker_completed_attempt: true,
  worker_restart_requery: true,
  signal_history_preserved: true,
  typed_closeout_required_for_completed: true,
  missing_closeout_blocks_completion: true,
  retry_or_dead_letter_boundary_observed: true,
  domain_truth_boundary_preserved: true
};
db.prepare("INSERT INTO events(event_id, task_id, domain_id, event_type, source, payload_json, created_at) VALUES (?, NULL, NULL, ?, ?, ?, ?)")
  .run(
    'evt_production_closeout_provider_proof',
    'temporal_residency_proof',
    'test',
    JSON.stringify({
      provider_kind: 'temporal',
      proof_mode: 'external_temporal_service_worker',
      closeout_status: 'production_residency_proven',
      proof_receipt: {
        receipt_kind: 'temporal_production_residency_proof',
        receipt_status: 'proven',
        provider_kind: 'temporal'
      }
    }),
    ${JSON.stringify(createdAt)}
  );
db.prepare("INSERT INTO events(event_id, task_id, domain_id, event_type, source, payload_json, created_at) VALUES (?, NULL, NULL, ?, ?, ?, ?)")
  .run(
    'evt_production_closeout_provider_capability',
    'temporal_provider_slo_execution_receipt',
    'test',
    JSON.stringify({
      surface_kind: 'opl_temporal_provider_slo_execution_receipt',
      provider_kind: 'temporal',
      command: 'opl family-runtime residency proof --provider temporal --production',
      execution_status: 'executed',
      receipt_status: 'proven',
      receipt_kind: 'opl_temporal_provider_slo_execution_receipt',
      production_capability_receipt: {
        surface_kind: 'opl_temporal_provider_production_capability_receipt',
        provider_kind: 'temporal',
        receipt_status: 'proven',
        capability_status: 'capability_proven',
        checks,
        failed_check_ids: [],
        proven_check_count: Object.keys(checks).length,
        required_check_count: Object.keys(checks).length
      },
      repair_receipt: {
        repair_status: 'executed',
        can_execute_domain_repair: false
      },
      authority_boundary: {
        can_authorize_domain_ready: false
      }
    }),
    ${JSON.stringify(createdAt)}
  );
db.close();`,
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_NO_WARNINGS: '1',
    },
  });
  assert.equal(result.status, 0, result.stderr);
}

function withProductionCloseoutSurfaces(
  manifest: Record<string, unknown>,
  stageIds: string[],
  options: {
    externalEvidenceRequestCount?: number;
    evidenceGateCount?: number;
    cleanupReady?: boolean;
  } = {},
): Record<string, unknown> {
  if (manifest.product_entry_manifest && typeof manifest.product_entry_manifest === 'object') {
    return {
      ...manifest,
      product_entry_manifest: withProductionCloseoutSurfaces(
        manifest.product_entry_manifest as Record<string, unknown>,
        stageIds,
        options,
      ),
    };
  }
  const targetDomainId = String(manifest.target_domain_id);
  const owner = targetDomainId;
  const externalEvidenceRequestCount = options.externalEvidenceRequestCount ?? 0;
  const evidenceGateCount = options.evidenceGateCount ?? 0;
  return {
    ...manifest,
    family_stage_control_plane: {
      surface_kind: 'family_stage_control_plane',
      version: 'family-stage-control-plane.v1',
      plane_id: `${targetDomainId}_production_closeout_plane`,
      target_domain_id: targetDomainId,
      owner,
      authority_boundary: { opl_role: 'projection_consumer_only' },
      stages: stageIds.map((stageId) => productionCloseoutStage(stageId, owner)),
      notes: [],
    },
    functional_privatization_audit: {
      target_domain_id: targetDomainId,
      modules: [
        {
          module_id: `${targetDomainId}:safe-action-boundary`,
          migration_class: 'refs_only_domain_adapter',
          owner,
        },
      ],
      external_evidence_request_pack: {
        request_pack_id: `${targetDomainId}.external_evidence_request_pack.fixture`,
        owner,
        request_owner: owner,
        requested_from: ['one-person-lab'],
        policy: 'request_refs_receipt_shapes_only',
        requests: Array.from({ length: externalEvidenceRequestCount }, (_, index) => ({
          request_id: `external_evidence_${index + 1}`,
          status: 'requested_not_received',
          required_evidence_refs: [`${targetDomainId}:external:evidence:${index + 1}`],
          required_return_shapes: ['domain_owner_receipt'],
          required_receipt_shapes: ['receipt_ref'],
          forbidden_payload_classes: ['domain_truth_body', 'artifact_body'],
          accepted_payload_policy: 'refs_only',
          source_pointer: `/functional_privatization_audit/external_evidence_request_pack/requests/${index}`,
        })),
      },
      bridge_exit_gate: {
        remaining_evidence_gate_ids: Array.from(
          { length: evidenceGateCount },
          (_, index) => `evidence_gate_${index + 1}`,
        ),
        remaining_bridge_module_ids: [],
        source_refs: [`${targetDomainId}:bridge_exit_gate`],
      },
    },
    standard_domain_agent_skeleton: {
      surface_kind: 'standard_domain_agent_skeleton',
      version: 'standard-domain-agent-skeleton.v1',
      agent_id: targetDomainId,
      repo_source_boundary: {
        required_dirs: ['agent', 'contracts', 'runtime', 'docs'],
        forbidden_dirs: ['artifacts'],
      },
      artifact_boundary: {
        repo_contains_real_artifacts: false,
        artifact_roots_are_locators: true,
        workspace_artifact_locator_refs: [`workspace:${targetDomainId}:artifacts`],
        runtime_artifact_locator_refs: [`runtime:${targetDomainId}:receipts`],
      },
      authority_boundary: {
        opl: 'framework_transport_and_projection_only',
        domain: 'truth_quality_artifact_owner',
      },
    },
    physical_skeleton_follow_through: {
      source_refs: ['agent/README.md', 'contracts/README.md', 'runtime/README.md', 'docs/status.md'],
      direct_skill_parity_refs: [`proof:${targetDomainId}:direct-skill-parity`],
      opl_hosted_parity_refs: [`proof:${targetDomainId}:opl-hosted-parity`],
      replacement_parity_refs: [`proof:${targetDomainId}:replacement-parity`],
      provenance_refs: [`docs/history/${targetDomainId}-legacy-tombstone.md`],
      legacy_active_path_policy: 'physically_removed_or_history_tombstone_only',
      legacy_active_path_residue: options.cleanupReady === false
        ? []
        : [
            {
              path_family: `${targetDomainId}:legacy-runtime`,
              state: 'tombstone_only',
              evidence_ref: `docs/history/${targetDomainId}-legacy-runtime-tombstone.md`,
            },
          ],
    },
    legacy_retirement_tombstone_proof: {
      status: 'no_active_default_caller_proven',
      active_default_callers: [],
      tombstone_refs: [`docs/history/${targetDomainId}-legacy-runtime-tombstone.md`],
      source_refs: [`docs/decisions.md#${targetDomainId}-legacy-runtime`],
    },
  };
}

test('family-runtime production-closeout summarizes OPL-owned safe-action closure without domain authority', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-production-closeout-state-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const baseManifests = loadFamilyManifestFixtures();
  const manifests = {
    medautogrant: withProductionCloseoutSurfaces(
      baseManifests.medautogrant,
      ['fundability_strategy', 'specific_aims_and_structure', 'proposal_authoring'],
      { externalEvidenceRequestCount: 6, cleanupReady: true },
    ),
    medautoscience: withProductionCloseoutSurfaces(
      baseManifests.medautoscience,
      [
        'direction_and_route_selection',
        'baseline_and_evidence_setup',
        'bounded_analysis_campaign',
        'manuscript_authoring',
        'review_and_quality_gate',
        'finalize_and_publication_handoff',
      ],
      { cleanupReady: true },
    ),
    redcube: withProductionCloseoutSurfaces(
      baseManifests.redcube,
      [
        'source_intake',
        'communication_strategy',
        'visual_direction',
        'artifact_creation',
        'review_and_revision',
        'package_and_handoff',
      ],
      { evidenceGateCount: 3, cleanupReady: true },
    ),
  };

  try {
    for (const [project, manifest] of Object.entries(manifests)) {
      runCli([
        'workspace',
        'bind',
        '--project',
        project,
        '--path',
        repoRoot,
        '--manifest-command',
        buildManifestCommand(manifest),
      ], {
        ...familyRuntimeEnv(stateRoot, fixtureContractsRoot),
      });
    }

    const output = runCli([
      'family-runtime',
      'evidence-worklist',
      '--family-defaults',
      '--provider',
      'temporal',
      '--executor-kind',
      'codex_cli',
    ], {
      ...familyRuntimeEnv(stateRoot, fixtureContractsRoot),
    });
    const closeout = output.family_runtime_production_closeout;

    assert.equal(closeout.surface_kind, 'opl_family_runtime_evidence_worklist');
    assert.equal(closeout.surface_role, 'derived_operator_attention_lens');
    assert.equal(closeout.worklist_role, 'refs_only_operator_evidence_worklist');
    assert.equal(closeout.command_alias, 'evidence-worklist');
    assert.equal(closeout.detail_level, 'summary');
    assert.equal(
      closeout.projection_detail_policy,
      'attention_first_default_full_refs_via_explicit_drilldown',
    );
    assert.equal(
      closeout.lens_policy,
      'derived_attention_lens_over_open_safe_action_request_apply_verify_routes',
    );
    assert.equal(closeout.closeout_mode, 'dry_run_summary');
    assert.equal(closeout.family_defaults, true);
    assert.equal(closeout.selected_provider, 'temporal');
    assert.equal(closeout.effective_provider, 'temporal');
    assert.equal(closeout.selected_executor_kind, 'codex_cli');
    assert.equal(closeout.summary.domain_ready_authorized, false);
    assert.equal(closeout.summary.production_ready_authorized, false);
    assert.equal(closeout.summary.closeout_item_count, 49);
    assert.equal(closeout.summary.open_worklist_item_count, 49);
    assert.equal(closeout.summary.closed_refs_only_item_count, 0);
    assert.equal(closeout.summary.stage_receipt_freshness_open_workorder_count > 0, true);
    assert.equal(closeout.summary.open_safe_action_item_count, 49);
    assert.equal(closeout.summary.production_closeout_open_safe_action_item_count.value, 49);
    assert.equal(
      closeout.summary.production_closeout_open_safe_action_item_count.deprecated_alias_of,
      'open_worklist_item_count',
    );
    assert.equal(closeout.production_closeout_open_safe_action_item_count.value, 49);
    assert.equal(closeout.open_worklist_item_count, 49);
    assert.equal(closeout.closed_refs_only_item_count, 0);
    assert.equal(
      closeout.stage_receipt_freshness_open_workorder_count,
      closeout.summary.stage_receipt_freshness_open_workorder_count,
    );
    assert.equal(closeout.summary.closed_item_count, 0);
    assert.equal(closeout.counts.open_safe_action_item_count, 49);
    assert.equal(closeout.counts.open_worklist_item_count, 49);
    assert.equal(closeout.counts.next_action_item_count, 49);
    assert.deepEqual(closeout.full_detail_args, ['--detail', 'full']);
    assert.match(closeout.full_detail_command, /evidence-worklist .*--detail full --json/);
    assert.equal(closeout.closeout_items, undefined);
    assert.equal(closeout.attention_queue, undefined);
    assert.equal(closeout.next_action_ledger, undefined);
    assert.equal(closeout.next_safe_actions.length <= 5, true);
    assert.equal(closeout.next_safe_actions.length > 0, true);
    assert.equal(closeout.next_safe_actions[0].owner, 'opl');
    assert.equal(closeout.next_safe_actions[0].closeout_item_is_completion_claim, false);
    assert.equal(typeof closeout.next_safe_actions[0].next_safe_action_ref, 'string');
    assert.equal(closeout.next_safe_actions[0].next_safe_action_ref.length > 0, true);
    assert.equal(closeout.authority_boundary.can_write_domain_truth, false);
    assert.equal(closeout.authority_boundary.can_authorize_domain_ready, false);
    assert.equal(closeout.authority_boundary.can_authorize_quality_verdict, false);
    assert.equal(closeout.authority_boundary.can_claim_production_ready, false);

    const fullOutput = runCli([
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
    const fullCloseout = fullOutput.family_runtime_production_closeout;
    assert.equal(fullCloseout.detail_level, 'full');
    assert.equal(fullCloseout.command_alias, 'evidence-worklist');
    assert.equal(fullCloseout.closeout_items.length, 49);
    assert.equal(fullCloseout.attention_queue.length, 49);

    const stageItem = fullCloseout.closeout_items.find(
      (item: { claim_scope: string }) => item.claim_scope === 'stage_production_caller_request',
    ) ?? fullCloseout.closeout_items[0];
    assert.equal(stageItem.owner, 'opl');
    assert.equal(stageItem.status, 'open_safe_action_request_route_available');
    assert.equal(stageItem.closeout_item_is_completion_claim, false);
    assert.equal(stageItem.route_status, 'request_route_available');
    assert.equal(stageItem.route_semantics, 'open_safe_action_request_apply_verify_route');
    assert.equal(stageItem.receipt_ref, null);
    assert.equal(stageItem.typed_blocker_ref, null);
    assert.equal(stageItem.evidence_requirement_model, 'evidence_requirement.v1');
    assert.equal(stageItem.evidence_requirement.requirement_id, stageItem.tail_id);
    assert.equal(stageItem.evidence_requirement.requirement_kind, stageItem.tail_item);
    assert.equal(stageItem.evidence_requirement.owner, stageItem.owner);
    assert.equal(stageItem.evidence_requirement.domain_id, stageItem.domain_id ?? stageItem.owner);
    assert.equal(stageItem.evidence_requirement.status, 'open');
    assert.equal(stageItem.evidence_requirement.current_ref, stageItem.replay_ref);
    assert.equal(stageItem.not_authorized_claims.includes('domain_ready'), true);
    assert.equal(stageItem.not_authorized_claims.includes('quality_verdict'), true);
    assert.equal(fullCloseout.next_action_ledger.surface_kind, 'opl_family_runtime_production_tail_next_action_ledger');
    assert.equal(fullCloseout.next_action_ledger.summary.next_action_item_count, fullCloseout.attention_queue.length);
    assert.equal(fullCloseout.next_action_ledger.authority_boundary.can_read_memory_body, false);
    assert.equal(fullCloseout.next_action_ledger.authority_boundary.can_read_artifact_body, false);
    assert.equal(fullCloseout.next_action_ledger.authority_boundary.can_claim_receipt_closure, false);
    const stageNextAction = fullCloseout.next_action_ledger.next_action_items.find(
      (item: { source_tail_item_id: string }) => item.source_tail_item_id === stageItem.item_id,
    );
    assert.equal(stageNextAction.owner, 'opl');
    assert.equal(stageNextAction.domain, stageItem.domain_id ?? stageItem.owner);
    assert.equal(stageNextAction.stage_or_request, stageItem.stage_id ?? stageItem.claim_scope);
    assert.equal(stageNextAction.required_receipt_type.length > 0, true);
    assert.equal(stageNextAction.current_ref, stageItem.replay_ref);
    assert.equal(stageNextAction.evidence_requirement_model, 'evidence_requirement.v1');
    assert.equal(stageNextAction.evidence_requirement.requirement_id, stageItem.tail_id);
    assert.equal(stageNextAction.evidence_requirement.owner, stageItem.owner);
    assert.equal(stageNextAction.evidence_requirement.domain_id, stageItem.domain_id ?? stageItem.owner);
    assert.equal(stageNextAction.evidence_requirement.status, 'open');
    assert.equal(stageNextAction.next_safe_action_route, stageItem.replay_ref);
    assert.equal(stageNextAction.authority_boundary.can_write_domain_truth, false);
    assert.equal(stageNextAction.authority_boundary.can_read_memory_body, false);
    assert.equal(fullCloseout.evidence_requirement_ledger.model_version, 'evidence_requirement.v1');
    assert.equal(
      fullCloseout.evidence_requirement_ledger.summary.requirement_count,
      fullCloseout.closeout_items.length,
    );
    assert.equal(
      fullCloseout.evidence_requirement_ledger.summary.open_requirement_count,
      fullCloseout.attention_queue.length,
    );
    assert.equal(fullCloseout.evidence_requirement_ledger.authority_boundary.refs_only, true);
    assert.equal(fullCloseout.evidence_requirement_ledger.authority_boundary.can_write_domain_truth, false);
    assert.equal(fullCloseout.evidence_requirement_ledger.authority_boundary.can_read_memory_body, false);
    assert.equal(fullCloseout.evidence_requirement_ledger.authority_boundary.can_claim_production_ready, false);
    const workorderPacket = fullCloseout.stage_evidence_workorder_packet;
    assert.equal(workorderPacket.surface_kind, 'opl_stage_evidence_workorder_packet');
    assert.equal(
      workorderPacket.summary.workorder_count,
      fullCloseout.summary.stage_production_evidence_receipt_item_count,
    );
    assert.equal(
      workorderPacket.summary.route_requires_domain_or_app_payload_count,
      workorderPacket.summary.workorder_count,
    );
    assert.equal(workorderPacket.summary.typed_blocker_path_available_count, workorderPacket.summary.workorder_count);
    assert.equal(workorderPacket.summary.success_payload_owner, 'domain_repository_or_app_live_operator');
    assert.equal(workorderPacket.authority_boundary.can_write_domain_truth, false);
    assert.equal(workorderPacket.authority_boundary.can_generate_domain_owner_receipt, false);
    assert.equal(workorderPacket.authority_boundary.closes_production_ready, false);
    const firstWorkorder = workorderPacket.workorders[0];
    assert.equal(firstWorkorder.payload_owner, 'domain_repository_or_app_live_operator');
    assert.equal(firstWorkorder.route_requires_domain_or_app_payload, true);
    assert.equal(firstWorkorder.can_close_without_domain_or_app_payload, false);
    assert.equal(firstWorkorder.payload_workorder.surface_kind, 'opl_stage_production_evidence_payload_workorder');
    assert.equal(firstWorkorder.authority_boundary.can_read_artifact_body, false);
    assert.equal(fullCloseout.authority_boundary.can_write_domain_truth, false);
    assert.equal(fullCloseout.authority_boundary.can_authorize_quality_verdict, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime production-closeout closes only OPL-owned provider and cleanup receipts', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-production-closeout-closed-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const baseManifests = loadFamilyManifestFixtures();
  const manifests = {
    medautogrant: withProductionCloseoutSurfaces(
      baseManifests.medautogrant,
      ['fundability_strategy', 'specific_aims_and_structure', 'proposal_authoring'],
      { externalEvidenceRequestCount: 6, cleanupReady: true },
    ),
    medautoscience: withProductionCloseoutSurfaces(
      baseManifests.medautoscience,
      [
        'direction_and_route_selection',
        'baseline_and_evidence_setup',
        'bounded_analysis_campaign',
        'manuscript_authoring',
        'review_and_quality_gate',
        'finalize_and_publication_handoff',
      ],
      { cleanupReady: true },
    ),
    redcube: withProductionCloseoutSurfaces(
      baseManifests.redcube,
      [
        'source_intake',
        'communication_strategy',
        'visual_direction',
        'artifact_creation',
        'review_and_revision',
        'package_and_handoff',
      ],
      { evidenceGateCount: 3, cleanupReady: true },
    ),
  };

  try {
    for (const [project, manifest] of Object.entries(manifests)) {
      runCli([
        'workspace',
        'bind',
        '--project',
        project,
        '--path',
        repoRoot,
        '--manifest-command',
        buildManifestCommand(manifest),
      ], familyRuntimeEnv(stateRoot, fixtureContractsRoot));
    }

    insertProviderCapabilityReceipts(stateRoot);
    for (const [domain, actionDomain, sourceRef] of [
      ['medautogrant', 'medautogrant', 'opl://agents/med-autogrant/legacy-cleanup-plan'],
      ['medautoscience', 'medautoscience', 'opl://agents/med-autoscience/legacy-cleanup-plan'],
      ['redcube', 'redcube', 'opl://agents/redcube_ai/legacy-cleanup-plan'],
    ]) {
      const applied = runCli([
        'runtime',
        'action',
        'execute',
        '--action',
        `legacy-cleanup:${actionDomain}:apply`,
      ], familyRuntimeEnv(stateRoot, fixtureContractsRoot));
      assert.equal(applied.runtime_operator_action_execution.execution.execution_status, 'executed');
      const verified = runCli([
        'agents',
        'legacy-cleanup',
        'apply',
        '--domain',
        domain,
        '--mode',
        'verify',
        '--source-ref',
        sourceRef,
      ], familyRuntimeEnv(stateRoot, fixtureContractsRoot));
      assert.equal(
        verified.family_agent_legacy_cleanup_apply.lifecycle_apply.status,
        'verified',
      );
    }

    const output = runCli([
      'family-runtime',
      'production-closeout',
      '--family-defaults',
      '--provider',
      'temporal',
      '--executor-kind',
      'codex_cli',
    ], familyRuntimeEnv(stateRoot, fixtureContractsRoot, {
      OPL_PROVIDER_PROOF_WINDOW_SECONDS: '86400',
    }));
    const closeout = output.family_runtime_production_closeout;

    assert.equal(closeout.surface_kind, 'opl_family_runtime_evidence_worklist');
    assert.equal(closeout.deprecated_alias_of, 'evidence-worklist');
    assert.equal(closeout.deprecated_alias.deprecated_alias_of, 'evidence-worklist');
    assert.equal(closeout.summary.closeout_item_count, 49);
    assert.equal(closeout.summary.closed_item_count, 10);
    assert.equal(closeout.summary.open_worklist_item_count, 39);
    assert.equal(closeout.summary.closed_refs_only_item_count, 10);
    assert.equal(closeout.summary.open_safe_action_item_count, 39);
    assert.equal(closeout.summary.production_closeout_open_safe_action_item_count.value, 39);
    assert.equal(closeout.production_closeout_open_safe_action_item_count.value, 39);
    assert.equal(closeout.open_worklist_item_count, 39);
    assert.equal(closeout.detail_level, 'summary');
    assert.equal(closeout.closeout_items, undefined);
    assert.equal(closeout.attention_queue, undefined);
    assert.equal(closeout.next_action_ledger, undefined);

    const fullOutput = runCli([
      'family-runtime',
      'production-closeout',
      '--family-defaults',
      '--provider',
      'temporal',
      '--executor-kind',
      'codex_cli',
      '--detail',
      'full',
    ], familyRuntimeEnv(stateRoot, fixtureContractsRoot, {
      OPL_PROVIDER_PROOF_WINDOW_SECONDS: '86400',
    }));
    const fullCloseout = fullOutput.family_runtime_production_closeout;
    assert.equal(fullCloseout.detail_level, 'full');
    assert.equal(fullCloseout.attention_queue.length, 39);

    const providerItems = fullCloseout.closeout_items.filter((item: { claim_scope: string }) =>
      item.claim_scope === 'provider_scheduler_cadence'
    );
    assert.equal(providerItems.length, 4);
    assert.equal(
      providerItems.every((item: { status: string }) =>
        item.status === 'closed_by_receipt_ref'
      ),
      true,
    );
    assert.equal(
      providerItems.every((item: { closeout_status_detail: string }) =>
        item.closeout_status_detail === 'closed_by_opl_provider_slo_receipt'
      ),
      true,
    );
    assert.equal(
      providerItems.every((item: { receipt_ref: string | null }) =>
        item.receipt_ref === 'opl://family-runtime/provider-slo/cadence-window/current'
      ),
      true,
    );

    const cleanupItems = fullCloseout.closeout_items.filter((item: { claim_scope: string }) =>
      item.claim_scope === 'legacy_cleanup_ledger'
    );
    assert.equal(cleanupItems.length, 6);
    assert.equal(
      cleanupItems.every((item: { status: string }) =>
        item.status === 'closed_by_receipt_ref'
      ),
      true,
    );
    assert.equal(
      cleanupItems.every((item: { closeout_status_detail: string }) =>
        item.closeout_status_detail === 'closed_by_opl_cleanup_ledger_receipt'
      ),
      true,
    );
    assert.equal(
      cleanupItems.every((item: { receipt_refs: string[] }) =>
        item.receipt_refs.length > 0
      ),
      true,
    );

    const externalItems = fullCloseout.closeout_items.filter((item: { claim_scope: string }) =>
      item.claim_scope === 'external_evidence_receipt'
    );
    const gateItems = fullCloseout.closeout_items.filter((item: { claim_scope: string }) =>
      item.claim_scope === 'evidence_gate_receipt'
    );
    const stageItems = fullCloseout.closeout_items.filter((item: { claim_scope: string }) =>
      item.claim_scope === 'stage_production_caller_request'
    );
    const stageEvidenceItems = fullCloseout.closeout_items.filter((item: { claim_scope: string }) =>
      item.claim_scope === 'stage_production_evidence_receipt'
    );
    for (const item of [...externalItems, ...gateItems, ...stageItems]) {
      assert.equal(item.status, 'open_safe_action_request_route_available');
      assert.equal(item.receipt_ref, null);
    }
    assert.equal(stageEvidenceItems.length > 0, true);
    assert.equal(
      stageEvidenceItems.every((item: {
        status: string;
        route_requires_domain_or_app_payload: boolean;
        payload_owner: string;
      }) =>
        item.status === 'open_safe_action_request_route_available'
        && item.route_requires_domain_or_app_payload
        && item.payload_owner === 'domain_repository_or_app_live_operator'
      ),
      true,
    );
    assert.equal(
      fullCloseout.summary.stage_production_evidence_receipt_requires_domain_or_app_payload_count,
      stageEvidenceItems.length,
    );
    assert.equal(fullCloseout.next_action_ledger.summary.next_action_item_count, 39);
    assert.equal(fullCloseout.authority_boundary.can_write_domain_truth, false);
    assert.equal(fullCloseout.authority_boundary.can_claim_production_ready, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime production-closeout classifies verified external blockers without production authority', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-production-closeout-external-blocker-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const baseManifests = loadFamilyManifestFixtures();
  const manifests = {
    medautogrant: withProductionCloseoutSurfaces(
      baseManifests.medautogrant,
      ['fundability_strategy', 'specific_aims_and_structure', 'proposal_authoring'],
      { externalEvidenceRequestCount: 6 },
    ),
    medautoscience: withProductionCloseoutSurfaces(
      baseManifests.medautoscience,
      [
        'direction_and_route_selection',
        'baseline_and_evidence_setup',
        'bounded_analysis_campaign',
        'manuscript_authoring',
        'review_and_quality_gate',
        'finalize_and_publication_handoff',
      ],
    ),
    redcube: withProductionCloseoutSurfaces(
      baseManifests.redcube,
      [
        'source_intake',
        'communication_strategy',
        'visual_direction',
        'artifact_creation',
        'review_and_revision',
        'package_and_handoff',
      ],
      { evidenceGateCount: 3 },
    ),
  };

  try {
    for (const [project, manifest] of Object.entries(manifests)) {
      runCli([
        'workspace',
        'bind',
        '--project',
        project,
        '--path',
        repoRoot,
        '--manifest-command',
        buildManifestCommand(manifest),
      ], familyRuntimeEnv(stateRoot, fixtureContractsRoot));
    }

    insertProviderCapabilityReceipts(stateRoot);

    const before = runCli([
      'family-runtime',
      'evidence-worklist',
      '--family-defaults',
      '--provider',
      'temporal',
      '--executor-kind',
      'codex_cli',
      '--detail',
      'full',
    ], familyRuntimeEnv(stateRoot, fixtureContractsRoot, {
      OPL_PROVIDER_PROOF_WINDOW_SECONDS: '86400',
    })).family_runtime_production_closeout;

    const externalRecord = before.closeout_items.find((item: { claim_scope: string }) =>
      item.claim_scope === 'external_evidence_receipt'
    );
    const gateRecord = before.closeout_items.find((item: { claim_scope: string }) =>
      item.claim_scope === 'evidence_gate_receipt'
    );
    assert.ok(externalRecord);
    assert.ok(gateRecord);
    assert.equal(externalRecord.status, 'open_safe_action_request_route_available');
    assert.equal(gateRecord.status, 'open_safe_action_request_route_available');

    for (const [item, blockerRef] of [
      [externalRecord, 'mag://blockers/external-evidence-1'],
      [gateRecord, 'rca://blockers/evidence-gate-1'],
    ] as const) {
      const recorded = runCli([
        'runtime',
        'action',
        'execute',
        '--action',
        item.action_id,
        '--payload',
        JSON.stringify({ typed_blocker_refs: [blockerRef] }),
      ], familyRuntimeEnv(stateRoot, fixtureContractsRoot)).runtime_operator_action_execution;
      assert.equal(recorded.execution.execution_kind, 'opl_cli_external_evidence_apply');
      assert.equal(recorded.execution.result.external_evidence_apply.status, 'recorded');
    }

    const recordedCloseout = runCli([
      'family-runtime',
      'evidence-worklist',
      '--family-defaults',
      '--provider',
      'temporal',
      '--executor-kind',
      'codex_cli',
      '--detail',
      'full',
    ], familyRuntimeEnv(stateRoot, fixtureContractsRoot, {
      OPL_PROVIDER_PROOF_WINDOW_SECONDS: '86400',
    })).family_runtime_production_closeout;

    const verifyItems = recordedCloseout.closeout_items.filter((item: { action_kind: string }) =>
      item.action_kind === 'external_evidence_receipt_verify'
      || item.action_kind === 'evidence_gate_receipt_verify'
    );
    assert.equal(verifyItems.length, 2);
    for (const item of verifyItems) {
      const verified = runCli([
        'runtime',
        'action',
        'execute',
        '--action',
        item.action_id,
      ], familyRuntimeEnv(stateRoot, fixtureContractsRoot)).runtime_operator_action_execution;
      assert.equal(verified.execution.execution_kind, 'opl_cli_external_evidence_apply');
      assert.equal(verified.execution.result.external_evidence_apply.status, 'verified');
    }

    const after = runCli([
      'family-runtime',
      'evidence-worklist',
      '--family-defaults',
      '--provider',
      'temporal',
      '--executor-kind',
      'codex_cli',
      '--detail',
      'full',
    ], familyRuntimeEnv(stateRoot, fixtureContractsRoot, {
      OPL_PROVIDER_PROOF_WINDOW_SECONDS: '86400',
    })).family_runtime_production_closeout;

    assert.equal(after.summary.open_safe_action_item_count, 43);
    assert.equal(after.summary.open_worklist_item_count, 43);
    assert.equal(after.summary.closed_item_count, 6);
    assert.equal(after.summary.closed_refs_only_item_count, 6);
    assert.equal(after.next_action_ledger.summary.typed_blocker_tail_item_count, 2);
    assert.equal(after.next_action_ledger.summary.next_action_item_count, 45);
    const blockerItems = after.closeout_items.filter((item: { status: string }) =>
      item.status === 'closed_by_domain_owned_typed_blocker'
    );
    assert.equal(blockerItems.length, 2);
    for (const item of blockerItems) {
      assert.equal(item.closeout_status_detail, 'closed_by_domain_owned_typed_blocker_ref');
      assert.equal(item.typed_blocker_refs.length, 1);
      assert.equal(item.evidence_requirement_model, 'evidence_requirement.v1');
      assert.equal(item.evidence_requirement.requirement_id, item.tail_id);
      assert.equal(item.evidence_requirement.status, 'domain_owned_typed_blocker');
      assert.equal(item.evidence_requirement.typed_blocker_ref, item.typed_blocker_ref);
      assert.equal(item.closeout_item_is_completion_claim, false);
      assert.equal(item.not_authorized_claims.includes('production_ready'), true);
    }
    assert.equal(after.authority_boundary.can_claim_production_ready, false);
    assert.equal(after.authority_boundary.can_authorize_domain_ready, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime production-closeout rejects non-production provider fallback', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-production-closeout-provider-state-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();

  try {
    const failure = runCliFailure([
      'family-runtime',
      'production-closeout',
      '--family-defaults',
      '--provider',
      'local_sqlite',
      '--executor-kind',
      'codex_cli',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
    });

    assert.equal(failure.payload.error.code, 'cli_usage_error');
    assert.match(failure.payload.error.message, /supports only --provider temporal/);
    assert.equal(failure.payload.error.details.provider_kind, 'local_sqlite');
    assert.deepEqual(failure.payload.error.details.allowed_provider_kinds, ['temporal']);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

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
        OPL_STATE_DIR: stateRoot,
        OPL_CONTRACTS_DIR: fixtureContractsRoot,
      });
    }

    const output = runCli([
      'family-runtime',
      'production-closeout',
      '--family-defaults',
      '--provider',
      'temporal',
      '--executor-kind',
      'codex_cli',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const closeout = output.family_runtime_production_closeout;

    assert.equal(closeout.surface_kind, 'opl_family_runtime_production_closeout');
    assert.equal(closeout.surface_role, 'derived_operator_attention_lens');
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
    assert.equal(closeout.summary.closeout_item_count, 34);
    assert.equal(closeout.summary.open_safe_action_item_count, 34);
    assert.equal(closeout.summary.production_closeout_open_safe_action_item_count, 34);
    assert.equal(closeout.production_closeout_open_safe_action_item_count, 34);
    assert.equal(closeout.summary.closed_item_count, 0);
    assert.equal(closeout.attention_queue.length, 34);

    const stageItem = closeout.closeout_items.find(
      (item: { claim_scope: string }) => item.claim_scope === 'stage_production_caller_request',
    ) ?? closeout.closeout_items[0];
    assert.equal(stageItem.owner, 'opl');
    assert.equal(stageItem.status, 'open_safe_action_request_route_available');
    assert.equal(stageItem.closeout_item_is_completion_claim, false);
    assert.equal(stageItem.route_status, 'request_route_available');
    assert.equal(stageItem.route_semantics, 'open_safe_action_request_apply_verify_route');
    assert.equal(stageItem.receipt_ref, null);
    assert.equal(stageItem.typed_blocker_ref, null);
    assert.equal(stageItem.not_authorized_claims.includes('domain_ready'), true);
    assert.equal(stageItem.not_authorized_claims.includes('quality_verdict'), true);
    assert.equal(closeout.next_action_ledger.surface_kind, 'opl_family_runtime_production_tail_next_action_ledger');
    assert.equal(closeout.next_action_ledger.summary.next_action_item_count, closeout.attention_queue.length);
    assert.equal(closeout.next_action_ledger.authority_boundary.can_read_memory_body, false);
    assert.equal(closeout.next_action_ledger.authority_boundary.can_read_artifact_body, false);
    assert.equal(closeout.next_action_ledger.authority_boundary.can_claim_receipt_closure, false);
    const stageNextAction = closeout.next_action_ledger.next_action_items.find(
      (item: { source_tail_item_id: string }) => item.source_tail_item_id === stageItem.item_id,
    );
    assert.equal(stageNextAction.owner, 'opl');
    assert.equal(stageNextAction.domain, stageItem.domain_id ?? stageItem.owner);
    assert.equal(stageNextAction.stage_or_request, stageItem.stage_id ?? stageItem.claim_scope);
    assert.equal(stageNextAction.required_receipt_type.length > 0, true);
    assert.equal(stageNextAction.current_ref, stageItem.replay_ref);
    assert.equal(stageNextAction.next_safe_action_route, stageItem.replay_ref);
    assert.equal(stageNextAction.authority_boundary.can_write_domain_truth, false);
    assert.equal(stageNextAction.authority_boundary.can_read_memory_body, false);
    assert.equal(closeout.authority_boundary.can_write_domain_truth, false);
    assert.equal(closeout.authority_boundary.can_authorize_quality_verdict, false);
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

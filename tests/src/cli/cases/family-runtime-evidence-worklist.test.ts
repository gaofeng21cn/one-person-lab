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
  familyRuntimeEnv,
  insertProviderCapabilityReceipts,
  withEvidenceWorklistSurfaces,
} from './family-runtime-evidence-worklist-helpers.ts';
import {
  assertDomainDispatchGroupExecutorHints,
} from './domain-dispatch-group-executor-hints-assertions.ts';

test('family-runtime evidence-worklist summarizes OPL-owned safe-action closure without domain authority', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-evidence-worklist-state-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const baseManifests = loadFamilyManifestFixtures();
  const manifests = {
    medautogrant: withEvidenceWorklistSurfaces(
      baseManifests.medautogrant,
      ['fundability_strategy', 'specific_aims_and_structure', 'proposal_authoring'],
      { externalEvidenceRequestCount: 6, cleanupReady: true },
    ),
    medautoscience: withEvidenceWorklistSurfaces(
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
    redcube: withEvidenceWorklistSurfaces(
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
    const worklist = output.family_runtime_evidence_worklist;

    assert.equal(worklist.surface_kind, 'opl_family_runtime_evidence_worklist');
    assert.equal(worklist.surface_role, 'derived_operator_attention_lens');
    assert.equal(worklist.worklist_role, 'refs_only_operator_evidence_worklist');
    assert.equal(worklist.command, 'evidence-worklist');
    assert.equal(worklist.detail_level, 'summary');
    assert.equal(
      worklist.projection_detail_policy,
      'attention_first_default_full_refs_via_explicit_drilldown',
    );
    assert.equal(
      worklist.lens_policy,
      'derived_attention_lens_over_open_safe_action_request_apply_verify_routes',
    );
    assert.equal(worklist.worklist_summary_mode, 'dry_run_summary');
    assert.equal(worklist.family_defaults, true);
    assert.equal(worklist.selected_provider, 'temporal');
    assert.equal(worklist.effective_provider, 'temporal');
    assert.equal(worklist.selected_executor_kind, 'codex_cli');
    assert.equal(worklist.summary.domain_ready_authorized, false);
    assert.equal(worklist.summary.production_ready_authorized, false);
    assert.equal(worklist.summary.worklist_item_count, 49);
    assert.equal(worklist.summary.open_worklist_item_count, 18);
    assert.equal(worklist.summary.default_caller_deletion_audit_lane_item_count, 0);
    assert.equal(worklist.summary.default_caller_deletion_open_safe_action_item_count, 0);
    assert.equal(worklist.summary.closed_refs_only_item_count, 0);
    assert.equal(worklist.summary.stage_receipt_freshness_open_workorder_count > 0, true);
    assert.equal(worklist.summary.open_safe_action_item_count, 18);
    assert.equal(
      worklist.summary.open_safe_action_payload_requirement_semantics,
      'open_safe_action_payload_required_is_domain_or_app_live_refs_payload_subset_not_opl_self_closure',
    );
    assert.equal(
      worklist.summary.open_safe_action_payload_required_item_count
        + worklist.summary.open_safe_action_payload_free_item_count,
      worklist.summary.open_safe_action_item_count,
    );
    assert.equal(worklist.summary.open_safe_action_payload_required_item_count, 0);
    assert.equal(Object.hasOwn(worklist.summary, 'production_closeout_open_safe_action_item_count'), false);
    assert.equal(Object.hasOwn(output, 'family_runtime_production_closeout'), false);
    assert.equal(Object.hasOwn(worklist, 'production_closeout_open_safe_action_item_count'), false);
    assert.equal(worklist.open_worklist_item_count, 18);
    assert.equal(worklist.closed_refs_only_item_count, 0);
    assert.equal(
      worklist.open_safe_action_payload_required_item_count,
      worklist.summary.open_safe_action_payload_required_item_count,
    );
    assert.equal(
      worklist.open_safe_action_payload_free_item_count,
      worklist.summary.open_safe_action_payload_free_item_count,
    );
    assert.equal(
      worklist.open_safe_action_payload_requirement_semantics,
      worklist.summary.open_safe_action_payload_requirement_semantics,
    );
    assert.equal(
      worklist.stage_receipt_freshness_open_workorder_count,
      worklist.summary.stage_receipt_freshness_open_workorder_count,
    );
    assert.equal(worklist.summary.closed_worklist_item_count, 1);
    assert.equal(worklist.counts.open_safe_action_item_count, 18);
    assert.equal(
      worklist.counts.open_safe_action_payload_required_item_count,
      worklist.summary.open_safe_action_payload_required_item_count,
    );
    assert.equal(
      worklist.counts.open_safe_action_payload_free_item_count,
      worklist.summary.open_safe_action_payload_free_item_count,
    );
    assert.equal(worklist.counts.open_worklist_item_count, 18);
    assert.equal(worklist.counts.next_action_item_count, 18);
    assert.deepEqual(worklist.full_detail_args, ['--detail', 'full']);
    assert.match(worklist.full_detail_command, /evidence-worklist .*--detail full --json/);
    assert.equal(worklist.worklist_items, undefined);
    assert.equal(worklist.attention_queue, undefined);
    assert.equal(worklist.next_action_ledger, undefined);
    assert.equal(worklist.next_safe_actions.length <= 5, true);
    assert.equal(worklist.next_safe_actions.length > 0, true);
    assert.equal(typeof worklist.next_safe_actions[0].owner, 'string');
    assert.equal(worklist.next_safe_actions[0].worklist_item_is_completion_claim, false);
    assert.equal(worklist.next_safe_actions[0].can_write_domain_truth, false);
    assert.equal(worklist.next_safe_actions[0].can_claim_domain_ready, false);
    assert.equal(worklist.next_safe_actions[0].can_claim_production_ready, false);
    assert.equal(typeof worklist.next_safe_actions[0].next_safe_action_ref, 'string');
    assert.equal(worklist.next_safe_actions[0].next_safe_action_ref.length > 0, true);
    assert.equal(worklist.authority_boundary.can_write_domain_truth, false);
    assert.equal(worklist.authority_boundary.can_authorize_domain_ready, false);
    assert.equal(worklist.authority_boundary.can_authorize_quality_verdict, false);
    assert.equal(worklist.authority_boundary.can_claim_production_ready, false);

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
    const fullWorklist = fullOutput.family_runtime_evidence_worklist;
    assert.equal(fullWorklist.detail_level, 'full');
    assert.equal(fullWorklist.command, 'evidence-worklist');
    assert.equal(fullWorklist.worklist_items.length, 49);
    assert.equal(
      fullWorklist.worklist_items.every((item: {
        worklist_lane: string;
        default_owner_delta_eligible: boolean;
      }) =>
        ['ordinary', 'audit', 'cleanup', 'diagnostic'].includes(item.worklist_lane)
        && typeof item.default_owner_delta_eligible === 'boolean'
      ),
      true,
    );
    assert.equal(fullWorklist.attention_queue.length, 18);
    assert.equal(
      fullWorklist.attention_queue.every((item: {
        item_id: string;
      }) =>
        fullWorklist.worklist_items.some((worklistItem: {
          item_id: string;
          worklist_lane: string;
          default_owner_delta_eligible: boolean;
        }) =>
          worklistItem.item_id === item.item_id
          && worklistItem.worklist_lane === 'ordinary'
          && worklistItem.default_owner_delta_eligible === true
        )
      ),
      true,
    );
    assert.equal(
      fullWorklist.summary.open_safe_action_payload_required_item_count,
      fullWorklist.attention_queue.filter((item: { route_requires_domain_or_app_payload: boolean }) =>
        item.route_requires_domain_or_app_payload
      ).length,
    );
    assert.equal(
      fullWorklist.summary.open_safe_action_payload_free_item_count,
      fullWorklist.attention_queue.filter((item: { route_requires_domain_or_app_payload: boolean }) =>
        !item.route_requires_domain_or_app_payload
      ).length,
    );
    assert.equal(Object.hasOwn(fullWorklist, 'production_closeout_open_safe_action_item_count'), false);

    const stageItem = fullWorklist.worklist_items.find(
      (item: { claim_scope: string }) => item.claim_scope === 'stage_production_caller_request',
    ) ?? fullWorklist.worklist_items[0];
    assert.equal(stageItem.owner, 'opl');
    assert.equal(stageItem.status, 'open_safe_action_request_route_available');
    assert.equal(stageItem.worklist_item_is_completion_claim, false);
    assert.equal(stageItem.worklist_lane, 'ordinary');
    assert.equal(stageItem.default_owner_delta_eligible, true);
    assert.equal(stageItem.audit_lane_visible, false);
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
    assert.equal(stageItem.evidence_requirement.requirement_is_completion_claim, false);
    assert.equal(stageItem.evidence_requirement.can_claim_domain_ready, false);
    assert.equal(stageItem.evidence_requirement.can_claim_production_ready, false);
    assert.equal(stageItem.evidence_requirement.can_claim_artifact_authority, false);
    assert.equal(stageItem.evidence_requirement.not_authorized_claims.includes('domain_ready'), true);
    assert.equal(stageItem.evidence_requirement.not_authorized_claims.includes('production_ready'), true);
    assert.equal(stageItem.not_authorized_claims.includes('domain_ready'), true);
    assert.equal(stageItem.not_authorized_claims.includes('quality_verdict'), true);
    assert.equal(fullWorklist.next_action_ledger.surface_kind, 'opl_family_runtime_evidence_worklist_next_action_ledger');
    assert.equal(fullWorklist.next_action_ledger.summary.next_action_item_count, fullWorklist.attention_queue.length);
    assert.equal(fullWorklist.next_action_ledger.authority_boundary.can_read_memory_body, false);
    assert.equal(fullWorklist.next_action_ledger.authority_boundary.can_read_artifact_body, false);
    assert.equal(fullWorklist.next_action_ledger.authority_boundary.can_claim_receipt_closure, false);
    const stageNextAction = fullWorklist.next_action_ledger.next_action_items.find(
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
    assert.equal(stageNextAction.evidence_requirement.requirement_is_completion_claim, false);
    assert.equal(stageNextAction.evidence_requirement.can_claim_domain_ready, false);
    assert.equal(stageNextAction.evidence_requirement.can_claim_production_ready, false);
    assert.equal(stageNextAction.next_safe_action_route, stageItem.replay_ref);
    assert.equal(stageNextAction.authority_boundary.can_write_domain_truth, false);
    assert.equal(stageNextAction.authority_boundary.can_read_memory_body, false);
    assert.equal(fullWorklist.evidence_requirement_ledger.model_version, 'evidence_requirement.v1');
    assert.equal(
      fullWorklist.evidence_requirement_ledger.summary.requirement_count,
      fullWorklist.worklist_items.length,
    );
    assert.equal(
      fullWorklist.evidence_requirement_ledger.summary.open_requirement_count,
      fullWorklist.worklist_items.filter((item: { evidence_requirement: { status: string } }) =>
        item.evidence_requirement.status === 'open'
      ).length,
    );
    assert.equal(fullWorklist.evidence_requirement_ledger.authority_boundary.refs_only, true);
    assert.equal(fullWorklist.evidence_requirement_ledger.authority_boundary.can_write_domain_truth, false);
    assert.equal(fullWorklist.evidence_requirement_ledger.authority_boundary.can_read_memory_body, false);
    assert.equal(fullWorklist.evidence_requirement_ledger.authority_boundary.can_claim_production_ready, false);
    assert.equal(
      fullWorklist.evidence_requirement_ledger.requirements.every((requirement: {
        requirement_is_completion_claim: boolean;
        can_claim_domain_ready: boolean;
        can_claim_production_ready: boolean;
        can_claim_artifact_authority: boolean;
        not_authorized_claims: string[];
      }) =>
        requirement.requirement_is_completion_claim === false
        && requirement.can_claim_domain_ready === false
        && requirement.can_claim_production_ready === false
        && requirement.can_claim_artifact_authority === false
        && requirement.not_authorized_claims.includes('domain_ready')
        && requirement.not_authorized_claims.includes('production_ready')
      ),
      true,
    );
    assert.equal(fullWorklist.evidence_envelope.surface_kind, 'opl_evidence_envelope_projection');
    assert.equal(fullWorklist.evidence_envelope.summary.envelope_count > 0, true);
    assert.equal(fullWorklist.evidence_envelope.summary.open_envelope_count > 0, true);
    assert.equal(
      fullWorklist.evidence_envelope.summary.open_envelope_count
        + fullWorklist.evidence_envelope.summary.closed_envelope_count
        + fullWorklist.evidence_envelope.summary.blocked_envelope_count,
      fullWorklist.evidence_envelope.summary.envelope_count,
    );
    assert.equal(fullWorklist.evidence_envelope.summary.domain_ready_claim_count, 0);
    assert.equal(fullWorklist.evidence_envelope.summary.production_ready_claim_count, 0);
    assert.equal(fullWorklist.evidence_envelope.summary.artifact_authority_claim_count, 0);
    assert.equal(
      fullWorklist.evidence_envelope.summary.owner_payload_breakdown_policy,
      'refs_only_owner_and_payload_kind_action_breakdown_for_domain_or_app_live_operator_scaleout',
    );
    assert.equal(fullWorklist.evidence_envelope.summary.owner_payload_breakdown.length > 0, true);
    assert.equal(
      fullWorklist.evidence_envelope.summary.owner_payload_breakdown
        .reduce((total: number, entry: { envelope_count: number }) => total + entry.envelope_count, 0),
      fullWorklist.evidence_envelope.summary.envelope_count,
    );
    assert.equal(
      fullWorklist.evidence_envelope.summary.owner_payload_breakdown
        .reduce((total: number, entry: { open_envelope_count: number }) => total + entry.open_envelope_count, 0),
      fullWorklist.evidence_envelope.summary.open_envelope_count,
    );
    assert.equal(
      fullWorklist.evidence_envelope.summary.owner_payload_breakdown
        .some((entry: { owner: string; open_envelope_count: number }) => (
          entry.owner === 'med-autoscience' && entry.open_envelope_count > 0
        )),
      true,
    );
    assert.deepEqual(fullWorklist.evidence_envelope.summary.owner_ids, [
      'med-autogrant',
      'med-autoscience',
      'redcube-ai',
      'one-person-lab',
    ]);
    assert.equal(
      fullWorklist.evidence_envelope.summary.owner_id_policy,
      'canonical_owner_ids_only_raw_aliases_in_full_detail_envelopes',
    );
    assert.equal(fullWorklist.evidence_envelope.authority_boundary.can_write_domain_truth, false);
    assert.equal(fullWorklist.evidence_envelope.authority_boundary.can_claim_production_ready, false);
    assert.equal(fullWorklist.evidence_envelope.envelopes, undefined);
    assert.equal(
      fullWorklist.evidence_envelope_full_ref,
      '/runtime_tray_snapshot/app_operator_drilldown/evidence_envelope',
    );
    const workorderPacket = fullWorklist.stage_evidence_workorder_packet;
    assert.equal(workorderPacket.surface_kind, 'opl_stage_evidence_workorder_packet');
    assert.equal(
      workorderPacket.summary.workorder_count,
      fullWorklist.worklist_items.filter((item: { claim_scope: string }) =>
        item.claim_scope === 'stage_production_evidence_receipt'
      ).length,
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
    const domainDispatchWorkorderPacket = fullWorklist.domain_dispatch_evidence_workorder_packet;
    assert.equal(
      domainDispatchWorkorderPacket.surface_kind,
      'opl_domain_dispatch_evidence_workorder_packet',
    );
    assert.equal(domainDispatchWorkorderPacket.summary.workorder_count >= 0, true);
    assert.equal(
      fullWorklist.summary.domain_dispatch_evidence_receipt_requires_domain_or_app_payload_count,
      0,
    );
    assert.equal(
      domainDispatchWorkorderPacket.summary.route_requires_domain_or_app_payload_count,
      domainDispatchWorkorderPacket.summary.workorder_count,
    );
    assert.equal(
      domainDispatchWorkorderPacket.summary.domain_id_policy,
      'canonical_owner_facing_ids_only_workorder_items_keep_command_domain_ids_for_action_routes',
    );
    assert.equal(
      domainDispatchWorkorderPacket.summary.route_domain_id_policy,
      'command_domain_ids_for_opl_runtime_action_execute_routes_not_default_owner_semantics',
    );
    assert.equal(
      domainDispatchWorkorderPacket.summary.domain_ids.every((domainId: string) => domainId.includes('-')),
      true,
    );
    assert.equal(
      domainDispatchWorkorderPacket.summary.route_domain_ids.length,
      domainDispatchWorkorderPacket.summary.domain_ids.length,
    );
    assert.equal(
      fullWorklist.domain_dispatch_evidence_workorder_packet_summary.workorder_count,
      domainDispatchWorkorderPacket.summary.workorder_count,
    );
    assert.equal(
      fullWorklist.domain_dispatch_evidence_workorder_group_attention_policy,
      'top_canonical_owner_stage_groups_refs_only_no_domain_authority',
    );
    assert.equal(
      fullWorklist.domain_dispatch_evidence_workorder_group_attention_items.length,
      Math.min(domainDispatchWorkorderPacket.summary.domain_stage_group_count, 5),
    );
    assert.equal(
      domainDispatchWorkorderPacket.summary.domain_stage_grouping_policy,
      'bounded_canonical_owner_stage_groups_refs_only_no_domain_authority',
    );
    assert.equal(
      domainDispatchWorkorderPacket.summary.domain_stage_group_count,
      domainDispatchWorkorderPacket.domain_stage_group_summary.total_group_count,
    );
    assert.equal(
      domainDispatchWorkorderPacket.summary.domain_stage_group_omitted_count,
      domainDispatchWorkorderPacket.domain_stage_group_summary.omitted_group_count,
    );
    assert.equal(
      domainDispatchWorkorderPacket.domain_stage_group_summary.grouping_keys.join(','),
      'canonical_domain_id,stage_id',
    );
    assert.equal(
      domainDispatchWorkorderPacket.domain_stage_group_summary.groups.length <= 10,
      true,
    );
    if (domainDispatchWorkorderPacket.summary.workorder_count > 0) {
      assert.equal(
        domainDispatchWorkorderPacket.domain_stage_group_summary.groups.length > 0,
        true,
      );
      const dispatchGroup = domainDispatchWorkorderPacket.domain_stage_group_summary.groups[0];
      const dispatchGroupAttentionItem =
        fullWorklist.domain_dispatch_evidence_workorder_group_attention_items[0];
      assert.equal(typeof dispatchGroup.canonical_domain_id, 'string');
      assert.equal(dispatchGroup.canonical_domain_id.includes('-'), true);
      assert.equal(dispatchGroup.owner, dispatchGroup.canonical_domain_id);
      assert.equal(typeof dispatchGroup.stage_id, 'string');
      assert.equal(dispatchGroup.workorder_count > 0, true);
      assert.equal(dispatchGroup.stage_attempt_count > 0, true);
      assert.equal(dispatchGroup.route_requires_domain_or_app_payload, true);
      assert.equal(dispatchGroup.payload_owner, 'domain_repository_or_app_live_operator');
      assert.equal(dispatchGroup.required_operator_payload_refs.includes('domain_receipt_refs'), true);
      assert.equal(dispatchGroup.required_operator_payload_refs.includes('typed_blocker_refs'), true);
      assert.equal(dispatchGroup.required_operator_payload_refs.includes('owner_chain_refs'), true);
      assert.equal(dispatchGroup.required_operator_payload_refs.includes('no_regression_refs'), true);
      assert.equal(
        dispatchGroup.payload_path_policy,
        'operator_must_choose_success_refs_path_or_domain_owned_typed_blocker_path_empty_template_blocks',
      );
      assert.equal(
        dispatchGroup.accepted_payload_paths.typed_blocker_path.success_claimed,
        false,
      );
      assert.equal(
        dispatchGroup.payload_preflight_policy,
        'domain_dispatch_evidence_payload_must_pass_success_refs_or_typed_blocker_path_preflight',
      );
      assert.equal(
        dispatchGroup.payload_preflight_blocked_error_kind,
        'domain_dispatch_evidence_payload_preflight_blocked',
      );
      assert.equal(
        dispatchGroup.required_return_shapes.includes('domain_owner_receipt_ref'),
        true,
      );
      assert.equal(dispatchGroup.worklist_item_is_completion_claim, false);
      assert.equal(dispatchGroup.authority_boundary.can_generate_domain_owner_receipt, false);
      assert.equal(dispatchGroup.authority_boundary.can_execute_domain_action, false);
      assert.equal(dispatchGroup.authority_boundary.closes_production_ready, false);
      assert.equal(dispatchGroupAttentionItem.canonical_domain_id, dispatchGroup.canonical_domain_id);
      assert.equal(dispatchGroupAttentionItem.owner, dispatchGroup.canonical_domain_id);
      assert.equal(dispatchGroupAttentionItem.stage_id, dispatchGroup.stage_id);
      assert.equal(dispatchGroupAttentionItem.workorder_count, dispatchGroup.workorder_count);
      assert.equal(dispatchGroupAttentionItem.sample_stage_attempt_ids.length <= 3, true);
      assert.equal(dispatchGroupAttentionItem.sample_action_refs.length <= 3, true);
      assertDomainDispatchGroupExecutorHints(dispatchGroupAttentionItem);
      assert.equal(dispatchGroupAttentionItem.sample_required_evidence_refs.length <= 3, true);
      assert.equal(dispatchGroupAttentionItem.stage_attempt_id_omitted_count >= 0, true);
      assert.equal(dispatchGroupAttentionItem.action_ref_omitted_count >= 0, true);
      assert.equal(dispatchGroupAttentionItem.required_evidence_ref_omitted_count >= 0, true);
      assert.equal(Object.hasOwn(dispatchGroupAttentionItem, 'required_evidence_refs'), false);
      assert.equal(dispatchGroupAttentionItem.can_create_owner_receipt, false);
      assert.equal(
        dispatchGroupAttentionItem.payload_path_policy,
        'operator_must_choose_success_refs_path_or_domain_owned_typed_blocker_path_empty_template_blocks',
      );
      assert.equal(
        dispatchGroupAttentionItem.accepted_payload_paths.typed_blocker_path.success_claimed,
        false,
      );
      assert.equal(
        dispatchGroupAttentionItem.payload_preflight_policy,
        'domain_dispatch_evidence_payload_must_pass_success_refs_or_typed_blocker_path_preflight',
      );
      assert.equal(
        dispatchGroupAttentionItem.payload_preflight_blocked_error_kind,
        'domain_dispatch_evidence_payload_preflight_blocked',
      );
      assert.equal(
        dispatchGroupAttentionItem.required_return_shapes.includes('domain_owner_receipt_ref'),
        true,
      );
      assert.equal(dispatchGroupAttentionItem.can_close_domain_ready, false);
      assert.equal(dispatchGroupAttentionItem.can_claim_production_ready, false);
    }
    assert.equal(
      fullWorklist.domain_dispatch_evidence_workorder_attention_items.length,
      Math.min(domainDispatchWorkorderPacket.summary.workorder_count, 10),
    );
    assert.equal(
      domainDispatchWorkorderPacket.workorders.every(
        (item: { domain_id: string; route_domain_id: string; canonical_domain_id: string }) =>
          item.route_domain_id === item.domain_id && item.canonical_domain_id.includes('-'),
      ),
      true,
    );
    assert.equal(
      fullWorklist.domain_dispatch_evidence_workorder_attention_items.every(
        (item: { domain_id: string; route_domain_id: string; canonical_domain_id: string }) =>
          item.route_domain_id === item.domain_id && item.canonical_domain_id.includes('-'),
      ),
      true,
    );
    assert.equal(
      domainDispatchWorkorderPacket.authority_boundary.can_generate_domain_owner_receipt,
      false,
    );
    assert.equal(domainDispatchWorkorderPacket.authority_boundary.can_execute_domain_action, false);
    assert.equal(domainDispatchWorkorderPacket.authority_boundary.closes_domain_ready, false);
    assert.equal(domainDispatchWorkorderPacket.authority_boundary.closes_production_ready, false);
    assert.equal(
      fullWorklist.domain_dispatch_evidence_workorder_attention_items.every(
        (item: { worklist_item_is_completion_claim: boolean }) =>
          item.worklist_item_is_completion_claim === false,
      ),
      true,
    );
    assert.equal(
      fullWorklist.summary.domain_dispatch_evidence_workorder_count,
      domainDispatchWorkorderPacket.summary.workorder_count,
    );
    assert.equal(
      fullWorklist.summary.domain_dispatch_evidence_workorder_stage_attempt_count,
      domainDispatchWorkorderPacket.summary.stage_attempt_count,
    );
    assert.equal(fullWorklist.authority_boundary.can_write_domain_truth, false);
    assert.equal(fullWorklist.authority_boundary.can_authorize_quality_verdict, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime evidence-worklist carries default-caller deletion evidence gates without delete authority', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-default-caller-evidence-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const baseManifests = loadFamilyManifestFixtures();
  const manifest = withEvidenceWorklistSurfaces(
    baseManifests.medautoscience,
    ['direction_and_route_selection'],
    { defaultCallerDeletionEvidence: true },
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
    ], familyRuntimeEnv(stateRoot, fixtureContractsRoot));

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
    ], familyRuntimeEnv(stateRoot, fixtureContractsRoot));
    const fullWorklist = fullOutput.family_runtime_evidence_worklist;
    const defaultCallerItems = fullWorklist.worklist_items.filter(
      (item: { claim_scope: string }) => item.claim_scope === 'default_caller_deletion_evidence',
    );

    const drilldown = runCli([
      'runtime',
      'app-operator-drilldown',
      '--detail',
      'full',
    ], familyRuntimeEnv(stateRoot, fixtureContractsRoot));
    const refs = drilldown.app_operator_drilldown.default_caller_deletion_evidence_refs;
    assert.equal(refs.surface_kind, 'opl_default_caller_deletion_evidence_refs');
    assert.equal(refs.summary.deletion_evidence_worklist_count, 8);
    assert.equal(refs.summary.ready_domain_evidence_worklist_count, 8);
    assert.equal(refs.summary.blocked_until_replacement_ready_count, 0);
    assert.equal(refs.summary.open_deletion_evidence_requirement_count, 24);
    assert.equal(refs.summary.physical_delete_authorized, false);
    assert.equal(refs.summary.default_caller_delete_ready, false);
    assert.equal(refs.summary.deletion_evidence_requirements_are_completion_claims, false);
    assert.equal(refs.summary.not_authorized_claims.includes('default_caller_delete_ready'), true);
    assert.equal(refs.summary.not_authorized_claims.includes('domain_repo_physical_delete_authorization'), true);
    assert.equal(refs.authority_boundary.projection_can_sign_domain_owner_receipt, false);
    assert.equal(refs.authority_boundary.projection_can_authorize_domain_repo_physical_delete, false);

    const openRequirementCount = refs.summary.open_deletion_evidence_requirement_count;
    const readyWorklistCount = refs.summary.ready_domain_evidence_worklist_count;
    assert.equal(fullWorklist.summary.default_caller_deletion_evidence_item_count, openRequirementCount);
    assert.equal(fullWorklist.summary.default_caller_deletion_open_safe_action_item_count, 0);
    assert.equal(fullWorklist.summary.default_caller_deletion_audit_lane_item_count, openRequirementCount);
    assert.equal(
      fullWorklist.summary.default_caller_deletion_domain_owner_receipt_or_typed_blocker_missing_count,
      readyWorklistCount,
    );
    assert.equal(
      fullWorklist.summary.default_caller_deletion_no_active_caller_missing_count,
      0,
    );
    assert.equal(
      fullWorklist.summary.default_caller_deletion_no_forbidden_write_missing_count,
      readyWorklistCount,
    );
    assert.equal(
      fullWorklist.summary.default_caller_deletion_tombstone_or_provenance_missing_count,
      readyWorklistCount,
    );
    assert.equal(defaultCallerItems.length, openRequirementCount);
    assert.equal(
      defaultCallerItems.every((item: {
        status: string;
        owner: string;
        payload_owner: string;
        route_requires_domain_or_app_payload: boolean;
        can_close_without_domain_or_app_payload: boolean;
        worklist_item_is_completion_claim: boolean;
        not_authorized_claims: string[];
        evidence_requirement: {
          status: string;
          owner: string;
          can_claim_domain_ready: boolean;
          can_claim_production_ready: boolean;
          can_claim_artifact_authority: boolean;
          requirement_is_completion_claim: boolean;
          not_authorized_claims: string[];
        };
      }) =>
        item.status === 'open_safe_action_request_route_available'
        && item.owner === 'med-autoscience'
        && item.payload_owner === 'domain_repository_or_app_live_operator'
        && item.route_requires_domain_or_app_payload === true
        && item.can_close_without_domain_or_app_payload === false
        && item.worklist_item_is_completion_claim === false
        && item.not_authorized_claims.includes('domain_repo_physical_delete_authorization')
        && item.not_authorized_claims.includes('default_caller_delete_ready')
        && item.evidence_requirement.status === 'open'
        && item.evidence_requirement.owner === 'med-autoscience'
        && item.evidence_requirement.can_claim_domain_ready === false
        && item.evidence_requirement.can_claim_production_ready === false
        && item.evidence_requirement.can_claim_artifact_authority === false
        && item.evidence_requirement.requirement_is_completion_claim === false
        && item.evidence_requirement.not_authorized_claims.includes('domain_ready')
        && item.evidence_requirement.not_authorized_claims.includes('production_ready')
      ),
      true,
    );
    assert.equal(
      fullWorklist.attention_queue.filter(
        (item: { claim_scope: string }) => item.claim_scope === 'default_caller_deletion_evidence',
      ).length,
      0,
    );
    assert.equal(
      fullWorklist.next_action_ledger.next_action_items.filter(
        (item: { evidence_requirement: { claim_scope: string } }) =>
          item.evidence_requirement.claim_scope === 'default_caller_deletion_evidence',
      ).length,
      0,
    );
    assert.equal(
      fullWorklist.audit_worklist_next_safe_actions.filter(
        (item: { claim_scope: string }) => item.claim_scope === 'default_caller_deletion_evidence',
      ).length,
      0,
    );
    assert.equal(
      fullWorklist.next_safe_actions.some(
        (item: { claim_scope: string }) => item.claim_scope === 'default_caller_deletion_evidence',
      ),
      false,
    );
    assert.equal(fullWorklist.authority_boundary.can_write_domain_truth, false);
    assert.equal(fullWorklist.authority_boundary.can_authorize_domain_ready, false);
    assert.equal(fullWorklist.authority_boundary.can_claim_production_ready, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime evidence-worklist closes only OPL-owned provider and cleanup receipts', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-evidence-worklist-closed-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const baseManifests = loadFamilyManifestFixtures();
  const manifests = {
    medautogrant: withEvidenceWorklistSurfaces(
      baseManifests.medautogrant,
      ['fundability_strategy', 'specific_aims_and_structure', 'proposal_authoring'],
      { externalEvidenceRequestCount: 6, cleanupReady: true },
    ),
    medautoscience: withEvidenceWorklistSurfaces(
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
    redcube: withEvidenceWorklistSurfaces(
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
      'evidence-worklist',
      '--family-defaults',
      '--provider',
      'temporal',
      '--executor-kind',
      'codex_cli',
    ], familyRuntimeEnv(stateRoot, fixtureContractsRoot, {
      OPL_PROVIDER_PROOF_WINDOW_SECONDS: '86400',
    }));
    const worklist = output.family_runtime_evidence_worklist;

    assert.equal(worklist.surface_kind, 'opl_family_runtime_evidence_worklist');
    assert.equal(worklist.command, 'evidence-worklist');
    assert.equal(Object.hasOwn(worklist, 'command_alias'), false);
    assert.equal(Object.hasOwn(worklist, 'deprecated_alias_of'), false);
    assert.equal(Object.hasOwn(worklist, 'deprecated_alias'), false);
    assert.equal(worklist.summary.worklist_item_count, 49);
    assert.equal(worklist.summary.closed_worklist_item_count, 10);
    assert.equal(worklist.summary.open_worklist_item_count, 15);
    assert.equal(worklist.summary.default_caller_deletion_audit_lane_item_count, 0);
    assert.equal(worklist.summary.default_caller_deletion_open_safe_action_item_count, 0);
    assert.equal(worklist.summary.closed_refs_only_item_count, 10);
    assert.equal(worklist.summary.open_safe_action_item_count, 15);
    assert.equal(
      worklist.summary.open_safe_action_payload_required_item_count
        + worklist.summary.open_safe_action_payload_free_item_count,
      worklist.summary.open_safe_action_item_count,
    );
    assert.equal(worklist.summary.open_safe_action_payload_required_item_count, 0);
    assert.equal(Object.hasOwn(worklist.summary, 'production_closeout_open_safe_action_item_count'), false);
    assert.equal(Object.hasOwn(output, 'family_runtime_production_closeout'), false);
    assert.equal(Object.hasOwn(worklist, 'production_closeout_open_safe_action_item_count'), false);
    assert.equal(worklist.open_worklist_item_count, 15);
    assert.equal(
      worklist.open_safe_action_payload_required_item_count,
      worklist.summary.open_safe_action_payload_required_item_count,
    );
    assert.equal(
      worklist.open_safe_action_payload_free_item_count,
      worklist.summary.open_safe_action_payload_free_item_count,
    );
    assert.equal(worklist.detail_level, 'summary');
    assert.equal(worklist.worklist_items, undefined);
    assert.equal(worklist.attention_queue, undefined);
    assert.equal(worklist.next_action_ledger, undefined);

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
    ], familyRuntimeEnv(stateRoot, fixtureContractsRoot, {
      OPL_PROVIDER_PROOF_WINDOW_SECONDS: '86400',
    }));
    const fullWorklist = fullOutput.family_runtime_evidence_worklist;
    assert.equal(fullWorklist.detail_level, 'full');
    assert.equal(fullWorklist.attention_queue.length, 15);
    assert.equal(
      fullWorklist.attention_queue.every((item: {
        item_id: string;
      }) =>
        fullWorklist.worklist_items.some((worklistItem: {
          item_id: string;
          worklist_lane: string;
          default_owner_delta_eligible: boolean;
        }) =>
          worklistItem.item_id === item.item_id
          && worklistItem.worklist_lane === 'ordinary'
          && worklistItem.default_owner_delta_eligible === true
        )
      ),
      true,
    );

    const providerItems = fullWorklist.worklist_items.filter((item: { claim_scope: string }) =>
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
      providerItems.every((item: { worklist_status_detail: string }) =>
        item.worklist_status_detail === 'closed_by_opl_provider_slo_receipt'
      ),
      true,
    );
    assert.equal(
      providerItems.every((item: { receipt_ref: string | null }) =>
        item.receipt_ref === 'opl://family-runtime/provider-slo/cadence-window/current'
      ),
      true,
    );
    assert.equal(
      providerItems.every((item: {
        worklist_item_is_completion_claim: boolean;
        evidence_requirement: {
          status: string;
          requirement_is_completion_claim: boolean;
          can_claim_domain_ready: boolean;
          can_claim_production_ready: boolean;
          not_authorized_claims: string[];
        };
      }) =>
        item.worklist_item_is_completion_claim === false
        && item.evidence_requirement.status === 'closed'
        && item.evidence_requirement.requirement_is_completion_claim === false
        && item.evidence_requirement.can_claim_domain_ready === false
        && item.evidence_requirement.can_claim_production_ready === false
        && item.evidence_requirement.not_authorized_claims.includes('domain_ready')
        && item.evidence_requirement.not_authorized_claims.includes('production_ready')
      ),
      true,
    );

    const cleanupItems = fullWorklist.worklist_items.filter((item: { claim_scope: string }) =>
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
      cleanupItems.every((item: { worklist_status_detail: string }) =>
        item.worklist_status_detail === 'closed_by_opl_cleanup_ledger_receipt'
      ),
      true,
    );
    assert.equal(
      cleanupItems.every((item: { receipt_refs: string[] }) =>
        item.receipt_refs.length > 0
      ),
      true,
    );

    const externalItems = fullWorklist.worklist_items.filter((item: { claim_scope: string }) =>
      item.claim_scope === 'external_evidence_receipt'
    );
    const gateItems = fullWorklist.worklist_items.filter((item: { claim_scope: string }) =>
      item.claim_scope === 'evidence_gate_receipt'
    );
    const stageItems = fullWorklist.worklist_items.filter((item: { claim_scope: string }) =>
      item.claim_scope === 'stage_production_caller_request'
    );
    const stageEvidenceItems = fullWorklist.worklist_items.filter((item: { claim_scope: string }) =>
      item.claim_scope === 'stage_production_evidence_receipt'
    );
    const domainDispatchEvidenceItems = fullWorklist.worklist_items.filter((item: { claim_scope: string }) =>
      item.claim_scope === 'domain_dispatch_evidence_receipt'
    );
    assert.equal(
      externalItems.every((item: {
        worklist_lane: string;
        default_owner_delta_eligible: boolean;
        audit_lane_visible: boolean;
      }) =>
        item.worklist_lane === 'audit'
        && item.default_owner_delta_eligible === false
        && item.audit_lane_visible === true
      ),
      true,
    );
    for (const item of [...externalItems, ...gateItems, ...stageItems]) {
      assert.equal(item.status, 'open_safe_action_request_route_available');
      assert.equal(item.receipt_ref, null);
    }
    assert.equal(stageEvidenceItems.length > 0, true);
    assert.equal(
      stageEvidenceItems.every((item: {
        status: string;
        worklist_lane: string;
        default_owner_delta_eligible: boolean;
        audit_lane_visible: boolean;
        route_requires_domain_or_app_payload: boolean;
        payload_owner: string;
      }) =>
        item.status === 'open_safe_action_request_route_available'
        && item.worklist_lane === 'audit'
        && item.default_owner_delta_eligible === false
        && item.audit_lane_visible === true
        && item.route_requires_domain_or_app_payload
        && item.payload_owner === 'domain_repository_or_app_live_operator'
      ),
      true,
    );
    assert.equal(
      fullWorklist.summary.stage_production_evidence_receipt_requires_domain_or_app_payload_count,
      stageEvidenceItems.filter((item: { route_requires_domain_or_app_payload: boolean }) =>
        item.route_requires_domain_or_app_payload
      ).length,
    );
    assert.equal(
      fullWorklist.summary.domain_dispatch_evidence_receipt_requires_domain_or_app_payload_count,
      domainDispatchEvidenceItems.filter((item: { route_requires_domain_or_app_payload: boolean }) =>
        item.route_requires_domain_or_app_payload
      ).length,
    );
    assert.equal(
      fullWorklist.domain_dispatch_evidence_workorder_packet.summary.workorder_count,
      domainDispatchEvidenceItems.filter((item: { route_requires_domain_or_app_payload: boolean }) =>
        item.route_requires_domain_or_app_payload
      ).length,
    );
    assert.equal(
      fullWorklist.domain_dispatch_evidence_workorder_packet.summary.workorder_count,
      domainDispatchEvidenceItems.filter((item: { route_requires_domain_or_app_payload: boolean }) =>
        item.route_requires_domain_or_app_payload
      ).length,
    );
    assert.equal(
      fullWorklist.domain_dispatch_evidence_workorder_packet.summary.route_requires_domain_or_app_payload_count,
      fullWorklist.domain_dispatch_evidence_workorder_packet.summary.workorder_count,
    );
    assert.equal(
      fullWorklist.domain_dispatch_evidence_workorder_packet.summary.success_payload_owner,
      'domain_repository_or_app_live_operator',
    );
    assert.equal(
      domainDispatchEvidenceItems
        .filter((item: { route_requires_domain_or_app_payload: boolean }) =>
          item.route_requires_domain_or_app_payload
        )
        .every((item: {
          worklist_lane: string;
          default_owner_delta_eligible: boolean;
          audit_lane_visible: boolean;
        }) =>
          item.worklist_lane === 'ordinary'
          && item.default_owner_delta_eligible === true
          && item.audit_lane_visible === false
        ),
      true,
    );
    assert.equal(
      fullWorklist.domain_dispatch_evidence_workorder_packet.authority_boundary.can_write_domain_truth,
      false,
    );
    assert.equal(
      fullWorklist.domain_dispatch_evidence_workorder_packet.authority_boundary.can_generate_domain_owner_receipt,
      false,
    );
    assert.equal(
      fullWorklist.domain_dispatch_evidence_workorder_packet.authority_boundary.closes_production_ready,
      false,
    );
    assert.equal(fullWorklist.next_action_ledger.summary.next_action_item_count, 15);
    assert.equal(fullWorklist.authority_boundary.can_write_domain_truth, false);
    assert.equal(fullWorklist.authority_boundary.can_claim_production_ready, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

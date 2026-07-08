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
  createMinimalFamilyWorkspaceRoot,
  familyRuntimeEnv,
  insertProviderCapabilityReceipts,
  withEvidenceWorklistSurfaces,
} from './family-runtime-evidence-worklist-helpers.ts';

test('family-runtime evidence-worklist closes only OPL-owned provider and cleanup receipts', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-evidence-worklist-closed-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const familyWorkspaceRoot = createMinimalFamilyWorkspaceRoot();
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
      OPL_FAMILY_WORKSPACE_ROOT: familyWorkspaceRoot,
    }));
    const worklist = output.family_runtime_evidence_worklist;

    assert.equal(worklist.surface_kind, 'opl_family_runtime_evidence_worklist');
    assert.equal(worklist.command, 'evidence-worklist');
    assert.equal(Object.hasOwn(worklist, 'command_alias'), false);
    assert.equal(Object.hasOwn(worklist, 'deprecated_alias_of'), false);
    assert.equal(Object.hasOwn(worklist, 'deprecated_alias'), false);
    assert.equal(worklist.summary.worklist_item_count, 48);
    assert.equal(worklist.summary.closed_worklist_item_count, 9);
    assert.equal(worklist.summary.open_worklist_item_count, 15);
    assert.equal(worklist.summary.default_caller_deletion_audit_lane_item_count, 0);
    assert.equal(worklist.summary.default_caller_deletion_open_safe_action_item_count, 0);
    assert.equal(worklist.summary.closed_refs_only_item_count, 9);
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
      OPL_FAMILY_WORKSPACE_ROOT: familyWorkspaceRoot,
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
    assert.equal(providerItems.length, 3);
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
    fs.rmSync(familyWorkspaceRoot, { recursive: true, force: true });
  }
});

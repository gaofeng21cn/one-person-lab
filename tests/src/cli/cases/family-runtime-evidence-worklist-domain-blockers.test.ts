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
import {
  familyRuntimeEnv,
  insertProviderCapabilityReceipts,
  withEvidenceWorklistSurfaces,
} from './family-runtime-evidence-worklist-helpers.ts';

test('family-runtime evidence-worklist classifies verified external blockers without production authority', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-evidence-worklist-external-blocker-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const baseManifests = loadFamilyManifestFixtures();
  const manifests = {
    medautogrant: withEvidenceWorklistSurfaces(
      baseManifests.medautogrant,
      ['fundability_strategy', 'specific_aims_and_structure', 'proposal_authoring'],
      { externalEvidenceRequestCount: 6 },
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
    })).family_runtime_evidence_worklist;

    const externalRecord = before.worklist_items.find((item: { claim_scope: string }) =>
      item.claim_scope === 'external_evidence_receipt'
    );
    const gateRecord = before.worklist_items.find((item: { claim_scope: string }) =>
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

    const recordedWorklist = runCli([
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
    })).family_runtime_evidence_worklist;

    const verifyItems = recordedWorklist.worklist_items.filter((item: { action_kind: string }) =>
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
    })).family_runtime_evidence_worklist;

    assert.equal(after.summary.open_safe_action_item_count, 43);
    assert.equal(after.summary.open_worklist_item_count, 43);
    assert.equal(after.summary.closed_worklist_item_count, 6);
    assert.equal(after.summary.closed_refs_only_item_count, 6);
    assert.equal(after.next_action_ledger.summary.typed_blocker_tail_item_count, 2);
    assert.equal(after.next_action_ledger.summary.next_action_item_count, 45);
    const blockerItems = after.worklist_items.filter((item: { status: string }) =>
      item.status === 'closed_by_domain_owned_typed_blocker'
    );
    assert.equal(blockerItems.length, 2);
    for (const item of blockerItems) {
      assert.equal(item.worklist_status_detail, 'closed_by_domain_owned_typed_blocker_ref');
      assert.equal(item.typed_blocker_refs.length, 1);
      assert.equal(item.evidence_requirement_model, 'evidence_requirement.v1');
      assert.equal(item.evidence_requirement.requirement_id, item.tail_id);
      assert.equal(item.evidence_requirement.status, 'domain_owned_typed_blocker');
      assert.equal(item.evidence_requirement.typed_blocker_ref, item.typed_blocker_ref);
      assert.equal(item.evidence_requirement.requirement_is_completion_claim, false);
      assert.equal(item.evidence_requirement.can_claim_domain_ready, false);
      assert.equal(item.evidence_requirement.can_claim_production_ready, false);
      assert.equal(item.evidence_requirement.can_claim_artifact_authority, false);
      assert.equal(item.evidence_requirement.not_authorized_claims.includes('domain_ready'), true);
      assert.equal(item.evidence_requirement.not_authorized_claims.includes('production_ready'), true);
      assert.equal(item.worklist_item_is_completion_claim, false);
      assert.equal(item.not_authorized_claims.includes('production_ready'), true);
    }
    assert.equal(after.authority_boundary.can_claim_production_ready, false);
    assert.equal(after.authority_boundary.can_authorize_domain_ready, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime evidence-worklist rejects retired production-closeout alias', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-evidence-worklist-retired-alias-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();

  try {
    const failure = runCliFailure([
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
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
    });

    assert.equal(failure.payload.error.code, 'unknown_command');
    assert.match(failure.payload.error.message, /Unknown family-runtime subcommand: production-closeout/);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime evidence-worklist rejects non-production provider fallback', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-evidence-worklist-provider-state-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();

  try {
    const failure = runCliFailure([
      'family-runtime',
      'evidence-worklist',
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

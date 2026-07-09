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
  withEvidenceWorklistSurfaces,
} from './family-runtime-evidence-worklist-helpers.ts';

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
    const cleanupRetirement = drilldown.app_operator_drilldown.cleanup_retirement;
    assert.equal(cleanupRetirement.surface_kind, 'opl_app_drilldown_cleanup_retirement_projection');
    assert.equal(cleanupRetirement.status, 'waiting_for_structural_prerequisites');
    assert.equal(cleanupRetirement.deletion_evidence_worklist_count, 8);
    assert.equal(cleanupRetirement.open_deletion_evidence_requirement_count, 24);
    assert.equal(cleanupRetirement.physical_delete_authorized, false);
    assert.equal(cleanupRetirement.default_caller_delete_ready, false);
    assert.equal(
      cleanupRetirement.accepted_refs_only_result_shapes.includes('typed_blocker_ref'),
      true,
    );
    assert.equal(
      cleanupRetirement.not_authorized_claims.includes('domain_repo_physical_delete_authorization'),
      true,
    );
    assert.equal(cleanupRetirement.authority_boundary.can_execute_physical_delete, false);

    const refs = drilldown.app_operator_drilldown.default_caller_deletion_evidence_refs;
    assert.equal(refs.surface_kind, 'opl_default_caller_deletion_evidence_refs');
    assert.equal(refs.summary.deletion_evidence_worklist_count, 8);
    assert.equal(refs.summary.ready_domain_evidence_worklist_count, 8);
    assert.equal(refs.summary.open_deletion_evidence_requirement_count, 24);
    assert.equal(refs.summary.physical_delete_authorized, false);
    assert.equal(refs.summary.default_caller_delete_ready, false);
    assert.equal(refs.summary.deletion_evidence_requirements_are_completion_claims, false);
    assert.equal(refs.summary.not_authorized_claims.includes('domain_repo_physical_delete_authorization'), true);
    assert.equal(refs.authority_boundary.projection_can_sign_domain_owner_receipt, false);
    assert.equal(refs.authority_boundary.projection_can_authorize_domain_repo_physical_delete, false);
    assert.equal(
      refs.summary.static_retirement_prerequisite_gate_ids.includes('tombstone_or_provenance_ref'),
      true,
    );

    const openRequirementCount = refs.summary.open_deletion_evidence_requirement_count;
    assert.equal(fullWorklist.summary.default_caller_deletion_evidence_item_count, openRequirementCount);
    assert.equal(fullWorklist.summary.default_caller_deletion_open_safe_action_item_count, 0);
    assert.equal(fullWorklist.summary.default_caller_deletion_audit_lane_item_count, openRequirementCount);
    assert.equal(defaultCallerItems.length, openRequirementCount);
    const sampleItem = defaultCallerItems[0] as {
      status: string;
      route_requires_domain_or_app_payload: boolean;
      worklist_item_is_completion_claim: boolean;
      not_authorized_claims: string[];
      evidence_requirement: {
        can_claim_domain_ready: boolean;
        can_claim_production_ready: boolean;
        not_authorized_claims: string[];
      };
    } | undefined;
    assert.ok(sampleItem);
    assert.equal(sampleItem.status, 'open_safe_action_request_route_available');
    assert.equal(sampleItem.route_requires_domain_or_app_payload, true);
    assert.equal(sampleItem.worklist_item_is_completion_claim, false);
    assert.equal(sampleItem.not_authorized_claims.includes('domain_repo_physical_delete_authorization'), true);
    assert.equal(sampleItem.evidence_requirement.can_claim_domain_ready, false);
    assert.equal(sampleItem.evidence_requirement.can_claim_production_ready, false);
    assert.equal(sampleItem.evidence_requirement.not_authorized_claims.includes('production_ready'), true);
    assert.equal(
      fullWorklist.attention_queue.some(
        (item: { claim_scope: string }) => item.claim_scope === 'default_caller_deletion_evidence',
      ),
      false,
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

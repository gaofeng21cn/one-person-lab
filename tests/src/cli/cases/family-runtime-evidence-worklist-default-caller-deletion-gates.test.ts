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

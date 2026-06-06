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
import { buildReadyAgentRepo } from './agents-conformance-fixtures.ts';

test('family-runtime evidence-worklist uses repo-native default-caller readiness before manifest projection', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-default-caller-repo-native-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const baseManifests = loadFamilyManifestFixtures();
  const repoDir = buildReadyAgentRepo();
  const manifest = withEvidenceWorklistSurfaces(
    baseManifests.medautogrant,
    ['package_and_submit_ready'],
    { defaultCallerDeletionEvidence: true },
  );

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautogrant',
      '--path',
      repoDir,
      '--manifest-command',
      buildManifestCommand(manifest),
    ], familyRuntimeEnv(stateRoot, fixtureContractsRoot));

    const defaultCallers = runCli([
      'agents',
      'default-callers',
      '--agent',
      `mag=${repoDir}`,
    ]).agent_default_caller_readiness;
    assert.equal(defaultCallers.summary.deletion_evidence_worklist_count, 8);
    assert.equal(defaultCallers.summary.missing_domain_owner_receipt_or_typed_blocker_count, 8);
    assert.equal(defaultCallers.summary.missing_no_active_caller_proof_count, 0);
    assert.equal(defaultCallers.summary.missing_no_forbidden_write_proof_count, 8);
    assert.equal(defaultCallers.summary.missing_tombstone_or_provenance_ref_count, 8);
    assert.equal(
      defaultCallers.reports[0].deletion_evidence_worklists.every((worklist: {
        no_active_caller_proof: {
          status: string;
          observed_from_active_caller_target_proof: boolean;
          evidence_refs: string[];
        };
      }) => (
        worklist.no_active_caller_proof.status === 'observed'
        && worklist.no_active_caller_proof.observed_from_active_caller_target_proof === true
        && worklist.no_active_caller_proof.evidence_refs.some((ref) =>
          ref.startsWith('active_caller_target_proof.surface_targets.')
        )
      )),
      true,
    );
    assert.equal(
      defaultCallers.retirement_guard_readout.non_authorizing_surfaces.includes('opl_agents_conformance'),
      true,
    );
    assert.equal(
      defaultCallers.retirement_guard_readout.non_authorizing_surfaces.includes(
        'opl_family_runtime_evidence_worklist_refs_only_receipt',
      ),
      true,
    );

    const drilldown = runCli([
      'runtime',
      'app-operator-drilldown',
      '--detail',
      'full',
    ], familyRuntimeEnv(stateRoot, fixtureContractsRoot));
    const refs = drilldown.app_operator_drilldown.default_caller_deletion_evidence_refs;
    assert.equal(refs.summary.deletion_evidence_worklist_count, 8);
    assert.equal(refs.summary.open_deletion_evidence_requirement_count, 24);
    assert.equal(refs.summary.missing_domain_owner_receipt_or_typed_blocker_count, 8);
    assert.equal(refs.summary.missing_no_active_caller_proof_count, 0);
    assert.equal(refs.summary.missing_no_forbidden_write_proof_count, 8);
    assert.equal(refs.summary.missing_tombstone_or_provenance_ref_count, 8);
    assert.deepEqual(refs.summary.mandatory_gate_ids, defaultCallers.retirement_guard_mandatory_gate_ids);
    assert.equal(refs.summary.retirement_guard_target_classes.includes('legacy_dispatch_compensation_path'), true);
    assert.equal(refs.summary.retirement_guard_target_classes.includes('retained_domain_wrapper'), true);
    assert.equal(refs.domains[0].source, 'agent_default_caller_readiness_repo_projection');
    assert.equal(refs.summary.default_caller_delete_ready, false);
    assert.equal(refs.summary.not_authorized_claims.includes('default_caller_delete_ready'), true);

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
    assert.equal(fullWorklist.summary.default_caller_deletion_evidence_item_count, 24);
    assert.equal(
      fullWorklist.summary.default_caller_deletion_domain_owner_receipt_or_typed_blocker_missing_count,
      8,
    );
    assert.equal(fullWorklist.summary.default_caller_deletion_no_active_caller_missing_count, 0);
    assert.equal(fullWorklist.summary.default_caller_deletion_no_forbidden_write_missing_count, 8);
    assert.equal(fullWorklist.summary.default_caller_deletion_tombstone_or_provenance_missing_count, 8);
    assert.deepEqual(fullWorklist.summary.default_caller_deletion_mandatory_gate_ids, [
      'replacement_parity',
      'no_active_caller_proof',
      'domain_owner_receipt_or_typed_blocker',
      'no_forbidden_write_proof',
      'tombstone_or_provenance_ref',
    ]);
    assert.equal(
      fullWorklist.summary.default_caller_deletion_retirement_target_classes.includes(
        'legacy_materialize_compensation_path',
      ),
      true,
    );
    assert.equal(
      fullWorklist.worklist_items.filter((item: { claim_scope: string }) =>
        item.claim_scope === 'default_caller_deletion_evidence'
      ).length,
      24,
    );
    assert.equal(fullWorklist.summary.not_authorized_claims.includes('default_caller_delete_ready'), true);
  } finally {
    fs.rmSync(repoDir, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime evidence-worklist keeps family default-caller deletion scope aligned with OMA', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-default-caller-oma-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const env = familyRuntimeEnv(stateRoot, fixtureContractsRoot, {
    OPL_FAMILY_WORKSPACE_ROOT: path.dirname(repoRoot),
  });

  try {
    const defaultCallers = runCli([
      'agents',
      'default-callers',
      '--family-defaults',
    ], env);
    assert.equal(defaultCallers.deletion_evidence_worklist_count, 32);
    assert.equal(defaultCallers.missing_no_active_caller_proof_count, 0);
    assert.equal(
      defaultCallers.physical_delete_authority_read_model.next_required_owner_action,
      'domain_owner_choose_delete_authorize_keep_or_typed_blocker',
    );
    assert.deepEqual(
      defaultCallers.physical_delete_authority_read_model.accepted_refs_only_result_shapes,
      [
        'physical_delete_authorization_ref',
        'keep_as_authority_adapter_ref',
        'typed_blocker_ref',
      ],
    );
    assert.equal(
      defaultCallers.physical_delete_authority_read_model.owner_decision_required_after_all_refs_observed,
      true,
    );
    assert.equal(defaultCallers.physical_delete_authorized, false);
    assert.equal(defaultCallers.default_caller_delete_ready, false);
    assert.equal(
      defaultCallers.repo_deletion_gate_summary.some((repo: { domain_id: string }) =>
        repo.domain_id === 'opl-meta-agent'
      ),
      true,
    );

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
    ], env);
    const fullWorklist = fullOutput.family_runtime_evidence_worklist;
    assert.equal(fullWorklist.summary.default_caller_deletion_evidence_item_count, 0);
    assert.equal(fullWorklist.summary.default_caller_deletion_audit_lane_item_count, 0);
    assert.equal(fullWorklist.summary.default_caller_deletion_open_safe_action_item_count, 0);
    assert.equal(fullWorklist.summary.default_caller_deletion_no_active_caller_missing_count, 0);
    assert.equal(fullWorklist.summary.default_caller_deletion_audit_lane_item_count, 0);
    assert.equal(fullWorklist.summary.default_caller_deletion_open_safe_action_item_count, 0);
    assert.equal(
      fullWorklist.worklist_items.filter((item: { claim_scope: string; owner: string }) =>
        item.claim_scope === 'default_caller_deletion_evidence'
        && item.owner === 'opl-meta-agent'
      ).length,
      0,
    );
    assert.equal(
      fullWorklist.attention_queue.filter((item: { claim_scope: string; owner: string }) =>
        item.claim_scope === 'default_caller_deletion_evidence'
        && item.owner === 'opl-meta-agent'
      ).length,
      0,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

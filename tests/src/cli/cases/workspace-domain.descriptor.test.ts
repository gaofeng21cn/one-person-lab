import { DatabaseSync } from 'node:sqlite';

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
import { attachManifestSurface, createAdmittedStagePackFixture } from './workspace-domain-test-helper.ts';
import { initializeFixtureGitCheckout } from './domain-pack-compiler-fixtures.ts';

function insertFreshTemporalProviderProof(stateRoot: string) {
  const db = new DatabaseSync(path.join(stateRoot, 'family-runtime', 'queue.sqlite'));
  db.prepare(
    'INSERT INTO events(event_id, task_id, domain_id, event_type, source, payload_json, created_at) VALUES (?, NULL, NULL, ?, ?, ?, ?)',
  ).run(
    'evt_agent_descriptor_provider_proof',
    'temporal_residency_proof',
    'test',
    JSON.stringify({
      provider_kind: 'temporal',
      proof_mode: 'external_temporal_service_worker',
      closeout_status: 'production_residency_proven',
      proof_receipt: {
        receipt_kind: 'temporal_production_residency_proof',
        receipt_status: 'proven',
        provider_kind: 'temporal',
      },
    }),
    new Date().toISOString(),
  );
  db.close();
}

function withStandardSkeleton(payload: Record<string, unknown>, agentId: string) {
  return attachManifestSurface(payload, 'standard_domain_agent_skeleton', {
    surface_kind: 'standard_domain_agent_skeleton',
    version: 'standard-domain-agent-skeleton.v1',
    agent_id: agentId,
    repo_source_boundary: {
      required_dirs: ['agent', 'contracts', 'runtime', 'docs'],
      forbidden_dirs: ['artifacts'],
    },
    contracts: {
      descriptor_refs: ['contracts/domain-agent.json'],
      sidecar_refs: ['runtime/sidecar.ts'],
      quality_gate_refs: ['contracts/quality-gates.json'],
    },
    artifact_boundary: {
      repo_contains_real_artifacts: false,
      artifact_roots_are_locators: true,
      workspace_artifact_locator_refs: ['workspace:/artifacts'],
      runtime_artifact_locator_refs: ['runtime:/receipts'],
    },
    authority_boundary: {
      opl: 'framework_transport_and_projection_only',
      domain: 'truth_quality_artifact_owner',
    },
  });
}

test('agent descriptor commands keep partial domain surfaces discoverable and non-authoritative', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-descriptor-partial-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  const manifests = {
    medautogrant: withStandardSkeleton(fixtures.medautogrant, 'mag'),
    medautoscience: withStandardSkeleton(fixtures.medautoscience, 'mas'),
    redcube: withStandardSkeleton(fixtures.redcube, 'rca'),
  };
  const masPack = createAdmittedStagePackFixture(
    manifests.medautoscience,
    'med-autoscience',
    'MedAutoScience',
  );
  initializeFixtureGitCheckout(masPack.repoDir);
  manifests.medautoscience = masPack.manifest;
  const env = {
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
    OPL_STATE_DIR: stateRoot,
    OPL_MODULES_ROOT: path.join(stateRoot, 'modules'),
    OPL_MODULE_PATH_MEDAUTOSCIENCE: masPack.repoDir,
  };

  try {
    runCli(['family-runtime', 'events', 'export'], env);
    insertFreshTemporalProviderProof(stateRoot);
    for (const [project, manifest] of Object.entries(manifests)) {
      runCli([
        'workspace',
        'bind',
        '--project',
        project,
        '--path',
        project === 'medautoscience' ? masPack.repoDir : repoRoot,
        '--manifest-command',
        buildManifestCommand(manifest),
      ], env);
    }

    const descriptors = runCli(['agents', 'descriptors'], env).family_agent_descriptors;
    assert.ok(descriptors.descriptors.some((entry: { project_id: string }) => entry.project_id === 'medautoscience'));
    assert.equal(
      descriptors.summary.provider_temporal_residency_gap_status,
      'closed_by_fresh_proven_proof',
    );

    const descriptor = runCli(['agents', 'descriptor', '--domain', 'mas'], env).family_agent_descriptor;
    assert.equal(descriptor.descriptor_status, 'descriptor_surfaces_partial');
    assert.equal(descriptor.family_stage_control_plane.status, 'resolved');
    assert.equal(descriptor.family_action_catalog.status, 'resolved');
    assert.equal(descriptor.domain_memory_descriptor.status, 'missing');
    assert.equal(descriptor.non_authority_flags.opl_owns_domain_truth, false);
    assert.deepEqual(
      descriptor.standard_domain_agent_skeleton.provider_closure_evidence
        .external_temporal_production_residency_proof,
      {
        status: 'closed_by_fresh_proven_proof',
        provider_kind: 'temporal',
        proof_slo_status: 'proof_fresh',
        latest_closeout_status: 'production_residency_proven',
        provider_completion_is_domain_ready: false,
      },
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(masPack.repoDir, { recursive: true, force: true });
  }
});

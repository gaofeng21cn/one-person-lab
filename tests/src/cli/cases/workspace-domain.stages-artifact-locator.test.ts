import { assert, buildManifestCommand, createFamilyContractsFixtureRoot, fs, loadFamilyManifestFixtures, os, path, repoRoot, runCli, test } from '../helpers.ts';

type JsonRecord = Record<string, unknown>;

test('domain-agent skeleton remains drifted without an artifact locator surface', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-agent-missing-locator-state-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  const manifest = {
    ...(fixtures.redcube as JsonRecord),
    standard_domain_agent_skeleton: {
      surface_kind: 'standard_domain_agent_skeleton',
      adapter_id: 'rca.domain-agent.skeleton.adapter.v1',
      repo_source_boundary: {
        allowed_roots: [
          { boundary_id: 'agent' },
          { boundary_id: 'contracts' },
          { boundary_id: 'runtime' },
          { boundary_id: 'docs' },
        ],
        repo_tracks_runtime_artifact_blobs: false,
        repo_tracks_receipt_instances: false,
      },
    },
  };

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'redcube',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(manifest),
    ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });

    const inspect = runCli(['agents', 'inspect', '--domain', 'rca'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(inspect.family_agent.skeleton_status, 'drift_detected');
    assert.ok(inspect.family_agent.issues.includes('artifact_locator_surface_required'));
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

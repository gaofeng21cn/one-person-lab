import { assert, fs, os, path, runCli, test } from '../helpers.ts';

function writeSource(root: string) {
  const sourceRoot = path.join(root, 'contract.source');
  fs.mkdirSync(path.join(sourceRoot, 'stages'), { recursive: true });
  fs.writeFileSync(path.join(sourceRoot, 'root.json'), `${JSON.stringify({
    surface_kind: 'stage_control_plane_fixture',
    owner: 'fixture-owner',
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(sourceRoot, 'stages', 'intake.json'), `${JSON.stringify({
    stage_id: 'intake',
  }, null, 2)}\n`);
  const assemblyPath = path.join(root, 'stage-control.assembly.json');
  fs.writeFileSync(assemblyPath, `${JSON.stringify({
    surface_kind: 'opl_pack_bundle_assembly',
    schema_version: 1,
    bundle_id: 'fixture.stage_control_plane',
    owner: 'one-person-lab',
    state: 'active_bundle_source',
    aggregate_ref: 'stage-control.generated.json',
    manifest_ref: 'stage-control.bundle-manifest.json',
    source_root_ref: 'contract.source/root.json',
    generated_array_fields: [
      {
        field: 'stages',
        source_dir_ref: 'contract.source/stages',
        order: ['intake.json'],
      },
    ],
    commands: {
      write: 'opl pack bundle write --assembly stage-control.assembly.json',
      check: 'opl pack bundle check --assembly stage-control.assembly.json',
      manifest: 'opl pack bundle manifest --assembly stage-control.assembly.json',
    },
    authority_boundary: {
      can_write_domain_truth: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
      can_authorize_quality_verdict: false,
      can_claim_domain_ready: false,
      can_claim_production_ready: false,
    },
  }, null, 2)}\n`);
  return assemblyPath;
}

test('pack bundle CLI writes manifests and checks aggregate drift', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-bundle-cli-'));
  try {
    const assemblyPath = writeSource(root);
    const write = runCli(['pack', 'bundle', 'write', '--assembly', assemblyPath]).pack_bundle_write;
    assert.equal(write.status, 'written');
    assert.equal(write.manifest.generated_artifact.do_not_edit, true);

    const check = runCli(['pack', 'bundle', 'check', '--assembly', assemblyPath]).pack_bundle_validation;
    assert.equal(check.status, 'valid');
    assert.equal(check.checks.every((entry: { status: string }) => entry.status === 'pass'), true);

    const manifest = runCli(['pack', 'bundle', 'manifest', '--assembly', assemblyPath]).pack_bundle_manifest;
    assert.equal(manifest.bundle_id, 'fixture.stage_control_plane');
    assert.match(manifest.source_digest, /^[0-9a-f]{64}$/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('pack bundle commands are discoverable under OPL Pack help', () => {
  const help = runCli(['pack', 'bundle']).help;
  assert.equal(help.command, 'pack bundle');
  const subcommands = help.subcommands.map((entry: { command: string }) => entry.command);
  assert.equal(subcommands.includes('pack bundle manifest'), true);
  assert.equal(subcommands.includes('pack bundle write'), true);
  assert.equal(subcommands.includes('pack bundle check'), true);
});

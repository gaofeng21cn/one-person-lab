import {
  assert,
  fs,
  os,
  parseJsonText,
  path,
  runCli,
  test,
} from '../../helpers.ts';

function readJsonFile(filePath: string) {
  return parseJsonText(fs.readFileSync(filePath, 'utf8')) as any;
}

test('workspace upgrade preserves shared resource provenance records and exposes them in inventory', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-resource-provenance-state-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-resource-provenance-root-'));
  const env = { OPL_STATE_DIR: stateRoot };

  try {
    runCli([
      'workspace',
      'init',
      '--agent',
      'rca',
      '--workspace-root',
      workspaceRoot,
      '--workspace-id',
      'visual-theme-a',
      '--project-id',
      'deck-001',
    ], env);
    const workspacePath = path.join(workspaceRoot, 'visual-theme-a');
    const manifestPath = path.join(workspacePath, 'shared', 'sources', 'opl_resource_manifest.json');
    const manifest = readJsonFile(manifestPath);
    manifest.resources = [
      {
        resource_id: 'source-001',
        source_ref: 'shared/sources/source-001.pdf',
        material_ref: 'human_doc:source-001',
        checksum: 'sha256:abc',
        provenance_ref: 'receipt:source-001',
        reuse_scope: 'workspace_group_or_project_series',
        staleness: 'fresh',
        recorded_at: '2026-06-08T00:00:00.000Z',
        body_ref: 'should_be_normalized_to_null',
      },
    ];
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    runCli(['workspace', 'upgrade', '--workspace', workspacePath, '--apply'], env);
    const upgradedManifest = readJsonFile(manifestPath);
    assert.equal(upgradedManifest.resources[0].resource_id, 'source-001');
    assert.equal(upgradedManifest.resources[0].body_ref, null);

    const inventory = runCli(['workspace', 'inventory', '--workspace', workspacePath], env).workspace_resource_inventory;
    const sourceRoot = inventory.resources.find((entry: { path: string }) => entry.path === 'shared/sources');
    assert.equal(sourceRoot.resource_record_count, 1);
    assert.equal(sourceRoot.resource_records[0].provenance_ref, 'receipt:source-001');
    assert.equal(sourceRoot.resource_records[0].body_ref, null);
    assert.equal(runCli(['workspace', 'doctor', '--workspace', workspacePath], env).workspace_doctor.status, 'passed');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

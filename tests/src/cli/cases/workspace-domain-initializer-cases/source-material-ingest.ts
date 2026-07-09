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

test('workspace source ingest stores source material refs without domain authority', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-source-state-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-source-root-'));
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-source-file-'));

  try {
    runCli([
      'workspace',
      'init',
      '--agent',
      'oma',
      '--workspace-root',
      workspaceRoot,
      '--workspace-id',
      'agent-foundry',
      '--project-id',
      'colorectal-risk-agent',
    ], {
      OPL_STATE_DIR: stateRoot,
    });

    const inputFile = path.join(sourceRoot, 'HemaGuide.pdf');
    fs.writeFileSync(inputFile, '%PDF-1.4 reference design\n');
    const workspacePath = path.join(workspaceRoot, 'agent-foundry');
    const output = runCli([
      'workspace',
      'source',
      'ingest',
      '--workspace',
      workspacePath,
      '--project-id',
      'colorectal-risk-agent',
      '--file',
      inputFile,
      '--role',
      'reference_design',
      '--title',
      'HemaGuide reference design',
    ], {
      OPL_STATE_DIR: stateRoot,
    });

    const ingest = output.workspace_source_ingest;
    assert.equal(ingest.status, 'applied');
    assert.equal(ingest.source_material_role, 'reference_design');
    assert.equal(ingest.project_id, 'colorectal-risk-agent');
    assert.equal(ingest.original_file.mime_type, 'application/pdf');
    assert.equal(ingest.authority_boundary.opl_can_extract_source_semantics, false);
    assert.equal(ingest.authority_boundary.opl_can_write_domain_truth, false);
    assert.equal(ingest.extraction_policy.extraction_owner, 'stage_or_domain_agent');
    assert.equal(fs.statSync(ingest.stored_file.path).isFile(), true);
    assert.equal(fs.statSync(ingest.receipt_path).isFile(), true);

    const receipt = readJsonFile(ingest.receipt_path);
    assert.equal(receipt.source_material_ref, ingest.source_material_ref);
    assert.deepEqual(receipt.handoff_refs, ingest.handoff_refs);
    assert.equal(receipt.stored_file.ref, ingest.stored_file.ref);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    fs.rmSync(sourceRoot, { recursive: true, force: true });
  }
});

test('workspace source ingest dry-run does not copy source material', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-source-dry-state-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-source-dry-root-'));
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-source-dry-file-'));

  try {
    runCli([
      'workspace',
      'init',
      '--agent',
      'oma',
      '--workspace-root',
      workspaceRoot,
      '--workspace-id',
      'agent-foundry',
      '--project-id',
      'colorectal-risk-agent',
    ], {
      OPL_STATE_DIR: stateRoot,
    });

    const inputFile = path.join(sourceRoot, 'design-note.md');
    fs.writeFileSync(inputFile, '# Design note\n');
    const workspacePath = path.join(workspaceRoot, 'agent-foundry');
    const output = runCli([
      'workspace',
      'source',
      'ingest',
      '--workspace',
      workspacePath,
      '--file',
      inputFile,
      '--dry-run',
    ], {
      OPL_STATE_DIR: stateRoot,
    });

    const ingest = output.workspace_source_ingest;
    assert.equal(ingest.status, 'dry_run_ready');
    assert.equal(ingest.write_allowed, false);
    assert.equal(fs.existsSync(ingest.stored_file.path), false);
    assert.equal(fs.existsSync(ingest.receipt_path), false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    fs.rmSync(sourceRoot, { recursive: true, force: true });
  }
});

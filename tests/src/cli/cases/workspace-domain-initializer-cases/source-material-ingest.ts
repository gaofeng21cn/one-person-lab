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
    assert.equal(ingest.source_fingerprint_ref, `sha256:${ingest.original_file.sha256}`);
    assert.equal(ingest.authority_boundary.opl_can_extract_source_semantics, false);
    assert.equal(ingest.authority_boundary.opl_can_write_domain_truth, false);
    assert.equal(ingest.authority_boundary.opl_can_copy_source_body_into_contract, false);
    assert.equal(ingest.authority_boundary.opl_can_sign_owner_receipt, false);
    assert.equal(ingest.authority_boundary.opl_can_create_typed_blocker, false);
    assert.equal(ingest.non_claims.pattern_quality_ready, false);
    assert.equal(ingest.non_claims.target_ready, false);
    assert.equal(ingest.non_claims.domain_ready, false);
    assert.equal(ingest.non_claims.production_ready, false);
    assert.equal(ingest.extraction_policy.extraction_owner, 'stage_or_domain_agent');
    const handoff = ingest.reference_design_pattern_handoff;
    assert.equal(handoff.applicability, 'required');
    assert.equal(
      handoff.contract_ref,
      'contracts/opl-framework/source-material-ingest-contract.json#/handoff_policy/reference_design_pattern_handoff',
    );
    assert.equal(
      handoff.schema_ref,
      'contracts/opl-framework/reference-design-pattern-packet.schema.json',
    );
    assert.deepEqual(handoff.input_refs, {
      source_material_ref: ingest.source_material_ref,
      source_material_receipt_ref: ingest.receipt_ref,
      source_fingerprint_ref: ingest.source_fingerprint_ref,
      stored_file_ref: ingest.stored_file.ref,
    });
    assert.equal(handoff.required_return_shape, 'ReferenceDesignPatternPacket');
    assert.equal(handoff.required_return_fields.includes('extraction_attempt_refs'), true);
    assert.equal(handoff.required_return_fields.includes('extraction_receipt_refs'), true);
    assert.equal(handoff.required_return_fields.includes('source_anchor_refs'), true);
    assert.equal(handoff.next_owner, 'stage_or_domain_agent');
    assert.equal(handoff.consumer_after_return, 'oma');
    assert.equal(handoff.semantic_extraction_executed, false);
    assert.equal(handoff.pattern_packet_created, false);
    assert.equal(handoff.authority_boundary.opl_can_create_pattern_packet, false);
    assert.equal(handoff.authority_boundary.opl_can_claim_pattern_quality_ready, false);
    assert.equal(fs.statSync(ingest.stored_file.path).isFile(), true);
    assert.equal(fs.statSync(ingest.receipt_path).isFile(), true);

    const receipt = readJsonFile(ingest.receipt_path);
    assert.equal(receipt.source_material_ref, ingest.source_material_ref);
    assert.equal(receipt.source_fingerprint_ref, ingest.source_fingerprint_ref);
    assert.deepEqual(receipt.handoff_refs, ingest.handoff_refs);
    assert.deepEqual(receipt.reference_design_pattern_handoff, handoff);
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
    assert.equal(ingest.reference_design_pattern_handoff.applicability, 'not_applicable');
    assert.equal(ingest.reference_design_pattern_handoff.required_return_shape, null);
    assert.deepEqual(ingest.reference_design_pattern_handoff.required_return_fields, []);
    assert.equal(ingest.reference_design_pattern_handoff.next_owner, null);
    assert.equal(ingest.reference_design_pattern_handoff.semantic_extraction_executed, false);
    assert.equal(ingest.reference_design_pattern_handoff.pattern_packet_created, false);
    assert.equal(fs.existsSync(ingest.stored_file.path), false);
    assert.equal(fs.existsSync(ingest.receipt_path), false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    fs.rmSync(sourceRoot, { recursive: true, force: true });
  }
});

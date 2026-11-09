import { assert, fs, os, path, runCli, test } from '../helpers.ts';

function createOkfBundle(files: Record<string, string>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-okf-cli-'));
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
  }
  return root;
}

test('opl okf validate returns errors for missing type and warnings for broken links', () => {
  const bundleRoot = createOkfBundle({
    'index.md': '# Index\n',
    'log.md': '# Log\n',
    'valid.md': [
      '---',
      'type: concept',
      'custom_field: kept',
      '---',
      '',
      '# Valid',
      'Points to [[missing-target]].',
    ].join('\n'),
    'invalid.md': '# Invalid\n',
  });

  try {
    const output = runCli(['okf', 'validate', '--bundle', bundleRoot, '--json']);

    assert.equal(output.version, 'g2');
    assert.equal(output.okf_validation.status, 'invalid');
    assert.equal(output.okf_validation.authority_boundary.can_write_domain_truth, false);
    assert.deepEqual(output.okf_validation.errors.map((error: { code: string }) => error.code), [
      'okf_frontmatter_required',
    ]);
    assert.deepEqual(output.okf_validation.warnings.map((warning: { code: string }) => warning.code), [
      'okf_broken_link',
    ]);
  } finally {
    fs.rmSync(bundleRoot, { recursive: true, force: true });
  }
});

test('opl okf inspect projects bundle contract and file roles', () => {
  const bundleRoot = createOkfBundle({
    'index.md': '# Index\n\n- [[valid]]\n',
    'log.md': '# Log\n',
    'valid.md': [
      '---',
      'type: concept',
      'unexpected_field: tolerated',
      '---',
      '',
      '# Valid',
    ].join('\n'),
  });

  try {
    const output = runCli(['okf', 'inspect', '--bundle', bundleRoot, '--json']);

    assert.equal(output.version, 'g2');
    assert.equal(output.okf_bundle.surface_kind, 'opl_okf_context_bundle_inspection');
    assert.equal(output.okf_bundle.contract.bundle_role, 'context_bundle');
    assert.equal(output.okf_bundle.validation.status, 'valid');
    assert.equal(output.okf_bundle.validation.authority_boundary.can_write_memory_body, false);
    assert.equal(
      output.okf_bundle.validation.files.find((file: { path: string }) => file.path === 'index.md')?.role,
      'index',
    );
    assert.equal(
      output.okf_bundle.validation.files.find((file: { path: string }) => file.path === 'valid.md')?.frontmatter.unexpected_field,
      'tolerated',
    );
  } finally {
    fs.rmSync(bundleRoot, { recursive: true, force: true });
  }
});

test('opl okf project-repo writes pack refs and optional memory locator without authority', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-okf-domain-repo-'));
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-okf-domain-output-'));
  fs.mkdirSync(path.join(repoRoot, 'contracts'), { recursive: true });
  fs.writeFileSync(
    path.join(repoRoot, 'contracts', 'pack_compiler_input.json'),
    JSON.stringify({
      domain_id: 'fixture-agent',
      domain_pack_owner: 'fixture-agent',
      required_domain_pack_paths: [
        'agent/prompts/intake.md',
        'agent/stages/intake.md',
        'agent/skills/intake.md',
        'agent/quality_gates/intake-quality-gate.md',
      ],
      source_refs: {
        stage_graph_source_ref: 'contracts/stage_control_plane.json',
      },
      authority_boundary: {
        can_write_domain_truth: false,
      },
    }, null, 2),
    'utf8',
  );
  fs.writeFileSync(
    path.join(repoRoot, 'contracts', 'durable_knowledge_catalog.json'),
    JSON.stringify({
      surface_kind: 'opl_durable_knowledge_catalog', version: 'durable-knowledge-catalog.v2',
      owner: 'one-person-lab', domain_id: 'fixture-agent',
      items: [{
        surface_kind: 'opl_durable_knowledge_item', version: 'durable-knowledge-item.v2',
        knowledge_id: 'fixture.context', title: 'Context', scope: { kind: 'product', id: 'fixture-agent' }, content_kind: 'mechanism', owner: 'fixture-agent',
        body_ref: { kind: 'repo_path', ref: 'agent/knowledge/context.md' },
        applicability: { domains: ['fixture-agent'], stages: ['intake'] },
        status: 'active', reviewed_at: '2026-01-01T00:00:00Z', next_review_at: '2099-01-01T00:00:00Z',
        authority_boundary: { semantic_body_owner: 'fixture-agent', opl_role: 'catalog_recall_and_receipt_projection_only' },
      }],
    }, null, 2),
    'utf8',
  );

  try {
    const output = runCli([
      'okf',
      'project-repo',
      '--repo',
      repoRoot,
      '--output',
      outputRoot,
      '--source-root-ref',
      'repo:fixture-agent',
      '--json',
    ]);

    assert.equal(output.version, 'g2');
    assert.equal(output.okf_domain_repo.surface_kind, 'opl_okf_domain_repo_projection_readback');
    assert.equal(output.okf_domain_repo.domain_id, 'fixture-agent');
    assert.equal(output.okf_domain_repo.knowledge_catalog_status, 'loaded');
    assert.equal(output.okf_domain_repo.memory_locator_count, 1);
    assert.equal(output.okf_domain_repo.okf_validation.status, 'valid');
    assert.equal(output.okf_domain_repo.okf_validation.warnings.length, 0);
    assert.equal(output.okf_domain_repo.okf_write.written_files.length, 7);
    assert.equal(output.okf_domain_repo.authority_boundary.can_write_domain_truth, false);
    assert.equal(output.okf_domain_repo.authority_boundary.can_schedule_runtime, false);

    const stageConcept = fs.readFileSync(path.join(outputRoot, 'fixture-agent/stage/intake.md'), 'utf8');
    assert.match(stageConcept, /repo:fixture-agent:agent\/stages\/intake.md/);
    assert.match(stageConcept, /\[\[fixture-agent\/prompt\/intake]]/);
    assert.match(stageConcept, /\[\[fixture-agent\/skill\/intake]]/);
    const memoryConcept = fs.readFileSync(
      path.join(outputRoot, 'fixture-agent/knowledge/fixture.context.md'),
      'utf8',
    );
    assert.match(memoryConcept, /knowledge_id: fixture.context/);
    assert.equal(memoryConcept.includes('memory_body:'), false);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
    fs.rmSync(outputRoot, { recursive: true, force: true });
  }
});

test('opl okf native-frontmatter inspect is an advisory readback over agent markdown', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-okf-native-cli-'));
  fs.mkdirSync(path.join(repoRoot, 'agent', 'stages'), { recursive: true });
  fs.writeFileSync(
    path.join(repoRoot, 'agent', 'stages', 'intake.md'),
    [
      '---',
      'type: stage',
      'body_owner: fixture-agent',
      'domain_authority: contracts/domain-authority.json',
      '---',
      '',
      '# Intake',
    ].join('\n'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(repoRoot, 'agent', 'stages', 'draft.md'),
    [
      '---',
      'type: stage',
      '---',
      '',
      '# Draft',
    ].join('\n'),
    'utf8',
  );

  try {
    const output = runCli([
      'okf',
      'native-frontmatter',
      'inspect',
      '--repo',
      repoRoot,
      '--json',
    ]);

    assert.equal(output.version, 'g2');
    assert.equal(output.okf_native_frontmatter.surface_kind, 'opl_okf_native_frontmatter_inspection');
    assert.equal(output.okf_native_frontmatter.status, 'advisory_gaps');
    assert.equal(output.okf_native_frontmatter.summary.eligible_file_count, 2);
    assert.equal(output.okf_native_frontmatter.summary.ready_file_count, 1);
    assert.equal(output.okf_native_frontmatter.summary.missing_required_field_count, 1);
    assert.equal(output.okf_native_frontmatter.authority_boundary.can_write_domain_truth, false);
    assert.equal(output.okf_native_frontmatter.authority_boundary.can_schedule_runtime, false);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

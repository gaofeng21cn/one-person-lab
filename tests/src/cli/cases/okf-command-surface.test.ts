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

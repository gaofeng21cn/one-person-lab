import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { assert, test } from './cli/helpers.ts';
import {
  OKF_CONTEXT_BUNDLE_CONTRACT,
  buildOkfContextBundleProjection,
  inspectOkfNativeFrontmatter,
  validateOkfContextBundle,
} from '../../src/modules/pack/okf-context-bundle.ts';

function createBundle(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), 'opl-okf-bundle-'));
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = join(root, relativePath);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content, 'utf8');
  }
  return root;
}

test('OKF contract freezes OPL authority false flags and reserved filenames', () => {
  assert.equal(OKF_CONTEXT_BUNDLE_CONTRACT.authority_boundary.can_write_domain_truth, false);
  assert.equal(OKF_CONTEXT_BUNDLE_CONTRACT.authority_boundary.can_write_memory_body, false);
  assert.equal(OKF_CONTEXT_BUNDLE_CONTRACT.authority_boundary.can_authorize_quality_verdict, false);
  assert.deepEqual(OKF_CONTEXT_BUNDLE_CONTRACT.reserved_filenames, ['index.md', 'log.md']);
  assert.deepEqual(
    OKF_CONTEXT_BUNDLE_CONTRACT.okf_v0_1_source_refs.map((ref) => ref.ref),
    [
      'https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md',
      'https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing',
    ],
  );
});

test('OKF native frontmatter migration stays opt-in and non-authoritative', () => {
  const policy = OKF_CONTEXT_BUNDLE_CONTRACT.native_frontmatter_migration_policy;

  assert.equal(policy.state, 'opt_in_advisory_migration_lane');
  assert.equal(policy.default_bundle_mode, 'exporter_generated_body_free_context_bundle');
  assert.deepEqual(policy.required_fields, ['type', 'body_owner', 'domain_authority']);
  assert.deepEqual(policy.eligible_path_globs, ['agent/*.md', 'agent/**/*.md']);
  assert.equal(policy.runtime_consumption_policy.runway_consumes_okf_for_progress_or_readiness, false);
  assert.equal(policy.runtime_consumption_policy.framework_readiness_consumes_okf_for_ready_claims, false);
  assert.equal(policy.runtime_consumption_policy.domain_readiness_consumes_okf_for_ready_claims, false);
  assert.equal(policy.false_authority_fields.native_frontmatter_authorizes_domain_truth, false);
  assert.equal(policy.false_authority_fields.native_frontmatter_authorizes_memory_body_write, false);
  assert.equal(policy.false_authority_fields.native_frontmatter_authorizes_owner_receipt, false);
  assert.equal(policy.false_authority_fields.native_frontmatter_authorizes_typed_blocker, false);
  assert.equal(policy.false_authority_fields.native_frontmatter_authorizes_quality_or_export_verdict, false);
  assert.equal(policy.false_authority_fields.native_frontmatter_authorizes_artifact_authority, false);
  assert.equal(policy.false_authority_fields.native_frontmatter_authorizes_runtime_scheduling, false);
  assert.equal(policy.false_authority_fields.native_frontmatter_authorizes_readiness, false);
  assert.deepEqual(policy.foldback_docs, [
    'human_doc:opl_decisions',
    'human_doc:opl_status',
    'human_doc:opl_architecture',
    'human_doc:opl_current_state_vs_ideal_gap',
  ]);
});

test('OKF native frontmatter inspector reports advisory gaps without granting authority', () => {
  const repoRoot = mkdtempSync(join(tmpdir(), 'opl-okf-native-frontmatter-'));
  try {
    mkdirSync(join(repoRoot, 'agent', 'prompts'), { recursive: true });
    writeFileSync(
      join(repoRoot, 'agent', 'prompts', 'ready.md'),
      [
        '---',
        'type: prompt',
        'body_owner: fixture-agent',
        'domain_authority: contracts/domain-authority.json',
        '---',
        '',
        '# Ready',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(repoRoot, 'agent', 'prompts', 'missing-fields.md'),
      [
        '---',
        'type: prompt',
        '---',
        '',
        '# Missing Fields',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(repoRoot, 'agent', 'prompts', 'forbidden.md'),
      [
        '---',
        'type: prompt',
        'body_owner: fixture-agent',
        'domain_authority: contracts/domain-authority.json',
        'opl_can_schedule_runtime: true',
        '---',
        '',
        '# Forbidden',
      ].join('\n'),
      'utf8',
    );

    const inspection = inspectOkfNativeFrontmatter({ repoRoot });

    assert.equal(inspection.surface_kind, 'opl_okf_native_frontmatter_inspection');
    assert.equal(inspection.status, 'advisory_gaps');
    assert.equal(inspection.default_bundle_mode, 'exporter_generated_body_free_context_bundle');
    assert.equal(inspection.summary.eligible_file_count, 3);
    assert.equal(inspection.summary.ready_file_count, 1);
    assert.equal(inspection.summary.advisory_gap_count, 2);
    assert.equal(inspection.summary.forbidden_authority_claim_count, 1);
    assert.equal(inspection.authority_boundary.can_write_domain_truth, false);
    assert.equal(inspection.authority_boundary.can_schedule_runtime, false);
    assert.deepEqual(
      inspection.files.find((file) => file.path === 'agent/prompts/missing-fields.md')?.missing_required_fields,
      ['body_owner', 'domain_authority'],
    );
    assert.deepEqual(
      inspection.files.find((file) => file.path === 'agent/prompts/forbidden.md')?.forbidden_authority_claim_fields,
      ['opl_can_schedule_runtime'],
    );
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('OKF builder creates a projection without granting runtime or domain authority', () => {
  const projection = buildOkfContextBundleProjection({
    bundleId: 'demo-bundle',
    title: 'Demo Bundle',
    concepts: [
      {
        id: 'stage-packet',
        title: 'Stage Packet',
        type: 'concept',
        body: 'References [[missing-concept]] and keeps unknown frontmatter.',
        frontmatter: {
          unexpected_okf_extension: 'kept',
        },
      },
    ],
  });

  assert.equal(projection.surface_kind, 'opl_okf_context_bundle_projection');
  assert.equal(projection.bundle_role, 'context_bundle');
  assert.equal(projection.authority_boundary.can_write_domain_truth, false);
  assert.equal(projection.authority_boundary.can_write_memory_body, false);
  assert.equal(projection.files['stage-packet.md']?.frontmatter.type, 'concept');
  assert.equal(
    projection.files['stage-packet.md']?.frontmatter.unexpected_okf_extension,
    'kept',
  );
  assert.deepEqual(projection.warnings, [
    {
      code: 'okf_broken_link',
      file: 'stage-packet.md',
      link: 'missing-concept',
      message: 'OKF wikilink target is not present in this bundle.',
    },
  ]);
});

test('OKF validator requires concept frontmatter type but tolerates unknown frontmatter and broken links', () => {
  const root = createBundle({
    'index.md': '# Index\n\n- [[concept-a]]\n',
    'log.md': '# Log\n',
    'concept-a.md': [
      '---',
      'type: concept',
      'unknown_field: tolerated',
      '---',
      '',
      '# Concept A',
      'Broken [[missing-concept]] link.',
    ].join('\n'),
    'missing-type.md': [
      '---',
      'title: Missing Type',
      '---',
      '',
      '# Missing Type',
    ].join('\n'),
  });

  try {
    const validation = validateOkfContextBundle({ bundlePath: root });

    assert.equal(validation.status, 'invalid');
    assert.deepEqual(validation.errors.map((error) => error.code), ['okf_frontmatter_type_required']);
    assert.deepEqual(validation.warnings.map((warning) => warning.code), ['okf_broken_link']);
    assert.equal(validation.files.find((file) => file.path === 'concept-a.md')?.frontmatter.unknown_field, 'tolerated');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('OKF validator rejects concept documents using reserved filenames', () => {
  const root = createBundle({
    'index.md': [
      '---',
      'type: concept',
      '---',
      '',
      '# Reserved concept',
    ].join('\n'),
  });

  try {
    const validation = validateOkfContextBundle({ bundlePath: root });

    assert.equal(validation.status, 'invalid');
    assert.deepEqual(validation.errors.map((error) => error.code), ['okf_reserved_filename_for_concept']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

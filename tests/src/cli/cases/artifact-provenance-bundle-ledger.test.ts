import { assert, fs, os, path, runCli, test } from '../helpers.ts';

const HASH_ZERO = '0'.repeat(64);
const HASH_ONE = '1'.repeat(64);
type BundleIssue = { code: string; ref: string };
type BundleSection = {
  section_key: string;
  refs: string[];
  missing_refs: string[];
  restricted_refs: string[];
};

function writeBundleFixture(root: string) {
  const bundlePath = path.join(root, 'bundle.json');
  fs.writeFileSync(
    bundlePath,
    `${JSON.stringify({
      schema_version: 'artifact-provenance-bundle.v1',
      bundle_id: 'bundle:demo',
      artifact_ref: 'artifact://mas/demo-output',
      domain_id: 'medautoscience',
      artifact_type: 'manuscript_snapshot',
      created_at: '2026-07-03T00:00:00.000Z',
      refs: {
        code: ['git:one-person-lab@demo'],
        inputs: ['source:dm003/input'],
        outputs: ['artifact://mas/demo-output'],
        environment: ['env:node-24'],
        agent_trace: ['codex:thread/demo'],
        reviews: ['review:independent/demo'],
        replay: ['replay:stage/demo'],
      },
      hashes: {
        manifest: { algorithm: 'sha256', value: HASH_ZERO },
        artifact: { algorithm: 'sha256', value: HASH_ONE },
      },
      authority_boundary: {
        ledger_refs_only: true,
        forbidden_claims: [
          'domain_ready',
          'artifact_ready',
          'quality_verdict',
          'production_ready',
        ],
      },
    }, null, 2)}\n`,
  );
  return bundlePath;
}

test('ledger artifact provenance bundle validates, inspects, records, exports, and doctors refs only', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-artifact-provenance-bundle-'));
  const stateDir = path.join(root, 'state');
  const bundlePath = writeBundleFixture(root);
  const env = { OPL_STATE_DIR: stateDir };

  const validation = runCli([
    'ledger',
    'bundle',
    'validate',
    '--bundle',
    bundlePath,
  ], env).artifact_provenance_bundle_validation;
  assert.equal(validation.status, 'valid');
  assert.equal(validation.bundle_id, 'bundle:demo');
  assert.equal(validation.artifact_body_read, false);
  assert.deepEqual(validation.missing_required_fields, []);

  const inspection = runCli([
    'ledger',
    'bundle',
    'inspect',
    '--bundle',
    bundlePath,
  ], env).artifact_provenance_bundle_inspection;
  assert.equal(inspection.manifest.bundle_id, 'bundle:demo');
  assert.equal(inspection.manifest.refs.outputs[0], 'artifact://mas/demo-output');
  assert.equal(inspection.artifact_body_read, false);

  const record = runCli([
    'ledger',
    'bundle',
    'record',
    '--bundle',
    bundlePath,
    '--domain',
    'medautoscience',
    '--artifact',
    'artifact://mas/demo-output',
  ], env).artifact_provenance_bundle_record;
  assert.equal(record.status, 'recorded');
  assert.equal(record.record.domain_id, 'medautoscience');
  assert.equal(record.record.artifact_ref, 'artifact://mas/demo-output');
  assert.equal(record.record.artifact_body_read, false);
  assert.equal(record.record.authority_boundary.ledger_refs_only, true);
  assert.equal(record.record.issue_count, 0);
  assert.equal(record.record.sections.length, 7);
  assert.equal(record.ledger_event.event_kind, 'record');
  assert.equal(record.ledger_event.artifact_body_read, false);
  assert.equal(record.ledger_file, path.join(stateDir, 'artifact-provenance-bundles.json'));

  const ledger = JSON.parse(fs.readFileSync(record.ledger_file, 'utf8'));
  assert.equal(ledger.records[0].bundle_id, 'bundle:demo');
  assert.equal(ledger.records[0].bundle_manifest_hash.algorithm, 'sha256');
  assert.equal(
    ledger.records[0].sections.find((section: BundleSection) => section.section_key === 'outputs').refs[0],
    'artifact://mas/demo-output',
  );

  const artifactInspection = runCli([
    'ledger',
    'bundle',
    'inspect',
    '--artifact',
    'artifact://mas/demo-output',
  ], env).artifact_provenance_bundle_inspection;
  assert.equal(artifactInspection.status, 'found');
  assert.equal(artifactInspection.record.bundle_id, 'bundle:demo');
  assert.equal(artifactInspection.artifact_body_read, false);

  const exported = runCli([
    'ledger',
    'bundle',
    'export',
    '--bundle',
    bundlePath,
    '--format',
    'ro-crate',
  ], env).artifact_provenance_bundle_export;
  assert.equal(exported.format, 'ro-crate');
  assert.equal(exported.ro_crate_metadata['@graph'][0]['@id'], './');
  assert.equal(exported.ro_crate_metadata['@graph'][1]['@id'], 'artifact://mas/demo-output');
  assert.equal(exported.artifact_body_read, false);
  assert.equal(exported.ledger_event.event_kind, 'export');

  const doctor = runCli([
    'ledger',
    'bundle',
    'doctor',
    '--bundle',
    bundlePath,
  ], env).artifact_provenance_bundle_doctor;
  assert.equal(doctor.status, 'ok');
  assert.deepEqual(doctor.attention, []);
  assert.equal(doctor.artifact_body_read, false);
  assert.equal(doctor.ledger_event.event_kind, 'doctor');
});

test('ledger artifact provenance bundle preserves typed issues for recorded artifact lookup', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-artifact-provenance-bundle-issues-'));
  const stateDir = path.join(root, 'state');
  const bundlePath = path.join(root, 'bundle.json');
  fs.writeFileSync(
    bundlePath,
    `${JSON.stringify({
      schema_version: 'artifact-provenance-bundle.v1',
      bundle_id: 'bundle:issues',
      artifact_ref: 'artifact://mas/needs-review',
      domain_id: 'medautoscience',
      artifact_type: 'figure',
      created_at: '2026-07-03T00:00:00.000Z',
      refs: {
        code: ['git:one-person-lab@demo'],
        inputs: ['source:dm003/input'],
        outputs: ['artifact://mas/needs-review'],
        environment: ['env:node-24'],
        replay: ['replay:stage/demo'],
      },
      missing_refs: {
        agent_trace: ['codex:thread/full-transcript'],
        reviews: ['review:independent/visual-audit'],
      },
      restricted_refs: {
        inputs: ['workspace://restricted/input-body'],
      },
      typed_issues: [
        {
          code: 'missing_replay_command',
          severity: 'error',
          section: 'replay',
          message: 'Replay command is missing from the domain bundle.',
        },
      ],
      hashes: {
        artifact: { algorithm: 'sha256', value: HASH_ONE },
      },
      authority_boundary: {
        ledger_refs_only: true,
        forbidden_claims: ['quality_verdict'],
      },
    }, null, 2)}\n`,
  );
  const env = { OPL_STATE_DIR: stateDir };

  const validation = runCli([
    'ledger',
    'bundle',
    'validate',
    '--bundle',
    bundlePath,
  ], env).artifact_provenance_bundle_validation;
  assert.equal(validation.status, 'valid');
  assert.equal(validation.issue_count, 4);
  assert.equal(validation.issues.some((issue: BundleIssue) => issue.code === 'missing_replay_command'), true);
  assert.equal(validation.issues.filter((issue: BundleIssue) => issue.code === 'missing_ref').length, 2);
  assert.equal(validation.issues.some((issue: BundleIssue) => issue.code === 'restricted_ref'), true);
  assert.deepEqual(validation.sections.find((section: BundleSection) => section.section_key === 'agent_trace').missing_refs, [
    'codex:thread/full-transcript',
  ]);

  const record = runCli([
    'ledger',
    'bundle',
    'record',
    '--bundle',
    bundlePath,
    '--domain',
    'medautoscience',
    '--artifact',
    'artifact://mas/needs-review',
  ], env).artifact_provenance_bundle_record;
  assert.equal(record.record.issue_count, 4);
  assert.equal(
    record.record.sections.find((section: BundleSection) => section.section_key === 'inputs').restricted_refs[0],
    'workspace://restricted/input-body',
  );

  const artifactInspection = runCli([
    'ledger',
    'bundle',
    'inspect',
    '--artifact',
    'artifact://mas/needs-review',
  ], env).artifact_provenance_bundle_inspection;
  assert.equal(artifactInspection.status, 'found');
  assert.equal(artifactInspection.issue_count, 4);
  assert.equal(
    artifactInspection.record.issues.some((issue: BundleIssue) => issue.ref === 'review:independent/visual-audit'),
    true,
  );

  const doctor = runCli([
    'ledger',
    'bundle',
    'doctor',
    '--bundle',
    bundlePath,
  ], env).artifact_provenance_bundle_doctor;
  assert.equal(doctor.status, 'attention');
  assert.equal(doctor.issues.some((issue: BundleIssue) => issue.code === 'missing_ref'), true);
});

test('ledger artifact provenance bundle rejects body fields and non-contract shapes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-artifact-provenance-bundle-invalid-'));
  const bundlePath = path.join(root, 'bundle.json');
  fs.writeFileSync(
    bundlePath,
    `${JSON.stringify({
      schema_version: 'artifact-provenance-bundle.v1',
      bundle_id: 'bundle:invalid',
      artifact_ref: 'artifact://mas/demo-output',
      domain_id: 'medautoscience',
      artifact_type: 'manuscript_snapshot',
      created_at: '2026-07-03T00:00:00.000Z',
      refs: {
        outputs: 'artifact://mas/demo-output',
      },
      hashes: {
        artifact: HASH_ONE,
      },
      authority_boundary: {
        ledger_refs_only: true,
        forbidden_claims: ['artifact_ready'],
      },
      body: 'must not be accepted by the Ledger bundle surface',
    }, null, 2)}\n`,
  );

  const validation = runCli([
    'ledger',
    'bundle',
    'validate',
    '--bundle',
    bundlePath,
  ]).artifact_provenance_bundle_validation;
  assert.equal(validation.status, 'invalid');
  assert.equal(validation.artifact_body_read, false);
  assert.equal(validation.invalid_fields.includes('refs.outputs'), true);
  assert.equal(validation.invalid_hash_fields.includes('hashes.artifact'), true);
  assert.deepEqual(validation.forbidden_body_fields, ['body']);
  assert.equal(validation.issues.some((issue: BundleIssue) => issue.code === 'forbidden_body_field'), true);
  assert.equal(validation.issues.some((issue: BundleIssue) => issue.code === 'manifest_invalid_hash_field'), true);
});

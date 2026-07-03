import { assert, fs, os, path, runCli, test } from '../helpers.ts';

const HASH_ZERO = '0'.repeat(64);
const HASH_ONE = '1'.repeat(64);

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
  assert.equal(record.ledger_file, path.join(stateDir, 'artifact-provenance-bundles.json'));

  const ledger = JSON.parse(fs.readFileSync(record.ledger_file, 'utf8'));
  assert.equal(ledger.records[0].bundle_id, 'bundle:demo');
  assert.equal(ledger.records[0].bundle_manifest_hash.algorithm, 'sha256');

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
});

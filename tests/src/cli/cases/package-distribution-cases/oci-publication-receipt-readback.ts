import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

import { assert, execFileSync, fs, os, parseJsonText, path, repoRoot, test } from './helpers.ts';

const packageId = 'occ';
const version = '0.4.0';
const sourceRepo = 'https://github.com/example/occ.git';
const sourceCommit = 'a'.repeat(40);
const frameworkCommit = 'b'.repeat(40);
const subject = 'ghcr.io/example/one-person-lab-private-packages/occ@';

function digest(bytes: Buffer) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

test('private publication receipt readback verifies the authenticated referrer and trusted signing key', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-private-receipt-readback-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin, { recursive: true });
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const publicKeyPath = path.join(root, 'trusted.pub');
  fs.writeFileSync(publicKeyPath, publicKey.export({ type: 'spki', format: 'pem' }));
  const signingKeyDigest = digest(publicKey.export({ type: 'spki', format: 'der' }));

  const archive = Buffer.from('source archive\n');
  const manifestLayer = Buffer.from('{"package_id":"occ"}\n');
  const payload = Buffer.from('{"content_lock":{"digest":"sha256:test"}}\n');
  const subjectManifest = Buffer.from(JSON.stringify({
    schemaVersion: 2,
    artifactType: 'application/vnd.onepersonlab.package.v1',
    layers: [
      { mediaType: 'application/vnd.onepersonlab.package.source.v1+gzip', digest: digest(archive), size: archive.length },
      { mediaType: 'application/vnd.onepersonlab.package.manifest.v1+json', digest: digest(manifestLayer), size: manifestLayer.length },
      { mediaType: 'application/vnd.onepersonlab.package.payload.v1+json', digest: digest(payload), size: payload.length },
    ],
  }));
  const subjectDigest = digest(subjectManifest);
  const subjectRef = `${subject}${subjectDigest}`;
  for (const selected of [
    { subject: subjectRef.replace('one-person-lab-private-packages', 'one-person-lab-packages'), policy: 'github-package:example/one-person-lab-private-packages/occ' },
    { subject: subjectRef, policy: 'github-package:example/one-person-lab-private-packages/other' },
  ]) {
    const rejected = spawnSync(process.execPath, [
      path.join(repoRoot, 'scripts/oci-publication-receipt-readback.mjs'),
      '--subject', selected.subject, '--package-id', packageId, '--version', version,
      '--source-repo', sourceRepo, '--source-commit', sourceCommit, '--public-key', publicKeyPath,
      '--access-policy-ref', selected.policy, '--credential-provider', 'github_packages',
    ], { encoding: 'utf8', env: { PATH: bin } });
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /canonical owner.access identity|namespace and access policy/);
    assert.doesNotMatch(rejected.stderr, /oras readback|cosign readback/);
  }
  const receipt = {
    surface_kind: 'opl_package_publication_receipt.v1',
    status: 'published_and_verified',
    publication_request_id: 'private-readback-request',
    workflow: { repository: 'example/occ', run_id: '123', run_attempt: '1' },
    package: { package_id: packageId, version, owner_source_commit: sourceCommit, framework_source_commit: frameworkCommit },
    source: { owner_repository: sourceRepo.replace(/\.git$/, ''), oci_annotation: 'https://github.com/example/one-person-lab' },
    content: {
      source_archive_digest: digest(archive), manifest_digest: digest(manifestLayer), payload_manifest_digest: digest(payload),
    },
    immutable: { ref: `${subject.split('@')[0]}:${version}`, digest: subjectDigest }, latest_stable: { ref: `${subject.split('@')[0]}:latest-stable`, digest: subjectDigest },
    access: { visibility: 'authorized_only', access_policy_ref: 'github-package:example/one-person-lab-private-packages/occ', credential_provider: 'github_packages', registry_visibility_verified: true },
    attestations: { status: 'verified', subject: subjectRef, signing_key_digest: signingKeyDigest, transparency_log: 'not_uploaded_private' },
    anonymous_readback: { status: 'denied_verified' }, authenticated_readback: { status: 'verified' },
  };
  const receiptBytes = Buffer.from(`${JSON.stringify(receipt)}\n`);
  const receiptLayerDigest = digest(receiptBytes);
  const receiptManifest = Buffer.from(JSON.stringify({
    schemaVersion: 2, artifactType: 'application/vnd.onepersonlab.package.receipt.v1',
    subject: { mediaType: 'application/vnd.oci.image.manifest.v1+json', digest: subjectDigest },
    layers: [{ mediaType: 'application/vnd.onepersonlab.package.receipt.v1+json', digest: receiptLayerDigest, size: receiptBytes.length }],
  }));
  const receiptDigest = digest(receiptManifest);
  const receiptRef = `${subject.split('@')[0]}@${receiptDigest}`;
  const provenanceStatement = {
    payloadType: 'application/vnd.in-toto+json',
    payload: Buffer.from(JSON.stringify({
      predicateType: 'https://slsa.dev/provenance/v1',
      subject: [{ name: subjectRef, digest: { sha256: subjectDigest.slice(7) } }],
      predicate: { buildDefinition: {
        internalParameters: { publication_request_id: 'private-readback-request' },
        externalParameters: { package_id: packageId, package_version: version, owner_source_commit: sourceCommit, framework_source_commit: frameworkCommit },
        resolvedDependencies: [{ uri: sourceRepo.replace(/\.git$/, ''), digest: { gitCommit: sourceCommit } }],
      }, runDetails: { builder: { id: 'example/occ/.github/workflows/publish-package.yml@refs/heads/main' }, metadata: { invocationId: '123-1' } } },
    })).toString('base64'),
  };
  const sbomStatement = {
    payloadType: 'application/vnd.in-toto+json',
    payload: Buffer.from(JSON.stringify({
      predicateType: 'https://spdx.dev/Document',
      subject: [{ name: subjectRef, digest: { sha256: subjectDigest.slice(7) } }],
      predicate: { spdxVersion: 'SPDX-2.3', packages: [{ name: packageId, versionInfo: version, downloadLocation: subjectRef, checksums: [{ algorithm: 'SHA256', checksumValue: digest(archive).slice(7) }] }] },
    })).toString('base64'),
  };
  const mapsPath = path.join(root, 'maps.json');
  fs.writeFileSync(mapsPath, JSON.stringify({
    subjectRef, subject: subjectManifest.toString(), receiptRef, receipt: receiptManifest.toString(), receiptBlob: receiptBytes.toString('base64'),
  }));
  fs.writeFileSync(path.join(bin, 'oras'), `#!/usr/bin/env node
const fs = require('node:fs');
const maps = JSON.parse(fs.readFileSync(process.env.OPL_RECEIPT_MAPS, 'utf8'));
const a = process.argv.slice(2);
if (a[0] === 'discover') { process.stdout.write(JSON.stringify({ referrers: maps.referrers || [{ artifactType: 'application/vnd.onepersonlab.package.receipt.v1', digest: '${receiptDigest}' }] })); process.exit(0); }
if (a[0] === 'manifest' && a[1] === 'fetch') { const ref = a.at(-1); process.stdout.write(ref === maps.subjectRef ? maps.subject : (maps.receipts?.[ref] || maps.receipt)); process.exit(0); }
if (a[0] === 'blob' && a[1] === 'fetch') { process.stdout.write(Buffer.from(maps.blobs?.[a.at(-1)] || maps.receiptBlob, 'base64')); process.exit(0); }
process.exit(2);
`);
  fs.chmodSync(path.join(bin, 'oras'), 0o755);
  fs.writeFileSync(path.join(bin, 'cosign'), `#!/usr/bin/env node
const fs = require('node:fs');
const statements = ${JSON.stringify([provenanceStatement, sbomStatement])};
process.stdout.write(JSON.stringify(statements));
`);
  fs.chmodSync(path.join(bin, 'cosign'), 0o755);

  const output = parseJsonText(execFileSync(process.execPath, [
    path.join(repoRoot, 'scripts/oci-publication-receipt-readback.mjs'),
    '--subject', subjectRef, '--package-id', packageId, '--version', version,
    '--source-repo', sourceRepo, '--source-commit', sourceCommit, '--public-key', publicKeyPath,
    '--access-policy-ref', 'github-package:example/one-person-lab-private-packages/occ', '--credential-provider', 'github_packages',
    '--receipt-digest', receiptDigest, '--include-receipt',
    '--publication-request-id', 'private-readback-request', '--workflow-repository', 'example/occ', '--workflow-run-id', '123',
  ], { encoding: 'utf8', env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, OPL_RECEIPT_MAPS: mapsPath } })) as Record<string, unknown>;
  assert.equal(output.status, 'verified');
  assert.equal(output.receipt_ref, receiptRef);
  assert.equal(output.signing_key_digest, signingKeyDigest);
  assert.equal(output.trusted_key_source, 'caller_software_source_configuration');
  assert.deepEqual(output.receipt, receipt, 'callers receive only the digest-checked and signature-bound receipt');

  const bad = spawnSync(process.execPath, [
    path.join(repoRoot, 'scripts/oci-publication-receipt-readback.mjs'),
    '--subject', subjectRef, '--package-id', packageId, '--version', version,
    '--source-repo', sourceRepo, '--source-commit', sourceCommit,
    '--access-policy-ref', 'github-package:example/one-person-lab-private-packages/occ', '--credential-provider', 'github_packages',
  ], { encoding: 'utf8', env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, OPL_RECEIPT_MAPS: mapsPath } });
  assert.notEqual(bad.status, 0);
  assert.match(`${bad.stdout}${bad.stderr}`, /trusted software source configuration/);
  const cosignPath = path.join(bin, 'cosign');
  const originalCosign = fs.readFileSync(cosignPath, 'utf8');
  const mismatchedProvenance = JSON.parse(Buffer.from(provenanceStatement.payload, 'base64').toString());
  mismatchedProvenance.predicate.buildDefinition.internalParameters.publication_request_id = 'different-request';
  const mismatchedEnvelope = { ...provenanceStatement, payload: Buffer.from(JSON.stringify(mismatchedProvenance)).toString('base64') };
  fs.writeFileSync(cosignPath, `#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify(${JSON.stringify([mismatchedEnvelope, sbomStatement])}));\n`);
  const wrongRequest = spawnSync(process.execPath, [
    path.join(repoRoot, 'scripts/oci-publication-receipt-readback.mjs'),
    '--subject', subjectRef, '--package-id', packageId, '--version', version,
    '--source-repo', sourceRepo, '--source-commit', sourceCommit, '--public-key', publicKeyPath,
    '--access-policy-ref', 'github-package:example/one-person-lab-private-packages/occ', '--credential-provider', 'github_packages',
  ], { encoding: 'utf8', env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, OPL_RECEIPT_MAPS: mapsPath } });
  assert.notEqual(wrongRequest.status, 0);
  assert.equal(wrongRequest.stdout, '', 'a receipt from another signed publication request is not returned');
  fs.writeFileSync(cosignPath, originalCosign);

  const runSelected = (extra: string[]) => spawnSync(process.execPath, [
    path.join(repoRoot, 'scripts/oci-publication-receipt-readback.mjs'),
    '--subject', subjectRef, '--package-id', packageId, '--version', version,
    '--source-repo', sourceRepo, '--source-commit', sourceCommit, '--public-key', publicKeyPath,
    '--access-policy-ref', 'github-package:example/one-person-lab-private-packages/occ', '--credential-provider', 'github_packages', ...extra,
  ], { encoding: 'utf8', env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, OPL_RECEIPT_MAPS: mapsPath } });
  assert.equal(JSON.parse(runSelected([]).stdout).receipt, undefined, 'normal consumer output stays bounded');
  const nextReceipt = { ...receipt, publication_request_id: 'next-request', workflow: { ...receipt.workflow, run_id: '124' } };
  const nextBytes = Buffer.from(JSON.stringify(nextReceipt));
  const nextLayer = { mediaType: 'application/vnd.onepersonlab.package.receipt.v1+json', digest: digest(nextBytes), size: nextBytes.length };
  const nextManifest = Buffer.from(JSON.stringify({ ...JSON.parse(receiptManifest.toString()), layers: [nextLayer] }));
  const nextDigest = digest(nextManifest);
  const originalMaps = fs.readFileSync(mapsPath, 'utf8');
  const multipleMaps = JSON.parse(originalMaps);
  multipleMaps.referrers = [receiptDigest, nextDigest].map((value) => ({ artifactType: 'application/vnd.onepersonlab.package.receipt.v1', digest: value }));
  multipleMaps.receipts = { [`${subject.split('@')[0]}@${nextDigest}`]: nextManifest.toString() };
  multipleMaps.blobs = { [`${subject.split('@')[0]}@${nextLayer.digest}`]: nextBytes.toString('base64') };
  fs.writeFileSync(mapsPath, JSON.stringify(multipleMaps));
  const nextProvenance = JSON.parse(Buffer.from(provenanceStatement.payload, 'base64').toString());
  nextProvenance.predicate.buildDefinition.internalParameters.publication_request_id = 'next-request';
  nextProvenance.predicate.runDetails.metadata.invocationId = '124-1';
  const nextEnvelope = { ...provenanceStatement, payload: Buffer.from(JSON.stringify(nextProvenance)).toString('base64') };
  fs.writeFileSync(cosignPath, `#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify(${JSON.stringify([provenanceStatement, nextEnvelope, sbomStatement])}));\n`);
  const selected = runSelected(['--include-receipt', '--publication-request-id', 'next-request', '--workflow-repository', 'example/occ', '--workflow-run-id', '124']);
  assert.equal(selected.status, 0, selected.stderr);
  assert.deepEqual(JSON.parse(selected.stdout).receipt, nextReceipt, 'old receipt and old attestation do not hide the selected publication');
  const absent = runSelected(['--include-receipt', '--publication-request-id', 'absent-request']);
  assert.notEqual(absent.status, 0);
  assert.equal(absent.stdout, '');
  fs.writeFileSync(cosignPath, originalCosign);
  fs.writeFileSync(mapsPath, originalMaps);

  const maps = JSON.parse(fs.readFileSync(mapsPath, 'utf8'));
  maps.receiptBlob = Buffer.from(JSON.stringify({ ...receipt, status: 'forged' })).toString('base64');
  fs.writeFileSync(mapsPath, JSON.stringify(maps));
  const tampered = spawnSync(process.execPath, [
    path.join(repoRoot, 'scripts/oci-publication-receipt-readback.mjs'),
    '--subject', subjectRef, '--package-id', packageId, '--version', version,
    '--source-repo', sourceRepo, '--source-commit', sourceCommit, '--public-key', publicKeyPath,
    '--access-policy-ref', 'github-package:example/one-person-lab-private-packages/occ', '--credential-provider', 'github_packages',
  ], { encoding: 'utf8', env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, OPL_RECEIPT_MAPS: mapsPath } });
  assert.notEqual(tampered.status, 0);
  assert.equal(tampered.stdout, '', 'unverified receipt contents are never returned');
  assert.match(tampered.stderr, /No publication receipt matches/);
  privateKey.export({ type: 'pkcs8', format: 'pem' });
});

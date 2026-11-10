#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const receiptType = 'application/vnd.onepersonlab.package.receipt.v1';
const receiptLayerType = `${receiptType}+json`;
const packageType = 'application/vnd.onepersonlab.package.v1';
const digestPattern = /^sha256:[0-9a-f]{64}$/;
const sha256 = (bytes) => `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;

function fail(message) { throw new Error(`Private Package publication verification failed: ${message}`); }
function json(bytes, label) {
  try { return JSON.parse(bytes.toString('utf8')); } catch { return fail(`${label} is not valid JSON.`); }
}

function run(command, args, env) {
  const result = spawnSync(command, args, {
    env, encoding: 'buffer', stdio: 'pipe', timeout: 90_000, maxBuffer: 8 * 1024 * 1024,
  });
  // Raw CLI errors can contain provider diagnostics. Never forward credentials,
  // command arguments, or a private predicate into the caller's error surface.
  if (result.error || result.status !== 0) fail(`${command} readback did not complete successfully.`);
  return result.stdout;
}

function manifest(ref, env, expectedDigest) {
  const bytes = run('oras', ['manifest', 'fetch', ref], env);
  if (sha256(bytes) !== expectedDigest) fail('OCI manifest bytes do not match the selected digest.');
  return json(bytes, 'OCI manifest');
}

function verifiedStatements(bytes) {
  const text = bytes.toString('utf8').trim();
  let envelopes;
  try {
    const parsed = JSON.parse(text);
    envelopes = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    try { envelopes = text.split('\n').filter(Boolean).map((line) => JSON.parse(line)); }
    catch { return fail('Cosign did not return verified attestations.'); }
  }
  return envelopes.map((envelope) => {
    if (envelope?.payloadType !== 'application/vnd.in-toto+json' || typeof envelope.payload !== 'string') {
      return fail('Cosign returned an unsupported attestation envelope.');
    }
    return json(Buffer.from(envelope.payload, 'base64'), 'Verified attestation');
  });
}

function verifyAttestations(input, env, subjectDigest) {
  const read = (type) => verifiedStatements(run('cosign', [
    'verify-attestation', '--timeout', '60s', '--key', input.publicKey,
    '--insecure-ignore-tlog', '--type', type, input.subject,
  ], env));
  const isSubject = (statement) => Array.isArray(statement?.subject)
    && statement.subject.some((entry) => entry?.digest?.sha256 === subjectDigest.slice(7));
  const provenances = read('slsaprovenance1').filter((statement) => {
    const definition = statement?.predicate?.buildDefinition;
    const parameters = definition?.externalParameters;
    return isSubject(statement) && statement.predicateType === 'https://slsa.dev/provenance/v1'
      && parameters?.package_id === input.packageId && parameters?.package_version === input.version
      && parameters?.owner_source_commit === input.sourceCommit
      && Array.isArray(definition.resolvedDependencies)
      && definition.resolvedDependencies.some((dependency) =>
        dependency?.uri === input.sourceRepo.replace(/\.git$/, '')
        && dependency?.digest?.gitCommit === input.sourceCommit);
  });
  if (provenances.length === 0) fail('Signed provenance does not bind the selected Package and owner source.');
  const sbom = read('spdxjson').find((statement) => isSubject(statement)
    && statement.predicateType === 'https://spdx.dev/Document'
    && statement.predicate?.spdxVersion === 'SPDX-2.3'
    && Array.isArray(statement.predicate.packages)
    && statement.predicate.packages.some((entry) => entry?.name === input.packageId
      && entry?.versionInfo === input.version && entry?.downloadLocation === input.subject));
  if (!sbom) fail('Signed SBOM does not bind the selected Package.');
  return { provenances, sbom };
}

function validateReceipt(receipt, input, subjectDigest, layers, keyDigest, attestations) {
  const content = receipt?.content;
  const repository = input.subject.split('@')[0];
  const provenance = attestations.provenances.map((statement) => statement.predicate).find((predicate) =>
    receipt?.package?.framework_source_commit === predicate.buildDefinition.externalParameters.framework_source_commit
    && receipt?.publication_request_id === predicate.buildDefinition.internalParameters?.publication_request_id
    && predicate.runDetails?.metadata?.invocationId === `${receipt?.workflow?.run_id}-${receipt?.workflow?.run_attempt}`
    && typeof predicate.runDetails?.builder?.id === 'string'
    && predicate.runDetails.builder.id.startsWith(`${receipt?.workflow?.repository}/.github/workflows/`));
  const matchingLayer = (kind, value) => layers.some((layer) =>
    layer?.mediaType === `application/vnd.onepersonlab.package.${kind}` && layer?.digest === value);
  if (receipt?.surface_kind !== 'opl_package_publication_receipt.v1'
    || receipt.status !== 'published_and_verified'
    || receipt.package?.package_id !== input.packageId || receipt.package?.version !== input.version
    || receipt.package?.owner_source_commit !== input.sourceCommit
    || !provenance
    || receipt.package?.framework_source_commit !== provenance.buildDefinition.externalParameters.framework_source_commit
    || !receipt.publication_request_id
    || receipt.publication_request_id !== provenance.buildDefinition.internalParameters?.publication_request_id
    || !receipt.workflow?.repository || !receipt.workflow?.run_id || !receipt.workflow?.run_attempt
    || provenance.runDetails?.metadata?.invocationId !== `${receipt.workflow.run_id}-${receipt.workflow.run_attempt}`
    || typeof provenance.runDetails?.builder?.id !== 'string'
    || !provenance.runDetails.builder.id.startsWith(`${receipt.workflow.repository}/.github/workflows/`)
    || receipt.source?.owner_repository !== input.sourceRepo.replace(/\.git$/, '')
    || receipt.immutable?.digest !== subjectDigest || receipt.latest_stable?.digest !== subjectDigest
    || receipt.immutable?.ref !== `${repository}:${input.version}`
    || receipt.latest_stable?.ref !== `${repository}:latest-stable`
    || receipt.access?.visibility !== 'authorized_only'
    || receipt.access?.access_policy_ref !== input.accessPolicyRef
    || receipt.access?.credential_provider !== input.credentialProvider
    || receipt.access?.registry_visibility_verified !== true
    || receipt.attestations?.status !== 'verified' || receipt.attestations?.subject !== input.subject
    || receipt.attestations?.signing_key_digest !== keyDigest
    || receipt.attestations?.transparency_log !== 'not_uploaded_private'
    || receipt.anonymous_readback?.status !== 'denied_verified'
    || receipt.authenticated_readback?.status !== 'verified'
    || !matchingLayer('source.v1+gzip', content?.source_archive_digest)
    || !matchingLayer('manifest.v1+json', content?.manifest_digest)
    || !matchingLayer('payload.v1+json', content?.payload_manifest_digest)) {
    fail('Receipt does not match the selected Package, source, access policy, or signed content.');
  }
  const sbomPackage = attestations.sbom.predicate.packages.find((entry) => entry.name === input.packageId);
  if (!sbomPackage?.checksums?.some((checksum) => checksum.algorithm === 'SHA256'
    && checksum.checksumValue === content.source_archive_digest.slice(7))) {
    fail('Signed SBOM checksum does not match the source archive.');
  }
}

export function verifyPrivatePackagePublication(input, env = process.env) {
  const match = /^(ghcr\.io\/[a-z0-9._-]+\/one-person-lab-private-packages\/[a-z0-9.-]+)@(sha256:[0-9a-f]{64})$/.exec(input.subject ?? '');
  if (!match || !/^[a-z0-9][a-z0-9.-]*$/.test(input.packageId ?? '')
    || !/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(input.version ?? '')
    || !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\.git$/.test(input.sourceRepo ?? '')
    || !/^[0-9a-f]{40}$/.test(input.sourceCommit ?? '')
    || !input.accessPolicyRef || input.credentialProvider !== 'github_packages') {
    fail('An exact Package digest and canonical owner/access identity are required.');
  }
  if (!match[1].endsWith(`/${input.packageId}`)
    || input.accessPolicyRef !== `github-package:${match[1].slice('ghcr.io/'.length)}`) {
    fail('The private Package namespace and access policy must match the selected Package.');
  }
  if (input.receiptDigest && !digestPattern.test(input.receiptDigest)) fail('Receipt digest is invalid.');
  if (!input.publicKey || !fs.existsSync(input.publicKey) || !fs.statSync(input.publicKey).isFile()) {
    fail('A public signing key from the trusted software source configuration is required.');
  }
  let keyDigest;
  try {
    keyDigest = sha256(crypto.createPublicKey(fs.readFileSync(input.publicKey)).export({ type: 'spki', format: 'der' }));
  } catch { fail('The configured trusted public signing key is invalid.'); }
  const [, repository, subjectDigest] = match;
  const subject = manifest(input.subject, env, subjectDigest);
  if (subject?.artifactType !== packageType || !Array.isArray(subject.layers)) fail('The selected artifact is not an OPL Package.');
  const attestations = verifyAttestations(input, env, subjectDigest);
  const discovered = json(run('oras', [
    'discover', '--format', 'json', '--depth', '1', '--artifact-type', receiptType, input.subject,
  ], env), 'OCI referrers');
  const candidates = (Array.isArray(discovered?.referrers) ? discovered.referrers : [])
    .filter((entry) => entry?.artifactType === receiptType && digestPattern.test(entry.digest ?? '')
      && (!input.receiptDigest || entry.digest === input.receiptDigest));
  if (candidates.length === 0 || candidates.length > 64) fail('A bounded publication receipt referrer is required.');
  for (const candidate of candidates) {
    try {
      const receiptRef = `${repository}@${candidate.digest}`;
      const artifact = manifest(receiptRef, env, candidate.digest);
      if (artifact?.artifactType !== receiptType || artifact.subject?.digest !== subjectDigest
        || !Array.isArray(artifact.layers) || artifact.layers.length !== 1) fail('Receipt OCI subject is invalid.');
      const layer = artifact.layers[0];
      if (layer?.mediaType !== receiptLayerType || !digestPattern.test(layer.digest ?? '')) fail('Receipt layer is invalid.');
      const bytes = run('oras', ['blob', 'fetch', '--output', '-', `${repository}@${layer.digest}`], env);
      if (sha256(bytes) !== layer.digest || bytes.length !== layer.size) fail('Receipt layer bytes do not match its digest.');
      const receipt = json(bytes, 'Publication receipt');
      validateReceipt(receipt, input, subjectDigest, subject.layers, keyDigest, attestations);
      if ((input.publicationRequestId && receipt.publication_request_id !== input.publicationRequestId)
        || (input.workflowRepository && receipt.workflow.repository !== input.workflowRepository)
        || (input.workflowRunId && String(receipt.workflow.run_id) !== input.workflowRunId)) continue;
      return {
        status: 'verified', subject: input.subject, package_id: input.packageId, version: input.version,
        receipt_ref: receiptRef, receipt_digest: candidate.digest, signing_key_digest: keyDigest,
        trusted_key_source: 'caller_software_source_configuration',
        ...(input.includeReceipt ? { receipt } : {}),
      };
    } catch {
      // Retries can attach more than one receipt to the same immutable subject.
      // Only a matching, digest-checked receipt may satisfy the readback.
    }
  }
  return fail('No publication receipt matches the selected private Package.');
}

function main() {
  const names = { '--subject': 'subject', '--package-id': 'packageId', '--version': 'version',
    '--source-repo': 'sourceRepo', '--source-commit': 'sourceCommit', '--public-key': 'publicKey',
    '--access-policy-ref': 'accessPolicyRef', '--credential-provider': 'credentialProvider', '--receipt-digest': 'receiptDigest',
    '--publication-request-id': 'publicationRequestId', '--workflow-repository': 'workflowRepository', '--workflow-run-id': 'workflowRunId' };
  const input = {};
  const argv = process.argv.slice(2);
  for (let index = 0; index < argv.length; index += 2) {
    if (argv[index] === '--include-receipt') { input.includeReceipt = true; index -= 1; continue; }
    const field = names[argv[index]];
    if (!field || !argv[index + 1] || argv[index + 1].startsWith('--')) fail('Unknown or incomplete readback option.');
    input[field] = argv[index + 1];
  }
  process.stdout.write(`${JSON.stringify(verifyPrivatePackagePublication(input))}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}

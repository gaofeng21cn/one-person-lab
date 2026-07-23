import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseJsonText } from '../../../../scripts/script-json-boundary.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

const PACKAGE_IDS = ['mag', 'mas', 'mas-scholar-skills', 'obf', 'oma', 'opl-flow', 'rca'];
const PACKAGE_VERSIONS: Record<string, string> = {
  mag: '0.3.4',
  mas: '0.2.17',
  'mas-scholar-skills': '0.2.18',
  obf: '0.3.6',
  oma: '0.4.3',
  'opl-flow': '0.1.25',
  rca: '0.2.8',
};
const SCRIPT = path.join(repoRoot, 'scripts/verify-package-latest-stable.mjs');

function digest(label: string | Buffer) {
  return `sha256:${crypto.createHash('sha256').update(label).digest('hex')}`;
}

function sourceSha(label: string) {
  return crypto.createHash('sha1').update(label).digest('hex');
}

function writeJson(filePath: string, value: unknown) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function packageRef(packageId: string) {
  return `ghcr.io/gaofeng21cn/one-person-lab-packages/${packageId}:${PACKAGE_VERSIONS[packageId]}`;
}

function fixture(root: string) {
  fs.mkdirSync(root, { recursive: true });
  const generation = '26.7.23';
  const requestId = 'daily-26.7.23';
  const baselineDigest = 'sha256:c1089f46917e3113caae4b63dc662faf651ab83a76b10945c2c1ef506ea954f8';
  const carrierDigest = digest('candidate-26.7.23');
  const sourceHead = sourceSha('framework-main-with-auto-promotion');
  const app = {
    component_id: 'opl-app',
    version: '26.7.22',
    source_commit: sourceSha('app'),
    artifact_ref: 'ghcr.io/gaofeng21cn/one-person-lab-app:26.7.22',
    artifact_digest: digest('app'),
    carriers: [
      {
        carrier_id: 'macos_standard',
        carrier_kind: 'release_asset',
        package_profile: 'standard',
        ref: 'https://github.com/gaofeng21cn/one-person-lab-app/releases/download/v26.7.22/One-Person-Lab.dmg',
        digest: digest('app-macos'),
        size: 101,
      },
      {
        carrier_id: 'docker_webui',
        carrier_kind: 'oci_image',
        package_profile: 'webui-full',
        ref: 'ghcr.io/gaofeng21cn/one-person-lab-app:26.7.22-webui',
        digest: digest('app-webui'),
        size: 202,
      },
    ],
  };
  const base = {
    component_id: 'opl-base',
    version: '0.3.5',
    source_commit: sourceHead,
    artifact_ref: 'ghcr.io/gaofeng21cn/one-person-lab-framework:0.3.5',
    artifact_digest: digest('opl-base'),
  };
  const members = Object.fromEntries(PACKAGE_IDS.map((packageId) => [packageId, {
    component_id: packageId,
    version: PACKAGE_VERSIONS[packageId],
    source_commit: sourceSha(packageId),
    artifact_ref: packageRef(packageId),
    artifact_digest: digest(packageId),
  }]));
  const sourceCutoff = {
    policy: 'single_read_at_freeze_admission',
    frozen_base_release_set: {
      generation: '26.7.20',
      digest: baselineDigest,
    },
    later_authority_advancement_invalidates_receipt: false,
  };
  const receipt = (target: 'candidate' | 'latest-stable', runId: string) => {
    const channelRef = `ghcr.io/gaofeng21cn/one-person-lab-manifest:${target}`;
    const verifiedRefs = [
      channelRef,
      `ghcr.io/gaofeng21cn/one-person-lab-framework:${target}`,
      ...PACKAGE_IDS.map((packageId) => `ghcr.io/gaofeng21cn/one-person-lab-packages/${packageId}:${target}`),
    ].sort();
    return {
      surface_kind: 'opl_release_set_promotion_receipt.v1',
      status: target === 'candidate' ? 'published_immutable_candidate' : 'promoted_latest_stable',
      promotion_target: target,
      promotion_request_id: requestId,
      release_gate: target === 'candidate' ? 'daily_package_channel' : 'attested_candidate_auto_promotion',
      release_set_generation: generation,
      carrier: {
        immutable_ref: `ghcr.io/gaofeng21cn/one-person-lab-manifest:${generation}`,
        digest: carrierDigest,
        channel_ref: channelRef,
      },
      framework_run: {
        repository: 'gaofeng21cn/one-person-lab',
        run_id: runId,
        run_attempt: '1',
      },
      source_app_run_id: '3001',
      source_cutoff: structuredClone(sourceCutoff),
      app: structuredClone(app),
      components: { base: structuredClone(base), packages: structuredClone(members) },
      anonymous_readback: { status: 'verified', verified_refs: verifiedRefs },
    };
  };
  const candidate = receipt('candidate', '1001');
  const promotion = receipt('latest-stable', '2001');
  const releaseComponents = {
    app: { ...structuredClone(app), release_status: 'published', artifact_status: 'published_immutable' },
    base: { ...structuredClone(base), artifact_status: 'published_immutable' },
    packages: {
      package_count: 7,
      members: Object.fromEntries(PACKAGE_IDS.map((packageId) => [packageId, {
        ...structuredClone(members[packageId]),
        owner_source_commit: members[packageId].source_commit,
        artifact_status: 'published_immutable',
      }])),
    },
  };
  const releaseSet: Record<string, any> = {
    surface_kind: 'opl_release_set.v2',
    generation,
    component_count: 9,
    component_ids: ['opl-app', 'opl-base', ...PACKAGE_IDS],
    components: releaseComponents,
    bom_status: 'complete',
  };
  releaseSet.bom_digest = digest(JSON.stringify(releaseComponents));
  const releaseManifest = { release_set_generation: generation, release_set: releaseSet };
  const packageCatalog = Object.fromEntries(PACKAGE_IDS.map((packageId) => [packageId, {
    package_id: packageId,
    selected_version: PACKAGE_VERSIONS[packageId],
    versions: [{
      package_version: PACKAGE_VERSIONS[packageId],
      selection_status: 'selected_for_release_set',
      source_artifact_ref: packageRef(packageId),
      artifact_digest: digest(packageId),
      artifact_status: 'published_immutable',
    }],
  }]));
  const channelManifest = {
    release_set_generation: generation,
    release_set: structuredClone(releaseSet),
    packages: { package_catalog: packageCatalog },
    package_catalog_digest: digest(JSON.stringify(packageCatalog)),
  };
  const expectation = {
    surface_kind: 'opl_package_latest_stable_expectation.v1',
    evidence_class: 'fixture',
    baseline: { status: 'resolved', generation: '26.7.20', carrier_digest: baselineDigest },
    candidate: {
      generation,
      carrier_digest: carrierDigest,
      promotion_request_id: requestId,
      repository: 'gaofeng21cn/one-person-lab',
      source_head_sha: sourceHead,
    },
    framework: { version: '0.3.5', source_commit: sourceHead },
    app: { version: app.version, source_commit: app.source_commit, artifact_digest: app.artifact_digest },
    packages: structuredClone(PACKAGE_VERSIONS),
  };
  const candidatePath = path.join(root, 'candidate.json');
  writeJson(candidatePath, candidate);
  const candidateSha = digest(fs.readFileSync(candidatePath));
  const certificateIdentity = 'https://github.com/gaofeng21cn/one-person-lab/.github/workflows/packages.yml@refs/heads/main';
  const subject = (ref: string, subjectDigest: string) => ({
    ref,
    digest: subjectDigest,
    slsa_provenance: {
      status: 'verified',
      certificate_identity: certificateIdentity,
      certificate_oidc_issuer: 'https://token.actions.githubusercontent.com',
    },
    spdx_sbom: {
      status: 'verified',
      certificate_identity: certificateIdentity,
      certificate_oidc_issuer: 'https://token.actions.githubusercontent.com',
    },
  });
  const subjects: Record<string, unknown> = {
    'opl-release-set': subject(`ghcr.io/gaofeng21cn/one-person-lab-manifest@${carrierDigest}`, carrierDigest),
    'opl-base': subject(`ghcr.io/gaofeng21cn/one-person-lab-framework@${base.artifact_digest}`, base.artifact_digest),
  };
  for (const packageId of PACKAGE_IDS) {
    subjects[packageId] = subject(`ghcr.io/gaofeng21cn/one-person-lab-packages/${packageId}@${members[packageId].artifact_digest}`, members[packageId].artifact_digest);
  }
  const attestation = {
    surface_kind: 'opl_release_set_attestation_readback.v1',
    status: 'verified',
    source_run: {
      repository: 'gaofeng21cn/one-person-lab',
      run_id: '1001',
      run_attempt: '1',
      head_sha: sourceHead,
      conclusion: 'success',
    },
    artifact: { name: `opl-release-promotion-receipt-${requestId}-candidate`, receipt_sha256: candidateSha },
    subjects,
  };
  const observations: Record<string, unknown> = {
    'opl-release-set': {
      status: 'resolved',
      ref: 'ghcr.io/gaofeng21cn/one-person-lab-manifest:latest-stable',
      digest: carrierDigest,
    },
    'opl-base': {
      status: 'resolved',
      ref: 'ghcr.io/gaofeng21cn/one-person-lab-framework:latest-stable',
      digest: base.artifact_digest,
    },
  };
  for (const packageId of PACKAGE_IDS) {
    observations[packageId] = {
      status: 'resolved',
      ref: `ghcr.io/gaofeng21cn/one-person-lab-packages/${packageId}:latest-stable`,
      digest: members[packageId].artifact_digest,
    };
  }
  const remote = {
    surface_kind: 'opl_package_channel_remote_readback.v1',
    status: 'verified',
    observations,
  };
  const catalogRef = 'ghcr.io/gaofeng21cn/one-person-lab-manifest:latest-stable';
  const appReadback = {
    version: 'g2',
    opl_agent_packages: {
      surface_kind: 'opl_agent_package_readback',
      directory: {
        first_party_release_currentness: {
          status: 'live',
          live_verified: true,
          catalog_ref: catalogRef,
          catalog_digest: carrierDigest,
          checked_at: '2026-07-23T00:00:00.000Z',
        },
        entries: PACKAGE_IDS.map((packageId) => ({
          package_id: packageId,
          source_kind: 'first_party_release_catalog',
          selected_version: PACKAGE_VERSIONS[packageId],
          stable_version: PACKAGE_VERSIONS[packageId],
          version_currentness: {
            status: 'live_release_set',
            live_verified: true,
            source_ref: catalogRef,
            source_digest: carrierDigest,
          },
          release_target: {
            package_version: PACKAGE_VERSIONS[packageId],
            artifact_digest: members[packageId].artifact_digest,
          },
        })),
      },
    },
  };
  const files: Record<string, unknown> = {
    expectation,
    promotion,
    attestation,
    release: releaseManifest,
    channel: channelManifest,
    remote,
    app: appReadback,
  };
  const paths: Record<string, string> = { candidate: candidatePath, output: path.join(root, 'capsule.json') };
  for (const [name, value] of Object.entries(files)) {
    paths[name] = path.join(root, `${name}.json`);
    writeJson(paths[name], value);
  }
  return paths;
}

function args(paths: Record<string, string>, output = paths.output) {
  return [
    '--expectation', paths.expectation,
    '--candidate-receipt', paths.candidate,
    '--promotion-receipt', paths.promotion,
    '--attestation-readback', paths.attestation,
    '--release-manifest', paths.release,
    '--channel-manifest', paths.channel,
    '--remote-readback', paths.remote,
    '--app-readback', paths.app,
    '--output', output,
  ];
}

function tempFixture(t: any) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-latest-stable-verifier-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, paths: fixture(root) };
}

function run(paths: Record<string, string>, output = paths.output) {
  return parseJsonText(execFileSync(process.execPath, [SCRIPT, ...args(paths, output)], {
    cwd: repoRoot,
    encoding: 'utf8',
  })) as Record<string, any>;
}

function rejectRun(paths: Record<string, string>, expectedCode: string) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args(paths)], { cwd: repoRoot, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  const failure = parseJsonText(result.stderr.trim()) as Record<string, any>;
  assert.equal(failure.status, 'rejected');
  assert.equal(failure.code, expectedCode);
  return failure;
}

function mutate(filePath: string, update: (value: any) => void) {
  const value = parseJsonText(fs.readFileSync(filePath, 'utf8')) as any;
  update(value);
  writeJson(filePath, value);
}

test('latest-stable verifier closes exact receipts, attestations, remote tags, catalog, and App live consumption deterministically', (t) => {
  const { root, paths } = tempFixture(t);
  const first = run(paths);
  const firstBytes = fs.readFileSync(paths.output);
  const secondOutput = path.join(root, 'capsule-second.json');
  const second = run(paths, secondOutput);
  const secondBytes = fs.readFileSync(secondOutput);
  assert.equal(first.status, 'verified');
  assert.equal(first.release_set_generation, '26.7.23');
  assert.equal(first.capsule_sha256, second.capsule_sha256);
  assert.deepEqual(firstBytes, secondBytes);
  const capsule = parseJsonText(firstBytes.toString('utf8')) as Record<string, any>;
  assert.equal(capsule.baseline.generation, '26.7.20');
  assert.equal(capsule.evidence_class, 'fixture');
  assert.equal(capsule.components.base.version, '0.3.5');
  assert.equal(capsule.components.packages['opl-flow'].version, '0.1.25');
  assert.equal(capsule.app_consumption.live_verified, true);
  assert.deepEqual(
    fs.readdirSync(root).filter((name) => fs.statSync(path.join(root, name)).isDirectory()),
    [],
  );
  const requestedCapsule = process.env.OPL_VERIFIER_CAPSULE_OUTPUT;
  if (requestedCapsule) fs.copyFileSync(paths.output, requestedCapsule);
});

test('latest-stable verifier rejects a missing candidate receipt', (t) => {
  const { paths } = tempFixture(t);
  paths.candidate = path.join(path.dirname(paths.candidate), 'absent-candidate.json');
  rejectRun(paths, 'missing_candidate_receipt');
});

test('latest-stable verifier rejects missing and incomplete attestation evidence', async (t) => {
  const missing = tempFixture(t).paths;
  missing.attestation = path.join(path.dirname(missing.attestation), 'absent-attestation.json');
  rejectRun(missing, 'missing_attestation');
  const incomplete = tempFixture(t).paths;
  mutate(incomplete.attestation, (value) => { delete value.subjects.rca; });
  rejectRun(incomplete, 'incomplete_attestation_set');
  const unverified = tempFixture(t).paths;
  mutate(unverified.attestation, (value) => { value.subjects.mas.slsa_provenance.status = 'missing'; });
  rejectRun(unverified, 'attestation_missing');
});

test('latest-stable verifier rejects candidate digest and identity drift', async (t) => {
  const digestDrift = tempFixture(t).paths;
  mutate(digestDrift.candidate, (value) => { value.carrier.digest = digest('wrong-candidate'); });
  rejectRun(digestDrift, 'candidate_receipt_invalid');
  const identityDrift = tempFixture(t).paths;
  mutate(identityDrift.attestation, (value) => { value.source_run.head_sha = sourceSha('wrong-head'); });
  rejectRun(identityDrift, 'attestation_identity_mismatch');
});

test('latest-stable verifier rejects promotion identity drift', (t) => {
  const { paths } = tempFixture(t);
  mutate(paths.promotion, (value) => { value.components.base.artifact_digest = digest('wrong-base'); });
  rejectRun(paths, 'promotion_identity_mismatch');
});

test('latest-stable verifier rejects an incomplete nine-component Release Set', (t) => {
  const { paths } = tempFixture(t);
  mutate(paths.candidate, (value) => { delete value.components.packages.rca; });
  rejectRun(paths, 'incomplete_release_set');
});

test('latest-stable verifier keeps network and authentication unknown fail closed', async (t) => {
  for (const failureKind of ['network', 'authentication']) {
    const { paths } = tempFixture(t);
    mutate(paths.remote, (value) => {
      value.observations.mas = { status: 'unknown', failure_kind: failureKind };
    });
    const failure = rejectRun(paths, 'remote_availability_unknown');
    assert.equal(failure.details.failure_kind, failureKind);
  }
});

test('latest-stable verifier distinguishes explicit not-found from unknown availability', (t) => {
  const { paths } = tempFixture(t);
  mutate(paths.remote, (value) => { value.observations.mas = { status: 'not_found' }; });
  rejectRun(paths, 'remote_not_found');
});

test('latest-stable verifier rejects cached App fixtures and catalog digest drift', async (t) => {
  const cached = tempFixture(t).paths;
  mutate(cached.app, (value) => {
    value.opl_agent_packages.directory.first_party_release_currentness.status = 'cached';
    value.opl_agent_packages.directory.first_party_release_currentness.live_verified = false;
  });
  rejectRun(cached, 'app_not_live_verified');
  const digestDrift = tempFixture(t).paths;
  mutate(digestDrift.app, (value) => {
    value.opl_agent_packages.directory.first_party_release_currentness.catalog_digest = digest('stale-catalog');
  });
  rejectRun(digestDrift, 'app_catalog_digest_mismatch');
});

test('latest-stable verifier rejects App Package artifact drift and incomplete consumption', async (t) => {
  const digestDrift = tempFixture(t).paths;
  mutate(digestDrift.app, (value) => {
    value.opl_agent_packages.directory.entries.find((entry: any) => entry.package_id === 'mas').release_target.artifact_digest = digest('wrong-mas');
  });
  rejectRun(digestDrift, 'app_package_digest_mismatch');
  const incomplete = tempFixture(t).paths;
  mutate(incomplete.app, (value) => {
    value.opl_agent_packages.directory.entries = value.opl_agent_packages.directory.entries.filter((entry: any) => entry.package_id !== 'obf');
  });
  rejectRun(incomplete, 'incomplete_app_package_set');
});

test('latest-stable verifier has no process, network, or publication mutation capability', () => {
  const source = fs.readFileSync(SCRIPT, 'utf8');
  assert.doesNotMatch(source, /node:child_process|\bfetch\s*\(|https\.request|\bexec(File|Sync)?\s*\(|\bspawn(Sync)?\s*\(/);
  assert.doesNotMatch(source, /oras\s+tag|workflow_dispatch|gh\s+workflow\s+run|packages\s+(install|update)/);
});

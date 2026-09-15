import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

import {
  assert,
  canonicalAgentPackageId,
  createGitModuleRemoteFixture,
  execFileSync,
  fs,
  normalizeFirstPartyAgentPackageManifest,
  os,
  parseJsonText,
  path,
  repoRoot,
  runCli,
  test,
} from './helpers.ts';
import {
  getOplPackageSpecs,
  getPublicationAdmittedOplPackageSpecs,
  loadOplPackageSpecs,
} from '../../../../../src/adapters/integration/package-distribution.ts';

test('single-Package payload materialization binds exact physical archive provenance', () => {
  const root = fs.realpathSync(fs.mkdtempSync(
    path.join(os.tmpdir(), 'opl-package-payload-materialization-'),
  ));
  const materializer = path.join(repoRoot, 'scripts/materialize-package-payload.mjs');
  const sourceCommit = 'a'.repeat(40);
  const packageId = 'example-agent';
  const packageVersion = '1.2.3';
  const archiveRoot = 'example-agent';
  const artifactRef = `ghcr.io/example/one-person-lab-packages/${packageId}:${packageVersion}`;
  const filePath = 'skills/example-plugin/SKILL.md';
  const descriptorPath = 'opl-package.json';
  const sourceRoot = '.';
  const fileBytes = Buffer.from('# Example\n', 'utf8');
  const descriptorBytes = Buffer.from('{"package_id":"example-agent"}\n', 'utf8');
  const fileSha256 = `sha256:${crypto.createHash('sha256').update(fileBytes).digest('hex')}`;
  const descriptorSha256 = `sha256:${crypto.createHash('sha256').update(descriptorBytes).digest('hex')}`;
  const input = path.join(root, 'payload.json');
  const packageManifest = path.join(root, 'package-manifest.json');
  const stage = path.join(root, 'stage');
  const archive = path.join(root, 'example-agent-1.2.3.tar.gz');
  const lengthPrefixedDigest = (entries: Array<{ path: string; bytes: Buffer }>) => {
    const hash = crypto.createHash('sha256');
    for (const entry of entries) {
      const pathBytes = Buffer.from(entry.path, 'utf8');
      const pathLength = Buffer.allocUnsafe(8);
      const fileLength = Buffer.allocUnsafe(8);
      pathLength.writeBigUInt64BE(BigInt(pathBytes.length));
      fileLength.writeBigUInt64BE(BigInt(entry.bytes.length));
      hash.update(pathLength);
      hash.update(pathBytes);
      hash.update(fileLength);
      hash.update(entry.bytes);
    }
    return `sha256:${hash.digest('hex')}`;
  };
  const capabilityContentLock = lengthPrefixedDigest([{ path: filePath, bytes: fileBytes }]);
  const payloadFiles = [{
    path: filePath,
    mode: '100644',
    source_url: `https://raw.githubusercontent.com/example/example-agent/${sourceCommit}/${filePath}`,
    sha256: fileSha256,
  }, {
    path: descriptorPath,
    mode: '100644',
    source_url: `https://raw.githubusercontent.com/example/example-agent/${sourceCommit}/${descriptorPath}`,
    sha256: descriptorSha256,
  }];
  const payload = {
    surface_kind: 'opl_package_payload_manifest.v2',
    schema_ref: 'contracts/opl-framework/package-payload-manifest-v2.schema.json',
    package_id: packageId,
    plugin_id: 'example-plugin',
    package_version: packageVersion,
    source_repo: 'https://github.com/example/example-agent.git',
    source_commit: sourceCommit,
    source_root: sourceRoot,
    content_lock: {
      algorithm: 'sha256',
      canonicalization: 'ordered_path_length_file_length_bytes',
      digest: capabilityContentLock,
    },
    files: payloadFiles,
  };
  fs.mkdirSync(path.join(stage, archiveRoot, path.dirname(filePath)), { recursive: true });
  fs.writeFileSync(path.join(stage, archiveRoot, filePath), fileBytes);
  fs.writeFileSync(path.join(stage, archiveRoot, descriptorPath), descriptorBytes);
  fs.writeFileSync(input, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.writeFileSync(packageManifest, `${JSON.stringify({
    package_id: packageId,
    package_role: 'capability_package',
    version: packageVersion,
    source_repo: payload.source_repo,
    content_lock: {
      algorithm: 'sha256',
      canonicalization: 'ordered_path_length_file_length_bytes',
      paths: [filePath],
      digest: capabilityContentLock,
    },
    codex_surface: {
      plugin_id: payload.plugin_id,
      carrier_source_commit: sourceCommit,
      plugin_payload_manifest_url: path.basename(input),
    },
  }, null, 2)}\n`, 'utf8');
  execFileSync('tar', ['-czf', archive, '-C', stage, archiveRoot]);
  const archiveSha256 = `sha256:${crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex')}`;
  const baseArgs = [
    '--experimental-strip-types',
    materializer,
    '--input', input,
    '--package-manifest', packageManifest,
    '--archive', archive,
    '--artifact-ref', artifactRef,
    '--archive-sha256', archiveSha256,
    '--archive-root', archiveRoot,
    '--package-id', packageId,
    '--package-version', packageVersion,
    '--source-commit', sourceCommit,
  ];
  const run = (name: string, args = baseArgs) => spawnSync(
    process.execPath,
    [...args, '--output', path.join(root, `${name}.json`)],
    { encoding: 'utf8' },
  );

  try {
    const success = run('materialized');
    assert.equal(success.status, 0, success.stderr);
    const receipt = parseJsonText(success.stdout) as Record<string, any>;
    const materialized = parseJsonText(
      fs.readFileSync(path.join(root, 'materialized.json'), 'utf8'),
    ) as Record<string, any>;
    assert.equal(receipt.status, 'materialized');
    assert.equal(receipt.archive_sha256, archiveSha256);
    assert.equal(receipt.file_count, 2);
    assert.deepEqual(materialized.package_source, {
      transport: 'same_oci_artifact_source_archive',
      artifact_ref: artifactRef,
      archive_sha256: archiveSha256,
      archive_root: archiveRoot,
    });
    assert.deepEqual(materialized.files, [{
      path: filePath,
      mode: '100644',
      sha256: fileSha256,
      source_path: filePath,
      source_artifact_ref: artifactRef,
    }, {
      path: descriptorPath,
      mode: '100644',
      sha256: descriptorSha256,
      source_path: descriptorPath,
      source_artifact_ref: artifactRef,
    }]);

    const standardInput = path.join(root, 'standard-payload.json');
    const standardPackageManifest = path.join(root, 'standard-package-manifest.json');
    fs.writeFileSync(standardInput, `${JSON.stringify({
      ...payload,
      content_lock: {
        ...payload.content_lock,
        digest: lengthPrefixedDigest([
          { path: filePath, bytes: fileBytes },
          { path: descriptorPath, bytes: descriptorBytes },
        ]),
      },
    }, null, 2)}\n`);
    fs.writeFileSync(standardPackageManifest, `${JSON.stringify({
      package_id: packageId,
      version: packageVersion,
      source_repo: payload.source_repo,
      codex_surface: {
        plugin_id: payload.plugin_id,
        carrier_source_commit: sourceCommit,
      },
    }, null, 2)}\n`);
    const standardArgs = [...baseArgs];
    standardArgs[standardArgs.indexOf('--input') + 1] = standardInput;
    standardArgs[standardArgs.indexOf('--package-manifest') + 1] = standardPackageManifest;
    const standard = run('standard', standardArgs);
    assert.equal(standard.status, 0, standard.stderr);

    const missingArchiveRootArgs = [...baseArgs];
    missingArchiveRootArgs.splice(missingArchiveRootArgs.indexOf('--archive-root'), 2);
    const missingArchiveRoot = run('missing-archive-root', missingArchiveRootArgs);
    assert.equal(missingArchiveRoot.status, 1);
    assert.match(missingArchiveRoot.stderr, /Missing required options: --archive-root/);

    const missingPackageManifestArgs = [...baseArgs];
    missingPackageManifestArgs.splice(missingPackageManifestArgs.indexOf('--package-manifest'), 2);
    const missingPackageManifest = run('missing-package-manifest', missingPackageManifestArgs);
    assert.equal(missingPackageManifest.status, 1);
    assert.match(missingPackageManifest.stderr, /Missing required options: --package-manifest/);

    const wrongArtifactArgs = [...baseArgs];
    wrongArtifactArgs[wrongArtifactArgs.indexOf('--artifact-ref') + 1] = `${artifactRef}-wrong`;
    const wrongArtifact = run('wrong-artifact', wrongArtifactArgs);
    assert.equal(wrongArtifact.status, 1);
    assert.match(wrongArtifact.stderr, /Artifact ref does not match the exact owner Package selection/);

    const wrongArchiveShaArgs = [...baseArgs];
    wrongArchiveShaArgs[wrongArchiveShaArgs.indexOf('--archive-sha256') + 1] = `sha256:${'0'.repeat(64)}`;
    const wrongArchiveSha = run('wrong-archive-sha', wrongArchiveShaArgs);
    assert.equal(wrongArchiveSha.status, 1);
    assert.match(wrongArchiveSha.stderr, /Archive SHA-256 mismatch/);

    const wrongRootArgs = [...baseArgs];
    wrongRootArgs[wrongRootArgs.indexOf('--archive-root') + 1] = 'other-root';
    const wrongRoot = run('wrong-root', wrongRootArgs);
    assert.equal(wrongRoot.status, 1);
    assert.match(wrongRoot.stderr, /Archive root does not match the Package owner repository/);

    const wrongContentLockInput = path.join(root, 'wrong-content-lock-input.json');
    fs.writeFileSync(wrongContentLockInput, `${JSON.stringify({
      ...payload,
      content_lock: { ...payload.content_lock, digest: `sha256:${'0'.repeat(64)}` },
    })}\n`);
    const wrongContentLockManifest = path.join(root, 'wrong-content-lock-package-manifest.json');
    fs.writeFileSync(wrongContentLockManifest, `${JSON.stringify({
      ...JSON.parse(fs.readFileSync(packageManifest, 'utf8')),
      content_lock: {
        ...JSON.parse(fs.readFileSync(packageManifest, 'utf8')).content_lock,
        digest: `sha256:${'0'.repeat(64)}`,
      },
    }, null, 2)}\n`);
    const wrongContentLockArgs = [...baseArgs];
    wrongContentLockArgs[wrongContentLockArgs.indexOf('--input') + 1] = wrongContentLockInput;
    wrongContentLockArgs[wrongContentLockArgs.indexOf('--package-manifest') + 1] = wrongContentLockManifest;
    const wrongContentLock = run('wrong-content-lock', wrongContentLockArgs);
    assert.equal(wrongContentLock.status, 1);
    assert.match(wrongContentLock.stderr, /Package archive content_lock mismatch/);

    const duplicatePathInput = path.join(root, 'duplicate-path-input.json');
    fs.writeFileSync(duplicatePathInput, `${JSON.stringify({
      ...payload,
      files: [...payload.files, { ...payload.files[0], mode: '100755' }],
    })}\n`);
    const duplicatePathArgs = [...baseArgs];
    duplicatePathArgs[duplicatePathArgs.indexOf('--input') + 1] = duplicatePathInput;
    const duplicatePath = run('duplicate-path', duplicatePathArgs);
    assert.equal(duplicatePath.status, 1);
    assert.match(duplicatePath.stderr, /files repeats package path/);

    for (const [name, invalidPayload] of [
      ['legacy-envelope', { ...payload, surface_kind: 'opl_agent_package_payload_manifest.v1' }],
      ['wrong-canonicalization', {
        ...payload,
        content_lock: { ...payload.content_lock, canonicalization: 'ordered_path_nul_file_bytes' },
      }],
      ['missing-mode', {
        ...payload,
        files: payload.files.map((entry, index) => index === 0
          ? Object.fromEntries(Object.entries(entry).filter(([key]) => key !== 'mode'))
          : entry),
      }],
    ] as const) {
      const invalidPath = path.join(root, `${name}-input.json`);
      fs.writeFileSync(invalidPath, `${JSON.stringify(invalidPayload)}\n`);
      const invalidArgs = [...baseArgs];
      invalidArgs[invalidArgs.indexOf('--input') + 1] = invalidPath;
      const result = run(name, invalidArgs);
      assert.equal(result.status, 1, name);
      assert.match(result.stderr, /Payload input failed.*package-payload-manifest-v2\.schema\.json/, name);
    }

    const invalidInput = path.join(root, 'invalid-schema-input.json');
    fs.writeFileSync(invalidInput, `${JSON.stringify({ ...payload, schema_ref: 'wrong-schema' })}\n`);
    const invalidSchemaArgs = [...baseArgs];
    invalidSchemaArgs[invalidSchemaArgs.indexOf('--input') + 1] = invalidInput;
    const invalidSchema = run('invalid-schema', invalidSchemaArgs);
    assert.equal(invalidSchema.status, 1);
    assert.match(invalidSchema.stderr, /Payload input failed.*package-payload-manifest-v2\.schema\.json/);

    const symlinkInput = path.join(root, 'symlink-input.json');
    fs.symlinkSync(input, symlinkInput);
    const symlinkArgs = [...baseArgs];
    symlinkArgs[symlinkArgs.indexOf('--input') + 1] = symlinkInput;
    const symlinkFailure = run('symlink-failure', symlinkArgs);
    assert.equal(symlinkFailure.status, 1);
    assert.match(symlinkFailure.stderr, /Cannot open physical payload input/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('single-Package publication is protected, selector-bound, and readback-only after unknown results', () => {
  const workflow = fs.readFileSync(path.join(repoRoot, '.github/workflows/publish-package.yml'), 'utf8');
  const packageSpecs = getPublicationAdmittedOplPackageSpecs();
  const publisherPackageIds = packageSpecs.map((spec) => spec.package_id);

  assert.match(workflow, /^  workflow_dispatch:$/m);
  assert.doesNotMatch(workflow, /^\s+(?:workflow_run|schedule):$/m);
  assert.match(workflow, /^permissions: \{\}$/m);
  assert.match(
    workflow,
    /^    environment:\n      name: \$\{\{ github\.event_name == 'schedule' && 'release-stable-automated' \|\| 'release-stable' \}\}$/m,
  );
  assert.match(
    workflow,
    /^      PUBLICATION_ENVIRONMENT: \$\{\{ github\.event_name == 'schedule' && 'release-stable-automated' \|\| 'release-stable' \}\}$/m,
  );
  assert.match(workflow, /^    permissions:\n      contents: read\n      id-token: write\n      packages: write$/m);
  assert.deepEqual(packageSpecs.map((spec) => spec.package_id), publisherPackageIds);
  assert.equal(loadOplPackageSpecs().some((spec) => spec.package_id === 'opl-channel-weixin'), true);
  assert.equal(getOplPackageSpecs().some((spec) => spec.package_id === 'opl-link-desktop-connector'), true);
  assert.equal(publisherPackageIds.includes('opl-channel-weixin'), false);
  assert.equal(publisherPackageIds.includes('opl-link-desktop-connector'), false);
  assert.match(workflow, new RegExp(`options: \\[${publisherPackageIds.join(', ')}\\]`));
  const linkPublicationGate = spawnSync(process.execPath, [
    '--experimental-strip-types',
    path.join(repoRoot, 'scripts/package-source-projection-gate.mjs'),
    '--package-id', 'opl-link-desktop-connector',
    '--owner-root', repoRoot,
  ], { cwd: repoRoot, encoding: 'utf8' });
  assert.equal(linkPublicationGate.status, 1);
  assert.match(linkPublicationGate.stderr, /Package is not admitted to the publication channel/);
  for (const spec of packageSpecs) {
    const manifest = parseJsonText(
      fs.readFileSync(path.join(repoRoot, spec.package_manifest_ref), 'utf8'),
    ) as Record<string, unknown>;
    assert.equal(manifest.package_id, spec.package_id);
    assert.equal(manifest.source_repo, spec.repo_url);
  }
  assert.doesNotMatch(workflow, /case "\$PACKAGE_ID" in/);
  assert.match(workflow, /source_repo="\$\(jq -er \.source_repo "\$manifest"\)"/);
  assert.match(workflow, /\^https:\/\/github\\\.com\/\(\[\^\/\]\+\)\/\(\[\^\/\]\+\)\\\.git\$/);
  assert.match(workflow, /echo "OCI_SOURCE_URL=\$\{source_repo%\.git\}"/);
  assert.doesNotMatch(workflow, /OCI_SOURCE_URL: https:\/\/github\.com\/\$\{\{ github\.repository \}\}/);
  for (const ownerRepo of [
    'gaofeng21cn/med-autoscience',
    'gaofeng21cn/med-autogrant',
    'gaofeng21cn/mas-scholar-skills',
    'gaofeng21cn/opl-flow',
    'gaofeng21cn/opl-meta-agent',
    'gaofeng21cn/opl-bookforge',
    'gaofeng21cn/redcube-ai',
  ]) {
    assert.doesNotMatch(workflow, new RegExp(ownerRepo));
  }
  assert.match(workflow, /group: opl-package-publication-\$\{\{ inputs\.package_id \}\}/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /ref: \$\{\{ inputs\.expected_framework_source_commit \}\}/);
  assert.match(workflow, /\[ "\$\(git rev-parse HEAD\)" = "\$EXPECTED_FRAMEWORK_SOURCE_COMMIT" \]/);
  assert.match(workflow, /GITHUB_EVENT_NAME.*workflow_dispatch/);
  assert.match(workflow, /npm ci --ignore-scripts --no-audit --no-fund/);
  assert.ok(workflow.indexOf('npm ci --ignore-scripts') < workflow.indexOf('scripts/materialize-package-payload.mjs'));
  assert.match(workflow, /scripts\/package-source-projection-gate\.mjs/);
  assert.match(workflow, /scripts\/materialize-package-payload\.mjs/);
  assert.match(workflow, /--artifact-ref "\$\{image\}:\$\{EXPECTED_PACKAGE_VERSION\}"/);
  assert.match(workflow, /--archive-sha256 "\$archive_sha256"/);
  assert.match(workflow, /--archive-root "\$repo_name"/);
  assert.doesNotMatch(workflow, /cp "\$payload" "\$package_root\/payload-manifest\.json"/);
  assert.ok(workflow.indexOf('git -C .owner-source archive') < workflow.indexOf('scripts/materialize-package-payload.mjs'));
  assert.ok(workflow.indexOf('scripts/materialize-package-payload.mjs') < workflow.indexOf('immutable_preflight='));
  assert.match(workflow, /scripts\/oci-publication-preflight\.mjs/);
  assert.match(workflow, /--allow-package-manifest-projection-drift/);
  assert.match(workflow, /reused_registry_projection_equivalent/);
  assert.match(workflow, /published_manifest_digest/);
  assert.ok(workflow.indexOf('immutable_preflight=') < workflow.indexOf('oras push --format json'));
  assert.ok(workflow.indexOf('first_stable_digest=') < workflow.indexOf('second_stable_digest='));
  assert.ok(workflow.indexOf('second_stable_digest=') < workflow.indexOf('oras tag '));
  assert.match(workflow, /EXPECTED_LATEST_STABLE_PREDECESSOR" == none/);
  assert.match(workflow, /manifest unknown\|name unknown\|not found\|404/);
  assert.match(workflow, /printf '%s\\n' none/);
  assert.ok(workflow.indexOf('read_stable_digest()') < workflow.indexOf('first_stable_digest='));
  assert.doesNotMatch(workflow, /unauthorized\|denied/);
  assert.match(workflow, /immutable_result="reconciled_after_unknown"/);
  assert.match(workflow, /stable_result="reconciled_after_unknown"/);
  assert.match(workflow, /registry_atomic_cas_claim:false/);
  assert.match(workflow, /if \[ "\$GITHUB_EVENT_NAME" = schedule \]; then[\s\S]*PUBLICATION_ENVIRONMENT.*release-stable-automated/);
  assert.match(workflow, /environment:\$publication_environment/);
  assert.match(workflow, /--expected-digest "\$digest" --anonymous/g);
  assert.match(workflow, /ensure_public_package "one-person-lab-packages\/\$\{PACKAGE_ID\}"/);
  assert.match(workflow, /visibility == "public" and \.repository\.full_name == \$repo/);
  assert.ok(workflow.indexOf('ensure_public_package "one-person-lab-packages/${PACKAGE_ID}"')
    < workflow.indexOf('--verify-only --expected-digest "$digest" --anonymous'));
  assert.match(workflow, /cosign attest[\s\S]*--type slsaprovenance1/);
  assert.match(workflow, /cosign attest[\s\S]*--type spdxjson/);
  assert.equal(workflow.match(/cosign verify-attestation/g)?.length, 2);
  assert.match(workflow, /attestations:\{status:"verified"/);
  assert.match(workflow, /dist\/package\/package-provenance\.json/);
  assert.match(workflow, /dist\/package\/package\.spdx\.json/);
  assert.match(
    workflow,
    /\(cd "\$PACKAGE_ROOT" && sha256sum publication-receipt\.json > publication-receipt\.sha256\)/,
  );
  assert.doesNotMatch(workflow, /sha256sum "\$PACKAGE_ROOT\/publication-receipt\.json"/);
  assert.doesNotMatch(workflow, /one-person-lab-manifest|opl update apply|opl packages update/);
  assert.doesNotMatch(workflow, /release-set|opl-app|opl-base/i);
});

function writeFakeGh(tempRoot: string, packageVersions: Record<string, unknown[]>, missingPackages = new Set<string>()) {
  const binDir = path.join(tempRoot, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  const ghPath = path.join(binDir, 'gh');
  fs.writeFileSync(
    ghPath,
    `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const { parse: parseJsonText } = JSON;
function decodePackageFromPath(raw) {
  const match = String(raw).match(/\\/packages\\/container\\/([^/]+)\\/versions/);
  return match ? decodeURIComponent(match[1]) : '';
}
if (args[0] === 'api' && args.includes('--jq')) {
  const packageName = decodePackageFromPath(args.find((arg) => String(arg).includes('/packages/container/')));
  const missing = new Set(parseJsonText(process.env.FAKE_MISSING_PACKAGES_JSON || '[]'));
  if (missing.has(packageName)) process.exit(1);
  const versions = parseJsonText(process.env.FAKE_PACKAGE_VERSIONS_JSON || '{}')[packageName] || [];
  for (const version of versions) {
    process.stdout.write(JSON.stringify(version));
    process.stdout.write('\\n');
  }
  process.exit(0);
}
if (args[0] === 'api' && args.includes('-X') && args.includes('DELETE')) {
  fs.appendFileSync(process.env.FAKE_GH_LOG, JSON.stringify(args) + '\\n');
  process.exit(0);
}
console.error('unexpected gh args: ' + JSON.stringify(args));
process.exit(2);
`,
    'utf8',
  );
  fs.chmodSync(ghPath, 0o755);
  return {
    binDir,
    env: {
      FAKE_PACKAGE_VERSIONS_JSON: JSON.stringify(packageVersions),
      FAKE_MISSING_PACKAGES_JSON: JSON.stringify([...missingPackages]),
    },
  };
}

test('GHCR package cleanup dry-runs active package-channel packages', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-ghcr-cleanup-'));
  const packageVersions = {
    'one-person-lab-packages/mas': [
      { id: 11, updated_at: '2026-05-06T00:00:00Z', metadata: { container: { tags: ['26.5.6'] } } },
      { id: 12, updated_at: '2026-05-02T00:00:00Z', metadata: { container: { tags: ['26.5.2-a'] } } },
      { id: 13, updated_at: '2026-05-01T00:00:00Z', metadata: { container: { tags: ['26.5.1'] } } },
      { id: 14, updated_at: '2026-04-30T00:00:00Z', metadata: { container: { tags: ['26.4.30', 'manual-keep'] } } },
      { id: 15, updated_at: '2026-04-29T00:00:00Z', metadata: { container: { tags: ['latest-stable'] } } },
    ],
    'one-person-lab-modules/med-autoscience': [
      { id: 16, updated_at: '2026-04-01T00:00:00Z', metadata: { container: { tags: ['26.4.1'] } } },
    ],
    'one-person-lab-modules/med-autogrant': [],
    'one-person-lab-modules/redcube-ai': [],
    'one-person-lab-framework': [
      { id: 31, updated_at: '2026-05-06T00:00:00Z', metadata: { container: { tags: ['26.5.6'] } } },
      { id: 32, updated_at: '2026-05-02T00:00:00Z', metadata: { container: { tags: ['26.5.2-a'] } } },
      { id: 33, updated_at: '2026-05-01T00:00:00Z', metadata: { container: { tags: ['26.5.1'] } } },
      { id: 34, updated_at: '2026-04-30T00:00:00Z', metadata: { container: { tags: ['26.4.30'] } } },
    ],
  };
  const { binDir, env } = writeFakeGh(tempRoot, packageVersions, new Set(['one-person-lab-packages/oma']));
  const summaryPath = path.join(tempRoot, 'summary.json');
  const logPath = path.join(tempRoot, 'gh.log');

  const result = execFileSync(process.execPath, [
    '--experimental-strip-types',
    'scripts/cleanup-ghcr-package-versions.mjs',
    '--owner',
    'owner',
    '--summary-path',
    summaryPath,
    '--protected-tag',
    'manual-keep',
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
      FAKE_GH_LOG: logPath,
    },
  });

  const summary = parseJsonText(fs.readFileSync(summaryPath, 'utf8')) as any;
  assert.match(result, /opl_framework_ghcr_package_cleanup\.v1/);
  assert.equal(summary.status, 'dry_run');
  assert.deepEqual(summary.extra_protected_tags, ['manual-keep']);
  assert.equal(fs.existsSync(logPath), false);
  assert.equal(
    summary.packages.some((entry: { package_name: string }) => entry.package_name === 'one-person-lab-native-helper'),
    false,
  );
  const mas = summary.packages.find((entry: { package_name: string }) => entry.package_name === 'one-person-lab-packages/mas');
  assert.equal(mas.package_kind, 'active_package');
  assert.equal(mas.lifecycle_status, 'active_release_channel');
  assert.deepEqual(mas.protected_version_ids, [11, 12, 13, 14, 15]);
  assert.deepEqual(mas.candidates.map((candidate: { id: number }) => candidate.id), []);
  const legacyMas = summary.packages.find((entry: { package_name: string }) => entry.package_name === 'one-person-lab-modules/med-autoscience');
  assert.equal(legacyMas.package_kind, 'legacy_module_namespace_tombstone');
  assert.equal(legacyMas.status, 'legacy_namespace_detected');
  assert.deepEqual(legacyMas.candidates, []);
  const frameworkCore = summary.packages.find((entry: { package_name: string }) => entry.package_name === 'one-person-lab-framework');
  assert.equal(frameworkCore.package_kind, 'framework_core');
  assert.equal(frameworkCore.lifecycle_status, 'active_release_channel');
  assert.deepEqual(frameworkCore.candidates.map((candidate: { id: number }) => candidate.id), [34]);
  const missing = summary.packages.find((entry: { package_name: string }) => entry.package_name === 'one-person-lab-packages/oma');
  assert.equal(missing.status, 'not_found_or_unreadable');
});

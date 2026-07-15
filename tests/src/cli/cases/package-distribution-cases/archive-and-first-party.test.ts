import crypto from 'node:crypto';

import {
  assert,
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
import { assertJsonSchemaPayload } from '../../../../../src/kernel/schema-registry.ts';
import {
  normalizeCapabilityPackageManifest,
  normalizeWorkflowProfilePackageManifest,
} from '../../../../../src/modules/connect/agent-package-registry-parts/manifest-normalizers.ts';

const publishedDistributionPayload = {
  payload_kind: 'ghcr_oci_opl_package',
  payload_ref: 'ghcr.io/gaofeng21cn/one-person-lab-packages/mas:0.1.0-alpha.4',
  payload_digest_ref: `sha256:${'a'.repeat(64)}`,
  required_skill_pack_lock_refs: [
    'opl://agent-package-lock/mas-scholar-skills/0.1.0a4/managed-ghcr-capability-package',
  ],
  proof_status: 'published_release_receipt_bound',
  live_download_proof: false,
  installed_reload_proof: false,
  oci_ref: 'ghcr.io/gaofeng21cn/one-person-lab-packages/mas:latest-stable',
  oci_media_type: 'application/vnd.oci.image.manifest.v1+json',
  immutable_tag: '0.1.0-alpha.4',
  moving_tag: 'latest-stable',
  promotion_policy: 'daily_candidate_gates_then_promote_latest_stable',
  install_truth: 'resolved_digest_lock',
};

function createOwnerPackageFixture(
  repoName: string,
  packageId: string,
  ownerVersion: string,
  kind: 'standard_agent' | 'capability_package' | 'workflow_profile' = 'standard_agent',
) {
  const pluginRoot = kind === 'standard_agent' ? `plugins/${repoName}` : '.';
  const manifestRef = kind === 'capability_package'
    ? 'contracts/opl_capability_package_manifest.json'
    : kind === 'workflow_profile'
      ? 'contracts/workflow-policy.json'
      : 'contracts/opl_agent_package_manifest.json';
  const ownerManifest = kind === 'workflow_profile'
    ? { package: { id: packageId, version: ownerVersion, owner: packageId, kind: 'workflow_profile' } }
    : {
        surface_kind: kind === 'capability_package'
          ? 'opl_capability_package_manifest.v2'
          : 'opl_agent_package_manifest.v1',
        ...(kind === 'standard_agent' ? { agent_id: packageId } : {}),
        package_id: packageId,
        version: ownerVersion,
        ...(kind === 'capability_package' ? {
          capability_abi: { id: 'mas-scholar-skills.v1' },
          content_lock: { digest: `sha256:${'8'.repeat(64)}`, paths: [] },
        } : {}),
      };
  const extraFiles: Record<string, string> = {
    [manifestRef]: `${JSON.stringify(ownerManifest, null, 2)}\n`,
    [`${pluginRoot}/.codex-plugin/plugin.json`.replace(/^\.\//, '')]: `${JSON.stringify({ name: repoName, version: ownerVersion }, null, 2)}\n`,
  };
  if (repoName === 'med-autoscience' || repoName === 'med-autogrant') {
    extraFiles['pyproject.toml'] = `[project]\nname = "${repoName}"\nversion = "${ownerVersion}"\n`;
  } else if (kind === 'standard_agent') {
    extraFiles['package.json'] = `${JSON.stringify({ name: repoName, version: ownerVersion }, null, 2)}\n`;
  }
  return createGitModuleRemoteFixture(repoName, { extraFiles });
}

function createFrozenFrameworkFixture(version: string) {
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-frozen-framework-'));
  const files: Record<string, string> = {
    'package.json': `${JSON.stringify({
      name: 'one-person-lab',
      version,
      files: ['bin', 'dist', 'contracts/opl-framework'],
      scripts: { build: 'fixture-build', prepare: 'fixture-prepare' },
    }, null, 2)}\n`,
    'package-lock.json': `${JSON.stringify({
      name: 'one-person-lab',
      version,
      lockfileVersion: 3,
      requires: true,
      packages: { '': { name: 'one-person-lab', version } },
    }, null, 2)}\n`,
    'bin/opl': '#!/bin/sh\nexit 0\n',
    'dist/entrypoints/cli.js': 'export {};\n',
    'contracts/opl-framework/fixture.json': '{}\n',
  };
  for (const [relativePath, content] of Object.entries(files)) {
    const target = path.join(sourceRoot, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, 'utf8');
  }
  fs.chmodSync(path.join(sourceRoot, 'bin/opl'), 0o755);
  execFileSync('git', ['init', '--quiet'], { cwd: sourceRoot, encoding: 'utf8' });
  execFileSync('git', ['config', 'user.name', 'OPL Fixture'], { cwd: sourceRoot, encoding: 'utf8' });
  execFileSync('git', ['config', 'user.email', 'fixture@one-person-lab.invalid'], { cwd: sourceRoot, encoding: 'utf8' });
  execFileSync('git', ['add', '--all'], { cwd: sourceRoot, encoding: 'utf8' });
  execFileSync('git', ['-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Frozen Framework fixture'], {
    cwd: sourceRoot,
    encoding: 'utf8',
  });
  return {
    sourceRoot,
    headSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: sourceRoot, encoding: 'utf8' }).trim(),
  };
}

test('package archive builder writes channel manifest checksums git source and release discipline gate', () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-out-'));
  const previousManifest = path.join(outDir, 'previous-manifest.json');
  const appComponentManifest = path.join(outDir, 'opl-app-component-manifest.json');
  const appArtifacts = [
    ['latest-arm64-mac.yml', '1'],
    ['One-Person-Lab-26.7.12-mac-arm64.dmg', '2'],
    ['One-Person-Lab-26.7.12-mac-arm64.zip', '3'],
    ['One-Person-Lab-26.7.12-mac-arm64.zip.blockmap', '4'],
    ['standard-local-authorization-policy.json', '5'],
  ].map(([name, digit]) => ({
    name,
    ref: `https://github.com/gaofeng21cn/one-person-lab-app/releases/download/v26.7.12/${name}`,
    digest: `sha256:${digit.repeat(64)}`,
    size: 10,
    content_type: 'application/octet-stream',
  }));
  fs.writeFileSync(appComponentManifest, `${JSON.stringify({
    surface_kind: 'opl_app_component_manifest.v1',
    component_id: 'opl-app',
    version: '26.7.12',
    source_commit: '9'.repeat(40),
    release_tag: 'v26.7.12',
    release_url: 'https://github.com/gaofeng21cn/one-person-lab-app/releases/tag/v26.7.12',
    release_status: 'published',
    primary_artifact: appArtifacts[1],
    artifacts: appArtifacts,
    component_manifest_ref: 'opl+github-release://gaofeng21cn/one-person-lab-app/v26.7.12',
    component_manifest_digest: `sha256:${'6'.repeat(64)}`,
  }, null, 2)}\n`, 'utf8');
  const previousScholarSkillsManifestJson = `${JSON.stringify({
    ...parseJsonText(fs.readFileSync(
      path.join(repoRoot, 'contracts/opl-framework/packages/mas-scholar-skills.json'),
      'utf8',
    )) as Record<string, unknown>,
    version: '0.0.9',
  }, null, 2)}\n`;
  const previousScholarSkillsManifestSha256 = `sha256:${crypto.createHash('sha256').update(previousScholarSkillsManifestJson).digest('hex')}`;
  const previousScholarSkillsPayloadJson = `${JSON.stringify({
    ...parseJsonText(fs.readFileSync(
      path.join(repoRoot, 'contracts/opl-framework/packages/payloads/mas-scholar-skills-0.2.1.json'),
      'utf8',
    )) as Record<string, unknown>,
    package_version: '0.0.9',
  }, null, 2)}\n`;
  const previousScholarSkillsPayloadSha256 = `sha256:${crypto.createHash('sha256').update(previousScholarSkillsPayloadJson).digest('hex')}`;
  const previousScholarSkillsVersion = {
    package_version: '0.0.9',
    capability_abi: 'mas-scholar-skills.v1',
    selection_status: 'retained_history',
    manifest_url: 'opl+oci://ghcr.io/gaofeng21cn/one-person-lab-packages/mas-scholar-skills:0.0.9#/package-manifest.json',
    manifest_sha256: previousScholarSkillsManifestSha256,
    manifest_json: previousScholarSkillsManifestJson,
    package_manifest: {
      ref: 'opl+oci://ghcr.io/gaofeng21cn/one-person-lab-packages/mas-scholar-skills:0.0.9#/package-manifest.json',
      sha256: previousScholarSkillsManifestSha256,
    },
    content_digest: `sha256:${'2'.repeat(64)}`,
    payload_digest: previousScholarSkillsPayloadSha256,
    payload_manifest_json: previousScholarSkillsPayloadJson,
    payload_manifest_sha256: previousScholarSkillsPayloadSha256,
    source_artifact_ref: 'ghcr.io/gaofeng21cn/one-person-lab-packages/mas-scholar-skills:0.0.9',
    dependency_package_ids: [],
  };
  fs.writeFileSync(previousManifest, JSON.stringify({
    release_set_generation: '26.4.30',
    packages: {
      package_catalog: {
        'mas-scholar-skills': {
          package_id: 'mas-scholar-skills',
          package_role: 'framework_capability_package',
          selected_version: '0.0.9',
          dependency_package_ids: [],
          versions: [
            previousScholarSkillsVersion,
            previousScholarSkillsVersion,
            {
              ...previousScholarSkillsVersion,
              package_version: '2.0.0',
              capability_abi: 'mas-scholar-skills.v2',
            },
          ],
        },
      },
    },
  }), 'utf8');

  const fixtures = {
    medautoscience: createOwnerPackageFixture('med-autoscience', 'mas', '0.2.1'),
    medautogrant: createOwnerPackageFixture('med-autogrant', 'mag', '0.3.0'),
    redcube: createOwnerPackageFixture('redcube-ai', 'rca', '0.2.4'),
    oplmetaagent: createOwnerPackageFixture('opl-meta-agent', 'oma', '0.3.0'),
    oplbookforge: createOwnerPackageFixture('opl-bookforge', 'obf', '0.3.2'),
    scholarskills: createOwnerPackageFixture('mas-scholar-skills', 'mas-scholar-skills', '0.2.1', 'capability_package'),
    oplflow: createOwnerPackageFixture('opl-flow', 'opl-flow', '0.1.20', 'workflow_profile'),
  };
  const ownerSourceEnv = {
    ...process.env,
    OPL_PACKAGE_SOURCE_PATH_MAS: fixtures.medautoscience.sourceRoot,
    OPL_PACKAGE_SOURCE_PATH_MAG: fixtures.medautogrant.sourceRoot,
    OPL_PACKAGE_SOURCE_PATH_RCA: fixtures.redcube.sourceRoot,
    OPL_PACKAGE_SOURCE_PATH_OMA: fixtures.oplmetaagent.sourceRoot,
    OPL_PACKAGE_SOURCE_PATH_OBF: fixtures.oplbookforge.sourceRoot,
    OPL_PACKAGE_SOURCE_PATH_MAS_SCHOLAR_SKILLS: fixtures.scholarskills.sourceRoot,
    OPL_PACKAGE_SOURCE_PATH_OPL_FLOW: fixtures.oplflow.sourceRoot,
    OPL_PACKAGE_RELEASE_GATE: 'test_owner_sha_release_gate',
  };

  const archiveBuilderOutput = execFileSync(process.execPath, [
    '--experimental-strip-types',
    path.join(repoRoot, 'scripts/package-archives.mjs'),
    '--release-set-generation',
    '26.4.31',
    '--owner',
    'gaofeng21cn',
    '--out-dir',
    outDir,
    '--previous-manifest',
    previousManifest,
    '--retain-versions',
    '4',
    '--app-component-manifest',
    appComponentManifest,
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: ownerSourceEnv,
  });
  const archiveBuilderResult = parseJsonText(archiveBuilderOutput) as {
    clone_root: string;
    packages_dir: string;
    framework_dir: string;
    owner_cohort_lock: string;
    owner_cohort_lock_digest: string;
    release_discipline_workflows: string[];
  };

  const releaseManifestPath = path.join(outDir, 'opl-release-manifest.json');
  const channelManifestPath = path.join(outDir, 'opl-channel-manifest.json');
  const checksumsPath = path.join(outDir, 'SHA256SUMS');
  const frameworkArchivePath = path.join(outDir, 'framework', 'one-person-lab-framework-0.3.0.tar.gz');
  const defaultCloneRoot = path.join(path.dirname(outDir), `${path.basename(outDir)}-package-sources`);
  const manifest = parseJsonText(fs.readFileSync(releaseManifestPath, 'utf8')) as any;
  const channelManifest = parseJsonText(fs.readFileSync(channelManifestPath, 'utf8')) as any;
  const releaseManifestSource = fs.readFileSync(releaseManifestPath, 'utf8');
  const channelManifestSource = fs.readFileSync(channelManifestPath, 'utf8');
  const checksums = fs.readFileSync(checksumsPath, 'utf8');
  const relativeCloneRootFromOutDir = path.relative(outDir, archiveBuilderResult.clone_root);

  assert.equal(archiveBuilderResult.clone_root, defaultCloneRoot);
  assert.equal(archiveBuilderResult.packages_dir, path.join(outDir, 'packages'));
  assert.equal(archiveBuilderResult.framework_dir, path.join(outDir, 'framework'));
  assert.equal(archiveBuilderResult.owner_cohort_lock, path.join(outDir, 'owner-cohort-lock.json'));
  assert.match(archiveBuilderResult.owner_cohort_lock_digest, /^sha256:[0-9a-f]{64}$/);
  assert.deepEqual(archiveBuilderResult.release_discipline_workflows, [
    '.github/workflows/packages.yml',
    '.github/workflows/release-package-channel.yml',
    '.github/workflows/daily-package-channel.yml',
  ]);
  assert.equal(fs.existsSync(path.join(outDir, '.github/workflows/packages.yml')), true);
  assert.equal(fs.existsSync(path.join(outDir, '.github/workflows/release-package-channel.yml')), true);
  assert.equal(fs.existsSync(path.join(outDir, '.github/workflows/daily-package-channel.yml')), true);
  assert.equal(relativeCloneRootFromOutDir === '' || !relativeCloneRootFromOutDir.startsWith('..'), false);
  assert.equal(path.relative(repoRoot, archiveBuilderResult.clone_root).startsWith('..'), true);
  const ownerCohortLockSource = fs.readFileSync(archiveBuilderResult.owner_cohort_lock, 'utf8');
  const ownerCohortLock = parseJsonText(ownerCohortLockSource) as Record<string, any>;
  assert.equal(ownerCohortLock.surface_kind, 'opl_package_owner_cohort_lock.v1');
  assert.deepEqual(Object.keys(ownerCohortLock.packages).sort(), [
    'mag', 'mas', 'mas-scholar-skills', 'obf', 'oma', 'opl-flow', 'rca',
  ]);
  assert.equal(ownerCohortLock.packages.mas.source_commit, fixtures.medautoscience.getHeadSha());
  assert.equal(
    archiveBuilderResult.owner_cohort_lock_digest,
    `sha256:${crypto.createHash('sha256').update(ownerCohortLockSource).digest('hex')}`,
  );
  assert.deepEqual(manifest.release_set.owner_cohort_lock, {
    surface_kind: 'opl_package_owner_cohort_lock.v1',
    ref: 'owner-cohort-lock.json',
    digest: archiveBuilderResult.owner_cohort_lock_digest,
    package_ids: Object.keys(ownerCohortLock.packages).sort(),
  });
  const frameworkArchiveEntries = execFileSync('tar', ['-tzf', frameworkArchivePath], { encoding: 'utf8' })
    .trim().split(/\r?\n/);
  assert.equal(frameworkArchiveEntries.includes('one-person-lab/bin/opl'), true);
  assert.equal(frameworkArchiveEntries.includes('one-person-lab/dist/entrypoints/cli.js'), true);
  assert.equal(frameworkArchiveEntries.includes('one-person-lab/package.json'), true);
  assert.equal(frameworkArchiveEntries.includes('one-person-lab/package-lock.json'), true);
  assert.equal(frameworkArchiveEntries.some((entry) => entry.startsWith('one-person-lab/contracts/opl-framework/')), true);
  for (const excludedRoot of ['docs', 'tests', '.github', 'src']) {
    assert.equal(frameworkArchiveEntries.some((entry) => entry.startsWith(`one-person-lab/${excludedRoot}/`)), false);
  }
  const runtimePackageJson = parseJsonText(execFileSync(
    'tar', ['-xOf', frameworkArchivePath, 'one-person-lab/package.json'], { encoding: 'utf8' },
  )) as Record<string, any>;
  assert.equal(runtimePackageJson.version, '0.3.0');
  assert.equal(runtimePackageJson.scripts.prepare, undefined);
  assert.equal(runtimePackageJson.scripts.build, undefined);
  assert.equal(channelManifest.release_set_generation, manifest.release_set_generation);
  assert.equal(manifest.release_set.generation, '26.4.31');
  assert.equal(manifest.release_set.surface_kind, 'opl_release_set.v2');
  assert.equal(manifest.release_set.component_count, 9);
  assert.equal(manifest.release_set.components.packages.package_count, 7);
  assert.equal(manifest.release_set.components.app.version, '26.7.12');
  assert.equal(manifest.packages.package_artifacts.mag.package_version, '0.3.0');
  assert.equal(manifest.release_set.components.packages.members.mag.version, '0.3.0');
  assert.equal(
    manifest.release_set.components.packages.members.mag.artifact_ref,
    'ghcr.io/gaofeng21cn/one-person-lab-packages/mag:0.3.0',
  );
  assert.equal(channelManifest.manifest_role, 'opl_release_channel_manifest');
  assert.notEqual(channelManifestSource, releaseManifestSource);
  assert.equal(channelManifest.packages.codex_default_profile.model_provider, 'gflab');
  assert.equal(channelManifest.packages.codex_default_profile.base_url, 'https://gflabtoken.cn/v1');
  assert.equal(channelManifest.packages.codex_default_profile.base_url_role, 'opl_base_default_provider_endpoint');
  assert.equal(channelManifest.packages.codex_default_profile.model_profile_role, 'opl_flow_recommendation_projection');
  assert.equal(JSON.stringify(channelManifest.packages.codex_default_profile).includes('experimental_bearer_token'), false);
  assert.equal(manifest.release_automation.rollback.previous_version, '26.4.30');
  assert.equal(manifest.release_automation.cleanup.retain_versions, 4);
  assert.deepEqual(manifest.release_automation.cleanup.protected_tags, ['candidate', 'latest-stable']);
  assert.equal(manifest.release_automation.status, 'active_managed_ghcr_capability_packages');
  assert.equal(manifest.release_automation.package_lifecycle_status, 'active_release_channel');
  assert.equal(manifest.release_automation.workflow_trigger_policy, 'release_gate_workflow_call_or_manual_dispatch');
  assert.equal(manifest.release_automation.remote_publish_status, 'publication_workflow_configured_pending_remote_verification');
  assert.equal(manifest.packages.framework_core.homebrew_formula.surface_kind, 'opl_homebrew_formula_projection.v1');
  assert.equal(manifest.packages.framework_core.homebrew_formula.formula_name, 'opl');
  assert.equal(manifest.packages.framework_core.homebrew_formula.package_name, 'opl');
  assert.equal(manifest.packages.framework_core.homebrew_formula.approval_status, 'owner_approved');
  assert.equal(manifest.packages.framework_core.homebrew_formula.carrier_scope, 'framework_core_only');
  assert.equal(manifest.packages.framework_core.homebrew_formula.version, '0.3.0');
  assert.equal(
    manifest.packages.framework_core.homebrew_formula.source_head,
    manifest.packages.framework_core.source_git.head_sha,
  );
  assert.equal(
    manifest.packages.framework_core.homebrew_formula.archive_url,
    `https://github.com/gaofeng21cn/one-person-lab/archive/${manifest.packages.framework_core.source_git.head_sha}.tar.gz`,
  );
  assert.equal(manifest.packages.framework_core.homebrew_formula.archive_kind, 'immutable_github_commit_archive');
  assert.equal(manifest.packages.framework_core.homebrew_formula.sha256_source, 'tap_sync_download_and_hash');
  assert.equal(manifest.packages.framework_core.homebrew_formula.tap_generator_role, 'consume_projection_without_inference');
  assert.deepEqual(
    channelManifest.packages.framework_core.homebrew_formula,
    manifest.packages.framework_core.homebrew_formula,
  );
  assert.equal(manifest.release_automation.release_manifest_publication_status, 'configured_pending_remote_verification');
  assert.equal(manifest.release_automation.release_manifest_package.package_channel_status, 'active_release_channel');
  assert.equal(manifest.release_automation.daily_package_channel.status, 'active_change_detected_daily_publish');
  assert.equal(manifest.release_automation.daily_package_channel.no_change_behavior, 'skip_without_publish');
  assert.equal(manifest.release_automation.daily_package_channel.generation_template, '<utc_yy.m.d[-rN_auto]>');
  assert.equal(manifest.release_automation.daily_package_channel.force_publish_input, 'force_publish');
  assert.equal(Object.hasOwn(manifest.packages, 'webui_docker_image'), false);
  assert.equal(manifest.packages.framework_core.artifact, 'ghcr.io/gaofeng21cn/one-person-lab-framework:0.3.0');
  assert.match(manifest.packages.framework_core.source_archive.sha256, /^[0-9a-f]{64}$/);
  assert.match(manifest.packages.framework_core.source_git.head_sha, /^[0-9a-f]{40}$/);
  assert.equal(channelManifest.packages.framework_core.artifact, manifest.packages.framework_core.artifact);

  const frozenFramework = createFrozenFrameworkFixture('0.1.0');
  const frozenOutDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-frozen-framework-out-'));
  const fakeBin = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-frozen-framework-bin-'));
  fs.writeFileSync(path.join(fakeBin, 'npm'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  try {
    const frozenOutput = execFileSync(process.execPath, [
      '--experimental-strip-types',
      path.join(repoRoot, 'scripts/package-archives.mjs'),
      '--release-set-generation', '26.4.31-r2',
      '--owner', 'gaofeng21cn',
      '--out-dir', frozenOutDir,
      '--owner-cohort-lock', archiveBuilderResult.owner_cohort_lock,
      '--app-component-manifest', appComponentManifest,
      '--framework-source-root', frozenFramework.sourceRoot,
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...ownerSourceEnv,
        PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
      },
    });
    const frozenResult = parseJsonText(frozenOutput) as Record<string, any>;
    const frozenManifest = parseJsonText(fs.readFileSync(
      path.join(frozenOutDir, 'opl-release-manifest.json'),
      'utf8',
    )) as Record<string, any>;
    const frozenArchive = path.join(frozenOutDir, 'framework', 'one-person-lab-framework-0.1.0.tar.gz');
    assert.notEqual(frozenFramework.sourceRoot, repoRoot);
    assert.equal(frozenResult.framework_source_root, frozenFramework.sourceRoot);
    assert.equal(frozenManifest.release_set.components.base.version, '0.1.0');
    assert.equal(frozenManifest.release_set.components.base.source_commit, frozenFramework.headSha);
    assert.equal(frozenManifest.packages.framework_core.version, '0.1.0');
    assert.equal(frozenManifest.packages.framework_core.source_git.head_sha, frozenFramework.headSha);
    assert.equal(frozenManifest.packages.framework_core.source_archive.file_name, 'one-person-lab-framework-0.1.0.tar.gz');
    assert.equal(frozenManifest.packages.framework_core.artifact, 'ghcr.io/gaofeng21cn/one-person-lab-framework:0.1.0');
    assert.equal(fs.existsSync(frozenArchive), true);
    const frozenRuntimePackage = parseJsonText(execFileSync(
      'tar', ['-xOf', frozenArchive, 'one-person-lab/package.json'], { encoding: 'utf8' },
    )) as Record<string, any>;
    assert.equal(frozenRuntimePackage.version, '0.1.0');
  } finally {
    fs.rmSync(frozenFramework.sourceRoot, { recursive: true, force: true });
    fs.rmSync(frozenOutDir, { recursive: true, force: true });
    fs.rmSync(fakeBin, { recursive: true, force: true });
  }

  assert.equal(channelManifest.package_catalog_surface_kind, 'opl_package_catalog.v1');
  const packageCatalog = channelManifest.packages.package_catalog;
  const expectedSourceRoots: Record<string, string> = {
    mas: 'plugins/med-autoscience',
    mag: 'plugins/med-autogrant',
    rca: 'plugins/redcube-ai',
    oma: 'plugins/opl-meta-agent',
    obf: 'plugins/opl-bookforge',
    'mas-scholar-skills': '.',
    'opl-flow': '.',
  };
  const expectedArchiveRoots: Record<string, string> = {
    mas: 'med-autoscience',
    mag: 'med-autogrant',
    rca: 'redcube-ai',
    oma: 'opl-meta-agent',
    obf: 'opl-bookforge',
    'mas-scholar-skills': 'mas-scholar-skills',
    'opl-flow': 'opl-flow',
  };
  assert.equal(Object.keys(packageCatalog).length, 7);
  for (const [catalogPackageId, entry] of Object.entries(packageCatalog) as Array<[string, Record<string, any>]>) {
    assert.equal(entry.homebrew_formula, undefined);
    assert.equal(entry.homebrew_cask, undefined);
    assert.equal(entry.versions.filter((version: Record<string, unknown>) => version.selection_status === 'selected_for_release_set').length, 1);
    for (const version of entry.versions) {
      assert.match(version.manifest_sha256, /^sha256:[0-9a-f]{64}$/);
      assert.match(version.content_digest, /^sha256:[0-9a-f]{64}$/);
      assert.match(version.payload_digest, /^sha256:[0-9a-f]{64}$/);
      assert.equal(typeof version.source_artifact_ref, 'string');
      assert.doesNotThrow(() => JSON.parse(version.manifest_json));
      assert.equal(
        version.manifest_sha256,
        `sha256:${crypto.createHash('sha256').update(version.manifest_json).digest('hex')}`,
      );
      assert.doesNotThrow(() => JSON.parse(version.payload_manifest_json));
      const normalizedPayload = JSON.parse(version.payload_manifest_json);
      if (version.selection_status === 'selected_for_release_set') {
        assert.equal(normalizedPayload.source_commit, version.owner_source_commit);
        assert.equal(normalizedPayload.package_source.transport, 'same_oci_artifact_source_archive');
        assert.equal(normalizedPayload.package_source.artifact_ref, version.source_artifact_ref);
        assert.equal(normalizedPayload.package_source.archive_sha256, version.package_content_digest);
        assert.equal(normalizedPayload.package_source.archive_root, expectedArchiveRoots[catalogPackageId]);
        assert.equal(normalizedPayload.source_root, expectedSourceRoots[catalogPackageId]);
        for (const file of normalizedPayload.files) {
          const expectedSourcePath = expectedSourceRoots[catalogPackageId] === '.'
            ? file.path
            : `${expectedSourceRoots[catalogPackageId]}/${file.path}`;
          assert.equal(file.source_path, expectedSourcePath);
          assert.equal(file.source_artifact_ref, version.source_artifact_ref);
          assert.equal(Object.hasOwn(file, 'source_url'), false);
          assert.equal(Object.hasOwn(file, 'content_utf8'), false);
          assert.equal(Object.hasOwn(file, 'content_base64'), false);
        }
      }
      if (normalizedPayload.migration_source_commit) {
        assert.notEqual(normalizedPayload.migration_source_commit, normalizedPayload.source_commit);
      }
      assert.equal(
        version.payload_manifest_sha256,
        `sha256:${crypto.createHash('sha256').update(version.payload_manifest_json).digest('hex')}`,
      );
      assert.equal(version.payload_digest, version.payload_manifest_sha256);
    }
  }
  const masCatalog = packageCatalog.mas;
  assert.equal(masCatalog.package_role, 'standard_agent');
  assert.equal(masCatalog.selected_version, '0.2.1');
  assert.deepEqual(masCatalog.dependency_package_ids, ['mas-scholar-skills']);
  assert.equal(masCatalog.versions.length, 1);
  assert.equal(masCatalog.versions[0].selection_status, 'selected_for_release_set');
  assert.deepEqual(masCatalog.versions[0].dependency_package_ids, ['mas-scholar-skills']);
  assert.equal(masCatalog.versions[0].capability_abi, null);
  assert.match(masCatalog.versions[0].manifest_url, /^opl\+oci:\/\/ghcr\.io\/gaofeng21cn\/one-person-lab-packages\/mas:0\.2\.1#\//);
  assert.match(masCatalog.versions[0].manifest_sha256, /^sha256:[0-9a-f]{64}$/);
  const embeddedMasManifest = JSON.parse(masCatalog.versions[0].manifest_json);
  assert.equal(embeddedMasManifest.package_id, 'mas');
  assert.equal(
    masCatalog.versions[0].manifest_sha256,
    `sha256:${crypto.createHash('sha256').update(masCatalog.versions[0].manifest_json).digest('hex')}`,
  );
  assert.equal(masCatalog.versions[0].package_manifest.ref, masCatalog.versions[0].manifest_url);
  assert.equal(masCatalog.versions[0].package_manifest.sha256, masCatalog.versions[0].manifest_sha256);
  assert.match(masCatalog.versions[0].content_digest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(
    masCatalog.versions[0].content_digest,
    embeddedMasManifest.distribution_payload?.payload_digest_ref ?? masCatalog.versions[0].manifest_sha256,
  );
  assert.match(masCatalog.versions[0].payload_digest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(
    masCatalog.versions[0].source_artifact_ref,
    'ghcr.io/gaofeng21cn/one-person-lab-packages/mas:0.2.1',
  );
  assert.equal(masCatalog.versions[0].owner_language_version, '0.2.1');
  assert.equal(masCatalog.versions[0].owner_source_commit, fixtures.medautoscience.getHeadSha());
  assert.equal(masCatalog.versions[0].release_gate, 'test_owner_sha_release_gate');
  assert.match(masCatalog.versions[0].package_content_digest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(packageCatalog['opl-flow'].package_role, 'workflow_profile');
  assert.equal(packageCatalog['opl-flow'].selected_version, '0.1.20');
  assert.equal(packageCatalog['opl-flow'].homebrew_formula, undefined);
  assert.match(channelManifest.package_catalog_digest, /^sha256:[0-9a-f]{64}$/);
  const scholarSkillsCatalog = packageCatalog['mas-scholar-skills'];
  assert.equal(scholarSkillsCatalog.package_role, 'framework_capability_package');
  assert.equal(scholarSkillsCatalog.selected_version, '0.2.1');
  assert.deepEqual(
    scholarSkillsCatalog.versions.map((entry: Record<string, unknown>) => entry.package_version),
    ['0.2.1', '0.0.9'],
  );
  assert.equal(
    scholarSkillsCatalog.versions.some((entry: Record<string, unknown>) => entry.package_version === '2.0.0'),
    false,
  );
  assert.equal(scholarSkillsCatalog.versions[0].capability_abi, 'mas-scholar-skills.v1');
  assert.equal(
    scholarSkillsCatalog.versions[0].content_digest,
    `sha256:${'8'.repeat(64)}`,
  );
  assert.deepEqual(scholarSkillsCatalog.versions[1], previousScholarSkillsVersion);
  const finalizeEnv = {
    ...process.env,
    OPL_PACKAGE_PROMOTION_TARGET: 'latest-stable',
  };
  for (const [index, packageId] of Object.keys(packageCatalog).entries()) {
    execFileSync(process.execPath, [
      path.join(repoRoot, 'scripts/finalize-package-channel-digests.mjs'),
      '--release-manifest', releaseManifestPath,
      '--channel-manifest', channelManifestPath,
      '--package-id', packageId,
      '--digest', `sha256:${String(index + 1).repeat(64)}`,
    ], { encoding: 'utf8', env: finalizeEnv });
  }
  execFileSync(process.execPath, [
    path.join(repoRoot, 'scripts/finalize-package-channel-digests.mjs'),
    '--release-manifest', releaseManifestPath,
    '--channel-manifest', channelManifestPath,
    '--component-id', 'opl-base',
    '--digest', `sha256:${'9'.repeat(64)}`,
  ], { encoding: 'utf8', env: finalizeEnv });
  execFileSync(process.execPath, [
    path.join(repoRoot, 'scripts/finalize-package-channel-digests.mjs'),
    '--release-manifest', releaseManifestPath,
    '--channel-manifest', channelManifestPath,
    '--check',
  ], { encoding: 'utf8', env: finalizeEnv });
  const finalizedReleaseManifest = parseJsonText(fs.readFileSync(releaseManifestPath, 'utf8')) as Record<string, any>;
  const finalizedChannelManifest = parseJsonText(fs.readFileSync(channelManifestPath, 'utf8')) as Record<string, any>;
  assert.match(finalizedChannelManifest.package_catalog_digest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(finalizedReleaseManifest.release_channel, undefined);
  assert.equal(finalizedReleaseManifest.release_set.target_channel, undefined);
  assert.equal(finalizedReleaseManifest.release_set.bom_status, 'complete');
  assert.match(finalizedReleaseManifest.release_set.bom_digest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(finalizedChannelManifest.release_channel, undefined);
  assert.deepEqual(finalizedChannelManifest.release_set, finalizedReleaseManifest.release_set);
  assert.deepEqual(
    finalizedChannelManifest.packages.package_artifacts,
    finalizedReleaseManifest.packages.package_artifacts,
  );
  assert.equal(
    Object.values(finalizedChannelManifest.packages.package_catalog).every((entry: any) => (
      entry.versions.find((version: any) => version.selection_status === 'selected_for_release_set').artifact_status === 'published_immutable'
    )),
    true,
  );
  execFileSync(process.execPath, [
    path.join(repoRoot, 'scripts/generate-release-supply-chain.mjs'),
    '--release-manifest', releaseManifestPath,
    '--output-dir', outDir,
  ], { encoding: 'utf8' });
  const releaseSbom = parseJsonText(fs.readFileSync(path.join(outDir, 'opl-release-set.spdx.json'), 'utf8')) as Record<string, any>;
  const releaseProvenance = parseJsonText(fs.readFileSync(path.join(outDir, 'opl-release-provenance.json'), 'utf8')) as Record<string, any>;
  assert.equal(releaseSbom.spdxVersion, 'SPDX-2.3');
  assert.equal(releaseSbom.packages.length, 9);
  assert.equal(releaseSbom.packages.some((entry: Record<string, unknown>) => entry.name === 'opl-base'), true);
  assert.equal(
    releaseProvenance.buildDefinition.buildType,
    'https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1',
  );
  assert.equal(
    releaseProvenance.buildDefinition.externalParameters.opl_release_set_build_type,
    'https://one-person-lab.dev/build-types/release-set/v2',
  );
  assert.equal(releaseProvenance.buildDefinition.resolvedDependencies.length, 9);
  assert.equal(
    releaseProvenance.buildDefinition.externalParameters.owner_cohort_lock.digest,
    archiveBuilderResult.owner_cohort_lock_digest,
  );
  const promotionReceiptPath = path.join(outDir, 'opl-release-promotion-receipt.json');
  execFileSync(process.execPath, [
    path.join(repoRoot, 'scripts/write-release-promotion-receipt.mjs'),
    '--release-manifest', releaseManifestPath,
    '--output', promotionReceiptPath,
    '--target', 'candidate',
    '--carrier-ref', 'ghcr.io/gaofeng21cn/one-person-lab-manifest:26.4.31',
    '--carrier-digest', `sha256:${'b'.repeat(64)}`,
    '--promotion-request-id', 'test-release-saga',
    '--release-gate', 'test_owner_sha_release_gate',
    '--source-app-run-id', '12345',
    '--framework-repository', 'gaofeng21cn/one-person-lab',
    '--framework-run-id', '67890',
    '--framework-run-attempt', '1',
    '--expected-app-version', '26.7.12',
    '--expected-app-source-commit', '9'.repeat(40),
    '--expected-app-artifact-digest', `sha256:${'2'.repeat(64)}`,
    '--anonymous-readback', 'true',
  ], { encoding: 'utf8' });
  const promotionReceiptSchema = parseJsonText(fs.readFileSync(
    path.join(repoRoot, 'contracts/opl-framework/release-promotion-receipt.schema.json'),
    'utf8',
  )) as Record<string, any>;
  const promotionReceipt = parseJsonText(fs.readFileSync(promotionReceiptPath, 'utf8')) as Record<string, any>;
  assert.doesNotThrow(() => assertJsonSchemaPayload({
    schemaId: promotionReceiptSchema.$id,
    schema: promotionReceiptSchema,
    sourceRef: 'contracts/opl-framework/release-promotion-receipt.schema.json',
  }, promotionReceipt));
  assert.equal(promotionReceipt.surface_kind, 'opl_release_set_promotion_receipt.v1');
  assert.equal(promotionReceipt.carrier.digest, `sha256:${'b'.repeat(64)}`);
  assert.equal(promotionReceipt.anonymous_readback.verified_refs.length, 9);
  assert.match(checksums, /one-person-lab-framework-0\.3\.0\.tar\.gz/);
  assert.match(checksums, new RegExp(manifest.packages.framework_core.source_archive.sha256));
  assert.equal(manifest.packages.native_helper.channel_status, 'active_ghcr_oci_prebuild');
  assert.equal(manifest.packages.native_helper.retention_policy.retain_versions, 4);
  assert.ok(manifest.packages.native_helper.retention_policy.protected_tags.includes('latest'));
  assert.equal(manifest.packages.native_helper.required_gates.includes('ghcr_oci_archive_pushed'), true);
  assert.equal(
    manifest.packages.package_artifacts.mas.release_discipline.rollback.version,
    '26.4.30',
  );
  assert.equal(
    manifest.packages.package_artifacts.mas.release_discipline.package_channel_status,
    'active_release_channel',
  );
  assert.equal(
    manifest.packages.package_artifacts.mas.release_discipline.package_lifecycle_status,
    'active_release_channel',
  );
  assert.equal(
    manifest.packages.package_artifacts.mas.release_discipline.workflow_trigger_policy,
    'release_gate_workflow_call_or_manual_dispatch',
  );
  assert.equal(
    manifest.packages.package_artifacts.mas.source_git.head_sha,
    fixtures.medautoscience.getHeadSha(),
  );
  assert.equal(
    manifest.packages.package_artifacts.mas.capability_dependencies[0].package_id,
    'mas-scholar-skills',
  );
  assert.match(manifest.packages.package_artifacts.mas.source_archive.sha256, /^[0-9a-f]{64}$/);
  assert.equal(
    manifest.packages.package_artifacts.oma.source_git.head_sha,
    fixtures.oplmetaagent.getHeadSha(),
  );
  assert.equal(
    manifest.packages.package_artifacts.oma.remote_publish_status,
    'publication_workflow_configured_pending_remote_verification',
  );
  assert.match(manifest.packages.package_artifacts.oma.source_archive.sha256, /^[0-9a-f]{64}$/);
  assert.equal(
    manifest.packages.package_artifacts.obf.source_git.head_sha,
    fixtures.oplbookforge.getHeadSha(),
  );
  assert.equal(
    manifest.packages.package_artifacts.obf.codex_standalone_distribution.distribution_shape,
    'generated_carrier_surface',
  );
  assert.match(manifest.packages.package_artifacts.obf.source_archive.sha256, /^[0-9a-f]{64}$/);
  assert.equal(
    manifest.packages.package_artifacts['mas-scholar-skills'].source_git.head_sha,
    fixtures.scholarskills.getHeadSha(),
  );
  assert.equal(manifest.packages.package_artifacts['mas-scholar-skills'].scope, 'framework_capability_package');
  assert.equal(
    manifest.packages.package_artifacts['mas-scholar-skills'].package_manifest_ref,
    'contracts/opl-framework/packages/mas-scholar-skills.json',
  );
  assert.deepEqual(manifest.packages.package_artifacts['mas-scholar-skills'].dependency_of, ['mas']);
  assert.match(manifest.packages.package_artifacts['mas-scholar-skills'].source_archive.sha256, /^[0-9a-f]{64}$/);
  assert.match(checksums, /mas-0\.2\.1\.tar\.gz/);
  assert.match(checksums, /mag-0\.3\.0\.tar\.gz/);
  assert.match(checksums, /oma-0\.3\.0\.tar\.gz/);
  assert.match(checksums, /rca-0\.2\.4\.tar\.gz/);
  assert.match(checksums, /obf-0\.3\.2\.tar\.gz/);
  assert.match(checksums, /mas-scholar-skills-0\.2\.1\.tar\.gz/);
  assert.match(checksums, /opl-flow-0\.1\.20\.tar\.gz/);
  assert.match(checksums, new RegExp(manifest.packages.package_artifacts.mas.source_archive.sha256));

  execFileSync(process.execPath, [
    path.join(repoRoot, 'scripts/package-release-discipline.mjs'),
    '--manifest',
    releaseManifestPath,
  ], {
    cwd: os.tmpdir(),
    encoding: 'utf8',
  });

  const prereleaseManifest = structuredClone(manifest);
  const prereleaseArtifact = prereleaseManifest.packages.package_artifacts.mas;
  prereleaseArtifact.package_version = '0.2.1-alpha.1';
  prereleaseArtifact.artifact = prereleaseArtifact.artifact.replace(':0.2.1', ':0.2.1-alpha.1');
  prereleaseManifest.release_set.components.packages.members.mas.package_version = '0.2.1-alpha.1';
  prereleaseManifest.release_set.components.packages.members.mas.oci_artifact_ref = prereleaseArtifact.artifact;
  const prereleaseManifestPath = path.join(outDir, 'opl-release-manifest-prerelease.json');
  fs.writeFileSync(prereleaseManifestPath, `${JSON.stringify(prereleaseManifest, null, 2)}\n`);
  execFileSync(process.execPath, [
    path.join(repoRoot, 'scripts/package-release-discipline.mjs'),
    '--manifest', prereleaseManifestPath,
    '--promotion-target', 'candidate',
  ], { cwd: os.tmpdir(), encoding: 'utf8' });
  assert.throws(() => execFileSync(process.execPath, [
    path.join(repoRoot, 'scripts/package-release-discipline.mjs'),
    '--manifest', prereleaseManifestPath,
    '--promotion-target', 'latest-stable',
  ], { cwd: os.tmpdir(), encoding: 'utf8' }), /latest-stable cannot select a prerelease Package/);

  const docsOnlyFixturePath = path.join(repoRoot, 'docs', `.runtime-archive-exclusion-${process.pid}.md`);
  const repeatOutDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-repeat-out-'));
  const immutablePreviousManifestPath = path.join(outDir, 'immutable-previous-manifest.json');
  const immutablePreviousManifest = structuredClone(finalizedChannelManifest);
  const immutablePreviousFlow = immutablePreviousManifest.packages.package_catalog['opl-flow'].versions
    .find((entry: Record<string, unknown>) => entry.selection_status === 'selected_for_release_set');
  const immutablePreviousFlowManifest = JSON.parse(immutablePreviousFlow.manifest_json);
  immutablePreviousFlowManifest.immutable_registry_fixture = 'preserve exact published metadata';
  immutablePreviousFlow.manifest_json = `${JSON.stringify(immutablePreviousFlowManifest, null, 2)}\n`;
  immutablePreviousFlow.manifest_sha256 = `sha256:${crypto.createHash('sha256').update(immutablePreviousFlow.manifest_json).digest('hex')}`;
  immutablePreviousFlow.package_manifest.sha256 = immutablePreviousFlow.manifest_sha256;
  const immutablePreviousFlowPayload = JSON.parse(immutablePreviousFlow.payload_manifest_json);
  delete immutablePreviousFlowPayload.package_source.archive_root;
  immutablePreviousFlowPayload.immutable_registry_fixture = 'legacy published payload';
  immutablePreviousFlow.payload_manifest_json = `${JSON.stringify(immutablePreviousFlowPayload, null, 2)}\n`;
  immutablePreviousFlow.payload_manifest_sha256 = `sha256:${crypto.createHash('sha256').update(immutablePreviousFlow.payload_manifest_json).digest('hex')}`;
  immutablePreviousFlow.payload_digest = immutablePreviousFlow.payload_manifest_sha256;
  fs.writeFileSync(immutablePreviousManifestPath, `${JSON.stringify(immutablePreviousManifest, null, 2)}\n`, 'utf8');
  try {
    fs.writeFileSync(docsOnlyFixturePath, 'This file must not affect OPL Base runtime archive bytes.\n', 'utf8');
    execFileSync(process.execPath, [
      '--experimental-strip-types',
      path.join(repoRoot, 'scripts/package-archives.mjs'),
      '--release-set-generation', '26.4.32',
      '--owner', 'gaofeng21cn',
      '--out-dir', repeatOutDir,
      '--owner-cohort-lock', archiveBuilderResult.owner_cohort_lock,
      '--previous-manifest', immutablePreviousManifestPath,
      '--app-component-manifest', appComponentManifest,
    ], { cwd: repoRoot, encoding: 'utf8', env: ownerSourceEnv });
    const repeatedManifest = parseJsonText(fs.readFileSync(
      path.join(repeatOutDir, 'opl-release-manifest.json'),
      'utf8',
    )) as Record<string, any>;
    assert.equal(
      repeatedManifest.packages.framework_core.source_archive.sha256,
      manifest.packages.framework_core.source_archive.sha256,
    );
    const repeatedChannelManifest = parseJsonText(fs.readFileSync(
      path.join(repeatOutDir, 'opl-channel-manifest.json'),
      'utf8',
    )) as Record<string, any>;
    const repeatedFlow = repeatedChannelManifest.packages.package_catalog['opl-flow'].versions
      .find((entry: Record<string, unknown>) => entry.selection_status === 'selected_for_release_set');
    assert.deepEqual(repeatedFlow, immutablePreviousFlow);

    const collisionPreviousManifest = structuredClone(immutablePreviousManifest);
    collisionPreviousManifest.packages.package_catalog.mas.versions[0].owner_source_commit = 'f'.repeat(40);
    const collisionPreviousManifestPath = path.join(outDir, 'immutable-collision-previous-manifest.json');
    fs.writeFileSync(
      collisionPreviousManifestPath,
      `${JSON.stringify(collisionPreviousManifest, null, 2)}\n`,
      'utf8',
    );
    assert.throws(() => execFileSync(process.execPath, [
      '--experimental-strip-types',
      path.join(repoRoot, 'scripts/package-archives.mjs'),
      '--release-set-generation', '26.4.33',
      '--owner', 'gaofeng21cn',
      '--out-dir', fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-collision-out-')),
      '--owner-cohort-lock', archiveBuilderResult.owner_cohort_lock,
      '--previous-manifest', collisionPreviousManifestPath,
      '--app-component-manifest', appComponentManifest,
    ], { cwd: repoRoot, encoding: 'utf8', env: ownerSourceEnv }), /Immutable Package version collision for mas:0\.2\.1.*Bump the owner Package version/s);
  } finally {
    fs.rmSync(docsOnlyFixturePath, { force: true });
    fs.rmSync(repeatOutDir, { recursive: true, force: true });
  }

  fs.writeFileSync(path.join(fixtures.medautoscience.sourceRoot, 'OWNER-HEAD-MOVED.txt'), 'new owner head\n', 'utf8');
  execFileSync('git', ['add', 'OWNER-HEAD-MOVED.txt'], { cwd: fixtures.medautoscience.sourceRoot, encoding: 'utf8' });
  execFileSync('git', ['commit', '-m', 'move owner head after cohort freeze'], {
    cwd: fixtures.medautoscience.sourceRoot,
    encoding: 'utf8',
  });
  const staleLockOutDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-stale-lock-out-'));
  try {
    assert.throws(() => execFileSync(process.execPath, [
      '--experimental-strip-types',
      path.join(repoRoot, 'scripts/package-archives.mjs'),
      '--release-set-generation', '26.4.33',
      '--owner', 'gaofeng21cn',
      '--out-dir', staleLockOutDir,
      '--owner-cohort-lock', archiveBuilderResult.owner_cohort_lock,
      '--app-component-manifest', appComponentManifest,
    ], { cwd: repoRoot, encoding: 'utf8', env: ownerSourceEnv }), /does not match cohort lock/);
  } finally {
    fs.rmSync(staleLockOutDir, { recursive: true, force: true });
  }
});

test('first-party agent package manifests declare Codex carrier and OPL package core from one source', () => {
  const schema = parseJsonText(fs.readFileSync(
    path.join(repoRoot, 'contracts/opl-framework/agent-package-manifest.schema.json'),
    'utf8',
  )) as Record<string, any>;
  const manifests = Object.fromEntries(
    ['mas', 'mag', 'rca', 'oma', 'obf'].map((id) => [
      id,
      parseJsonText(fs.readFileSync(
        path.join(repoRoot, `contracts/opl-framework/packages/${id}.json`),
        'utf8',
      )) as Record<string, any>,
    ]),
  );
  const manifest = manifests.mas;
  const expectedReleases: Record<string, { version: string; sourceCommit: string; payloadRef: string }> = {
    mas: {
      version: '0.2.9',
      sourceCommit: 'd95b681bfd5d55ee2038456689927518caac0161',
      payloadRef: 'payloads/mas-0.2.9.json',
    },
    mag: {
      version: '0.3.2',
      sourceCommit: '8ceb733acd63406816a330c465907e69f4179a6d',
      payloadRef: 'payloads/mag-0.3.2.json',
    },
    rca: {
      version: '0.2.6',
      sourceCommit: '566fd793cb91860146bf81a104945b76f85ce7e5',
      payloadRef: 'payloads/rca-0.2.6.json',
    },
    oma: {
      version: '0.3.6',
      sourceCommit: '4761b7ce27275cfcac73444ac82945631e56aa86',
      payloadRef: 'payloads/oma-0.3.6.json',
    },
    obf: {
      version: '0.3.4',
      sourceCommit: '80c5a0da174511034401b31b440c629223e058f8',
      payloadRef: 'payloads/obf-0.3.4.json',
    },
  };

  assert.equal(manifest.schema_ref, 'contracts/opl-framework/agent-package-manifest.schema.json');
  assert.equal(manifest.package_id, 'mas');
  assert.equal(manifest.agent_id, 'mas');
  assert.equal(manifest.version, '0.2.9');
  assert.equal(manifest.carrier_source_role, 'codex_plugin_default_carrier_not_package_truth');
  assert.equal(schema.required.includes('distribution_payload'), false);
  assert.equal(schema.properties.distribution_payload.properties.install_truth.const, 'resolved_digest_lock');
  assert.equal(schema.properties.distribution_payload.properties.payload_digest_ref.pattern, '^sha256:[0-9a-f]{64}$');
  assert.equal(manifest.package_core.core_kind, 'opl_agent_package_core');
  assert.equal(manifest.package_core.dependency_source, 'manifest_declared_capability_dependencies');
  assert.equal(manifest.carrier_adapters[0].carrier, 'codex_plugin');
  assert.equal(manifest.carrier_adapters[0].owns_package_core, false);
  assert.equal(schema.properties.capability_dependencies.items.properties.codex_distribution.const, 'bundled');
  assert.equal(schema.properties.codex_surface.properties.plugin_payload_manifest_url.type, 'string');
  assert.equal(schema.properties.codex_surface.properties.carrier_source_commit.pattern, '^[0-9a-f]{40}$');
  assert.equal(schema.properties.codex_surface.required.includes('carrier_source_commit'), true);
  assert.equal(schema.properties.package_core.properties.core_kind.const, 'opl_agent_package_core');
  assert.equal(schema.properties.carrier_adapters.items.properties.carrier.const, 'codex_plugin');
  assert.deepEqual(manifest.codex_surface.required_skill_ids, ['med-autoscience']);
  assert.deepEqual(manifest.codex_surface.bundled_capability_package_ids, ['mas-scholar-skills']);
  assert.equal(manifests.mag.codex_surface.standalone_distribution, 'repo_carrier_source');
  assert.equal(manifests.rca.codex_surface.standalone_distribution, 'repo_carrier_source');
  assert.equal(manifests.oma.codex_surface.standalone_distribution, 'generated_carrier_surface');
  assert.equal(manifests.obf.codex_surface.standalone_distribution, 'generated_carrier_surface');
  assert.deepEqual(manifests.mag.capability_dependencies, []);
  assert.deepEqual(manifests.rca.capability_dependencies, []);
  Object.values(manifests).forEach((sourceManifest) => {
    const expectedRelease = expectedReleases[sourceManifest.package_id];
    assert.equal(sourceManifest.version, expectedRelease.version);
    assert.equal(sourceManifest.codex_surface.plugin_payload_manifest_url, expectedRelease.payloadRef);
    assert.equal(sourceManifest.codex_surface.carrier_source_commit, expectedRelease.sourceCommit);
    const payloadRef = sourceManifest.codex_surface.plugin_payload_manifest_url;
    assert.match(payloadRef, /^payloads\/[a-z0-9.-]+\.json$/);
    const payload = parseJsonText(fs.readFileSync(
      path.join(repoRoot, 'contracts/opl-framework/packages', payloadRef),
      'utf8',
    )) as Record<string, any>;
    assert.equal(payload.package_id, sourceManifest.package_id);
    assert.equal(payload.package_version, sourceManifest.version);
    assert.equal(payload.source_commit, expectedRelease.sourceCommit);
    assert.equal(payload.files.some((entry: Record<string, any>) => entry.path === '.codex-plugin/plugin.json'), true);
    assert.equal(payload.files.some((entry: Record<string, any>) => entry.path === `skills/${sourceManifest.codex_surface.plugin_id}/SKILL.md`), true);
    assert.equal(payload.files.every((entry: Record<string, any>) => /^sha256:[0-9a-f]{64}$/.test(entry.sha256)), true);
    assert.equal(Object.hasOwn(sourceManifest, 'distribution_payload'), false);
    assert.doesNotThrow(() => assertJsonSchemaPayload({
      schemaId: schema.$id,
      schema,
      sourceRef: 'contracts/opl-framework/agent-package-manifest.schema.json',
    }, sourceManifest));
    assert.equal(normalizeFirstPartyAgentPackageManifest(sourceManifest).distribution_payload, null);
  });
  assert.equal(manifest.opl_managed_surface.package_shape, 'thin_agent_package');
  assert.equal(manifest.opl_managed_surface.dependency_resolution, 'managed_dependency_graph');
  assert.deepEqual(
    manifest.capability_dependencies.map((dependency: Record<string, any>) => ({
      module_id: dependency.module_id,
      package_id: dependency.package_id,
      codex_distribution: dependency.codex_distribution,
      opl_distribution: dependency.opl_distribution,
      developer_distribution: dependency.developer_distribution,
    })),
    [
      {
        module_id: 'scholarskills',
        package_id: 'mas-scholar-skills',
        codex_distribution: 'bundled',
        opl_distribution: 'managed_dependency',
        developer_distribution: 'source_checkout',
      },
    ],
  );
});

test('MAS Scholar Skills provider manifest separates core Skill exports from module contract ids', () => {
  const schemaPath = path.join(repoRoot, 'contracts/opl-framework/capability-package-manifest.schema.json');
  const manifestPath = path.join(repoRoot, 'contracts/opl-framework/packages/mas-scholar-skills.json');
  const schema = parseJsonText(fs.readFileSync(schemaPath, 'utf8')) as Record<string, any>;
  const manifest = parseJsonText(fs.readFileSync(manifestPath, 'utf8')) as Record<string, any>;
  assert.doesNotThrow(() => assertJsonSchemaPayload({
    schemaId: schema.$id,
    schema,
    sourceRef: 'contracts/opl-framework/capability-package-manifest.schema.json',
  }, manifest));
  const normalized = normalizeCapabilityPackageManifest(manifest, manifestPath);
  const payloadPath = path.join(path.dirname(manifestPath), manifest.codex_surface.plugin_payload_manifest_url);
  const payload = parseJsonText(fs.readFileSync(payloadPath, 'utf8')) as Record<string, any>;
  assert.equal(manifest.version, '0.2.3');
  assert.equal(manifest.primary_consumer.version_requirement, '>=0.2.0 <0.3.0');
  assert.equal(manifest.content_lock.canonicalization, 'ordered_path_length_file_length_bytes');
  assert.equal(manifest.content_lock.digest, 'sha256:eedf57475662da7d929b696f25015350e855764b9bff64df32f18341c4ec44f6');
  assert.equal(normalized.required_skill_ids.length, 35);
  assert.equal(normalized.capability_provider?.module_export_ids.length, 10);
  assert.equal(normalized.capability_provider?.exports.filter((entry) => entry.install_mode === 'core_required').length, 11);
  assert.equal(normalized.capability_provider?.exports.filter((entry) => entry.install_mode !== 'core_required').length, 24);
  assert.equal(normalized.optional_skill_refs.length, 1);
  assert.equal(payload.package_id, manifest.package_id);
  assert.equal(payload.package_version, manifest.version);
  assert.equal(payload.source_commit, 'ed621f53a905e02cdf272387d14d0d5415d73781');
  assert.deepEqual(
    payload.files.map((entry: Record<string, any>) => entry.path).sort(),
    manifest.content_lock.paths.slice().sort(),
  );
  assert.equal(payload.files.every((entry: Record<string, any>) => /^sha256:[0-9a-f]{64}$/.test(entry.sha256)), true);
  assert.equal(payload.surface_kind, 'opl_package_payload_manifest.v2');
  assert.equal(Object.hasOwn(payload, 'agent_id'), false);
});

test('OPL Flow is a workflow-profile Package without Agent identity', () => {
  const schemaPath = path.join(repoRoot, 'contracts/opl-framework/workflow-profile-package-manifest.schema.json');
  const manifestPath = path.join(repoRoot, 'contracts/opl-framework/packages/opl-flow.json');
  const schema = parseJsonText(fs.readFileSync(schemaPath, 'utf8')) as Record<string, any>;
  const manifest = parseJsonText(fs.readFileSync(manifestPath, 'utf8')) as Record<string, any>;
  assert.doesNotThrow(() => assertJsonSchemaPayload({
    schemaId: schema.$id,
    schema,
    sourceRef: 'contracts/opl-framework/workflow-profile-package-manifest.schema.json',
  }, manifest));
  const normalized = normalizeWorkflowProfilePackageManifest(manifest, manifestPath);
  const payload = parseJsonText(fs.readFileSync(
    path.join(path.dirname(manifestPath), manifest.codex_surface.plugin_payload_manifest_url),
    'utf8',
  )) as Record<string, any>;
  assert.equal(manifest.surface_kind, 'opl_workflow_profile_package_manifest.v1');
  assert.equal(manifest.version, '0.1.20');
  assert.equal(manifest.codex_surface.carrier_source_commit, '9bfa310c6693787040701efd19a8ddd4cf79f6e4');
  assert.equal(schema.properties.codex_surface.required.includes('carrier_source_commit'), true);
  assert.equal(Object.hasOwn(manifest, 'agent_id'), false);
  assert.equal(normalized.agent_id, null);
  assert.equal(normalized.profile_surface?.existing_profile_policy, 'semantic_merge_required');
  assert.equal(payload.surface_kind, 'opl_package_payload_manifest.v2');
  assert.equal(payload.source_commit, '9bfa310c6693787040701efd19a8ddd4cf79f6e4');
  assert.equal(Object.hasOwn(payload, 'agent_id'), false);
});

test('first-party agent package manifest rejects non-canonical identity fields', () => {
  const legacyManifest = {
    agent_id: 'mas',
    package_id: 'med-autoscience',
    version: '0.1.0a4',
    source: 'first_party',
    carrier_source_role: 'codex_plugin_default_carrier_not_package_truth',
    codex_surface: {
      plugin_id: 'med-autoscience',
      standalone_distribution: 'repo_carrier_source',
      required_skill_ids: ['med-autoscience'],
      bundled_capability_package_ids: ['mas-scholar-skills'],
    },
    capability_dependencies: [
      {
        module_id: 'scholarskills',
        package_id: 'mas-scholar-skills',
        kind: 'framework_capability_package',
        required_for: ['workspace_or_quest_codex_discovery'],
        codex_distribution: 'bundled',
        opl_distribution: 'managed_dependency',
        developer_distribution: 'source_checkout',
        sync_scopes: ['workspace', 'quest'],
        authority_boundary: {
          can_write_domain_truth: false,
          can_sign_owner_receipt: false,
          can_create_typed_blocker: false,
          can_write_runtime_queue: false,
        },
      },
    ],
  };

  assert.throws(
    () => normalizeFirstPartyAgentPackageManifest(legacyManifest),
    /(agent_id|package_id) must use its canonical id/,
  );
  assert.throws(
    () => normalizeFirstPartyAgentPackageManifest({
      ...legacyManifest,
      agent_id: 'med-autoscience',
      package_id: 'medautoscience',
    }),
    /(agent_id|package_id) must use its canonical id/,
  );
});

test('first-party agent package manifest rejects unknown Codex carrier distributions', () => {
  const manifest = parseJsonText(fs.readFileSync(
    path.join(repoRoot, 'contracts/opl-framework/packages/oma.json'),
    'utf8',
  )) as Record<string, any>;
  assert.throws(
    () => normalizeFirstPartyAgentPackageManifest({
      ...manifest,
      codex_surface: {
        ...manifest.codex_surface,
        standalone_distribution: 'private_repo_installer',
      },
    }),
    /standalone_distribution is invalid/,
  );
});

test('MAS first-party agent package manifest fails closed for unsafe dependency declarations', () => {
  const manifest = parseJsonText(fs.readFileSync(
    path.join(repoRoot, 'contracts/opl-framework/packages/mas.json'),
    'utf8',
  )) as Record<string, any>;
  assert.deepEqual(normalizeFirstPartyAgentPackageManifest({
    ...manifest,
    capability_dependencies: [],
    distribution_payload: publishedDistributionPayload,
  }).capability_dependencies, []);
  assert.equal(
    normalizeFirstPartyAgentPackageManifest({
      ...manifest,
      distribution_payload: publishedDistributionPayload,
    }).distribution_payload?.install_truth,
    'resolved_digest_lock',
  );
  assert.throws(
    () => normalizeFirstPartyAgentPackageManifest({
      ...manifest,
      distribution_payload: {
        ...publishedDistributionPayload,
        install_truth: 'latest',
      },
    }),
    /distribution_payload.install_truth must be resolved_digest_lock/,
  );
  assert.throws(
    () => normalizeFirstPartyAgentPackageManifest({
      ...manifest,
      distribution_payload: {
        ...publishedDistributionPayload,
        payload_digest_ref: 'sha256:not-a-digest',
      },
    }),
    /payload_digest_ref must be a SHA-256 digest ref/,
  );
  assert.throws(
    () => normalizeFirstPartyAgentPackageManifest({
      ...manifest,
      capability_dependencies: [
        {
          ...manifest.capability_dependencies[0],
          authority_boundary: {
            ...manifest.capability_dependencies[0].authority_boundary,
            can_write_domain_truth: true,
          },
        },
      ],
    }),
    /authority boundary must be false-only/,
  );
  assert.throws(
    () => normalizeFirstPartyAgentPackageManifest({
      ...manifest,
      capability_dependencies: [
        {
          ...manifest.capability_dependencies[0],
          sync_scopes: ['workspace'],
        },
      ],
    }),
    /workspace and quest scopes/,
  );
});

test('package archive builder refreshes reused managed clones before archiving source', () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-refresh-out-'));
  const cloneRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-refresh-clones-'));
  const gitConfigPath = path.join(os.tmpdir(), `opl-package-refresh-git-${Date.now()}.config`);

  const fixtures = {
    medautoscience: createOwnerPackageFixture('med-autoscience', 'mas', '0.2.1'),
    medautogrant: createOwnerPackageFixture('med-autogrant', 'mag', '0.3.0'),
    redcube: createOwnerPackageFixture('redcube-ai', 'rca', '0.2.4'),
    oplmetaagent: createOwnerPackageFixture('opl-meta-agent', 'oma', '0.3.0'),
    oplbookforge: createOwnerPackageFixture('opl-bookforge', 'obf', '0.3.2'),
    scholarskills: createOwnerPackageFixture('mas-scholar-skills', 'mas-scholar-skills', '0.2.1', 'capability_package'),
    oplflow: createOwnerPackageFixture('opl-flow', 'opl-flow', '0.1.20', 'workflow_profile'),
  };
  fs.writeFileSync(
    gitConfigPath,
    [
      `[url "${fixtures.medautoscience.remoteRoot}"]`,
      '\tinsteadOf = https://github.com/gaofeng21cn/med-autoscience.git',
      '',
    ].join('\n'),
    'utf8',
  );

  const env = {
    ...process.env,
    GIT_CONFIG_GLOBAL: gitConfigPath,
    OPL_PACKAGE_SOURCE_PATH_MAG: fixtures.medautogrant.sourceRoot,
    OPL_PACKAGE_SOURCE_PATH_RCA: fixtures.redcube.sourceRoot,
    OPL_PACKAGE_SOURCE_PATH_OMA: fixtures.oplmetaagent.sourceRoot,
    OPL_PACKAGE_SOURCE_PATH_OBF: fixtures.oplbookforge.sourceRoot,
    OPL_PACKAGE_SOURCE_PATH_MAS_SCHOLAR_SKILLS: fixtures.scholarskills.sourceRoot,
    OPL_PACKAGE_SOURCE_PATH_OPL_FLOW: fixtures.oplflow.sourceRoot,
    OPL_PACKAGE_RELEASE_GATE: 'test_owner_sha_release_gate',
  };

  execFileSync(process.execPath, [
    '--experimental-strip-types',
    path.join(repoRoot, 'scripts/package-archives.mjs'),
    '--release-set-generation',
    '26.4.32',
    '--owner',
    'gaofeng21cn',
    '--out-dir',
    outDir,
    '--clone-root',
    cloneRoot,
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env,
  });
  const advancedHead = fixtures.medautoscience.advance('CHANGELOG.md', 'fresh source\n', 'Advance module source');

  execFileSync(process.execPath, [
    '--experimental-strip-types',
    path.join(repoRoot, 'scripts/package-archives.mjs'),
    '--release-set-generation',
    '26.4.32',
    '--owner',
    'gaofeng21cn',
    '--out-dir',
    outDir,
    '--clone-root',
    cloneRoot,
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env,
  });

  const manifest = parseJsonText(fs.readFileSync(path.join(outDir, 'opl-release-manifest.json'), 'utf8')) as any;
  assert.equal(manifest.packages.package_artifacts.mas.source_git.head_sha, advancedHead);
});

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
import { assertJsonSchemaPayload } from '../../../../../src/kernel/schema-registry.ts';

const publishedDistributionPayload = {
  payload_kind: 'ghcr_oci_agent_package',
  payload_ref: 'ghcr.io/gaofeng21cn/opl-agent-med-autoscience:latest',
  payload_digest_ref: `sha256:${'a'.repeat(64)}`,
  required_skill_pack_lock_refs: [
    'opl://agent-package-lock/mas-scholar-skills/0.1.0a4/managed-ghcr-capability-package',
  ],
  proof_status: 'published_release_receipt_bound',
  live_download_proof: false,
  installed_reload_proof: false,
  oci_ref: 'ghcr.io/gaofeng21cn/opl-agent-med-autoscience:latest',
  oci_media_type: 'application/vnd.oci.image.manifest.v1+json',
  immutable_tag: '0.1.0a4',
  rolling_tag: 'latest',
  promotion_policy: 'daily_candidate_gates_then_promote_latest',
  install_truth: 'resolved_digest_lock',
};

test('package archive builder writes channel manifest checksums git source and release discipline gate', () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-out-'));
  const previousManifest = path.join(outDir, 'previous-manifest.json');
  fs.writeFileSync(previousManifest, JSON.stringify({ opl_version: '26.4.30' }), 'utf8');

  const fixtures = {
    medautoscience: createGitModuleRemoteFixture('med-autoscience'),
    medautogrant: createGitModuleRemoteFixture('med-autogrant'),
    redcube: createGitModuleRemoteFixture('redcube-ai'),
    oplmetaagent: createGitModuleRemoteFixture('opl-meta-agent'),
    oplbookforge: createGitModuleRemoteFixture('opl-bookforge'),
    scholarskills: createGitModuleRemoteFixture('mas-scholar-skills'),
  };

  const archiveBuilderOutput = execFileSync(process.execPath, [
    '--experimental-strip-types',
    path.join(repoRoot, 'scripts/package-module-archives.mjs'),
    '--version',
    '26.4.31',
    '--owner',
    'gaofeng21cn',
    '--out-dir',
    outDir,
    '--previous-manifest',
    previousManifest,
    '--retain-versions',
    '4',
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      OPL_MODULE_PATH_MEDAUTOSCIENCE: fixtures.medautoscience.sourceRoot,
      OPL_MODULE_PATH_MEDAUTOGRANT: fixtures.medautogrant.sourceRoot,
      OPL_MODULE_PATH_REDCUBE: fixtures.redcube.sourceRoot,
      OPL_MODULE_PATH_OPLMETAAGENT: fixtures.oplmetaagent.sourceRoot,
      OPL_MODULE_PATH_OPLBOOKFORGE: fixtures.oplbookforge.sourceRoot,
      OPL_MODULE_PATH_SCHOLARSKILLS: fixtures.scholarskills.sourceRoot,
    },
  });
  const archiveBuilderResult = parseJsonText(archiveBuilderOutput) as {
    clone_root: string;
    modules_dir: string;
    framework_dir: string;
    release_discipline_workflows: string[];
  };

  const releaseManifestPath = path.join(outDir, 'opl-release-manifest.json');
  const channelManifestPath = path.join(outDir, 'opl-channel-manifest.json');
  const checksumsPath = path.join(outDir, 'SHA256SUMS');
  const defaultCloneRoot = path.join(path.dirname(outDir), `${path.basename(outDir)}-package-sources`);
  const manifest = parseJsonText(fs.readFileSync(releaseManifestPath, 'utf8')) as any;
  const channelManifest = parseJsonText(fs.readFileSync(channelManifestPath, 'utf8')) as any;
  const releaseManifestSource = fs.readFileSync(releaseManifestPath, 'utf8');
  const channelManifestSource = fs.readFileSync(channelManifestPath, 'utf8');
  const checksums = fs.readFileSync(checksumsPath, 'utf8');
  const relativeCloneRootFromOutDir = path.relative(outDir, archiveBuilderResult.clone_root);

  assert.equal(archiveBuilderResult.clone_root, defaultCloneRoot);
  assert.equal(archiveBuilderResult.modules_dir, path.join(outDir, 'modules'));
  assert.equal(archiveBuilderResult.framework_dir, path.join(outDir, 'framework'));
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
  assert.equal(channelManifest.opl_version, manifest.opl_version);
  assert.equal(channelManifest.manifest_role, 'opl_release_channel_manifest');
  assert.notEqual(channelManifestSource, releaseManifestSource);
  assert.equal(channelManifest.packages.codex_default_profile.model_provider, 'gflab');
  assert.equal(channelManifest.packages.codex_default_profile.base_url, 'https://gflabtoken.cn/v1');
  assert.equal(channelManifest.packages.codex_default_profile.base_url_role, 'product_default_provider_endpoint');
  assert.equal(channelManifest.packages.codex_default_profile.model_profile_role, 'app_catalog_unavailable_fallback_projection');
  assert.equal(JSON.stringify(channelManifest.packages.codex_default_profile).includes('experimental_bearer_token'), false);
  assert.equal(manifest.release_automation.rollback.previous_version, '26.4.30');
  assert.equal(manifest.release_automation.cleanup.retain_versions, 4);
  assert.ok(manifest.release_automation.cleanup.protected_tags.includes('latest'));
  assert.equal(manifest.release_automation.status, 'active_managed_ghcr_capability_packages');
  assert.equal(manifest.release_automation.package_lifecycle_status, 'active_release_channel');
  assert.equal(manifest.release_automation.workflow_trigger_policy, 'release_gate_workflow_call_or_manual_dispatch');
  assert.equal(manifest.release_automation.remote_publish_status, 'release_gate_or_manual_dispatch_publishes_ghcr_packages');
  assert.equal(manifest.packages.framework_core.homebrew_formula.package_name, 'opl-framework');
  assert.equal(manifest.packages.framework_core.homebrew_formula.version, '26.4.31');
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
  assert.deepEqual(
    channelManifest.packages.framework_core.homebrew_formula,
    manifest.packages.framework_core.homebrew_formula,
  );
  assert.equal(manifest.release_automation.release_manifest_publication_status, 'active_ghcr_channel_manifest');
  assert.equal(manifest.release_automation.release_manifest_package.package_channel_status, 'active_release_channel');
  assert.equal(manifest.release_automation.daily_package_channel.status, 'active_change_detected_daily_publish');
  assert.equal(manifest.release_automation.daily_package_channel.no_change_behavior, 'skip_without_publish');
  assert.equal(manifest.release_automation.daily_package_channel.version_template, '<utc_yy.m.d>');
  assert.equal(manifest.release_automation.daily_package_channel.force_publish_input, 'force_publish');
  assert.equal(Object.hasOwn(manifest.packages, 'webui_docker_image'), false);
  assert.equal(manifest.packages.framework_core.artifact, 'ghcr.io/gaofeng21cn/one-person-lab-framework:26.4.31');
  assert.match(manifest.packages.framework_core.source_archive.sha256, /^[0-9a-f]{64}$/);
  assert.match(manifest.packages.framework_core.source_git.head_sha, /^[0-9a-f]{40}$/);
  assert.equal(channelManifest.packages.framework_core.artifact, manifest.packages.framework_core.artifact);
  assert.match(checksums, /one-person-lab-framework-26\.4\.31\.tar\.gz/);
  assert.match(checksums, new RegExp(manifest.packages.framework_core.source_archive.sha256));
  assert.equal(manifest.packages.native_helper.channel_status, 'active_ghcr_oci_prebuild');
  assert.equal(manifest.packages.native_helper.retention_policy.retain_versions, 4);
  assert.ok(manifest.packages.native_helper.retention_policy.protected_tags.includes('latest'));
  assert.equal(manifest.packages.native_helper.required_gates.includes('ghcr_oci_archive_pushed'), true);
  assert.equal(
    manifest.packages.modules.medautoscience.release_discipline.rollback.version,
    '26.4.30',
  );
  assert.equal(
    manifest.packages.modules.medautoscience.release_discipline.package_channel_status,
    'active_release_channel',
  );
  assert.equal(
    manifest.packages.modules.medautoscience.release_discipline.package_lifecycle_status,
    'active_release_channel',
  );
  assert.equal(
    manifest.packages.modules.medautoscience.release_discipline.workflow_trigger_policy,
    'release_gate_workflow_call_or_manual_dispatch',
  );
  assert.equal(
    manifest.packages.modules.medautoscience.source_git.head_sha,
    fixtures.medautoscience.getHeadSha(),
  );
  assert.equal(
    manifest.packages.modules.medautoscience.capability_dependencies[0].package_id,
    'mas-scholar-skills',
  );
  assert.match(manifest.packages.modules.medautoscience.source_archive.sha256, /^[0-9a-f]{64}$/);
  assert.equal(
    manifest.packages.modules.oplmetaagent.source_git.head_sha,
    fixtures.oplmetaagent.getHeadSha(),
  );
  assert.equal(
    manifest.packages.modules.oplmetaagent.remote_publish_status,
    'published_to_ghcr_by_packages_workflow',
  );
  assert.match(manifest.packages.modules.oplmetaagent.source_archive.sha256, /^[0-9a-f]{64}$/);
  assert.equal(
    manifest.packages.modules.oplbookforge.source_git.head_sha,
    fixtures.oplbookforge.getHeadSha(),
  );
  assert.equal(
    manifest.packages.modules.oplbookforge.codex_standalone_distribution.distribution_shape,
    'repo_carrier_source',
  );
  assert.match(manifest.packages.modules.oplbookforge.source_archive.sha256, /^[0-9a-f]{64}$/);
  assert.equal(
    manifest.packages.modules.scholarskills.source_git.head_sha,
    fixtures.scholarskills.getHeadSha(),
  );
  assert.equal(manifest.packages.modules.scholarskills.scope, 'framework_capability_package');
  assert.deepEqual(manifest.packages.modules.scholarskills.dependency_of, ['medautoscience']);
  assert.match(manifest.packages.modules.scholarskills.source_archive.sha256, /^[0-9a-f]{64}$/);
  assert.match(checksums, /med-autoscience-26\.4\.31\.tar\.gz/);
  assert.match(checksums, /opl-meta-agent-26\.4\.31\.tar\.gz/);
  assert.match(checksums, /opl-bookforge-26\.4\.31\.tar\.gz/);
  assert.match(checksums, /mas-scholar-skills-26\.4\.31\.tar\.gz/);
  assert.match(checksums, new RegExp(manifest.packages.modules.medautoscience.source_archive.sha256));

  execFileSync(process.execPath, [
    path.join(repoRoot, 'scripts/package-release-discipline.mjs'),
    '--manifest',
    releaseManifestPath,
  ], {
    cwd: os.tmpdir(),
    encoding: 'utf8',
  });
});

test('first-party agent package manifests declare Codex carrier and OPL package core from one source', () => {
  const schema = parseJsonText(fs.readFileSync(
    path.join(repoRoot, 'contracts/opl-framework/agent-package-manifest.schema.json'),
    'utf8',
  )) as Record<string, any>;
  const manifests = Object.fromEntries(
    ['mas', 'mag', 'rca', 'oma', 'bookforge'].map((id) => [
      id,
      parseJsonText(fs.readFileSync(
        path.join(repoRoot, `contracts/opl-framework/agent-packages/${id}.json`),
        'utf8',
      )) as Record<string, any>,
    ]),
  );
  const manifest = manifests.mas;

  assert.equal(manifest.schema_ref, 'contracts/opl-framework/agent-package-manifest.schema.json');
  assert.equal(manifest.package_id, 'med-autoscience');
  assert.equal(manifest.agent_id, 'med-autoscience');
  assert.equal(manifest.version, '0.1.0a4');
  assert.equal(manifest.carrier_source_role, 'codex_plugin_default_carrier_not_package_truth');
  assert.equal(schema.required.includes('distribution_payload'), false);
  assert.equal(schema.properties.distribution_payload.properties.rolling_tag.const, 'latest');
  assert.equal(schema.properties.distribution_payload.properties.install_truth.const, 'resolved_digest_lock');
  assert.equal(schema.properties.distribution_payload.properties.payload_digest_ref.pattern, '^sha256:[0-9a-f]{64}$');
  assert.equal(manifest.package_core.core_kind, 'opl_agent_package_core');
  assert.equal(manifest.package_core.dependency_source, 'manifest_declared_capability_dependencies');
  assert.equal(manifest.carrier_adapters[0].carrier, 'codex_plugin');
  assert.equal(manifest.carrier_adapters[0].owns_package_core, false);
  assert.equal(schema.properties.capability_dependencies.items.properties.codex_distribution.const, 'bundled');
  assert.equal(schema.properties.codex_surface.properties.standalone_distribution.const, 'repo_carrier_source');
  assert.equal(schema.properties.package_core.properties.core_kind.const, 'opl_agent_package_core');
  assert.equal(schema.properties.carrier_adapters.items.properties.carrier.const, 'codex_plugin');
  assert.deepEqual(manifest.codex_surface.required_skill_ids, ['med-autoscience', 'mas-scholar-skills']);
  assert.deepEqual(manifest.codex_surface.bundled_capability_package_ids, ['mas-scholar-skills']);
  assert.equal(manifests.mag.codex_surface.standalone_distribution, 'repo_carrier_source');
  assert.equal(manifests.rca.codex_surface.standalone_distribution, 'repo_carrier_source');
  assert.equal(manifests.oma.codex_surface.standalone_distribution, 'repo_carrier_source');
  assert.equal(manifests.bookforge.codex_surface.standalone_distribution, 'repo_carrier_source');
  assert.deepEqual(manifests.mag.capability_dependencies, []);
  assert.deepEqual(manifests.rca.capability_dependencies, []);
  Object.values(manifests).forEach((sourceManifest) => {
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

test('first-party agent package manifest canonicalizes legacy package and assistant ids without changing plugin or skill ids', () => {
  const normalized = normalizeFirstPartyAgentPackageManifest({
    agent_id: 'mas',
    package_id: 'medautoscience',
    version: '0.1.0a4',
    source: 'first_party',
    carrier_source_role: 'codex_plugin_default_carrier_not_package_truth',
    codex_surface: {
      plugin_id: 'med-autoscience',
      standalone_distribution: 'repo_carrier_source',
      required_skill_ids: ['med-autoscience', 'mas-scholar-skills'],
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
        sync_command_refs: ['opl connect sync-skills --domain mas-scholar-skills --scope workspace --target-workspace <workspace-root> --json'],
        authority_boundary: {
          can_write_domain_truth: false,
          can_sign_owner_receipt: false,
          can_create_typed_blocker: false,
          can_write_runtime_queue: false,
        },
      },
    ],
  });

  assert.equal(normalized.package_id, 'med-autoscience');
  assert.equal(normalized.agent_id, 'med-autoscience');
  assert.equal(normalized.codex_surface.plugin_id, 'med-autoscience');
  assert.deepEqual(normalized.codex_surface.required_skill_ids, ['med-autoscience', 'mas-scholar-skills']);
  assert.equal(normalized.package_core, null);
  assert.equal(normalized.distribution_payload, null);
  assert.deepEqual(normalized.carrier_adapters, []);
  assert.equal(canonicalAgentPackageId('obf'), 'opl-bookforge');
});

test('MAS first-party agent package manifest fails closed for unsafe dependency declarations', () => {
  const manifest = parseJsonText(fs.readFileSync(
    path.join(repoRoot, 'contracts/opl-framework/agent-packages/mas.json'),
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
    medautoscience: createGitModuleRemoteFixture('med-autoscience'),
    medautogrant: createGitModuleRemoteFixture('med-autogrant'),
    redcube: createGitModuleRemoteFixture('redcube-ai'),
    oplmetaagent: createGitModuleRemoteFixture('opl-meta-agent'),
    oplbookforge: createGitModuleRemoteFixture('opl-bookforge'),
    scholarskills: createGitModuleRemoteFixture('mas-scholar-skills'),
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
    OPL_MODULE_PATH_MEDAUTOGRANT: fixtures.medautogrant.sourceRoot,
    OPL_MODULE_PATH_REDCUBE: fixtures.redcube.sourceRoot,
    OPL_MODULE_PATH_OPLMETAAGENT: fixtures.oplmetaagent.sourceRoot,
    OPL_MODULE_PATH_OPLBOOKFORGE: fixtures.oplbookforge.sourceRoot,
    OPL_MODULE_PATH_SCHOLARSKILLS: fixtures.scholarskills.sourceRoot,
  };

  execFileSync(process.execPath, [
    '--experimental-strip-types',
    path.join(repoRoot, 'scripts/package-module-archives.mjs'),
    '--version',
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
    path.join(repoRoot, 'scripts/package-module-archives.mjs'),
    '--version',
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
  assert.equal(manifest.packages.modules.medautoscience.source_git.head_sha, advancedHead);
});

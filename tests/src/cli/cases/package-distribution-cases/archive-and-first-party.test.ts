import crypto from 'node:crypto';
import { gt } from 'semver';

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
  normalizePackageManifest,
  normalizeWorkflowProfilePackageManifest,
} from '../../../../../src/adapters/integration/agent-package-registry-parts/manifest-normalizers.ts';
import {
  getPublicationAdmittedOplPackageSpecs,
} from '../../../../../src/adapters/integration/package-distribution.ts';

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
  const appOwnedWeixin = repoName === 'one-person-lab-app' && packageId === 'opl-channel-weixin';
  const pluginRoot = appOwnedWeixin
    ? 'packages/opl-channel-weixin'
    : kind === 'standard_agent'
    || repoName === 'opl-relay'
    || repoName === 'opl-persona'
    || repoName === 'opl-fleet-agent'
    ? `plugins/${repoName}`
    : '.';
  const manifestRef = appOwnedWeixin
    ? `${pluginRoot}/opl-package.json`
    : kind === 'capability_package'
      ? pluginRoot === '.'
        ? 'contracts/opl_capability_package_manifest.json'
        : `${pluginRoot}/opl-package.json`
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
    [`${pluginRoot}/.codex-plugin/plugin.json`.replace(/^\.\//, '')]: `${JSON.stringify({
      name: appOwnedWeixin ? packageId : repoName,
      version: ownerVersion,
    }, null, 2)}\n`,
  };
  if (kind === 'standard_agent' || repoName === 'opl-fleet-agent') {
    extraFiles[`${pluginRoot}/plugin.json`] = `${JSON.stringify({
      $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
      name: repoName,
      version: ownerVersion,
    }, null, 2)}\n`;
  }
  if (repoName === 'med-autoscience' || repoName === 'med-autogrant') {
    extraFiles['pyproject.toml'] = `[project]\nname = "${repoName}"\nversion = "${ownerVersion}"\n`;
  } else if (kind === 'standard_agent') {
    extraFiles['package.json'] = `${JSON.stringify({ name: repoName, version: ownerVersion }, null, 2)}\n`;
  }
  return {
    ...createGitModuleRemoteFixture(repoName, { extraFiles }),
    packageId,
    packageVersion: ownerVersion,
  };
}

function createFrozenFrameworkFixture(version: string) {
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-frozen-framework-'));
  const files: Record<string, string> = {
    'package.json': `${JSON.stringify({
      name: 'one-person-lab',
      version,
      workspaces: ['packages/*'],
      files: [
        'bin',
        'dist',
        'contracts/opl-framework',
        'packages/cordis-abi/package.json',
        'packages/cordis-abi/dist',
        'packages/cordis-abi/contracts',
        'packages/package-host/package.json',
        'packages/package-host/dist',
        'packages/package-host/contracts',
      ],
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
    'packages/cordis-abi/package.json': `${JSON.stringify({
      name: '@one-person-lab/cordis-abi',
      version: '0.1.0',
    }, null, 2)}\n`,
    'packages/cordis-abi/dist/index.js': 'export {};\n',
    'packages/cordis-abi/contracts/fixture.json': '{}\n',
    'packages/cordis-abi/src/index.ts': 'export {};\n',
    'packages/package-host/package.json': `${JSON.stringify({
      name: '@one-person-lab/package-host',
      version: '0.1.0',
    }, null, 2)}\n`,
    'packages/package-host/dist/index.js': 'export {};\n',
    'packages/package-host/contracts/fixture.json': '{}\n',
    'packages/package-host/src/index.ts': 'export {};\n',
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

function addFrameworkPackageProjections(
  sourceRoot: string,
  fixtures: Record<string, ReturnType<typeof createOwnerPackageFixture>>,
) {
  for (const spec of getPublicationAdmittedOplPackageSpecs()) {
    const fixture = Object.values(fixtures).find((candidate) => candidate.packageId === spec.package_id);
    assert.ok(fixture);
    const sourceCommit = fixture.getHeadSha();
    assert.match(sourceCommit, /^[0-9a-f]{40}$/);
    const canonicalManifestPath = path.join(repoRoot, spec.package_manifest_ref);
    const projectedManifest = parseJsonText(
      fs.readFileSync(canonicalManifestPath, 'utf8'),
    ) as Record<string, any>;
    const canonicalPayloadRef = projectedManifest.codex_surface.plugin_payload_manifest_url;
    const projectedPayload = parseJsonText(fs.readFileSync(
      path.join(path.dirname(canonicalManifestPath), canonicalPayloadRef),
      'utf8',
    )) as Record<string, any>;
    const payloadRef = `payloads/${spec.package_id}-${fixture.packageVersion}.json`;
    const target = path.join(sourceRoot, spec.package_manifest_ref);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${JSON.stringify({
      ...projectedManifest,
      version: fixture.packageVersion,
      codex_surface: {
        ...projectedManifest.codex_surface,
        carrier_source_commit: sourceCommit,
        plugin_payload_manifest_url: payloadRef,
      },
    }, null, 2)}\n`, 'utf8');
    const payloadTarget = path.join(path.dirname(target), payloadRef);
    fs.mkdirSync(path.dirname(payloadTarget), { recursive: true });
    fs.writeFileSync(payloadTarget, `${JSON.stringify({
      ...projectedPayload,
      package_version: fixture.packageVersion,
      source_commit: sourceCommit,
      files: projectedPayload.files.map((file: Record<string, unknown>) => ({
        ...file,
        source_url: typeof file.source_url === 'string'
          ? file.source_url.replace(/\/[0-9a-f]{40}\//, `/${sourceCommit}/`)
          : file.source_url,
      })),
    }, null, 2)}\n`, 'utf8');
  }
  execFileSync('git', ['add', '--all'], { cwd: sourceRoot, encoding: 'utf8' });
  execFileSync('git', ['-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Add Package projections'], {
    cwd: sourceRoot,
    encoding: 'utf8',
  });
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: sourceRoot, encoding: 'utf8' }).trim();
}

test('App component resolver canonicalizes a Draft alias without weakening immutable asset locks', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-component-'));
  const releasePath = path.join(root, 'release.json');
  const ownerPath = path.join(root, 'owner.json');
  const outputPath = path.join(root, 'resolved.json');
  const version = '26.7.18';
  const tag = `v${version}`;
  const repo = 'gaofeng21cn/one-person-lab-app';
  const alias = 'untagged-fdc466c0e1f7f719bfd8';
  const names = [
    'latest-arm64-mac.yml',
    `One-Person-Lab-${version}-mac-arm64.dmg`,
    `One-Person-Lab-${version}-mac-arm64.zip`,
    `One-Person-Lab-${version}-mac-arm64.zip.blockmap`,
    'standard-local-authorization-policy.json',
  ];
  const releaseAssets = names.map((name, index) => ({
    name,
    url: `https://github.com/${repo}/releases/download/${tag}/${name}`,
    digest: `sha256:${String(index + 1).repeat(64)}`,
    size: index + 1,
    contentType: 'application/octet-stream',
  }));
  const ownerArtifacts = releaseAssets.map((asset) => ({
    name: asset.name,
    ref: asset.url.replace(`/download/${tag}/`, `/download/${alias}/`),
    digest: asset.digest,
    size: asset.size,
    content_type: asset.contentType,
  }));
  const ownerCore = {
    surface_kind: 'opl_app_component_manifest.v1',
    component_id: 'opl-app',
    version,
    source_commit: 'b'.repeat(40),
    release_tag: tag,
    release_url: `https://github.com/${repo}/releases/tag/${alias}`,
    primary_artifact: ownerArtifacts[1],
    artifacts: [...ownerArtifacts].sort((left, right) => left.name.localeCompare(right.name)),
    component_manifest_ref: `https://github.com/${repo}/releases/download/${tag}/opl-app-component-manifest.json`,
  };
  const owner = {
    ...ownerCore,
    component_manifest_digest: `sha256:${crypto.createHash('sha256').update(JSON.stringify(ownerCore)).digest('hex')}`,
  };
  fs.writeFileSync(releasePath, `${JSON.stringify({
    tagName: tag,
    isDraft: false,
    isPrerelease: false,
    url: `https://github.com/${repo}/releases/tag/${tag}`,
    assets: releaseAssets,
  }, null, 2)}\n`);
  fs.writeFileSync(ownerPath, `${JSON.stringify(owner, null, 2)}\n`);

  const resolve = () => execFileSync(process.execPath, [
    path.join(repoRoot, 'scripts/resolve-opl-app-component.mjs'),
    '--release-json', releasePath,
    '--source-commit', owner.source_commit,
    '--owner-manifest', ownerPath,
    '--output', outputPath,
  ], { encoding: 'utf8' });
  resolve();
  const resolved = parseJsonText(fs.readFileSync(outputPath, 'utf8')) as Record<string, any>;
  assert.equal(resolved.release_status, 'published');
  assert.equal(resolved.primary_artifact.ref, releaseAssets[1]!.url);
  assert.notEqual(resolved.component_manifest_digest, owner.component_manifest_digest);

  const tampered = structuredClone(owner);
  tampered.artifacts[0].digest = `sha256:${'f'.repeat(64)}`;
  fs.writeFileSync(ownerPath, `${JSON.stringify(tampered, null, 2)}\n`);
  assert.throws(resolve, /owner manifest digest does not bind its exact core/);

  const wrongRepo = structuredClone(owner);
  wrongRepo.release_url = wrongRepo.release_url.replace(repo, 'other/repo');
  wrongRepo.component_manifest_digest = `sha256:${crypto.createHash('sha256').update(JSON.stringify({
    ...ownerCore,
    release_url: wrongRepo.release_url,
  })).digest('hex')}`;
  fs.writeFileSync(ownerPath, `${JSON.stringify(wrongRepo, null, 2)}\n`);
  assert.throws(resolve, /does not bind the exact repository/);
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
  assert.equal(manifest.schema_ref, 'contracts/opl-framework/agent-package-manifest.schema.json');
  assert.equal(manifest.package_id, 'mas');
  assert.equal(manifest.agent_id, 'mas');
  assert.equal(manifest.carrier_source_role, 'codex_plugin_default_carrier_not_package_truth');
  assert.equal(schema.required.includes('distribution_payload'), false);
  assert.equal(schema.properties.distribution_payload.properties.install_truth.const, 'resolved_digest_lock');
  assert.equal(schema.properties.distribution_payload.properties.payload_digest_ref.pattern, '^sha256:[0-9a-f]{64}$');
  assert.equal(manifest.package_core.core_kind, 'opl_agent_package_core');
  assert.equal(manifest.package_core.dependency_source, 'manifest_declared_capability_dependencies');
  assert.equal(manifest.carrier_adapters[0].carrier, 'codex_plugin');
  assert.equal(manifest.carrier_adapters[0].owns_package_core, false);
  assert.equal(schema.properties.capability_dependencies.items.required.includes('codex_distribution'), false);
  assert.equal(schema.properties.capability_dependencies.items.required.includes('install_owner'), false);
  assert.equal(schema.properties.capability_dependencies.items.required.includes('sync_scopes'), false);
  assert.equal(schema.properties.codex_surface.properties.plugin_payload_manifest_url.type, 'string');
  assert.equal(schema.properties.codex_surface.properties.carrier_source_commit.pattern, '^[0-9a-f]{40}$');
  assert.equal(schema.properties.codex_surface.required.includes('carrier_source_commit'), false);
  assert.equal(schema.properties.package_core.properties.core_kind.const, 'opl_agent_package_core');
  assert.equal(schema.properties.carrier_adapters.items.properties.carrier.const, 'codex_plugin');
  assert.deepEqual(manifest.presentation, {
    display_name_i18n: {
      'zh-CN': 'Med Auto Science',
      'en-US': 'Med Auto Science',
    },
    description_i18n: {
      'zh-CN': '医学研究选题、文献分析、数据分析、论文写作、审稿、返修与投稿。',
      'en-US': 'Medical research planning, literature review, data analysis, manuscript writing, peer review, revision, and submission.',
    },
    session_routing_summary_i18n: {
      'zh-CN': '科研、论文、数据分析、审稿、返修和投稿',
      'en-US': 'research, papers, data analysis, peer review, revision, and submission',
    },
    home_shortcuts: [{
      shortcut_id: 'research',
      label_i18n: {
        'zh-CN': '开展科研工作',
        'en-US': 'Research',
      },
      default_visible: true,
      user_configurable: true,
      route: {
        route_kind: 'agent_package_shortcut',
        executor: 'codex_cli',
        codex_visible_entry: 'med-autoscience',
      },
    }],
  });
  assert.deepEqual(manifests.oma.presentation, {
    display_name_i18n: {
      'en-US': 'OPL Meta Agent',
      'zh-CN': 'OPL Meta Agent',
    },
    description_i18n: {
      'en-US': 'OPL agent design, review, takeover, and evolution.',
      'zh-CN': 'OPL 智能体的设计、评审、接管与演进。',
    },
    session_routing_summary_i18n: {
      'en-US': 'Create, take over, or improve an Agent through OPL Foundry.',
      'zh-CN': '通过 OPL Foundry 创建、接管或改进智能体。',
    },
    home_shortcuts: [{
      shortcut_id: 'engineer-agent',
      label_i18n: {
        'en-US': 'Engineer Agent',
        'zh-CN': '构建与迭代智能体',
      },
      default_visible: true,
      user_configurable: true,
      route: {
        route_kind: 'agent_package_shortcut',
        executor: 'codex_cli',
        codex_visible_entry: 'opl-meta-agent',
      },
    }],
  });
  const expectedBrandNames: Record<string, string> = {
    mag: 'Med Auto Grant',
    mas: 'Med Auto Science',
    obf: 'OPL Book Forge',
    oma: 'OPL Meta Agent',
    rca: 'RedCube AI',
  };
  Object.values(manifests).forEach((sourceManifest) => {
    assert.equal(sourceManifest.presentation.display_name_i18n['en-US'], expectedBrandNames[sourceManifest.package_id]);
    assert.equal(sourceManifest.presentation.display_name_i18n['zh-CN'], expectedBrandNames[sourceManifest.package_id]);
    assert.equal(typeof sourceManifest.presentation.description_i18n['en-US'], 'string');
    assert.equal(typeof sourceManifest.presentation.description_i18n['zh-CN'], 'string');
  });
  assert.deepEqual(manifest.codex_surface.required_skill_ids, ['med-autoscience']);
  assert.deepEqual(manifest.codex_surface.required_capability_package_ids, ['mas-scholar-skills']);
  assert.equal(Object.hasOwn(manifest.codex_surface, 'bundled_capability_package_ids'), false);
  assert.equal(manifests.mag.codex_surface.standalone_distribution, 'repo_carrier_source');
  assert.equal(manifests.rca.codex_surface.standalone_distribution, 'repo_carrier_source');
  assert.equal(manifests.oma.codex_surface.standalone_distribution, 'repo_carrier_source');
  assert.equal(manifests.obf.codex_surface.standalone_distribution, 'generated_carrier_surface');
  assert.deepEqual(
    [manifests.mas, manifests.mag].map((sourceManifest) => ({
      package_id: sourceManifest.package_id,
      required: sourceManifest.capability_dependencies[0].required,
      dependency_kind: sourceManifest.capability_dependencies[0].dependency_kind,
      consumer_profile_id: sourceManifest.capability_dependencies[0].consumer_profile_id,
    })),
    [
      {
        package_id: 'mas',
        required: true,
        dependency_kind: undefined,
        consumer_profile_id: undefined,
      },
      {
        package_id: 'mag',
        required: true,
        dependency_kind: 'hard_runtime_dependency',
        consumer_profile_id: 'mag-medical-grant.v1',
      },
    ],
  );
  assert.deepEqual(manifests.rca.capability_dependencies, []);
  Object.values(manifests).forEach((sourceManifest) => {
    const payloadRef = sourceManifest.codex_surface.plugin_payload_manifest_url;
    assert.match(payloadRef, /^payloads\/[a-z0-9.-]+\.json$/);
    const payload = parseJsonText(fs.readFileSync(
      path.join(repoRoot, 'contracts/opl-framework/packages', payloadRef),
      'utf8',
    )) as Record<string, any>;
    assert.equal(payload.package_id, sourceManifest.package_id);
    assert.equal(payload.package_version, sourceManifest.version);
    assert.equal(payload.source_commit, sourceManifest.codex_surface.carrier_source_commit);
    assert.equal(payload.files.some((entry: Record<string, any>) => entry.path === '.codex-plugin/plugin.json'), true);
    assert.equal(payload.files.some((entry: Record<string, any>) => entry.path === 'opl-package.json'), true);
    assert.equal(payload.files.some((entry: Record<string, any>) => entry.path === `skills/${sourceManifest.codex_surface.plugin_id}/SKILL.md`), true);
    assert.equal(payload.files.every((entry: Record<string, any>) => /^sha256:[0-9a-f]{64}$/.test(entry.sha256)), true);
    assert.equal(Object.hasOwn(sourceManifest, 'distribution_payload'), false);
    assert.doesNotThrow(() => assertJsonSchemaPayload({
      schemaId: schema.$id,
      schema,
      sourceRef: 'contracts/opl-framework/agent-package-manifest.schema.json',
    }, sourceManifest));
    const normalized = normalizeFirstPartyAgentPackageManifest(sourceManifest);
    assert.equal(normalized.distribution_payload, null);
    assert.deepEqual(normalized.presentation, sourceManifest.presentation ?? null);
  });
  assert.deepEqual(
    ['mag', 'rca', 'obf'].map((packageId) => manifests[packageId].presentation?.home_shortcuts[0].route),
    [
      {
        route_kind: 'agent_package_shortcut',
        executor: 'codex_cli',
        codex_visible_entry: 'med-autogrant',
      },
      {
        route_kind: 'agent_package_shortcut',
        executor: 'codex_cli',
        codex_visible_entry: 'redcube-ai',
      },
      {
        route_kind: 'agent_package_shortcut',
        executor: 'codex_cli',
        codex_visible_entry: 'opl-bookforge',
      },
    ],
  );
  assert.equal(manifest.opl_managed_surface.package_shape, 'thin_agent_package');
  assert.equal(manifest.opl_managed_surface.dependency_resolution, 'managed_dependency_graph');
  assert.deepEqual(
    manifest.capability_dependencies.map((dependency: Record<string, any>) => ({
      module_id: dependency.module_id,
      package_id: dependency.package_id,
      required: dependency.required,
      capability_abi: dependency.capability_abi,
    })),
    [
      {
        module_id: 'scholarskills',
        package_id: 'mas-scholar-skills',
        required: true,
        capability_abi: 'mas-scholar-skills.v1',
      },
    ],
  );
  assert.deepEqual(
    Object.fromEntries(
      ['mag', 'mas', 'obf', 'oma', 'rca'].map((packageId) => [
        packageId,
        manifests[packageId].presentation?.home_shortcuts[0].label_i18n['zh-CN'],
      ]),
    ),
    {
      mag: '开展基金申请工作',
      mas: '开展科研工作',
      obf: '规划书稿结构',
      oma: '构建与迭代智能体',
      rca: '制作视觉交付物',
    },
  );
});

test('static first-party presentation is optional without weakening manifest validation', () => {
  const manifest = parseJsonText(fs.readFileSync(
    path.join(repoRoot, 'contracts/opl-framework/packages/mag.json'),
    'utf8',
  )) as Record<string, any>;
  const invalidPresentation = {
    ...manifest,
    presentation: {
      ...manifest.presentation,
      home_shortcuts: [
        ...manifest.presentation.home_shortcuts,
        manifest.presentation.home_shortcuts[0],
      ],
    },
  };
  assert.equal(normalizeFirstPartyAgentPackageManifest(invalidPresentation).presentation, null);
  assert.throws(
    () => normalizeFirstPartyAgentPackageManifest({
      ...invalidPresentation,
      agent_id: 'med-autogrant',
    }),
    /canonical id/,
  );
  assert.throws(
    () => normalizeFirstPartyAgentPackageManifest({
      ...invalidPresentation,
      package_role: 'workflow_profile',
    }),
    /incompatible package role/,
  );
  assert.throws(
    () => normalizeFirstPartyAgentPackageManifest({
      ...invalidPresentation,
      version: '',
    }),
    /version/,
  );
});

test('home shortcut icon_id is preserved when valid and rejected when malformed', () => {
  const schema = parseJsonText(fs.readFileSync(
    path.join(repoRoot, 'contracts/opl-framework/agent-package-manifest.schema.json'),
    'utf8',
  )) as Record<string, any>;
  const manifest = parseJsonText(fs.readFileSync(
    path.join(repoRoot, 'contracts/opl-framework/packages/mas.json'),
    'utf8',
  )) as Record<string, any>;
  const withIcon = {
    ...manifest,
    presentation: {
      ...manifest.presentation,
      home_shortcuts: manifest.presentation.home_shortcuts.map((shortcut: Record<string, unknown>) => ({
        ...shortcut,
        icon_id: 'agent.preset_16',
      })),
    },
  };
  assert.doesNotThrow(() => assertJsonSchemaPayload({
    schemaId: schema.$id,
    schema,
    sourceRef: 'contracts/opl-framework/agent-package-manifest.schema.json',
  }, withIcon));
  assert.equal(
    normalizeFirstPartyAgentPackageManifest(withIcon).presentation?.home_shortcuts[0].icon_id,
    'agent.preset_16',
  );

  for (const iconId of ['', 'agent/icon', '1agent', 'a'.repeat(129)]) {
    const malformed = {
      ...withIcon,
      presentation: {
        ...withIcon.presentation,
        home_shortcuts: withIcon.presentation.home_shortcuts.map((shortcut: Record<string, unknown>) => ({
          ...shortcut,
          icon_id: iconId,
        })),
      },
    };
    assert.throws(
      () => normalizePackageManifest(malformed, 'framework://contracts/opl-framework/packages/mas.json'),
      /icon id is invalid/,
      iconId,
    );
  }
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
  assert.equal(manifest.package_role, 'capability_package');
  assert.equal(normalized.package_role, 'capability_package');
  const frameworkRoleManifest = {
    ...manifest,
    package_role: 'framework_capability_package',
  };
  assert.doesNotThrow(() => assertJsonSchemaPayload({
    schemaId: schema.$id,
    schema,
    sourceRef: 'contracts/opl-framework/capability-package-manifest.schema.json',
  }, frameworkRoleManifest));
  assert.equal(
    normalizeCapabilityPackageManifest(frameworkRoleManifest, manifestPath).package_role,
    'capability_package',
  );
  assert.deepEqual(
    manifest.consumer_profiles.map((profile: Record<string, any>) => ({
      profile_id: profile.profile_id,
      consumer_agent_id: profile.consumer_agent_id,
    })),
    [
      { profile_id: 'mas-medical-paper.v1', consumer_agent_id: 'mas' },
      { profile_id: 'mag-medical-grant.v1', consumer_agent_id: 'mag' },
    ],
  );
  assert.throws(
    () => normalizeCapabilityPackageManifest({
      ...manifest,
      package_role: 'optional_agent_capability_package',
    }, manifestPath),
    /package_role must identify a Framework capability package/,
  );
  const payloadPath = path.join(path.dirname(manifestPath), manifest.codex_surface.plugin_payload_manifest_url);
  const payload = parseJsonText(fs.readFileSync(payloadPath, 'utf8')) as Record<string, any>;
  const publicationProjectionOrder = manifest.publication_projection_order;
  const publicationSource = manifest.publication_source;
  const compatibilityProjection = manifest.compatibility_projection;
  assert.equal(publicationProjectionOrder, 60);
  assert.equal(publicationSource.module_id, 'scholarskills');
  assert.equal(compatibilityProjection.registry_short_label, 'ScholarSkills');
  assert.equal(manifest.version, '0.2.31');
  assert.deepEqual(manifest.consumer_policy.supported_required_by, ['mas', 'mag']);
  assert.equal(manifest.consumer_policy.supported_optional_consumer_agent_ids, undefined);
  assert.equal(manifest.content_lock.canonicalization, 'ordered_path_length_file_length_bytes');
  assert.equal(manifest.content_lock.digest, payload.content_lock.digest);
  assert.equal(manifest.codex_surface.carrier_source_commit, payload.source_commit);
  assert.equal(normalized.required_skill_ids.length, 36);
  assert.deepEqual(
    normalized.configured_codex_plugin_carrier?.executor.requiredSkillIds,
    ['mas-scholar-skills'],
  );
  assert.equal(normalized.capability_provider?.module_export_ids.length, 10);
  assert.equal(normalized.capability_provider?.exports.filter((entry) => entry.install_mode === 'core_required').length, 11);
  assert.equal(normalized.capability_provider?.exports.filter((entry) => entry.install_mode !== 'core_required').length, 25);
  assert.equal(normalized.optional_skill_refs.length, 1);
  assert.equal(payload.package_id, manifest.package_id);
  assert.equal(payload.package_version, manifest.version);
  assert.equal(payload.source_commit, manifest.codex_surface.carrier_source_commit);
  const payloadPaths = payload.files.map((entry: Record<string, any>) => entry.path);
  assert.equal(payloadPaths.filter((filePath: string) => filePath === 'opl-package.json').length, 1);
  assert.deepEqual(
    payloadPaths.filter((filePath: string) => filePath !== 'opl-package.json').sort(),
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
  assert.equal(manifest.version, payload.package_version);
  assert.equal(manifest.codex_surface.carrier_source_commit, payload.source_commit);
  assert.deepEqual(manifest.codex_surface.configured_codex_plugin_carrier, {
    kind: 'codex_plugin_manager',
    plugin_selector: 'opl-flow@opl-flow',
    executor_route: 'codex_cli',
    marketplace_source: 'gaofeng21cn/opl-flow',
    publication_ref: 'ghcr.io/gaofeng21cn/one-person-lab-packages/opl-flow:latest-stable',
  });
  assert.deepEqual(manifest.codex_surface.required_skill_ids, [
    'opl-flow',
    'software-development',
    'manage-codex-tasks',
  ]);
  assert.equal(schema.properties.codex_surface.required.includes('carrier_source_commit'), false);
  assert.equal(Object.hasOwn(manifest, 'agent_id'), false);
  assert.equal(normalized.agent_id, null);
  assert.equal(normalized.profile_surface?.existing_profile_policy, 'semantic_merge_required');
  assert.equal(payload.surface_kind, 'opl_package_payload_manifest.v2');
  assert.match(payload.source_commit, /^[0-9a-f]{40}$/);
  assert.equal(payload.files.some((file: Record<string, unknown>) => file.path === 'opl-package.json'), true);
  const allowlist = parseJsonText(fs.readFileSync(
    path.join(repoRoot, 'contracts/opl-framework/package-payload-allowlists/opl-flow.json'),
    'utf8',
  )) as Record<string, any>;
  assert.deepEqual(
    payload.files.map((file: Record<string, unknown>) => file.path),
    allowlist.paths,
  );
  for (const requiredPath of [
    'contracts/fleet-telemetry-protocol.json',
    'contracts/fleet-telemetry-protocol.schema.json',
    'contracts/workflow-policy.json',
    'contracts/workflow-policy.schema.json',
    'scripts/opl_fleet.py',
  ]) {
    assert.equal(
      payload.files.some((file: Record<string, unknown>) => file.path === requiredPath),
      true,
      requiredPath,
    );
  }
  for (const skillId of manifest.codex_surface.required_skill_ids) {
    assert.equal(
      payload.files.some((file: Record<string, unknown>) => file.path === `skills/${skillId}/SKILL.md`),
      true,
      skillId,
    );
  }
  assert.equal(
    payload.files.some((file: Record<string, unknown>) => String(file.path).startsWith('optional-skills/codex-ops-kit/')),
    false,
  );
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
        kind: 'capability_package',
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

test('first-party Package descriptors do not resurrect Framework-owned lock authority', () => {
  const schema = parseJsonText(fs.readFileSync(
    path.join(repoRoot, 'contracts/opl-framework/agent-package-manifest.schema.json'),
    'utf8',
  )) as Record<string, any>;
  const packageCoreSchema = schema.properties.package_core;

  assert.equal(packageCoreSchema.required.includes('lock_owner'), false);
  assert.equal(Object.hasOwn(packageCoreSchema.properties, 'lock_owner'), false);
  assert.equal(packageCoreSchema.properties.content_identity_fields.minItems, 3);
  assert.equal(
    packageCoreSchema.properties.content_identity_fields.items.enum.includes('package_lock_ref'),
    false,
  );

  const packageDirectory = path.join(repoRoot, 'contracts/opl-framework/packages');
  const descriptors = fs.readdirSync(packageDirectory)
    .filter((fileName) => fileName.endsWith('.json'))
    .map((fileName) => ({
      fileName,
      manifest: parseJsonText(fs.readFileSync(path.join(packageDirectory, fileName), 'utf8')) as Record<string, any>,
    }))
    .filter(({ manifest }) => manifest.package_core?.core_kind === 'opl_agent_package_core');

  assert.equal(descriptors.length > 0, true);
  for (const { fileName, manifest } of descriptors) {
    assert.equal(Object.hasOwn(manifest.package_core, 'lock_owner'), false, fileName);
    assert.equal(manifest.package_core.content_identity_fields.includes('package_lock_ref'), false, fileName);
  }
});

test('bundled Full MAS source projection advances to the immutable ordinary package version', () => {
  const frozenRef = 'packages/mas-0.2.25.json';
  const frozenPath = path.join(repoRoot, 'contracts/opl-framework', frozenRef);
  const frozenBytes = fs.readFileSync(frozenPath);
  const frozenManifest = parseJsonText(frozenBytes.toString('utf8')) as Record<string, any>;
  const priorOrdinaryBytes = fs.readFileSync(
    path.join(repoRoot, 'contracts/opl-framework/packages/mas-0.2.20.json'),
  );
  const priorOrdinaryManifest = parseJsonText(
    priorOrdinaryBytes.toString('utf8'),
  ) as Record<string, any>;
  const ordinaryManifest = parseJsonText(fs.readFileSync(
    path.join(repoRoot, 'contracts/opl-framework/packages/mas.json'),
    'utf8',
  )) as Record<string, any>;

  assert.equal(crypto.createHash('sha256').update(frozenBytes).digest('hex'),
    'f4849199eb950dc9590a4f8f5119587d91123b8a1655491d223a3b711c1d5bf3');
  assert.equal(frozenManifest.version, '0.2.25');
  assert.equal(frozenManifest.codex_surface.plugin_payload_manifest_url, 'payloads/mas-0.2.25.json');
  assert.equal(crypto.createHash('sha256').update(priorOrdinaryBytes).digest('hex'),
    'd2ec1d23c37c337b96b18601071ca09be89c43946971e87b3aba8c759107df6e');
  assert.equal(priorOrdinaryManifest.version, '0.2.20');
  assert.equal(priorOrdinaryManifest.codex_surface.plugin_payload_manifest_url, 'payloads/mas-0.2.20.json');
  assert.equal(gt(ordinaryManifest.version, frozenManifest.version), true);
});

test('bundled Full MAG source projection advances to the immutable ordinary package version', () => {
  const frozenRef = 'packages/mag-0.3.11.json';
  const frozenPath = path.join(repoRoot, 'contracts/opl-framework', frozenRef);
  const frozenBytes = fs.readFileSync(frozenPath);
  const frozenManifest = parseJsonText(frozenBytes.toString('utf8')) as Record<string, any>;
  const ordinaryManifest = parseJsonText(fs.readFileSync(
    path.join(repoRoot, 'contracts/opl-framework/packages/mag.json'),
    'utf8',
  )) as Record<string, any>;

  assert.equal(crypto.createHash('sha256').update(frozenBytes).digest('hex'),
    'a03d62d7cd3b053e6134963250614305fa2c591193c7bbc28ae5ceed2024201b');
  assert.equal(frozenManifest.version, '0.3.11');
  assert.equal(frozenManifest.codex_surface.plugin_payload_manifest_url, 'payloads/mag-0.3.11.json');
  assert.equal(gt(ordinaryManifest.version, frozenManifest.version), true);
});

test('bundled Full RCA source projection advances to the immutable ordinary package version', () => {
  const frozenRef = 'packages/rca-0.2.13.json';
  const frozenPath = path.join(repoRoot, 'contracts/opl-framework', frozenRef);
  const frozenBytes = fs.readFileSync(frozenPath);
  const frozenManifest = parseJsonText(frozenBytes.toString('utf8')) as Record<string, any>;
  const ordinaryManifest = parseJsonText(fs.readFileSync(
    path.join(repoRoot, 'contracts/opl-framework/packages/rca.json'),
    'utf8',
  )) as Record<string, any>;

  assert.equal(crypto.createHash('sha256').update(frozenBytes).digest('hex'),
    '8d638fd1c7555dc8d805ca3dbbdd5c5cd287b651ed68c9394bd2dc16d17f9c83');
  assert.equal(frozenManifest.version, '0.2.13');
  assert.equal(frozenManifest.codex_surface.plugin_payload_manifest_url, 'payloads/rca-0.2.13.json');
  assert.equal(gt(ordinaryManifest.version, frozenManifest.version), true);
});

test('bundled Full OMA source projection advances independently of ordinary publication', () => {
  const frozenRef = 'packages/oma-0.4.7.json';
  const frozenPath = path.join(repoRoot, 'contracts/opl-framework', frozenRef);
  const frozenBytes = fs.readFileSync(frozenPath);
  const frozenManifest = parseJsonText(frozenBytes.toString('utf8')) as Record<string, any>;
  const ordinaryManifest = parseJsonText(fs.readFileSync(
    path.join(repoRoot, 'contracts/opl-framework/packages/oma.json'),
    'utf8',
  )) as Record<string, any>;

  assert.equal(crypto.createHash('sha256').update(frozenBytes).digest('hex'),
    '951d10cf5c57693c8a2f3f92f1981ff4b42d8a51783fc6c597564bec2e3b1617');
  assert.equal(frozenManifest.version, '0.4.7');
  assert.equal(frozenManifest.codex_surface.plugin_payload_manifest_url, 'payloads/oma-0.4.7.json');
  assert.equal(gt(ordinaryManifest.version, frozenManifest.version), true);
});

test('bundled Full OBF source projection advances independently of ordinary publication', () => {
  const frozenRef = 'packages/obf-0.3.9.json';
  const frozenPath = path.join(repoRoot, 'contracts/opl-framework', frozenRef);
  const frozenBytes = fs.readFileSync(frozenPath);
  const frozenManifest = parseJsonText(frozenBytes.toString('utf8')) as Record<string, any>;
  const ordinaryManifest = parseJsonText(fs.readFileSync(
    path.join(repoRoot, 'contracts/opl-framework/packages/obf.json'),
    'utf8',
  )) as Record<string, any>;

  assert.equal(crypto.createHash('sha256').update(frozenBytes).digest('hex'),
    '87dbc954cf83a4b25903c84257a0088d06d52170b19f00b8ec5631f59f8659c4');
  assert.equal(frozenManifest.version, '0.3.9');
  assert.equal(frozenManifest.codex_surface.plugin_payload_manifest_url, 'payloads/obf-0.3.9.json');
  assert.equal(gt(ordinaryManifest.version, frozenManifest.version), true);
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
  assert.equal(
    normalizeFirstPartyAgentPackageManifest(manifest)
      .capability_dependencies[0].dependency_kind,
    'hard_runtime_dependency',
  );
  assert.equal(
    normalizeFirstPartyAgentPackageManifest(manifest)
      .capability_dependencies[0].kind,
    'capability_package',
  );
  const minimalManifest = structuredClone(manifest);
  minimalManifest.capability_dependencies = [{
    module_id: 'scholarskills',
    package_id: 'mas-scholar-skills',
    required: true,
    capability_abi: 'mas-scholar-skills.v1',
    required_export_ids: manifest.capability_dependencies[0].required_export_ids,
    required_module_ids: manifest.capability_dependencies[0].required_module_ids,
    authority_boundary: manifest.capability_dependencies[0].authority_boundary,
  }];
  assert.deepEqual(
    normalizeFirstPartyAgentPackageManifest(minimalManifest)
      .capability_dependencies.map((dependency) => ({
        kind: dependency.kind,
        dependency_kind: dependency.dependency_kind,
        version_requirement: dependency.version_requirement,
      })),
    [{
      kind: 'capability_package',
      dependency_kind: 'hard_runtime_dependency',
      version_requirement: '*',
    }],
  );
  assert.deepEqual(
    normalizePackageManifest(minimalManifest, 'file:///tmp/minimal-agent-package.json')
      .capability_dependencies.map((dependency) => ({
        dependency_kind: dependency.dependency_kind,
        version_requirement: dependency.version_requirement,
      })),
    [{ dependency_kind: 'hard_runtime_dependency', version_requirement: '*' }],
  );
  const legacyDependencyKindManifest = structuredClone(manifest);
  legacyDependencyKindManifest.capability_dependencies[0].kind = 'framework_capability_package';
  assert.equal(
    normalizeFirstPartyAgentPackageManifest(legacyDependencyKindManifest)
      .capability_dependencies[0].kind,
    'framework_capability_package',
  );
  const optionalManifest = structuredClone(manifest);
  delete optionalManifest.distribution_payload;
  optionalManifest.capability_dependencies = [{
    ...manifest.capability_dependencies[0],
    required: false,
    dependency_kind: 'optional_enhancement',
  }];
  assert.deepEqual(
    normalizeFirstPartyAgentPackageManifest(optionalManifest)
      .capability_dependencies.map((dependency) => ({
        required: dependency.required,
        dependency_kind: dependency.dependency_kind,
      })),
    [{ required: false, dependency_kind: 'optional_enhancement' }],
  );
  assert.deepEqual(
    normalizePackageManifest(optionalManifest, 'file:///tmp/optional-agent-package.json')
      .capability_dependencies.map((dependency) => ({
        required: dependency.required,
        dependency_kind: dependency.dependency_kind,
      })),
    [{ required: false, dependency_kind: 'optional_enhancement' }],
  );
  const schema = parseJsonText(fs.readFileSync(
    path.join(repoRoot, 'contracts/opl-framework/agent-package-manifest.schema.json'),
    'utf8',
  )) as Record<string, any>;
  assert.doesNotThrow(() => assertJsonSchemaPayload({
    schemaId: schema.$id,
    schema,
    sourceRef: 'contracts/opl-framework/agent-package-manifest.schema.json',
  }, optionalManifest));
  for (const dependency of [
    {
      ...manifest.capability_dependencies[0],
      required: true,
      dependency_kind: 'optional_enhancement',
    },
    {
      ...manifest.capability_dependencies[0],
      required: false,
      dependency_kind: 'hard_runtime_dependency',
    },
    {
      ...manifest.capability_dependencies[0],
      required: false,
      dependency_kind: undefined,
    },
  ]) {
    assert.throws(() => assertJsonSchemaPayload({
      schemaId: schema.$id,
      schema,
      sourceRef: 'contracts/opl-framework/agent-package-manifest.schema.json',
    }, {
      ...manifest,
      capability_dependencies: [dependency],
    }));
    assert.throws(
      () => normalizeFirstPartyAgentPackageManifest({
        ...manifest,
        capability_dependencies: [dependency],
      }),
      /required and dependency_kind must agree/,
    );
    assert.throws(
      () => normalizePackageManifest({
        ...manifest,
        capability_dependencies: [dependency],
      }, 'file:///tmp/invalid-agent-package.json'),
      /required and dependency_kind must agree/,
    );
  }
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
  assert.equal(
    Object.hasOwn(
      normalizeFirstPartyAgentPackageManifest(manifest).capability_dependencies[0],
      'sync_scopes',
    ),
    false,
  );
});

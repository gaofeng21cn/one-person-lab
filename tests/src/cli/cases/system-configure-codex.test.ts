import crypto from 'node:crypto';

import { assert, fs, os, parseJsonText, path, runCli, runCliFailure, test } from '../helpers.ts';
import { createFakeFamilySkillWorkspace } from '../../cli-codex-default-shell-helpers.ts';
import { readBundledCodexDefaultProfile } from '../../../../src/kernel/local-codex-defaults.ts';
import {
  CANONICAL_PACKAGE_CONTENT_LOCK,
  packageContentLockDigest,
} from '../../../../src/modules/connect/agent-package-registry-parts/payload-content-lock.ts';
import {
  assertBundledFullRuntimePackageRoots,
  readBundledFullRuntimePackageCatalog,
} from '../../../../src/modules/connect/agent-package-registry-parts/bundled-full-runtime-catalog.ts';
import {
  agentPackageLifecycleUxReadback,
} from '../../../../src/modules/connect/agent-package-registry-parts/readback.ts';
import {
  runCliWithStdin,
  runCliWithStdinFailure,
} from './system-install-fixtures.ts';

const codexDefaultProfile = readBundledCodexDefaultProfile();

const bundledPackageFixtures = [
  { packageId: 'mas', project: 'med-autoscience', runtimePath: 'modules/mas' },
  { packageId: 'mag', project: 'med-autogrant', runtimePath: 'modules/mag' },
  { packageId: 'rca', project: 'redcube-ai', runtimePath: 'modules/rca' },
  { packageId: 'oma', project: 'opl-meta-agent', runtimePath: 'modules/meta-agent' },
  { packageId: 'obf', project: 'opl-bookforge', runtimePath: 'modules/bookforge' },
] as const;

function sha256(value: string | Buffer) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function writeJson(filePath: string, payload: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const json = `${JSON.stringify(payload, null, 2)}\n`;
  fs.writeFileSync(filePath, json, 'utf8');
  return json;
}

function listFiles(root: string, relativeRoot = ''): string[] {
  const absoluteRoot = path.join(root, relativeRoot);
  return fs.readdirSync(absoluteRoot, { withFileTypes: true })
    .flatMap((entry) => {
      const relativePath = path.posix.join(relativeRoot.replaceAll(path.sep, '/'), entry.name);
      if (entry.isDirectory()) return listFiles(root, relativePath);
      return entry.isFile() ? [relativePath] : [];
    })
    .sort();
}

function rawSourceUrl(sourceRepo: string, sourceCommit: string, sourceRoot: string, relativePath: string) {
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\.git$/.exec(sourceRepo);
  assert.ok(match);
  const treePath = sourceRoot === '.' ? relativePath : `${sourceRoot}/${relativePath}`;
  return `https://raw.githubusercontent.com/${match[1]}/${match[2]}/${sourceCommit}/${treePath}`;
}

function materializeScholarSkillsFixture(root: string, manifest: Record<string, any>) {
  for (const relativePath of manifest.content_lock.paths as string[]) {
    const filePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const basename = path.basename(relativePath);
    const content = relativePath === '.codex-plugin/plugin.json'
      ? `${JSON.stringify({ name: 'mas-scholar-skills', skills: './skills/' }, null, 2)}\n`
      : basename === 'SKILL.md'
        ? `---\nname: ${path.basename(path.dirname(relativePath))}\ndescription: Bundled runtime fixture for ${path.basename(path.dirname(relativePath))}.\n---\n\n# ${path.basename(path.dirname(relativePath))}\n`
        : basename.endsWith('.json')
          ? '{}\n'
          : 'export {};\n';
    fs.writeFileSync(filePath, content, 'utf8');
  }
}

function buildBundledRuntimeCatalogFixture(input: {
  familyRoot: string;
  runtimeHome: string;
  outputRoot: string;
}) {
  const scholarRoot = path.join(input.runtimeHome, 'modules', 'mas-scholar-skills');
  const scholarManifestPath = path.resolve('contracts', 'opl-framework', 'packages', 'mas-scholar-skills.json');
  const scholarManifest = parseJsonText(fs.readFileSync(scholarManifestPath, 'utf8')) as Record<string, any>;
  materializeScholarSkillsFixture(scholarRoot, scholarManifest);

  const packageRoots: Record<string, string> = Object.fromEntries([
    ...bundledPackageFixtures.map((entry) => [entry.packageId, path.join(input.familyRoot, entry.project)]),
    ['mas-scholar-skills', scholarRoot],
  ]);
  const runtimePaths: Record<string, string> = Object.fromEntries([
    ...bundledPackageFixtures.map((entry) => [entry.packageId, entry.runtimePath]),
    ['mas-scholar-skills', 'modules/mas-scholar-skills'],
  ]);
  const packages: Record<string, unknown> = {};

  for (const packageId of [...bundledPackageFixtures.map((entry) => entry.packageId), 'mas-scholar-skills']) {
    const canonicalManifestPath = path.resolve('contracts', 'opl-framework', 'packages', `${packageId}.json`);
    const canonicalPayloadPath = path.resolve(
      'contracts',
      'opl-framework',
      'packages',
      'payloads',
      `${packageId}-${(parseJsonText(fs.readFileSync(canonicalManifestPath, 'utf8')) as Record<string, any>).version}.json`,
    );
    const manifest = parseJsonText(fs.readFileSync(canonicalManifestPath, 'utf8')) as Record<string, any>;
    const canonicalPayload = parseJsonText(fs.readFileSync(canonicalPayloadPath, 'utf8')) as Record<string, any>;
    const sourceRoot = canonicalPayload.source_root as string;
    const sourcePath = sourceRoot === '.'
      ? packageRoots[packageId]
      : path.join(packageRoots[packageId], sourceRoot);
    const files = listFiles(sourcePath).map((relativePath) => {
      const content = fs.readFileSync(path.join(sourcePath, relativePath));
      const executable = (fs.statSync(path.join(sourcePath, relativePath)).mode & 0o111) !== 0;
      return {
        path: relativePath,
        mode: executable ? '100755' : '100644',
        source_url: rawSourceUrl(manifest.source_repo, manifest.codex_surface.carrier_source_commit, sourceRoot, relativePath),
        sha256: sha256(content),
      };
    });
    const contentDigest = packageContentLockDigest(
      CANONICAL_PACKAGE_CONTENT_LOCK,
      files.map((entry) => ({
        path: entry.path,
        content: fs.readFileSync(path.join(sourcePath, entry.path)),
      })),
    );
    if (packageId === 'mas-scholar-skills') {
      manifest.content_lock.paths = files.map((entry) => entry.path);
      manifest.content_lock.digest = contentDigest;
    }
    const manifestRef = `packages/${packageId}.json`;
    const payloadRef = `packages/payloads/${packageId}.json`;
    manifest.codex_surface.plugin_payload_manifest_url = `payloads/${packageId}.json`;
    const payload = {
      surface_kind: 'opl_package_payload_manifest.v2',
      schema_ref: 'contracts/opl-framework/package-payload-manifest-v2.schema.json',
      package_id: packageId,
      plugin_id: manifest.codex_surface.plugin_id,
      package_version: manifest.version,
      source_repo: manifest.source_repo,
      source_commit: manifest.codex_surface.carrier_source_commit,
      source_root: sourceRoot,
      content_lock: {
        algorithm: 'sha256',
        canonicalization: CANONICAL_PACKAGE_CONTENT_LOCK,
        digest: contentDigest,
      },
      files,
    };
    const manifestJson = writeJson(path.join(input.outputRoot, manifestRef), manifest);
    const payloadJson = writeJson(path.join(input.outputRoot, payloadRef), payload);
    const packageRole = manifest.surface_kind === 'opl_capability_package_manifest.v2'
      ? 'framework_capability_package'
      : manifest.surface_kind === 'opl_workflow_profile_package_manifest.v1'
        ? 'workflow_profile'
        : 'standard_agent';
    packages[packageId] = {
      package_id: packageId,
      package_role: packageRole,
      package_version: manifest.version,
      owner_source_commit: manifest.codex_surface.carrier_source_commit,
      manifest_ref: manifestRef,
      manifest_sha256: sha256(manifestJson),
      payload_manifest_ref: payloadRef,
      payload_manifest_sha256: sha256(payloadJson),
      runtime_module_relative_path: runtimePaths[packageId],
    };
  }

  const catalogPath = path.join(input.outputRoot, 'catalog.json');
  writeJson(catalogPath, {
    surface_kind: 'opl_bundled_full_runtime_package_catalog.v1',
    schema_ref: 'contracts/opl-framework/bundled-full-runtime-package-catalog.schema.json',
    catalog_id: 'opl-framework-bundled-full-runtime-packages',
    packages,
  });
  return { catalogPath, scholarRoot };
}

function buildFullRuntimeFamilyFixture(input: { captureDir: string; homeRoot: string }) {
  const familyWorkspace = createFakeFamilySkillWorkspace(input.captureDir);
  const runtimeHome = path.join(input.homeRoot, 'full-runtime');
  const bundledCatalog = buildBundledRuntimeCatalogFixture({
    familyRoot: familyWorkspace.workspaceRoot,
    runtimeHome,
    outputRoot: path.join(input.captureDir, 'bundled-package-catalog'),
  });
  for (const [repoName, moduleId, packageId] of [
    ['med-autoscience', 'medautoscience', 'mas'],
    ['med-autogrant', 'medautogrant', 'mag'],
    ['redcube-ai', 'redcube', 'rca'],
    ['opl-meta-agent', 'oplmetaagent', 'oma'],
    ['opl-bookforge', 'oplbookforge', 'obf'],
  ]) {
    const packageManifest = parseJsonText(fs.readFileSync(
      path.resolve('contracts', 'opl-framework', 'packages', `${packageId}.json`),
      'utf8',
    )) as Record<string, any>;
    fs.writeFileSync(
      path.join(familyWorkspace.workspaceRoot, repoName, 'opl-runtime-module.json'),
      `${JSON.stringify({
        marker_version: 1,
        module_id: moduleId,
        repo_name: repoName,
        packaged_runtime: true,
        source_git: { head_sha: packageManifest.codex_surface.carrier_source_commit },
      }, null, 2)}\n`,
      'utf8',
    );
  }
  return {
    familyWorkspace,
    runtimeHome,
    bundledCatalog,
    env: {
      HOME: input.homeRoot,
      CODEX_HOME: path.join(input.homeRoot, 'codex-home'),
      OPL_STATE_DIR: path.join(input.homeRoot, 'opl-state'),
      OPL_FULL_RUNTIME_HOME: runtimeHome,
      OPL_MODULE_PATH_MEDAUTOSCIENCE: path.join(familyWorkspace.workspaceRoot, 'med-autoscience'),
      OPL_MODULE_PATH_MEDAUTOGRANT: path.join(familyWorkspace.workspaceRoot, 'med-autogrant'),
      OPL_MODULE_PATH_REDCUBE: path.join(familyWorkspace.workspaceRoot, 'redcube-ai'),
      OPL_MODULE_PATH_OPLMETAAGENT: path.join(familyWorkspace.workspaceRoot, 'opl-meta-agent'),
      OPL_MODULE_PATH_OPLBOOKFORGE: path.join(familyWorkspace.workspaceRoot, 'opl-bookforge'),
      OPL_TEST_RUNTIME_SOURCE_FAULTS_ENABLED: '1',
      OPL_TEST_BUNDLED_FULL_RUNTIME_PACKAGE_CATALOG: bundledCatalog.catalogPath,
      OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
      PATH: `${process.execPath ? path.dirname(process.execPath) : '/usr/bin'}:/usr/bin:/bin`,
    },
  };
}

function assertBundledCodexModel(
  bootstrap: { model: string; reasoning_effort: string },
  config: string,
) {
  assert.equal(bootstrap.model, codexDefaultProfile.model);
  assert.equal(bootstrap.reasoning_effort, codexDefaultProfile.model_reasoning_effort);
  assert.equal(config.includes(`model = ${JSON.stringify(codexDefaultProfile.model)}`), true);
  assert.equal(
    config.includes(
      `model_reasoning_effort = ${JSON.stringify(codexDefaultProfile.model_reasoning_effort)}`,
    ),
    true,
  );
}

test('bundled Full runtime catalog owns the canonical seven and fails closed on a missing dependency root', () => {
  const catalog = readBundledFullRuntimePackageCatalog();
  assert.deepEqual(
    [...catalog.entries.keys()].sort(),
    ['mag', 'mas', 'mas-scholar-skills', 'obf', 'oma', 'opl-flow', 'rca'],
  );
  assert.equal(
    [...catalog.entries.values()].every((entry) => /^[0-9a-f]{40}$/.test(entry.ownerSourceCommit)),
    true,
  );
  assert.throws(
    () => assertBundledFullRuntimePackageRoots({
      catalog,
      rootPackageId: 'mas',
      packageRoots: { mas: '/fixture/modules/mas' },
    }),
    (error: any) => error?.details?.failure_code === 'agent_package_bundled_dependency_root_missing'
      && error?.details?.package_id === 'mas-scholar-skills',
  );
});

test('system configure-codex fails closed before package lock writes when Full runtime misses ScholarSkills', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-configure-codex-missing-scholar-home-'));
  const captureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-configure-codex-missing-scholar-capture-'));
  const fixture = buildFullRuntimeFamilyFixture({ captureDir, homeRoot });
  try {
    fs.rmSync(fixture.bundledCatalog.scholarRoot, { recursive: true, force: true });
    const failure = runCliWithStdinFailure(
      ['system', 'configure-codex', '--api-key-stdin'],
      'secret-family-key\n',
      fixture.env,
    ) as any;
    assert.equal(failure.payload.error.code, 'contract_shape_invalid');
    assert.equal(failure.payload.error.details.failure_code, 'agent_package_bundled_dependency_root_missing');
    assert.equal(failure.payload.error.details.package_id, 'mas-scholar-skills');
    assert.equal(fs.existsSync(path.join(fixture.env.OPL_STATE_DIR, 'agent-package-locks.json')), false);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(captureDir, { recursive: true, force: true });
    fs.rmSync(fixture.familyWorkspace.workspaceRoot, { recursive: true, force: true });
  }
});

test('system configure-codex writes the product endpoint and App-owned install fallback without leaking the API key', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-configure-codex-home-'));
  const apiKey = 'secret-stdin-key';

  try {
    const output = runCliWithStdin(
      ['system', 'configure-codex', '--api-key-stdin'],
      `${apiKey}\n`,
      {
        HOME: homeRoot,
        CODEX_HOME: path.join(homeRoot, 'codex-home'),
        OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      },
    ) as {
      codex_config: {
        status: string;
        config_path: string;
        default_profile: {
          model_provider: string;
          model: string;
          model_reasoning_effort: string;
          base_url: string;
          base_url_role: string;
          model_profile_role: string;
        };
        bootstrap: {
          model: string;
          reasoning_effort: string;
          provider_base_url: string;
          api_key_present: boolean;
          management_receipt: {
            selection_mode: string;
            provider_route: string;
            owned_keys: string[];
            backup_path: string | null;
          };
          management_receipt_path: string;
        };
      };
    };

    assert.equal(output.codex_config.status, 'completed');
    assert.equal(output.codex_config.default_profile.model_provider, 'gflab');
    assert.equal(output.codex_config.default_profile.model, codexDefaultProfile.model);
    assert.equal(
      output.codex_config.default_profile.model_reasoning_effort,
      codexDefaultProfile.model_reasoning_effort,
    );
    assert.equal(output.codex_config.default_profile.base_url, 'https://gflabtoken.cn/v1');
    assert.equal(output.codex_config.default_profile.base_url_role, codexDefaultProfile.base_url_role);
    assert.equal(output.codex_config.default_profile.model_profile_role, codexDefaultProfile.model_profile_role);
    assert.equal(output.codex_config.bootstrap.api_key_present, true);
    assert.equal(output.codex_config.bootstrap.management_receipt.selection_mode, 'auto');
    assert.equal(output.codex_config.bootstrap.management_receipt.provider_route, 'direct_gateway');
    assert.equal(output.codex_config.bootstrap.management_receipt.backup_path, null);
    assert.equal(fs.existsSync(output.codex_config.bootstrap.management_receipt_path), true);
    assert.equal(JSON.stringify(output).includes(apiKey), false);

    const config = fs.readFileSync(output.codex_config.config_path, 'utf8');
    assert.match(config, /model_provider = "gflab"/);
    assertBundledCodexModel(output.codex_config.bootstrap, config);
    assert.match(config, /base_url = "https:\/\/gflabtoken\.cn\/v1"/);
    assert.match(config, /experimental_bearer_token = "secret-stdin-key"/);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('system configure-codex keeps environment overrides over bundled model profile', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-configure-codex-override-home-'));

  try {
    const output = runCliWithStdin(
      ['system', 'configure-codex', '--api-key-stdin'],
      'override-key\n',
      {
        HOME: homeRoot,
        CODEX_HOME: path.join(homeRoot, 'codex-home'),
        OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
        OPL_CODEX_MODEL: 'gpt-5.6',
        OPL_CODEX_REASONING_EFFORT: 'high',
      },
    ) as {
      codex_config: {
        config_path: string;
        bootstrap: {
          model: string;
          reasoning_effort: string;
          provider_base_url: string;
        };
      };
    };

    assert.equal(output.codex_config.bootstrap.model, 'gpt-5.6');
    assert.equal(output.codex_config.bootstrap.reasoning_effort, 'high');
    assert.equal(output.codex_config.bootstrap.provider_base_url, 'https://gflabtoken.cn/v1');

    const config = fs.readFileSync(output.codex_config.config_path, 'utf8');
    assert.match(config, /model = "gpt-5\.6"/);
    assert.match(config, /model_reasoning_effort = "high"/);
    assert.match(config, /base_url = "https:\/\/gflabtoken\.cn\/v1"/);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('system configure-codex preserves an existing custom provider and registers OPL Gateway as inactive', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-configure-codex-switch-home-'));
  const codexHome = path.join(homeRoot, 'codex-home');

  try {
    fs.mkdirSync(codexHome, { recursive: true });
    fs.writeFileSync(
      path.join(codexHome, 'config.toml'),
      [
        'model_provider = "custom"',
        'model = "custom-model"',
        '',
        '[model_providers.custom]',
        'name = "custom"',
        'base_url = "https://custom-provider.example.test/v1"',
        'experimental_bearer_token = "existing-custom-key"',
        '',
      ].join('\n'),
      'utf8',
    );

    const output = runCliWithStdin(
      ['system', 'configure-codex', '--api-key-stdin'],
      'opl-gateway-key\n',
      {
        HOME: homeRoot,
        CODEX_HOME: codexHome,
        OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      },
    ) as {
      codex_config: {
        status: string;
        config_path: string;
        bootstrap: {
          model: string;
          provider_base_url: string;
          api_key_present: boolean;
          management_receipt: {
            selection_mode: string;
            provider_route: string;
            backup_path: string | null;
          };
        };
      };
    };

    assert.equal(output.codex_config.status, 'completed');
    assert.equal(output.codex_config.bootstrap.model, 'custom-model');
    assert.equal(output.codex_config.bootstrap.provider_base_url, 'https://gflabtoken.cn/v1');
    assert.equal(output.codex_config.bootstrap.api_key_present, true);
    assert.equal(output.codex_config.bootstrap.management_receipt.selection_mode, 'inactive_provider');
    assert.equal(output.codex_config.bootstrap.management_receipt.provider_route, 'inactive_provider');
    assert.equal(fs.existsSync(output.codex_config.bootstrap.management_receipt.backup_path!), true);

    const config = fs.readFileSync(output.codex_config.config_path, 'utf8');
    assert.match(config, /model_provider = "custom"/);
    assert.match(config, /model = "custom-model"/);
    assert.match(config, /\[model_providers\.custom\]/);
    assert.match(config, /base_url = "https:\/\/custom-provider\.example\.test\/v1"/);
    assert.match(config, /\[model_providers\.gflab\]/);
    assert.match(config, /base_url = "https:\/\/gflabtoken\.cn\/v1"/);
    assert.match(config, /experimental_bearer_token = "opl-gateway-key"/);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('system configure-codex preserves model and reasoning values changed after the last OPL receipt', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-configure-codex-local-override-home-'));
  const codexHome = path.join(homeRoot, 'codex-home');
  const stateDir = path.join(homeRoot, 'opl-state');

  try {
    const env = {
      HOME: homeRoot,
      CODEX_HOME: codexHome,
      OPL_STATE_DIR: stateDir,
    };
    runCliWithStdin(['system', 'configure-codex', '--api-key-stdin'], 'first-key\n', env);
    const configPath = path.join(codexHome, 'config.toml');
    const managedConfig = fs.readFileSync(configPath, 'utf8');
    fs.writeFileSync(
      configPath,
      managedConfig
        .replace(
          `model = ${JSON.stringify(codexDefaultProfile.model)}`,
          'model = "user-fixed-model"',
        )
        .replace(
          `model_reasoning_effort = ${JSON.stringify(codexDefaultProfile.model_reasoning_effort)}`,
          'model_reasoning_effort = "high"',
        ),
      'utf8',
    );

    const output = runCliWithStdin(
      ['system', 'configure-codex', '--api-key-stdin'],
      'second-key\n',
      env,
    ) as {
      codex_config: {
        bootstrap: {
          model: string;
          reasoning_effort: string;
          management_receipt: { selection_mode: string };
        };
      };
    };

    assert.equal(output.codex_config.bootstrap.model, 'user-fixed-model');
    assert.equal(output.codex_config.bootstrap.reasoning_effort, 'high');
    assert.equal(output.codex_config.bootstrap.management_receipt.selection_mode, 'local_override');
    const config = fs.readFileSync(configPath, 'utf8');
    assert.match(config, /model = "user-fixed-model"/);
    assert.match(config, /model_reasoning_effort = "high"/);
    assert.match(config, /experimental_bearer_token = "second-key"/);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('system configure-codex completes a plugin-only Codex config created during first-run install', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-configure-codex-plugin-home-'));
  const codexHome = path.join(homeRoot, 'codex-home');
  const configPath = path.join(codexHome, 'config.toml');
  const apiKey = 'secret-plugin-key';

  try {
    fs.mkdirSync(codexHome, { recursive: true });
    fs.writeFileSync(
      configPath,
      [
        '[marketplaces.med-autoscience-local]',
        'source_type = "local"',
        'source = "/Users/test/med-autoscience"',
        '',
        '[plugins."med-autoscience@med-autoscience-local"]',
        'enabled = true',
        '',
      ].join('\n'),
      'utf8',
    );

    const output = runCliWithStdin(
      ['system', 'configure-codex', '--api-key-stdin'],
      `${apiKey}\n`,
      {
        HOME: homeRoot,
        CODEX_HOME: codexHome,
        OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      },
    ) as {
      codex_config: {
        status: string;
        bootstrap: {
          model: string;
          reasoning_effort: string;
          provider_base_url: string;
          api_key_present: boolean;
        };
      };
    };

    assert.equal(output.codex_config.status, 'completed');
    assert.equal(output.codex_config.bootstrap.provider_base_url, 'https://gflabtoken.cn/v1');
    assert.equal(output.codex_config.bootstrap.api_key_present, true);
    assert.equal(JSON.stringify(output).includes(apiKey), false);

    const config = fs.readFileSync(configPath, 'utf8');
    assert.match(config, /model_provider = "gflab"/);
    assertBundledCodexModel(output.codex_config.bootstrap, config);
    assert.match(config, /base_url = "https:\/\/gflabtoken\.cn\/v1"/);
    assert.match(config, /experimental_bearer_token = "secret-plugin-key"/);
    assert.match(config, /\[marketplaces\.med-autoscience-local\]/);
    assert.match(config, /\[plugins\."med-autoscience@med-autoscience-local"\]/);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('system configure-codex syncs packaged Full companion skills after API key setup', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-configure-codex-full-skills-home-'));
  const runtimeHome = path.join(homeRoot, 'Library', 'Application Support', 'OPL', 'runtime', 'current');
  const packagedSkillsRoot = path.join(runtimeHome, 'skills');
  const toolBin = path.join(runtimeHome, 'bin');
  const codexHome = path.join(homeRoot, 'codex-home');

  try {
    for (const skillId of [
      'officecli',
      'officecli-docx',
      'officecli-pptx',
      'officecli-xlsx',
      'officecli-academic-paper',
      'officecli-data-dashboard',
      'officecli-financial-model',
      'officecli-pitch-deck',
      'ui-ux-pro-max',
      'mineru-document-extractor',
    ]) {
      fs.mkdirSync(path.join(packagedSkillsRoot, skillId), { recursive: true });
      fs.writeFileSync(
        path.join(packagedSkillsRoot, skillId, 'SKILL.md'),
        `---\nname: ${skillId}\ndescription: packaged ${skillId}\n---\n\n# ${skillId}\n`,
        'utf8',
      );
    }
    fs.mkdirSync(toolBin, { recursive: true });
    fs.writeFileSync(
      path.join(toolBin, 'officecli'),
      '#!/usr/bin/env bash\nif [ "${1:-}" = "--version" ]; then echo "1.0.70-test"; else echo officecli; fi\n',
      { mode: 0o755 },
    );
    fs.writeFileSync(
      path.join(toolBin, 'mineru-open-api'),
      '#!/usr/bin/env bash\nif [ "${1:-}" = "version" ]; then echo "mineru-open-api version v0.1.3-test"; else echo mineru-open-api; fi\n',
      { mode: 0o755 },
    );

    const output = runCliWithStdin(
      ['system', 'configure-codex', '--api-key-stdin'],
      'secret-full-key\n',
      {
        HOME: homeRoot,
        CODEX_HOME: codexHome,
        OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
        OPL_FULL_RUNTIME_HOME: runtimeHome,
        OPL_PACKAGED_SKILLS_ROOT: packagedSkillsRoot,
        OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
        PATH: `${toolBin}:/usr/bin:/bin`,
      },
    ) as {
      codex_config: {
        companion_skill_sync: {
          mode: string;
          items: Array<{ skill_id: string; status: string; action: string }>;
          tools: Array<{ tool_id: string; status: string; action: string; binary_path: string | null }>;
        };
      };
    };

    assert.equal(output.codex_config.companion_skill_sync.mode, 'managed');
    const itemById = new Map(output.codex_config.companion_skill_sync.items.map((item) => [item.skill_id, item]));
    for (const skillId of [
      'officecli',
      'officecli-docx',
      'officecli-pptx',
      'officecli-xlsx',
      'officecli-academic-paper',
      'officecli-data-dashboard',
      'officecli-financial-model',
      'officecli-pitch-deck',
      'ui-ux-pro-max',
      'mineru-document-extractor',
    ]) {
      assert.equal(itemById.get(skillId)?.status, 'synced');
      assert.equal(itemById.get(skillId)?.action, 'symlink');
      assert.equal(fs.existsSync(path.join(codexHome, 'skills', skillId, 'SKILL.md')), true);
    }
    assert.deepEqual(
      output.codex_config.companion_skill_sync.tools.map((entry) => [
        entry.tool_id,
        entry.status,
        entry.action,
        entry.binary_path,
      ]),
      [
        ['officecli', 'ready', 'none', path.join(toolBin, 'officecli')],
        ['mineru-open-api', 'ready', 'none', path.join(toolBin, 'mineru-open-api')],
      ],
    );
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('system configure-codex syncs Full runtime family Codex plugins after API key setup', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-configure-codex-family-plugins-home-'));
  const captureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-configure-codex-family-plugins-capture-'));
  const fixture = buildFullRuntimeFamilyFixture({ captureDir, homeRoot });
  const { familyWorkspace, runtimeHome, bundledCatalog } = fixture;
  const codexHome = path.join(homeRoot, 'codex-home');

  try {
    const output = runCliWithStdin(
      ['system', 'configure-codex', '--api-key-stdin'],
      'secret-family-key\n',
      fixture.env,
    ) as {
      codex_config: {
        skill_sync: {
          packs: Array<{ domain_id: string; sync_status: string; installer_result: Record<string, unknown> | null }>;
          codex_plugin_registry: {
            summary: { registered: number; missing_marketplace: number };
            items: Array<{ module_id: string; status: string; repo_path: string }>;
          };
        };
        agent_package_sync: {
          status: string;
          summary: { total: number; installed: number; already_installed: number };
          items: Array<{ package_id: string; status: string; package_lock_ref?: string }>;
        };
      };
    };

    assert.equal(output.codex_config.skill_sync.codex_plugin_registry.summary.registered, 4);
    assert.equal(output.codex_config.skill_sync.codex_plugin_registry.summary.missing_marketplace, 0);
    assert.deepEqual(output.codex_config.agent_package_sync.summary, {
      total: 5,
      installed: 5,
      already_installed: 0,
    });
    assert.deepEqual(
      output.codex_config.agent_package_sync.items.map((item) => item.package_id),
      ['mas', 'mag', 'rca', 'oma', 'obf'],
    );
    assert.equal(
      output.codex_config.agent_package_sync.items.every((item) => item.package_lock_ref?.startsWith('opl://agent-package-lock/')),
      true,
    );
    const lockIndex = parseJsonText(fs.readFileSync(
      path.join(homeRoot, 'opl-state', 'agent-package-locks.json'),
      'utf8',
    )) as Record<string, any>;
    assert.deepEqual(
      lockIndex.packages.map((entry: Record<string, any>) => entry.package_id).sort(),
      ['mag', 'mas', 'mas-scholar-skills', 'obf', 'oma', 'rca'],
    );
    const masLock = lockIndex.packages.find((entry: Record<string, any>) => entry.package_id === 'mas');
    const scholarLock = lockIndex.packages.find(
      (entry: Record<string, any>) => entry.package_id === 'mas-scholar-skills',
    );
    assert.equal(masLock.resolved_dependencies[0].package_id, 'mas-scholar-skills');
    assert.equal(masLock.resolved_dependencies[0].carrier_authority.status, 'verified');
    assert.equal(scholarLock.source_kind, 'bundled_full_runtime_modules');
    assert.equal(scholarLock.carrier_authority.status, 'verified');
    assert.equal(scholarLock.carrier_authority.verified_source_commit, scholarLock.owner_source_commit);
    assert.equal(scholarLock.managed_runtime_source, null);
    assert.equal(fs.realpathSync(bundledCatalog.scholarRoot).startsWith(fs.realpathSync(runtimeHome)), true);
    assert.deepEqual(
      output.codex_config.skill_sync.packs.map((pack) => [pack.domain_id, pack.sync_status]),
      [
        ['medautoscience', 'synced'],
        ['medautogrant', 'synced'],
        ['redcube', 'synced'],
        ['oplmetaagent', 'synced'],
      ],
    );
    const omaPack = output.codex_config.skill_sync.packs.find((pack) => pack.domain_id === 'oplmetaagent');
    assert.equal(
      (omaPack?.installer_result?.materialized_codex_plugin_carrier as { source?: string } | undefined)?.source,
      'opl_standard_agent_primary_skill_codex_plugin',
    );

    const config = fs.readFileSync(path.join(codexHome, 'config.toml'), 'utf8');
    assert.match(config, /\[plugins\."med-autoscience@med-autoscience-local"\]/);
    assert.match(config, /\[plugins\."med-autogrant@med-autogrant-local"\]/);
    assert.match(config, /\[plugins\."redcube-ai@redcube-ai-local"\]/);
    assert.match(config, /\[plugins\."opl-meta-agent@opl-meta-agent-local"\]/);
    for (const [project, marketplaceId, pluginId] of [
      ['med-autoscience', 'med-autoscience-local', 'med-autoscience'],
      ['med-autogrant', 'med-autogrant-local', 'med-autogrant'],
      ['redcube-ai', 'redcube-ai-local', 'redcube-ai'],
    ] as const) {
      const checkoutPath = path.join(familyWorkspace.workspaceRoot, project);
      const marketplaceRoot = path.join(homeRoot, 'opl-state', 'codex-plugin-marketplaces', marketplaceId);
      assert.equal(fs.existsSync(path.join(checkoutPath, '.agents', 'plugins', 'marketplace.json')), false);
      const wrapperPluginRoot = path.join(marketplaceRoot, 'plugins', pluginId);
      const wrapperManifest = parseJsonText(fs.readFileSync(path.join(wrapperPluginRoot, '.codex-plugin', 'plugin.json'), 'utf8')) as Record<string, any>;
      const wrapperSkill = fs.readFileSync(path.join(wrapperPluginRoot, 'skills', pluginId, 'SKILL.md'), 'utf8');
      assert.equal(wrapperManifest.name, pluginId);
      assert.match(wrapperSkill, new RegExp(`^name:\\s*${pluginId}$`, 'm'));
      assert.match(config, new RegExp(`\\[marketplaces\\.${marketplaceId}\\]\\nsource_type = "local"\\nsource = "${marketplaceRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
    }
    assert.equal(
      fs.existsSync(path.join(
        homeRoot,
        'opl-state',
        'codex-plugin-carriers',
        'opl-meta-agent-local',
        'plugins',
        'opl-meta-agent',
        '.codex-plugin',
        'plugin.json',
      )),
      true,
    );
    assert.equal(fs.existsSync(familyWorkspace.syncLogPath), false);

    for (const action of ['update', 'repair']) {
      const failure = runCliFailure(['packages', action, 'mas'], fixture.env);
      assert.equal(
        failure.payload.error.details.failure_code,
        'agent_package_bundled_full_runtime_internal_reconcile_required',
      );
    }

    const lockPath = path.join(fixture.env.OPL_STATE_DIR, 'agent-package-locks.json');
    const expectedMasOwnerSourceCommit = masLock.owner_source_commit;
    const expectedMasCarrierAuthority = structuredClone(masLock.carrier_authority);
    const driftedLockIndex = parseJsonText(fs.readFileSync(lockPath, 'utf8')) as Record<string, any>;
    const driftedMasLock = driftedLockIndex.packages.find((entry: Record<string, any>) => entry.package_id === 'mas');
    driftedMasLock.owner_source_commit = 'f'.repeat(40);
    writeJson(lockPath, driftedLockIndex);

    const reconciled = runCliWithStdin(
      ['system', 'configure-codex', '--api-key-stdin'],
      'secret-family-key\n',
      fixture.env,
    ) as any;
    assert.equal(
      reconciled.codex_config.agent_package_sync.items.find(
        (item: Record<string, any>) => item.package_id === 'mas',
      )?.status,
      'installed',
    );
    const reconciledLockIndex = parseJsonText(fs.readFileSync(lockPath, 'utf8')) as Record<string, any>;
    const reconciledMasLock = reconciledLockIndex.packages.find(
      (entry: Record<string, any>) => entry.package_id === 'mas',
    );
    assert.equal(reconciledMasLock.owner_source_commit, expectedMasOwnerSourceCommit);
    assert.deepEqual(reconciledMasLock.carrier_authority, expectedMasCarrierAuthority);

    const optimized = runCli(['packages', 'optimize', 'mas'], fixture.env) as any;
    assert.equal(optimized.opl_agent_package_optimize.status, 'optimized');
    assert.deepEqual(
      optimized.opl_agent_package_optimize.package_lock.carrier_authority,
      expectedMasCarrierAuthority,
    );
    assert.deepEqual(
      optimized.opl_agent_package_optimize.lifecycle_receipt.carrier_authority,
      expectedMasCarrierAuthority,
    );

    const rolledBack = runCli(['packages', 'rollback', 'mas'], fixture.env) as any;
    assert.equal(rolledBack.opl_agent_package_rollback.status, 'rolled_back');
    assert.deepEqual(
      rolledBack.opl_agent_package_rollback.package_lock.carrier_authority,
      expectedMasCarrierAuthority,
    );
    assert.deepEqual(
      rolledBack.opl_agent_package_rollback.lifecycle_receipt.carrier_authority,
      expectedMasCarrierAuthority,
    );

    const currentLockIndex = parseJsonText(fs.readFileSync(lockPath, 'utf8')) as Record<string, any>;
    const currentMasLock = currentLockIndex.packages.find(
      (entry: Record<string, any>) => entry.package_id === 'mas',
    );
    const ledgerPath = path.join(fixture.env.OPL_STATE_DIR, 'agent-package-lifecycle-ledger.json');
    const ledger = parseJsonText(fs.readFileSync(ledgerPath, 'utf8')) as Record<string, any>;
    const currentMasReceipt = ledger.receipts.find(
      (entry: Record<string, any>) => entry.receipt_ref === currentMasLock.action_receipt_id,
    );
    assert.ok(currentMasReceipt);
    for (const receipt of [
      null,
      { ...structuredClone(currentMasReceipt), owner_source_commit: 'f'.repeat(40) },
    ]) {
      const lifecycle = agentPackageLifecycleUxReadback({
        packageId: 'mas',
        lock: currentMasLock,
        receipt,
      });
      assert.equal(lifecycle.status, 'attention_needed');
      assert.equal(
        lifecycle.conditions.some((condition) => condition.condition_id === 'carrier_authority_invalid'),
        true,
      );
    }
    ledger.receipts = ledger.receipts.filter(
      (entry: Record<string, any>) => entry.receipt_ref !== currentMasLock.action_receipt_id,
    );
    writeJson(ledgerPath, ledger);

    const receiptMissing = runCli(['packages', 'status', '--package-id', 'mas'], fixture.env) as any;
    assert.equal(receiptMissing.opl_agent_package_status.status, 'attention_needed');
    assert.equal(receiptMissing.opl_agent_package_status.carrier_authority_readiness.status, 'invalid');
    assert.equal(receiptMissing.opl_agent_package_status.lifecycle_ux.status, 'attention_needed');
    assert.equal(
      receiptMissing.opl_agent_package_status.conditions.some(
        (condition: Record<string, any>) => condition.condition_id === 'carrier_authority_invalid',
      ),
      true,
    );

    const workspace = path.join(homeRoot, 'workspace');
    fs.mkdirSync(workspace, { recursive: true });
    const activationFailure = runCliFailure([
      'packages', 'activate', 'mas', '--scope', 'workspace', '--target-workspace', workspace,
    ], fixture.env);
    assert.equal(
      activationFailure.payload.error.details.failure_code,
      'agent_package_lifecycle_receipt_carrier_authority_invalid',
    );
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(captureDir, { recursive: true, force: true });
    fs.rmSync(familyWorkspace.workspaceRoot, { recursive: true, force: true });
  }
});

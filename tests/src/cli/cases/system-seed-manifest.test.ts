import { assert, fs, os, parseJsonText, path, runCli, test } from '../helpers.ts';
import { runGitFixtureCommand } from '../helpers-parts/family-fixtures.ts';
import { withCliTimeout } from './system-startup-maintenance-cases/shared.ts';
import './system-seed-manifest-cases/docker-webui-doctor.test.ts';

function writeDeveloperCheckout(root: string) {
  fs.mkdirSync(root, { recursive: true });
  runGitFixtureCommand(root, ['init', '--initial-branch', 'main']);
  fs.writeFileSync(path.join(root, 'README.md'), '# Developer checkout\n', 'utf8');
  runGitFixtureCommand(root, ['add', 'README.md']);
  runGitFixtureCommand(root, [
    '-c',
    'user.name=OPL Test',
    '-c',
    'user.email=opl@example.test',
    'commit',
    '-m',
    'Initial developer checkout',
  ]);
}

function writeMinimalFrameworkRoot(root: string, marker: string) {
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'opl-framework-fixture' }, null, 2), 'utf8');
  fs.writeFileSync(path.join(root, 'src', 'cli.ts'), `export const marker = ${JSON.stringify(marker)};\n`, 'utf8');
  fs.writeFileSync(path.join(root, 'bin', 'opl'), '#!/usr/bin/env node\n', { mode: 0o755 });
  fs.writeFileSync(path.join(root, 'MARKER.txt'), `${marker}\n`, 'utf8');
}

function removeTree(root: string) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      fs.rmSync(root, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 4 || !error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOTEMPTY') {
        throw error;
      }
    }
  }
}

function writeImageManifest(seedDir: string, seedStrategy: string, version = '26.7.1-webui') {
  fs.mkdirSync(seedDir, { recursive: true });
  fs.writeFileSync(path.join(seedDir, 'image-manifest.json'), JSON.stringify({
    image_version: version,
    image_digest: `sha256:${seedStrategy}`,
    seed_strategy: seedStrategy,
  }, null, 2));
}

function writeSeedMetadata(seedDir: string, strategy = 'payload_manifest') {
  fs.writeFileSync(path.join(seedDir, 'metadata.json'), JSON.stringify({
    schema: 'dev.onepersonlab.opl-webui-image-seed.v1',
    strategy,
    components: [
      {
        id: 'opl_framework',
        version: `0.1.0-${strategy}`,
        source: 'image:/opt/opl/framework',
        receipt_kind: 'image_seed',
        payload_path: strategy === 'payload_preheated' ? 'payload/opl_framework' : 'framework',
        source_fingerprint: `git:framework-${strategy}`,
      },
      {
        id: 'codex_cli',
        version: `codex-${strategy}`,
        source: 'image:/opt/opl/toolchain/codex',
        receipt_kind: 'image_seed',
        payload_path: strategy === 'payload_preheated' ? 'payload/codex_cli' : 'toolchain/codex',
        sha256: `sha256:declared-codex-${strategy}`,
        size_bytes: 123,
      },
      {
        id: 'companion_skills',
        version: `skills-${strategy}`,
        source: 'image:/opt/opl/skills',
        receipt_kind: 'image_seed',
        payload_path: strategy === 'payload_preheated' ? 'payload/companion_skills' : 'skills',
        source_fingerprint: `skills:${strategy}`,
      },
      {
        id: 'domain_modules',
        version: `modules-${strategy}`,
        source: 'image:/opt/opl/modules',
        receipt_kind: 'image_seed',
        payload_path: strategy === 'payload_preheated' ? 'payload/domain_modules' : 'modules',
        source_fingerprint: `modules:${strategy}`,
      },
    ],
  }, null, 2));
}

function writePayloadFiles(seedDir: string, strategy = 'payload_manifest') {
  const base = strategy === 'payload_preheated' ? path.join(seedDir, 'payload') : seedDir;
  const frameworkPayload = path.join(base, strategy === 'payload_preheated' ? 'opl_framework' : 'framework');
  const codexPayload = strategy === 'payload_preheated'
    ? path.join(base, 'codex_cli')
    : path.join(base, 'toolchain', 'codex');
  const modulesPayload = path.join(base, strategy === 'payload_preheated' ? 'domain_modules' : 'modules');
  const skillsPayload = path.join(base, strategy === 'payload_preheated' ? 'companion_skills' : 'skills');
  fs.mkdirSync(frameworkPayload, { recursive: true });
  fs.mkdirSync(strategy === 'payload_preheated' ? path.join(codexPayload, 'bin') : path.dirname(codexPayload), {
    recursive: true,
  });
  fs.mkdirSync(modulesPayload, { recursive: true });
  fs.mkdirSync(skillsPayload, { recursive: true });
  fs.writeFileSync(path.join(frameworkPayload, 'package.json'), `{"name":"opl-framework-${strategy}"}\n`);
  fs.mkdirSync(path.join(frameworkPayload, 'nested', 'bin'), { recursive: true });
  fs.writeFileSync(path.join(frameworkPayload, 'nested', 'bin', 'tool.js'), `${strategy}-tool\n`);
  fs.writeFileSync(
    strategy === 'payload_preheated' ? path.join(codexPayload, 'bin', 'codex') : codexPayload,
    `codex-${strategy}\n`,
  );
  fs.writeFileSync(path.join(skillsPayload, 'seed.json'), '{"skills":[]}\n');
  fs.writeFileSync(path.join(modulesPayload, 'seed.json'), '{"modules":[]}\n');
  return { frameworkPayload, codexPayload, modulesPayload, skillsPayload };
}

test('system seed-apply records env image manifest and stays idempotent', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-seed-apply-home-'));
  const dataDir = path.join(homeRoot, 'data');
  const stateDir = path.join(dataDir, 'opl', 'state');
  const projectsDir = path.join(homeRoot, 'project-volume');
  const seedDir = path.join(homeRoot, 'image-seed');
  const imageManifestPath = path.join(homeRoot, 'image-manifest.json');
  fs.mkdirSync(seedDir, { recursive: true });
  fs.writeFileSync(imageManifestPath, JSON.stringify({
    image_version: '26.6.30-webui',
    image_digest: 'sha256:seed123',
    seed_strategy: 'payload_manifest',
  }, null, 2));

  try {
    const env = {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
      AIONUI_DATA_DIR: dataDir,
      OPL_PROJECTS_DIR: projectsDir,
      OPL_IMAGE_MANIFEST_PATH: imageManifestPath,
      OPL_IMAGE_SEED_DIR: seedDir,
      PATH: process.env.PATH ?? '',
    };
    const first = runCli(['system', 'seed-apply'], env).system_action;
    assert.equal(first.status, 'applied');
    assert.equal(first.details.image.version, '26.6.30-webui');
    assert.equal(first.details.image.digest, 'sha256:seed123');
    assert.equal(first.details.image.seed_strategy_status, 'accepted');
    assert.equal(first.details.install.manifest_file, path.join(stateDir, 'install-manifest.json'));
    assert.equal(first.details.install.created_directories.includes(projectsDir), true);
    assert.equal(first.details.authority_boundary.can_write_domain_truth, false);
    assert.equal(first.details.authority_boundary.can_claim_ready_or_current, false);
    const components = new Map<string, any>(first.details.components.map((component: any) => [component.component_id, component] as [string, any]));
    assert.equal(components.get('image_manifest')?.state, 'current');
    assert.equal(components.get('projects_dir')?.state, 'current');
    const persisted = parseJsonText(fs.readFileSync(path.join(stateDir, 'install-manifest.json'), 'utf8')) as any;
    assert.equal(persisted.install.projects_dir, projectsDir);

    const second = runCli(['system', 'seed-apply'], env).system_action;
    assert.equal(second.status, 'applied');
    assert.equal(second.details.install.created_directories.length, 0);
  } finally {
    removeTree(homeRoot);
  }
});

test('system seed-apply materializes payload metadata but preserves existing framework root', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-seed-payload-home-'));
  const seedDir = path.join(homeRoot, 'image-seed');
  const dataDir = path.join(homeRoot, 'data');
  const stateDir = path.join(dataDir, 'opl', 'state');
  const projectsDir = path.join(dataDir, 'projects');
  try {
    writeImageManifest(seedDir, 'payload_manifest');
    writeSeedMetadata(seedDir, 'payload_manifest');
    const payloads = writePayloadFiles(seedDir, 'payload_manifest');
    fs.mkdirSync(path.join(dataDir, 'opl', 'framework'), { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'opl', 'framework', 'package.json'), '{"name":"local-framework"}\n');

    const output = runCli(['system', 'seed-apply', '--from', seedDir, '--data-dir', dataDir, '--projects-dir', projectsDir], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
      PATH: process.env.PATH ?? '',
    }).system_action;
    assert.equal(output.status, 'applied');
    assert.equal(output.details.seed_metadata.metadata_status, 'found');
    assert.equal(fs.readFileSync(path.join(dataDir, 'opl', 'framework', 'package.json'), 'utf8'), '{"name":"local-framework"}\n');
    assert.equal(fs.readFileSync(path.join(dataDir, 'opl', 'framework', 'nested', 'bin', 'tool.js'), 'utf8'), 'payload_manifest-tool\n');
    assert.equal(fs.existsSync(path.join(dataDir, 'opl', 'toolchains', 'codex', 'codex')), true);
    assert.equal(fs.existsSync(path.join(dataDir, 'opl', 'skills', 'seed.json')), true);
    const components = new Map<string, any>(output.details.components.map((component: any) => [component.component_id, component] as [string, any]));
    assert.equal(components.get('opl_framework')?.payload_path, payloads.frameworkPayload);
    assert.equal(components.get('codex_cli')?.checksum_sha256, 'sha256:declared-codex-payload_manifest');
    assert.equal(components.get('domain_modules')?.source_fingerprint, 'modules:payload_manifest');
    assert.equal(output.details.reconcile.image_seed_receipts_count >= 5, true);
    assert.equal(output.details.reconcile.migration_receipts_count, 0);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('system seed-apply records preheated payloads without copying runtime trees', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-seed-preheated-home-'));
  const seedDir = path.join(homeRoot, 'image-seed');
  const dataDir = path.join(homeRoot, 'data');
  const stateDir = path.join(dataDir, 'opl', 'state');
  const projectsDir = path.join(dataDir, 'projects');
  try {
    writeImageManifest(seedDir, 'payload_preheated');
    writeSeedMetadata(seedDir, 'payload_preheated');
    const payloads = writePayloadFiles(seedDir, 'payload_preheated');
    fs.mkdirSync(path.join(payloads.frameworkPayload, 'node_modules', 'large-package'), { recursive: true });
    fs.writeFileSync(path.join(payloads.frameworkPayload, 'node_modules', 'large-package', 'index.js'), 'preheated-runtime\n');

    const output = runCli(['system', 'seed-apply', '--from', seedDir, '--data-dir', dataDir, '--projects-dir', projectsDir], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
      PATH: process.env.PATH ?? '',
    }).system_action;
    assert.equal(output.status, 'applied');
    assert.equal(fs.existsSync(path.join(dataDir, 'opl', 'framework', 'node_modules')), false);
    assert.equal(fs.existsSync(path.join(dataDir, 'opl', 'toolchains', 'codex', 'bin', 'codex')), false);
    const components = new Map<string, any>(output.details.components.map((component: any) => [component.component_id, component] as [string, any]));
    assert.equal(components.get('opl_framework')?.reason, 'image_seed_payload_preheated');
    assert.equal(components.get('opl_framework')?.materialized_path, payloads.frameworkPayload);
    assert.equal(components.get('codex_cli')?.materialized_path, payloads.codexPayload);
    const receipt = output.details.receipts.find((entry: any) => entry.component_id === 'opl_framework');
    assert.equal(receipt?.source_path, payloads.frameworkPayload);
    assert.equal(receipt?.target_path, payloads.frameworkPayload);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('system seed-apply rejects non-canonical full seed strategy names', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-seed-strategy-home-'));
  const seedDir = path.join(homeRoot, 'image-seed');
  const dataDir = path.join(homeRoot, 'data');
  const stateDir = path.join(dataDir, 'opl', 'state');
  try {
    writeImageManifest(seedDir, 'manifest_payload_dir', '26.7.2-webui');
    fs.writeFileSync(path.join(seedDir, 'metadata.json'), JSON.stringify({
      schema: 'dev.onepersonlab.opl-webui-image-seed.v1',
      components: [],
    }, null, 2));
    const output = runCli(['system', 'seed-apply', '--from', seedDir, '--data-dir', dataDir], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
      PATH: process.env.PATH ?? '',
    }).system_action;
    assert.equal(output.status, 'pending');
    assert.equal(output.details.image.seed_strategy, 'invalid');
    assert.equal(output.details.image.seed_strategy_status, 'blocked');
    assert.equal(output.details.image.seed_strategy_reason, 'unknown_seed_strategy');
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('system startup-maintenance reports seed boundary for WebUI first run', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-startup-maintenance-seed-home-'));
  const dataDir = path.join(homeRoot, 'data');
  const stateDir = path.join(dataDir, 'opl', 'state');
  const projectsDir = path.join(homeRoot, 'project-volume');
  const imageManifestPath = path.join(homeRoot, 'image-manifest.json');
  const developerCheckout = path.join(homeRoot, 'developer-module-checkout');
  fs.writeFileSync(imageManifestPath, JSON.stringify({
    image_version: '26.6.31-webui',
    image_digest: 'sha256:seed456',
    seed_strategy: 'payload_preheated',
  }, null, 2));
  writeDeveloperCheckout(developerCheckout);

  try {
    const env = {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_STATE_DIR: stateDir,
      AIONUI_DATA_DIR: dataDir,
      OPL_PROJECTS_DIR: projectsDir,
      OPL_IMAGE_MANIFEST_PATH: imageManifestPath,
      OPL_IMAGE_SEED_DIR: path.join(homeRoot, 'missing-seed-dir'),
      OPL_MODULES_ROOT: path.join(homeRoot, 'managed-modules'),
      OPL_MODULE_PATH_MEDAUTOSCIENCE: developerCheckout,
      OPL_MODULE_PATH_MEDAUTOGRANT: developerCheckout,
      OPL_MODULE_PATH_REDCUBE: developerCheckout,
      OPL_MODULE_PATH_OPLMETAAGENT: developerCheckout,
      OPL_MODULE_PATH_OPLBOOKFORGE: developerCheckout,
      OPL_MODULE_PATH_SCHOLARSKILLS: developerCheckout,
      OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
      PATH: process.env.PATH ?? '',
    };
    const output = withCliTimeout('120000', () => runCli(['system', 'startup-maintenance'], env)).system_action.details;
    assert.equal(output.seed_boundary.image.version, '26.6.31-webui');
    assert.equal(output.seed_boundary.image.seed_strategy_status, 'accepted');
    assert.equal(output.seed_boundary.install.projects_dir, projectsDir);
    assert.equal(output.docker_webui_startup.startup_state.phase, 'api_key_missing');
    assert.equal(output.docker_webui_startup.startup_state.seed_applied, true);
    assert.equal(output.docker_webui_startup.startup_state.can_claim_runtime_ready, false);
    assert.equal(output.docker_webui_startup.api_key.value_redacted, true);
    assert.equal(output.refreshed_system_environment.seed_install.status, 'applied');
    assert.equal(output.refreshed_system_environment.seed_install.readiness_claim, 'not_claimed');

    const initialize = runCli(['system', 'initialize'], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
      PATH: process.env.PATH ?? '',
    }).system_initialize.seed_install;
    assert.equal(initialize.status, 'applied');
    assert.equal(initialize.image_version, '26.6.31-webui');
    assert.equal(initialize.can_claim_ready_or_current, false);
  } finally {
    removeTree(homeRoot);
  }
});

test('system startup-maintenance accepts runtime substrate scope for WebUI entrypoint startup', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-startup-maintenance-runtime-substrate-home-'));
  const dataDir = path.join(homeRoot, 'data');
  const stateDir = path.join(dataDir, 'opl', 'state');
  const projectsDir = path.join(homeRoot, 'project-volume');
  const imageManifestPath = path.join(homeRoot, 'image-manifest.json');
  fs.writeFileSync(imageManifestPath, JSON.stringify({
    image_version: '26.7.1-webui',
    image_digest: 'sha256:runtime-substrate',
    seed_strategy: 'payload_preheated',
  }, null, 2));

  try {
    const output = withCliTimeout('120000', () => runCli(['system', 'startup-maintenance', '--scope', 'runtime_substrate'], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_STATE_DIR: stateDir,
      AIONUI_DATA_DIR: dataDir,
      OPL_PROJECTS_DIR: projectsDir,
      OPL_IMAGE_MANIFEST_PATH: imageManifestPath,
      OPL_IMAGE_SEED_DIR: path.join(homeRoot, 'missing-seed-dir'),
      OPL_MODULES_ROOT: path.join(homeRoot, 'managed-modules'),
      OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
      PATH: process.env.PATH ?? '',
    })).system_action.details;

    assert.equal(output.mode, 'runtime_substrate_adapter_startup');
    assert.equal(output.scope, 'runtime_substrate');
    assert.equal(output.summary.total_targets_count, 0);
    assert.deepEqual(output.module_targets, []);
    assert.equal(output.seed_boundary.image.version, '26.7.1-webui');
    assert.equal(output.seed_boundary.image.seed_strategy_status, 'accepted');
  } finally {
    removeTree(homeRoot);
  }
});

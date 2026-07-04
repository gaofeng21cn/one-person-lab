import { assert, fs, os, path, runCli, test } from '../helpers.ts';
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

test('system seed-apply records env-driven image manifest and is idempotent', () => {
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
    generated_from: 'test-fixture',
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
    const first = runCli(['system', 'seed-apply'], env) as {
      system_action: {
        status: string;
        details: {
          surface_kind: string;
          status: string;
          image: {
            source_manifest_status: string;
            version: string | null;
            digest: string | null;
            seed_strategy: string;
            seed_strategy_status: string;
          };
          install: {
            manifest_file: string;
            data_dir: string;
            projects_dir: string;
            created_directories: string[];
          };
          components: Array<{
            component_id: string;
            state: string;
            reason: string;
            path: string | null;
          }>;
          authority_boundary: {
            can_write_domain_truth: boolean;
            can_write_runtime_db: boolean;
            can_create_owner_receipt: boolean;
            can_claim_ready_or_current: boolean;
          };
        };
      };
    };

    assert.equal(first.system_action.status, 'applied');
    assert.equal(first.system_action.details.surface_kind, 'opl_seed_install_manifest');
    assert.equal(first.system_action.details.status, 'applied');
    assert.equal(first.system_action.details.image.source_manifest_status, 'found');
    assert.equal(first.system_action.details.image.version, '26.6.30-webui');
    assert.equal(first.system_action.details.image.digest, 'sha256:seed123');
    assert.equal(first.system_action.details.image.seed_strategy, 'payload_manifest');
    assert.equal(first.system_action.details.image.seed_strategy_status, 'accepted');
    assert.equal(first.system_action.details.install.manifest_file, path.join(stateDir, 'install-manifest.json'));
    assert.equal(first.system_action.details.install.data_dir, dataDir);
    assert.equal(first.system_action.details.install.projects_dir, projectsDir);
    assert.equal(fs.existsSync(dataDir), true);
    assert.equal(fs.existsSync(projectsDir), true);
    assert.equal(first.system_action.details.install.created_directories.includes(projectsDir), true);
    assert.equal(first.system_action.details.authority_boundary.can_write_domain_truth, false);
    assert.equal(first.system_action.details.authority_boundary.can_write_runtime_db, false);
    assert.equal(first.system_action.details.authority_boundary.can_create_owner_receipt, false);
    assert.equal(first.system_action.details.authority_boundary.can_claim_ready_or_current, false);
    const components = new Map(first.system_action.details.components.map((component) => [
      component.component_id,
      component,
    ]));
    assert.equal(components.get('image_manifest')?.state, 'current');
    assert.equal(components.get('opl_framework')?.state, 'current');
    assert.equal(components.get('companion_skills')?.state, 'not_available');
    assert.equal(components.get('domain_modules')?.state, 'not_available');
    assert.equal(components.get('data_dir')?.state, 'current');
    assert.equal(components.get('projects_dir')?.state, 'current');

    const persisted = JSON.parse(fs.readFileSync(path.join(stateDir, 'install-manifest.json'), 'utf8'));
    assert.equal(persisted.image.version, '26.6.30-webui');
    assert.equal(persisted.install.data_dir, dataDir);
    assert.equal(persisted.install.projects_dir, projectsDir);

    const second = runCli(['system', 'seed-apply'], env) as typeof first;
    assert.equal(second.system_action.status, 'applied');
    assert.equal(second.system_action.details.install.created_directories.length, 0);
    assert.equal(second.system_action.details.components.length, 7);
  } finally {
    removeTree(homeRoot);
  }
});

test('system seed-apply preserves existing managed OPL Framework runtime root in data volume', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-seed-framework-preserve-home-'));
  const dataDir = path.join(homeRoot, 'data');
  const stateDir = path.join(dataDir, 'opl', 'state');
  const seedDir = path.join(homeRoot, 'image-seed');
  const imageManifestPath = path.join(homeRoot, 'image-manifest.json');
  const seedFramework = path.join(seedDir, 'framework');
  const dataFramework = path.join(dataDir, 'opl', 'framework');

  try {
    writeMinimalFrameworkRoot(seedFramework, 'image-seed-framework');
    writeMinimalFrameworkRoot(dataFramework, 'runtime-updated-framework');
    fs.writeFileSync(imageManifestPath, JSON.stringify({
      image_version: '26.7.1-webui',
      image_digest: 'sha256:seed-preserve',
      seed_strategy: 'payload_manifest',
    }, null, 2));
    fs.writeFileSync(path.join(seedDir, 'metadata.json'), JSON.stringify({
      strategy: 'payload_manifest',
      components: [
        {
          id: 'opl_framework',
          source: 'framework',
          payload_path: 'framework',
          version: '26.7.1-image-seed',
        },
      ],
    }, null, 2));

    const output = runCli(['system', 'seed-apply'], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
      OPL_DATA_DIR: dataDir,
      OPL_IMAGE_MANIFEST_PATH: imageManifestPath,
      OPL_IMAGE_SEED_DIR: seedDir,
      PATH: process.env.PATH ?? '',
    }) as {
      system_action: {
        details: {
          components: Array<{
            component_id: string;
            reason: string;
            materialized_path: string | null;
          }>;
        };
      };
    };

    const framework = output.system_action.details.components.find((component) => component.component_id === 'opl_framework');
    assert.equal(framework?.reason, 'image_seed_payload_materialized');
    assert.equal(framework?.materialized_path, dataFramework);
    assert.equal(fs.readFileSync(path.join(dataFramework, 'MARKER.txt'), 'utf8'), 'runtime-updated-framework\n');
  } finally {
    removeTree(homeRoot);
  }
});

test('system seed-apply materializes image seed contract into data volume receipts', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-seed-apply-contract-home-'));
  const seedDir = path.join(homeRoot, 'image-seed');
  const dataDir = path.join(homeRoot, 'data');
  const projectsDir = path.join(dataDir, 'projects');
  const frameworkPayload = path.join(seedDir, 'framework');
  const codexPayload = path.join(seedDir, 'toolchain', 'codex');
  const modulesPayload = path.join(seedDir, 'modules');
  const skillsPayload = path.join(seedDir, 'skills');
  fs.mkdirSync(frameworkPayload, { recursive: true });
  fs.mkdirSync(path.dirname(codexPayload), { recursive: true });
  fs.mkdirSync(modulesPayload, { recursive: true });
  fs.mkdirSync(skillsPayload, { recursive: true });
  fs.writeFileSync(path.join(frameworkPayload, 'package.json'), '{"name":"opl-framework-seed"}\n');
  fs.mkdirSync(path.join(frameworkPayload, 'nested', 'bin'), { recursive: true });
  fs.writeFileSync(path.join(frameworkPayload, 'nested', 'bin', 'tool.js'), 'seed-tool\n');
  fs.writeFileSync(codexPayload, 'codex-binary-fixture\n');
  fs.writeFileSync(path.join(skillsPayload, 'skills.json'), '{"skills":["companion"]}\n');
  fs.writeFileSync(path.join(modulesPayload, 'modules.json'), '{"modules":["domain"]}\n');
  fs.mkdirSync(path.join(dataDir, 'opl', 'framework'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'opl', 'framework', 'package.json'), '{"name":"local-framework"}\n');
  fs.writeFileSync(path.join(seedDir, 'image-manifest.json'), JSON.stringify({
    image_version: '26.7.1-webui',
    image_digest: 'sha256:image-contract',
    seed_strategy: 'payload_manifest',
  }, null, 2));
  fs.writeFileSync(path.join(seedDir, 'metadata.json'), JSON.stringify({
    schema: 'dev.onepersonlab.opl-webui-image-seed.v1',
    components: [
      {
        id: 'opl_framework',
        version: '0.1.0-seed',
        source: 'image:/opt/opl/framework',
        receipt_kind: 'image_seed',
        payload_path: 'framework',
        source_fingerprint: 'git:framework-fixture',
      },
      {
        id: 'codex_cli',
        version: 'codex-0.99.0',
        source: 'image:/opt/opl/toolchain/codex',
        receipt_kind: 'image_seed',
        payload_path: 'toolchain/codex',
        sha256: 'sha256:declared-codex',
        size_bytes: 123,
      },
      {
        id: 'companion_skills',
        version: 'skills-2026-07-01',
        source: 'image:/opt/opl/skills',
        receipt_kind: 'image_seed',
        payload_path: 'skills',
        source_fingerprint: 'skills:fixture',
      },
      {
        id: 'domain_modules',
        version: 'modules-2026-07-01',
        source: 'image:/opt/opl/modules',
        receipt_kind: 'image_seed',
        payload_path: 'modules',
        source_fingerprint: 'modules:fixture',
      },
    ],
  }, null, 2));

  try {
    const output = runCli([
      'system',
      'seed-apply',
      '--from',
      seedDir,
      '--data-dir',
      dataDir,
      '--projects-dir',
      projectsDir,
    ], {
      HOME: homeRoot,
      PATH: process.env.PATH ?? '',
    }) as {
      system_action: {
        status: string;
        details: {
          install: {
            manifest_file: string;
            data_dir: string;
            projects_dir: string;
          };
          image: {
            seed_strategy: string;
            seed_strategy_status: string;
          };
          seed_metadata: {
            schema: string | null;
            metadata_path: string | null;
            metadata_status: string;
          };
          components: Array<{
            component_id: string;
            component_kind: string;
            source: string | null;
            payload_path: string | null;
            materialized_path: string | null;
            version: string | null;
            receipt_kind: string | null;
            receipt_ref: string;
            sha256: string | null;
            checksum_sha256: string | null;
            source_fingerprint: string | null;
            size_bytes: number | null;
          }>;
          receipts: Array<{
            operation: string;
            component_id: string;
            status: string;
            source_path: string | null;
            target_path: string | null;
            to_version: string | null;
            receipt_kind: string | null;
            sha256: string | null;
            checksum_sha256: string | null;
            source_fingerprint: string | null;
            size_bytes: number | null;
          }>;
          reconcile: {
            status: string;
            image_seed_receipts_count: number;
            managed_update_receipts_count: number;
            migration_receipts_count: number;
            previous_manifest_status: string;
          };
        };
      };
    };

    assert.equal(output.system_action.status, 'applied');
    assert.equal(output.system_action.details.install.manifest_file, path.join(dataDir, 'opl', 'state', 'install-manifest.json'));
    assert.equal(output.system_action.details.install.data_dir, dataDir);
    assert.equal(output.system_action.details.install.projects_dir, projectsDir);
    assert.equal(fs.existsSync(path.join(dataDir, 'opl', 'framework', 'package.json')), true);
    assert.equal(fs.readFileSync(path.join(dataDir, 'opl', 'framework', 'package.json'), 'utf8'), '{"name":"local-framework"}\n');
    assert.equal(fs.readFileSync(path.join(dataDir, 'opl', 'framework', 'nested', 'bin', 'tool.js'), 'utf8'), 'seed-tool\n');
    assert.equal(fs.existsSync(path.join(dataDir, 'opl', 'toolchains', 'codex', 'codex')), true);
    assert.equal(fs.existsSync(path.join(dataDir, 'opl', 'skills', 'skills.json')), true);
    assert.equal(fs.existsSync(path.join(dataDir, 'opl', 'modules', 'modules.json')), true);
    assert.equal(output.system_action.details.image.seed_strategy, 'payload_manifest');
    assert.equal(output.system_action.details.image.seed_strategy_status, 'accepted');
    assert.equal(output.system_action.details.seed_metadata.schema, 'dev.onepersonlab.opl-webui-image-seed.v1');
    assert.equal(output.system_action.details.seed_metadata.metadata_path, path.join(seedDir, 'metadata.json'));
    assert.equal(output.system_action.details.seed_metadata.metadata_status, 'found');

    const components = new Map<string, (typeof output.system_action.details.components)[number]>(
      output.system_action.details.components.map((component) => [
        component.component_id,
        component,
      ]),
    );
    assert.equal(components.has('framework_install_dir'), false);
    assert.equal(components.has('codex_toolchain'), false);
    assert.equal(components.has('modules_skills'), false);
    const framework = components.get('opl_framework');
    assert.equal(framework?.component_kind, 'image_seed');
    assert.equal(framework?.source, 'image:/opt/opl/framework');
    assert.equal(framework?.payload_path, frameworkPayload);
    assert.equal(framework?.materialized_path, path.join(dataDir, 'opl', 'framework'));
    assert.equal(framework?.version, '0.1.0-seed');
    assert.equal(framework?.receipt_kind, 'image_seed');
    assert.equal(framework?.receipt_ref.startsWith('opl://system-seed/image_seed/opl_framework/'), true);
    assert.equal(framework?.source_fingerprint, 'git:framework-fixture');
    assert.equal(typeof framework?.size_bytes, 'number');

    const codex = components.get('codex_cli');
    assert.equal(codex?.component_kind, 'image_seed');
    assert.equal(codex?.sha256, 'sha256:declared-codex');
    assert.equal(codex?.checksum_sha256, 'sha256:declared-codex');
    assert.equal(codex?.size_bytes, 123);
    assert.equal(codex?.materialized_path, path.join(dataDir, 'opl', 'toolchains', 'codex', 'codex'));

    const skills = components.get('companion_skills');
    assert.equal(skills?.version, 'skills-2026-07-01');
    assert.equal(skills?.source_fingerprint, 'skills:fixture');
    assert.equal(skills?.materialized_path, path.join(dataDir, 'opl', 'skills'));

    assert.equal(output.system_action.details.reconcile.previous_manifest_status, 'missing');
    assert.equal(output.system_action.details.reconcile.image_seed_receipts_count >= 5, true);
    assert.equal(output.system_action.details.reconcile.managed_update_receipts_count >= 0, true);
    assert.equal(output.system_action.details.reconcile.migration_receipts_count, 0);
    assert.equal(
      output.system_action.details.receipts.some((receipt) =>
        receipt.operation === 'image_seed'
        && receipt.component_id === 'domain_modules'
        && receipt.status === 'completed'
        && receipt.to_version === 'modules-2026-07-01'
        && receipt.receipt_kind === 'image_seed'
        && receipt.source_fingerprint === 'modules:fixture'
      ),
      true,
    );

    const persisted = JSON.parse(fs.readFileSync(path.join(dataDir, 'opl', 'state', 'install-manifest.json'), 'utf8'));
    assert.equal(persisted.components.some((component: { source: string }) => component.source === 'image:/opt/opl/framework'), true);
    assert.equal(
      persisted.components.some((component: { component_id: string }) =>
        ['framework_install_dir', 'codex_toolchain', 'modules_skills'].includes(component.component_id)
      ),
      false,
    );

    const second = runCli([
      'system',
      'seed-apply',
      '--from',
      seedDir,
      '--data-dir',
      dataDir,
      '--projects-dir',
      projectsDir,
    ], {
      HOME: homeRoot,
      PATH: process.env.PATH ?? '',
    }) as typeof output;
    assert.equal(second.system_action.details.reconcile.previous_manifest_status, 'found');
    assert.equal(second.system_action.details.reconcile.migration_receipts_count, 2);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('system seed-apply records preheated image seed payloads without copying large runtime trees into data volume', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-seed-apply-preheated-home-'));
  const seedDir = path.join(homeRoot, 'image-seed');
  const dataDir = path.join(homeRoot, 'data');
  const projectsDir = path.join(dataDir, 'projects');
  const frameworkPayload = path.join(seedDir, 'payload', 'opl_framework');
  const codexPayload = path.join(seedDir, 'payload', 'codex_cli');
  const modulesPayload = path.join(seedDir, 'payload', 'domain_modules');
  const skillsPayload = path.join(seedDir, 'payload', 'companion_skills');
  fs.mkdirSync(path.join(frameworkPayload, 'node_modules', 'large-package'), { recursive: true });
  fs.mkdirSync(path.join(codexPayload, 'bin'), { recursive: true });
  fs.mkdirSync(modulesPayload, { recursive: true });
  fs.mkdirSync(skillsPayload, { recursive: true });
  fs.writeFileSync(path.join(frameworkPayload, 'package.json'), '{"name":"opl-framework-preheated"}\n');
  fs.writeFileSync(path.join(frameworkPayload, 'node_modules', 'large-package', 'index.js'), 'preheated-runtime\n');
  fs.writeFileSync(path.join(codexPayload, 'bin', 'codex'), 'codex-preheated\n');
  fs.writeFileSync(path.join(skillsPayload, 'seed.json'), '{"skills":[]}\n');
  fs.writeFileSync(path.join(modulesPayload, 'seed.json'), '{"modules":[]}\n');
  fs.writeFileSync(path.join(seedDir, 'image-manifest.json'), JSON.stringify({
    image_version: '26.7.1-webui',
    image_digest: 'sha256:image-preheated',
    seed_strategy: 'payload_manifest',
  }, null, 2));
  fs.writeFileSync(path.join(seedDir, 'metadata.json'), JSON.stringify({
    schema: 'dev.onepersonlab.opl-webui-image-seed.v1',
    strategy: 'payload_preheated',
    components: [
      {
        id: 'opl_framework',
        version: '0.1.0-preheated',
        source: 'image:/opt/opl/seed/payload/opl_framework',
        receipt_kind: 'image_seed',
        payload_path: 'payload/opl_framework',
        source_fingerprint: 'git:framework-preheated',
      },
      {
        id: 'codex_cli',
        version: 'codex-preheated',
        source: 'image:/opt/opl/seed/payload/codex_cli',
        receipt_kind: 'image_seed',
        payload_path: 'payload/codex_cli',
        sha256: 'sha256:declared-codex-preheated',
      },
      {
        id: 'companion_skills',
        version: 'skills-preheated',
        source: 'image:/opt/opl/seed/payload/companion_skills',
        receipt_kind: 'image_seed',
        payload_path: 'payload/companion_skills',
        source_fingerprint: 'skills:preheated',
      },
      {
        id: 'domain_modules',
        version: 'modules-preheated',
        source: 'image:/opt/opl/seed/payload/domain_modules',
        receipt_kind: 'image_seed',
        payload_path: 'payload/domain_modules',
        source_fingerprint: 'modules:preheated',
      },
    ],
  }, null, 2));

  try {
    const output = runCli([
      'system',
      'seed-apply',
      '--from',
      seedDir,
      '--data-dir',
      dataDir,
      '--projects-dir',
      projectsDir,
    ], {
      HOME: homeRoot,
      PATH: process.env.PATH ?? '',
    }) as {
      system_action: {
        status: string;
        details: {
          components: Array<{
            component_id: string;
            state: string;
            reason: string;
            component_kind: string;
            payload_path: string | null;
            materialized_path: string | null;
          }>;
          receipts: Array<{
            component_id: string;
            status: string;
            reason: string;
            source_path: string | null;
            target_path: string | null;
          }>;
        };
      };
    };

    assert.equal(output.system_action.status, 'applied');
    assert.equal(fs.existsSync(path.join(dataDir, 'opl', 'framework', 'node_modules')), false);
    assert.equal(fs.existsSync(path.join(dataDir, 'opl', 'toolchains', 'codex', 'bin', 'codex')), false);

    const components = new Map<string, (typeof output.system_action.details.components)[number]>(
      output.system_action.details.components.map((component) => [
        component.component_id,
        component,
      ]),
    );
    const framework = components.get('opl_framework');
    assert.equal(framework?.state, 'current');
    assert.equal(framework?.component_kind, 'image_seed');
    assert.equal(framework?.reason, 'image_seed_payload_preheated');
    assert.equal(framework?.payload_path, frameworkPayload);
    assert.equal(framework?.materialized_path, frameworkPayload);

    const codex = components.get('codex_cli');
    assert.equal(codex?.reason, 'image_seed_payload_preheated');
    assert.equal(codex?.materialized_path, codexPayload);

    const receipt = output.system_action.details.receipts.find((entry) => entry.component_id === 'opl_framework');
    assert.equal(receipt?.status, 'completed');
    assert.equal(receipt?.reason, 'image_seed_payload_preheated');
    assert.equal(receipt?.source_path, frameworkPayload);
    assert.equal(receipt?.target_path, frameworkPayload);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('system seed-apply rejects non-canonical full seed strategy names', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-seed-apply-strategy-home-'));
  const seedDir = path.join(homeRoot, 'image-seed');
  const dataDir = path.join(homeRoot, 'data');
  fs.mkdirSync(seedDir, { recursive: true });
  fs.writeFileSync(path.join(seedDir, 'image-manifest.json'), JSON.stringify({
    image_version: '26.7.2-webui',
    image_digest: 'sha256:strategy',
    seed_strategy: 'manifest_payload_dir',
  }, null, 2));
  fs.writeFileSync(path.join(seedDir, 'metadata.json'), JSON.stringify({
    schema: 'dev.onepersonlab.opl-webui-image-seed.v1',
    components: [],
  }, null, 2));

  try {
    const output = runCli(['system', 'seed-apply', '--from', seedDir, '--data-dir', dataDir], {
      HOME: homeRoot,
      PATH: process.env.PATH ?? '',
    }) as {
      system_action: {
        status: string;
        details: {
          image: {
            seed_strategy: string;
            seed_strategy_status: string;
            seed_strategy_reason: string;
          };
          reconcile: {
            status: string;
          };
        };
      };
    };

    assert.equal(output.system_action.status, 'pending');
    assert.equal(output.system_action.details.image.seed_strategy, 'invalid');
    assert.equal(output.system_action.details.image.seed_strategy_status, 'blocked');
    assert.equal(output.system_action.details.image.seed_strategy_reason, 'unknown_seed_strategy');
    assert.equal(output.system_action.details.reconcile.status, 'pending');
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
    const output = withCliTimeout('120000', () => runCli(['system', 'startup-maintenance'], {
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
      PATH: process.env.PATH ?? '',
      ...{ OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1' },
    })) as {
      system_action: {
        details: {
          seed_boundary: {
            surface_kind: string;
            image: {
              source_manifest_status: string;
              version: string | null;
              digest: string | null;
              seed_strategy: string;
              seed_strategy_status: string;
            };
            install: {
              manifest_file: string;
              data_dir: string;
              projects_dir: string;
            };
            components: Array<{
              component_id: string;
              state: string;
              reason: string;
            }>;
          };
          docker_webui_startup: {
            startup_state: {
              phase: string;
              seed_applied: boolean;
              api_key_present: boolean;
              runtime_readiness_claim: string;
              can_claim_runtime_ready: boolean;
            };
            startup_maintenance: {
              status: string;
              execution_policy: string;
            };
            api_key: {
              status: string;
              present: boolean;
              value_redacted: boolean;
            };
            diagnostic_summary: {
              status: string;
              startup_maintenance_status: string;
              can_claim_runtime_ready: boolean;
            };
          };
          refreshed_system_environment: {
            seed_install: {
              status: string;
              startup_state: string;
              seed_applied: boolean;
              needs_startup_maintenance: boolean;
              image_version: string | null;
              image_digest: string | null;
              data_dir: string | null;
              projects_dir: string | null;
              manifest_file: string;
              api_key_status: string;
              api_key_present: boolean;
              readiness_claim: string;
              can_claim_ready_or_current: boolean;
            };
          };
        };
      };
    };

    assert.equal(output.system_action.details.seed_boundary.surface_kind, 'opl_seed_install_manifest');
    assert.equal(output.system_action.details.seed_boundary.image.source_manifest_status, 'found');
    assert.equal(output.system_action.details.seed_boundary.image.version, '26.6.31-webui');
    assert.equal(output.system_action.details.seed_boundary.image.digest, 'sha256:seed456');
    assert.equal(output.system_action.details.seed_boundary.image.seed_strategy, 'payload_preheated');
    assert.equal(output.system_action.details.seed_boundary.image.seed_strategy_status, 'accepted');
    assert.equal(output.system_action.details.seed_boundary.install.manifest_file, path.join(stateDir, 'install-manifest.json'));
    assert.equal(output.system_action.details.seed_boundary.install.data_dir, dataDir);
    assert.equal(output.system_action.details.seed_boundary.install.projects_dir, projectsDir);
    const components = new Map<string, (typeof output.system_action.details.seed_boundary.components)[number]>(
      output.system_action.details.seed_boundary.components.map((component) => [
        component.component_id,
        component,
      ]),
    );
    assert.equal(components.get('image_manifest')?.state, 'current');
    assert.equal(components.get('companion_skills')?.state, 'not_available');
    assert.equal(components.get('domain_modules')?.state, 'not_available');
    assert.equal(components.get('data_dir')?.state, 'current');
    assert.equal(components.get('projects_dir')?.state, 'current');
    assert.equal(output.system_action.details.docker_webui_startup.startup_state.phase, 'api_key_missing');
    assert.equal(output.system_action.details.docker_webui_startup.startup_state.seed_applied, true);
    assert.equal(output.system_action.details.docker_webui_startup.startup_state.api_key_present, false);
    assert.equal(
      output.system_action.details.docker_webui_startup.startup_state.runtime_readiness_claim,
      'not_claimed',
    );
    assert.equal(output.system_action.details.docker_webui_startup.startup_state.can_claim_runtime_ready, false);
    assert.equal(output.system_action.details.docker_webui_startup.startup_maintenance.status, 'seed_applied');
    assert.equal(
      output.system_action.details.docker_webui_startup.startup_maintenance.execution_policy,
      'executed_by_startup_maintenance',
    );
    assert.equal(output.system_action.details.docker_webui_startup.api_key.status, 'missing');
    assert.equal(output.system_action.details.docker_webui_startup.api_key.present, false);
    assert.equal(output.system_action.details.docker_webui_startup.api_key.value_redacted, true);
    assert.equal(output.system_action.details.docker_webui_startup.diagnostic_summary.status, 'api_key_missing');
    assert.equal(
      output.system_action.details.docker_webui_startup.diagnostic_summary.startup_maintenance_status,
      'seed_applied',
    );
    assert.equal(output.system_action.details.docker_webui_startup.diagnostic_summary.can_claim_runtime_ready, false);
    assert.equal(output.system_action.details.refreshed_system_environment.seed_install.status, 'applied');
    assert.equal(output.system_action.details.refreshed_system_environment.seed_install.startup_state, 'seed_applied');
    assert.equal(output.system_action.details.refreshed_system_environment.seed_install.seed_applied, true);
    assert.equal(
      output.system_action.details.refreshed_system_environment.seed_install.needs_startup_maintenance,
      false,
    );
    assert.equal(output.system_action.details.refreshed_system_environment.seed_install.image_version, '26.6.31-webui');
    assert.equal(output.system_action.details.refreshed_system_environment.seed_install.data_dir, dataDir);
    assert.equal(output.system_action.details.refreshed_system_environment.seed_install.projects_dir, projectsDir);
    assert.equal(output.system_action.details.refreshed_system_environment.seed_install.api_key_status, 'not_detected');
    assert.equal(output.system_action.details.refreshed_system_environment.seed_install.api_key_present, false);
    assert.equal(output.system_action.details.refreshed_system_environment.seed_install.readiness_claim, 'not_claimed');
    assert.equal(
      output.system_action.details.refreshed_system_environment.seed_install.can_claim_ready_or_current,
      false,
    );

    const initialize = runCli(['system', 'initialize'], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
      PATH: process.env.PATH ?? '',
    }) as {
      system_initialize: {
        seed_install: {
          status: string;
          image_version: string | null;
          image_digest: string | null;
          data_dir: string | null;
          projects_dir: string | null;
          manifest_file: string;
          readiness_claim: string;
          can_claim_ready_or_current: boolean;
        };
      };
    };
    assert.equal(initialize.system_initialize.seed_install.status, 'applied');
    assert.equal(initialize.system_initialize.seed_install.image_version, '26.6.31-webui');
    assert.equal(initialize.system_initialize.seed_install.image_digest, 'sha256:seed456');
    assert.equal(initialize.system_initialize.seed_install.data_dir, dataDir);
    assert.equal(initialize.system_initialize.seed_install.projects_dir, projectsDir);
    assert.equal(initialize.system_initialize.seed_install.manifest_file, path.join(stateDir, 'install-manifest.json'));
    assert.equal(initialize.system_initialize.seed_install.readiness_claim, 'not_claimed');
    assert.equal(initialize.system_initialize.seed_install.can_claim_ready_or_current, false);
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
    const output = withCliTimeout('120000', () => runCli([
      'system',
      'startup-maintenance',
      '--scope',
      'runtime_substrate',
    ], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_STATE_DIR: stateDir,
      AIONUI_DATA_DIR: dataDir,
      OPL_PROJECTS_DIR: projectsDir,
      OPL_IMAGE_MANIFEST_PATH: imageManifestPath,
      OPL_IMAGE_SEED_DIR: path.join(homeRoot, 'missing-seed-dir'),
      OPL_MODULES_ROOT: path.join(homeRoot, 'managed-modules'),
      PATH: process.env.PATH ?? '',
      ...{ OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1' },
    })) as {
      system_action: {
        details: {
          mode: string;
          scope: string;
          summary: {
            total_targets_count: number;
          };
          capability_summary: {
            total_targets_count: number;
          };
          module_targets: unknown[];
          capability_targets: unknown[];
          seed_boundary: {
            image: {
              version: string | null;
              digest: string | null;
              seed_strategy: string;
              seed_strategy_status: string;
            };
            install: {
              data_dir: string;
              projects_dir: string;
            };
          };
        };
      };
    };

    assert.equal(output.system_action.details.mode, 'runtime_substrate_adapter_startup');
    assert.equal(output.system_action.details.scope, 'runtime_substrate');
    assert.equal(output.system_action.details.summary.total_targets_count, 0);
    assert.equal(output.system_action.details.capability_summary.total_targets_count, 0);
    assert.deepEqual(output.system_action.details.module_targets, []);
    assert.deepEqual(output.system_action.details.capability_targets, []);
    assert.equal(output.system_action.details.seed_boundary.image.version, '26.7.1-webui');
    assert.equal(output.system_action.details.seed_boundary.image.digest, 'sha256:runtime-substrate');
    assert.equal(output.system_action.details.seed_boundary.image.seed_strategy, 'payload_preheated');
    assert.equal(output.system_action.details.seed_boundary.image.seed_strategy_status, 'accepted');
    assert.equal(output.system_action.details.seed_boundary.install.data_dir, dataDir);
    assert.equal(output.system_action.details.seed_boundary.install.projects_dir, projectsDir);
  } finally {
    removeTree(homeRoot);
  }
});

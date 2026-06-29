import { assert, fs, os, path, runCli, test } from '../helpers.ts';
import { runGitFixtureCommand } from '../helpers-parts/family-fixtures.ts';
import { withCliTimeout } from './system-startup-maintenance-cases/shared.ts';

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
    assert.equal(components.get('framework_install_dir')?.state, 'current');
    assert.equal(components.get('modules_skills')?.state, 'current');
    assert.equal(components.get('data_dir')?.state, 'current');
    assert.equal(components.get('projects_dir')?.state, 'current');

    const persisted = JSON.parse(fs.readFileSync(path.join(stateDir, 'install-manifest.json'), 'utf8'));
    assert.equal(persisted.image.version, '26.6.30-webui');
    assert.equal(persisted.install.data_dir, dataDir);
    assert.equal(persisted.install.projects_dir, projectsDir);

    const second = runCli(['system', 'seed-apply'], env) as typeof first;
    assert.equal(second.system_action.status, 'applied');
    assert.equal(second.system_action.details.install.created_directories.length, 0);
    assert.equal(second.system_action.details.components.length, 6);
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
          refreshed_system_environment: {
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
      };
    };

    assert.equal(output.system_action.details.seed_boundary.surface_kind, 'opl_seed_install_manifest');
    assert.equal(output.system_action.details.seed_boundary.image.source_manifest_status, 'found');
    assert.equal(output.system_action.details.seed_boundary.image.version, '26.6.31-webui');
    assert.equal(output.system_action.details.seed_boundary.image.digest, 'sha256:seed456');
    assert.equal(output.system_action.details.seed_boundary.install.manifest_file, path.join(stateDir, 'install-manifest.json'));
    assert.equal(output.system_action.details.seed_boundary.install.data_dir, dataDir);
    assert.equal(output.system_action.details.seed_boundary.install.projects_dir, projectsDir);
    const components = new Map(output.system_action.details.seed_boundary.components.map((component) => [
      component.component_id,
      component,
    ]));
    assert.equal(components.get('image_manifest')?.state, 'current');
    assert.equal(components.get('modules_skills')?.state, 'not_available');
    assert.equal(components.get('data_dir')?.state, 'current');
    assert.equal(components.get('projects_dir')?.state, 'current');
    assert.equal(output.system_action.details.refreshed_system_environment.seed_install.status, 'applied');
    assert.equal(output.system_action.details.refreshed_system_environment.seed_install.image_version, '26.6.31-webui');
    assert.equal(output.system_action.details.refreshed_system_environment.seed_install.data_dir, dataDir);
    assert.equal(output.system_action.details.refreshed_system_environment.seed_install.projects_dir, projectsDir);
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
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

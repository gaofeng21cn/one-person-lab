import { assert, fs, os, path, runCli, test } from '../../helpers.ts';

function writeCodexConfigWithApiKey(codexHome: string) {
  fs.mkdirSync(codexHome, { recursive: true });
  fs.writeFileSync(path.join(codexHome, 'config.toml'), [
    'model_provider = "openai"',
    'model = "gpt-5.5"',
    'model_reasoning_effort = "xhigh"',
    '',
    '[model_providers.openai]',
    'name = "OpenAI"',
    'base_url = "https://api.openai.com/v1"',
    'experimental_bearer_token = "test-api-key"',
    '',
  ].join('\n'), 'utf8');
}

function writeExecutable(filePath: string, contents: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents, 'utf8');
  fs.chmodSync(filePath, 0o755);
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

function writeFakeDockerForWebuiDoctor(binDir: string) {
  writeExecutable(path.join(binDir, 'docker'), `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === 'version') {
  console.log('29.5.2');
  process.exit(0);
}
if (args[0] === 'info') {
  console.log('29.5.2');
  process.exit(0);
}
if (args[0] === 'ps') {
  console.log(JSON.stringify({
    ID: 'abc123',
    Names: 'opl_webui_test-one-person-lab-webui-1',
    Image: 'ghcr.io/gaofeng21cn/one-person-lab-webui:latest',
    Ports: '127.0.0.1:3000->3000/tcp'
  }));
  process.exit(0);
}
if (args[0] === 'inspect') {
  console.log(JSON.stringify([{
    Id: 'abc123',
    Name: '/opl_webui_test-one-person-lab-webui-1',
    Image: 'sha256:image123',
    Mounts: [
      { Source: process.env.TEST_OPL_DATA_DIR, Destination: '/data' },
      { Source: process.env.TEST_OPL_PROJECTS_DIR, Destination: '/projects' }
    ],
    NetworkSettings: {
      Ports: {
        '3000/tcp': [{ HostIp: '127.0.0.1', HostPort: '3000' }]
      }
    }
  }]));
  process.exit(0);
}
if (args[0] === 'image' && args[1] === 'inspect') {
  console.log(JSON.stringify({
    Id: 'sha256:image123',
    RepoDigests: ['ghcr.io/gaofeng21cn/one-person-lab-webui@sha256:doctor']
  }));
  process.exit(0);
}
console.error('unexpected docker args: ' + args.join(' '));
process.exit(2);
`);
}

function writeSeedInstallManifest(stateDir: string, manifest: Record<string, unknown>) {
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, 'install-manifest.json'), `${JSON.stringify({
    surface_kind: 'opl_seed_install_manifest',
    status: 'applied',
    image: {
      version: '26.7.2-webui',
      digest: 'sha256:doctor-seed',
      seed_strategy: 'payload_preheated',
      seed_strategy_status: 'accepted',
    },
    install: {
      data_dir: '/data',
      projects_dir: '/projects',
      manifest_file: path.join(stateDir, 'install-manifest.json'),
    },
    components: [],
    ...manifest,
  }, null, 2)}\n`, 'utf8');
}

test('system docker-webui doctor reports missing seed boundary without repairs', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-doctor-missing-home-'));
  const dataDir = path.join(homeRoot, 'data');
  const projectsDir = path.join(homeRoot, 'projects');
  const stateDir = path.join(homeRoot, 'state');

  try {
    const output = runCli(['system', 'docker-webui', 'doctor'], {
      HOME: homeRoot,
      AIONUI_DATA_DIR: dataDir,
      OPL_PROJECTS_DIR: projectsDir,
      OPL_STATE_DIR: stateDir,
      AIONUI_PORT: '3000',
      PATH: process.env.PATH ?? '',
    }) as {
      docker_webui_doctor: {
        surface_kind: string;
        status: string;
        summary: {
          install_manifest_status: string;
          data_dir_status: string;
          projects_dir_status: string;
          browser_url_status: string;
          api_key_status: string;
          startup_phase: string;
        };
        startup_state: {
          phase: string;
          api_key_present: boolean;
          needs_startup_maintenance: boolean;
          runtime_readiness_claim: string;
          can_claim_runtime_ready: boolean;
        };
        api_key: {
          status: string;
          present: boolean;
          value_redacted: boolean;
        };
        paths: {
          install_manifest_file: string;
        };
        observations: Array<{
          observation_id: string;
          status: string;
        }>;
        next_actions: Array<{
          action_id: string;
          status: string;
          command: string;
          reason: string;
        }>;
        authority_boundary: {
          readonly: boolean;
          executes_repairs: boolean;
          runs_startup_maintenance: boolean;
          can_claim_release_ready: boolean;
          can_claim_runtime_ready: boolean;
          can_claim_module_current: boolean;
        };
      };
    };

    assert.equal(output.docker_webui_doctor.surface_kind, 'opl_docker_webui_doctor');
    assert.equal(output.docker_webui_doctor.status, 'attention');
    assert.equal(output.docker_webui_doctor.summary.install_manifest_status, 'missing');
    assert.equal(output.docker_webui_doctor.summary.data_dir_status, 'missing');
    assert.equal(output.docker_webui_doctor.summary.projects_dir_status, 'missing');
    assert.equal(output.docker_webui_doctor.summary.browser_url_status, 'configured');
    assert.equal(output.docker_webui_doctor.summary.api_key_status, 'missing');
    assert.equal(output.docker_webui_doctor.summary.startup_phase, 'api_key_missing');
    assert.equal(output.docker_webui_doctor.startup_state.phase, 'api_key_missing');
    assert.equal(output.docker_webui_doctor.startup_state.api_key_present, false);
    assert.equal(output.docker_webui_doctor.startup_state.needs_startup_maintenance, true);
    assert.equal(output.docker_webui_doctor.startup_state.runtime_readiness_claim, 'not_claimed');
    assert.equal(output.docker_webui_doctor.startup_state.can_claim_runtime_ready, false);
    assert.equal(output.docker_webui_doctor.api_key.status, 'missing');
    assert.equal(output.docker_webui_doctor.api_key.present, false);
    assert.equal(output.docker_webui_doctor.api_key.value_redacted, true);
    assert.equal(output.docker_webui_doctor.paths.install_manifest_file, path.join(stateDir, 'install-manifest.json'));
    const observations = new Map(output.docker_webui_doctor.observations.map((entry) => [
      entry.observation_id,
      entry.status,
    ]));
    assert.equal(observations.get('docker_webui_data_dir'), 'missing');
    assert.equal(observations.get('docker_webui_projects_dir'), 'missing');
    assert.equal(observations.get('seed_install_manifest'), 'missing');
    assert.equal(observations.get('startup_maintenance_guidance'), 'not_configured');
    assert.equal(observations.get('codex_api_key'), 'missing');
    assert.equal(observations.get('browser_url'), 'configured');
    assert.deepEqual(
      output.docker_webui_doctor.next_actions.map((entry) => [entry.action_id, entry.status, entry.reason]),
      [
        ['configure_codex_api_key', 'recommended', 'codex_api_key_missing'],
        ['run_seed_apply', 'recommended', 'seed_install_manifest_missing_or_invalid'],
        ['run_startup_maintenance', 'recommended', 'seed_boundary_or_startup_maintenance_needed'],
      ],
    );
    assert.equal(output.docker_webui_doctor.authority_boundary.readonly, true);
    assert.equal(output.docker_webui_doctor.authority_boundary.executes_repairs, false);
    assert.equal(output.docker_webui_doctor.authority_boundary.runs_startup_maintenance, false);
    assert.equal(output.docker_webui_doctor.authority_boundary.can_claim_release_ready, false);
    assert.equal(output.docker_webui_doctor.authority_boundary.can_claim_runtime_ready, false);
    assert.equal(output.docker_webui_doctor.authority_boundary.can_claim_module_current, false);
    assert.equal(fs.existsSync(stateDir), false);
  } finally {
    removeTree(homeRoot);
  }
});

test('system docker-webui doctor reads persisted seed manifest and browser URL', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-doctor-seeded-home-'));
  const seedDir = path.join(homeRoot, 'image-seed');
  const dataDir = path.join(homeRoot, 'data');
  const stateDir = path.join(dataDir, 'opl', 'state');
  const projectsDir = path.join(dataDir, 'projects');
  const codexHome = path.join(homeRoot, 'codex-home');
  fs.mkdirSync(seedDir, { recursive: true });
  writeCodexConfigWithApiKey(codexHome);
  fs.writeFileSync(path.join(seedDir, 'image-manifest.json'), JSON.stringify({
    image_version: '26.7.2-webui',
    image_digest: 'sha256:doctor-seed',
    seed_strategy: 'payload_preheated',
  }, null, 2));

  try {
    runCli([
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
      OPL_STATE_DIR: stateDir,
      PATH: process.env.PATH ?? '',
    });

    const output = runCli(['system', 'docker-webui', 'doctor'], {
      HOME: homeRoot,
      CODEX_HOME: codexHome,
      AIONUI_DATA_DIR: dataDir,
      OPL_STATE_DIR: stateDir,
      AIONUI_BROWSER_URL: 'http://localhost:3000/',
      PATH: process.env.PATH ?? '',
    }) as {
      docker_webui_doctor: {
        status: string;
        summary: {
          install_manifest_status: string;
          data_dir_status: string;
          projects_dir_status: string;
          browser_url_status: string;
          api_key_status: string;
          startup_phase: string;
        };
        startup_state: {
          phase: string;
          api_key_present: boolean;
          seed_applied: boolean;
          enterable: boolean;
          runtime_readiness_claim: string;
          can_claim_runtime_ready: boolean;
        };
        install_manifest: {
          status: string;
          surface_kind: string;
          seed_status: string;
          image: {
            version: string | null;
            digest: string | null;
            seed_strategy: string | null;
            seed_strategy_status: string | null;
          };
          component_ids: string[];
          component_summary: {
            total_count: number;
            current_count: number;
          };
        };
        startup_maintenance: {
          status: string;
          command: string;
          execution_policy: string;
        };
        api_key: {
          status: string;
          present: boolean;
          value_redacted: boolean;
        };
        browser: {
          url: string | null;
          url_status: string;
        };
        next_actions: Array<{ action_id: string }>;
        authority_boundary: {
          can_write_domain_truth: boolean;
          can_write_runtime_db: boolean;
          can_create_owner_receipt: boolean;
          can_claim_runtime_ready: boolean;
        };
      };
    };

    assert.equal(output.docker_webui_doctor.status, 'ok');
    assert.equal(output.docker_webui_doctor.summary.install_manifest_status, 'found');
    assert.equal(output.docker_webui_doctor.summary.data_dir_status, 'exists');
    assert.equal(output.docker_webui_doctor.summary.projects_dir_status, 'exists');
    assert.equal(output.docker_webui_doctor.summary.browser_url_status, 'configured');
    assert.equal(output.docker_webui_doctor.summary.api_key_status, 'present');
    assert.equal(output.docker_webui_doctor.summary.startup_phase, 'enterable');
    assert.equal(output.docker_webui_doctor.startup_state.phase, 'enterable');
    assert.equal(output.docker_webui_doctor.startup_state.api_key_present, true);
    assert.equal(output.docker_webui_doctor.startup_state.seed_applied, true);
    assert.equal(output.docker_webui_doctor.startup_state.enterable, true);
    assert.equal(output.docker_webui_doctor.startup_state.runtime_readiness_claim, 'not_claimed');
    assert.equal(output.docker_webui_doctor.startup_state.can_claim_runtime_ready, false);
    assert.equal(output.docker_webui_doctor.install_manifest.status, 'found');
    assert.equal(output.docker_webui_doctor.install_manifest.surface_kind, 'opl_seed_install_manifest');
    assert.equal(output.docker_webui_doctor.install_manifest.seed_status, 'applied');
    assert.equal(output.docker_webui_doctor.install_manifest.image.version, '26.7.2-webui');
    assert.equal(output.docker_webui_doctor.install_manifest.image.digest, 'sha256:doctor-seed');
    assert.equal(output.docker_webui_doctor.install_manifest.image.seed_strategy, 'payload_preheated');
    assert.equal(output.docker_webui_doctor.install_manifest.image.seed_strategy_status, 'accepted');
    assert.deepEqual(output.docker_webui_doctor.install_manifest.component_ids, [
      'image_manifest',
      'opl_framework',
      'codex_cli',
      'companion_skills',
      'domain_modules',
      'data_dir',
      'projects_dir',
    ]);
    assert.equal(output.docker_webui_doctor.install_manifest.component_summary.total_count, 7);
    assert.equal(output.docker_webui_doctor.install_manifest.component_summary.current_count >= 3, true);
    assert.equal(output.docker_webui_doctor.startup_maintenance.status, 'seed_applied');
    assert.equal(output.docker_webui_doctor.startup_maintenance.command, 'opl system startup-maintenance --json');
    assert.equal(output.docker_webui_doctor.startup_maintenance.execution_policy, 'not_executed_by_doctor');
    assert.equal(output.docker_webui_doctor.api_key.status, 'present');
    assert.equal(output.docker_webui_doctor.api_key.present, true);
    assert.equal(output.docker_webui_doctor.api_key.value_redacted, true);
    assert.equal(output.docker_webui_doctor.browser.url, 'http://localhost:3000/');
    assert.equal(output.docker_webui_doctor.browser.url_status, 'configured');
    assert.deepEqual(
      output.docker_webui_doctor.next_actions.map((entry) => entry.action_id),
      ['run_startup_maintenance'],
    );
    assert.equal(output.docker_webui_doctor.authority_boundary.can_write_domain_truth, false);
    assert.equal(output.docker_webui_doctor.authority_boundary.can_write_runtime_db, false);
    assert.equal(output.docker_webui_doctor.authority_boundary.can_create_owner_receipt, false);
    assert.equal(output.docker_webui_doctor.authority_boundary.can_claim_runtime_ready, false);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('system docker-webui doctor reports Docker container, image, mount, and port readback when visible', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-doctor-docker-home-'));
  const dataDir = path.join(homeRoot, 'data');
  const projectsDir = path.join(homeRoot, 'projects');
  const codexHome = path.join(homeRoot, 'codex-home');
  const fakeBin = path.join(homeRoot, 'bin');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(projectsDir, { recursive: true });
  writeCodexConfigWithApiKey(codexHome);
  writeFakeDockerForWebuiDoctor(fakeBin);

  try {
    const output = runCli(['system', 'docker-webui', 'doctor'], {
      HOME: homeRoot,
      CODEX_HOME: codexHome,
      AIONUI_DATA_DIR: dataDir,
      OPL_PROJECTS_DIR: projectsDir,
      AIONUI_PORT: '3000',
      OPL_WEBUI_IMAGE: 'ghcr.io/gaofeng21cn/one-person-lab-webui:latest',
      TEST_OPL_DATA_DIR: dataDir,
      TEST_OPL_PROJECTS_DIR: projectsDir,
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
    }) as {
      docker_webui_doctor: {
        docker_runtime: {
          status: string;
          docker_cli: { status: string; client_version: string | null };
          daemon: { status: string; server_version: string | null };
          container: { status: string; id: string | null; image: string | null; ports: string | null };
          image: { ref: string | null; status: string; id: string | null; digest: string | null };
          mounts: {
            data: { status: string; expected_host_path: string | null; source: string | null; destination: string | null };
            projects: { status: string; expected_host_path: string | null; source: string | null; destination: string | null };
          };
          ports: { expected_host_port: string | null; status: string };
          authority_boundary: {
            readonly: boolean;
            starts_or_stops_containers: boolean;
            pulls_images: boolean;
            mutates_mounts: boolean;
          };
        };
        observations: Array<{ observation_id: string; status: string }>;
      };
    };

    const runtime = output.docker_webui_doctor.docker_runtime;
    assert.equal(runtime.status, 'container_visible');
    assert.equal(runtime.docker_cli.status, 'present');
    assert.equal(runtime.docker_cli.client_version, '29.5.2');
    assert.equal(runtime.daemon.status, 'reachable');
    assert.equal(runtime.daemon.server_version, '29.5.2');
    assert.equal(runtime.container.status, 'visible');
    assert.equal(runtime.container.id, 'abc123');
    assert.equal(runtime.container.image, 'ghcr.io/gaofeng21cn/one-person-lab-webui:latest');
    assert.equal(runtime.container.ports, '127.0.0.1:3000->3000/tcp');
    assert.equal(runtime.image.ref, 'ghcr.io/gaofeng21cn/one-person-lab-webui:latest');
    assert.equal(runtime.image.status, 'present');
    assert.equal(runtime.image.id, 'sha256:image123');
    assert.equal(runtime.image.digest, 'ghcr.io/gaofeng21cn/one-person-lab-webui@sha256:doctor');
    assert.equal(runtime.mounts.data.status, 'visible');
    assert.equal(runtime.mounts.data.expected_host_path, dataDir);
    assert.equal(runtime.mounts.data.source, dataDir);
    assert.equal(runtime.mounts.data.destination, '/data');
    assert.equal(runtime.mounts.projects.status, 'visible');
    assert.equal(runtime.mounts.projects.expected_host_path, projectsDir);
    assert.equal(runtime.mounts.projects.source, projectsDir);
    assert.equal(runtime.mounts.projects.destination, '/projects');
    assert.equal(runtime.ports.expected_host_port, '3000');
    assert.equal(runtime.ports.status, 'visible');
    assert.equal(runtime.authority_boundary.readonly, true);
    assert.equal(runtime.authority_boundary.starts_or_stops_containers, false);
    assert.equal(runtime.authority_boundary.pulls_images, false);
    assert.equal(runtime.authority_boundary.mutates_mounts, false);
    const observations = new Map(output.docker_webui_doctor.observations.map((entry) => [entry.observation_id, entry.status]));
    assert.equal(observations.get('docker_runtime'), 'reachable');
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('system docker-webui doctor reports initializing and repairable startup phases directly', () => {
  const initializingHome = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-doctor-initializing-home-'));
  const repairHome = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-doctor-repair-home-'));

  try {
    const initializingData = path.join(initializingHome, 'data');
    const initializingProjects = path.join(initializingHome, 'projects');
    const initializingState = path.join(initializingHome, 'state');
    const initializingCodex = path.join(initializingHome, 'codex-home');
    fs.mkdirSync(initializingData, { recursive: true });
    fs.mkdirSync(initializingProjects, { recursive: true });
    writeCodexConfigWithApiKey(initializingCodex);
    writeSeedInstallManifest(initializingState, {
      status: 'pending',
      image: {
        version: '26.7.3-webui',
        digest: 'sha256:pending',
        seed_strategy: 'payload_preheated',
        seed_strategy_status: 'pending',
      },
      install: {
        data_dir: initializingData,
        projects_dir: initializingProjects,
        manifest_file: path.join(initializingState, 'install-manifest.json'),
      },
    });

    const initializing = runCli(['system', 'docker-webui', 'doctor'], {
      HOME: initializingHome,
      CODEX_HOME: initializingCodex,
      AIONUI_DATA_DIR: initializingData,
      OPL_PROJECTS_DIR: initializingProjects,
      OPL_STATE_DIR: initializingState,
      AIONUI_PORT: '3000',
      PATH: process.env.PATH ?? '',
    }) as {
      docker_webui_doctor: {
        startup_state: { phase: string; initializing: boolean; repairable_failure: boolean };
        startup_maintenance: { status: string; can_repair_by_running_command: boolean };
        diagnostic_summary: { status: string; startup_maintenance_status: string };
      };
    };
    assert.equal(initializing.docker_webui_doctor.startup_state.phase, 'initializing');
    assert.equal(initializing.docker_webui_doctor.startup_state.initializing, true);
    assert.equal(initializing.docker_webui_doctor.startup_state.repairable_failure, false);
    assert.equal(initializing.docker_webui_doctor.startup_maintenance.status, 'initializing');
    assert.equal(initializing.docker_webui_doctor.startup_maintenance.can_repair_by_running_command, true);
    assert.equal(initializing.docker_webui_doctor.diagnostic_summary.status, 'initializing');
    assert.equal(initializing.docker_webui_doctor.diagnostic_summary.startup_maintenance_status, 'initializing');

    const repairData = path.join(repairHome, 'data');
    const repairProjects = path.join(repairHome, 'projects');
    const repairState = path.join(repairHome, 'state');
    const repairCodex = path.join(repairHome, 'codex-home');
    fs.mkdirSync(repairData, { recursive: true });
    fs.mkdirSync(repairProjects, { recursive: true });
    writeCodexConfigWithApiKey(repairCodex);
    writeSeedInstallManifest(repairState, {
      status: 'applied',
      image: {
        version: '26.7.3-webui',
        digest: 'sha256:blocked',
        seed_strategy: 'payload_preheated',
        seed_strategy_status: 'blocked',
      },
      install: {
        data_dir: repairData,
        projects_dir: repairProjects,
        manifest_file: path.join(repairState, 'install-manifest.json'),
      },
    });

    const repairable = runCli(['system', 'docker-webui', 'doctor'], {
      HOME: repairHome,
      CODEX_HOME: repairCodex,
      AIONUI_DATA_DIR: repairData,
      OPL_PROJECTS_DIR: repairProjects,
      OPL_STATE_DIR: repairState,
      AIONUI_PORT: '3000',
      PATH: process.env.PATH ?? '',
    }) as typeof initializing;
    assert.equal(repairable.docker_webui_doctor.startup_state.phase, 'repairable_failure');
    assert.equal(repairable.docker_webui_doctor.startup_state.initializing, false);
    assert.equal(repairable.docker_webui_doctor.startup_state.repairable_failure, true);
    assert.equal(repairable.docker_webui_doctor.startup_maintenance.status, 'repairable_failure');
    assert.equal(repairable.docker_webui_doctor.startup_maintenance.can_repair_by_running_command, true);
    assert.equal(repairable.docker_webui_doctor.diagnostic_summary.status, 'repairable_failure');
    assert.equal(repairable.docker_webui_doctor.diagnostic_summary.startup_maintenance_status, 'repairable_failure');
  } finally {
    fs.rmSync(initializingHome, { recursive: true, force: true });
    fs.rmSync(repairHome, { recursive: true, force: true });
  }
});

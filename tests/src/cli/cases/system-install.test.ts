import { assert, cliPath, contractsDir, createCodexConfigFixture, createFakeLaunchctlFixture, createGitModuleRemoteFixture, fs, loadFrameworkContracts, os, parseJsonText, path, repoRoot, runCli, runCliFailure, test } from '../helpers.ts';
import { buildInternalCommandSpecs } from '../../../../src/entrypoints/cli/cases/private-command-specs.ts';
import { buildPublicCommandSpecs } from '../../../../src/entrypoints/cli/cases/public-command-specs.ts';
import { OPL_GATEWAY_BASE_URL, readBundledCodexDefaultProfile } from '../../../../src/kernel/local-codex-defaults.ts';
import { createFakeCompanionInstallEnv, createFakeOplFlowInstallEnv, writeFakeCompanionToolBinaries } from './system-install-fixtures.ts';

function disableRemoteCompanionInstall() {
  return {
    OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
  };
}

function createFakeNativeHelperRepairEnv(homeRoot: string) {
  const helperBinDir = path.join(homeRoot, 'native-bin');
  const repairScript = path.join(homeRoot, 'repair-native.sh');
  fs.writeFileSync(
    repairScript,
    `#!/usr/bin/env bash
set -euo pipefail
mkdir -p ${JSON.stringify(helperBinDir)}
for binary in opl-doctor-native opl-runtime-watch opl-artifact-indexer opl-state-indexer; do
  cat > ${JSON.stringify(helperBinDir)}/$binary <<'EOS'
#!/bin/sh
cat >/dev/null
case "$(basename "$0")" in
  opl-doctor-native) printf '%s\\n' '{"protocol_version":"opl_native_helper.v1","helper_id":"opl-doctor-native","ok":true,"request_id":"headless-doctor","result":{"surface_kind":"native_doctor_snapshot"},"errors":[]}' ;;
  opl-runtime-watch) printf '%s\\n' '{"protocol_version":"opl_native_helper.v1","helper_id":"opl-runtime-watch","ok":true,"request_id":"headless-watch","result":{"surface_kind":"runtime_health_snapshot_index","roots":[]},"errors":[]}' ;;
  opl-artifact-indexer) printf '%s\\n' '{"protocol_version":"opl_native_helper.v1","helper_id":"opl-artifact-indexer","ok":true,"request_id":"headless-artifacts","result":{"surface_kind":"native_artifact_manifest","summary":{"total_files_count":0},"files":[]},"errors":[]}' ;;
  opl-state-indexer) printf '%s\\n' '{"protocol_version":"opl_native_helper.v1","helper_id":"opl-state-indexer","ok":true,"request_id":"headless-state","result":{"surface_kind":"native_state_index","roots":[],"json_validation":{"checked_files_count":0,"invalid_files_count":0,"files":[]}},"errors":[]}' ;;
esac
EOS
  chmod +x ${JSON.stringify(helperBinDir)}/$binary
done
`,
    { mode: 0o755 },
  );
  return {
    OPL_NATIVE_HELPER_BIN_DIR: helperBinDir,
    OPL_NATIVE_HELPER_REPAIR_COMMAND: repairScript,
  };
}

const codexDefaultProfile = readBundledCodexDefaultProfile();

function assertBundledCodexModel(bootstrap: any, config: string) {
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

test('public command specs expose the one-shot install command', () => {
  const contracts = loadFrameworkContracts({ contractsDir });
  const internalSpecs = buildInternalCommandSpecs(
    {
      helpRequested: false,
      jsonOutput: true,
      textOutput: false,
      command: null,
      args: [],
      loadOptions: { contractsDir },
    },
    () => contracts,
  );
  const publicSpecs = buildPublicCommandSpecs(internalSpecs, () => contracts);

  assert.equal(typeof publicSpecs.install.handler, 'function');
});

test('install --headless --modules rca installs the framework payload without installing or opening the App', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-headless-install-home-'));
  const modulesRoot = path.join(homeRoot, 'managed-modules');
  const guiToolLogPath = path.join(homeRoot, 'gui-tools.log');
  const forbiddenGuiTool = path.join(homeRoot, 'forbidden-gui-tool');
  const redcubeRemote = createGitModuleRemoteFixture('redcube-ai', {
    extraFiles: {
      'plugins/redcube-ai/.codex-plugin/plugin.json': JSON.stringify({ name: 'redcube-ai', skills: './skills/' }, null, 2),
      'plugins/redcube-ai/skills/redcube-ai/SKILL.md': [
        '---',
        'name: redcube-ai',
        'description: Use RCA through its OPL-managed product entry.',
        '---',
        '',
        '# RCA Skill',
        '',
      ].join('\n'),
      'scripts/opl-module-bootstrap.sh': '#!/usr/bin/env bash\nset -euo pipefail\n',
      'scripts/opl-module-healthcheck.sh': '#!/usr/bin/env bash\nset -euo pipefail\n',
    },
  });
  fs.writeFileSync(
    forbiddenGuiTool,
    `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> ${JSON.stringify(guiToolLogPath)}\nexit 97\n`,
    { mode: 0o755 },
  );

  try {
    const output = runCli([
      'install',
      '--headless',
      '--modules',
      'rca',
      '--skip-engines',
      '--no-online-runtime',
    ], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_MODULES_ROOT: modulesRoot,
      OPL_MODULE_REPO_URL_REDCUBE: redcubeRemote.remoteRoot,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_GUI_INSTALL_PLATFORM: 'darwin',
      OPL_APPLICATIONS_DIR: path.join(homeRoot, 'Applications'),
      OPL_CURL_BIN: forbiddenGuiTool,
      OPL_HDIUTIL_BIN: forbiddenGuiTool,
      OPL_OPEN_BIN: forbiddenGuiTool,
      PATH: '/usr/bin:/bin',
      ...createFakeNativeHelperRepairEnv(homeRoot),
      ...createFakeCompanionInstallEnv(homeRoot),
      ...createFakeOplFlowInstallEnv(homeRoot),
    }) as any;

    assert.equal(output.install.status, 'completed');
    assert.equal(output.install.install_mode, 'headless');
    assert.deepEqual(output.install.selected_modules, ['redcube']);
    assert.equal(output.install.module_actions[0].module.module_id, 'redcube');
    assert.equal(output.install.module_actions[0].module.installed, true);
    assert.equal(output.install.codex_plugin_registry.summary.registered, 1);
    assert.equal(output.install.gui_open_action, null);
    assert.equal(output.install.native_helper_action.action, 'repair_native_helpers');
    assert.equal(output.install.native_helper_action.status, 'completed');
    assert.equal(output.install.native_helper_action.after.runtime.status, 'available');
    assert.equal(output.install.companion_skill_sync.mode, 'managed');
    assert.equal(fs.existsSync(guiToolLogPath), false);
    assert.equal(fs.existsSync(path.join(homeRoot, 'Applications')), false);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(redcubeRemote.fixtureRoot, { recursive: true, force: true });
  }
});

test('install command runs selected module installs and returns one-shot setup payload', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-install-home-'));
  const modulesRoot = path.join(homeRoot, 'managed-modules');
  const turnkeyLogPath = path.join(homeRoot, 'turnkey.log');
  const medAutoScienceRemote = createGitModuleRemoteFixture('med-autoscience', {
    extraFiles: {
      'plugins/med-autoscience/.codex-plugin/plugin.json': JSON.stringify({ name: 'med-autoscience', skills: './skills/' }, null, 2),
      'plugins/med-autoscience/skills/med-autoscience/SKILL.md': [
        '---',
        'name: med-autoscience',
        'description: Use MAS runtime through its OPL-managed product entry.',
        '---',
        '',
        '# MAS Skill',
        '',
      ].join('\n'),
      'scripts/opl-module-bootstrap.sh': `#!/usr/bin/env bash
set -euo pipefail
printf 'bootstrap\n' >> ${JSON.stringify(turnkeyLogPath)}
`,
      'scripts/install-codex-plugin.sh': `#!/usr/bin/env bash
set -euo pipefail
printf 'skill-sync\n' >> ${JSON.stringify(turnkeyLogPath)}
cat <<'EOF'
{"repo":"mas","sync":"ok"}
EOF
`,
      'scripts/opl-module-healthcheck.sh': `#!/usr/bin/env bash
set -euo pipefail
printf 'health\n' >> ${JSON.stringify(turnkeyLogPath)}
`,
    },
  });
  const env = {
    HOME: homeRoot,
    CODEX_HOME: path.join(homeRoot, 'codex-home'),
    OPL_MODULES_ROOT: modulesRoot,
    OPL_MODULE_REPO_URL_MEDAUTOSCIENCE: medAutoScienceRemote.remoteRoot,
    OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
    PATH: '/usr/bin:/bin',
    ...createFakeCompanionInstallEnv(homeRoot),
  };

  try {
    const output = runCli(['install', '--modules', 'mas', '--skip-engines', '--skip-gui-open', '--skip-native-helper-repair'], env) as any;

    assert.equal(output.install.surface_id, 'opl_install');
    assert.equal(output.install.status, 'completed');
    assert.deepEqual(output.install.selected_engines, ['codex']);
    assert.deepEqual(output.install.engine_actions, []);
    assert.deepEqual(output.install.selected_modules, ['medautoscience']);
    assert.equal(output.install.codex_plugin_registry.surface_id, 'opl_codex_plugin_registry');
    assert.equal(output.install.codex_plugin_registry.summary.registered, 1);
    assert.equal(output.install.module_actions.length, 1);
    assert.equal(output.install.module_actions[0].action, 'install');
    assert.equal(output.install.module_actions[0].module.module_id, 'medautoscience');
    assert.equal(output.install.module_actions[0].module.installed, true);
    assert.equal(output.install.module_actions[0].turnkey.skill_sync.status, 'completed');
    assert.equal(Object.prototype.hasOwnProperty.call(output.install.module_actions[0].turnkey.skill_sync.result.installer_result ?? {}, 'codex_skill_mirror'), false);
    assert.equal(fs.existsSync(path.join(homeRoot, 'codex-home', 'skills', 'mas', 'SKILL.md')), false);
    assert.equal(fs.existsSync(path.join(homeRoot, '.codex', 'skills', 'mas', 'SKILL.md')), false);
    assert.equal(output.install.gui_open_action, null);
    assert.equal(output.install.codex_config_bootstrap.status, 'skipped_missing_input');
    assert.equal(output.install.codex_config_bootstrap.api_key_present, false);
    assert.equal(output.install.companion_skill_sync.surface_id, 'opl_companion_skill_sync');
    assert.equal(output.install.companion_skill_sync.mode, 'managed');
    assert.equal(output.install.companion_skill_sync.summary.total >= 6, true);
    assert.deepEqual(
      output.install.companion_skill_sync.tools.map((entry: any) => [entry.tool_id, entry.status, entry.action, entry.version]),
      [
        ['officecli', 'installed', 'install', '1.0.70-test'],
        ['mineru-open-api', 'installed', 'install', 'mineru-open-api version v0.1.3-test'],
      ],
    );
    assert.equal(output.install.companion_skill_sync.summary.tools_ready, 2);
    assert.equal(output.install.companion_skill_sync.summary.tools_total, 2);
    assert.equal(output.install.opl_flow_plugin.status, 'installed');
    assert.equal(output.install.runtime_manager_action.executed_actions.some((entry: any) => ['install_hermes_online_runtime', 'repair_hermes_legacy_provider'].includes(entry.action_id)), false);
    for (const skillName of [
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
      const item = output.install.companion_skill_sync.items.find((entry: any) => entry.skill_id === skillName);
      assert.equal(item?.status, 'synced');
      assert.equal(item?.action, 'symlink');
      assert.equal(fs.existsSync(path.join(homeRoot, 'codex-home', 'skills', skillName, 'SKILL.md')), true);
      assert.match(fs.readFileSync(path.join(homeRoot, 'codex-home', 'skills', skillName, 'SKILL.md'), 'utf8'), /#/);
    }
    assert.equal(fs.existsSync(path.join(homeRoot, '.local', 'bin', 'officecli')), true);
    assert.equal(fs.existsSync(path.join(homeRoot, '.local', 'bin', 'mineru-open-api')), true);
    assert.equal(output.install.first_run_log.surface_id, 'opl_first_run_log');
    assert.equal(output.install.first_run_log.event_schema_version, 'opl_first_run_event.v1');
    assert.equal(output.install.first_run_log.log_path, path.join(homeRoot, 'Library', 'Logs', 'One Person Lab', 'first-run.jsonl'));
    assert.deepEqual(
      output.install.first_run_log_events.map((entry: any) => [entry.event_type, entry.status, entry.log_path]),
      [
        ['install_started', 'written', output.install.first_run_log.log_path],
        ['runtime_manager_repair_started', 'written', output.install.first_run_log.log_path],
        ['runtime_manager_repair_completed', 'written', output.install.first_run_log.log_path],
        ['install_completed', 'written', output.install.first_run_log.log_path],
      ],
    );
    const firstRunEvents = fs.readFileSync(output.install.first_run_log.log_path, 'utf8')
      .trim()
      .split('\n')
      .map((line) => parseJsonText(line) as any);
    assert.deepEqual(firstRunEvents.map((entry: any) => entry.event_type), [
      'install_started',
      'runtime_manager_repair_started',
      'runtime_manager_repair_completed',
      'install_completed',
    ]);
    assert.equal(firstRunEvents[0].payload.skip_gui_open, true);
    assert.equal(firstRunEvents[3].payload.status, 'completed');
    assert.equal(output.install.system_initialize.surface_id, 'opl_system_initialize');
    assert.equal(output.install.system_initialize.recommended_skills.surface_id, 'opl_recommended_skill_bundle');
    assert.equal(output.install.system_initialize.gui_shell.shell_id, 'opl_aion_shell');
    assert.equal(
      fs.readFileSync(path.join(homeRoot, 'codex-home', 'config.toml'), 'utf8').includes(
        `[marketplaces.med-autoscience-local]\nsource_type = "local"\nsource = "${path.join(homeRoot, 'opl-state', 'codex-plugin-marketplaces', 'med-autoscience-local')}"`,
      ),
      true,
    );
    assert.equal(
      fs.readFileSync(path.join(homeRoot, 'codex-home', 'config.toml'), 'utf8').includes(
        '[plugins."med-autoscience@med-autoscience-local"]\nenabled = true',
      ),
      true,
    );
    assert.deepEqual(fs.readFileSync(turnkeyLogPath, 'utf8').trim().split('\n'), ['bootstrap', 'health']);
    assert.equal(
      fs.existsSync(path.join(modulesRoot, 'med-autoscience', '.agents', 'plugins', 'marketplace.json')),
      false,
    );
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(medAutoScienceRemote.fixtureRoot, { recursive: true, force: true });
  }
});

test('managed companion sync writes materialized skills with readable permissions', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-install-readable-skills-home-'));
  const env = createFakeCompanionInstallEnv(homeRoot);
  const mineruSkillPath = path.join(env.OPL_MINERU_DOCUMENT_EXTRACTOR_SOURCE_ROOT, 'SKILL.md');
  const mineruMetaPath = path.join(env.OPL_MINERU_DOCUMENT_EXTRACTOR_SOURCE_ROOT, '_meta.json');
  fs.chmodSync(mineruSkillPath, 0o200);
  fs.chmodSync(mineruMetaPath, 0o200);

  try {
    const output = runCli(['skill', 'companion', 'apply', '--mode', 'managed', '--superpowers', 'keep'], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      PATH: `${path.join(homeRoot, '.local', 'bin')}:/usr/bin:/bin`,
      ...env,
    }) as any;

    const mineru = output.companion_skills.items.find((entry: any) => entry.skill_id === 'mineru-document-extractor');
    assert.equal(mineru?.status, 'synced');
    assert.equal(mineru?.source_path, path.join(homeRoot, 'companion-sources', 'materialized', 'mineru-document-extractor'));

    const materializedSkillPath = path.join(homeRoot, 'companion-sources', 'materialized', 'mineru-document-extractor', 'SKILL.md');
    const targetSkillPath = path.join(homeRoot, 'codex-home', 'skills', 'mineru-document-extractor', 'SKILL.md');
    assert.equal((fs.statSync(materializedSkillPath).mode & 0o777), 0o644);
    assert.equal((fs.statSync(path.join(path.dirname(materializedSkillPath), '_meta.json')).mode & 0o777), 0o644);
    assert.match(fs.readFileSync(targetSkillPath, 'utf8'), /mineru-document-extractor/);
  } finally {
    fs.chmodSync(mineruSkillPath, 0o644);
    fs.chmodSync(mineruMetaPath, 0o644);
    fs.rmSync(homeRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

test('recommended companion skills require their skill payloads and companion binaries', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-install-officecli-status-home-'));
  const codexHome = path.join(homeRoot, 'codex-home');
  const skillsRoot = path.join(codexHome, 'skills');
  const officeSkillIds = [
    'officecli',
    'officecli-docx',
    'officecli-pptx',
    'officecli-xlsx',
    'officecli-academic-paper',
    'officecli-data-dashboard',
    'officecli-financial-model',
    'officecli-pitch-deck',
  ];
  for (const skillName of [...officeSkillIds, 'mineru-document-extractor']) {
    fs.mkdirSync(path.join(skillsRoot, skillName), { recursive: true });
    fs.writeFileSync(
      path.join(skillsRoot, skillName, 'SKILL.md'),
      `---\nname: ${skillName}\ndescription: ${skillName} fixture.\n---\n\n# ${skillName}\n`,
      'utf8',
    );
  }

  try {
    const missingTool = runCli(['system', 'initialize'], {
      HOME: homeRoot,
      CODEX_HOME: codexHome,
      PATH: '/usr/bin:/bin',
    }) as any;
    const missingById = new Map(
      missingTool.system_initialize.recommended_skills.skills.map((skill: any) => [skill.skill_id, skill.status]),
    );
    for (const skillName of officeSkillIds) {
      assert.equal(missingById.get(skillName), 'missing');
    }
    assert.equal(missingById.get('mineru-document-extractor'), 'missing');

    const toolBin = path.join(homeRoot, '.local', 'bin');
    fs.mkdirSync(toolBin, { recursive: true });
    const officeCliPath = path.join(toolBin, 'officecli');
    fs.writeFileSync(
      officeCliPath,
      '#!/usr/bin/env bash\nif [ "${1:-}" = "--version" ]; then echo "1.0.70-test"; else echo officecli; fi\n',
      { mode: 0o755 },
    );
    const mineruOpenApiPath = path.join(toolBin, 'mineru-open-api');
    fs.writeFileSync(
      mineruOpenApiPath,
      '#!/usr/bin/env bash\nif [ "${1:-}" = "version" ]; then echo "mineru-open-api version v0.1.3-test"; else echo mineru-open-api; fi\n',
      { mode: 0o755 },
    );

    const readyTool = runCli(['system', 'initialize'], {
      HOME: homeRoot,
      CODEX_HOME: codexHome,
      PATH: `${toolBin}:/usr/bin:/bin`,
    }) as any;
    const readyById = new Map(
      readyTool.system_initialize.recommended_skills.skills.map((skill: any) => [skill.skill_id, skill.status]),
    );
    for (const skillName of officeSkillIds) {
      assert.equal(readyById.get(skillName), 'ready');
    }
    assert.equal(readyById.get('mineru-document-extractor'), 'ready');
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

test('official Codex Office and PDF skills are discovered independently', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-install-primary-runtime-skills-home-'));
  const codexHome = path.join(homeRoot, 'codex-home');
  const documentsSkill = path.join(
    codexHome,
    'plugins',
    'cache',
    'openai-primary-runtime',
    'documents',
    'test-version',
    'skills',
    'documents',
    'SKILL.md',
  );

  try {
    fs.mkdirSync(path.dirname(documentsSkill), { recursive: true });
    fs.writeFileSync(documentsSkill, '# documents\n', 'utf8');

    const output = runCli(['system', 'initialize'], {
      HOME: homeRoot,
      CODEX_HOME: codexHome,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      PATH: '/usr/bin:/bin',
    }) as any;
    const statusById = new Map(
      output.system_initialize.recommended_skills.skills.map((skill: any) => [skill.skill_id, skill.status]),
    );

    assert.equal(statusById.get('documents'), 'ready');
    assert.equal(statusById.get('presentations'), 'missing');
    assert.equal(statusById.get('spreadsheets'), 'missing');
    assert.equal(statusById.get('pdf'), 'missing');
    assert.equal(statusById.has('openai_primary_runtime_office_pdf'), false);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('recommended system companion skills exclude MAS/MDS project-local stage skills', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-install-mds-stage-skills-home-'));

  try {
    const output = runCli(['system', 'initialize'], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      PATH: '/usr/bin:/bin',
    }) as any;

    const skillIds = output.system_initialize.recommended_skills.skills.map((skill: any) => skill.skill_id);
    for (const stageSkillId of ['deepscientist', 'scout', 'finalize', 'write', 'review', 'baseline']) {
      assert.equal(skillIds.includes(stageSkillId), false);
    }
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

test('recommended system companion skills keep family domain skills plugin-only when packaged Full runtime is present', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-packaged-family-skills-home-'));
  const packagedSkillsRoot = path.join(homeRoot, 'runtime', 'current', 'skills');

  try {
    for (const skillId of [
      'mas',
      'mag',
      'rca',
      'opl-meta-agent',
      'superpowers',
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
      if (skillId === 'superpowers') {
        fs.mkdirSync(path.join(packagedSkillsRoot, skillId, 'skills', 'using-superpowers'), { recursive: true });
        fs.mkdirSync(
          path.join(packagedSkillsRoot, skillId, 'skills', 'verification-before-completion'),
          { recursive: true },
        );
        fs.writeFileSync(
          path.join(packagedSkillsRoot, skillId, 'skills', 'using-superpowers', 'SKILL.md'),
          '# using-superpowers\n',
        );
        fs.writeFileSync(
          path.join(packagedSkillsRoot, skillId, 'skills', 'verification-before-completion', 'SKILL.md'),
          '# verification-before-completion\n',
        );
      } else {
        fs.writeFileSync(
          path.join(packagedSkillsRoot, skillId, 'SKILL.md'),
          `---\nname: ${skillId}\ndescription: packaged ${skillId}\n---\n\n# ${skillId}\n`,
        );
      }
    }

    const output = runCli(['install', '--skip-modules', '--skip-engines', '--skip-gui-open', '--skip-native-helper-repair'], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_PACKAGED_SKILLS_ROOT: packagedSkillsRoot,
      OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
      ...createFakeOplFlowInstallEnv(homeRoot),
      PATH: `${path.join(homeRoot, '.local', 'bin')}:/usr/bin:/bin`,
    }) as any;

    const syncedById = new Map(output.install.companion_skill_sync.items.map((item: any) => [item.skill_id, item.status]));
    for (const skillId of ['mas', 'mag', 'rca', 'opl-meta-agent']) {
      assert.equal(syncedById.has(skillId), false);
      assert.equal(fs.existsSync(path.join(homeRoot, 'codex-home', 'skills', skillId, 'SKILL.md')), false);
    }
    assert.equal(syncedById.get('superpowers'), 'ready');
    assert.equal(fs.existsSync(path.join(homeRoot, '.agents', 'skills', 'superpowers')), false);
    assert.equal(fs.existsSync(path.join(homeRoot, 'codex-home', 'skills', 'superpowers', 'SKILL.md')), false);
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
      assert.equal(syncedById.get(skillId), 'synced');
      assert.equal(fs.existsSync(path.join(homeRoot, 'codex-home', 'skills', skillId, 'SKILL.md')), true);
    }

    const toolBin = writeFakeCompanionToolBinaries(homeRoot);

    const ready = runCli(['system', 'initialize'], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_PACKAGED_SKILLS_ROOT: packagedSkillsRoot,
      PATH: `${toolBin}:/usr/bin:/bin`,
    }) as any;
    const readyById = new Map(
      ready.system_initialize.recommended_skills.skills.map((skill: any) => [skill.skill_id, skill.status]),
    );
    assert.equal(readyById.get('superpowers'), 'ready');
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
      assert.equal(readyById.get(skillId), 'ready');
    }
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('managed companion sync does not mirror MAS/MDS project-local stage skills into user Codex home', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-companion-mds-stage-skills-home-'));

  try {
    const output = runCli([
      'skill',
      'companion',
      'apply',
      '--mode',
      'managed',
      '--superpowers',
      'keep',
    ], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      ...disableRemoteCompanionInstall(),
    }) as any;

    const skillIds = output.companion_skills.items.map((item: any) => item.skill_id);
    for (const stageSkillId of ['deepscientist', 'scout', 'finalize', 'write', 'review', 'baseline']) {
      assert.equal(skillIds.includes(stageSkillId), false);
      assert.equal(fs.existsSync(path.join(homeRoot, 'codex-home', 'skills', stageSkillId, 'SKILL.md')), false);
    }
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('install command repairs native helpers and returns the refreshed lifecycle report', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-install-native-home-'));
  const helperBinDir = path.join(homeRoot, 'native-bin');
  const repairScript = path.join(homeRoot, 'repair-native.sh');
  fs.mkdirSync(helperBinDir, { recursive: true });
  fs.writeFileSync(
    repairScript,
    `#!/usr/bin/env bash
set -euo pipefail
for binary in opl-doctor-native opl-runtime-watch opl-artifact-indexer opl-state-indexer; do
  cat > "${helperBinDir}/$binary" <<'EOS'
#!/bin/sh
cat >/dev/null
case "$(basename "$0")" in
  opl-doctor-native)
    printf '%s\\n' '{"protocol_version":"opl_native_helper.v1","helper_id":"opl-doctor-native","ok":true,"request_id":"runtime-manager-doctor","result":{"surface_kind":"native_doctor_snapshot"},"errors":[]}'
    ;;
  opl-runtime-watch)
    printf '%s\\n' '{"protocol_version":"opl_native_helper.v1","helper_id":"opl-runtime-watch","ok":true,"request_id":"runtime-manager-runtime-watch","result":{"surface_kind":"runtime_health_snapshot_index","roots":[]},"errors":[]}'
    ;;
  opl-artifact-indexer)
    printf '%s\\n' '{"protocol_version":"opl_native_helper.v1","helper_id":"opl-artifact-indexer","ok":true,"request_id":"runtime-manager-artifact-index","result":{"surface_kind":"native_artifact_manifest","summary":{"total_files_count":0},"files":[]},"errors":[]}'
    ;;
  opl-state-indexer)
    printf '%s\\n' '{"protocol_version":"opl_native_helper.v1","helper_id":"opl-state-indexer","ok":true,"request_id":"runtime-manager-state-index","result":{"surface_kind":"native_state_index","roots":[],"json_validation":{"checked_files_count":0,"invalid_files_count":0,"files":[]}},"errors":[]}'
    ;;
esac
EOS
  chmod +x "${helperBinDir}/$binary"
done
printf 'native repair completed\\n'
`,
    { mode: 0o755 },
  );

  try {
    const output = runCli(['install', '--skip-modules', '--skip-engines', '--skip-gui-open'], {
      HOME: homeRoot,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_NATIVE_HELPER_BIN_DIR: helperBinDir,
      OPL_NATIVE_HELPER_REPAIR_COMMAND: repairScript,
      ...createFakeOplFlowInstallEnv(homeRoot),
      ...disableRemoteCompanionInstall(),
    }) as any;

    assert.equal(output.install.native_helper_action.action, 'repair_native_helpers');
    assert.equal(output.install.native_helper_action.status, 'completed');
    assert.deepEqual(output.install.native_helper_action.command_preview, [repairScript]);
    assert.equal(output.install.native_helper_action.before.runtime.status, 'unavailable');
    assert.equal(output.install.native_helper_action.after.runtime.status, 'available');
    assert.equal(output.install.system_initialize.native_helpers.runtime.status, 'available');
    assert.equal(output.install.system_initialize.native_helpers.health_status, 'ready');
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

test('install command can bootstrap Codex defaults from environment without leaking the API key', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-install-codex-defaults-home-'));

  try {
    const output = runCli(['install', '--skip-modules', '--skip-engines', '--skip-gui-open', '--skip-native-helper-repair'], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_CODEX_MODEL: 'gpt-5.5',
      OPL_CODEX_REASONING_EFFORT: 'xhigh',
      OPL_CODEX_BASE_URL: 'https://codex-provider.example.test/v1',
      OPL_CODEX_API_KEY: 'secret-test-key',
      ...createFakeOplFlowInstallEnv(homeRoot),
      ...disableRemoteCompanionInstall(),
    }) as any;

    const bootstrap = output.install.codex_config_bootstrap;
    assert.equal(bootstrap.status, 'completed');
    assert.equal(bootstrap.model, 'gpt-5.5');
    assert.equal(bootstrap.reasoning_effort, 'xhigh');
    assert.equal(bootstrap.provider_base_url, 'https://codex-provider.example.test/v1');
    assert.equal(bootstrap.api_key_present, true);
    assert.equal(JSON.stringify(output).includes('secret-test-key'), false);

    const config = fs.readFileSync(bootstrap.config_path, 'utf8');
    assert.match(config, /model = "gpt-5\.5"/);
    assert.match(config, /model_reasoning_effort = "xhigh"/);
    assert.match(config, /base_url = "https:\/\/codex-provider\.example\.test\/v1"/);
    assert.match(config, /experimental_bearer_token = "secret-test-key"/);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('install command applies bundled Codex defaults when only the API key is provided', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-install-bundled-codex-defaults-home-'));

  try {
    const output = runCli(['install', '--skip-modules', '--skip-engines', '--skip-gui-open', '--skip-native-helper-repair'], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_CODEX_MODEL: '',
      CODEX_MODEL: '',
      OPL_CODEX_REASONING_EFFORT: '',
      CODEX_REASONING_EFFORT: '',
      OPL_CODEX_API_KEY: 'secret-test-key',
      ...createFakeOplFlowInstallEnv(homeRoot),
      ...disableRemoteCompanionInstall(),
    }) as any;

    const bootstrap = output.install.codex_config_bootstrap;
    const config = fs.readFileSync(bootstrap.config_path, 'utf8');
    assertBundledCodexModel(bootstrap, config);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('install command upgrades an existing OPL Gateway alias while preserving its token', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-install-existing-opl-defaults-home-'));
  const codexHome = path.join(homeRoot, 'codex-home');
  const configPath = path.join(codexHome, 'config.toml');

  try {
    fs.mkdirSync(codexHome, { recursive: true });
    fs.writeFileSync(
      configPath,
      [
        'model_provider = "company-opl"',
        'model = "gpt-5.5"',
        'model_reasoning_effort = "xhigh"',
        'custom_user_setting = true',
        '',
        '[model_providers.company-opl]',
        'name = "Company OPL Gateway"',
        `base_url = "${OPL_GATEWAY_BASE_URL}"`,
        'experimental_bearer_token = "existing-opl-key"',
        'wire_api = "responses"',
        'custom_header = "preserve-me"',
        '',
      ].join('\n'),
      'utf8',
    );

    const output = runCli(['install', '--skip-modules', '--skip-engines', '--skip-gui-open', '--skip-native-helper-repair'], {
      HOME: homeRoot,
      CODEX_HOME: codexHome,
      OPENAI_API_KEY: 'ambient-openai-key-must-not-replace-provider-token',
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      ...createFakeOplFlowInstallEnv(homeRoot),
      ...disableRemoteCompanionInstall(),
    }) as any;

    const bootstrap = output.install.codex_config_bootstrap;
    assert.equal(bootstrap.status, 'completed');
    assert.equal(bootstrap.management_receipt.provider_id, 'company-opl');
    assert.equal(bootstrap.management_receipt.provider_route, 'direct_gateway');
    assert.equal(bootstrap.management_receipt.selection_mode, 'auto');

    const config = fs.readFileSync(configPath, 'utf8');
    assert.match(config, /model_provider = "company-opl"/);
    assertBundledCodexModel(bootstrap, config);
    assert.match(config, /custom_user_setting = true/);
    assert.match(config, /name = "Company OPL Gateway"/);
    assert.match(config, /experimental_bearer_token = "existing-opl-key"/);
    assert.doesNotMatch(config, /ambient-openai-key-must-not-replace-provider-token/);
    assert.match(config, /wire_api = "responses"/);
    assert.match(config, /custom_header = "preserve-me"/);

    runCli(['install', '--skip-modules', '--skip-engines', '--skip-gui-open', '--skip-native-helper-repair'], {
      HOME: homeRoot,
      CODEX_HOME: codexHome,
      OPENAI_API_KEY: 'ambient-openai-key-must-not-replace-provider-token',
      OPL_CODEX_API_KEY: 'explicit-opl-environment-key',
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      ...createFakeOplFlowInstallEnv(homeRoot),
      ...disableRemoteCompanionInstall(),
    });
    const updatedConfig = fs.readFileSync(configPath, 'utf8');
    assert.match(updatedConfig, /experimental_bearer_token = "explicit-opl-environment-key"/);
    assert.doesNotMatch(updatedConfig, /ambient-openai-key-must-not-replace-provider-token/);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('install command upgrades an OPL Flow intelligence proxy without requiring a bearer token', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-install-existing-opl-proxy-home-'));
  const codexHome = path.join(homeRoot, 'codex-home');
  const codexContHome = path.join(homeRoot, 'codexcont-home');
  const configPath = path.join(codexHome, 'config.toml');

  try {
    fs.mkdirSync(codexHome, { recursive: true });
    fs.mkdirSync(codexContHome, { recursive: true });
    fs.writeFileSync(
      configPath,
      [
        'model_provider = "proxy-alias"',
        'model = "gpt-5.5"',
        'model_reasoning_effort = "xhigh"',
        '',
        '[model_providers.proxy-alias]',
        'name = "OPL Flow Proxy"',
        'base_url = "http://127.0.0.1:8787/v1/"',
        '',
      ].join('\n'),
      'utf8',
    );
    fs.writeFileSync(
      path.join(codexContHome, 'opl-flow-intelligence-enhancement.json'),
      `${JSON.stringify({
        surface_kind: 'opl_flow_intelligence_enhancement_receipt.v1',
        status: 'enabled',
        previous_provider_base_url: OPL_GATEWAY_BASE_URL,
      }, null, 2)}\n`,
      'utf8',
    );

    const output = runCli(['install', '--skip-modules', '--skip-engines', '--skip-gui-open', '--skip-native-helper-repair'], {
      HOME: homeRoot,
      CODEX_HOME: codexHome,
      OPL_CODEXCONT_HOME: codexContHome,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      ...createFakeOplFlowInstallEnv(homeRoot),
      ...disableRemoteCompanionInstall(),
    }) as any;

    const bootstrap = output.install.codex_config_bootstrap;
    assert.equal(bootstrap.status, 'completed');
    assert.equal(bootstrap.api_key_present, false);
    assert.equal(bootstrap.management_receipt.provider_route, 'intelligence_proxy');
    assert.equal(output.install.system_initialize.core_engines.codex.opl_gateway_configured, true);
    const config = fs.readFileSync(configPath, 'utf8');
    assert.match(config, /model_provider = "proxy-alias"/);
    assertBundledCodexModel(bootstrap, config);
    assert.doesNotMatch(config, /experimental_bearer_token/);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('install command does not upgrade a direct OPL Gateway config without a bearer token', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-install-tokenless-direct-gateway-home-'));
  const codexHome = path.join(homeRoot, 'codex-home');
  const configPath = path.join(codexHome, 'config.toml');

  try {
    fs.mkdirSync(codexHome, { recursive: true });
    fs.writeFileSync(
      configPath,
      [
        'model_provider = "gflab"',
        'model = "gpt-5.5"',
        'model_reasoning_effort = "xhigh"',
        '',
        '[model_providers.gflab]',
        'name = "gflab"',
        `base_url = "${OPL_GATEWAY_BASE_URL}"`,
        '',
      ].join('\n'),
      'utf8',
    );

    const output = runCli(['install', '--skip-modules', '--skip-engines', '--skip-gui-open', '--skip-native-helper-repair'], {
      HOME: homeRoot,
      CODEX_HOME: codexHome,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      ...createFakeOplFlowInstallEnv(homeRoot),
      ...disableRemoteCompanionInstall(),
    }) as any;

    assert.equal(output.install.codex_config_bootstrap.status, 'skipped_missing_input');
    assert.equal(output.install.codex_config_bootstrap.api_key_present, false);
    const config = fs.readFileSync(configPath, 'utf8');
    assert.match(config, /model = "gpt-5\.5"/);
    assert.match(config, /model_reasoning_effort = "xhigh"/);
    assert.doesNotMatch(config, /experimental_bearer_token/);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('install command does not overwrite a third-party provider using the gflab id', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-install-gflab-collision-home-'));
  const codexHome = path.join(homeRoot, 'codex-home');
  const configPath = path.join(codexHome, 'config.toml');

  try {
    fs.mkdirSync(codexHome, { recursive: true });
    fs.writeFileSync(
      configPath,
      [
        'model_provider = "gflab"',
        'model = "third-party-model"',
        'model_reasoning_effort = "medium"',
        '',
        '[model_providers.gflab]',
        'name = "Third Party"',
        'base_url = "https://third-party.example.test/v1"',
        'experimental_bearer_token = "third-party-key"',
        '',
      ].join('\n'),
      'utf8',
    );

    const output = runCli(['install', '--skip-modules', '--skip-engines', '--skip-gui-open', '--skip-native-helper-repair'], {
      HOME: homeRoot,
      CODEX_HOME: codexHome,
      OPL_CODEX_API_KEY: 'new-opl-key',
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      ...createFakeOplFlowInstallEnv(homeRoot),
      ...disableRemoteCompanionInstall(),
    }) as any;

    const bootstrap = output.install.codex_config_bootstrap;
    assert.equal(bootstrap.status, 'completed');
    assert.equal(bootstrap.model, 'third-party-model');
    assert.equal(bootstrap.reasoning_effort, 'medium');
    assert.equal(bootstrap.management_receipt.selection_mode, 'inactive_provider');
    assert.equal(bootstrap.management_receipt.provider_id, 'opl_gateway');
    const config = fs.readFileSync(configPath, 'utf8');
    assert.match(config, /model_provider = "gflab"/);
    assert.match(config, /model = "third-party-model"/);
    assert.match(config, /\[model_providers\.gflab\]/);
    assert.match(config, /base_url = "https:\/\/third-party\.example\.test\/v1"/);
    assert.match(config, /experimental_bearer_token = "third-party-key"/);
    assert.match(config, /\[model_providers\.opl_gateway\]/);
    assert.match(config, /base_url = "https:\/\/gflabtoken\.cn\/v1"/);
    assert.match(config, /experimental_bearer_token = "new-opl-key"/);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('install command fails when the mandatory OPL Flow plugin source is unavailable', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-install-missing-flow-home-'));

  try {
    const failure = runCliFailure(['install', '--skip-modules', '--skip-engines', '--skip-gui-open', '--skip-native-helper-repair'], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_FLOW_INSTALLER_SCRIPT: '',
      OPL_FLOW_REPO_ROOT: '',
      OPL_MODULES_ROOT: path.join(homeRoot, 'missing-modules'),
      OPL_CODEX_API_KEY: 'must-not-be-written-before-flow-preflight',
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      ...disableRemoteCompanionInstall(),
    });

    assert.equal(failure.payload.error.code, 'surface_not_found');
    assert.match(failure.payload.error.message, /OPL Flow plugin installer/);
    assert.equal(fs.existsSync(path.join(homeRoot, 'codex-home', 'config.toml')), false);
    assert.equal(
      fs.existsSync(path.join(homeRoot, 'Library', 'Logs', 'One Person Lab', 'first-run.jsonl')),
      false,
    );
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('install command discovers the mandatory OPL Flow installer from the managed modules root', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-install-managed-flow-home-'));
  const modulesRoot = path.join(homeRoot, 'managed-modules');
  const installerPath = path.join(modulesRoot, 'opl-flow', 'scripts', 'install_local_plugin.py');

  try {
    fs.mkdirSync(path.dirname(installerPath), { recursive: true });
    fs.writeFileSync(
      installerPath,
      'import json\nprint(json.dumps({"surface_kind": "opl_flow_plugin_install_receipt.v1", "status": "installed"}))\n',
      'utf8',
    );
    const output = runCli(['install', '--skip-modules', '--skip-engines', '--skip-gui-open', '--skip-native-helper-repair'], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_FLOW_INSTALLER_SCRIPT: '',
      OPL_FLOW_REPO_ROOT: '',
      OPL_MODULES_ROOT: modulesRoot,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      ...disableRemoteCompanionInstall(),
    }) as any;

    assert.equal(output.install.opl_flow_plugin.status, 'installed');
    assert.equal(output.install.opl_flow_plugin.installer_path, installerPath);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('system initialize blocks launch when compatible Codex CLI lacks configured API key', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-initialize-codex-config-home-'));
  const codexFixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-initialize-codex-config-bin-'));
  const codexPath = path.join(codexFixtureRoot, 'codex');
  fs.writeFileSync(codexPath, '#!/usr/bin/env bash\necho "codex-cli 0.125.0"\n', { mode: 0o755 });

  try {
    const output = runCli(['system', 'initialize'], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      PATH: `${codexFixtureRoot}:/usr/bin:/bin`,
    }) as any;

    assert.equal(output.system_initialize.setup_flow.phase, 'environment');
    assert.equal(output.system_initialize.setup_flow.ready_to_launch, false);
    assert.equal(output.system_initialize.setup_flow.blocking_items.includes('codex_config'), true);
    const codexConfigItem = output.system_initialize.checklist.find((entry: any) => entry.item_id === 'codex_config');
    assert.equal(codexConfigItem?.blocking, true);
    assert.equal(codexConfigItem?.readiness_layer, 'core_launch');
    assert.equal(codexConfigItem?.severity, 'blocking');
    assert.equal(codexConfigItem?.action_command_ref, 'opl system configure-codex --api-key-stdin');
    assert.equal(output.system_initialize.core_engines.codex.config_status, 'not_detected');
    assert.equal(output.system_initialize.core_engines.codex.api_key_present, false);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(codexFixtureRoot, { recursive: true, force: true });
  }
});

test('system initialize accepts existing Codex login without OPL Gateway API key', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-initialize-codex-login-home-'));
  const codexHome = path.join(homeRoot, 'codex-home');
  const codexFixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-initialize-codex-login-bin-'));
  const codexPath = path.join(codexFixtureRoot, 'codex');
  fs.mkdirSync(codexHome, { recursive: true });
  fs.writeFileSync(codexPath, '#!/usr/bin/env bash\necho "codex-cli 0.125.0"\n', { mode: 0o755 });
  fs.writeFileSync(
    path.join(codexHome, 'auth.json'),
    JSON.stringify({ auth_mode: 'chatgpt', tokens: { access_token: 'redacted-test-token' } }),
    'utf8',
  );

  try {
    const output = runCli(['system', 'initialize'], {
      HOME: homeRoot,
      CODEX_HOME: codexHome,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      PATH: `${codexFixtureRoot}:/usr/bin:/bin`,
    }) as any;

    assert.equal(output.system_initialize.setup_flow.ready_to_launch, true);
    assert.equal(output.system_initialize.setup_flow.blocking_items.includes('codex_config'), false);
    const codexConfigItem = output.system_initialize.checklist.find((entry: any) => entry.item_id === 'codex_config');
    assert.equal(codexConfigItem?.blocking, false);
    assert.match(codexConfigItem?.detail_summary ?? '', /Using existing Codex model access/);
    assert.equal(output.system_initialize.core_engines.codex.api_key_present, false);
    assert.equal(output.system_initialize.core_engines.codex.opl_gateway_configured, false);
    assert.equal(output.system_initialize.core_engines.codex.model_access_ready, true);
    assert.equal(output.system_initialize.core_engines.codex.model_access_source, 'codex_login');
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(codexFixtureRoot, { recursive: true, force: true });
  }
});

test('system initialize accepts environment API key model access without local Codex config', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-initialize-env-key-home-'));
  const codexFixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-initialize-env-key-bin-'));
  const codexPath = path.join(codexFixtureRoot, 'codex');
  fs.writeFileSync(codexPath, '#!/usr/bin/env bash\necho "codex-cli 0.125.0"\n', { mode: 0o755 });

  try {
    const output = runCli(['system', 'initialize'], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPENAI_API_KEY: 'redacted-env-key',
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      PATH: `${codexFixtureRoot}:/usr/bin:/bin`,
    }) as any;

    assert.equal(output.system_initialize.setup_flow.ready_to_launch, true);
    assert.equal(output.system_initialize.setup_flow.blocking_items.includes('codex_config'), false);
    assert.equal(output.system_initialize.core_engines.codex.api_key_present, false);
    assert.equal(output.system_initialize.core_engines.codex.opl_gateway_configured, false);
    assert.equal(output.system_initialize.core_engines.codex.model_access_ready, true);
    assert.equal(output.system_initialize.core_engines.codex.model_access_source, 'env_api_key');
    assert.equal(output.system_initialize.core_engines.codex.env_api_key_present, true);
    assert.equal(JSON.stringify(output).includes('redacted-env-key'), false);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(codexFixtureRoot, { recursive: true, force: true });
  }
});

test('system initialize reports selected OPL Gateway config as the model access source', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-initialize-opl-gateway-home-'));
  const codexFixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-initialize-opl-gateway-bin-'));
  const codexPath = path.join(codexFixtureRoot, 'codex');
  const codexConfigFixture = createCodexConfigFixture({
    providerId: 'gflab',
    providerName: 'gflab',
    baseUrl: OPL_GATEWAY_BASE_URL,
    apiKey: 'opl-gateway-key',
  });
  fs.writeFileSync(codexPath, '#!/usr/bin/env bash\necho "codex-cli 0.125.0"\n', { mode: 0o755 });

  try {
    const output = runCli(['system', 'initialize'], {
      HOME: homeRoot,
      CODEX_HOME: codexConfigFixture.codexHome,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      PATH: `${codexFixtureRoot}:/usr/bin:/bin`,
    }) as any;

    assert.equal(output.system_initialize.setup_flow.ready_to_launch, true);
    assert.equal(output.system_initialize.setup_flow.blocking_items.includes('codex_config'), false);
    assert.equal(output.system_initialize.core_engines.codex.api_key_present, true);
    assert.equal(output.system_initialize.core_engines.codex.opl_gateway_configured, true);
    assert.equal(output.system_initialize.core_engines.codex.model_access_ready, true);
    assert.equal(output.system_initialize.core_engines.codex.model_access_source, 'opl_gateway');
    assert.equal(JSON.stringify(output).includes('opl-gateway-key'), false);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(codexFixtureRoot, { recursive: true, force: true });
    fs.rmSync(codexConfigFixture.codexHome, { recursive: true, force: true });
  }
});

test('system initialize accepts App-managed runtime Codex when PATH has no Codex CLI', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-initialize-runtime-codex-home-'));
  const runtimeRoot = path.join(homeRoot, 'runtime');
  const runtimeBin = path.join(runtimeRoot, 'current', 'bin');
  const runtimeCodex = path.join(runtimeBin, 'codex');
  const codexConfigFixture = createCodexConfigFixture({
    model: 'gpt-5.5',
    reasoningEffort: 'xhigh',
    baseUrl: 'https://codex-provider.example.test/v1',
    apiKey: 'codex-provider-key',
  });

  fs.mkdirSync(runtimeBin, { recursive: true });
  fs.writeFileSync(runtimeCodex, '#!/usr/bin/env bash\necho "codex-cli 0.137.0"\n', { mode: 0o755 });

  try {
    const output = runCli(['system', 'initialize'], {
      HOME: homeRoot,
      CODEX_HOME: codexConfigFixture.codexHome,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_RUNTIME_ROOT: runtimeRoot,
      OPL_DEVELOPER_MODE_GH_BINARY: path.join(homeRoot, 'missing-gh'),
      OPL_FAMILY_RUNTIME_PROVIDER: '',
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
      PATH: '/usr/bin:/bin',
    }) as any;

    assert.equal(output.system_initialize.setup_flow.ready_to_launch, true);
    assert.equal(output.system_initialize.setup_flow.blocking_items.includes('codex'), false);
    assert.equal(output.system_initialize.core_engines.codex.installed, true);
    assert.equal(output.system_initialize.core_engines.codex.binary_path, runtimeCodex);
    assert.equal(output.system_initialize.core_engines.codex.binary_source, 'runtime');
    assert.equal(output.system_initialize.core_engines.codex.health_status, 'ready');
    assert.equal(output.system_initialize.core_engines.codex.opl_gateway_configured, false);
    assert.equal(output.system_initialize.core_engines.codex.model_access_ready, true);
    assert.equal(output.system_initialize.core_engines.codex.model_access_source, 'custom_provider');
    assert.deepEqual(output.system_initialize.core_engines.codex.issues, []);
    assert.equal(
      output.system_initialize.core_engines.codex.runtime_substrate_updater.current_binary_path,
      runtimeCodex,
    );
    assert.equal(
      output.system_initialize.core_engines.codex.runtime_substrate_updater.current_binary_installed,
      true,
    );
    assert.equal(
      output.system_initialize.core_engines.codex.runtime_substrate_updater.current_version_status,
      'compatible',
    );
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(codexConfigFixture.codexHome, { recursive: true, force: true });
  }
});

test('install command points WebUI users to the AionUI shell instead of a local Product API service', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-install-webui-note-home-'));

  try {
    const output = runCli(['install', '--skip-modules', '--skip-engines', '--skip-gui-open', '--skip-native-helper-repair'], {
      HOME: homeRoot,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      ...createFakeOplFlowInstallEnv(homeRoot),
      ...disableRemoteCompanionInstall(),
    }) as any;

    assert.doesNotMatch(output.install.notes.join('\n'), /serve-web|8787|Product API service/);
    assert.match(output.install.notes.join('\n'), /GUI startup opens/);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('install command reuses only the default Codex engine and reports Temporal provider setup', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-install-engines-home-'));
  const codexFixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-install-codex-'));
  const codexConfigFixture = createCodexConfigFixture();
  const codexPath = path.join(codexFixtureRoot, 'codex');

  fs.writeFileSync(codexPath, '#!/usr/bin/env bash\necho "codex-cli 0.125.0"\n', { mode: 0o755 });

  try {
    const output = runCli(
      ['install', '--skip-modules', '--skip-gui-open', '--skip-native-helper-repair'],
      {
        HOME: homeRoot,
        CODEX_HOME: codexConfigFixture.codexHome,
        OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
        OPL_FAMILY_RUNTIME_PROVIDER: '',
        OPL_TEMPORAL_ADDRESS: '',
        TEMPORAL_ADDRESS: '',
        PATH: `${codexFixtureRoot}:/usr/bin:/bin`,
        ...createFakeOplFlowInstallEnv(homeRoot),
        ...disableRemoteCompanionInstall(),
      },
    ) as any;

    assert.deepEqual(output.install.selected_engines, ['codex']);
    assert.deepEqual(
      output.install.engine_actions.map((entry: any) => [entry.engine_id, entry.status, entry.strategy]),
      [
        ['codex', 'skipped_installed', 'already_installed'],
      ],
    );
    assert.deepEqual(
      output.install.runtime_manager_action.executed_actions.map((entry: any) => entry.action_id),
      ['configure_temporal_provider'],
    );
  } finally {
    fs.rmSync(codexConfigFixture.codexHome, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(codexFixtureRoot, { recursive: true, force: true });
  }
});

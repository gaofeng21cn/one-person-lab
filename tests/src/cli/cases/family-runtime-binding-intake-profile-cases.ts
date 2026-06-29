import { assert, createGitModuleRemoteFixture, fs, os, path, runCli, shellSingleQuote, test, writeMasCleanRunnerFixture } from '../helpers.ts';
import { familyRuntimeEnv, jsString } from './family-runtime-binding-intake-helpers.ts';

test('family-runtime profile hydrate resolves MAS export through OPL module checkout', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-profile-module-home-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-profile-module-'));
  const profilePath = path.join(fixtureRoot, 'dm-cvd.workspace.toml');
  const runnerArgvPath = path.join(fixtureRoot, 'runner.argv');
  const runnerCwdPath = path.join(fixtureRoot, 'runner.cwd');
  const medautosciPath = path.join(fixtureRoot, 'medautosci');
  const uvPath = path.join(fixtureRoot, 'uv');
  const legacyPathHitPath = path.join(fixtureRoot, 'legacy-path-hit');
  const masFixture = createGitModuleRemoteFixture('med-autoscience', {
    extraFiles: {
      'scripts/run-python-clean.sh': [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        `printf '%s\\n' "$PWD" > ${shellSingleQuote(runnerCwdPath)}`,
        `: > ${shellSingleQuote(runnerArgvPath)}`,
        `for arg in "$@"; do printf '%s\\n' "$arg" >> ${shellSingleQuote(runnerArgvPath)}; done`,
        `exec ${shellSingleQuote(process.execPath)} -e ${shellSingleQuote(`process.stdout.write(${jsString(`${JSON.stringify({
          surface_kind: 'mas_family_domain_handler_export',
          pending_family_tasks: [
            {
              domain_id: 'med-autoscience',
              recommended_task_kind: 'domain_route/reconcile-apply',
              priority: 55,
              source: 'mas-runtime-owner-route',
              dedupe_key: 'mas:dm002:owner-route:quest_waiting_opl_runtime_owner_route',
              owner_route_ref: 'quest_waiting_opl_runtime_owner_route',
              runtime_state_path: 'studies/002-dm-china-us-mortality-attribution/runtime/state.json',
              reason: 'quest_waiting_opl_runtime_owner_route',
              payload: {
                profile: 'dm-cvd.workspace.toml',
                study_id: '002-dm-china-us-mortality-attribution',
                source_fingerprint: 'unit-harmonized-route',
              },
            },
          ],
        }, null, 2)}\n`)});`)} -- "$@"`,
        '',
      ].join('\n'),
    },
    executableFiles: ['scripts/run-python-clean.sh'],
  });
  fs.writeFileSync(profilePath, '[workspace]\nname = "dm-cvd"\n', 'utf8');
  fs.writeFileSync(
    medautosciPath,
    `#!/usr/bin/env bash
set -euo pipefail
printf 'legacy-path-medautosci-was-called\\n' > ${shellSingleQuote(legacyPathHitPath)}
exit 44
`,
    { mode: 0o755 },
  );
  fs.writeFileSync(
    uvPath,
    `#!/usr/bin/env bash
set -euo pipefail
printf 'legacy-path-uv-was-called\\n' > ${shellSingleQuote(legacyPathHitPath)}
exit 44
`,
    { mode: 0o755 },
  );
  const env = familyRuntimeEnv(path.join(homeRoot, 'opl-state'), {
    HOME: homeRoot,
    PATH: `${fixtureRoot}:${process.env.PATH ?? ''}`,
    OPL_MODULES_ROOT: path.join(homeRoot, 'managed-modules'),
    OPL_MODULE_PATH_MEDAUTOSCIENCE: masFixture.sourceRoot,
    OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_PROFILE: profilePath,
  });
  try {
    const intake = runCli([
      'family-runtime',
      'intake',
      '--domain',
      'medautoscience',
      '--source',
      'dm002-profile-hydrate',
    ], env);
    const queue = runCli(['family-runtime', 'queue', 'list'], env);
    const exportResult = intake.family_runtime_intake.exports[0];
    const runnerArgv = fs.readFileSync(runnerArgvPath, 'utf8').trim().split('\n');
    const runnerPath = path.join(masFixture.sourceRoot, 'scripts', 'run-python-clean.sh');

    assert.equal(intake.family_runtime_intake.enqueued_count, 1);
    assert.equal(exportResult.status, 'completed');
    assert.equal(exportResult.command_source, 'module_exec_profile');
    assert.equal(exportResult.command_cwd, masFixture.sourceRoot);
    assert.deepEqual(exportResult.command_preview, [
      runnerPath,
      '-m',
      'med_autoscience.cli',
      'domain-handler',
      'export',
      '--profile',
      profilePath,
      '--format',
      'json',
    ]);
    assert.equal(fs.existsSync(legacyPathHitPath), false);
    assert.equal(
      fs.realpathSync(fs.readFileSync(runnerCwdPath, 'utf8').trim()),
      fs.realpathSync(masFixture.sourceRoot),
    );
    assert.deepEqual(runnerArgv, exportResult.command_preview.slice(1));
    assert.equal(queue.family_runtime_queue.tasks[0].task_kind, 'domain_route/reconcile-apply');
    assert.equal(queue.family_runtime_queue.tasks[0].payload.study_id, '002-dm-china-us-mortality-attribution');
    assert.equal(queue.family_runtime_queue.tasks[0].payload.reason, 'quest_waiting_opl_runtime_owner_route');
  } finally {
    fs.rmSync(masFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime module path override uses active MAS binding profile without running bound workspace', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-module-profile-binding-home-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-module-profile-binding-'));
  const stateRoot = path.join(homeRoot, 'opl-state');
  const boundMasWorkspacePath = path.join(fixtureRoot, 'dirty-bound-med-autoscience');
  const profilePath = path.join(fixtureRoot, 'dm-cvd.workspace.toml');
  const boundRunnerHitPath = path.join(fixtureRoot, 'bound-runner-hit');
  const runnerArgvPath = path.join(fixtureRoot, 'runner.argv');
  const runnerCwdPath = path.join(fixtureRoot, 'runner.cwd');
  const masFixture = createGitModuleRemoteFixture('med-autoscience', {
    extraFiles: {
      'scripts/run-python-clean.sh': [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        `printf '%s\\n' "$PWD" > ${shellSingleQuote(runnerCwdPath)}`,
        `: > ${shellSingleQuote(runnerArgvPath)}`,
        `for arg in "$@"; do printf '%s\\n' "$arg" >> ${shellSingleQuote(runnerArgvPath)}; done`,
        `exec ${shellSingleQuote(process.execPath)} -e ${shellSingleQuote(`process.stdout.write(${jsString(`${JSON.stringify({
          surface_kind: 'mas_family_domain_handler_export',
          pending_family_tasks: [
            {
              domain_id: 'medautoscience',
              task_kind: 'paper_mission/stage-route',
              priority: 100,
              source: 'dm003-binding-profile-module-export',
              dedupe_key: 'paper-mission-route:dm003:fresh-binding-profile-module-export',
              payload: {
                study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
                reason: 'latest_handoff_available_from_clean_module_export',
              },
            },
          ],
        }, null, 2)}\n`)});`)} -- "$@"`,
        '',
      ].join('\n'),
    },
    executableFiles: ['scripts/run-python-clean.sh'],
  });
  fs.mkdirSync(boundMasWorkspacePath, { recursive: true });
  fs.writeFileSync(path.join(boundMasWorkspacePath, 'dirty-root-marker.txt'), 'must-not-run-bound-workspace\n', 'utf8');
  fs.writeFileSync(profilePath, '[workspace]\nname = "dm-cvd"\n', 'utf8');
  writeMasCleanRunnerFixture(boundMasWorkspacePath, {
    profilePath,
    manifest: {
      surface_kind: 'family_domain_agent_manifest',
      target_domain_id: 'medautoscience',
      domain_id: 'medautoscience',
    },
  });
  fs.renameSync(
    path.join(boundMasWorkspacePath, 'scripts', 'run-python-clean.sh'),
    path.join(boundMasWorkspacePath, 'scripts', 'run-python-clean.sh.fixture-product-entry'),
  );
  fs.writeFileSync(
    path.join(boundMasWorkspacePath, 'scripts', 'run-python-clean.sh'),
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'if [[ "$*" == *"domain-handler export"* ]]; then',
      `  printf 'bound workspace domain export was called\\n' > ${shellSingleQuote(boundRunnerHitPath)}`,
      '  exit 44',
      'fi',
      'exec "$0.fixture-product-entry" "$@"',
      '',
    ].join('\n'),
    { encoding: 'utf8', mode: 0o755 },
  );
  const env = familyRuntimeEnv(stateRoot, {
    HOME: homeRoot,
    OPL_MODULES_ROOT: path.join(homeRoot, 'managed-modules'),
    OPL_MODULE_PATH_MEDAUTOSCIENCE: masFixture.sourceRoot,
  });
  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      boundMasWorkspacePath,
      '--profile',
      profilePath,
    ], env);
    const intake = runCli([
      'family-runtime',
      'intake',
      '--domain',
      'medautoscience',
      '--source',
      'dm003-binding-profile-module-export',
    ], env);
    const exportResult = intake.family_runtime_intake.exports[0];
    const runnerPath = path.join(masFixture.sourceRoot, 'scripts', 'run-python-clean.sh');
    const runnerArgv = fs.readFileSync(runnerArgvPath, 'utf8').trim().split('\n');

    assert.equal(intake.family_runtime_intake.enqueued_count, 1);
    assert.equal(exportResult.status, 'completed');
    assert.equal(exportResult.command_source, 'module_exec_profile');
    assert.equal(exportResult.command_cwd, masFixture.sourceRoot);
    assert.deepEqual(exportResult.command_preview, [
      runnerPath,
      '-m',
      'med_autoscience.cli',
      'domain-handler',
      'export',
      '--profile',
      profilePath,
      '--format',
      'json',
    ]);
    assert.equal(
      fs.realpathSync(fs.readFileSync(runnerCwdPath, 'utf8').trim()),
      fs.realpathSync(masFixture.sourceRoot),
    );
    assert.deepEqual(runnerArgv, exportResult.command_preview.slice(1));
    assert.equal(fs.existsSync(boundRunnerHitPath), false);
  } finally {
    fs.rmSync(masFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime intake --profile overrides active MAS workspace binding', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-cli-profile-home-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-cli-profile-'));
  const stateRoot = path.join(homeRoot, 'opl-state');
  const boundMasWorkspacePath = path.join(fixtureRoot, 'bound-med-autoscience');
  const boundProfilePath = path.join(fixtureRoot, 'nfpitnet.workspace.toml');
  const explicitProfilePath = path.join(fixtureRoot, 'dm-cvd.workspace.toml');
  const runnerArgvPath = path.join(fixtureRoot, 'runner.argv');
  const runnerCwdPath = path.join(fixtureRoot, 'runner.cwd');
  const uvPath = path.join(fixtureRoot, 'uv');
  const masFixture = createGitModuleRemoteFixture('med-autoscience', {
    extraFiles: {
      'scripts/run-python-clean.sh': [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        `printf '%s\\n' "$PWD" > ${shellSingleQuote(runnerCwdPath)}`,
        `: > ${shellSingleQuote(runnerArgvPath)}`,
        `for arg in "$@"; do printf '%s\\n' "$arg" >> ${shellSingleQuote(runnerArgvPath)}; done`,
        `exec ${shellSingleQuote(process.execPath)} -e ${shellSingleQuote(`process.stdout.write(${jsString(`${JSON.stringify({
          surface_kind: 'mas_family_domain_handler_export',
          pending_family_tasks: [
            {
              domain_id: 'medautoscience',
              task_kind: 'domain_route/reconcile-apply',
              priority: 55,
              source: 'dm002-explicit-profile-owner-route',
              dedupe_key: 'mas:dm-cvd:002-dm-china-us-mortality-attribution:owner-route',
              dispatch_owner: 'med-autoscience',
              payload: {
                profile: 'dm-cvd.workspace.toml',
                study_id: '002-dm-china-us-mortality-attribution',
                reason: 'runtime_controller_redrive_required',
              },
            },
          ],
        }, null, 2)}\n`)});`)} -- "$@"`,
        '',
      ].join('\n'),
    },
    executableFiles: ['scripts/run-python-clean.sh'],
  });
  fs.mkdirSync(boundMasWorkspacePath, { recursive: true });
  writeMasCleanRunnerFixture(boundMasWorkspacePath);
  fs.writeFileSync(boundProfilePath, '[workspace]\nname = "nfpitnet"\n', 'utf8');
  fs.writeFileSync(explicitProfilePath, '[workspace]\nname = "dm-cvd"\n', 'utf8');
  fs.writeFileSync(
    uvPath,
    `#!/usr/bin/env bash
set -euo pipefail
printf 'legacy-path-uv-was-called\\n' >&2
exit 44
`,
    { mode: 0o755 },
  );
  const env = familyRuntimeEnv(stateRoot, {
    HOME: homeRoot,
    PATH: `${fixtureRoot}:${process.env.PATH ?? ''}`,
    OPL_MODULES_ROOT: path.join(homeRoot, 'managed-modules'),
    OPL_MODULE_PATH_MEDAUTOSCIENCE: masFixture.sourceRoot,
  });
  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      boundMasWorkspacePath,
      '--profile',
      boundProfilePath,
    ], env);
    const intake = runCli([
      'family-runtime',
      'intake',
      '--domain',
      'medautoscience',
      '--profile',
      explicitProfilePath,
      '--study',
      '002-dm-china-us-mortality-attribution',
      '--source',
      'dm002-cli-profile-override',
    ], env);
    const exportResult = intake.family_runtime_intake.exports[0];
    const queue = runCli(['family-runtime', 'queue', 'list'], env);
    const runnerArgv = fs.readFileSync(runnerArgvPath, 'utf8').trim().split('\n');
    const runnerPath = path.join(masFixture.sourceRoot, 'scripts', 'run-python-clean.sh');

    assert.equal(intake.family_runtime_intake.enqueued_count, 1);
    assert.equal(exportResult.command_source, 'module_exec_profile');
    assert.equal(exportResult.command_cwd, masFixture.sourceRoot);
    assert.deepEqual(exportResult.command_preview, [
      runnerPath,
      '-m',
      'med_autoscience.cli',
      'domain-handler',
      'export',
      '--profile',
      explicitProfilePath,
      '--study-id',
      '002-dm-china-us-mortality-attribution',
      '--format',
      'json',
    ]);
    assert.match(exportResult.command_preview.join(' '), /dm-cvd\.workspace\.toml/);
    assert.doesNotMatch(exportResult.command_preview.join(' '), /nfpitnet\.workspace\.toml/);
    assert.equal(
      fs.realpathSync(fs.readFileSync(runnerCwdPath, 'utf8').trim()),
      fs.realpathSync(masFixture.sourceRoot),
    );
    assert.deepEqual(runnerArgv, exportResult.command_preview.slice(1));
    assert.equal(queue.family_runtime_queue.tasks[0].payload.study_id, '002-dm-china-us-mortality-attribution');
    assert.equal(
      queue.family_runtime_queue.tasks[0].payload.opl_domain_export_context.command_source,
      'module_exec_profile',
    );
    assert.match(
      queue.family_runtime_queue.tasks[0].payload.opl_domain_export_context.owner_fingerprint,
      /dm-cvd\.workspace\.toml/,
    );
  } finally {
    fs.rmSync(masFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime profile tick dispatches MAS tasks through OPL module checkout', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-profile-dispatch-home-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-profile-dispatch-'));
  const profilePath = path.join(fixtureRoot, 'dm-cvd.workspace.toml');
  const uvPath = path.join(fixtureRoot, 'uv');
  const medautosciPath = path.join(fixtureRoot, 'medautosci');
  const uvArgvPath = path.join(fixtureRoot, 'uv.argv');
  const uvCwdPath = path.join(fixtureRoot, 'uv.cwd');
  const dispatchedTaskPath = path.join(fixtureRoot, 'dispatched-task.json');
  const legacyPathHitPath = path.join(fixtureRoot, 'legacy-dispatch-hit');
  const moduleRunnerSource = `
const fs = require('node:fs');
const args = process.argv.slice(1);
fs.writeFileSync(${jsString(uvCwdPath)}, process.cwd() + '\\n');
fs.writeFileSync(${jsString(uvArgvPath)}, args.map(String).join('\\n') + '\\n');
const joined = \` \${args.join(' ')} \`;
if (joined.includes(' domain-handler export ')) {
  process.stdout.write(JSON.stringify({
    surface_kind: 'mas_family_domain_handler_export',
    pending_family_tasks: [
      {
        domain_id: 'medautoscience',
        task_kind: 'paper_autonomy/repair-recheck',
        priority: 60,
        source: 'mas-runtime-owner-route',
        dedupe_key: 'mas:dm003:repair-recheck:medical_prose_write_repair',
        dispatch_owner: 'med-autoscience',
        payload: {
          profile: 'dm-cvd.workspace.toml',
          study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
          repair_work_unit: {
            work_unit_id: 'medical_prose_write_repair',
            source_fingerprint: 'medical-prose-write-repair-v1',
          },
        },
      },
    ],
  }, null, 2) + '\\n');
  process.exit(0);
}
if (joined.includes(' domain-handler dispatch ')) {
  const taskIndex = args.indexOf('--task');
  const taskPath = taskIndex >= 0 ? args[taskIndex + 1] : null;
  if (!taskPath) {
    process.stderr.write('missing --task\\n');
    process.exit(64);
  }
  fs.copyFileSync(taskPath, ${jsString(dispatchedTaskPath)});
  process.stdout.write(JSON.stringify({
    accepted: true,
    surface_kind: 'mas_family_domain_handler_dispatch_receipt',
    receipt_ref: 'receipt:dm003/module-dispatch',
  }) + '\\n');
  process.exit(0);
}
process.stderr.write(\`unexpected MAS clean runner command: \${args.join(' ')}\\n\`);
process.exit(64);
`;
  const masFixture = createGitModuleRemoteFixture('med-autoscience', {
    extraFiles: {
      'scripts/run-python-clean.sh': [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        `exec ${shellSingleQuote(process.execPath)} -e ${shellSingleQuote(moduleRunnerSource)} -- "$@"`,
        '',
      ].join('\n'),
    },
    executableFiles: ['scripts/run-python-clean.sh'],
  });
  fs.writeFileSync(profilePath, '[workspace]\nname = "dm-cvd"\n', 'utf8');
  fs.writeFileSync(
    uvPath,
    `#!/usr/bin/env bash
set -euo pipefail
printf 'legacy-path-uv-was-called\\n' > ${shellSingleQuote(legacyPathHitPath)}
exit 44
`,
    { mode: 0o755 },
  );
  fs.writeFileSync(
    medautosciPath,
    `#!/usr/bin/env bash
set -euo pipefail
printf 'legacy-path-medautosci-was-called\\n' > ${shellSingleQuote(legacyPathHitPath)}
exit 44
`,
    { mode: 0o755 },
  );
  const env = familyRuntimeEnv(path.join(homeRoot, 'opl-state'), {
    HOME: homeRoot,
    PATH: `${fixtureRoot}:${process.env.PATH ?? ''}`,
    OPL_MODULES_ROOT: path.join(homeRoot, 'managed-modules'),
    OPL_MODULE_PATH_MEDAUTOSCIENCE: masFixture.sourceRoot,
    OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_PROFILE: profilePath,
  });
  try {
    const tick = runCli([
      'family-runtime',
      'tick',
      '--source',
      'dm003-profile-module-dispatch',
      '--hydrate',
      '--domain',
      'medautoscience',
      '--study',
      '003-dpcc-primary-care-phenotype-treatment-gap',
    ], env);
    const uvArgv = fs.readFileSync(uvArgvPath, 'utf8').trim().split('\n');
    const dispatchedTask = JSON.parse(fs.readFileSync(dispatchedTaskPath, 'utf8'));

    assert.equal(tick.family_runtime_tick.hydration.enqueued_count, 1);
    assert.equal(tick.family_runtime_tick.selected_count, 1);
    assert.equal(tick.family_runtime_tick.dispatches[0].status, 'succeeded');
    assert.deepEqual(tick.family_runtime_tick.dispatches[0].command_preview, [
      path.join(masFixture.sourceRoot, 'scripts', 'run-python-clean.sh'),
      '-m',
      'med_autoscience.cli',
      'domain-handler',
      'dispatch',
      '--task',
      tick.family_runtime_tick.dispatches[0].command_preview[6],
      '--format',
      'json',
    ]);
    assert.equal(fs.existsSync(legacyPathHitPath), false);
    assert.equal(fs.existsSync(uvCwdPath), true);
    assert.deepEqual(uvArgv, tick.family_runtime_tick.dispatches[0].command_preview.slice(1));
    assert.equal(dispatchedTask.payload.study_id, '003-dpcc-primary-care-phenotype-treatment-gap');
    assert.equal(dispatchedTask.payload.repair_work_unit.work_unit_id, 'medical_prose_write_repair');
  } finally {
    fs.rmSync(masFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

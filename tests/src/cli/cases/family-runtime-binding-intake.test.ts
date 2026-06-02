import { assert, createGitModuleRemoteFixture, fs, os, path, runCli, shellSingleQuote, test, writeMasCleanRunnerFixture } from '../helpers.ts';

function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  return {
    OPL_STATE_DIR: stateRoot,
    ...extra,
  };
}

function jsString(value: string) {
  return JSON.stringify(value);
}

function writeJsonEmitterScript(scriptPath: string, payload: unknown, options: {
  cwdPath?: string;
  argvPath?: string;
} = {}) {
  fs.writeFileSync(
    scriptPath,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      options.cwdPath ? `printf '%s\\n' "$PWD" > ${shellSingleQuote(options.cwdPath)}` : '',
      options.argvPath ? `: > ${shellSingleQuote(options.argvPath)}` : '',
      options.argvPath ? `for arg in "$@"; do printf '%s\\n' "$arg" >> ${shellSingleQuote(options.argvPath)}; done` : '',
      `exec ${shellSingleQuote(process.execPath)} -e ${shellSingleQuote(`process.stdout.write(${jsString(`${JSON.stringify(payload, null, 2)}\n`)});`)}`,
      '',
    ].filter(Boolean).join('\n'),
    { mode: 0o755 },
  );
}

function writeNodeScript(scriptPath: string, source: string) {
  fs.writeFileSync(
    scriptPath,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      `exec ${shellSingleQuote(process.execPath)} -e ${shellSingleQuote(source)} "$@"`,
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
}

test('family-runtime intake derives MAS domain-handler export from active workspace binding', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-binding-export-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-binding-export-'));
  const masWorkspacePath = path.join(fixtureRoot, 'med-autoscience');
  const profilePath = path.join(fixtureRoot, 'nfpitnet.workspace.toml');
  const proofPath = path.join(stateRoot, 'family-runtime', 'proofs', 'latest-temporal-production-proof.json');
  const uvPath = path.join(fixtureRoot, 'uv');
  const uvArgvPath = path.join(fixtureRoot, 'uv.argv');
  const uvCwdPath = path.join(fixtureRoot, 'uv.cwd');
  fs.mkdirSync(masWorkspacePath, { recursive: true });
  writeMasCleanRunnerFixture(masWorkspacePath);
  fs.writeFileSync(profilePath, '[workspace]\nname = "nfpitnet"\n', 'utf8');
  fs.mkdirSync(path.dirname(proofPath), { recursive: true });
  fs.writeFileSync(proofPath, '{"closeout_status":"production_residency_proven"}\n', 'utf8');
  writeJsonEmitterScript(uvPath, {
    surface_kind: 'mas_family_domain_handler_export',
    provider_guarded_soak: {
      status: 'available',
      provider_attempt_available: true,
    },
    pending_family_tasks: [
      {
        domain_id: 'medautoscience',
        task_kind: 'paper_autonomy/guarded-apply',
        priority: 95,
        source: 'mas-domain-handler-export',
        dedupe_key: 'mas:nfpitnet:DM002:provider-hosted-guarded-apply:opl-temporal',
        dispatch_owner: 'med-autoscience',
        payload: {
          profile: '/tmp/nfpitnet.workspace.toml',
          study_id: 'DM002',
          provider_attempt_id: 'opl-temporal:nfpitnet:DM002:provider-hosted-guarded-apply',
          authority_boundary: 'mas_owner_guarded_apply_only',
        },
      },
    ],
  }, {
    cwdPath: uvCwdPath,
    argvPath: uvArgvPath,
  });
  const env = familyRuntimeEnv(stateRoot, {
    PATH: `${fixtureRoot}:${process.env.PATH ?? ''}`,
  });
  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      masWorkspacePath,
      '--profile',
      profilePath,
    ], env);
    const intake = runCli([
      'family-runtime',
      'intake',
      '--domain',
      'medautoscience',
      '--source',
      'binding-derived-export',
    ], env);
    const queue = runCli(['family-runtime', 'queue', 'list'], env);
    const exportResult = intake.family_runtime_intake.exports[0];

    assert.equal(intake.family_runtime_intake.enqueued_count, 1);
    assert.equal(exportResult.status, 'completed');
    const uvArgv = fs.readFileSync(uvArgvPath, 'utf8').trim().split('\n');
    assert.equal(exportResult.command_source, 'workspace_binding');
    assert.equal(exportResult.command_cwd, path.resolve(masWorkspacePath));
    assert.deepEqual(exportResult.command_preview, [
      'uv',
      'run',
      'python',
      '-m',
      'med_autoscience.cli',
      'domain-handler',
      'export',
      '--profile',
      path.resolve(profilePath),
      '--opl-production-proof',
      path.resolve(proofPath),
      '--format',
      'json',
    ]);
    assert.equal(
      fs.realpathSync(fs.readFileSync(uvCwdPath, 'utf8').trim()),
      fs.realpathSync(path.resolve(masWorkspacePath)),
    );
    assert.deepEqual(uvArgv, exportResult.command_preview.slice(1));
    assert.equal(queue.family_runtime_queue.tasks[0].task_kind, 'paper_autonomy/guarded-apply');
    assert.equal(queue.family_runtime_queue.tasks[0].payload.provider_attempt_id, 'opl-temporal:nfpitnet:DM002:provider-hosted-guarded-apply');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime profile hydrate resolves MAS export through OPL module checkout', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-profile-module-home-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-profile-module-'));
  const profilePath = path.join(fixtureRoot, 'dm-cvd.workspace.toml');
  const uvPath = path.join(fixtureRoot, 'uv');
  const medautosciPath = path.join(fixtureRoot, 'medautosci');
  const uvArgvPath = path.join(fixtureRoot, 'uv.argv');
  const uvCwdPath = path.join(fixtureRoot, 'uv.cwd');
  const legacyPathHitPath = path.join(fixtureRoot, 'legacy-path-hit');
  const masFixture = createGitModuleRemoteFixture('med-autoscience');
  fs.writeFileSync(profilePath, '[workspace]\nname = "dm-cvd"\n', 'utf8');
  writeJsonEmitterScript(uvPath, {
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
  }, {
    cwdPath: uvCwdPath,
    argvPath: uvArgvPath,
  });
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
    const uvArgv = fs.readFileSync(uvArgvPath, 'utf8').trim().split('\n');

    assert.equal(intake.family_runtime_intake.enqueued_count, 1);
    assert.equal(exportResult.status, 'completed');
    assert.equal(exportResult.command_source, 'module_exec_profile');
    assert.equal(exportResult.command_cwd, masFixture.sourceRoot);
    assert.deepEqual(exportResult.command_preview, [
      'uv',
      'run',
      '--directory',
      masFixture.sourceRoot,
      '--extra',
      'analysis',
      'medautosci',
      'domain-handler',
      'export',
      '--profile',
      profilePath,
      '--format',
      'json',
    ]);
    assert.equal(fs.existsSync(legacyPathHitPath), false);
    assert.equal(
      fs.realpathSync(fs.readFileSync(uvCwdPath, 'utf8').trim()),
      fs.realpathSync(masFixture.sourceRoot),
    );
    assert.deepEqual(uvArgv, exportResult.command_preview.slice(1));
    assert.equal(queue.family_runtime_queue.tasks[0].task_kind, 'domain_route/reconcile-apply');
    assert.equal(queue.family_runtime_queue.tasks[0].payload.study_id, '002-dm-china-us-mortality-attribution');
    assert.equal(queue.family_runtime_queue.tasks[0].payload.reason, 'quest_waiting_opl_runtime_owner_route');
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
  const uvPath = path.join(fixtureRoot, 'uv');
  const uvArgvPath = path.join(fixtureRoot, 'uv.argv');
  const uvCwdPath = path.join(fixtureRoot, 'uv.cwd');
  const masFixture = createGitModuleRemoteFixture('med-autoscience');
  fs.mkdirSync(boundMasWorkspacePath, { recursive: true });
  writeMasCleanRunnerFixture(boundMasWorkspacePath);
  fs.writeFileSync(boundProfilePath, '[workspace]\nname = "nfpitnet"\n', 'utf8');
  fs.writeFileSync(explicitProfilePath, '[workspace]\nname = "dm-cvd"\n', 'utf8');
  writeJsonEmitterScript(uvPath, {
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
  }, {
    cwdPath: uvCwdPath,
    argvPath: uvArgvPath,
  });
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
    const uvArgv = fs.readFileSync(uvArgvPath, 'utf8').trim().split('\n');

    assert.equal(intake.family_runtime_intake.enqueued_count, 1);
    assert.equal(exportResult.command_source, 'module_exec_profile');
    assert.equal(exportResult.command_cwd, masFixture.sourceRoot);
    assert.deepEqual(exportResult.command_preview, [
      'uv',
      'run',
      '--directory',
      masFixture.sourceRoot,
      '--extra',
      'analysis',
      'medautosci',
      'domain-handler',
      'export',
      '--profile',
      explicitProfilePath,
      '--format',
      'json',
    ]);
    assert.match(exportResult.command_preview.join(' '), /dm-cvd\.workspace\.toml/);
    assert.doesNotMatch(exportResult.command_preview.join(' '), /nfpitnet\.workspace\.toml/);
    assert.equal(
      fs.realpathSync(fs.readFileSync(uvCwdPath, 'utf8').trim()),
      fs.realpathSync(masFixture.sourceRoot),
    );
    assert.deepEqual(uvArgv, exportResult.command_preview.slice(1));
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
  const masFixture = createGitModuleRemoteFixture('med-autoscience');
  fs.writeFileSync(profilePath, '[workspace]\nname = "dm-cvd"\n', 'utf8');
  writeNodeScript(uvPath, `
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
process.stderr.write(\`unexpected uv command: \${args.join(' ')}\\n\`);
process.exit(64);
`);
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
      'uv',
      'run',
      '--directory',
      masFixture.sourceRoot,
      '--extra',
      'analysis',
      'medautosci',
      'domain-handler',
      'dispatch',
      '--task',
      tick.family_runtime_tick.dispatches[0].command_preview[10],
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

test('family-runtime hydrate consumes MAS scaleout guarded apply tasks as domain-owned exports', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-binding-scaleout-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-binding-scaleout-'));
  const exportPath = path.join(fixtureRoot, 'export');
  writeJsonEmitterScript(exportPath, {
    pending_family_tasks: [
      {
        domain_id: 'medautoscience',
        task_kind: 'paper_autonomy/guarded-apply',
        priority: 30,
        source: 'mas-domain-handler-export',
        dedupe_key: 'mas:nfpitnet:DM002:provider-hosted-guarded-apply:opl-temporal',
        source_fingerprint: 'fingerprint-dm002',
        dispatch_owner: 'med-autoscience',
        profile_name: 'nfpitnet',
        source_refs: [
          { role: 'mas_owner_controller_decision', ref: 'studies/DM002/artifacts/controller_decisions/latest.json', exists: false },
        ],
        payload: {
          profile: '/tmp/nfpitnet.workspace.toml',
          study_id: 'DM002',
          target_studies: ['DM002'],
          provider_attempt_id: 'opl-temporal:nfpitnet:DM002:provider-hosted-guarded-apply',
          idempotency_key: 'mas:nfpitnet:DM002:provider-hosted-guarded-apply:opl-temporal',
          authority_boundary: 'mas_owner_guarded_apply_only',
        },
      },
      {
        domain_id: 'medautoscience',
        task_kind: 'paper_autonomy/guarded-apply',
        priority: 30,
        source: 'mas-domain-handler-export',
        dedupe_key: 'mas:nfpitnet:DM003:provider-hosted-guarded-apply:opl-temporal',
        source_fingerprint: 'fingerprint-dm003',
        dispatch_owner: 'med-autoscience',
        profile_name: 'nfpitnet',
        source_refs: [
          { role: 'mas_owner_controller_decision', ref: 'studies/DM003/artifacts/controller_decisions/latest.json', exists: false },
        ],
        payload: {
          profile: '/tmp/nfpitnet.workspace.toml',
          study_id: 'DM003',
          target_studies: ['DM003'],
          provider_attempt_id: 'opl-temporal:nfpitnet:DM003:provider-hosted-guarded-apply',
          idempotency_key: 'mas:nfpitnet:DM003:provider-hosted-guarded-apply:opl-temporal',
          authority_boundary: 'mas_owner_guarded_apply_only',
        },
      },
      {
        domain_id: 'medautoscience',
        task_kind: 'paper_autonomy/guarded-apply',
        priority: 30,
        source: 'mas-domain-handler-export',
        dedupe_key: 'mas:nfpitnet:Obesity:provider-hosted-guarded-apply:opl-temporal',
        source_fingerprint: 'fingerprint-obesity',
        dispatch_owner: 'med-autoscience',
        profile_name: 'nfpitnet',
        source_refs: [
          { role: 'mas_owner_controller_decision', ref: 'studies/Obesity/artifacts/controller_decisions/latest.json', exists: false },
        ],
        payload: {
          profile: '/tmp/nfpitnet.workspace.toml',
          study_id: 'Obesity',
          target_studies: ['Obesity'],
          provider_attempt_id: 'opl-temporal:nfpitnet:Obesity:provider-hosted-guarded-apply',
          idempotency_key: 'mas:nfpitnet:Obesity:provider-hosted-guarded-apply:opl-temporal',
          authority_boundary: 'mas_owner_guarded_apply_only',
        },
      },
    ],
  });
  const env = familyRuntimeEnv(stateRoot, {
    OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: exportPath,
  });
  try {
    const intake = runCli(['family-runtime', 'intake', '--domain', 'medautoscience'], env);
    const queue = runCli(['family-runtime', 'queue', 'list'], env);
    const tasks = queue.family_runtime_queue.tasks;
    const tasksByStudy = Object.fromEntries(tasks.map((task: { payload: { study_id: string } }) => [
      task.payload.study_id,
      task,
    ]));

    assert.equal(intake.family_runtime_intake.enqueued_count, 3);
    assert.equal(intake.family_runtime_intake.exports[0].exported_count, 3);
    assert.deepEqual(Object.keys(tasksByStudy).sort(), ['DM002', 'DM003', 'Obesity']);
    assert.equal(tasksByStudy.DM002.payload.source_fingerprint, 'fingerprint-dm002');
    assert.equal(tasksByStudy.DM003.payload.source_fingerprint, 'fingerprint-dm003');
    assert.equal(tasksByStudy.Obesity.payload.source_fingerprint, 'fingerprint-obesity');
    assert.equal(tasksByStudy.DM002.paper_autonomy.source_fingerprint, 'fingerprint-dm002');
    assert.equal(tasksByStudy.DM003.paper_autonomy.source_fingerprint, 'fingerprint-dm003');
    assert.equal(tasksByStudy.Obesity.paper_autonomy.source_fingerprint, 'fingerprint-obesity');
    assert.equal(tasksByStudy.DM003.payload.dispatch_owner, 'med-autoscience');
    assert.equal(tasksByStudy.Obesity.payload.source_refs[0].ref, 'studies/Obesity/artifacts/controller_decisions/latest.json');
    assert.deepEqual(
      tasks.map((task: { task_kind: string }) => task.task_kind),
      [
        'paper_autonomy/guarded-apply',
        'paper_autonomy/guarded-apply',
        'paper_autonomy/guarded-apply',
      ],
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime requeues terminal MAS tasks when exported provider evidence changes', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-binding-requeue-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-binding-requeue-'));
  const exportPath = path.join(fixtureRoot, 'export');
  const dispatchPath = path.join(fixtureRoot, 'dispatch');
  const dispatchCountPath = path.join(fixtureRoot, 'dispatch.count');
  const dispatchedTaskPath = path.join(fixtureRoot, 'dispatched-task.json');
  writeNodeScript(exportPath, `
const fs = require('node:fs');
const fingerprint = fs.readFileSync(${jsString(path.join(fixtureRoot, 'fingerprint'))}, 'utf8').trim();
const proofRef = fs.readFileSync(${jsString(path.join(fixtureRoot, 'proof-ref'))}, 'utf8').trim();
process.stdout.write(JSON.stringify({
  pending_family_tasks: [
    {
      domain_id: 'medautoscience',
      task_kind: 'paper_autonomy/guarded-apply',
      priority: 30,
      source: 'mas-domain-handler-export',
      dedupe_key: 'mas:nfpitnet:DM002:provider-hosted-guarded-apply:opl-temporal',
      source_fingerprint: fingerprint,
      dispatch_owner: 'med-autoscience',
      profile_name: 'nfpitnet',
      source_refs: [
        { role: 'opl_production_proof', ref: proofRef, exists: true },
      ],
      payload: {
        profile: '/tmp/nfpitnet.workspace.toml',
        study_id: 'DM002',
        target_studies: ['DM002'],
        provider_attempt_id: 'opl-temporal:nfpitnet:DM002:provider-hosted-guarded-apply',
        idempotency_key: 'mas:nfpitnet:DM002:provider-hosted-guarded-apply:opl-temporal',
        authority_boundary: 'mas_owner_guarded_apply_only',
      },
    },
  ],
}, null, 2) + '\\n');
`);
  writeNodeScript(dispatchPath, `
const fs = require('node:fs');
const taskPath = process.argv[1];
fs.copyFileSync(taskPath, ${jsString(dispatchedTaskPath)});
let count = 0;
if (fs.existsSync(${jsString(dispatchCountPath)})) {
  count = Number(fs.readFileSync(${jsString(dispatchCountPath)}, 'utf8').trim() || '0');
}
count += 1;
fs.writeFileSync(${jsString(dispatchCountPath)}, String(count) + '\\n');
const task = JSON.parse(fs.readFileSync(taskPath, 'utf8'));
process.stdout.write(JSON.stringify({
  accepted: true,
  surface_kind: 'mas_family_domain_handler_dispatch_receipt',
  task_id: task.task_id,
  task_kind: task.task_kind,
  receipt_ref: \`artifacts/runtime/opl_family_domain_handler/dispatch_receipts/receipt-\${count}.json\`,
  dispatch: {
    action_type: 'paper_autonomy_guarded_apply',
    study_id: task.payload.study_id,
    result: {
      surface: 'real_paper_autonomy_provider_hosted_guarded_apply_receipt',
      status: 'typed_blocker',
      guarded_apply_status: 'blocked_no_mas_owner_apply_receipt',
      provider_attempt: {
        attempt_state: 'mas_owner_receipt_missing',
        attempt_ready: true,
        provider_attempt_wrote_workspace: false,
      },
      typed_blockers: [{ blocker_id: 'mas_owner_apply_receipt_missing', write_permitted: false }],
      publication_route_memory_final_proof: { status: 'typed_blocker_missing_ref_chain' },
      forbidden_write_guard: { aggregate_result: 'fail_closed_no_forbidden_writes' },
      summary: { writes_performed: false },
      authority_boundary: { domain_truth_owner: 'med-autoscience', opl_can_write_mas_truth: false },
    },
  },
}, null, 2) + '\\n');
`);
  const env = familyRuntimeEnv(stateRoot, {
    OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: exportPath,
    OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: dispatchPath,
  });
  try {
    fs.writeFileSync(path.join(fixtureRoot, 'fingerprint'), 'proof-fingerprint-v1\n', 'utf8');
    fs.writeFileSync(path.join(fixtureRoot, 'proof-ref'), '/tmp/proof-v1.json\n', 'utf8');
    const first = runCli(['family-runtime', 'tick', '--source', 'test-hydrate', '--hydrate'], env);
    assert.equal(first.family_runtime_tick.hydration.enqueued_count, 1);
    assert.equal(first.family_runtime_tick.hydration.requeued_count, 0);
    assert.equal(first.family_runtime_tick.dispatches.length, 1);

    const repeated = runCli(['family-runtime', 'tick', '--source', 'test-hydrate', '--hydrate'], env);
    assert.equal(repeated.family_runtime_tick.hydration.enqueued_count, 0);
    assert.equal(repeated.family_runtime_tick.hydration.idempotent_noop_count, 1);
    assert.equal(repeated.family_runtime_tick.dispatches.length, 0);

    fs.writeFileSync(path.join(fixtureRoot, 'fingerprint'), 'proof-fingerprint-v2\n', 'utf8');
    fs.writeFileSync(path.join(fixtureRoot, 'proof-ref'), '/tmp/proof-v2.json\n', 'utf8');
    const updated = runCli(['family-runtime', 'tick', '--source', 'test-hydrate', '--hydrate'], env);
    const task = runCli([
      'family-runtime',
      'queue',
      'inspect',
      first.family_runtime_tick.dispatches[0].task_id,
    ], env);
    const attempts = task.family_runtime_task.stage_attempts;
    const dispatchedTask = JSON.parse(fs.readFileSync(dispatchedTaskPath, 'utf8'));

    assert.equal(updated.family_runtime_tick.hydration.enqueued_count, 1);
    assert.equal(updated.family_runtime_tick.hydration.requeued_count, 1);
    assert.equal(updated.family_runtime_tick.dispatches.length, 1);
    assert.equal(dispatchedTask.payload.source_fingerprint, 'proof-fingerprint-v2');
    assert.equal(dispatchedTask.payload.source_refs[0].ref, '/tmp/proof-v2.json');
    assert.equal(attempts.length, 2);
    assert.equal(attempts[0].provider_kind, 'local_sqlite');
    assert.equal(attempts[0].source_fingerprint, 'proof-fingerprint-v2');
    assert.equal(attempts[0].route_impact.receipt_ref, 'artifacts/runtime/opl_family_domain_handler/dispatch_receipts/receipt-2.json');
    assert.equal(attempts[1].source_fingerprint, 'proof-fingerprint-v1');
    assert.equal(fs.readFileSync(dispatchCountPath, 'utf8').trim(), '2');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime requeues dead-lettered MAS exports when domain owner fingerprint changes', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-deadletter-owner-home-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-deadletter-owner-'));
  const profilePath = path.join(fixtureRoot, 'dm-cvd.workspace.toml');
  const uvPath = path.join(fixtureRoot, 'uv');
  const uvArgvPath = path.join(fixtureRoot, 'uv.argv');
  const uvCwdPath = path.join(fixtureRoot, 'uv.cwd');
  const dispatchPath = path.join(fixtureRoot, 'dispatch');
  const dispatchCountPath = path.join(fixtureRoot, 'dispatch.count');
  const dispatchedTaskPath = path.join(fixtureRoot, 'dispatched-task.json');
  const masFixture = createGitModuleRemoteFixture('med-autoscience');
  fs.writeFileSync(profilePath, '[workspace]\nname = "dm-cvd"\n', 'utf8');
  writeJsonEmitterScript(uvPath, {
    surface_kind: 'mas_family_domain_handler_export',
    pending_family_tasks: [
      {
        domain_id: 'medautoscience',
        recommended_task_kind: 'paper_autonomy/repair-recheck',
        priority: 60,
        source: 'mas-runtime-owner-route',
        dedupe_key: 'mas:dm002:repair-recheck:unit_harmonized_validation_uncertainty_and_grouped_calibration',
        dispatch_owner: 'med-autoscience',
        owner_route_ref: 'owner-route:mas/DM002/unit_harmonized_validation_uncertainty_and_grouped_calibration',
        source_fingerprint: 'unit-harmonized-route',
        payload: {
          profile: 'dm-cvd.workspace.toml',
          study_id: '002-dm-china-us-mortality-attribution',
          work_unit_id: 'unit_harmonized_validation_uncertainty_and_grouped_calibration',
        },
      },
    ],
  }, {
    cwdPath: uvCwdPath,
    argvPath: uvArgvPath,
  });
  writeNodeScript(dispatchPath, `
const fs = require('node:fs');
const taskPath = process.argv[1];
fs.copyFileSync(taskPath, ${jsString(dispatchedTaskPath)});
let count = 0;
if (fs.existsSync(${jsString(dispatchCountPath)})) {
  count = Number(fs.readFileSync(${jsString(dispatchCountPath)}, 'utf8').trim() || '0');
}
count += 1;
fs.writeFileSync(${jsString(dispatchCountPath)}, String(count) + '\\n');
if (count <= 3) {
  process.stderr.write('owner callable surface missing\\n');
  process.exit(42);
}
process.stdout.write(JSON.stringify({
  accepted: true,
  surface_kind: 'mas_family_domain_handler_dispatch_receipt',
  receipt_ref: 'receipt:dm002/repaired-owner',
}) + '\\n');
`);
  const env = familyRuntimeEnv(path.join(homeRoot, 'opl-state'), {
    HOME: homeRoot,
    PATH: `${fixtureRoot}:${process.env.PATH ?? ''}`,
    OPL_MODULES_ROOT: path.join(homeRoot, 'managed-modules'),
    OPL_MODULE_PATH_MEDAUTOSCIENCE: masFixture.sourceRoot,
    OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_PROFILE: profilePath,
    OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: dispatchPath,
  });
  try {
    for (let index = 0; index < 3; index += 1) {
      runCli([
        'family-runtime',
        'tick',
        '--source',
        `dm002-owner-v1-${index}`,
        '--hydrate',
        '--domain',
        'medautoscience',
        '--study',
        '002-dm-china-us-mortality-attribution',
      ], env);
    }
    const deadLetterQueue = runCli(['family-runtime', 'queue', 'list'], env);
    const deadLetterTask = deadLetterQueue.family_runtime_queue.tasks[0];
    assert.equal(deadLetterTask.status, 'dead_letter');
    assert.equal(deadLetterTask.attempts, 3);
    assert.match(deadLetterTask.last_error, /owner callable surface missing/);

    const sameOwner = runCli([
      'family-runtime',
      'tick',
      '--source',
      'dm002-owner-v1-repeat',
      '--hydrate',
      '--domain',
      'medautoscience',
      '--study',
      '002-dm-china-us-mortality-attribution',
    ], env);
    assert.equal(sameOwner.family_runtime_tick.hydration.enqueued_count, 0);
    assert.equal(sameOwner.family_runtime_tick.hydration.idempotent_noop_count, 1);
    assert.equal(sameOwner.family_runtime_tick.selected_count, 0);

    const nextSha = masFixture.advance('owner-surface.txt', 'owner callable restored\n', 'Restore owner callable');
    const updatedOwner = runCli([
      'family-runtime',
      'tick',
      '--source',
      'dm002-owner-v2',
      '--hydrate',
      '--domain',
      'medautoscience',
      '--study',
      '002-dm-china-us-mortality-attribution',
    ], env);
    const refreshed = runCli(['family-runtime', 'queue', 'inspect', deadLetterTask.task_id], env);
    const task = refreshed.family_runtime_task.task;
    const events = refreshed.family_runtime_task.events;
    const dispatchedTask = JSON.parse(fs.readFileSync(dispatchedTaskPath, 'utf8'));

    assert.equal(updatedOwner.family_runtime_tick.hydration.enqueued_count, 1);
    assert.equal(updatedOwner.family_runtime_tick.hydration.requeued_count, 1);
    assert.equal(updatedOwner.family_runtime_tick.selected_count, 1);
    assert.equal(updatedOwner.family_runtime_tick.dispatches[0].status, 'succeeded');
    assert.equal(task.status, 'succeeded');
    assert.equal(task.attempts, 1);
    assert.equal(task.last_error, null);
    assert.equal(task.dead_letter_reason, null);
    assert.match(task.payload.opl_domain_export_context.owner_fingerprint, new RegExp(nextSha));
    assert.match(dispatchedTask.payload.opl_domain_export_context.owner_fingerprint, new RegExp(nextSha));
    assert.equal(
      events.some((event: { event_type: string; payload: { reason?: string } }) =>
        event.event_type === 'task_requeued_from_dead_letter_after_domain_owner_update'
        && event.payload.reason === 'domain_export_owner_changed_after_dead_letter'
      ),
      true,
    );
    assert.equal(fs.readFileSync(dispatchCountPath, 'utf8').trim(), '4');
    assert.equal(
      fs.realpathSync(fs.readFileSync(uvCwdPath, 'utf8').trim()),
      fs.realpathSync(masFixture.sourceRoot),
    );
    assert.equal(fs.readFileSync(uvArgvPath, 'utf8').includes('domain-handler\nexport'), true);
  } finally {
    fs.rmSync(masFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

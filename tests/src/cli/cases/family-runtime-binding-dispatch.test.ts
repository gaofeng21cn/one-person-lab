import { assert, fs, os, path, runCli, shellSingleQuote, test, writeMasCleanRunnerFixture } from '../helpers.ts';

function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  return {
    OPL_STATE_DIR: stateRoot,
    ...extra,
  };
}

function jsString(value: string) {
  return JSON.stringify(value);
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

test('family-runtime binding tick dispatches MAS tasks through the active workspace checkout', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-binding-dispatch-home-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-binding-dispatch-'));
  const stateRoot = path.join(homeRoot, 'opl-state');
  const boundMasWorkspacePath = path.join(fixtureRoot, 'bound-med-autoscience');
  const boundProfilePath = path.join(fixtureRoot, 'dm-cvd.workspace.toml');
  const managedModulePath = path.join(homeRoot, 'managed-modules', 'med-autoscience');
  const uvPath = path.join(fixtureRoot, 'uv');
  const uvArgvPath = path.join(fixtureRoot, 'uv.argv');
  const uvCwdPath = path.join(fixtureRoot, 'uv.cwd');
  const dispatchedTaskPath = path.join(fixtureRoot, 'dispatched-task.json');
  fs.mkdirSync(boundMasWorkspacePath, { recursive: true });
  writeMasCleanRunnerFixture(boundMasWorkspacePath);
  fs.mkdirSync(managedModulePath, { recursive: true });
  fs.writeFileSync(boundProfilePath, '[workspace]\nname = "dm-cvd"\n', 'utf8');
  fs.writeFileSync(
    path.join(managedModulePath, 'package.json'),
    '{"scripts":{"unused":"true"}}\n',
    'utf8',
  );
  writeNodeScript(uvPath, `
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(1);
const boundWorkspacePath = fs.realpathSync(${jsString(boundMasWorkspacePath)});
const managedModulePath = fs.realpathSync(${jsString(managedModulePath)});
const cwd = fs.realpathSync(process.cwd());
fs.writeFileSync(${jsString(uvCwdPath)}, process.cwd() + '\\n');
fs.writeFileSync(${jsString(uvArgvPath)}, args.map(String).join('\\n') + '\\n');
const joined = \` \${args.join(' ')} \`;
if (cwd === boundWorkspacePath && joined.includes(' domain-handler export ')) {
  process.stdout.write(JSON.stringify({
    surface_kind: 'mas_family_domain_handler_export',
    pending_family_tasks: [
      {
        domain_id: 'medautoscience',
        task_kind: 'domain_route/owner-handoff',
        priority: 70,
        source: 'mas-controller-decision',
        dedupe_key: 'mas:dm-cvd:002-dm-china-us-mortality-attribution:controller-decision:fresh-binding',
        dispatch_owner: 'med-autoscience',
        payload: {
          profile: 'dm-cvd.workspace.toml',
          study_id: '002-dm-china-us-mortality-attribution',
          reason: 'quest_waiting_opl_runtime_owner_route',
        },
      },
    ],
  }) + '\\n');
  process.exit(0);
}
if (cwd === boundWorkspacePath && joined.includes(' domain-handler dispatch ')) {
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
    closeout_refs: ['mas:dm002:binding-dispatch'],
  }) + '\\n');
  process.exit(0);
}
if (cwd === managedModulePath) {
  process.stderr.write('stale managed med-autoscience module was used\\n');
  process.exit(44);
}
process.stderr.write(\`unexpected uv invocation: cwd=\${process.cwd()} argv=\${args.join(' ')}\\n\`);
process.exit(64);
`);
  const env = familyRuntimeEnv(stateRoot, {
    HOME: homeRoot,
    PATH: `${fixtureRoot}:${process.env.PATH ?? ''}`,
    OPL_MODULES_ROOT: path.join(homeRoot, 'managed-modules'),
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
    const tick = runCli([
      'family-runtime',
      'tick',
      '--source',
      'dm002-binding-dispatch',
      '--hydrate',
      '--domain',
      'medautoscience',
      '--study',
      '002-dm-china-us-mortality-attribution',
      '--task-kind',
      'domain_route/owner-handoff',
    ], env);
    const uvArgv = fs.readFileSync(uvArgvPath, 'utf8').trim().split('\n');

    assert.equal(
      tick.family_runtime_tick.hydration.enqueued_count,
      1,
      JSON.stringify(tick.family_runtime_tick, null, 2),
    );
    assert.equal(tick.family_runtime_tick.hydration.exports[0].command_source, 'workspace_binding');
    assert.equal(tick.family_runtime_tick.selected_count, 1);
    assert.equal(tick.family_runtime_tick.dispatches[0].status, 'succeeded');
    assert.deepEqual(tick.family_runtime_tick.dispatches[0].command_preview, [
      'uv',
      'run',
      'python',
      '-m',
      'med_autoscience.cli',
      'domain-handler',
      'dispatch',
      '--task',
      tick.family_runtime_tick.dispatches[0].command_preview[8],
      '--format',
      'json',
    ]);
    assert.equal(
      fs.realpathSync(fs.readFileSync(uvCwdPath, 'utf8').trim()),
      fs.realpathSync(boundMasWorkspacePath),
    );
    assert.deepEqual(uvArgv, tick.family_runtime_tick.dispatches[0].command_preview.slice(1));
    const dispatchedTask = JSON.parse(fs.readFileSync(dispatchedTaskPath, 'utf8'));
    assert.equal(dispatchedTask.payload.study_id, '002-dm-china-us-mortality-attribution');
    assert.equal(
      dispatchedTask.payload.opl_domain_export_context.command_source,
      'workspace_binding',
    );
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

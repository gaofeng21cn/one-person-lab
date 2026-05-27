import { assert, fs, os, path, runCli, shellSingleQuote, test, writeMasCleanRunnerFixture } from '../helpers.ts';

function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  return {
    OPL_STATE_DIR: stateRoot,
    ...extra,
  };
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
  fs.writeFileSync(
    uvPath,
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$PWD" > ${shellSingleQuote(uvCwdPath)}
: > ${shellSingleQuote(uvArgvPath)}
BOUND_WORKSPACE_REALPATH="$(cd ${shellSingleQuote(boundMasWorkspacePath)} && pwd -P)"
MANAGED_MODULE_REALPATH="$(cd ${shellSingleQuote(managedModulePath)} && pwd -P)"
PWD_REALPATH="$(pwd -P)"
for arg in "$@"; do
  printf '%s\\n' "$arg" >> ${shellSingleQuote(uvArgvPath)}
done
if [[ "$PWD_REALPATH" = "$BOUND_WORKSPACE_REALPATH" && " $* " == *" domain-handler export "* ]]; then
  cat <<'JSON'
{
  "surface_kind": "mas_family_domain_handler_export",
  "pending_family_tasks": [
    {
      "domain_id": "medautoscience",
      "task_kind": "domain_route/owner-handoff",
      "priority": 70,
      "source": "mas-controller-decision",
      "dedupe_key": "mas:dm-cvd:002-dm-china-us-mortality-attribution:controller-decision:fresh-binding",
      "dispatch_owner": "med-autoscience",
      "payload": {
        "profile": "dm-cvd.workspace.toml",
        "study_id": "002-dm-china-us-mortality-attribution",
        "reason": "quest_waiting_opl_runtime_owner_route"
      }
    }
  ]
}
JSON
  exit 0
fi
if [[ "$PWD_REALPATH" = "$BOUND_WORKSPACE_REALPATH" && " $* " == *" domain-handler dispatch "* ]]; then
  task_path=""
  previous=""
  for arg in "$@"; do
    if [ "$previous" = "--task" ]; then
      task_path="$arg"
      break
    fi
    previous="$arg"
  done
  test -n "$task_path"
  cp "$task_path" ${shellSingleQuote(dispatchedTaskPath)}
  cat <<'JSON'
{"accepted":true,"surface_kind":"mas_family_domain_handler_dispatch_receipt","closeout_refs":["mas:dm002:binding-dispatch"]}
JSON
  exit 0
fi
if [[ "$PWD_REALPATH" = "$MANAGED_MODULE_REALPATH" ]]; then
  echo "stale managed med-autoscience module was used" >&2
  exit 44
fi
echo "unexpected uv invocation: cwd=$PWD argv=$*" >&2
exit 64
`,
    { mode: 0o755 },
  );
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

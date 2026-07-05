import { assert, createGitModuleRemoteFixture, fs, os, parseJsonText, path, runCli, shellSingleQuote, test } from '../helpers.ts';
import { familyRuntimeEnv, jsString, writeJsonEmitterScript, writeNodeScript } from './family-runtime-binding-intake-helpers.ts';

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
const task = JSON.parse(fs.readFileSync(taskPath, 'utf8')); // reuse-first: allow embedded dispatch fixture JSON boundary.
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
    const dispatchedTask = parseJsonText(fs.readFileSync(dispatchedTaskPath, 'utf8')) as any;

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
  const masFixture = createGitModuleRemoteFixture('med-autoscience', {
    extraFiles: {
      'scripts/run-python-clean.sh': [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        `printf '%s\\n' "$PWD" > ${shellSingleQuote(uvCwdPath)}`,
        `: > ${shellSingleQuote(uvArgvPath)}`,
        `for arg in "$@"; do printf '%s\\n' "$arg" >> ${shellSingleQuote(uvArgvPath)}; done`,
        `exec ${shellSingleQuote(process.execPath)} -e ${shellSingleQuote(`process.stdout.write(${jsString(`${JSON.stringify({
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
        }, null, 2)}\n`)});`)} -- "$@"`,
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
printf 'legacy-path-uv-was-called\\n' >&2
exit 44
`,
    { mode: 0o755 },
  );
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
    const dispatchedTask = parseJsonText(fs.readFileSync(dispatchedTaskPath, 'utf8')) as any;

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

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import { canonicalJsonBytes } from '../../src/kernel/canonical-json.ts';
import { parseJsonText } from '../../src/kernel/json-file.ts';
import { resolveStandardAgent } from '../../src/kernel/standard-agent-registry.ts';
import { runStandardAgentAction } from '../../src/modules/runway/standard-agent-action-runtime.ts';
import { runStandardAgentHandlerSandbox } from '../../src/modules/runway/standard-agent-handler-sandbox.ts';

const checkout = process.env.OPL_MAS_ROUNDTRIP_CHECKOUT;
const sourceWorkspace = process.env.OPL_MAS_ROUNDTRIP_WORKSPACE;
const studyId = process.env.OPL_MAS_ROUNDTRIP_STUDY_ID;
const sourceUserAuthority = process.env.OPL_MAS_ROUNDTRIP_USER_AUTHORITY;
const sourceRevisionIntake = process.env.OPL_MAS_ROUNDTRIP_REVISION_INTAKE;
const actionId = process.env.OPL_MAS_ROUNDTRIP_ACTION_ID ?? 'bounded_analysis_campaign';
const expectedOperationCount = Number(process.env.OPL_MAS_ROUNDTRIP_EXPECTED_OPERATION_COUNT ?? '11');
const enabled = Boolean(
  checkout && sourceWorkspace && studyId && sourceUserAuthority && sourceRevisionIntake,
);

function sha256(bytes: string | Buffer) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function copyFile(sourceRoot: string, targetRoot: string, relative: string) {
  const source = path.join(sourceRoot, relative);
  assert.equal(fs.statSync(source).isFile(), true, `missing round-trip source: ${relative}`);
  const target = path.join(targetRoot, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  return target;
}

function writeJson(file: string, value: unknown) {
  const bytes = canonicalJsonBytes(value);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes);
  return { file, ref: pathToFileURL(file).href, bytes, sha256: sha256(bytes) };
}

function packageUseBinding() {
  return {
    surface_kind: 'opl_agent_package_use_binding.v1',
    use_boundary_id: 'package-use:mas-real-lifecycle-roundtrip',
    use_receipt_ref: 'opl://agent-package/use/mas-real-lifecycle-roundtrip',
    root_package: {
      package_id: 'mas',
      package_version: 'roundtrip',
      owner_language_version: { scheme: 'pep440', value: '0.0.0' },
      package_lock_ref: 'opl://agent-package-lock/mas/roundtrip',
      manifest_sha256: '1'.repeat(64),
      content_digest: `sha256:${'2'.repeat(64)}`,
      source_artifact_ref: 'oci://opl/mas@sha256:roundtrip',
      artifact_digest: `sha256:${'3'.repeat(64)}`,
      source_kind: 'first_party_managed_cohort',
    },
    provider_packages: [],
    dependency_closure_digest: '4'.repeat(64),
    core_skill_tree_digest: null,
    skill_tree_digest: null,
  };
}

test('OPL round-trips real MAS lifecycle schema and Python authority handler', {
  skip: enabled ? false : 'set OPL_MAS_ROUNDTRIP_* to run the cross-repository contract test',
}, async () => {
  const masCheckout = fs.realpathSync.native(checkout!);
  const sourceRoot = fs.realpathSync.native(sourceWorkspace!);
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-mas-real-lifecycle-roundtrip-'));
  let workspaceRoot = path.join(fixtureRoot, 'workspace');
  const stateRoot = path.join(fixtureRoot, 'state');
  const previousStateRoot = process.env.OPL_STATE_DIR;
  const studyRoot = `studies/${studyId}`;
  const projectionPaths = [
    'workspace_index.json',
    'runtime/artifacts/study_lifecycle_control/latest.json',
    'reports/latest_status.json',
    'reports/studies_index.json',
    `${studyRoot}/control/lifecycle.json`,
    `${studyRoot}/control/stage_index.json`,
    `${studyRoot}/submission/STATUS.json`,
    `${studyRoot}/publication/current_package/STATUS.json`,
  ];

  try {
    process.env.OPL_STATE_DIR = stateRoot;
    fs.mkdirSync(workspaceRoot, { recursive: true });
    workspaceRoot = fs.realpathSync.native(workspaceRoot);
    for (const relative of projectionPaths) copyFile(sourceRoot, workspaceRoot, relative);
    for (const relative of [
      `${studyRoot}/artifacts/controller/lifecycle_control/history`,
      'runtime/artifacts/study_lifecycle_control/history',
    ]) {
      assert.equal(fs.statSync(path.join(sourceRoot, relative)).isDirectory(), true);
      fs.mkdirSync(path.join(workspaceRoot, relative), { recursive: true });
    }

    const authorityTarget = path.join(workspaceRoot, studyRoot, 'control', 'roundtrip-user-authority.json');
    fs.mkdirSync(path.dirname(authorityTarget), { recursive: true });
    fs.copyFileSync(fs.realpathSync.native(sourceUserAuthority!), authorityTarget);
    const authorityBytes = fs.readFileSync(authorityTarget);
    const authorityRecord = parseJsonText(authorityBytes.toString('utf8')) as Record<string, unknown>;
    assert.equal(authorityRecord.study_id, studyId);

    const intakeRecord = parseJsonText(
      fs.readFileSync(fs.realpathSync.native(sourceRevisionIntake!), 'utf8'),
    ) as Record<string, unknown>;
    intakeRecord.user_authority_ref = pathToFileURL(authorityTarget).href;
    intakeRecord.user_authority_sha256 = `sha256:${sha256(authorityBytes)}`;
    const intake = writeJson(
      path.join(workspaceRoot, studyRoot, 'control', 'roundtrip-revision-intake.json'),
      intakeRecord,
    );
    assert.equal(intakeRecord.first_owning_stage_id, actionId);

    const profileBytes = Buffer.from('developer_supervisor_mode: true\n', 'utf8');
    const profileFile = path.join(workspaceRoot, 'control', 'roundtrip-profile.yaml');
    fs.mkdirSync(path.dirname(profileFile), { recursive: true });
    fs.writeFileSync(profileFile, profileBytes);
    const lifecycleFile = path.join(workspaceRoot, studyRoot, 'control', 'lifecycle.json');
    const lifecycleBytes = fs.readFileSync(lifecycleFile);
    const lifecycle = parseJsonText(lifecycleBytes.toString('utf8')) as Record<string, unknown>;
    const recordedAt = String(authorityRecord.recorded_at);
    const runId = 'mas-real-lifecycle-roundtrip';
    let handlerCalls = 0;
    let stageCalls = 0;
    const authorityOutputs: Record<string, any>[] = [];
    const packageBinding = packageUseBinding();

    const result = await runStandardAgentAction({
      domainId: 'mas',
      actionId,
      workspaceRoot,
      payload: {
        study_id: studyId,
        lifecycle_admission: {
          surface_kind: 'opl_domain_lifecycle_admission',
          version: 'opl-domain-lifecycle-admission.v1',
          mode: 'reactivation_request',
          reactivation_request: {
            user_authority_ref: pathToFileURL(authorityTarget).href,
            user_authority_sha256: `sha256:${sha256(authorityBytes)}`,
            reviewer_revision_intake_ref: intake.ref,
            reviewer_revision_intake_sha256: `sha256:${intake.sha256}`,
            current_lifecycle_ref: pathToFileURL(lifecycleFile).href,
            current_lifecycle_sha256: `sha256:${sha256(lifecycleBytes)}`,
            profile_ref: pathToFileURL(profileFile).href,
            profile_sha256: `sha256:${sha256(profileBytes)}`,
            observed_lifecycle_state: lifecycle.lifecycle_state,
            observed_lifecycle_generation: lifecycle.generation,
            explicit_user_wakeup: true,
            allow_stopped_relaunch: false,
            requested_at: recordedAt,
            reason_code: 'reviewer_revision_reactivation',
            reason_summary: 'Run the real MAS lifecycle authority contract round-trip.',
          },
        },
      },
      runId,
    }, {
      resolveManagedCheckout: async () => ({
        agent: resolveStandardAgent('mas')!,
        package_id: 'mas',
        workspace_root: fs.realpathSync.native(workspaceRoot),
        checkout_root: masCheckout,
        package_status: {
          installed_package_count: 1,
          launch_allowed: true,
          runtime_source_readiness: { operational_ready: true, checkout_path: masCheckout },
        },
        package_use_binding: packageBinding,
        use_boundary_id: packageBinding.use_boundary_id,
      }) as never,
      compileStageManifest: (() => ({})) as never,
      recordLedger: ((input: Record<string, unknown>) => ({
        ledger_entry: { run_id: input.runId, status: input.status },
        recorded_event: { event_type: 'standard_agent_action_run_recorded' },
      })) as never,
      runHandler: ((input: Parameters<typeof runStandardAgentHandlerSandbox>[0]) => {
        handlerCalls += 1;
        const request = input.request as Record<string, any>;
        assert.equal(Object.hasOwn(request.authority_context, 'profile_ref'), false);
        if (request.user_authority.authority_bytes_base64 !== undefined) {
          assert.deepEqual(
            Buffer.from(request.user_authority.authority_bytes_base64, 'base64'),
            authorityBytes,
          );
          assert.deepEqual(
            Buffer.from(request.reviewer_revision_intake.intake_bytes_base64, 'base64'),
            intake.bytes,
          );
        }
        for (const target of request.projection_inventory.targets) {
          if (target.bytes_base64 !== undefined) {
            assert.deepEqual(
              Buffer.from(target.bytes_base64, 'base64'),
              fs.readFileSync(new URL(target.ref)),
            );
          }
        }
        const receipt = runStandardAgentHandlerSandbox(input);
        const authorityOutput = receipt.output as Record<string, any>;
        authorityOutputs.push(authorityOutput);
        for (const operation of authorityOutput.opl_host_materialization_request.operations) {
          const relative = String(operation.target_relative_path);
          fs.mkdirSync(path.dirname(path.join(workspaceRoot, relative)), { recursive: true });
        }
        return receipt;
      }) as never,
      runStageRuntime: async (args: string[]) => {
        if (args[0] === 'attempt') {
          stageCalls += 1;
          return {
            family_runtime_stage_run: {
              stage_run_input: { workflow_id: 'wf-mas-real-lifecycle-roundtrip' },
              blocked_reason: null,
              temporal_start: { start_status: 'started' },
            },
          };
        }
        return { family_runtime_stage_run_query: { status: 'running' } };
      },
    });

    assert.equal(result.standard_agent_action_run.execution_kind, 'stage_binding');
    if (result.standard_agent_action_run.execution_kind !== 'stage_binding') {
      assert.fail('expected a lifecycle-gated Stage action result');
    }
    assert.equal(
      result.standard_agent_action_run.domain_lifecycle_admission.status,
      'admitted_by_current_reactivation_receipt',
    );
    assert.equal(handlerCalls, 1);
    assert.equal(stageCalls, 1);
    const authorityOutput = authorityOutputs[0];
    assert.ok(authorityOutput);
    assert.equal(authorityOutput.status, 'authorized');
    assert.equal(authorityOutput.opl_host_materialization_request.domain_id, 'medautoscience');
    assert.equal(authorityOutput.opl_host_materialization_request.operations.length, expectedOperationCount);
    const afterLifecycle = parseJsonText(fs.readFileSync(lifecycleFile, 'utf8')) as Record<string, unknown>;
    assert.equal(afterLifecycle.lifecycle_state, 'active');
    assert.equal(afterLifecycle.generation, Number(lifecycle.generation) + 1);
    const receiptTargets = authorityOutput.opl_host_materialization_request.operations
      .map((operation: Record<string, unknown>) => String(operation.target_relative_path))
      .filter((relative: string) => /reactivation[_-]receipt/u.test(relative));
    assert.equal(receiptTargets.length, 1);
    assert.equal(fs.statSync(path.join(workspaceRoot, receiptTargets[0]!)).isFile(), true);
  } finally {
    if (previousStateRoot === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateRoot;
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

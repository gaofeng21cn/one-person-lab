import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import { Client, Connection } from '@temporalio/client';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';

import { registerAgentPackageReadinessPort } from '../../src/kernel/agent-package-readiness-port.ts';
import {
  ensureOplAgentPackageScopeActivation,
  runOplAgentPackageStatus,
} from '../../src/modules/connect/agent-package-registry.ts';
import { runFamilyRuntime } from '../../src/modules/runway/family-runtime.ts';
import {
  stageQualityAttemptMaterializeActivity,
  stageQualityAttemptSyncActivity,
  stageQualityCycleProjectActivity,
  stageQualityReviewReceiptActivity,
} from '../../src/modules/runway/family-runtime-temporal-activities.ts';
import { verifyStageQualityCloseoutArtifactIdentity } from '../../src/modules/runway/family-runtime-codex-stage-runner-parts/artifact-identity-verification.ts';
import type { TemporalStageAttemptWorkflowInput } from '../../src/modules/runway/family-runtime-temporal.ts';

const repoRoot = path.resolve(import.meta.dirname, '../..');

function writeJson(root: string, ref: string, value: unknown) {
  const file = path.join(root, ref);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeText(root: string, ref: string, value: string) {
  const file = path.join(root, ref);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value, 'utf8');
}

function createPackFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-bound-quality-e2e-'));
  const requiredPackPaths = [
    'agent/stages/manifest.json',
    'agent/stages/draft.md',
    'agent/prompts/draft.md',
    'agent/knowledge/domain.md',
    'agent/quality_gates/quality.md',
    'agent/skills/domain.md',
    'agent/tools/domain.md',
  ];
  writeText(root, 'agent/stages/draft.md', '# Draft policy\n');
  writeText(root, 'agent/prompts/draft.md', `# Draft

## Producer
Produce the exact requested draft artifact and report its identity.

## Reviewer
Review the exact producer artifact against the declared rubric.

## Repairer
Repair only required findings and report changed artifact identity.

## Re Reviewer
Close prior findings against the repaired artifact.
`);
  writeText(root, 'agent/knowledge/domain.md', '# Domain knowledge\n');
  writeText(root, 'agent/quality_gates/quality.md', '# Quality rubric\n\nThe draft is complete and source-grounded.\n');
  writeText(root, 'agent/skills/domain.md', '# Domain skill\n');
  writeText(root, 'agent/tools/domain.md', '# Domain tools\n');
  writeText(root, 'runtime/authority_functions/README.md', '# Authority functions\n');
  writeJson(root, 'contracts/owner_receipt_contract.json', {
    surface_kind: 'owner_receipt_contract',
  });
  writeJson(root, 'contracts/domain_descriptor.json', {
    surface_kind: 'domain_agent_descriptor',
    schema_version: 1,
    domain_id: 'medautoscience',
    domain_label: 'Pack-bound MAS fixture',
    authority_boundary: {
      opl_can_write_domain_truth: false,
      opl_can_write_memory_body: false,
      opl_can_authorize_quality_or_export: false,
    },
  });
  writeJson(root, 'contracts/input.schema.json', {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: { workspace_root: { type: 'string' } },
    required: ['workspace_root'],
  });
  writeJson(root, 'contracts/output.schema.json', {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
  });
  writeJson(root, 'contracts/action_catalog.json', {
    surface_kind: 'family_action_catalog',
    version: 'family-action-catalog.v2',
    catalog_id: 'pack_bound_quality_e2e.actions',
    target_domain_id: 'medautoscience',
    owner: 'medautoscience',
    authority_boundary: {
      domain_truth_owner: 'medautoscience',
      opl_role: 'projection_consumer_only',
      write_policy: 'no_domain_truth_writes',
    },
    actions: [{
      action_id: 'draft',
      title: 'Draft',
      summary: 'Create a draft artifact.',
      owner: 'medautoscience',
      effect: 'mutating',
      execution_binding: {
        kind: 'stage_binding',
        stage_manifest_ref: 'agent/stages/manifest.json',
      },
      input_schema_ref: 'contracts/input.schema.json',
      output_schema_ref: 'contracts/output.schema.json',
      required_fields: ['workspace_root'],
      optional_fields: [],
      workspace_locator_fields: ['workspace_root'],
      human_gate_ids: [],
      stage_route: {
        entry_stage_ref: 'draft',
        required_stage_refs: ['draft'],
        optional_stage_refs: [],
        terminal_stage_refs: ['draft'],
        route_policy: 'ai_selected_progress_route',
      },
      supported_surfaces: {
        cli: { surface_kind: 'domain_cli' },
        mcp: { tool_name: 'mas_draft', surface_kind: 'domain_mcp' },
        skill: { command_contract_id: 'mas.draft', surface_kind: 'domain_skill' },
        product_entry: { action_key: 'draft', surface_kind: 'domain_product_entry' },
        openai: { tool_name: 'mas_draft' },
        ai_sdk: { tool_name: 'mas_draft' },
      },
      authority_boundary: {},
    }],
    notes: [],
  });
  writeJson(root, 'contracts/pack_compiler_input.json', {
    surface_kind: 'opl_domain_pack_compiler_input',
    domain_id: 'medautoscience',
    canonical_agent_id: 'mas',
    generated_surface_owner: 'one-person-lab',
    domain_repo_can_own_generated_surface: false,
    authority_boundary: {
      opl_can_write_domain_truth: false,
      opl_can_write_memory_body: false,
      opl_can_authorize_quality_or_export: false,
      domain_can_claim_generated_surface_owner: false,
    },
    required_domain_pack_paths: requiredPackPaths,
  });
  writeJson(root, 'contracts/stage_quality_cycle_policy.json', {
    surface_kind: 'opl_domain_stage_quality_cycle_profile',
    version: 'domain-stage-quality-cycle-profile.v1',
    stages: {
      draft: {
        surface_kind: 'opl_stage_quality_cycle_policy',
        version: 'stage-quality-cycle-policy.v1',
        enabled: true,
        stage_prompt_ref: 'agent/prompts/draft.md',
        role_prompt_refs: {
          producer: 'agent/prompts/draft.md#producer',
          reviewer: 'agent/prompts/draft.md#reviewer',
          repairer: 'agent/prompts/draft.md#repairer',
          re_reviewer: 'agent/prompts/draft.md#re-reviewer',
        },
        quality_rubric_refs: ['agent/quality_gates/quality.md'],
        in_thread_refinement: { allowed: true, authoritative: false },
        formal_review: {
          required: true,
          risk_tier: 'high',
          review_depth: 'multi_axis',
          context_isolation_required: true,
          max_repair_rounds: 3,
        },
        budget_exhaustion: 'complete_with_quality_debt_if_consumable',
        attempt_boundary: {
          inherits_stage_goal_scope_authority: true,
          role_overlay_may_only_narrow: true,
          controller_creates_next_attempt: true,
          attempt_is_not_sub_stage: true,
        },
      },
    },
  });
  writeJson(root, 'agent/stages/manifest.json', {
    surface_kind: 'opl_standard_agent_declarative_stage_manifest',
    version: 'opl-standard-agent-declarative-stage-manifest.v1',
    target_domain_id: 'medautoscience',
    owner: 'medautoscience',
    authority_boundary: {
      domain_truth_owner: 'medautoscience',
      opl_can_write_domain_truth: false,
      opl_can_authorize_quality_or_export: false,
    },
    stages: [{
      stage_id: 'draft',
      stage_kind: 'creation',
      title: 'Draft',
      summary: 'Create the requested draft.',
      goal: 'Produce one source-grounded, consumable draft artifact.',
      policy_ref: 'agent/stages/draft.md',
      prompt_ref: 'agent/prompts/draft.md',
      knowledge_refs: ['agent/knowledge/domain.md'],
      quality_gate_refs: ['agent/quality_gates/quality.md'],
      allowed_action_refs: ['draft'],
      requires: ['source_request'],
      ensures: ['consumable_draft'],
      next_stage_refs: [],
      trust_lane: 'domain_agent',
      stage_quality_cycle_policy_ref: 'contracts/stage_quality_cycle_policy.json#/stages/draft',
    }],
  });
  return root;
}

function packageUseBinding(packRoot: string) {
  const manifestBytes = fs.readFileSync(path.join(packRoot, 'agent/stages/manifest.json'));
  const manifestSha256 = crypto.createHash('sha256').update(manifestBytes).digest('hex');
  const rootContentDigest = crypto.createHash('sha256')
    .update('pack-bound-quality-e2e-root-package-v1')
    .digest('hex');
  const closureDigest = crypto.createHash('sha256')
    .update(`medautoscience\0${manifestSha256}\0${rootContentDigest}`)
    .digest('hex');
  return {
    surface_kind: 'opl_agent_package_use_binding.v1',
    use_boundary_id: 'package-use:pack-bound-quality-e2e',
    use_receipt_ref: 'opl://agent-package/use/pack-bound-quality-e2e',
    root_package: {
      package_id: 'medautoscience',
      package_version: '0.0.0-test',
      owner_language_version: { scheme: 'pep440', value: '0.0.0-test' },
      package_lock_ref: 'opl://agent-package-lock/medautoscience/0.0.0-test',
      manifest_sha256: manifestSha256,
      content_digest: `sha256:${rootContentDigest}`,
      source_artifact_ref: null,
      artifact_digest: null,
    },
    provider_packages: [],
    dependency_closure_digest: closureDigest,
  };
}

function restoreEnv(previous: Map<string, string | undefined>) {
  for (const [key, value] of previous) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

test('pack-bound CLI launch persists isolated review attempts and terminal quality projection', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-bound-quality-state-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-bound-quality-workspace-'));
  const familyWorkspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-bound-family-workspace-'));
  const packRoot = createPackFixture();
  const useBinding = packageUseBinding(packRoot);
  const artifactBytes = Buffer.from('pack-bound-draft-v1');
  const artifactPath = path.join(workspaceRoot, 'draft.txt');
  fs.writeFileSync(artifactPath, artifactBytes);
  const artifactRef = pathToFileURL(artifactPath).href;
  const artifactHash = crypto.createHash('sha256').update(artifactBytes).digest('hex');
  const testEnv = await TestWorkflowEnvironment.createLocal({
    server: { searchAttributes: [] },
  });
  const namespace = testEnv.namespace ?? 'default';
  const taskQueue = `opl-pack-bound-quality-e2e-${Date.now()}`;
  const envKeys = [
    'OPL_STATE_DIR',
    'OPL_FAMILY_WORKSPACE_ROOT',
    'OPL_TEMPORAL_ADDRESS',
    'TEMPORAL_ADDRESS',
    'OPL_TEMPORAL_NAMESPACE',
    'OPL_TEMPORAL_TASK_QUEUE',
  ];
  const previousEnv = new Map(envKeys.map((key) => [key, process.env[key]]));
  process.env.OPL_STATE_DIR = stateRoot;
  process.env.OPL_FAMILY_WORKSPACE_ROOT = familyWorkspaceRoot;
  process.env.OPL_TEMPORAL_ADDRESS = testEnv.address;
  delete process.env.TEMPORAL_ADDRESS;
  process.env.OPL_TEMPORAL_NAMESPACE = namespace;
  process.env.OPL_TEMPORAL_TASK_QUEUE = taskQueue;
  registerAgentPackageReadinessPort({
    readStatus: () => ({
      opl_agent_package_status: {
        installed_package_count: 1,
        launch_allowed: true,
      },
    }),
    ensureScopeActivation: async () => ({ package_use_binding: useBinding }),
  });

  const activities = {
    stageQualityAttemptMaterializeActivity,
    stageQualityAttemptSyncActivity,
    stageQualityCycleProjectActivity,
    stageQualityReviewReceiptActivity,
    async codexStageActivity(attempt: TemporalStageAttemptWorkflowInput) {
      const threadId = `thread-${attempt.attempt_role}-${attempt.stage_attempt_id}`;
      const closeoutPacket = attempt.attempt_role === 'producer'
        ? verifyStageQualityCloseoutArtifactIdentity({
            closeoutPacket: {
              surface_kind: 'stage_attempt_closeout_packet',
              stage_attempt_id: attempt.stage_attempt_id,
              closeout_refs: [artifactRef],
              closeout_ref_metadata: [{ ref: artifactRef, sha256: artifactHash }],
              consumed_refs: [],
              consumed_memory_refs: [],
              writeback_receipt_refs: [],
              rejected_writes: [],
              next_owner: null,
              domain_ready_verdict: null,
              route_impact: {
                stage_quality_cycle: {
                  artifact_refs: [artifactRef],
                  artifact_hashes: [artifactHash],
                },
              },
              authority_boundary: {
                opl: 'closeout_transport_only',
                domain: 'truth_quality_artifact_gate_owner',
              },
            },
            attempt: attempt as unknown as Record<string, unknown>,
            workspaceRoot,
          })
        : {
            surface_kind: 'stage_attempt_closeout_packet' as const,
            stage_attempt_id: attempt.stage_attempt_id,
            closeout_refs: [`codex-closeout:${attempt.stage_attempt_id}`],
          };
      return {
        surface_kind: 'temporal_codex_stage_activity_receipt',
        stage_attempt_id: attempt.stage_attempt_id,
        stage_id: attempt.stage_id,
        executor_kind: attempt.executor_kind,
        checkpoint_refs: [],
        progress_summary: {
          thread_id: threadId,
          execution_session_ref: `codex://threads/${threadId}`,
        },
        closeout_packet: closeoutPacket,
      };
    },
    async domainHandlerDispatchActivity(attempt: TemporalStageAttemptWorkflowInput) {
      const role = attempt.attempt_role;
      return {
        surface_kind: 'temporal_domain_handler_dispatch_receipt',
        closeout_refs: [`domain-closeout:${attempt.stage_attempt_id}`],
        consumed_refs: [],
        consumed_memory_refs: [],
        writeback_receipt_refs: [],
        rejected_writes: [],
        next_owner: 'medautoscience',
        domain_ready_verdict: 'domain_gate_pending',
        route_impact: {
          stage_quality_cycle: {
            artifact_refs: [artifactRef],
            artifact_hashes: [artifactHash],
            ...(role === 'reviewer' ? { outcome: 'pass', findings: [] } : {}),
          },
        },
        closeout_packet_surface_kind: 'domain_stage_closeout_packet',
        closeout_ref_metadata: role === 'producer'
          ? attempt.closeout_packet?.closeout_ref_metadata ?? []
          : [],
      };
    },
  };

  try {
    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace,
      taskQueue,
      workflowsPath: path.join(repoRoot, 'src/modules/runway/family-runtime-temporal-workflows.ts'),
      activities,
    });
    const execution = await worker.runUntil(async () => {
      const baseArgs = [
        'attempt',
        'create',
        '--domain',
        'medautoscience',
        '--stage',
        'draft',
        '--provider',
        'temporal',
        '--workspace-locator',
        JSON.stringify({ workspace_root: workspaceRoot, domain_pack_root: packRoot }),
        '--source-fingerprint',
        'sha256:e69550085779bc9bd1bf36c55d7f3bf244254c3c8c8a8799ae97e55b86786289',
        '--start',
      ];
      const connection = await Connection.connect({ address: testEnv.address });
      try {
        const client = new Client({ connection, namespace });
        const executeNewStageRun = async (args: string[]) => {
          const cli = await runFamilyRuntime(args);
          const launch = cli.family_runtime_stage_run as any;
          const handle = client.workflow.getHandle(
            launch.stage_run_input.workflow_id,
            launch.temporal_start.first_execution_run_id,
          );
          return { cli, state: await handle.result() };
        };
        const first = await executeNewStageRun(baseArgs);
        const replay = await runFamilyRuntime(baseArgs);
        const explicitNew = await executeNewStageRun([...baseArgs, '--new-stage-run']);
        const compatibilityAlias = await executeNewStageRun([...baseArgs, '--new-attempt']);
        return { first, replay, explicitNew, compatibilityAlias };
      } finally {
        await connection.close();
      }
    });

    const launch = execution.first.cli.family_runtime_stage_run as any;
    const stageRunInput = launch.stage_run_input;
    const state = execution.first.state as any;
    const replayLaunch = execution.replay.family_runtime_stage_run as any;
    const explicitNewLaunch = execution.explicitNew.cli.family_runtime_stage_run as any;
    const compatibilityAliasLaunch = execution.compatibilityAlias.cli.family_runtime_stage_run as any;
    const manifestSource = fs.readFileSync(path.join(packRoot, 'agent/stages/manifest.json'), 'utf8');
    const manifestHash = crypto.createHash('sha256').update(manifestSource).digest('hex');

    assert.equal(launch.temporal_start.task_queue, taskQueue);
    assert.equal(stageRunInput.domain_pack_root, packRoot);
    assert.equal(stageRunInput.stage_manifest_ref, 'agent/stages/manifest.json');
    assert.equal(stageRunInput.stage_manifest_sha256, manifestHash);
    assert.equal(stageRunInput.quality_policy_ref,
      'contracts/stage_quality_cycle_policy.json#/stages/draft');
    assert.deepEqual(stageRunInput.role_prompt_refs, {
      producer: 'agent/prompts/draft.md#producer',
      reviewer: 'agent/prompts/draft.md#reviewer',
      repairer: 'agent/prompts/draft.md#repairer',
      re_reviewer: 'agent/prompts/draft.md#re-reviewer',
    });
    assert.deepEqual(stageRunInput.quality_rubric_refs, ['agent/quality_gates/quality.md']);
    assert.equal(replayLaunch.stage_run_input.stage_run_id, stageRunInput.stage_run_id);
    assert.equal(replayLaunch.durable_launch.start_status, 'existing');
    assert.equal(replayLaunch.durable_launch.launch.launch_status, 'closed');
    assert.equal(
      replayLaunch.temporal_start.first_execution_run_id,
      launch.temporal_start.first_execution_run_id,
    );
    assert.notEqual(explicitNewLaunch.stage_run_input.stage_run_id, stageRunInput.stage_run_id);
    assert.notEqual(
      compatibilityAliasLaunch.stage_run_input.stage_run_id,
      stageRunInput.stage_run_id,
    );
    assert.notEqual(
      compatibilityAliasLaunch.stage_run_input.stage_run_id,
      explicitNewLaunch.stage_run_input.stage_run_id,
    );
    assert.equal(explicitNewLaunch.durable_launch.start_status, 'started');
    assert.equal(compatibilityAliasLaunch.durable_launch.start_status, 'started');

    assert.equal(state.status, 'completed', JSON.stringify(state, null, 2));
    assert.equal(state.sqlite_projection.status, 'synced');
    assert.equal(state.repair_rounds_used, 0);
    assert.deepEqual(state.attempts.map((attempt: any) => attempt.attempt_role), ['producer', 'reviewer']);
    assert.deepEqual(state.artifact_refs, [artifactRef]);
    assert.deepEqual(state.artifact_hashes, [artifactHash]);
    assert.equal(state.artifact_identity_receipt_refs.length, 1);
    assert.match(state.artifact_identity_receipt_refs[0], /^file:\/\//);
    const identityReceiptPath = new URL(state.artifact_identity_receipt_refs[0]);
    const identityReceiptBytes = fs.readFileSync(identityReceiptPath);
    assert.equal(
      path.basename(identityReceiptPath.pathname),
      `${crypto.createHash('sha256').update(identityReceiptBytes).digest('hex')}.json`,
    );
    const identityReceipt = JSON.parse(identityReceiptBytes.toString('utf8'));
    assert.equal(identityReceipt.artifact_ref, artifactRef);
    assert.equal(identityReceipt.sha256, artifactHash);
    assert.equal(state.review_receipts.length, 1);

    const db = new DatabaseSync(path.join(stateRoot, 'family-runtime', 'queue.sqlite'));
    try {
      const attempts = db.prepare(`
        SELECT stage_attempt_id, workflow_id, stage_run_id, quality_cycle_id, attempt_role,
          quality_round_index, input_artifact_refs_json, reviewed_artifact_hashes_json,
          execution_session_ref, no_context_inheritance, status
        FROM stage_attempts
        WHERE stage_run_id = ?
        ORDER BY quality_round_index ASC,
          CASE attempt_role WHEN 'producer' THEN 0 WHEN 'reviewer' THEN 1 ELSE 2 END ASC
      `).all(stageRunInput.stage_run_id) as Array<Record<string, any>>;
      assert.equal(attempts.length, 2);
      assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), ['producer', 'reviewer']);
      assert.equal(new Set(attempts.map((attempt) => attempt.stage_run_id)).size, 1);
      assert.equal(new Set(attempts.map((attempt) => attempt.quality_cycle_id)).size, 1);
      assert.equal(new Set(attempts.map((attempt) => attempt.stage_attempt_id)).size, 2);
      assert.equal(new Set(attempts.map((attempt) => attempt.workflow_id)).size, 2);
      assert.equal(new Set(attempts.map((attempt) => attempt.execution_session_ref)).size, 2);
      assert.equal(attempts.every((attempt) => attempt.no_context_inheritance === 1), true);
      assert.equal(attempts.every((attempt) => attempt.status === 'completed'), true);

      const producer = attempts[0]!;
      const reviewer = attempts[1]!;
      assert.equal(identityReceipt.stage_attempt_id, producer.stage_attempt_id);
      assert.deepEqual(JSON.parse(reviewer.input_artifact_refs_json), [artifactRef]);
      assert.deepEqual(JSON.parse(reviewer.reviewed_artifact_hashes_json), [artifactHash]);
      const receipt = state.review_receipts[0];
      assert.equal(receipt.producer_attempt_ref, `opl://stage_attempts/${producer.stage_attempt_id}`);
      assert.equal(receipt.reviewer_attempt_ref, `opl://stage_attempts/${reviewer.stage_attempt_id}`);
      assert.equal(receipt.producer_session_ref, producer.execution_session_ref);
      assert.equal(receipt.reviewer_session_ref, reviewer.execution_session_ref);
      assert.notEqual(receipt.producer_session_ref, receipt.reviewer_session_ref);
      assert.equal(receipt.no_context_inheritance, true);
      assert.deepEqual(receipt.reviewed_artifact_refs, [artifactRef]);
      assert.deepEqual(receipt.reviewed_artifact_hashes, [artifactHash]);
      assert.deepEqual(receipt.rubric_refs, ['agent/quality_gates/quality.md']);
      assert.equal(receipt.verdict, 'pass');

      const cycle = db.prepare(`
        SELECT stage_run_id, state_json, current_attempt_ref
        FROM stage_quality_cycles WHERE quality_cycle_id = ?
      `).get(state.quality_cycle_id) as Record<string, any>;
      const projected = JSON.parse(cycle.state_json);
      assert.equal(cycle.stage_run_id, stageRunInput.stage_run_id);
      assert.equal(cycle.current_attempt_ref, null);
      assert.equal(projected.status, 'passed');
      assert.deepEqual(projected.selected_artifact_refs, [artifactRef]);
      assert.equal(projected.controller_readback.controller_status, 'completed');
      assert.deepEqual(
        projected.controller_readback.attempts.map((attempt: any) => attempt.attempt_role),
        ['producer', 'reviewer'],
      );
      assert.deepEqual(projected.controller_readback.review_receipts, state.review_receipts);

      const launches = db.prepare(`
        SELECT stage_run_id, launch_status, terminal_status
        FROM stage_run_launches
        ORDER BY created_at ASC
      `).all() as Array<Record<string, any>>;
      assert.equal(launches.length, 3);
      assert.equal(new Set(launches.map((entry) => entry.stage_run_id)).size, 3);
      assert.equal(launches.every((entry) => entry.launch_status === 'closed'), true);
      assert.equal(launches.every((entry) => entry.terminal_status === 'completed'), true);
    } finally {
      db.close();
    }
  } finally {
    registerAgentPackageReadinessPort({
      readStatus: runOplAgentPackageStatus,
      ensureScopeActivation: ensureOplAgentPackageScopeActivation,
    });
    restoreEnv(previousEnv);
    await testEnv.teardown();
    for (const target of [stateRoot, workspaceRoot, familyWorkspaceRoot, packRoot]) {
      fs.rmSync(target, { recursive: true, force: true });
    }
  }
});

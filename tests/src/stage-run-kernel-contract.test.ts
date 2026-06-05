import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const contractPath = 'contracts/opl-framework/stage-run-kernel-contract.json';
const modulePath = 'src/stage-run-kernel.ts';

function readJson<T>(relativePath: string): T {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as T;
}

test('StageRun Kernel contract freezes OPL refs-only substrate and MAS authority boundary', () => {
  assert.equal(fs.existsSync(path.join(repoRoot, contractPath)), true, 'StageRun Kernel contract is missing');
  const contract = readJson<Record<string, any>>(contractPath);

  assert.equal(contract.surface_kind, 'opl_stage_run_kernel_contract');
  assert.equal(contract.owner, 'one-person-lab');
  assert.equal(contract.state, 'active_contract');
  assert.equal(contract.machine_boundary.opl_owns.stage_run_spec, true);
  assert.equal(contract.machine_boundary.opl_owns.stage_run_status, true);
  assert.equal(contract.machine_boundary.opl_owns.event_log, true);
  assert.equal(contract.machine_boundary.opl_owns.projection_rebuild, true);
  assert.equal(contract.machine_boundary.mas_owns.stage_semantics, true);
  assert.equal(contract.machine_boundary.mas_owns.owner_receipt_signing, true);
  assert.equal(contract.machine_boundary.mas_owns.typed_blocker_creation, true);
  assert.equal(contract.machine_boundary.mas_owns.publication_verdict, true);
});

test('StageRun Kernel contract forbids body storage and domain authority promotion', () => {
  const contract = readJson<Record<string, any>>(contractPath);

  for (const payload of [
    'artifact body',
    'memory body',
    'domain truth body',
    'owner receipt body',
    'typed blocker body',
    'publication verdict body',
    'quality verdict body',
  ]) {
    assert.equal(contract.forbidden_payloads.includes(payload), true, `missing forbidden payload ${payload}`);
  }

  assert.equal(contract.authority_boundary.opl_can_write_domain_truth, false);
  assert.equal(contract.authority_boundary.opl_can_mutate_artifact_body, false);
  assert.equal(contract.authority_boundary.opl_can_store_memory_body, false);
  assert.equal(contract.authority_boundary.opl_can_create_owner_receipt, false);
  assert.equal(contract.authority_boundary.opl_can_create_typed_blocker, false);
  assert.equal(contract.authority_boundary.opl_can_authorize_publication_or_quality_verdict, false);
  assert.equal(contract.authority_boundary.read_model_can_be_truth_source, false);
  assert.equal(contract.authority_boundary.provider_completion_counts_as_domain_accepted, false);
});

test('StageRun Kernel contract separates launch, closeout, advisory, and forbidden authority fields', () => {
  const contract = readJson<Record<string, any>>(contractPath);
  const writingRules = contract.contract_writing_rules;
  const conformance = contract.conformance_output;

  assert.deepEqual(writingRules.required_for_launch, [
    'stage_run_id',
    'domain_id',
    'stage_id',
    'generation',
    'current_pointer',
    'stage_manifest',
    'owner',
    'selected_executor',
    'authority_boundary',
    'required_role_artifacts',
    'expected_receipt_or_blocker',
    'input_refs',
    'replay_audit_lineage_refs',
  ]);
  assert.deepEqual(writingRules.required_for_closeout, [
    'current_generation_role_artifacts',
    'stage_manifest_validity',
    'owner_receipt_or_typed_blocker',
    'current_pointer',
    'content_hashes',
    'lineage_refs',
  ]);
  assert.deepEqual(writingRules.advisory_for_context, [
    'prompt_refs',
    'skill_refs',
    'tool_affordance_refs',
    'knowledge_refs',
    'rubric_refs',
    'evaluation_refs',
    'assumption_refs',
    'monitor_refs',
  ]);
  assert.deepEqual(writingRules.route_back_when_missing, [
    'prompt_refs',
    'skill_refs',
    'tool_affordance_refs',
    'knowledge_refs',
    'rubric_refs',
    'evaluation_refs',
  ]);
  assert.deepEqual(writingRules.forbidden_as_authority, [
    'State Index',
    'stage_progress_log',
    'provider completion',
    'readiness',
    'verified ledger',
    'file presence',
    'conformance passed',
  ]);

  assert.deepEqual(conformance.required_sections, [
    'status',
    'launch_blockers',
    'closeout_blockers',
    'advisory_warnings',
    'route_back_recommendations',
    'audit_drilldown_refs',
    'forbidden_authority_flags',
  ]);
  assert.deepEqual(conformance.default_blocking_sections, [
    'launch_blockers',
    'closeout_blockers',
  ]);
  assert.deepEqual(conformance.non_blocking_default_sections, [
    'advisory_warnings',
    'route_back_recommendations',
    'audit_drilldown_refs',
  ]);
});

test('StageRun Kernel contract freezes launch closeout and advisory conformance layers', () => {
  const contract = readJson<Record<string, any>>(contractPath);

  assert.deepEqual(contract.admission_policy.launch_hard_blockers, [
    'identity',
    'owner',
    'scope',
    'selected_executor',
    'authority_boundary',
    'required_role_artifacts',
    'expected_receipt_or_typed_blocker_shape',
    'forbidden_write',
    'replay_audit_lineage',
  ]);
  assert.equal(contract.admission_policy.strategy_refs_default, 'advisory_or_route_back');
  assert.equal(contract.admission_policy.prompt_skill_tool_knowledge_missing_blocks_launch_by_default, false);
  assert.deepEqual(contract.admission_policy.closeout_hard_blockers, [
    'required_role_artifacts',
    'manifest_validity',
    'owner_receipt_or_typed_blocker',
    'current_pointer',
    'content_hash',
    'generation',
    'lineage_refs',
  ]);
  assert.deepEqual(contract.conformance_output.layers, [
    'launch_blockers',
    'closeout_blockers',
    'advisory_warnings',
    'route_back_recommendations',
    'audit_drilldown_refs',
    'forbidden_authority_flags',
  ]);
  assert.equal(contract.conformance_output.default_blocking_layers_only.includes('advisory_warnings'), false);
  assert.equal(contract.forbidden_as_authority.includes('provider completion'), true);
  assert.equal(contract.forbidden_as_authority.includes('conformance passed'), true);
});

test('StageRun Kernel primitive rebuilds refs-only read model from event log', async () => {
  assert.equal(fs.existsSync(path.join(repoRoot, modulePath)), true, 'StageRun Kernel primitive module is missing');
  const module = await import(pathToFileURL(path.join(repoRoot, modulePath)).href);
  const readModel = module.rebuildStageRunReadModel([
    module.stageRunEvent({
      event_id: 'event-1',
      event_kind: 'stage_run_declared',
      stage_run_id: 'stage-run-1',
      generation: 1,
      spec_ref: 'mas://stage-spec/ai-reviewer-rebuild',
      observed_at: '2026-06-05T00:00:00.000Z',
    }),
    module.stageRunEvent({
      event_id: 'event-2',
      event_kind: 'inputs_ready',
      stage_run_id: 'stage-run-1',
      generation: 1,
      input_refs: ['mas://artifact-ref/manuscript'],
      input_fingerprint: 'sha256:input-1',
      observed_at: '2026-06-05T00:01:00.000Z',
    }),
    module.stageRunEvent({
      event_id: 'event-3',
      event_kind: 'owner_receipt_observed',
      stage_run_id: 'stage-run-1',
      generation: 1,
      owner_receipt_ref: 'mas://owner-receipt/stage-run-1',
      observed_at: '2026-06-05T00:02:00.000Z',
    }),
  ]);

  assert.equal(readModel.surface_kind, 'opl_stage_run_read_model');
  assert.equal(readModel.projection_role, 'rebuildable_refs_only_projection');
  assert.equal(readModel.stage_runs.length, 1);
  assert.equal(readModel.stage_runs[0].status, 'domain_accepted');
  assert.equal(readModel.stage_runs[0].observed_generation, 1);
  assert.deepEqual(readModel.stage_runs[0].consumed_refs, ['mas://artifact-ref/manuscript']);
  assert.deepEqual(readModel.stage_runs[0].owner_receipt_refs, ['mas://owner-receipt/stage-run-1']);
  assert.equal(readModel.stage_runs[0].artifact_body_included, false);
  assert.equal(readModel.stage_runs[0].memory_body_included, false);
  assert.equal(readModel.stage_runs[0].domain_truth_included, false);
  assert.equal(readModel.authority_boundary.opl_can_create_owner_receipt, false);
  assert.equal(readModel.authority_boundary.read_model_can_be_truth_source, false);
});

test('StageRun Kernel primitive keeps provider completion terminalizing until owner receipt or typed blocker', async () => {
  const module = await import(pathToFileURL(path.join(repoRoot, modulePath)).href);
  const readModel = module.rebuildStageRunReadModel([
    module.stageRunEvent({
      event_id: 'event-1',
      event_kind: 'stage_run_declared',
      stage_run_id: 'stage-run-provider-completed',
      generation: 1,
      spec_ref: 'mas://stage-spec/ai-reviewer-rebuild',
      observed_at: '2026-06-05T00:00:00.000Z',
    }),
    module.stageRunEvent({
      event_id: 'event-2',
      event_kind: 'provider_completed',
      stage_run_id: 'stage-run-provider-completed',
      generation: 1,
      provider_attempt_ref: 'temporal://attempt/provider-completed',
      observed_at: '2026-06-05T00:10:00.000Z',
    }),
  ]);

  assert.equal(readModel.stage_runs[0].status, 'terminalizing');
  assert.deepEqual(readModel.stage_runs[0].provider_attempt_refs, ['temporal://attempt/provider-completed']);
  assert.deepEqual(readModel.stage_runs[0].owner_receipt_refs, []);
  assert.deepEqual(readModel.stage_runs[0].typed_blocker_refs, []);
  assert.equal(readModel.authority_boundary.provider_completion_counts_as_domain_accepted, false);
});

test('StageRun Kernel primitive ignores stale generation receipts for current closeout', async () => {
  const module = await import(pathToFileURL(path.join(repoRoot, modulePath)).href);
  const readModel = module.rebuildStageRunReadModel([
    module.stageRunEvent({
      event_id: 'event-old-1',
      event_kind: 'stage_run_declared',
      stage_run_id: 'stage-run-generation',
      generation: 1,
      spec_ref: 'mas://stage-spec/old',
      observed_at: '2026-06-05T00:00:00.000Z',
    }),
    module.stageRunEvent({
      event_id: 'event-old-2',
      event_kind: 'owner_receipt_observed',
      stage_run_id: 'stage-run-generation',
      generation: 1,
      owner_receipt_ref: 'mas://owner-receipt/old',
      observed_at: '2026-06-05T00:01:00.000Z',
    }),
    module.stageRunEvent({
      event_id: 'event-new-1',
      event_kind: 'stage_run_declared',
      stage_run_id: 'stage-run-generation',
      generation: 2,
      spec_ref: 'mas://stage-spec/current',
      observed_at: '2026-06-05T00:02:00.000Z',
    }),
    module.stageRunEvent({
      event_id: 'event-new-2',
      event_kind: 'provider_completed',
      stage_run_id: 'stage-run-generation',
      generation: 2,
      provider_attempt_ref: 'temporal://attempt/current',
      observed_at: '2026-06-05T00:03:00.000Z',
    }),
  ]);

  assert.equal(readModel.stage_runs[0].observed_generation, 2);
  assert.equal(readModel.stage_runs[0].status, 'terminalizing');
  assert.equal(readModel.stage_runs[0].spec_ref, 'mas://stage-spec/current');
  assert.deepEqual(readModel.stage_runs[0].owner_receipt_refs, []);
  assert.deepEqual(readModel.stage_runs[0].provider_attempt_refs, ['temporal://attempt/current']);
});

test('StageRun launch admission treats missing strategy refs as advisory instead of hard blockers', async () => {
  const module = await import(pathToFileURL(path.join(repoRoot, modulePath)).href);
  const report = module.evaluateStageRunAdmission({
    phase: 'launch',
    stage_run_id: 'stage-run-1',
    domain_id: 'mas',
    stage_id: 'ai_reviewer_publication_eval_rebuild',
    generation: 1,
    current_pointer: {
      stage_run_id: 'stage-run-1',
      generation: 1,
      current: true,
    },
    owner: 'mas',
    scope_refs: ['mas://study/DM002'],
    selected_executor: 'codex_cli',
    authority_boundary: {
      opl_can_write_domain_truth: false,
      opl_can_create_owner_receipt: false,
      opl_can_create_typed_blocker: false,
    },
    required_role_artifacts: ['ai_reviewer_record'],
    expected_receipt_or_blocker_shape: 'owner_receipt_or_typed_blocker',
    input_refs: ['mas://artifact/manuscript'],
    replay_audit_refs: ['opl://lineage/stage-run-1'],
    missing_strategy_refs: ['prompt_refs', 'skill_refs', 'knowledge_refs'],
  });

  assert.equal(report.status, 'passed_with_advisory');
  assert.deepEqual(report.launch_blockers, []);
  assert.deepEqual(report.closeout_blockers, []);
  assert.deepEqual(report.advisory_warnings, [
    'strategy_ref_missing:prompt_refs',
    'strategy_ref_missing:skill_refs',
    'strategy_ref_missing:knowledge_refs',
  ]);
  assert.equal(report.default_blocked, false);
});

test('StageRun closeout admission rejects provider completion without owner receipt or typed blocker', async () => {
  const module = await import(pathToFileURL(path.join(repoRoot, modulePath)).href);
  const report = module.evaluateStageRunAdmission({
    phase: 'closeout',
    stage_run_id: 'stage-run-1',
    domain_id: 'mas',
    stage_id: 'ai_reviewer_publication_eval_rebuild',
    generation: 1,
    current_pointer: {
      stage_run_id: 'stage-run-1',
      generation: 1,
      current: true,
    },
    manifest_valid: true,
    required_role_artifacts: ['ai_reviewer_record'],
    produced_role_artifacts: ['ai_reviewer_record'],
    content_hashes: ['sha256:abc'],
    lineage_refs: ['opl://lineage/stage-run-1'],
    provider_completed: true,
    read_model_refreshed: true,
    owner_receipt_refs: [],
    typed_blocker_refs: [],
  });

  assert.equal(report.status, 'blocked');
  assert.deepEqual(report.launch_blockers, []);
  assert.deepEqual(report.closeout_blockers, ['owner_receipt_or_typed_blocker_missing']);
  assert.equal(report.forbidden_authority_flags.includes('provider_completed_cannot_close_stage'), true);
  assert.equal(report.forbidden_authority_flags.includes('read_model_refreshed_cannot_close_stage'), true);
  assert.equal(report.default_blocked, true);
});

test('StageRun closeout admission blocks forbidden authority signals even with owner receipt', async () => {
  const module = await import(pathToFileURL(path.join(repoRoot, modulePath)).href);
  const report = module.evaluateStageRunAdmission({
    phase: 'closeout',
    stage_run_id: 'stage-run-1',
    domain_id: 'mas',
    stage_id: 'ai_reviewer_publication_eval_rebuild',
    generation: 1,
    current_pointer: {
      stage_run_id: 'stage-run-1',
      generation: 1,
      current: true,
    },
    manifest_valid: true,
    required_role_artifacts: ['ai_reviewer_record'],
    produced_role_artifacts: ['ai_reviewer_record'],
    content_hashes: ['sha256:abc'],
    lineage_refs: ['opl://lineage/stage-run-1'],
    owner_receipt_refs: ['mas://owner-receipt/stage-run-1'],
    typed_blocker_refs: [],
    provider_completed: true,
    conformance_passed: true,
  });

  assert.equal(report.status, 'blocked');
  assert.deepEqual(report.closeout_blockers, []);
  assert.deepEqual(report.forbidden_authority_flags, [
    'provider_completed_cannot_close_stage',
    'conformance_passed_cannot_close_stage',
  ]);
  assert.equal(report.default_blocked, true);
});

test('StageRun Kernel primitive rejects events that carry forbidden bodies or domain verdict authority', async () => {
  const module = await import(pathToFileURL(path.join(repoRoot, modulePath)).href);

  assert.throws(
    () => module.stageRunEvent({
      event_id: 'event-body',
      event_kind: 'artifact_ref_observed',
      stage_run_id: 'stage-run-1',
      generation: 1,
      artifact_ref: 'mas://artifact-ref/manuscript',
      artifact_body: 'body must stay in the domain workspace',
      observed_at: '2026-06-05T00:00:00.000Z',
    }),
    /forbidden_body_payload/,
  );

  assert.throws(
    () => module.stageRunEvent({
      event_id: 'event-verdict',
      event_kind: 'owner_receipt_observed',
      stage_run_id: 'stage-run-1',
      generation: 1,
      owner_receipt_ref: 'mas://owner-receipt/stage-run-1',
      publication_verdict: 'ready',
      observed_at: '2026-06-05T00:00:00.000Z',
    }),
    /forbidden_domain_authority/,
  );
});

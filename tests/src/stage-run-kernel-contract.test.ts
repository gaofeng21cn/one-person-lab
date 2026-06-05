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

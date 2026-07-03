import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const modulePath = 'src/modules/stagecraft/stage-run-kernel.ts';

test('StageRun read model rejects wrong producer receipt as terminal authority', async () => {
  const module = await import(pathToFileURL(path.join(repoRoot, modulePath)).href);
  const currentPointer = {
    stage_run_id: 'stage-run-wrong-producer',
    generation: 1,
    current: true,
  };
  const readModel = module.rebuildStageRunReadModel([
    module.stageRunEvent({
      event_id: 'event-1',
      event_kind: 'stage_run_declared',
      stage_run_id: 'stage-run-wrong-producer',
      generation: 1,
      current_pointer: currentPointer,
      observed_at: '2026-06-05T00:00:00.000Z',
    }),
    module.stageRunEvent({
      event_id: 'event-2',
      event_kind: 'provider_completed',
      stage_run_id: 'stage-run-wrong-producer',
      generation: 1,
      current_pointer: currentPointer,
      provider_attempt_ref: 'temporal://attempt/wrong-producer',
      observed_at: '2026-06-05T00:05:00.000Z',
    }),
    module.stageRunEvent({
      event_id: 'event-3',
      event_kind: 'owner_receipt_observed',
      stage_run_id: 'stage-run-wrong-producer',
      generation: 1,
      current_pointer: currentPointer,
      owner_receipt_ref: 'opl://read-model/not-domain-owner-receipt',
      producer_role: 'read_model',
      observed_at: '2026-06-05T00:06:00.000Z',
    }),
  ]);

  assert.equal(readModel.stage_runs[0].status, 'terminalizing');
  assert.deepEqual(readModel.stage_runs[0].owner_receipt_refs, []);
  assert.deepEqual(readModel.stage_runs[0].provider_attempt_refs, ['temporal://attempt/wrong-producer']);
});

test('StageRun read model requires current StageRun identity binding for owner receipt typed blocker and human gate', async () => {
  const module = await import(pathToFileURL(path.join(repoRoot, modulePath)).href);
  const stalePointer = {
    stage_run_id: 'stage-run-identity-binding',
    generation: 1,
    current: true,
  };
  const currentPointer = {
    stage_run_id: 'stage-run-identity-binding',
    generation: 2,
    current: true,
  };
  const readModel = module.rebuildStageRunReadModel([
    module.stageRunEvent({
      event_id: 'event-1',
      event_kind: 'stage_run_declared',
      stage_run_id: 'stage-run-identity-binding',
      generation: 2,
      current_pointer: currentPointer,
      observed_at: '2026-06-05T00:00:00.000Z',
    }),
    module.stageRunEvent({
      event_id: 'event-2',
      event_kind: 'provider_completed',
      stage_run_id: 'stage-run-identity-binding',
      generation: 2,
      current_pointer: currentPointer,
      provider_attempt_ref: 'temporal://attempt/current',
      observed_at: '2026-06-05T00:05:00.000Z',
    }),
    module.stageRunEvent({
      event_id: 'event-3',
      event_kind: 'owner_receipt_observed',
      stage_run_id: 'stage-run-identity-binding',
      generation: 2,
      current_pointer: stalePointer,
      owner_receipt_ref: 'mas://owner-receipts/stale-pointer',
      producer_role: 'domain_owner',
      observed_at: '2026-06-05T00:06:00.000Z',
    }),
    module.stageRunEvent({
      event_id: 'event-4',
      event_kind: 'typed_blocker_observed',
      stage_run_id: 'stage-run-identity-binding',
      generation: 2,
      current_pointer: stalePointer,
      typed_blocker_ref: 'mas://typed-blockers/stale-pointer',
      producer_role: 'domain_owner',
      observed_at: '2026-06-05T00:07:00.000Z',
    }),
    module.stageRunEvent({
      event_id: 'event-5',
      event_kind: 'human_decision_required',
      stage_run_id: 'stage-run-identity-binding',
      generation: 2,
      current_pointer: stalePointer,
      hold_ref: 'human-gate://publication-decision/stale-pointer',
      producer_role: 'human_operator',
      observed_at: '2026-06-05T00:08:00.000Z',
    }),
  ]);

  assert.equal(readModel.stage_runs[0].status, 'terminalizing');
  assert.deepEqual(readModel.stage_runs[0].owner_receipt_refs, []);
  assert.deepEqual(readModel.stage_runs[0].typed_blocker_refs, []);
  assert.deepEqual(readModel.stage_runs[0].hold_refs, ['human-gate://publication-decision/stale-pointer']);
});

test('StageRun read model accepts domain owner and human gate only with current identity binding', async () => {
  const module = await import(pathToFileURL(path.join(repoRoot, modulePath)).href);
  const currentPointer = {
    stage_run_id: 'stage-run-current-authority',
    generation: 4,
    current: true,
  };
  const ownerReceiptReadModel = module.rebuildStageRunReadModel([
    module.stageRunEvent({
      event_id: 'event-1',
      event_kind: 'stage_run_declared',
      stage_run_id: 'stage-run-current-authority',
      generation: 4,
      current_pointer: currentPointer,
      observed_at: '2026-06-05T00:00:00.000Z',
    }),
    module.stageRunEvent({
      event_id: 'event-2',
      event_kind: 'owner_receipt_observed',
      stage_run_id: 'stage-run-current-authority',
      generation: 4,
      current_pointer: currentPointer,
      owner_receipt_ref: 'mas://owner-receipts/current',
      producer_role: 'domain_owner',
      observed_at: '2026-06-05T00:01:00.000Z',
    }),
  ]);
  const humanGateReadModel = module.rebuildStageRunReadModel([
    module.stageRunEvent({
      event_id: 'event-1',
      event_kind: 'stage_run_declared',
      stage_run_id: 'stage-run-current-human-gate',
      generation: 4,
      current_pointer: {
        ...currentPointer,
        stage_run_id: 'stage-run-current-human-gate',
      },
      observed_at: '2026-06-05T00:00:00.000Z',
    }),
    module.stageRunEvent({
      event_id: 'event-2',
      event_kind: 'human_decision_required',
      stage_run_id: 'stage-run-current-human-gate',
      generation: 4,
      current_pointer: {
        ...currentPointer,
        stage_run_id: 'stage-run-current-human-gate',
      },
      hold_ref: 'human-gate://publication-decision/current',
      producer_role: 'human_operator',
      observed_at: '2026-06-05T00:01:00.000Z',
    }),
  ]);

  assert.equal(ownerReceiptReadModel.stage_runs[0].status, 'domain_accepted');
  assert.deepEqual(ownerReceiptReadModel.stage_runs[0].owner_receipt_refs, ['mas://owner-receipts/current']);
  assert.equal(humanGateReadModel.stage_runs[0].status, 'needs_human_decision');
  assert.deepEqual(humanGateReadModel.stage_runs[0].hold_refs, ['human-gate://publication-decision/current']);
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

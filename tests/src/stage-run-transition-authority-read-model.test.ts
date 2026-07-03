import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const modulePath = 'src/modules/stagecraft/stage-run-kernel.ts';

test('StageRun read model keeps read-model and worklist signals from advancing or regressing lifecycle status', async () => {
  const module = await import(pathToFileURL(path.join(repoRoot, modulePath)).href);
  const readModel = module.rebuildStageRunReadModel([
    module.stageRunEvent({
      event_id: 'event-1',
      event_kind: 'stage_run_declared',
      stage_run_id: 'stage-run-read-model-signal',
      generation: 1,
      spec_ref: 'mas://stage-spec/current',
      observed_at: '2026-06-05T00:00:00.000Z',
    }),
    module.stageRunEvent({
      event_id: 'event-2',
      event_kind: 'provider_completed',
      stage_run_id: 'stage-run-read-model-signal',
      generation: 1,
      provider_attempt_ref: 'temporal://attempt/provider-completed',
      observed_at: '2026-06-05T00:05:00.000Z',
    }),
    module.stageRunEvent({
      event_id: 'event-3',
      event_kind: 'artifact_ref_observed',
      stage_run_id: 'stage-run-read-model-signal',
      generation: 1,
      artifact_ref: 'opl://read-model/current-owner-delta',
      producer_role: 'read_model',
      observed_at: '2026-06-05T00:06:00.000Z',
    }),
    module.stageRunEvent({
      event_id: 'event-4',
      event_kind: 'hold_projected',
      stage_run_id: 'stage-run-read-model-signal',
      generation: 1,
      hold_ref: 'opl://worklist/open-items-zero',
      producer_role: 'worklist',
      observed_at: '2026-06-05T00:07:00.000Z',
    }),
  ]);

  assert.equal(readModel.stage_runs[0].status, 'terminalizing');
  assert.deepEqual(readModel.stage_runs[0].consumed_refs, ['opl://read-model/current-owner-delta']);
  assert.deepEqual(readModel.stage_runs[0].hold_refs, ['opl://worklist/open-items-zero']);
  assert.deepEqual(readModel.stage_runs[0].owner_receipt_refs, []);
  assert.deepEqual(readModel.stage_runs[0].typed_blocker_refs, []);
  assert.equal(readModel.authority_boundary.read_model_can_be_truth_source, false);
});

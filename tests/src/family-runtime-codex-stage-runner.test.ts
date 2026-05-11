import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createFakeCodexFixture } from './cli/helpers.ts';
import { runCodexStageRunner } from '../../src/family-runtime-codex-stage-runner.ts';

test('Codex stage runner supervises a live Codex CLI process without accepting free-text completion', async () => {
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  printf '{"type":"thread.started","thread_id":"thread-live-runner"}\\n'
  printf '{"type":"turn.started"}\\n'
  printf '{"type":"item.completed","item":{"type":"agent_message","id":"msg-1","text":"analysis checkpoint only"}}\\n'
  printf '{"type":"turn.completed"}\\n'
  exit 0
fi
echo "unexpected fake codex args: $*" >&2
exit 64
`);
  const previousCodexBin = process.env.OPL_CODEX_BIN;
  try {
    process.env.OPL_CODEX_BIN = codexPath;
    const receipt = await runCodexStageRunner({
      attempt: {
        stage_attempt_id: 'sat_live_runner_test',
        stage_id: 'analysis-campaign',
        workspace_locator: {
          workspace_root: fixtureRoot,
        },
        checkpoint_refs: ['checkpoint:seed'],
      },
      stagePacketRef: 'packet:analysis',
      runnerMode: 'codex_cli',
      observedAt: '2026-05-11T00:00:00.000Z',
      timeoutMs: 10_000,
    });

    assert.equal(receipt.runner_status.runner_mode, 'codex_cli');
    assert.equal(receipt.runner_status.live_process_started, true);
    assert.equal(receipt.runner_status.dry_run_transport, false);
    assert.equal(receipt.runner_status.exit_code, 0);
    assert.equal(receipt.runner_status.typed_closeout_required_for_completion, true);
    assert.equal(receipt.runner_status.free_text_closeout_accepted, false);
    assert.equal(receipt.progress_summary.thread_id, 'thread-live-runner');
    assert.deepEqual(receipt.heartbeat_summary.checkpoint_refs, ['checkpoint:seed']);
    assert.equal(receipt.process_output_summary.exit_code, 0);
    assert.equal(receipt.process_output_summary.final_message_chars > 0, true);
  } finally {
    if (previousCodexBin === undefined) {
      delete process.env.OPL_CODEX_BIN;
    } else {
      process.env.OPL_CODEX_BIN = previousCodexBin;
    }
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

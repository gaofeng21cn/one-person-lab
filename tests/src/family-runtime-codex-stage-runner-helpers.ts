import assert from 'node:assert/strict';

import { runAgentStageRunner } from '../../src/modules/runway/family-runtime-codex-stage-runner.ts';

export async function runPublicCodexStageRunner(
  input: Parameters<typeof runAgentStageRunner>[0],
) {
  const previousSandboxProvider = process.env.OPL_CODEX_STAGE_SANDBOX_PROVIDER;
  const shouldUseHostFixture = !previousSandboxProvider && Boolean(process.env.OPL_CODEX_BIN);
  try {
    if (shouldUseHostFixture) {
      process.env.OPL_CODEX_STAGE_SANDBOX_PROVIDER = 'host';
    }
    const receipt = await runAgentStageRunner(input);
    assert.equal(receipt.runner_status.runner_kind, 'codex_cli_stage_runner');
    assert.ok('closeout_packet' in receipt, 'Codex stage runner receipt must expose closeout_packet.');
    return receipt;
  } finally {
    if (shouldUseHostFixture) {
      if (previousSandboxProvider === undefined) {
        delete process.env.OPL_CODEX_STAGE_SANDBOX_PROVIDER;
      } else {
        process.env.OPL_CODEX_STAGE_SANDBOX_PROVIDER = previousSandboxProvider;
      }
    }
  }
}

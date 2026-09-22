import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCodexExecArgs, buildCodexExecResumeArgs, defaultCodexSandboxModeConfigArg } from '../../src/adapters/execution/codex.ts';

test('the stage sandbox mode defaults to workspace-write when the host sets no override', () => {
  assert.equal(defaultCodexSandboxModeConfigArg({}), 'sandbox_mode="workspace-write"');
  assert.equal(defaultCodexSandboxModeConfigArg({ OPL_CODEX_STAGE_SANDBOX_MODE: '   ' }), 'sandbox_mode="workspace-write"');
});

test('the host can downgrade the stage sandbox mode to read-only', () => {
  assert.equal(
    defaultCodexSandboxModeConfigArg({ OPL_CODEX_STAGE_SANDBOX_MODE: 'read-only' }),
    'sandbox_mode="read-only"',
  );
});

test('the host can raise the stage sandbox mode to danger-full-access', () => {
  assert.equal(
    defaultCodexSandboxModeConfigArg({ OPL_CODEX_STAGE_SANDBOX_MODE: 'danger-full-access' }),
    'sandbox_mode="danger-full-access"',
  );
});

test('an unrecognized stage sandbox mode falls back to workspace-write instead of reaching codex verbatim', () => {
  for (const raw of ['workspace_write', 'WRITE', 'none', 'readonly']) {
    assert.equal(
      defaultCodexSandboxModeConfigArg({ OPL_CODEX_STAGE_SANDBOX_MODE: raw }),
      'sandbox_mode="workspace-write"',
      `unexpected fallback for ${raw}`,
    );
  }
});

test('both exec and exec resume carry the configured stage sandbox mode', () => {
  const execArgs = buildCodexExecArgs('prompt', {});
  const resumeArgs = buildCodexExecResumeArgs('session_1', 'prompt', {});
  assert.ok(execArgs.includes('sandbox_mode="workspace-write"'));
  assert.ok(resumeArgs.includes('sandbox_mode="workspace-write"'));
});

test('an explicit sandboxMode option is declared after the host default so it wins', () => {
  const args = buildCodexExecArgs('prompt', { sandboxMode: 'read-only' });
  const declared = args.filter((value) => value.startsWith('sandbox_mode='));
  assert.deepEqual(declared, ['sandbox_mode="workspace-write"', 'sandbox_mode="read-only"']);
});

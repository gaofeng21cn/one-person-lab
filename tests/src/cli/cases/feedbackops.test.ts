import { spawnSync } from 'node:child_process';

import { assert, fs, os, parseJsonText, path, repoRoot, runCli, runCliFailure, test } from '../helpers.ts';

function withStateDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'opl-feedbackops-cli-state-'));
}

test('feedback CLI captures, reads, and reconciles explicit delivery feedback', () => {
  const stateDir = withStateDir();
  const env = { OPL_STATE_DIR: stateDir };

  try {
    const captured = runCli([
      'feedback',
      'submit',
      '--target-agent',
      'mas',
      '--delivery-ref',
      'paper:obesity/current-package',
      '--feedback-ref',
      'user-feedback:obesity/high-quality-sci',
      '--feedback-kind',
      'quality_gap',
      '--developer-work-order-ref',
      'developer-work-order-candidate-ref:mas/obesity-feedbackops',
      '--idempotency-key',
      'feedbackops-cli-test',
      '--json',
    ], env);
    assert.equal(captured.feedbackops_submit.status, 'captured');
    assert.equal(captured.feedbackops_submit.event.target_agent_id, 'mas');
    assert.equal(captured.feedbackops_submit.event.authority_boundary.can_write_target_domain_truth, false);

    const duplicate = runCli([
      'feedback',
      'submit',
      '--target-agent',
      'mas',
      '--delivery-ref',
      'paper:obesity/current-package',
      '--feedback-ref',
      'user-feedback:obesity/high-quality-sci',
      '--idempotency-key',
      'feedbackops-cli-test',
      '--json',
    ], env);
    assert.equal(duplicate.feedbackops_submit.status, 'duplicate_idempotent_event');

    const read = runCli(['feedback', 'read', '--json'], env);
    assert.equal(read.feedbackops.intake_event_count, 1);
    assert.equal(
      read.feedbackops.summary.queued_requires_developer_mode_count
        + read.feedbackops.summary.executable_count,
      1,
    );
    assert.equal(read.feedbackops.app_projection.creates_runner_or_queue, false);

    const reconciled = runCli(['feedback', 'reconcile', '--json'], env);
    assert.equal(reconciled.feedbackops_reconcile.status, 'reconciled_refs_only');
    assert.equal(reconciled.feedbackops_reconcile.read_model.intake_event_count, 1);
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});

test('feedback submit rejects unknown options before consuming values', () => {
  const failure = runCliFailure([
    'feedback',
    'submit',
    '--target-agent',
    'mas',
    '--unknown',
    '--json',
  ]);

  assert.notEqual(failure.status, 0);
  assert.match(failure.payload.error.message, /Unknown option '--unknown'/);
});

test('bin/opl routes feedback commands into the OPL CLI instead of Codex passthrough', () => {
  const stateDir = withStateDir();
  try {
    const result = spawnSync(
      path.join(repoRoot, 'bin', 'opl'),
      ['feedback', 'read', '--json'],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          NODE_NO_WARNINGS: '1',
          OPL_SKIP_SKILL_SYNC: '1',
          OPL_STATE_DIR: stateDir,
        },
      },
    );

    assert.equal(result.status, 0, result.stderr);
    const output = parseJsonText(result.stdout) as {
      feedbackops: { surface_kind: string; intake_event_count: number };
    };
    assert.equal(output.feedbackops.surface_kind, 'opl_feedbackops_read_model');
    assert.equal(output.feedbackops.intake_event_count, 0);
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});

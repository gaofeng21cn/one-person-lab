import {
  assert,
  createFakeCodexFixture,
  fs,
  os,
  path,
  test,
} from '../helpers.ts';
import {
  runAgentStageRunner,
} from '../../../../src/modules/runway/family-runtime-codex-stage-runner.ts';

function restoreEnv(key: string, previous: string | undefined) {
  if (previous === undefined) delete process.env[key];
  else process.env[key] = previous;
}

test('Codex stage runner advances first-turn prose without same-session closeout enforcement', async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-stage-runner-workspace-'));
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-stage-runner-state-'));
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ] && [ "$2" = "resume" ]; then
  echo "same-session closeout enforcement must not run" >&2
  exit 99
fi
if [ "$1" = "exec" ]; then
  printf '{"type":"thread.started","thread_id":"thread-progress-first"}\\n'
  printf '{"type":"turn.started"}\\n'
  printf '%s\\n' '{"type":"item.completed","item":{"type":"agent_message","id":"msg-progress","text":"partial draft with a negative finding"}}'
  printf '{"type":"turn.completed"}\\n'
  exit 0
fi
exit 64
`);
  const previousBin = process.env.OPL_CODEX_BIN;
  const previousMode = process.env.OPL_CODEX_STAGE_RUNNER_MODE;
  const previousState = process.env.OPL_STATE_DIR;
  try {
    process.env.OPL_CODEX_BIN = codexPath;
    process.env.OPL_CODEX_STAGE_RUNNER_MODE = 'codex_cli';
    process.env.OPL_STATE_DIR = stateRoot;
    const receipt = await runAgentStageRunner({
      attempt: {
        stage_attempt_id: 'sat_progress_first',
        domain_id: 'medautoscience',
        stage_id: 'bounded_analysis_campaign',
        workspace_locator: { workspace_root: workspaceRoot },
        executor_kind: 'codex_cli',
        checkpoint_refs: ['packet:analysis'],
      },
      stagePacketRef: 'packet:analysis',
      runnerMode: 'codex_cli',
      env: { OPL_CODEX_STAGE_SANDBOX_PROVIDER: 'host' },
      timeoutMs: 10_000,
    });
    const codexReceipt = receipt as Extract<typeof receipt, { closeout_packet: unknown }>;
    assert.equal(codexReceipt.closeout_packet?.domain_ready_verdict, 'completed_with_quality_debt');
    assert.equal(codexReceipt.closeout_packet?.route_impact?.next_stage_may_start, true);
    assert.equal(
      codexReceipt.process_output_summary?.progress_closeout_projection?.capture_pipeline
        .same_session_closeout_enforcement_enabled,
      false,
    );
    assert.equal(
      codexReceipt.progress_summary.runner_events.some((event) => event.event_kind.startsWith('closeout_enforcement.')),
      false,
    );
  } finally {
    restoreEnv('OPL_CODEX_BIN', previousBin);
    restoreEnv('OPL_CODEX_STAGE_RUNNER_MODE', previousMode);
    restoreEnv('OPL_STATE_DIR', previousState);
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('Codex stage runner captures output-last-message without an output schema control plane', async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-stage-runner-workspace-'));
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-stage-runner-state-'));
  const captureFile = path.join(workspaceRoot, 'args.txt');
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
printf '%s\\n' "$@" > ${JSON.stringify(captureFile)}
output_last_message=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --output-last-message)
      output_last_message="$2"
      shift 2
      ;;
    --output-schema)
      echo "output schema control plane must not be used" >&2
      exit 98
      ;;
    *) shift ;;
  esac
done
printf 'readable final draft' > "$output_last_message"
printf '{"type":"thread.started","thread_id":"thread-output-capture"}\\n'
printf '{"type":"turn.completed"}\\n'
`);
  const previousBin = process.env.OPL_CODEX_BIN;
  const previousState = process.env.OPL_STATE_DIR;
  try {
    process.env.OPL_CODEX_BIN = codexPath;
    process.env.OPL_STATE_DIR = stateRoot;
    const receipt = await runAgentStageRunner({
      attempt: {
        stage_attempt_id: 'sat_output_capture',
        domain_id: 'redcube_ai',
        stage_id: 'artifact_creation',
        workspace_locator: { workspace_root: workspaceRoot },
        executor_kind: 'codex_cli',
        checkpoint_refs: ['packet:artifact'],
      },
      stagePacketRef: 'packet:artifact',
      runnerMode: 'codex_cli',
      env: { OPL_CODEX_STAGE_SANDBOX_PROVIDER: 'host' },
      timeoutMs: 10_000,
    });
    const codexReceipt = receipt as Extract<typeof receipt, { closeout_packet: unknown }>;
    assert.match(codexReceipt.closeout_packet?.closeout_refs[0] ?? '', /^file:\/\//);
    assert.equal(codexReceipt.closeout_packet?.route_impact?.next_stage_may_start, true);
    assert.equal(fs.readFileSync(captureFile, 'utf8').includes('--output-schema'), false);
    assert.equal(fs.readFileSync(captureFile, 'utf8').includes('--output-last-message'), true);
  } finally {
    restoreEnv('OPL_CODEX_BIN', previousBin);
    restoreEnv('OPL_STATE_DIR', previousState);
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

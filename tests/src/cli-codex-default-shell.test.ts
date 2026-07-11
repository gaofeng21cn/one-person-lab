import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { parseJsonText } from '../../src/kernel/json-file.ts';
import './cli-codex-default-shell-cases/raw-codex-passthrough.ts';
import {
  binPath,
  createFakeCodexFixture,
  retiredCliCommandMatrix,
  runCli,
  runEntryPathFailure,
  runEntryPathRaw,
} from './cli-codex-default-shell-helpers.ts';

test('installed opl launcher keeps default exec on raw Codex passthrough', () => {
  const capturePath = path.join(os.tmpdir(), `opl-launcher-exec-args-${process.pid}.txt`);
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
printf '%s\\n' "$@" > ${JSON.stringify(capturePath)}
echo "LAUNCHER RAW EXEC"
exit 0
`);

  try {
    const result = runEntryPathRaw(binPath, ['exec', '--cd', '/tmp/opl-exec-smoke', '--model', 'gpt-5.4', 'hello'], {
      OPL_CODEX_BIN: codexPath,
      OPL_SKIP_SKILL_SYNC: '1',
    });

    assert.equal(result.stdout, 'LAUNCHER RAW EXEC\n');
    assert.equal(result.stderr, '');
    assert.deepEqual(fs.readFileSync(capturePath, 'utf8').trim().split('\n'), [
      'exec',
      '--cd',
      '/tmp/opl-exec-smoke',
      '--model',
      'gpt-5.4',
      'hello',
    ]);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(capturePath, { force: true });
  }
});

test('explicit opl exec accepts reasoning effort and passes it to Codex config', () => {
  const capturePath = path.join(os.tmpdir(), `opl-explicit-exec-reasoning-${process.pid}.txt`);
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
printf '%s\\n' "$@" > ${JSON.stringify(capturePath)}
if [ "$1" = "exec" ]; then
  printf '{"type":"thread.started","thread_id":"thread-reasoning"}\\n'
  printf '{"item":{"type":"agent_message","text":"reasoning ok"}}\\n'
  exit 0
fi
echo "unexpected fake codex args: $*" >&2
exit 64
`);

  try {
    const payload = runCli(
      ['exec', '--executor', 'codex_cli', '--model', 'gpt-5.5', '--provider', 'openai', '--reasoning-effort', 'high', 'hello'],
      {
        OPL_CODEX_BIN: codexPath,
      },
    );

    assert.equal(payload.agent_execution_receipt.executor_kind, 'codex_cli');
    assert.deepEqual(fs.readFileSync(capturePath, 'utf8').trim().split('\n'), [
      'exec',
      '--skip-git-repo-check',
      '--full-auto',
      '--json',
      '--model',
      'gpt-5.5',
      '--config',
      'model_provider="openai"',
      '--config',
      'model_reasoning_effort="high"',
      'hello',
    ]);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(capturePath, { force: true });
  }
});

test('installed opl launcher supports explicit non-default executor selection', () => {
  const fakeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-launcher-claude-'));
  const claudePath = path.join(fakeRoot, 'claude');
  fs.writeFileSync(
    claudePath,
    '#!/bin/sh\nprintf \'{"surface_kind":"stage_attempt_closeout_packet","closeout_refs":["receipt:launcher-claude"]}\\n\'\n',
    { mode: 0o755 },
  );

  try {
    const result = runEntryPathRaw(binPath, ['exec', '--executor', 'claude_code', 'hello'], {
      OPL_CLAUDE_CODE_BIN: claudePath,
      OPL_SKIP_SKILL_SYNC: '1',
    });

    const payload = parseJsonText(result.stdout) as Record<string, any>;
    assert.equal(payload.agent_execution_receipt.executor_kind, 'claude_code');
    assert.equal(payload.agent_execution_receipt.closeout_packet.closeout_refs[0], 'receipt:launcher-claude');
    assert.equal(payload.agent_execution_receipt.proof.fallback_allowed, false);
  } finally {
    fs.rmSync(fakeRoot, { recursive: true, force: true });
  }
});

test('installed opl launcher routes executor diagnostics to OPL instead of Codex passthrough', () => {
  const capturePath = path.join(os.tmpdir(), `opl-launcher-executor-capture-${process.pid}.txt`);
  const fakeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-launcher-executor-doctor-'));
  const claudePath = path.join(fakeRoot, 'claude');
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
printf '%s\\n' "$@" > ${JSON.stringify(capturePath)}
echo "SHOULD NOT RUN CODEX"
exit 0
`);
  fs.writeFileSync(claudePath, '#!/bin/sh\nexit 0\n', { mode: 0o755 });

  try {
    const result = runEntryPathRaw(binPath, ['executor', 'doctor', '--executor', 'claude_code'], {
      OPL_CLAUDE_CODE_BIN: claudePath,
      OPL_CODEX_BIN: codexPath,
      OPL_SKIP_SKILL_SYNC: '1',
    });

    const payload = parseJsonText(result.stdout) as Record<string, any>;
    assert.equal(payload.executor_doctor.executor_kind, 'claude_code');
    assert.equal(payload.executor_doctor.ready, true);
    assert.equal(result.stderr, '');
    assert.equal(fs.existsSync(capturePath), false);
  } finally {
    fs.rmSync(fakeRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(capturePath, { force: true });
  }
});

test('installed opl launcher keeps resume on raw Codex passthrough', () => {
  const capturePath = path.join(os.tmpdir(), `opl-launcher-resume-args-${process.pid}.txt`);
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
printf '%s\\n' "$@" > ${JSON.stringify(capturePath)}
echo "LAUNCHER RAW RESUME"
exit 0
`);

  try {
    const result = runEntryPathRaw(binPath, ['resume', '--last', 'continue'], {
      OPL_CODEX_BIN: codexPath,
      OPL_SKIP_SKILL_SYNC: '1',
    });

    assert.equal(result.stdout, 'LAUNCHER RAW RESUME\n');
    assert.equal(result.stderr, '');
    assert.deepEqual(fs.readFileSync(capturePath, 'utf8').trim().split('\n'), [
      'resume',
      '--last',
      'continue',
    ]);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(capturePath, { force: true });
  }
});

test('installed opl launcher routes root help flags to OPL instead of Codex passthrough', () => {
  const capturePath = path.join(os.tmpdir(), `opl-launcher-root-help-capture-${process.pid}.txt`);
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
printf '%s\n' "$@" > ${JSON.stringify(capturePath)}
echo "SHOULD NOT RUN CODEX"
exit 0
`);

  try {
    for (const helpFlag of ['--help', '-h']) {
      fs.rmSync(capturePath, { force: true });
      const result = runEntryPathRaw(binPath, [helpFlag], {
        OPL_CODEX_BIN: codexPath,
        OPL_SKIP_SKILL_SYNC: '1',
      });

      assert.match(result.stdout, /One Person Lab \(OPL\)/);
      assert.match(result.stdout, /Diagnostic\/internal namespaces:/);
      assert.match(result.stdout, /runtime/);
      assert.doesNotMatch(result.stdout, /SHOULD NOT RUN CODEX/);
      assert.equal(result.stderr, '');
      assert.equal(fs.existsSync(capturePath), false);
    }
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(capturePath, { force: true });
  }
});

test('installed opl launcher keeps exec help on raw Codex passthrough', () => {
  const capturePath = path.join(os.tmpdir(), `opl-launcher-exec-help-capture-${process.pid}.txt`);
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
printf '%s\n' "$@" > ${JSON.stringify(capturePath)}
echo "CODEX EXEC HELP"
exit 0
`);

  try {
    const result = runEntryPathRaw(binPath, ['exec', '--help'], {
      OPL_CODEX_BIN: codexPath,
      OPL_SKIP_SKILL_SYNC: '1',
    });

    assert.equal(result.stdout, 'CODEX EXEC HELP\n');
    assert.equal(result.stderr, '');
    assert.deepEqual(fs.readFileSync(capturePath, 'utf8').trim().split('\n'), [
      'exec',
      '--help',
    ]);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(capturePath, { force: true });
  }
});

test('installed opl launcher routes install to OPL instead of Codex passthrough', () => {
  const capturePath = path.join(os.tmpdir(), `opl-launcher-install-capture-${process.pid}.txt`);
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
printf '%s\\n' "$@" > ${JSON.stringify(capturePath)}
echo "SHOULD NOT RUN CODEX"
exit 0
`);

  try {
    const result = runEntryPathRaw(binPath, ['install', '--help'], {
      OPL_CODEX_BIN: codexPath,
      OPL_SKIP_SKILL_SYNC: '1',
    });

    const payload = parseJsonText(result.stdout) as Record<string, any>;
    assert.equal(payload.help.command, 'install');
    assert.match(payload.help.usage, /--skip-gui-open/);
    assert.match(payload.help.usage, /--headless/);
    assert.equal(result.stderr, '');
    assert.equal(fs.existsSync(capturePath), false);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(capturePath, { force: true });
  }
});

test('installed opl launcher routes workspace scoped help to OPL instead of Codex passthrough', () => {
  const capturePath = path.join(os.tmpdir(), `opl-launcher-workspace-help-capture-${process.pid}.txt`);
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
printf '%s\\n' "$@" > ${JSON.stringify(capturePath)}
echo "SHOULD NOT RUN CODEX"
exit 0
`);

  try {
    const result = runEntryPathRaw(binPath, ['workspace', '--help'], {
      OPL_CODEX_BIN: codexPath,
      OPL_SKIP_SKILL_SYNC: '1',
    });

    const payload = parseJsonText(result.stdout) as Record<string, any>;
    assert.equal(payload.help.command, 'workspace');
    assert.match(payload.help.usage, /workspace .*ensure/);
    assert.equal(
      payload.help.subcommands.some((entry: { command: string }) => entry.command === 'workspace inspect'),
      true,
    );
    assert.equal(result.stderr, '');
    assert.equal(fs.existsSync(capturePath), false);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(capturePath, { force: true });
  }
});

test('installed opl launcher routes actions discovery to OPL instead of Codex passthrough', () => {
  const capturePath = path.join(os.tmpdir(), `opl-launcher-actions-capture-${process.pid}.txt`);
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-launcher-actions-state-'));
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
printf '%s\\n' "$@" > ${JSON.stringify(capturePath)}
echo "SHOULD NOT RUN CODEX"
exit 0
`);

  try {
    const result = runEntryPathRaw(binPath, ['actions', 'list'], {
      OPL_CODEX_BIN: codexPath,
      OPL_SKIP_SKILL_SYNC: '1',
      OPL_STATE_DIR: stateDir,
    });

    const payload = parseJsonText(result.stdout) as Record<string, any>;
    assert.equal(payload.family_actions.surface_kind, 'opl_family_action_catalog_index');
    assert.equal(result.stderr, '');
    assert.equal(fs.existsSync(capturePath), false);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(capturePath, { force: true });
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});

test('installed opl launcher routes App state to OPL instead of Codex passthrough', () => {
  const capturePath = path.join(os.tmpdir(), `opl-launcher-app-state-capture-${process.pid}.txt`);
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-launcher-app-state-'));
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [[ "$1" == "--version" ]]; then
  echo "codex-cli 0.125.0"
  exit 0
fi
printf '%s\\n' "$@" > ${JSON.stringify(capturePath)}
echo "SHOULD NOT RUN CODEX"
exit 0
`);

  try {
    const result = runEntryPathRaw(binPath, ['app', 'state', '--profile', 'fast'], {
      OPL_CODEX_BIN: codexPath,
      OPL_SKIP_SKILL_SYNC: '1',
      OPL_STATE_DIR: stateDir,
      OPL_CODEX_CLI_LATEST_VERSION: '0.125.0',
      OPL_DEVELOPER_MODE_GH_BINARY: path.join(stateDir, 'missing-gh'),
    });

    const payload = parseJsonText(result.stdout) as Record<string, any>;
    assert.equal(payload.app_state.schema_version, 'opl_app_state.v1');
    assert.equal(payload.app_state.core.executor.default_executor_id, 'codex_cli');
    assert.equal(result.stderr, '');
    assert.equal(fs.existsSync(capturePath), false);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(capturePath, { force: true });
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});

test('installed opl launcher routes managed update status to OPL instead of Codex passthrough', () => {
  const capturePath = path.join(os.tmpdir(), `opl-launcher-update-capture-${process.pid}.txt`);
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
printf '%s\\n' "$@" > ${JSON.stringify(capturePath)}
if [ "$1" = "--version" ]; then
  echo "codex-cli 0.137.0"
  exit 0
fi
if [ "$1" = "update" ]; then
  echo "SHOULD NOT RUN CODEX UPDATE" >&2
  exit 64
fi
echo "unexpected fake-codex args: $*" >&2
exit 65
`);

  try {
    const result = runEntryPathRaw(binPath, ['update', 'status', '--json'], {
      OPL_CODEX_BIN: codexPath,
      OPL_SKIP_SKILL_SYNC: '1',
    });

    const payload = parseJsonText(result.stdout) as Record<string, any>;
    assert.equal(payload.managed_update.surface_id, 'opl_managed_updater_kernel');
    assert.deepEqual(
      payload.managed_update.components.map((component: { component_id: string }) => component.component_id),
      ['installation_carrier', 'runtime_substrate', 'capability_packages', 'codex_surface', 'companion_tools', 'workflow_profile'],
    );
    assert.equal(result.stderr, '');
    assert.equal(fs.readFileSync(capturePath, 'utf8').trim(), '--version');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(capturePath, { force: true });
  }
});

test('installed opl launcher routes family discovery commands to OPL instead of Codex passthrough', () => {
  const commandMatrix = [
    {
      args: ['agents', 'foundry', 'status'],
      assertPayload: (payload: Record<string, unknown>) => {
        assert.equal(
          (payload.foundry_agent_cli_spine as { canonical_command_surface: string }).canonical_command_surface,
          'opl agents foundry',
        );
      },
    },
    {
      args: ['agents', 'list'],
      assertPayload: (payload: Record<string, unknown>) => {
        assert.equal(
          (payload.family_agents as { surface_kind: string }).surface_kind,
          'opl_standard_domain_agent_skeleton_index',
        );
      },
    },
    {
      args: ['domain-memory', 'list'],
      assertPayload: (payload: Record<string, unknown>) => {
        assert.equal(
          (payload.family_domain_memory as { surface_kind: string }).surface_kind,
          'opl_family_domain_memory_index',
        );
      },
    },
    {
      args: ['stages', 'list'],
      assertPayload: (payload: Record<string, unknown>) => {
        assert.equal(
          (payload.family_stages as { surface_kind: string }).surface_kind,
          'opl_family_stage_control_plane_index',
        );
      },
    },
    {
      args: ['stage-artifact', 'status', '--domain', 'redcube_ai', '--program', 'p1', '--topic', 't1', '--deliverable', 'd1'],
      assertPayload: (payload: Record<string, unknown>) => {
        assert.equal(
          (payload.stage_artifact_runtime as { surface_kind: string }).surface_kind,
          'opl_stage_artifact_runtime_status',
        );
      },
    },
  ];
  const capturePath = path.join(os.tmpdir(), `opl-launcher-family-discovery-capture-${process.pid}.txt`);
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-launcher-family-discovery-state-'));
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
printf '%s\\n' "$@" > ${JSON.stringify(capturePath)}
echo "SHOULD NOT RUN CODEX"
exit 0
`);

  try {
    for (const command of commandMatrix) {
      fs.rmSync(capturePath, { force: true });
      const result = runEntryPathRaw(binPath, command.args, {
        OPL_CODEX_BIN: codexPath,
        OPL_SKIP_SKILL_SYNC: '1',
        OPL_STATE_DIR: stateDir,
      });

      command.assertPayload(parseJsonText(result.stdout) as Record<string, unknown>);
      assert.equal(result.stderr, '');
      assert.equal(fs.existsSync(capturePath), false);
    }
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(capturePath, { force: true });
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});

test('installed opl launcher routes removed commands into CLI failures without Codex passthrough', () => {
  const capturePath = path.join(os.tmpdir(), `opl-launcher-retired-capture-${process.pid}.txt`);
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
printf '%s\\n' "$@" > ${JSON.stringify(capturePath)}
echo "SHOULD NOT RUN"
exit 0
`);

  try {
    for (const retired of retiredCliCommandMatrix) {
      const failure = runEntryPathFailure(binPath, retired.args, {
        OPL_CODEX_BIN: codexPath,
      });
      assert.equal(failure.status, 2);
      assert.equal(failure.payload.error.code, retired.errorCode);
      if (retired.errorCode === 'cli_usage_error') {
        assert.match(failure.payload.error.message, new RegExp(`Command "${retired.command}" has been retired`));
      }
      assert.equal(fs.existsSync(capturePath), false);
    }
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(capturePath, { force: true });
  }
});

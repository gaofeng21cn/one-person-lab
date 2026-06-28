import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { resolveFamilyWorkspaceRootFromRepoRoot } from '../../src/opl-skills.ts';
import './cli-codex-default-shell-cases/raw-codex-passthrough.ts';
import {
  binPath,
  createFakeCodexFixture,
  createFakeFamilySkillWorkspace,
  retiredCliCommandMatrix,
  runCli,
  runCliFailure,
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

    const payload = JSON.parse(result.stdout);
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

    const payload = JSON.parse(result.stdout);
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

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.help.command, 'install');
    assert.match(payload.help.usage, /--skip-gui-open/);
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

    const payload = JSON.parse(result.stdout);
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

    const payload = JSON.parse(result.stdout);
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

    const payload = JSON.parse(result.stdout);
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

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.managed_update.surface_id, 'opl_managed_updater_kernel');
    assert.deepEqual(
      payload.managed_update.components.map((component: { component_id: string }) => component.component_id),
      ['app_binary', 'runtime_toolchain', 'agent_package_channel', 'capability_exposure'],
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

      command.assertPayload(JSON.parse(result.stdout));
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

test('opl connect skills discovers the family plugin packs through the configured sibling workspace root', () => {
  const captureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-skill-list-'));
  const { workspaceRoot, syncLogPath } = createFakeFamilySkillWorkspace(captureDir);
  const stateDir = path.join(captureDir, 'opl-state');

  try {
    const output = runCli(['connect', 'skills'], {
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
      OPL_STATE_DIR: stateDir,
    });

    assert.equal(output.skill_catalog.summary.total, 6);
    assert.equal(
      output.skill_catalog.summary.ready_to_sync,
      output.skill_catalog.packs.filter((entry: { ready_to_sync: boolean }) => entry.ready_to_sync).length,
    );
    assert.deepEqual(
      output.skill_catalog.packs.map((entry: { domain_id: string }) => entry.domain_id),
      ['medautoscience', 'medautogrant', 'redcube', 'oplmetaagent', 'oplbookforge', 'scholarskills'],
    );
    assert.deepEqual(
      output.skill_catalog.packs.map((entry: { canonical_plugin_name: string }) => entry.canonical_plugin_name),
      ['mas', 'mag', 'rca', 'opl-meta-agent', 'opl-bookforge', 'opl-scholarskills'],
    );
    assert.match(output.skill_catalog.packs[0].plugin_manifest_path, /plugins\/mas\/\.codex-plugin\/plugin\.json$/);
    assert.match(output.skill_catalog.packs[0].skill_entry_path, /plugins\/mas\/skills\/mas\/SKILL\.md$/);
    assert.deepEqual(
      output.skill_catalog.packs.slice(0, 5).map((entry: { skill_entry_valid: boolean }) => entry.skill_entry_valid),
      [true, true, true, false, false],
    );
    const metaPack = output.skill_catalog.packs.find((entry: { domain_id: string }) => entry.domain_id === 'oplmetaagent');
    assert.equal(metaPack?.plugin_manifest_found, false);
    assert.equal(metaPack?.installer_found, false);
    assert.equal(metaPack?.agent_series_membership, 'standard_domain_agent');
    assert.equal(metaPack?.agent_projection_policy.plugin_transport_is_membership_axis, false);
    assert.equal(metaPack?.generated_skill_surface_ready, true);
    assert.equal(metaPack?.source_kind, 'opl_generated_plugin_surface');
    assert.equal(metaPack?.source_kind_role, 'transport_install_detail_not_agent_membership_or_status');
    assert.equal(metaPack?.plugin_transport.source_kind, 'opl_generated_plugin_surface');
    assert.equal(metaPack?.plugin_transport.source_kind_role, 'transport_install_detail_not_agent_membership_or_status');
    assert.equal(metaPack?.ready_to_sync, true);
    assert.deepEqual(metaPack?.command_preview, ['opl', 'connect', 'sync-skills', '--domain', 'oplmetaagent']);
    assert.deepEqual(metaPack?.plugin_transport.generation_preview_command?.slice(0, 3), ['opl', 'agents', 'interfaces']);
    assert.equal(metaPack?.foundry_agent_series?.canonical_command_surface, 'opl agents foundry');
    assert.equal(metaPack?.foundry_agent_series?.default_foundry_command_surface, 'opl foundry agents inspect oma');
    assert.equal(metaPack?.command_surface_spine?.skill_sync_command_surface, 'opl connect sync-skills');
    assert.equal(metaPack?.mcp_projection?.mcp_descriptor_must_delegate_to_series_spine, true);
    assert.equal(metaPack?.legacy_implementation_bucket_policy?.ordinary_public_command_surface_allowed, false);
    const bookforgePack = output.skill_catalog.packs.find((entry: { domain_id: string }) => entry.domain_id === 'oplbookforge');
    assert.equal(bookforgePack?.plugin_manifest_found, false);
    assert.equal(bookforgePack?.installer_found, false);
    assert.equal(bookforgePack?.agent_series_membership, 'standard_domain_agent');
    assert.equal(bookforgePack?.agent_projection_policy.plugin_transport_is_membership_axis, false);
    assert.equal(bookforgePack?.generated_skill_surface_ready, true);
    assert.equal(bookforgePack?.source_kind, 'opl_generated_plugin_surface');
    assert.equal(bookforgePack?.source_kind_role, 'transport_install_detail_not_agent_membership_or_status');
    assert.equal(bookforgePack?.plugin_transport.source_kind, 'opl_generated_plugin_surface');
    assert.equal(bookforgePack?.plugin_transport.source_kind_role, 'transport_install_detail_not_agent_membership_or_status');
    assert.equal(bookforgePack?.ready_to_sync, true);
    assert.deepEqual(bookforgePack?.command_preview, ['opl', 'connect', 'sync-skills', '--domain', 'oplbookforge']);
    assert.deepEqual(bookforgePack?.plugin_transport.generation_preview_command?.slice(0, 3), ['opl', 'agents', 'interfaces']);
    assert.equal(bookforgePack?.foundry_agent_series?.canonical_command_surface, 'opl agents foundry');
    assert.equal(bookforgePack?.foundry_agent_series?.default_foundry_command_surface, 'opl foundry agents inspect opl-bookforge');
    assert.equal('compatibility_foundry_command_surface' in bookforgePack.foundry_agent_series, false);
    assert.equal('domain_native_foundry_command_surface' in bookforgePack.foundry_agent_series, false);
    assert.equal('direct_domain_cli' in bookforgePack.foundry_agent_series, false);
    assert.equal(bookforgePack?.command_surface_spine?.work_alias, 'book');
    const scholarSkillsPack = output.skill_catalog.packs.find((entry: { domain_id: string }) => entry.domain_id === 'scholarskills');
    assert.equal(scholarSkillsPack?.distribution_role, 'framework_capability_plugin_pack');
    assert.equal(
      scholarSkillsPack?.capability_plugin_distribution?.default_sync_scope,
      'none_without_explicit_workspace_or_quest_target',
    );
    assert.equal(
      scholarSkillsPack?.ready_to_sync,
      scholarSkillsPack?.plugin_manifest_found && scholarSkillsPack?.skill_entry_valid,
    );
    assert.deepEqual(scholarSkillsPack?.command_preview, [
      'opl',
      'connect',
      'sync-skills',
      '--domain',
      'scholarskills',
      '--scope',
      'workspace',
      '--target-workspace',
      '<workspace-root>',
    ]);
    const previewOutput = runCli(metaPack.plugin_transport.generation_preview_command.slice(1), {
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
      OPL_STATE_DIR: stateDir,
    });
    assert.equal(previewOutput.generated_agent_interfaces.status, 'ready');
    assert.match(
      JSON.stringify(previewOutput.generated_agent_interfaces),
      /npm run build-agent-baseline -- --output-dir <output_dir> --opl-bin <opl_bin> --ai-reviewer-evaluation <ai_reviewer_evaluation> --domain-id <domain_id> --domain-label <domain_label> --delivery-domain <delivery_domain> --target-brief <target_brief>/,
    );
    assert.doesNotMatch(JSON.stringify(previewOutput.generated_agent_interfaces), /bootstrap:sample/);
    assert.equal(fs.existsSync(syncLogPath), false);
  } finally {
    fs.rmSync(captureDir, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('nested worktree repo roots resolve the family workspace root without OPL_FAMILY_WORKSPACE_ROOT', () => {
  assert.equal(
    resolveFamilyWorkspaceRootFromRepoRoot('/tmp/workspace/one-person-lab/.worktrees/codex-opl-turnkey'),
    '/tmp/workspace',
  );
  assert.equal(
    resolveFamilyWorkspaceRootFromRepoRoot('/tmp/workspace/.worktrees/codex-family-agent-os-target'),
    '/tmp/workspace',
  );
  assert.equal(
    resolveFamilyWorkspaceRootFromRepoRoot('/tmp/workspace/one-person-lab'),
    '/tmp/workspace',
  );
});

test('opl connect skills discovers OPL-managed module installs without OPL_FAMILY_WORKSPACE_ROOT', () => {
  const captureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-skill-list-managed-'));
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-skill-home-'));
  const stateDir = path.join(homeRoot, 'opl-state');
  const managedModulesRoot = path.join(stateDir, 'modules');
  const { workspaceRoot } = createFakeFamilySkillWorkspace(captureDir);
  const missingRepoRoot = path.join(homeRoot, 'missing-repo-root');

  try {
    fs.mkdirSync(managedModulesRoot, { recursive: true });
    fs.renameSync(
      path.join(workspaceRoot, 'med-autoscience'),
      path.join(managedModulesRoot, 'med-autoscience'),
    );

    const output = runCli(['connect', 'skills'], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
      OPL_MEDAUTOGRANT_REPO_ROOT: path.join(missingRepoRoot, 'med-autogrant'),
      OPL_REDCUBE_REPO_ROOT: path.join(missingRepoRoot, 'redcube-ai'),
      OPL_OPLMETAAGENT_REPO_ROOT: path.join(missingRepoRoot, 'opl-meta-agent'),
      OPL_OPLBOOKFORGE_REPO_ROOT: path.join(missingRepoRoot, 'opl-bookforge'),
      OPL_SCHOLARSKILLS_REPO_ROOT: path.join(workspaceRoot, 'opl-scholarskills'),
    });

    const medAutoScience = output.skill_catalog.packs.find(
      (entry: { domain_id: string }) => entry.domain_id === 'medautoscience',
    );
    assert.ok(medAutoScience);
    assert.equal(output.skill_catalog.summary.repo_found, 2);
    assert.equal(output.skill_catalog.summary.ready_to_sync, 2);
    assert.equal(medAutoScience.repo_found, true);
    assert.equal(medAutoScience.ready_to_sync, true);
    assert.equal(
      medAutoScience.repo_root,
      path.join(managedModulesRoot, 'med-autoscience'),
    );
    const scholarSkills = output.skill_catalog.packs.find(
      (entry: { domain_id: string }) => entry.domain_id === 'scholarskills',
    );
    assert.ok(scholarSkills);
    assert.equal(scholarSkills.repo_found, true);
    assert.equal(scholarSkills.ready_to_sync, true);
    assert.equal(
      scholarSkills.repo_root,
      path.join(workspaceRoot, 'opl-scholarskills'),
    );
    assert.equal(
      scholarSkills.capability_plugin_distribution.default_sync_scope,
      'none_without_explicit_workspace_or_quest_target',
    );
  } finally {
    fs.rmSync(captureDir, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('opl connect skills prefers managed roots over Full runtime module path overrides', () => {
  const captureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-skill-list-full-runtime-'));
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-skill-full-home-'));
  const stateDir = path.join(homeRoot, 'opl-state');
  const managedModulesRoot = path.join(stateDir, 'modules');
  const { workspaceRoot } = createFakeFamilySkillWorkspace(captureDir);

  try {
    fs.mkdirSync(managedModulesRoot, { recursive: true });
    fs.renameSync(
      path.join(workspaceRoot, 'redcube-ai'),
      path.join(managedModulesRoot, 'redcube-ai'),
    );
    const packagedRcaRoot = path.join(homeRoot, 'runtime', 'current', 'modules', 'rca');
    fs.mkdirSync(packagedRcaRoot, { recursive: true });

    const output = runCli(['connect', 'skills', '--domain', 'rca'], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
      OPL_MODULE_PATH_REDCUBE: packagedRcaRoot,
    });

    assert.equal(output.skill_catalog.summary.repo_found, 1);
    assert.equal(output.skill_catalog.summary.ready_to_sync, 1);
    assert.equal(output.skill_catalog.packs[0].domain_id, 'redcube');
    assert.equal(output.skill_catalog.packs[0].repo_root, path.join(managedModulesRoot, 'redcube-ai'));
    assert.deepEqual(output.skill_catalog.packs[0].command_preview, ['opl', 'connect', 'sync-skills', '--domain', 'redcube']);
    assert.equal(output.skill_catalog.packs[0].foundry_agent_series.canonical_command_surface, 'opl agents foundry');
  } finally {
    fs.rmSync(captureDir, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('opl connect sync-skills refuses to mirror legacy test skill stubs', () => {
  const captureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-skill-sync-invalid-'));
  const { workspaceRoot, syncLogPath } = createFakeFamilySkillWorkspace(captureDir);
  const homeDir = path.join(captureDir, 'home');
  fs.mkdirSync(homeDir, { recursive: true });
  const stubPath = path.join(
    workspaceRoot,
    'med-autoscience',
    'plugins',
    'mas',
    'skills',
    'mas',
    'SKILL.md',
  );
  fs.writeFileSync(stubPath, '---\nname: mas\ndescription: mas test skill\n---\n\n# mas\n');

  try {
    const output = runCli(['connect', 'sync-skills', '--domain', 'medautoscience'], {
      HOME: homeDir,
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
    });

    const pack = output.skill_sync.packs[0];
    assert.equal(output.skill_sync.summary.synced, 0);
    assert.equal(output.skill_sync.summary.skipped, 1);
    assert.equal(pack.ready_to_sync, false);
    assert.equal(pack.skill_entry_valid, false);
    assert.deepEqual(pack.skill_entry_errors, [
      'legacy_test_skill_description',
      'legacy_test_skill_body',
    ]);
    assert.equal(fs.existsSync(path.join(homeDir, '.codex', 'skills', 'mas')), false);
    assert.equal(fs.existsSync(syncLogPath), false);
  } finally {
    fs.rmSync(captureDir, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('opl connect sync-skills registers tracked family plugin sources without writing domain repo marketplaces', () => {
  const captureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-skill-sync-'));
  const { workspaceRoot, syncLogPath } = createFakeFamilySkillWorkspace(captureDir);
  const homeDir = path.join(captureDir, 'home');
  const codexHome = path.join(homeDir, '.codex');
  fs.mkdirSync(codexHome, { recursive: true });
  fs.writeFileSync(
    path.join(codexHome, 'config.toml'),
    [
      '[mcp_servers]',
      '',
      '[mcp_servers.sentrux]',
      'command = "/opt/homebrew/bin/sentrux"',
      'args = ["mcp"]',
      '',
      '[mcp_servers.redcube-ai]',
      'command = "node"',
      'args = ["/Users/test/redcube-ai/apps/redcube-mcp/dist/server.js"]',
      '',
    ].join('\n'),
    'utf8',
  );

  try {
    const output = runCli(['connect', 'sync-skills'], {
      HOME: homeDir,
      CODEX_HOME: codexHome,
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
    });

    assert.equal(output.skill_sync.summary.synced, 5);
    assert.equal(output.skill_sync.summary.skipped, 1);
    assert.equal(fs.existsSync(syncLogPath), false);
    for (const [project, plugin] of [
      ['med-autoscience', 'mas'],
      ['med-autogrant', 'mag'],
      ['redcube-ai', 'rca'],
    ] as const) {
      assert.equal(fs.existsSync(path.join(workspaceRoot, project, '.agents', 'plugins', 'marketplace.json')), false);
      const pack = output.skill_sync.packs.find((entry: { project: string }) => entry.project === project);
      assert.equal(pack.installer_result.source, 'tracked_codex_plugin_source');
      assert.equal(
        fs.realpathSync(pack.installer_result.plugin_source_path),
        fs.realpathSync(path.join(workspaceRoot, project, 'plugins', plugin)),
      );
      assert.equal(pack.installer_result.repo_local_marketplace_written, false);
    }
    const metaGeneratedPack = output.skill_sync.packs.find((entry: { domain_id: string }) => entry.domain_id === 'oplmetaagent');
    const bookforgeGeneratedPack = output.skill_sync.packs.find((entry: { domain_id: string }) => entry.domain_id === 'oplbookforge');
    const scholarSkillsPack = output.skill_sync.packs.find((entry: { domain_id: string }) => entry.domain_id === 'scholarskills');
    assert.ok(metaGeneratedPack);
    assert.ok(bookforgeGeneratedPack);
    assert.ok(scholarSkillsPack);
    assert.equal(scholarSkillsPack.sync_status, 'skipped');
    assert.equal(scholarSkillsPack.sync_scope, 'workspace');
    assert.equal(scholarSkillsPack.target_project, null);
    assert.equal(scholarSkillsPack.target_root, null);
    assert.equal(scholarSkillsPack.registry_repo_root, null);
    assert.equal(scholarSkillsPack.installer_result, null);
    assert.equal(
      fs.existsSync(path.join(workspaceRoot, 'med-autoscience', 'plugins', 'opl-scholarskills', 'skills', 'opl-scholarskills', 'SKILL.md')),
      false,
    );
    assert.equal(metaGeneratedPack.installer_result.generated_surface, 'opl_generated_codex_plugin_descriptor');
    assert.match(
      metaGeneratedPack.installer_result.generated_codex_plugin.plugin_root,
      /generated-codex-plugins\/opl-meta-agent-local\/plugins\/opl-meta-agent$/,
    );
    assert.equal(
      fs.existsSync(metaGeneratedPack.installer_result.generated_codex_plugin.plugin_manifest_path),
      true,
    );
    assert.equal(
      fs.existsSync(metaGeneratedPack.installer_result.generated_codex_plugin.marketplace_path),
      true,
    );
    assert.equal(
      fs.existsSync(metaGeneratedPack.installer_result.generated_codex_plugin.codex_plugin_cache_path),
      true,
    );
    const generatedPluginRoot = metaGeneratedPack.installer_result.generated_codex_plugin.plugin_root;
    const generatedPluginManifest = JSON.parse(fs.readFileSync(
      metaGeneratedPack.installer_result.generated_codex_plugin.plugin_manifest_path,
      'utf8',
    ));
    assert.equal(generatedPluginManifest.interface.composerIcon, './assets/icon.svg');
    assert.equal(generatedPluginManifest.interface.logo, './assets/icon.svg');
    const generatedPluginIcon = fs.readFileSync(path.join(generatedPluginRoot, 'assets', 'icon.svg'), 'utf8');
    assert.match(generatedPluginIcon, /aria-label="OPL Meta Agent icon"/);
    assert.match(generatedPluginIcon, /M11 44V20L21 34L31 20V44/);
    assert.match(generatedPluginIcon, /M36 44L46 20L56 44/);
    const generatedOmaSkill = fs.readFileSync(metaGeneratedPack.installer_result.generated_codex_plugin.skill_entry_path, 'utf8');
    assert.match(generatedOmaSkill, /## New Agent Delivery Gate/);
    assert.match(generatedOmaSkill, /Scaffold\/interface readiness alone is not an acceptable completion claim/);
    assert.equal(bookforgeGeneratedPack.installer_result.generated_surface, 'opl_generated_codex_plugin_descriptor');
    assert.match(
      bookforgeGeneratedPack.installer_result.generated_codex_plugin.plugin_root,
      /generated-codex-plugins\/opl-bookforge-local\/plugins\/opl-bookforge$/,
    );
    const generatedBookForgeManifest = JSON.parse(fs.readFileSync(
      bookforgeGeneratedPack.installer_result.generated_codex_plugin.plugin_manifest_path,
      'utf8',
    ));
    assert.equal(generatedBookForgeManifest.name, 'opl-bookforge');
    assert.equal(generatedBookForgeManifest.interface.displayName, 'OPL Book Forge');
    assert.equal(generatedBookForgeManifest.repository, 'https://github.com/gaofeng21cn/opl-bookforge');
    const generatedBookForgeSkill = fs.readFileSync(bookforgeGeneratedPack.installer_result.generated_codex_plugin.skill_entry_path, 'utf8');
    assert.match(generatedBookForgeSkill, /# OPL Book Forge/);
    assert.match(generatedBookForgeSkill, /shape-storyline/);
    assert.match(generatedBookForgeSkill, /materialize-book/);
    assert.match(generatedBookForgeSkill, /reference-draft absorption/);
    assert.match(generatedBookForgeSkill, /stronger reference draft/);
    assert.match(generatedBookForgeSkill, /reader-entry plans/);
    assert.match(generatedBookForgeSkill, /project hygiene scan/);
    assert.match(generatedBookForgeSkill, /current measured extent/);
    assert.match(generatedBookForgeSkill, /internal-language and AI-flavor scans/);
    assert.match(generatedBookForgeSkill, /stale reports cannot support readiness claims/);
    assert.match(generatedBookForgeSkill, /omits `asset_ready` figures/);
    assert.match(generatedBookForgeSkill, /tombstone refs/);
    assert.match(generatedBookForgeSkill, /教育实验观察窗口/);
    assert.match(generatedBookForgeSkill, /观察它如何强调/);
    assert.equal(output.skill_sync.codex_plugin_registry.surface_id, 'opl_codex_plugin_registry');
    assert.equal(output.skill_sync.codex_plugin_registry.summary.registered, 5);
    assert.equal(output.skill_sync.codex_plugin_registry.summary.removed_standalone_mcp_servers, 1);
    const stateDir = process.env.OPL_STATE_DIR
      ? path.resolve(process.env.OPL_STATE_DIR)
      : path.join(homeDir, 'Library', 'Application Support', 'OPL', 'state');
    for (const item of output.skill_sync.codex_plugin_registry.items) {
      assert.equal(
        item.marketplace_root,
        path.join(stateDir, 'codex-plugin-marketplaces', item.marketplace_id),
      );
      assert.equal(fs.existsSync(item.marketplace_path), true);
      assert.equal(fs.existsSync(item.plugin_manifest_path), true);
    }
    assert.equal(output.skill_sync.companion_skills.surface_id, 'opl_companion_skill_sync');
    assert.equal(output.skill_sync.companion_skills.mode, 'observe');
    assert.equal(output.skill_sync.companion_skills.summary.total >= 6, true);
    for (const skillName of ['mas', 'mag', 'rca']) {
      assert.equal(fs.existsSync(path.join(homeDir, '.codex', 'skills', skillName, 'SKILL.md')), false);
    }
    for (const skillName of ['opl-meta-agent', 'opl-bookforge']) {
      assert.equal(fs.existsSync(path.join(homeDir, '.codex', 'skills', skillName, 'SKILL.md')), false);
      assert.equal(
        fs.existsSync(path.join(
          homeDir,
          '.codex',
          'plugins',
          'cache',
          `${skillName}-local`,
          skillName,
          '0.1.0',
          'skills',
          skillName,
          'SKILL.md',
        )),
        true,
      );
    }
    const config = fs.readFileSync(path.join(codexHome, 'config.toml'), 'utf8');
    assert.match(config, /\[mcp_servers\.sentrux\]/);
    assert.doesNotMatch(config, /\[mcp_servers\.redcube-ai\]/);
    assert.match(config, /\[plugins\."mas@mas-local"\]/);
    assert.match(config, /\[plugins\."mag@mag-local"\]/);
    assert.match(config, /\[plugins\."rca@rca-local"\]/);
    assert.match(config, /\[plugins\."opl-meta-agent@opl-meta-agent-local"\]/);
    assert.match(config, /\[plugins\."opl-bookforge@opl-bookforge-local"\]/);
    assert.doesNotMatch(config, /\[plugins\."opl-scholarskills@opl-scholarskills-local"\]/);
  } finally {
    fs.rmSync(captureDir, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('opl connect sync-skills refuses standard agent manifests that expose standalone MCP servers', () => {
  const captureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-skill-sync-mcp-drift-'));
  const { workspaceRoot } = createFakeFamilySkillWorkspace(captureDir);
  const homeDir = path.join(captureDir, 'home');
  const codexHome = path.join(homeDir, '.codex');
  const masManifestPath = path.join(workspaceRoot, 'med-autoscience', 'plugins', 'mas', '.codex-plugin', 'plugin.json');
  const masManifest = JSON.parse(fs.readFileSync(masManifestPath, 'utf8'));
  masManifest.mcpServers = './.mcp.json';
  fs.writeFileSync(masManifestPath, `${JSON.stringify(masManifest, null, 2)}\n`, 'utf8');
  fs.mkdirSync(codexHome, { recursive: true });

  try {
    const output = runCli(['connect', 'sync-skills', '--domain', 'mas'], {
      HOME: homeDir,
      CODEX_HOME: codexHome,
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
    });

    const masPack = output.skill_sync.packs.find((entry: { canonical_plugin_name: string }) => entry.canonical_plugin_name === 'mas');
    assert.equal(masPack.sync_status, 'skipped');
    assert.equal(masPack.ready_to_sync, false);
    assert.equal(masPack.plugin_manifest_valid, false);
    assert.deepEqual(masPack.plugin_manifest_errors, [
      'standard_domain_agent_manifest_must_not_expose_standalone_mcp_servers',
    ]);
    assert.equal(output.skill_sync.codex_plugin_registry, null);
    assert.equal(fs.existsSync(path.join(codexHome, 'config.toml')), false);
  } finally {
    fs.rmSync(captureDir, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('opl connect sync-skills follows Developer Mode sibling checkouts over managed module copies', () => {
  const captureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-skill-sync-devmode-'));
  const { workspaceRoot } = createFakeFamilySkillWorkspace(captureDir);
  const modulesRoot = path.join(captureDir, 'managed-modules');
  const { workspaceRoot: managedWorkspaceRoot } = createFakeFamilySkillWorkspace(path.join(captureDir, 'managed-capture'));
  const homeDir = path.join(captureDir, 'home');
  const codexHome = path.join(homeDir, '.codex');
  fs.mkdirSync(codexHome, { recursive: true });
  fs.mkdirSync(modulesRoot, { recursive: true });
  fs.renameSync(path.join(managedWorkspaceRoot, 'med-autoscience'), path.join(modulesRoot, 'med-autoscience'));
  fs.renameSync(path.join(managedWorkspaceRoot, 'med-autogrant'), path.join(modulesRoot, 'med-autogrant'));
  fs.renameSync(path.join(managedWorkspaceRoot, 'redcube-ai'), path.join(modulesRoot, 'redcube-ai'));
  fs.renameSync(path.join(managedWorkspaceRoot, 'opl-meta-agent'), path.join(modulesRoot, 'opl-meta-agent'));
  fs.rmSync(managedWorkspaceRoot, { recursive: true, force: true });

  try {
    const output = runCli(['connect', 'sync-skills'], {
      HOME: homeDir,
      CODEX_HOME: codexHome,
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
      OPL_MODULES_ROOT: modulesRoot,
      OPL_DEVELOPER_MODE_GH_FIXTURE: JSON.stringify({ login: 'gaofeng21cn' }),
    });

    for (const [project, plugin] of [
      ['med-autoscience', 'mas'],
      ['med-autogrant', 'mag'],
      ['redcube-ai', 'rca'],
    ] as const) {
      const pack = output.skill_sync.packs.find((entry: { project: string }) => entry.project === project);
      assert.equal(
        fs.realpathSync(pack.installer_result.plugin_source_path),
        fs.realpathSync(path.join(workspaceRoot, project, 'plugins', plugin)),
      );
      const registryItem = output.skill_sync.codex_plugin_registry.items.find(
        (entry: { plugin_id: string }) => entry.plugin_id === plugin,
      );
      assert.equal(
        fs.realpathSync(path.join(registryItem.marketplace_root, 'plugins', plugin)),
        fs.realpathSync(path.join(workspaceRoot, project, 'plugins', plugin)),
      );
    }
    const scholarSkillsPack = output.skill_sync.packs.find((entry: { domain_id: string }) => entry.domain_id === 'scholarskills');
    assert.equal(scholarSkillsPack.sync_status, 'skipped');
    assert.equal(scholarSkillsPack.sync_scope, 'workspace');
    assert.equal(scholarSkillsPack.target_root, null);
    assert.equal(
      fs.existsSync(path.join(workspaceRoot, 'med-autoscience', 'plugins', 'opl-scholarskills', 'skills', 'opl-scholarskills', 'SKILL.md')),
      false,
    );
  } finally {
    fs.rmSync(captureDir, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('installed opl launcher syncs family skill packs before opening the raw Codex product entry', () => {
  const captureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-launcher-skill-sync-'));
  const homeDir = path.join(captureDir, 'home');
  const { workspaceRoot, syncLogPath } = createFakeFamilySkillWorkspace(captureDir);
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
echo "CODEX ENTRY"
exit 0
`);
  fs.mkdirSync(homeDir, { recursive: true });

  try {
    const result = runEntryPathRaw(binPath, [], {
      HOME: homeDir,
      OPL_CODEX_BIN: codexPath,
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
    });

    assert.equal(result.stdout, 'CODEX ENTRY\n');
    assert.equal(fs.existsSync(syncLogPath), false);
  } finally {
    fs.rmSync(captureDir, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

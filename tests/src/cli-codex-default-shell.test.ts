import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveFamilyWorkspaceRootFromRepoRoot } from '../../src/opl-skills.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const cliPath = path.join(repoRoot, 'src', 'cli.ts');
const binPath = path.join(repoRoot, 'bin', 'opl');

function runCli(args: string[], envOverrides: Record<string, string> = {}) {
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', cliPath, ...args],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        ...envOverrides,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function runCliRaw(args: string[], envOverrides: Record<string, string> = {}) {
  return runEntryPathRaw(cliPath, args, envOverrides);
}

function runCliFailure(args: string[], envOverrides: Record<string, string> = {}) {
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', cliPath, ...args],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        ...envOverrides,
      },
    },
  );

  assert.notEqual(result.status, 0);
  return {
    status: result.status ?? 1,
    payload: JSON.parse(result.stderr),
  };
}

function runEntryPathRaw(
  entryPath: string,
  args: string[],
  envOverrides: Record<string, string> = {},
) {
  const command = entryPath === cliPath ? process.execPath : entryPath;
  const commandArgs =
    entryPath === cliPath
      ? ['--experimental-strip-types', cliPath, ...args]
      : args;
  const result = spawnSync(
    command,
    commandArgs,
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        ...envOverrides,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  return result;
}

function runEntryPathFailure(
  entryPath: string,
  args: string[],
  envOverrides: Record<string, string> = {},
) {
  const command = entryPath === cliPath ? process.execPath : entryPath;
  const commandArgs =
    entryPath === cliPath
      ? ['--experimental-strip-types', cliPath, ...args]
      : args;
  const result = spawnSync(
    command,
    commandArgs,
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        ...envOverrides,
      },
    },
  );

  assert.notEqual(result.status, 0);
  return {
    status: result.status ?? 1,
    payload: JSON.parse(result.stderr),
  };
}

function createFakeCodexFixture(handlerBody: string) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-default-fixture-'));
  const codexPath = path.join(fixtureRoot, 'codex');
  fs.writeFileSync(
    codexPath,
    `#!/usr/bin/env bash
set -euo pipefail
${handlerBody}
`,
    { mode: 0o755 },
  );
  return {
    fixtureRoot,
    codexPath,
  };
}

const fakeFamilySkillDescriptions: Record<string, string> = {
  mas: 'Use when Codex should operate MedAutoScience through its stable runtime, controller, overlay, and workspace contracts instead of ad-hoc scripts.',
  mag: 'Use when Codex should operate Med Auto Grant through its grant-authoring product entry, user-loop, and schema-backed contracts instead of ad-hoc repo scripting.',
  rca: 'Operate RedCube AI as the formal RCA visual-deliverable domain app through product-entry, recoverable deliverable runtime, and same-session continuation contracts.',
  'opl-meta-agent': 'Use when Codex should operate OPL Meta Agent to design, test, improve, or take over testing for OPL-compatible Foundry Agents.',
};

const retiredCliCommandMatrix: Array<{
  args: string[];
  command: string;
  errorCode: string;
  replacements?: RegExp[];
}> = [
  {
    args: ['ask', 'Plan the next paper submission steps.'],
    command: 'opl ask',
    errorCode: 'unknown_command',
  },
  {
    args: ['chat', 'Plan the next paper submission steps.'],
    command: 'opl chat',
    errorCode: 'unknown_command',
  },
  {
    args: ['shell'],
    command: 'opl shell',
    errorCode: 'unknown_command',
  },
  {
    args: ['@mas', 'tighten the manuscript argument around invasive phenotype findings'],
    command: 'opl @mas',
    errorCode: 'unknown_command',
  },
  {
    args: ['@mag', 'Draft a grant revision response pack.', '--dry-run'],
    command: 'opl @mag',
    errorCode: 'unknown_command',
  },
  {
    args: ['@rca', 'Prepare a defense-ready slide deck.', '--dry-run'],
    command: 'opl @rca',
    errorCode: 'unknown_command',
  },
  {
    args: ['web'],
    command: 'web',
    errorCode: 'unknown_command',
  },
  {
    args: [['mcp', 'stdio'].join('-')],
    command: ['mcp', 'stdio'].join('-'),
    errorCode: 'unknown_command',
  },
];

function createFakeFamilySkillWorkspace(captureDir: string) {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-skills-'));
  const specs = [
    {
      project: 'med-autoscience',
      plugin: 'med-autoscience',
      canonicalPlugin: 'mas',
      installer: path.join('scripts', 'install-codex-plugin.sh'),
      scriptBody: `#!/usr/bin/env bash
set -euo pipefail
printf 'med-autoscience\\n' >> ${JSON.stringify(path.join(captureDir, 'sync.log'))}
cat <<'EOF'
{"repo":"med-autoscience","sync":"ok"}
EOF
`,
    },
    {
      project: 'med-autogrant',
      plugin: 'med-autogrant',
      canonicalPlugin: 'mag',
      installer: path.join('scripts', 'install-codex-plugin.sh'),
      scriptBody: `#!/usr/bin/env bash
set -euo pipefail
printf 'med-autogrant\\n' >> ${JSON.stringify(path.join(captureDir, 'sync.log'))}
cat <<'EOF'
{"repo":"med-autogrant","sync":"ok"}
EOF
`,
    },
    {
      project: 'redcube-ai',
      plugin: 'redcube-ai',
      canonicalPlugin: 'rca',
      installer: path.join('scripts', 'install-codex-plugin.ts'),
      scriptBody: `import fs from 'node:fs';
fs.appendFileSync(${JSON.stringify(path.join(captureDir, 'sync.log'))}, 'redcube-ai\\n');
process.stdout.write(JSON.stringify({ repo: 'redcube-ai', sync: 'ok' }) + '\\n');
`,
    },
    {
      project: 'opl-meta-agent',
      plugin: 'opl-meta-agent',
      canonicalPlugin: 'opl-meta-agent',
      installer: path.join('scripts', 'install-codex-plugin.mjs'),
      scriptBody: `import fs from 'node:fs';
fs.appendFileSync(${JSON.stringify(path.join(captureDir, 'sync.log'))}, 'opl-meta-agent\\n');
process.stdout.write(JSON.stringify({ repo: 'opl-meta-agent', sync: 'ok' }) + '\\n');
`,
    },
  ];

  for (const spec of specs) {
    const repoRoot = path.join(workspaceRoot, spec.project);
    const pluginRoot = path.join(repoRoot, 'plugins', spec.canonicalPlugin);
    const skillRoot = path.join(pluginRoot, 'skills', spec.canonicalPlugin);
    const installerPath = path.join(repoRoot, spec.installer);
    fs.mkdirSync(path.join(pluginRoot, '.codex-plugin'), { recursive: true });
    fs.mkdirSync(skillRoot, { recursive: true });
    fs.mkdirSync(path.dirname(installerPath), { recursive: true });
    fs.mkdirSync(path.join(repoRoot, '.agents', 'plugins'), { recursive: true });
    fs.writeFileSync(
      path.join(pluginRoot, '.codex-plugin', 'plugin.json'),
      JSON.stringify({ name: spec.canonicalPlugin, skills: './skills/' }, null, 2),
    );
    fs.writeFileSync(
      path.join(repoRoot, '.agents', 'plugins', 'marketplace.json'),
      JSON.stringify({ name: `${spec.canonicalPlugin}-local`, plugins: [] }, null, 2),
    );
    fs.writeFileSync(
      path.join(skillRoot, 'SKILL.md'),
      `---\nname: ${spec.canonicalPlugin}\ndescription: ${fakeFamilySkillDescriptions[spec.canonicalPlugin]}\n---\n\n# ${spec.canonicalPlugin.toUpperCase()} App Skill\n\nThis fixture represents a canonical family app skill with a real workflow entry, not a placeholder.\n`,
    );
    fs.mkdirSync(path.join(skillRoot, 'agents'), { recursive: true });
    fs.writeFileSync(
      path.join(skillRoot, 'agents', 'openai.yaml'),
      `interface:\n  display_name: "${spec.project === 'med-autoscience' ? 'Med Auto Science' : spec.project === 'med-autogrant' ? 'Med Auto Grant' : spec.project === 'redcube-ai' ? 'RedCube AI' : 'OPL Meta Agent'}"\n  short_description: "Canonical family app skill"\n  default_prompt: "Use $${spec.canonicalPlugin} to inspect the current family app state."\n`,
    );
    fs.writeFileSync(installerPath, spec.scriptBody, { mode: 0o755 });
  }

  return {
    workspaceRoot,
    syncLogPath: path.join(captureDir, 'sync.log'),
  };
}

test('bare opl command is a raw Codex product entry passthrough by default', () => {
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$#" -eq 0 ]; then
  cat <<'EOF'
CODEX ENTRY
EOF
  exit 0
fi
if [ "$1" = "exec" ]; then
  cat <<'EOF'
{"type":"thread.started","thread_id":"codex-product-entry-fallback"}
{"item":{"type":"agent_message","text":"CODEX EXEC READY"}}
EOF
  exit 0
fi
echo "unexpected fake-codex args: $*" >&2
exit 1
`);

  try {
    const result = runCliRaw([], {
      OPL_CODEX_BIN: codexPath,
    });

    assert.equal(result.stdout, 'CODEX ENTRY\n');
    assert.equal(result.stderr, '');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('bare opl forwards root-level Codex options before the prompt', () => {
  const capturePath = path.join(os.tmpdir(), `opl-codex-root-args-${process.pid}.txt`);
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
printf '%s\\n' "$@" > ${JSON.stringify(capturePath)}
echo "CODEX ROOT RAW"
exit 0
`);

  try {
    const result = runCliRaw(['--model', 'gpt-5.4', 'Plan the next paper submission steps.'], {
      OPL_CODEX_BIN: codexPath,
    });

    assert.equal(result.stdout, 'CODEX ROOT RAW\n');
    assert.equal(result.stderr, '');
    assert.deepEqual(fs.readFileSync(capturePath, 'utf8').trim().split('\n'), [
      '--model',
      'gpt-5.4',
      'Plan the next paper submission steps.',
    ]);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(capturePath, { force: true });
  }
});

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

test('installed opl launcher routes family discovery commands to OPL instead of Codex passthrough', () => {
  const commandMatrix = [
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

test('opl skill list discovers the family plugin packs through the configured sibling workspace root', () => {
  const captureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-skill-list-'));
  const { workspaceRoot, syncLogPath } = createFakeFamilySkillWorkspace(captureDir);

  try {
    const output = runCli(['skill', 'list'], {
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
    });

    assert.equal(output.skill_catalog.summary.total, 4);
    assert.equal(output.skill_catalog.summary.ready_to_sync, 4);
    assert.deepEqual(
      output.skill_catalog.packs.map((entry: { domain_id: string }) => entry.domain_id),
      ['medautoscience', 'medautogrant', 'redcube', 'oplmetaagent'],
    );
    assert.deepEqual(
      output.skill_catalog.packs.map((entry: { canonical_plugin_name: string }) => entry.canonical_plugin_name),
      ['mas', 'mag', 'rca', 'opl-meta-agent'],
    );
    assert.match(output.skill_catalog.packs[0].plugin_manifest_path, /plugins\/mas\/\.codex-plugin\/plugin\.json$/);
    assert.match(output.skill_catalog.packs[0].skill_entry_path, /plugins\/mas\/skills\/mas\/SKILL\.md$/);
    assert.deepEqual(
      output.skill_catalog.packs.map((entry: { skill_entry_valid: boolean }) => entry.skill_entry_valid),
      [true, true, true, true],
    );
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
    resolveFamilyWorkspaceRootFromRepoRoot('/tmp/workspace/one-person-lab'),
    '/tmp/workspace',
  );
});

test('opl skill list discovers OPL-managed module installs without OPL_FAMILY_WORKSPACE_ROOT', () => {
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

    const output = runCli(['skill', 'list'], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
      OPL_MEDAUTOGRANT_REPO_ROOT: path.join(missingRepoRoot, 'med-autogrant'),
      OPL_REDCUBE_REPO_ROOT: path.join(missingRepoRoot, 'redcube-ai'),
      OPL_OPLMETAAGENT_REPO_ROOT: path.join(missingRepoRoot, 'opl-meta-agent'),
    });

    const medAutoScience = output.skill_catalog.packs.find(
      (entry: { domain_id: string }) => entry.domain_id === 'medautoscience',
    );
    assert.ok(medAutoScience);
    assert.equal(output.skill_catalog.summary.repo_found, 1);
    assert.equal(output.skill_catalog.summary.ready_to_sync, 1);
    assert.equal(medAutoScience.repo_found, true);
    assert.equal(medAutoScience.ready_to_sync, true);
    assert.equal(
      medAutoScience.repo_root,
      path.join(managedModulesRoot, 'med-autoscience'),
    );
  } finally {
    fs.rmSync(captureDir, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('opl skill list prefers managed roots over Full runtime module path overrides', () => {
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

    const output = runCli(['skill', 'list', '--domain', 'rca'], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
      OPL_MODULE_PATH_REDCUBE: packagedRcaRoot,
    });

    assert.equal(output.skill_catalog.summary.repo_found, 1);
    assert.equal(output.skill_catalog.summary.ready_to_sync, 1);
    assert.equal(output.skill_catalog.packs[0].domain_id, 'redcube');
    assert.equal(output.skill_catalog.packs[0].repo_root, path.join(managedModulesRoot, 'redcube-ai'));
    assert.match(
      output.skill_catalog.packs[0].command_preview.join(' '),
      /node --experimental-strip-types .*scripts\/install-codex-plugin\.ts/,
    );
  } finally {
    fs.rmSync(captureDir, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('opl skill sync refuses to mirror legacy test skill stubs', () => {
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
    const output = runCli(['skill', 'sync', '--domain', 'medautoscience'], {
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

test('opl skill sync runs the lightweight family plugin installers and returns machine-readable results', () => {
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
    const output = runCli(['skill', 'sync'], {
      HOME: homeDir,
      CODEX_HOME: codexHome,
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
    });

    assert.equal(output.skill_sync.summary.synced, 4);
    assert.deepEqual(fs.readFileSync(syncLogPath, 'utf8').trim().split('\n'), [
      'med-autoscience',
      'med-autogrant',
      'redcube-ai',
      'opl-meta-agent',
    ]);
    assert.equal(output.skill_sync.packs[0].installer_result.repo, 'med-autoscience');
    assert.equal(output.skill_sync.packs[1].installer_result.repo, 'med-autogrant');
    assert.equal(output.skill_sync.packs[2].installer_result.repo, 'redcube-ai');
    assert.equal(output.skill_sync.packs[3].installer_result.repo, 'opl-meta-agent');
    assert.equal(output.skill_sync.codex_plugin_registry.surface_id, 'opl_codex_plugin_registry');
    assert.equal(output.skill_sync.codex_plugin_registry.summary.registered, 3);
    assert.equal(output.skill_sync.codex_plugin_registry.summary.removed_standalone_mcp_servers, 1);
    assert.equal(output.skill_sync.companion_skills.surface_id, 'opl_companion_skill_sync');
    assert.equal(output.skill_sync.companion_skills.mode, 'observe');
    assert.equal(output.skill_sync.companion_skills.summary.total >= 6, true);
    for (const skillName of ['mas', 'mag', 'rca', 'opl-meta-agent']) {
      const skillPath = path.join(homeDir, '.codex', 'skills', skillName, 'SKILL.md');
      const metadataPath = path.join(homeDir, '.codex', 'skills', skillName, 'agents', 'openai.yaml');
      const content = fs.readFileSync(skillPath, 'utf8');
      const metadata = fs.readFileSync(metadataPath, 'utf8');
      assert.match(content, /^---\nname: /);
      assert.doesNotMatch(content, /test skill/i);
      assert.match(metadata, /display_name: "(Med Auto Science|Med Auto Grant|RedCube AI|OPL Meta Agent)"/);
      assert.match(metadata, new RegExp(`default_prompt: "Use \\$${skillName}\\b`));
    }
    const config = fs.readFileSync(path.join(codexHome, 'config.toml'), 'utf8');
    assert.match(config, /\[mcp_servers\.sentrux\]/);
    assert.doesNotMatch(config, /\[mcp_servers\.redcube-ai\]/);
    assert.match(config, /\[plugins\."mas@mas-local"\]/);
    assert.match(config, /\[plugins\."mag@mag-local"\]/);
    assert.match(config, /\[plugins\."rca@rca-local"\]/);
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
    assert.deepEqual(fs.readFileSync(syncLogPath, 'utf8').trim().split('\n'), [
      'med-autoscience',
      'med-autogrant',
      'redcube-ai',
      'opl-meta-agent',
    ]);
  } finally {
    fs.rmSync(captureDir, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('exec command is a raw codex exec passthrough', () => {
  const capturePath = path.join(os.tmpdir(), `opl-codex-exec-args-${process.pid}.txt`);
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
printf '%s\\n' "$@" > ${JSON.stringify(capturePath)}
if [ "$1" = "exec" ]; then
  cat <<'EOF'
{"type":"thread.started","thread_id":"codex-exec-session"}
{"type":"turn.started"}
{"item":{"type":"agent_message","text":"CODEX EXEC ONE SHOT"}}
EOF
  exit 0
fi
echo "unexpected fake-codex args: $*" >&2
exit 1
`);

  try {
    const result = runCliRaw(
      ['exec', '--cd', '/tmp/opl-exec-smoke', '--model', 'gpt-5.4', 'Plan a medical grant proposal revision loop.'],
      {
        OPL_CODEX_BIN: codexPath,
      },
    );

    assert.match(result.stdout, /"thread_id":"codex-exec-session"/);
    assert.match(result.stdout, /CODEX EXEC ONE SHOT/);
    assert.equal(result.stderr, '');
    assert.deepEqual(fs.readFileSync(capturePath, 'utf8').trim().split('\n'), [
      'exec',
      '--cd',
      '/tmp/opl-exec-smoke',
      '--model',
      'gpt-5.4',
      'Plan a medical grant proposal revision loop.',
    ]);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(capturePath, { force: true });
  }
});

test('resume command is a raw codex resume passthrough', () => {
  const capturePath = path.join(os.tmpdir(), `opl-codex-resume-args-${process.pid}.txt`);
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
printf '%s\\n' "$@" > ${JSON.stringify(capturePath)}
if [ "$1" = "resume" ]; then
  cat <<'EOF'
CODEX RESUME RAW
EOF
  exit 0
fi
echo "unexpected fake-codex args: $*" >&2
exit 1
`);

  try {
    const result = runCliRaw(['resume', '--last', 'continue this session'], {
      OPL_CODEX_BIN: codexPath,
    });

    assert.equal(result.stdout, 'CODEX RESUME RAW\n');
    assert.equal(result.stderr, '');
    assert.deepEqual(fs.readFileSync(capturePath, 'utf8').trim().split('\n'), [
      'resume',
      '--last',
      'continue this session',
    ]);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(capturePath, { force: true });
  }
});

test('removed command aliases fail closed in favor of Codex-default shell and skill sync', () => {
  for (const retired of retiredCliCommandMatrix) {
    const failure = runCliFailure(retired.args);
    assert.equal(failure.status, 2);
    assert.equal(failure.payload.error.code, retired.errorCode);
    if (retired.errorCode === 'cli_usage_error') {
      assert.match(failure.payload.error.message, new RegExp(`Command "${retired.command}" has been retired`));
    }
    for (const replacement of retired.replacements ?? []) {
      assert.match(failure.payload.error.message, replacement);
    }
  }
});

test('help text advertises Codex as the default entry and lists opl exec without retired aliases', () => {
  const output = runCli(['help']);
  const commands = output.help.commands as Array<{ command: string; summary: string }>;

  assert.equal(commands.some((entry) => entry.command === 'exec'), true);
  assert.equal(commands.some((entry) => entry.command === 'ask'), false);
  assert.equal(commands.some((entry) => entry.command === 'chat'), false);
  assert.equal(commands.some((entry) => entry.command === 'shell'), false);
  assert.equal(commands.some((entry) => entry.command === 'skill list'), true);
  assert.equal(commands.some((entry) => entry.command === 'skill sync'), true);
});

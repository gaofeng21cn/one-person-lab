import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { FrameworkContractError } from '../../../src/kernel/contract-validation.ts';
import { sha256Text } from '../../../src/adapters/integration/agent-package-registry/shared.ts';
import type { AgentPackageSkillProjection } from '../../../src/adapters/integration/agent-package-registry/types.ts';
import {
  runCodexInE2bSandbox,
  setE2bSandboxFactoryForTest,
} from '../../../src/adapters/execution/e2b-codex-stage-execution.ts';
import {
  runCodexInLocalSandbox,
  setLocalSandboxCommandRunnerForTest,
} from '../../../src/adapters/execution/local-codex-stage-sandbox.ts';
import { codexActivityEventForTemporalHistory } from '../../../src/adapters/execution/family-runtime-temporal-history-summary.ts';

type ExpectedFailure = {
  phase: string;
  failureCode: string;
};

function makeTreeWritable(root: string) {
  if (!fs.existsSync(root)) return;
  const stat = fs.lstatSync(root);
  if (stat.isDirectory()) {
    fs.chmodSync(root, 0o755);
    for (const entry of fs.readdirSync(root)) makeTreeWritable(path.join(root, entry));
  } else if (!stat.isSymbolicLink()) {
    fs.chmodSync(root, 0o644);
  }
}

function buildSkillProjection(fixtureRoot: string) {
  const stateRoot = path.join(fixtureRoot, 'state');
  const generationId = sha256Text('sandbox-fail-fast-immutable-generation');
  const projectionRoot = path.join(stateRoot, 'agent-package-skill-projections', generationId);
  const skillRoot = path.join(projectionRoot, '.agents', 'skills', 'fixture-agent');
  fs.mkdirSync(skillRoot, { recursive: true });
  const skillBytes = Buffer.from([
    '---',
    'name: fixture-agent',
    'description: Sandbox fail-fast fixture.',
    '---',
    '',
    'Use this fixture only for sandbox transport tests.',
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(skillRoot, 'SKILL.md'), skillBytes, { mode: 0o555 });
  const skillDigest = `sha256:${sha256Text(`fixture-agent/SKILL.md\0${skillBytes.toString('base64')}`)}`;
  const closureDigest = `sha256:${sha256Text(JSON.stringify([['fixture-agent', skillDigest]]))}`;
  return {
    surface_kind: 'opl_agent_package_skill_projection.v1',
    status: 'materialized',
    generation_id: generationId,
    projection_root: projectionRoot,
    skills_root: path.join(projectionRoot, '.agents', 'skills'),
    root_package_id: 'fixture-agent-package',
    root_skill_ids: ['fixture-agent'],
    core_skill_ids: ['fixture-agent'],
    specialty_skill_ids: [],
    skill_ids: ['fixture-agent'],
    skill_digests: { 'fixture-agent': skillDigest },
    core_digest: closureDigest,
    full_export_digest: closureDigest,
  } satisfies AgentPackageSkillProjection;
}

function attemptWithProjection(projection: ReturnType<typeof buildSkillProjection>) {
  return {
    stage_attempt_id: 'sat-sandbox-fail-fast',
    stage_id: 'fixture-stage',
    workspace_locator: {
      git_remote_url: 'https://fixture-user:fixture-password@example.test/private.git',
      checkout_ref: 'fixture-ref',
      package_use_binding: { skill_projection: projection },
    },
  };
}

function assertPreparationFailure(error: unknown, expected: ExpectedFailure) {
  assert.ok(error instanceof FrameworkContractError);
  assert.equal(error.code, 'launcher_failed');
  assert.equal(error.details?.failure_code, expected.failureCode);
  assert.equal(error.details?.sandbox_phase, expected.phase);
  assert.equal(error.details?.codex_executed, false);
  assert.equal(error.details?.credential_material_logged, false);
  assert.equal(error.details?.stderr_logged, false);
  const serialized = JSON.stringify(error.toJSON());
  assert.doesNotMatch(serialized, /fixture-password/);
  assert.doesNotMatch(serialized, /provider-secret/);
  return true;
}

function localCommandPhase(args: string[]) {
  if (args[0] === 'exec' && args[2] === 'sh' && args[4]?.includes('rm -rf')) return 'workspace_reset';
  if (args[0] === 'exec' && args[2] === 'git' && args[3] === 'clone') return 'workspace_clone';
  if (args[0] === 'exec' && args[2] === 'git' && args.includes('checkout')) return 'workspace_checkout';
  if (args[0] === 'exec' && args[2] === 'mkdir') return 'skill_root_create';
  if (args[0] === 'cp') return 'skill_projection_copy';
  if (args[0] === 'exec' && args[2] === 'sh' && args[4]?.includes('.git/info/exclude')) {
    return 'skill_projection_exclude';
  }
  if (args[0] === 'exec' && args.at(-1)?.startsWith("'codex'")) return 'codex';
  return null;
}

function e2bCommandPhase(command: string) {
  if (command.includes('rm -rf')) return 'workspace_reset';
  if (command.startsWith('git clone ')) return 'workspace_clone';
  if (command.includes(' checkout ')) return 'workspace_checkout';
  if (command === "mkdir -p '/home/user/fixture/.agents/skills'") return 'skill_root_create';
  if (command.startsWith('mkdir -p ') && command.includes('.agents/skills/fixture-agent')) {
    return 'skill_file_parent_create';
  }
  if (command.startsWith('chmod 0555 ')) return 'skill_file_chmod';
  if (command.startsWith("printf '%s\\n'") && command.includes('.git/info/exclude')) {
    return 'skill_projection_exclude';
  }
  if (command.startsWith("'codex'")) return 'codex';
  return null;
}

test('local and E2B sandbox preparation failures never execute Codex', async (t) => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-sandbox-fail-fast-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  try {
    process.env.OPL_STATE_DIR = path.join(fixtureRoot, 'state');
    const projection = buildSkillProjection(fixtureRoot);
    const attempt = attemptWithProjection(projection);

    const localCases: ExpectedFailure[] = [
      { phase: 'workspace_reset', failureCode: 'codex_sandbox_workspace_reset_failed' },
      { phase: 'workspace_clone', failureCode: 'codex_sandbox_workspace_clone_failed' },
      { phase: 'workspace_checkout', failureCode: 'codex_sandbox_workspace_checkout_failed' },
      { phase: 'skill_root_create', failureCode: 'agent_package_skill_projection_sandbox_mkdir_failed' },
      { phase: 'skill_projection_copy', failureCode: 'agent_package_skill_projection_sandbox_copy_failed' },
      { phase: 'skill_projection_exclude', failureCode: 'agent_package_skill_projection_sandbox_exclude_failed' },
    ];
    for (const expected of localCases) {
      await t.test(`local ${expected.phase} is fail-fast`, async () => {
        const phases: Array<string | null> = [];
        setLocalSandboxCommandRunnerForTest(async (args) => {
          const phase = localCommandPhase(args);
          phases.push(phase);
          if (phase === expected.phase) {
            return {
              exitCode: 17,
              stdout: '',
              stderr: 'provider-secret https://fixture-user:fixture-password@example.test/private.git',
            };
          }
          return { exitCode: 0, stdout: '', stderr: '' };
        });
        try {
          await assert.rejects(
            () => runCodexInLocalSandbox({
              attempt,
              args: ['exec', '--json', 'fixture prompt'],
              env: {
                OPL_LOCAL_SANDBOX_IMAGE: 'fixture-image:latest',
                OPL_LOCAL_SANDBOX_WORKSPACE_ROOT: '/workspace/fixture',
              },
              providerKind: 'local_docker',
              timeoutMs: 10_000,
            }),
            (error) => assertPreparationFailure(error, expected),
          );
          assert.equal(phases.includes('codex'), false);
        } finally {
          setLocalSandboxCommandRunnerForTest(null);
        }
      });
    }

    const e2bCases: ExpectedFailure[] = [
      { phase: 'workspace_reset', failureCode: 'codex_sandbox_workspace_reset_failed' },
      { phase: 'workspace_clone', failureCode: 'codex_sandbox_workspace_clone_failed' },
      { phase: 'workspace_checkout', failureCode: 'codex_sandbox_workspace_checkout_failed' },
      { phase: 'skill_root_create', failureCode: 'agent_package_skill_projection_sandbox_mkdir_failed' },
      { phase: 'skill_file_parent_create', failureCode: 'agent_package_skill_projection_sandbox_mkdir_failed' },
      { phase: 'skill_file_write', failureCode: 'agent_package_skill_projection_sandbox_write_failed' },
      { phase: 'skill_file_chmod', failureCode: 'agent_package_skill_projection_sandbox_chmod_failed' },
      { phase: 'skill_projection_exclude', failureCode: 'agent_package_skill_projection_sandbox_exclude_failed' },
    ];
    for (const expected of e2bCases) {
      await t.test(`E2B ${expected.phase} is fail-fast`, async () => {
        const phases: string[] = [];
        const sandbox = {
          sandboxId: 'sandbox-fixture',
          sandboxDomain: 'sandbox-fixture.example.test',
          commands: {
            async run(command: string) {
              const phase = e2bCommandPhase(command);
              if (phase) phases.push(phase);
              if (phase === expected.phase) {
                return {
                  exitCode: 19,
                  stdout: '',
                  stderr: 'provider-secret https://fixture-user:fixture-password@example.test/private.git',
                };
              }
              return { exitCode: 0, stdout: '', stderr: '' };
            },
          },
          files: {
            async write() {
              phases.push('skill_file_write');
              if (expected.phase === 'skill_file_write') throw new Error('provider-secret');
              return {};
            },
          },
        };
        setE2bSandboxFactoryForTest({
          async create() { return sandbox; },
          async connect() { return sandbox; },
        });
        try {
          await assert.rejects(
            () => runCodexInE2bSandbox({
              attempt,
              args: ['exec', '--json', 'fixture prompt'],
              env: {
                OPL_FAMILY_RUNTIME_PROVIDER: 'external_sandbox',
                OPL_EXTERNAL_SANDBOX_SUBSTRATE: 'e2b',
                OPL_EXTERNAL_SANDBOX_ENDPOINT: 'https://sandbox.example.test',
                OPL_EXTERNAL_SANDBOX_CREDENTIAL_REF: 'secret-ref:provider-secret',
                OPL_EXTERNAL_SANDBOX_PROVIDER_RECEIPT_REF: 'receipt-ref:sandbox-fixture',
                OPL_E2B_WORKSPACE_ROOT: '/home/user/fixture',
              },
              timeoutMs: 10_000,
            }),
            (error) => assertPreparationFailure(error, expected),
          );
          assert.equal(phases.includes('codex'), false);
        } finally {
          setE2bSandboxFactoryForTest(null);
        }
      });
    }
  } finally {
    setLocalSandboxCommandRunnerForTest(null);
    setE2bSandboxFactoryForTest(null);
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    makeTreeWritable(fixtureRoot);
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('sandbox clone credentials stay in transport and out of durable evidence', async () => {
  const rawRepoUrl = [
    'https://fixture-user:fixture-password@example.test/private.git',
    '?ref=main&access_token=query-secret',
  ].join('');
  const displayRepoUrl = 'https://example.test/private.git?ref=main';
  const attempt = {
    stage_attempt_id: 'sat-sandbox-credential-redaction',
    stage_id: 'fixture-stage',
    workspace_locator: { git_remote_url: rawRepoUrl },
  };

  const localCalls: string[][] = [];
  setLocalSandboxCommandRunnerForTest(async (args) => {
    localCalls.push(args);
    return { exitCode: 0, stdout: '', stderr: '' };
  });
  try {
    const local = await runCodexInLocalSandbox({
      attempt,
      args: ['exec', '--json', 'fixture prompt'],
      env: {
        OPL_LOCAL_SANDBOX_IMAGE: 'fixture-image:latest',
        OPL_LOCAL_SANDBOX_WORKSPACE_ROOT: '/workspace/fixture',
      },
      providerKind: 'local_docker',
      timeoutMs: 10_000,
    });
    assert.ok(localCalls.some((args) => args[2] === 'git' && args[3] === 'clone' && args[4] === rawRepoUrl));
    assert.equal(local.summary.workspace_transport.repo_url, displayRepoUrl);
    assert.doesNotMatch(JSON.stringify(local.summary), /fixture-password|query-secret/);
  } finally {
    setLocalSandboxCommandRunnerForTest(null);
  }

  const e2bCommands: string[] = [];
  const sandbox = {
    sandboxId: 'sandbox-credential-redaction',
    sandboxDomain: 'sandbox-credential-redaction.example.test',
    commands: {
      async run(command: string) {
        e2bCommands.push(command);
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    },
    files: { async write() { return {}; } },
  };
  setE2bSandboxFactoryForTest({
    async create() { return sandbox; },
    async connect() { return sandbox; },
  });
  try {
    const e2b = await runCodexInE2bSandbox({
      attempt,
      args: ['exec', '--json', 'fixture prompt'],
      env: {
        OPL_FAMILY_RUNTIME_PROVIDER: 'external_sandbox',
        OPL_EXTERNAL_SANDBOX_SUBSTRATE: 'e2b',
        OPL_EXTERNAL_SANDBOX_ENDPOINT: 'https://sandbox.example.test',
        OPL_EXTERNAL_SANDBOX_CREDENTIAL_REF: 'secret-ref:provider-secret',
        OPL_EXTERNAL_SANDBOX_PROVIDER_RECEIPT_REF: 'receipt-ref:sandbox-credential-redaction',
        OPL_E2B_WORKSPACE_ROOT: '/home/user/fixture',
      },
      timeoutMs: 10_000,
    });
    assert.ok(e2bCommands.some((command) => command.includes(`git clone '${rawRepoUrl}'`)));
    assert.equal(e2b.summary.workspace_transport.repo_url, displayRepoUrl);
    assert.doesNotMatch(JSON.stringify(e2b.summary), /fixture-password|query-secret/);
  } finally {
    setE2bSandboxFactoryForTest(null);
  }

  const temporalHistory = codexActivityEventForTemporalHistory({
    process_output_summary: {
      sandbox_execution: {
        execution_substrate: 'local_sandbox',
        workspace_transport: {
          transport_kind: 'git_clone',
          repo_url: rawRepoUrl,
        },
      },
    },
  });
  assert.equal(
    temporalHistory.process_output_summary?.sandbox_execution?.workspace_transport.repo_url,
    displayRepoUrl,
  );
  assert.doesNotMatch(JSON.stringify(temporalHistory), /fixture-password|query-secret/);
});

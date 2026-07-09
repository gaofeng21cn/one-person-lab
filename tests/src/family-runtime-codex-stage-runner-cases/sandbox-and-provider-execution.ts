import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { createFakeCodexFixture, createGitModuleRemoteFixture } from '../cli/helpers.ts';
import { runPublicCodexStageRunner } from '../family-runtime-codex-stage-runner-helpers.ts';
import {
  runAgentStageRunner,
} from '../../../src/modules/runway/family-runtime-codex-stage-runner.ts';
import { FrameworkContractError } from '../../../src/modules/charter/contracts.ts';
import {
  runCodexInE2bSandbox,
  setE2bSandboxFactoryForTest,
} from '../../../src/modules/runway/e2b-codex-stage-execution.ts';
import {
  runCodexInLocalSandbox,
  selectCodexStageSandboxProvider,
  setLocalSandboxCommandRunnerForTest,
} from '../../../src/modules/runway/local-codex-stage-sandbox.ts';

function assertRefsInclude(actual: string[] | undefined, expected: string[]) {
  assert.ok(actual);
  for (const ref of expected) assert.ok(actual.includes(ref), ref);
}

function envRefs(actual: string[] | undefined) {
  assert.ok(actual);
  return new Map(actual.map((ref) => {
    const index = ref.indexOf('=');
    assert.notEqual(index, -1, ref);
    return [ref.slice(0, index), ref.slice(index + 1)];
  }));
}

function createGflabNoSchemaFixture(
  receiptRef: string,
  capturePrefix: string,
  threadId: string,
  resumeOnly = false,
) {
  const closeout = {
    surface_kind: 'stage_attempt_closeout_packet',
    closeout_refs: [receiptRef],
    consumed_refs: ['paper:draft.md'],
    next_owner: 'med-autoscience',
    domain_ready_verdict: 'domain_gate_pending',
  };
  const capturePath = path.join(os.tmpdir(), `${capturePrefix}-${process.pid}.txt`);
  const captureBody = `
output_last_message=""
output_schema_seen="false"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --output-last-message)
      output_last_message="$2"
      shift 2
      ;;
    --output-schema)
      output_schema_seen="true"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done
printf '%s\\n%s\\n' "$output_last_message" "$output_schema_seen" > ${JSON.stringify(capturePath)}
if [ -z "$output_last_message" ] || [ "$output_schema_seen" = "true" ]; then
  exit 64
fi
printf '%s\\n' '${JSON.stringify(closeout)}' > "$output_last_message"
printf '{"type":"thread.started","thread_id":"${threadId}"}\\n'
printf '{"type":"turn.completed"}\\n'
exit 0
`;
  const script = resumeOnly
    ? `
if [ "$1" = "exec" ] && [ "$2" = "resume" ]; then
${captureBody}
fi
if [ "$1" = "exec" ]; then
  printf '{"type":"thread.started","thread_id":"thread-gflab-needs-enforcement"}\\n'
  printf '{"type":"turn.completed"}\\n'
  exit 0
fi
echo "unexpected fake codex args: $*" >&2
exit 64
`
    : `
if [ "$1" = "exec" ]; then
${captureBody}
fi
echo "unexpected fake codex args: $*" >&2
exit 64
`;
  return { closeout, capturePath, ...createFakeCodexFixture(script) };
}

function assertNoOutputSchema(capturePath: string) {
  const captured = fs.readFileSync(capturePath, 'utf8').trim().split('\n');
  assert.notEqual(captured[0], '');
  assert.equal(captured[1], 'false');
}

test('Codex stage runner can execute Codex inside an E2B sandbox and collect diff refs', async () => {
  const remote = createGitModuleRemoteFixture('sandboxed-agent-workspace');
  const commands: Array<{ cmd: string; cwd: string | null; envs: Record<string, string> }> = [];
  const closeout = {
    surface_kind: 'stage_attempt_closeout_packet',
    stage_attempt_id: 'sat_e2b_codex_stage_test',
    closeout_refs: ['receipt:e2b-codex-stage'],
    next_owner: 'med-autoscience',
    domain_ready_verdict: 'domain_gate_pending',
  };
  setE2bSandboxFactoryForTest({
    async create() {
      return {
        sandboxId: 'sandbox_e2b_created_test',
        sandboxDomain: 'sandbox.e2b.test',
        commands: {
          async run(cmd, opts) {
            commands.push({ cmd, cwd: opts?.cwd ?? null, envs: opts?.envs ?? {} });
            if (cmd.includes(' diff --name-only')) {
              return { exitCode: 0, stdout: 'artifacts/stage-output.json\n', stderr: '' };
            }
            if (cmd.includes(' diff --stat')) {
              return { exitCode: 0, stdout: ' artifacts/stage-output.json | 1 +\n', stderr: '' };
            }
            if (cmd.startsWith("'codex' 'exec'")) {
              return {
                exitCode: 0,
                stdout: [
                  '{"type":"thread.started","thread_id":"thread-e2b-stage"}',
                  JSON.stringify({
                    type: 'item.completed',
                    item: {
                      type: 'agent_message',
                      id: 'msg-e2b-stage',
                      text: JSON.stringify(closeout),
                    },
                  }),
                  '',
                ].join('\n'),
                stderr: '',
              };
            }
            return { exitCode: 0, stdout: '', stderr: '' };
          },
        },
      };
    },
    async connect() {
      throw new Error('test should create a fresh sandbox');
    },
  });
  const previous = {
    provider: process.env.OPL_CODEX_STAGE_SANDBOX_PROVIDER,
    substrate: process.env.OPL_EXTERNAL_SANDBOX_SUBSTRATE,
    endpoint: process.env.OPL_EXTERNAL_SANDBOX_ENDPOINT,
    credentialRef: process.env.OPL_EXTERNAL_SANDBOX_CREDENTIAL_REF,
    receiptRef: process.env.OPL_EXTERNAL_SANDBOX_PROVIDER_RECEIPT_REF,
    apiKey: process.env.E2B_API_KEY,
    workspaceRoot: process.env.OPL_E2B_WORKSPACE_ROOT,
  };
  try {
    process.env.OPL_CODEX_STAGE_SANDBOX_PROVIDER = 'e2b';
    process.env.OPL_EXTERNAL_SANDBOX_SUBSTRATE = 'e2b';
    process.env.OPL_EXTERNAL_SANDBOX_ENDPOINT = 'https://api.e2b.test';
    process.env.OPL_EXTERNAL_SANDBOX_CREDENTIAL_REF = 'env:E2B_API_KEY';
    process.env.OPL_EXTERNAL_SANDBOX_PROVIDER_RECEIPT_REF = 'receipt:e2b-provider';
    delete process.env.E2B_API_KEY;
    process.env.OPL_E2B_WORKSPACE_ROOT = '/home/user/workspace';

    const receipt = await runPublicCodexStageRunner({
      attempt: {
        stage_attempt_id: 'sat_e2b_codex_stage_test',
        stage_id: 'domain_owner/default-executor-dispatch',
        executor_kind: 'codex_cli',
        workspace_locator: {
          workspace_root: remote.sourceRoot,
          git_remote_url: remote.remoteRoot,
          git_ref: remote.getHeadSha(),
        },
        checkpoint_refs: ['packet:e2b-stage'],
      },
      stagePacketRef: 'packet:e2b-stage',
      runnerMode: 'codex_cli',
      timeoutMs: 10_000,
    });

    assert.equal(receipt.progress_summary.thread_id, 'thread-e2b-stage');
    assert.deepEqual(receipt.closeout_packet?.closeout_refs, ['receipt:e2b-codex-stage']);
    const summary = receipt.process_output_summary?.external_sandbox_execution;
    assert.ok(summary, 'receipt must include external sandbox execution summary');
    assert.equal(summary.provider_kind, 'e2b');
    assert.equal(summary.sandbox_id, 'sandbox_e2b_created_test');
    assert.equal(summary.workspace_transport.repo_url, remote.remoteRoot);
    assert.equal(summary.workspace_transport.checkout_ref, remote.getHeadSha());
    assert.deepEqual(summary.diff_refs.changed_file_refs, ['artifacts/stage-output.json']);
    assert.equal(summary.external_api_called, true);
    assert.equal(summary.credential_material_logged, false);
    assert.equal(commands.some((entry) => entry.cmd.includes('git clone')), true);
    const codexCommand = commands.find((entry) => entry.cmd.startsWith("'codex' 'exec'"));
    assert.ok(codexCommand, 'E2B command log must include sandboxed Codex execution');
    assert.equal(codexCommand.cwd, '/home/user/workspace');
    assert.match(codexCommand.cmd, /--cd' '\/home\/user\/workspace/);
  } finally {
    setE2bSandboxFactoryForTest(null);
    for (const [key, value] of Object.entries(previous)) {
      const envKey = {
        provider: 'OPL_CODEX_STAGE_SANDBOX_PROVIDER',
        substrate: 'OPL_EXTERNAL_SANDBOX_SUBSTRATE',
        endpoint: 'OPL_EXTERNAL_SANDBOX_ENDPOINT',
        credentialRef: 'OPL_EXTERNAL_SANDBOX_CREDENTIAL_REF',
        receiptRef: 'OPL_EXTERNAL_SANDBOX_PROVIDER_RECEIPT_REF',
        apiKey: 'E2B_API_KEY',
        workspaceRoot: 'OPL_E2B_WORKSPACE_ROOT',
      }[key]!;
      if (value === undefined) {
        delete process.env[envKey];
      } else {
        process.env[envKey] = value;
      }
    }
    fs.rmSync(remote.fixtureRoot, { recursive: true, force: true });
  }
});

test('Codex stage runner defaults to host provider unless sandbox is explicitly selected', async () => {
  const closeout = {
    surface_kind: 'stage_attempt_closeout_packet',
    stage_attempt_id: 'sat_default_host_codex_stage_test',
    closeout_refs: ['receipt:host-codex-stage'],
    next_owner: 'med-autoscience',
    domain_ready_verdict: 'domain_gate_pending',
  };
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  printf '{"type":"thread.started","thread_id":"thread-default-host-stage"}\\n'
  printf '%s\\n' "$(node -e 'const text = process.argv[1]; process.stdout.write(JSON.stringify({type:"item.completed",item:{type:"agent_message",id:"msg-default-host",text}}));' '${JSON.stringify(closeout)}')"
  printf '{"type":"turn.completed"}\\n'
  exit 0
fi
echo "unexpected fake codex args: $*" >&2
exit 64
`);
  const previous = {
    codexBin: process.env.OPL_CODEX_BIN,
    provider: process.env.OPL_CODEX_STAGE_SANDBOX_PROVIDER,
    runtimeProvider: process.env.OPL_FAMILY_RUNTIME_PROVIDER,
    substrate: process.env.OPL_EXTERNAL_SANDBOX_SUBSTRATE,
  };
  try {
    process.env.OPL_CODEX_BIN = codexPath;
    delete process.env.OPL_CODEX_STAGE_SANDBOX_PROVIDER;
    delete process.env.OPL_FAMILY_RUNTIME_PROVIDER;
    delete process.env.OPL_EXTERNAL_SANDBOX_SUBSTRATE;

    const receipt = await runAgentStageRunner({
      attempt: {
        stage_attempt_id: 'sat_default_host_codex_stage_test',
        stage_id: 'domain_owner/default-executor-dispatch',
        executor_kind: 'codex_cli',
        workspace_locator: {
          workspace_root: fixtureRoot,
        },
        checkpoint_refs: ['packet:default-host-stage'],
      },
      stagePacketRef: 'packet:default-host-stage',
      runnerMode: 'codex_cli',
      timeoutMs: 10_000,
    }) as Awaited<ReturnType<typeof runPublicCodexStageRunner>>;

    assert.equal(selectCodexStageSandboxProvider({}), 'host');
    assert.equal(receipt.progress_summary.thread_id, 'thread-default-host-stage');
    assert.deepEqual(receipt.closeout_packet?.closeout_refs, ['receipt:host-codex-stage']);
    assert.equal(receipt.process_output_summary?.sandbox_execution, undefined);
    assert.equal(receipt.process_output_summary?.external_sandbox_execution, undefined);
  } finally {
    if (previous.codexBin === undefined) delete process.env.OPL_CODEX_BIN;
    else process.env.OPL_CODEX_BIN = previous.codexBin;
    if (previous.provider === undefined) delete process.env.OPL_CODEX_STAGE_SANDBOX_PROVIDER;
    else process.env.OPL_CODEX_STAGE_SANDBOX_PROVIDER = previous.provider;
    if (previous.runtimeProvider === undefined) delete process.env.OPL_FAMILY_RUNTIME_PROVIDER;
    else process.env.OPL_FAMILY_RUNTIME_PROVIDER = previous.runtimeProvider;
    if (previous.substrate === undefined) delete process.env.OPL_EXTERNAL_SANDBOX_SUBSTRATE;
    else process.env.OPL_EXTERNAL_SANDBOX_SUBSTRATE = previous.substrate;
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('Codex stage runner uses explicit local devcontainer sandbox and collects diff refs', async () => {
  const remote = createGitModuleRemoteFixture('local-agent-workspace');
  const dockerCalls: string[][] = [];
  const closeout = {
    surface_kind: 'stage_attempt_closeout_packet',
    stage_attempt_id: 'sat_local_sandbox_codex_stage_test',
    closeout_refs: ['receipt:local-sandbox-codex-stage'],
    next_owner: 'med-autoscience',
    domain_ready_verdict: 'domain_gate_pending',
  };
  setLocalSandboxCommandRunnerForTest(async (args) => {
    dockerCalls.push(args);
    if (args.includes('diff') && args.includes('--name-only')) {
      return { exitCode: 0, stdout: 'artifacts/local-stage-output.json\n', stderr: '' };
    }
    if (args.includes('diff') && args.includes('--stat')) {
      return { exitCode: 0, stdout: ' artifacts/local-stage-output.json | 1 +\n', stderr: '' };
    }
    if (args.includes('sh') && args.includes('-lc') && args.some((arg) => arg.includes("'codex' 'exec'"))) {
      return {
        exitCode: 0,
        stdout: [
          '{"type":"thread.started","thread_id":"thread-local-stage"}',
          JSON.stringify({
            type: 'item.completed',
            item: {
              type: 'agent_message',
              id: 'msg-local-stage',
              text: JSON.stringify(closeout),
            },
          }),
          '',
        ].join('\n'),
        stderr: '',
      };
    }
    return { exitCode: 0, stdout: '', stderr: '' };
  });
  const previous = {
    provider: process.env.OPL_CODEX_STAGE_SANDBOX_PROVIDER,
    image: process.env.OPL_LOCAL_SANDBOX_IMAGE,
    workspaceRoot: process.env.OPL_LOCAL_SANDBOX_WORKSPACE_ROOT,
  };
  try {
    process.env.OPL_CODEX_STAGE_SANDBOX_PROVIDER = 'local_devcontainer';
    process.env.OPL_LOCAL_SANDBOX_IMAGE = 'opl/devcontainer-codex:test';
    process.env.OPL_LOCAL_SANDBOX_WORKSPACE_ROOT = '/workspace/stage';

    const receipt = await runAgentStageRunner({
      attempt: {
        stage_attempt_id: 'sat_local_sandbox_codex_stage_test',
        stage_id: 'domain_owner/default-executor-dispatch',
        executor_kind: 'codex_cli',
        workspace_locator: {
          workspace_root: remote.sourceRoot,
          git_remote_url: remote.remoteRoot,
          git_ref: remote.getHeadSha(),
        },
        checkpoint_refs: ['packet:local-stage'],
      },
      stagePacketRef: 'packet:local-stage',
      runnerMode: 'codex_cli',
      timeoutMs: 10_000,
    }) as Awaited<ReturnType<typeof runPublicCodexStageRunner>>;

    assert.equal(receipt.progress_summary.thread_id, 'thread-local-stage');
    assert.deepEqual(receipt.closeout_packet?.closeout_refs, ['receipt:local-sandbox-codex-stage']);
    const summary = receipt.process_output_summary?.sandbox_execution;
    assert.ok(summary, 'receipt must include generic sandbox execution summary');
    assert.equal(summary.execution_substrate, 'local_sandbox');
    assert.equal(summary.provider_kind, 'local_devcontainer');
    assert.equal(summary.sandbox_workspace_root, '/workspace/stage');
    assert.equal(summary.workspace_transport.repo_url, remote.remoteRoot);
    assert.equal(summary.workspace_transport.checkout_ref, remote.getHeadSha());
    assert.deepEqual(summary.diff_refs.changed_file_refs, ['artifacts/local-stage-output.json']);
    assert.equal(summary.external_api_called, false);
    assert.equal(summary.credential_material_logged, false);
    assert.equal(summary.host_workspace_mutated, false);
    assert.equal(dockerCalls.some((args) => args[0] === 'create'), true);
    assert.equal(dockerCalls.some((args) => args.includes('git') && args.includes('clone')), true);
    assert.equal(dockerCalls.some((args) => args[0] === 'rm' && args[1] === '-f'), true);
  } finally {
    setLocalSandboxCommandRunnerForTest(null);
    if (previous.provider === undefined) delete process.env.OPL_CODEX_STAGE_SANDBOX_PROVIDER;
    else process.env.OPL_CODEX_STAGE_SANDBOX_PROVIDER = previous.provider;
    if (previous.image === undefined) delete process.env.OPL_LOCAL_SANDBOX_IMAGE;
    else process.env.OPL_LOCAL_SANDBOX_IMAGE = previous.image;
    if (previous.workspaceRoot === undefined) delete process.env.OPL_LOCAL_SANDBOX_WORKSPACE_ROOT;
    else process.env.OPL_LOCAL_SANDBOX_WORKSPACE_ROOT = previous.workspaceRoot;
    fs.rmSync(remote.fixtureRoot, { recursive: true, force: true });
  }
});

test('Codex stage sandbox provider keeps explicit choices and external E2B auto-selection', () => {
  for (const provider of ['local_docker', 'local_devcontainer', 'e2b', 'host'] as const) {
    assert.equal(selectCodexStageSandboxProvider({ OPL_CODEX_STAGE_SANDBOX_PROVIDER: provider }), provider);
  }
  assert.equal(selectCodexStageSandboxProvider({
    OPL_FAMILY_RUNTIME_PROVIDER: 'external_sandbox',
    OPL_EXTERNAL_SANDBOX_SUBSTRATE: 'e2b',
  }), 'e2b');
});

test('local Docker sandbox fails closed without image while preserving selected provider', async () => {
  const result = await runCodexInLocalSandbox({
    attempt: {
      workspace_locator: {
        git_remote_url: 'https://github.com/example/domain.git',
        git_ref: 'abc123',
      },
    },
    args: ['exec', '--json', 'echo test'],
    env: {
      OPL_LOCAL_SANDBOX_WORKSPACE_ROOT: '/workspace/docker-stage',
    },
    providerKind: 'local_docker',
    timeoutMs: 10_000,
  });

  assert.equal(result.result.exitCode, 1);
  assert.equal(result.result.timeoutReason, 'provider_unavailable');
  assert.equal(result.summary.provider_kind, 'local_docker');
  assert.equal(result.summary.sandbox_workspace_root, '/workspace/docker-stage');
  assert.equal(result.summary.external_api_called, false);
  assert.equal(result.summary.host_workspace_mutated, false);
});

test('Codex stage runner fails closed when E2B is selected without workspace git transport', async () => {
  setE2bSandboxFactoryForTest({
    async create() {
      throw new Error('sandbox must not be created without workspace transport');
    },
    async connect() {
      throw new Error('sandbox must not be connected without workspace transport');
    },
  });
  const previous = {
    provider: process.env.OPL_CODEX_STAGE_SANDBOX_PROVIDER,
    substrate: process.env.OPL_EXTERNAL_SANDBOX_SUBSTRATE,
    endpoint: process.env.OPL_EXTERNAL_SANDBOX_ENDPOINT,
    credentialRef: process.env.OPL_EXTERNAL_SANDBOX_CREDENTIAL_REF,
    receiptRef: process.env.OPL_EXTERNAL_SANDBOX_PROVIDER_RECEIPT_REF,
  };
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-e2b-missing-transport-'));
  try {
    process.env.OPL_CODEX_STAGE_SANDBOX_PROVIDER = 'e2b';
    process.env.OPL_EXTERNAL_SANDBOX_SUBSTRATE = 'e2b';
    process.env.OPL_EXTERNAL_SANDBOX_ENDPOINT = 'https://api.e2b.test';
    process.env.OPL_EXTERNAL_SANDBOX_CREDENTIAL_REF = 'env:E2B_API_KEY';
    process.env.OPL_EXTERNAL_SANDBOX_PROVIDER_RECEIPT_REF = 'receipt:e2b-provider';

    await assert.rejects(
      () => runPublicCodexStageRunner({
        attempt: {
          stage_attempt_id: 'sat_e2b_missing_transport_test',
          stage_id: 'domain_owner/default-executor-dispatch',
          executor_kind: 'codex_cli',
          workspace_locator: {
            workspace_root: fixtureRoot,
          },
          checkpoint_refs: ['packet:e2b-missing-transport'],
        },
        stagePacketRef: 'packet:e2b-missing-transport',
        runnerMode: 'codex_cli',
        timeoutMs: 10_000,
      }),
      (error) => error instanceof FrameworkContractError
        && error.details?.blocked_reason === 'external_sandbox_workspace_transport_missing',
    );
  } finally {
    setE2bSandboxFactoryForTest(null);
    if (previous.provider === undefined) delete process.env.OPL_CODEX_STAGE_SANDBOX_PROVIDER;
    else process.env.OPL_CODEX_STAGE_SANDBOX_PROVIDER = previous.provider;
    if (previous.substrate === undefined) delete process.env.OPL_EXTERNAL_SANDBOX_SUBSTRATE;
    else process.env.OPL_EXTERNAL_SANDBOX_SUBSTRATE = previous.substrate;
    if (previous.endpoint === undefined) delete process.env.OPL_EXTERNAL_SANDBOX_ENDPOINT;
    else process.env.OPL_EXTERNAL_SANDBOX_ENDPOINT = previous.endpoint;
    if (previous.credentialRef === undefined) delete process.env.OPL_EXTERNAL_SANDBOX_CREDENTIAL_REF;
    else process.env.OPL_EXTERNAL_SANDBOX_CREDENTIAL_REF = previous.credentialRef;
    if (previous.receiptRef === undefined) delete process.env.OPL_EXTERNAL_SANDBOX_PROVIDER_RECEIPT_REF;
    else process.env.OPL_EXTERNAL_SANDBOX_PROVIDER_RECEIPT_REF = previous.receiptRef;
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('E2B Codex stage execution requires live credential material before provider API use', async () => {
  const remote = createGitModuleRemoteFixture('sandboxed-agent-workspace-no-key');
  const previous = {
    endpoint: process.env.OPL_EXTERNAL_SANDBOX_ENDPOINT,
    credentialRef: process.env.OPL_EXTERNAL_SANDBOX_CREDENTIAL_REF,
    receiptRef: process.env.OPL_EXTERNAL_SANDBOX_PROVIDER_RECEIPT_REF,
    substrate: process.env.OPL_EXTERNAL_SANDBOX_SUBSTRATE,
    apiKey: process.env.E2B_API_KEY,
  };
  try {
    process.env.OPL_EXTERNAL_SANDBOX_ENDPOINT = 'https://api.e2b.test';
    process.env.OPL_EXTERNAL_SANDBOX_CREDENTIAL_REF = 'env:E2B_API_KEY';
    process.env.OPL_EXTERNAL_SANDBOX_PROVIDER_RECEIPT_REF = 'receipt:e2b-provider';
    process.env.OPL_EXTERNAL_SANDBOX_SUBSTRATE = 'e2b';
    delete process.env.E2B_API_KEY;

    await assert.rejects(
      () => runCodexInE2bSandbox({
        attempt: {
          stage_attempt_id: 'sat_e2b_missing_key_test',
          workspace_locator: {
            git_remote_url: remote.remoteRoot,
          },
        },
        args: ['exec', '--json', 'noop'],
        timeoutMs: 10_000,
      }),
      (error) => error instanceof FrameworkContractError
        && error.details?.blocked_reason === 'external_sandbox_e2b_configuration_missing'
        && Array.isArray(error.details.missing_required_env)
        && error.details.missing_required_env.includes('E2B_API_KEY')
        && error.details.external_api_called === false,
    );
  } finally {
    if (previous.endpoint === undefined) delete process.env.OPL_EXTERNAL_SANDBOX_ENDPOINT;
    else process.env.OPL_EXTERNAL_SANDBOX_ENDPOINT = previous.endpoint;
    if (previous.credentialRef === undefined) delete process.env.OPL_EXTERNAL_SANDBOX_CREDENTIAL_REF;
    else process.env.OPL_EXTERNAL_SANDBOX_CREDENTIAL_REF = previous.credentialRef;
    if (previous.receiptRef === undefined) delete process.env.OPL_EXTERNAL_SANDBOX_PROVIDER_RECEIPT_REF;
    else process.env.OPL_EXTERNAL_SANDBOX_PROVIDER_RECEIPT_REF = previous.receiptRef;
    if (previous.substrate === undefined) delete process.env.OPL_EXTERNAL_SANDBOX_SUBSTRATE;
    else process.env.OPL_EXTERNAL_SANDBOX_SUBSTRATE = previous.substrate;
    if (previous.apiKey === undefined) delete process.env.E2B_API_KEY;
    else process.env.E2B_API_KEY = previous.apiKey;
    fs.rmSync(remote.fixtureRoot, { recursive: true, force: true });
  }
});

test('Codex stage runner omits structured output schema for gflab while preserving closeout capture', async () => {
  const { closeout, capturePath, fixtureRoot, codexPath } = createGflabNoSchemaFixture(
    'receipt:gflab-closeout-without-output-schema',
    'opl-codex-stage-runner-gflab-schema',
    'thread-gflab-no-output-schema',
  );
  const previousCodexBin = process.env.OPL_CODEX_BIN;
  try {
    process.env.OPL_CODEX_BIN = codexPath;
    const receipt = await runPublicCodexStageRunner({
      attempt: {
        stage_attempt_id: 'sat_gflab_no_output_schema_test',
        stage_id: 'domain_owner/default-executor-dispatch',
        executor_kind: 'codex_cli',
        stage_attempt_executor_policy: {
          executor_kind: 'codex_cli',
          model: 'gpt-5.5',
          provider: 'gflab',
          reasoning_effort: 'xhigh',
        },
        workspace_locator: {
          workspace_root: fixtureRoot,
        },
        checkpoint_refs: ['checkpoint:gflab-no-output-schema'],
      },
      stagePacketRef: 'packet:gflab-no-output-schema',
      runnerMode: 'codex_cli',
      timeoutMs: 10_000,
      env: {
        OPL_CODEX_STAGE_SANDBOX_PROVIDER: 'host',
      },
    });

    assert.deepEqual(receipt.closeout_packet?.closeout_refs, closeout.closeout_refs);
    assert.equal(receipt.process_output_summary?.captured_last_message_chars, JSON.stringify(closeout).length + 1);
    assert.deepEqual(receipt.process_output_summary?.structured_output_schema, {
      enabled: false,
      policy: 'provider_disabled_gflab_structured_output_request',
      provider: 'gflab',
      output_last_message_capture_enabled: true,
    });
    assertNoOutputSchema(capturePath);
  } finally {
    if (previousCodexBin === undefined) {
      delete process.env.OPL_CODEX_BIN;
    } else {
      process.env.OPL_CODEX_BIN = previousCodexBin;
    }
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(capturePath, { force: true });
  }
});

test('Codex stage runner omits structured output schema for default gflab provider', async () => {
  const { closeout, capturePath, fixtureRoot, codexPath } = createGflabNoSchemaFixture(
    'receipt:gflab-default-closeout-without-output-schema',
    'opl-codex-stage-runner-gflab-default',
    'thread-gflab-default-no-output-schema',
  );
  const previousCodexBin = process.env.OPL_CODEX_BIN;
  const previousCodexHome = process.env.CODEX_HOME;
  const codexHome = path.join(fixtureRoot, 'codex-home');
  fs.mkdirSync(codexHome, { recursive: true });
  fs.writeFileSync(path.join(codexHome, 'config.toml'), [
    'model_provider = "gflab"',
    'model = "gpt-5.5"',
    '',
    '[model_providers.gflab]',
    'name = "gflab"',
    'base_url = "http://127.0.0.1:8787/v1"',
    '',
  ].join('\n'), 'utf8');
  try {
    process.env.OPL_CODEX_BIN = codexPath;
    process.env.CODEX_HOME = codexHome;
    const receipt = await runPublicCodexStageRunner({
      attempt: {
        stage_attempt_id: 'sat_gflab_default_no_output_schema_test',
        stage_id: 'domain_owner/default-executor-dispatch',
        executor_kind: 'codex_cli',
        workspace_locator: {
          workspace_root: fixtureRoot,
        },
        checkpoint_refs: ['checkpoint:gflab-default-no-output-schema'],
      },
      stagePacketRef: 'packet:gflab-default-no-output-schema',
      runnerMode: 'codex_cli',
      timeoutMs: 10_000,
      env: {
        OPL_CODEX_STAGE_SANDBOX_PROVIDER: 'host',
      },
    });

    assert.deepEqual(receipt.closeout_packet?.closeout_refs, closeout.closeout_refs);
    assert.deepEqual(receipt.process_output_summary?.structured_output_schema, {
      enabled: false,
      policy: 'provider_disabled_gflab_structured_output_request',
      provider: 'gflab',
      output_last_message_capture_enabled: true,
    });
    assertNoOutputSchema(capturePath);
  } finally {
    if (previousCodexBin === undefined) {
      delete process.env.OPL_CODEX_BIN;
    } else {
      process.env.OPL_CODEX_BIN = previousCodexBin;
    }
    previousCodexHome === undefined
      ? delete process.env.CODEX_HOME
      : process.env.CODEX_HOME = previousCodexHome;
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(capturePath, { force: true });
  }
});

test('Codex closeout enforcement also omits structured output schema for gflab', async () => {
  const { closeout, capturePath, fixtureRoot, codexPath } = createGflabNoSchemaFixture(
    'receipt:gflab-enforcement-without-output-schema',
    'opl-codex-stage-runner-gflab-enforcement',
    'thread-gflab-enforcement-closeout',
    true,
  );
  const previousCodexBin = process.env.OPL_CODEX_BIN;
  const previousRecoveryTimeout = process.env.OPL_CODEX_SESSION_RECOVERY_TIMEOUT_MS;
  try {
    process.env.OPL_CODEX_BIN = codexPath;
    process.env.OPL_CODEX_SESSION_RECOVERY_TIMEOUT_MS = '1';
    const receipt = await runPublicCodexStageRunner({
      attempt: {
        stage_attempt_id: 'sat_gflab_enforcement_no_output_schema_test',
        stage_id: 'domain_owner/default-executor-dispatch',
        executor_kind: 'codex_cli',
        stage_attempt_executor_policy: {
          executor_kind: 'codex_cli',
          model: 'gpt-5.5',
          provider: 'gflab',
          reasoning_effort: 'xhigh',
        },
        workspace_locator: {
          workspace_root: fixtureRoot,
        },
        checkpoint_refs: ['checkpoint:gflab-enforcement-no-output-schema'],
      },
      stagePacketRef: 'packet:gflab-enforcement-no-output-schema',
      runnerMode: 'codex_cli',
      timeoutMs: 10_000,
      env: {
        OPL_CODEX_STAGE_SANDBOX_PROVIDER: 'host',
      },
    });

    assert.deepEqual(receipt.closeout_packet?.closeout_refs, closeout.closeout_refs);
    assert.equal(receipt.process_output_summary?.closeout_enforcement?.status, 'closeout_found');
    assert.equal(
      receipt.process_output_summary?.closeout_enforcement?.captured_last_message_chars,
      JSON.stringify(closeout).length + 1,
    );
    assertNoOutputSchema(capturePath);
  } finally {
    if (previousCodexBin === undefined) {
      delete process.env.OPL_CODEX_BIN;
    } else {
      process.env.OPL_CODEX_BIN = previousCodexBin;
    }
    previousRecoveryTimeout === undefined
      ? delete process.env.OPL_CODEX_SESSION_RECOVERY_TIMEOUT_MS
      : process.env.OPL_CODEX_SESSION_RECOVERY_TIMEOUT_MS = previousRecoveryTimeout;
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(capturePath, { force: true });
  }
});

test('Codex stage runner injects provider-hosted stage attempt identity into live Codex env', async () => {
  const expectedStagePacketRef = 'studies/003/artifacts/supervision/consumer/default_executor_dispatches/immutable/return_to_ai_reviewer_workflow/dispatch.json';
  const expectedWorkspaceRoot = '/tmp/should-be-overwritten-by-attempt';
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  closeout=$(node -e 'const keys = ["OPL_STAGE_ATTEMPT_ID","OPL_STAGE_ID","OPL_STAGE_PACKET_REF","OPL_WORKSPACE_ROOT","OPL_TASK_ID","OPL_WORKFLOW_ID","OPL_STUDY_ID","OPL_QUEST_ID","OPL_ACTION_TYPE","OPL_WORK_UNIT_ID","OPL_PROVIDER_ATTEMPT_REF","OPL_ATTEMPT_LEASE_REF","OPL_ATTEMPT_LEASE_STATUS","OPL_EXECUTION_AUTHORIZATION_DECISION_REF"]; const refs = keys.map((key) => key + "=" + (process.env[key] || "")); process.stdout.write(JSON.stringify({surface_kind:"stage_attempt_closeout_packet", closeout_refs: refs, next_owner:"med-autoscience", domain_ready_verdict:"domain_gate_pending"}));')
  printf '{"type":"thread.started","thread_id":"thread-stage-env"}\\n'
  printf '%s\\n' "$(node -e 'const text = process.argv[1]; process.stdout.write(JSON.stringify({type:"item.completed",item:{type:"agent_message",id:"msg-env",text}}));' "$closeout")"
  printf '{"type":"turn.completed"}\\n'
  exit 0
fi
echo "unexpected fake codex args: $*" >&2
exit 64
`);
  const previousCodexBin = process.env.OPL_CODEX_BIN;
  try {
    process.env.OPL_CODEX_BIN = codexPath;
    const receipt = await runPublicCodexStageRunner({
      attempt: {
        stage_attempt_id: 'sat_provider_identity_test',
        workflow_id: 'wf_provider_identity_test',
        task_id: 'frt_provider_identity_test',
        stage_id: 'domain_owner/default-executor-dispatch',
        workspace_locator: {
          workspace_root: fixtureRoot,
          study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
          quest_id: '003-dpcc-primary-care-phenotype-treatment-gap',
          action_type: 'return_to_ai_reviewer_workflow',
          source_refs: [
            {
              role: 'owner_route_work_unit_fingerprint',
              ref: 'truth-snapshot::12538a8351d7513191c2e514',
            },
          ],
        },
        checkpoint_refs: [expectedStagePacketRef],
      },
      stagePacketRef: expectedStagePacketRef,
      runnerMode: 'codex_cli',
      timeoutMs: 10_000,
      env: {
        OPL_CODEX_STAGE_SANDBOX_PROVIDER: 'host',
        OPL_WORKSPACE_ROOT: expectedWorkspaceRoot,
      },
    });

    assertRefsInclude(receipt.closeout_packet?.closeout_refs, [
      'OPL_STAGE_ATTEMPT_ID=sat_provider_identity_test',
      `OPL_STAGE_PACKET_REF=${expectedStagePacketRef}`,
      `OPL_WORKSPACE_ROOT=${fixtureRoot}`,
      'OPL_TASK_ID=frt_provider_identity_test',
      'OPL_STUDY_ID=003-dpcc-primary-care-phenotype-treatment-gap',
      'OPL_WORK_UNIT_ID=truth-snapshot::12538a8351d7513191c2e514',
      'OPL_PROVIDER_ATTEMPT_REF=',
      'OPL_ATTEMPT_LEASE_REF=',
      'OPL_EXECUTION_AUTHORIZATION_DECISION_REF=',
    ]);
  } finally {
    if (previousCodexBin === undefined) {
      delete process.env.OPL_CODEX_BIN;
    } else {
      process.env.OPL_CODEX_BIN = previousCodexBin;
    }
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('Codex stage runner blocks dirty MAS checkout before launching Codex', async () => {
  const masFixture = createGitModuleRemoteFixture('med-autoscience');
  const checkoutRoot = path.join(masFixture.fixtureRoot, 'dirty-runner-checkout');
  const clone = spawnSync('git', ['clone', masFixture.remoteRoot, checkoutRoot], {
    cwd: path.dirname(checkoutRoot),
    encoding: 'utf8',
  });
  assert.equal(clone.status, 0, clone.stderr);
  fs.writeFileSync(path.join(checkoutRoot, 'dirty-uncommitted.txt'), 'dirty\n', 'utf8');
  try {
    await assert.rejects(
      () => runAgentStageRunner({
        attempt: {
          stage_attempt_id: 'sat_dirty_runner_checkout',
          workflow_id: 'wf_dirty_runner_checkout',
          task_id: 'frt_dirty_runner_checkout',
          domain_id: 'medautoscience',
          stage_id: 'domain_owner/default-executor-dispatch',
          executor_kind: 'codex_cli',
          workspace_locator: {
            workspace_root: checkoutRoot,
          },
          checkpoint_refs: ['packet:dirty-runner-checkout'],
        },
        stagePacketRef: 'packet:dirty-runner-checkout',
        runnerMode: 'codex_cli',
        timeoutMs: 10_000,
      }),
      (error: unknown) => {
        assert.ok(error instanceof FrameworkContractError);
        assert.equal(error.details?.blocked_reason, 'dirty_checkout');
        assert.equal(
          (error.details?.checkout_currentness_preflight as Record<string, unknown>)?.currentness_status,
          'dirty_fail_closed',
        );
        return true;
      },
    );
  } finally {
    fs.rmSync(masFixture.fixtureRoot, { recursive: true, force: true });
  }
});

test('Codex stage runner forwards explicit provider authorization and closeout binding refs without deriving active lease from identity', async () => {
  const expectedStagePacketRef = 'studies/003/artifacts/supervision/consumer/default_executor_dispatches/immutable/return_to_ai_reviewer_workflow/dispatch.json';
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  closeout=$(node -e 'const keys = ["OPL_STAGE_ATTEMPT_ID","OPL_PROVIDER_ATTEMPT_REF","OPL_ATTEMPT_LEASE_REF","OPL_ATTEMPT_LEASE_STATUS","OPL_EXECUTION_AUTHORIZATION_DECISION_REF","OPL_SOURCE_FINGERPRINT","OPL_IDEMPOTENCY_KEY","OPL_STAGE_RUN_ID","OPL_STAGE_MANIFEST_REF","OPL_CURRENT_POINTER_REF","OPL_CLOSEOUT_BINDING_JSON"]; const refs = keys.map((key) => key + "=" + (process.env[key] || "")); process.stdout.write(JSON.stringify({surface_kind:"stage_attempt_closeout_packet", closeout_refs: refs, next_owner:"med-autoscience", domain_ready_verdict:"domain_gate_pending"}));')
  printf '{"type":"thread.started","thread_id":"thread-stage-auth-env"}\\n'
  printf '%s\\n' "$(node -e 'const text = process.argv[1]; process.stdout.write(JSON.stringify({type:"item.completed",item:{type:"agent_message",id:"msg-auth-env",text}}));' "$closeout")"
  printf '{"type":"turn.completed"}\\n'
  exit 0
fi
echo "unexpected fake codex args: $*" >&2
exit 64
`);
  const previousCodexBin = process.env.OPL_CODEX_BIN;
  try {
    process.env.OPL_CODEX_BIN = codexPath;
    const receipt = await runPublicCodexStageRunner({
      attempt: {
        stage_attempt_id: 'sat_provider_authorized_test',
        workflow_id: 'wf_provider_authorized_test',
        task_id: 'frt_provider_authorized_test',
        stage_id: 'domain_owner/default-executor-dispatch',
        workspace_locator: {
          workspace_root: fixtureRoot,
        },
        opl_execution_authorization: {
          provider_attempt_ref: 'opl://stage-attempts/sat_provider_authorized_test',
          attempt_lease_ref: 'opl://stage-attempts/sat_provider_authorized_test/leases/frt_provider_authorized_test/active',
          attempt_lease_status: 'active',
          execution_authorization_decision_ref: 'opl://stage-attempts/sat_provider_authorized_test/execution-authorizations/frt_provider_authorized_test/wf_provider_authorized_test',
          source_fingerprint: 'mas_default_executor_source_provider_authorized_test',
          idempotency_key: 'idem_provider_authorized_test',
          stage_run_id: 'app-stage-run:medautoscience:domain-owner-default-executor-dispatch',
          stage_manifest_ref: 'opl://stage-manifests/domain_owner%2Fdefault-executor-dispatch',
          current_pointer_ref:
            'opl://stage-runs/app-stage-run%3Amedautoscience%3Adomain-owner-default-executor-dispatch/current',
        },
        checkpoint_refs: [expectedStagePacketRef],
      },
      stagePacketRef: expectedStagePacketRef,
      runnerMode: 'codex_cli',
      timeoutMs: 10_000,
      env: {
        OPL_CODEX_STAGE_SANDBOX_PROVIDER: 'host',
      },
    });

    const refs = envRefs(receipt.closeout_packet?.closeout_refs);
    assert.equal(refs.get('OPL_STAGE_ATTEMPT_ID'), 'sat_provider_authorized_test');
    assert.equal(refs.get('OPL_PROVIDER_ATTEMPT_REF'), 'opl://stage-attempts/sat_provider_authorized_test');
    assert.equal(
      refs.get('OPL_ATTEMPT_LEASE_REF'),
      'opl://stage-attempts/sat_provider_authorized_test/leases/frt_provider_authorized_test/active',
    );
    assert.equal(refs.get('OPL_ATTEMPT_LEASE_STATUS'), 'active');
    assert.equal(refs.get('OPL_EXECUTION_AUTHORIZATION_DECISION_REF')?.includes('/execution-authorizations/'), true);
    assert.equal(refs.get('OPL_STAGE_MANIFEST_REF'), 'opl://stage-manifests/domain_owner%2Fdefault-executor-dispatch');
    const binding = JSON.parse(refs.get('OPL_CLOSEOUT_BINDING_JSON') ?? '{}') as Record<string, unknown>;
    assert.equal(binding.trusted_opl_execution_authorization, true);
    assert.equal(binding.bound_to_stage_run, true);
    assert.equal(binding.bound_to_stage_manifest, true);
    assert.equal(binding.bound_to_current_pointer, true);
    assert.equal(binding.bound_to_source_fingerprint, true);
    assert.equal(binding.source_fingerprint, 'mas_default_executor_source_provider_authorized_test');
    assert.equal(binding.idempotency_key, 'idem_provider_authorized_test');
  } finally {
    if (previousCodexBin === undefined) {
      delete process.env.OPL_CODEX_BIN;
    } else {
      process.env.OPL_CODEX_BIN = previousCodexBin;
    }
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

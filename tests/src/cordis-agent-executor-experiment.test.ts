import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Context } from '@deepseek-ai/cordis';

import { createFakeCodexFixture } from './cli/helpers.ts';
import {
  cordisAgentExecutorObserverPlugin,
  cordisAgentExecutorServicePlugin,
  CORDIS_FIBER_STATE,
  createCordisAgentExecutorRequest,
  type CordisAgentExecutorAdapter,
} from '../../src/host/plugins/cordis-agent-executor-experiment.ts';
import {
  runAgentExecutor,
  type AgentExecutionRequest,
} from '../../src/adapters/execution/agent-executor.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function fixtureAdapter(id: string): CordisAgentExecutorAdapter {
  return {
    id,
    execute: runAgentExecutor,
  };
}

test('Cordis remains exact in the production dependency graph without optional loader plugins', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const packageLock = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package-lock.json'), 'utf8'));
  const lockedCordis = packageLock.packages['node_modules/@deepseek-ai/cordis'];

  assert.equal(packageJson.dependencies?.['@deepseek-ai/cordis'], '4.0.5');
  assert.equal(packageJson.devDependencies?.['@deepseek-ai/cordis'], undefined);
  assert.equal(lockedCordis.version, '4.0.5');
  assert.equal(lockedCordis.dev, undefined);
  assert.match(lockedCordis.integrity, /^sha512-/);
  assert.equal(packageLock.packages['node_modules/@deepseek-ai/cordis-plugin-loader'], undefined);
  assert.equal(packageLock.packages['node_modules/@deepseek-ai/cordis-plugin-include'], undefined);
});

test('Cordis executor composition runs the existing request/receipt seam and typed lifecycle events', async () => {
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  printf '{"type":"thread.started","thread_id":"thread-cordis-experiment"}\\n'
  printf '{"item":{"type":"agent_message","text":"Cordis experiment done"}}\\n'
  exit 0
fi
exit 64
`);
  const requests: AgentExecutionRequest[] = [];
  const results: string[] = [];
  const previousCodexBin = process.env.OPL_CODEX_BIN;
  process.env.OPL_CODEX_BIN = codexPath;
  let composition: Awaited<ReturnType<typeof createCordisAgentExecutorRequest>> | undefined;
  try {
    composition = await createCordisAgentExecutorRequest({
      adapter: fixtureAdapter('fixture-codex'),
    });
    const observerFiber = await composition.ctx.plugin(cordisAgentExecutorObserverPlugin, {
      onRequest: (request) => requests.push(request),
      onResult: async (receipt) => {
        await Promise.resolve();
        results.push(receipt.session_id ?? 'missing');
      },
    });
    const receipt = await composition.executor.execute({
      executor_kind: 'codex_cli',
      prompt: 'Run the isolated Cordis executor fixture.',
      cwd: repoRoot,
    });

    assert.equal(receipt.surface_kind, 'opl_agent_execution_receipt');
    assert.equal(receipt.session_id, 'thread-cordis-experiment');
    assert.equal(requests.length, 1);
    assert.equal(results.length, 1);
    assert.equal(composition.snapshot.framework.package, '@deepseek-ai/cordis');
    assert.equal(composition.snapshot.framework.version, '4.0.5');
    assert.equal(composition.snapshot.binding.executor_adapter_id, 'fixture-codex');
    assert.equal(Object.isFrozen(composition.snapshot), true);
    assert.equal(Object.isFrozen(composition.snapshot.plugins), true);
    assert.equal(composition.snapshot.plugins.find((plugin) => plugin.id.endsWith('observer'))?.required, false);

    await observerFiber.dispose();
    await composition.executor.execute({
      executor_kind: 'codex_cli',
      prompt: 'Run after observer teardown.',
      cwd: repoRoot,
    });
    assert.equal(requests.length, 1);
    assert.equal(results.length, 1);
  } finally {
    await composition?.dispose();
    if (previousCodexBin === undefined) {
      delete process.env.OPL_CODEX_BIN;
    } else {
      process.env.OPL_CODEX_BIN = previousCodexBin;
    }
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('Cordis required inject keeps the executor service pending when its adapter is absent', async () => {
  const ctx = new Context();
  const pendingFiber = ctx.plugin(cordisAgentExecutorServicePlugin);
  assert.equal(pendingFiber.state, CORDIS_FIBER_STATE.PENDING);
  assert.equal(ctx.get('opl.runway.executor'), undefined);
  await pendingFiber.dispose();
  await ctx.fiber.dispose();
});

test('Cordis compositions isolate service and event state, while optional observers remain opt-in', async () => {
  const adapter = (id: string): CordisAgentExecutorAdapter => ({
    id,
    execute: () => ({
      surface_kind: 'opl_agent_execution_receipt',
      executor_kind: 'codex_cli',
      mode: 'experiment',
      cwd: null,
      prompt_preview: id,
      session_id: id,
      event_summary: [],
      stdout_preview: '',
      stderr_preview: '',
      exit_code: 0,
      closeout_packet: null,
      executor_envelope: {},
      capabilities: [],
      requested_capabilities: [],
      activated_capabilities: [],
      non_equivalence_notice: 'codex_cli_first_class_default',
      proof: null,
    }),
  });
  const first = await createCordisAgentExecutorRequest({ adapter: adapter('first') });
  const second = await createCordisAgentExecutorRequest({ adapter: adapter('second') });
  try {
    assert.notEqual(first.ctx, second.ctx);
    assert.notEqual(first.executor, second.executor);
    assert.equal(first.snapshot.binding.executor_adapter_id, 'first');
    assert.equal(second.snapshot.binding.executor_adapter_id, 'second');
    assert.equal((await first.executor.execute({ prompt: 'first' })).session_id, 'first');
    assert.equal((await second.executor.execute({ prompt: 'second' })).session_id, 'second');
  } finally {
    await first.dispose();
    await second.dispose();
  }
  assert.equal(first.ctx.get('opl.runway.executor'), undefined);
  assert.equal(second.ctx.get('opl.runway.executor'), undefined);
});

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { Context } from '@deepseek-ai/cordis';

import { parseJsonText } from '../../src/kernel/json-file.ts';
import { validateJsonSchemaPayload } from '../../src/kernel/schema-registry.ts';
import {
  buildCordisCompositionInspect,
  CORDIS_AGENT_EXECUTOR_INSPECT_METADATA,
} from '../../src/host/plugins/cordis-composition-inspect.ts';
import {
  buildCordisAgentExecutorCompositionSnapshot,
  cordisAgentExecutorServicePlugin,
} from '../../src/host/plugins/cordis-agent-executor-experiment.ts';
import {
  contractsDir,
  repoRoot,
  runCli,
  runCliReadOnlyInCwd,
} from './cli/helpers.ts';
import { createCordisBaseHeadlessComposition } from '../../src/host/composition-profiles.ts';

function readJson(relativePath: string): Record<string, unknown> {
  return parseJsonText(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as Record<string, unknown>;
}

test('Cordis composition inspect schema and CLI output are deterministic and read-only', async () => {
  const help = runCli(['help', 'cordis', 'inspect']).help;
  assert.equal(help.registry.command_id, 'cordis inspect');
  assert.equal(help.registry.authority_boundary.surface, 'cordis_composition_inspect_readback');
  assert.equal(
    help.registry.json_output_schema_ref,
    'contracts/opl-framework/cli-command-registry.json#/commands/cordis_inspect/output_schema',
  );

  const first = runCli(['cordis', 'inspect']);
  const second = runCli(['cordis', 'inspect']);
  assert.deepEqual(first, second);

  const launcher = spawnSync(path.join(repoRoot, 'bin', 'opl'), ['cordis', 'inspect', '--json'], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
  });
  assert.equal(launcher.status, 0, launcher.stderr);
  assert.deepEqual(parseJsonText(launcher.stdout), first);

  const schema = readJson('contracts/opl-framework/cordis-composition-inspect.schema.json');
  const validation = validateJsonSchemaPayload({
    schemaId: 'opl.cordis_composition_inspect.v1',
    schema,
    sourceRef: 'contracts/opl-framework/cordis-composition-inspect.schema.json',
  }, first);
  assert.equal(validation.ok, true, validation.ok ? '' : JSON.stringify(validation.errors));

  assert.equal(first.surface_kind, 'opl_cordis_composition_inspect');
  assert.equal(first.authority_boundary.installed_truth, false);
  assert.equal(first.authority_boundary.domain_truth, false);
  assert.equal(first.authority_boundary.readiness_truth, false);
  assert.equal(first.side_effects.external_writes, false);
  assert.equal(first.observation.scope, 'active_default_profile');
  assert.equal(first.observation.teardown_status, 'disposed_after_observation');
  assert.equal(first.composition.default_caller_activated, true);
  assert.equal(first.composition.binding.executor_route, 'opl.profile.base-headless');
  const childRefs = first.composition.binding.child_composition_snapshot_refs as Record<string, {
    snapshot_id: string;
    snapshot_digest: string;
  }>;
  assert.deepEqual(Object.keys(childRefs), [
    'agent_executor_request',
    'pack_stagecraft_route',
    'release_operation',
    'runway_attempt',
  ]);
  for (const childRef of Object.values(childRefs)) {
    assert.match(childRef.snapshot_id, /^cordis:snapshot:sha256:[a-f0-9]{64}$/);
    assert.match(childRef.snapshot_digest, /^sha256:[a-f0-9]{64}$/);
  }

  const pluginIds = first.plugins.map((plugin: { id: string }) => plugin.id);
  assert.deepEqual(pluginIds, [...pluginIds].sort((left, right) => left.localeCompare(right)));
  const charter = first.plugins.find((plugin: { id: string }) => plugin.id === 'opl-charter-policy');
  assert.equal(charter.state, 'active');
  assert.equal(charter.version, '1.0.0');
  assert.deepEqual(charter.provides, ['opl.charter.contracts']);
  assert.equal(first.diagnostics.some((entry: { code: string }) => entry.code === 'required_plugin_not_loaded'), false);

  const emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-cordis-inspect-read-only-'));
  try {
    const before = fs.readdirSync(emptyRoot);
    await runCliReadOnlyInCwd(
      ['--contracts-dir', contractsDir, 'cordis', 'inspect'],
      emptyRoot,
    );
    assert.deepEqual(fs.readdirSync(emptyRoot), before);
  } finally {
    fs.rmSync(emptyRoot, { recursive: true, force: true });
  }
});

test('Cordis composition inspect safely degrades for an unknown plugin', async () => {
  const context = new Context();
  const unknownPlugin = {
    name: 'unknown-third-party-plugin',
    apply(ctx: Context) {
      ctx.provide('fixture.unknown-service', { ready: true });
    },
  };
  const fiber = await context.plugin(unknownPlugin);
  try {
    const inspect = buildCordisCompositionInspect({
      context,
      snapshot: {
        version: 'fixture.snapshot.v1',
        framework: { package: '@deepseek-ai/cordis', version: '4.0.1' },
        binding: {},
        plugins: [],
      },
    });
    const plugin = inspect.plugins.find((entry) => entry.id === 'unknown-third-party-plugin');
    assert.ok(plugin);
    assert.equal(plugin.metadata_status, 'unknown');
    assert.equal(plugin.source_ref, null);
    assert.equal(plugin.state, 'active');
    assert.deepEqual(plugin.provides, ['fixture.unknown-service']);
    assert.equal(inspect.diagnostics[0]?.code, 'unknown_plugin_metadata');
  } finally {
    await fiber.dispose();
    await context.fiber.dispose();
  }
});

test('Cordis composition inspect reports missing required providers without writing state', async () => {
  const context = new Context();
  const pendingFiber = context.plugin(cordisAgentExecutorServicePlugin);
  try {
    const inspect = buildCordisCompositionInspect({
      context,
      snapshot: buildCordisAgentExecutorCompositionSnapshot('fixture-adapter'),
      metadata: CORDIS_AGENT_EXECUTOR_INSPECT_METADATA,
    });
    const service = inspect.plugins.find((entry) => entry.id === 'opl-cordis-agent-executor-service');
    assert.equal(service?.state, 'pending');
    assert.equal(service?.disposer_status, 'registered_at_observation');
    assert.equal(inspect.diagnostics.some((entry) => entry.code === 'required_plugin_not_loaded'), true);
    assert.equal(inspect.side_effects.persistent_writes, false);
  } finally {
    await pendingFiber.dispose();
    await context.fiber.dispose();
  }
});

test('base-headless profile owns child composition factories and explicit runway services', async () => {
  const composition = await createCordisBaseHeadlessComposition();
  try {
    assert.equal(typeof composition.services.familyRuntime, 'function');
    assert.equal(typeof composition.services.childFactories.createAgentExecutorRequest, 'function');
    assert.equal(typeof composition.services.childFactories.createRunwayAttemptComposition, 'function');
    assert.equal(typeof composition.services.childFactories.createStageRouteComposition, 'function');
    assert.equal(typeof composition.services.childFactories.createReleaseOperationComposition, 'function');
    const child = await composition.services.childFactories.createAgentExecutorRequest({
      adapter: {
        id: 'profile-child-fixture',
        execute: () => ({}) as never,
      },
    });
    try {
      assert.equal(child.snapshot.binding.executor_adapter_id, 'profile-child-fixture');
      assert.equal(typeof child.executor.execute, 'function');
    } finally {
      await child.dispose();
    }
  } finally {
    await composition.dispose();
  }
});

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

import { canonicalJsonBytes } from '../../src/kernel/canonical-json.ts';
import type {
  FoundryProviderManifest,
  FoundryActivityIdentity,
} from '../../src/modules/foundry/index.ts';
import {
  FileFoundryProviderArtifactReader,
  OplFoundryProviderStageRunGateway,
  StageRunFoundryProviderInvoker,
  type FoundryProviderStageRunGateway,
} from '../../src/modules/runway/foundry-provider-stage-run.ts';

const provider: FoundryProviderManifest = {
  surface_kind: 'opl_foundry_provider',
  version: 'opl-foundry-provider.v1',
  provider_id: 'oma',
  agent_id: 'oma',
  package_id: 'oma',
  domain_id: 'agent_engineering',
  carrier_slug: 'opl-meta-agent',
  operations: {
    design: {
      input_schema_refs: ['opl://foundry-protocol/DesignRequest'],
      output_schema_ref: 'opl://foundry-protocol/AgentBlueprint',
      entry_stage_ref: 'mission-intake',
      required_stage_refs: ['mission-intake', 'evaluation-design'],
      optional_stage_refs: [],
      terminal_stage_ref: 'evaluation-design',
    },
    diagnose: {
      input_schema_refs: [
        'opl://foundry-protocol/DesignRequest',
        'opl://foundry-protocol/AgentBlueprint',
        'opl://foundry-protocol/EvidenceBundle',
      ],
      output_schema_ref: 'opl://foundry-protocol/EvolutionProposal',
      entry_stage_ref: 'evidence-diagnosis',
      required_stage_refs: ['evidence-diagnosis', 'evolution-proposal'],
      optional_stage_refs: [],
      terminal_stage_ref: 'evolution-proposal',
    },
  },
  projection_policy: {
    public_action_ids: ['engineer-fixture'],
    internal_operations_are_public_actions: false,
    internal_operations_are_cli_commands: false,
    internal_operations_are_mcp_tools: false,
  },
  authority_boundary: {},
};

const activity: FoundryActivityIdentity = {
  run_id: 'run:provider-stage-test',
  iteration: 0,
  phase: 'design',
  input_digest: `sha256:${'1'.repeat(64)}`,
};

test('StageRun gateway uses the provider-declared public action instead of an OMA-specific constant', async () => {
  let args: string[] = [];
  const gateway = new OplFoundryProviderStageRunGateway((async (input: string[]) => {
    args = input;
    return {
      family_runtime_stage_run: {
        stage_run_input: { workflow_id: 'workflow:provider-action' },
      },
    };
  }) as never);
  await gateway.launch({
    provider,
    checkout_root: '/managed/provider',
    workspace_root: '/managed/workspace',
    stage_id: 'mission-intake',
    stage_run_invocation_id: 'sri:provider-action',
    activity,
    input_artifact_refs: ['opl://foundry/input'],
    input_artifact_hashes: [`sha256:${'2'.repeat(64)}`],
  });
  assert.equal(args[args.indexOf('--action') + 1], 'engineer-fixture');
});

function state(input: {
  stage: string;
  status?: string;
  next?: string | null;
  refs?: string[];
  hashes?: string[];
}) {
  return {
    surface_kind: 'temporal_stage_run_query',
    provider_kind: 'temporal',
    stage_run_id: `stage-run:${input.stage}`,
    workflow_id: `workflow:${input.stage}`,
    stage_id: input.stage,
    status: input.status ?? 'completed',
    artifact_refs: input.refs ?? [],
    artifact_hashes: input.hashes ?? [],
    next_stage_run_launch: input.next
      ? { target_workflow_id: input.next }
      : null,
    blocked_reason: null,
  };
}

test('StageRun provider invocation follows declared Stages and returns one exact terminal protocol artifact', async () => {
  const output = canonicalJsonBytes({
    surface_kind: 'opl_foundry_agent_blueprint',
    marker: 'exact-terminal-output',
  });
  const launches: Array<Parameters<FoundryProviderStageRunGateway['launch']>[0]> = [];
  const gateway: FoundryProviderStageRunGateway = {
    async launch(input) {
      launches.push(input);
      return { workflow_id: 'workflow:mission-intake' };
    },
    async query(workflowId) {
      return workflowId === 'workflow:mission-intake'
        ? state({ stage: 'mission-intake', next: 'workflow:evaluation-design' })
        : state({
            stage: 'evaluation-design',
            refs: ['memory://terminal-output'],
            hashes: [`${'a'.repeat(64)}`],
          });
    },
  };
  const invoker = new StageRunFoundryProviderInvoker({
    gateway,
    storage_root: fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-provider-invoker-')),
    poll_interval_ms: 1,
    timeout_ms: 100,
    artifact_reader: { readExact: () => output },
  });

  const result = await invoker.invoke({
    operation: 'design',
    provider,
    checkout_root: '/managed/oma',
    payload: { request: { marker: 'request' } as never },
    activity,
  });

  assert.equal((result as Record<string, unknown>).marker, 'exact-terminal-output');
  assert.equal(launches.length, 1);
  assert.deepEqual(launches[0]?.activity, activity);
  assert.equal(launches[0]?.stage_id, 'mission-intake');
  assert.equal(launches[0]?.input_artifact_refs.length, 1);
  assert.equal(launches[0]?.input_artifact_hashes.length, 1);
});

test('StageRun provider invocation fails closed when a required semantic Stage is skipped', async () => {
  const gateway: FoundryProviderStageRunGateway = {
    async launch() {
      return { workflow_id: 'workflow:evaluation-design' };
    },
    async query() {
      return state({
        stage: 'evaluation-design',
        refs: ['memory://terminal-output'],
        hashes: [`${'b'.repeat(64)}`],
      });
    },
  };
  const invoker = new StageRunFoundryProviderInvoker({
    gateway,
    storage_root: fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-provider-skip-')),
    artifact_reader: {
      readExact: () => canonicalJsonBytes({ surface_kind: 'opl_foundry_agent_blueprint' }),
    },
  });

  await assert.rejects(invoker.invoke({
    operation: 'design',
    provider,
    checkout_root: '/managed/oma',
    payload: { request: { marker: 'request' } as never },
    activity,
  }), /skipped required semantic Stages/);
});

test('Foundry provider artifact reader rejects symlinks and hash mismatches', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-provider-artifact-'));
  const file = path.join(root, 'output.json');
  fs.writeFileSync(file, '{}\n', 'utf8');
  const link = path.join(root, 'output-link.json');
  fs.symlinkSync(file, link);
  const reader = new FileFoundryProviderArtifactReader({ allowed_root: root });

  assert.throws(() => reader.readExact({
    ref: pathToFileURL(file).href,
    sha256: `${'0'.repeat(64)}`,
  }), /do not match/);
  assert.throws(() => reader.readExact({
    ref: pathToFileURL(link).href,
    sha256: `${'0'.repeat(64)}`,
  }), /outside the allowed immutable transport boundary/);
});

test('default provider transport cannot read artifacts outside the Foundry storage root', async (t) => {
  const container = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-provider-root-'));
  t.after(() => fs.rmSync(container, { recursive: true, force: true }));
  const storageRoot = path.join(container, 'foundry');
  fs.mkdirSync(storageRoot);
  const outside = path.join(container, 'outside.json');
  const bytes = canonicalJsonBytes({ surface_kind: 'opl_foundry_agent_blueprint' });
  fs.writeFileSync(outside, bytes);
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');
  const gateway: FoundryProviderStageRunGateway = {
    async launch() {
      return { workflow_id: 'workflow:mission-intake' };
    },
    async query(workflowId) {
      return workflowId === 'workflow:mission-intake'
        ? state({ stage: 'mission-intake', next: 'workflow:evaluation-design' })
        : state({
            stage: 'evaluation-design',
            refs: [pathToFileURL(outside).href],
            hashes: [hash],
          });
    },
  };
  const invoker = new StageRunFoundryProviderInvoker({ gateway, storage_root: storageRoot });
  await assert.rejects(invoker.invoke({
    operation: 'design',
    provider,
    checkout_root: '/managed/provider',
    payload: { request: { marker: 'request' } as never },
    activity,
  }), /outside the allowed immutable transport boundary/);
});

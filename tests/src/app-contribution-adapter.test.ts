import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { runDeclarativeAppContribution } from '../../src/read-models/operator/app-contribution-adapter.ts';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-adapter-'));
  fs.writeFileSync(path.join(root, 'state.json'), JSON.stringify({ status: 'ready', items: [] }));
  fs.mkdirSync(path.join(root, 'bin'));
  fs.writeFileSync(path.join(root, 'bin', 'owner'), `#!/usr/bin/env node
let body = '';
process.stdin.on('data', (chunk) => { body += chunk; });
process.stdin.on('end', () => {
  const input = JSON.parse(body);
  process.stdout.write(JSON.stringify({ approved: input.item_id, confirmed: true }));
});
`, { mode: 0o755 });
  fs.writeFileSync(path.join(root, 'app-contribution-adapter.json'), JSON.stringify({
    schema_version: 'opl-package-app-contribution-adapter.v1',
    reads: {
      'fixture.v1#state': { kind: 'json_file', root: 'package', path: 'state.json' },
    },
    actions: {
      'fixture.v1#approve': {
        kind: 'command',
        cwd: 'package',
        argv: ['./bin/owner'],
        stdin: 'input_json',
      },
    },
  }));
  return root;
}

test('declarative adapter reads contained JSON and executes fixed commands', () => {
  const root = fixture();
  try {
    const read = runDeclarativeAppContribution({
      packageRoot: root,
      request: {
        schema_version: 'opl-package-app-contribution-request.v1',
        operation: 'read',
        ref: 'fixture.v1#state',
        input: {},
      },
    });
    assert.equal((read as any).result.status, 'ready');
    const action = runDeclarativeAppContribution({
      packageRoot: root,
      request: {
        schema_version: 'opl-package-app-contribution-request.v1',
        operation: 'execute',
        ref: 'fixture.v1#approve',
        input: { item_id: 'item-1' },
      },
    });
    assert.deepEqual((action as any).result, { approved: 'item-1', confirmed: true });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('declarative adapter rejects undeclared refs and path escape', () => {
  const root = fixture();
  try {
    const missing = runDeclarativeAppContribution({
      packageRoot: root,
      request: {
        schema_version: 'opl-package-app-contribution-request.v1',
        operation: 'read',
        ref: 'fixture.v1#missing',
        input: {},
      },
    });
    assert.equal((missing as any).ok, false);
    assert.equal((missing as any).error.details.failure_code, 'app_contribution_adapter_ref_not_declared');
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'app-contribution-adapter.json'), 'utf8'));
    manifest.reads['fixture.v1#state'].path = '../outside.json';
    fs.writeFileSync(path.join(root, 'app-contribution-adapter.json'), JSON.stringify(manifest));
    const escaped = runDeclarativeAppContribution({
      packageRoot: root,
      request: {
        schema_version: 'opl-package-app-contribution-request.v1',
        operation: 'read',
        ref: 'fixture.v1#state',
        input: {},
      },
    });
    assert.equal((escaped as any).ok, false);
    assert.equal((escaped as any).error.details.failure_code, 'app_contribution_adapter_path_escape');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('JSON reads apply the declared projection and preserve unavailable files', () => {
  const root = fixture();
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'app-contribution-adapter.json'), 'utf8'));
    manifest.reads['fixture.v1#state'].transform = 'grant_workspace';
    fs.writeFileSync(path.join(root, 'app-contribution-adapter.json'), JSON.stringify(manifest));
    fs.writeFileSync(path.join(root, 'state.json'), JSON.stringify({
      workspace_id: 'grant-7', lifecycle_stage: 'drafting',
      current_selection: { active_draft_id: 'draft-3' },
      application_drafts: [{ draft_id: 'draft-3', project_title: 'Selected grant', version_label: 'v3' }],
      gates: { presubmission_frozen: false },
    }));
    const request = {
      schema_version: 'opl-package-app-contribution-request.v1',
      operation: 'read', ref: 'fixture.v1#state', input: {},
    };
    const read = runDeclarativeAppContribution({ packageRoot: root, request }) as any;
    assert.equal(read.ok, true);
    assert.equal(read.result.state, 'ready');
    assert.equal(read.result.data.items[0].title, 'Selected grant');
    assert.equal(read.result.data.items[0].active_draft_id, 'draft-3');
    fs.unlinkSync(path.join(root, 'state.json'));
    const missing = runDeclarativeAppContribution({ packageRoot: root, request }) as any;
    assert.equal(missing.result.state, 'unavailable');
    assert.equal(missing.result.reason, 'adapter_source_missing');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('projections preserve stage records and full nested decision packets', () => {
  const root = fixture();
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'app-contribution-adapter.json'), 'utf8'));
    const read = (transform: string, value: unknown) => {
      manifest.reads['fixture.v1#state'].transform = transform;
      fs.writeFileSync(path.join(root, 'app-contribution-adapter.json'), JSON.stringify(manifest));
      fs.writeFileSync(path.join(root, 'state.json'), JSON.stringify(value));
      return (runDeclarativeAppContribution({
        packageRoot: root,
        request: {
          schema_version: 'opl-package-app-contribution-request.v1',
          operation: 'read', ref: 'fixture.v1#state', input: {},
        },
      }) as any).result;
    };
    const pointer = { surface_kind: 'opl_current_stage_pointer', current_stage: null, empty_state: 'no_stage_opened_yet' };
    assert.deepEqual(read('runtime_detail', pointer), pointer);
    const stageManifest = { surface_kind: 'opl_stage_outputs_root_manifest', project_id: 'book-1' };
    assert.deepEqual(read('artifact_status', stageManifest), stageManifest);
    assert.deepEqual(read('rca_artifacts', stageManifest), stageManifest);
    const packet = {
      decision_question: 'Maintain reserve?', decision: { kind: 'no_change', summary: 'Hold' },
      alternatives: [{ alternative_id: 'reduce', thesis: 'Alternative' }],
      evidence_refs: ['synthetic:statement'], unresolved_quality_debt: ['refresh-needed'],
    };
    const card = read('capital_decision', packet).data.items[0];
    assert.equal(card.title, packet.decision_question);
    assert.equal(card.summary, 'Hold');
    assert.deepEqual(card.alternatives, packet.alternatives);
    assert.deepEqual(card.source_refs, packet.evidence_refs);
    assert.deepEqual(card.unknowns, packet.unresolved_quality_debt);
    assert.equal(card.execution_status, null);
    const plan = { plan_status: 'ready_for_owner_review', trades: [{ trade_id: 'trade-1' }], execution_claim: 'not_executed' };
    const planCard = read('capital_decision', plan).data.items[0];
    assert.deepEqual(planCard.trades, plan.trades);
    assert.equal(planCard.status, plan.plan_status);
    assert.equal(planCard.execution_status, 'not_executed');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('JSON reads reject symbolic links outside the declared root', () => {
  const root = fixture();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-adapter-outside-'));
  try {
    fs.writeFileSync(path.join(outside, 'state.json'), JSON.stringify({ private: true }));
    fs.unlinkSync(path.join(root, 'state.json'));
    fs.symlinkSync(path.join(outside, 'state.json'), path.join(root, 'state.json'));
    const read = runDeclarativeAppContribution({
      packageRoot: root,
      request: {
        schema_version: 'opl-package-app-contribution-request.v1',
        operation: 'read', ref: 'fixture.v1#state', input: {},
      },
    }) as any;
    assert.equal(read.ok, false);
    assert.equal(read.error.details.failure_code, 'app_contribution_adapter_path_escape');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('declarative adapter can preserve a Package-owned response envelope', () => {
  const root = fixture();
  try {
    fs.writeFileSync(path.join(root, 'bin', 'owner'), `#!/usr/bin/env node
let body = '';
process.stdin.on('data', (chunk) => { body += chunk; });
process.stdin.on('end', () => {
  const request = JSON.parse(body);
  process.stdout.write(JSON.stringify({
    schema_version: 'opl-package-app-contribution-response.v1',
    ok: true,
    ref: request.ref,
    operation: request.operation,
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string' } },
    },
    result: { state: 'ready', data: { items: [] } },
  }));
});
`, { mode: 0o755 });
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'app-contribution-adapter.json'), 'utf8'));
    manifest.reads['fixture.v1#owner'] = {
      kind: 'command',
      cwd: 'package',
      argv: ['./bin/owner'],
      stdin: 'request_json',
      passthrough: true,
    };
    fs.writeFileSync(path.join(root, 'app-contribution-adapter.json'), JSON.stringify(manifest));
    const response = runDeclarativeAppContribution({
      packageRoot: root,
      request: {
        schema_version: 'opl-package-app-contribution-request.v1',
        operation: 'read',
        ref: 'fixture.v1#owner',
        input: { query: 'alpha' },
      },
    }) as any;
    assert.equal(response.ok, true);
    assert.equal(response.result.state, 'ready');
    assert.equal(response.input_schema.properties.query.type, 'string');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('declarative adapter returns input_required before invoking a missing-input command', () => {
  const root = fixture();
  try {
    fs.writeFileSync(path.join(root, 'bin', 'required'), `#!/usr/bin/env node
process.stdout.write(JSON.stringify({ state: 'should_not_run' }));
`);
    fs.chmodSync(path.join(root, 'bin', 'required'), 0o755);
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'app-contribution-adapter.json'), 'utf8'));
    manifest.reads['fixture.v1#required'] = {
      kind: 'command',
      cwd: 'package',
      argv: ['./bin/required'],
      input_schema: {
        type: 'object',
        required: ['artifact_path'],
        properties: {
          artifact_path: { type: 'string' },
        },
      },
    };
    fs.writeFileSync(path.join(root, 'app-contribution-adapter.json'), JSON.stringify(manifest));
    const response = runDeclarativeAppContribution({
      packageRoot: root,
      request: {
        schema_version: 'opl-package-app-contribution-request.v1',
        operation: 'read',
        ref: 'fixture.v1#required',
        input: {},
      },
    }) as any;
    assert.equal(response.ok, true);
    assert.equal(response.result.state, 'input_required');
    assert.deepEqual(response.result.missing_fields, ['artifact_path']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('declarative adapter unwraps a fleet response and creates a structured status item', () => {
  const root = fixture();
  try {
    fs.writeFileSync(path.join(root, 'bin', 'fleet'), `#!/usr/bin/env node
process.stdout.write(JSON.stringify({
  schema_version: 'opl-package-app-contribution-response.v1',
  ok: true,
  ref: 'fleet.agent.telemetry.v1#local',
  operation: 'read',
  result: {
    read_ref: 'fleet.agent.telemetry.v1#local',
    observed_at: '2026-11-06T00:00:00.000Z',
    freshness: { state: 'fresh' },
    native_carrier: { availability: 'available' },
    node: { display_name: 'node-a' },
    payload: { collection_status: 'available' },
  },
}));
`, { mode: 0o755 });
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'app-contribution-adapter.json'), 'utf8'));
    manifest.reads['fixture.v1#fleet'] = {
      kind: 'command',
      cwd: 'package',
      argv: ['./bin/fleet'],
      stdin: 'request_json',
      transform: 'fleet_status',
    };
    fs.writeFileSync(path.join(root, 'app-contribution-adapter.json'), JSON.stringify(manifest));
    const response = runDeclarativeAppContribution({
      packageRoot: root,
      request: {
        schema_version: 'opl-package-app-contribution-request.v1',
        operation: 'read',
        ref: 'fixture.v1#fleet',
        input: {},
      },
    }) as any;
    assert.equal(response.result.state, 'ready');
    assert.equal(response.result.data.items[0].status, 'ready');
    assert.match(response.result.data.items[0].summary, /采集：fresh/);
    assert.equal(response.result.data.items[0].node.display_name, 'node-a');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

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

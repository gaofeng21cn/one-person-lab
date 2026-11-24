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

test('declarative adapter rejects legacy domain transforms and supports passthrough JSON and unavailable files', () => {
  const root = fixture();
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'app-contribution-adapter.json'), 'utf8'));
    manifest.reads['fixture.v1#state'].transform = 'fleet_status';
    fs.writeFileSync(path.join(root, 'app-contribution-adapter.json'), JSON.stringify(manifest));
    const request = {
      schema_version: 'opl-package-app-contribution-request.v1',
      operation: 'read',
      ref: 'fixture.v1#state',
      input: {},
    };
    const rejected = runDeclarativeAppContribution({ packageRoot: root, request }) as any;
    assert.equal(rejected.ok, false);
    assert.equal(rejected.error.details.failure_code, 'app_contribution_adapter_transform_unsupported');

    delete manifest.reads['fixture.v1#state'].transform;
    manifest.reads['fixture.v1#state'].passthrough = true;
    fs.writeFileSync(path.join(root, 'app-contribution-adapter.json'), JSON.stringify(manifest));
    const ready = runDeclarativeAppContribution({ packageRoot: root, request }) as any;
    assert.equal(ready.ok, true);
    assert.equal(ready.result.status, 'ready');

    fs.unlinkSync(path.join(root, 'state.json'));
    const missing = runDeclarativeAppContribution({ packageRoot: root, request }) as any;
    assert.equal(missing.result.state, 'unavailable');
    assert.equal(missing.result.reason, 'adapter_source_missing');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('declarative markdown_review and json_artifact_review entries read artifacts and record feedback atomically', () => {
  const root = fixture();
  try {
    fs.writeFileSync(path.join(root, 'draft.md'), '# Intro\n\n## Methods\nContent\n');
    fs.writeFileSync(path.join(root, 'packet.json'), JSON.stringify({
      id: 'pkt-1',
      title: 'Review Packet',
      summary: 'Ready for inspection',
      status: 'pending',
    }));
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'app-contribution-adapter.json'), 'utf8'));
    manifest.reads['fixture.v1#md'] = {
      kind: 'markdown_review',
      root: 'package',
      path: 'draft.md',
      feedback_path: 'feedback',
    };
    manifest.reads['fixture.v1#json_review'] = {
      kind: 'json_artifact_review',
      root: 'package',
      path: 'packet.json',
      feedback_path: 'feedback',
    };
    manifest.actions['fixture.v1#md.note'] = {
      kind: 'markdown_review',
      root: 'package',
      feedback_path: 'feedback',
    };
    fs.writeFileSync(path.join(root, 'app-contribution-adapter.json'), JSON.stringify(manifest));

    const mdRead = runDeclarativeAppContribution({
      packageRoot: root,
      request: { schema_version: 'opl-package-app-contribution-request.v1', operation: 'read', ref: 'fixture.v1#md', input: {} },
    }) as any;
    assert.equal(mdRead.result.state, 'ready');
    const mdItem = mdRead.result.data.items[0];
    assert.deepEqual(mdItem.headings.map((h: any) => h.title), ['Intro', 'Methods']);

    const action = runDeclarativeAppContribution({
      packageRoot: root,
      request: {
        schema_version: 'opl-package-app-contribution-request.v1',
        operation: 'execute',
        ref: 'fixture.v1#md.note',
        input: { request_id: 'note-1', revision: mdItem.revision, note: 'Check section 2' },
      },
    }) as any;
    assert.equal(action.result.state, 'ready');
    assert.equal(action.result.result.status, 'recorded');

    // Conflicting note under same request_id fails closed.
    const conflict = runDeclarativeAppContribution({
      packageRoot: root,
      request: {
        schema_version: 'opl-package-app-contribution-request.v1',
        operation: 'execute',
        ref: 'fixture.v1#md.note',
        input: { request_id: 'note-1', revision: mdItem.revision, note: 'Different note' },
      },
    }) as any;
    assert.equal(conflict.ok, false);
    assert.equal(conflict.error.details.failure_code, 'app_contribution_adapter_feedback_conflict');

    const jsonRead = runDeclarativeAppContribution({
      packageRoot: root,
      request: { schema_version: 'opl-package-app-contribution-request.v1', operation: 'read', ref: 'fixture.v1#json_review', input: {} },
    }) as any;
    assert.equal(jsonRead.result.state, 'ready');
    assert.equal(jsonRead.result.data.items[0].title, 'Review Packet');
    assert.equal(jsonRead.result.data.feedback.length, 1);
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
        operation: 'read',
        ref: 'fixture.v1#state',
        input: {},
      },
    }) as any;
    assert.equal(read.ok, false);
    assert.equal(read.error.details.failure_code, 'app_contribution_adapter_path_escape');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('declarative adapter injects Framework PYTHONPATH into child commands and preserves owner envelopes', () => {
  const root = fixture();
  const prevPythonPath = process.env.PYTHONPATH;
  try {
    delete process.env.PYTHONPATH;
    fs.writeFileSync(path.join(root, 'bin', 'py_check.py'), `import json, opl_framework.app_contribution as ac
print(json.dumps(ac.ready_envelope({'loaded': True})))
`);
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'app-contribution-adapter.json'), 'utf8'));
    manifest.reads['fixture.v1#py'] = {
      kind: 'command',
      cwd: 'package',
      argv: ['python3', 'bin/py_check.py'],
    };
    fs.writeFileSync(path.join(root, 'app-contribution-adapter.json'), JSON.stringify(manifest));
    const pyResp = runDeclarativeAppContribution({
      packageRoot: root,
      request: { schema_version: 'opl-package-app-contribution-request.v1', operation: 'read', ref: 'fixture.v1#py', input: {} },
    }) as any;
    assert.equal(pyResp.ok, true);
    assert.deepEqual(pyResp.result, { state: 'ready', data: { loaded: true } });

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
    if (prevPythonPath === undefined) delete process.env.PYTHONPATH;
    else process.env.PYTHONPATH = prevPythonPath;
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

import {
  chmodSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import assert from 'node:assert/strict';

import { parseJsonText } from '../../../../src/kernel/json-file.ts';
import {
  buildProviderWorkerSupervisorPlist,
  providerWorkerFoundryOwnerGateEnvironment,
  providerWorkerSupervisorEnvironmentProjection,
  providerWorkerSupervisorEnvironmentVariables,
  redactProviderWorkerSupervisorLaunchctl,
} from '../../../../src/modules/runway/family-runtime-provider-worker-supervisor.ts';

function runtimePaths(root: string) {
  return {
    root,
    state_dir: path.dirname(root),
  } as Parameters<typeof buildProviderWorkerSupervisorPlist>[0];
}

function executable(root: string) {
  const file = path.join(root, 'foundry-owner-gate');
  writeFileSync(file, '#!/bin/sh\nexit 0\n');
  chmodSync(file, 0o700);
  return realpathSync(file);
}

function decodeXml(value: string) {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&gt;', '>')
    .replaceAll('&lt;', '<')
    .replaceAll('&amp;', '&');
}

function plistEnvironmentValue(plist: string, key: string) {
  const match = plist.match(new RegExp(
    `<key>${key}</key>\\s*<string>([\\s\\S]*?)</string>`,
  ));
  assert.ok(match?.[1] !== undefined);
  return decodeXml(match[1]);
}

test('provider-worker supervisor omits every OwnerGate variable when BIN is absent', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'opl-owner-gate-supervisor-omit-'));
  try {
    const environment = {
      OPL_FOUNDRY_OWNER_GATE_ARGS: '["--ignored"]',
      OPL_FOUNDRY_OWNER_GATE_TIMEOUT_MS: '30000',
    };
    const ownerGate = providerWorkerFoundryOwnerGateEnvironment(environment);
    const values = providerWorkerSupervisorEnvironmentVariables(runtimePaths(root), environment);
    assert.deepEqual(ownerGate, {
      persisted: {},
      projection: { configured: false, arg_count: 0, timeout_ms: null },
    });
    assert.equal(Object.hasOwn(values, 'OPL_FOUNDRY_OWNER_GATE_BIN'), false);
    assert.equal(Object.hasOwn(values, 'OPL_FOUNDRY_OWNER_GATE_ARGS'), false);
    assert.equal(Object.hasOwn(values, 'OPL_FOUNDRY_OWNER_GATE_TIMEOUT_MS'), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('provider-worker supervisor persists canonical MAS OwnerGate argv without exposing it in projection', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'opl-owner-gate-supervisor-configured-'));
  try {
    const bin = executable(root);
    const args = [
      '--policy',
      '/Users/example/MAS/contracts/foundry_owner_gate_policy.json',
      '--receipt-dir',
      '/Users/example/Owner Receipts/<active>&"quoted"',
    ];
    const environment = {
      OPL_FOUNDRY_OWNER_GATE_BIN: bin,
      OPL_FOUNDRY_OWNER_GATE_ARGS: JSON.stringify(args, null, 2),
      OPL_FOUNDRY_OWNER_GATE_TIMEOUT_MS: '30000',
    };
    const ownerGate = providerWorkerFoundryOwnerGateEnvironment(environment);
    const values = providerWorkerSupervisorEnvironmentVariables(runtimePaths(root), environment);
    const projection = providerWorkerSupervisorEnvironmentProjection(runtimePaths(root), environment);
    const plist = buildProviderWorkerSupervisorPlist(runtimePaths(root), environment);
    assert.equal(values.OPL_FOUNDRY_OWNER_GATE_BIN, bin);
    assert.deepEqual(parseJsonText(values.OPL_FOUNDRY_OWNER_GATE_ARGS), args);
    assert.equal(values.OPL_FOUNDRY_OWNER_GATE_TIMEOUT_MS, '30000');
    assert.deepEqual(ownerGate.projection, {
      configured: true,
      arg_count: 4,
      timeout_ms: 30000,
    });
    assert.equal(Object.hasOwn(projection, 'OPL_FOUNDRY_OWNER_GATE_BIN'), false);
    assert.equal(Object.hasOwn(projection, 'OPL_FOUNDRY_OWNER_GATE_ARGS'), false);
    assert.equal(Object.hasOwn(projection, 'OPL_FOUNDRY_OWNER_GATE_TIMEOUT_MS'), false);
    assert.equal(JSON.stringify(ownerGate.projection).includes('Owner Receipts'), false);
    assert.deepEqual(
      parseJsonText(plistEnvironmentValue(plist, 'OPL_FOUNDRY_OWNER_GATE_ARGS')),
      args,
    );
    assert.match(plist, /&lt;active&gt;&amp;\\&quot;quoted\\&quot;/);
    assert.doesNotMatch(plist, /<active>/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('provider-worker supervisor rejects invalid OwnerGate executables before plist construction', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'opl-owner-gate-supervisor-bin-'));
  try {
    const bin = executable(root);
    const link = path.join(root, 'foundry-owner-gate-link');
    symlinkSync(bin, link);
    const directory = path.join(root, 'directory');
    const nonExecutable = path.join(root, 'non-executable');
    writeFileSync(directory, '');
    writeFileSync(nonExecutable, '#!/bin/sh\nexit 0\n');
    for (const invalid of ['relative-owner-gate', link, nonExecutable]) {
      assert.throws(
        () => providerWorkerFoundryOwnerGateEnvironment({
          OPL_FOUNDRY_OWNER_GATE_BIN: invalid,
        }),
        /OPL_FOUNDRY_OWNER_GATE_BIN/,
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('provider-worker supervisor rejects invalid OwnerGate argv and timeout values', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'opl-owner-gate-supervisor-values-'));
  try {
    const bin = executable(root);
    for (const args of ['not-json', '{}', '["valid", 7]']) {
      assert.throws(
        () => providerWorkerFoundryOwnerGateEnvironment({
          OPL_FOUNDRY_OWNER_GATE_BIN: bin,
          OPL_FOUNDRY_OWNER_GATE_ARGS: args,
        }),
        /OPL_FOUNDRY_OWNER_GATE_ARGS/,
      );
    }
    for (const timeout of ['0', '-1', '1.5', '300001', '9007199254740992']) {
      assert.throws(
        () => providerWorkerFoundryOwnerGateEnvironment({
          OPL_FOUNDRY_OWNER_GATE_BIN: bin,
          OPL_FOUNDRY_OWNER_GATE_TIMEOUT_MS: timeout,
        }),
        /OPL_FOUNDRY_OWNER_GATE_TIMEOUT_MS/,
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('provider-worker supervisor redacts OwnerGate values from launchctl readback', () => {
  const readback = redactProviderWorkerSupervisorLaunchctl({
    ok: true,
    status: 0,
    stdout: [
      '\t\tOPL_FOUNDRY_OWNER_GATE_BIN => /trusted/verifier',
      '\t\tOPL_FOUNDRY_OWNER_GATE_ARGS => ["--receipt-dir","/private/receipts"]',
      '\t\tOPL_FOUNDRY_OWNER_GATE_TIMEOUT_MS => 30000',
    ].join('\n'),
    stderr: 'OPL_FOUNDRY_OWNER_GATE_ARGS => ["--receipt-dir","/private/receipts"]',
    args: ['print', 'gui/501/ai.opl.family-runtime.provider-worker'],
  });
  assert.equal(readback?.stdout.includes('/trusted/verifier'), false);
  assert.equal(readback?.stdout.includes('/private/receipts'), false);
  assert.equal(readback?.stderr.includes('/private/receipts'), false);
  assert.equal(readback?.stdout.match(/\[redacted\]/g)?.length, 3);
});

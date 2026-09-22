import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { verifyPackageSourceArtifacts } from '../../scripts/verify-package-source-artifacts.ts';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-source-preflight-test-'));
  for (const id of ['first', 'second']) {
    fs.writeFileSync(path.join(root, `${id}.json`), JSON.stringify({
      package_id: id,
      codex_surface: {
        configured_codex_plugin_carrier: { plugin_selector: `${id}@owner` },
        plugin_payload_manifest_url: `https://example.invalid/${id}.json`,
      },
    }));
  }
  return root;
}

test('selected payloads use separate disposable state and leave caller state unchanged', () => {
  const packageDirectory = fixture();
  const originalState = process.env.OPL_STATE_DIR;
  const statePaths: string[] = [];
  try {
    const report = verifyPackageSourceArtifacts(['second', 'first', 'second'], {
      packageDirectory,
      materialize(input) {
        assert.equal(input.pluginId, `${input.packageId}@owner`);
        assert.equal(input.packageDirectory, packageDirectory);
        const state = input.env.OPL_STATE_DIR!;
        assert.notEqual(state, originalState);
        statePaths.push(state);
        fs.mkdirSync(state, { recursive: true });
        fs.writeFileSync(path.join(state, 'materialized'), input.packageId);
        return state;
      },
    });
    assert.deepEqual(report.root_package_ids, ['second', 'first']);
    assert.equal(report.native_carrier_mutation, false);
    assert.equal(statePaths.length, 2);
    assert.notEqual(statePaths[0], statePaths[1]);
    assert.ok(statePaths.every((state) => !fs.existsSync(path.dirname(state))));
    assert.equal(process.env.OPL_STATE_DIR, originalState);
  } finally {
    fs.rmSync(packageDirectory, { recursive: true, force: true });
  }
});

test('transport failure removes partial state and reports no raw subprocess secrets', () => {
  const packageDirectory = fixture();
  let partialState = '';
  try {
    assert.throws(() => verifyPackageSourceArtifacts(['first'], {
      packageDirectory,
      materialize(input) {
        partialState = input.env.OPL_STATE_DIR!;
        fs.mkdirSync(partialState, { recursive: true });
        throw Object.assign(new Error('credential=do-not-forward'), { code: 'source_digest_mismatch' });
      },
    }), (error: Error) => {
      assert.match(error.message, /first.*source_digest_mismatch/);
      assert.doesNotMatch(error.message, /credential/);
      return true;
    });
    assert.ok(partialState);
    assert.equal(fs.existsSync(path.dirname(partialState)), false);
  } finally {
    fs.rmSync(packageDirectory, { recursive: true, force: true });
  }
});

test('invalid or unknown roots fail before invoking transport', () => {
  const packageDirectory = fixture();
  try {
    for (const ids of [[], ['../escape'], ['missing']]) {
      assert.throws(() => verifyPackageSourceArtifacts(ids, {
        packageDirectory,
        materialize() { assert.fail('transport must not run'); },
      }), /valid --package-id|no declared payload/);
    }
  } finally {
    fs.rmSync(packageDirectory, { recursive: true, force: true });
  }
});

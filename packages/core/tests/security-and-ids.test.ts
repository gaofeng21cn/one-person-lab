import assert from 'node:assert/strict';
import test from 'node:test';

import {
  KernelError,
  assertTrustedHost,
  canonicalJsonText,
  createClientContext,
  createOpaqueRef,
  isClientKind,
  isTrustedHost,
  newId,
  newRandomToken,
  parseClientKind,
  sha256Hex,
  stableId,
  timingSafeEqualHex,
} from '../src/index.ts';

test('ClientKind and trusted host enforcement fail closed', () => {
  assert.equal(isClientKind('opl_app'), true);
  assert.equal(isClientKind('opl_cli'), true);
  assert.equal(isClientKind('sdk_python'), true);
  assert.equal(isClientKind('external'), true);
  assert.equal(isClientKind('rogue'), false);

  assert.equal(parseClientKind('unknown'), 'external');
  assert.equal(isTrustedHost('opl_app'), true);
  assert.equal(isTrustedHost('opl_cli'), true);
  assert.equal(isTrustedHost('sdk_python'), false);
  assert.equal(isTrustedHost('external'), false);

  const appCtx = createClientContext({ session_id: 's1', client_kind: 'opl_app' });
  const pyCtx = createClientContext({ session_id: 's2', client_kind: 'sdk_python' });
  assertTrustedHost(appCtx, 'approve_grant');
  assert.throws(
    () => assertTrustedHost(pyCtx, 'approve_grant'),
    (err: unknown) => err instanceof KernelError && err.code === 'UNAUTHORIZED_CLIENT',
  );
});

test('timingSafeEqualHex validates matching and mismatched hex tokens', () => {
  const t1 = newRandomToken(32);
  const t2 = newRandomToken(32);
  assert.equal(t1.length, 64);
  assert.equal(timingSafeEqualHex(t1, t1), true);
  assert.equal(timingSafeEqualHex(t1, t1.toUpperCase()), true);
  assert.equal(timingSafeEqualHex(t1, t2), false);
  assert.equal(timingSafeEqualHex('abc', 'abc'), false);
  assert.equal(timingSafeEqualHex('zzzz', 'zzzz'), false);
  assert.equal(timingSafeEqualHex('', ''), false);
});

test('IDs, canonicalJsonText, sha256Hex, and OpaqueRef behave deterministically', () => {
  const idA = newId('task');
  const idB = newId('task');
  assert.ok(idA.startsWith('task_'));
  assert.notEqual(idA, idB);

  const s1 = stableId('grant', [{ b: 2, a: 1 }]);
  const s2 = stableId('grant', [{ a: 1, b: 2 }]);
  assert.equal(s1, s2);
  assert.ok(s1.startsWith('grant_'));

  assert.equal(canonicalJsonText({ z: 1, a: [true, null, 'ok'] }), '{"a":[true,null,"ok"],"z":1}');
  assert.throws(
    () => canonicalJsonText({ bad: Number.NaN }),
    (err: unknown) => err instanceof KernelError && err.code === 'INVALID_INPUT',
  );
  assert.throws(
    () => canonicalJsonText({ bad: '\ud800' }),
    (err: unknown) => err instanceof KernelError && err.code === 'INVALID_INPUT',
  );

  const digest = sha256Hex('hello');
  assert.ok(digest.startsWith('sha256:'));
  assert.equal(digest.length, 7 + 64);

  assert.deepEqual(createOpaqueRef('credential', 'cred_1', digest), {
    kind: 'credential',
    ref: 'cred_1',
    digest,
  });
});

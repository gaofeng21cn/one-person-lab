import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { LINK_ACCESS as C, LINK_ACCESS_ERROR as E, recipientKey, encryptLinkSourceAccess, decryptLinkSourceAccess, verifyLinkSourceReads } from '../scripts/link-source-access.mjs';

const HTTP = Object.freeze({ OK: 200, FORBIDDEN: 403 });
const BUILD = Object.freeze({ COMPLETED: 'completed', SUCCESS: 'success' });
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 3072 });
const pub = Buffer.from(publicKey.export({ format: 'pem', type: 'spki' })).toString('base64');
const now = Date.now(), runId = '123', sourceSha = 'a'.repeat(40);
const value = () => ({ schema: C.payloadSchema, token: 'ghs_' + 'fixture'.repeat(8), allowedRepositories: [...C.repositories], permissions: { ...C.permissions }, actualExpiryKnown: false, tokenMaxLifetimeSeconds: C.maxLifetimeSeconds, mintStartedAt: new Date(now).toISOString(), usableUntil: new Date(now + C.useWindowSeconds * 1000).toISOString() });
const rejects = (fn, code) => assert.throws(fn, (e) => e.code === code);

test('recipient and authenticated envelope bind exact run, source, scope and conservative expiry', () => {
  const input = value(); const envelope = encryptLinkSourceAccess(input, pub, { runId, sourceSha, now });
  assert.deepEqual(decryptLinkSourceAccess(envelope, privateKey, { expectedRunId: runId, expectedSourceSha: sourceSha, now }), input);
  assert.ok(!JSON.stringify(envelope).includes(input.token));
  rejects(() => recipientKey(Buffer.from(privateKey.export({ format: 'pem', type: 'pkcs8' })).toString('base64')), E.INPUT);
  rejects(() => encryptLinkSourceAccess({ ...input, permissions: { contents: 'write' } }, pub, { runId, sourceSha, now }), E.ENVELOPE);
  rejects(() => encryptLinkSourceAccess({ ...input, allowedRepositories: [...C.repositories, 'other/repo'] }, pub, { runId, sourceSha, now }), E.ENVELOPE);
  rejects(() => decryptLinkSourceAccess(envelope, privateKey, { expectedRunId: '124', expectedSourceSha: sourceSha, now }), E.ENVELOPE);
  rejects(() => decryptLinkSourceAccess(envelope, privateKey, { expectedRunId: runId, expectedSourceSha: sourceSha, now: now + C.useWindowSeconds * 1000 }), E.EXPIRED);
  const modified = structuredClone(envelope); modified.ciphertext = Buffer.from('changed').toString('base64');
  rejects(() => decryptLinkSourceAccess(modified, privateKey, { expectedRunId: runId, expectedSourceSha: sourceSha, now }), E.ENVELOPE);
});

function fixture({ expanded = false, packagesDenied = false } = {}) {
  return async (url, options) => {
    assert.equal(options.redirect, 'error');
    const source = String(url); let body;
    if (source.includes('/installation/repositories?')) body = { total_count: expanded ? 4 : 3, repositories: [...C.repositories, ...(expanded ? ['other/repo'] : [])].map((full_name) => ({ full_name })) };
    else if (source.includes('/contents/package.json?')) body = { type: 'file', path: 'package.json', sha: 'b'.repeat(40) };
    else if (source.endsWith('/artifacts?per_page=100')) body = { artifacts: [{ name: 'link-service-image', expired: false }] };
    else if (source.includes('/actions/runs/')) body = { id: Number(C.sourceRunId), head_sha: C.sourceSha, head_branch: 'main', status: BUILD.COMPLETED, conclusion: BUILD.SUCCESS, path: '.github/workflows/link-service.yml' };
    else if (source.startsWith('https://ghcr.io/token?')) {
      assert.ok(options.headers.Authorization.startsWith('Basic '));
      if (packagesDenied) return new Response('', { status: HTTP.FORBIDDEN });
      body = { token: 'registry-fixture' };
    } else if (source.includes('/manifests/')) return new Response('wrong digest', { status: HTTP.OK });
    else throw new Error('Unexpected URL');
    return new Response(JSON.stringify(body), { status: HTTP.OK });
  };
}
test('read proof refuses expanded repository scope and unavailable package permission without leaking token', async () => {
  await assert.rejects(() => verifyLinkSourceReads(value().token, { fetchImpl: fixture({ expanded: true }) }), (e) => e.code === E.SCOPE);
  await assert.rejects(() => verifyLinkSourceReads(value().token, { fetchImpl: fixture({ packagesDenied: true }) }), (e) => e.code === E.PACKAGES && !e.message.includes(value().token));
  await assert.rejects(() => verifyLinkSourceReads(value().token, { fetchImpl: fixture() }), (e) => e.code === E.PACKAGES);
});

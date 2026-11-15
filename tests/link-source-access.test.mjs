import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
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

function fixture({ expanded = false, sourceDenied = false, artifactsDenied = false, calls = [] } = {}) {
  return async (url, options) => {
    assert.equal(options.redirect, 'error');
    const source = String(url); calls.push(source); let body;
    assert.equal(new URL(source).origin, 'https://api.github.com');
    if (source.includes('/installation/repositories?')) body = { total_count: expanded ? 4 : 3, repositories: [...C.repositories, ...(expanded ? ['other/repo'] : [])].map((full_name) => ({ full_name })) };
    else if (source.includes('/contents/package.json?')) {
      if (sourceDenied) return new Response('', { status: HTTP.FORBIDDEN });
      body = { type: 'file', path: 'package.json', sha: 'b'.repeat(40) };
    }
    else if (source.endsWith('/artifacts?per_page=100')) {
      if (artifactsDenied) return new Response('', { status: HTTP.FORBIDDEN });
      body = { artifacts: [{ name: 'link-service-image', expired: false }] };
    }
    else if (source.includes('/actions/runs/')) body = { id: Number(C.sourceRunId), head_sha: C.sourceSha, head_branch: 'main', status: BUILD.COMPLETED, conclusion: BUILD.SUCCESS, path: '.github/workflows/link-service.yml' };
    else throw new Error('Unexpected URL');
    return new Response(JSON.stringify(body), { status: HTTP.OK });
  };
}
test('source proof accepts long installation tokens and refuses unavailable source or artifact reads', async () => {
  const calls = [];
  const longToken = 'ghs_' + 's'.repeat(516);
  assert.deepEqual(await verifyLinkSourceReads(longToken, { fetchImpl: fixture({ calls }) }), { repositoryScope: true, privateSources: true, buildArtifact: true });
  assert.equal(calls.length, 6);
  assert.ok(calls.every((url) => url.startsWith('https://api.github.com/')));
  await assert.rejects(() => verifyLinkSourceReads(value().token, { fetchImpl: fixture({ expanded: true }) }), (e) => e.code === E.SCOPE);
  await assert.rejects(() => verifyLinkSourceReads(value().token, { fetchImpl: fixture({ sourceDenied: true }) }), (e) => e.code === E.SOURCE && !e.message.includes(value().token));
  await assert.rejects(() => verifyLinkSourceReads(value().token, { fetchImpl: fixture({ artifactsDenied: true }) }), (e) => e.code === E.ACTIONS);
});

test('source token envelope supports 520 to 4096 characters and rejects control, whitespace, overflow and package grants', async () => {
  for (const length of [520, 4096]) {
    const input = { ...value(), token: 'ghs_' + 's'.repeat(length - 4) };
    const envelope = encryptLinkSourceAccess(input, pub, { runId, sourceSha, now });
    assert.equal(decryptLinkSourceAccess(envelope, privateKey, { expectedRunId: runId, expectedSourceSha: sourceSha, now }).token.length, length);
  }
  for (const token of ['ghs_' + 's'.repeat(4093), value().token + '\n', value().token + ' ', value().token + '\u0000', value().token + '\u007f', value().token + '\u00a0', value().token + '\u200b']) {
    rejects(() => encryptLinkSourceAccess({ ...value(), token }, pub, { runId, sourceSha, now }), E.ENVELOPE);
    await assert.rejects(() => verifyLinkSourceReads(token, { fetchImpl: fixture() }), (e) => e.code === E.INPUT);
  }
  rejects(() => encryptLinkSourceAccess({ ...value(), permissions: { ...C.permissions, packages: 'read' } }, pub, { runId, sourceSha, now }), E.ENVELOPE);
});

test('workflow mints only fixed source read capabilities with the existing App identity', () => {
  const text = readFileSync(new URL('../.github/workflows/link-source-access.yml', import.meta.url), 'utf8');
  const requested = [...text.matchAll(/^\s+permission-([a-z-]+): (.+)$/gm)].map((match) => [match[1], match[2]]);
  assert.deepEqual(requested, [['contents', 'read'], ['actions', 'read']]);
  assert.deepEqual(C.permissions, { contents: 'read', actions: 'read' });
  assert.match(text, /actions\/create-github-app-token@fee1f7d63c2ff003460e3d139729b119787bc349/);
  assert.match(text, /repositories: \|\n\s+one-person-lab\n\s+opl-studio\n\s+opl-link\n/);
  assert.match(text, /skip-token-revoke: true/);
});

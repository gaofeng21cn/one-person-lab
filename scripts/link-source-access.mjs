import { constants, createCipheriv, createDecipheriv, createHash, createPublicKey, privateDecrypt, publicEncrypt, randomBytes } from 'node:crypto';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const LINK_ACCESS = Object.freeze({
  schema: 'opl_link_source_access_encrypted.v1', payloadSchema: 'opl_link_source_access.v1', resultSchema: 'opl_link_source_access_result.v1',
  appId: '5752885', repository: 'gaofeng21cn/one-person-lab', repositories: Object.freeze(['gaofeng21cn/one-person-lab', 'gaofeng21cn/opl-studio', 'gaofeng21cn/opl-link']),
  permissions: Object.freeze({ contents: 'read', actions: 'read' }),
  sourceSha: '565fc1b1feb882c7793566abc1b1179df7847c0d', sourceRunId: '43691263878',
  maxLifetimeSeconds: 3600, useWindowSeconds: 3000,
});
export const LINK_ACCESS_ERROR = Object.freeze({ INPUT: 'LINK_ACCESS_INPUT_INVALID', MINT: 'LINK_APP_TOKEN_MINT_FAILED', SCOPE: 'LINK_APP_REPOSITORY_SCOPE_INVALID', SOURCE: 'LINK_APP_SOURCE_READ_DENIED', ACTIONS: 'LINK_APP_ARTIFACT_READ_DENIED', EXPIRED: 'LINK_ACCESS_USE_WINDOW_EXPIRED', ENVELOPE: 'LINK_ACCESS_ENVELOPE_INVALID' });
const fail = (code) => { throw Object.assign(new Error(code), { code }); };
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sha = /^[a-f0-9]{40}$/;
const id = /^[1-9][0-9]{0,15}$/;
const validToken = (value) => typeof value === 'string' && value.startsWith('ghs_') && value.length >= 24 && value.length <= 4096 && !/[\p{White_Space}\p{Cc}\p{Cf}]/u.test(value);
const fingerprint = (key) => `sha256:${createHash('sha256').update(key.export({ type: 'spki', format: 'der' })).digest('hex')}`;
function base64(value, max = 65536) {
  if (typeof value !== 'string' || !value.length || value.length > max || Buffer.from(value, 'base64').toString('base64') !== value) fail(LINK_ACCESS_ERROR.INPUT);
  return Buffer.from(value, 'base64');
}
export function recipientKey(encoded) {
  const pem = base64(encoded, 16384).toString('utf8');
  if (!pem.startsWith('-----BEGIN PUBLIC KEY-----\n')) fail(LINK_ACCESS_ERROR.INPUT);
  let key;
  try { key = createPublicKey(pem); } catch { fail(LINK_ACCESS_ERROR.INPUT); }
  if (key.asymmetricKeyType !== 'rsa' || key.asymmetricKeyDetails?.modulusLength < 3072 || key.export({ type: 'spki', format: 'pem' }) !== pem) fail(LINK_ACCESS_ERROR.INPUT);
  return key;
}
function context(runId, sourceSha) {
  if (!id.test(runId) || !Number.isSafeInteger(Number(runId)) || !sha.test(sourceSha)) fail(LINK_ACCESS_ERROR.INPUT);
}
function payload(value, now) {
  const keys = ['schema', 'token', 'allowedRepositories', 'permissions', 'actualExpiryKnown', 'tokenMaxLifetimeSeconds', 'mintStartedAt', 'usableUntil'].sort();
  if (!object(value) || Object.keys(value).sort().join() !== keys.join() || value.schema !== LINK_ACCESS.payloadSchema || !validToken(value.token) || !same(value.allowedRepositories, LINK_ACCESS.repositories) || !same(value.permissions, LINK_ACCESS.permissions) || value.actualExpiryKnown !== false || value.tokenMaxLifetimeSeconds !== LINK_ACCESS.maxLifetimeSeconds) fail(LINK_ACCESS_ERROR.ENVELOPE);
  const start = Date.parse(value.mintStartedAt), end = Date.parse(value.usableUntil);
  if (!Number.isFinite(start) || !Number.isFinite(end) || new Date(start).toISOString() !== value.mintStartedAt || new Date(end).toISOString() !== value.usableUntil || end - start !== LINK_ACCESS.useWindowSeconds * 1000 || start > now + 30000 || end <= now) fail(LINK_ACCESS_ERROR.EXPIRED);
  return value;
}
export function encryptLinkSourceAccess(value, publicKeyB64, { runId, sourceSha, now = Date.now() }) {
  context(runId, sourceSha); payload(value, now);
  const key = recipientKey(publicKeyB64);
  const header = { schema: LINK_ACCESS.schema, alg: 'RSA-OAEP-256', enc: 'A256GCM', purpose: 'link_internet_source_read_only', repository: LINK_ACCESS.repository, workflowRunId: runId, sourceSha, recipientFingerprint: fingerprint(key) };
  const secret = randomBytes(32), iv = randomBytes(12);
  try {
    const cipher = createCipheriv('aes-256-gcm', secret, iv); cipher.setAAD(Buffer.from(JSON.stringify(header)));
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return { header, encryptedKey: publicEncrypt({ key, oaepHash: 'sha256', padding: constants.RSA_PKCS1_OAEP_PADDING }, secret).toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
  } finally { secret.fill(0); }
}
// Returns the token in memory. The caller can pipe it directly into the
// existing protected consumer and must never print it or persist plaintext.
export function decryptLinkSourceAccess(envelope, privateKey, { expectedRunId, expectedSourceSha, now = Date.now() }) {
  context(expectedRunId, expectedSourceSha);
  try {
    const header = envelope?.header;
    const expected = { schema: LINK_ACCESS.schema, alg: 'RSA-OAEP-256', enc: 'A256GCM', purpose: 'link_internet_source_read_only', repository: LINK_ACCESS.repository, workflowRunId: expectedRunId, sourceSha: expectedSourceSha, recipientFingerprint: fingerprint(createPublicKey(privateKey)) };
    if (!object(envelope) || Object.keys(envelope).sort().join() !== ['header', 'encryptedKey', 'iv', 'tag', 'ciphertext'].sort().join() || !same(header, expected)) fail(LINK_ACCESS_ERROR.ENVELOPE);
    const secret = privateDecrypt({ key: privateKey, oaepHash: 'sha256', padding: constants.RSA_PKCS1_OAEP_PADDING }, base64(envelope.encryptedKey));
    try {
      const iv = base64(envelope.iv), tag = base64(envelope.tag);
      if (secret.length !== 32 || iv.length !== 12 || tag.length !== 16) fail(LINK_ACCESS_ERROR.ENVELOPE);
      const cipher = createDecipheriv('aes-256-gcm', secret, iv); cipher.setAAD(Buffer.from(JSON.stringify(header))); cipher.setAuthTag(tag);
      const plaintext = Buffer.concat([cipher.update(base64(envelope.ciphertext)), cipher.final()]);
      try { return payload(JSON.parse(plaintext.toString('utf8')), now); } finally { plaintext.fill(0); }
    } finally { secret.fill(0); }
  } catch (error) { if (error.code === LINK_ACCESS_ERROR.EXPIRED) throw error; fail(LINK_ACCESS_ERROR.ENVELOPE); }
}

async function response(fetchImpl, url, options, code) {
  let res;
  try { res = await fetchImpl(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(20000) }); } catch { fail(code); }
  if (res.status !== 200 || Number(res.headers.get('content-length') || 0) > 2 * 1024 ** 2) fail(code);
  const chunks = []; let size = 0;
  for await (const chunk of res.body) { size += chunk.length; if (size > 2 * 1024 ** 2) fail(code); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
export async function verifyLinkSourceReads(token, { fetchImpl = fetch } = {}) {
  if (!validToken(token)) fail(LINK_ACCESS_ERROR.INPUT);
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  const api = async (path, code) => { try { return JSON.parse((await response(fetchImpl, `https://api.github.com${path}`, { headers }, code)).toString('utf8')); } catch (error) { if (error.code) throw error; fail(code); } };
  const repos = await api('/installation/repositories?per_page=100', LINK_ACCESS_ERROR.SCOPE);
  if (repos.total_count !== 3 || !Array.isArray(repos.repositories) || !same(repos.repositories.map((r) => r.full_name).sort(), [...LINK_ACCESS.repositories].sort())) fail(LINK_ACCESS_ERROR.SCOPE);
  for (const repo of LINK_ACCESS.repositories) {
    const entry = await api(`/repos/${repo}/contents/package.json?ref=${repo.endsWith('/opl-link') ? LINK_ACCESS.sourceSha : 'main'}`, LINK_ACCESS_ERROR.SOURCE);
    if (entry.type !== 'file' || entry.path !== 'package.json' || !sha.test(entry.sha)) fail(LINK_ACCESS_ERROR.SOURCE);
  }
  const run = await api(`/repos/gaofeng21cn/opl-link/actions/runs/${LINK_ACCESS.sourceRunId}`, LINK_ACCESS_ERROR.ACTIONS);
  if (run.id !== Number(LINK_ACCESS.sourceRunId) || run.head_sha !== LINK_ACCESS.sourceSha || run.head_branch !== 'main' || run.status !== 'completed' || run.conclusion !== 'success' || run.path !== '.github/workflows/link-service.yml') fail(LINK_ACCESS_ERROR.ACTIONS);
  const artifacts = await api(`/repos/gaofeng21cn/opl-link/actions/runs/${LINK_ACCESS.sourceRunId}/artifacts?per_page=100`, LINK_ACCESS_ERROR.ACTIONS);
  if (!artifacts.artifacts?.some((a) => a.name === 'link-service-image' && a.expired === false)) fail(LINK_ACCESS_ERROR.ACTIONS);
  return { repositoryScope: true, privateSources: true, buildArtifact: true };
}

async function main(env) {
  if (env.GITHUB_REPOSITORY !== LINK_ACCESS.repository || env.GITHUB_REF !== 'refs/heads/main' || !env.RUNNER_TEMP) fail(LINK_ACCESS_ERROR.INPUT);
  context(env.GITHUB_RUN_ID, env.GITHUB_SHA);
  const directory = join(env.RUNNER_TEMP, 'link-source-access'); await mkdir(directory, { recursive: true, mode: 0o700 });
  const result = { schema: LINK_ACCESS.resultSchema, ok: false, code: LINK_ACCESS_ERROR.INPUT };
  try {
    if (process.argv[2] === 'prepare') {
      if (env.PACKAGE_RELEASE_APP_ID !== LINK_ACCESS.appId || !env.GITHUB_OUTPUT) fail(LINK_ACCESS_ERROR.INPUT);
      recipientKey(env.PUBLIC_KEY_B64);
      await appendFile(env.GITHUB_OUTPUT, `mint_started_at=${new Date().toISOString()}\n`); return;
    }
    if (process.argv[2] === 'mint-failed') fail(LINK_ACCESS_ERROR.MINT);
    if (process.argv[2] !== 'seal') fail(LINK_ACCESS_ERROR.INPUT);
    recipientKey(env.PUBLIC_KEY_B64);
    const started = Date.parse(env.MINT_STARTED_AT);
    if (!Number.isFinite(started)) fail(LINK_ACCESS_ERROR.INPUT);
    const value = payload({ schema: LINK_ACCESS.payloadSchema, token: env.LINK_SOURCE_ACCESS_TOKEN, allowedRepositories: [...LINK_ACCESS.repositories], permissions: { ...LINK_ACCESS.permissions }, actualExpiryKnown: false, tokenMaxLifetimeSeconds: LINK_ACCESS.maxLifetimeSeconds, mintStartedAt: new Date(started).toISOString(), usableUntil: new Date(started + LINK_ACCESS.useWindowSeconds * 1000).toISOString() }, Date.now());
    const checks = await verifyLinkSourceReads(value.token);
    const encrypted = encryptLinkSourceAccess(value, env.PUBLIC_KEY_B64, { runId: env.GITHUB_RUN_ID, sourceSha: env.GITHUB_SHA });
    await writeFile(join(directory, 'encrypted-envelope.json'), JSON.stringify(encrypted) + '\n', { mode: 0o600, flag: 'wx' });
    Object.assign(result, { ok: true, code: '', checks, actualExpiryKnown: false, tokenMaxLifetimeSeconds: LINK_ACCESS.maxLifetimeSeconds, usableUntil: value.usableUntil });
  } catch (error) { result.code = Object.values(LINK_ACCESS_ERROR).includes(error.code) ? error.code : LINK_ACCESS_ERROR.INPUT; }
  await writeFile(join(directory, 'result.json'), JSON.stringify(result) + '\n', { mode: 0o600 });
  if (!result.ok) { process.stderr.write(result.code + '\n'); process.exitCode = 1; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.env).catch(() => { process.stderr.write(LINK_ACCESS_ERROR.INPUT + '\n'); process.exitCode = 1; });

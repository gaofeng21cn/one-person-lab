import fs from 'node:fs';
import path from 'node:path';
import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';

export const OPL_LINK_RELAY_ORIGIN = 'https://link.medopl.com';

export type CompanionHostDevice = {
  deviceId: string;
  role: 'host';
  name: string;
  platform: string;
  identityKey: string;
  clientVersion: string;
  harnessVersion?: string;
};

function failure(reason: string, message: string) {
  return new FrameworkContractError('launcher_failed', message, { reason_code: reason });
}

export function parseCompanionAuthorizationRequest(value: unknown): CompanionHostDevice {
  if (!isRecord(value) || Object.keys(value).some(key => !['service', 'device'].includes(key))
    || value.service !== 'opl_link' || !isRecord(value.device)) {
    throw failure('invalid_request', 'A supported companion authorization request is required.');
  }
  const device = value.device;
  const fields = ['deviceId', 'role', 'name', 'platform', 'identityKey', 'clientVersion', 'harnessVersion'];
  if (Object.keys(device).some(key => !fields.includes(key)) || device.role !== 'host'
    || !['deviceId', 'name', 'platform', 'identityKey', 'clientVersion'].every(key =>
      typeof device[key] === 'string' && device[key].trim().length > 0 && Buffer.byteLength(device[key]) <= 512)
    || (device.harnessVersion !== undefined && (typeof device.harnessVersion !== 'string'
      || !device.harnessVersion.trim() || Buffer.byteLength(device.harnessVersion) > 512))) {
    throw failure('invalid_request', 'A bounded host public identity is required.');
  }
  if (!/^(?:[0-9A-HJKMNP-TV-Z]{26}|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.test(device.deviceId as string)
    || Buffer.byteLength(device.name as string) > 128
    || (device.platform as string).length > 64 || !/^[a-z0-9][a-z0-9._-]*$/.test(device.platform as string)
    || Buffer.byteLength(device.clientVersion as string) > 64
    || (typeof device.harnessVersion === 'string' && Buffer.byteLength(device.harnessVersion) > 64)) {
    throw failure('invalid_request', 'The host descriptor must match the companion protocol.');
  }
  if (!/^[A-Za-z0-9_-]{43}$/.test(device.identityKey as string)
    || Buffer.from(device.identityKey as string, 'base64url').length !== 32
    || Buffer.from(device.identityKey as string, 'base64url').toString('base64url') !== device.identityKey) {
    throw failure('invalid_request', 'A canonical host public key is required.');
  }
  return device as CompanionHostDevice;
}

function relayOrigin(): string {
  const override = process.env.OPL_LINK_RELAY_BASE_URL;
  if (override && process.env.NODE_ENV === 'test') {
    const url = new URL(override);
    if (['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      && ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      && url.pathname === '/' && !url.search && !url.hash) return url.origin;
    throw failure('invalid_request', 'The isolated companion test endpoint is invalid.');
  }
  return OPL_LINK_RELAY_ORIGIN;
}

export async function exchangeCompanionCredentials(device: CompanionHostDevice, accessToken: string) {
  const origin = relayOrigin();
  let response: Response;
  try {
    response = await fetch(`${origin}/api/v1/devices/register`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ v: 1, device }),
    });
  } catch {
    throw failure('companion_service_unavailable', 'Phone access could not connect. Try again in the App.');
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    const reason = response.status === 401 ? 'reauth_required'
      : response.status === 403 ? 'companion_access_denied'
        : response.status === 429 ? 'companion_capacity_limited' : 'companion_service_unavailable';
    throw failure(reason, 'Phone access authorization did not complete.');
  }
  const reader = response.body?.getReader();
  let raw = '';
  if (!reader) throw failure('companion_response_invalid', 'Phone access returned an incomplete response.');
  try {
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 16 * 1024) throw new Error('response too large');
      chunks.push(chunk.value);
    }
    raw = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
  } catch {
    await reader.cancel().catch(() => {});
    throw failure('companion_response_invalid', 'Phone access returned an invalid response.');
  } finally { reader.releaseLock(); }
  let result: unknown;
  try { result = JSON.parse(raw); } catch {
    throw failure('companion_response_invalid', 'Phone access returned an invalid response.');
  }
  const now = Date.now();
  if (!isRecord(result) || result.serverUrl !== origin
    || typeof result.accountScope !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(result.accountScope)
    || Buffer.from(result.accountScope, 'base64url').toString('base64url') !== result.accountScope
    || !['accessToken', 'refreshToken'].every(key => typeof result[key] === 'string'
      && Buffer.byteLength(result[key]) >= 16 && Buffer.byteLength(result[key]) <= 4096)
    || !['accessTokenExpiresAt', 'refreshTokenExpiresAt'].every(key => Number.isSafeInteger(result[key])
      && Number(result[key]) > now && Number(result[key]) <= now + 31 * 86400_000)
    || Number(result.accessTokenExpiresAt) > Number(result.refreshTokenExpiresAt)) {
    throw failure('companion_response_invalid', 'Phone access returned invalid credentials.');
  }
  return {
    schema: 'opl_link_remote_credentials.v1', serverUrl: origin, accountScope: result.accountScope,
    deviceId: device.deviceId, identityKey: device.identityKey, role: 'host',
    accessToken: result.accessToken as string, accessTokenExpiresAt: result.accessTokenExpiresAt as number,
    refreshToken: result.refreshToken as string, refreshTokenExpiresAt: result.refreshTokenExpiresAt as number,
  };
}

/** Keep credentials out of CLI output and validate the private destination before rotating an account session. */
export async function writeCompanionAuthorization(
  request: unknown,
  outputFile: string,
  authorize: (device: CompanionHostDevice) => Promise<Awaited<ReturnType<typeof exchangeCompanionCredentials>>>,
) {
  const device = parseCompanionAuthorizationRequest(request);
  if (!path.isAbsolute(outputFile) || outputFile.length > 4096) {
    throw failure('invalid_request', 'A fresh private credential destination is required.');
  }
  const parent = path.dirname(outputFile);
  let canonical: string;
  let descriptor: number;
  try {
    const stat = fs.lstatSync(parent);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0
      || (process.getuid && stat.uid !== process.getuid())) throw new Error('private directory required');
    canonical = path.join(fs.realpathSync(parent), path.basename(outputFile));
    descriptor = fs.openSync(canonical, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL
      | (fs.constants.O_NOFOLLOW ?? 0), 0o600);
  } catch {
    throw failure('invalid_request', 'The credential destination must be new and inside a private directory.');
  }
  let written = false;
  try {
    const credentials = await authorize(device);
    fs.writeFileSync(descriptor, JSON.stringify(credentials), { encoding: 'utf8' });
    fs.fsyncSync(descriptor);
    written = true;
    return { companion_authorization: {
      service: 'opl_link', credential_written: true,
      serverUrl: credentials.serverUrl, accountScope: credentials.accountScope, deviceId: credentials.deviceId,
    } };
  } finally {
    fs.closeSync(descriptor);
    if (!written) fs.rmSync(canonical!, { force: true });
  }
}

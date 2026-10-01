import { spawn } from 'node:child_process';
import path from 'node:path';
import { ResponseBodyTooLargeError } from '../http-response-body.ts';

const CERTIFICATE_CODES = new Set(['SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY']);
const STATUS_MARKER = '\nOPL_GATEWAY_HTTP_STATUS:';

// Some local TLS inspection paths reject Node's HTTP/1 connection while the
// system HTTP/2 transport reaches the same HTTPS origin with a valid public
// chain. Keep verification enabled and send all credentials through stdin.
export async function gatewayFetch(url: string, init: RequestInit, {
  fetchImpl = fetch,
  spawnImpl = spawn,
  maxBytes = 1024 * 1024,
} = {}): Promise<Response> {
  try { return await fetchImpl(url, init); }
  catch (error) {
    const cause = error instanceof Error ? error.cause as { code?: string } | undefined : undefined;
    if (!CERTIFICATE_CODES.has(cause?.code ?? '') || new URL(url).protocol !== 'https:') throw error;
  }
  const config = [
    `url = ${JSON.stringify(url)}`,
    `request = ${JSON.stringify(init.method ?? 'GET')}`,
    ...Array.from(new Headers(init.headers).entries(), ([key, value]) => `header = ${JSON.stringify(`${key}: ${value}`)}`),
    ...(typeof init.body === 'string' ? [`data-binary = ${JSON.stringify(init.body)}`] : []),
    `write-out = "\\nOPL_GATEWAY_HTTP_STATUS:%{http_code}"`,
  ].join('\n') + '\n';
  return new Promise<Response>((resolve, reject) => {
    const command = process.platform === 'win32'
      ? path.win32.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'curl.exe') : '/usr/bin/curl';
    const child = spawnImpl(command, ['--disable', '--silent', '--show-error', '--http2', '--max-time', '10', '--config', '-'], {
      stdio: ['pipe', 'pipe', 'pipe'], shell: false, windowsHide: true, signal: init.signal ?? undefined,
    });
    const chunks: Buffer[] = []; let size = 0, settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true; child.kill(); reject(error);
    };
    child.stderr?.resume(); // Never include transport diagnostics or response credentials in errors.
    child.stdout?.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes + 128) fail(new ResponseBodyTooLargeError(maxBytes, size));
      else chunks.push(chunk);
    });
    child.once('error', () => fail(Object.assign(new Error('Gateway system HTTPS transport failed.'), { name: init.signal?.aborted ? 'AbortError' : 'Error' })));
    child.stdin?.on('error', () => fail(new Error('Gateway system HTTPS transport input failed.')));
    child.once('close', code => {
      if (settled) return;
      settled = true;
      const output = Buffer.concat(chunks).toString('utf8'), index = output.lastIndexOf(STATUS_MARKER);
      const status = Number(index < 0 ? '' : output.slice(index + STATUS_MARKER.length));
      if (code !== 0 || index < 0 || status < 200 || status > 599 || !Number.isInteger(status)) {
        reject(new Error('Gateway system HTTPS transport failed.')); return;
      }
      const body = output.slice(0, index);
      if (Buffer.byteLength(body) > maxBytes) { reject(new ResponseBodyTooLargeError(maxBytes, Buffer.byteLength(body))); return; }
      resolve(new Response(status === 204 || status === 205 || status === 304 ? null : body, { status }));
    });
    child.stdin?.end(config);
  });
}

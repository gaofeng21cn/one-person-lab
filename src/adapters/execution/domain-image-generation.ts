import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { crc32 } from 'node:zlib';

import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { readLocalCodexModelConnection } from '../../kernel/local-codex-defaults.ts';
import { readResponseBody } from '../../kernel/http-response-body.ts';

export type DomainImageGenerationInput = {
  prompt: string;
  output_path: string;
  model?: string;
  size?: string;
  quality?: 'auto' | 'low' | 'medium' | 'high';
  background?: 'auto' | 'opaque' | 'transparent';
  reference_image_paths?: string[];
  timeout_ms?: number;
};

export type DomainImageGenerationReceipt = {
  surface_kind: 'opl_domain_image_generation';
  status: 'completed';
  output_path: string;
  image_sha256: string;
  model: string;
  operation: 'generate' | 'edit';
  request_id: string | null;
};

type FailureCode = 'invalid_image_request' | 'image_provider_unavailable' | 'image_provider_rejected'
  | 'image_generation_unknown' | 'image_response_invalid' | 'image_output_unavailable';

function failure(code: FailureCode, outcome: 'not_started' | 'rejected' | 'unknown') {
  return new FrameworkContractError('codex_command_failed', 'Image generation did not produce a confirmed local artifact.', {
    failure_code: code, outcome, retry_allowed: false,
  });
}

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_IMAGE_BYTES = 64 * 1024 * 1024;
const MAX_RESPONSE_BYTES = Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 1024 * 1024;

function assertCompletePng(bytes: Buffer) {
  if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error();
  let offset = 8;
  let imageData = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const end = offset + length + 12;
    if (end > bytes.length) throw new Error();
    const kind = bytes.subarray(offset + 4, offset + 8).toString('ascii');
    if (crc32(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)) throw new Error();
    if (offset === 8 && (kind !== 'IHDR' || length !== 13
      || bytes.readUInt32BE(offset + 8) === 0 || bytes.readUInt32BE(offset + 12) === 0)) throw new Error();
    if (offset !== 8 && kind === 'IHDR') throw new Error();
    if (kind === 'IDAT' && length > 0) imageData = true;
    if (kind === 'IEND') {
      if (length !== 0 || end !== bytes.length || !imageData) throw new Error();
      return;
    }
    offset = end;
  }
  throw new Error();
}

function referenceImage(file: string, index: number) {
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > MAX_IMAGE_BYTES) throw failure('invalid_image_request', 'not_started');
  const bytes = fs.readFileSync(file);
  if (bytes.subarray(0, 8).equals(PNG_SIGNATURE)) assertCompletePng(bytes);
  const kind = bytes.subarray(0, 8).equals(PNG_SIGNATURE) ? ['png', 'image/png']
    : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? ['jpg', 'image/jpeg']
    : bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP'
      ? ['webp', 'image/webp'] : null;
  if (!kind) throw failure('invalid_image_request', 'not_started');
  return { blob: new Blob([bytes], { type: kind[1] }), name: `reference-${index + 1}.${kind[0]}` };
}

/**
 * One bounded Images API attempt using the caller's active Codex provider.
 * Credentials stay in this process; no retries, redirects, provider messages,
 * SDK installation, or writes to the credential owner are performed.
 */
export async function runDomainImageGeneration(
  input: DomainImageGenerationInput,
  context: { config_path?: string; env?: NodeJS.ProcessEnv; fetch?: typeof fetch } = {},
): Promise<DomainImageGenerationReceipt> {
  const model = input.model ?? 'gpt-image-2';
  const timeoutMs = input.timeout_ms ?? 180_000;
  if (typeof input.prompt !== 'string' || !input.prompt.trim()
    || typeof input.output_path !== 'string' || !input.output_path.trim()
    || typeof model !== 'string' || !/^[A-Za-z0-9._:-]{1,100}$/.test(model)
    || !Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 600_000
    || (input.size !== undefined && !/^(auto|[1-9][0-9]{1,4}x[1-9][0-9]{1,4})$/.test(input.size))
    || (input.quality !== undefined && !['auto', 'low', 'medium', 'high'].includes(input.quality))
    || (input.background !== undefined && !['auto', 'opaque', 'transparent'].includes(input.background))
    || (input.reference_image_paths !== undefined && (!Array.isArray(input.reference_image_paths)
      || input.reference_image_paths.length > 16 || input.reference_image_paths.some((item) => typeof item !== 'string')))) {
    throw failure('invalid_image_request', 'not_started');
  }
  const outputPath = path.resolve(input.output_path);
  let references: ReturnType<typeof referenceImage>[];
  try {
    if (fs.existsSync(outputPath)) throw failure('invalid_image_request', 'not_started');
    references = (input.reference_image_paths ?? []).map(referenceImage);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  } catch {
    throw failure('invalid_image_request', 'not_started');
  }
  let endpoint: URL;
  let credential: string;
  try {
    const connection = readLocalCodexModelConnection(context);
    if (!connection.base_url || !connection.credential) throw new Error();
    const base = new URL(connection.base_url);
    if (base.username || base.password || base.search || base.hash
      || !['https:', 'http:'].includes(base.protocol)) throw new Error();
    // Unencrypted credentials are only valid for a caller-selected local proxy.
    if (base.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)) throw new Error();
    base.pathname = `${base.pathname.replace(/\/+$/, '')}/images/${references.length ? 'edits' : 'generations'}`;
    endpoint = base;
    credential = connection.credential;
  } catch {
    throw failure('image_provider_unavailable', 'not_started');
  }
  const fields = {
    model, prompt: input.prompt, n: '1', output_format: 'png',
    size: input.size ?? 'auto', quality: input.quality ?? 'auto', background: input.background ?? 'auto',
  };
  let body: string | FormData;
  const headers: Record<string, string> = { Authorization: `Bearer ${credential}` };
  if (references.length) {
    body = new FormData();
    for (const [name, value] of Object.entries(fields)) body.set(name, value);
    for (const reference of references) body.append('image[]', reference.blob, reference.name);
  } else {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify({ ...fields, n: 1 });
  }
  let response: Response;
  try {
    response = await (context.fetch ?? fetch)(endpoint, {
      method: 'POST', headers, body, redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    // A timeout/disconnect can follow a completed paid generation. Never retry.
    throw failure('image_generation_unknown', 'unknown');
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw failure('image_provider_rejected', response.status >= 500 ? 'unknown' : 'rejected');
  }
  let bytes: Buffer;
  try {
    const payload: unknown = JSON.parse(await readResponseBody(response, MAX_RESPONSE_BYTES));
    const first = isRecord(payload) && Array.isArray(payload.data) ? payload.data[0] : null;
    const encoded = isRecord(first) ? first.b64_json : null;
    if (typeof encoded !== 'string' || encoded.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4
      || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error();
    bytes = Buffer.from(encoded, 'base64');
    if (bytes.length > MAX_IMAGE_BYTES) throw new Error();
    assertCompletePng(bytes);
  } catch {
    if (!response.body?.locked) await response.body?.cancel().catch(() => {});
    throw failure('image_response_invalid', 'unknown');
  }
  try {
    fs.writeFileSync(outputPath, bytes, { flag: 'wx', mode: 0o600 });
  } catch {
    throw failure('image_output_unavailable', 'unknown');
  }
  return {
    surface_kind: 'opl_domain_image_generation', status: 'completed', output_path: outputPath,
    image_sha256: createHash('sha256').update(bytes).digest('hex'), model,
    operation: references.length ? 'edit' : 'generate',
    // Provider-controlled header text is not a safe diagnostic or artifact field.
    request_id: null,
  };
}

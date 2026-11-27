const DEFAULT_MAX_RESPONSE_BODY_BYTES = 8 * 1024 * 1024;

export class ResponseBodyTooLargeError extends Error {
  readonly code = 'response_body_too_large';
  readonly limitBytes: number;
  readonly observedBytes: number;

  constructor(limitBytes: number, observedBytes: number) {
    super(`HTTP response body exceeded the ${limitBytes}-byte limit.`);
    this.name = 'ResponseBodyTooLargeError';
    this.limitBytes = limitBytes;
    this.observedBytes = observedBytes;
  }
}

export function maxResponseBodyBytes(callerDefaultBytes = DEFAULT_MAX_RESPONSE_BODY_BYTES) {
  const raw = process.env.OPL_CONNECT_MAX_RESPONSE_BODY_BYTES?.trim();
  if (!raw) return callerDefaultBytes;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : callerDefaultBytes;
}

function declaredContentLength(response: Response) {
  const raw = response.headers.get('content-length');
  if (!raw || !/^\d+$/.test(raw.trim())) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export async function readResponseBody(response: Response, limitBytes = maxResponseBodyBytes()) {
  const declaredBytes = declaredContentLength(response);
  if (declaredBytes !== null && declaredBytes > limitBytes) {
    throw new ResponseBodyTooLargeError(limitBytes, declaredBytes);
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let observedBytes = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        text += decoder.decode();
        return text;
      }
      observedBytes += value.byteLength;
      if (observedBytes > limitBytes) {
        await reader.cancel('response body exceeded configured limit');
        throw new ResponseBodyTooLargeError(limitBytes, observedBytes);
      }
      text += decoder.decode(value, { stream: true });
    }
  } catch (error) {
    try {
      await reader.cancel(error);
    } catch {
      // The stream may already be closed or aborted.
    }
    throw error;
  }
}

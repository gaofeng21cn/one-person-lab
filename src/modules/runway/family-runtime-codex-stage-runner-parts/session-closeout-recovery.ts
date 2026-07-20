import {
  parseCodexExecOutput,
  recoverCodexExecOutputFromSession,
} from '../codex.ts';
import { parseJsonText } from '../../../kernel/json-file.ts';
import {
  normalizeTypedStageCloseoutPacket,
} from './closeout-normalization.ts';
import {
  isRecord,
  normalizeTimeoutMs,
  type JsonRecord,
} from './shared.ts';

export function parseTerminalJsonRecordFromCodexMessages(messages: string[]): JsonRecord | null {
  const terminalMessages = messages.filter((entry) => entry.trim().length > 0);
  if (terminalMessages.length === 0) {
    return null;
  }
  const maxSuffixMessages = 64;
  const maxSuffixChars = 128 * 1024;
  let suffix = '';
  for (let index = terminalMessages.length - 1; index >= 0 && terminalMessages.length - index <= maxSuffixMessages; index -= 1) {
    suffix = `${terminalMessages[index]}${suffix}`;
    if (suffix.length > maxSuffixChars) {
      break;
    }
    try {
      const parsed = parseJsonText(suffix.trim());
      if (isRecord(parsed)) return parsed;
    } catch {
      // Keep scanning only adjacent terminal message chunks for one exact JSON object.
    }
  }
  return null;
}

export function parseCloseoutFromCodexMessages(messages: string[]) {
  const candidate = parseTerminalJsonRecordFromCodexMessages(messages);
  if (!candidate) return null;
  try {
    return normalizeTypedStageCloseoutPacket(candidate);
  } catch {
    // Keep fail-closed: an exact JSON object still must satisfy the typed closeout contract.
    return null;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function recoverCloseoutFromCodexSessionWithRetry(input: {
  threadId: string | null;
  timeoutMs: number;
  intervalMs: number;
}) {
  const timeoutMs = normalizeTimeoutMs(input.timeoutMs, 0);
  const intervalMs = normalizeTimeoutMs(input.intervalMs, 100);
  const startedAt = Date.now();
  let attempts = 0;
  let latestRecovered: ReturnType<typeof recoverCodexExecOutputFromSession> = null;
  let latestParsed: ReturnType<typeof parseCodexExecOutput> | null = null;

  while (true) {
    attempts += 1;
    latestRecovered = recoverCodexExecOutputFromSession(input.threadId);
    if (latestRecovered) {
      latestParsed = parseCodexExecOutput(latestRecovered.output);
      const closeoutPacket = parseCloseoutFromCodexMessages(latestParsed.messages);
      if (closeoutPacket) {
        return {
          closeoutPacket,
          recovered: latestRecovered,
          parsed: latestParsed,
          attempts,
          status: 'closeout_found',
        };
      }
    }

    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs >= timeoutMs) {
      return {
        closeoutPacket: null,
        recovered: latestRecovered,
        parsed: latestParsed,
        attempts,
        status: latestRecovered ? 'session_found_without_closeout' : 'session_not_found',
      };
    }

    await sleep(Math.min(intervalMs, Math.max(0, timeoutMs - elapsedMs)));
  }
}

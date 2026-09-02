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

const MAX_CLOSEOUT_SUFFIX_MESSAGES = 64;
const MAX_CLOSEOUT_SUFFIX_CHARS = 128 * 1024;

function topLevelArtifactIdentity(candidate: JsonRecord) {
  const entries = Array.isArray(candidate.artifact_refs) ? candidate.artifact_refs : [];
  const refs = entries.map((entry) => {
    if (typeof entry === 'string' && entry.trim()) return entry.trim();
    if (!isRecord(entry)) return null;
    return typeof entry.ref === 'string' && entry.ref.trim()
      ? entry.ref.trim()
      : typeof entry.uri === 'string' && entry.uri.trim()
        ? entry.uri.trim()
        : null;
  });
  if (refs.length === 0 || refs.some((ref) => !ref)) return null;
  const explicitHashes = Array.isArray(candidate.artifact_hashes)
    ? candidate.artifact_hashes
    : [];
  const entryHashes = entries.map((entry) => (
    isRecord(entry) && typeof entry.sha256 === 'string' && entry.sha256.trim()
      ? entry.sha256.trim()
      : null
  ));
  const hashes = (explicitHashes.length > 0 ? explicitHashes : entryHashes)
    .map((hash) => typeof hash === 'string' && hash.trim() ? hash.trim() : null);
  if (hashes.length !== refs.length || hashes.some((hash) => !hash)) return null;
  return {
    artifact_refs: refs as string[],
    artifact_hashes: hashes as string[],
  };
}

export function normalizeCodexTransportCloseoutCandidate(candidate: JsonRecord): JsonRecord {
  const routeImpact = isRecord(candidate.route_impact) ? candidate.route_impact : null;
  const artifactIdentity = topLevelArtifactIdentity(candidate);
  if (!routeImpact && !artifactIdentity) return candidate;
  const stageQualityCycle = routeImpact && isRecord(routeImpact.stage_quality_cycle)
    ? routeImpact.stage_quality_cycle
    : {};
  return {
    ...candidate,
    route_impact: {
      ...(routeImpact ?? {}),
      ...(artifactIdentity
        ? {
            stage_quality_cycle: {
              ...stageQualityCycle,
              ...artifactIdentity,
            },
          }
        : {}),
    },
  };
}

function parseJsonRecordEndingAtCodexMessage(messages: string[], endIndex: number): JsonRecord | null {
  let suffix = '';
  for (
    let index = endIndex;
    index >= 0 && endIndex - index < MAX_CLOSEOUT_SUFFIX_MESSAGES;
    index -= 1
  ) {
    suffix = `${messages[index]}${suffix}`;
    if (suffix.length > MAX_CLOSEOUT_SUFFIX_CHARS) {
      break;
    }
    try {
      const parsed = parseJsonText(suffix.trim());
      if (isRecord(parsed)) return parsed;
    } catch {
      // A typed packet may be split only across messages adjacent to this end boundary.
    }
  }
  return null;
}

export function parseTerminalJsonRecordFromCodexMessages(messages: string[]): JsonRecord | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].trim().length === 0) continue;
    return parseJsonRecordEndingAtCodexMessage(messages, index);
  }
  return null;
}

export function parseCloseoutFromCodexMessages(messages: string[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].trim().length === 0) continue;
    const candidate = parseJsonRecordEndingAtCodexMessage(messages, index);
    if (!candidate) continue;
    try {
      return normalizeTypedStageCloseoutPacket(candidate);
    } catch {
      // Keep scanning older exact JSON objects; only a normalized typed packet is selectable.
    }
  }
  return null;
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

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { record, stringValue as optionalString } from '../../../kernel/json-record.ts';
import type { JsonRecord } from './shared.ts';
import type { TypedStageCloseoutPacket } from './closeout-normalization.ts';

const CONTENT_REF_PATTERN = /^opl-content:\/\/sha256\/([a-f0-9]{64})$/;
const AGENT_BLUEPRINT_SURFACE_KIND = 'opl_foundry_agent_blueprint';
const MAX_CONTENT_ARTIFACT_BYTES = 16 * 1024 * 1024;
const MAX_SCAN_DEPTH = 6;
const SKIPPED_DIRECTORIES = new Set(['provider-inputs', 'node_modules', '.git']);

function cycleOf(packet: TypedStageCloseoutPacket) {
  return record(record(packet.route_impact).stage_quality_cycle);
}

function cycleRefs(packet: TypedStageCloseoutPacket): string[] {
  const refs = cycleOf(packet).artifact_refs;
  return Array.isArray(refs)
    ? refs.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    : [];
}

function cycleHashes(packet: TypedStageCloseoutPacket): string[] {
  const hashes = cycleOf(packet).artifact_hashes;
  return Array.isArray(hashes)
    ? hashes.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    : [];
}

function filePathFromRef(ref: string): string | null {
  if (!ref.startsWith('file://')) return null;
  try {
    return decodeURIComponent(new URL(ref).pathname);
  } catch {
    return null;
  }
}

function collectContentRefs(value: unknown, found: Set<string>) {
  if (typeof value === 'string') {
    const match = CONTENT_REF_PATTERN.exec(value);
    if (match) found.add(match[1]!);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectContentRefs(entry, found);
    return;
  }
  const asRecord = record(value);
  for (const entry of Object.values(asRecord)) collectContentRefs(entry, found);
}

/**
 * Content refs of the AgentBlueprint a Stage artifact carries. Only the blueprint surface
 * transports bytes; other Stage reports quote content refs for context without owning the
 * transport obligation, and hydrating those would swell every Review with members the
 * contract never asked for.
 */
export function blueprintContentRefsInArtifacts(refs: string[]) {
  const found = new Set<string>();
  for (const ref of refs) {
    const filePath = filePathFromRef(ref);
    if (!filePath) continue;
    let bytes: Buffer;
    try {
      bytes = fs.readFileSync(filePath);
    } catch {
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(bytes.toString('utf8'));
    } catch {
      continue;
    }
    const asRecord = record(parsed);
    if (asRecord.surface_kind !== AGENT_BLUEPRINT_SURFACE_KIND) continue;
    collectContentRefs(asRecord, found);
  }
  return found;
}

function findFilesBySha256(input: {
  root: string;
  wanted: Set<string>;
  found: Map<string, { ref: string; sha256: string; sizeBytes: number }>;
  depth?: number;
}) {
  const depth = input.depth ?? 0;
  if (depth > MAX_SCAN_DEPTH || input.found.size >= input.wanted.size) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(input.root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (input.found.size >= input.wanted.size) return;
    const entryPath = path.join(input.root, entry.name);
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
      findFilesBySha256({ ...input, root: entryPath, depth: depth + 1 });
      continue;
    }
    if (!entry.isFile()) continue;
    let stat: fs.Stats;
    try {
      stat = fs.statSync(entryPath);
    } catch {
      continue;
    }
    if (stat.size <= 0 || stat.size > MAX_CONTENT_ARTIFACT_BYTES) continue;
    let bytes: Buffer;
    try {
      bytes = fs.readFileSync(entryPath);
    } catch {
      continue;
    }
    const digest = crypto.createHash('sha256').update(bytes).digest('hex');
    if (!input.wanted.has(digest) || input.found.has(digest)) continue;
    input.found.set(digest, {
      ref: pathToFileURL(entryPath).href,
      sha256: digest,
      sizeBytes: bytes.length,
    });
  }
}

/**
 * A provider that exposes a content-addressed blueprint must also transport the bytes
 * behind every `opl-content://sha256/...` ref, and the terminal reader only picks those
 * bytes up from the closeout's Stage quality artifact identity. Producers routinely write
 * the content files (often named after their own digest) and then declare only the
 * top-level blueprint, which fails the run at the very last readback — the 2026-11-11
 * evaluation-design Stage did exactly that with 29 content refs.
 *
 * Declare every content file this Attempt produced whose bytes hash to the referenced
 * digest, so transport verification keeps proving the identity rather than trusting it.
 */
export function hydrateContentRefTransport(input: {
  closeoutPacket: TypedStageCloseoutPacket | null;
  attempt: JsonRecord;
  workspaceRoot: string;
}) {
  const packet = input.closeoutPacket;
  const role = optionalString(input.attempt.attempt_role);
  if (!packet || (role !== 'producer' && role !== 'repairer')) return packet;
  const refs = cycleRefs(packet);
  if (refs.length === 0) return packet;
  const referenced = blueprintContentRefsInArtifacts(refs);
  if (referenced.size === 0) return packet;
  const known = new Set(cycleHashes(packet).map((hash) => hash.replace(/^sha256:/, '')));
  const wanted = new Set([...referenced].filter((digest) => !known.has(digest)));
  if (wanted.size === 0) return packet;
  if (!input.workspaceRoot || !fs.existsSync(input.workspaceRoot)) return packet;
  const found = new Map<string, { ref: string; sha256: string; sizeBytes: number }>();
  findFilesBySha256({ root: input.workspaceRoot, wanted, found });
  if (found.size === 0) return packet;

  const metadata = Array.isArray(packet.closeout_ref_metadata) ? packet.closeout_ref_metadata : [];
  const added = [...found.values()].sort((left, right) => left.sha256.localeCompare(right.sha256));
  const routeImpact = record(packet.route_impact);
  const cycle = record(routeImpact.stage_quality_cycle);
  const consumable = Array.isArray(routeImpact.consumable_artifact_refs)
    ? routeImpact.consumable_artifact_refs
    : [];
  // The packet was already normalized when it was parsed. Extend it instead of
  // re-normalizing, which would re-validate a shape this function only appends to.
  return {
    ...packet,
    closeout_refs: [
      ...(Array.isArray(packet.closeout_refs) ? packet.closeout_refs : []),
      ...added.map((entry) => ({
        ref: entry.ref,
        ref_kind: 'stage_artifact',
        sha256: entry.sha256,
        size_bytes: entry.sizeBytes,
      })),
    ],
    closeout_ref_metadata: [
      ...metadata,
      ...added.map((entry) => ({
        ref: entry.ref,
        sha256: entry.sha256,
        size_bytes: entry.sizeBytes,
        ref_kind: 'stage_artifact',
      })),
    ],
    route_impact: {
      ...routeImpact,
      stage_quality_cycle: {
        ...cycle,
        artifact_refs: [...refs, ...added.map((entry) => entry.ref)],
        artifact_hashes: [...cycleHashes(packet), ...added.map((entry) => `sha256:${entry.sha256}`)],
      },
      consumable_artifact_refs: [...consumable, ...added.map((entry) => entry.ref)],
    },
  } as TypedStageCloseoutPacket;
}

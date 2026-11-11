import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { stringValue as optionalString } from '../../../kernel/json-record.ts';
import { normalizeTypedStageCloseoutPacket } from './closeout-normalization.ts';
import { closeoutExecutionScopeFromAttempt } from './provider-result.ts';
import type { JsonRecord } from './shared.ts';

const MAX_DISCOVERED_ARTIFACTS = 12;
const MAX_SCAN_DEPTH = 3;
const ARTIFACT_EXTENSIONS = new Set(['.json', '.md', '.yaml', '.yml', '.txt', '.csv']);
// Stage artifacts live under `<stage>/` or `work/artifacts/` depending on where the
// producer chose to write, so only framework-owned input and tool trees are skipped.
const SKIPPED_DIRECTORIES = new Set(['provider-inputs', 'node_modules', '.git']);

type DiscoveredArtifact = {
  ref: string;
  sha256: string;
  sizeBytes: number;
  modifiedMs: number;
};

function collectArtifacts(input: {
  root: string;
  producedAfterMs: number;
  depth: number;
  found: DiscoveredArtifact[];
}) {
  if (input.depth > MAX_SCAN_DEPTH || input.found.length >= MAX_DISCOVERED_ARTIFACTS) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(input.root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (input.found.length >= MAX_DISCOVERED_ARTIFACTS) return;
    const entryPath = path.join(input.root, entry.name);
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
      collectArtifacts({ ...input, root: entryPath, depth: input.depth + 1 });
      continue;
    }
    if (!entry.isFile()) continue;
    if (!ARTIFACT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
    let stat: fs.Stats;
    try {
      stat = fs.statSync(entryPath);
    } catch {
      continue;
    }
    if (stat.size <= 0 || stat.mtimeMs < input.producedAfterMs) continue;
    let bytes: Buffer;
    try {
      bytes = fs.readFileSync(entryPath);
    } catch {
      continue;
    }
    input.found.push({
      ref: pathToFileURL(entryPath).href,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      sizeBytes: stat.size,
      modifiedMs: stat.mtimeMs,
    });
  }
}

/** True when the Attempt wrote at least one Stage artifact into its workspace. */
export function attemptProducedWorkspaceArtifact(input: {
  workspaceRoot: string | null | undefined;
  producedAfterMs: number;
}) {
  if (!input.workspaceRoot || !fs.existsSync(input.workspaceRoot)) return false;
  const found: DiscoveredArtifact[] = [];
  collectArtifacts({
    root: input.workspaceRoot,
    producedAfterMs: input.producedAfterMs,
    depth: 0,
    found,
  });
  return found.length > 0;
}

/**
 * A producer Attempt can finish its semantic work and still end its turn without any
 * typed closeout — no final message at all, prose instead of JSON, or a delegated
 * subagent that never reports back. Every one of those cases leaves a valid Stage
 * artifact on disk with no transport packet, and the StageRun controller then has
 * nothing to project. Derive a closeout from the artifacts this Attempt actually
 * wrote, so Review judges the work instead of the run dying on transport.
 *
 * The packet never claims domain readiness: it advances the Stage for review and
 * records the missing typed closeout as quality debt.
 */
export function buildWorkspaceArtifactCloseoutPacket(input: {
  attempt: JsonRecord;
  stagePacketRef: string;
  workspaceRoot: string;
  producedAfterMs: number;
}) {
  // Producers put Stage artifacts either in `artifacts/` or at the workspace root, so
  // scan the whole workspace and rely on the attempt-start filter to keep it to the
  // files this Attempt wrote.
  const scanRoot = input.workspaceRoot;
  if (!scanRoot || !fs.existsSync(scanRoot)) return null;
  const found: DiscoveredArtifact[] = [];
  collectArtifacts({ root: scanRoot, producedAfterMs: input.producedAfterMs, depth: 0, found });
  if (found.length === 0) return null;
  found.sort((left, right) => right.modifiedMs - left.modifiedMs);

  const stageAttemptId = optionalString(input.attempt.stage_attempt_id) ?? 'unknown-attempt';
  const idempotencyKey = optionalString(input.attempt.idempotency_key);
  const domainId = optionalString(input.attempt.domain_id);
  const producedRefs = found.map((artifact) => artifact.ref);
  return normalizeTypedStageCloseoutPacket({
    surface_kind: 'stage_attempt_closeout_packet',
    stage_attempt_id: stageAttemptId,
    ...(optionalString(input.attempt.stage_run_id)
      ? { stage_run_id: optionalString(input.attempt.stage_run_id) }
      : {}),
    ...closeoutExecutionScopeFromAttempt(input.attempt),
    ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
    closeout_refs: found.map((artifact) => ({
      ref: artifact.ref,
      ref_kind: 'stage_artifact',
      sha256: artifact.sha256,
      size_bytes: artifact.sizeBytes,
    })),
    consumed_refs: [input.stagePacketRef].filter((ref): ref is string => Boolean(ref)),
    consumed_memory_refs: [],
    writeback_receipt_refs: [],
    rejected_writes: [],
    next_owner: domainId ?? null,
    domain_ready_verdict: 'completed_with_quality_debt',
    route_impact: {
      // The quality cycle schedules formal Review from the typed cycle identity, and treats
      // a producer that declares none as having no consumable artifact at all — the
      // 2026-11-10 agent-blueprint-authoring Attempt wrote a 20 KB blueprint and was still
      // hard stopped. Declare the artifacts this Attempt actually wrote.
      stage_quality_cycle: {
        artifact_refs: producedRefs,
        artifact_hashes: found.map((artifact) => `sha256:${artifact.sha256}`),
      },
      transition_outcome: 'completed_with_quality_debt',
      consumable_artifact_refs: producedRefs,
      quality_debt_refs: [
        `opl://stage-attempts/${encodeURIComponent(stageAttemptId)}/quality-debt/typed_closeout_absent_workspace_artifacts_advanced`,
      ],
      normalization_findings: ['typed_closeout_absent_workspace_artifacts_advanced'],
      next_stage_may_start: true,
      route_back_selection_owner: 'codex_cli',
      route_back_may_target_any_declared_stage: true,
      negative_or_partial_output_counts_as_progress: true,
      framework_generated_envelope: true,
    },
    authority_boundary: {
      // Framework-derived rather than model-declared, but not a raw progress envelope:
      // the runner verifies every listed artifact against its bytes and attaches an
      // identity receipt to each one before the packet reaches the quality cycle.
      opl: 'framework_workspace_artifact_closeout',
      domain: 'truth_quality_route_back_and_artifact_authority_owner',
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      can_authorize_quality_verdict: false,
      provider_completion_is_domain_ready: false,
    },
  });
}

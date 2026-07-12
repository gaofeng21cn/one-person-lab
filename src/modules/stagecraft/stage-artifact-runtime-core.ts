import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { parseJsonText, readJsonPayloadFile, writeJsonPayloadFile } from '../../kernel/json-file.ts';
import { ensureOplStateDir } from '../../kernel/runtime-state-paths.ts';

export type JsonRecord = Record<string, unknown>;

export type StageArtifactLocator = {
  state_dir?: string;
  domain_id: string;
  program_id: string;
  topic_id: string;
  deliverable_id: string;
};

export type StageArtifactAttemptLocator = StageArtifactLocator & {
  stage_id: string;
  stage_order?: number;
  attempt_id: string;
};

export type StageAttemptStatus =
  | 'success'
  | 'completed_with_quality_debt'
  | 'blocked'
  | 'skipped'
  | 'deferred'
  | 'broken'
  | 'orphan'
  | 'in_progress';

export type StageAttemptTerminalStatus =
  | 'success'
  | 'completed_with_quality_debt'
  | 'blocked'
  | 'skipped'
  | 'deferred';

export type StageArtifactFileHash = {
  path: string;
  role: 'output' | 'evidence' | 'receipt';
  sha256: string;
  bytes: number;
};

export type StageStatus = {
  stage_id: string;
  stage_dir: string;
  stage_order: number | null;
  latest_attempt_id: string | null;
  status: StageAttemptStatus;
  attempts: Array<{
    attempt_id: string;
    attempt_dir: string;
    status: StageAttemptStatus;
    manifest_valid: boolean;
    required_outputs: string[];
    present_outputs: string[];
    missing_outputs: string[];
    owner_receipt_refs: string[];
    quality_debt_refs: string[];
    typed_blocker_refs: string[];
    decision_receipt_refs: string[];
    orphan_outputs: string[];
    broken_reasons: string[];
    output_hashes: StageArtifactFileHash[];
    evidence_hashes: StageArtifactFileHash[];
    receipt_hashes: StageArtifactFileHash[];
    hash_mismatches: string[];
  }>;
  required_outputs: string[];
  missing_outputs: string[];
  owner_receipt_refs: string[];
  quality_debt_refs: string[];
  typed_blocker_refs: string[];
  decision_receipt_refs: string[];
  orphan_outputs: string[];
  broken_reasons: string[];
  next_required_owner_delta: string[];
};

export const AUTHORITY_BOUNDARY = {
  owner: 'one-person-lab',
  source_of_truth: 'physical_stage_folder_contract',
  projection_role: 'stage_artifact_projection_only',
  current_pointer_role: 'artifact_attempt_pointer_not_stage_run_current_pointer',
  output_authority: [
    'artifact_projection',
    'progress_projection',
    'evidence_projection',
  ],
  can_write_stage_current_pointer: false,
  can_write_stage_run_terminal_state: false,
  can_publish_current_owner_delta: false,
  can_close_owner_answer: false,
  can_close_human_gate: false,
  can_close_typed_blocker: false,
  can_declare_domain_ready: false,
  stage_run_current_is_passive_projection_of_codex_route_context: true,
  framework_can_accept_reject_or_override_codex_route: false,
  opl_can_issue_owner_receipt: false,
  opl_can_issue_rca_owner_receipt: false,
  opl_can_write_domain_truth: false,
  opl_can_write_rca_visual_truth: false,
  opl_can_write_rca_review_export_verdict: false,
  opl_can_write_domain_artifact_body: false,
  opl_can_write_rca_artifact_body: false,
  opl_can_declare_quality_verdict: false,
  domain_receipt_authority_preserved: true,
} as const;

export const RETENTION_POLICY = {
  policy_id: 'opl_stage_artifact_retention.v1',
  dry_run_default: true,
  preserve_latest_attempt: true,
  preserve_canonical_attempts: true,
  apply_moves_non_current_attempt_to_retention_archive: true,
  restore_kind: 'byte_preserving_attempt_restore_from_retention_archive',
  restore_requires_restore_proof_ref: true,
  restore_does_not_create_owner_receipt: true,
  restore_does_not_declare_domain_truth_or_quality: true,
} as const;

export function safeText(value: unknown, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

export function safeSegment(value: unknown, field: string) {
  const text = safeText(value);
  if (!text || text.includes('/') || text.includes('..')) {
    throw new FrameworkContractError('contract_shape_invalid', `Invalid stage artifact ${field}.`, {
      field,
      value,
    });
  }
  return text;
}

export function stringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.map((entry) => safeText(entry)).filter(Boolean))];
}

export function readJsonFile(file: string): JsonRecord | null {
  if (!fs.existsSync(file)) {
    return null;
  }
  try {
    const parsed = readJsonPayloadFile(file);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeJsonFile(file: string, payload: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeJsonPayloadFile(file, payload);
}

export function listDirNames(dir: string) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

export function listFileNames(dir: string) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
}

export function listRelativeFiles(dir: string, prefix = ''): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const files: string[] = [];
  for (const entry of fs.readdirSync(path.join(dir, prefix), { withFileTypes: true })) {
    const relativePath = path.join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(...listRelativeFiles(dir, relativePath));
    } else if (entry.isFile()) {
      files.push(relativePath.split(path.sep).join('/'));
    }
  }
  return files.sort();
}

export function fileHash(file: string) {
  const content = fs.readFileSync(file);
  return {
    sha256: crypto.createHash('sha256').update(content).digest('hex'),
    bytes: content.byteLength,
  };
}

export function hashFiles(dir: string, role: StageArtifactFileHash['role']): StageArtifactFileHash[] {
  return listRelativeFiles(dir).map((relativePath) => ({
    path: relativePath,
    role,
    ...fileHash(path.join(dir, relativePath)),
  }));
}

function hashIndexByPath(hashes: StageArtifactFileHash[]) {
  return new Map(hashes.map((entry) => [entry.path, entry]));
}

export function readManifestHashes(value: unknown, role: StageArtifactFileHash['role']) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }
    const hashPath = safeText(entry.path);
    const sha256 = safeText(entry.sha256);
    const bytes = Number(entry.bytes);
    if (!hashPath || !sha256 || !Number.isFinite(bytes)) {
      return [];
    }
    return [{
      path: hashPath,
      role,
      sha256,
      bytes,
    }];
  });
}

export function compareHashManifest(manifestHashes: StageArtifactFileHash[], physicalHashes: StageArtifactFileHash[]) {
  const physicalByPath = hashIndexByPath(physicalHashes);
  const mismatches: string[] = [];
  for (const manifestHash of manifestHashes) {
    const physical = physicalByPath.get(manifestHash.path);
    if (!physical) {
      mismatches.push(`${manifestHash.role}:${manifestHash.path}:missing_physical_file`);
      continue;
    }
    if (physical.sha256 !== manifestHash.sha256 || physical.bytes !== manifestHash.bytes) {
      mismatches.push(`${manifestHash.role}:${manifestHash.path}:hash_or_size_mismatch`);
    }
  }
  return mismatches.sort();
}

export function missingManifestHashEntries(manifestHashes: StageArtifactFileHash[], physicalHashes: StageArtifactFileHash[]) {
  const manifestPaths = new Set(manifestHashes.map((entry) => entry.path));
  return physicalHashes
    .filter((entry) => !manifestPaths.has(entry.path))
    .map((entry) => `${entry.role}:${entry.path}`)
    .sort();
}

export function safeRelativePath(value: unknown, field: string) {
  const text = safeText(value);
  if (!text || path.isAbsolute(text) || text.split(/[\\/]+/).includes('..')) {
    throw new FrameworkContractError('contract_shape_invalid', `Invalid stage artifact ${field}.`, {
      field,
      value,
    });
  }
  return text.split(/[\\/]+/).join('/');
}

export function relativePathList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.map((entry) => safeRelativePath(entry, 'required_outputs')).filter(Boolean))];
}

export function stageFolderName(stageId: string, stageOrder?: number) {
  if (Number.isInteger(stageOrder) && Number(stageOrder) > 0) {
    return `${String(stageOrder).padStart(2, '0')}-${stageId}`;
  }
  return stageId;
}

function stageIdFromFolderName(name: string) {
  return name.replace(/^\d+-/, '');
}

function stageOrderFromFolderName(name: string) {
  const match = name.match(/^(\d+)-/);
  return match ? Number.parseInt(match[1], 10) : null;
}

export function lineageDirForDeliverable(root: string) {
  return path.join(root, 'lineage');
}

export function lineageEventsFile(root: string) {
  return path.join(lineageDirForDeliverable(root), 'events.jsonl');
}

export function retentionArchiveRoot(root: string) {
  return path.join(root, 'retention', 'attempts');
}

export function appendLineageEvent(root: string, event: JsonRecord) {
  fs.mkdirSync(lineageDirForDeliverable(root), { recursive: true });
  const payload = {
    surface_kind: 'opl_stage_artifact_lineage_event',
    event_version: 'stage-artifact-lineage-event.v1',
    event_id: crypto.randomUUID(),
    occurred_at: new Date().toISOString(),
    authority_boundary: AUTHORITY_BOUNDARY,
    ...event,
  };
  fs.appendFileSync(lineageEventsFile(root), `${JSON.stringify(payload)}\n`, 'utf-8');
  return payload;
}

export function readLineageEvents(root: string) {
  const file = lineageEventsFile(root);
  if (!fs.existsSync(file)) {
    return [];
  }
  return fs.readFileSync(file, 'utf-8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const parsed = parseJsonText(line);
        return isRecord(parsed) ? [parsed] : [];
      } catch {
        return [];
      }
    });
}

export function writeLineageGraph(root: string, status: { locator: StageArtifactLocator; stages: StageStatus[] }) {
  const graph = {
    surface_kind: 'opl_stage_artifact_lineage_graph',
    graph_version: 'stage-artifact-lineage-graph.v1',
    rebuilt_at: new Date().toISOString(),
    locator: status.locator,
    nodes: status.stages.flatMap((stage) => stage.attempts.map((attempt) => ({
      node_id: `${stage.stage_id}/${attempt.attempt_id}`,
      stage_id: stage.stage_id,
      attempt_id: attempt.attempt_id,
      status: attempt.status,
      output_hashes: attempt.output_hashes,
      receipt_hashes: attempt.receipt_hashes,
      evidence_hashes: attempt.evidence_hashes,
    }))),
    edges: status.stages.flatMap((stage) => stage.latest_attempt_id
      ? [{
          from: `${stage.stage_id}/${stage.latest_attempt_id}`,
          to: `current-stage:${stage.stage_id}`,
          edge_kind: 'latest_pointer',
        }]
      : []),
    event_count: readLineageEvents(root).length,
    authority_boundary: AUTHORITY_BOUNDARY,
  };
  const graphFile = path.join(lineageDirForDeliverable(root), 'graph.json');
  writeJsonFile(graphFile, graph);
  return {
    graph_file: graphFile,
    graph,
  };
}

export function stageArtifactDeliverableRoot(locator: StageArtifactLocator) {
  const paths = locator.state_dir
    ? { state_dir: path.resolve(locator.state_dir) }
    : ensureOplStateDir();
  fs.mkdirSync(paths.state_dir, { recursive: true });
  return path.join(
    paths.state_dir,
    'runtime-state',
    'domains',
    safeSegment(locator.domain_id, 'domain_id'),
    'deliverables',
    safeSegment(locator.program_id, 'program_id'),
    safeSegment(locator.topic_id, 'topic_id'),
    safeSegment(locator.deliverable_id, 'deliverable_id'),
  );
}

export function resolveStageDirs(root: string) {
  return listDirNames(path.join(root, 'stages')).map((name) => ({
    name,
    stage_id: stageIdFromFolderName(name),
    stage_order: stageOrderFromFolderName(name),
    stage_dir: path.join(root, 'stages', name),
  }));
}

export function stageArtifactAttemptPaths(locator: StageArtifactAttemptLocator) {
  const deliverable_root = stageArtifactDeliverableRoot(locator);
  const stageId = safeSegment(locator.stage_id, 'stage_id');
  const explicitStageDir = path.join(deliverable_root, 'stages', stageFolderName(
    stageId,
    locator.stage_order,
  ));
  const existingStageDir = Number.isInteger(locator.stage_order)
    ? null
    : resolveStageDirs(deliverable_root).find((stage) => stage.stage_id === stageId)?.stage_dir ?? null;
  const stage_dir = existingStageDir ?? explicitStageDir;
  const attempt_dir = path.join(stage_dir, 'attempts', safeSegment(locator.attempt_id, 'attempt_id'));
  return {
    deliverable_root,
    current_file: path.join(deliverable_root, 'current.json'),
    stage_dir,
    latest_pointer: path.join(stage_dir, 'latest'),
    attempts_dir: path.join(stage_dir, 'attempts'),
    attempt_dir,
    attempt_file: path.join(attempt_dir, 'attempt.json'),
    manifest_file: path.join(attempt_dir, 'manifest.json'),
    inputs_dir: path.join(attempt_dir, 'inputs'),
    outputs_dir: path.join(attempt_dir, 'outputs'),
    evidence_dir: path.join(attempt_dir, 'evidence'),
    receipts_dir: path.join(attempt_dir, 'receipts'),
  };
}

export function ensureStageArtifactAttempt(locator: StageArtifactAttemptLocator) {
  const paths = stageArtifactAttemptPaths(locator);
  for (const dir of [
    paths.inputs_dir,
    paths.outputs_dir,
    paths.evidence_dir,
    paths.receipts_dir,
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(paths.attempt_file)) {
    writeJsonFile(paths.attempt_file, {
      surface_kind: 'opl_stage_artifact_attempt',
      attempt_id: locator.attempt_id,
      stage_id: locator.stage_id,
      created_at: new Date().toISOString(),
      authority_boundary: AUTHORITY_BOUNDARY,
    });
  }
  if (!fs.existsSync(paths.manifest_file)) {
    writeJsonFile(paths.manifest_file, {
      surface_kind: 'opl_stage_artifact_manifest',
      manifest_version: 'stage-artifact-manifest.v1',
      stage_id: locator.stage_id,
      stage_order: locator.stage_order ?? null,
      attempt_id: locator.attempt_id,
      terminal_status: null,
      required_outputs: [],
      present_outputs: [],
      output_hashes: [],
      evidence_hashes: [],
      receipt_hashes: [],
      owner_receipt_refs: [],
      typed_blocker_refs: [],
      decision_receipt_refs: [],
      opened_at: new Date().toISOString(),
      authority_boundary: AUTHORITY_BOUNDARY,
    });
  }
  const stageFile = path.join(paths.stage_dir, 'stage.json');
  if (!fs.existsSync(stageFile)) {
    writeJsonFile(stageFile, {
      surface_kind: 'opl_stage_artifact_stage',
      stage_id: locator.stage_id,
      stage_order: locator.stage_order ?? null,
      authority_boundary: AUTHORITY_BOUNDARY,
    });
  }
  const deliverableFile = path.join(paths.deliverable_root, 'deliverable.json');
  if (!fs.existsSync(deliverableFile)) {
    writeJsonFile(deliverableFile, {
      surface_kind: 'opl_stage_artifact_deliverable',
      domain_id: locator.domain_id,
      program_id: locator.program_id,
      topic_id: locator.topic_id,
      deliverable_id: locator.deliverable_id,
      authority_boundary: AUTHORITY_BOUNDARY,
    });
  }
  return paths;
}

export function openStageArtifactAttemptRuntime(locator: StageArtifactAttemptLocator) {
  const paths = ensureStageArtifactAttempt(locator);
  const lineage_event = appendLineageEvent(paths.deliverable_root, {
    event_kind: 'attempt_opened',
    locator,
    stage_id: locator.stage_id,
    attempt_id: locator.attempt_id,
    attempt_dir: paths.attempt_dir,
    wrote_domain_truth: false,
    created_owner_receipt: false,
  });
  return {
    surface_kind: 'opl_stage_artifact_runtime_open',
    locator,
    attempt_workspace: {
      deliverable_root: paths.deliverable_root,
      stage_dir: paths.stage_dir,
      attempt_dir: paths.attempt_dir,
      inputs_dir: paths.inputs_dir,
      outputs_dir: paths.outputs_dir,
      evidence_dir: paths.evidence_dir,
      receipts_dir: paths.receipts_dir,
      manifest_file: paths.manifest_file,
      attempt_file: paths.attempt_file,
    },
    latest_updated: false,
    lineage_event,
    authority_boundary: AUTHORITY_BOUNDARY,
  };
}

export function readLatestAttemptId(stageDir: string) {
  const pointer = path.join(stageDir, 'latest');
  if (!fs.existsSync(pointer)) {
    return null;
  }
  return safeText(fs.readFileSync(pointer, 'utf-8')) || null;
}

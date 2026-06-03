import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from './contracts.ts';
import { ensureOplStateDir } from './runtime-state-paths.ts';

type JsonRecord = Record<string, unknown>;

export type StageArtifactLocator = {
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

type StageAttemptStatus =
  | 'success'
  | 'blocked'
  | 'skipped'
  | 'deferred'
  | 'broken'
  | 'orphan'
  | 'in_progress';

type StageAttemptTerminalStatus = 'success' | 'blocked' | 'skipped' | 'deferred';

type StageArtifactFileHash = {
  path: string;
  role: 'output' | 'evidence' | 'receipt';
  sha256: string;
  bytes: number;
};

type StageStatus = {
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
  typed_blocker_refs: string[];
  decision_receipt_refs: string[];
  orphan_outputs: string[];
  broken_reasons: string[];
  next_required_owner_delta: string[];
};

const AUTHORITY_BOUNDARY = {
  owner: 'one-person-lab',
  source_of_truth: 'physical_stage_folder_contract',
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

const RETENTION_POLICY = {
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

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeText(value: unknown, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function safeSegment(value: unknown, field: string) {
  const text = safeText(value);
  if (!text || text.includes('/') || text.includes('..')) {
    throw new FrameworkContractError('contract_shape_invalid', `Invalid stage artifact ${field}.`, {
      field,
      value,
    });
  }
  return text;
}

function stringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.map((entry) => safeText(entry)).filter(Boolean))];
}

function readJsonFile(file: string): JsonRecord | null {
  if (!fs.existsSync(file)) {
    return null;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeJsonFile(file: string, payload: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
}

function listDirNames(dir: string) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function listFileNames(dir: string) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
}

function listRelativeFiles(dir: string, prefix = ''): string[] {
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

function fileHash(file: string) {
  const content = fs.readFileSync(file);
  return {
    sha256: crypto.createHash('sha256').update(content).digest('hex'),
    bytes: content.byteLength,
  };
}

function hashFiles(dir: string, role: StageArtifactFileHash['role']): StageArtifactFileHash[] {
  return listRelativeFiles(dir).map((relativePath) => ({
    path: relativePath,
    role,
    ...fileHash(path.join(dir, relativePath)),
  }));
}

function hashIndexByPath(hashes: StageArtifactFileHash[]) {
  return new Map(hashes.map((entry) => [entry.path, entry]));
}

function readManifestHashes(value: unknown, role: StageArtifactFileHash['role']) {
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

function compareHashManifest(manifestHashes: StageArtifactFileHash[], physicalHashes: StageArtifactFileHash[]) {
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

function missingManifestHashEntries(manifestHashes: StageArtifactFileHash[], physicalHashes: StageArtifactFileHash[]) {
  const manifestPaths = new Set(manifestHashes.map((entry) => entry.path));
  return physicalHashes
    .filter((entry) => !manifestPaths.has(entry.path))
    .map((entry) => `${entry.role}:${entry.path}`)
    .sort();
}

function safeRelativePath(value: unknown, field: string) {
  const text = safeText(value);
  if (!text || path.isAbsolute(text) || text.split(/[\\/]+/).includes('..')) {
    throw new FrameworkContractError('contract_shape_invalid', `Invalid stage artifact ${field}.`, {
      field,
      value,
    });
  }
  return text.split(/[\\/]+/).join('/');
}

function relativePathList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.map((entry) => safeRelativePath(entry, 'required_outputs')).filter(Boolean))];
}

function stageFolderName(stageId: string, stageOrder?: number) {
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

function lineageDirForDeliverable(root: string) {
  return path.join(root, 'lineage');
}

function lineageEventsFile(root: string) {
  return path.join(lineageDirForDeliverable(root), 'events.jsonl');
}

function retentionArchiveRoot(root: string) {
  return path.join(root, 'retention', 'attempts');
}

function appendLineageEvent(root: string, event: JsonRecord) {
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

function readLineageEvents(root: string) {
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
        const parsed = JSON.parse(line);
        return isRecord(parsed) ? [parsed] : [];
      } catch {
        return [];
      }
    });
}

function writeLineageGraph(root: string, status: ReturnType<typeof statusStageArtifactRuntime>) {
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
  const paths = ensureOplStateDir();
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

function resolveStageDirs(root: string) {
  return listDirNames(path.join(root, 'stages')).map((name) => ({
    name,
    stage_id: stageIdFromFolderName(name),
    stage_order: stageOrderFromFolderName(name),
    stage_dir: path.join(root, 'stages', name),
  }));
}

function readLatestAttemptId(stageDir: string) {
  const pointer = path.join(stageDir, 'latest');
  if (!fs.existsSync(pointer)) {
    return null;
  }
  return safeText(fs.readFileSync(pointer, 'utf-8')) || null;
}

function recordHasRef(record: JsonRecord, ref: string) {
  return safeText(record.receipt_ref) === ref
    || safeText(record.owner_receipt_ref) === ref
    || safeText(record.typed_blocker_ref) === ref
    || safeText(record.decision_receipt_ref) === ref
    || stringList(record.receipt_refs).includes(ref)
    || stringList(record.owner_receipt_refs).includes(ref)
    || stringList(record.typed_blocker_refs).includes(ref)
    || stringList(record.decision_receipt_refs).includes(ref);
}

function refsBackedByFiles(dir: string, refs: string[]) {
  const files = listRelativeFiles(dir);
  const records = files
    .map((file) => readJsonFile(path.join(dir, file)))
    .filter((record): record is JsonRecord => Boolean(record));
  const matchedRefs = refs.filter((ref) => records.some((record) => recordHasRef(record, ref)));
  return {
    matched_refs: matchedRefs,
    missing_refs: refs.filter((ref) => !matchedRefs.includes(ref)),
  };
}

function terminalStatusFromManifest(manifest: JsonRecord | null): StageAttemptTerminalStatus | null {
  const status = safeText(manifest?.terminal_status);
  return ['success', 'blocked', 'skipped', 'deferred'].includes(status)
    ? status as StageAttemptTerminalStatus
    : null;
}

function inspectAttempt(stageId: string, attemptDir: string) {
  const attemptId = path.basename(attemptDir);
  const manifest = readJsonFile(path.join(attemptDir, 'manifest.json'));
  const outputsDir = path.join(attemptDir, 'outputs');
  const receiptsDir = path.join(attemptDir, 'receipts');
  const evidenceDir = path.join(attemptDir, 'evidence');
  const presentOutputs = listRelativeFiles(outputsDir);
  const outputHashes = hashFiles(outputsDir, 'output');
  const evidenceHashes = hashFiles(evidenceDir, 'evidence');
  const receiptHashes = hashFiles(receiptsDir, 'receipt');
  const hashMismatches = [
    ...compareHashManifest(readManifestHashes(manifest?.output_hashes, 'output'), outputHashes),
    ...compareHashManifest(readManifestHashes(manifest?.evidence_hashes, 'evidence'), evidenceHashes),
    ...compareHashManifest(readManifestHashes(manifest?.receipt_hashes, 'receipt'), receiptHashes),
  ].sort();
  const requiredOutputs = relativePathList(manifest?.required_outputs);
  const missingOutputs = requiredOutputs.filter((output) => !presentOutputs.includes(output));
  const ownerReceiptRefs = stringList(manifest?.owner_receipt_refs);
  const typedBlockerRefs = stringList(manifest?.typed_blocker_refs);
  const decisionReceiptRefs = stringList(manifest?.decision_receipt_refs);
  const terminalStatus = terminalStatusFromManifest(manifest);
  const manifestValid = Boolean(manifest)
    && safeText(manifest?.stage_id, stageId) === stageId
    && safeText(manifest?.attempt_id, attemptId) === attemptId;
  const brokenReasons: string[] = [];
  const ownerReceiptMatch = refsBackedByFiles(receiptsDir, ownerReceiptRefs);
  const typedBlockerMatch = refsBackedByFiles(evidenceDir, typedBlockerRefs);
  const decisionReceiptMatch = refsBackedByFiles(receiptsDir, decisionReceiptRefs);

  let status: StageAttemptStatus = 'in_progress';
  if (!manifestValid && presentOutputs.length > 0) {
    status = 'orphan';
  } else if (!manifestValid) {
    status = 'broken';
    brokenReasons.push('missing_or_invalid_manifest');
  } else if (terminalStatus === 'blocked' || typedBlockerRefs.length > 0) {
    if (typedBlockerRefs.length === 0) {
      status = 'broken';
      brokenReasons.push('blocked_manifest_missing_typed_blocker_ref');
    } else if (typedBlockerMatch.missing_refs.length > 0) {
      status = 'broken';
      brokenReasons.push('typed_blocker_ref_without_matching_evidence_file');
    } else {
      status = 'blocked';
    }
  } else if (terminalStatus === 'skipped' || terminalStatus === 'deferred') {
    if (decisionReceiptRefs.length === 0) {
      status = 'broken';
      brokenReasons.push(`${terminalStatus}_manifest_missing_decision_receipt_ref`);
    } else if (decisionReceiptMatch.missing_refs.length > 0) {
      status = 'broken';
      brokenReasons.push('decision_receipt_ref_without_matching_receipt_file');
    } else {
      status = terminalStatus;
    }
  } else if (terminalStatus === 'success' || ownerReceiptRefs.length > 0) {
    if (requiredOutputs.length === 0) {
      status = 'broken';
      brokenReasons.push('success_manifest_missing_required_outputs');
    } else if (missingOutputs.length > 0) {
      status = 'broken';
      brokenReasons.push('required_outputs_missing_without_typed_blocker');
    } else if (hashMismatches.length > 0) {
      status = 'broken';
      brokenReasons.push('manifest_content_hash_mismatch');
    } else if (ownerReceiptRefs.length === 0) {
      status = 'broken';
      brokenReasons.push('success_manifest_missing_owner_receipt_ref');
    } else if (ownerReceiptMatch.missing_refs.length > 0) {
      status = 'broken';
      brokenReasons.push('owner_receipt_ref_without_matching_receipt_file');
    } else {
      status = 'success';
    }
  } else if (presentOutputs.length > 0) {
    status = 'orphan';
  }

  return {
    attempt_id: attemptId,
    attempt_dir: attemptDir,
    status,
    manifest_valid: manifestValid,
    required_outputs: requiredOutputs,
    present_outputs: presentOutputs,
    missing_outputs: missingOutputs,
    owner_receipt_refs: ownerReceiptRefs,
    typed_blocker_refs: typedBlockerRefs,
    decision_receipt_refs: decisionReceiptRefs,
    orphan_outputs: status === 'orphan' ? presentOutputs : [],
    broken_reasons: brokenReasons,
    output_hashes: outputHashes,
    evidence_hashes: evidenceHashes,
    receipt_hashes: receiptHashes,
    hash_mismatches: hashMismatches,
  };
}

function summarizeStage(stage: ReturnType<typeof resolveStageDirs>[number]): StageStatus {
  const attemptsDir = path.join(stage.stage_dir, 'attempts');
  const latestAttemptId = readLatestAttemptId(stage.stage_dir);
  const attempts = listDirNames(attemptsDir)
    .map((name) => inspectAttempt(stage.stage_id, path.join(attemptsDir, name)));
  const selected = (latestAttemptId
    ? attempts.find((attempt) => attempt.attempt_id === latestAttemptId)
    : null) ?? attempts.at(-1) ?? null;
  const status = selected?.status ?? 'broken';
  const nextRequiredOwnerDelta = status === 'success'
    ? []
    : status === 'blocked'
      ? ['domain_owner_typed_blocker_resolution']
      : status === 'skipped' || status === 'deferred'
        ? ['domain_owner_resume_or_next_stage_decision']
      : status === 'orphan'
        ? ['domain_owner_manifest_and_receipt']
        : ['domain_owner_stage_artifact_closeout'];
  return {
    stage_id: stage.stage_id,
    stage_dir: stage.stage_dir,
    stage_order: stage.stage_order,
    latest_attempt_id: selected?.attempt_id ?? null,
    status,
    attempts,
    required_outputs: selected?.required_outputs ?? [],
    missing_outputs: selected?.missing_outputs ?? [],
    owner_receipt_refs: selected?.owner_receipt_refs ?? [],
    typed_blocker_refs: selected?.typed_blocker_refs ?? [],
    decision_receipt_refs: selected?.decision_receipt_refs ?? [],
    orphan_outputs: selected?.orphan_outputs ?? [],
    broken_reasons: selected?.broken_reasons ?? ['missing_stage_attempt'],
    next_required_owner_delta: nextRequiredOwnerDelta,
  };
}

export function statusStageArtifactRuntime(locator: StageArtifactLocator) {
  const deliverableRoot = stageArtifactDeliverableRoot(locator);
  const stages = resolveStageDirs(deliverableRoot).map(summarizeStage);
  return {
    surface_kind: 'opl_stage_artifact_runtime_status',
    version: 'stage-artifact-runtime.v1',
    locator,
    deliverable_root: deliverableRoot,
    stages,
    summary: {
      stage_count: stages.length,
      success_stage_count: stages.filter((stage) => stage.status === 'success').length,
      blocked_stage_count: stages.filter((stage) => stage.status === 'blocked').length,
      skipped_stage_count: stages.filter((stage) => stage.status === 'skipped').length,
      deferred_stage_count: stages.filter((stage) => stage.status === 'deferred').length,
      broken_stage_count: stages.filter((stage) => stage.status === 'broken').length,
      orphan_artifact_count: stages.reduce((count, stage) => count + stage.orphan_outputs.length, 0),
    },
    authority_boundary: AUTHORITY_BOUNDARY,
  };
}

function assertTerminalRefs(input: {
  terminal_status: StageAttemptTerminalStatus;
  required_outputs: string[];
  owner_receipt_refs: string[];
  typed_blocker_refs: string[];
  decision_receipt_refs: string[];
  outputs_dir: string;
  evidence_dir: string;
  receipts_dir: string;
}) {
  if (input.terminal_status === 'success') {
    const presentOutputs = listRelativeFiles(input.outputs_dir);
    const missingOutputs = input.required_outputs.filter((output) => !presentOutputs.includes(output));
    if (input.required_outputs.length === 0 || missingOutputs.length > 0) {
      throw new FrameworkContractError('contract_shape_invalid', 'Stage success requires all manifest required outputs.', {
        required_outputs: input.required_outputs,
        present_outputs: presentOutputs,
        missing_outputs: missingOutputs,
      });
    }
    const ownerReceiptMatch = refsBackedByFiles(input.receipts_dir, input.owner_receipt_refs);
    if (input.owner_receipt_refs.length === 0 || ownerReceiptMatch.missing_refs.length > 0) {
      throw new FrameworkContractError('contract_shape_invalid', 'Stage success requires owner receipt refs backed by receipt files.', {
        owner_receipt_refs: input.owner_receipt_refs,
        missing_owner_receipt_refs: ownerReceiptMatch.missing_refs,
      });
    }
  } else if (input.terminal_status === 'blocked') {
    const typedBlockerMatch = refsBackedByFiles(input.evidence_dir, input.typed_blocker_refs);
    if (input.typed_blocker_refs.length === 0 || typedBlockerMatch.missing_refs.length > 0) {
      throw new FrameworkContractError('contract_shape_invalid', 'Stage blocked requires typed blocker refs backed by evidence files.', {
        typed_blocker_refs: input.typed_blocker_refs,
        missing_typed_blocker_refs: typedBlockerMatch.missing_refs,
      });
    }
  } else {
    const decisionReceiptMatch = refsBackedByFiles(input.receipts_dir, input.decision_receipt_refs);
    if (input.decision_receipt_refs.length === 0 || decisionReceiptMatch.missing_refs.length > 0) {
      throw new FrameworkContractError('contract_shape_invalid', 'Stage skipped/deferred requires decision receipt refs backed by receipt files.', {
        decision_receipt_refs: input.decision_receipt_refs,
        missing_decision_receipt_refs: decisionReceiptMatch.missing_refs,
      });
    }
  }
}

function writeLatestPointer(pointer: string, attemptId: string) {
  const tmp = `${pointer}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, `${attemptId}\n`, 'utf-8');
  fs.renameSync(tmp, pointer);
}

function writeCurrentPointer(locator: StageArtifactLocator, status: ReturnType<typeof statusStageArtifactRuntime>) {
  const currentStage = status.stages.find((stage) => stage.status !== 'success')
    ?? status.stages.at(-1)
    ?? null;
  const currentFile = path.join(status.deliverable_root, 'current.json');
  const payload = {
    surface_kind: 'opl_stage_artifact_runtime_current',
    updated_at: new Date().toISOString(),
    locator,
    current_stage: currentStage
      ? {
          stage_id: currentStage.stage_id,
          status: currentStage.status,
          latest_attempt_id: currentStage.latest_attempt_id,
          next_required_owner_delta: currentStage.next_required_owner_delta,
        }
      : null,
    stage_count: status.summary.stage_count,
    success_stage_count: status.summary.success_stage_count,
    authority_boundary: AUTHORITY_BOUNDARY,
  };
  writeJsonFile(currentFile, payload);
  return {
    current_file: currentFile,
    current: payload,
  };
}

export function commitStageArtifactAttemptRuntime(input: StageArtifactAttemptLocator & {
  terminal_status: StageAttemptTerminalStatus;
  required_outputs?: string[];
  owner_receipt_refs?: string[];
  typed_blocker_refs?: string[];
  decision_receipt_refs?: string[];
}) {
  const terminalStatus = input.terminal_status;
  const paths = ensureStageArtifactAttempt(input);
  const requiredOutputs = [...new Set((input.required_outputs ?? []).map((entry) => safeRelativePath(entry, 'required_outputs')))];
  const ownerReceiptRefs = stringList(input.owner_receipt_refs ?? []);
  const typedBlockerRefs = stringList(input.typed_blocker_refs ?? []);
  const decisionReceiptRefs = stringList(input.decision_receipt_refs ?? []);

  assertTerminalRefs({
    terminal_status: terminalStatus,
    required_outputs: requiredOutputs,
    owner_receipt_refs: ownerReceiptRefs,
    typed_blocker_refs: typedBlockerRefs,
    decision_receipt_refs: decisionReceiptRefs,
    outputs_dir: paths.outputs_dir,
    evidence_dir: paths.evidence_dir,
    receipts_dir: paths.receipts_dir,
  });

  const commitReceiptFile = path.join(paths.receipts_dir, 'opl-stage-commit-receipt.json');
  writeJsonFile(commitReceiptFile, {
    surface_kind: 'opl_stage_artifact_commit_receipt',
    receipt_ref: `opl-stage-artifact-commit:${input.domain_id}/${input.program_id}/${input.topic_id}/${input.deliverable_id}/${input.stage_id}/${input.attempt_id}`,
    receipt_kind: 'opl_refs_only_stage_artifact_commit',
    terminal_status: terminalStatus,
    created_owner_receipt: false,
    wrote_domain_truth: false,
    mutated_artifact_body: false,
    authority_boundary: AUTHORITY_BOUNDARY,
  });

  const manifest = {
    surface_kind: 'opl_stage_artifact_manifest',
    manifest_version: 'stage-artifact-manifest.v1',
    stage_id: input.stage_id,
    stage_order: input.stage_order ?? null,
    attempt_id: input.attempt_id,
    terminal_status: terminalStatus,
    required_outputs: requiredOutputs,
    present_outputs: listRelativeFiles(paths.outputs_dir),
    output_hashes: hashFiles(paths.outputs_dir, 'output'),
    evidence_hashes: hashFiles(paths.evidence_dir, 'evidence'),
    receipt_hashes: hashFiles(paths.receipts_dir, 'receipt'),
    owner_receipt_refs: ownerReceiptRefs,
    typed_blocker_refs: typedBlockerRefs,
    decision_receipt_refs: decisionReceiptRefs,
    committed_at: new Date().toISOString(),
    authority_boundary: AUTHORITY_BOUNDARY,
  };
  writeJsonFile(paths.manifest_file, manifest);
  writeLatestPointer(paths.latest_pointer, input.attempt_id);
  const status = statusStageArtifactRuntime(input);
  const currentPointer = writeCurrentPointer(input, status);
  const lineage_event = appendLineageEvent(paths.deliverable_root, {
    event_kind: 'attempt_committed',
    locator: {
      domain_id: input.domain_id,
      program_id: input.program_id,
      topic_id: input.topic_id,
      deliverable_id: input.deliverable_id,
    },
    stage_id: input.stage_id,
    attempt_id: input.attempt_id,
    terminal_status: terminalStatus,
    manifest_file: paths.manifest_file,
    latest_pointer: paths.latest_pointer,
    current_file: currentPointer.current_file,
    output_hashes: manifest.output_hashes,
    evidence_hashes: manifest.evidence_hashes,
    receipt_hashes: manifest.receipt_hashes,
    wrote_domain_truth: false,
    created_owner_receipt: false,
  });
  return {
    surface_kind: 'opl_stage_artifact_runtime_commit',
    manifest,
    manifest_file: paths.manifest_file,
    latest_pointer: paths.latest_pointer,
    current_pointer: currentPointer,
    status,
    lineage_event,
    opl_created_owner_receipt: false,
    authority_boundary: AUTHORITY_BOUNDARY,
  };
}

export function explainStageArtifactRuntime(locator: StageArtifactLocator) {
  const status = statusStageArtifactRuntime(locator);
  const currentStage = status.stages.find((stage) => stage.status !== 'success')
    ?? status.stages.at(-1)
    ?? null;
  return {
    surface_kind: 'opl_stage_artifact_runtime_explain',
    status,
    current_stage: currentStage,
    next_required_owner_delta: currentStage?.next_required_owner_delta ?? [],
    authority_boundary: AUTHORITY_BOUNDARY,
  };
}

export function rebuildStageArtifactRuntime(locator: StageArtifactLocator) {
  const status = statusStageArtifactRuntime(locator);
  const index = {
    surface_kind: 'opl_stage_artifact_runtime_index',
    rebuilt_at: new Date().toISOString(),
    locator,
    stage_count: status.stages.length,
    stages: status.stages.map((stage) => ({
      stage_id: stage.stage_id,
      status: stage.status,
      latest_attempt_id: stage.latest_attempt_id,
      owner_receipt_refs: stage.owner_receipt_refs,
      typed_blocker_refs: stage.typed_blocker_refs,
      decision_receipt_refs: stage.decision_receipt_refs,
      output_hashes: stage.attempts.find((attempt) => attempt.attempt_id === stage.latest_attempt_id)?.output_hashes ?? [],
    })),
    authority_boundary: AUTHORITY_BOUNDARY,
  };
  const indexFile = path.join(status.deliverable_root, 'stage-artifact-index.json');
  writeJsonFile(indexFile, index);
  const lineage_graph = writeLineageGraph(status.deliverable_root, status);
  const lineage_event = appendLineageEvent(status.deliverable_root, {
    event_kind: 'index_rebuilt',
    locator,
    index_file: indexFile,
    graph_file: lineage_graph.graph_file,
    stage_count: status.stages.length,
    wrote_domain_truth: false,
    created_owner_receipt: false,
  });
  return {
    surface_kind: 'opl_stage_artifact_runtime_rebuild',
    index,
    index_file: indexFile,
    lineage_graph,
    lineage_event,
    status,
    authority_boundary: AUTHORITY_BOUNDARY,
  };
}

export function promoteStageArtifactRuntime(input: StageArtifactLocator & {
  stage_id: string;
  attempt_id: string;
  artifact_ref: string;
}) {
  const stageDir = path.join(
    stageArtifactDeliverableRoot(input),
    'stages',
    stageFolderName(safeSegment(input.stage_id, 'stage_id')),
  );
  const matchingStageDir = fs.existsSync(stageDir)
    ? stageDir
    : resolveStageDirs(stageArtifactDeliverableRoot(input))
        .find((stage) => stage.stage_id === input.stage_id)?.stage_dir;
  if (!matchingStageDir) {
    throw new FrameworkContractError('contract_file_missing', 'Cannot promote missing stage artifact folder.', {
      stage_id: input.stage_id,
    });
  }
  const attemptDir = path.join(matchingStageDir, 'attempts', safeSegment(input.attempt_id, 'attempt_id'));
  if (!fs.existsSync(path.join(attemptDir, 'manifest.json'))) {
    throw new FrameworkContractError('contract_file_missing', 'Cannot promote attempt without manifest.', {
      attempt_id: input.attempt_id,
    });
  }
  const status = statusStageArtifactRuntime(input);
  const stage = status.stages.find((entry) => entry.stage_id === input.stage_id);
  const attempt = stage?.attempts.find((entry) => entry.attempt_id === input.attempt_id);
  if (attempt?.status !== 'success') {
    throw new FrameworkContractError('contract_shape_invalid', 'Cannot promote a stage artifact attempt that is not receipt-backed success.', {
      stage_id: input.stage_id,
      attempt_id: input.attempt_id,
      status: attempt?.status ?? 'missing',
      broken_reasons: attempt?.broken_reasons ?? [],
      missing_outputs: attempt?.missing_outputs ?? [],
      owner_receipt_refs: attempt?.owner_receipt_refs ?? [],
      authority_boundary: AUTHORITY_BOUNDARY,
    });
  }
  const canonicalPointer = {
    stage_id: input.stage_id,
    attempt_id: input.attempt_id,
    artifact_ref: safeText(input.artifact_ref),
    promoted_at: new Date().toISOString(),
    promotion_kind: 'refs_only_canonical_artifact_pointer',
    output_hashes: attempt.output_hashes,
    receipt_hashes: attempt.receipt_hashes,
    authority_boundary: AUTHORITY_BOUNDARY,
  };
  const canonicalFile = path.join(stageArtifactDeliverableRoot(input), 'artifacts', 'canonical', `${input.stage_id}.json`);
  writeJsonFile(canonicalFile, canonicalPointer);
  const lineage_event = appendLineageEvent(stageArtifactDeliverableRoot(input), {
    event_kind: 'canonical_pointer_promoted',
    locator: {
      domain_id: input.domain_id,
      program_id: input.program_id,
      topic_id: input.topic_id,
      deliverable_id: input.deliverable_id,
    },
    stage_id: input.stage_id,
    attempt_id: input.attempt_id,
    artifact_ref: safeText(input.artifact_ref),
    canonical_file: canonicalFile,
    wrote_domain_truth: false,
    created_owner_receipt: false,
  });
  return {
    surface_kind: 'opl_stage_artifact_runtime_promote',
    canonical_pointer: canonicalPointer,
    canonical_file: canonicalFile,
    lineage_event,
    opl_created_owner_receipt: false,
    authority_boundary: AUTHORITY_BOUNDARY,
  };
}

export function gcStageArtifactRuntime(input: StageArtifactLocator & { dry_run?: boolean }) {
  const status = statusStageArtifactRuntime(input);
  const canonicalDir = path.join(status.deliverable_root, 'artifacts', 'canonical');
  const canonicalAttemptIds = listFileNames(canonicalDir)
    .map((file) => readJsonFile(path.join(canonicalDir, file))?.attempt_id)
    .map((value) => safeText(value))
    .filter(Boolean);
  const candidateAttemptIds: string[] = [];
  const archivedAttemptIds: string[] = [];
  const restoreRefs: Array<{ attempt_id: string; restore_ref: string; archive_dir: string }> = [];
  for (const stage of status.stages) {
    for (const attempt of stage.attempts) {
      if (attempt.attempt_id === stage.latest_attempt_id || canonicalAttemptIds.includes(attempt.attempt_id)) {
        continue;
      }
      candidateAttemptIds.push(attempt.attempt_id);
      if (input.dry_run === false) {
        const archiveDir = path.join(
          retentionArchiveRoot(status.deliverable_root),
          stage.stage_id,
          attempt.attempt_id,
        );
        fs.rmSync(archiveDir, { recursive: true, force: true });
        fs.mkdirSync(path.dirname(archiveDir), { recursive: true });
        fs.renameSync(attempt.attempt_dir, archiveDir);
        const restoreRef = `opl-stage-artifact-restore:${input.domain_id}/${input.program_id}/${input.topic_id}/${input.deliverable_id}/${stage.stage_id}/${attempt.attempt_id}`;
        writeJsonFile(path.join(archiveDir, 'restore-proof.json'), {
          surface_kind: 'opl_stage_artifact_restore_proof',
          restore_ref: restoreRef,
          archived_at: new Date().toISOString(),
          original_attempt_dir: attempt.attempt_dir,
          archive_dir: archiveDir,
          retention_policy: RETENTION_POLICY,
          authority_boundary: AUTHORITY_BOUNDARY,
        });
        archivedAttemptIds.push(attempt.attempt_id);
        restoreRefs.push({
          attempt_id: attempt.attempt_id,
          restore_ref: restoreRef,
          archive_dir: archiveDir,
        });
      }
    }
  }
  const lineage_event = appendLineageEvent(status.deliverable_root, {
    event_kind: input.dry_run === false ? 'gc_archived_attempts' : 'gc_dry_run',
    locator: input,
    candidate_attempt_ids: candidateAttemptIds.sort(),
    archived_attempt_ids: archivedAttemptIds.sort(),
    restore_refs: restoreRefs,
    wrote_domain_truth: false,
    created_owner_receipt: false,
  });
  return {
    surface_kind: 'opl_stage_artifact_runtime_gc',
    dry_run: input.dry_run !== false,
    retention_policy: RETENTION_POLICY,
    candidate_attempt_ids: candidateAttemptIds.sort(),
    archived_attempt_ids: archivedAttemptIds.sort(),
    deleted_attempt_ids: [],
    restore_refs: restoreRefs.sort((a, b) => a.attempt_id.localeCompare(b.attempt_id)),
    lineage_event,
    authority_boundary: AUTHORITY_BOUNDARY,
  };
}

export function restoreStageArtifactRuntime(input: StageArtifactLocator & {
  stage_id: string;
  attempt_id: string;
  restore_ref: string;
}) {
  const deliverableRoot = stageArtifactDeliverableRoot(input);
  const stageId = safeSegment(input.stage_id, 'stage_id');
  const attemptId = safeSegment(input.attempt_id, 'attempt_id');
  const archiveDir = path.join(retentionArchiveRoot(deliverableRoot), stageId, attemptId);
  const restoreProof = readJsonFile(path.join(archiveDir, 'restore-proof.json'));
  const expectedRestoreRef = safeText(input.restore_ref);
  if (!restoreProof || safeText(restoreProof.restore_ref) !== expectedRestoreRef) {
    throw new FrameworkContractError('contract_file_missing', 'Cannot restore attempt without matching restore proof ref.', {
      stage_id: input.stage_id,
      attempt_id: input.attempt_id,
      restore_ref: expectedRestoreRef,
    });
  }
  const stageDir = resolveStageDirs(deliverableRoot).find((stage) => stage.stage_id === stageId)?.stage_dir
    ?? path.join(deliverableRoot, 'stages', stageFolderName(stageId));
  const restoredAttemptDir = path.join(stageDir, 'attempts', attemptId);
  if (fs.existsSync(restoredAttemptDir)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Cannot restore over an existing stage artifact attempt.', {
      stage_id: input.stage_id,
      attempt_id: input.attempt_id,
      attempt_dir: restoredAttemptDir,
    });
  }
  fs.mkdirSync(path.dirname(restoredAttemptDir), { recursive: true });
  fs.renameSync(archiveDir, restoredAttemptDir);
  writeJsonFile(path.join(restoredAttemptDir, 'restore-receipt.json'), {
    surface_kind: 'opl_stage_artifact_restore_receipt',
    restore_ref: expectedRestoreRef,
    restored_at: new Date().toISOString(),
    restored_attempt_dir: restoredAttemptDir,
    restored_from_archive_dir: archiveDir,
    created_owner_receipt: false,
    wrote_domain_truth: false,
    retention_policy: RETENTION_POLICY,
    authority_boundary: AUTHORITY_BOUNDARY,
  });
  const status = statusStageArtifactRuntime(input);
  const lineage_event = appendLineageEvent(deliverableRoot, {
    event_kind: 'attempt_restored',
    locator: input,
    stage_id: input.stage_id,
    attempt_id: input.attempt_id,
    restore_ref: expectedRestoreRef,
    restored_attempt_dir: restoredAttemptDir,
    wrote_domain_truth: false,
    created_owner_receipt: false,
  });
  return {
    surface_kind: 'opl_stage_artifact_runtime_restore',
    restore_ref: expectedRestoreRef,
    restored_attempt_dir: restoredAttemptDir,
    status,
    lineage_event,
    opl_created_owner_receipt: false,
    authority_boundary: AUTHORITY_BOUNDARY,
  };
}

export function conformanceStageArtifactRuntime(locator: StageArtifactLocator, options?: { record_event?: boolean }) {
  const deliverableRoot = stageArtifactDeliverableRoot(locator);
  const status = statusStageArtifactRuntime(locator);
  const violations: Array<{ code: string; detail: JsonRecord }> = [];
  const deliverableFile = path.join(deliverableRoot, 'deliverable.json');
  if (!readJsonFile(deliverableFile)) {
    violations.push({
      code: 'missing_deliverable_json',
      detail: { file: deliverableFile },
    });
  }
  const currentFile = path.join(deliverableRoot, 'current.json');
  const current = readJsonFile(currentFile);
  if (status.stages.length > 0 && !current) {
    violations.push({
      code: 'missing_current_pointer',
      detail: { file: currentFile },
    });
  }
  for (const stage of status.stages) {
    if (!readJsonFile(path.join(stage.stage_dir, 'stage.json'))) {
      violations.push({
        code: 'missing_stage_json',
        detail: { stage_id: stage.stage_id, stage_dir: stage.stage_dir },
      });
    }
    const latestPointerAttemptId = readLatestAttemptId(stage.stage_dir);
    if (stage.attempts.length > 0 && !latestPointerAttemptId) {
      violations.push({
        code: 'missing_latest_pointer',
        detail: { stage_id: stage.stage_id, latest_pointer: path.join(stage.stage_dir, 'latest') },
      });
    } else if (latestPointerAttemptId && !stage.attempts.some((attempt) => attempt.attempt_id === latestPointerAttemptId)) {
      violations.push({
        code: 'latest_pointer_missing_attempt',
        detail: { stage_id: stage.stage_id, latest_attempt_id: latestPointerAttemptId },
      });
    }
    for (const attempt of stage.attempts) {
      for (const requiredEntry of ['attempt.json', 'manifest.json', 'inputs', 'outputs', 'evidence', 'receipts']) {
        const entryPath = path.join(attempt.attempt_dir, requiredEntry);
        if (!fs.existsSync(entryPath)) {
          violations.push({
            code: 'missing_required_attempt_entry',
            detail: { stage_id: stage.stage_id, attempt_id: attempt.attempt_id, entry: requiredEntry, path: entryPath },
          });
        }
      }
      const manifest = readJsonFile(path.join(attempt.attempt_dir, 'manifest.json'));
      const manifestOutputHashes = readManifestHashes(manifest?.output_hashes, 'output');
      const manifestEvidenceHashes = readManifestHashes(manifest?.evidence_hashes, 'evidence');
      const manifestReceiptHashes = readManifestHashes(manifest?.receipt_hashes, 'receipt');
      if (!Array.isArray(manifest?.output_hashes)) {
        violations.push({
          code: 'missing_manifest_output_hashes',
          detail: { stage_id: stage.stage_id, attempt_id: attempt.attempt_id },
        });
      }
      for (const missingHash of missingManifestHashEntries(manifestOutputHashes, attempt.output_hashes)) {
        violations.push({
          code: 'missing_manifest_hash_entry',
          detail: { stage_id: stage.stage_id, attempt_id: attempt.attempt_id, missing_hash: missingHash },
        });
      }
      for (const missingHash of missingManifestHashEntries(manifestEvidenceHashes, attempt.evidence_hashes)) {
        violations.push({
          code: 'missing_manifest_hash_entry',
          detail: { stage_id: stage.stage_id, attempt_id: attempt.attempt_id, missing_hash: missingHash },
        });
      }
      if (!Array.isArray(manifest?.receipt_hashes)) {
        violations.push({
          code: 'missing_manifest_receipt_hashes',
          detail: { stage_id: stage.stage_id, attempt_id: attempt.attempt_id },
        });
      }
      for (const missingHash of missingManifestHashEntries(manifestReceiptHashes, attempt.receipt_hashes)) {
        violations.push({
          code: 'missing_manifest_hash_entry',
          detail: { stage_id: stage.stage_id, attempt_id: attempt.attempt_id, missing_hash: missingHash },
        });
      }
      for (const mismatch of attempt.hash_mismatches) {
        violations.push({
          code: 'manifest_content_hash_mismatch',
          detail: { stage_id: stage.stage_id, attempt_id: attempt.attempt_id, mismatch },
        });
      }
      if (attempt.status === 'broken' || attempt.status === 'orphan') {
        violations.push({
          code: `attempt_${attempt.status}`,
          detail: {
            stage_id: stage.stage_id,
            attempt_id: attempt.attempt_id,
            broken_reasons: attempt.broken_reasons,
            orphan_outputs: attempt.orphan_outputs,
          },
        });
      }
    }
  }
  const canonicalDir = path.join(deliverableRoot, 'artifacts', 'canonical');
  const canonical_pointers = listFileNames(canonicalDir).map((file) => ({
    file: path.join(canonicalDir, file),
    pointer: readJsonFile(path.join(canonicalDir, file)),
  }));
  const exportDir = path.join(deliverableRoot, 'artifacts', 'exports');
  const export_refs = listRelativeFiles(exportDir).map((file) => path.join(exportDir, file));
  const passed = violations.length === 0;
  const lineage_event = options?.record_event === false
    ? null
    : appendLineageEvent(deliverableRoot, {
        event_kind: 'conformance_checked',
        locator,
        passed,
        violation_count: violations.length,
        wrote_domain_truth: false,
        created_owner_receipt: false,
      });
  return {
    surface_kind: 'opl_stage_artifact_runtime_conformance',
    version: 'stage-artifact-runtime-conformance.v1',
    locator,
    passed,
    violations,
    required_contract_units: [
      'Stage Folder',
      'Manifest',
      'Receipt',
      'content_hashes',
      'latest_pointer',
      'current_pointer',
      'lineage_events',
    ],
    canonical_pointers,
    export_refs,
    retention_policy: RETENTION_POLICY,
    lineage_event,
    authority_boundary: AUTHORITY_BOUNDARY,
  };
}

export function workbenchStageArtifactRuntime(locator: StageArtifactLocator) {
  const status = statusStageArtifactRuntime(locator);
  const conformance = conformanceStageArtifactRuntime(locator, { record_event: false });
  const current = readJsonFile(path.join(status.deliverable_root, 'current.json'));
  const canonicalDir = path.join(status.deliverable_root, 'artifacts', 'canonical');
  const exportDir = path.join(status.deliverable_root, 'artifacts', 'exports');
  const canonical_artifacts = listFileNames(canonicalDir).map((file) => ({
    file: path.join(canonicalDir, file),
    pointer: readJsonFile(path.join(canonicalDir, file)),
  }));
  const export_artifacts = listRelativeFiles(exportDir).map((file) => ({
    file,
    path: path.join(exportDir, file),
    ...fileHash(path.join(exportDir, file)),
  }));
  return {
    surface_kind: 'opl_stage_artifact_runtime_workbench',
    version: 'stage-artifact-runtime-workbench.v1',
    locator,
    deliverable_root: status.deliverable_root,
    current_pointer: {
      file: path.join(status.deliverable_root, 'current.json'),
      payload: current,
    },
    status_summary: status.summary,
    stages: status.stages.map((stage) => ({
      stage_id: stage.stage_id,
      status: stage.status,
      stage_dir: stage.stage_dir,
      latest_attempt_id: stage.latest_attempt_id,
      required_outputs: stage.required_outputs,
      missing_outputs: stage.missing_outputs,
      owner_receipt_refs: stage.owner_receipt_refs,
      typed_blocker_refs: stage.typed_blocker_refs,
      decision_receipt_refs: stage.decision_receipt_refs,
      next_required_owner_delta: stage.next_required_owner_delta,
      attempts: stage.attempts.map((attempt) => ({
        attempt_id: attempt.attempt_id,
        status: attempt.status,
        attempt_dir: attempt.attempt_dir,
        required_outputs: attempt.required_outputs,
        present_outputs: attempt.present_outputs,
        output_hashes: attempt.output_hashes,
        evidence_hashes: attempt.evidence_hashes,
        receipt_hashes: attempt.receipt_hashes,
        receipt_refs: {
          owner: attempt.owner_receipt_refs,
          typed_blocker: attempt.typed_blocker_refs,
          decision: attempt.decision_receipt_refs,
        },
        broken_reasons: attempt.broken_reasons,
        orphan_outputs: attempt.orphan_outputs,
      })),
    })),
    canonical_artifacts,
    export_artifacts,
    lineage: {
      events_file: lineageEventsFile(status.deliverable_root),
      event_count: readLineageEvents(status.deliverable_root).length,
      graph_file: path.join(lineageDirForDeliverable(status.deliverable_root), 'graph.json'),
    },
    conformance: {
      passed: conformance.passed,
      violation_count: conformance.violations.length,
      violations: conformance.violations,
    },
    retention_policy: RETENTION_POLICY,
    authority_boundary: AUTHORITY_BOUNDARY,
  };
}

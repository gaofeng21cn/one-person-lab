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
  opl_can_write_domain_truth: false,
  opl_can_write_domain_artifact_body: false,
  opl_can_declare_quality_verdict: false,
  domain_receipt_authority_preserved: true,
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

  const manifest = {
    surface_kind: 'opl_stage_artifact_manifest',
    manifest_version: 'stage-artifact-manifest.v1',
    stage_id: input.stage_id,
    stage_order: input.stage_order ?? null,
    attempt_id: input.attempt_id,
    terminal_status: terminalStatus,
    required_outputs: requiredOutputs,
    present_outputs: listRelativeFiles(paths.outputs_dir),
    owner_receipt_refs: ownerReceiptRefs,
    typed_blocker_refs: typedBlockerRefs,
    decision_receipt_refs: decisionReceiptRefs,
    committed_at: new Date().toISOString(),
    authority_boundary: AUTHORITY_BOUNDARY,
  };
  writeJsonFile(paths.manifest_file, manifest);
  writeJsonFile(path.join(paths.receipts_dir, 'opl-stage-commit-receipt.json'), {
    surface_kind: 'opl_stage_artifact_commit_receipt',
    receipt_ref: `opl-stage-artifact-commit:${input.domain_id}/${input.program_id}/${input.topic_id}/${input.deliverable_id}/${input.stage_id}/${input.attempt_id}`,
    receipt_kind: 'opl_refs_only_stage_artifact_commit',
    terminal_status: terminalStatus,
    created_owner_receipt: false,
    wrote_domain_truth: false,
    mutated_artifact_body: false,
    authority_boundary: AUTHORITY_BOUNDARY,
  });
  writeLatestPointer(paths.latest_pointer, input.attempt_id);
  const status = statusStageArtifactRuntime(input);
  const currentPointer = writeCurrentPointer(input, status);
  return {
    surface_kind: 'opl_stage_artifact_runtime_commit',
    manifest,
    manifest_file: paths.manifest_file,
    latest_pointer: paths.latest_pointer,
    current_pointer: currentPointer,
    status,
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
    })),
    authority_boundary: AUTHORITY_BOUNDARY,
  };
  const indexFile = path.join(status.deliverable_root, 'stage-artifact-index.json');
  writeJsonFile(indexFile, index);
  return {
    surface_kind: 'opl_stage_artifact_runtime_rebuild',
    index,
    index_file: indexFile,
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
  const canonicalPointer = {
    stage_id: input.stage_id,
    attempt_id: input.attempt_id,
    artifact_ref: safeText(input.artifact_ref),
    promoted_at: new Date().toISOString(),
    promotion_kind: 'refs_only_canonical_artifact_pointer',
    authority_boundary: AUTHORITY_BOUNDARY,
  };
  const canonicalFile = path.join(stageArtifactDeliverableRoot(input), 'artifacts', 'canonical', `${input.stage_id}.json`);
  writeJsonFile(canonicalFile, canonicalPointer);
  return {
    surface_kind: 'opl_stage_artifact_runtime_promote',
    canonical_pointer: canonicalPointer,
    canonical_file: canonicalFile,
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
  const deletedAttemptIds: string[] = [];
  for (const stage of status.stages) {
    for (const attempt of stage.attempts) {
      if (attempt.attempt_id === stage.latest_attempt_id || canonicalAttemptIds.includes(attempt.attempt_id)) {
        continue;
      }
      candidateAttemptIds.push(attempt.attempt_id);
      if (!input.dry_run) {
        fs.rmSync(attempt.attempt_dir, { recursive: true, force: true });
        deletedAttemptIds.push(attempt.attempt_id);
      }
    }
  }
  return {
    surface_kind: 'opl_stage_artifact_runtime_gc',
    dry_run: input.dry_run !== false,
    candidate_attempt_ids: candidateAttemptIds.sort(),
    deleted_attempt_ids: deletedAttemptIds.sort(),
    authority_boundary: AUTHORITY_BOUNDARY,
  };
}

import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import {
  appendLineageEvent,
  AUTHORITY_BOUNDARY,
  compareHashManifest,
  ensureStageArtifactAttempt,
  fileHash,
  hashFiles,
  lineageDirForDeliverable,
  lineageEventsFile,
  listDirNames,
  listFileNames,
  listRelativeFiles,
  missingManifestHashEntries,
  readJsonFile,
  readLatestAttemptId,
  readLineageEvents,
  readManifestHashes,
  relativePathList,
  resolveStageDirs,
  RETENTION_POLICY,
  retentionArchiveRoot,
  safeRelativePath,
  safeSegment,
  safeText,
  stageArtifactAttemptPaths,
  stageArtifactDeliverableRoot,
  stageFolderName,
  stringList,
  writeJsonFile,
  writeLineageGraph,
  type JsonRecord,
  type StageArtifactAttemptLocator,
  type StageArtifactLocator,
  type StageAttemptStatus,
  type StageAttemptTerminalStatus,
  type StageStatus,
} from './stage-artifact-runtime-core.ts';

export {
  ensureStageArtifactAttempt,
  openStageArtifactAttemptRuntime,
  stageArtifactAttemptPaths,
  stageArtifactDeliverableRoot,
  type StageArtifactAttemptLocator,
  type StageArtifactLocator,
} from './stage-artifact-runtime-core.ts';

function recordHasRef(record: JsonRecord, ref: string) {
  return safeText(record.receipt_ref) === ref
    || safeText(record.owner_receipt_ref) === ref
    || safeText(record.typed_blocker_ref) === ref
    || safeText(record.decision_receipt_ref) === ref
    || stringList(record.receipt_refs).includes(ref)
    || stringList(record.owner_receipt_refs).includes(ref)
    || stringList(record.quality_debt_refs).includes(ref)
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
  return ['success', 'completed_with_quality_debt', 'blocked', 'skipped', 'deferred'].includes(status)
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
  const qualityDebtRefs = stringList(manifest?.quality_debt_refs);
  const typedBlockerRefs = stringList(manifest?.typed_blocker_refs);
  const decisionReceiptRefs = stringList(manifest?.decision_receipt_refs);
  const terminalStatus = terminalStatusFromManifest(manifest);
  const manifestValid = Boolean(manifest)
    && safeText(manifest?.stage_id, stageId) === stageId
    && safeText(manifest?.attempt_id, attemptId) === attemptId;
  const brokenReasons: string[] = [];
  const ownerReceiptMatch = refsBackedByFiles(receiptsDir, ownerReceiptRefs);
  const qualityDebtMatch = refsBackedByFiles(evidenceDir, qualityDebtRefs);
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
  } else if (terminalStatus === 'completed_with_quality_debt') {
    if (requiredOutputs.length === 0) {
      status = 'broken';
      brokenReasons.push('quality_debt_manifest_missing_required_outputs');
    } else if (missingOutputs.length > 0) {
      status = 'broken';
      brokenReasons.push('required_outputs_missing_for_quality_debt_completion');
    } else if (hashMismatches.length > 0) {
      status = 'broken';
      brokenReasons.push('manifest_content_hash_mismatch');
    } else if (qualityDebtRefs.length === 0) {
      status = 'broken';
      brokenReasons.push('quality_debt_completion_missing_quality_debt_ref');
    } else if (qualityDebtMatch.missing_refs.length > 0) {
      status = 'broken';
      brokenReasons.push('quality_debt_ref_without_matching_evidence_file');
    } else {
      status = 'completed_with_quality_debt';
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
    quality_debt_refs: qualityDebtRefs,
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
    : status === 'completed_with_quality_debt'
      ? ['quality_debt_repair_or_owner_acceptance_without_stage_transition_block']
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
    quality_debt_refs: selected?.quality_debt_refs ?? [],
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
      completed_with_quality_debt_stage_count: stages.filter(
        (stage) => stage.status === 'completed_with_quality_debt',
      ).length,
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
  quality_debt_refs: string[];
  typed_blocker_refs: string[];
  decision_receipt_refs: string[];
  outputs_dir: string;
  evidence_dir: string;
  receipts_dir: string;
}) {
  if (input.terminal_status === 'success' || input.terminal_status === 'completed_with_quality_debt') {
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
    if (input.terminal_status === 'success'
      && (input.owner_receipt_refs.length === 0 || ownerReceiptMatch.missing_refs.length > 0)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Stage success requires owner receipt refs backed by receipt files.', {
        owner_receipt_refs: input.owner_receipt_refs,
        missing_owner_receipt_refs: ownerReceiptMatch.missing_refs,
      });
    }
    const qualityDebtMatch = refsBackedByFiles(input.evidence_dir, input.quality_debt_refs);
    if (input.terminal_status === 'completed_with_quality_debt'
      && (input.quality_debt_refs.length === 0 || qualityDebtMatch.missing_refs.length > 0)) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Quality-debt completion requires quality debt refs backed by evidence files.',
        {
          quality_debt_refs: input.quality_debt_refs,
          missing_quality_debt_refs: qualityDebtMatch.missing_refs,
        },
      );
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
  const currentStage = status.stages.find(
    (stage) => !['success', 'completed_with_quality_debt'].includes(stage.status),
  )
    ?? status.stages.at(-1)
    ?? null;
  const currentFile = path.join(status.deliverable_root, 'current.json');
  const payload = {
    surface_kind: 'opl_stage_artifact_runtime_current',
    projection_role: 'stage_artifact_current_projection_only',
    current_pointer_role: 'artifact_attempt_pointer_not_stage_run_current_pointer',
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
    completed_with_quality_debt_stage_count: status.summary.completed_with_quality_debt_stage_count,
    stage_transition_authority_required_for_stage_run_current: true,
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
  quality_debt_refs?: string[];
  typed_blocker_refs?: string[];
  decision_receipt_refs?: string[];
}) {
  const terminalStatus = input.terminal_status;
  const paths = ensureStageArtifactAttempt(input);
  const requiredOutputs = [...new Set((input.required_outputs ?? []).map((entry) => safeRelativePath(entry, 'required_outputs')))];
  const ownerReceiptRefs = stringList(input.owner_receipt_refs ?? []);
  const qualityDebtRefs = stringList(input.quality_debt_refs ?? []);
  const typedBlockerRefs = stringList(input.typed_blocker_refs ?? []);
  const decisionReceiptRefs = stringList(input.decision_receipt_refs ?? []);

  assertTerminalRefs({
    terminal_status: terminalStatus,
    required_outputs: requiredOutputs,
    owner_receipt_refs: ownerReceiptRefs,
    quality_debt_refs: qualityDebtRefs,
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
    quality_debt_refs: qualityDebtRefs,
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
  const currentStage = status.stages.find(
    (stage) => !['success', 'completed_with_quality_debt'].includes(stage.status),
  )
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
      quality_debt_refs: stage.quality_debt_refs,
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

export function validateStageArtifactRuntime(locator: StageArtifactLocator) {
  const conformance = conformanceStageArtifactRuntime(locator, { record_event: false });
  const lineage_event = appendLineageEvent(stageArtifactDeliverableRoot(locator), {
    event_kind: 'validation_checked',
    locator,
    passed: conformance.passed,
    violation_count: conformance.violations.length,
    wrote_domain_truth: false,
    created_owner_receipt: false,
  });
  return {
    surface_kind: 'opl_stage_artifact_runtime_validation',
    version: 'stage-artifact-runtime-validation.v1',
    locator,
    passed: conformance.passed,
    violations: conformance.violations,
    validates: conformance.required_contract_units,
    conformance,
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

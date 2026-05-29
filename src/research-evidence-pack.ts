type JsonRecord = Record<string, unknown>;

type ChecksumStatus = 'verified' | 'missing' | 'mismatch' | 'unchecked';
type RestoreStatus = 'restore_ready' | 'restore_pending' | 'restored' | 'restore_blocked' | 'not_required';

export interface ResearchEvidencePackValidationError {
  code:
    | 'root_not_object'
    | 'surface_kind_invalid'
    | 'version_invalid'
    | 'surface_missing'
    | 'surface_version_invalid'
    | 'authority_boundary_invalid'
    | 'domain_body_forbidden'
    | 'ref_body_forbidden';
  path: string;
  message: string;
}

export interface ResearchEvidencePackValidation {
  valid: boolean;
  errors: ResearchEvidencePackValidationError[];
}

export interface ResearchEvidencePackMissingRef {
  ref_id: string | null;
  role: string | null;
  ref_kind: string | null;
  ref: string | null;
  source_surface: string;
  status: string | null;
}

export interface ResearchEvidencePackSummary {
  surface_kind: 'research_evidence_pack_summary';
  version: 'research_evidence_pack_summary.v1';
  pack_id: string | null;
  target_domain_id: string | null;
  study_id: string | null;
  missing_refs: ResearchEvidencePackMissingRef[];
  checksum_status: Record<`${ChecksumStatus}_count`, number>;
  restore_status: Record<`${RestoreStatus}_count`, number>;
  failed_path_count: number;
  negative_result_count: number;
  next_owner_refs: string[];
  stage_replay_readiness: {
    stage_count: number;
    replay_ready_stage_count: number;
    blocked_stage_count: number;
    replay_ready: boolean;
    blocked_stage_ids: string[];
  };
  authority_boundary: {
    opl_role: 'research_evidence_pack_projection_only';
    evidence_scope: 'refs_index_projection_replay_only';
    can_read_domain_body: false;
    can_accept_or_reject_owner_receipt: false;
    can_sign_domain_receipt: false;
    can_authorize_domain_ready: false;
    can_authorize_quality_verdict: false;
    can_mutate_artifact_body: false;
  };
}

const REQUIRED_SURFACES = [
  ['run_manifest', 'research_run_manifest', 'research_run_manifest.v1'],
  ['negative_failed_path_ledger', 'negative_failed_path_ledger', 'negative_failed_path_ledger.v1'],
  ['decision_trace', 'decision_trace', 'decision_trace.v1'],
  ['artifact_lineage_graph', 'artifact_lineage_graph', 'artifact_lineage_graph.v1'],
  ['reproducibility_bundle', 'reproducibility_bundle', 'reproducibility_bundle.v1'],
] as const;

const AUTHORITY_BOUNDARY = {
  opl_role: 'research_evidence_pack_projection_only',
  evidence_scope: 'refs_index_projection_replay_only',
  can_read_domain_body: false,
  can_accept_or_reject_owner_receipt: false,
  can_sign_domain_receipt: false,
  can_authorize_domain_ready: false,
  can_authorize_quality_verdict: false,
  can_mutate_artifact_body: false,
} as const;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function recordList(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function validationError(
  code: ResearchEvidencePackValidationError['code'],
  path: string,
  message: string,
): ResearchEvidencePackValidationError {
  return { code, path, message };
}

function collectForbiddenBodyErrors(value: unknown, path: string, errors: ResearchEvidencePackValidationError[]) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectForbiddenBodyErrors(entry, `${path}[${index}]`, errors));
    return;
  }
  if (!isRecord(value)) {
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    const childPath = path === '$' ? `$.${key}` : `${path}.${key}`;
    if (key === 'domain_body') {
      errors.push(validationError(
        'domain_body_forbidden',
        childPath,
        'OPL research evidence packs are refs/index/projection/replay only and must not carry domain body.',
      ));
      continue;
    }
    if (key === 'body' || key === 'content' || key === 'payload_body') {
      errors.push(validationError(
        'ref_body_forbidden',
        childPath,
        'OPL research evidence packs must carry refs only; body-like payload fields are forbidden.',
      ));
      continue;
    }
    if (key === 'body_included' && entry !== false) {
      errors.push(validationError(
        'ref_body_forbidden',
        childPath,
        'body_included must be false for every research evidence pack ref.',
      ));
      continue;
    }
    collectForbiddenBodyErrors(entry, childPath, errors);
  }
}

function validateAuthorityBoundary(value: unknown, errors: ResearchEvidencePackValidationError[]) {
  const boundary = record(value);
  for (const [key, expected] of Object.entries(AUTHORITY_BOUNDARY)) {
    if (boundary[key] !== expected) {
      errors.push(validationError(
        'authority_boundary_invalid',
        `$.authority_boundary.${key}`,
        `${key} must be ${String(expected)}.`,
      ));
    }
  }
}

export function validateResearchEvidencePack(value: unknown): ResearchEvidencePackValidation {
  const errors: ResearchEvidencePackValidationError[] = [];
  if (!isRecord(value)) {
    return {
      valid: false,
      errors: [validationError('root_not_object', '$', 'Research evidence pack must be an object.')],
    };
  }

  if (value.surface_kind !== 'research_evidence_pack') {
    errors.push(validationError('surface_kind_invalid', '$.surface_kind', 'surface_kind must be research_evidence_pack.'));
  }
  if (value.version !== 'research_evidence_pack.v1') {
    errors.push(validationError('version_invalid', '$.version', 'version must be research_evidence_pack.v1.'));
  }

  for (const [field, surfaceKind, version] of REQUIRED_SURFACES) {
    const surface = value[field];
    if (!isRecord(surface)) {
      errors.push(validationError('surface_missing', `$.${field}`, `${field} must be an object.`));
      continue;
    }
    if (surface.surface_kind !== surfaceKind || surface.version !== version) {
      errors.push(validationError(
        'surface_version_invalid',
        `$.${field}`,
        `${field} must use ${surfaceKind}/${version}.`,
      ));
    }
  }

  validateAuthorityBoundary(value.authority_boundary, errors);
  collectForbiddenBodyErrors(value, '$', errors);

  return { valid: errors.length === 0, errors };
}

function refRecords(pack: JsonRecord) {
  const runManifest = record(pack.run_manifest);
  const artifactLineageGraph = record(pack.artifact_lineage_graph);
  const reproducibilityBundle = record(pack.reproducibility_bundle);
  return [
    ...recordList(runManifest.input_refs).map((ref) => ({ source_surface: 'research_run_manifest.input_refs', ref })),
    ...recordList(runManifest.output_refs).map((ref) => ({ source_surface: 'research_run_manifest.output_refs', ref })),
    ...recordList(artifactLineageGraph.artifact_refs).map((ref) => ({ source_surface: 'artifact_lineage_graph.artifact_refs', ref })),
    ...recordList(reproducibilityBundle.restore_refs).map((ref) => ({ source_surface: 'reproducibility_bundle.restore_refs', ref })),
  ];
}

function unique(values: Array<string | null>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function checksumCounters(refs: Array<{ ref: JsonRecord }>): Record<`${ChecksumStatus}_count`, number> {
  const counts = {
    verified_count: 0,
    missing_count: 0,
    mismatch_count: 0,
    unchecked_count: 0,
  };
  for (const { ref } of refs) {
    const status = optionalString(ref.checksum_status) as ChecksumStatus | null;
    if (status === 'verified' || status === 'missing' || status === 'mismatch') {
      counts[`${status}_count`] += 1;
      continue;
    }
    counts.unchecked_count += 1;
  }
  return counts;
}

function restoreCounters(refs: Array<{ ref: JsonRecord }>): Record<`${RestoreStatus}_count`, number> {
  const counts = {
    restore_ready_count: 0,
    restore_pending_count: 0,
    restored_count: 0,
    restore_blocked_count: 0,
    not_required_count: 0,
  };
  for (const { ref } of refs) {
    const status = optionalString(ref.restore_status) as RestoreStatus | null;
    if (
      status === 'restore_ready'
      || status === 'restore_pending'
      || status === 'restored'
      || status === 'restore_blocked'
      || status === 'not_required'
    ) {
      counts[`${status}_count`] += 1;
      continue;
    }
    counts.restore_pending_count += 1;
  }
  return counts;
}

function missingRefs(refs: Array<{ source_surface: string; ref: JsonRecord }>): ResearchEvidencePackMissingRef[] {
  const seen = new Set<string>();
  return refs
    .filter(({ ref }) => ref.required === true && optionalString(ref.status) !== 'present')
    .flatMap(({ source_surface, ref }) => {
      const refId = optionalString(ref.ref_id);
      const refValue = optionalString(ref.ref);
      const key = `${refId ?? ''}\0${refValue ?? ''}`;
      if (seen.has(key)) {
        return [];
      }
      seen.add(key);
      return [{
        ref_id: refId,
        role: optionalString(ref.role),
        ref_kind: optionalString(ref.ref_kind),
        ref: refValue,
        source_surface,
        status: optionalString(ref.status),
      }];
    });
}

function replayStageReady(stage: JsonRecord) {
  return stringList(stage.append_only_event_log_refs).length > 0
    && stringList(stage.attempt_ledger_refs).length > 0
    && stringList(stage.recorded_runtime_event_refs).length > 0
    && stringList(stage.closeout_receipt_refs).length > 0;
}

function stageReplayReadiness(pack: JsonRecord) {
  const stages = recordList(record(pack.run_manifest).replay_stages);
  const blockedStageIds = stages
    .filter((stage) => !replayStageReady(stage))
    .map((stage) => optionalString(stage.stage_id) ?? 'unknown_stage');
  const readyCount = stages.length - blockedStageIds.length;
  return {
    stage_count: stages.length,
    replay_ready_stage_count: readyCount,
    blocked_stage_count: blockedStageIds.length,
    replay_ready: stages.length > 0 && blockedStageIds.length === 0,
    blocked_stage_ids: blockedStageIds,
  };
}

export function summarizeResearchEvidencePack(value: unknown): ResearchEvidencePackSummary {
  const validation = validateResearchEvidencePack(value);
  if (!validation.valid) {
    throw new Error(`Research evidence pack failed fail-closed validation: ${validation.errors.map((error) => error.code).join(', ')}`);
  }
  const pack = value as JsonRecord;
  const refs = refRecords(pack);
  const ledger = record(pack.negative_failed_path_ledger);
  const decisions = record(pack.decision_trace);
  const decisionOwnerRefs = recordList(decisions.decisions).map((decision) => optionalString(decision.next_owner_ref));

  return {
    surface_kind: 'research_evidence_pack_summary',
    version: 'research_evidence_pack_summary.v1',
    pack_id: optionalString(pack.pack_id),
    target_domain_id: optionalString(pack.target_domain_id),
    study_id: optionalString(pack.study_id),
    missing_refs: missingRefs(refs),
    checksum_status: checksumCounters(refs),
    restore_status: restoreCounters(refs),
    failed_path_count: recordList(ledger.failed_paths).length,
    negative_result_count: recordList(ledger.negative_results).length,
    next_owner_refs: unique([...stringList(decisions.next_owner_refs), ...decisionOwnerRefs]),
    stage_replay_readiness: stageReplayReadiness(pack),
    authority_boundary: { ...AUTHORITY_BOUNDARY },
  };
}

import { canonicalJsonText } from '../../kernel/canonical-json.ts';
import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { stableId } from '../../kernel/stable-id.ts';
import {
  normalizeStageQualityArtifactIdentity,
  type StageQualityAttemptRole,
} from '../stagecraft/public/stage-quality-cycle.ts';
import {
  readReviewerInputSnapshotManifest,
  type resolveReviewerInputSnapshotMaterialization,
} from './family-runtime-reviewer-input-snapshot.ts';
import { revisionTransportContext } from './family-runtime-revision-intake.ts';

const REVIEW_INPUT_SNAPSHOT_READ_POLICY = {
  live_artifact_refs_role: 'identity_verification_only',
  member_content_locator_source: 'opl_reviewer_input_snapshot_manifest.members[].immutable_ref',
  live_workspace_content_read_allowed: false,
} as const;

function refs(value: unknown, field: string, required = false) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !entry.trim())) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} must contain non-empty string refs.`, {
      field,
    });
  }
  const normalized = [...new Set(value.map((entry) => entry.trim()))];
  if (required && normalized.length === 0) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} requires at least one ref.`, { field });
  }
  return normalized;
}

function text(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} must be a non-empty string.`, { field });
  }
  return value.trim();
}

function record(value: unknown, field: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} must be an object.`, { field });
  }
  return value as Record<string, unknown>;
}

function forbiddenContextFieldPaths(value: unknown) {
  const forbiddenKeys = new Set([
    'conversation_history',
    'producer_conversation_history',
    'reviewer_conversation_history',
    'thread_resume',
    'producer_thread_resume',
    'reviewer_thread_resume',
    'session_history',
    'transcript',
    'chain_of_thought',
    'undeclared_ephemeral_context',
  ]);
  const paths: string[] = [];
  const visited = new WeakSet<object>();
  const visit = (current: unknown, path: string) => {
    if (!current || typeof current !== 'object' || visited.has(current)) return;
    visited.add(current);
    for (const [key, nested] of Object.entries(current)) {
      const nestedPath = path ? `${path}.${key}` : key;
      if (forbiddenKeys.has(key)) paths.push(nestedPath);
      visit(nested, nestedPath);
    }
  };
  visit(value, '');
  return paths;
}

export function buildStageQualityContextManifestRef(contextManifest: Record<string, unknown>) {
  return `opl://stage-quality-context/${stableId('ctx', [contextManifest])}`;
}

export function buildStageReviewInputSnapshotContext(input: {
  stageRunId: string;
  qualityCycleId: string;
  reviewerAttemptRole: 'reviewer' | 're_reviewer';
  resolution: ReturnType<typeof resolveReviewerInputSnapshotMaterialization>;
}) {
  if (input.resolution.surface_kind === 'opl_reviewer_input_snapshot_materialization') {
    return {
      review_input_snapshot_status: input.resolution.materialization_status,
      review_input_snapshot_binding: input.resolution.review_input_snapshot_binding,
      opl_reviewer_input_snapshot_manifest_ref: input.resolution.manifest_ref,
      opl_reviewer_input_snapshot_manifest: input.resolution.manifest,
      review_input_snapshot_read_policy: REVIEW_INPUT_SNAPSHOT_READ_POLICY,
      review_input_snapshot_quality_debt_receipt_ref: null,
      review_input_snapshot_quality_debt_receipt: null,
    } as const;
  }
  const receipt = {
    surface_kind: 'opl_review_input_snapshot_quality_debt_receipt',
    version: 'opl-review-input-snapshot-quality-debt-receipt.v1',
    stage_run_id: input.stageRunId,
    quality_cycle_id: input.qualityCycleId,
    reviewer_attempt_role: input.reviewerAttemptRole,
    reason_code: input.resolution.reason_code,
    resume_condition: input.resolution.resume_condition,
    hosted_action_launch_allowed: true,
    ordinary_progress_may_advance: true,
    stage_transition_allowed: true,
    quality_publication_export_or_submission_claim_allowed: false,
    typed_blocker_ref: null,
  } as const;
  return {
    review_input_snapshot_status: 'quality_debt',
    review_input_snapshot_binding: null,
    opl_reviewer_input_snapshot_manifest_ref: null,
    opl_reviewer_input_snapshot_manifest: null,
    review_input_snapshot_read_policy: REVIEW_INPUT_SNAPSHOT_READ_POLICY,
    review_input_snapshot_quality_debt_receipt_ref:
      `opl://stage-review-input-snapshot-quality-debt/${stableId('debt', [receipt])}`,
    review_input_snapshot_quality_debt_receipt: receipt,
  } as const;
}

function validateStageReviewInputSnapshotContext(manifest: Record<string, unknown>) {
  const status = manifest.review_input_snapshot_status;
  const readPolicy = record(
    manifest.review_input_snapshot_read_policy,
    'context_manifest.review_input_snapshot_read_policy',
  );
  if (canonicalJsonText(readPolicy) !== canonicalJsonText(REVIEW_INPUT_SNAPSHOT_READ_POLICY)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Stage Review context manifest must keep live artifact refs identity-only and read member bytes from the immutable manifest.',
      { failure_code: 'review_input_snapshot_read_policy_invalid' },
    );
  }
  if (status === 'quality_debt') {
    if (
      manifest.review_input_snapshot_binding !== null
      || manifest.opl_reviewer_input_snapshot_manifest_ref !== null
      || manifest.opl_reviewer_input_snapshot_manifest !== null
    ) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Missing reviewer input snapshot debt cannot carry a snapshot binding or manifest.',
        { failure_code: 'review_input_snapshot_quality_debt_binding_invalid' },
      );
    }
    const receipt = record(
      manifest.review_input_snapshot_quality_debt_receipt,
      'context_manifest.review_input_snapshot_quality_debt_receipt',
    );
    if (
      receipt.surface_kind !== 'opl_review_input_snapshot_quality_debt_receipt'
      || receipt.version !== 'opl-review-input-snapshot-quality-debt-receipt.v1'
      || receipt.stage_run_id !== manifest.stage_run_id
      || receipt.quality_cycle_id !== manifest.quality_cycle_id
      || receipt.reviewer_attempt_role !== manifest.reviewer_attempt_role
      || ![
        'review_input_snapshot_binding_required',
        'review_input_snapshot_authority_upgrade_required',
      ].includes(String(receipt.reason_code))
      || receipt.hosted_action_launch_allowed !== true
      || receipt.ordinary_progress_may_advance !== true
      || receipt.stage_transition_allowed !== true
      || receipt.quality_publication_export_or_submission_claim_allowed !== false
      || receipt.typed_blocker_ref !== null
    ) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Stage Review snapshot quality-debt receipt is invalid.',
        { failure_code: 'review_input_snapshot_quality_debt_receipt_invalid' },
      );
    }
    const expectedDebtRef = `opl://stage-review-input-snapshot-quality-debt/${stableId('debt', [receipt])}`;
    if (manifest.review_input_snapshot_quality_debt_receipt_ref !== expectedDebtRef) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Stage Review snapshot quality-debt ref must bind the exact receipt body.',
        { failure_code: 'review_input_snapshot_quality_debt_receipt_ref_invalid' },
      );
    }
    return { status, quality_debt_receipt_ref: expectedDebtRef } as const;
  }
  if (status !== 'materialized' && status !== 'already_materialized') {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Stage Review context manifest requires a typed reviewer input snapshot status.',
      { failure_code: 'review_input_snapshot_status_invalid' },
    );
  }
  if (
    manifest.review_input_snapshot_quality_debt_receipt_ref !== null
    || manifest.review_input_snapshot_quality_debt_receipt !== null
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Materialized reviewer input snapshot cannot also carry missing-snapshot debt.',
      { failure_code: 'review_input_snapshot_materialized_debt_invalid' },
    );
  }
  const readback = readReviewerInputSnapshotManifest(
    manifest.opl_reviewer_input_snapshot_manifest_ref,
  );
  if (
    canonicalJsonText(readback.manifest) !== canonicalJsonText(manifest.opl_reviewer_input_snapshot_manifest)
    || canonicalJsonText(readback.binding) !== canonicalJsonText(manifest.review_input_snapshot_binding)
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Stage Review context manifest snapshot body or binding does not match its exact persisted ref.',
      { failure_code: 'review_input_snapshot_context_binding_mismatch' },
    );
  }
  return { status, quality_debt_receipt_ref: null } as const;
}

export function validateStageQualityAttemptContextManifest(input: {
  attemptRole: StageQualityAttemptRole;
  stageRunId: string;
  qualityCycleId: string;
  artifactRefs?: string[];
  artifactHashes?: string[];
  stageGoalRefs?: string[];
  sourceRefs?: string[];
  lineageRefs?: string[];
  priorFindingRefs?: string[];
  repairMapRefs?: string[];
  rubricRefs: string[];
  contextManifestRef: string;
  contextManifest: unknown;
}) {
  const manifest = record(input.contextManifest, 'context_manifest');
  const reviewRole = input.attemptRole === 'reviewer' || input.attemptRole === 're_reviewer';
  const expected = {
    surface_kind: reviewRole
      ? 'opl_stage_review_context_manifest'
      : 'opl_stage_quality_attempt_context_manifest',
    version: reviewRole
      ? 'stage-review-context-manifest.v1'
      : 'stage-quality-attempt-context-manifest.v1',
    stage_run_id: text(input.stageRunId, 'stage_run_id'),
    quality_cycle_id: text(input.qualityCycleId, 'quality_cycle_id'),
    attempt_role: input.attemptRole,
  };
  const manifestRole = reviewRole ? manifest.reviewer_attempt_role : manifest.attempt_role;
  const mismatches = Object.entries(expected).filter(([field, expectedValue]) => {
    const actual = field === 'attempt_role' ? manifestRole : manifest[field];
    return actual !== expectedValue;
  });
  if (mismatches.length > 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Stage quality context manifest identity does not match the Attempt.',
      { mismatched_fields: mismatches.map(([field]) => field) },
    );
  }
  if (manifest.no_context_inheritance !== true) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Stage quality context manifest requires no_context_inheritance=true.',
    );
  }
  const rubricRefs = refs(manifest.quality_rubric_refs, 'context_manifest.quality_rubric_refs', true);
  if (JSON.stringify(rubricRefs) !== JSON.stringify(refs(input.rubricRefs, 'quality_rubric_refs', true))) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Stage quality context manifest rubric refs must exactly match the Attempt.',
    );
  }
  for (const [field, expectedRefs] of Object.entries({
    stage_goal_refs: input.stageGoalRefs ?? [],
    source_refs: input.sourceRefs ?? [],
    lineage_refs: input.lineageRefs ?? [],
    prior_finding_refs: input.priorFindingRefs ?? [],
    repair_map_refs: input.repairMapRefs ?? [],
  })) {
    const actualRefs = refs(manifest[field] ?? [], `context_manifest.${field}`);
    if (JSON.stringify(actualRefs) !== JSON.stringify(refs(expectedRefs, field))) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        `Stage quality context manifest ${field} must exactly match the Attempt lineage.`,
      );
    }
  }
  const manifestIdentity = normalizeStageQualityArtifactIdentity({
    artifactRefs: manifest.artifact_refs ?? [],
    artifactHashes: manifest.artifact_hashes ?? [],
    allowEmpty: !reviewRole,
  });
  const attemptIdentity = normalizeStageQualityArtifactIdentity({
    artifactRefs: input.artifactRefs ?? [],
    artifactHashes: input.artifactHashes ?? [],
    allowEmpty: !reviewRole,
  });
  if (
    JSON.stringify(manifestIdentity.artifact_refs) !== JSON.stringify(attemptIdentity.artifact_refs)
    || JSON.stringify(manifestIdentity.artifact_hashes) !== JSON.stringify(attemptIdentity.artifact_hashes)
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Stage quality context manifest artifact identity must exactly match the Attempt.',
    );
  }
  if (reviewRole) {
    validateStageReviewInputSnapshotContext(manifest);
    const forbiddenKinds = refs(
      manifest.forbidden_context_kinds,
      'context_manifest.forbidden_context_kinds',
      true,
    );
    const requiredForbiddenKinds = [
      'producer_conversation_history',
      'producer_thread_resume',
      'reviewer_thread_resume',
      'chain_of_thought',
      'undeclared_ephemeral_context',
    ];
    if (requiredForbiddenKinds.some((kind) => !forbiddenKinds.includes(kind))) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Stage Review context manifest must retain the complete forbidden-context policy.',
      );
    }
  }
  if (manifest.revision_consumption_context !== undefined) {
    const revisionContext = record(
      manifest.revision_consumption_context,
      'context_manifest.revision_consumption_context',
    );
    const normalizedRevisionContext = revisionTransportContext({
      revisionIntakeRefs: Array.isArray(revisionContext.revision_intake_refs)
        ? revisionContext.revision_intake_refs
        : [],
      oplStageReviewReceiptRef: revisionContext.opl_stage_review_receipt_ref,
    });
    if (canonicalJsonText(revisionContext) !== canonicalJsonText(normalizedRevisionContext)) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Stage quality revision consumption context does not bind its immutable OPL refs.',
        { failure_code: 'revision_consumption_context_invalid' },
      );
    }
  }
  const forbiddenPaths = forbiddenContextFieldPaths(manifest);
  if (forbiddenPaths.length > 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Stage quality context manifest contains forbidden inherited conversation context.',
      { forbidden_context_paths: forbiddenPaths },
    );
  }
  const expectedRef = buildStageQualityContextManifestRef(manifest);
  if (input.contextManifestRef !== expectedRef) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Stage quality context manifest ref must bind the exact persisted manifest body.',
      { expected_context_manifest_ref: expectedRef, received_context_manifest_ref: input.contextManifestRef },
    );
  }
  return manifest;
}

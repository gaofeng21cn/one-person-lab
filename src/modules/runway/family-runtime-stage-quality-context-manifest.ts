import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { stableId } from '../../kernel/stable-id.ts';
import {
  normalizeStageQualityArtifactIdentity,
  type StageQualityAttemptRole,
} from '../stagecraft/public/stage-quality-cycle.ts';

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

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { canonicalJsonText } from '../../kernel/canonical-json.ts';
import {
  normalizeStageQualityAttemptRole,
  type StageQualityAttemptRole,
} from '../stagecraft/public/stage-quality-cycle.ts';
import { normalizeStageQualityScopeBudget } from '../stagecraft/public/review-evidence-currentness.ts';

const FORBIDDEN_STAGE_FIELDS = [
  'next_stage_refs',
  'requires',
  'ensures',
  'stage_route',
  'sub_stage_graph',
  'independent_owner',
  'stage_current_pointer',
  'stage_transition_authority',
] as const;

export const STAGE_RUN_ATTEMPT_CONTENT_BINDING_VERSION =
  'opl-stage-run-attempt-content-binding.v1' as const;

export function isStageRunQualityAttempt(input: Record<string, unknown>) {
  return Boolean(input.stage_run_id || input.quality_cycle_id || input.attempt_role);
}

export function requireStageRunAttemptContentBindingVersion(
  input: Record<string, unknown>,
  options: { allowLegacyUnbound: boolean },
) {
  if (!isStageRunQualityAttempt(input)) return input;
  const version = input.stage_run_content_binding_version;
  if (version === undefined || version === null) {
    if (options.allowLegacyUnbound) return input;
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageRun child Attempt requires an immutable content binding version.',
      {
        failure_code: 'stage_run_child_content_binding_version_missing',
        stage_attempt_id: input.stage_attempt_id ?? null,
        stage_run_id: input.stage_run_id ?? null,
        attempt_role: input.attempt_role ?? null,
      },
    );
  }
  if (version !== STAGE_RUN_ATTEMPT_CONTENT_BINDING_VERSION) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageRun child Attempt content binding version is unsupported.',
      {
        failure_code: 'stage_run_child_content_binding_version_unsupported',
        stage_attempt_id: input.stage_attempt_id ?? null,
        stage_run_id: input.stage_run_id ?? null,
        received_version: version,
      },
    );
  }
  return input;
}

export function requireGenericResumeAllowed(
  input: Record<string, unknown>,
  signalKind: unknown,
) {
  if (signalKind !== 'resume' || !isStageRunQualityAttempt(input)) return;
  throw new FrameworkContractError(
    'contract_shape_invalid',
    'A StageRun quality Attempt cannot resume in place; the StageRun controller must create a new Attempt.',
    {
      failure_code: 'stage_run_quality_attempt_generic_resume_forbidden',
      stage_attempt_id: input.stage_attempt_id ?? null,
      stage_run_id: input.stage_run_id ?? null,
      attempt_role: input.attempt_role ?? null,
    },
  );
}

type ParentAttemptLineage = {
  stage_run_id: string;
  quality_cycle_id: string;
};

function refs(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
    : [];
}

function requiredText(value: unknown, field: string, role: StageQualityAttemptRole) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `Quality-cycle StageAttempt requires ${field}.`,
      { attempt_role: role, field },
    );
  }
}

function forbiddenStageFieldPaths(value: unknown) {
  const paths: string[] = [];
  const visited = new WeakSet<object>();

  const visit = (current: unknown, path: string) => {
    if (current === null || typeof current !== 'object' || visited.has(current)) return;
    visited.add(current);
    for (const [key, nested] of Object.entries(current)) {
      const nestedPath = path ? `${path}.${key}` : key;
      if ((FORBIDDEN_STAGE_FIELDS as readonly string[]).includes(key)) {
        paths.push(nestedPath);
      }
      visit(nested, nestedPath);
    }
  };

  visit(value, '');
  return paths;
}

function requireParentAttemptLineage(
  input: Record<string, unknown>,
  role: StageQualityAttemptRole,
  stageRunId: string,
  qualityCycleId: string,
) {
  if (role === 'producer') {
    if (input.parent_attempt_ref !== undefined && input.parent_attempt_ref !== null) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Producer StageAttempt cannot declare a parent attempt.',
        { attempt_role: role, field: 'parent_attempt_ref' },
      );
    }
    if (input.parent_attempt_lineage !== undefined && input.parent_attempt_lineage !== null) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Producer StageAttempt cannot declare parent attempt lineage.',
        { attempt_role: role, field: 'parent_attempt_lineage' },
      );
    }
    return;
  }

  requiredText(input.parent_attempt_ref, 'parent_attempt_ref', role);
  const lineage = input.parent_attempt_lineage;
  if (lineage === null || typeof lineage !== 'object' || Array.isArray(lineage)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Non-producer StageAttempt requires parent_attempt_lineage.',
      { attempt_role: role, field: 'parent_attempt_lineage' },
    );
  }
  const parentLineage = lineage as Partial<ParentAttemptLineage>;
  requiredText(parentLineage.stage_run_id, 'parent_attempt_lineage.stage_run_id', role);
  requiredText(parentLineage.quality_cycle_id, 'parent_attempt_lineage.quality_cycle_id', role);
  if (
    parentLineage.stage_run_id !== stageRunId
    || parentLineage.quality_cycle_id !== qualityCycleId
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Parent StageAttempt must belong to the same stage_run_id and quality_cycle_id lineage.',
      {
        attempt_role: role,
        stage_run_id: stageRunId,
        quality_cycle_id: qualityCycleId,
        parent_stage_run_id: parentLineage.stage_run_id,
        parent_quality_cycle_id: parentLineage.quality_cycle_id,
      },
    );
  }
}

function requireRoleRound(role: StageQualityAttemptRole, value: unknown) {
  const round = Number(value);
  const valid = Number.isInteger(value) && (
    (role === 'producer' && round === 0)
    || (role === 'reviewer' && round === 0)
    || ((role === 'repairer' || role === 're_reviewer') && round >= 1 && round <= 3)
  );
  if (!valid) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Quality-cycle StageAttempt role and quality_round_index are inconsistent.',
      {
        attempt_role: role,
        quality_round_index: value,
        allowed_rounds: role === 'producer' || role === 'reviewer' ? [0] : [1, 2, 3],
      },
    );
  }
}

export function requireStageQualityAttemptBoundary(input: Record<string, unknown>) {
  const forbiddenFields = forbiddenStageFieldPaths(input);
  if (forbiddenFields.length > 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageAttempt cannot own Stage semantics or transition authority.',
      { forbidden_fields: forbiddenFields },
    );
  }
  if (input.attempt_role === undefined || input.attempt_role === null) return input;

  const role = normalizeStageQualityAttemptRole(input.attempt_role);
  requiredText(input.stage_run_id, 'stage_run_id', role);
  requiredText(input.quality_cycle_id, 'quality_cycle_id', role);
  const stageRunId = String(input.stage_run_id);
  const qualityCycleId = String(input.quality_cycle_id);
  requireRoleRound(role, input.quality_round_index);
  requireParentAttemptLineage(input, role, stageRunId, qualityCycleId);
  requiredText(input.quality_role_prompt_ref, 'quality_role_prompt_ref', role);
  requiredText(input.context_manifest_ref, 'context_manifest_ref', role);
  if (input.no_context_inheritance !== true) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Quality-cycle StageAttempt requires no_context_inheritance=true.',
      { attempt_role: role },
    );
  }
  if (refs(input.quality_rubric_refs).length === 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Quality-cycle StageAttempt requires quality rubric refs.',
      { attempt_role: role },
    );
  }
  if (input.stage_run_content_binding_version === STAGE_RUN_ATTEMPT_CONTENT_BINDING_VERSION) {
    const retryBudget = input.retry_budget;
    const qualityContext = input.quality_context;
    const contextManifest = qualityContext && typeof qualityContext === 'object' && !Array.isArray(qualityContext)
      ? (qualityContext as Record<string, unknown>).context_manifest
      : null;
    if (
      !retryBudget || typeof retryBudget !== 'object' || Array.isArray(retryBudget)
      || !contextManifest || typeof contextManifest !== 'object' || Array.isArray(contextManifest)
      || !Object.hasOwn(retryBudget, 'quality_scope_budget')
      || !Object.hasOwn(contextManifest, 'quality_scope_budget')
    ) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Managed Stage quality Attempt requires a durable scope budget in retry and context bindings.',
        { failure_code: 'stage_quality_scope_budget_missing' },
      );
    }
    const retryScopeBudget = normalizeStageQualityScopeBudget(
      (retryBudget as Record<string, unknown>).quality_scope_budget,
    );
    const contextScopeBudget = normalizeStageQualityScopeBudget(
      (contextManifest as Record<string, unknown>).quality_scope_budget,
    );
    if (canonicalJsonText(retryScopeBudget) !== canonicalJsonText(contextScopeBudget)) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Managed Stage quality Attempt retry and context scope budgets must match.',
        { failure_code: 'stage_quality_scope_budget_binding_mismatch' },
      );
    }
  }
  if (role === 'reviewer' || role === 're_reviewer') {
    const artifactRefs = refs(input.input_artifact_refs);
    const artifactHashes = refs(input.reviewed_artifact_hashes);
    if (artifactRefs.length === 0 || artifactRefs.length !== artifactHashes.length) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Formal review StageAttempt requires exact artifact refs and one matching hash per ref.',
        { attempt_role: role },
      );
    }
  }
  if (role === 'repairer' && refs(input.prior_finding_refs).length === 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Repairer StageAttempt requires prior finding refs.',
    );
  }
  if (
    role === 're_reviewer'
    && (refs(input.prior_finding_refs).length === 0 || refs(input.repair_map_refs).length === 0)
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Re-reviewer StageAttempt requires prior finding and repair map refs.',
    );
  }
  return input;
}

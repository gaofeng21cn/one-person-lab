import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import {
  normalizeStageQualityAttemptRole,
  type StageQualityAttemptRole,
} from '../stagecraft/stage-quality-cycle.ts';

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

export function requireStageQualityAttemptBoundary(input: Record<string, unknown>) {
  const forbiddenFields = FORBIDDEN_STAGE_FIELDS.filter((field) => Object.hasOwn(input, field));
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
  if (!Number.isInteger(input.quality_round_index) || Number(input.quality_round_index) < 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Quality-cycle StageAttempt requires a non-negative quality_round_index.',
      { attempt_role: role },
    );
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

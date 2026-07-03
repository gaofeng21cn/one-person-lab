import type { JsonRecord } from '../../../kernel/types.ts';

type WorkspaceSourceIntakeAttempt = {
  stage_attempt_id: string;
  domain_id: string;
  stage_id: string;
  workspace_locator: JsonRecord;
  source_fingerprint: string | null;
  checkpoint_refs: string[];
};

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function refStrings(value: unknown): string[] {
  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }
  if (Array.isArray(value)) {
    return value.flatMap(refStrings);
  }
  if (isRecord(value)) {
    return [
      optionalString(value.ref),
      optionalString(value.ref_id),
      optionalString(value.path),
      optionalString(value.uri),
    ].filter((entry): entry is string => Boolean(entry));
  }
  return [];
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function locatorString(locator: JsonRecord, ...fields: string[]) {
  for (const field of fields) {
    const value = optionalString(locator[field]);
    if (value) {
      return value;
    }
  }
  return null;
}

function intakeRefs(locator: JsonRecord, pluralField: string, singularFields: string[]) {
  return uniqueStrings([
    ...refStrings(locator[pluralField]),
    ...singularFields.flatMap((field) => refStrings(locator[field])),
  ]);
}

export function buildAttemptWorkspaceSourceIntake(attempt: WorkspaceSourceIntakeAttempt) {
  const locator = attempt.workspace_locator;
  const sourceRefs = intakeRefs(locator, 'source_refs', ['source_ref', 'input_ref']);
  const materialRefs = intakeRefs(locator, 'material_refs', ['material_ref', 'call_ref']);
  const missingMaterialAttentionRefs = intakeRefs(locator, 'missing_material_refs', [
    'missing_material_ref',
    'missing_source_ref',
  ]);
  const workspaceRoot = locatorString(locator, 'workspace_root', 'workspaceRoot', 'workspace');
  const runtimeRoot = locatorString(locator, 'runtime_root', 'runtimeRoot');
  const profileRef = locatorString(locator, 'profile_ref', 'profile_path', 'profile');
  const hasIntakeEvidence = Boolean(workspaceRoot)
    || Boolean(attempt.source_fingerprint)
    || sourceRefs.length > 0
    || materialRefs.length > 0
    || missingMaterialAttentionRefs.length > 0;
  return {
    surface_kind: 'opl_workspace_source_intake_projection',
    projection_scope: 'stage_attempt',
    shell_role: 'generic_workspace_source_intake_shell',
    availability: hasIntakeEvidence ? 'workspace_or_source_refs_observed' : 'no_workspace_source_refs',
    stage_attempt_id: attempt.stage_attempt_id,
    domain_id: attempt.domain_id,
    stage_id: attempt.stage_id,
    workspace_root: workspaceRoot,
    runtime_root: runtimeRoot,
    profile_ref: profileRef,
    source_fingerprint: attempt.source_fingerprint,
    source_refs: sourceRefs,
    material_refs: materialRefs,
    missing_material_attention_refs: missingMaterialAttentionRefs,
    checkpoint_refs: attempt.checkpoint_refs,
    summary: {
      workspace_root_observed: Boolean(workspaceRoot),
      source_fingerprint_observed: Boolean(attempt.source_fingerprint),
      source_ref_count: sourceRefs.length,
      material_ref_count: materialRefs.length,
      missing_material_attention_count: missingMaterialAttentionRefs.length,
      projection_policy: 'locator_and_handoff_only_no_source_readiness_authority',
    },
    authority_boundary: {
      opl: 'workspace_source_locator_and_handoff_projection_only',
      domain: 'source_truth_profile_selection_and_readiness_owner',
      can_authorize_source_readiness: false,
      can_select_domain_profile: false,
      can_write_domain_truth: false,
    },
  };
}

export function buildWorkbenchWorkspaceSourceIntake(attempts: WorkspaceSourceIntakeAttempt[]) {
  const perAttempt = attempts.map(buildAttemptWorkspaceSourceIntake);
  return {
    surface_kind: 'opl_workspace_source_intake_projection',
    projection_scope: 'stage_attempt_workbench',
    shell_role: 'generic_workspace_source_intake_shell',
    availability: perAttempt.some((projection) => projection.availability === 'workspace_or_source_refs_observed')
      ? 'workspace_or_source_refs_observed'
      : 'no_workspace_source_refs',
    attempts: perAttempt,
    source_refs: uniqueStrings(perAttempt.flatMap((projection) => projection.source_refs)),
    material_refs: uniqueStrings(perAttempt.flatMap((projection) => projection.material_refs)),
    missing_material_attention_refs: uniqueStrings(perAttempt.flatMap((projection) =>
      projection.missing_material_attention_refs
    )),
    summary: {
      attempt_count: attempts.length,
      attempt_with_workspace_root_count: perAttempt.filter((projection) =>
        projection.summary.workspace_root_observed
      ).length,
      source_fingerprint_count: perAttempt.filter((projection) =>
        projection.summary.source_fingerprint_observed
      ).length,
      source_ref_count: perAttempt.reduce((total, projection) => total + projection.summary.source_ref_count, 0),
      material_ref_count: perAttempt.reduce((total, projection) => total + projection.summary.material_ref_count, 0),
      missing_material_attention_count: perAttempt.reduce((total, projection) =>
        total + projection.summary.missing_material_attention_count, 0),
      projection_policy: 'locator_and_handoff_only_no_source_readiness_authority',
    },
    authority_boundary: {
      opl: 'workspace_source_locator_and_handoff_projection_only',
      domain: 'source_truth_profile_selection_and_readiness_owner',
      can_authorize_source_readiness: false,
      can_select_domain_profile: false,
      can_write_domain_truth: false,
    },
  };
}

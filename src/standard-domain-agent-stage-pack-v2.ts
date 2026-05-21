import {
  DEFAULT_STAGE_EXECUTOR_BINDING_REF,
  PACK_COMPILER_CONTRACT,
  STANDARD_STAGE_PACK_CONFORMANCE_VERSION,
} from './standard-domain-agent-scaffold-constants.ts';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => optionalString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function recordArray(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

export function requiresStagePackV2(packCompilerInput: unknown, stageControlPlane: unknown) {
  if (
    isRecord(stageControlPlane)
    && optionalString(stageControlPlane.stage_pack_conformance_version)
      === STANDARD_STAGE_PACK_CONFORMANCE_VERSION
  ) {
    return true;
  }
  const declaration = isRecord(packCompilerInput) && isRecord(packCompilerInput.standard_stage_pack_conformance)
    ? packCompilerInput.standard_stage_pack_conformance
    : null;
  return Boolean(
    declaration?.required === true
    && optionalString(declaration.version) === STANDARD_STAGE_PACK_CONFORMANCE_VERSION,
  );
}

function validatePackCompilerSourceRefs(packCompilerInput: unknown, enforce: boolean) {
  const sourceRefs = isRecord(packCompilerInput) && isRecord(packCompilerInput.source_refs)
    ? packCompilerInput.source_refs
    : {};
  const requiredRefs = stringArray(PACK_COMPILER_CONTRACT.required_source_refs);
  const resolvedRefs = requiredRefs.filter((field) => optionalString(sourceRefs[field]));
  const missingRefs = requiredRefs.filter((field) => !optionalString(sourceRefs[field]));
  const rawFindings = missingRefs.map((field) => `pack_compiler_source_ref_missing:${field}`);
  return {
    required_refs: requiredRefs,
    resolved_refs: resolvedRefs,
    missing_refs: missingRefs,
    status: rawFindings.length === 0 ? 'passed' : enforce ? 'blocked' : 'advisory_missing',
    blockers: enforce ? rawFindings : [],
    advisory_findings: enforce ? [] : rawFindings,
  };
}

function validateSelectedExecutor(stageId: string, selectedExecutor: unknown) {
  if (!isRecord(selectedExecutor)) {
    return [`stage_pack_v2_missing_selected_executor:${stageId}`];
  }
  const executorKind = optionalString(selectedExecutor.executor_kind);
  const executorBindingRef = optionalString(selectedExecutor.executor_binding_ref);
  if (!executorKind) {
    return [`stage_pack_v2_missing_executor_kind:${stageId}`];
  }
  if (executorKind === 'codex_cli') {
    return selectedExecutor.default_executor === true && executorBindingRef === DEFAULT_STAGE_EXECUTOR_BINDING_REF
      ? []
      : [`stage_pack_v2_invalid_default_executor_binding:${stageId}`];
  }
  return executorBindingRef
    ? []
    : [`stage_pack_v2_non_default_executor_binding_ref_missing:${stageId}`];
}

export function validateStagePackV2(stageControlPlane: unknown, packCompilerInput: unknown, enforce: boolean) {
  const plane = isRecord(stageControlPlane) ? stageControlPlane : {};
  const stages = recordArray(plane.stages);
  const packCompilerSourceRefs = validatePackCompilerSourceRefs(packCompilerInput, enforce);
  const planeFindings = [
    optionalString(plane.stage_pack_conformance_version) === STANDARD_STAGE_PACK_CONFORMANCE_VERSION
      ? null
      : 'stage_pack_v2_plane_version_missing',
  ].filter((entry): entry is string => Boolean(entry));
  const stageStatuses = stages.map((stage) => {
    const stageId = optionalString(stage.stage_id) ?? 'unknown_stage';
    const stageContract = isRecord(stage.stage_contract) ? stage.stage_contract : null;
    const independentGatePolicy = isRecord(stage.independent_gate_policy) ? stage.independent_gate_policy : null;
    const findings = [
      optionalString(stage.stage_pack_conformance_version) === STANDARD_STAGE_PACK_CONFORMANCE_VERSION
        ? null
        : `stage_pack_v2_stage_version_missing:${stageId}`,
      ...validateSelectedExecutor(stageId, stage.selected_executor),
      stageContract ? null : `stage_pack_v2_missing_stage_contract:${stageId}`,
      stageContract && stringArray(stageContract.requires).length > 0
        ? null
        : `stage_pack_v2_missing_stage_contract_requires:${stageId}`,
      stageContract && stringArray(stageContract.ensures).length > 0
        ? null
        : `stage_pack_v2_missing_stage_contract_ensures:${stageId}`,
      stageContract && recordArray(stageContract.expected_receipt_refs).length > 0
        ? null
        : `stage_pack_v2_missing_expected_receipt_refs:${stageId}`,
      independentGatePolicy ? null : `stage_pack_v2_missing_independent_gate_policy:${stageId}`,
      independentGatePolicy?.execution_review_separation_required === true
        ? null
        : `stage_pack_v2_independent_gate_separation_required:${stageId}`,
      optionalString(independentGatePolicy?.gate_ref)?.startsWith('agent/quality_gates/')
        ? null
        : `stage_pack_v2_independent_gate_ref_missing:${stageId}`,
    ].filter((entry): entry is string => Boolean(entry));
    return {
      stage_id: stageId,
      selected_executor_kind: isRecord(stage.selected_executor)
        ? optionalString(stage.selected_executor.executor_kind)
        : null,
      executor_binding_ref: isRecord(stage.selected_executor)
        ? optionalString(stage.selected_executor.executor_binding_ref)
        : null,
      requires_count: stageContract ? stringArray(stageContract.requires).length : 0,
      ensures_count: stageContract ? stringArray(stageContract.ensures).length : 0,
      expected_receipt_ref_count: stageContract
        ? recordArray(stageContract.expected_receipt_refs).length
        : 0,
      independent_gate_ref: independentGatePolicy
        ? optionalString(independentGatePolicy.gate_ref)
        : null,
      status: findings.length === 0 ? 'passed' : enforce ? 'blocked' : 'advisory_missing',
      blockers: enforce ? findings : [],
      advisory_findings: enforce ? [] : findings,
    };
  });
  const rawFindings = [
    ...planeFindings,
    ...packCompilerSourceRefs.blockers,
    ...packCompilerSourceRefs.advisory_findings,
    ...stageStatuses.flatMap((stage) => [...stage.blockers, ...stage.advisory_findings]),
  ];
  return {
    conformance_version: STANDARD_STAGE_PACK_CONFORMANCE_VERSION,
    enforcement: enforce ? 'required_for_explicit_v2_pack' : 'advisory_for_existing_domain_repo',
    required_for_repo: enforce,
    plane_version: optionalString(plane.stage_pack_conformance_version),
    pack_compiler_source_refs: packCompilerSourceRefs,
    stage_statuses: stageStatuses,
    status: rawFindings.length === 0 ? 'passed' : enforce ? 'blocked' : 'advisory_missing',
    blockers: enforce ? rawFindings : [],
    advisory_findings: enforce ? [] : rawFindings,
  };
}

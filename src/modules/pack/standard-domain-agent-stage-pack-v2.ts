import fs from 'node:fs';
import path from 'node:path';

import { isRecord } from '../../kernel/contract-validation.ts';
import { optionalString } from '../../kernel/json-file.ts';
import {
  DEFAULT_STAGE_EXECUTOR_BINDING_REF,
  PACK_COMPILER_CONTRACT,
  STANDARD_AGENT_PACK_ABI,
  STANDARD_STAGE_PACK_CONFORMANCE_VERSION,
} from './standard-domain-agent-scaffold-constants.ts';

type JsonRecord = Record<string, unknown>;
const TOOL_AFFORDANCE_CATALOG_ROLE = 'available_affordance_catalog_not_workflow_script';
const REQUIRED_TOOL_AFFORDANCE_REF_FIELDS = [
  'capability_refs',
  'permission_scope_refs',
  'credential_boundary_refs',
  'write_scope_refs',
  'side_effect_risk_refs',
  'forbidden_authority_refs',
] as const;
const REQUIRED_TOOL_AFFORDANCE_TRUE_FLAGS = [
  'executor_can_choose_tools',
  'executor_can_skip_tools',
  'executor_can_substitute_tools_within_boundary',
  'executor_can_choose_order_and_parallelism',
  'executor_can_request_missing_context_or_human_gate',
] as const;
const REQUIRED_TOOL_AFFORDANCE_FALSE_FLAGS = [
  'tool_catalog_can_prescribe_tool_sequence',
  'tool_catalog_can_define_cognitive_strategy',
  'tool_catalog_can_override_stage_goal',
  'tool_catalog_can_authorize_forbidden_write',
] as const;

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

function recordPathArray(value: unknown) {
  return recordArray(value)
    .map((entry) => optionalString(entry.path))
    .filter((entry): entry is string => Boolean(entry));
}

function refCount(value: unknown) {
  return recordArray(value).length;
}

function validateToolAffordanceBoundary(stageId: string, stage: JsonRecord) {
  const toolRefCount = refCount(stage.tool_refs);
  const boundary = isRecord(stage.tool_affordance_boundary) ? stage.tool_affordance_boundary : null;
  if (!boundary) {
    return {
      tool_ref_count: toolRefCount,
      tool_affordance_boundary_status: 'missing',
      tool_affordance_catalog_role: null,
      missing_boundary_fields: [...REQUIRED_TOOL_AFFORDANCE_REF_FIELDS],
      missing_autonomy_true_flags: [...REQUIRED_TOOL_AFFORDANCE_TRUE_FLAGS],
      missing_autonomy_false_flags: [...REQUIRED_TOOL_AFFORDANCE_FALSE_FLAGS],
      blockers: [
        toolRefCount > 0 ? null : `stage_pack_v2_missing_tool_refs:${stageId}`,
        `stage_pack_v2_missing_tool_affordance_boundary:${stageId}`,
      ].filter((entry): entry is string => Boolean(entry)),
    };
  }

  const executorAutonomy = isRecord(boundary.executor_autonomy) ? boundary.executor_autonomy : null;
  const missingBoundaryFields = REQUIRED_TOOL_AFFORDANCE_REF_FIELDS.filter((field) => refCount(boundary[field]) === 0);
  const missingAutonomyTrueFlags = executorAutonomy
    ? REQUIRED_TOOL_AFFORDANCE_TRUE_FLAGS.filter((flag) => executorAutonomy[flag] !== true)
    : [...REQUIRED_TOOL_AFFORDANCE_TRUE_FLAGS];
  const missingAutonomyFalseFlags = executorAutonomy
    ? REQUIRED_TOOL_AFFORDANCE_FALSE_FLAGS.filter((flag) => executorAutonomy[flag] !== false)
    : [...REQUIRED_TOOL_AFFORDANCE_FALSE_FLAGS];
  const blockers = [
    toolRefCount > 0 ? null : `stage_pack_v2_missing_tool_refs:${stageId}`,
    optionalString(boundary.catalog_role) === TOOL_AFFORDANCE_CATALOG_ROLE
      ? null
      : `stage_pack_v2_invalid_tool_affordance_catalog_role:${stageId}`,
    ...missingBoundaryFields.map((field) => `stage_pack_v2_tool_affordance_boundary_field_missing:${stageId}:${field}`),
    ...missingAutonomyTrueFlags.map((flag) => `stage_pack_v2_tool_affordance_autonomy_true_missing:${stageId}:${flag}`),
    ...missingAutonomyFalseFlags.map((flag) => `stage_pack_v2_tool_affordance_autonomy_false_missing:${stageId}:${flag}`),
  ].filter((entry): entry is string => Boolean(entry));
  return {
    tool_ref_count: toolRefCount,
    tool_affordance_boundary_status: blockers.length === 0 ? 'declared' : 'invalid',
    tool_affordance_catalog_role: optionalString(boundary.catalog_role),
    missing_boundary_fields: missingBoundaryFields,
    missing_autonomy_true_flags: missingAutonomyTrueFlags,
    missing_autonomy_false_flags: missingAutonomyFalseFlags,
    blockers,
  };
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

function existingRepoLayoutPaths(repoDir: string | null, requiredLayoutPaths: string[]) {
  if (!repoDir) {
    return [];
  }
  return requiredLayoutPaths.filter((entry) => {
    if (path.isAbsolute(entry) || entry.split(/[\\/]+/).includes('..')) {
      return false;
    }
    const absolutePath = path.join(repoDir, entry);
    return fs.existsSync(absolutePath) && fs.statSync(absolutePath).isDirectory();
  });
}

function validateStandardAgentPackAbi(packCompilerInput: unknown, enforce: boolean, repoDir: string | null) {
  const declaration = isRecord(packCompilerInput) && isRecord(packCompilerInput.standard_agent_pack_abi)
    ? packCompilerInput.standard_agent_pack_abi
    : null;
  const requiredLayoutPaths = recordPathArray(STANDARD_AGENT_PACK_ABI.required_repo_layout);
  const declaredLayoutPaths = recordPathArray(declaration?.required_repo_layout);
  const missingLayoutPaths = requiredLayoutPaths.filter((required) => !declaredLayoutPaths.includes(required));
  const existingLayoutPaths = existingRepoLayoutPaths(repoDir, requiredLayoutPaths);
  const missingPhysicalLayoutPaths = repoDir
    ? requiredLayoutPaths.filter((required) => !existingLayoutPaths.includes(required))
    : [];
  const rawFindings = [
    declaration ? null : 'stage_pack_v2_standard_agent_pack_abi_missing',
    optionalString(declaration?.version) === STANDARD_AGENT_PACK_ABI.version
      ? null
      : 'stage_pack_v2_standard_agent_pack_abi_version_invalid',
    ...missingLayoutPaths.map((entry) => `stage_pack_v2_standard_agent_pack_abi_missing_repo_layout:${entry}`),
    ...missingPhysicalLayoutPaths.map((entry) =>
      `stage_pack_v2_standard_agent_pack_abi_missing_physical_repo_layout:${entry}`
    ),
  ].filter((entry): entry is string => Boolean(entry));
  return {
    surface_kind: STANDARD_AGENT_PACK_ABI.surface_kind,
    version: STANDARD_AGENT_PACK_ABI.version,
    owner: STANDARD_AGENT_PACK_ABI.owner,
    status: rawFindings.length === 0 ? 'passed' : enforce ? 'blocked' : 'advisory_missing',
    required_repo_layout_paths: requiredLayoutPaths,
    declared_repo_layout_paths: declaredLayoutPaths,
    existing_repo_layout_paths: existingLayoutPaths,
    missing_repo_layout_paths: missingLayoutPaths,
    missing_physical_repo_layout_paths: missingPhysicalLayoutPaths,
    required_stage_pack_shape: STANDARD_AGENT_PACK_ABI.required_stage_pack_shape,
    l4_entry_gate: STANDARD_AGENT_PACK_ABI.l4_entry_gate,
    l5_entry_gate: STANDARD_AGENT_PACK_ABI.l5_entry_gate,
    authority_boundary: STANDARD_AGENT_PACK_ABI.authority_boundary,
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
    return typeof selectedExecutor.default_executor === 'boolean'
      && executorBindingRef === DEFAULT_STAGE_EXECUTOR_BINDING_REF
      ? []
      : [`stage_pack_v2_invalid_default_executor_binding:${stageId}`];
  }
  return executorBindingRef
    ? []
    : [`stage_pack_v2_non_default_executor_binding_ref_missing:${stageId}`];
}

export function validateStagePackV2(
  stageControlPlane: unknown,
  packCompilerInput: unknown,
  enforce: boolean,
  options: { repoDir?: string | null } = {},
) {
  const plane = isRecord(stageControlPlane) ? stageControlPlane : {};
  const stages = recordArray(plane.stages);
  const packCompilerSourceRefs = validatePackCompilerSourceRefs(packCompilerInput, enforce);
  const standardAgentPackAbi = validateStandardAgentPackAbi(packCompilerInput, enforce, options.repoDir ?? null);
  const planeFindings = [
    optionalString(plane.stage_pack_conformance_version) === STANDARD_STAGE_PACK_CONFORMANCE_VERSION
      ? null
      : 'stage_pack_v2_plane_version_missing',
  ].filter((entry): entry is string => Boolean(entry));
  const stageStatuses = stages.map((stage) => {
    const stageId = optionalString(stage.stage_id) ?? 'unknown_stage';
    const stageContract = isRecord(stage.stage_contract) ? stage.stage_contract : null;
    const independentGatePolicy = isRecord(stage.independent_gate_policy) ? stage.independent_gate_policy : null;
    const l4EntryGate = isRecord(stageContract?.l4_entry_gate) ? stageContract.l4_entry_gate : null;
    const l5EntryGate = isRecord(stageContract?.l5_entry_gate) ? stageContract.l5_entry_gate : null;
    const toolAffordanceBoundary = validateToolAffordanceBoundary(stageId, stage);
    const findings = [
      optionalString(stage.stage_pack_conformance_version) === STANDARD_STAGE_PACK_CONFORMANCE_VERSION
        ? null
        : `stage_pack_v2_stage_version_missing:${stageId}`,
      ...validateSelectedExecutor(stageId, stage.selected_executor),
      ...toolAffordanceBoundary.blockers,
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
      stageContract && recordArray(stageContract.receipt_schema_refs).length > 0
        ? null
        : `stage_pack_v2_missing_receipt_schema_refs:${stageId}`,
      stageContract && recordArray(stageContract.authority_function_refs).length > 0
        ? null
        : `stage_pack_v2_missing_authority_function_refs:${stageId}`,
      l4EntryGate ? null : `stage_pack_v2_missing_l4_entry_gate:${stageId}`,
      !l4EntryGate || optionalString(l4EntryGate.entry_level) === STANDARD_AGENT_PACK_ABI.l4_entry_gate.entry_level
        ? null
        : `stage_pack_v2_l4_entry_gate_level_invalid:${stageId}`,
      !l4EntryGate || l4EntryGate.can_claim_l5 === false
        ? null
        : `stage_pack_v2_l4_entry_gate_must_not_claim_l5:${stageId}`,
      !l4EntryGate || l4EntryGate.can_claim_domain_ready === false
        ? null
        : `stage_pack_v2_l4_entry_gate_must_not_claim_domain_ready:${stageId}`,
      l5EntryGate ? null : `stage_pack_v2_missing_l5_entry_gate:${stageId}`,
      !l5EntryGate || optionalString(l5EntryGate.entry_level) === STANDARD_AGENT_PACK_ABI.l5_entry_gate.entry_level
        ? null
        : `stage_pack_v2_l5_entry_gate_level_invalid:${stageId}`,
      !l5EntryGate || l5EntryGate.conformance_pass_counts_as_l5 === false
        ? null
        : `stage_pack_v2_l5_entry_gate_conformance_must_not_count_as_l5:${stageId}`,
      !l5EntryGate || l5EntryGate.contract_validation_counts_as_l5 === false
        ? null
        : `stage_pack_v2_l5_entry_gate_contract_validation_must_not_count_as_l5:${stageId}`,
      !l5EntryGate || l5EntryGate.provider_completion_counts_as_l5 === false
        ? null
        : `stage_pack_v2_l5_entry_gate_provider_completion_must_not_count_as_l5:${stageId}`,
      !l5EntryGate || l5EntryGate.app_projection_counts_as_l5 === false
        ? null
        : `stage_pack_v2_l5_entry_gate_app_projection_must_not_count_as_l5:${stageId}`,
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
      tool_ref_count: toolAffordanceBoundary.tool_ref_count,
      tool_affordance_boundary_status: toolAffordanceBoundary.tool_affordance_boundary_status,
      tool_affordance_catalog_role: toolAffordanceBoundary.tool_affordance_catalog_role,
      tool_affordance_missing_boundary_fields: toolAffordanceBoundary.missing_boundary_fields,
      tool_affordance_missing_autonomy_true_flags: toolAffordanceBoundary.missing_autonomy_true_flags,
      tool_affordance_missing_autonomy_false_flags: toolAffordanceBoundary.missing_autonomy_false_flags,
      requires_count: stageContract ? stringArray(stageContract.requires).length : 0,
      ensures_count: stageContract ? stringArray(stageContract.ensures).length : 0,
      expected_receipt_ref_count: stageContract
        ? recordArray(stageContract.expected_receipt_refs).length
        : 0,
      receipt_schema_ref_count: stageContract
        ? recordArray(stageContract.receipt_schema_refs).length
        : 0,
      authority_function_ref_count: stageContract
        ? recordArray(stageContract.authority_function_refs).length
        : 0,
      l4_entry_gate_status: l4EntryGate ? 'declared' : 'missing',
      l5_entry_gate_status: l5EntryGate ? 'declared' : 'missing',
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
    ...standardAgentPackAbi.blockers,
    ...standardAgentPackAbi.advisory_findings,
    ...stageStatuses.flatMap((stage) => [...stage.blockers, ...stage.advisory_findings]),
  ];
  return {
    conformance_version: STANDARD_STAGE_PACK_CONFORMANCE_VERSION,
    enforcement: enforce ? 'required_for_explicit_v2_pack' : 'advisory_for_existing_domain_repo',
    required_for_repo: enforce,
    plane_version: optionalString(plane.stage_pack_conformance_version),
    pack_compiler_source_refs: packCompilerSourceRefs,
    standard_agent_pack_abi: standardAgentPackAbi,
    stage_statuses: stageStatuses,
    status: rawFindings.length === 0 ? 'passed' : enforce ? 'blocked' : 'advisory_missing',
    blockers: enforce ? rawFindings : [],
    advisory_findings: enforce ? [] : rawFindings,
  };
}

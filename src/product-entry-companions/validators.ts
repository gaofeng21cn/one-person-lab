import type {
  FamilyOrchestrationCompanion,
  FamilyOrchestrationGatePreview,
  FamilyOrchestrationReferenceRef,
  FamilyProductEntryManifestSurface,
  FamilyProductFrontdeskSurface,
  FamilyProductEntryValidationOptions,
  JsonRecord,
  ProductEntryOverviewSurface,
  ProductEntryPreflightSurface,
  ProductEntryQuickstartSurface,
  ProductEntryReadinessSurface,
  ProductEntryStartSurface,
} from './types.ts';
import {
  cloneRecord,
  isRecord,
  normalizeFrontdeskSummary,
  normalizeProgressSurface,
  normalizeResumeContract,
  normalizeStartMode,
  normalizeStartResumeSurface,
  normalizeStep,
  optionalString,
  optionalStringList,
  readOptionalStringProperty,
  readStringList,
  requireBoolean,
  requireInteger,
  requireRecord,
  requireString,
  validateDomainEntryContractShape,
  validateFamilyReferenceRef,
  validateGatewayInteractionContractShape,
  validateOptionalFamilyReferenceRef,
} from './internal.ts';
import { validateSharedHandoff } from '../family-entry-contracts.ts';
import { buildProductEntryResumeSurface } from './builders.ts';
import { validateFamilyFrontdeskEntrySurfaces } from './shell-surfaces.ts';

function validateSurfaceKindRecord(
  value: unknown,
  field: string,
  expectedSurfaceKind: string,
) {
  const payload = requireRecord(value, field);
  const surfaceKind = requireString(payload.surface_kind, `${field}.surface_kind`);
  if (surfaceKind !== expectedSurfaceKind) {
    throw new Error(
      `product entry companion ${field}.surface_kind 必须是 ${expectedSurfaceKind}，当前为 ${surfaceKind}`,
    );
  }
  return {
    ...payload,
    surface_kind: surfaceKind,
  };
}

function hasRuntimeControlReference(payload: JsonRecord) {
  if (isRecord(payload.runtime_control) && optionalString(payload.runtime_control.surface_kind) === 'runtime_control') {
    return true;
  }
  if (
    isRecord(payload.runtime_loop_closure)
    && optionalString(payload.runtime_loop_closure.surface_kind) === 'runtime_loop_closure'
  ) {
    return true;
  }

  const progressProjection = isRecord(payload.progress_projection) ? payload.progress_projection : null;
  const progressDomainProjection = isRecord(progressProjection?.domain_projection)
    ? progressProjection.domain_projection
    : null;
  const researchRuntimeControl = isRecord(progressDomainProjection?.research_runtime_control_projection)
    ? progressDomainProjection.research_runtime_control_projection
    : null;
  if (
    researchRuntimeControl
    && (
      optionalString(researchRuntimeControl.surface_kind) === 'research_runtime_control_projection'
      || optionalString(researchRuntimeControl.surface_kind) === 'research_runtime_control_projection_contract'
    )
  ) {
    return true;
  }

  const returnSurfaceContract = isRecord(payload.return_surface_contract) ? payload.return_surface_contract : null;
  const projectedRuntimeControl = isRecord(returnSurfaceContract?.research_runtime_control_projection_contract)
    ? returnSurfaceContract.research_runtime_control_projection_contract
    : null;
  return Boolean(
    projectedRuntimeControl
    && (
      optionalString(projectedRuntimeControl.surface_kind) === 'research_runtime_control_projection'
      || optionalString(projectedRuntimeControl.surface_kind) === 'research_runtime_control_projection_contract'
    ),
  );
}

export function validateFamilyOrchestrationCompanion(
  value: unknown,
  field: string,
): FamilyOrchestrationCompanion {
  const payload = requireRecord(value, field);
  const normalized: FamilyOrchestrationCompanion = {
    ...payload,
    human_gates: Array.isArray(payload.human_gates)
      ? payload.human_gates.map((gate, index) => {
        const normalizedGate = requireRecord(gate, `${field}.human_gates[${index}]`);
        const preview: FamilyOrchestrationGatePreview = {
          ...normalizedGate,
          gate_id: requireString(normalizedGate.gate_id, `${field}.human_gates[${index}].gate_id`),
        };
        const title = readOptionalStringProperty(
          normalizedGate,
          'title',
          `${field}.human_gates[${index}].title`,
        );
        if (title !== undefined) {
          preview.title = title;
        }
        const status = readOptionalStringProperty(
          normalizedGate,
          'status',
          `${field}.human_gates[${index}].status`,
        );
        if (status !== undefined) {
          preview.status = status;
        }
        const reviewSurface = validateOptionalFamilyReferenceRef(
          normalizedGate.review_surface,
          `${field}.human_gates[${index}].review_surface`,
        );
        if (reviewSurface !== undefined) {
          preview.review_surface = reviewSurface;
        }
        return preview;
      })
      : [],
    resume_contract: normalizeResumeContract(payload.resume_contract, `${field}.resume_contract`),
  };
  const actionGraphRef = validateOptionalFamilyReferenceRef(
    payload.action_graph_ref,
    `${field}.action_graph_ref`,
  );
  if (actionGraphRef !== undefined) {
    normalized.action_graph_ref = actionGraphRef;
  }
  if (payload.action_graph !== undefined) {
    normalized.action_graph = cloneRecord(payload.action_graph, `${field}.action_graph`);
  }
  const eventEnvelopeSurface = validateOptionalFamilyReferenceRef(
    payload.event_envelope_surface,
    `${field}.event_envelope_surface`,
  );
  if (eventEnvelopeSurface !== undefined) {
    normalized.event_envelope_surface = eventEnvelopeSurface;
  }
  const checkpointLineageSurface = validateOptionalFamilyReferenceRef(
    payload.checkpoint_lineage_surface,
    `${field}.checkpoint_lineage_surface`,
  );
  if (checkpointLineageSurface !== undefined) {
    normalized.checkpoint_lineage_surface = checkpointLineageSurface;
  }
  return normalized;
}

export function validateProductEntryQuickstartSurface(
  value: unknown,
  field: string,
): ProductEntryQuickstartSurface {
  const payload = requireRecord(value, field);
  const steps = Array.isArray(payload.steps)
    ? payload.steps.map((step, index) => normalizeStep(step, `${field}.steps[${index}]`))
    : [];
  const recommendedStepId = requireString(payload.recommended_step_id, `${field}.recommended_step_id`);
  if (!steps.some((step) => step.step_id === recommendedStepId)) {
    throw new Error(`product entry companion ${field}.recommended_step_id 必须引用现有 step_id`);
  }
  return {
    ...payload,
    surface_kind: 'product_entry_quickstart',
    recommended_step_id: recommendedStepId,
    summary: requireString(payload.summary, `${field}.summary`),
    steps,
    resume_contract: normalizeResumeContract(payload.resume_contract, `${field}.resume_contract`),
    human_gate_ids: readStringList(payload.human_gate_ids, `${field}.human_gate_ids`),
  };
}

export function validateProductEntryStartSurface(
  value: unknown,
  field: string,
): ProductEntryStartSurface {
  const payload = requireRecord(value, field);
  const modes = Array.isArray(payload.modes)
    ? payload.modes.map((mode, index) => normalizeStartMode(mode, `${field}.modes[${index}]`))
    : [];
  const recommendedModeId = requireString(payload.recommended_mode_id, `${field}.recommended_mode_id`);
  if (!modes.some((mode) => mode.mode_id === recommendedModeId)) {
    throw new Error(`product entry companion ${field}.recommended_mode_id 必须引用现有 mode_id`);
  }
  return {
    ...payload,
    surface_kind: 'product_entry_start',
    summary: requireString(payload.summary, `${field}.summary`),
    recommended_mode_id: recommendedModeId,
    modes,
    resume_surface: normalizeStartResumeSurface(payload.resume_surface, `${field}.resume_surface`),
    human_gate_ids: readStringList(payload.human_gate_ids, `${field}.human_gate_ids`),
  };
}

export function validateProductEntryOverviewSurface(
  value: unknown,
  field: string,
): ProductEntryOverviewSurface {
  const payload = requireRecord(value, field);
  const resumeSurface = normalizeStartResumeSurface(payload.resume_surface, `${field}.resume_surface`);
  const command = requireString(resumeSurface.command, `${field}.resume_surface.command`);
  return {
    ...payload,
    surface_kind: 'product_entry_overview',
    summary: requireString(payload.summary, `${field}.summary`),
    frontdesk_command: requireString(payload.frontdesk_command, `${field}.frontdesk_command`),
    recommended_command: requireString(payload.recommended_command, `${field}.recommended_command`),
    operator_loop_command: requireString(payload.operator_loop_command, `${field}.operator_loop_command`),
    progress_surface: normalizeProgressSurface(payload.progress_surface, `${field}.progress_surface`),
    resume_surface: buildProductEntryResumeSurface(command, resumeSurface),
    recommended_step_id: requireString(payload.recommended_step_id, `${field}.recommended_step_id`),
    next_focus: readStringList(payload.next_focus, `${field}.next_focus`),
    remaining_gaps_count: requireInteger(payload.remaining_gaps_count, `${field}.remaining_gaps_count`),
    human_gate_ids: readStringList(payload.human_gate_ids, `${field}.human_gate_ids`),
  };
}

export function validateProductEntryReadinessSurface(
  value: unknown,
  field: string,
): ProductEntryReadinessSurface {
  const payload = requireRecord(value, field);
  return {
    ...payload,
    surface_kind: 'product_entry_readiness',
    verdict: requireString(payload.verdict, `${field}.verdict`),
    usable_now: requireBoolean(payload.usable_now, `${field}.usable_now`),
    good_to_use_now: requireBoolean(payload.good_to_use_now, `${field}.good_to_use_now`),
    fully_automatic: requireBoolean(payload.fully_automatic, `${field}.fully_automatic`),
    summary: requireString(payload.summary, `${field}.summary`),
    recommended_start_surface: requireString(
      payload.recommended_start_surface,
      `${field}.recommended_start_surface`,
    ),
    recommended_start_command: requireString(
      payload.recommended_start_command,
      `${field}.recommended_start_command`,
    ),
    recommended_loop_surface: requireString(
      payload.recommended_loop_surface,
      `${field}.recommended_loop_surface`,
    ),
    recommended_loop_command: requireString(
      payload.recommended_loop_command,
      `${field}.recommended_loop_command`,
    ),
    blocking_gaps: readStringList(payload.blocking_gaps, `${field}.blocking_gaps`),
  };
}

export function validateProductEntryPreflightSurface(
  value: unknown,
  field: string,
): ProductEntryPreflightSurface {
  const payload = requireRecord(value, field);
  return {
    ...payload,
    surface_kind: 'product_entry_preflight',
    summary: requireString(payload.summary, `${field}.summary`),
    ready_to_try_now: requireBoolean(payload.ready_to_try_now, `${field}.ready_to_try_now`),
    recommended_check_command: requireString(
      payload.recommended_check_command,
      `${field}.recommended_check_command`,
    ),
    recommended_start_command: requireString(
      payload.recommended_start_command,
      `${field}.recommended_start_command`,
    ),
    blocking_check_ids: readStringList(payload.blocking_check_ids, `${field}.blocking_check_ids`),
    checks: Array.isArray(payload.checks) ? payload.checks : [],
  };
}

export function validateFamilyProductEntryManifest(
  value: unknown,
  options: FamilyProductEntryValidationOptions = {},
): FamilyProductEntryManifestSurface {
  const payload = requireRecord(value, 'product_entry_manifest');
  const normalized: FamilyProductEntryManifestSurface = {
    ...payload,
    surface_kind: 'product_entry_manifest',
    manifest_version: requireInteger(payload.manifest_version, 'product_entry_manifest.manifest_version'),
    manifest_kind: requireString(payload.manifest_kind, 'product_entry_manifest.manifest_kind'),
    target_domain_id: requireString(payload.target_domain_id, 'product_entry_manifest.target_domain_id'),
    formal_entry: cloneRecord(payload.formal_entry, 'product_entry_manifest.formal_entry'),
    workspace_locator: cloneRecord(payload.workspace_locator, 'product_entry_manifest.workspace_locator'),
    product_entry_shell: cloneRecord(payload.product_entry_shell, 'product_entry_manifest.product_entry_shell'),
    shared_handoff: validateSharedHandoff(
      payload.shared_handoff,
      'product_entry_manifest.shared_handoff',
    ),
    product_entry_start: validateProductEntryStartSurface(
      payload.product_entry_start,
      'product_entry_manifest.product_entry_start',
    ),
    family_orchestration: validateFamilyOrchestrationCompanion(
      payload.family_orchestration,
      'product_entry_manifest.family_orchestration',
    ),
  };

  for (const field of [
    'runtime',
    'managed_runtime_contract',
    'repo_mainline',
    'product_entry_status',
    'frontdesk_surface',
    'operator_loop_surface',
    'operator_loop_actions',
  ] as const) {
    if (payload[field] !== undefined) {
      normalized[field] = cloneRecord(payload[field], `product_entry_manifest.${field}`);
    }
  }
  const recommendedShell = readOptionalStringProperty(
    payload,
    'recommended_shell',
    'product_entry_manifest.recommended_shell',
  );
  if (recommendedShell !== undefined) {
    normalized.recommended_shell = recommendedShell;
  }
  const recommendedCommand = readOptionalStringProperty(
    payload,
    'recommended_command',
    'product_entry_manifest.recommended_command',
  );
  if (recommendedCommand !== undefined) {
    normalized.recommended_command = recommendedCommand;
  }
  if (payload.runtime_inventory !== undefined) {
    normalized.runtime_inventory = cloneRecord(
      payload.runtime_inventory,
      'product_entry_manifest.runtime_inventory',
    );
  }
  if (payload.task_lifecycle !== undefined) {
    normalized.task_lifecycle = cloneRecord(
      payload.task_lifecycle,
      'product_entry_manifest.task_lifecycle',
    );
  }
  if (payload.runtime_control !== undefined) {
    normalized.runtime_control = validateSurfaceKindRecord(
      payload.runtime_control,
      'product_entry_manifest.runtime_control',
      'runtime_control',
    );
  }
  if (payload.runtime_loop_closure !== undefined) {
    normalized.runtime_loop_closure = validateSurfaceKindRecord(
      payload.runtime_loop_closure,
      'product_entry_manifest.runtime_loop_closure',
      'runtime_loop_closure',
    );
  }
  if (payload.session_continuity !== undefined) {
    normalized.session_continuity = validateSurfaceKindRecord(
      payload.session_continuity,
      'product_entry_manifest.session_continuity',
      'session_continuity',
    );
  }
  if (payload.progress_projection !== undefined) {
    normalized.progress_projection = validateSurfaceKindRecord(
      payload.progress_projection,
      'product_entry_manifest.progress_projection',
      'progress_projection',
    );
  }
  if (payload.artifact_inventory !== undefined) {
    normalized.artifact_inventory = validateSurfaceKindRecord(
      payload.artifact_inventory,
      'product_entry_manifest.artifact_inventory',
      'artifact_inventory',
    );
  }
  if (payload.skill_catalog !== undefined) {
    normalized.skill_catalog = cloneRecord(
      payload.skill_catalog,
      'product_entry_manifest.skill_catalog',
    );
  }
  if (payload.automation !== undefined) {
    normalized.automation = cloneRecord(payload.automation, 'product_entry_manifest.automation');
  }
  if (payload.product_entry_overview !== undefined) {
    normalized.product_entry_overview = validateProductEntryOverviewSurface(
      payload.product_entry_overview,
      'product_entry_manifest.product_entry_overview',
    );
  }
  if (payload.product_entry_preflight !== undefined) {
    normalized.product_entry_preflight = validateProductEntryPreflightSurface(
      payload.product_entry_preflight,
      'product_entry_manifest.product_entry_preflight',
    );
  }
  if (payload.product_entry_readiness !== undefined) {
    normalized.product_entry_readiness = validateProductEntryReadinessSurface(
      payload.product_entry_readiness,
      'product_entry_manifest.product_entry_readiness',
    );
  }
  if (payload.product_entry_quickstart !== undefined) {
    normalized.product_entry_quickstart = validateProductEntryQuickstartSurface(
      payload.product_entry_quickstart,
      'product_entry_manifest.product_entry_quickstart',
    );
  }
  const remainingGaps = optionalStringList(payload.remaining_gaps, 'product_entry_manifest.remaining_gaps');
  if (remainingGaps !== null) {
    normalized.remaining_gaps = remainingGaps;
  }
  const notes = optionalStringList(payload.notes, 'product_entry_manifest.notes');
  if (notes !== null) {
    normalized.notes = notes;
  }
  if (payload.schema_ref !== undefined || options.requireContractBundle) {
    normalized.schema_ref = requireString(payload.schema_ref, 'product_entry_manifest.schema_ref');
  }
  if (payload.domain_entry_contract !== undefined || options.requireContractBundle) {
    normalized.domain_entry_contract = validateDomainEntryContractShape(
      payload.domain_entry_contract,
      'product_entry_manifest.domain_entry_contract',
    );
  }
  if (payload.gateway_interaction_contract !== undefined || options.requireContractBundle) {
    normalized.gateway_interaction_contract = validateGatewayInteractionContractShape(
      payload.gateway_interaction_contract,
      'product_entry_manifest.gateway_interaction_contract',
    );
  }
  if (options.requireRuntimeCompanions) {
    normalized.runtime_inventory = validateSurfaceKindRecord(
      payload.runtime_inventory,
      'product_entry_manifest.runtime_inventory',
      'runtime_inventory',
    );
    normalized.task_lifecycle = validateSurfaceKindRecord(
      payload.task_lifecycle,
      'product_entry_manifest.task_lifecycle',
      'task_lifecycle',
    );
    normalized.skill_catalog = validateSurfaceKindRecord(
      payload.skill_catalog,
      'product_entry_manifest.skill_catalog',
      'skill_catalog',
    );
    normalized.automation = validateSurfaceKindRecord(
      payload.automation,
      'product_entry_manifest.automation',
      'automation',
    );
  }
  if (options.requireRuntimeContinuity) {
    normalized.session_continuity = validateSurfaceKindRecord(
      payload.session_continuity,
      'product_entry_manifest.session_continuity',
      'session_continuity',
    );
    normalized.progress_projection = validateSurfaceKindRecord(
      payload.progress_projection,
      'product_entry_manifest.progress_projection',
      'progress_projection',
    );
    normalized.artifact_inventory = validateSurfaceKindRecord(
      payload.artifact_inventory,
      'product_entry_manifest.artifact_inventory',
      'artifact_inventory',
    );
    if (!hasRuntimeControlReference(payload)) {
      throw new Error(
        'product entry companion product_entry_manifest 缺少 runtime continuity control reference；需要 runtime_control、runtime_loop_closure，或 research_runtime_control_projection companion。',
      );
    }
  }

  return normalized;
}

export function validateFamilyProductFrontdesk(
  value: unknown,
  options: FamilyProductEntryValidationOptions = {},
): FamilyProductFrontdeskSurface {
  const payload = requireRecord(value, 'product_frontdesk');
  const normalized: FamilyProductFrontdeskSurface = {
    ...payload,
    surface_kind: 'product_frontdesk',
    recommended_action: requireString(payload.recommended_action, 'product_frontdesk.recommended_action'),
    target_domain_id: requireString(payload.target_domain_id, 'product_frontdesk.target_domain_id'),
    workspace_locator: cloneRecord(payload.workspace_locator, 'product_frontdesk.workspace_locator'),
    runtime: cloneRecord(payload.runtime, 'product_frontdesk.runtime'),
    product_entry_status: cloneRecord(payload.product_entry_status, 'product_frontdesk.product_entry_status'),
    frontdesk_surface: cloneRecord(payload.frontdesk_surface, 'product_frontdesk.frontdesk_surface'),
    operator_loop_surface: cloneRecord(
      payload.operator_loop_surface,
      'product_frontdesk.operator_loop_surface',
    ),
    operator_loop_actions: cloneRecord(
      payload.operator_loop_actions,
      'product_frontdesk.operator_loop_actions',
    ),
    product_entry_start: validateProductEntryStartSurface(
      payload.product_entry_start,
      'product_frontdesk.product_entry_start',
    ),
    product_entry_overview: validateProductEntryOverviewSurface(
      payload.product_entry_overview,
      'product_frontdesk.product_entry_overview',
    ),
    product_entry_preflight: validateProductEntryPreflightSurface(
      payload.product_entry_preflight,
      'product_frontdesk.product_entry_preflight',
    ),
    product_entry_readiness: validateProductEntryReadinessSurface(
      payload.product_entry_readiness,
      'product_frontdesk.product_entry_readiness',
    ),
    product_entry_quickstart: validateProductEntryQuickstartSurface(
      payload.product_entry_quickstart,
      'product_frontdesk.product_entry_quickstart',
    ),
    family_orchestration: validateFamilyOrchestrationCompanion(
      payload.family_orchestration,
      'product_frontdesk.family_orchestration',
    ),
    product_entry_manifest: validateFamilyProductEntryManifest(payload.product_entry_manifest, options),
    entry_surfaces: validateFamilyFrontdeskEntrySurfaces(
      payload.entry_surfaces,
      'product_frontdesk.entry_surfaces',
    ),
    summary: normalizeFrontdeskSummary(payload.summary, 'product_frontdesk.summary'),
    notes: readStringList(payload.notes, 'product_frontdesk.notes'),
  };
  if (payload.schema_ref !== undefined || options.requireContractBundle) {
    normalized.schema_ref = requireString(payload.schema_ref, 'product_frontdesk.schema_ref');
  }
  if (payload.domain_entry_contract !== undefined || options.requireContractBundle) {
    normalized.domain_entry_contract = validateDomainEntryContractShape(
      payload.domain_entry_contract,
      'product_frontdesk.domain_entry_contract',
    );
  }
  if (payload.gateway_interaction_contract !== undefined || options.requireContractBundle) {
    normalized.gateway_interaction_contract = validateGatewayInteractionContractShape(
      payload.gateway_interaction_contract,
      'product_frontdesk.gateway_interaction_contract',
    );
  }
  return normalized;
}

import {
  isRecord,
  normalizeRecordList,
  normalizeRecordMap,
  optionalString,
  readStringList,
  requireString,
} from './shared-utils.ts';

type JsonRecord = Record<string, unknown>;

export function unwrapManifestPayload(payload: JsonRecord) {
  if (isRecord(payload.product_entry_manifest)) {
    return payload.product_entry_manifest;
  }
  return payload;
}

export function normalizeShellSurface(
  value: unknown,
  options: {
    field: string;
    productEntryShell: Record<string, JsonRecord>;
  },
) {
  const { field, productEntryShell } = options;

  if (!isRecord(value)) {
    return null;
  }

  const shellKey = requireString(value.shell_key, `${field}.shell_key`);
  if (!productEntryShell[shellKey]) {
    throw new Error(`${field}.shell_key points at unknown shell key: ${shellKey}`);
  }

  const explicitCommand = optionalString(value.command);
  const derivedCommand = optionalString(productEntryShell[shellKey]?.command);
  if (explicitCommand && derivedCommand && explicitCommand !== derivedCommand) {
    throw new Error(`${field}.command must match the command declared by ${field}.shell_key.`);
  }

  return {
    shell_key: shellKey,
    command: explicitCommand ?? derivedCommand,
    surface_kind:
      optionalString(value.surface_kind)
      ?? optionalString(productEntryShell[shellKey]?.surface_kind),
    summary: optionalString(value.summary),
    continuation_shell_key: optionalString(value.continuation_shell_key),
    continuation_command: optionalString(value.continuation_command),
  };
}

export function normalizeProductEntryQuickstart(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  const steps = normalizeRecordList(value.steps, 'product_entry_quickstart.steps').map((step, index) => ({
    step_id: requireString(step.step_id, `product_entry_quickstart.steps[${index}].step_id`),
    title: optionalString(step.title),
    command: optionalString(step.command),
    surface_kind: optionalString(step.surface_kind),
    summary: optionalString(step.summary),
    requires: readStringList(step.requires),
  }));
  const recommendedStepId = optionalString(value.recommended_step_id);

  if (recommendedStepId && !steps.some((step) => step.step_id === recommendedStepId)) {
    throw new Error('product_entry_quickstart.recommended_step_id must reference an existing step_id.');
  }

  return {
    surface_kind: optionalString(value.surface_kind) ?? 'product_entry_quickstart',
    summary: optionalString(value.summary),
    recommended_step_id: recommendedStepId,
    steps,
    resume_contract: isRecord(value.resume_contract) ? value.resume_contract : null,
    human_gate_ids: readStringList(value.human_gate_ids),
  };
}

export function normalizeProductEntryOverview(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  const progressSurface = isRecord(value.progress_surface)
    ? {
        surface_kind: optionalString(value.progress_surface.surface_kind),
        command: optionalString(value.progress_surface.command),
        step_id: optionalString(value.progress_surface.step_id),
      }
    : null;
  const resumeSurface = isRecord(value.resume_surface)
    ? {
        surface_kind: optionalString(value.resume_surface.surface_kind),
        command: optionalString(value.resume_surface.command),
        session_locator_field: optionalString(value.resume_surface.session_locator_field),
        checkpoint_locator_field: optionalString(value.resume_surface.checkpoint_locator_field),
      }
    : null;

  return {
    surface_kind: optionalString(value.surface_kind) ?? 'product_entry_overview',
    summary: optionalString(value.summary),
    frontdoor_command: optionalString(value.frontdoor_command),
    recommended_command: optionalString(value.recommended_command),
    operator_loop_command: optionalString(value.operator_loop_command),
    progress_surface: progressSurface,
    resume_surface: resumeSurface,
    recommended_step_id: optionalString(value.recommended_step_id),
    next_focus: readStringList(value.next_focus),
    remaining_gaps_count: typeof value.remaining_gaps_count === 'number' ? value.remaining_gaps_count : null,
    human_gate_ids: readStringList(value.human_gate_ids),
  };
}

export function normalizeProductEntryPreflight(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  const checks = normalizeRecordList(value.checks, 'product_entry_preflight.checks').map((check, index) => ({
    check_id: requireString(check.check_id, `product_entry_preflight.checks[${index}].check_id`),
    title: optionalString(check.title),
    status: optionalString(check.status),
    blocking: typeof check.blocking === 'boolean' ? check.blocking : null,
    summary: optionalString(check.summary),
    command: optionalString(check.command),
  }));

  return {
    surface_kind: optionalString(value.surface_kind) ?? 'product_entry_preflight',
    summary: optionalString(value.summary),
    ready_to_try_now: typeof value.ready_to_try_now === 'boolean' ? value.ready_to_try_now : null,
    recommended_check_command: optionalString(value.recommended_check_command),
    recommended_start_command: optionalString(value.recommended_start_command),
    blocking_check_ids: readStringList(value.blocking_check_ids),
    checks,
  };
}

export function normalizeDetailedReadinessSurface(value: unknown, fallbackSurfaceKind: string) {
  if (!isRecord(value)) {
    return null;
  }

  return {
    surface_kind: optionalString(value.surface_kind) ?? fallbackSurfaceKind,
    verdict: optionalString(value.verdict),
    usable_now: typeof value.usable_now === 'boolean' ? value.usable_now : null,
    good_to_use_now: typeof value.good_to_use_now === 'boolean' ? value.good_to_use_now : null,
    fully_automatic: typeof value.fully_automatic === 'boolean' ? value.fully_automatic : null,
    user_experience_level: optionalString(value.user_experience_level),
    summary: optionalString(value.summary),
    recommended_start_surface: optionalString(value.recommended_start_surface),
    recommended_start_command: optionalString(value.recommended_start_command),
    recommended_loop_surface: optionalString(value.recommended_loop_surface),
    recommended_loop_command: optionalString(value.recommended_loop_command),
    workflow_coverage: normalizeRecordList(value.workflow_coverage, `${fallbackSurfaceKind}.workflow_coverage`).map((entry, index) => ({
      step_id: requireString(entry.step_id, `${fallbackSurfaceKind}.workflow_coverage[${index}].step_id`),
      manual_flow_label: optionalString(entry.manual_flow_label),
      coverage_status: optionalString(entry.coverage_status),
      current_surface: optionalString(entry.current_surface),
      remaining_gap: optionalString(entry.remaining_gap),
    })),
    blocking_gaps: readStringList(value.blocking_gaps),
  };
}

export function normalizeProductEntryReadiness(value: unknown) {
  return normalizeDetailedReadinessSurface(value, 'product_entry_readiness');
}

export function normalizeProductEntryGuardrails(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  return {
    surface_kind: optionalString(value.surface_kind) ?? 'product_entry_guardrails',
    summary: optionalString(value.summary),
    guardrail_classes: normalizeRecordList(value.guardrail_classes, 'product_entry_guardrails.guardrail_classes').map((entry, index) => ({
      guardrail_id: requireString(entry.guardrail_id, `product_entry_guardrails.guardrail_classes[${index}].guardrail_id`),
      trigger: optionalString(entry.trigger),
      symptom: optionalString(entry.symptom),
      recommended_command: optionalString(entry.recommended_command),
    })),
    recovery_loop: normalizeRecordList(value.recovery_loop, 'product_entry_guardrails.recovery_loop').map((entry, index) => ({
      step_id: requireString(entry.step_id, `product_entry_guardrails.recovery_loop[${index}].step_id`),
      title: optionalString(entry.title),
      command: optionalString(entry.command),
      surface_kind: optionalString(entry.surface_kind),
    })),
  };
}

export function normalizeClearanceLane(value: unknown, fallbackSurfaceKind: string) {
  if (!isRecord(value)) {
    return null;
  }

  return {
    surface_kind: optionalString(value.surface_kind) ?? fallbackSurfaceKind,
    summary: optionalString(value.summary),
    recommended_step_id: optionalString(value.recommended_step_id),
    recommended_command: optionalString(value.recommended_command),
    clearance_targets: normalizeRecordList(value.clearance_targets, `${fallbackSurfaceKind}.clearance_targets`).map((entry, index) => ({
      target_id: requireString(entry.target_id, `${fallbackSurfaceKind}.clearance_targets[${index}].target_id`),
      title: optionalString(entry.title),
      commands: readStringList(entry.commands),
    })),
    clearance_loop: normalizeRecordList(value.clearance_loop, `${fallbackSurfaceKind}.clearance_loop`).map((entry, index) => ({
      step_id: requireString(entry.step_id, `${fallbackSurfaceKind}.clearance_loop[${index}].step_id`),
      title: optionalString(entry.title),
      command: optionalString(entry.command),
      surface_kind: optionalString(entry.surface_kind),
    })),
    proof_surfaces: normalizeRecordList(value.proof_surfaces, `${fallbackSurfaceKind}.proof_surfaces`).map((entry) => ({
      surface_kind: optionalString(entry.surface_kind),
      command: optionalString(entry.command),
      ref: optionalString(entry.ref),
    })),
    recommended_phase_command: optionalString(value.recommended_phase_command),
  };
}

export function normalizeBackendDeconstructionLane(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  return {
    surface_kind: optionalString(value.surface_kind) ?? 'phase4_backend_deconstruction_lane',
    summary: optionalString(value.summary),
    substrate_targets: normalizeRecordList(value.substrate_targets, 'phase4_backend_deconstruction_lane.substrate_targets').map((entry, index) => ({
      capability_id: requireString(entry.capability_id, `phase4_backend_deconstruction_lane.substrate_targets[${index}].capability_id`),
      owner: optionalString(entry.owner),
      summary: optionalString(entry.summary),
    })),
    backend_retained_now: readStringList(value.backend_retained_now),
    current_backend_chain: readStringList(value.current_backend_chain),
    optional_executor_proofs: normalizeRecordList(value.optional_executor_proofs, 'phase4_backend_deconstruction_lane.optional_executor_proofs'),
    promotion_rules: readStringList(value.promotion_rules),
    deconstruction_map_doc: optionalString(value.deconstruction_map_doc),
    recommended_phase_command: optionalString(value.recommended_phase_command),
  };
}

export function normalizePlatformTarget(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  return {
    surface_kind: optionalString(value.surface_kind) ?? 'phase5_platform_target',
    summary: optionalString(value.summary),
    sequence_scope: optionalString(value.sequence_scope),
    current_step_id: optionalString(value.current_step_id),
    current_readiness_summary: optionalString(value.current_readiness_summary),
    north_star_topology: isRecord(value.north_star_topology) ? value.north_star_topology : null,
    target_internal_modules: readStringList(value.target_internal_modules),
    landing_sequence: normalizeRecordList(value.landing_sequence, 'phase5_platform_target.landing_sequence').map((entry, index) => ({
      step_id: requireString(entry.step_id, `phase5_platform_target.landing_sequence[${index}].step_id`),
      title: optionalString(entry.title),
      phase_id: optionalString(entry.phase_id),
      status: optionalString(entry.status),
      summary: optionalString(entry.summary),
    })),
    completed_step_ids: readStringList(value.completed_step_ids),
    remaining_step_ids: readStringList(value.remaining_step_ids),
    promotion_gates: readStringList(value.promotion_gates),
    recommended_phase_command: optionalString(value.recommended_phase_command),
    land_now: readStringList(value.land_now),
    not_yet: readStringList(value.not_yet),
  };
}

export function normalizeProductEntryStart(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  const modes = normalizeRecordList(value.modes, 'product_entry_start.modes').map((mode, index) => ({
    mode_id: requireString(mode.mode_id, `product_entry_start.modes[${index}].mode_id`),
    title: optionalString(mode.title),
    command: optionalString(mode.command),
    surface_kind: optionalString(mode.surface_kind),
    summary: optionalString(mode.summary),
    requires: readStringList(mode.requires),
  }));
  const recommendedModeId = optionalString(value.recommended_mode_id);

  if (recommendedModeId && !modes.some((mode) => mode.mode_id === recommendedModeId)) {
    throw new Error('product_entry_start.recommended_mode_id must reference an existing mode_id.');
  }

  const resumeSurface = isRecord(value.resume_surface)
    ? {
        surface_kind: optionalString(value.resume_surface.surface_kind),
        command: optionalString(value.resume_surface.command),
        session_locator_field: optionalString(value.resume_surface.session_locator_field),
        checkpoint_locator_field: optionalString(value.resume_surface.checkpoint_locator_field),
      }
    : null;

  return {
    surface_kind: optionalString(value.surface_kind) ?? 'product_entry_start',
    summary: optionalString(value.summary),
    recommended_mode_id: recommendedModeId,
    modes,
    resume_surface: resumeSurface,
    human_gate_ids: readStringList(value.human_gate_ids),
  };
}

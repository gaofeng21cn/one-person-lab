import type {
  BuildFamilyProductFrontdeskFromManifestInput,
  BuildFamilyProductFrontdeskInput,
  BuildFamilyProductEntryManifestInput,
  BuildProductEntryOverviewInput,
  BuildProductEntryQuickstartInput,
  BuildProductEntryReadinessInput,
  BuildProductEntryStartInput,
  BuildProductFrontdeskInput,
  FamilyProductEntryManifestSurface,
  FamilyProductFrontdeskSurface,
  JsonRecord,
} from './types.ts';
import {
  cloneRecord,
  isRecord,
  mergeExtraPayload,
  normalizeFrontdeskSummary,
  normalizeProgressSurface,
  normalizeResumeContract,
  normalizeStartMode,
  normalizeStartResumeSurface,
  normalizeStep,
  optionalString,
  optionalStringList,
  readStringList,
  requireBoolean,
  requireInteger,
  requireRecord,
  requireString,
} from './internal.ts';
import { validateSharedHandoff } from '../family-entry-contracts.ts';
import {
  buildFamilyFrontdeskEntrySurfaces,
  validateFamilyFrontdeskEntrySurfaces,
} from './shell-surfaces.ts';
import {
  validateFamilyOrchestrationCompanion,
  validateFamilyProductEntryManifest,
  validateFamilyProductFrontdesk,
} from './validators.ts';
import { buildProductEntryResumeSurface } from './resume-surface.ts';

export { buildProductEntryResumeSurface } from './resume-surface.ts';

export function collectFamilyHumanGateIds(familyOrchestration: unknown) {
  if (!isRecord(familyOrchestration) || !Array.isArray(familyOrchestration.human_gates)) {
    return [];
  }
  return familyOrchestration.human_gates
    .map((gate, index) => (isRecord(gate) ? requireString(gate.gate_id, `human_gates[${index}].gate_id`) : null))
    .filter((gateId): gateId is string => Boolean(gateId));
}

export function buildProductEntryQuickstart(input: BuildProductEntryQuickstartInput) {
  const normalizedResumeContract = normalizeResumeContract(input.resume_contract, 'resume_contract');
  const normalizedSteps = input.steps.map((step, index) => normalizeStep(step, `steps[${index}]`));
  const recommendedStepId = requireString(input.recommended_step_id, 'recommended_step_id');
  if (!normalizedSteps.some((step) => step.step_id === recommendedStepId)) {
    throw new Error('product entry quickstart recommended_step_id 必须引用现有 step_id。');
  }
  return {
    surface_kind: 'product_entry_quickstart',
    recommended_step_id: recommendedStepId,
    summary: requireString(input.summary, 'summary'),
    steps: normalizedSteps,
    resume_contract: normalizedResumeContract,
    human_gate_ids: readStringList(input.human_gate_ids, 'human_gate_ids'),
  };
}

export function buildProductEntryOverview(input: BuildProductEntryOverviewInput) {
  return {
    surface_kind: 'product_entry_overview',
    summary: requireString(input.summary, 'summary'),
    frontdesk_command: requireString(input.frontdesk_command, 'frontdesk_command'),
    recommended_command: requireString(input.recommended_command, 'recommended_command'),
    operator_loop_command: requireString(input.operator_loop_command, 'operator_loop_command'),
    progress_surface: normalizeProgressSurface(input.progress_surface, 'progress_surface'),
    resume_surface: buildProductEntryResumeSurface(input.resume_surface.command, input.resume_surface),
    recommended_step_id: requireString(input.recommended_step_id, 'recommended_step_id'),
    next_focus: readStringList(input.next_focus, 'next_focus'),
    remaining_gaps_count: requireInteger(input.remaining_gaps_count, 'remaining_gaps_count'),
    human_gate_ids: readStringList(input.human_gate_ids, 'human_gate_ids'),
  };
}

export function buildProductEntryReadiness(input: BuildProductEntryReadinessInput) {
  return {
    surface_kind: 'product_entry_readiness',
    verdict: requireString(input.verdict, 'verdict'),
    usable_now: requireBoolean(input.usable_now, 'usable_now'),
    good_to_use_now: requireBoolean(input.good_to_use_now, 'good_to_use_now'),
    fully_automatic: requireBoolean(input.fully_automatic, 'fully_automatic'),
    summary: requireString(input.summary, 'summary'),
    recommended_start_surface: requireString(input.recommended_start_surface, 'recommended_start_surface'),
    recommended_start_command: requireString(input.recommended_start_command, 'recommended_start_command'),
    recommended_loop_surface: requireString(input.recommended_loop_surface, 'recommended_loop_surface'),
    recommended_loop_command: requireString(input.recommended_loop_command, 'recommended_loop_command'),
    blocking_gaps: readStringList(input.blocking_gaps, 'blocking_gaps'),
  };
}

export function buildProductEntryStart(input: BuildProductEntryStartInput) {
  const normalizedModes = input.modes.map((mode, index) => normalizeStartMode(mode, `modes[${index}]`));
  const recommendedModeId = requireString(input.recommended_mode_id, 'recommended_mode_id');
  if (!normalizedModes.some((mode) => mode.mode_id === recommendedModeId)) {
    throw new Error('product entry start recommended_mode_id 必须引用现有 mode_id。');
  }
  return {
    surface_kind: 'product_entry_start',
    summary: requireString(input.summary, 'summary'),
    recommended_mode_id: recommendedModeId,
    modes: normalizedModes,
    resume_surface: normalizeStartResumeSurface(input.resume_surface, 'resume_surface'),
    human_gate_ids: readStringList(input.human_gate_ids, 'human_gate_ids'),
  };
}

export function buildProductFrontdesk(input: BuildProductFrontdeskInput): FamilyProductFrontdeskSurface {
  const payload: JsonRecord = {
    surface_kind: 'product_frontdesk',
    recommended_action: requireString(input.recommended_action, 'recommended_action'),
    target_domain_id: requireString(input.target_domain_id, 'target_domain_id'),
    workspace_locator: cloneRecord(input.workspace_locator, 'workspace_locator'),
    runtime: cloneRecord(input.runtime, 'runtime'),
    product_entry_status: cloneRecord(input.product_entry_status, 'product_entry_status'),
    frontdesk_surface: cloneRecord(input.frontdesk_surface, 'frontdesk_surface'),
    operator_loop_surface: cloneRecord(input.operator_loop_surface, 'operator_loop_surface'),
    operator_loop_actions: cloneRecord(input.operator_loop_actions, 'operator_loop_actions'),
    product_entry_start: cloneRecord(input.product_entry_start, 'product_entry_start'),
    product_entry_overview: cloneRecord(input.product_entry_overview, 'product_entry_overview'),
    product_entry_preflight: cloneRecord(input.product_entry_preflight, 'product_entry_preflight'),
    product_entry_readiness: cloneRecord(input.product_entry_readiness, 'product_entry_readiness'),
    product_entry_quickstart: cloneRecord(input.product_entry_quickstart, 'product_entry_quickstart'),
    family_orchestration: cloneRecord(input.family_orchestration, 'family_orchestration'),
    product_entry_manifest: cloneRecord(input.product_entry_manifest, 'product_entry_manifest'),
    entry_surfaces: validateFamilyFrontdeskEntrySurfaces(input.entry_surfaces, 'entry_surfaces'),
    summary: normalizeFrontdeskSummary(input.summary, 'summary'),
    notes: readStringList(input.notes, 'notes'),
  };
  const schemaRef = optionalString(input.schema_ref);
  if (schemaRef) {
    payload.schema_ref = schemaRef;
  }
  if (input.domain_entry_contract !== undefined && input.domain_entry_contract !== null) {
    payload.domain_entry_contract = cloneRecord(input.domain_entry_contract, 'domain_entry_contract');
  }
  if (input.gateway_interaction_contract !== undefined && input.gateway_interaction_contract !== null) {
    payload.gateway_interaction_contract = cloneRecord(
      input.gateway_interaction_contract,
      'gateway_interaction_contract',
    );
  }
  return mergeExtraPayload(payload, input.extra_payload, 'product frontdesk') as FamilyProductFrontdeskSurface;
}

export function buildFamilyProductFrontdesk(input: BuildFamilyProductFrontdeskInput): FamilyProductFrontdeskSurface {
  const manifest = cloneRecord(input.product_entry_manifest, 'product_entry_manifest');
  const frontdeskSurface = cloneRecord(
    manifest.frontdesk_surface,
    'product_entry_manifest.frontdesk_surface',
  );
  const operatorLoopSurface = cloneRecord(
    manifest.operator_loop_surface,
    'product_entry_manifest.operator_loop_surface',
  );
  return buildProductFrontdesk({
    recommended_action: requireString(input.recommended_action, 'recommended_action'),
    target_domain_id: requireString(
      manifest.target_domain_id,
      'product_entry_manifest.target_domain_id',
    ),
    workspace_locator: cloneRecord(
      manifest.workspace_locator,
      'product_entry_manifest.workspace_locator',
    ),
    runtime: cloneRecord(manifest.runtime, 'product_entry_manifest.runtime'),
    product_entry_status: cloneRecord(
      manifest.product_entry_status,
      'product_entry_manifest.product_entry_status',
    ),
    frontdesk_surface: frontdeskSurface,
    operator_loop_surface: operatorLoopSurface,
    operator_loop_actions: cloneRecord(
      manifest.operator_loop_actions,
      'product_entry_manifest.operator_loop_actions',
    ),
    product_entry_start: cloneRecord(
      manifest.product_entry_start,
      'product_entry_manifest.product_entry_start',
    ),
    product_entry_overview: cloneRecord(
      manifest.product_entry_overview,
      'product_entry_manifest.product_entry_overview',
    ),
    product_entry_preflight: cloneRecord(
      manifest.product_entry_preflight,
      'product_entry_manifest.product_entry_preflight',
    ),
    product_entry_readiness: cloneRecord(
      manifest.product_entry_readiness,
      'product_entry_manifest.product_entry_readiness',
    ),
    product_entry_quickstart: cloneRecord(
      manifest.product_entry_quickstart,
      'product_entry_manifest.product_entry_quickstart',
    ),
    family_orchestration: cloneRecord(
      manifest.family_orchestration,
      'product_entry_manifest.family_orchestration',
    ),
    product_entry_manifest: manifest,
    entry_surfaces: validateFamilyFrontdeskEntrySurfaces(input.entry_surfaces, 'entry_surfaces'),
    summary: {
      frontdesk_command: requireString(
        frontdeskSurface.command,
        'product_entry_manifest.frontdesk_surface.command',
      ),
      recommended_command: requireString(
        manifest.recommended_command,
        'product_entry_manifest.recommended_command',
      ),
      operator_loop_command: requireString(
        operatorLoopSurface.command,
        'product_entry_manifest.operator_loop_surface.command',
      ),
    },
    notes: readStringList(input.notes, 'notes'),
    schema_ref: optionalString(input.schema_ref) ?? optionalString(manifest.schema_ref),
    domain_entry_contract: isRecord(input.domain_entry_contract)
      ? input.domain_entry_contract
      : isRecord(manifest.domain_entry_contract)
      ? manifest.domain_entry_contract
      : null,
    gateway_interaction_contract: isRecord(input.gateway_interaction_contract)
      ? input.gateway_interaction_contract
      : isRecord(manifest.gateway_interaction_contract)
      ? manifest.gateway_interaction_contract
      : null,
    extra_payload: input.extra_payload,
  });
}

export function buildFamilyProductFrontdeskFromManifest(
  input: BuildFamilyProductFrontdeskFromManifestInput,
): FamilyProductFrontdeskSurface {
  const manifest = validateFamilyProductEntryManifest(input.product_entry_manifest);
  return buildFamilyProductFrontdesk({
    recommended_action: requireString(input.recommended_action, 'recommended_action'),
    product_entry_manifest: manifest,
    entry_surfaces: buildFamilyFrontdeskEntrySurfaces({
      product_entry_shell: manifest.product_entry_shell as Record<string, JsonRecord>,
      shell_aliases: input.shell_aliases,
      shared_handoff: manifest.shared_handoff,
    }),
    notes: readStringList(input.notes, 'notes'),
    schema_ref: optionalString(input.schema_ref) ?? optionalString(manifest.schema_ref),
    extra_payload: input.extra_payload,
  });
}

export function buildFamilyProductEntryManifest(
  input: BuildFamilyProductEntryManifestInput,
): FamilyProductEntryManifestSurface {
  const payload: JsonRecord = {
    surface_kind: 'product_entry_manifest',
    manifest_version: 2,
    manifest_kind: requireString(input.manifest_kind, 'manifest_kind'),
    target_domain_id: requireString(input.target_domain_id, 'target_domain_id'),
    formal_entry: cloneRecord(input.formal_entry, 'formal_entry'),
    workspace_locator: cloneRecord(input.workspace_locator, 'workspace_locator'),
    product_entry_shell: cloneRecord(input.product_entry_shell, 'product_entry_shell'),
    shared_handoff: validateSharedHandoff(input.shared_handoff, 'shared_handoff'),
    product_entry_start: cloneRecord(input.product_entry_start, 'product_entry_start'),
    family_orchestration: cloneRecord(input.family_orchestration, 'family_orchestration'),
  };

  const optionalRecords: Array<[string, unknown]> = [
    ['runtime', input.runtime],
    ['managed_runtime_contract', input.managed_runtime_contract],
    ['repo_mainline', input.repo_mainline],
    ['product_entry_status', input.product_entry_status],
    ['frontdesk_surface', input.frontdesk_surface],
    ['operator_loop_surface', input.operator_loop_surface],
    ['operator_loop_actions', input.operator_loop_actions],
    ['runtime_inventory', input.runtime_inventory],
    ['task_lifecycle', input.task_lifecycle],
    ['runtime_control', input.runtime_control],
    ['runtime_loop_closure', input.runtime_loop_closure],
    ['session_continuity', input.session_continuity],
    ['progress_projection', input.progress_projection],
    ['artifact_inventory', input.artifact_inventory],
    ['skill_catalog', input.skill_catalog],
    ['automation', input.automation],
    ['product_entry_overview', input.product_entry_overview],
    ['product_entry_preflight', input.product_entry_preflight],
    ['product_entry_readiness', input.product_entry_readiness],
    ['product_entry_quickstart', input.product_entry_quickstart],
  ];

  for (const [key, value] of optionalRecords) {
    if (value !== undefined && value !== null) {
      payload[key] = cloneRecord(value, key);
    }
  }

  const recommendedShell = optionalString(input.recommended_shell);
  if (recommendedShell) {
    payload.recommended_shell = recommendedShell;
  }
  const recommendedCommand = optionalString(input.recommended_command);
  if (recommendedCommand) {
    payload.recommended_command = recommendedCommand;
  }
  const remainingGaps = optionalStringList(input.remaining_gaps, 'remaining_gaps');
  if (remainingGaps) {
    payload.remaining_gaps = remainingGaps;
  }
  const notes = optionalStringList(input.notes, 'notes');
  if (notes) {
    payload.notes = notes;
  }
  const schemaRef = optionalString(input.schema_ref);
  if (schemaRef) {
    payload.schema_ref = schemaRef;
  }
  if (input.domain_entry_contract !== undefined && input.domain_entry_contract !== null) {
    payload.domain_entry_contract = cloneRecord(input.domain_entry_contract, 'domain_entry_contract');
  }
  if (input.gateway_interaction_contract !== undefined && input.gateway_interaction_contract !== null) {
    payload.gateway_interaction_contract = cloneRecord(
      input.gateway_interaction_contract,
      'gateway_interaction_contract',
    );
  }

  return mergeExtraPayload(payload, input.extra_payload, 'product entry manifest') as FamilyProductEntryManifestSurface;
}

import {
  type FamilySharedHandoffSurface,
  type SharedHandoffBuilderSurface,
  validateFamilyDomainEntryContract as validateSharedFamilyDomainEntryContract,
  validateGatewayInteractionContract as validateSharedGatewayInteractionContract,
  validateSharedHandoff,
  validateSharedHandoffBuilder,
} from '../family-entry-contracts.ts';

export type JsonRecord = Record<string, unknown>;

export type FamilyFrontdeskEntrySurfaces = Record<string, JsonRecord> & Partial<
  Pick<FamilySharedHandoffSurface, 'direct_entry_builder' | 'opl_handoff_builder'>
>;

export interface ProductEntryResumeContract {
  surface_kind: string;
  session_locator_field: string;
  checkpoint_locator_field?: string | null;
}

export interface ProductEntryStartResumeSurface {
  surface_kind: string;
  command?: string | null;
  session_locator_field?: string | null;
  checkpoint_locator_field?: string | null;
}

export interface ProductEntryStepInput {
  step_id: string;
  title: string;
  command: string;
  surface_kind: string;
  summary: string;
  requires: string[];
}

export interface ProductEntryProgressSurfaceInput {
  surface_kind: string;
  command: string;
  step_id?: string | null;
}

export interface ProductEntryStartModeInput {
  mode_id: string;
  title: string;
  command: string;
  surface_kind: string;
  summary: string;
  requires: string[];
}

export interface BuildProductEntryQuickstartInput {
  summary: string;
  recommended_step_id: string;
  steps: ProductEntryStepInput[];
  resume_contract: ProductEntryResumeContract;
  human_gate_ids: string[];
}

export interface BuildProductEntryOverviewInput {
  summary: string;
  frontdesk_command: string;
  recommended_command: string;
  operator_loop_command: string;
  progress_surface: ProductEntryProgressSurfaceInput;
  resume_surface: ProductEntryStartResumeSurface & { command: string };
  recommended_step_id: string;
  next_focus: string[];
  remaining_gaps_count: number;
  human_gate_ids: string[];
}

export interface BuildProductEntryReadinessInput {
  verdict: string;
  usable_now: boolean;
  good_to_use_now: boolean;
  fully_automatic: boolean;
  summary: string;
  recommended_start_surface: string;
  recommended_start_command: string;
  recommended_loop_surface: string;
  recommended_loop_command: string;
  blocking_gaps: string[];
}

export interface BuildProductEntryStartInput {
  summary: string;
  recommended_mode_id: string;
  modes: ProductEntryStartModeInput[];
  resume_surface: ProductEntryStartResumeSurface;
  human_gate_ids: string[];
}

export interface BuildProductFrontdeskSummaryInput {
  frontdesk_command: string;
  recommended_command: string;
  operator_loop_command: string;
}

export interface BuildProductFrontdeskInput {
  recommended_action: string;
  target_domain_id: string;
  workspace_locator: JsonRecord;
  runtime: JsonRecord;
  product_entry_status: JsonRecord;
  frontdesk_surface: JsonRecord;
  operator_loop_surface: JsonRecord;
  operator_loop_actions: JsonRecord;
  product_entry_start: JsonRecord;
  product_entry_overview: JsonRecord;
  product_entry_preflight: JsonRecord;
  product_entry_readiness: JsonRecord;
  product_entry_quickstart: JsonRecord;
  family_orchestration: JsonRecord;
  product_entry_manifest: JsonRecord;
  entry_surfaces: FamilyFrontdeskEntrySurfaces;
  summary: BuildProductFrontdeskSummaryInput;
  notes: string[];
  schema_ref?: string | null;
  domain_entry_contract?: JsonRecord | null;
  gateway_interaction_contract?: JsonRecord | null;
  extra_payload?: JsonRecord;
}

export interface BuildFamilyProductFrontdeskInput {
  recommended_action: string;
  product_entry_manifest: JsonRecord;
  entry_surfaces: FamilyFrontdeskEntrySurfaces;
  notes: string[];
  schema_ref?: string | null;
  domain_entry_contract?: JsonRecord | null;
  gateway_interaction_contract?: JsonRecord | null;
  extra_payload?: JsonRecord;
}

export interface BuildFamilyProductFrontdeskFromManifestInput {
  recommended_action: string;
  product_entry_manifest: JsonRecord;
  shell_aliases: Record<string, string>;
  notes: string[];
  schema_ref?: string | null;
  extra_payload?: JsonRecord;
}

export interface BuildFamilyFrontdeskEntrySurfacesInput {
  product_entry_shell: Record<string, JsonRecord>;
  shell_aliases: Record<string, string>;
  shared_handoff?: FamilySharedHandoffSurface | JsonRecord | null;
}

export interface BuildProductEntryShellSurfaceInput {
  command: string;
  surface_kind: string;
  summary?: string | null;
  purpose?: string | null;
  command_template?: string | null;
  requires?: string[] | null;
  extra_payload?: JsonRecord;
}

export type ProductEntryShellSurface = JsonRecord & {
  command: string;
  surface_kind: string;
  summary?: string;
  purpose?: string;
  command_template?: string;
  requires?: string[];
};

export interface BuildProductEntryShellLinkedSurfaceInput {
  shell_key: string;
  shell_surface: BuildProductEntryShellSurfaceInput | JsonRecord;
  summary: string;
  extra_payload?: JsonRecord;
}

export type ProductEntryShellLinkedSurface = JsonRecord & {
  shell_key: string;
  command: string;
  surface_kind: string;
  summary: string;
};

export interface BuildOperatorLoopActionInput {
  command: string;
  surface_kind: string;
  summary: string;
  requires: string[];
  extra_payload?: JsonRecord;
}

export type OperatorLoopActionSurface = JsonRecord & {
  command: string;
  surface_kind: string;
  summary: string;
  requires: string[];
};

export interface BuildRuntimeSessionContractInput {
  runtime_owner: string;
  expected_runtime_owner?: string | null;
  adapter_surface?: string | null;
  default_adapter_surface?: string | null;
  session_mode?: string | null;
  default_session_mode?: string | null;
  extra_payload?: JsonRecord;
}

export type RuntimeSessionContractSurface = JsonRecord & {
  runtime_owner: string;
  adapter_surface?: string;
  session_mode?: string;
};

export interface BuildReturnSurfaceContractInput {
  requested_surface_kind: string;
  expected_surface_kind?: string | null;
  actual_surface_kind?: string | null;
  durable_truth_surfaces?: string[] | null;
  extra_payload?: JsonRecord;
}

export type ReturnSurfaceContractSurface = JsonRecord & {
  requested_surface_kind: string;
  actual_surface_kind?: string;
  durable_truth_surfaces?: string[];
};

export interface BuildProductEntryContinuationSnapshotInput {
  latest_managed_run_id?: string | null;
  latest_run_id?: string | null;
  managed_progress_projection?: JsonRecord | null;
  runtime_supervision?: JsonRecord | null;
  extra_payload?: JsonRecord;
}

export type ProductEntryContinuationSnapshotSurface = JsonRecord & {
  latest_managed_run_id: string | null;
  latest_run_id: string | null;
  managed_progress_projection: JsonRecord | null;
  runtime_supervision: JsonRecord | null;
};

export interface BuildEntrySessionSurfaceInput {
  entry_session_id: string;
  session_file: string;
  runtime_owner: string;
  resumed_from_session?: boolean | null;
  created_deliverable?: boolean | null;
  extra_payload?: JsonRecord;
}

export type EntrySessionSurface = JsonRecord & {
  entry_session_id: string;
  session_file: string;
  runtime_owner: string;
  resumed_from_session?: boolean;
  created_deliverable?: boolean;
};

export interface BuildDeliveryIdentitySurfaceInput {
  deliverable_family: string;
  topic_id: string;
  deliverable_id: string;
  profile_id?: string | null;
  extra_payload?: JsonRecord;
}

export type DeliveryIdentitySurface = JsonRecord & {
  deliverable_family: string;
  topic_id: string;
  deliverable_id: string;
  profile_id?: string;
};

export interface BuildFamilyProductEntryManifestInput {
  manifest_kind: string;
  target_domain_id: string;
  formal_entry: JsonRecord;
  workspace_locator: JsonRecord;
  product_entry_shell: JsonRecord;
  shared_handoff: FamilySharedHandoffSurface;
  product_entry_start: JsonRecord;
  family_orchestration: JsonRecord;
  runtime?: JsonRecord | null;
  managed_runtime_contract?: JsonRecord | null;
  repo_mainline?: JsonRecord | null;
  product_entry_status?: JsonRecord | null;
  frontdesk_surface?: JsonRecord | null;
  operator_loop_surface?: JsonRecord | null;
  operator_loop_actions?: JsonRecord | null;
  recommended_shell?: string | null;
  recommended_command?: string | null;
  runtime_inventory?: JsonRecord | null;
  task_lifecycle?: JsonRecord | null;
  runtime_control?: JsonRecord | null;
  runtime_loop_closure?: JsonRecord | null;
  session_continuity?: JsonRecord | null;
  progress_projection?: JsonRecord | null;
  artifact_inventory?: JsonRecord | null;
  skill_catalog?: JsonRecord | null;
  automation?: JsonRecord | null;
  product_entry_overview?: JsonRecord | null;
  product_entry_preflight?: JsonRecord | null;
  product_entry_readiness?: JsonRecord | null;
  product_entry_quickstart?: JsonRecord | null;
  remaining_gaps?: string[] | null;
  notes?: string[] | null;
  schema_ref?: string | null;
  domain_entry_contract?: JsonRecord | null;
  gateway_interaction_contract?: JsonRecord | null;
  extra_payload?: JsonRecord;
}

export interface FamilyProductEntryValidationOptions {
  requireContractBundle?: boolean;
  requireRuntimeCompanions?: boolean;
  requireRuntimeContinuity?: boolean;
}

export type FamilyOrchestrationReferenceRef = JsonRecord & {
  ref_kind: string;
  ref: string;
  label?: string;
};

export type FamilyOrchestrationGatePreview = JsonRecord & {
  gate_id: string;
  title?: string;
  status?: string;
  review_surface?: FamilyOrchestrationReferenceRef;
};

export type FamilyOrchestrationCompanion = JsonRecord & {
  action_graph_ref?: FamilyOrchestrationReferenceRef;
  action_graph?: JsonRecord;
  human_gates: FamilyOrchestrationGatePreview[];
  resume_contract: ProductEntryResumeContract;
  event_envelope_surface?: FamilyOrchestrationReferenceRef;
  checkpoint_lineage_surface?: FamilyOrchestrationReferenceRef;
};

export type ProductEntryQuickstartSurface = JsonRecord & {
  surface_kind: 'product_entry_quickstart';
  recommended_step_id: string;
  summary: string;
  steps: ProductEntryStepInput[];
  resume_contract: ProductEntryResumeContract;
  human_gate_ids: string[];
};

export type ProductEntryStartSurface = JsonRecord & {
  surface_kind: 'product_entry_start';
  summary: string;
  recommended_mode_id: string;
  modes: ProductEntryStartModeInput[];
  resume_surface: ProductEntryStartResumeSurface;
  human_gate_ids: string[];
};

export type ProductEntryOverviewSurface = JsonRecord & {
  surface_kind: 'product_entry_overview';
  summary: string;
  frontdesk_command: string;
  recommended_command: string;
  operator_loop_command: string;
  progress_surface: ProductEntryProgressSurfaceInput;
  resume_surface: ProductEntryStartResumeSurface & { command: string };
  recommended_step_id: string;
  next_focus: string[];
  remaining_gaps_count: number;
  human_gate_ids: string[];
};

export type ProductEntryReadinessSurface = JsonRecord & {
  surface_kind: 'product_entry_readiness';
  verdict: string;
  usable_now: boolean;
  good_to_use_now: boolean;
  fully_automatic: boolean;
  summary: string;
  recommended_start_surface: string;
  recommended_start_command: string;
  recommended_loop_surface: string;
  recommended_loop_command: string;
  blocking_gaps: string[];
};

export type ProductEntryPreflightSurface = JsonRecord & {
  surface_kind: 'product_entry_preflight';
  summary: string;
  ready_to_try_now: boolean;
  recommended_check_command: string;
  recommended_start_command: string;
  blocking_check_ids: string[];
  checks: unknown[];
};

export type FamilyProductEntryManifestSurface = JsonRecord & {
  surface_kind: 'product_entry_manifest';
  manifest_version: number;
  manifest_kind: string;
  target_domain_id: string;
  formal_entry: JsonRecord;
  workspace_locator: JsonRecord;
  product_entry_shell: JsonRecord;
  shared_handoff: FamilySharedHandoffSurface;
  product_entry_start: ProductEntryStartSurface;
  family_orchestration: FamilyOrchestrationCompanion;
  runtime?: JsonRecord;
  managed_runtime_contract?: JsonRecord;
  repo_mainline?: JsonRecord;
  product_entry_status?: JsonRecord;
  frontdesk_surface?: JsonRecord;
  operator_loop_surface?: JsonRecord;
  operator_loop_actions?: JsonRecord;
  recommended_shell?: string;
  recommended_command?: string;
  runtime_inventory?: JsonRecord;
  task_lifecycle?: JsonRecord;
  runtime_control?: JsonRecord;
  runtime_loop_closure?: JsonRecord;
  session_continuity?: JsonRecord;
  progress_projection?: JsonRecord;
  artifact_inventory?: JsonRecord;
  skill_catalog?: JsonRecord;
  automation?: JsonRecord;
  product_entry_overview?: ProductEntryOverviewSurface;
  product_entry_preflight?: ProductEntryPreflightSurface;
  product_entry_readiness?: ProductEntryReadinessSurface;
  product_entry_quickstart?: ProductEntryQuickstartSurface;
  remaining_gaps?: string[];
  notes?: string[];
  schema_ref?: string;
  domain_entry_contract?: JsonRecord;
  gateway_interaction_contract?: JsonRecord;
};

export type FamilyProductFrontdeskSurface = JsonRecord & {
  surface_kind: 'product_frontdesk';
  recommended_action: string;
  target_domain_id: string;
  workspace_locator: JsonRecord;
  runtime: JsonRecord;
  product_entry_status: JsonRecord;
  frontdesk_surface: JsonRecord;
  operator_loop_surface: JsonRecord;
  operator_loop_actions: JsonRecord;
  product_entry_start: ProductEntryStartSurface;
  product_entry_overview: ProductEntryOverviewSurface;
  product_entry_preflight: ProductEntryPreflightSurface;
  product_entry_readiness: ProductEntryReadinessSurface;
  product_entry_quickstart: ProductEntryQuickstartSurface;
  family_orchestration: FamilyOrchestrationCompanion;
  product_entry_manifest: FamilyProductEntryManifestSurface;
  entry_surfaces: FamilyFrontdeskEntrySurfaces;
  summary: BuildProductFrontdeskSummaryInput;
  notes: string[];
  schema_ref?: string;
  domain_entry_contract?: JsonRecord;
  gateway_interaction_contract?: JsonRecord;
};


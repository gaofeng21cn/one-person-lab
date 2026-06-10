import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function readJson<T>(relativePath: string): T {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as T;
}

test('target architecture schema contracts keep owner delta root and audit tail boundaries machine-readable', () => {
  const schemaPaths = [
    'contracts/opl-framework/current-owner-delta.schema.json',
    'contracts/opl-framework/stage-manifest.schema.json',
    'contracts/opl-framework/role-artifact-ref.schema.json',
    'contracts/opl-framework/stage-owner-receipt.schema.json',
    'contracts/opl-framework/stage-typed-blocker.schema.json',
    'contracts/opl-framework/stage-artifact-unit.schema.json',
    'contracts/opl-framework/owner-answer.schema.json',
    'contracts/opl-framework/evidence-vault-event.schema.json',
    'contracts/opl-framework/golden-path-profile.schema.json',
    'contracts/opl-framework/stop-loss-policy.schema.json',
    'contracts/opl-framework/default-surface-budget.schema.json',
    'contracts/opl-framework/workspace-topology-profile.schema.json',
    'contracts/opl-framework/workspace-index.schema.json',
    'contracts/opl-framework/capability-registry-resolver.schema.json',
  ];
  const schemas = Object.fromEntries(
    schemaPaths.map((schemaPath) => [schemaPath, readJson<Record<string, any>>(schemaPath)]),
  );

  for (const [schemaPath, schema] of Object.entries(schemas)) {
    assert.equal(schema.owner, 'one-person-lab', `${schemaPath} must stay OPL-owned`);
    assert.equal(schema.state, 'active_contract', `${schemaPath} must be active contract`);
    assert.equal(typeof schema.purpose, 'string', `${schemaPath} must declare purpose`);
    assert.equal(typeof schema.machine_boundary, 'string', `${schemaPath} must declare boundary`);
    assert.equal(schema.type, 'object', `${schemaPath} must describe an object payload`);
  }

  const ownerDelta = schemas['contracts/opl-framework/current-owner-delta.schema.json'];
  assert.equal(ownerDelta.properties.surface_kind.const, 'opl_current_owner_delta');
  assert.equal(ownerDelta.properties.schema_version.const, 'current-owner-delta.v1');
  assert.equal(ownerDelta.properties.current_owner.type, 'string');
  assert.equal(
    ownerDelta.properties.projection_policy.const,
    'default_owner_delta_root_audit_tail_passive',
  );
  assert.equal(
    ownerDelta.properties.default_planning_root.const,
    'current_owner_delta',
  );
  assert.equal(
    ownerDelta.properties.audit_tail_policy.const,
    'raw_worklist_raw_evidence_replay_typed_blocker_group_private_residue_are_passive_until_folded',
  );
  assert.equal(
    ownerDelta.properties.evidence_vault_policy.const,
    'record_everything_plan_from_nothing',
  );
  assert.equal(
    ownerDelta.properties.ordinary_progress_spine.properties.default_planning_root.const,
    'current_owner_delta',
  );
  assert.equal(
    ownerDelta.properties.ordinary_progress_spine.properties.default_next_action_derives_from.const,
    'current_owner_delta',
  );
  assert.equal(
    ownerDelta.properties.progress_delta_receipt.properties.ordinary_receipt_kind.const,
    'ProgressDeltaReceipt',
  );
  assert.equal(
    ownerDelta.properties.progress_delta_receipt.properties.stage_transition_requires_owner_receipt_or_typed_blocker.const,
    true,
  );
  assert.equal(
    ownerDelta.properties.artifact_tier_policy.properties.default_ordinary_tier.const,
    'T0_progress_delta',
  );
  assert.equal(
    ownerDelta.properties.audit_sidecar_policy.properties.blocked_refs_only_can_generate_default_next_action.const,
    false,
  );
  assert.equal(ownerDelta.properties.audit_refs.type, 'object');
  assert.equal(ownerDelta.$defs.authority_boundary.properties.audit_tail_can_drive_default_planning.const, false);
  assert.equal(ownerDelta.$defs.authority_boundary.properties.raw_worklist_can_drive_default_planning.const, false);
  assert.equal(ownerDelta.$defs.authority_boundary.properties.route_not_stage_strategy.const, true);
  assert.equal(
    ownerDelta.$defs.authority_boundary.properties.route_reconciler_role.const,
    'hydrate_reconcile_owner_routes_only',
  );
  assert.equal(
    ownerDelta.$defs.authority_boundary.properties.route_reconciler_can_generate_candidates.const,
    false,
  );
  assert.equal(
    ownerDelta.$defs.authority_boundary.properties.route_reconciler_can_evaluate_or_rank_candidates.const,
    false,
  );
  assert.equal(ownerDelta.$defs.authority_boundary.properties.route_reconciler_can_complete_stage.const, false);
  assert.equal(ownerDelta.$defs.authority_boundary.properties.route_reconciler_can_sign_receipts.const, false);
  assert.equal(ownerDelta.$defs.authority_boundary.properties.raw_evidence_can_drive_default_planning.const, false);
  assert.equal(ownerDelta.$defs.authority_boundary.properties.replay_packet_can_drive_default_planning.const, false);
  assert.equal(
    ownerDelta.$defs.authority_boundary.properties.typed_blocker_group_can_drive_default_planning.const,
    false,
  );
  assert.equal(
    ownerDelta.$defs.authority_boundary.properties.private_residue_inventory_can_drive_default_planning.const,
    false,
  );

  const evidenceVault = schemas['contracts/opl-framework/evidence-vault-event.schema.json'];
  assert.equal(
    evidenceVault.properties.vault_policy.const,
    'record_everything_plan_from_nothing',
  );
  assert.equal(
    evidenceVault.$defs.authority_boundary.properties.event_can_create_default_action_without_delta.const,
    false,
  );
  assert.equal(evidenceVault.$defs.authority_boundary.properties.raw_worklist_can_drive_default_planning.const, false);
  assert.equal(evidenceVault.$defs.authority_boundary.properties.raw_evidence_can_drive_default_planning.const, false);
  assert.equal(evidenceVault.$defs.authority_boundary.properties.replay_packet_can_drive_default_planning.const, false);
  assert.equal(
    evidenceVault.$defs.authority_boundary.properties.typed_blocker_group_can_drive_default_planning.const,
    false,
  );
  assert.equal(
    evidenceVault.$defs.authority_boundary.properties.private_residue_inventory_can_drive_default_planning.const,
    false,
  );
  assert.equal(evidenceVault.$defs.authority_boundary.properties.opl_can_write_domain_truth.const, false);

  const capabilityResolver = schemas['contracts/opl-framework/capability-registry-resolver.schema.json'];
  assert.equal(capabilityResolver.properties.surface_kind.const, 'opl_capability_registry_resolution');
  assert.equal(capabilityResolver.properties.schema_version.const, 'capability-registry-resolver.v1');
  assert.equal(capabilityResolver.properties.resolver_policy.const, 'current_delta_bound_jit_or_fail_open');
  assert.deepEqual(capabilityResolver.properties.resolution_status.enum, [
    'resolved',
    'fail_open',
    'route_required_blocker_candidate',
  ]);
  assert.deepEqual(capabilityResolver.properties.selection.properties.action.enum, [
    'select_capability_ref',
    'advisory_or_audit',
    'route_required_blocker_candidate',
  ]);
  assert.deepEqual(capabilityResolver.properties.route_required_policy.properties.hard_boundary.enum, [
    'source_data_evidence',
    'owner_route_identity',
    'forbidden_write',
    'irreversible_mutation',
    'reviewer_publication_hard_gate',
    null,
  ]);
  assert.equal(
    capabilityResolver.properties.route_required_policy.properties.policy.enum.includes(
      'route_required_current_owner_delta_hard_boundary_missing_ref',
    ),
    true,
  );
  assert.equal(
    capabilityResolver.$defs.typed_blocker_candidate.properties.candidate_kind.const,
    'typed_blocker_candidate',
  );
  assert.equal(
    capabilityResolver.$defs.typed_blocker_candidate.properties.may_create_domain_typed_blocker.const,
    false,
  );
  assert.equal(
    capabilityResolver.$defs.authority_boundary.properties.can_execute_capability.const,
    false,
  );
  assert.equal(
    capabilityResolver.$defs.authority_boundary.properties.can_write_domain_truth.const,
    false,
  );
  assert.equal(
    capabilityResolver.$defs.authority_boundary.properties.can_sign_owner_receipt.const,
    false,
  );
  assert.equal(
    capabilityResolver.$defs.authority_boundary.properties.can_create_domain_typed_blocker.const,
    false,
  );
  assert.equal(
    capabilityResolver.$defs.authority_boundary.properties.can_claim_quality_or_export_verdict.const,
    false,
  );
  assert.equal(
    capabilityResolver.$defs.authority_boundary.properties.can_create_domain_local_selector.const,
    false,
  );
  assert.equal(
    capabilityResolver.$defs.authority_boundary.properties.can_create_always_on_sidecar.const,
    false,
  );
  assert.equal(
    capabilityResolver.$defs.authority_boundary.properties.can_create_default_preflight.const,
    false,
  );
  assert.equal(
    capabilityResolver.$defs.authority_boundary.properties.can_create_second_active_backlog.const,
    false,
  );

  const goldenPath = schemas['contracts/opl-framework/golden-path-profile.schema.json'];
  assert.equal(goldenPath.properties.default_surface_policy.properties.ordinary_route_count.const, 1);
  assert.equal(goldenPath.properties.explicit_variants.items.$ref, '#/$defs/explicit_variant');
  assert.deepEqual(goldenPath.$defs.explicit_variant.properties.lane_kind.enum, [
    'proof',
    'diagnostic',
    'cleanup',
    'long_soak',
    'route_variant',
    'legacy_provenance',
  ]);
  assert.equal(goldenPath.$defs.explicit_variant.properties.explicit_selection_required.const, true);
  assert.equal(goldenPath.$defs.explicit_variant.properties.hidden_by_default.const, true);
  assert.equal(
    goldenPath.$defs.explicit_variant.properties.can_be_default_without_explicit_selection.const,
    false,
  );
  assert.equal(
    goldenPath.$defs.authority_boundary.properties.variant_can_be_default_without_explicit_selection.const,
    false,
  );

  const stageArtifact = schemas['contracts/opl-framework/stage-artifact-unit.schema.json'];
  assert.equal(stageArtifact.properties.progress_truth.required.includes('owner_answer_present'), true);
  assert.equal(stageArtifact.$defs.authority_boundary.properties.provider_completion_counts_as_progress.const, false);

  const stageManifest = schemas['contracts/opl-framework/stage-manifest.schema.json'];
  assert.equal(stageManifest.properties.surface_kind.const, 'opl_stage_manifest');
  assert.equal(stageManifest.properties.schema_version.const, 'stage-manifest.v1');
  assert.equal(stageManifest.required.includes('required_roles'), true);
  assert.equal(stageManifest.required.includes('produced_roles'), true);
  assert.equal(stageManifest.required.includes('receipt_refs'), true);
  assert.equal(stageManifest.required.includes('typed_blocker_refs'), true);
  assert.equal(stageManifest.$defs.authority_boundary.properties.file_presence_counts_as_stage_complete.const, false);
  assert.equal(stageManifest.$defs.authority_boundary.properties.provider_completion_counts_as_stage_complete.const, false);

  const roleArtifactRef = schemas['contracts/opl-framework/role-artifact-ref.schema.json'];
  assert.equal(roleArtifactRef.properties.surface_kind.const, 'opl_role_artifact_ref');
  assert.equal(roleArtifactRef.properties.schema_version.const, 'role-artifact-ref.v1');
  assert.equal(roleArtifactRef.required.includes('role'), true);
  assert.equal(roleArtifactRef.required.includes('artifact_ref'), true);
  assert.equal(roleArtifactRef.required.includes('content_hash'), true);
  assert.equal(roleArtifactRef.$defs.authority_boundary.properties.file_name_is_role_interface.const, false);
  assert.equal(roleArtifactRef.$defs.authority_boundary.properties.artifact_body_included.const, false);

  const ownerReceipt = schemas['contracts/opl-framework/stage-owner-receipt.schema.json'];
  assert.equal(ownerReceipt.properties.surface_kind.const, 'opl_stage_owner_receipt');
  assert.equal(ownerReceipt.properties.schema_version.const, 'stage-owner-receipt.v1');
  assert.equal(ownerReceipt.required.includes('consumed_role_artifacts'), true);
  assert.equal(ownerReceipt.required.includes('accepted_delta'), true);
  assert.equal(ownerReceipt.required.includes('next_stage_or_owner'), true);
  assert.equal(ownerReceipt.properties.stage_manifest_ref.type, 'string');
  assert.equal(ownerReceipt.properties.current_pointer_ref.type, 'string');
  assert.equal(ownerReceipt.properties.source_fingerprint.type, 'string');
  assert.equal(ownerReceipt.properties.content_hash.type, 'string');
  assert.equal(ownerReceipt.$defs.authority_boundary.properties.opl_can_create_owner_receipt.const, false);
  assert.equal(ownerReceipt.$defs.authority_boundary.properties.provider_completion_counts_as_owner_receipt.const, false);

  const typedBlocker = schemas['contracts/opl-framework/stage-typed-blocker.schema.json'];
  assert.equal(typedBlocker.properties.surface_kind.const, 'opl_stage_typed_blocker');
  assert.equal(typedBlocker.properties.schema_version.const, 'stage-typed-blocker.v1');
  assert.equal(typedBlocker.required.includes('blocked_surface'), true);
  assert.equal(typedBlocker.required.includes('missing_or_failed_input'), true);
  assert.equal(typedBlocker.required.includes('next_safe_action'), true);
  assert.equal(typedBlocker.$defs.authority_boundary.properties.opl_can_create_typed_blocker.const, false);
  assert.equal(typedBlocker.$defs.authority_boundary.properties.blocker_counts_as_stage_success.const, false);

  const ownerAnswer = schemas['contracts/opl-framework/owner-answer.schema.json'];
  assert.equal(ownerAnswer.$defs.authority_boundary.properties.opl_can_sign_domain_owner_answer.const, false);

  const stopLoss = schemas['contracts/opl-framework/stop-loss-policy.schema.json'];
  assert.equal(stopLoss.$defs.authority_boundary.properties.opl_can_synthesize_fallback_verdict.const, false);

  const defaultSurfaceBudget = schemas['contracts/opl-framework/default-surface-budget.schema.json'];
  assert.equal(defaultSurfaceBudget.$defs.false_flags.properties.can_claim_production_ready.const, false);
  assert.equal(
    defaultSurfaceBudget.$defs.authority_boundary.properties.default_surface_can_replace_domain_owner.const,
    false,
  );

  const workspaceTopology = schemas['contracts/opl-framework/workspace-topology-profile.schema.json'];
  assert.equal(workspaceTopology.properties.surface_kind.const, 'opl_workspace_topology_profile');
  assert.equal(workspaceTopology.properties.version.const, 'workspace-topology-profile.v1');
  assert.equal(workspaceTopology.properties.profile_id.const, 'opl.workspace_topology_profile.v1');
  assert.deepEqual(
    workspaceTopology.properties.workspace_modes.items.enum,
    ['one_off', 'series', 'portfolio'],
  );
  assert.equal(
    workspaceTopology.properties.default_project_stage_outputs_root.const,
    'artifacts/stage_outputs',
  );
  assert.equal(workspaceTopology.required.includes('default_profiles'), true);
  assert.equal(workspaceTopology.required.includes('domain_profile_defaults'), true);
  assert.equal(workspaceTopology.required.includes('default_user_inspection_surface'), true);
  assert.equal(workspaceTopology.required.includes('runtime_state_boundary'), true);
  assert.equal(
    workspaceTopology.properties.default_user_inspection_surface.properties
      .project_stage_outputs_pattern.const,
    '<project-root>/artifacts/stage_outputs/<stage-id>/',
  );
  assert.equal(
    workspaceTopology.$defs.one_off_profile.properties.project_collection_path.const,
    'projects',
  );
  assert.equal(
    workspaceTopology.$defs.one_off_profile.properties.series_capable_skeleton.const,
    true,
  );
  assert.equal(
    workspaceTopology.$defs.rca_series_profile.properties.project_collection_path.const,
    'projects',
  );
  assert.equal(
    workspaceTopology.$defs.mas_portfolio_profile.properties.project_collection_path.const,
    'projects',
  );
  assert.equal(
    workspaceTopology.properties.default_user_inspection_surface.properties.runtime_state_is_default_user_surface.const,
    false,
  );
  assert.equal(
    workspaceTopology.$defs.runtime_state_boundary.properties.runtime_state_can_be_canonical_project_root.const,
    false,
  );
  assert.equal(
    workspaceTopology.$defs.runtime_state_boundary.properties.runtime_state_can_close_stage.const,
    false,
  );
  assert.equal(
    workspaceTopology.$defs.runtime_state_boundary.properties
      .runtime_state_can_replace_owner_receipt_or_typed_blocker.const,
    false,
  );
  assert.equal(
    workspaceTopology.$defs.authority_boundary.properties.opl_can_write_domain_truth.const,
    false,
  );
  assert.equal(
    workspaceTopology.$defs.authority_boundary.properties.opl_can_mutate_artifact_body.const,
    false,
  );
  assert.equal(
    workspaceTopology.$defs.authority_boundary.properties.opl_can_create_owner_receipt.const,
    false,
  );
  assert.equal(
    workspaceTopology.$defs.authority_boundary.properties.opl_can_create_typed_blocker.const,
    false,
  );
  assert.equal(
    workspaceTopology.examples[0].default_profiles.mas_portfolio.workspace_mode,
    'portfolio',
  );
  assert.equal(
    workspaceTopology.examples[0].default_profiles.rca_series.workspace_mode,
    'series',
  );

  const workspaceIndex = schemas['contracts/opl-framework/workspace-index.schema.json'];
  assert.equal(workspaceIndex.properties.surface_kind.const, 'opl_workspace_index');
  assert.equal(workspaceIndex.properties.version.const, 'workspace-index.v1');
  assert.equal(workspaceIndex.required.includes('canonical_topology'), true);
  assert.equal(workspaceIndex.required.includes('display_labels'), true);
  assert.equal(workspaceIndex.required.includes('shared_resources'), true);
  assert.equal(workspaceIndex.required.includes('generated_refs'), true);
  assert.equal(
    workspaceIndex.$defs.canonical_topology.properties.workspace_unit.const,
    'workspace_group',
  );
  assert.equal(
    workspaceIndex.$defs.canonical_topology.properties.project_collection_role.const,
    'project_units',
  );
  assert.equal(
    workspaceIndex.$defs.canonical_topology.properties.stage_artifact_unit.const,
    'stage_artifact_unit',
  );
  assert.equal(
    workspaceIndex.$defs.canonical_topology.properties.owner_answer_unit.const,
    'owner_receipt_or_typed_blocker',
  );
  assert.equal(
    workspaceIndex.$defs.canonical_topology.properties.stage_outputs_root.const,
    'artifacts/stage_outputs',
  );
  assert.equal(
    workspaceIndex.$defs.shared_resource.properties.domain_truth_owner.const,
    'domain_agent',
  );
  assert.equal(
    workspaceIndex.$defs.shared_resource.required.includes('manifest_ref'),
    true,
  );
  assert.equal(
    workspaceIndex.$defs.project.required.includes('stage_outputs_manifest_ref'),
    true,
  );
  assert.equal(
    workspaceIndex.$defs.project.required.includes('stage_outputs_index_ref'),
    true,
  );
  assert.equal(
    workspaceIndex.$defs.project.required.includes('current_stage_pointer_ref'),
    true,
  );
  assert.equal(
    workspaceIndex.$defs.project.required.includes('lifecycle'),
    true,
  );
  assert.deepEqual(
    workspaceIndex.$defs.project.properties.lifecycle.properties.status.enum,
    ['active', 'paused', 'archived', 'superseded', 'locked'],
  );
  assert.equal(
    workspaceIndex.$defs.project.properties.lifecycle.properties.safe_delete_gate.const,
    'domain_owner_receipt_required',
  );
  assert.deepEqual(
    workspaceIndex.$defs.project.properties.lifecycle.properties.retention_policy.enum,
    ['keep_until_explicit_archive', 'keep_until_explicit_delete_receipt'],
  );
  assert.equal(workspaceIndex.required.includes('profile_binding'), true);
  assert.equal(workspaceIndex.required.includes('topology_events'), true);
  assert.equal(
    workspaceIndex.$defs.profile_binding.properties.profile_version.const,
    'workspace-topology-profile.v2',
  );
  assert.equal(
    workspaceIndex.$defs.profile_binding.properties.profile_fingerprint.const,
    'opl-workspace-topology-profile-v2-projects-stage-outputs',
  );
  assert.equal(
    workspaceIndex.$defs.profile_binding.properties.profile_contract_ref.const,
    'contracts/opl-framework/standard-domain-agent-skeleton-contract.json#/new_agent_scaffold/foundry_agent_series_contract/workspace_topology_profile',
  );
  assert.equal(
    workspaceIndex.$defs.profile_binding.properties.migration_history.items.properties.project_roots_moved.const,
    false,
  );
  assert.deepEqual(
    workspaceIndex.$defs.topology_event.properties.event.enum,
    ['initialized', 'ensured', 'adopted', 'upgraded', 'project_appended', 'project_lifecycle_updated'],
  );
  assert.equal(
    workspaceIndex.$defs.topology_event.properties.project_collection_path.const,
    'projects',
  );
  assert.equal(
    workspaceIndex.$defs.topology_event.properties.project_roots_moved.const,
    false,
  );
  assert.equal(
    workspaceIndex.$defs.generated_refs.properties.workspace_inspection_ref.const,
    'workspace_inspection.json',
  );
  assert.equal(
    workspaceIndex.$defs.generated_refs.properties.workspace_resource_inventory_ref.const,
    'workspace_resource_inventory.json',
  );
  assert.equal(
    workspaceIndex.$defs.generated_refs.properties.workspace_report_ref.const,
    'workspace_report.json',
  );
  assert.equal(
    workspaceIndex.$defs.generated_refs.properties.canonical_generated_root.const,
    'control/opl',
  );
  assert.equal(
    workspaceIndex.$defs.generated_refs.properties.canonical_projection_root.const,
    'control/opl/projections',
  );
  assert.equal(
    workspaceIndex.$defs.generated_refs.properties.canonical_report_root.const,
    'control/opl/reports',
  );
  assert.equal(
    workspaceIndex.$defs.generated_refs.properties.canonical_workspace_report_ref.const,
    'control/opl/reports/workspace_report.json',
  );
  assert.deepEqual(
    workspaceIndex.$defs.generated_refs.properties.root_mirror_refs.prefixItems.map((entry: { const: string }) => entry.const),
    ['workspace_map.json', 'workspace_health.json', 'workspace_inspection.json', 'workspace_resource_inventory.json', 'workspace_report.json'],
  );
  assert.equal(
    workspaceIndex.$defs.generated_refs.properties.stage_outputs_index_basename.const,
    'stage_outputs_index.json',
  );
  assert.equal(
    workspaceIndex.$defs.generated_refs.properties.current_stage_pointer_basename.const,
    'current_stage.json',
  );
  assert.deepEqual(
    workspaceIndex.$defs.stage_lifecycle_status.enum,
    ['open', 'active', 'completed', 'blocked', 'superseded', 'archived'],
  );
  assert.equal(
    workspaceIndex.$defs.stage_outputs_index.properties.surface_kind.const,
    'opl_stage_outputs_index',
  );
  assert.equal(
    workspaceIndex.$defs.stage_outputs_index.properties.authority_boundary.properties.index_can_claim_stage_complete.const,
    false,
  );
  assert.equal(
    workspaceIndex.$defs.current_stage_pointer.properties.surface_kind.const,
    'opl_current_stage_pointer',
  );
  assert.equal(
    workspaceIndex.$defs.current_stage_pointer.properties.authority_boundary.properties.pointer_can_replace_owner_receipt.const,
    false,
  );
  assert.equal(
    workspaceIndex.$defs.current_stage_pointer.properties.authority_boundary.properties.pointer_role.const,
    'workspace_stage_artifact_projection_not_stage_run_current_pointer',
  );
  assert.equal(
    workspaceIndex.$defs.current_stage_pointer.properties.authority_boundary.properties
      .pointer_can_write_stage_run_current_pointer.const,
    false,
  );
  assert.equal(
    workspaceIndex.$defs.current_stage_pointer.properties.authority_boundary.properties
      .pointer_can_write_stage_run_terminal_state.const,
    false,
  );
  assert.equal(
    workspaceIndex.$defs.current_stage_pointer.properties.authority_boundary.properties
      .pointer_can_publish_current_owner_delta.const,
    false,
  );
  assert.equal(
    workspaceIndex.$defs.workspace_inspection.properties.surface_kind.const,
    'opl_workspace_inspection',
  );
  assert.equal(
    workspaceIndex.$defs.workspace_resource_inventory.properties.surface_kind.const,
    'opl_workspace_resource_inventory',
  );
  assert.equal(
    workspaceIndex.$defs.runtime_state_boundary.properties.runtime_state_can_be_canonical_project_root.const,
    false,
  );
  assert.equal(
    workspaceIndex.$defs.authority_boundary.properties.opl_can_write_domain_truth.const,
    false,
  );
});

test('target operating architecture contract freezes resource, authority, lane, and improvement boundaries', () => {
  const contract = readJson<{
    contract_kind: string;
    schema_version: string;
    design_principles: string[];
    resource_model: {
      resource_shape: {
        required_fields: string[];
        spec_status_split_required: boolean;
        status_can_define_desired_state: boolean;
      };
      resource_kinds: Array<{ kind: string; owner: string; default_lane: string }>;
    };
    stage_transition_authority: {
      single_writer: boolean;
      event_log_policy: string;
      derived_state: string[];
      forbidden_direct_writers: string[];
    };
    domain_pack_authority_abi: {
      default_agent_shape: string;
      domain_pack_must_declare: string[];
      opl_generated_or_hosted_surfaces: string[];
      authority_functions: string[];
    };
    surface_budget_compiler_policy: {
      ordinary_path_root: string;
      small_detail_default_lanes: string[];
      hard_blocker_upgrade_conditions: string[];
      ordinary_path_must_not_be_overridden_by: string[];
      accepted_owner_answer_shapes: string[];
    };
    reconciler_model: {
      required_loops: string[];
      loop_authority_boundary: Record<string, boolean>;
      substrate_policy: {
        temporal_role: string;
        worker_supervisor_role: string;
        progress_reconciler_role: string;
        false_authority_boundary: string;
      };
    };
    catalog_and_telemetry: {
      atlas_catalogs: string[];
      vault_ref_streams: string[];
      vault_policy: string;
      telemetry_body_policy: string;
    };
    app_console_policy: {
      default_screen_fields: string[];
      drilldown_only_fields: string[];
      gui_truth_owner: string;
      framework_role: string;
    };
    agent_lab_improvement_plane: {
      role: string;
      may_produce: string[];
      must_not_produce: string[];
    };
    foundry_agent_os_standard: {
      pattern_id: string;
      source_pattern_ref: string;
      target_shape: string;
      applies_to_domain_agents: string[];
      domain_pack_examples: Record<string, string>;
      domain_authority_kernel_examples: Record<string, string[]>;
      opl_module_mapping: Array<{
        target_capability: string;
        primary_module: string;
        supporting_modules: string[];
        ordinary_lane: string;
        authority_boundary: string;
      }>;
      capability_registry_boundary: {
        owner_modules: string[];
        default_behavior: string;
        resolver_abi_ref: string;
        selector_helper_ref: string;
        fail_open_policy: string;
        optional_ref_missing_default: string;
        route_required_ref_missing: string;
        must_not_create: string[];
      };
      cross_agent_conformance_required_claims: string[];
      implementation_lane_refs: string[];
      authority_boundary: Record<string, boolean>;
      forbidden_claims: string[];
    };
    authority_boundary: Record<string, boolean>;
    forbidden_claims: string[];
  }>('contracts/opl-framework/target-operating-architecture-contract.json');

  assert.equal(contract.contract_kind, 'opl_target_operating_architecture_contract.v1');
  assert.equal(contract.schema_version, 'target-operating-architecture.v1');
  for (const principle of [
    'grip_big_release_small',
    'current_owner_delta_first',
    'single_writer_stage_transition_authority',
    'declarative_domain_pack_generated_surfaces_authority_abi',
    'passive_evidence_vault',
    'one_ordinary_golden_path_per_agent',
    'small_idempotent_reconcilers',
    'app_console_thin_default_surface',
    'agent_lab_refs_only_improvement_control_plane',
    'runway_control_loop_runtime_module',
  ]) {
    assert.equal(contract.design_principles.includes(principle), true, principle);
  }

  assert.deepEqual(contract.resource_model.resource_shape.required_fields, [
    'apiVersion',
    'kind',
    'metadata',
    'spec',
    'status',
    'conditions',
    'ownerRefs',
    'finalizers',
  ]);
  assert.equal(contract.resource_model.resource_shape.spec_status_split_required, true);
  assert.equal(contract.resource_model.resource_shape.status_can_define_desired_state, false);
  assert.deepEqual(contract.resource_model.resource_kinds.map((entry) => entry.kind), [
    'Agent',
    'DomainPack',
    'WorkspaceGroup',
    'ProjectUnit',
    'StageRun',
    'StageArtifactUnit',
    'OwnerAnswer',
    'EvidenceRef',
    'ReleaseCohort',
    'ImprovementWorkOrder',
    'RunwayControlLoop',
    'ProgressReconciler',
  ]);
  assert.equal(
    contract.resource_model.resource_kinds.find((entry) => entry.kind === 'EvidenceRef')?.default_lane,
    'audit',
  );
  assert.equal(
    contract.resource_model.resource_kinds.find((entry) => entry.kind === 'ReleaseCohort')?.default_lane,
    'production_evidence',
  );

  assert.equal(contract.stage_transition_authority.single_writer, true);
  assert.equal(contract.stage_transition_authority.event_log_policy, 'append_only_authority_event_log');
  assert.deepEqual(contract.stage_transition_authority.derived_state, [
    'stage_current_pointer',
    'stage_run_terminal_state',
    'current_owner_delta',
    'runway_control_loop_status',
    'progress_reconciler_projection',
  ]);
  for (const forbiddenWriter of [
    'domain_agent',
    'runtime_provider',
    'one_person_lab_app',
    'agent_lab',
    'read_model',
    'evidence_vault',
    'worklist',
    'runway_control_loop',
    'progress_reconciler',
    'worker_supervisor',
    'temporal_workflow_history',
  ]) {
    assert.equal(contract.stage_transition_authority.forbidden_direct_writers.includes(forbiddenWriter), true);
  }

  assert.equal(
    contract.domain_pack_authority_abi.default_agent_shape,
    'declarative_domain_pack_plus_opl_generated_hosted_surfaces_plus_standard_authority_functions',
  );
  for (const requiredDeclaration of [
    'stage_graph',
    'ordinary_golden_path',
    'tool_affordance_boundary_refs',
    'quality_gate_refs',
    'owner_answer_schema',
    'authority_functions',
  ]) {
    assert.equal(contract.domain_pack_authority_abi.domain_pack_must_declare.includes(requiredDeclaration), true);
  }
  for (const generatedSurface of ['cli', 'mcp', 'product_entry', 'openai_tool', 'ai_sdk', 'workbench']) {
    assert.equal(contract.domain_pack_authority_abi.opl_generated_or_hosted_surfaces.includes(generatedSurface), true);
  }
  for (const authorityFunction of [
    'quality_or_export_verdict',
    'artifact_authority',
    'memory_accept_reject',
    'owner_receipt_signer',
    'typed_blocker_signer',
  ]) {
    assert.equal(contract.domain_pack_authority_abi.authority_functions.includes(authorityFunction), true);
  }

  assert.equal(contract.surface_budget_compiler_policy.ordinary_path_root, 'current_owner_delta');
  assert.deepEqual(contract.surface_budget_compiler_policy.small_detail_default_lanes, [
    'advisory',
    'audit',
    'diagnostic',
    'cleanup',
    'production_evidence',
  ]);
  assert.equal(contract.surface_budget_compiler_policy.hard_blocker_upgrade_conditions.includes('authority_violation'), true);
  assert.equal(contract.surface_budget_compiler_policy.hard_blocker_upgrade_conditions.includes('irreversible_mutation'), true);
  assert.deepEqual(contract.surface_budget_compiler_policy.accepted_owner_answer_shapes, [
    'owner_receipt_ref',
    'domain_owner_receipt_ref',
    'quality_gate_receipt_ref',
    'human_gate_ref',
    'typed_blocker_ref',
    'no_regression_ref',
    'long_soak_ref',
    'route_back_ref',
    'route_back_evidence_ref',
    'physical_delete_authorization_ref',
    'keep_as_authority_adapter_ref',
  ]);
  for (const forbiddenOverride of [
    'raw_worklist',
    'evidence_ledger',
    'provider_trace',
    'route_variant_menu',
    'cleanup_delete_gate',
    'release_diagnostics',
  ]) {
    assert.equal(
      contract.surface_budget_compiler_policy.ordinary_path_must_not_be_overridden_by.includes(forbiddenOverride),
      true,
      forbiddenOverride,
    );
  }

  assert.deepEqual(contract.reconciler_model.required_loops, [
    'recovery_repair',
    'handoff_gate',
    'progress_reconciliation',
    'runtime_intent_admission',
    'admission',
    'execution_authorization',
    'provider_attempt',
    'closeout_binding',
    'owner_answer_intake',
    'evidence_verify',
    'cleanup_finalizer',
    'release_cohort_verify',
  ]);
  for (const [claim, allowed] of Object.entries(contract.reconciler_model.loop_authority_boundary)) {
    assert.equal(allowed, false, `reconciler must not claim ${claim}`);
  }
  assert.equal(
    contract.reconciler_model.substrate_policy.temporal_role,
    'durable_workflow_history_activity_heartbeat_visibility_and_retry_substrate_only',
  );
  assert.equal(
    contract.reconciler_model.substrate_policy.worker_supervisor_role,
    'process_liveness_restart_and_host_health_only',
  );
  assert.equal(
    contract.reconciler_model.substrate_policy.progress_reconciler_role,
    'semantic_execution_loop_desired_current_reconciliation_and_next_owner_projection',
  );

  assert.equal(contract.catalog_and_telemetry.atlas_catalogs.includes('contracts'), true);
  assert.equal(contract.catalog_and_telemetry.atlas_catalogs.includes('release_channels'), true);
  assert.equal(contract.catalog_and_telemetry.vault_ref_streams.includes('artifact_lineage_refs'), true);
  assert.equal(contract.catalog_and_telemetry.vault_policy, 'record_everything_plan_from_nothing');
  assert.equal(contract.catalog_and_telemetry.telemetry_body_policy, 'refs_only_no_artifact_or_memory_body');

  assert.deepEqual(contract.app_console_policy.default_screen_fields, [
    'task',
    'stage',
    'current_owner',
    'next_action',
    'running_or_blocked_status',
    'artifact_or_blocker',
    'accepted_answer_shape',
  ]);
  for (const drilldownField of ['provider_trace', 'attempt_ledger', 'release_diagnostics', 'raw_evidence']) {
    assert.equal(contract.app_console_policy.drilldown_only_fields.includes(drilldownField), true);
  }
  assert.equal(contract.app_console_policy.gui_truth_owner, 'one-person-lab-app');
  assert.equal(contract.app_console_policy.framework_role, 'state_action_projection_producer_only');

  assert.equal(contract.agent_lab_improvement_plane.role, 'refs_only_improvement_control_plane');
  assert.equal(contract.agent_lab_improvement_plane.may_produce.includes('work_order_ref'), true);
  assert.equal(contract.agent_lab_improvement_plane.may_produce.includes('promotion_proposal_ref'), true);
  for (const forbiddenOutput of [
    'domain_quality_verdict',
    'artifact_authority',
    'memory_body',
    'owner_receipt',
    'typed_blocker',
    'production_acceptance',
  ]) {
    assert.equal(contract.agent_lab_improvement_plane.must_not_produce.includes(forbiddenOutput), true);
  }

  assert.equal(contract.foundry_agent_os_standard.pattern_id, 'foundry_agent_os_standard.v1');
  assert.equal(
    contract.foundry_agent_os_standard.target_shape,
    'OPL Agent OS + Domain Declarative Pack + Domain Minimal Authority Kernel + Domain Capability Registry',
  );
  assert.deepEqual(contract.foundry_agent_os_standard.applies_to_domain_agents, ['mas', 'mag', 'rca', 'oma']);
  assert.equal(contract.foundry_agent_os_standard.domain_pack_examples.mas, 'Medical Research Pack');
  assert.equal(
    contract.foundry_agent_os_standard.domain_authority_kernel_examples.mag.includes('fundability quality/export verdict'),
    true,
  );
  assert.deepEqual(
    contract.foundry_agent_os_standard.capability_registry_boundary.owner_modules,
    ['atlas', 'pack', 'stagecraft'],
  );
  assert.equal(
    contract.foundry_agent_os_standard.capability_registry_boundary.default_behavior,
    'current_owner_delta_bound_jit_or_fail_open',
  );
  assert.equal(
    contract.foundry_agent_os_standard.capability_registry_boundary.resolver_abi_ref,
    'contracts/opl-framework/capability-registry-resolver.schema.json',
  );
  assert.equal(
    contract.foundry_agent_os_standard.capability_registry_boundary.selector_helper_ref,
    'src/capability-registry-resolver.ts',
  );
  assert.equal(
    contract.foundry_agent_os_standard.capability_registry_boundary.optional_ref_missing_default,
    'advisory_or_audit',
  );
  assert.equal(
    contract.foundry_agent_os_standard.capability_registry_boundary.route_required_ref_missing,
    'typed_blocker_candidate_only_from_current_owner_delta_hard_boundary',
  );
  for (const forbiddenCreation of ['domain authority verdict', 'owner receipt', 'typed blocker']) {
    assert.equal(
      contract.foundry_agent_os_standard.capability_registry_boundary.must_not_create.includes(forbiddenCreation),
      true,
    );
  }
  for (const requiredCapability of [
    'pack_compiler_generated_surfaces',
    'domain_capability_registry',
    'current_owner_delta_default_read_root',
    'stage_run_durable_execution',
    'refs_only_evidence_and_lineage',
  ]) {
    assert.equal(
      contract.foundry_agent_os_standard.opl_module_mapping.some((entry) =>
        entry.target_capability === requiredCapability
      ),
      true,
      requiredCapability,
    );
  }
  for (const requiredClaim of [
    'default_read_root_is_current_owner_delta',
    'domain_authority_false_flags_on_opl_modules',
    'generated_surfaces_do_not_write_domain_truth',
    'conformance_pass_does_not_claim_domain_ready',
    'vault_console_runway_do_not_sign_owner_answer',
    'capability_registry_fails_open_unless_current_delta_requires_ref',
  ]) {
    assert.equal(
      contract.foundry_agent_os_standard.cross_agent_conformance_required_claims.includes(requiredClaim),
      true,
      requiredClaim,
    );
  }
  for (const [claim, allowed] of Object.entries(contract.foundry_agent_os_standard.authority_boundary)) {
    assert.equal(allowed, false, `foundry agent OS standard must not claim ${claim}`);
  }
  for (const forbiddenClaim of [
    'agent_os_contract_is_domain_ready',
    'capability_registry_owns_domain_authority',
    'pack_compile_is_quality_verdict',
    'generated_surface_writes_domain_truth',
    'current_owner_delta_projection_signs_owner_answer',
    'vault_ref_is_owner_receipt_authority',
    'runway_provider_completion_is_domain_completion',
    'console_view_is_app_release_ready',
  ]) {
    assert.equal(
      contract.foundry_agent_os_standard.forbidden_claims.includes(forbiddenClaim),
      true,
      forbiddenClaim,
    );
  }

  for (const [claim, allowed] of Object.entries(contract.authority_boundary)) {
    assert.equal(allowed, false, `target architecture must not claim ${claim}`);
  }
  assert.equal(contract.forbidden_claims.includes('contract_validation_is_domain_ready'), true);
  assert.equal(contract.forbidden_claims.includes('cleanup_lane_is_physical_delete_authority'), true);
});

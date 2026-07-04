import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseJsonText } from '../../src/kernel/json-file.ts';

import './target-architecture-schema-contracts-cases/target-operating-architecture.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function readJson<T>(relativePath: string): T {
  return parseJsonText(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as T;
}

test('target architecture schema contracts keep owner delta root and audit tail boundaries machine-readable', () => {
  const schemaPaths = [
    'contracts/opl-framework/current-owner-delta.schema.json',
    'contracts/opl-framework/stage-manifest.schema.json',
    'contracts/opl-framework/role-artifact-ref.schema.json',
    'contracts/opl-framework/stage-owner-receipt.schema.json',
    'contracts/opl-framework/stage-typed-blocker.schema.json',
    'contracts/opl-framework/stage-artifact-unit.schema.json',
    'contracts/opl-framework/progress-delta-receipt.schema.json',
    'contracts/opl-framework/domain-progress-transition-runtime-live-readback.schema.json',
    'contracts/opl-framework/owner-answer.schema.json',
    'contracts/opl-framework/evidence-ledger-event.schema.json',
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
    ownerDelta.properties.evidence_ledger_policy.const,
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
    ownerDelta.properties.progress_delta_receipt.properties.schema_ref.const,
    'contracts/opl-framework/progress-delta-receipt.schema.json',
  );
  assert.equal(
    ownerDelta.properties.progress_delta_receipt.properties.stage_transition_requires_owner_receipt_or_typed_blocker.const,
    true,
  );
  assert.equal(
    ownerDelta.properties.progress_delta_receipt.properties.authority_boundary.properties
      .can_authorize_stage_complete.const,
    false,
  );
  assert.equal(
    ownerDelta.properties.progress_delta_receipt.properties.authority_boundary.properties
      .can_sign_owner_receipt.const,
    false,
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

  const evidenceLedger = schemas['contracts/opl-framework/evidence-ledger-event.schema.json'];
  assert.equal(
    evidenceLedger.properties.ledger_policy.const,
    'record_everything_plan_from_nothing',
  );
  assert.equal(
    evidenceLedger.$defs.authority_boundary.properties.event_can_create_default_action_without_delta.const,
    false,
  );
  assert.equal(evidenceLedger.$defs.authority_boundary.properties.raw_worklist_can_drive_default_planning.const, false);
  assert.equal(evidenceLedger.$defs.authority_boundary.properties.raw_evidence_can_drive_default_planning.const, false);
  assert.equal(evidenceLedger.$defs.authority_boundary.properties.replay_packet_can_drive_default_planning.const, false);
  assert.equal(
    evidenceLedger.$defs.authority_boundary.properties.typed_blocker_group_can_drive_default_planning.const,
    false,
  );
  assert.equal(
    evidenceLedger.$defs.authority_boundary.properties.private_residue_inventory_can_drive_default_planning.const,
    false,
  );
  assert.equal(evidenceLedger.$defs.authority_boundary.properties.opl_can_write_domain_truth.const, false);

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
  assert.deepEqual(capabilityResolver.$defs.domain_pack_external_learning_ref.required, [
    'capability_ref',
    'source_family',
    'work_unit_ref',
  ]);
  assert.equal(
    capabilityResolver.$defs.domain_pack_external_learning_ref.properties.binding_kind.enum.includes('optional'),
    true,
  );
  assert.equal(
    capabilityResolver.$defs.domain_pack_external_learning_ref.properties.binding_kind.enum.includes('route_required'),
    true,
  );
  assert.equal(
    capabilityResolver.$defs.capability_registry_readout.properties.surface_kind.const,
    'opl_capability_registry_readout',
  );
  assert.equal(
    capabilityResolver.$defs.capability_registry_readout.properties.default_behavior.const,
    'current_owner_delta_bound_jit_or_fail_open',
  );
  assert.equal(
    capabilityResolver.$defs.capability_registry_readout.properties.domain_pack_external_learning_refs.required.includes(
      'fail_open_count',
    ),
    true,
  );
  assert.equal(
    capabilityResolver.$defs.capability_registry_readout.properties.domain_local_selector_created.const,
    false,
  );
  assert.equal(
    capabilityResolver.$defs.capability_registry_readout.properties.always_on_sidecar_created.const,
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
  assert.equal(stopLoss.required.includes('repeat_budget'), true);
  assert.equal(stopLoss.properties.repeat_budget.properties.repeat_threshold.minimum, 1);
  assert.deepEqual(stopLoss.properties.repeat_budget.properties.matched_on.enum, ['action_type', 'default']);
  assert.equal(
    stopLoss.properties.terminal_blocker_code.enum.includes('anti_loop_budget_exhausted'),
    true,
  );
  assert.equal(stopLoss.properties.successor_policy.properties.same_work_unit_redrive_allowed.const, false);
  assert.equal(stopLoss.properties.successor_policy.properties.identity_different_successor_allowed.const, true);
  assert.equal(
    stopLoss.properties.successor_policy.properties.default_successor_action_type.const,
    'publishability_repair_sprint',
  );

  const currentOwnerDelta = schemas['contracts/opl-framework/current-owner-delta.schema.json'];
  assert.equal(
    currentOwnerDelta.properties.stop_loss_state.properties.successor_admission.properties.same_work_unit_redrive_allowed.const,
    false,
  );
  assert.equal(
    currentOwnerDelta.properties.stop_loss_state.properties.successor_admission.properties.preferred_successor.properties.action_type.const,
    'publishability_repair_sprint',
  );
  assert.equal(
    currentOwnerDelta.properties.stop_loss_state.properties.successor_admission.properties.authority_boundary.properties.can_create_owner_receipt.const,
    false,
  );

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

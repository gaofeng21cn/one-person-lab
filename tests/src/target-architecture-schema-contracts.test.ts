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
  assert.equal(workspaceTopology.properties.schema_version.const, 'workspace-topology-profile.v1');
  assert.deepEqual(workspaceTopology.properties.workspace_mode.enum, ['one_off', 'series', 'portfolio']);
  assert.equal(workspaceTopology.properties.project_stage_outputs_root.const, 'artifacts/stage_outputs');
  assert.equal(workspaceTopology.required.includes('workspace_groups'), true);
  assert.equal(workspaceTopology.required.includes('default_user_inspection_surface'), true);
  assert.equal(workspaceTopology.required.includes('runtime_state_boundary'), true);
  assert.equal(
    workspaceTopology.properties.default_user_inspection_surface.properties.stage_native_default_path.const,
    'artifacts/stage_outputs',
  );
  assert.equal(
    workspaceTopology.properties.default_user_inspection_surface.properties.runtime_state_is_default_user_surface.const,
    false,
  );
  assert.equal(
    workspaceTopology.properties.runtime_state_boundary.properties.runtime_state_can_be_canonical_project_root.const,
    false,
  );
  assert.equal(
    workspaceTopology.properties.runtime_state_boundary.properties.runtime_state_can_close_stage.const,
    false,
  );
  assert.equal(
    workspaceTopology.properties.runtime_state_boundary.properties
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
    workspaceTopology.examples[0].workspace_mode,
    'portfolio',
  );
  assert.equal(
    workspaceTopology.examples[1].workspace_mode,
    'series',
  );
});

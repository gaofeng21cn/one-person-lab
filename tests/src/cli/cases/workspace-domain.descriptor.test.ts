import { assert, buildManifestCommand, createFamilyContractsFixtureRoot, fs, loadFamilyManifestFixtures, os, path, repoRoot, runCli, test } from '../helpers.ts';
import { createOmaContractFixture } from './runtime-app-operator-drilldown-helpers.ts';
import {
  assertAuditOnlySourcePurityTail,
  assertOmaDescriptorProjection,
} from './workspace-domain-descriptor-assertions.ts';
import './workspace-domain.descriptor-cases/missing-optional-surfaces.ts';
import { insertFreshProviderProof } from './workspace-domain-descriptor-provider-proof.ts';
import { attachManifestSurface } from './workspace-domain-test-helper.ts';

type JsonRecord = Record<string, any>;

function withStandardSkeleton(payload: JsonRecord, agentId: string) {
  return attachManifestSurface(
    attachManifestSurface(payload, 'standard_domain_agent_skeleton', {
      surface_kind: 'standard_domain_agent_skeleton',
      version: 'standard-domain-agent-skeleton.v1',
      agent_id: agentId,
      repo_source_boundary: { required_dirs: ['agent', 'contracts', 'runtime', 'docs'], forbidden_dirs: ['artifacts'] },
      contracts: {
        descriptor_refs: ['contracts/domain-agent.json'],
        sidecar_refs: ['runtime/sidecar.ts'],
        quality_gate_refs: ['contracts/quality-gates.json'],
      },
      artifact_boundary: {
        repo_contains_real_artifacts: false,
        artifact_roots_are_locators: true,
        workspace_artifact_locator_refs: ['workspace:/artifacts'],
        runtime_artifact_locator_refs: ['runtime:/receipts'],
      },
      authority_boundary: { opl: 'framework_transport_and_projection_only', domain: 'truth_quality_artifact_owner' },
    }),
    'physical_skeleton_follow_through',
    {
      surface_kind: 'physical_skeleton_follow_through',
      status: 'low_risk_repo_source_follow_through_landed',
      physical_roots: ['agent', 'contracts', 'runtime', 'docs'].map((boundary_id) => ({
        boundary_id,
        anchor_ref: boundary_id === 'docs' ? 'docs/status.md' : `${boundary_id}/README.md`,
        status: 'present_with_repo_source_entrypoint',
      })),
      forbidden_moves: ['workspace_runtime_artifacts', 'receipt_instances', 'memory_content_body'],
      direct_skill_parity_refs: [`proof:${agentId}:direct-skill-parity`],
      opl_hosted_parity_refs: [`proof:${agentId}:opl-hosted-parity`],
      replacement_parity_refs: [`proof:${agentId}:replacement-parity`],
      provenance_refs: [`docs/history/runtime-substrate/${agentId}-legacy-tombstone.md`],
      legacy_active_path_policy: 'physically_removed_or_history_tombstone_only',
      legacy_active_path_residue: [{
        path_family: `${agentId} legacy default path`,
        state: 'tombstone_only',
        evidence_ref: `docs/history/runtime-substrate/${agentId}-legacy-tombstone.md`,
      }],
    },
  );
}

function withActionCatalog(payload: JsonRecord, targetDomainId: string, owner: string, actionId: string) {
  return attachManifestSurface(payload, 'family_action_catalog', {
    surface_kind: 'family_action_catalog',
    version: 'family-action-catalog.v1',
    catalog_id: `${targetDomainId.replace(/[^a-z0-9]+/gi, '_')}_action_catalog`,
    target_domain_id: targetDomainId,
    owner,
    authority_boundary: { opl_role: 'descriptor_projection_only', domain_truth_owner: owner },
    actions: [{
      action_id: actionId,
      title: actionId,
      summary: `Run ${actionId}.`,
      owner,
      effect: 'mutating',
      source_command: { command: `${owner} ${actionId}`, surface_kind: 'domain_cli' },
      input_schema_ref: 'contracts/input.schema.json',
      output_schema_ref: 'contracts/output.schema.json',
      workspace_locator_fields: ['workspace_root'],
      human_gate_ids: [],
      supported_surfaces: { cli: { command: `${owner} ${actionId}`, surface_kind: 'domain_cli' }, mcp: null, skill: null, product_entry: null, openai: null, ai_sdk: null },
    }],
    notes: [],
  });
}

function withStageControlPlane(payload: JsonRecord, targetDomainId: string, owner: string, stageId: string, actionId: string) {
  return attachManifestSurface(payload, 'family_stage_control_plane', {
    surface_kind: 'family_stage_control_plane',
    version: 'family-stage-control-plane.v1',
    plane_id: `${targetDomainId.replace(/[^a-z0-9]+/gi, '_')}_stage_plane`,
    target_domain_id: targetDomainId,
    owner,
    authority_boundary: { domain_truth_owner: owner, opl_role: 'projection_consumer_only' },
    stages: [{
      stage_id: stageId,
      stage_kind: 'creation',
      title: stageId,
      summary: `${stageId} stage descriptor.`,
      goal: `Expose ${stageId} as a family descriptor.`,
      owner,
      domain_stage_refs: [stageId],
      inputs: [],
      knowledge_refs: [{ ref_kind: 'domain_memory_ref', ref: `${targetDomainId}.domain_memory`, role: 'domain_owned_memory_locator' }],
      skills: [],
      prompt_refs: [],
      allowed_action_refs: [actionId],
      outputs: [],
      evaluation: [],
      handoff: null,
      source_refs: [],
      authority_boundary: { domain_truth_owner: owner, opl_role: 'projection_consumer_only' },
    }],
    notes: [],
  });
}

function withMemoryDescriptor(payload: JsonRecord, targetDomainId: string, owner: string, memoryRefId: string, family: string) {
  return attachManifestSurface(payload, 'domain_memory_descriptor', {
    surface_kind: 'family_domain_memory_ref',
    version: 'family-domain-memory-ref.v1',
    memory_ref_id: memoryRefId,
    target_domain_id: targetDomainId,
    owner,
    memory_family: family,
    memory_pack_ref: { ref_kind: 'human_doc', ref: `docs/policies/${memoryRefId}.md`, role: 'markdown_first_memory_policy' },
    stage_applicability: ['idea', 'review'],
    retrieval_contract_ref: { ref_kind: 'surface_kind', ref: 'stage_knowledge_packet' },
    writeback_contract_ref: { ref_kind: 'surface_kind', ref: 'stage_memory_closeout_packet' },
    receipt_contract_ref: { ref_kind: 'surface_kind', ref: 'memory_write_router_receipt' },
    writeback_receipt_locator_ref: { ref_kind: 'workspace_locator', ref: `portfolio/research_memory/${memoryRefId}/writeback_receipts` },
    status: 'active',
    authority_boundary: {
      opl_role: 'locator_projection_owner',
      domain_memory_owner: owner,
      forbidden_opl_authority: ['memory_store_owner', 'domain_truth_owner', 'quality_verdict_owner', 'artifact_authority'],
      can_accept_memory_write: false,
      can_write_domain_truth: false,
      can_authorize_quality_verdict: false,
      can_write_artifacts: false,
    },
  });
}

function withDescriptorSurfaces(payload: JsonRecord, options: {
  agentId: string;
  targetDomainId: string;
  owner: string;
  actionId: string;
  stageId: string;
  memoryRefId: string;
  memoryFamily: string;
}) {
  return withMemoryDescriptor(
    withStageControlPlane(
      withActionCatalog(withStandardSkeleton(payload, options.agentId), options.targetDomainId, options.owner, options.actionId),
      options.targetDomainId,
      options.owner,
      options.stageId,
      options.actionId,
    ),
    options.targetDomainId,
    options.owner,
    options.memoryRefId,
    options.memoryFamily,
  );
}

function withGrantTransitionOracle(payload: JsonRecord) {
  const transitions = [
    ['call_intake_complete_to_fundability_strategy', 'call_and_candidate_intake', 'fundability_strategy', 'call_materials_and_profile_selected', 'intake_handoff_receipt'],
    ['fundability_blocked_to_human_gate', 'fundability_strategy', 'fundability_strategy', 'fundability_blocker_requires_human_gate', 'human_gate_receipt'],
  ];
  return attachManifestSurface(payload, 'grant_transition_oracle', {
    surface_kind: 'mag_grant_transition_oracle',
    version: 'mag-grant-transition-oracle.v1',
    oracle_id: 'mag.grant_transition.oracle.v1',
    target_domain_id: 'med-autogrant',
    owner: 'med-autogrant',
    state: 'domain_spec_landed_external_runner_gate',
    runner_owner: 'one-person-lab',
    runner_contract_ref: 'contracts/opl-framework/family-transition-runner-contract.json',
    transition_table_status: 'landed',
    oracle_fixture_status: 'landed',
    stage_control_plane_ref: '/product_entry_manifest/family_stage_control_plane',
    action_catalog_ref: '/product_entry_manifest/family_action_catalog',
    authority_boundary: { opl_role: 'generic_transition_runner_only', opl_can_write_grant_truth: false },
    transition_table: transitions.map(([transition_id, from_stage_id, to_stage_id, guard_id, receipt_requirement]) => ({
      transition_id,
      from_stage_id,
      to_stage_id,
      guard_id,
      owner_action: 'open_grant_user_loop',
      return_shape: 'domain_owner_receipt',
      receipt_requirement,
      blocked_shape: 'typed_blocker',
    })),
    oracle_fixtures: transitions.map(([transition_id, source_stage_id], index) => ({
      fixture_id: `fixture_${index + 1}`,
      source_stage_id,
      input_state: index === 0 ? { call_materials_status: 'complete' } : { human_gate: 'required' },
      expected_transition_id: transition_id,
    })),
    validation: { status: 'ready_for_opl_runner_ingestion', transition_count: 2, oracle_fixture_count: 2, checked_stage_count: 6, checked_action_count: 5, missing_stage_refs: [], missing_action_refs: [], missing_fixture_transition_refs: [] },
  });
}

function withFunctionalConsumerBoundary(payload: JsonRecord) {
  return attachManifestSurface(payload, 'functional_consumer_boundary', {
    surface_kind: 'mas_functional_consumer_boundary',
    target_domain_id: 'med-autoscience',
    functional_module_inventory: [
      { module_id: 'runtime_lifecycle_sqlite_reference_adapter', classification: 'refs_only_adapter', owner: 'med-autoscience', code_paths: ['src/med_autoscience/runtime_protocol/runtime_lifecycle_store.py'], active_callers: ['medautosci export'], migration_action: 'consume_opl_lifecycle_index_and_keep_domain_receipt_refs_only' },
      { module_id: 'study_stage_policy_pack', classification: 'declarative_pack', owner: 'med-autoscience', code_paths: ['agent/stages'], active_callers: ['OPL pack compiler input'], retained_domain_authority: ['study_stage_policy_pack'] },
      { module_id: 'study_truth', classification: 'minimal_authority_function', owner: 'med-autoscience', code_paths: ['src/med_autoscience/controllers/study_truth_kernel.py'], cannot_absorb_reason: 'Medical study truth and publication route decisions are domain authority, not framework state.' },
      { module_id: 'local_launchd_scheduler_install_path', classification: 'legacy_cleanup_physical_retired', owner: 'none_active', active_caller_allowed: false, tombstone_required: true },
    ],
    functional_surface_classification: {
      refs_only_adapter: ['runtime_lifecycle_sqlite_reference_adapter'],
      declarative_pack_generated_surface: ['study_stage_policy_pack'],
      minimal_authority_function: ['study_truth'],
      legacy_cleanup_no_active_caller_gate: ['local_launchd_scheduler_install_path'],
    },
  });
}

function withPrivatizedFunctionalModuleAudit(payload: JsonRecord) {
  return attachManifestSurface(payload, 'mag_consumer_thinning_contract', {
    privatized_functional_module_audit: {
      surface_kind: 'mag_privatized_functional_module_audit',
      target_domain_id: 'med-autogrant',
      declarative_pack_surfaces: [{ module_id: 'grant_stage_policy_pack', classification: 'declarative_pack_surface', owner: 'med-autogrant', code_paths: ['agent/stages'] }],
      refs_only_adapter_surfaces: [{ module_id: 'session_ledger_attention_queue', classification: 'refs_only_adapter', owner: 'med-autogrant', code_paths: ['src/med_autogrant/product_entry_parts/consumer_thinning.py'] }],
      mag_owned_grant_authority_surfaces: [{ module_id: 'fundability_quality_export_verdicts', classification: 'minimal_authority_function', owner: 'med-autogrant' }],
      retire_or_tombstone_surfaces: [{ module_id: 'grant_sidecar_status_shell', classification: 'legacy_proof_tombstone', owner: 'none_active' }],
      opl_must_absorb_code_surfaces: ['operator_workbench_shell'],
    },
  });
}

function withRcaFunctionalAudit(payload: JsonRecord) {
  return attachManifestSurface(payload, 'privatized_functional_module_audit', {
    surface_kind: 'rca_privatized_functional_module_audit',
    target_domain_id: 'redcube_ai',
    modules: [
      { module_id: 'native_helper_envelope_wrapper', migration_class: 'opl_hosted_surface', classification: 'opl_hosted_surface', owner: 'redcube_ai', activeCallers: ['RCA product domain handler guarded actions'] },
      { module_id: 'artifact_gallery_handoff_shell', migration_class: 'refs_only_adapter', classification: 'refs_only_adapter', owner: 'redcube_ai', surface_ref: '/artifact_locator_contract' },
      { module_id: 'visual_stage_policy_pack', classification: 'declarative_pack', owner: 'redcube_ai', codePaths: ['agent/stages'] },
      { module_id: 'visual_review_export_verdict', classification: 'minimal_authority_function', owner: 'redcube_ai', cannot_absorb_reason: 'OPL cannot authorize visual direction, review verdict, export verdict, or canonical artifact authority.' },
    ],
    opl_owned_generic_primitives: ['native_helper_generic_envelope', 'artifact_lifecycle'],
  });
}

function moduleById(descriptor: JsonRecord, moduleId: string) {
  return descriptor.functional_privatization_audit.modules.find((module: JsonRecord) => module.module_id === moduleId);
}

test('unified domain-agent descriptors aggregate descriptor surfaces without owning domain truth', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-agent-descriptor-state-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const omaRepoDir = createOmaContractFixture(fixtureRoot);
  const env = { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot, OPL_META_AGENT_REPO_DIR: omaRepoDir };
  const fixtures = loadFamilyManifestFixtures();
  const manifests = {
    medautoscience: withFunctionalConsumerBoundary(withDescriptorSurfaces(fixtures.medautoscience, {
      agentId: 'mas',
      targetDomainId: 'med-autoscience',
      owner: 'MedAutoScience',
      actionId: 'stage_knowledge_packet',
      stageId: 'idea',
      memoryRefId: 'mas_publication_route_memory',
      memoryFamily: 'publication_route_memory',
    })),
    medautogrant: withGrantTransitionOracle(withPrivatizedFunctionalModuleAudit(withDescriptorSurfaces(fixtures.medautogrant, {
      agentId: 'mag',
      targetDomainId: 'med-autogrant',
      owner: 'MedAutoGrant',
      actionId: 'grant_strategy_packet',
      stageId: 'revision',
      memoryRefId: 'mag_grant_strategy_memory',
      memoryFamily: 'grant_strategy_memory',
    }))),
    redcube: withRcaFunctionalAudit(withDescriptorSurfaces(fixtures.redcube, {
      agentId: 'rca',
      targetDomainId: 'redcube_ai',
      owner: 'RedCubeAI',
      actionId: 'visual_pattern_packet',
      stageId: 'artifact_creation',
      memoryRefId: 'rca_visual_pattern_memory',
      memoryFamily: 'visual_pattern_memory',
    })),
  };

  try {
    runCli(['family-runtime', 'events', 'export'], { OPL_STATE_DIR: stateRoot });
    insertFreshProviderProof(stateRoot);
    for (const [project, manifest] of Object.entries(manifests)) {
      runCli(['workspace', 'bind', '--project', project, '--path', repoRoot, '--manifest-command', buildManifestCommand(manifest)], env);
    }

    const summary = runCli(['agents', 'descriptors'], env).family_agent_descriptors.summary;
    assert.equal(summary.total_projects_count, 4);
    assert.equal(summary.descriptor_surfaces_resolved_count, 4);
    assert.equal(summary.memory_descriptor_resolved_count, 4);
    assert.equal(summary.stage_control_plane_resolved_count, 4);
    assert.equal(summary.action_catalog_resolved_count, 4);
    assert.equal(summary.provider_temporal_residency_gap_status, 'closed_by_fresh_proven_proof');
    assert.equal(summary.functional_privatization_audit_resolved_count, 4);
    assert.equal(summary.functional_privatization_active_private_generic_residue_count, 0);
    assert.equal(summary.functional_privatization_default_watchlist_count, 0);
    assertAuditOnlySourcePurityTail(
      summary.functional_privatization_source_purity_tail_read_model,
      { hiddenClearedCount: summary.functional_privatization_default_hidden_cleared_count, privateResidueCount: summary.functional_privatization_private_platform_residue_inventory_count },
    );

    const mas = runCli(['agents', 'descriptor', '--domain', 'mas'], env).family_agent_descriptor;
    assert.equal(mas.descriptor_status, 'descriptor_surfaces_resolved');
    assert.equal(mas.entry.agent_id, 'mas');
    assert.equal(mas.standard_domain_agent_skeleton.physical_skeleton_follow_through_gate.delete_gate.can_execute_domain_physical_delete, false);
    assert.equal(mas.family_action_catalog.action_count, 1);
    assert.equal(mas.family_stage_control_plane.stage_count, 1);
    assert.equal(mas.domain_memory_descriptor.memory_ref_id, 'mas_publication_route_memory');
    assert.equal(mas.functional_privatization_audit.status, 'resolved');
    assert.equal(mas.functional_privatization_audit.summary.default_watchlist_count, 0);
    assert.equal(moduleById(mas, 'runtime_lifecycle_sqlite_reference_adapter').migration_class, 'refs_only_domain_adapter');
    assert.equal(moduleById(mas, 'study_truth').migration_class, 'minimal_authority_function');
    assert.equal(mas.non_authority_flags.opl_owns_domain_memory_body, false);
    assert.equal(mas.non_authority_flags.opl_authorizes_publication_or_fundability_verdict, false);

    const mag = runCli(['agents', 'descriptor', '--domain', 'mag'], env).family_agent_descriptor;
    assert.equal(mag.grant_transition_oracle.status, 'resolved');
    assert.equal(mag.grant_transition_oracle.transition_count, 2);
    assert.equal(mag.grant_transition_oracle.ingestion.matrix.summary.transition_applied, 2);
    assert.equal(mag.grant_transition_oracle.authority_boundary.opl_can_write_grant_truth, false);
    assert.equal(moduleById(mag, 'session_ledger_attention_queue').migration_class, 'refs_only_domain_adapter');
    assert.equal(moduleById(mag, 'fundability_quality_export_verdicts').migration_class, 'minimal_authority_function');

    const rca = runCli(['agents', 'descriptor', '--domain', 'rca'], env).family_agent_descriptor;
    assert.equal(rca.functional_privatization_audit.status, 'resolved');
    assert.equal(moduleById(rca, 'native_helper_envelope_wrapper').migration_class, 'opl_hosted_surface');
    assert.equal(moduleById(rca, 'visual_review_export_verdict').migration_class, 'minimal_authority_function');
    assert.equal(rca.functional_privatization_audit.authority_boundary.opl_can_write_domain_truth, false);

    assertOmaDescriptorProjection(runCli(['agents', 'descriptor', '--domain', 'oma'], env));
    assert.equal(runCli(['agents', 'descriptor', '--domain', 'opl-meta-agent'], env).family_agent_descriptor.project_id, 'opl-meta-agent');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

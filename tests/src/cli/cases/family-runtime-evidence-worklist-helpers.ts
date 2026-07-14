import {
  STANDARD_PROGRESS_DELTA_POLICY,
  STANDARD_TYPED_BLOCKER_LINEAGE_POLICY,
} from '../../../../src/modules/foundry-lab/standard-domain-agent-scaffold-constants.ts';

export function familyRuntimeEnv(
  stateRoot: string,
  fixtureContractsRoot: string,
  extra: Record<string, string> = {},
) {
  return {
    OPL_STATE_DIR: stateRoot,
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
    ...extra,
  };
}

const defaultCallerSurfaces = [
  ['cli', 'agent/cli.ts', 'domain_handler_target', 'opl_generated_command_surface'],
  ['mcp', 'agent/mcp.ts', 'domain_handler_target', 'opl_generated_mcp_descriptor_surface'],
  ['skill', 'agent/skills/domain_execution.md', 'domain_handler_target', 'opl_generated_skill_descriptor_surface'],
  ['product_entry_manifest', 'agent/product-entry.ts', 'domain_handler_target', 'opl_generated_product_entry_surface'],
  ['status_read_model', 'agent/status.ts', 'domain_projection_refs', 'opl_generated_status_read_model_surface'],
  ['domain_handler', 'runtime/domain-handler.ts', 'domain_handler_target', 'opl_generated_domain_handler_handoff_surface'],
  ['workbench_drilldown', 'runtime/workbench.ts', 'projection_refs', 'opl_hosted_workbench_shell_consuming_domain_refs'],
] as const;

function evidenceWorklistStage(stageId: string, owner: string) {
  return {
    stage_id: stageId,
    stage_kind: 'creation',
    title: stageId,
    summary: null,
    goal: `Produce ${stageId} refs under domain authority.`,
    owner,
    domain_stage_refs: [stageId],
    inputs: [],
    knowledge_refs: [],
    skills: [],
    prompt_refs: [],
    allowed_action_refs: [],
    outputs: [],
    evaluation: [],
    handoff: null,
    source_refs: [],
    freshness: null,
    action_parity: null,
    stage_contract: {
      requires: [`${stageId}:input_ready`],
      ensures: [`${stageId}:output_ready`],
      boundary_assumptions: ['domain_truth_remains_domain_owned'],
      properties: [],
      progress_delta_policy: STANDARD_PROGRESS_DELTA_POLICY,
      typed_blocker_lineage_policy: STANDARD_TYPED_BLOCKER_LINEAGE_POLICY,
      runtime_event_refs: [`runtime_event:${stageId}.owner_receipt_recorded`],
      runtime_assumptions: [],
      monitor_refs: [{ ref_kind: 'metric_ref', ref: `metric:${stageId}:freshness`, role: 'monitor' }],
      source_scope_refs: [{ ref_kind: 'source_ref', ref: `source:${stageId}`, role: 'source_scope' }],
      cohort_query_refs: [],
      trigger_refs: [],
      metric_refs: [],
      dashboard_metric_refs: [],
      artifact_scope_refs: [],
      workspace_scope_refs: [],
    },
    trust_boundary: {
      lane: 'domain_agent',
      static_check_eligible: false,
      effect_boundary: true,
      records_runtime_events: true,
      runtime_event_refs: [`runtime_event:${stageId}.owner_receipt_recorded`],
      owner_receipt_required: true,
    },
    authority_boundary: {
      opl_role: 'projection_consumer_only',
      expected_receipt_refs: [`owner_receipt:${stageId}`],
      can_write_domain_truth: false,
      can_authorize_quality_verdict: false,
    },
  };
}

function defaultCallerActionCatalog(targetDomainId: string, owner: string, stageId: string) {
  const toolName = `${targetDomainId.replace(/-/g, '_')}_fixture_status`;
  return {
    surface_kind: 'family_action_catalog',
    version: 'family-action-catalog.v2',
    catalog_id: `${targetDomainId}_default_caller_fixture_catalog`,
    target_domain_id: targetDomainId,
    owner,
    authority_boundary: {
      domain_truth_owner: owner,
      opl_role: 'projection_consumer_only',
      write_policy: 'no_domain_truth_writes',
      can_write_domain_truth: false,
      can_authorize_quality_verdict: false,
    },
    actions: [{
      action_id: 'default_caller_fixture_action',
      title: 'Default caller fixture action',
      summary: 'Fixture action used to exercise generated/hosted default caller descriptors.',
      owner,
      effect: 'read_only',
      execution_binding: {
        kind: 'stage_binding',
        stage_manifest_ref: 'agent/stages/manifest.json',
      },
      input_schema_ref: 'contracts/default-caller-fixture.input.schema.json',
      output_schema_ref: 'contracts/default-caller-fixture.output.schema.json',
      required_fields: [],
      optional_fields: ['workspace_root'],
      workspace_locator_fields: ['workspace_root'],
      human_gate_ids: [],
      stage_route: {
        entry_stage_ref: stageId,
        required_stage_refs: [stageId],
        optional_stage_refs: [],
        terminal_stage_refs: [stageId],
        route_policy: 'ai_selected_progress_route',
      },
      supported_surfaces: {
        cli: { surface_kind: 'domain_cli' },
        mcp: { tool_name: toolName, surface_kind: 'domain_mcp_descriptor', descriptor_only: true },
        skill: { command_contract_id: `${targetDomainId}.fixture_status`, surface_kind: 'domain_skill_contract' },
        product_entry: {
          action_key: 'default_caller_fixture_action',
          surface_kind: 'domain_product_entry',
        },
        openai: { tool_name: toolName },
        ai_sdk: { tool_name: toolName },
      },
      authority_boundary: { opl_can_write_domain_truth: false },
    }],
    notes: [],
  };
}

function defaultCallerGeneratedSurfaceHandoff(targetDomainId: string) {
  return {
    surface_kind: 'opl_generated_surface_handoff',
    schema_version: 1,
    domain_id: targetDomainId,
    generated_surface_owner: 'one-person-lab',
    domain_repo_can_own_generated_surface: false,
    generated_surfaces: defaultCallerSurfaces.map(([surfaceId]) => ({
      surface_id: surfaceId,
      owner: 'one-person-lab',
      status: 'descriptor_source_available',
    })),
    handoff_surfaces: defaultCallerSurfaces.map(([
      surfaceId,
      currentPath,
      currentRole,
      targetRole,
    ]) => ({
      surface_id: surfaceId,
      current_paths: [currentPath],
      current_role: currentRole,
      target_role: targetRole,
    })),
  };
}

export function withEvidenceWorklistSurfaces(
  manifest: Record<string, unknown>,
  stageIds: string[],
  options: {
    externalEvidenceRequestCount?: number;
    evidenceGateCount?: number;
    cleanupReady?: boolean;
    defaultCallerDeletionEvidence?: boolean;
  } = {},
): Record<string, unknown> {
  if (manifest.product_entry_manifest && typeof manifest.product_entry_manifest === 'object') {
    return {
      ...manifest,
      product_entry_manifest: withEvidenceWorklistSurfaces(
        manifest.product_entry_manifest as Record<string, unknown>,
        stageIds,
        options,
      ),
    };
  }
  const targetDomainId = String(manifest.target_domain_id);
  const owner = targetDomainId;
  const defaultCallerDeletionEvidence = options.defaultCallerDeletionEvidence === true;
  const externalEvidenceRequestCount = options.externalEvidenceRequestCount ?? 0;
  const evidenceGateCount = options.evidenceGateCount ?? 0;
  return {
    ...manifest,
    ...(defaultCallerDeletionEvidence
      ? {
          generated_surface_handoff: defaultCallerGeneratedSurfaceHandoff(targetDomainId),
          family_action_catalog: defaultCallerActionCatalog(targetDomainId, owner, stageIds[0]),
        }
      : {}),
    family_stage_control_plane: {
      surface_kind: 'family_stage_control_plane',
      version: 'family-stage-control-plane.v1',
      plane_id: `${targetDomainId}_evidence_worklist_plane`,
      target_domain_id: targetDomainId,
      owner,
      authority_boundary: { opl_role: 'projection_consumer_only' },
      stages: stageIds.map((stageId) => evidenceWorklistStage(stageId, owner)),
      notes: [],
    },
    functional_privatization_audit: {
      target_domain_id: targetDomainId,
      modules: [
        {
          module_id: `${targetDomainId}:safe-action-boundary`,
          migration_class: 'refs_only_domain_adapter',
          owner,
          code_paths: ['agent/cli.ts', 'agent/mcp.ts', 'agent/product-entry.ts', 'agent/status.ts'],
          active_callers: ['OPL generated CLI', 'OPL generated MCP', 'OPL generated product-entry'],
          active_caller_status: defaultCallerDeletionEvidence
            ? 'domain_handlers_active_opl_generated_wrapper_metadata_consumed'
            : undefined,
          migration_action: defaultCallerDeletionEvidence
            ? 'derive_wrapper_metadata_from_declarative_pack_and_opl_generated_surfaces'
            : undefined,
          retained_domain_authority: ['domain_action_handler', 'owner_receipt'],
        },
        ...(defaultCallerDeletionEvidence
          ? [
              {
                module_id: `${targetDomainId}:sidecar-adapter`,
                migration_class: 'refs_only_domain_adapter',
                owner,
                code_paths: ['runtime/domain-handler.ts'],
                active_callers: ['OPL generated domain handler dispatch'],
                active_caller_status: 'domain_handler_target_returns_owner_receipt_or_typed_blocker',
                migration_action: 'route_generated_domain_handler_to_minimal_authority_function_targets',
                retained_domain_authority: ['owner_receipt'],
              },
              {
                module_id: `${targetDomainId}:workbench-projection`,
                migration_class: 'refs_only_domain_adapter',
                owner,
                code_paths: ['runtime/workbench.ts'],
                active_callers: ['OPL hosted workbench'],
                active_caller_status: 'opl_hosted_workbench_surface_consumes_domain_projection_refs',
                migration_action: 'declare_workbench_projection_inputs_for_opl_app_generated_shell',
                retained_domain_authority: ['status_projection_refs'],
              },
            ]
          : []),
      ],
      external_evidence_request_pack: {
        request_pack_id: `${targetDomainId}.external_evidence_request_pack.fixture`,
        owner,
        request_owner: owner,
        requested_from: ['one-person-lab'],
        policy: 'request_refs_receipt_shapes_only',
        requests: Array.from({ length: externalEvidenceRequestCount }, (_, index) => ({
          request_id: `external_evidence_${index + 1}`,
          status: 'requested_not_received',
          required_evidence_refs: [`${targetDomainId}:external:evidence:${index + 1}`],
          required_return_shapes: ['domain_owner_receipt'],
          required_receipt_shapes: ['receipt_ref'],
          forbidden_payload_classes: ['domain_truth_body', 'artifact_body'],
          accepted_payload_policy: 'refs_only',
          source_pointer: `/functional_privatization_audit/external_evidence_request_pack/requests/${index}`,
        })),
      },
      bridge_exit_gate: {
        remaining_evidence_gate_ids: Array.from(
          { length: evidenceGateCount },
          (_, index) => `evidence_gate_${index + 1}`,
        ),
        remaining_bridge_module_ids: [],
        source_refs: [`${targetDomainId}:bridge_exit_gate`],
      },
    },
    standard_domain_agent_skeleton: {
      surface_kind: 'standard_domain_agent_skeleton',
      version: 'standard-domain-agent-skeleton.v1',
      agent_id: targetDomainId,
      repo_source_boundary: {
        required_dirs: ['agent', 'contracts', 'runtime', 'docs'],
        forbidden_dirs: ['artifacts'],
      },
      artifact_boundary: {
        repo_contains_real_artifacts: false,
        artifact_roots_are_locators: true,
        workspace_artifact_locator_refs: [`workspace:${targetDomainId}:artifacts`],
        runtime_artifact_locator_refs: [`runtime:${targetDomainId}:receipts`],
      },
      authority_boundary: {
        opl: 'framework_transport_and_projection_only',
        domain: 'truth_quality_artifact_owner',
      },
    },
    physical_skeleton_follow_through: {
      source_refs: ['agent/README.md', 'contracts/README.md', 'runtime/README.md', 'docs/status.md'],
      direct_skill_parity_refs: [`proof:${targetDomainId}:direct-skill-parity`],
      opl_hosted_parity_refs: [`proof:${targetDomainId}:opl-hosted-parity`],
      replacement_parity_refs: [`proof:${targetDomainId}:replacement-parity`],
      provenance_refs: [`docs/history/${targetDomainId}-legacy-tombstone.md`],
      legacy_active_path_policy: 'physically_removed_or_history_tombstone_only',
      legacy_active_path_residue: options.cleanupReady === false
        ? []
        : [{
            path_family: `${targetDomainId}:legacy-runtime`,
            state: 'tombstone_only',
            evidence_ref: `docs/history/${targetDomainId}-legacy-runtime-tombstone.md`,
          }],
    },
    legacy_retirement_tombstone_proof: {
      status: 'no_active_default_caller_proven',
      active_default_callers: [],
      tombstone_refs: [`docs/history/${targetDomainId}-legacy-runtime-tombstone.md`],
      source_refs: [`docs/decisions.md#${targetDomainId}-legacy-runtime`],
    },
  };
}

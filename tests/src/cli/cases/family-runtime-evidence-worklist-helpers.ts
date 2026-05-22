import { spawnSync } from 'node:child_process';

import {
  assert,
  repoRoot,
  path,
  runCli,
} from '../helpers.ts';

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

export function insertProviderCapabilityReceipts(stateRoot: string) {
  runCli(['family-runtime', 'events', 'export'], {
    OPL_STATE_DIR: stateRoot,
  });
  const queueDb = path.join(stateRoot, 'family-runtime', 'queue.sqlite');
  const createdAt = new Date().toISOString();
  const result = spawnSync(process.execPath, [
    '--experimental-strip-types',
    '-e',
    `import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(${JSON.stringify(queueDb)});
const checks = {
  external_temporal_server_reachable: true,
  managed_worker_ready: true,
  worker_completed_attempt: true,
  worker_restart_requery: true,
  signal_history_preserved: true,
  typed_closeout_required_for_completed: true,
  missing_closeout_blocks_completion: true,
  retry_or_dead_letter_boundary_observed: true,
  domain_truth_boundary_preserved: true
};
db.prepare("INSERT INTO events(event_id, task_id, domain_id, event_type, source, payload_json, created_at) VALUES (?, NULL, NULL, ?, ?, ?, ?)")
  .run(
    'evt_evidence_worklist_provider_proof',
    'temporal_residency_proof',
    'test',
    JSON.stringify({
      provider_kind: 'temporal',
      proof_mode: 'external_temporal_service_worker',
      closeout_status: 'production_residency_proven',
      proof_receipt: {
        receipt_kind: 'temporal_production_residency_proof',
        receipt_status: 'proven',
        provider_kind: 'temporal'
      }
    }),
    ${JSON.stringify(createdAt)}
  );
db.prepare("INSERT INTO events(event_id, task_id, domain_id, event_type, source, payload_json, created_at) VALUES (?, NULL, NULL, ?, ?, ?, ?)")
  .run(
    'evt_evidence_worklist_provider_capability',
    'temporal_provider_slo_execution_receipt',
    'test',
    JSON.stringify({
      surface_kind: 'opl_temporal_provider_slo_execution_receipt',
      provider_kind: 'temporal',
      command: 'opl family-runtime residency proof --provider temporal --production',
      execution_status: 'executed',
      receipt_status: 'proven',
      receipt_kind: 'opl_temporal_provider_slo_execution_receipt',
      production_capability_receipt: {
        surface_kind: 'opl_temporal_provider_production_capability_receipt',
        provider_kind: 'temporal',
        receipt_status: 'proven',
        capability_status: 'capability_proven',
        checks,
        failed_check_ids: [],
        proven_check_count: Object.keys(checks).length,
        required_check_count: Object.keys(checks).length
      },
      repair_receipt: {
        repair_status: 'executed',
        can_execute_domain_repair: false
      },
      authority_boundary: {
        can_authorize_domain_ready: false
      }
    }),
    ${JSON.stringify(createdAt)}
  );
db.close();`,
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_NO_WARNINGS: '1',
    },
  });
  assert.equal(result.status, 0, result.stderr);
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
  const externalEvidenceRequestCount = options.externalEvidenceRequestCount ?? 0;
  const evidenceGateCount = options.evidenceGateCount ?? 0;
  const defaultCallerDeletionEvidence = options.defaultCallerDeletionEvidence === true;
  const familyActionCatalog = defaultCallerDeletionEvidence
    ? {
        surface_kind: 'family_action_catalog',
        version: 'family-action-catalog.v1',
        catalog_id: `${targetDomainId}_default_caller_fixture_catalog`,
        target_domain_id: targetDomainId,
        owner,
        authority_boundary: {
          opl_role: 'generated_interface_projection_only',
          can_write_domain_truth: false,
          can_authorize_quality_verdict: false,
        },
        actions: [
          {
            action_id: 'default_caller_fixture_action',
            title: 'Default caller fixture action',
            summary: 'Fixture action used to exercise generated/hosted default caller descriptors.',
            owner,
            effect: 'read_only',
            source_command: {
              command: `${targetDomainId} fixture status --workspace-root <workspace_root>`,
              surface_kind: 'domain_cli',
            },
            input_schema_ref: 'contracts/default-caller-fixture.input.schema.json',
            output_schema_ref: 'contracts/default-caller-fixture.output.schema.json',
            workspace_locator_fields: ['workspace_root'],
            human_gate_ids: [],
            supported_surfaces: {
              cli: {
                command: `${targetDomainId} fixture status --workspace-root <workspace_root>`,
                surface_kind: 'domain_cli',
              },
              mcp: {
                tool_name: `${targetDomainId.replace(/-/g, '_')}_fixture_status`,
                surface_kind: 'domain_mcp_descriptor',
                descriptor_only: true,
              },
              skill: {
                command_contract_id: `${targetDomainId}.fixture_status`,
                surface_kind: 'domain_skill_contract',
              },
              product_entry: {
                action_key: 'default_caller_fixture_action',
                command: `${targetDomainId} product fixture-status --workspace-root <workspace_root>`,
                surface_kind: 'domain_product_entry',
              },
              openai: {
                tool_name: `${targetDomainId.replace(/-/g, '_')}_fixture_status`,
              },
              ai_sdk: {
                tool_name: `${targetDomainId.replace(/-/g, '_')}_fixture_status`,
              },
            },
            authority_boundary: {
              opl_can_write_domain_truth: false,
            },
          },
        ],
        notes: [],
      }
    : null;
  const generatedSurfaceHandoff = defaultCallerDeletionEvidence
    ? {
        surface_kind: 'opl_generated_surface_handoff',
        schema_version: 1,
        domain_id: targetDomainId,
        generated_surface_owner: 'one-person-lab',
        domain_repo_can_own_generated_surface: false,
        generated_surfaces: [
          { surface_id: 'cli', owner: 'one-person-lab', status: 'descriptor_source_available' },
          { surface_id: 'mcp', owner: 'one-person-lab', status: 'descriptor_source_available' },
          { surface_id: 'skill', owner: 'one-person-lab', status: 'descriptor_source_available' },
          { surface_id: 'product_entry_manifest', owner: 'one-person-lab', status: 'descriptor_source_available' },
          { surface_id: 'sidecar_export_dispatch', owner: 'one-person-lab', status: 'descriptor_source_available' },
          { surface_id: 'status_read_model', owner: 'one-person-lab', status: 'descriptor_source_available' },
          { surface_id: 'workbench_drilldown', owner: 'one-person-lab', status: 'descriptor_source_available' },
          { surface_id: 'functional_harness_cases', owner: 'one-person-lab', status: 'descriptor_source_available' },
        ],
        handoff_surfaces: [
          {
            surface_id: 'cli',
            current_paths: ['agent/cli.ts'],
            current_role: 'domain_handler_target',
            target_role: 'opl_generated_command_surface',
          },
          {
            surface_id: 'mcp',
            current_paths: ['agent/mcp.ts'],
            current_role: 'domain_handler_target',
            target_role: 'opl_generated_mcp_descriptor_surface',
          },
          {
            surface_id: 'skill',
            current_paths: ['agent/skills/domain_execution.md'],
            current_role: 'domain_handler_target',
            target_role: 'opl_generated_skill_descriptor_surface',
          },
          {
            surface_id: 'product_entry_manifest',
            current_paths: ['agent/product-entry.ts'],
            current_role: 'domain_handler_target',
            target_role: 'opl_generated_product_entry_surface',
          },
          {
            surface_id: 'status_read_model',
            current_paths: ['agent/status.ts'],
            current_role: 'domain_projection_refs',
            target_role: 'opl_generated_status_read_model_surface',
          },
          {
            surface_id: 'sidecar_export_dispatch',
            current_paths: ['runtime/sidecar.ts'],
            current_role: 'sidecar_adapter',
            target_role: 'opl_generated_sidecar_handoff_surface',
          },
          {
            surface_id: 'workbench_drilldown',
            current_paths: ['runtime/workbench.ts'],
            current_role: 'projection_refs',
            target_role: 'opl_hosted_workbench_shell_consuming_domain_refs',
          },
          {
            surface_id: 'functional_harness_cases',
            current_paths: ['runtime/harness.ts'],
            current_role: 'oracle_fixture_refs',
            target_role: 'opl_generated_functional_harness_cases',
          },
        ],
      }
    : null;
  return {
    ...manifest,
    ...(generatedSurfaceHandoff ? { generated_surface_handoff: generatedSurfaceHandoff } : {}),
    ...(familyActionCatalog ? { family_action_catalog: familyActionCatalog } : {}),
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
          active_callers: [
            'OPL generated CLI',
            'OPL generated MCP',
            'OPL generated product-entry',
          ],
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
                code_paths: ['runtime/sidecar.ts'],
                active_callers: ['OPL generated sidecar dispatch'],
                active_caller_status: 'opl_generated_sidecar_surface_targets_domain_handler',
                migration_action: 'declare_sidecar_descriptor_for_opl_generated_dispatch_surface',
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
              {
                module_id: `${targetDomainId}:functional-harness`,
                migration_class: 'refs_only_domain_adapter',
                owner,
                code_paths: ['runtime/harness.ts'],
                active_callers: ['OPL functional harness'],
                active_caller_status: 'opl_generated_functional_harness_cases_target_domain_handler',
                migration_action:
                  'derive_harness_cases_from_declarative_pack_and_opl_functional_runtime_harness',
                retained_domain_authority: ['fixture_oracle_refs'],
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
        : [
            {
              path_family: `${targetDomainId}:legacy-runtime`,
              state: 'tombstone_only',
              evidence_ref: `docs/history/${targetDomainId}-legacy-runtime-tombstone.md`,
            },
          ],
    },
    legacy_retirement_tombstone_proof: {
      status: 'no_active_default_caller_proven',
      active_default_callers: [],
      tombstone_refs: [`docs/history/${targetDomainId}-legacy-runtime-tombstone.md`],
      source_refs: [`docs/decisions.md#${targetDomainId}-legacy-runtime`],
    },
  };
}

import type {
  DomainManifestCatalogEntry,
  NormalizedDomainManifest,
} from './domain-manifest/types.ts';
import type {
  FamilyStageControlPlane,
  FamilyStageSurfaceRef,
} from './family-stage-control-plane-contract.ts';

type DomainManifestCatalog = {
  summary: {
    total_projects_count: number;
    resolved_count: number;
    [key: string]: unknown;
  };
  projects: DomainManifestCatalogEntry[];
  notes: string[];
  [key: string]: unknown;
};

function ref(refKind: string, refValue: string, role?: string): FamilyStageSurfaceRef {
  return {
    ref_kind: refKind,
    ref: refValue,
    ...(role ? { role } : {}),
  };
}

function resolvePlaneFromEntry(entry: DomainManifestCatalogEntry) {
  return entry.status === 'resolved' ? entry.manifest?.family_stage_control_plane ?? null : null;
}

function buildOplMetaAgentStageControlPlane(): FamilyStageControlPlane {
  return {
    surface_kind: 'family_stage_control_plane',
    version: 'family-stage-control-plane.v1',
    plane_id: 'opl_meta_agent_stage_decomposition_plane',
    target_domain_id: 'opl-meta-agent',
    owner: 'opl-meta-agent',
    authority_boundary: {
      opl_role: 'framework_metadata_projection_owner',
      can_write_domain_truth: false,
      can_authorize_domain_ready: false,
      can_authorize_quality_verdict: false,
      can_mutate_artifact_body: false,
    },
    stages: [
      {
        stage_id: 'stage-decomposition',
        stage_kind: 'creation',
        title: 'Stage Decomposition',
        summary: 'Use Codex CLI to author a target agent declarative stage pack draft from normalized intent.',
        goal: 'Produce a typed target agent pack draft with stages, prompts, skills, knowledge refs, quality gates, action hints, owner boundaries, and no-forbidden-write policy.',
        owner: 'opl-meta-agent',
        domain_stage_refs: ['stage-decomposition'],
        inputs: [
          ref('stage_packet_ref', 'stage-packet:opl-meta-agent/stage-decomposition-input', 'attempt_input'),
          ref('workspace_scope_ref', 'workspace-scope:opl-meta-agent/stage-decomposition', 'target_agent_output_scope'),
        ],
        knowledge_refs: [
          ref('domain_knowledge_ref', 'agent/knowledge/opl-boundary-policy.md', 'authority_boundary'),
        ],
        skills: [
          ref('domain_skill_ref', 'agent/skills/agent-baseline-build.md', 'baseline_build_skill'),
        ],
        prompt_refs: [
          ref('domain_prompt_ref', 'agent/prompts/stage-decomposition.md', 'codex_stage_prompt'),
        ],
        allowed_action_refs: ['build-agent-baseline'],
        outputs: [
          ref('stage_pack_draft_ref', 'stage-pack-draft:opl-meta-agent/target-agent', 'typed_closeout_payload'),
          ref('typed_blocker_ref', 'typed-blocker:opl-meta-agent/stage-decomposition', 'fail_closed_blocker'),
        ],
        evaluation: [
          ref('domain_quality_gate_ref', 'agent/quality_gates/baseline-delivery.md', 'independent_gate_policy'),
        ],
        handoff: {
          next_owner: 'opl-meta-agent',
          allowed_closure_refs: [
            'stage-decomposition-pack-draft-ref',
            'typed-blocker-ref:stage-decomposition',
            'independent-gate-receipt-ref:stage-decomposition',
          ],
        },
        source_refs: [
          ref('contract_ref', 'contracts/stage_control_plane.json', 'self_stage_pack_source'),
        ],
        freshness: null,
        action_parity: null,
        stage_contract: {
          requires: [
            'target-agent-intent-normalized',
            'authority-boundary-declared',
            'opl-standard-constraints-declared',
            'action-ref:build-agent-baseline',
          ],
          ensures: [
            'stage-attempt-receipt-ref:stage-decomposition',
            'executor-receipt-ref:stage-decomposition/codex-cli',
            'stage-decomposition-pack-draft-ref',
            'independent-gate-receipt-ref:stage-decomposition',
          ],
          boundary_assumptions: ['target truth and quality verdict remain target-owner authority'],
          properties: ['free-text-closeout-not-accepted'],
          runtime_event_refs: [],
          expected_receipt_refs: [
            ref('stage_attempt_receipt_ref', 'stage-attempt-receipt-ref:stage-decomposition'),
            ref('executor_receipt_ref', 'executor-receipt-ref:stage-decomposition/codex-cli'),
            ref('independent_gate_receipt_ref', 'independent-gate-receipt-ref:stage-decomposition'),
          ],
          monitor_freshness_refs: [],
          replay_evidence_refs: [],
          runtime_assumptions: [],
          monitor_refs: [],
          source_scope_refs: [
            ref('source_scope_ref', 'source-scope:opl-meta-agent/stage-decomposition'),
          ],
          cohort_query_refs: [],
          trigger_refs: [],
          metric_refs: [],
          dashboard_metric_refs: [],
          artifact_scope_refs: [
            ref('artifact_scope_ref', 'artifact-scope:opl-meta-agent/generated-agent-pack'),
          ],
          workspace_scope_refs: [
            ref('workspace_scope_ref', 'workspace-scope:opl-meta-agent/stage-decomposition'),
          ],
        },
        trust_boundary: {
          lane: 'codex_executor',
          static_check_eligible: false,
          effect_boundary: false,
          records_runtime_events: false,
          owner_receipt_required: true,
          human_gate_required: false,
          runtime_guard_required: false,
        },
        authority_boundary: {
          opl_role: 'framework_metadata_projection_owner',
          independent_gate_receipt_required: true,
          can_write_domain_truth: false,
          can_authorize_domain_ready: false,
          can_authorize_quality_verdict: false,
          can_mutate_artifact_body: false,
          can_accept_or_reject_memory_writeback: false,
        },
      },
    ],
    notes: [
      'OPL admits OMA stage-decomposition as a Codex CLI stage attempt so OMA does not need a private runner.',
    ],
  };
}

function buildOplMetaAgentActionCatalog() {
  return {
    surface_kind: 'family_action_catalog' as const,
    version: 'family-action-catalog.v1' as const,
    catalog_id: 'opl_meta_agent_action_catalog',
    target_domain_id: 'opl-meta-agent',
    owner: 'opl-meta-agent',
    authority_boundary: {
      opl_role: 'generated_interface_projection_only',
      domain_truth_owner: 'opl-meta-agent',
      opl_can_write_domain_truth: false,
      opl_can_write_memory_body: false,
      opl_can_authorize_quality_or_export: false,
    },
    actions: [
      {
        action_id: 'build-agent-baseline',
        title: 'Build Agent Baseline',
        summary: 'Launch Codex stage-decomposition and materialize the typed target agent pack draft after validation.',
        owner: 'opl-meta-agent',
        effect: 'mutating' as const,
        source_command: {
          command: 'opl-meta-agent build-agent-baseline --target-brief <brief>',
          surface_kind: 'domain_cli',
        },
        input_schema_ref: 'contracts/schemas/build-agent-baseline.input.schema.json',
        output_schema_ref: 'contracts/schemas/build-agent-baseline.output.schema.json',
        workspace_locator_fields: ['workspace_root', 'stage_packet_path'],
        human_gate_ids: ['oma_baseline_owner_review'],
        supported_surfaces: {
          cli: {
            command: 'opl-meta-agent build-agent-baseline --target-brief <brief>',
            surface_kind: 'domain_cli',
          },
          mcp: null,
          skill: {
            command_contract_id: 'opl-meta-agent.build-agent-baseline',
            surface_kind: 'opl_generated_skill_contract',
          },
          product_entry: null,
          openai: null,
          ai_sdk: null,
        },
        authority_boundary: {
          can_write_target_domain_truth: false,
          can_write_target_domain_memory_body: false,
          can_mutate_target_domain_artifact_body: false,
          can_authorize_target_domain_quality_or_export: false,
        },
      },
    ],
    notes: [
      'This action is admitted only as a stage attempt launch surface; target quality and production readiness stay gated.',
    ],
  };
}

function buildOplMetaAgentManifestEntry(): DomainManifestCatalogEntry {
  return {
    project_id: 'opl-meta-agent',
    project: 'OPL Meta Agent',
    binding_id: null,
    workspace_path: null,
    manifest_command: null,
    status: 'resolved',
    manifest: {
      target_domain_id: 'opl-meta-agent',
      family_action_catalog: buildOplMetaAgentActionCatalog(),
      family_stage_control_plane: buildOplMetaAgentStageControlPlane(),
      domain_entry_contract: {
        domain_agent_entry_spec: {
          agent_id: 'opl-meta-agent',
        },
      },
    } as unknown as NormalizedDomainManifest,
    error: null,
  };
}

export function withOplMetaAgentStageAttemptEntry<T extends DomainManifestCatalog>(catalog: T): T {
  if (catalog.projects.some((entry) => {
    const plane = resolvePlaneFromEntry(entry);
    return entry.project_id === 'opl-meta-agent'
      || plane?.target_domain_id === 'opl-meta-agent'
      || entry.manifest?.domain_entry_contract?.domain_agent_entry_spec?.agent_id === 'opl-meta-agent';
  })) {
    return catalog;
  }
  const entry = buildOplMetaAgentManifestEntry();
  return {
    ...catalog,
    summary: {
      ...catalog.summary,
      total_projects_count: catalog.summary.total_projects_count + 1,
      resolved_count: catalog.summary.resolved_count + 1,
    },
    projects: [...catalog.projects, entry],
    notes: [
      ...catalog.notes,
      'OPL Meta Agent stage-decomposition is admitted as an OPL-generated Foundry Agent stage attempt surface.',
    ],
  };
}

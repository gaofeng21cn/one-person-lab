import {
  DECLARATIVE_DOMAIN_PACK,
  DEFAULT_STAGE_EXECUTOR_BINDING_REF,
  DOMAIN_RETAINED_THIN_SURFACES_DEPRECATED,
  FORBIDDEN_DOMAIN_GENERIC_OWNER_ROLES,
  MINIMAL_AUTHORITY_FUNCTIONS,
  OPL_GENERATED_SURFACES,
  OPL_OWNED_GENERIC_PRIMITIVES,
  PRIVATE_FUNCTIONAL_SURFACE_ADMISSION_POLICY,
  SCAFFOLD_MARKER,
  STARTER_STAGE_ID,
  STANDARD_STAGE_PACK_CONFORMANCE_VERSION,
  WORKSPACE_FILE_LIFECYCLE_POLICY,
} from './standard-domain-agent-scaffold-constants.ts';

export interface ScaffoldFile {
  path: string;
  content: string;
}

export function buildScaffoldFiles(domainId: string, domainLabel: string): ScaffoldFile[] {
  const json = (payload: unknown) => `${JSON.stringify(payload, null, 2)}\n`;
  return [
    {
      path: 'agent/stages/README.md',
      content: `# ${domainLabel} Stages\n\nOPL-facing stage descriptors live here. Domain stage semantics, quality gates, and owner receipts stay domain-owned.\n`,
    },
    {
      path: `agent/stages/${STARTER_STAGE_ID}.md`,
      content: `# ${domainLabel} Domain Intake Stage\n\nPurpose: capture the first domain-specific request, source refs, authority boundary, and handoff criteria before any OPL-hosted execution starts.\n\nRequired inputs: user intent, source locator refs, expected deliverable class, domain authority owner, and blocked-scope list.\n\nRequired outputs: intake receipt ref, accepted next-stage ref, typed blocker ref when intent or authority is unclear, and no-forbidden-write evidence ref.\n`,
    },
    {
      path: 'agent/prompts/README.md',
      content: `# ${domainLabel} Prompts\n\nPrompt bodies remain domain-owned. OPL may reference prompt locators but does not copy domain truth or memory body.\n`,
    },
    {
      path: `agent/prompts/${STARTER_STAGE_ID}.md`,
      content: `# ${domainLabel} Domain Intake Prompt\n\nRead the user request, source locators, target deliverable, and known constraints. Return only domain-owned intake refs, an explicit authority boundary, and a next-stage recommendation. Do not write domain truth, memory body, artifacts, quality verdicts, or export verdicts from the OPL generated interface.\n`,
    },
    {
      path: 'agent/skills/README.md',
      content: `# ${domainLabel} Skills\n\nDeclare direct domain skill entry points here and keep direct path parity with OPL-hosted invocation receipts.\n`,
    },
    {
      path: 'agent/skills/domain_execution.md',
      content: `# ${domainLabel} Domain Execution Skill Policy\n\nThe direct domain skill is the owner path for domain execution. OPL-generated CLI, MCP, product-entry, sidecar, status, and workbench surfaces route to declared domain handlers or refs-only adapters and require owner receipts for mutating or verdict-bearing outcomes.\n`,
    },
    {
      path: 'agent/knowledge/README.md',
      content: `# ${domainLabel} Knowledge\n\nStore knowledge locators and policies here. Runtime memory bodies belong in the workspace/runtime memory root, not in OPL state.\n`,
    },
    {
      path: 'agent/knowledge/domain_boundary.md',
      content: `# ${domainLabel} Domain Boundary Knowledge\n\nThis pack owns the domain vocabulary, truth boundaries, source policies, memory-locator semantics, and artifact-authority rules needed by stage execution. OPL consumes these refs for routing and projection only.\n`,
    },
    {
      path: 'agent/quality_gates/README.md',
      content: `# ${domainLabel} Quality Gates\n\nQuality, readiness, and export verdicts are owned by this domain agent. OPL only projects refs and receipts.\n`,
    },
    {
      path: 'agent/quality_gates/domain_acceptance.md',
      content: `# ${domainLabel} Domain Acceptance Gate\n\nA stage may close only with a domain owner receipt, typed blocker, or explicit route-back ref. Mechanical completion, schema completeness, provider completion, or generated-surface readiness cannot declare domain ready, quality accepted, or export approved.\n`,
    },
    {
      path: 'agent/policies/README.md',
      content: `# ${domainLabel} Policies\n\nDeclare policy tables, authority boundaries, and pack compiler inputs here. Generic CLI, MCP, sidecar, status, and workbench shells are generated or hosted by OPL.\n`,
    },
    {
      path: 'contracts/domain_descriptor.json',
      content: json({
        surface_kind: 'domain_agent_descriptor',
        schema_version: 1,
        domain_id: domainId,
        domain_label: domainLabel,
        marker: SCAFFOLD_MARKER,
        authority_boundary: {
          opl_can_write_domain_truth: false,
          opl_can_write_memory_body: false,
          opl_can_authorize_quality_or_export: false,
          domain_owns_truth_quality_artifact_memory_and_receipts: true,
        },
      }),
    },
    {
      path: 'contracts/pack_compiler_input.json',
      content: json({
        surface_kind: 'opl_domain_pack_compiler_input',
        schema_version: 1,
        domain_id: domainId,
        domain_pack_owner: domainId,
        canonical_semantic_pack_root: 'agent/',
        canonical_semantic_pack_role: 'repo_source_declarative_domain_pack',
        required_domain_pack_paths: [
          `agent/prompts/${STARTER_STAGE_ID}.md`,
          `agent/stages/${STARTER_STAGE_ID}.md`,
          'agent/skills/domain_execution.md',
          'agent/knowledge/domain_boundary.md',
          'agent/quality_gates/domain_acceptance.md',
        ],
        source_refs: {
          stage_graph_source_ref: 'contracts/stage_control_plane.json',
          quality_gate_source_ref: 'agent/quality_gates/domain_acceptance.md',
          executor_policy_source_ref: 'contracts/stage_control_plane.json#/stages/0/selected_executor',
          functional_privatization_audit_source_ref: 'contracts/functional_privatization_audit.json',
          generated_surface_handoff_source_ref: 'contracts/generated_surface_handoff.json',
        },
        standard_stage_pack_conformance: {
          version: STANDARD_STAGE_PACK_CONFORMANCE_VERSION,
          required: true,
          enforcement_ref: 'contracts/stage_control_plane.json#stage_pack_conformance_version',
        },
        generated_surface_owner: 'one-person-lab',
        declarative_domain_pack: DECLARATIVE_DOMAIN_PACK,
        minimal_authority_functions: MINIMAL_AUTHORITY_FUNCTIONS,
        generated_surfaces_requested: OPL_GENERATED_SURFACES.map((surface) => surface.surface_id),
        domain_repo_can_own_generated_surface: false,
        marker: SCAFFOLD_MARKER,
        authority_boundary: {
          opl_can_write_domain_truth: false,
          opl_can_write_memory_body: false,
          opl_can_authorize_quality_or_export: false,
          domain_can_claim_generated_surface_owner: false,
        },
      }),
    },
    {
      path: 'contracts/generated_surface_handoff.json',
      content: json({
        surface_kind: 'opl_generated_surface_handoff',
        schema_version: 1,
        domain_id: domainId,
        generated_surface_owner: 'one-person-lab',
        domain_repo_can_own_generated_surface: false,
        source_contract_ref: 'contracts/pack_compiler_input.json',
        generated_surfaces: OPL_GENERATED_SURFACES,
        required_domain_handoff: [
          'owner_receipt_schema',
          'typed_blocker_schema',
          'minimal_authority_function_refs',
          'no_forbidden_write_evidence',
        ],
        marker: SCAFFOLD_MARKER,
      }),
    },
    {
      path: 'contracts/stage_control_plane.json',
      content: json({
        surface_kind: 'family_stage_control_plane',
        version: 'family-stage-control-plane.v1',
        plane_id: `${domainId}.stage-control-plane.v1`,
        target_domain_id: domainId,
        owner: domainId,
        domain_id: domainId,
        stage_pack_conformance_version: STANDARD_STAGE_PACK_CONFORMANCE_VERSION,
        authority_boundary: {
          domain_truth_owner: domainId,
          opl_role: 'projection_consumer_only',
          opl_can_write_domain_truth: false,
          opl_can_authorize_quality_or_export: false,
        },
        stages: [
          {
            stage_id: STARTER_STAGE_ID,
            stage_kind: 'intake',
            title: 'Domain intake',
            summary: 'Capture domain intent, source refs, authority boundary, and next-stage readiness.',
            goal: 'Produce intake receipt refs and a next-stage recommendation without granting OPL domain truth authority.',
            owner: domainId,
            stage_pack_conformance_version: STANDARD_STAGE_PACK_CONFORMANCE_VERSION,
            selected_executor: {
              executor_kind: 'codex_cli',
              default_executor: true,
              executor_binding_ref: DEFAULT_STAGE_EXECUTOR_BINDING_REF,
              binding_policy: 'default_first_class_executor_for_ai_first_stage_execution',
              required_capabilities: [
                'repo_context_reading',
                'domain_skill_invocation',
                'receipt_or_typed_blocker_return',
                'no_forbidden_write_guard',
              ],
            },
            domain_stage_refs: [STARTER_STAGE_ID],
            inputs: [],
            knowledge_refs: [
              {
                ref_kind: 'repo_path',
                ref: 'agent/knowledge/domain_boundary.md',
                role: 'domain_pack_knowledge',
              },
            ],
            skills: [
              {
                ref_kind: 'repo_path',
                ref: 'agent/skills/domain_execution.md',
                role: 'domain_pack_skill_policy',
              },
            ],
            prompt_refs: [
              {
                ref_kind: 'repo_path',
                ref: `agent/prompts/${STARTER_STAGE_ID}.md`,
                role: 'stage_prompt',
              },
            ],
            allowed_action_refs: [],
            outputs: [
              {
                ref_kind: 'domain_ref',
                ref: ['intake_receipt_ref', 'typed_blocker_ref', 'next_stage_ref'],
                role: 'domain_intake_refs',
              },
            ],
            evaluation: [
              {
                ref_kind: 'repo_path',
                ref: 'agent/quality_gates/domain_acceptance.md',
                role: 'agent_quality_gate',
              },
            ],
            independent_gate_policy: {
              gate_ref: 'agent/quality_gates/domain_acceptance.md',
              gate_owner: domainId,
              execution_review_separation_required: true,
              mechanical_completion_can_close_stage: false,
              provider_completion_can_claim_domain_ready: false,
              generated_surface_readiness_can_claim_quality_or_export: false,
            },
            stage_contract: {
              requires: [
                'user_intent_ref',
                'source_locator_refs',
                'expected_deliverable_class_ref',
                'domain_authority_owner_ref',
              ],
              ensures: [
                'domain_intake_receipt_or_typed_blocker_ref',
                'next_stage_recommendation_ref',
                'authority_boundary_ref',
                'no_forbidden_write_evidence_ref',
              ],
              expected_receipt_refs: [
                {
                  ref_kind: 'domain_ref',
                  ref: 'intake_receipt_ref',
                  role: 'domain_owner_receipt',
                },
                {
                  ref_kind: 'domain_ref',
                  ref: 'typed_blocker_ref',
                  role: 'route_back_or_blocker',
                },
              ],
            },
            handoff: {
              next_owner: domainId,
              next_stage_refs: [],
            },
            source_refs: [
              {
                ref_kind: 'repo_path',
                ref: `agent/stages/${STARTER_STAGE_ID}.md`,
                role: 'stage_policy',
              },
            ],
            authority_boundary: {
              domain_truth_owner: domainId,
              opl_role: 'projection_consumer_only',
              opl_can_write_domain_truth: false,
              opl_can_authorize_quality_or_export: false,
            },
          },
        ],
        marker: SCAFFOLD_MARKER,
      }),
    },
    {
      path: 'contracts/action_catalog.json',
      content: json({
        surface_kind: 'family_action_catalog',
        version: 'family-action-catalog.v1',
        catalog_id: `${domainId}.action-catalog.v1`,
        target_domain_id: domainId,
        owner: domainId,
        domain_id: domainId,
        authority_boundary: {
          domain_truth_owner: domainId,
          opl_role: 'projection_consumer_only',
          write_policy: 'no_domain_truth_writes',
        },
        actions: [],
        forbidden_generic_owner_roles: FORBIDDEN_DOMAIN_GENERIC_OWNER_ROLES,
        marker: SCAFFOLD_MARKER,
      }),
    },
    {
      path: 'contracts/memory_descriptor.json',
      content: json({
        surface_kind: 'domain_memory_descriptor_locator',
        schema_version: 1,
        domain_id: domainId,
        memory_body_owner: domainId,
        opl_projection_policy: 'locator_and_receipt_refs_only',
        marker: SCAFFOLD_MARKER,
      }),
    },
    {
      path: 'contracts/artifact_locator_contract.json',
      content: json({
        surface_kind: 'artifact_locator_contract',
        schema_version: 1,
        domain_id: domainId,
        canonical_artifact_authority: domainId,
        opl_projection_policy: 'locator_lifecycle_and_receipt_refs_only',
        marker: SCAFFOLD_MARKER,
      }),
    },
    {
      path: 'contracts/owner_receipt_contract.json',
      content: json({
        surface_kind: 'owner_receipt_contract',
        schema_version: 1,
        domain_id: domainId,
        allowed_receipt_classes: [
          'owner_receipt',
          'typed_blocker',
          'no_regression_evidence',
          'memory_writeback_receipt',
          'artifact_lifecycle_receipt',
        ],
        forbidden_claims: [
          'opl_authorized_domain_ready',
          'opl_authorized_quality_or_export_verdict',
          'opl_wrote_domain_truth',
          'opl_wrote_memory_body',
        ],
        marker: SCAFFOLD_MARKER,
      }),
    },
    {
      path: 'contracts/functional_privatization_audit.json',
      content: json({
        surface_kind: 'functional_privatization_audit',
        schema_version: 1,
        domain_id: domainId,
        marker: SCAFFOLD_MARKER,
        classification_policy: {
          rule: 'domain_declares_non_knowledge_functional_modules_for_opl_unified_audit',
          accepted_migration_classes: [
            'opl_hosted_surface',
            'opl_generated_surface',
            'declarative_pack',
            'minimal_authority_function',
            'refs_only_domain_adapter',
            'domain_handler_target',
            'native_helper_implementation',
            'temporary_migration_bridge',
            'diagnostic_cleanup_path',
            'provenance_or_fixture',
          ],
        },
        opl_owned_replacement_surfaces: OPL_OWNED_GENERIC_PRIMITIVES.map((primitive) => primitive.primitive_id),
        opl_generated_surfaces: OPL_GENERATED_SURFACES.map((surface) => surface.surface_id),
        private_functional_surface_admission_policy: PRIVATE_FUNCTIONAL_SURFACE_ADMISSION_POLICY,
        declarative_domain_pack: DECLARATIVE_DOMAIN_PACK,
        minimal_authority_functions: MINIMAL_AUTHORITY_FUNCTIONS,
        domain_retained_thin_surfaces_deprecated: DOMAIN_RETAINED_THIN_SURFACES_DEPRECATED,
        forbidden_generic_owner_roles: FORBIDDEN_DOMAIN_GENERIC_OWNER_ROLES,
        modules: [],
        authority_boundary: {
          opl_can_write_domain_truth: false,
          opl_can_write_memory_body: false,
          opl_can_authorize_quality_or_export: false,
          domain_can_claim_generic_runtime_owner: false,
        },
      }),
    },
    {
      path: 'contracts/private_functional_surface_policy.json',
      content: json({
        ...PRIVATE_FUNCTIONAL_SURFACE_ADMISSION_POLICY,
        domain_id: domainId,
        marker: SCAFFOLD_MARKER,
      }),
    },
    {
      path: 'contracts/workspace_lifecycle_policy.json',
      content: json({
        ...WORKSPACE_FILE_LIFECYCLE_POLICY,
        domain_id: domainId,
        marker: SCAFFOLD_MARKER,
      }),
    },
    {
      path: 'runtime/authority_functions/README.md',
      content: `# ${domainLabel} Authority Functions\n\nKeep only minimal domain authority functions here: quality/export verdict authorization, artifact mutation authorization, memory accept/reject decisions, source readiness verdicts, owner receipt signing, or domain-specific native helper implementation. Every retained function needs a cannot-absorb reason, receipt schema, active caller list, and no-forbidden-write evidence.\n`,
    },
    {
      path: 'runtime/native_helpers/README.md',
      content: `# ${domainLabel} Native Helpers\n\nPlace domain-specific helper implementations here only when they cannot be represented as declarative pack inputs. OPL owns the generic helper envelope and execution contract.\n`,
    },
    {
      path: 'runtime/fixtures/README.md',
      content: `# ${domainLabel} Runtime Fixtures\n\nStore focused harness fixtures and expected owner receipts here. Runtime artifacts, memory bodies, and deliverable blobs stay in workspace/runtime roots.\n`,
    },
    {
      path: 'docs/project.md',
      content: `# ${domainLabel}\n\nOwner: \`${domainId}\`\nPurpose: \`domain_agent_project_overview\`\nState: \`scaffolded\`\nMachine boundary: human-readable project overview; machine truth belongs in contracts and runtime receipts.\n`,
    },
    {
      path: 'docs/status.md',
      content: `# ${domainLabel} Status\n\nCurrent state: scaffolded declarative domain pack with minimal authority functions. Production evidence must come from domain-owned receipts and focused OPL-hosted/direct parity verification.\n`,
    },
    {
      path: 'docs/architecture.md',
      content: `# ${domainLabel} Architecture\n\nThis repo owns domain truth, quality/export verdicts, artifact authority, memory body, and owner receipts. OPL owns generic runtime, queue, attempt ledger, transition runner, memory locator transport, artifact lifecycle shell, workbench, and observability projection.\n`,
    },
    {
      path: 'docs/invariants.md',
      content: `# ${domainLabel} Invariants\n\n- Do not store runtime artifacts in repo source.\n- Do not implement generic OPL runtime primitives in this domain repo.\n- Do not let OPL write domain truth, memory body, or quality/export verdicts.\n`,
    },
    {
      path: 'docs/decisions.md',
      content: `# ${domainLabel} Decisions\n\n- Adopt OPL standard domain-agent scaffold v1.\n- Keep this repo as a declarative domain pack plus minimal authority functions.\n`,
    },
  ];
}

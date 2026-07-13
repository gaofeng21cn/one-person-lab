import {
  DECLARATIVE_DOMAIN_PACK,
  DOMAIN_RETAINED_THIN_SURFACES,
  FOUNDRY_AGENT_SERIES_CONSUMER_KIND,
  FOUNDRY_AGENT_SERIES_CONSUMER_REQUIRED_AUTHORITY_BOUNDARY_FIELDS,
  FOUNDRY_AGENT_SERIES_CONSUMER_VERSION,
  FOUNDRY_AGENT_SERIES_POLICY_EXPORT,
  FOUNDRY_AGENT_SERIES_POLICY_RELEASE,
  FORBIDDEN_DOMAIN_GENERIC_OWNER_ROLES,
  MINIMAL_AUTHORITY_FUNCTIONS,
  OPL_GENERATED_SURFACES,
  OPL_OWNED_GENERIC_PRIMITIVES,
  PRIVATE_FUNCTIONAL_SURFACE_ADMISSION_POLICY,
  SCAFFOLD_MARKER,
  STARTER_STAGE_ID,
  STANDARD_FOUNDRY_AGENT_SERIES_CONTRACT,
  STANDARD_AGENT_PACK_ABI,
  STANDARD_AGENT_IMPLEMENTATION_PROFILE,
  STATE_INDEX_KERNEL_ADOPTION_POLICY,
  STANDARD_STAGE_PACK_CONFORMANCE_VERSION,
  STAGE_ARTIFACT_KERNEL_ADOPTION_POLICY,
  STAGE_RUN_KERNEL_PROFILE,
  WORKSPACE_FILE_LIFECYCLE_POLICY,
} from './standard-domain-agent-scaffold-constants.ts';
import { buildStageRunCanaryEvidence } from './standard-domain-agent-scaffold-stage-run-canary.ts';
import {
  buildStandardAgentPrinciplesAdoption,
} from './standard-agent-principles.ts';
import { STAGE_OPERATING_PRINCIPLES_POLICY } from './standard-domain-agent-stage-operating-principles.ts';
import { OBSERVABILITY_ATTEMPT_LEDGER_LABEL } from '../../kernel/observability-projection-vocabulary.ts';
import {
  CAPABILITY_MAP_REF,
  standardCapabilityMap,
} from './standard-domain-agent-scaffold-template-parts/capability-map.ts';

export {
  STANDARD_AGENT_CAPABILITY_MAP_CONTRACT,
} from './standard-domain-agent-scaffold-template-parts/capability-map.ts';

export interface ScaffoldFile {
  path: string;
  content: string;
}

const STARTER_ACTION_ID = 'domain_intake_owner_handoff';

function toolNamePrefix(domainId: string) {
  return domainId
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'new_domain_agent';
}

function generatedSurfaceDescriptors() {
  return OPL_GENERATED_SURFACES.map((surface) => ({
    ...surface,
    status: 'descriptor_source_available',
  }));
}

function generatedSurfaceHandoffSurfaces() {
  return [
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
      surface_id: 'domain_handler',
      current_paths: ['runtime/authority_functions/README.md'],
      current_role: 'domain_authority_function_target',
      target_role: 'opl_generated_domain_handler_handoff_surface',
    },
    {
      surface_id: 'status_read_model',
      current_paths: ['contracts/owner_receipt_contract.json'],
      current_role: 'domain_projection_refs',
      target_role: 'opl_generated_status_read_model_surface',
    },
    {
      surface_id: 'workbench_drilldown',
      current_paths: ['contracts/artifact_locator_contract.json'],
      current_role: 'projection_refs',
      target_role: 'opl_hosted_workbench_shell_consuming_domain_refs',
    },
  ];
}

function foundryAgentSeriesContract(domainId: string, domainLabel: string) {
  return {
    surface_kind: FOUNDRY_AGENT_SERIES_CONSUMER_KIND,
    version: FOUNDRY_AGENT_SERIES_CONSUMER_VERSION,
    owner: domainId,
    canonical_policy_export: FOUNDRY_AGENT_SERIES_POLICY_EXPORT,
    canonical_series_contract_ref: 'contracts/opl-framework/foundry-agent-series-contract.json',
    canonical_skeleton_contract_ref: 'contracts/opl-framework/standard-domain-agent-skeleton-contract.json',
    shared_policy_release: STANDARD_FOUNDRY_AGENT_SERIES_CONTRACT.shared_policy_release,
    domain_id: domainId,
    foundry_agent_id: domainId,
    product_layer: 'foundry_agent',
    domain_label: domainLabel,
    domain_aliases: [domainId],
    authority_owner: domainId,
    stage_manifest_ref: 'agent/stages/manifest.json',
    stage_control_plane_ref: 'opl-generated:family_stage_control_plane',
    stage_control_plane_target_domain_id: domainId,
    app_projection_ref: 'contracts/generated_surface_handoff.json#/product_entry',
    domain_progress_aliases: {
      deliverable: ['deliverable_progress_delta'],
      platform: ['platform_repair_delta'],
    },
    authority_boundary: Object.fromEntries(
      FOUNDRY_AGENT_SERIES_CONSUMER_REQUIRED_AUTHORITY_BOUNDARY_FIELDS.map((field) => [field, false]),
    ),
  };
}

function starterAction(domainId: string) {
  const toolPrefix = toolNamePrefix(domainId);
  return {
    action_id: STARTER_ACTION_ID,
    title: 'Domain intake owner handoff',
    summary: 'Route the scaffolded domain intake stage to the domain owner and return owner receipt or typed blocker refs.',
    owner: domainId,
    effect: 'mutating',
    source_command: {
      command: `${domainId} intake --workspace-root <workspace_root>`,
      surface_kind: 'domain_cli',
    },
    input_schema_ref: 'contracts/domain-intake.input.schema.json',
    output_schema_ref: 'contracts/domain-intake.output.schema.json',
    required_fields: ['workspace_root'],
    optional_fields: [],
    workspace_locator_fields: ['workspace_root'],
    human_gate_ids: ['domain_owner_review'],
    supported_surfaces: {
      cli: {
        command: `${domainId} intake --workspace-root <workspace_root>`,
        surface_kind: 'domain_cli',
      },
      mcp: {
        tool_name: `${toolPrefix}_domain_intake_owner_handoff`,
        surface_kind: 'domain_mcp_descriptor',
        descriptor_only: true,
        public_runtime: false,
      },
      skill: {
        command_contract_id: `${domainId}.${STARTER_ACTION_ID}`,
        surface_kind: 'domain_skill_contract',
      },
      product_entry: {
        action_key: STARTER_ACTION_ID,
        command: `${domainId} product intake --workspace-root <workspace_root>`,
        surface_kind: 'domain_product_entry',
      },
      openai: { tool_name: `${toolPrefix}_domain_intake_owner_handoff` },
      ai_sdk: { tool_name: `${toolPrefix}_domain_intake_owner_handoff` },
    },
    authority_boundary: {
      opl_can_write_domain_truth: false,
      opl_can_write_memory_body: false,
      opl_can_authorize_quality_or_export: false,
      domain_owner_receipt_or_typed_blocker_required_for_quality_or_ready_claim: true,
      consumable_artifact_progress_receipt_allowed: true,
    },
  };
}

function functionalPrivatizationModules(domainId: string) {
  return [
    {
      module_id: `${domainId}.generated-wrapper-handler-targets`,
      classification: 'domain_handler_target',
      migration_class: 'domain_handler_target',
      code_paths: ['agent/cli.ts', 'agent/mcp.ts', 'agent/product-entry.ts'],
      current_surface_refs: ['cli', 'mcp', 'skill', 'product_entry_manifest'],
      active_callers: ['OPL generated CLI', 'OPL generated MCP', 'OPL generated skill', 'OPL generated product-entry'],
      active_caller_status: 'domain_handlers_active_opl_generated_wrapper_metadata_consumed',
      migration_action: 'derive_wrapper_metadata_from_family_action_catalog_and_opl_generated_surfaces',
      retained_domain_authority: ['domain_action_handler', 'owner_receipt_or_typed_blocker'],
      semantic_equivalence_status: 'cleared_by_boundary',
      audit_visibility: 'hidden_by_default',
    },
    {
      module_id: `${domainId}.domain-handler-target`,
      classification: 'domain_handler_target',
      migration_class: 'domain_handler_target',
      code_paths: ['runtime/authority_functions/README.md'],
      current_surface_refs: ['domain_handler'],
      active_callers: ['OPL generated domain handler dispatch'],
      active_caller_status: 'domain_handler_target_returns_owner_receipt_or_typed_blocker',
      migration_action: 'route_generated_domain_handler_to_minimal_authority_function_targets',
      retained_domain_authority: ['owner_receipt_or_typed_blocker'],
      semantic_equivalence_status: 'cleared_by_boundary',
      audit_visibility: 'hidden_by_default',
    },
    {
      module_id: `${domainId}.refs-only-status-and-workbench-projection`,
      classification: 'refs_only_domain_adapter',
      migration_class: 'refs_only_domain_adapter',
      code_paths: ['contracts/owner_receipt_contract.json', 'contracts/artifact_locator_contract.json'],
      current_surface_refs: ['status_read_model', 'workbench_drilldown'],
      active_callers: ['OPL generated status read model', 'OPL hosted workbench'],
      active_caller_status: 'refs_only_projection_consumed_by_opl_generated_or_hosted_surface',
      migration_action: 'project_domain_refs_without_repo_owned_status_or_workbench_shell',
      retained_domain_authority: ['status_projection_refs', 'artifact_locator_refs', 'owner_receipt_refs'],
      semantic_equivalence_status: 'cleared_by_boundary',
      audit_visibility: 'hidden_by_default',
    },
    {
      module_id: `${domainId}.owner-receipt-signer`,
      classification: 'minimal_authority_function',
      migration_class: 'minimal_authority_function',
      code_paths: ['runtime/authority_functions/README.md'],
      active_callers: ['domain owner quality gate', 'OPL generated adapter receipt target'],
      active_caller_status: 'domain_authority_active_minimal_function',
      cannot_absorb_reason: 'OPL cannot sign target domain owner receipts or typed blockers.',
      receipt_schema_ref: 'contracts/owner_receipt_contract.json',
      no_forbidden_write_evidence_ref: 'contracts/owner_receipt_contract.json#forbidden_claims',
      retained_domain_authority: ['owner_receipt_signing', 'typed_blocker_materialization'],
      semantic_equivalence_status: 'cleared_by_boundary',
      audit_visibility: 'hidden_by_default',
    },
  ];
}

function physicalSourceMorphologyPolicy(domainId: string) {
  const requiredSurfaceIds = [
    'agent_semantic_pack',
    'domain_handler_targets',
    'refs_only_adapters',
    'minimal_authority_functions',
    'fixture_or_provenance_refs',
  ];
  return {
    policy_id: `${domainId}.physical-source-morphology.v1`,
    state: 'classified_no_generic_runtime_reflow',
    required_surface_ids: requiredSurfaceIds,
    classification_buckets: [
      'declarative_domain_pack',
      'domain_handler_target',
      'refs_only_adapter',
      'minimal_authority_function',
      'provenance_or_fixture',
    ],
    surface_classifications: [
      {
        surface_id: 'agent_semantic_pack',
        classification: 'declarative_domain_pack',
        source_refs: ['agent/'],
      },
      {
        surface_id: 'domain_handler_targets',
        classification: 'domain_handler_target',
        source_refs: ['contracts/action_catalog.json', 'agent/skills/domain_execution.md'],
      },
      {
        surface_id: 'refs_only_adapters',
        classification: 'refs_only_adapter',
        source_refs: [
          'contracts/memory_descriptor.json',
          'contracts/artifact_locator_contract.json',
          'contracts/owner_receipt_contract.json',
        ],
      },
      {
        surface_id: 'minimal_authority_functions',
        classification: 'minimal_authority_function',
        source_refs: ['runtime/authority_functions/README.md'],
      },
      {
        surface_id: 'fixture_or_provenance_refs',
        classification: 'provenance_or_fixture',
        source_refs: ['runtime/fixtures/README.md', 'docs/history/'],
      },
    ],
    authority_boundary: {
      domain_can_claim_generic_runtime_owner: false,
      domain_repo_can_own_generated_surface: false,
    },
  };
}

function standardAgentConformanceProfile(domainId: string) {
  const morphology = physicalSourceMorphologyPolicy(domainId);
  return {
    surface_kind: 'opl_standard_agent_conformance_profile',
    version: 'opl.standard-agent-conformance-profile.v1',
    profile_id: `${domainId}.standard-agent-conformance.v1`,
    target_domain_id: domainId,
    golden_path: {
      required_stage_ids: [STARTER_STAGE_ID],
      allowed_stage_ids: [STARTER_STAGE_ID],
      default_stage_id: STARTER_STAGE_ID,
      forbidden_owner_tokens: [],
    },
    physical_morphology: {
      scan_roots: ['agent/', 'contracts/', 'runtime/'],
      allowed_residue_prefixes: ['docs/history/'],
      required_surface_ids: morphology.required_surface_ids,
      surface_classifications: morphology.surface_classifications,
      forbidden_name_tokens: [],
      required_parity_gates: ['generated_surface_consumption'],
    },
  };
}

export function buildScaffoldFiles(domainId: string, domainLabel: string): ScaffoldFile[] {
  const json = (payload: unknown) => `${JSON.stringify(payload, null, 2)}\n`;
  return [
    {
      path: 'agent/principles/README.md',
      content: `# ${domainLabel} Principles\n\nDeclare how this domain adopts OPL standard agent principles and where domain specialization begins. OPL owns the generic principles; this repo owns the domain mapping and authority boundaries.\n`,
    },
    {
      path: 'agent/principles/opl-standard-agent-principles.md',
      content: `# OPL Standard Agent Principles\n\nThis domain adopts the OPL Standard Agent AI-first Principle Pack from \`contracts/opl-framework/standard-agent-principles.json\`.\n\n- AI performs open-ended understanding, comparison, creation, review, diagnosis, and revision inside bounded stage attempts.\n- Contracts, schemas, tests, and readbacks guard identity, authority, inputs, outputs, evidence, and recovery.\n- Domain truth, quality verdicts, artifact bodies, memory bodies, owner receipts, and typed blockers stay domain-owned.\n- Stage prompts define goals and accepted answer shapes; professional skills carry domain methods; tool catalogs describe affordances and limits without prescribing executor strategy.\n- \`domain_intake\` is a starter-stage owner-handoff pattern, not an independent Skill.\n`,
    },
    {
      path: 'agent/principles/domain-specialization.md',
      content: `# ${domainLabel} Domain Specialization\n\nMap OPL standard principles to this domain's actual stage, source, receipt, blocker, quality, memory, and artifact authority surfaces.\n\nThe starter \`domain_intake\` stage captures domain intent, source refs, authority boundary, and next-stage recommendation. Any raw, partial, negative, corrupt-output, or no-output diagnostic is valid progress input for the next declared stage. Owner receipts govern domain/quality/ready claims; typed blockers are reserved for unavailable executors, wrong-target identity/currentness, permission/safety/authority boundaries, irreversible actions, or explicit human decisions.\n`,
    },
    {
      path: 'agent/stages/README.md',
      content: `# ${domainLabel} Stages\n\nOPL-facing stage descriptors live here. Domain stage semantics, quality gates, and owner receipts stay domain-owned.\n`,
    },
    {
      path: 'agent/stages/manifest.json',
      content: json({
        surface_kind: 'opl_standard_agent_declarative_stage_manifest',
        version: 'opl-standard-agent-declarative-stage-manifest.v1',
        target_domain_id: domainId,
        owner: domainId,
        progress_first_policy: {
          consumable_artifact_advances_stage: true,
          no_output_or_failure_diagnostic_advances_stage: true,
          retry_review_and_repair_limits_are_quality_budgets: true,
          quality_budget_exhaustion_status: 'completed_with_quality_debt',
          quality_debt_blocks_stage_transition: false,
          quality_debt_blocks_quality_export_or_ready_claims: true,
          hard_stop_classes: [
            'executor_unavailable',
            'permission_or_credential_boundary',
            'explicit_human_decision',
            'authority_boundary_violation',
            'irreversible_action_requires_authorization',
            'identity_or_currentness_mismatch',
          ],
        },
        authority_boundary: {
          domain_truth_owner: domainId,
          opl_can_write_domain_truth: false,
          opl_can_authorize_quality_or_export: false,
        },
        stages: [{
          stage_id: STARTER_STAGE_ID,
          stage_kind: 'intake',
          title: 'Domain intake',
          summary: 'Capture domain intent, source refs, authority boundary, and next-stage route context.',
          goal: 'Produce the best intake progress artifact or diagnostic plus a next-stage recommendation without granting OPL domain truth authority.',
          policy_ref: `agent/stages/${STARTER_STAGE_ID}.md`,
          prompt_ref: `agent/prompts/${STARTER_STAGE_ID}.md`,
          knowledge_refs: ['agent/knowledge/domain_boundary.md'],
          quality_gate_refs: ['agent/quality_gates/domain_acceptance.md'],
          allowed_action_refs: [STARTER_ACTION_ID],
          requires: [
            'user_intent_ref',
            'source_locator_refs',
            'expected_deliverable_class_ref',
            'domain_authority_owner_ref',
            `stage-completion-policy-ref:${domainId}/${STARTER_STAGE_ID}`,
          ],
          ensures: [
            'domain_intake_progress_receipt_diagnostic_or_hard_boundary_ref',
            'next_stage_recommendation_ref',
            'authority_boundary_ref',
            'no_forbidden_write_evidence_ref',
          ],
          next_stage_refs: [],
          trust_lane: 'domain_agent',
        }],
      }),
    },
    {
      path: `agent/stages/${STARTER_STAGE_ID}.md`,
      content: `# ${domainLabel} Domain Intake Stage\n\nPurpose: capture the first domain-specific request, source refs, authority boundary, and handoff criteria as an OPL-hosted stage attempt.\n\nAvailable inputs: user intent, source locator refs, expected deliverable class, domain authority owner, and blocked-scope list. Missing or malformed ordinary inputs become quality debt or a no-output/failure diagnostic.\n\nAccepted outputs: raw or partial intake artifact refs, negative-result refs, progress receipt refs, no-output/failure diagnostic refs, next-stage or route-back refs, owner receipt refs, and no-forbidden-write evidence refs. Return a typed blocker or human gate only for an unavailable executor, wrong-target identity/currentness, permission/safety/authority boundary, irreversible action, or explicit human decision.\n`,
    },
    {
      path: 'agent/prompts/README.md',
      content: `# ${domainLabel} Prompts\n\nPrompt bodies remain domain-owned. OPL may reference prompt locators but does not copy domain truth or memory body.\n`,
    },
    {
      path: `agent/prompts/${STARTER_STAGE_ID}.md`,
      content: `# ${domainLabel} Domain Intake Prompt\n\nRead the available user request, source locators, target deliverable, and known constraints. Produce the best domain-owned intake artifact or a no-output/failure diagnostic, preserve uncertainty and negative evidence, and recommend any declared next or route-back stage. Missing format, refs, review, or ordinary evidence is quality debt and never blocks the next stage. Do not write domain truth, memory body, artifacts, quality verdicts, or export verdicts from the OPL generated interface.\n`,
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
      path: 'agent/tools/README.md',
      content: `# ${domainLabel} Tools\n\nDeclare available tool affordances and safety boundaries here. This catalog describes capability, permission, credential, write-scope, side-effect, and forbidden-authority limits without prescribing executor strategy or tool order.\n`,
    },
    {
      path: 'agent/tools/domain_affordances.md',
      content: `# ${domainLabel} Domain Tool Affordances\n\nThis catalog lists domain-available tools as affordances. It defines only capability, permission scope, credential boundary, write scope, side-effect risk, and forbidden authority refs. The executor chooses, skips, substitutes, combines, parallelizes, or asks for missing context within those boundaries during the attempt.\n`,
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
      content: `# ${domainLabel} Domain Acceptance Gate\n\nA stage advances with a domain artifact, raw/partial/negative result, progress receipt, no-output/failure diagnostic, quality debt, owner receipt, human gate, hard-boundary typed blocker, or explicit route-back ref. Quality debt and diagnostics close domain-ready, quality-accepted, and export-approved claims, not stage transition. Mechanical completion, schema completeness, provider completion, or generated-surface readiness cannot declare those claims.\n`,
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
        standard_contract_refs: {
          foundry_agent_series: 'contracts/foundry_agent_series.json',
          foundry_agent_series_policy_release: FOUNDRY_AGENT_SERIES_POLICY_RELEASE.release_contract_ref,
          stage_manifest: 'agent/stages/manifest.json',
          stage_control_plane: 'opl-generated:family_stage_control_plane',
          pack_compiler_input: 'contracts/pack_compiler_input.json',
          capability_map: CAPABILITY_MAP_REF,
          generated_surface_handoff: 'contracts/generated_surface_handoff.json',
          standard_agent_principles: 'contracts/opl-framework/standard-agent-principles.json',
          standard_agent_principles_adoption: 'contracts/standard-agent-principles-adoption.json',
        },
        authority_boundary: {
          opl_can_write_domain_truth: false,
          opl_can_write_memory_body: false,
          opl_can_authorize_quality_or_export: false,
          domain_owns_truth_quality_artifact_memory_and_receipts: true,
        },
      }),
    },
    {
      path: 'contracts/foundry_agent_series.json',
      content: json(foundryAgentSeriesContract(domainId, domainLabel)),
    },
    {
      path: 'contracts/standard-agent-principles-adoption.json',
      content: json(buildStandardAgentPrinciplesAdoption(domainId, domainLabel)),
    },
    {
      path: CAPABILITY_MAP_REF,
      content: json(standardCapabilityMap(domainId, domainLabel)),
    },
    {
      path: 'contracts/pack_compiler_input.json',
      content: json({
        surface_kind: 'opl_domain_pack_compiler_input',
        schema_version: 1,
        domain_id: domainId,
        canonical_agent_id: domainId,
        domain_pack_owner: domainId,
        canonical_semantic_pack_root: 'agent/',
        canonical_semantic_pack_role: 'repo_source_declarative_domain_pack',
        required_domain_pack_paths: [
          'agent/stages/manifest.json',
          'agent/principles/opl-standard-agent-principles.md',
          'agent/principles/domain-specialization.md',
          `agent/prompts/${STARTER_STAGE_ID}.md`,
          `agent/stages/${STARTER_STAGE_ID}.md`,
          'agent/skills/domain_execution.md',
          'agent/tools/domain_affordances.md',
          'agent/knowledge/domain_boundary.md',
          'agent/quality_gates/domain_acceptance.md',
        ],
        source_refs: {
          stage_graph_source_ref: 'agent/stages/manifest.json',
          quality_gate_source_ref: 'agent/quality_gates/domain_acceptance.md',
          executor_policy_source_ref: 'opl-generated:family_stage_control_plane#/stages/0/selected_executor',
          owner_receipt_schema_source_ref: 'contracts/owner_receipt_contract.json',
          authority_functions_source_ref: 'runtime/authority_functions/README.md',
          generated_surface_handoff_source_ref: 'contracts/generated_surface_handoff.json',
          capability_map_source_ref: CAPABILITY_MAP_REF,
          standard_agent_principles_source_ref:
            'contracts/opl-framework/standard-agent-principles.json',
          standard_agent_principles_adoption_source_ref:
            'contracts/standard-agent-principles-adoption.json',
        },
        capability_map_ref: CAPABILITY_MAP_REF,
        standard_stage_pack_conformance: {
          version: STANDARD_STAGE_PACK_CONFORMANCE_VERSION,
          required: true,
          enforcement_ref: 'opl-generated:family_stage_control_plane#stage_pack_conformance_version',
        },
        standard_agent_pack_abi: STANDARD_AGENT_PACK_ABI,
        implementation_profile: STANDARD_AGENT_IMPLEMENTATION_PROFILE,
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
        generated_surfaces: generatedSurfaceDescriptors(),
        handoff_surfaces: generatedSurfaceHandoffSurfaces(),
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
        actions: [starterAction(domainId)],
        forbidden_generic_owner_roles: FORBIDDEN_DOMAIN_GENERIC_OWNER_ROLES,
        notes: [],
        marker: SCAFFOLD_MARKER,
      }),
    },
    {
      path: 'contracts/domain-intake.input.schema.json',
      content: json({
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        required: ['workspace_root'],
        properties: {
          workspace_root: { type: 'string', minLength: 1 },
        },
        additionalProperties: true,
      }),
    },
    {
      path: 'contracts/domain-intake.output.schema.json',
      content: json({
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: {
          owner_receipt_ref: { type: 'string', minLength: 1 },
          typed_blocker_ref: { type: 'string', minLength: 1 },
        },
        oneOf: [
          { required: ['owner_receipt_ref'] },
          { required: ['typed_blocker_ref'] },
        ],
        additionalProperties: true,
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
            'opl_storage_substrate_mas_refs_projection',
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
        domain_retained_thin_surfaces: DOMAIN_RETAINED_THIN_SURFACES,
        forbidden_generic_owner_roles: FORBIDDEN_DOMAIN_GENERIC_OWNER_ROLES,
        modules: functionalPrivatizationModules(domainId),
        authority_boundary: {
          opl_can_write_domain_truth: false,
          opl_can_write_memory_body: false,
          opl_can_authorize_quality_or_export: false,
          domain_can_claim_generic_runtime_owner: false,
          domain_repo_can_own_generated_surface: false,
        },
      }),
    },
    {
      path: 'contracts/private_functional_surface_policy.json',
      content: json({
        ...PRIVATE_FUNCTIONAL_SURFACE_ADMISSION_POLICY,
        domain_id: domainId,
        physical_source_morphology_policy: physicalSourceMorphologyPolicy(domainId),
        marker: SCAFFOLD_MARKER,
      }),
    },
    {
      path: 'contracts/standard_agent_conformance_profile.json',
      content: json({
        ...standardAgentConformanceProfile(domainId),
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
      path: 'contracts/stage_artifact_kernel_adoption.json',
      content: json({
        ...STAGE_ARTIFACT_KERNEL_ADOPTION_POLICY,
        owner: domainId,
        domain_id: domainId,
        opl_state_index_kernel_adoption: {
          ...STATE_INDEX_KERNEL_ADOPTION_POLICY,
          consumer: domainId,
        },
        marker: SCAFFOLD_MARKER,
      }),
    },
    {
      path: 'contracts/stage_run_kernel_profile.json',
      content: json({
        ...STAGE_RUN_KERNEL_PROFILE,
        owner: domainId,
        domain_id: domainId,
        marker: SCAFFOLD_MARKER,
      }),
    },
    {
      path: 'contracts/stage_run_canary_evidence.json',
      content: json({
        ...buildStageRunCanaryEvidence(domainId, STARTER_STAGE_ID),
        marker: SCAFFOLD_MARKER,
      }),
    },
    {
      path: 'contracts/stage_operating_principles.json',
      content: json({
        ...STAGE_OPERATING_PRINCIPLES_POLICY,
        owner: domainId,
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
      content: `# ${domainLabel} Architecture\n\nThis repo owns domain truth, quality/export verdicts, artifact authority, memory body, and owner receipts. Codex CLI owns semantic stage routing. OPL owns StageRun transport, stage-attempt request/projection, ${OBSERVABILITY_ATTEMPT_LEDGER_LABEL}, memory locator transport, artifact lifecycle shell, workbench, and observability projection.\n`,
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

import {
  isRecord,
  optionalString,
  readJsonFile,
  stringList,
} from './standard-domain-agent-conformance-utils.ts';

const REQUIRED_STANDARD_AGENT_PRINCIPLES = [
  'ai_first_execution',
  'contract_backed_boundary',
  'domain_truth_authority',
  'stage_prompt_skill_tool_separation',
  'domain_intake_mapping',
  'workspace_source_intake_shell',
  'owner_delta_progress',
  'quality_budget_progress_first',
  'parallel_executor_autonomy',
  'module_organization',
] as const;

const REQUIRED_AUTHORITY_FALSE_FLAGS = [
  'adoption_can_claim_domain_ready',
  'adoption_can_claim_production_ready',
  'opl_can_write_domain_truth',
  'opl_can_write_memory_body',
  'opl_can_authorize_quality_or_export',
  'opl_can_create_owner_receipt',
  'opl_can_create_typed_blocker',
] as const;

export const STANDARD_AGENT_PRINCIPLES_POLICY = {
  surface_kind: 'opl_standard_agent_principles',
  version: 'standard-agent-principles.v1',
  owner: 'one-person-lab',
  state: 'active_contract',
  purpose:
    'Define the AI-first standard-agent principle pack that every OPL-compatible domain agent adopts before specialization.',
  machine_boundary:
    'Framework-level principle ids, organization roles, and false-authority requirements only. Domain truth, quality verdicts, artifact authority, memory bodies, owner receipts, typed blockers, and production readiness remain domain-owned.',
  principle_ids: REQUIRED_STANDARD_AGENT_PRINCIPLES,
  principles: [
    {
      principle_id: 'ai_first_execution',
      owner: 'one-person-lab',
      summary:
        'AI handles open-ended understanding, comparison, creation, review, diagnosis, and revision inside a bounded stage attempt.',
    },
    {
      principle_id: 'contract_backed_boundary',
      owner: 'one-person-lab',
      summary:
        'Contracts, schemas, tests, and readbacks guard identity, authority, inputs, outputs, evidence, and recovery boundaries instead of scripting AI cognition.',
    },
    {
      principle_id: 'domain_truth_authority',
      owner: 'domain_agent',
      summary:
        'The domain agent owns domain truth, quality/export verdicts, artifact body authority, memory body accept/reject decisions, owner receipts, and typed blockers.',
    },
    {
      principle_id: 'stage_prompt_skill_tool_separation',
      owner: 'one-person-lab',
      summary:
        'Stage prompts define the current goal and accepted answer shape; professional skills carry domain methods; tool catalogs declare affordances, permissions, side effects, and forbidden authority without prescribing strategy.',
    },
    {
      principle_id: 'domain_intake_mapping',
      owner: 'domain_agent',
      summary:
        'domain_intake is the standard starter-stage and owner-handoff pattern, not a standalone Skill. Each domain maps it to its own intake stage, source refs, receipt, or typed blocker surface.',
    },
    {
      principle_id: 'workspace_source_intake_shell',
      owner: 'one-person-lab',
      summary:
        'OPL owns the generic workspace/source intake transport and locator shell; domain source semantics, readiness, provenance, and study/task truth stay with the domain agent.',
    },
    {
      principle_id: 'owner_delta_progress',
      owner: 'one-person-lab',
      summary:
        'A stage moves by deliverable delta, owner receipt, typed blocker, human gate, route-back, or handoff packet; structural conformance cannot claim domain ready or production ready.',
    },
    {
      principle_id: 'quality_budget_progress_first',
      owner: 'one-person-lab',
      summary:
        'When a readable consumable artifact exists, retry, review, repair, and ordinary quality gates are bounded quality budgets; exhaustion advances with completed_with_quality_debt while quality and readiness claims remain closed.',
    },
    {
      principle_id: 'parallel_executor_autonomy',
      owner: 'one-person-lab',
      summary:
        'Domain stages and professional skills may require semantic, evidence, authority, safety, and irreversible-action dependencies. Inside that dependency graph, executors choose tools, iteration, substitutions, and safe parallelism; framework tool catalogs do not prescribe the professional workflow.',
    },
    {
      principle_id: 'module_organization',
      owner: 'one-person-lab',
      summary:
        'OPL brand modules hold framework primitives above domain agents; standard agents are declarative domain packs plus minimal authority functions, and capability packs stay separate from domain intake.',
    },
  ],
  module_organization: {
    framework_module_registry_ref: 'contracts/opl-framework/brand-module-registry.json',
    framework_modules: [
      'charter',
      'atlas',
      'workspace',
      'pack',
      'stagecraft',
      'runway',
      'ledger',
      'console',
      'foundry-lab',
      'connect',
    ],
    standard_domain_agent_shape:
      'declarative_domain_pack_plus_minimal_authority_functions',
    capability_pack_shape:
      'professional_capability_modules_without_domain_truth_or_runtime_authority',
  },
  adoption_contract: {
    required_contract_ref: 'contracts/standard-agent-principles-adoption.json',
    required_projection_ref: 'agent/principles/opl-standard-agent-principles.md',
    required_domain_specialization_ref: 'agent/principles/domain-specialization.md',
    adopted_principle_ids: REQUIRED_STANDARD_AGENT_PRINCIPLES,
    domain_intake_is_standalone_skill: false,
    authority_false_flags: REQUIRED_AUTHORITY_FALSE_FLAGS,
  },
  false_authority_boundary: Object.fromEntries(
    REQUIRED_AUTHORITY_FALSE_FLAGS.map((flag) => [flag, false]),
  ),
} as const;

export function buildStandardAgentPrinciplesAdoption(domainId: string, domainLabel: string) {
  return {
    surface_kind: 'opl_standard_agent_principles_adoption',
    version: 'standard-agent-principles-adoption.v1',
    owner: domainId,
    domain_id: domainId,
    domain_label: domainLabel,
    state: 'active_contract',
    adopted_principle_pack_ref: 'contracts/opl-framework/standard-agent-principles.json',
    adopted_principle_ids: REQUIRED_STANDARD_AGENT_PRINCIPLES,
    source_refs: {
      opl_projection_ref: 'agent/principles/opl-standard-agent-principles.md',
      domain_specialization_ref: 'agent/principles/domain-specialization.md',
      stage_manifest_ref: 'agent/stages/manifest.json',
      stage_control_plane_ref: 'opl-generated:family_stage_control_plane',
      pack_compiler_input_ref: 'contracts/pack_compiler_input.json',
      action_catalog_ref: 'contracts/action_catalog.json',
    },
    domain_mapping: {
      domain_intake: {
        principle_id: 'domain_intake_mapping',
        domain_stage_ref: 'agent/stages/manifest.json#/stages/0',
        stage_id: 'domain_intake',
        prompt_ref: 'agent/prompts/domain_intake.md',
        is_standalone_skill: false,
        owner_receipt_or_typed_blocker_required: false,
        consumable_artifact_progress_receipt_allowed: true,
      },
      workspace_source_intake_shell: {
        principle_id: 'workspace_source_intake_shell',
        opl_owned_shell_ref:
          'contracts/opl-framework/standard-agent-principles.json#principles/workspace_source_intake_shell',
        domain_source_truth_owner: domainId,
      },
    },
    module_organization: {
      framework_module_registry_ref: 'contracts/opl-framework/brand-module-registry.json',
      domain_pack_root: 'agent/',
      domain_pack_role: 'declarative_domain_pack',
      minimal_authority_functions_ref: 'runtime/authority_functions/README.md',
      generated_surface_handoff_ref: 'contracts/generated_surface_handoff.json',
      capability_pack_is_not_domain_intake: true,
    },
    authority_boundary: {
      adoption_can_claim_domain_ready: false,
      adoption_can_claim_production_ready: false,
      opl_can_write_domain_truth: false,
      opl_can_write_memory_body: false,
      opl_can_authorize_quality_or_export: false,
      opl_can_create_owner_receipt: false,
      opl_can_create_typed_blocker: false,
    },
  };
}

export function buildStandardAgentPrincipleAdoptionChecks(repoDir: string) {
  const adoptionFile = readJsonFile(repoDir, 'contracts/standard-agent-principles-adoption.json');
  const adoption = isRecord(adoptionFile.payload) ? adoptionFile.payload : null;
  const sourceRefs = isRecord(adoption?.source_refs) ? adoption.source_refs : {};
  const domainMapping = isRecord(adoption?.domain_mapping) ? adoption.domain_mapping : {};
  const domainIntake = isRecord(domainMapping.domain_intake) ? domainMapping.domain_intake : {};
  const workspaceSourceIntakeShell = isRecord(domainMapping.workspace_source_intake_shell)
    ? domainMapping.workspace_source_intake_shell
    : {};
  const moduleOrganization = isRecord(adoption?.module_organization)
    ? adoption.module_organization
    : {};
  const authority = isRecord(adoption?.authority_boundary) ? adoption.authority_boundary : {};
  const adoptedPrincipleIds = stringList(adoption?.adopted_principle_ids);
  const blockers = [
    adoptionFile.status === 'resolved' ? null : `standard_agent_principles_adoption_${adoptionFile.status}`,
    adoption ? null : 'standard_agent_principles_adoption_not_declared',
    optionalString(adoption?.surface_kind) === 'opl_standard_agent_principles_adoption'
      ? null
      : 'standard_agent_principles_adoption_surface_kind_invalid',
    optionalString(adoption?.state) === 'active_contract'
      ? null
      : 'standard_agent_principles_adoption_state_must_be_active_contract',
    optionalString(adoption?.adopted_principle_pack_ref) === 'contracts/opl-framework/standard-agent-principles.json'
      ? null
      : 'standard_agent_principles_pack_ref_invalid',
    ...REQUIRED_STANDARD_AGENT_PRINCIPLES
      .filter((principleId) => !adoptedPrincipleIds.includes(principleId))
      .map((principleId) => `standard_agent_principle_missing:${principleId}`),
    optionalString(sourceRefs.opl_projection_ref) === 'agent/principles/opl-standard-agent-principles.md'
      ? null
      : 'standard_agent_principles_projection_ref_invalid',
    optionalString(sourceRefs.domain_specialization_ref)?.startsWith('agent/principles/')
      ? null
      : 'standard_agent_domain_specialization_ref_missing',
    optionalString(sourceRefs.stage_manifest_ref) === 'agent/stages/manifest.json'
      ? null
      : 'standard_agent_stage_manifest_ref_invalid',
    [
      'opl-generated:family_stage_control_plane',
      '/product_entry_manifest/family_stage_control_plane',
    ].includes(optionalString(sourceRefs.stage_control_plane_ref) ?? '')
      ? null
      : 'standard_agent_generated_stage_control_plane_ref_invalid',
    optionalString(domainIntake.principle_id) === 'domain_intake_mapping'
      ? null
      : 'standard_agent_domain_intake_principle_mapping_missing',
    [
      'agent/stages/manifest.json#/stages/0',
      '/product_entry_manifest/family_stage_control_plane/stages/0',
    ].includes(optionalString(domainIntake.domain_stage_ref) ?? '')
      ? null
      : 'standard_agent_domain_intake_stage_ref_invalid',
    domainIntake.is_standalone_skill === false
      ? null
      : 'standard_agent_domain_intake_must_not_be_standalone_skill',
    domainIntake.owner_receipt_or_typed_blocker_required === false
      ? null
      : 'standard_agent_domain_intake_owner_receipt_or_blocker_must_not_block_progress',
    domainIntake.consumable_artifact_progress_receipt_allowed === true
      ? null
      : 'standard_agent_domain_intake_consumable_artifact_progress_receipt_required',
    optionalString(workspaceSourceIntakeShell.principle_id) === 'workspace_source_intake_shell'
      ? null
      : 'standard_agent_workspace_source_intake_shell_mapping_missing',
    optionalString(moduleOrganization.framework_module_registry_ref) === 'contracts/opl-framework/brand-module-registry.json'
      ? null
      : 'standard_agent_framework_module_registry_ref_invalid',
    optionalString(moduleOrganization.domain_pack_root) === 'agent/'
      ? null
      : 'standard_agent_domain_pack_root_must_be_agent_slash',
    moduleOrganization.capability_pack_is_not_domain_intake === true
      ? null
      : 'standard_agent_capability_pack_must_not_be_domain_intake',
    ...REQUIRED_AUTHORITY_FALSE_FLAGS
      .filter((flag) => authority[flag] !== false)
      .map((flag) => `standard_agent_principles_${flag}_must_be_false`),
  ].filter((entry): entry is string => Boolean(entry));
  return {
    status: blockers.length === 0 ? 'passed' : 'blocked',
    policy_status: blockers.length === 0 ? 'declared' : 'blocked',
    policy_source: 'contracts/standard-agent-principles-adoption.json',
    adopted_principle_pack_ref: optionalString(adoption?.adopted_principle_pack_ref),
    adopted_principle_ids: adoptedPrincipleIds,
    source_refs: {
      opl_projection_ref: optionalString(sourceRefs.opl_projection_ref),
      domain_specialization_ref: optionalString(sourceRefs.domain_specialization_ref),
      stage_manifest_ref: optionalString(sourceRefs.stage_manifest_ref),
      stage_control_plane_ref: optionalString(sourceRefs.stage_control_plane_ref),
      pack_compiler_input_ref: optionalString(sourceRefs.pack_compiler_input_ref),
    },
    domain_mapping: {
      domain_intake_stage_id: optionalString(domainIntake.stage_id),
      domain_intake_stage_ref: optionalString(domainIntake.domain_stage_ref),
      domain_intake_is_standalone_skill: domainIntake.is_standalone_skill ?? null,
      owner_receipt_or_typed_blocker_required:
        domainIntake.owner_receipt_or_typed_blocker_required ?? null,
      consumable_artifact_progress_receipt_allowed:
        domainIntake.consumable_artifact_progress_receipt_allowed ?? null,
      workspace_source_intake_shell_principle_id:
        optionalString(workspaceSourceIntakeShell.principle_id),
    },
    module_organization: {
      framework_module_registry_ref:
        optionalString(moduleOrganization.framework_module_registry_ref),
      domain_pack_root: optionalString(moduleOrganization.domain_pack_root),
      domain_pack_role: optionalString(moduleOrganization.domain_pack_role),
      capability_pack_is_not_domain_intake:
        moduleOrganization.capability_pack_is_not_domain_intake ?? null,
    },
    authority_boundary: Object.fromEntries(
      REQUIRED_AUTHORITY_FALSE_FLAGS.map((flag) => [flag, authority[flag] ?? null]),
    ),
    blockers,
  };
}

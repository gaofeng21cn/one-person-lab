import { FrameworkContractError } from './contracts.ts';
import type {
  FrameworkContracts,
  ScholarSkillAuthorityBoundary,
  ScholarSkillCapabilityModuleDescriptor,
  ScholarSkillModuleId,
  ScholarSkillsCapabilityModulesContract,
} from './types.ts';

type ValidationCheck = {
  check_id: string;
  status: 'pass' | 'fail';
  detail: string;
};

const AUTHORITY_FALSE_FIELDS = [
  'can_claim_domain_ready',
  'can_claim_quality_verdict',
  'can_claim_artifact_authority',
  'can_claim_production_ready',
  'can_claim_runtime_ready',
  'can_schedule_runtime',
  'can_write_domain_truth',
  'can_write_runtime_state',
  'can_write_memory_body',
  'can_mutate_artifact_body',
  'can_sign_owner_receipt',
  'can_create_typed_blocker',
  'can_replace_domain_owner',
  'can_replace_ai_executor_planning',
] as const satisfies readonly (keyof ScholarSkillAuthorityBoundary)[];

function contract(contracts: FrameworkContracts): ScholarSkillsCapabilityModulesContract {
  return contracts.scholarSkillsCapabilityModules;
}

function assertModuleId(value: string): ScholarSkillModuleId {
  return value as ScholarSkillModuleId;
}

function moduleSummary(module: ScholarSkillCapabilityModuleDescriptor) {
  return {
    module_id: module.module_id,
    display_name: module.display_name,
    brand_family: module.brand_family,
    stage_fit: module.stage_fit,
    dependency_profile_refs: module.dependency_profile_refs,
    run_context_refs: module.run_context_refs,
    invocation_entries: module.invocation_entries,
    authority_boundary: module.authority_boundary,
  };
}

function findModuleOrThrow(
  modules: ScholarSkillCapabilityModuleDescriptor[],
  moduleId: string,
) {
  const module = modules.find((entry) => entry.module_id === moduleId);
  if (!module) {
    throw new FrameworkContractError('cli_usage_error', `Unknown ScholarSkills module: ${moduleId}.`, {
      module_id: moduleId,
      allowed_module_ids: modules.map((entry) => entry.module_id),
    });
  }
  return module;
}

function authorityBoundaryViolations(
  boundary: ScholarSkillAuthorityBoundary,
  prefix: string,
) {
  return AUTHORITY_FALSE_FIELDS
    .filter((field) => boundary[field] !== false)
    .map((field) => `${prefix}.${field}`);
}

function buildValidation(contractRoot: ScholarSkillsCapabilityModulesContract) {
  const seen = new Set<string>();
  const duplicateIds: string[] = [];
  const authorityViolations = [
    ...authorityBoundaryViolations(contractRoot.authority_boundary, 'authority_boundary'),
  ];
  const writeViolations: string[] = [];

  for (const module of contractRoot.modules) {
    if (seen.has(module.module_id)) {
      duplicateIds.push(module.module_id);
    }
    seen.add(module.module_id);
    authorityViolations.push(
      ...authorityBoundaryViolations(module.authority_boundary, `modules.${module.module_id}.authority_boundary`),
    );
    if (module.allowed_writes.length > 0) {
      writeViolations.push(`modules.${module.module_id}.allowed_writes`);
    }
    if (module.forbidden_writes.length === 0) {
      writeViolations.push(`modules.${module.module_id}.forbidden_writes`);
    }
    if (module.receipt_policy.can_sign_owner_receipt !== false) {
      authorityViolations.push(`modules.${module.module_id}.receipt_policy.can_sign_owner_receipt`);
    }
    if (module.quality_evidence.can_claim_quality_verdict !== false) {
      authorityViolations.push(`modules.${module.module_id}.quality_evidence.can_claim_quality_verdict`);
    }
  }

  const checks: ValidationCheck[] = [
    {
      check_id: 'module_count',
      status: contractRoot.modules.length === 10 ? 'pass' : 'fail',
      detail: 'Contract must expose the ten branded OPL ScholarSkills capability modules.',
    },
    {
      check_id: 'unique_module_ids',
      status: duplicateIds.length === 0 ? 'pass' : 'fail',
      detail: duplicateIds.length === 0 ? 'All module ids are unique.' : `Duplicate module ids: ${duplicateIds.join(', ')}`,
    },
    {
      check_id: 'authority_false_flags',
      status: authorityViolations.length === 0 ? 'pass' : 'fail',
      detail: authorityViolations.length === 0 ? 'All authority flags remain false.' : authorityViolations.join(', '),
    },
    {
      check_id: 'write_boundary',
      status: writeViolations.length === 0 ? 'pass' : 'fail',
      detail: writeViolations.length === 0 ? 'Modules do not declare local write authority.' : writeViolations.join(', '),
    },
    {
      check_id: 'runtime_environment_bridge_refs_only',
      status: (
        contractRoot.runtime_environment_bridge.mode === 'refs_only'
        && contractRoot.runtime_environment_bridge.can_write_runtime_state === false
        && contractRoot.runtime_environment_bridge.can_claim_runtime_ready === false
      ) ? 'pass' : 'fail',
      detail: 'Runtime environment bridge must stay refs-only and fail closed to OPL runtime env commands.',
    },
  ];

  return {
    status: checks.every((entry) => entry.status === 'pass') ? 'valid' : 'invalid',
    validated_module_count: contractRoot.modules.length,
    checks,
    authority_boundary_violations: authorityViolations,
    write_boundary_violations: writeViolations,
  };
}

export function buildScholarSkillsCatalog(contracts: FrameworkContracts) {
  const contractRoot = contract(contracts);
  return {
    version: 'g2',
    scholar_skills: {
      surface_kind: 'opl_scholarskills_capability_module_catalog',
      schema_version: contractRoot.schema_version,
      owner: contractRoot.owner,
      state: contractRoot.state,
      brand_family: contractRoot.brand_family,
      purpose: contractRoot.purpose,
      machine_boundary: contractRoot.machine_boundary,
      module_count: contractRoot.modules.length,
      modules: contractRoot.modules.map(moduleSummary),
      runtime_environment_bridge: contractRoot.runtime_environment_bridge,
      authority_boundary: contractRoot.authority_boundary,
      forbidden_claims: [
        'domain_ready',
        'runtime_ready',
        'quality_verdict',
        'artifact_authority',
        'production_ready',
        'owner_receipt',
        'typed_blocker',
      ],
    },
  };
}

export function buildScholarSkillModuleInspect(
  contracts: FrameworkContracts,
  moduleId: string,
) {
  const contractRoot = contract(contracts);
  const module = findModuleOrThrow(contractRoot.modules, assertModuleId(moduleId));
  return {
    version: 'g2',
    scholar_skill_module: {
      surface_kind: 'opl_scholarskills_capability_module_descriptor',
      schema_version: contractRoot.schema_version,
      contract_ref: `contracts/opl-framework/scholar-skills-capability-modules.json#modules.${module.module_id}`,
      runtime_environment_bridge: contractRoot.runtime_environment_bridge,
      ...module,
    },
  };
}

export function buildScholarSkillsInterfaces(contracts: FrameworkContracts) {
  const contractRoot = contract(contracts);
  return {
    version: 'g2',
    scholar_skills_interfaces: {
      surface_kind: 'opl_scholarskills_interface_bundle',
      schema_version: contractRoot.schema_version,
      brand_family: contractRoot.brand_family,
      cli: {
        commands: [
          'opl scholar-skills list --json',
          'opl scholar-skills inspect --module <module_id> --json',
          'opl scholar-skills interfaces --json',
          'opl scholar-skills validate --json',
          'opl scholar-skills doctor --json',
        ],
      },
      contract_refs: [
        'contracts/opl-framework/scholar-skills-capability-modules.json',
        'src/scholar-skills.ts',
        'src/scholar-skills-contract.ts',
      ],
      runtime_environment_bridge: {
        mode: contractRoot.runtime_environment_bridge.mode,
        owner: contractRoot.runtime_environment_bridge.owner,
        commands: [
          ...contractRoot.runtime_environment_bridge.dependency_profile_owner_commands,
          ...contractRoot.runtime_environment_bridge.run_context_owner_commands,
        ],
        can_write_runtime_state: contractRoot.runtime_environment_bridge.can_write_runtime_state,
        can_claim_runtime_ready: contractRoot.runtime_environment_bridge.can_claim_runtime_ready,
        can_claim_domain_ready: contractRoot.runtime_environment_bridge.can_claim_domain_ready,
      },
      authority_boundary: contractRoot.authority_boundary,
    },
  };
}

export function buildScholarSkillsValidation(contracts: FrameworkContracts) {
  const contractRoot = contract(contracts);
  return {
    version: 'g2',
    scholar_skills_validation: {
      surface_kind: 'opl_scholarskills_capability_module_validation',
      schema_version: contractRoot.schema_version,
      ...buildValidation(contractRoot),
      authority_boundary: contractRoot.authority_boundary,
    },
  };
}

export function buildScholarSkillsDoctor(contracts: FrameworkContracts) {
  const contractRoot = contract(contracts);
  const validation = buildValidation(contractRoot);
  return {
    version: 'g2',
    scholar_skills_doctor: {
      surface_kind: 'opl_scholarskills_capability_module_doctor',
      schema_version: contractRoot.schema_version,
      status: validation.status === 'valid' ? 'pass' : 'fail',
      checks: validation.checks,
      runtime_environment_bridge: contractRoot.runtime_environment_bridge,
      authority_boundary: contractRoot.authority_boundary,
      next_action: validation.status === 'valid'
        ? 'consume_catalog_or_inspect_module'
        : 'repair_scholar_skills_contract_before_consumption',
    },
  };
}

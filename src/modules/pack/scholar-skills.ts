import path from 'node:path';
import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { materializeCandidateArtifactBodies } from './scholar-skills-parts/artifact-engines.ts';
import { SCHOLAR_SKILL_MODULE_IDS } from '../../kernel/scholar-skill-module-ids.ts';
import {
  AUTHORITY_FALSE_FIELDS,
  MODULE_REQUIRED_ARTIFACT_REF_FAMILIES,
  moduleContractRef,
  sha256Hex,
  stableJson,
  writeDeterministicJson,
} from './scholar-skills-parts/catalog.ts';
import {
  buildArtifactCandidateRefs,
  buildArtifactCandidateRefTemplates,
  buildExecutionReceiptCandidate,
  buildExecutionReceiptCandidateTemplate,
  buildModuleCandidatePayload,
  moduleCapabilityProfile,
  moduleSummary,
} from './scholar-skills-parts/module-projections.ts';
import type {
  FrameworkContracts,
  ScholarSkillAuthorityBoundary,
  ScholarSkillCapabilityModuleDescriptor,
  ScholarSkillModuleId,
  ScholarSkillsCapabilityModulesContract,
} from '../../kernel/types.ts';

type ValidationCheck = {
  check_id: string;
  status: 'pass' | 'fail';
  detail: string;
};

type PrepareInput = {
  moduleId: string;
  profile: string;
  platform: string;
  requirementProfile: string;
  requirementProfileId?: string;
  artifactRoot: string;
  paperRoot?: string;
  rootOption?: '--artifact-root' | '--paper-root';
  apply?: boolean;
};

type RunContextInput = {
  moduleId: string;
  profile: string;
  platform?: string;
  artifactRoot?: string;
  paperRoot?: string;
  rootOption?: '--artifact-root' | '--paper-root';
};

type RuntimePrepareInput = PrepareInput;

type RuntimeRunContextInput = RunContextInput & {
  platform: string;
  artifactRoot: string;
};

type InvocationInput = {
  moduleId: string;
  inputRef: string;
  artifactRoot: string;
};

type MaterializeInput = InvocationInput & {
  outputRoot: string;
  payload?: unknown;
  emitCandidateArtifacts?: boolean;
};

type RuntimeEnvironmentPrepareReadbackBuilder = (input: {
  domainId: string;
  profileId: string;
  platformId: string;
  requirementProfilePath: string;
  requirementProfileId?: string;
  artifactRoot?: string;
  paperRoot?: string;
  rootOption?: '--artifact-root' | '--paper-root';
  apply?: boolean;
}) => {
  prepare: {
    status: string;
    lock_ref: string | null;
    receipt_ref: string | null;
    run_context_ref: string | null;
    consumer_preflight: Record<string, unknown>;
  };
  can_claim_runtime_ready: boolean;
  can_claim_domain_ready: boolean;
  can_claim_app_release_ready: boolean;
};

type RuntimeEnvironmentRunContextReadbackBuilder = (input: {
  domainId: string;
  profileId: string;
  platformId: string;
  artifactRoot?: string;
  paperRoot?: string;
  rootOption?: '--artifact-root' | '--paper-root';
}) => {
  run_context: {
    status?: string;
    run_context_ref?: string | null;
    consumer_preflight: Record<string, unknown> & { can_consume_run_context?: boolean };
    can_schedule_domain_stage: boolean;
    can_claim_provider_ready: boolean;
    can_claim_runtime_ready: boolean;
    can_claim_domain_ready: boolean;
    can_claim_app_release_ready: boolean;
  };
};

type ScholarSkillsRuntimeDependencies = {
  buildRuntimeEnvironmentPrepareReadback?: RuntimeEnvironmentPrepareReadbackBuilder;
  buildRuntimeEnvironmentRunContextReadback?: RuntimeEnvironmentRunContextReadbackBuilder;
};

function unavailableRuntimeEnvironmentPrepareReadback() {
  return {
    prepare: {
      status: 'runtime_environment_builder_not_injected',
      lock_ref: null,
      receipt_ref: null,
      run_context_ref: null,
      consumer_preflight: {
        status: 'blocked',
        reason: 'runtime_environment_builder_not_injected',
        can_consume_run_context: false,
      },
    },
    can_claim_runtime_ready: false,
    can_claim_domain_ready: false,
    can_claim_app_release_ready: false,
  };
}

function unavailableRuntimeEnvironmentRunContextReadback() {
  return {
    run_context: {
      status: 'runtime_environment_builder_not_injected',
      run_context_ref: null,
      consumer_preflight: {
        status: 'blocked',
        reason: 'runtime_environment_builder_not_injected',
      },
      can_schedule_domain_stage: false,
      can_claim_provider_ready: false,
      can_claim_runtime_ready: false,
      can_claim_domain_ready: false,
      can_claim_app_release_ready: false,
    },
  };
}

function contract(contracts: FrameworkContracts): ScholarSkillsCapabilityModulesContract {
  return contracts.scholarSkillsCapabilityModules;
}

function assertModuleId(value: string): ScholarSkillModuleId {
  return value as ScholarSkillModuleId;
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

function runtimePrepareCommand(input: PrepareInput) {
  return [
    'opl runtime env prepare',
    '--domain mas-scholar-skills',
    `--profile ${input.profile}`,
    `--platform ${input.platform}`,
    `--requirement-profile ${input.requirementProfile}`,
    ...(input.requirementProfileId ? [`--requirement-profile-id ${input.requirementProfileId}`] : []),
    `--artifact-root ${input.artifactRoot}`,
    ...(input.apply === true ? ['--apply'] : []),
    '--json',
  ].join(' ');
}

function runtimeRunContextCommand(input: RunContextInput) {
  const root = input.artifactRoot ?? input.paperRoot;
  return [
    'opl runtime env run-context',
    '--domain mas-scholar-skills',
    `--profile ${input.profile}`,
    ...(input.platform ? [`--platform ${input.platform}`] : []),
    ...(root ? [`--artifact-root ${root}`] : []),
    '--json',
  ].join(' ');
}

function rootVocabulary(input: { artifactRoot?: string; paperRoot?: string; rootOption?: '--artifact-root' | '--paper-root' }) {
  const root = input.artifactRoot ?? input.paperRoot;
  const inputOption = input.rootOption ?? (input.paperRoot && !input.artifactRoot ? '--paper-root' : '--artifact-root');
  return {
    canonical_option: '--artifact-root',
    canonical_field: 'artifact_root_ref',
    input_option: root ? inputOption : null,
    input_option_status: inputOption === '--paper-root' ? 'compatibility_alias' : 'canonical',
    compatibility_aliases: [
      {
        option: '--paper-root',
        field: 'paper_root_ref',
        status: 'compatibility_alias',
        canonical_option: '--artifact-root',
        canonical_field: 'artifact_root_ref',
      },
    ],
  };
}

function scholarSkillMaterializeCommands(contractRoot: ScholarSkillsCapabilityModulesContract) {
  return [
    ...(contractRoot.runtime_environment_bridge.scholar_skill_materialize_commands ?? [
      'opl scholar-skills materialize --module <module_id> --input-ref <ref> --artifact-root <ref-or-path> --output-root <path> --json',
    ]),
    'opl scholar-skills materialize --module <module_id> --input-ref <ref> --artifact-root <ref-or-path> --output-root <path> --emit-candidate-artifacts --payload-file <path> --json',
  ];
}

function buildValidation(contractRoot: ScholarSkillsCapabilityModulesContract) {
  const seen = new Set<string>();
  const duplicateIds: string[] = [];
  const authorityViolations = [
    ...authorityBoundaryViolations(contractRoot.authority_boundary, 'authority_boundary'),
  ];
  const writeViolations: string[] = [];
  const capabilitySurfaceViolations: string[] = [];
  const ownershipBoundaryViolations: string[] = [];

  if (
    contractRoot.ownership_boundary.pack_or_bridge_receipt_counts_as_domain_truth !== false
    || contractRoot.ownership_boundary.pack_or_bridge_receipt_counts_as_citation_truth !== false
  ) {
    ownershipBoundaryViolations.push('ownership_boundary.pack_or_bridge_receipt_counts_as_*');
  }

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
    if (moduleCapabilityProfile(module).required_ref_families.length === 0) {
      capabilitySurfaceViolations.push(`modules.${module.module_id}.required_ref_families`);
    }
    for (const refFamily of MODULE_REQUIRED_ARTIFACT_REF_FAMILIES[module.module_id]) {
      if (!moduleCapabilityProfile(module).required_ref_families.includes(refFamily)) {
        capabilitySurfaceViolations.push(`modules.${module.module_id}.required_ref_families.${refFamily}`);
      }
    }
  }

  const checks: ValidationCheck[] = [
    {
      check_id: 'module_count',
      status: contractRoot.modules.length === SCHOLAR_SKILL_MODULE_IDS.length ? 'pass' : 'fail',
      detail: `Contract must expose the ${SCHOLAR_SKILL_MODULE_IDS.length} active MAS Scholar Skills capability modules.`,
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
      check_id: 'module_specific_capability_surfaces',
      status: capabilitySurfaceViolations.length === 0 ? 'pass' : 'fail',
      detail: capabilitySurfaceViolations.length === 0
        ? 'All modules expose module-specific required ref families.'
        : capabilitySurfaceViolations.join(', '),
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
    {
      check_id: 'runtime_bridge_envelope_policy_refs_only',
      status: (
        contractRoot.runtime_environment_bridge.bridge_envelope_policy === undefined
        || (
          contractRoot.runtime_environment_bridge.bridge_envelope_policy.refs_only === true
          && contractRoot.runtime_environment_bridge.bridge_envelope_policy.prepared === false
          && contractRoot.runtime_environment_bridge.bridge_envelope_policy.can_claim_cache_hit === false
          && contractRoot.runtime_environment_bridge.bridge_envelope_policy.can_write_runtime_state === false
          && contractRoot.runtime_environment_bridge.bridge_envelope_policy.can_claim_runtime_ready === false
          && contractRoot.runtime_environment_bridge.bridge_envelope_policy.can_mutate_artifact_body === false
          && contractRoot.runtime_environment_bridge.bridge_envelope_policy.can_sign_owner_receipt === false
          && contractRoot.runtime_environment_bridge.bridge_envelope_policy.can_create_typed_blocker === false
        )
      ) ? 'pass' : 'fail',
      detail: 'ScholarSkills bridge envelopes must remain deterministic refs-only candidates.',
    },
    {
      check_id: 'ownership_boundary_no_domain_truth',
      status: ownershipBoundaryViolations.length === 0 ? 'pass' : 'fail',
      detail: ownershipBoundaryViolations.length === 0
        ? 'OPL-owned package, sync, and runtime bridge receipts do not count as domain or citation truth.'
        : ownershipBoundaryViolations.join(', '),
    },
  ];

  return {
    status: checks.every((entry) => entry.status === 'pass') ? 'valid' : 'invalid',
    validated_module_count: contractRoot.modules.length,
    checks,
    authority_boundary_violations: authorityViolations,
    write_boundary_violations: writeViolations,
    capability_surface_violations: capabilitySurfaceViolations,
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
      ownership_boundary: contractRoot.ownership_boundary,
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
      ownership_boundary: contractRoot.ownership_boundary,
      module_profile: moduleCapabilityProfile(module),
      artifact_candidate_refs: buildArtifactCandidateRefTemplates(module),
      execution_receipt_candidate: buildExecutionReceiptCandidateTemplate(module),
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
        canonical_command_family: 'opl capability-pack',
        compatibility_alias: 'opl scholar-skills',
        alias_scope: 'mas_scholar_skills_capability_pack_only',
        canonical_commands: [
          'opl capability-pack scholar-skills list --json',
          'opl capability-pack scholar-skills inspect --module <module_id> --json',
          'opl capability-pack scholar-skills prepare --module <module_id> --profile <profile> --platform <platform> --requirement-profile <path> --artifact-root <path> --json',
          'opl capability-pack scholar-skills run-context --module <module_id> --profile <profile> --json',
          'opl capability-pack scholar-skills invoke --module <module_id> --input-ref <ref> --artifact-root <ref> --json',
          'opl capability-pack scholar-skills receipt --module <module_id> --input-ref <ref> --artifact-root <ref> --json',
          'opl capability-pack scholar-skills materialize --module <module_id> --input-ref <ref> --artifact-root <ref-or-path> --output-root <path> --json',
          'opl capability-pack scholar-skills validate --json',
          'opl capability-pack scholar-skills doctor --json',
        ],
        commands: [
          'opl scholar-skills list --json',
          'opl scholar-skills inspect --module <module_id> --json',
          ...(contractRoot.runtime_environment_bridge.scholar_skill_prepare_commands ?? [
            'opl scholar-skills prepare --module <module_id> --profile <profile> --platform <platform> --requirement-profile <path> --artifact-root <path> --json',
          ]),
          ...(contractRoot.runtime_environment_bridge.scholar_skill_run_context_commands ?? [
            'opl scholar-skills run-context --module <module_id> --profile <profile> --json',
          ]),
          ...(contractRoot.runtime_environment_bridge.scholar_skill_invocation_commands ?? [
            'opl scholar-skills invoke --module <module_id> --input-ref <ref> --artifact-root <ref> --json',
          ]),
          ...(contractRoot.runtime_environment_bridge.scholar_skill_receipt_commands ?? [
            'opl scholar-skills receipt --module <module_id> --input-ref <ref> --artifact-root <ref> --json',
          ]),
          ...scholarSkillMaterializeCommands(contractRoot),
          ...(contractRoot.runtime_environment_bridge.scholar_skill_runtime_prepare_commands ?? [
            'opl scholar-skills runtime-prepare --module <module_id> --profile <profile> --platform <platform> --requirement-profile <path> --artifact-root <path> [--apply] --json',
          ]),
          ...(contractRoot.runtime_environment_bridge.scholar_skill_runtime_run_context_commands ?? [
            'opl scholar-skills runtime-run-context --module <module_id> --profile <profile> --platform <platform> --artifact-root <path> --json',
          ]),
          'opl scholar-skills interfaces --json',
          'opl scholar-skills validate --json',
          'opl scholar-skills doctor --json',
        ],
      },
      contract_refs: [
        'contracts/opl-framework/scholar-skills-capability-modules.json',
        'src/scholar-skills.ts',
        'src/modules/charter/contract-validators/scholar-skills-contract.ts',
      ],
      runtime_environment_bridge: {
        mode: contractRoot.runtime_environment_bridge.mode,
        owner: contractRoot.runtime_environment_bridge.owner,
        commands: [
          ...contractRoot.runtime_environment_bridge.dependency_profile_owner_commands,
          ...contractRoot.runtime_environment_bridge.run_context_owner_commands,
          ...(contractRoot.runtime_environment_bridge.scholar_skill_prepare_commands ?? []),
          ...(contractRoot.runtime_environment_bridge.scholar_skill_run_context_commands ?? []),
          ...(contractRoot.runtime_environment_bridge.scholar_skill_invocation_commands ?? []),
          ...(contractRoot.runtime_environment_bridge.scholar_skill_receipt_commands ?? []),
          ...scholarSkillMaterializeCommands(contractRoot),
          ...(contractRoot.runtime_environment_bridge.scholar_skill_runtime_prepare_commands ?? []),
          ...(contractRoot.runtime_environment_bridge.scholar_skill_runtime_run_context_commands ?? []),
        ],
        bridge_envelope_policy: contractRoot.runtime_environment_bridge.bridge_envelope_policy,
        can_write_runtime_state: contractRoot.runtime_environment_bridge.can_write_runtime_state,
        can_claim_runtime_ready: contractRoot.runtime_environment_bridge.can_claim_runtime_ready,
        can_claim_domain_ready: contractRoot.runtime_environment_bridge.can_claim_domain_ready,
      },
      ownership_boundary: contractRoot.ownership_boundary,
      authority_boundary: contractRoot.authority_boundary,
    },
  };
}

export function buildScholarSkillsRuntimePrepareReadback(
  contracts: FrameworkContracts,
  input: RuntimePrepareInput,
  dependencies: ScholarSkillsRuntimeDependencies = {},
) {
  const contractRoot = contract(contracts);
  const module = findModuleOrThrow(contractRoot.modules, assertModuleId(input.moduleId));
  const runtimeEnvironment = (dependencies.buildRuntimeEnvironmentPrepareReadback
    ?? unavailableRuntimeEnvironmentPrepareReadback)({
    domainId: 'scholarskills',
    profileId: input.profile,
    platformId: input.platform,
    requirementProfilePath: input.requirementProfile,
    requirementProfileId: input.requirementProfileId,
    artifactRoot: input.artifactRoot,
    paperRoot: input.paperRoot,
    rootOption: input.rootOption,
    apply: input.apply,
  });
  return {
    version: 'g2',
    scholar_skills_runtime_prepare: {
      surface_kind: 'opl_scholarskills_runtime_prepare_bridge',
      status: runtimeEnvironment.prepare.status,
      module_id: module.module_id,
      profile: input.profile,
      platform: input.platform,
      descriptor_ref: moduleContractRef(module),
      runtime_domain_id: 'scholarskills',
      runtime_owner_command: runtimePrepareCommand(input),
      requirement_profile_id: input.requirementProfileId ?? null,
      apply_requested: input.apply === true,
      dependency_lock_ref: runtimeEnvironment.prepare.lock_ref,
      dependency_receipt_ref: runtimeEnvironment.prepare.receipt_ref,
      dependency_run_context_ref: runtimeEnvironment.prepare.run_context_ref,
      consumer_preflight: runtimeEnvironment.prepare.consumer_preflight,
      runtime_environment: runtimeEnvironment,
      writes: {
        dependency_lock_written: true,
        dependency_receipt_written: true,
        dependency_run_context_written: runtimeEnvironment.prepare.run_context_ref !== null,
        domain_truth_written: false,
        artifact_body_written: false,
        owner_receipt_signed: false,
        typed_blocker_created: false,
      },
      can_claim_runtime_ready: runtimeEnvironment.can_claim_runtime_ready,
      can_claim_domain_ready: runtimeEnvironment.can_claim_domain_ready,
      can_claim_app_release_ready: runtimeEnvironment.can_claim_app_release_ready,
      can_sign_owner_receipt: module.authority_boundary.can_sign_owner_receipt,
      can_create_typed_blocker: module.authority_boundary.can_create_typed_blocker,
      authority_boundary: module.authority_boundary,
    },
  };
}

export function buildScholarSkillsRuntimeRunContextReadback(
  contracts: FrameworkContracts,
  input: RuntimeRunContextInput,
  dependencies: ScholarSkillsRuntimeDependencies = {},
) {
  const contractRoot = contract(contracts);
  const module = findModuleOrThrow(contractRoot.modules, assertModuleId(input.moduleId));
  const runtimeEnvironment = (dependencies.buildRuntimeEnvironmentRunContextReadback
    ?? unavailableRuntimeEnvironmentRunContextReadback)({
    domainId: 'scholarskills',
    profileId: input.profile,
    platformId: input.platform,
    artifactRoot: input.artifactRoot,
    paperRoot: input.paperRoot,
    rootOption: input.rootOption,
  });
  return {
    version: 'g2',
    scholar_skills_runtime_run_context: {
      surface_kind: 'opl_scholarskills_runtime_run_context_bridge',
      status: runtimeEnvironment.run_context.status ?? 'unknown',
      module_id: module.module_id,
      profile: input.profile,
      platform: input.platform,
      descriptor_ref: moduleContractRef(module),
      runtime_domain_id: 'scholarskills',
      runtime_owner_command: runtimeRunContextCommand(input),
      artifact_root_ref: input.artifactRoot ?? input.paperRoot,
      root_vocabulary: rootVocabulary(input),
      run_context_ref: runtimeEnvironment.run_context.run_context_ref ?? null,
      consumer_preflight: runtimeEnvironment.run_context.consumer_preflight,
      runtime_environment: runtimeEnvironment,
      can_consume_run_context:
        (runtimeEnvironment.run_context.consumer_preflight as Record<string, unknown>).can_consume_run_context === true,
      can_schedule_domain_stage: runtimeEnvironment.run_context.can_schedule_domain_stage,
      can_claim_provider_ready: runtimeEnvironment.run_context.can_claim_provider_ready,
      can_claim_runtime_ready: runtimeEnvironment.run_context.can_claim_runtime_ready,
      can_claim_domain_ready: runtimeEnvironment.run_context.can_claim_domain_ready,
      can_claim_app_release_ready: runtimeEnvironment.run_context.can_claim_app_release_ready,
      can_sign_owner_receipt: module.authority_boundary.can_sign_owner_receipt,
      can_create_typed_blocker: module.authority_boundary.can_create_typed_blocker,
      authority_boundary: module.authority_boundary,
    },
  };
}

export function buildScholarSkillsPrepareEnvelope(
  contracts: FrameworkContracts,
  input: PrepareInput,
) {
  const contractRoot = contract(contracts);
  const module = findModuleOrThrow(contractRoot.modules, assertModuleId(input.moduleId));
  return {
    version: 'g2',
    scholar_skills_prepare: {
      surface_kind: 'opl_scholarskills_dependency_prepare_ref_envelope',
      status: 'prepared_ref_envelope',
      prepared: false,
      module_id: module.module_id,
      profile: input.profile,
      platform: input.platform,
      descriptor_ref: moduleContractRef(module),
      module_profile: moduleCapabilityProfile(module),
      artifact_candidate_refs: buildArtifactCandidateRefTemplates(module),
      execution_receipt_candidate: buildExecutionReceiptCandidateTemplate(module),
      dependency_profile_refs: module.dependency_profile_refs,
      runtime_owner_command: runtimePrepareCommand(input),
      inputs: {
        requirement_profile_ref: input.requirementProfile,
        artifact_root_ref: input.artifactRoot,
        root_vocabulary: rootVocabulary(input),
      },
      cache_policy: {
        can_claim_cache_hit: false,
        cache_hit_claimed: false,
      },
      writes: {
        runtime_state_written: false,
        artifact_root_written: false,
        artifact_body_written: false,
        owner_receipt_signed: false,
      },
      can_write_runtime_state: contractRoot.runtime_environment_bridge.can_write_runtime_state,
      can_claim_runtime_ready: contractRoot.runtime_environment_bridge.can_claim_runtime_ready,
      can_claim_domain_ready: contractRoot.runtime_environment_bridge.can_claim_domain_ready,
      authority_boundary: module.authority_boundary,
    },
  };
}

export function buildScholarSkillsRunContextEnvelope(
  contracts: FrameworkContracts,
  input: RunContextInput,
) {
  const contractRoot = contract(contracts);
  const module = findModuleOrThrow(contractRoot.modules, assertModuleId(input.moduleId));
  return {
    version: 'g2',
    scholar_skills_run_context: {
      surface_kind: 'opl_scholarskills_run_context_ref_envelope',
      status: 'run_context_ref_envelope',
      module_id: module.module_id,
      profile: input.profile,
      descriptor_ref: moduleContractRef(module),
      module_profile: moduleCapabilityProfile(module),
      artifact_candidate_refs: buildArtifactCandidateRefTemplates(module),
      execution_receipt_candidate: buildExecutionReceiptCandidateTemplate(module),
      run_context_refs: module.run_context_refs,
      runtime_owner_command: runtimeRunContextCommand(input),
      can_write_runtime_state: contractRoot.runtime_environment_bridge.can_write_runtime_state,
      can_claim_runtime_ready: contractRoot.runtime_environment_bridge.can_claim_runtime_ready,
      can_claim_domain_ready: contractRoot.runtime_environment_bridge.can_claim_domain_ready,
      can_schedule_runtime: module.authority_boundary.can_schedule_runtime,
      authority_boundary: module.authority_boundary,
    },
  };
}

export function buildScholarSkillsReceiptCandidate(
  contracts: FrameworkContracts,
  input: InvocationInput,
) {
  const contractRoot = contract(contracts);
  const module = findModuleOrThrow(contractRoot.modules, assertModuleId(input.moduleId));
  return {
    version: 'g2',
    scholar_skills_receipt_candidate: buildExecutionReceiptCandidate(module, input),
  };
}

export function buildScholarSkillsMaterializeSurface(
  contracts: FrameworkContracts,
  input: MaterializeInput,
) {
  const contractRoot = contract(contracts);
  const module = findModuleOrThrow(contractRoot.modules, assertModuleId(input.moduleId));
  const outputRoot = path.resolve(input.outputRoot);
  const candidateArtifactBodies = input.emitCandidateArtifacts === true && input.payload !== undefined
    ? materializeCandidateArtifactBodies({
      module,
      inputRef: input.inputRef,
      artifactRoot: input.artifactRoot,
      outputRoot,
      payload: input.payload,
    })
    : [];
  const receiptCandidate = buildExecutionReceiptCandidate(module, input, candidateArtifactBodies);
  const moduleCandidate = buildModuleCandidatePayload(module, input, candidateArtifactBodies);
  const refsManifest = {
    surface_kind: 'opl_scholarskills_refs_manifest',
    status: 'candidate_refs_manifest',
    module_id: module.module_id,
    input_ref: input.inputRef,
    artifact_root_ref: input.artifactRoot,
    execution_receipt_ref: receiptCandidate.execution_receipt_ref,
    execution_receipt_refs: receiptCandidate.execution_receipt_refs,
    artifact_candidate_refs: receiptCandidate.artifact_candidate_refs,
    candidate_artifact_bodies: candidateArtifactBodies,
    artifact_body_written: candidateArtifactBodies.length > 0,
    authority_boundary: module.authority_boundary,
  };
  const manifest = {
    surface_kind: 'opl_scholarskills_materialized_candidate_package_manifest',
    status: 'materialized_candidate_package',
    module_id: module.module_id,
    descriptor_ref: moduleContractRef(module),
    input_ref: input.inputRef,
    artifact_root_ref: input.artifactRoot,
    output_root: outputRoot,
    output_root_ref: `file://${outputRoot}`,
    execution_receipt_ref: receiptCandidate.execution_receipt_ref,
    execution_receipt_candidate_path: path.join(outputRoot, 'execution_receipt_candidate.json'),
    module_candidate_path: path.join(outputRoot, 'module_candidate.json'),
    refs_manifest_path: path.join(outputRoot, 'refs_manifest.json'),
    artifact_manifest_path: path.join(outputRoot, 'manifest.json'),
    package_policy: candidateArtifactBodies.length > 0
      ? 'deterministic_non_authoritative_candidate_artifact_package'
      : 'deterministic_refs_only_candidate_package',
    module_candidate: {
      surface_kind: moduleCandidate.surface_kind,
      status: moduleCandidate.status,
      module_id: moduleCandidate.module_id,
      artifact_candidate_ref_families: moduleCandidate.artifact_candidate_ref_families,
      candidate_artifact_bodies: candidateArtifactBodies,
      execution_receipt_ref_families: moduleCandidate.execution_receipt_ref_families,
      quality_evidence_kind: moduleCandidate.quality_checklist.evidence_kind,
      owner_consumption_required_for_paper_truth: moduleCandidate.owner_consumption.required_for_paper_truth,
      counts_as_paper_truth: moduleCandidate.owner_consumption.counts_as_paper_truth,
      can_authorize_publication_readiness: moduleCandidate.owner_consumption.can_authorize_publication_readiness,
    },
    written_body_authority: {
      runtime_db_written: false,
      domain_truth_written: false,
      owner_receipt_signed: false,
      typed_blocker_created: false,
      paper_body_written: false,
      artifact_body_written: candidateArtifactBodies.length > 0,
    },
    authority_flags: {
      counts_as_paper_truth: false,
      counts_as_owner_receipt: false,
      can_authorize_publication_readiness: false,
      can_claim_domain_ready: false,
      can_claim_quality_verdict: false,
      can_claim_artifact_authority: false,
      can_claim_production_ready: false,
      can_claim_runtime_ready: false,
      can_schedule_runtime: false,
      can_write_domain_truth: false,
      can_write_runtime_state: false,
      can_write_memory_body: false,
      can_mutate_artifact_body: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
    },
  };
  const writtenFileEntries = [
    writeDeterministicJson(manifest.artifact_manifest_path, manifest),
    writeDeterministicJson(manifest.execution_receipt_candidate_path, receiptCandidate),
    writeDeterministicJson(manifest.module_candidate_path, moduleCandidate),
    writeDeterministicJson(manifest.refs_manifest_path, refsManifest),
    ...candidateArtifactBodies.map((entry) => ({
      path: entry.body_path,
      sha256: entry.body_sha256,
    })),
  ];
  const writtenFiles = writtenFileEntries.map((entry) => entry.path);
  const packageSha256 = sha256Hex(stableJson(writtenFileEntries));

  return {
    version: 'g2',
    scholar_skills_materialize: {
      surface_kind: 'opl_scholarskills_materialized_candidate_package',
      status: 'materialized_candidate_package',
      module_id: module.module_id,
      input_ref: input.inputRef,
      artifact_root_ref: input.artifactRoot,
      output_root: outputRoot,
      output_root_ref: `file://${outputRoot}`,
      execution_receipt_ref: receiptCandidate.execution_receipt_ref,
      execution_receipt_candidate_path: manifest.execution_receipt_candidate_path,
      module_candidate_path: manifest.module_candidate_path,
      artifact_manifest_path: manifest.artifact_manifest_path,
      refs_manifest_path: manifest.refs_manifest_path,
      candidate_artifact_bodies: candidateArtifactBodies,
      written_files: writtenFiles,
      sha256: packageSha256,
      file_sha256: Object.fromEntries(writtenFileEntries.map((entry) => [entry.path, entry.sha256])),
      authority_flags: manifest.authority_flags,
      writes: manifest.written_body_authority,
      authority_boundary: module.authority_boundary,
    },
  };
}

export function buildScholarSkillsInvocationEnvelope(
  contracts: FrameworkContracts,
  input: InvocationInput,
) {
  const contractRoot = contract(contracts);
  const module = findModuleOrThrow(contractRoot.modules, assertModuleId(input.moduleId));
  return {
    version: 'g2',
    scholar_skills_invocation: {
      surface_kind: 'opl_scholarskills_invocation_ref_envelope',
      status: 'invocation_ref_envelope',
      module_id: module.module_id,
      input_ref: input.inputRef,
      artifact_root_ref: input.artifactRoot,
      descriptor_ref: moduleContractRef(module),
      invocation_entries: module.invocation_entries,
      expected_artifact_refs: buildArtifactCandidateRefs(module, input.artifactRoot),
      execution_receipt_candidate: buildExecutionReceiptCandidate(module, input),
      writes: {
        artifact_body_written: false,
        runtime_state_written: false,
        owner_receipt_signed: false,
        typed_blocker_created: false,
      },
      can_mutate_artifact_body: module.authority_boundary.can_mutate_artifact_body,
      can_sign_owner_receipt: module.authority_boundary.can_sign_owner_receipt,
      can_claim_artifact_authority: module.authority_boundary.can_claim_artifact_authority,
      can_claim_quality_verdict: module.quality_evidence.can_claim_quality_verdict,
      authority_boundary: module.authority_boundary,
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

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { FrameworkContractError } from './contracts.ts';
import {
  buildRuntimeEnvironmentPrepareReadback,
  buildRuntimeEnvironmentRunContextReadback,
} from './runtime-environment-substrate.ts';
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

type PrepareInput = {
  moduleId: string;
  profile: string;
  platform: string;
  requirementProfile: string;
  requirementProfileId?: string;
  paperRoot: string;
  apply?: boolean;
};

type RunContextInput = {
  moduleId: string;
  profile: string;
  platform?: string;
  paperRoot?: string;
};

type RuntimePrepareInput = PrepareInput;

type RuntimeRunContextInput = RunContextInput & {
  platform: string;
  paperRoot: string;
};

type InvocationInput = {
  moduleId: string;
  inputRef: string;
  artifactRoot: string;
};

type MaterializeInput = InvocationInput & {
  outputRoot: string;
};

const MODULE_REQUIRED_ARTIFACT_REF_FAMILIES = {
  'opl.scholarskills.display': ['display_pack_agent_orchestration'],
  'opl.scholarskills.tables': ['table_manifest', 'table_qc'],
  'opl.scholarskills.stats': ['analysis_manifest', 'reproducibility_check'],
  'opl.scholarskills.omics': ['omics_pipeline_manifest', 'feature_matrix_qc'],
  'opl.scholarskills.lit': ['evidence_map', 'citation_manifest'],
  'opl.scholarskills.write': ['draft_section_manifest', 'source_trace'],
  'opl.scholarskills.review': ['reviewer_report', 'route_back'],
  'opl.scholarskills.submit': ['package_manifest', 'submission_checklist'],
  'opl.scholarskills.data': ['data_manifest', 'lineage_readiness'],
  'opl.scholarskills.intake': ['source_snapshot', 'adoption_contract'],
} as const satisfies Record<ScholarSkillModuleId, readonly string[]>;

const MODULE_EXECUTION_RECEIPT_REF_FAMILIES = {
  'opl.scholarskills.display': [
    'input_fingerprint',
    'dependency_profile',
    'prepared_run_context',
    'render_cache',
    'artifact_manifest',
    'visual_audit_or_gallery_preview',
  ],
  'opl.scholarskills.tables': [
    'input_fingerprint',
    'dependency_profile',
    'prepared_run_context',
    'table_manifest',
    'table_qc',
  ],
  'opl.scholarskills.stats': [
    'input_fingerprint',
    'dependency_profile',
    'prepared_run_context',
    'analysis_manifest',
    'reproducibility_check',
  ],
  'opl.scholarskills.omics': [
    'input_fingerprint',
    'dependency_profile',
    'prepared_run_context',
    'omics_pipeline_manifest',
    'feature_matrix_qc',
  ],
  'opl.scholarskills.lit': [
    'input_fingerprint',
    'dependency_profile',
    'prepared_run_context',
    'evidence_map',
    'citation_manifest',
  ],
  'opl.scholarskills.write': [
    'input_fingerprint',
    'dependency_profile',
    'prepared_run_context',
    'draft_section_manifest',
    'source_trace',
  ],
  'opl.scholarskills.review': [
    'input_fingerprint',
    'dependency_profile',
    'prepared_run_context',
    'reviewer_report',
    'route_back',
  ],
  'opl.scholarskills.submit': [
    'input_fingerprint',
    'dependency_profile',
    'prepared_run_context',
    'package_manifest',
    'submission_checklist',
  ],
  'opl.scholarskills.data': [
    'input_fingerprint',
    'dependency_profile',
    'prepared_run_context',
    'data_manifest',
    'lineage_readiness',
  ],
  'opl.scholarskills.intake': [
    'input_fingerprint',
    'dependency_profile',
    'prepared_run_context',
    'source_snapshot',
    'adoption_contract',
  ],
} as const satisfies Record<ScholarSkillModuleId, readonly string[]>;

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

function moduleProfileId(module: ScholarSkillCapabilityModuleDescriptor) {
  return module.module_id.replace('opl.scholarskills.', '');
}

function moduleArtifactRefFamilies(module: ScholarSkillCapabilityModuleDescriptor) {
  return [...MODULE_REQUIRED_ARTIFACT_REF_FAMILIES[module.module_id]];
}

function moduleExecutionReceiptRefFamilies(module: ScholarSkillCapabilityModuleDescriptor) {
  return [...MODULE_EXECUTION_RECEIPT_REF_FAMILIES[module.module_id]];
}

function moduleCapabilityProfile(module: ScholarSkillCapabilityModuleDescriptor) {
  return {
    surface_kind: 'opl_scholarskills_module_capability_profile',
    module_id: module.module_id,
    profile_id: moduleProfileId(module),
    stage_fit: module.stage_fit,
    input_schema_refs: module.input_schema_refs,
    output_schema_refs: module.output_schema_refs,
    dependency_profile_refs: module.dependency_profile_refs,
    run_context_refs: module.run_context_refs,
    invocation_entries: module.invocation_entries,
    artifact_ref_families: moduleArtifactRefFamilies(module),
    artifact_refs: module.artifact_refs,
    quality_evidence: module.quality_evidence,
    required_ref_families: [
      ...new Set([
        ...moduleExecutionReceiptRefFamilies(module),
        ...moduleArtifactRefFamilies(module),
      ]),
    ],
    execution_receipt_ref_families: moduleExecutionReceiptRefFamilies(module),
    authority_boundary: module.authority_boundary,
  };
}

function moduleSummary(module: ScholarSkillCapabilityModuleDescriptor) {
  return {
    module_id: module.module_id,
    display_name: module.display_name,
    brand_family: module.brand_family,
    stage_fit: module.stage_fit,
    input_schema_refs: module.input_schema_refs,
    output_schema_refs: module.output_schema_refs,
    dependency_profile_refs: module.dependency_profile_refs,
    run_context_refs: module.run_context_refs,
    invocation_entries: module.invocation_entries,
    artifact_refs: module.artifact_refs,
    quality_evidence: module.quality_evidence,
    module_profile: moduleCapabilityProfile(module),
    authority_boundary: module.authority_boundary,
  };
}

function moduleContractRef(module: ScholarSkillCapabilityModuleDescriptor) {
  return `contracts/opl-framework/scholar-skills-capability-modules.json#modules.${module.module_id}`;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`;
}

function sha256Hex(value: string | Buffer) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function writeDeterministicJson(filePath: string, payload: unknown) {
  const content = `${stableJson(payload)}\n`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  return {
    path: filePath,
    sha256: sha256Hex(content),
  };
}

function stableExecutionReceiptRef(
  module: ScholarSkillCapabilityModuleDescriptor,
  input: InvocationInput,
) {
  const identity = {
    module_id: module.module_id,
    input_ref: input.inputRef,
    artifact_root_ref: input.artifactRoot,
  };
  const digest = crypto.createHash('sha256').update(JSON.stringify(identity)).digest('hex');
  return `opl://scholarskills/execution-receipt-candidates/${encodeURIComponent(module.module_id)}/${digest}`;
}

function buildExecutionReceiptRefs(
  module: ScholarSkillCapabilityModuleDescriptor,
  input: InvocationInput,
) {
  const receiptRef = stableExecutionReceiptRef(module, input);
  return Object.fromEntries(
    moduleExecutionReceiptRefFamilies(module).map((family) => [
      `${family}_ref`,
      `${receiptRef}#${family}_ref`,
    ]),
  );
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
    '--domain scholarskills',
    `--profile ${input.profile}`,
    `--platform ${input.platform}`,
    `--requirement-profile ${input.requirementProfile}`,
    ...(input.requirementProfileId ? [`--requirement-profile-id ${input.requirementProfileId}`] : []),
    `--paper-root ${input.paperRoot}`,
    ...(input.apply === true ? ['--apply'] : []),
    '--json',
  ].join(' ');
}

function runtimeRunContextCommand(input: RunContextInput) {
  return [
    'opl runtime env run-context',
    '--domain scholarskills',
    `--profile ${input.profile}`,
    ...(input.platform ? [`--platform ${input.platform}`] : []),
    ...(input.paperRoot ? [`--paper-root ${input.paperRoot}`] : []),
    '--json',
  ].join(' ');
}

function buildArtifactCandidateRefs(
  module: ScholarSkillCapabilityModuleDescriptor,
  artifactRoot: string,
) {
  const descriptorArtifactRef = module.artifact_refs[0];
  return moduleArtifactRefFamilies(module).map((refFamily) => ({
    ref_id: refFamily,
    ref_kind: descriptorArtifactRef?.ref_kind ?? 'candidate_artifact_ref',
    role: `${moduleProfileId(module)}_${refFamily}_candidate_ref`,
    body_policy: descriptorArtifactRef?.body_policy ?? 'body_owned_by_domain_artifact_surface',
    descriptor_artifact_refs: module.artifact_refs,
    ref_family: refFamily,
    ref: `${artifactRoot}/${refFamily}`,
    materialization_status: 'expected_ref_only',
    body_written: false,
    can_mutate_artifact_body: module.authority_boundary.can_mutate_artifact_body,
  }));
}

function buildArtifactCandidateRefTemplates(module: ScholarSkillCapabilityModuleDescriptor) {
  const descriptorArtifactRef = module.artifact_refs[0];
  return moduleArtifactRefFamilies(module).map((refFamily) => ({
    ref_id: refFamily,
    ref_kind: descriptorArtifactRef?.ref_kind ?? 'candidate_artifact_ref',
    role: `${moduleProfileId(module)}_${refFamily}_candidate_ref`,
    body_policy: descriptorArtifactRef?.body_policy ?? 'body_owned_by_domain_artifact_surface',
    descriptor_artifact_refs: module.artifact_refs,
    ref_family: refFamily,
    ref_template: `<artifact-root>/${refFamily}`,
    materialization_status: 'expected_ref_only',
    body_written: false,
    can_mutate_artifact_body: module.authority_boundary.can_mutate_artifact_body,
  }));
}

function buildExecutionReceiptCandidate(
  module: ScholarSkillCapabilityModuleDescriptor,
  input: InvocationInput,
) {
  const executionReceiptRef = stableExecutionReceiptRef(module, input);
  const moduleProfile = moduleCapabilityProfile(module);
  return {
    surface_kind: 'opl_scholarskills_execution_receipt_candidate',
    status: 'receipt_candidate_unsigned',
    module_id: module.module_id,
    module_profile: moduleProfile,
    input_ref: input.inputRef,
    artifact_root_ref: input.artifactRoot,
    descriptor_ref: moduleContractRef(module),
    artifact_candidate_ref_families: moduleProfile.artifact_ref_families,
    artifact_candidate_refs: buildArtifactCandidateRefs(module, input.artifactRoot),
    required_ref_families: moduleProfile.required_ref_families,
    execution_receipt_ref: executionReceiptRef,
    execution_receipt_ref_families: moduleProfile.execution_receipt_ref_families,
    execution_receipt_refs: buildExecutionReceiptRefs(module, input),
    execution_receipt_counts_as_candidate_artifact: true,
    counts_as_paper_truth: false,
    counts_as_owner_receipt: false,
    can_authorize_publication_readiness: false,
    accepted_receipt_refs: module.receipt_policy.accepted_receipt_refs,
    receipt_body_policy: module.receipt_policy.receipt_body_policy,
    can_sign_owner_receipt: module.receipt_policy.can_sign_owner_receipt,
    can_create_typed_blocker: module.authority_boundary.can_create_typed_blocker,
    can_claim_quality_verdict: module.quality_evidence.can_claim_quality_verdict,
    can_claim_artifact_authority: module.authority_boundary.can_claim_artifact_authority,
    candidate_policy: 'refs_only_unsigned_candidate_requires_domain_owner_consumption',
    authority_boundary: module.authority_boundary,
  };
}

function buildModuleCandidatePayload(
  module: ScholarSkillCapabilityModuleDescriptor,
  input: InvocationInput,
) {
  const moduleProfile = moduleCapabilityProfile(module);
  return {
    surface_kind: 'opl_scholarskills_module_candidate_payload',
    status: 'module_candidate_refs_only',
    module_id: module.module_id,
    profile_id: moduleProfile.profile_id,
    display_name: module.display_name,
    brand_family: module.brand_family,
    descriptor_ref: moduleContractRef(module),
    input_ref: input.inputRef,
    artifact_root_ref: input.artifactRoot,
    stage_fit: module.stage_fit,
    input_schema_refs: module.input_schema_refs,
    output_schema_refs: module.output_schema_refs,
    dependency_profile_refs: module.dependency_profile_refs,
    run_context_refs: module.run_context_refs,
    artifact_candidate_ref_families: moduleProfile.artifact_ref_families,
    artifact_candidate_refs: buildArtifactCandidateRefs(module, input.artifactRoot),
    execution_receipt_ref_families: moduleProfile.execution_receipt_ref_families,
    required_ref_families: moduleProfile.required_ref_families,
    quality_checklist: {
      evidence_kind: module.quality_evidence.evidence_kind,
      required_ref_shapes: module.quality_evidence.required_ref_shapes,
      can_claim_quality_verdict: module.quality_evidence.can_claim_quality_verdict,
      quality_verdict_owner: 'domain_owner_gate',
    },
    owner_consumption: {
      required_for_paper_truth: true,
      accepted_receipt_refs: module.receipt_policy.accepted_receipt_refs,
      receipt_body_policy: module.receipt_policy.receipt_body_policy,
      counts_as_paper_truth: false,
      counts_as_owner_receipt: false,
      can_authorize_publication_readiness: false,
    },
    writes: {
      runtime_state_written: false,
      domain_truth_written: false,
      artifact_body_written: false,
      owner_receipt_signed: false,
      typed_blocker_created: false,
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
    authority_boundary: module.authority_boundary,
  };
}

function buildExecutionReceiptCandidateTemplate(module: ScholarSkillCapabilityModuleDescriptor) {
  const moduleProfile = moduleCapabilityProfile(module);
  const templateRef = `opl://scholarskills/execution-receipt-candidate-templates/${encodeURIComponent(module.module_id)}`;
  return {
    surface_kind: 'opl_scholarskills_execution_receipt_candidate_template',
    status: 'receipt_candidate_template',
    module_id: module.module_id,
    module_profile: moduleProfile,
    descriptor_ref: moduleContractRef(module),
    artifact_candidate_ref_families: moduleProfile.artifact_ref_families,
    artifact_candidate_refs: buildArtifactCandidateRefTemplates(module),
    required_ref_families: moduleProfile.required_ref_families,
    execution_receipt_ref_template: `${templateRef}/<input-fingerprint>`,
    execution_receipt_ref_families: moduleProfile.execution_receipt_ref_families,
    execution_receipt_refs: Object.fromEntries(
      moduleProfile.execution_receipt_ref_families.map((family) => [
        `${family}_ref`,
        `${templateRef}/<input-fingerprint>#${family}_ref`,
      ]),
    ),
    execution_receipt_counts_as_candidate_artifact: true,
    counts_as_paper_truth: false,
    counts_as_owner_receipt: false,
    can_authorize_publication_readiness: false,
    accepted_receipt_refs: module.receipt_policy.accepted_receipt_refs,
    receipt_body_policy: module.receipt_policy.receipt_body_policy,
    can_sign_owner_receipt: module.receipt_policy.can_sign_owner_receipt,
    can_create_typed_blocker: module.authority_boundary.can_create_typed_blocker,
    can_claim_quality_verdict: module.quality_evidence.can_claim_quality_verdict,
    can_claim_artifact_authority: module.authority_boundary.can_claim_artifact_authority,
    candidate_policy: 'refs_only_unsigned_candidate_template_requires_invoke_or_receipt_binding',
    authority_boundary: module.authority_boundary,
  };
}

function buildValidation(contractRoot: ScholarSkillsCapabilityModulesContract) {
  const seen = new Set<string>();
  const duplicateIds: string[] = [];
  const authorityViolations = [
    ...authorityBoundaryViolations(contractRoot.authority_boundary, 'authority_boundary'),
  ];
  const writeViolations: string[] = [];
  const capabilitySurfaceViolations: string[] = [];

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
        commands: [
          'opl scholar-skills list --json',
          'opl scholar-skills inspect --module <module_id> --json',
          ...(contractRoot.runtime_environment_bridge.scholar_skill_prepare_commands ?? [
            'opl scholar-skills prepare --module <module_id> --profile <profile> --platform <platform> --requirement-profile <path> --paper-root <path> --json',
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
          ...(contractRoot.runtime_environment_bridge.scholar_skill_materialize_commands ?? [
            'opl scholar-skills materialize --module <module_id> --input-ref <ref> --artifact-root <ref-or-path> --output-root <path> --json',
          ]),
          ...(contractRoot.runtime_environment_bridge.scholar_skill_runtime_prepare_commands ?? [
            'opl scholar-skills runtime-prepare --module <module_id> --profile <profile> --platform <platform> --requirement-profile <path> --paper-root <path> [--apply] --json',
          ]),
          ...(contractRoot.runtime_environment_bridge.scholar_skill_runtime_run_context_commands ?? [
            'opl scholar-skills runtime-run-context --module <module_id> --profile <profile> --platform <platform> --paper-root <path> --json',
          ]),
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
          ...(contractRoot.runtime_environment_bridge.scholar_skill_prepare_commands ?? []),
          ...(contractRoot.runtime_environment_bridge.scholar_skill_run_context_commands ?? []),
          ...(contractRoot.runtime_environment_bridge.scholar_skill_invocation_commands ?? []),
          ...(contractRoot.runtime_environment_bridge.scholar_skill_receipt_commands ?? []),
          ...(contractRoot.runtime_environment_bridge.scholar_skill_materialize_commands ?? []),
          ...(contractRoot.runtime_environment_bridge.scholar_skill_runtime_prepare_commands ?? []),
          ...(contractRoot.runtime_environment_bridge.scholar_skill_runtime_run_context_commands ?? []),
        ],
        bridge_envelope_policy: contractRoot.runtime_environment_bridge.bridge_envelope_policy,
        can_write_runtime_state: contractRoot.runtime_environment_bridge.can_write_runtime_state,
        can_claim_runtime_ready: contractRoot.runtime_environment_bridge.can_claim_runtime_ready,
        can_claim_domain_ready: contractRoot.runtime_environment_bridge.can_claim_domain_ready,
      },
      authority_boundary: contractRoot.authority_boundary,
    },
  };
}

export function buildScholarSkillsRuntimePrepareReadback(
  contracts: FrameworkContracts,
  input: RuntimePrepareInput,
) {
  const contractRoot = contract(contracts);
  const module = findModuleOrThrow(contractRoot.modules, assertModuleId(input.moduleId));
  const runtimeEnvironment = buildRuntimeEnvironmentPrepareReadback({
    domainId: 'scholarskills',
    profileId: input.profile,
    platformId: input.platform,
    requirementProfilePath: input.requirementProfile,
    requirementProfileId: input.requirementProfileId,
    paperRoot: input.paperRoot,
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
) {
  const contractRoot = contract(contracts);
  const module = findModuleOrThrow(contractRoot.modules, assertModuleId(input.moduleId));
  const runtimeEnvironment = buildRuntimeEnvironmentRunContextReadback({
    domainId: 'scholarskills',
    profileId: input.profile,
    platformId: input.platform,
    paperRoot: input.paperRoot,
  });
  return {
    version: 'g2',
    scholar_skills_runtime_run_context: {
      surface_kind: 'opl_scholarskills_runtime_run_context_bridge',
      status: runtimeEnvironment.run_context.status,
      module_id: module.module_id,
      profile: input.profile,
      platform: input.platform,
      descriptor_ref: moduleContractRef(module),
      runtime_domain_id: 'scholarskills',
      runtime_owner_command: runtimeRunContextCommand(input),
      paper_root_ref: input.paperRoot,
      run_context_ref: runtimeEnvironment.run_context.run_context_ref ?? null,
      consumer_preflight: runtimeEnvironment.run_context.consumer_preflight,
      runtime_environment: runtimeEnvironment,
      can_consume_run_context: runtimeEnvironment.run_context.consumer_preflight.can_consume_run_context,
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
        paper_root_ref: input.paperRoot,
      },
      cache_policy: {
        can_claim_cache_hit: false,
        cache_hit_claimed: false,
      },
      writes: {
        runtime_state_written: false,
        paper_root_written: false,
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
  const receiptCandidate = buildExecutionReceiptCandidate(module, input);
  const moduleCandidate = buildModuleCandidatePayload(module, input);
  const refsManifest = {
    surface_kind: 'opl_scholarskills_refs_manifest',
    status: 'candidate_refs_manifest',
    module_id: module.module_id,
    input_ref: input.inputRef,
    artifact_root_ref: input.artifactRoot,
    execution_receipt_ref: receiptCandidate.execution_receipt_ref,
    execution_receipt_refs: receiptCandidate.execution_receipt_refs,
    artifact_candidate_refs: receiptCandidate.artifact_candidate_refs,
    artifact_body_written: false,
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
    package_policy: 'deterministic_refs_only_candidate_package',
    module_candidate: {
      surface_kind: moduleCandidate.surface_kind,
      status: moduleCandidate.status,
      module_id: moduleCandidate.module_id,
      artifact_candidate_ref_families: moduleCandidate.artifact_candidate_ref_families,
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
      artifact_body_written: false,
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

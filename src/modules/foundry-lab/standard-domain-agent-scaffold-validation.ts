import fs from 'node:fs';
import path from 'node:path';

import standardAgentCapabilityMapSchema from '../../../contracts/opl-framework/standard-agent-capability-map.schema.json' with { type: 'json' };
import { isRecord } from '../../kernel/contract-validation.ts';
import { readJsonFileOrNull } from '../../kernel/json-file.ts';
import { validateJsonSchemaPayload } from '../../kernel/schema-registry.ts';
import {
  buildStandardAgentRepoContractReadout,
  STANDARD_AGENT_STAGE_MANIFEST_REF,
  type StandardAgentRepoContractReadout,
} from '../pack/index.ts';
import {
  FORBIDDEN_DOMAIN_GENERIC_OWNER_ROLES,
  REQUIRED_REPO_SOURCE_DIRS,
} from './standard-domain-agent-scaffold-constants.ts';
import {
  requiresStagePackV2,
  validateStagePackV2,
} from './standard-domain-agent-stage-pack-v2.ts';
import { validateAgentPackFiles } from './standard-domain-agent-scaffold-validation-parts/pack-files.ts';
import { validateStageRefs } from './standard-domain-agent-scaffold-validation-parts/stage-refs.ts';
import { validateUserStageLogContracts } from './standard-domain-agent-scaffold-validation-parts/user-stage-log.ts';
import { validateFoundryAgentSeriesContract } from './standard-domain-agent-scaffold-validation-parts/foundry-contract.ts';
import { normalizeStandardAgentCapabilityMapPolicies } from './standard-agent-capability-map.ts';
import { validateStandardAgentImplementationProfileRefs } from '../pack/public/standard-agent-implementation-profile.ts';
import { readStandardAgentInterface } from '../../kernel/standard-agent-interface.ts';

interface ScaffoldValidateInput {
  repoDir: string;
  repoContractReadout?: StandardAgentRepoContractReadout;
}

const REQUIRED_CAPABILITY_MAP_SURFACE_ROLES = [
  'stage_prompt',
  'professional_skill',
  'tool_connector',
  'knowledge_pack',
  'quality_gate',
  'eval_suite',
] as const;

type CapabilityMapPayload = {
  capabilities: JsonCapabilityEntry[];
};

type JsonCapabilityEntry = {
  capability_id?: unknown;
  surface_role: string;
  improvement_tokens?: unknown;
  canonical_target_paths?: unknown;
  verification_refs?: unknown;
  forbidden_surfaces?: unknown;
  owner_closeout_boundary?: unknown;
};

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .map((entry) => entry.trim()))];
}

function capabilityId(entry: JsonCapabilityEntry, index: number) {
  return typeof entry.capability_id === 'string' && entry.capability_id.trim()
    ? entry.capability_id.trim()
    : `capability_index_${index}`;
}

function validateOwnerCloseoutBoundary(entry: JsonCapabilityEntry, id: string) {
  if (!isRecord(entry.owner_closeout_boundary)) {
    return [`capability_map_missing_owner_closeout_boundary:${id}`];
  }
  const boundary = entry.owner_closeout_boundary;
  const requiredShapes = stringList(boundary.required_return_shapes);
  return [
    typeof boundary.owner === 'string' && boundary.owner.trim()
      ? null
      : `capability_map_owner_closeout_missing_owner:${id}`,
    requiredShapes.length > 0
      ? null
      : `capability_map_owner_closeout_missing_return_shapes:${id}`,
    boundary.can_write_owner_receipt_body === false
      ? null
      : `capability_map_owner_closeout_can_write_owner_receipt_body_must_be_false:${id}`,
    boundary.can_create_typed_blocker === false
      ? null
      : `capability_map_owner_closeout_can_create_typed_blocker_must_be_false:${id}`,
  ].filter((blocker): blocker is string => Boolean(blocker));
}

function validateSelfEvolutionRoutingFields(capabilities: JsonCapabilityEntry[]) {
  const blockers = capabilities.flatMap((entry, index) => {
    const id = capabilityId(entry, index);
    return [
      stringList(entry.improvement_tokens).length > 0
        ? null
        : `capability_map_missing_improvement_tokens:${id}`,
      stringList(entry.canonical_target_paths).length > 0
        ? null
        : `capability_map_missing_canonical_target_paths:${id}`,
      stringList(entry.verification_refs).length > 0
        ? null
        : `capability_map_missing_verification_refs:${id}`,
      stringList(entry.forbidden_surfaces).length > 0
        ? null
        : `capability_map_missing_forbidden_surfaces:${id}`,
      ...validateOwnerCloseoutBoundary(entry, id),
    ].filter((blocker): blocker is string => Boolean(blocker));
  });
  return {
    status: blockers.length === 0 ? 'passed' : 'blocked',
    checked_capability_count: capabilities.length,
    self_evolution_ready_capability_count: capabilities.length - new Set(blockers.map((blocker) =>
      blocker.split(':').slice(-1)[0]
    )).size,
    blockers,
  };
}

function validateCapabilityMap(capabilityMap: unknown) {
  if (capabilityMap === null || capabilityMap === undefined) {
    return {
      status: 'missing',
      observed_roles: [],
      missing_roles: REQUIRED_CAPABILITY_MAP_SURFACE_ROLES,
      self_evolution_routing_validation: {
        status: 'missing',
        checked_capability_count: 0,
        self_evolution_ready_capability_count: 0,
        blockers: [],
      },
      blockers: [],
    };
  }
  const schemaValidation = validateJsonSchemaPayload(
    {
      schemaId: 'opl.standard_agent_capability_map.v1',
      schema: standardAgentCapabilityMapSchema,
      sourceRef: 'contracts/opl-framework/standard-agent-capability-map.schema.json',
    },
    capabilityMap,
  );
  if (!schemaValidation.ok) {
    return {
      status: 'blocked',
      observed_roles: [],
      missing_roles: REQUIRED_CAPABILITY_MAP_SURFACE_ROLES,
      self_evolution_routing_validation: {
        status: 'blocked',
        checked_capability_count: 0,
        self_evolution_ready_capability_count: 0,
        blockers: [],
      },
      blockers: schemaValidation.errors.map((error) =>
        `capability_map_schema_invalid:${error.instance_path || '/'}:${error.keyword}`
      ),
    };
  }
  const normalized = normalizeStandardAgentCapabilityMapPolicies(capabilityMap);
  if (normalized.blockers.length > 0) {
    return {
      status: 'blocked',
      observed_roles: [],
      missing_roles: REQUIRED_CAPABILITY_MAP_SURFACE_ROLES,
      self_evolution_routing_validation: {
        status: 'blocked',
        checked_capability_count: 0,
        self_evolution_ready_capability_count: 0,
        blockers: normalized.blockers,
      },
      blockers: normalized.blockers,
    };
  }
  const capabilities = (normalized.capabilityMap as CapabilityMapPayload).capabilities;
  const observedRoles = [...new Set(capabilities
    .map((entry) => entry.surface_role))];
  const missingRoles = REQUIRED_CAPABILITY_MAP_SURFACE_ROLES.filter((role) => !observedRoles.includes(role));
  const selfEvolutionRoutingValidation = validateSelfEvolutionRoutingFields(capabilities);
  const blockers = [
    ...missingRoles.map((role) => `capability_map_missing_role:${role}`),
    ...selfEvolutionRoutingValidation.blockers,
  ].filter((entry): entry is string => Boolean(entry));
  return {
    status: blockers.length === 0 ? 'passed' : 'blocked',
    observed_roles: observedRoles,
    missing_roles: missingRoles,
    self_evolution_routing_validation: selfEvolutionRoutingValidation,
    blockers,
  };
}

export function validateStandardDomainAgentScaffold(input: ScaffoldValidateInput) {
  const repoDir = path.resolve(input.repoDir);
  const missingRequiredDirs = REQUIRED_REPO_SOURCE_DIRS.filter((dir) => !fs.existsSync(path.join(repoDir, dir)));
  const forbiddenPresentDirs = ['artifacts'].filter((dir) => fs.existsSync(path.join(repoDir, dir)));
  const requiredContractFiles = [
    'contracts/domain_descriptor.json',
    'contracts/pack_compiler_input.json',
    'contracts/generated_surface_handoff.json',
    STANDARD_AGENT_STAGE_MANIFEST_REF,
    'contracts/action_catalog.json',
    'contracts/memory_descriptor.json',
    'contracts/artifact_locator_contract.json',
    'contracts/owner_receipt_contract.json',
    'contracts/foundry_agent_series.json',
    'contracts/standard-agent-principles-adoption.json',
    'contracts/capability_map.json',
    'contracts/stage_operating_principles.json',
    'contracts/functional_privatization_audit.json',
    'contracts/private_functional_surface_policy.json',
    'contracts/standard_agent_conformance_profile.json',
    'contracts/workspace_lifecycle_policy.json',
  ];
  const missingContractFiles = requiredContractFiles.filter((file) => !fs.existsSync(path.join(repoDir, file)));
  const actionCatalog = readJsonFileOrNull(path.join(repoDir, 'contracts/action_catalog.json'));
  const actionCatalogRecord = isRecord(actionCatalog) ? actionCatalog : {};
  const forbiddenRoles = Array.isArray(actionCatalogRecord.forbidden_generic_owner_roles)
    ? actionCatalogRecord.forbidden_generic_owner_roles
    : [];
  const missingForbiddenRoleGuards = FORBIDDEN_DOMAIN_GENERIC_OWNER_ROLES.filter((role) => !forbiddenRoles.includes(role));
  const descriptor = readJsonFileOrNull(path.join(repoDir, 'contracts/domain_descriptor.json'));
  const descriptorRecord = isRecord(descriptor) ? descriptor : {};
  let standardAgentInterfaceValidation: {
    status: 'passed' | 'blocked';
    interface_version: string | null;
    blocker: string | null;
  };
  try {
    const standardAgentInterface = readStandardAgentInterface(repoDir);
    if (!standardAgentInterface) {
      throw new Error('contracts/domain_descriptor.json#/standard_agent_interface is missing');
    }
    standardAgentInterfaceValidation = {
      status: 'passed',
      interface_version: standardAgentInterface.version,
      blocker: null,
    };
  } catch (error) {
    standardAgentInterfaceValidation = {
      status: 'blocked',
      interface_version: null,
      blocker: `standard_agent_interface_invalid:${error instanceof Error ? error.message : 'unknown_error'}`,
    };
  }
  const authority = isRecord(descriptorRecord.authority_boundary) ? descriptorRecord.authority_boundary : {};
  const packCompilerInput = readJsonFileOrNull(path.join(repoDir, 'contracts/pack_compiler_input.json'));
  const packCompilerInputRecord = isRecord(packCompilerInput) ? packCompilerInput : {};
  const implementationProfileValidation = validateStandardAgentImplementationProfileRefs(
    packCompilerInputRecord.implementation_profile,
    repoDir,
    { required: true },
  );
  const generatedSurfaceHandoff = readJsonFileOrNull(path.join(repoDir, 'contracts/generated_surface_handoff.json'));
  const generatedSurfaceHandoffRecord = isRecord(generatedSurfaceHandoff) ? generatedSurfaceHandoff : {};
  const capabilityMap = readJsonFileOrNull(path.join(repoDir, 'contracts/capability_map.json'));
  const foundryAgentSeries = readJsonFileOrNull(path.join(repoDir, 'contracts/foundry_agent_series.json'));
  const repoContractReadout = input.repoContractReadout
    ?? buildStandardAgentRepoContractReadout(repoDir);
  const stageControlPlane = repoContractReadout.stage_control_plane;
  const stagePackV2Required = requiresStagePackV2(packCompilerInput, stageControlPlane);
  const agentPackValidation = validateAgentPackFiles(repoDir, packCompilerInput, stagePackV2Required);
  const stageRefValidation = validateStageRefs(repoDir, stageControlPlane, stagePackV2Required);
  const userStageLogValidation = validateUserStageLogContracts(stageControlPlane);
  const foundryAgentSeriesValidation = validateFoundryAgentSeriesContract(foundryAgentSeries);
  const capabilityMapValidation = validateCapabilityMap(capabilityMap);
  const stagePackV2Validation = validateStagePackV2(stageControlPlane, packCompilerInput, stagePackV2Required, {
    repoDir,
  });
  const authorityViolations = [
    authority.opl_can_write_domain_truth === false ? null : 'opl_can_write_domain_truth_must_be_false',
    authority.opl_can_write_memory_body === false ? null : 'opl_can_write_memory_body_must_be_false',
    authority.opl_can_authorize_quality_or_export === false ? null : 'opl_can_authorize_quality_or_export_must_be_false',
    packCompilerInputRecord.generated_surface_owner === 'one-person-lab'
      ? null
      : 'pack_compiler_generated_surface_owner_must_be_opl',
    packCompilerInputRecord.domain_repo_can_own_generated_surface === false
      ? null
      : 'pack_compiler_domain_repo_generated_surface_owner_must_be_false',
    ...(implementationProfileValidation.status === 'passed'
      ? []
      : implementationProfileValidation.status === 'blocked'
        ? implementationProfileValidation.blockers
        : ['implementation_profile_missing']),
    generatedSurfaceHandoffRecord.generated_surface_owner === 'one-person-lab'
      ? null
      : 'generated_surface_handoff_owner_must_be_opl',
    generatedSurfaceHandoffRecord.domain_repo_can_own_generated_surface === false
      ? null
      : 'generated_surface_handoff_domain_owner_must_be_false',
  ].filter(Boolean);
  const blockers = [
    ...missingRequiredDirs.map((item) => `missing_required_dir:${item}`),
    ...forbiddenPresentDirs.map((item) => `forbidden_source_dir_present:${item}`),
    ...missingContractFiles.map((item) => `missing_contract:${item}`),
    ...repoContractReadout.blockers,
    ...missingForbiddenRoleGuards.map((item) => `missing_forbidden_role_guard:${item}`),
    ...authorityViolations,
    standardAgentInterfaceValidation.blocker,
    ...agentPackValidation.blockers,
    ...stageRefValidation.blockers,
    ...userStageLogValidation.blockers,
    ...foundryAgentSeriesValidation.blockers,
    ...capabilityMapValidation.blockers,
    ...stagePackV2Validation.blockers,
  ].filter((entry): entry is string => Boolean(entry));
  const advisoryFindings = [
    ...agentPackValidation.advisory_findings,
    ...stageRefValidation.advisory_findings,
    ...foundryAgentSeriesValidation.advisory_findings,
    ...stagePackV2Validation.advisory_findings,
  ];
  return {
    version: 'g2',
    standard_domain_agent_scaffold_validation: {
      surface_kind: 'opl_standard_domain_agent_scaffold_validation',
      repo_dir: repoDir,
      status: blockers.length === 0 ? 'passed' : 'blocked',
      scaffold_ref: 'contracts/opl-framework/standard-domain-agent-skeleton-contract.json',
      required_dirs: REQUIRED_REPO_SOURCE_DIRS,
      missing_required_dirs: missingRequiredDirs,
      forbidden_dirs_present: forbiddenPresentDirs,
      required_contract_files: requiredContractFiles,
      missing_contract_files: missingContractFiles,
      missing_forbidden_role_guards: missingForbiddenRoleGuards,
      authority_violations: authorityViolations,
      agent_pack_validation: agentPackValidation,
      stage_ref_validation: stageRefValidation,
      user_stage_log_validation: userStageLogValidation,
      foundry_agent_series_validation: foundryAgentSeriesValidation,
      capability_map_validation: capabilityMapValidation,
      stage_pack_v2_validation: stagePackV2Validation,
      implementation_profile_validation: implementationProfileValidation,
      standard_agent_interface_validation: standardAgentInterfaceValidation,
      functional_privatization_audit_required: true,
      blockers,
      advisory_findings: advisoryFindings,
      authority_boundary: {
        opl_can_write_domain_truth: false,
        opl_can_write_memory_body: false,
        opl_can_authorize_domain_quality_or_export: false,
        opl_can_execute_domain_repo_delete: false,
      },
    },
  };
}

export function buildStandardDomainAgentScaffoldValidation(input: ScaffoldValidateInput) {
  const validation = validateStandardDomainAgentScaffold(input).standard_domain_agent_scaffold_validation;
  return {
    version: 'g2',
    standard_domain_agent_scaffold: {
      surface_kind: 'opl_standard_domain_agent_scaffold',
      version: 'standard-domain-agent-scaffold.v1',
      scaffold_id: 'opl.standard_domain_agent.scaffold.v1',
      owner: 'one-person-lab',
      command: 'opl agents scaffold',
      state: validation.status === 'passed' ? 'validated' : 'validation_blocked',
      mode: 'validate',
      validation,
      authority_boundary: {
        opl: 'framework_runtime_development_primitives_contracts_read_models_projection_and_checklist_owner',
        domain_agent: 'domain_truth_quality_export_artifact_memory_body_and_owner_receipt_authority',
        opl_can_write_domain_truth: false,
        opl_can_write_memory_body: false,
        opl_can_authorize_domain_quality_or_export: false,
        domain_can_own_generic_scheduler_or_queue: false,
      },
    },
  };
}

import fs from 'node:fs';
import path from 'node:path';

import standardAgentCapabilityMapSchema from '../../../contracts/opl-framework/standard-agent-capability-map.schema.json' with { type: 'json' };
import { validateJsonSchemaPayload } from '../../kernel/schema-registry.ts';
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

interface ScaffoldValidateInput {
  repoDir: string;
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
  capabilities: Array<{
    surface_role: string;
  }>;
};

function readJsonFile(filePath: string) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function validateCapabilityMap(capabilityMap: unknown) {
  if (capabilityMap === null || capabilityMap === undefined) {
    return {
      status: 'missing',
      observed_roles: [],
      missing_roles: REQUIRED_CAPABILITY_MAP_SURFACE_ROLES,
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
      blockers: schemaValidation.errors.map((error) =>
        `capability_map_schema_invalid:${error.instance_path || '/'}:${error.keyword}`
      ),
    };
  }
  const capabilities = (capabilityMap as CapabilityMapPayload).capabilities;
  const observedRoles = [...new Set(capabilities
    .map((entry) => entry.surface_role))];
  const missingRoles = REQUIRED_CAPABILITY_MAP_SURFACE_ROLES.filter((role) => !observedRoles.includes(role));
  const blockers = [
    ...missingRoles.map((role) => `capability_map_missing_role:${role}`),
  ].filter((entry): entry is string => Boolean(entry));
  return {
    status: blockers.length === 0 ? 'passed' : 'blocked',
    observed_roles: observedRoles,
    missing_roles: missingRoles,
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
    'contracts/stage_control_plane.json',
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
    'contracts/workspace_lifecycle_policy.json',
  ];
  const missingContractFiles = requiredContractFiles.filter((file) => !fs.existsSync(path.join(repoDir, file)));
  const actionCatalog = readJsonFile(path.join(repoDir, 'contracts/action_catalog.json'));
  const forbiddenRoles = Array.isArray(actionCatalog?.forbidden_generic_owner_roles)
    ? actionCatalog.forbidden_generic_owner_roles
    : [];
  const missingForbiddenRoleGuards = FORBIDDEN_DOMAIN_GENERIC_OWNER_ROLES.filter((role) => !forbiddenRoles.includes(role));
  const descriptor = readJsonFile(path.join(repoDir, 'contracts/domain_descriptor.json'));
  const authority = descriptor?.authority_boundary || {};
  const packCompilerInput = readJsonFile(path.join(repoDir, 'contracts/pack_compiler_input.json'));
  const generatedSurfaceHandoff = readJsonFile(path.join(repoDir, 'contracts/generated_surface_handoff.json'));
  const capabilityMap = readJsonFile(path.join(repoDir, 'contracts/capability_map.json'));
  const foundryAgentSeries = readJsonFile(path.join(repoDir, 'contracts/foundry_agent_series.json'));
  const stageControlPlane = readJsonFile(path.join(repoDir, 'contracts/stage_control_plane.json'));
  const stagePackV2Required = requiresStagePackV2(packCompilerInput, stageControlPlane);
  const agentPackValidation = validateAgentPackFiles(repoDir, packCompilerInput, stagePackV2Required);
  const stageRefValidation = validateStageRefs(repoDir, stageControlPlane, stagePackV2Required);
  const userStageLogValidation = validateUserStageLogContracts(stageControlPlane);
  const foundryAgentSeriesValidation = validateFoundryAgentSeriesContract(foundryAgentSeries, stagePackV2Required);
  const capabilityMapValidation = validateCapabilityMap(capabilityMap);
  const stagePackV2Validation = validateStagePackV2(stageControlPlane, packCompilerInput, stagePackV2Required, {
    repoDir,
  });
  const authorityViolations = [
    authority.opl_can_write_domain_truth === false ? null : 'opl_can_write_domain_truth_must_be_false',
    authority.opl_can_write_memory_body === false ? null : 'opl_can_write_memory_body_must_be_false',
    authority.opl_can_authorize_quality_or_export === false ? null : 'opl_can_authorize_quality_or_export_must_be_false',
    packCompilerInput?.generated_surface_owner === 'one-person-lab'
      ? null
      : 'pack_compiler_generated_surface_owner_must_be_opl',
    packCompilerInput?.domain_repo_can_own_generated_surface === false
      ? null
      : 'pack_compiler_domain_repo_generated_surface_owner_must_be_false',
    generatedSurfaceHandoff?.generated_surface_owner === 'one-person-lab'
      ? null
      : 'generated_surface_handoff_owner_must_be_opl',
    generatedSurfaceHandoff?.domain_repo_can_own_generated_surface === false
      ? null
      : 'generated_surface_handoff_domain_owner_must_be_false',
  ].filter(Boolean);
  const blockers = [
    ...missingRequiredDirs.map((item) => `missing_required_dir:${item}`),
    ...forbiddenPresentDirs.map((item) => `forbidden_source_dir_present:${item}`),
    ...missingContractFiles.map((item) => `missing_contract:${item}`),
    ...missingForbiddenRoleGuards.map((item) => `missing_forbidden_role_guard:${item}`),
    ...authorityViolations,
    ...agentPackValidation.blockers,
    ...stageRefValidation.blockers,
    ...userStageLogValidation.blockers,
    ...foundryAgentSeriesValidation.blockers,
    ...capabilityMapValidation.blockers,
    ...stagePackV2Validation.blockers,
  ];
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

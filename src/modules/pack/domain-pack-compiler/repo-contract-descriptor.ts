import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import {
  normalizeFamilyActionCatalog,
} from '../../../kernel/family-action-catalog-contract.ts';
import {
  buildFunctionalPrivatizationAudit,
} from '../functional-privatization-audit.ts';
import {
  compileStandardAgentStageManifest,
  STANDARD_AGENT_DESCRIPTOR_REF,
  STANDARD_AGENT_STAGE_MANIFEST_REF,
} from '../standard-agent-stage-manifest.ts';
import { isRecord } from '../../../kernel/contract-validation.ts';
import { stringList } from '../../../kernel/json-record.ts';
import {
  optionalString,
  parseJsonText,
} from '../../../kernel/json-file.ts';

type JsonRecord = Record<string, unknown>;

function statusOf(value: unknown) {
  return isRecord(value) ? optionalString(value.status) : null;
}

function numberField(record: JsonRecord, field: string) {
  const value = record[field];
  return typeof value === 'number' ? value : 0;
}

function genericResidueBlocked(summary: JsonRecord) {
  return numberField(summary, 'opl_owned_replacement_count') > 0
    || numberField(summary, 'temporary_migration_bridge_count') > 0
    || numberField(summary, 'retire_tombstone_count') > 0
    || numberField(summary, 'active_private_generic_residue_count') > 0
    || numberField(summary, 'blocker_count') > 0;
}

function readRepoJson(repoDir: string, relativePath: string) {
  const filePath = path.join(repoDir, relativePath);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return parseJsonText(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new FrameworkContractError('contract_json_invalid', `Invalid JSON in ${relativePath}.`, {
      repo_dir: repoDir,
      relative_path: relativePath,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function normalizeRepoActionCatalog(repoDir: string, value: unknown) {
  if (!value) {
    return null;
  }
  try {
    return normalizeFamilyActionCatalog(value);
  } catch (error) {
    throw new FrameworkContractError('contract_shape_invalid', 'contracts/action_catalog.json is not a valid family-action-catalog.v1 contract.', {
      repo_dir: repoDir,
      relative_path: 'contracts/action_catalog.json',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function buildRepoContractDescriptor(repoDirInput: string) {
  const repoDir = path.resolve(repoDirInput);
  if (!fs.existsSync(repoDir) || !fs.statSync(repoDir).isDirectory()) {
    throw new FrameworkContractError('cli_usage_error', `Generated interface repo dir does not exist: ${repoDir}`, {
      repo_dir: repoDir,
    });
  }

  const domainDescriptor = readRepoJson(repoDir, 'contracts/domain_descriptor.json') ?? {};
  const actionCatalog = normalizeRepoActionCatalog(repoDir, readRepoJson(repoDir, 'contracts/action_catalog.json'));
  const stageCompilation = compileStandardAgentStageManifest(repoDir);
  const stageControlPlane = stageCompilation.stage_control_plane;
  const functionalAuditRaw = readRepoJson(repoDir, 'contracts/functional_privatization_audit.json');
  const generatedSurfaceHandoffRaw = readRepoJson(repoDir, 'contracts/generated_surface_handoff.json');
  const packCompilerInput = readRepoJson(repoDir, 'contracts/pack_compiler_input.json');
  const memoryDescriptor = readRepoJson(repoDir, 'contracts/memory_descriptor.json');
  const generatedSurfaceHandoff = isRecord(generatedSurfaceHandoffRaw) ? generatedSurfaceHandoffRaw : null;
  const targetDomainId =
    actionCatalog?.target_domain_id
    ?? stageControlPlane?.target_domain_id
    ?? optionalString((domainDescriptor as JsonRecord).domain_id)
    ?? path.basename(repoDir);
  const canonicalAgentId = stageCompilation.source_binding.canonical_agent_id;
  const functionalAuditManifest = {
    target_domain_id: targetDomainId,
    functional_privatization_audit: functionalAuditRaw ?? undefined,
  };
  const functionalAudit = buildFunctionalPrivatizationAudit(functionalAuditManifest);
  const blockerReasons = [
    actionCatalog ? null : 'missing_contract:contracts/action_catalog.json',
    genericResidueBlocked(functionalAudit.summary)
      ? 'functional_privatization_audit_has_generic_residue_or_blocker'
      : null,
  ].filter((reason): reason is string => Boolean(reason));
  const status = blockerReasons.length === 0 ? 'ready' : 'blocked';

  return {
    descriptor: {
      project_id: targetDomainId,
      project: optionalString((domainDescriptor as JsonRecord).domain_label) ?? targetDomainId,
      target_domain_id: targetDomainId,
      agent_id: canonicalAgentId,
      canonical_agent_id: canonicalAgentId,
      source_contract_consumption: {
        surface_kind: 'opl_repo_contract_consumption_projection',
        repo_dir: repoDir,
        status: status,
        consumed_contracts: [
          {
            contract_id: 'domain_descriptor',
            path: 'contracts/domain_descriptor.json',
            status: Object.keys(domainDescriptor as JsonRecord).length > 0 ? 'resolved' : 'missing',
          },
          {
            contract_id: 'action_catalog',
            path: 'contracts/action_catalog.json',
            status: actionCatalog ? 'resolved' : 'missing',
          },
          {
            contract_id: 'declarative_stage_manifest',
            path: STANDARD_AGENT_STAGE_MANIFEST_REF,
            status: 'resolved_and_compiled',
          },
          {
            contract_id: 'family_stage_control_plane',
            path: 'opl-generated:family_stage_control_plane',
            status: 'generated_from_declarative_stage_manifest',
          },
          {
            contract_id: 'generated_surface_handoff',
            path: 'contracts/generated_surface_handoff.json',
            status: generatedSurfaceHandoff ? 'resolved' : 'missing',
          },
          {
            contract_id: 'product_entry_manifest_descriptor',
            path: 'contracts/action_catalog.json',
            status: actionCatalog ? 'resolved_from_family_action_catalog' : 'missing',
          },
          {
            contract_id: 'domain_handler_descriptor',
            path: 'contracts/generated_surface_handoff.json',
            status: generatedSurfaceHandoff ? 'resolved_from_generated_surface_handoff' : 'missing',
          },
          {
            contract_id: 'pack_compiler_input',
            path: 'contracts/pack_compiler_input.json',
            status: packCompilerInput ? 'resolved' : 'missing',
          },
          {
            contract_id: 'functional_privatization_audit',
            path: 'contracts/functional_privatization_audit.json',
            status: functionalAudit.status,
          },
        ],
      },
      family_action_catalog: {
        status: actionCatalog ? 'resolved' : 'missing',
        raw_descriptor: actionCatalog,
      },
      family_stage_control_plane: {
        status: 'resolved',
        source_kind: 'generated_from_declarative_stage_manifest',
        raw_descriptor: stageControlPlane,
        source_binding: stageCompilation.source_binding,
      },
      generated_surface_handoff_contract: generatedSurfaceHandoff,
      pack_compiler_input_contract: packCompilerInput,
      product_entry_manifest_descriptor: {
        status: actionCatalog ? 'resolved_from_repo_contracts' : 'missing_required_repo_contract',
        source_refs: [
          'contracts/domain_descriptor.json',
          'contracts/action_catalog.json',
          STANDARD_AGENT_STAGE_MANIFEST_REF,
          'contracts/functional_privatization_audit.json',
        ],
        product_entry_manifest_contract_ref: 'contracts/schemas/v1/product-entry-manifest.schema.json',
      },
      domain_handler_descriptor: {
        status: generatedSurfaceHandoff ? 'resolved_from_generated_surface_handoff' : 'missing_generated_surface_handoff',
        source_refs: [
          'contracts/generated_surface_handoff.json',
          'contracts/action_catalog.json',
          'contracts/functional_privatization_audit.json',
        ],
      },
      session_continuity_contract: packCompilerInput
        ? {
            status: 'resolved_from_pack_compiler_input',
            surface_kind: 'session_continuity',
            source_ref: 'contracts/pack_compiler_input.json',
          }
        : null,
      domain_memory_descriptor: {
        status: memoryDescriptor ? 'resolved' : 'missing',
        raw_descriptor: memoryDescriptor,
      },
      functional_privatization_audit: {
        status: functionalAudit.status,
        envelope: functionalAudit.envelope,
        source_field: functionalAudit.source_field,
        source_field_role: functionalAudit.source_field_role,
        legacy_import_source_fields: functionalAudit.legacy_import_source_fields,
        target_domain_id: functionalAudit.target_domain_id,
        summary: functionalAudit.summary,
        source_purity_tail_read_model: functionalAudit.source_purity_tail_read_model,
        modules: functionalAudit.modules,
        standard_domain_pack_inventory: functionalAudit.standard_domain_pack_inventory,
        authority_function_inventory: functionalAudit.authority_function_inventory,
        private_platform_residue_inventory: functionalAudit.private_platform_residue_inventory,
        required_opl_replacement_primitives: functionalAudit.required_opl_replacement_primitives,
        external_evidence_request_pack: functionalAudit.external_evidence_request_pack,
        authority_boundary: functionalAudit.authority_boundary,
        blockers: functionalAudit.blockers,
      },
    },
    repoDir,
    status,
    blockerReasons,
  };
}

export type StandardAgentRepoContractDescriptor = ReturnType<typeof buildRepoContractDescriptor>;

export type StandardAgentRepoContractReadout = {
  status: 'resolved' | 'blocked';
  repo_dir: string;
  canonical_agent_id: string | null;
  target_domain_id: string | null;
  source_binding: ReturnType<typeof compileStandardAgentStageManifest>['source_binding'] | null;
  required_source_refs: string[];
  repo_contract_descriptor: StandardAgentRepoContractDescriptor | null;
  stage_control_plane: ReturnType<typeof compileStandardAgentStageManifest>['stage_control_plane'] | null;
  blockers: string[];
  error: string | null;
};

function contractErrorRef(error: unknown) {
  if (!(error instanceof FrameworkContractError)) {
    return null;
  }
  const details = isRecord(error.details) ? error.details : {};
  const direct = optionalString(details.relative_path) ?? optionalString(details.ref);
  if (direct) {
    return direct;
  }
  const field = optionalString(details.field) ?? '';
  if (field.startsWith('domain_descriptor') || field === 'descriptor_ref') {
    return STANDARD_AGENT_DESCRIPTOR_REF;
  }
  if (field.startsWith('action_catalog') || error.message.includes('action_catalog')) {
    return 'contracts/action_catalog.json';
  }
  if (field.startsWith('pack_compiler_input') || error.message.includes('pack_compiler_input')) {
    return 'contracts/pack_compiler_input.json';
  }
  if (field.startsWith('stage_manifest') || error.message.includes('Stage manifest')) {
    return STANDARD_AGENT_STAGE_MANIFEST_REF;
  }
  return null;
}

export function buildStandardAgentRepoContractReadout(
  repoDirInput: string,
): StandardAgentRepoContractReadout {
  const repoDir = path.resolve(repoDirInput);
  const requiredSourceRefs = [
    'contracts/domain_descriptor.json',
    'contracts/action_catalog.json',
    'contracts/pack_compiler_input.json',
    STANDARD_AGENT_STAGE_MANIFEST_REF,
  ];
  try {
    const repoContractDescriptor = buildRepoContractDescriptor(repoDir);
    const stageSurface = repoContractDescriptor.descriptor.family_stage_control_plane;
    const stageControlPlane = isRecord(stageSurface)
      && isRecord(stageSurface.raw_descriptor)
      ? stageSurface.raw_descriptor as ReturnType<typeof compileStandardAgentStageManifest>['stage_control_plane']
      : null;
    return {
      status: stageControlPlane ? 'resolved' : 'blocked',
      repo_dir: repoDir,
      canonical_agent_id: repoContractDescriptor.descriptor.canonical_agent_id,
      target_domain_id: repoContractDescriptor.descriptor.target_domain_id,
      source_binding: repoContractDescriptor.descriptor.family_stage_control_plane.source_binding,
      required_source_refs: requiredSourceRefs,
      repo_contract_descriptor: repoContractDescriptor,
      stage_control_plane: stageControlPlane,
      blockers: stageControlPlane ? [] : ['standard_agent_stage_manifest_compilation_missing_stage_plane'],
      error: null,
    };
  } catch (error) {
    const failedRef = contractErrorRef(error);
    const blocker = failedRef
      ? `${fs.existsSync(path.join(repoDir, failedRef)) ? 'invalid' : 'missing'}_contract:${failedRef}`
      : `repo_contract_descriptor_failed:${error instanceof FrameworkContractError ? error.code : 'unknown_error'}`;
    return {
      status: 'blocked',
      repo_dir: repoDir,
      canonical_agent_id: null,
      target_domain_id: null,
      source_binding: null,
      required_source_refs: requiredSourceRefs,
      repo_contract_descriptor: null,
      stage_control_plane: null,
      blockers: [blocker],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function repoContractEntryProjection(descriptor: JsonRecord) {
  const productEntry = isRecord(descriptor.product_entry_manifest_descriptor)
    ? descriptor.product_entry_manifest_descriptor
    : null;
  return {
    status: statusOf(productEntry) === 'resolved_from_repo_contracts' ? 'resolved' : 'missing',
    source_kind: 'standard_agent_repo_contracts',
    source_refs: stringList(productEntry?.source_refs),
  };
}

function repoContractRuntimeSurfacesProjection(descriptor: JsonRecord) {
  const generatedSurfaceHandoff = isRecord(descriptor.generated_surface_handoff_contract)
    ? descriptor.generated_surface_handoff_contract
    : null;
  return {
    cli: {
      status: statusOf(descriptor.family_action_catalog) === 'resolved' ? 'resolved' : 'missing',
      source_ref: 'contracts/action_catalog.json',
    },
    product_entry: {
      status: statusOf(descriptor.product_entry_manifest_descriptor) === 'resolved_from_repo_contracts'
        ? 'resolved'
        : 'missing',
      source_ref: 'contracts/action_catalog.json',
    },
    product_session: {
      status: isRecord(descriptor.session_continuity_contract)
        || statusOf(descriptor.family_stage_control_plane) === 'resolved'
        ? 'resolved'
        : 'missing',
      source_ref: 'contracts/pack_compiler_input.json',
    },
    status_read_model: {
      status: statusOf(descriptor.domain_memory_descriptor) === 'resolved' ? 'resolved' : 'missing',
      source_ref: 'contracts/memory_descriptor.json',
    },
    workbench: {
      status: statusOf(descriptor.family_stage_control_plane) === 'resolved' ? 'resolved' : 'missing',
      source_ref: STANDARD_AGENT_STAGE_MANIFEST_REF,
    },
    generated_surface_handoff: {
      status: generatedSurfaceHandoff ? 'resolved' : 'missing',
      source_ref: 'contracts/generated_surface_handoff.json',
    },
  };
}

function repoContractTransitionProjection(descriptor: JsonRecord) {
  const stageControlPlane = isRecord(descriptor.family_stage_control_plane)
    ? descriptor.family_stage_control_plane
    : null;
  const rawDescriptor = isRecord(stageControlPlane?.raw_descriptor)
    ? stageControlPlane.raw_descriptor
    : null;
  const stages = Array.isArray(rawDescriptor?.stages) ? rawDescriptor.stages : [];
  return {
    status: statusOf(stageControlPlane) === 'resolved' ? 'descriptor_only' : 'missing',
    source_kind: 'standard_agent_repo_contracts',
    source_ref: STANDARD_AGENT_STAGE_MANIFEST_REF,
    transition_count: stages.length,
    authority_boundary: {
      transition_projection_can_claim_domain_ready: false,
      transition_projection_can_authorize_quality_or_export: false,
      opl_can_write_domain_truth: false,
    },
  };
}

export function repoContractDescriptorForPackCompiler(
  repoProjection: ReturnType<typeof buildRepoContractDescriptor>,
  requestedAgentId: string | null,
) {
  const descriptor = repoProjection.descriptor as JsonRecord;
  return {
    ...descriptor,
    requested_agent_id: requestedAgentId ?? optionalString(descriptor.agent_id) ?? optionalString(descriptor.project_id),
    repo_dir: repoProjection.repoDir,
    source_kind: 'standard_agent_repo_contracts',
    manifest_status: repoProjection.status === 'ready' ? 'resolved' : 'repo_contracts_blocked',
    entry: repoContractEntryProjection(descriptor),
    runtime_surfaces: repoContractRuntimeSurfacesProjection(descriptor),
    family_transition: repoContractTransitionProjection(descriptor),
  };
}

function repoGeneratedSurfaceHandoffFromDescriptor(descriptor: JsonRecord) {
  const current = isRecord(descriptor.generated_surface_handoff_contract)
    ? descriptor.generated_surface_handoff_contract
    : isRecord(descriptor.generated_surface_handoff)
      ? descriptor.generated_surface_handoff
      : null;
  if (current) {
    return current;
  }

  const workspacePath = optionalString(descriptor.workspace_path);
  if (!workspacePath || !fs.existsSync(workspacePath) || !fs.statSync(workspacePath).isDirectory()) {
    return null;
  }
  return readRepoJson(workspacePath, 'contracts/generated_surface_handoff.json');
}

export function descriptorWithRepoContractInputs(descriptor: JsonRecord) {
  const generatedSurfaceHandoff = repoGeneratedSurfaceHandoffFromDescriptor(descriptor);
  if (!generatedSurfaceHandoff) {
    return descriptor;
  }
  return {
    ...descriptor,
    generated_surface_handoff_contract: generatedSurfaceHandoff,
  };
}

import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from '../contracts.ts';
import {
  normalizeFamilyActionCatalog,
} from '../family-action-catalog-contract.ts';
import {
  normalizeFamilyStageControlPlane,
} from '../family-stage-control-plane-contract.ts';
import {
  buildFunctionalPrivatizationAudit,
} from '../functional-privatization-audit.ts';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => optionalString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function recordList(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

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
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
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

function normalizeRepoStageControlPlane(repoDir: string, value: unknown) {
  if (!value) {
    return null;
  }
  try {
    return normalizeFamilyStageControlPlane(value);
  } catch (error) {
    throw new FrameworkContractError('contract_shape_invalid', 'contracts/stage_control_plane.json is not a valid family-stage-control-plane.v1 contract.', {
      repo_dir: repoDir,
      relative_path: 'contracts/stage_control_plane.json',
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
  const stageControlPlane = normalizeRepoStageControlPlane(
    repoDir,
    readRepoJson(repoDir, 'contracts/stage_control_plane.json'),
  );
  const functionalAuditRaw = readRepoJson(repoDir, 'contracts/functional_privatization_audit.json');
  const generatedSurfaceHandoffRaw = readRepoJson(repoDir, 'contracts/generated_surface_handoff.json');
  const packCompilerInput = readRepoJson(repoDir, 'contracts/pack_compiler_input.json');
  const memoryDescriptor = readRepoJson(repoDir, 'contracts/memory_descriptor.json');
  const functionalBoundary = isRecord(functionalAuditRaw) && isRecord(functionalAuditRaw.functional_consumer_boundary)
    ? functionalAuditRaw.functional_consumer_boundary
    : null;
  const boundaryGeneratedHandoff = isRecord(functionalBoundary?.generated_surface_handoff)
    ? functionalBoundary.generated_surface_handoff
    : null;
  const generatedSurfaceHandoff =
    generatedSurfaceHandoffRaw || boundaryGeneratedHandoff
      ? {
          ...(isRecord(generatedSurfaceHandoffRaw) ? generatedSurfaceHandoffRaw : {}),
          ...(isRecord(boundaryGeneratedHandoff) ? {
            mas_functional_consumer_handoff_status: boundaryGeneratedHandoff.status,
            active_caller_cutover_status: boundaryGeneratedHandoff.active_caller_cutover_status,
            production_consumption_status: boundaryGeneratedHandoff.production_consumption_status,
            handoff_surfaces: recordList(boundaryGeneratedHandoff.handoff_surfaces),
          } : {}),
        }
      : null;
  const targetDomainId =
    actionCatalog?.target_domain_id
    ?? stageControlPlane?.target_domain_id
    ?? optionalString((domainDescriptor as JsonRecord).domain_id)
    ?? path.basename(repoDir);
  const functionalAuditManifest =
    functionalBoundary
      ? {
          target_domain_id: targetDomainId,
          functional_consumer_boundary: functionalBoundary,
        }
      : {
          target_domain_id: targetDomainId,
          functional_privatization_audit: functionalAuditRaw ?? undefined,
        };
  const functionalAudit = buildFunctionalPrivatizationAudit(functionalAuditManifest);
  const blockerReasons = [
    actionCatalog ? null : 'missing_contract:contracts/action_catalog.json',
    stageControlPlane ? null : 'missing_or_invalid_contract:contracts/stage_control_plane.json',
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
      agent_id: optionalString((domainDescriptor as JsonRecord).domain_id) ?? targetDomainId,
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
            contract_id: 'stage_control_plane',
            path: 'contracts/stage_control_plane.json',
            status: stageControlPlane ? 'resolved' : 'missing',
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
        status: stageControlPlane ? 'resolved' : 'missing',
        raw_descriptor: stageControlPlane,
      },
      generated_surface_handoff_contract: generatedSurfaceHandoff,
      pack_compiler_input_contract: packCompilerInput,
      product_entry_manifest_descriptor: {
        status: actionCatalog && stageControlPlane ? 'resolved_from_repo_contracts' : 'missing_required_repo_contract',
        source_refs: [
          'contracts/domain_descriptor.json',
          'contracts/action_catalog.json',
          'contracts/stage_control_plane.json',
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
        summary: functionalAudit.summary,
        modules: functionalAudit.modules,
      },
    },
    repoDir,
    status,
    blockerReasons,
  };
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
      source_ref: 'contracts/stage_control_plane.json',
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
    source_ref: 'contracts/stage_control_plane.json',
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

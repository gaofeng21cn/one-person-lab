import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import {
  normalizeFamilyActionCatalog,
} from '../../../kernel/family-action-catalog-contract.ts';
import {
  normalizeFamilyStageControlPlane,
} from '../../stagecraft/index.ts';
import {
  buildFunctionalPrivatizationAudit,
} from '../functional-privatization-audit.ts';
import { isRecord } from '../../../kernel/contract-validation.ts';
import { stringList } from '../../../kernel/json-record.ts';
import { resolveContainedRepoJsonFile } from '../../../kernel/repo-contained-json-file.ts';
import { assertJsonSchemaCompiles } from '../../../kernel/schema-registry.ts';
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

function splitSchemaRef(schemaRef: string) {
  const hashIndex = schemaRef.indexOf('#');
  return hashIndex < 0
    ? { file_ref: schemaRef, fragment: null }
    : { file_ref: schemaRef.slice(0, hashIndex), fragment: schemaRef.slice(hashIndex + 1) };
}

function localSchemaFragment(schema: JsonRecord, fragment: string | null): unknown {
  if (fragment === null || fragment === '') {
    return schema;
  }
  let decodedFragment: string;
  try {
    decodedFragment = decodeURIComponent(fragment);
  } catch {
    return undefined;
  }
  if (!decodedFragment.startsWith('/')) {
    const pending: unknown[] = [schema];
    while (pending.length > 0) {
      const candidate = pending.pop();
      if (Array.isArray(candidate)) {
        pending.push(...candidate);
        continue;
      }
      if (!isRecord(candidate)) continue;
      if (candidate.$anchor === decodedFragment) return candidate;
      pending.push(...Object.values(candidate));
    }
    return undefined;
  }
  let current: unknown = schema;
  for (const rawToken of decodedFragment.slice(1).split('/')) {
    const token = rawToken.replace(/~1/g, '/').replace(/~0/g, '~');
    if (Array.isArray(current) && /^\d+$/.test(token)) {
      current = current[Number(token)];
    } else if (isRecord(current) && Object.prototype.hasOwnProperty.call(current, token)) {
      current = current[token];
    } else {
      return undefined;
    }
  }
  return current;
}

function sameStringSet(left: string[], right: string[]) {
  return left.length === right.length && left.every((entry) => right.includes(entry));
}

function localSchemaDependencies(repoDir: string, rootPath: string, rootSchema: JsonRecord) {
  const dependencies: JsonRecord[] = [];
  const pending = [{ file_path: rootPath, schema: rootSchema }];
  const seen = new Set([rootPath]);
  while (pending.length > 0) {
    const current = pending.pop()!;
    const nodes: unknown[] = [current.schema];
    while (nodes.length > 0) {
      const node = nodes.pop();
      if (Array.isArray(node)) {
        nodes.push(...node);
        continue;
      }
      if (!isRecord(node)) continue;
      nodes.push(...Object.values(node));
      const ref = optionalString(node.$ref);
      if (!ref) continue;
      const fileRef = splitSchemaRef(ref).file_ref;
      if (!fileRef || path.isAbsolute(fileRef) || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(fileRef)) continue;
      const candidate = path.resolve(path.dirname(current.file_path), fileRef);
      const relativeRef = path.relative(repoDir, candidate).split(path.sep).join('/');
      const contained = resolveContainedRepoJsonFile(repoDir, relativeRef, 'Referenced input schema');
      if (seen.has(contained.real_path)) continue;
      const parsed = parseJsonText(fs.readFileSync(contained.real_path, 'utf8'));
      if (!isRecord(parsed)) {
        throw new Error(`Referenced input schema must be an object: ${relativeRef}`);
      }
      seen.add(contained.real_path);
      dependencies.push(parsed);
      pending.push({ file_path: contained.real_path, schema: parsed });
    }
  }
  return dependencies;
}

function schemaFieldsMatchAction(schema: unknown, requiredFields: string[], optionalFields: string[]) {
  if (!isRecord(schema) || !isRecord(schema.properties)) {
    return false;
  }
  const schemaRequired = stringList(schema.required);
  const schemaProperties = Object.keys(schema.properties);
  const schemaOptional = schemaProperties.filter((entry) => !schemaRequired.includes(entry));
  return sameStringSet(requiredFields, schemaRequired)
    && sameStringSet(optionalFields, schemaOptional);
}

function resolveActionInputSchemas(repoDir: string, catalog: ReturnType<typeof normalizeFamilyActionCatalog>) {
  return (catalog?.actions ?? []).map((action) => {
    const schemaRef = action.input_schema_ref;
    const { file_ref: fileRef, fragment } = splitSchemaRef(schemaRef);
    if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(fileRef)) {
      return {
        action_id: action.action_id,
        input_schema_ref: schemaRef,
        resolution_scope: 'external_contract_ref',
        status: 'external_resolution_explicit',
      };
    }
    if (!fileRef || path.isAbsolute(fileRef)) {
      return {
        action_id: action.action_id,
        input_schema_ref: schemaRef,
        resolution_scope: 'repo_relative',
        status: 'invalid_repo_relative_ref',
      };
    }
    const filePath = path.resolve(repoDir, fileRef);
    const relativePath = path.relative(repoDir, filePath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      return {
        action_id: action.action_id,
        input_schema_ref: schemaRef,
        resolution_scope: 'repo_relative',
        status: 'invalid_repo_relative_ref',
      };
    }
    if (!fs.existsSync(filePath)) {
      return {
        action_id: action.action_id,
        input_schema_ref: schemaRef,
        resolved_path: relativePath,
        resolution_scope: 'repo_relative',
        status: 'missing',
      };
    }
    let containedFile: ReturnType<typeof resolveContainedRepoJsonFile>;
    try {
      containedFile = resolveContainedRepoJsonFile(repoDir, fileRef, 'Action input schema');
    } catch {
      return {
        action_id: action.action_id,
        input_schema_ref: schemaRef,
        resolution_scope: 'repo_relative',
        status: 'invalid_repo_relative_ref',
      };
    }
    let schema: JsonRecord;
    try {
      const parsed = parseJsonText(fs.readFileSync(containedFile.real_path, 'utf8'));
      if (!isRecord(parsed)) {
        throw new Error('schema document must be an object');
      }
      schema = parsed;
    } catch {
      return {
        action_id: action.action_id,
        input_schema_ref: schemaRef,
        resolved_path: relativePath,
        resolution_scope: 'repo_relative',
        status: 'invalid_json',
      };
    }
    try {
      assertJsonSchemaCompiles({
        schemaId: `${action.action_id}:input`,
        schema,
        sourceRef: schemaRef,
      }, localSchemaDependencies(repoDir, containedFile.real_path, schema));
    } catch {
      return {
        action_id: action.action_id,
        input_schema_ref: schemaRef,
        resolved_path: containedFile.repo_relative_ref,
        resolution_scope: 'repo_relative',
        status: 'invalid_schema',
      };
    }
    const selectedSchema = localSchemaFragment(schema, fragment);
    if (selectedSchema === undefined) {
      return {
        action_id: action.action_id,
        input_schema_ref: schemaRef,
        resolved_path: containedFile.repo_relative_ref,
        resolution_scope: 'repo_relative',
        status: 'missing_fragment',
      };
    }
    if (action.parameter_fields_explicit
      && !schemaFieldsMatchAction(selectedSchema, action.required_fields, action.optional_fields)) {
      return {
        action_id: action.action_id,
        input_schema_ref: schemaRef,
        resolved_path: containedFile.repo_relative_ref,
        resolution_scope: 'repo_relative',
        status: 'field_contract_mismatch',
      };
    }
    return {
      action_id: action.action_id,
      input_schema_ref: schemaRef,
      resolved_path: containedFile.repo_relative_ref,
      resolution_scope: 'repo_relative',
      status: 'resolved',
    };
  });
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
  const generatedSurfaceHandoff = isRecord(generatedSurfaceHandoffRaw) ? generatedSurfaceHandoffRaw : null;
  const packCompilerInputRecord = isRecord(packCompilerInput) ? packCompilerInput : null;
  const targetDomainId =
    actionCatalog?.target_domain_id
    ?? stageControlPlane?.target_domain_id
    ?? optionalString((domainDescriptor as JsonRecord).domain_id)
    ?? path.basename(repoDir);
  const canonicalAgentId =
    optionalString(packCompilerInputRecord?.canonical_agent_id)
    ?? optionalString((domainDescriptor as JsonRecord).canonical_agent_id)
    ?? optionalString((domainDescriptor as JsonRecord).domain_id)
    ?? targetDomainId;
  const functionalAuditManifest = {
    target_domain_id: targetDomainId,
    functional_privatization_audit: functionalAuditRaw ?? undefined,
  };
  const functionalAudit = buildFunctionalPrivatizationAudit(functionalAuditManifest);
  const actionInputSchemaResolutions = resolveActionInputSchemas(repoDir, actionCatalog);
  const actionInputSchemaBlockers = actionInputSchemaResolutions.flatMap((resolution) => {
    if (resolution.status === 'resolved' || resolution.status === 'external_resolution_explicit') {
      return [];
    }
    const prefix = resolution.status === 'missing'
      ? 'missing_action_input_schema'
      : 'invalid_action_input_schema';
    return [`${prefix}:${resolution.action_id}:${resolution.input_schema_ref}`];
  });
  const blockerReasons = [
    actionCatalog ? null : 'missing_contract:contracts/action_catalog.json',
    stageControlPlane ? null : 'missing_or_invalid_contract:contracts/stage_control_plane.json',
    genericResidueBlocked(functionalAudit.summary)
      ? 'functional_privatization_audit_has_generic_residue_or_blocker'
      : null,
    ...actionInputSchemaBlockers,
  ].filter((reason): reason is string => Boolean(reason));
  const status = blockerReasons.length === 0 ? 'ready' : 'blocked';

  return {
    descriptor: {
      project_id: targetDomainId,
      project: optionalString((domainDescriptor as JsonRecord).domain_label) ?? targetDomainId,
      target_domain_id: targetDomainId,
      agent_id: canonicalAgentId,
      source_contract_consumption: {
        surface_kind: 'opl_repo_contract_consumption_projection',
        repo_dir: repoDir,
        status: status,
        action_input_schema_resolutions: actionInputSchemaResolutions,
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

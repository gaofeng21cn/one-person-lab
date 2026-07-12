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
import { stringList, stringValue } from '../../../kernel/json-record.ts';
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

function isCompactFunctionalAudit(value: unknown): value is JsonRecord & { modules: unknown[] } {
  return isRecord(value)
    && value.surface_kind === 'functional_privatization_audit'
    && typeof value.schema_version === 'number'
    && Boolean(stringValue(value.owner))
    && Array.isArray(value.modules)
    && !isRecord(value.functional_consumer_boundary);
}

function sourceFileRef(value: string) {
  return value.split('::', 1)[0].split('#', 1)[0].trim();
}

function repoFileReadback(repoDir: string, sourceRef: string) {
  const fileRef = sourceFileRef(sourceRef);
  if (!fileRef || path.isAbsolute(fileRef)) {
    return {
      source_ref: sourceRef,
      resolved_path: null,
      status: 'invalid_repo_relative_ref',
    };
  }
  const absolutePath = path.resolve(repoDir, fileRef);
  const relativePath = path.relative(repoDir, absolutePath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return {
      source_ref: sourceRef,
      resolved_path: null,
      status: 'invalid_repo_relative_ref',
    };
  }
  let repoRealPath: string;
  let realPath: string;
  try {
    repoRealPath = fs.realpathSync.native(repoDir);
    realPath = fs.realpathSync.native(absolutePath);
  } catch {
    return {
      source_ref: sourceRef,
      resolved_path: relativePath,
      status: 'missing',
    };
  }
  const realRelativePath = path.relative(repoRealPath, realPath);
  if (realRelativePath.startsWith('..') || path.isAbsolute(realRelativePath)) {
    return {
      source_ref: sourceRef,
      resolved_path: null,
      status: 'escaped_repo',
    };
  }
  return {
    source_ref: sourceRef,
    resolved_path: relativePath,
    status: fs.statSync(realPath).isFile() ? 'resolved' : 'missing',
  };
}

function buildCompactFunctionalAuditReadback(
  repoDir: string,
  functionalAuditRaw: unknown,
  packCompilerInput: unknown,
) {
  if (!isCompactFunctionalAudit(functionalAuditRaw)) {
    return null;
  }

  const packInventory = isRecord(packCompilerInput) ? stringList(packCompilerInput.declarative_domain_pack) : [];
  const packReadback = [
    'agent/stages/manifest.json',
    'agent/primary_skill/SKILL.md',
    'contracts/action_catalog.json',
    'contracts/pack_compiler_input.json',
  ].map((sourceRef) => repoFileReadback(repoDir, sourceRef));
  const moduleReadback = (functionalAuditRaw.modules as unknown[])
    .filter(isRecord)
    .map((module) => ({
      module_id: stringValue(module.module_id) ?? 'unknown_functional_module',
      code_paths: stringList(module.code_paths).map((sourceRef) => repoFileReadback(repoDir, sourceRef)),
    }));
  const retiredProvenanceRaw = Array.isArray(functionalAuditRaw.retired_generated_surface_provenance)
    ? functionalAuditRaw.retired_generated_surface_provenance
    : [];
  const retiredProvenance = retiredProvenanceRaw
    .filter(isRecord).map((entry) => ({
        surface_id: stringValue(entry.surface_id),
        replacement_ref: stringValue(entry.replacement_ref),
        provenance_refs: stringList(entry.provenance_refs),
      }));
  const modulePathChecks = moduleReadback.flatMap((entry) => entry.code_paths);
  const missingModulePaths = moduleReadback.flatMap((entry) => (
    entry.code_paths.length === 0
      ? [`compact_functional_audit_module_has_no_code_path:${entry.module_id}`]
      : entry.code_paths
        .filter((check) => check.status !== 'resolved')
        .map((check) => `compact_functional_audit_code_path_${check.status}:${entry.module_id}:${check.source_ref}`)
  ));
  const blockers = [
    packInventory.length > 0 ? null : 'compact_functional_audit_pack_inventory_empty',
    ...packReadback
      .filter((check) => check.status !== 'resolved')
      .map((check) => `compact_functional_audit_pack_readback_${check.status}:${check.source_ref}`),
    ...missingModulePaths,
    ...(Array.isArray(functionalAuditRaw.retired_generated_surface_provenance)
      ? []
      : ['compact_functional_audit_missing_retired_generated_surface_provenance']),
    ...(retiredProvenanceRaw.length > 0
      ? []
      : ['compact_functional_audit_requires_retired_generated_surface_provenance_entry']),
    ...retiredProvenanceRaw.flatMap((entry, index) => (
      isRecord(entry) ? [] : [`compact_functional_audit_retired_provenance_invalid_entry:${index}`]
    )),
    ...retiredProvenance.flatMap((entry, index) => [
      entry.surface_id ? null : `compact_functional_audit_retired_provenance_surface_id_missing:${index}`,
      entry.replacement_ref ? null : `compact_functional_audit_retired_provenance_missing_replacement_ref:${index}`,
      entry.provenance_refs.length > 0 ? null : `compact_functional_audit_retired_provenance_missing_provenance_refs:${index}`,
    ]),
  ].filter((entry): entry is string => Boolean(entry));

  return {
    surface_kind: 'opl_compact_functional_privatization_audit_readback',
    status: blockers.length === 0 ? 'resolved' : 'blocked',
    source_ref: 'contracts/functional_privatization_audit.json',
    morphology: {
      declared_module_count: moduleReadback.length,
      resolved_code_path_count: modulePathChecks.filter((check) => check.status === 'resolved').length,
      missing_code_path_count: modulePathChecks.filter((check) => check.status !== 'resolved').length,
      retired_generated_surface_provenance_count: retiredProvenanceRaw.length,
      declared_pack_inventory_count: packInventory.length,
    },
    pack_inventory: {
      source_ref: 'contracts/pack_compiler_input.json#declarative_domain_pack',
      declared_module_ids: packInventory,
      readback: packReadback,
    },
    module_code_path_readback: moduleReadback,
    retired_generated_surface_provenance: retiredProvenance,
    blockers,
  };
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

function siblingSchemaEntries(schemaPath: string) {
  const schemaDir = path.dirname(schemaPath);
  return fs.readdirSync(schemaDir)
    .filter((name) => name.endsWith('.schema.json') && path.join(schemaDir, name) !== schemaPath)
    .flatMap((name) => {
      const siblingPath = path.join(schemaDir, name);
      try {
        const sibling = parseJsonText(fs.readFileSync(siblingPath, 'utf8'));
        if (!isRecord(sibling)) return [];
        return [{
          schemaId: typeof sibling.$id === 'string' && sibling.$id.length > 0
            ? sibling.$id
            : name,
          schema: sibling,
          sourceRef: siblingPath,
        }];
      } catch {
        return [];
      }
    });
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
      }, siblingSchemaEntries(containedFile.real_path));
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
  const stageCompilation = compileStandardAgentStageManifest(repoDir);
  const stageControlPlane = stageCompilation.stage_control_plane;
  const functionalAuditRaw = readRepoJson(repoDir, 'contracts/functional_privatization_audit.json');
  const generatedSurfaceHandoffRaw = readRepoJson(repoDir, 'contracts/generated_surface_handoff.json');
  const packCompilerInput = readRepoJson(repoDir, 'contracts/pack_compiler_input.json');
  const memoryDescriptor = readRepoJson(repoDir, 'contracts/memory_descriptor.json');
  const generatedSurfaceHandoff = isRecord(generatedSurfaceHandoffRaw) ? generatedSurfaceHandoffRaw : null;
  if (generatedSurfaceHandoff && (
    generatedSurfaceHandoff.generated_surface_owner !== 'one-person-lab'
    || generatedSurfaceHandoff.domain_repo_can_own_generated_surface !== false
  )) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'contracts/generated_surface_handoff.json must keep generated surfaces owned by one-person-lab.',
      { repo_dir: repoDir, relative_path: 'contracts/generated_surface_handoff.json' },
    );
  }
  const generatedSurfaceAuthority = generatedSurfaceHandoff && isRecord(generatedSurfaceHandoff.authority_boundary)
    ? generatedSurfaceHandoff.authority_boundary
    : null;
  const forbiddenGeneratedSurfaceAuthority = generatedSurfaceAuthority
    ? Object.entries(generatedSurfaceAuthority)
      .filter(([key, value]) => value === true && (
        key.startsWith('opl_can_')
        || key === 'provider_completion_is_domain_completion'
        || key === 'provider_completion_counts_as_domain_completion'
      ))
      .map(([key]) => key)
    : [];
  if (forbiddenGeneratedSurfaceAuthority.length > 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'contracts/generated_surface_handoff.json grants forbidden OPL or provider authority.',
      {
        repo_dir: repoDir,
        relative_path: 'contracts/generated_surface_handoff.json',
        forbidden_true_fields: forbiddenGeneratedSurfaceAuthority,
      },
    );
  }
  const targetDomainId =
    actionCatalog?.target_domain_id
    ?? stageControlPlane?.target_domain_id
    ?? optionalString((domainDescriptor as JsonRecord).domain_id)
    ?? path.basename(repoDir);
  const canonicalAgentId = stageCompilation.source_binding.canonical_agent_id;
  const functionalAuditManifest = {
    target_domain_id: targetDomainId,
    functional_privatization_audit: functionalAuditRaw ?? undefined,
    pack_inventory: {
      source_ref: 'contracts/pack_compiler_input.json#declarative_domain_pack',
      declarative_domain_pack: isRecord(packCompilerInput)
        ? stringList(packCompilerInput.declarative_domain_pack)
        : [],
    },
  };
  const functionalAudit = buildFunctionalPrivatizationAudit(functionalAuditManifest);
  const compactFunctionalAuditReadback = buildCompactFunctionalAuditReadback(
    repoDir,
    functionalAuditRaw,
    packCompilerInput,
  );
  const functionalAuditConsumptionStatus = compactFunctionalAuditReadback
    ? functionalAudit.blockers.length === 0 && compactFunctionalAuditReadback.status === 'resolved'
      ? 'resolved'
      : 'blocked'
    : functionalAudit.status;
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
    genericResidueBlocked(functionalAudit.summary)
      ? 'functional_privatization_audit_has_generic_residue_or_blocker'
      : null,
    ...(compactFunctionalAuditReadback?.blockers ?? []),
    ...actionInputSchemaBlockers,
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
            status: functionalAuditConsumptionStatus,
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
        ...(compactFunctionalAuditReadback
          ? { contract_readback: compactFunctionalAuditReadback }
          : {}),
      },
    },
    repoDir,
    status,
    blockerReasons,
  };
}

export type StandardAgentRepoContractDescriptor = ReturnType<typeof buildRepoContractDescriptor>;

export function repoContractFailureProjection(
  repo: { requested_agent_id: string | null; repo_dir: string },
  error: FrameworkContractError,
) {
  const details = isRecord(error.details) ? error.details : {};
  return {
    requested_agent_id: repo.requested_agent_id,
    repo_dir: repo.repo_dir,
    blocker_reasons: [
      optionalString(details.blocker) ?? `repo_contract_descriptor_failed:${error.code}`,
    ],
    repo_contract_error: error.toJSON().error,
  };
}

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
    const resolved = Boolean(stageControlPlane) && repoContractDescriptor.status === 'ready';
    return {
      status: resolved ? 'resolved' : 'blocked',
      repo_dir: repoDir,
      canonical_agent_id: repoContractDescriptor.descriptor.canonical_agent_id,
      target_domain_id: repoContractDescriptor.descriptor.target_domain_id,
      source_binding: repoContractDescriptor.descriptor.family_stage_control_plane.source_binding,
      required_source_refs: requiredSourceRefs,
      repo_contract_descriptor: repoContractDescriptor,
      stage_control_plane: stageControlPlane,
      blockers: [
        ...repoContractDescriptor.blockerReasons,
        ...(stageControlPlane ? [] : ['standard_agent_stage_manifest_compilation_missing_stage_plane']),
      ],
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

export function repoContractDescriptorForPackCompiler(
  repoProjection: ReturnType<typeof buildRepoContractDescriptor>,
  requestedAgentId: string | null,
) {
  const descriptor = repoProjection.descriptor as JsonRecord;
  const canonicalAgentId = optionalString(descriptor.canonical_agent_id)
    ?? optionalString(descriptor.agent_id);
  if (requestedAgentId && requestedAgentId !== canonicalAgentId) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Requested Agent identity must match the repo canonical_agent_id.',
      {
        blocker: 'identity_mismatch',
        requested_agent_id: requestedAgentId,
        canonical_agent_id: canonicalAgentId,
        repo_dir: repoProjection.repoDir,
      },
    );
  }
  return {
    ...descriptor,
    requested_agent_id: requestedAgentId ?? canonicalAgentId ?? optionalString(descriptor.project_id),
    repo_dir: repoProjection.repoDir,
    source_kind: 'standard_agent_repo_contracts',
    manifest_status: repoProjection.status === 'ready' ? 'resolved' : 'repo_contracts_blocked',
    entry: repoContractEntryProjection(descriptor),
    runtime_surfaces: repoContractRuntimeSurfacesProjection(descriptor),
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

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';

export type JsonRecord = Record<string, unknown>;

const ALLOWED_PACK_KINDS = new Set([
  'display_pack',
  'domain_pack',
  'deck_pack',
  'report_pack',
  'app_ui_pack',
  'generic_capability_pack',
]);

const ALLOWED_RESOURCE_ROLES = new Set([
  'descriptor',
  'template',
  'schema',
  'renderer',
  'style_tokens',
  'qc_profile',
  'golden',
  'exemplar_ref',
  'receipt_ref',
  'artifact_ref',
]);

const ALLOWED_LIFECYCLE_STATES = new Set([
  'declared',
  'resolved',
  'locked',
  'cached',
  'artifact_refs_observed',
  'review_receipts_observed',
  'handoff_ready',
  'retained',
  'restored',
  'retired',
]);

export const REQUIRED_AUTHORITY_FALSE_FLAGS = [
  'can_write_domain_truth',
  'can_mutate_artifact_body',
  'can_sign_domain_owner_receipt',
  'can_authorize_quality_verdict',
  'can_authorize_publication_readiness',
  'can_authorize_grant_readiness',
  'can_authorize_visual_export_readiness',
  'can_authorize_app_release_readiness',
  'provider_completion_is_pack_quality_ready',
] as const;

export const MAS_DISPLAY_PACK_V2_SOURCE_CONTRACT_REF = 'med-autoscience:contracts/display-pack-contract.v2.json';
export const PACK_OS_DESCRIPTOR_MEDIA_TYPE = 'application/vnd.opl.pack.descriptor.v1+json';
export const PACK_OS_RESOURCE_MEDIA_TYPE = 'application/vnd.opl.pack.resource.v1';
export const PACK_OS_CONTENT_ADDRESSED_LOCK_POLICY = {
  policy_id: 'opl.pack_os.content_addressed_lock.v1',
  digest_algorithm: 'sha256',
  descriptor_media_type: PACK_OS_DESCRIPTOR_MEDIA_TYPE,
  resource_media_type: PACK_OS_RESOURCE_MEDIA_TYPE,
  descriptor_digest_required: true,
  present_local_resource_digest_required: true,
  external_refs_cached: false,
  lock_records_refs_only: true,
  registry_push_pull_implemented: false,
  stores_artifact_body: false,
  closes_stage: false,
  writes_domain_truth: false,
} as const;

export function ociDescriptor(mediaType: string, sha256: string, size: number) {
  return {
    mediaType,
    digest: `sha256:${sha256}`,
    size,
  };
}

export function shape(message: string, details: JsonRecord = {}) {
  return new FrameworkContractError('contract_shape_invalid', message, details);
}

export function readJsonFile(filePath: string): JsonRecord {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new FrameworkContractError('contract_file_missing', `Pack descriptor is missing: ${filePath}.`, {
        descriptor: filePath,
      });
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new FrameworkContractError('contract_json_invalid', `Pack descriptor contains invalid JSON: ${filePath}.`, {
      descriptor: filePath,
      cause: error instanceof Error ? error.message : 'JSON parse failed',
    });
  }

  if (!isRecord(parsed)) {
    throw shape('Pack descriptor root must be a JSON object.', { descriptor: filePath });
  }

  return parsed;
}

function requireString(record: JsonRecord, field: string, context: string) {
  const value = record[field];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw shape(`${context}.${field} must be a non-empty string.`, { field: `${context}.${field}` });
  }
  return value.trim();
}

function requireRecord(record: JsonRecord, field: string, context: string) {
  const value = record[field];
  if (!isRecord(value)) {
    throw shape(`${context}.${field} must be a JSON object.`, { field: `${context}.${field}` });
  }
  return value;
}

function requireArray(record: JsonRecord, field: string, context: string) {
  const value = record[field];
  if (!Array.isArray(value)) {
    throw shape(`${context}.${field} must be an array.`, { field: `${context}.${field}` });
  }
  return value;
}

function requireStringArray(record: JsonRecord, field: string, context: string) {
  return requireArray(record, field, context).map((entry, index) => {
    if (typeof entry !== 'string' || entry.trim().length === 0) {
      throw shape(`${context}.${field}[] must contain only strings.`, {
        field: `${context}.${field}[${index}]`,
      });
    }
    return entry.trim();
  });
}

function normalizeSchemaVersion(descriptor: JsonRecord) {
  if (descriptor.schema_version === undefined) {
    return 1;
  }
  if (descriptor.schema_version !== 1) {
    throw shape('pack_descriptor.schema_version must be 1.', {
      field: 'pack_descriptor.schema_version',
      actual: descriptor.schema_version,
    });
  }
  return 1;
}

export function sha256File(filePath: string) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

export function normalizeRelativeRef(ref: string) {
  if (path.isAbsolute(ref)) {
    throw shape('Pack resource refs must be relative paths or logical refs, not absolute paths.', { ref });
  }
  const normalized = path.normalize(ref);
  if (normalized === '..' || normalized.startsWith(`..${path.sep}`)) {
    throw shape('Pack resource refs must not escape the descriptor directory.', { ref });
  }
  return normalized.replaceAll(path.sep, '/');
}

function fileStateForRef(descriptorDir: string, ref: string) {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(ref) || /^[a-z][a-z0-9+.-]*:/i.test(ref)) {
    return {
      ref_kind: 'external_ref',
      status: 'external_ref',
      sha256: null,
      oci_descriptor: null,
    };
  }

  const normalizedRef = normalizeRelativeRef(ref);
  const absolutePath = path.resolve(descriptorDir, normalizedRef);
  if (!absolutePath.startsWith(`${descriptorDir}${path.sep}`) && absolutePath !== descriptorDir) {
    throw shape('Pack resource refs must resolve inside the descriptor directory.', { ref });
  }

  if (!fs.existsSync(absolutePath)) {
    return {
      ref_kind: 'local_file',
      status: 'missing',
      sha256: null,
      oci_descriptor: null,
    };
  }

  const stats = fs.statSync(absolutePath);
  if (!stats.isFile()) {
    throw shape('Pack resource refs that resolve locally must point to files.', { ref });
  }
  const sha256 = sha256File(absolutePath);

  return {
    ref_kind: 'local_file',
    status: 'present',
    sha256,
    oci_descriptor: ociDescriptor(PACK_OS_RESOURCE_MEDIA_TYPE, sha256, stats.size),
  };
}

function normalizeCapabilities(descriptor: JsonRecord) {
  return requireArray(descriptor, 'capabilities', 'pack_descriptor').map((entry, index) => {
    if (!isRecord(entry)) {
      throw shape('pack_descriptor.capabilities[] must be JSON objects.', { index });
    }
    return {
      capability_id: requireString(entry, 'capability_id', `pack_descriptor.capabilities[${index}]`),
      capability_kind: requireString(entry, 'capability_kind', `pack_descriptor.capabilities[${index}]`),
      entrypoint_ref: requireString(entry, 'entrypoint_ref', `pack_descriptor.capabilities[${index}]`),
      input_contract_ref: requireString(entry, 'input_contract_ref', `pack_descriptor.capabilities[${index}]`),
      output_contract_ref: requireString(entry, 'output_contract_ref', `pack_descriptor.capabilities[${index}]`),
    };
  });
}

function normalizeResources(descriptor: JsonRecord, descriptorDir: string) {
  return requireArray(descriptor, 'resources', 'pack_descriptor').map((entry, index) => {
    if (!isRecord(entry)) {
      throw shape('pack_descriptor.resources[] must be JSON objects.', { index });
    }
    const resourceId = requireString(entry, 'resource_id', `pack_descriptor.resources[${index}]`);
    const role = requireString(entry, 'role', `pack_descriptor.resources[${index}]`);
    if (!ALLOWED_RESOURCE_ROLES.has(role)) {
      throw shape('pack_descriptor.resources[].role is not allowed.', {
        resource_id: resourceId,
        role,
        allowed: [...ALLOWED_RESOURCE_ROLES],
      });
    }
    const ref = requireString(entry, 'ref', `pack_descriptor.resources[${index}]`);
    const fileState = fileStateForRef(descriptorDir, ref);
    return {
      resource_id: resourceId,
      role,
      ref,
      ...fileState,
    };
  });
}

function normalizeArtifactLifecycle(descriptor: JsonRecord) {
  const lifecycle = requireRecord(descriptor, 'artifact_lifecycle', 'pack_descriptor');
  const states = requireArray(lifecycle, 'states', 'pack_descriptor.artifact_lifecycle').map((entry, index) => {
    if (typeof entry !== 'string' || entry.length === 0) {
      throw shape('pack_descriptor.artifact_lifecycle.states[] must be non-empty strings.', { index });
    }
    if (!ALLOWED_LIFECYCLE_STATES.has(entry)) {
      throw shape('pack_descriptor.artifact_lifecycle.states[] contains an unknown state.', {
        state: entry,
        allowed: [...ALLOWED_LIFECYCLE_STATES],
      });
    }
    return entry;
  });
  const currentState = requireString(lifecycle, 'current_state', 'pack_descriptor.artifact_lifecycle');
  if (!ALLOWED_LIFECYCLE_STATES.has(currentState) || !states.includes(currentState)) {
    throw shape('pack_descriptor.artifact_lifecycle.current_state must be one of the declared allowed states.', {
      current_state: currentState,
      states,
    });
  }
  const retention = requireRecord(lifecycle, 'retention', 'pack_descriptor.artifact_lifecycle');
  return {
    states,
    current_state: currentState,
    artifact_locator_refs: requireStringArray(lifecycle, 'artifact_locator_refs', 'pack_descriptor.artifact_lifecycle'),
    retention: {
      policy_ref: requireString(retention, 'policy_ref', 'pack_descriptor.artifact_lifecycle.retention'),
      restore_proof_required: retention.restore_proof_required === true,
    },
  };
}

function normalizeReviewTransport(descriptor: JsonRecord) {
  const review = requireRecord(descriptor, 'review_transport', 'pack_descriptor');
  if (review.receipt_transport_only !== true) {
    throw shape('pack_descriptor.review_transport.receipt_transport_only must be true.', {
      field: 'pack_descriptor.review_transport.receipt_transport_only',
    });
  }
  return {
    receipt_refs: requireStringArray(review, 'receipt_refs', 'pack_descriptor.review_transport'),
    reviewer_adapter_refs: requireStringArray(review, 'reviewer_adapter_refs', 'pack_descriptor.review_transport'),
    receipt_transport_only: true,
    quality_verdict_owner: requireString(review, 'quality_verdict_owner', 'pack_descriptor.review_transport'),
  };
}

function normalizeAuthorityBoundary(descriptor: JsonRecord) {
  const authority = requireRecord(descriptor, 'authority_boundary', 'pack_descriptor');
  for (const field of REQUIRED_AUTHORITY_FALSE_FLAGS) {
    if (authority[field] !== false) {
      throw shape(`pack_descriptor.authority_boundary.${field} must be false.`, { field });
    }
  }
  return Object.fromEntries(
    Object.entries(authority).map(([key, value]) => [key, value === true ? true : value === false ? false : value]),
  );
}

function normalizeProvenance(descriptor: JsonRecord) {
  const provenance = requireRecord(descriptor, 'provenance', 'pack_descriptor');
  return {
    source_ref: requireString(provenance, 'source_ref', 'pack_descriptor.provenance'),
    license_ref: requireString(provenance, 'license_ref', 'pack_descriptor.provenance'),
    release_ref: requireString(provenance, 'release_ref', 'pack_descriptor.provenance'),
    descriptor_created_by: requireString(provenance, 'descriptor_created_by', 'pack_descriptor.provenance'),
  };
}

function optionalStringArray(record: JsonRecord, field: string, context: string) {
  if (record[field] === undefined) {
    return [];
  }
  return requireStringArray(record, field, context);
}

function expectExactString(record: JsonRecord, field: string, expected: string, context: string) {
  const actual = requireString(record, field, context);
  if (actual !== expected) {
    throw shape(`${context}.${field} must be ${expected}.`, { field: `${context}.${field}`, expected, actual });
  }
  return actual;
}

function expectFalse(record: JsonRecord, field: string, context: string) {
  if (record[field] !== false) {
    throw shape(`${context}.${field} must be false.`, { field: `${context}.${field}` });
  }
  return false;
}

export function buildMasDisplayPackV2Descriptor(contractPath: string) {
  const resolvedPath = path.resolve(contractPath);
  const contract = readJsonFile(resolvedPath);
  expectExactString(contract, 'contract_id', 'display-pack-contract.v2', 'display_pack_contract');
  if (contract.schema_version !== 2) {
    throw shape('display_pack_contract.schema_version must be 2.', {
      field: 'display_pack_contract.schema_version',
      actual: contract.schema_version,
    });
  }

  const packDescriptor = requireRecord(contract, 'pack_descriptor', 'display_pack_contract');
  expectExactString(
    packDescriptor,
    'surface_kind',
    'display_pack_v2_pack_descriptor',
    'display_pack_contract.pack_descriptor',
  );
  const templateDescriptor = requireRecord(contract, 'template_descriptor', 'display_pack_contract');
  const qualitySurfaces = requireRecord(contract, 'quality_surfaces', 'display_pack_contract');
  const authorityBoundaries = requireRecord(contract, 'authority_boundaries', 'display_pack_contract');
  const oplHandoff = requireRecord(contract, 'opl_handoff', 'display_pack_contract');
  expectExactString(
    oplHandoff,
    'surface_kind',
    'display_pack_v2_opl_pack_os_handoff',
    'display_pack_contract.opl_handoff',
  );
  expectExactString(oplHandoff, 'target_owner', 'OPL Pack OS', 'display_pack_contract.opl_handoff');

  if (authorityBoundaries.mas_pack_descriptor_authority !== true) {
    throw shape('display_pack_contract.authority_boundaries.mas_pack_descriptor_authority must be true.', {
      field: 'display_pack_contract.authority_boundaries.mas_pack_descriptor_authority',
    });
  }
  if (authorityBoundaries.mas_publication_quality_authority !== true) {
    throw shape('display_pack_contract.authority_boundaries.mas_publication_quality_authority must be true.', {
      field: 'display_pack_contract.authority_boundaries.mas_publication_quality_authority',
    });
  }
  expectFalse(authorityBoundaries, 'mas_owns_opl_generic_pack_os', 'display_pack_contract.authority_boundaries');
  expectFalse(authorityBoundaries, 'opl_can_write_mas_publication_truth', 'display_pack_contract.authority_boundaries');
  expectFalse(
    authorityBoundaries,
    'display_pack_lock_can_authorize_publication_readiness',
    'display_pack_contract.authority_boundaries',
  );
  expectFalse(authorityBoundaries, 'pack_descriptor_can_mutate_study_truth', 'display_pack_contract.authority_boundaries');
  expectFalse(
    authorityBoundaries,
    'ai_illustration_can_carry_scientific_claim',
    'display_pack_contract.authority_boundaries',
  );

  const displayPackLockSurface = requireString(
    qualitySurfaces,
    'display_pack_lock_surface',
    'display_pack_contract.quality_surfaces',
  );
  const paperQualityRefs = requireStringArray(
    qualitySurfaces,
    'paper_quality_refs',
    'display_pack_contract.quality_surfaces',
  );
  const targetCapabilities = requireStringArray(
    oplHandoff,
    'target_capabilities',
    'display_pack_contract.opl_handoff',
  );
  const masCurrentCapabilities = requireStringArray(
    oplHandoff,
    'mas_current_capabilities',
    'display_pack_contract.opl_handoff',
  );
  const requiredPackFields = requireStringArray(
    packDescriptor,
    'required_fields',
    'display_pack_contract.pack_descriptor',
  );
  const requiredTemplateFields = requireStringArray(
    templateDescriptor,
    'required_fields',
    'display_pack_contract.template_descriptor',
  );
  const allowedTemplateKinds = optionalStringArray(
    templateDescriptor,
    'allowed_kinds',
    'display_pack_contract.template_descriptor',
  );
  const allowedExecutionModes = optionalStringArray(
    templateDescriptor,
    'allowed_execution_modes',
    'display_pack_contract.template_descriptor',
  );
  const forbiddenClaims = requireStringArray(
    oplHandoff,
    'forbidden_claims',
    'display_pack_contract.opl_handoff',
  );

  return {
    schema_version: 1,
    pack_id: 'mas.display-pack.v2',
    version: `${contract.schema_version}.0.0`,
    pack_kind: 'display_pack',
    owner: requireString(contract, 'owner', 'display_pack_contract'),
    capabilities: [
      {
        capability_id: 'mas_display_pack_v2_contract_consumption',
        capability_kind: 'display_pack_contract_ref_transport',
        entrypoint_ref:
          typeof packDescriptor.native_manifest === 'string' ? packDescriptor.native_manifest : 'display_pack.toml',
        input_contract_ref: MAS_DISPLAY_PACK_V2_SOURCE_CONTRACT_REF,
        output_contract_ref: displayPackLockSurface,
      },
      {
        capability_id: 'mas_display_pack_v2_template_contract_refs',
        capability_kind: 'display_template_descriptor_ref_transport',
        entrypoint_ref:
          typeof templateDescriptor.native_manifest === 'string'
            ? templateDescriptor.native_manifest
            : 'templates/<template_id>/template.toml',
        input_contract_ref: MAS_DISPLAY_PACK_V2_SOURCE_CONTRACT_REF,
        output_contract_ref: displayPackLockSurface,
      },
    ],
    resources: [
      {
        resource_id: 'mas.display_pack_v2.contract',
        role: 'descriptor',
        ref: MAS_DISPLAY_PACK_V2_SOURCE_CONTRACT_REF,
      },
      ...requiredPackFields.map((field) => ({
        resource_id: `mas.display_pack_v2.pack_field.${field}`,
        role: 'descriptor',
        ref: `${MAS_DISPLAY_PACK_V2_SOURCE_CONTRACT_REF}#/pack_descriptor/required_fields/${field}`,
      })),
      ...requiredTemplateFields.map((field) => ({
        resource_id: `mas.display_pack_v2.template_field.${field}`,
        role: 'descriptor',
        ref: `${MAS_DISPLAY_PACK_V2_SOURCE_CONTRACT_REF}#/template_descriptor/required_fields/${field}`,
      })),
      ...allowedTemplateKinds.map((kind) => ({
        resource_id: `mas.display_pack_v2.template_kind.${kind}`,
        role: 'descriptor',
        ref: `${MAS_DISPLAY_PACK_V2_SOURCE_CONTRACT_REF}#/template_descriptor/allowed_kinds/${kind}`,
      })),
      ...allowedExecutionModes.map((mode) => ({
        resource_id: `mas.display_pack_v2.execution_mode.${mode}`,
        role: 'descriptor',
        ref: `${MAS_DISPLAY_PACK_V2_SOURCE_CONTRACT_REF}#/template_descriptor/allowed_execution_modes/${mode}`,
      })),
      ...paperQualityRefs.map((ref) => ({
        resource_id: `mas.display_pack_v2.quality_ref.${ref.replace(/[^a-zA-Z0-9]+/g, '_')}`,
        role: ref.includes('receipt') ? 'receipt_ref' : 'artifact_ref',
        ref,
      })),
      ...targetCapabilities.map((capability) => ({
        resource_id: `mas.display_pack_v2.opl_target.${capability}`,
        role: 'artifact_ref',
        ref: `${MAS_DISPLAY_PACK_V2_SOURCE_CONTRACT_REF}#/opl_handoff/target_capabilities/${capability}`,
      })),
      ...masCurrentCapabilities.map((capability) => ({
        resource_id: `mas.display_pack_v2.mas_current.${capability}`,
        role: 'artifact_ref',
        ref: `${MAS_DISPLAY_PACK_V2_SOURCE_CONTRACT_REF}#/opl_handoff/mas_current_capabilities/${capability}`,
      })),
    ],
    artifact_lifecycle: {
      states: ['declared', 'resolved', 'locked', 'artifact_refs_observed', 'review_receipts_observed', 'handoff_ready'],
      current_state: 'resolved',
      artifact_locator_refs: [
        displayPackLockSurface,
        ...paperQualityRefs,
      ],
      retention: {
        policy_ref: 'policy:refs-only-mas-display-pack-v2-lock',
        restore_proof_required: true,
      },
    },
    review_transport: {
      receipt_refs: paperQualityRefs.filter((ref) => ref.includes('receipt')),
      reviewer_adapter_refs: ['mas:display-pack-v2-contract-validator'],
      receipt_transport_only: true,
      quality_verdict_owner: requireString(contract, 'owner', 'display_pack_contract'),
    },
    authority_boundary: {
      can_write_domain_truth: false,
      can_mutate_artifact_body: false,
      can_sign_domain_owner_receipt: false,
      can_authorize_quality_verdict: false,
      can_authorize_publication_readiness: false,
      can_authorize_grant_readiness: false,
      can_authorize_visual_export_readiness: false,
      can_authorize_app_release_readiness: false,
      provider_completion_is_pack_quality_ready: false,
    },
    provenance: {
      source_ref: MAS_DISPLAY_PACK_V2_SOURCE_CONTRACT_REF,
      license_ref: requireString(contract, 'owner', 'display_pack_contract'),
      release_ref: requireString(contract, 'contract_id', 'display_pack_contract'),
      descriptor_created_by: 'one-person-lab:pack-os:mas-display-v2-consumer',
      mas_contract_path: resolvedPath,
      mas_contract_sha256: sha256File(resolvedPath),
      mas_opl_handoff_tail_status: requireString(oplHandoff, 'tail_status', 'display_pack_contract.opl_handoff'),
      mas_opl_handoff_forbidden_claims: forbiddenClaims,
    },
  };
}

function normalizeGenericPackDescriptor(payload: JsonRecord, descriptorDir: string) {
  const packId = requireString(payload, 'pack_id', 'pack_descriptor');
  const version = requireString(payload, 'version', 'pack_descriptor');
  const packKind = requireString(payload, 'pack_kind', 'pack_descriptor');
  if (!ALLOWED_PACK_KINDS.has(packKind)) {
    throw shape('pack_descriptor.pack_kind is not allowed.', {
      pack_kind: packKind,
      allowed: [...ALLOWED_PACK_KINDS],
    });
  }

  const normalized = {
    schema_version: normalizeSchemaVersion(payload),
    pack_id: packId,
    version,
    pack_kind: packKind,
    owner: requireString(payload, 'owner', 'pack_descriptor'),
    capabilities: normalizeCapabilities(payload),
    resources: normalizeResources(payload, descriptorDir),
    artifact_lifecycle: normalizeArtifactLifecycle(payload),
    review_transport: normalizeReviewTransport(payload),
    authority_boundary: normalizeAuthorityBoundary(payload),
    provenance: normalizeProvenance(payload),
  };
  return normalized;
}

export function loadGenericPackDescriptor(descriptorPath: string) {
  const resolvedPath = path.resolve(descriptorPath);
  const payload = readJsonFile(resolvedPath);
  const descriptorSha256 = sha256File(resolvedPath);
  return {
    descriptor_path: resolvedPath,
    descriptor_sha256: descriptorSha256,
    descriptor_oci: ociDescriptor(PACK_OS_DESCRIPTOR_MEDIA_TYPE, descriptorSha256, fs.statSync(resolvedPath).size),
    descriptor: normalizeGenericPackDescriptor(payload, path.dirname(resolvedPath)),
  };
}

export function loadGenericPackDescriptorFromRecord(descriptorPath: string, payload: JsonRecord, descriptorSha256: string) {
  const resolvedPath = path.resolve(descriptorPath);
  return {
    descriptor_path: resolvedPath,
    descriptor_sha256: descriptorSha256,
    descriptor_oci: ociDescriptor(PACK_OS_DESCRIPTOR_MEDIA_TYPE, descriptorSha256, fs.statSync(resolvedPath).size),
    descriptor: normalizeGenericPackDescriptor(payload, path.dirname(resolvedPath)),
  };
}

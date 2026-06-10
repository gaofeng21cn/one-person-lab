import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError, isRecord } from './contract-validation.ts';

type JsonRecord = Record<string, unknown>;

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

const REQUIRED_AUTHORITY_FALSE_FLAGS = [
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

const MAS_DISPLAY_PACK_V2_SOURCE_CONTRACT_REF = 'med-autoscience:contracts/display-pack-contract.v2.json';

function usage(message: string, details: JsonRecord = {}) {
  return new FrameworkContractError('cli_usage_error', message, details);
}

function shape(message: string, details: JsonRecord = {}) {
  return new FrameworkContractError('contract_shape_invalid', message, details);
}

function readJsonFile(filePath: string): JsonRecord {
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

function sha256File(filePath: string) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function normalizeRelativeRef(ref: string) {
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
    };
  }

  const stats = fs.statSync(absolutePath);
  if (!stats.isFile()) {
    throw shape('Pack resource refs that resolve locally must point to files.', { ref });
  }

  return {
    ref_kind: 'local_file',
    status: 'present',
    sha256: sha256File(absolutePath),
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

function parseDescriptorArgs(args: string[], usageText: string) {
  let descriptor: string | null = null;
  let output: string | null = null;
  const remaining = [...args];
  while (remaining.length > 0) {
    const token = remaining.shift()!;
    if (token === '--descriptor') {
      descriptor = remaining.shift() ?? null;
      if (!descriptor) {
        throw usage(`${usageText} requires a value after --descriptor.`, { required: ['--descriptor <path>'] });
      }
      continue;
    }
    if (token === '--output') {
      output = remaining.shift() ?? null;
      if (!output) {
        throw usage(`${usageText} requires a value after --output.`, { required: ['--output <path>'] });
      }
      continue;
    }
    throw usage(`Unknown pack os option: ${token}.`, { token, usage: usageText });
  }

  if (!descriptor) {
    throw usage(`${usageText} requires --descriptor <path>.`, { required: ['--descriptor <path>'] });
  }

  return { descriptor, output };
}

function parseContractArgs(args: string[], usageText: string) {
  let contract: string | null = null;
  let output: string | null = null;
  const remaining = [...args];
  while (remaining.length > 0) {
    const token = remaining.shift()!;
    if (token === '--contract') {
      contract = remaining.shift() ?? null;
      if (!contract) {
        throw usage(`${usageText} requires a value after --contract.`, { required: ['--contract <path>'] });
      }
      continue;
    }
    if (token === '--output') {
      output = remaining.shift() ?? null;
      if (!output) {
        throw usage(`${usageText} requires a value after --output.`, { required: ['--output <path>'] });
      }
      continue;
    }
    throw usage(`Unknown pack os option: ${token}.`, { token, usage: usageText });
  }

  if (!contract) {
    throw usage(`${usageText} requires --contract <path>.`, { required: ['--contract <path>'] });
  }

  return { contract, output };
}

function buildMasDisplayPackV2Descriptor(contractPath: string) {
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
  return {
    descriptor_path: resolvedPath,
    descriptor_sha256: sha256File(resolvedPath),
    descriptor: normalizeGenericPackDescriptor(payload, path.dirname(resolvedPath)),
  };
}

function loadGenericPackDescriptorFromRecord(descriptorPath: string, payload: JsonRecord, descriptorSha256: string) {
  const resolvedPath = path.resolve(descriptorPath);
  return {
    descriptor_path: resolvedPath,
    descriptor_sha256: descriptorSha256,
    descriptor: normalizeGenericPackDescriptor(payload, path.dirname(resolvedPath)),
  };
}

export function buildMasDisplayPackV2PackOsSmoke(contractPath: string) {
  const descriptor = buildMasDisplayPackV2Descriptor(contractPath);
  const loaded = loadGenericPackDescriptorFromRecord(contractPath, descriptor, sha256File(contractPath));
  const lock = buildPackOsLockFromLoaded(loaded).pack_lock;
  const checks = [
    {
      check_id: 'mas_display_pack_v2_contract_loaded',
      status: 'pass',
      ref: lock.provenance.source_ref,
    },
    {
      check_id: 'mas_authority_boundary_preserved',
      status: 'pass',
      owner: lock.review_transport.quality_verdict_owner,
    },
    {
      check_id: 'refs_only_lock_projected',
      status: 'pass',
      artifact_locator_ref_count: lock.summary.artifact_locator_ref_count,
      receipt_ref_count: lock.summary.receipt_ref_count,
    },
    {
      check_id: 'no_mas_authority_claimed',
      status: 'pass',
      not_claims: lock.not_claims,
    },
  ];
  return {
    version: 'g2',
    pack_os_display_pack_v2_smoke: {
      surface_kind: 'opl_pack_os_mas_display_pack_v2_smoke',
      contract_ref: 'contracts/opl-framework/pack-os-contract.json',
      source_contract_ref: MAS_DISPLAY_PACK_V2_SOURCE_CONTRACT_REF,
      source_contract_id: 'display-pack-contract.v2',
      domain_authority_owner: lock.owner,
      status: 'pass',
      pack_lock: lock,
      audit: {
        surface_kind: 'opl_pack_os_mas_display_pack_v2_audit',
        status: 'pass',
        checks,
        forbidden_claims: [
          'OPL owns MAS publication quality',
          'OPL mutates MAS display artifacts',
          'OPL pack lock authorizes MAS publication readiness',
        ],
      },
    },
  };
}

export function buildPackOsInspection(descriptorPath: string) {
  const loaded = loadGenericPackDescriptor(descriptorPath);
  const missingResources = loaded.descriptor.resources.filter((entry) => entry.status === 'missing');
  return {
    version: 'g2',
    pack_os: {
      surface_kind: 'opl_pack_os_inspection',
      contract_ref: 'contracts/opl-framework/pack-os-contract.json',
      descriptor_path: loaded.descriptor_path,
      descriptor_sha256: loaded.descriptor_sha256,
      pack_id: loaded.descriptor.pack_id,
      pack_kind: loaded.descriptor.pack_kind,
      pack_version: loaded.descriptor.version,
      owner: loaded.descriptor.owner,
      status: missingResources.length === 0 ? 'resolved' : 'resolved_with_missing_refs',
      missing_resource_count: missingResources.length,
      authority_boundary: loaded.descriptor.authority_boundary,
      forbidden_claims: [
        'pack_lock_is_domain_ready',
        'review_receipt_transport_is_quality_verdict',
        'artifact_locator_ref_is_artifact_authority',
        'provider_completion_is_pack_quality_ready',
      ],
    },
    descriptor: loaded.descriptor,
  };
}

function buildPackOsLockFromLoaded(loaded: ReturnType<typeof loadGenericPackDescriptor>) {
  const presentResourceCount = loaded.descriptor.resources.filter((entry) => entry.status === 'present').length;
  const missingResourceCount = loaded.descriptor.resources.filter((entry) => entry.status === 'missing').length;
  return {
    version: 'g2',
    pack_lock: {
      surface_kind: 'opl_generic_pack_lock',
      lock_id: `opl-pack-lock:${loaded.descriptor.pack_id}@${loaded.descriptor.version}`,
      pack_id: loaded.descriptor.pack_id,
      version: loaded.descriptor.version,
      pack_kind: loaded.descriptor.pack_kind,
      owner: loaded.descriptor.owner,
      descriptor_ref: loaded.descriptor_path,
      descriptor_sha256: loaded.descriptor_sha256,
      resolver: {
        resolver_owner: 'one-person-lab',
        resolver_role: 'generic_pack_descriptor_to_refs_only_lock',
        install_status: 'descriptor_resolved',
        runtime_isolation_status: 'declared_by_pack_os_not_executed_by_lock',
        cache_status: presentResourceCount > 0 ? 'hashes_recorded_for_present_local_files' : 'no_local_files_hashed',
      },
      resolved_resources: loaded.descriptor.resources,
      artifact_lifecycle: loaded.descriptor.artifact_lifecycle,
      review_transport: loaded.descriptor.review_transport,
      authority_boundary: loaded.descriptor.authority_boundary,
      provenance: loaded.descriptor.provenance,
      summary: {
        capability_count: loaded.descriptor.capabilities.length,
        resource_count: loaded.descriptor.resources.length,
        present_resource_count: presentResourceCount,
        missing_resource_count: missingResourceCount,
        receipt_ref_count: loaded.descriptor.review_transport.receipt_refs.length,
        artifact_locator_ref_count: loaded.descriptor.artifact_lifecycle.artifact_locator_refs.length,
      },
      not_claims: [
        'domain_ready',
        'quality_verdict',
        'artifact_authority',
        'publication_ready',
        'grant_ready',
        'visual_export_ready',
        'app_release_ready',
        'production_ready',
      ],
    },
  };
}

export function buildPackOsLock(descriptorPath: string) {
  return buildPackOsLockFromLoaded(loadGenericPackDescriptor(descriptorPath));
}

export function buildPackOsValidation(descriptorPath: string) {
  const lock = buildPackOsLock(descriptorPath).pack_lock;
  const checks = [
    {
      check_id: 'descriptor_loaded',
      status: 'pass',
      ref: lock.descriptor_ref,
    },
    {
      check_id: 'required_authority_false_flags',
      status: 'pass',
      fields: REQUIRED_AUTHORITY_FALSE_FLAGS,
    },
    {
      check_id: 'resources_hashed_or_refs_only',
      status: 'pass',
      present_resource_count: lock.summary.present_resource_count,
      missing_resource_count: lock.summary.missing_resource_count,
    },
    {
      check_id: 'review_transport_is_refs_only',
      status: lock.review_transport.receipt_transport_only ? 'pass' : 'fail',
      receipt_transport_only: lock.review_transport.receipt_transport_only,
    },
  ];
  const status = checks.every((entry) => entry.status === 'pass') ? 'valid' : 'invalid';
  if (status !== 'valid') {
    throw shape('Pack OS descriptor failed validation.', { checks });
  }
  return {
    version: 'g2',
    pack_os_validation: {
      surface_kind: 'opl_pack_os_validation',
      contract_ref: 'contracts/opl-framework/pack-os-contract.json',
      status,
      pack_id: lock.pack_id,
      pack_kind: lock.pack_kind,
      checks,
      authority_boundary: lock.authority_boundary,
      not_claims: lock.not_claims,
    },
  };
}

export function runPackOsInspectCommand(args: string[]) {
  const parsed = parseDescriptorArgs(args, 'opl pack os inspect --descriptor <path>');
  if (parsed.output) {
    throw usage('opl pack os inspect does not accept --output; use pack os lock for lock materialization.', {
      output: parsed.output,
    });
  }
  return buildPackOsInspection(parsed.descriptor);
}

export function runPackOsValidateCommand(args: string[]) {
  const parsed = parseDescriptorArgs(args, 'opl pack os validate --descriptor <path>');
  if (parsed.output) {
    throw usage('opl pack os validate does not accept --output; use pack os lock for lock materialization.', {
      output: parsed.output,
    });
  }
  return buildPackOsValidation(parsed.descriptor);
}

export function runPackOsMasDisplaySmokeCommand(args: string[]) {
  const parsed = parseContractArgs(args, 'opl pack os mas-display-smoke --contract <path> [--output <path>]');
  const payload = buildMasDisplayPackV2PackOsSmoke(parsed.contract);
  if (!parsed.output) {
    return payload;
  }
  const outputPath = path.resolve(parsed.output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(payload.pack_os_display_pack_v2_smoke.pack_lock, null, 2)}\n`);
  return {
    ...payload,
    pack_lock_output: {
      path: outputPath,
      sha256: sha256File(outputPath),
      status: 'written',
    },
  };
}

export function runPackOsLockCommand(args: string[]) {
  const parsed = parseDescriptorArgs(args, 'opl pack os lock --descriptor <path> [--output <path>]');
  const payload = buildPackOsLock(parsed.descriptor);
  if (!parsed.output) {
    return payload;
  }
  const outputPath = path.resolve(parsed.output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(payload.pack_lock, null, 2)}\n`);
  return {
    ...payload,
    pack_lock_output: {
      path: outputPath,
      sha256: sha256File(outputPath),
      status: 'written',
    },
  };
}

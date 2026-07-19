import {
  FrameworkContractError,
  isRecord,
} from '../../kernel/contract-validation.ts';
import { optionalString } from '../../kernel/json-file.ts';
import {
  FORBIDDEN_DOMAIN_GENERIC_OWNER_ROLES,
  OPL_GENERATED_SURFACES,
  PRIVATE_FUNCTIONAL_SURFACE_ADMISSION_POLICY_REF,
} from './standard-domain-agent-scaffold-constants.ts';

type JsonRecord = Record<string, unknown>;

export const STANDARD_GENERATED_SURFACE_HANDOFF_DEFAULTS_PROFILE =
  'opl.standard-generated-surface-handoff.v1';

export const HOSTED_FOUNDRY_GENERATED_SURFACE_HANDOFF_DEFAULTS_PROFILE =
  'opl.hosted-foundry-generated-surface-handoff.v1';

export const STANDARD_FUNCTIONAL_PRIVATIZATION_AUDIT_DEFAULTS_PROFILE =
  'opl.standard-functional-privatization-audit.v1';

export const STANDARD_FUNCTIONAL_PRIVATIZATION_CLASSIFICATION_POLICY = {
  rule: 'domain_declares_non_knowledge_functional_modules_for_opl_unified_audit',
  accepted_migration_classes: [
    'opl_hosted_surface',
    'opl_generated_surface',
    'declarative_pack',
    'minimal_authority_function',
    'refs_only_domain_adapter',
    'opl_storage_substrate_mas_refs_projection',
    'domain_handler_target',
    'native_helper_implementation',
    'temporary_migration_bridge',
    'diagnostic_cleanup_path',
    'provenance_or_fixture',
  ],
} as const;

const STANDARD_REQUIRED_DOMAIN_HANDOFF = [
  'owner_receipt_schema',
  'typed_blocker_schema',
  'minimal_authority_function_refs',
  'no_forbidden_write_evidence',
] as const;

const STANDARD_GENERATED_SURFACE_AUTHORITY_BOUNDARY = {
  generated_surface_can_write_domain_truth: false,
  generated_surface_can_write_memory_body: false,
  generated_surface_can_mutate_domain_artifact_body: false,
  generated_surface_can_authorize_quality_or_export: false,
  generated_surface_can_sign_owner_receipt: false,
  provider_completion_is_domain_completion: false,
} as const;

function contractShapeError(message: string, details: JsonRecord = {}) {
  return new FrameworkContractError('contract_shape_invalid', message, details);
}

function standardGeneratedSurfaces() {
  return OPL_GENERATED_SURFACES.map((surface) => ({
    ...surface,
    target_role: surface.surface_id === 'workbench_drilldown'
      ? 'opl_hosted_surface'
      : 'opl_generated_surface',
    status: 'descriptor_source_available',
  }));
}

function hostedGeneratedSurfaces(value: unknown, sourceContractRef: string) {
  return stringArray(value, 'generated_surface_ids').map((surfaceId) => ({
    surface_id: surfaceId,
    owner: 'one-person-lab',
    target_role: surfaceId === 'workbench_drilldown'
      ? 'opl_hosted_surface'
      : 'opl_generated_surface',
    status: 'descriptor_source_available',
    source_contract: sourceContractRef,
    domain_policy: 'domain_repo_declares_surface_descriptor_only',
  }));
}

function standardHandoffSurfaces() {
  return [
    {
      surface_id: 'cli',
      owner: 'one-person-lab',
      current_paths: ['agent/cli.ts'],
      current_role: 'domain_handler_target',
      target_role: 'opl_generated_command_surface',
    },
    {
      surface_id: 'mcp',
      owner: 'one-person-lab',
      current_paths: ['agent/mcp.ts'],
      current_role: 'domain_handler_target',
      target_role: 'opl_generated_mcp_descriptor_surface',
    },
    {
      surface_id: 'skill',
      owner: 'one-person-lab',
      current_paths: ['agent/skills/domain_execution.md'],
      current_role: 'domain_handler_target',
      target_role: 'opl_generated_skill_descriptor_surface',
    },
    {
      surface_id: 'product_entry_manifest',
      owner: 'one-person-lab',
      current_paths: ['agent/product-entry.ts'],
      current_role: 'domain_handler_target',
      target_role: 'opl_generated_product_entry_surface',
    },
    {
      surface_id: 'domain_handler',
      owner: 'one-person-lab',
      current_paths: ['runtime/authority_functions/domain-intake-owner-handoff.ts'],
      current_role: 'domain_authority_function_target',
      target_role: 'opl_generated_domain_handler_handoff_surface',
    },
    {
      surface_id: 'status_read_model',
      owner: 'one-person-lab',
      current_paths: ['contracts/owner_receipt_contract.json'],
      current_role: 'domain_projection_refs',
      target_role: 'opl_generated_status_read_model_surface',
    },
    {
      surface_id: 'workbench_drilldown',
      owner: 'one-person-lab',
      current_paths: ['contracts/artifact_locator_contract.json'],
      current_role: 'projection_refs',
      target_role: 'opl_hosted_workbench_shell_consuming_domain_refs',
    },
  ];
}

function recordArray(value: unknown, field: string) {
  if (value === undefined) return [] as JsonRecord[];
  if (!Array.isArray(value) || value.some((entry) => !isRecord(entry))) {
    throw contractShapeError(`${field} must be an array of objects.`, { field });
  }
  return value as JsonRecord[];
}

function stringArray(value: unknown, field: string) {
  if (!Array.isArray(value)) {
    throw contractShapeError(`${field} must be an array of non-empty strings.`, { field });
  }
  const items = value.map((entry) => optionalString(entry));
  if (items.some((entry) => !entry) || new Set(items).size !== items.length) {
    throw contractShapeError(`${field} must contain unique non-empty strings.`, { field });
  }
  return items as string[];
}

function requireSurfaceId(record: JsonRecord, field: string, index: number) {
  const surfaceId = optionalString(record.surface_id);
  if (!surfaceId) {
    throw contractShapeError(`${field}[${index}].surface_id must be a non-empty string.`, {
      field,
      index,
    });
  }
  return surfaceId;
}

function mergeSurfaceOverrides(
  defaults: JsonRecord[],
  overridesValue: unknown,
  field: string,
  sourceContractRef: string,
) {
  const overrides = recordArray(overridesValue, field);
  const seen = new Set<string>();
  const byId = new Map(defaults.map((surface) => [optionalString(surface.surface_id)!, surface]));
  const order = defaults.map((surface) => optionalString(surface.surface_id)!);
  for (const [index, override] of overrides.entries()) {
    const surfaceId = requireSurfaceId(override, field, index);
    if (seen.has(surfaceId)) {
      throw contractShapeError(`${field} contains a duplicate surface_id.`, {
        field,
        surface_id: surfaceId,
      });
    }
    seen.add(surfaceId);
    const current = byId.get(surfaceId) ?? {
      surface_id: surfaceId,
      owner: 'one-person-lab',
      target_role: 'opl_generated_surface',
      status: 'descriptor_source_available',
      source_contract: sourceContractRef,
      domain_policy: 'domain_repo_declares_surface_descriptor_only',
    };
    byId.set(surfaceId, { ...current, ...override, surface_id: surfaceId });
    if (!order.includes(surfaceId)) order.push(surfaceId);
  }
  return order.map((surfaceId) => byId.get(surfaceId)!);
}

function requirePlatformOwnedSurfaces(surfaces: JsonRecord[], field: string) {
  const invalid = surfaces
    .filter((surface) => optionalString(surface.owner) !== 'one-person-lab')
    .map((surface) => optionalString(surface.surface_id) ?? 'unknown_surface');
  if (invalid.length > 0) {
    throw contractShapeError(`${field} cannot transfer generated-surface ownership.`, {
      field,
      invalid_surface_ids: invalid,
    });
  }
  return surfaces;
}

function authorityBoundaryDelta(value: unknown) {
  if (value === undefined) return {} as JsonRecord;
  if (!isRecord(value)) {
    throw contractShapeError('authority_boundary must be an object.', {
      field: 'authority_boundary',
    });
  }
  const escalatedFields = Object.entries(value)
    .filter(([, fieldValue]) => fieldValue === true)
    .map(([field]) => field);
  if (escalatedFields.length > 0) {
    throw contractShapeError('Generated-surface handoff authority delta cannot grant authority.', {
      escalated_fields: escalatedFields,
    });
  }
  return value;
}

function retiredDefaultSurfaceSource(surfaceId: string, sourceContractRef: string) {
  if (surfaceId === 'product_status') return 'contracts/generated_surface_handoff.json';
  if (surfaceId === 'product_session') return 'agent/stages/manifest.json';
  if (surfaceId === 'workbench') return 'contracts/artifact_locator_contract.json';
  return sourceContractRef;
}

function retiredDefaultHandoffSurfaces(
  value: unknown,
  agentId: string,
  sourceContractRef: string,
) {
  const surfaces = recordArray(value, 'retired_default_surfaces');
  const seen = new Set<string>();
  return surfaces.map((surface, index) => {
    const surfaceId = requireSurfaceId(surface, 'retired_default_surfaces', index);
    if (seen.has(surfaceId)) {
      throw contractShapeError('retired_default_surfaces contains a duplicate surface_id.', {
        surface_id: surfaceId,
      });
    }
    seen.add(surfaceId);
    return {
      owner: 'one-person-lab',
      target_role: surfaceId === 'workbench' ? 'opl_hosted_surface' : 'opl_generated_surface',
      status: 'descriptor_source_available_without_repo_local_default_surface',
      source_contract: retiredDefaultSurfaceSource(surfaceId, sourceContractRef),
      current_paths: [],
      current_surface_refs: [`opl-generated-default-caller:${agentId}/${surfaceId}`],
      domain_policy: 'domain_repo_has_no_default_surface_and_supplies_domain_contracts_only',
      retired_default_surface_id: surfaceId,
      ...surface,
      surface_id: surfaceId,
    };
  });
}

export function resolveGeneratedSurfaceHandoffContract(value: unknown): JsonRecord | null {
  if (!isRecord(value)) return null;
  if (value.surface_kind !== 'opl_generated_surface_handoff_delta') return value;

  const defaultsProfile = optionalString(value.defaults_profile);
  const domainId = optionalString(value.domain_id);
  const supportedProfile =
    defaultsProfile === STANDARD_GENERATED_SURFACE_HANDOFF_DEFAULTS_PROFILE
    || defaultsProfile === HOSTED_FOUNDRY_GENERATED_SURFACE_HANDOFF_DEFAULTS_PROFILE;
  if (
    value.schema_version !== 1
    || !supportedProfile
    || !domainId
  ) {
    throw contractShapeError('Generated-surface handoff delta metadata is invalid.', {
      defaults_profile: defaultsProfile,
      domain_id: domainId,
      schema_version: value.schema_version,
    });
  }
  if (
    value.generated_surface_owner !== 'one-person-lab'
    || value.domain_repo_can_own_generated_surface !== false
  ) {
    throw contractShapeError('Generated-surface handoff delta must keep ownership in one-person-lab.');
  }
  if ('generated_surfaces' in value || 'handoff_surfaces' in value) {
    throw contractShapeError(
      'Generated-surface handoff delta must use surface override fields instead of full surface arrays.',
    );
  }

  const {
    surface_kind: _surfaceKind,
    schema_version: _schemaVersion,
    defaults_profile: _defaultsProfile,
    generated_surface_ids: generatedSurfaceIds,
    generated_surface_overrides: generatedSurfaceOverrides,
    handoff_surface_overrides: handoffSurfaceOverrides,
    retired_default_surfaces: retiredDefaultSurfaces,
    authority_boundary: authorityBoundary,
    ...declaredDelta
  } = value;
  const sourceContractRef =
    optionalString(declaredDelta.source_contract_ref)
    ?? 'contracts/pack_compiler_input.json';
  const hostedProfile =
    defaultsProfile === HOSTED_FOUNDRY_GENERATED_SURFACE_HANDOFF_DEFAULTS_PROFILE;
  if (!hostedProfile && generatedSurfaceIds !== undefined) {
    throw contractShapeError(
      'generated_surface_ids is only available to the hosted Foundry defaults profile.',
    );
  }
  if (hostedProfile && retiredDefaultSurfaces !== undefined) {
    throw contractShapeError(
      'Hosted Foundry handoff deltas cannot declare retired default caller surfaces.',
    );
  }
  const generatedSurfaces = requirePlatformOwnedSurfaces(mergeSurfaceOverrides(
    hostedProfile
      ? hostedGeneratedSurfaces(generatedSurfaceIds, sourceContractRef)
      : standardGeneratedSurfaces(),
    generatedSurfaceOverrides,
    'generated_surface_overrides',
    sourceContractRef,
  ), 'generated_surface_overrides');
  const baseHandoffSurfaces = retiredDefaultSurfaces === undefined
    ? standardHandoffSurfaces()
    : retiredDefaultHandoffSurfaces(
        retiredDefaultSurfaces,
        optionalString(value.agent_id) ?? domainId,
        sourceContractRef,
      );
  const handoffSurfaces = requirePlatformOwnedSurfaces(mergeSurfaceOverrides(
    baseHandoffSurfaces,
    handoffSurfaceOverrides,
    'handoff_surface_overrides',
    sourceContractRef,
  ), 'handoff_surface_overrides');
  const authorityDelta = authorityBoundaryDelta(authorityBoundary);

  return {
    ...declaredDelta,
    surface_kind: 'opl_generated_surface_handoff',
    schema_version: 2,
    defaults_profile: defaultsProfile,
    domain_id: domainId,
    generated_surface_owner: 'one-person-lab',
    domain_repo_can_own_generated_surface: false,
    source_contract_ref: sourceContractRef,
    generated_surfaces: generatedSurfaces,
    handoff_surfaces: handoffSurfaces,
    required_domain_handoff: Array.isArray(declaredDelta.required_domain_handoff)
      ? declaredDelta.required_domain_handoff
      : [...STANDARD_REQUIRED_DOMAIN_HANDOFF],
    authority_boundary: {
      ...authorityDelta,
      ...STANDARD_GENERATED_SURFACE_AUTHORITY_BOUNDARY,
    },
  };
}

function functionalClassificationPolicy(value: unknown) {
  if (value === undefined) return STANDARD_FUNCTIONAL_PRIVATIZATION_CLASSIFICATION_POLICY;
  if (!isRecord(value) || !optionalString(value.rule)) {
    throw contractShapeError('classification_policy must declare a rule and accepted classes.');
  }
  const acceptedMigrationClasses = stringArray(
    value.accepted_migration_classes,
    'classification_policy.accepted_migration_classes',
  );
  const supported = new Set<string>(
    STANDARD_FUNCTIONAL_PRIVATIZATION_CLASSIFICATION_POLICY.accepted_migration_classes,
  );
  const unsupported = acceptedMigrationClasses.filter((entry) => !supported.has(entry));
  if (unsupported.length > 0) {
    throw contractShapeError('classification_policy cannot introduce unsupported migration classes.', {
      unsupported_migration_classes: unsupported,
    });
  }
  return value;
}

export function resolveFunctionalPrivatizationAuditContract(value: unknown): JsonRecord | null {
  if (!isRecord(value)) return null;
  const defaultsProfile = optionalString(value.defaults_profile);
  if (!defaultsProfile) return value;
  if (defaultsProfile !== STANDARD_FUNCTIONAL_PRIVATIZATION_AUDIT_DEFAULTS_PROFILE) {
    throw contractShapeError('Functional privatization audit defaults_profile is unsupported.', {
      defaults_profile: defaultsProfile,
    });
  }
  if (
    value.surface_kind !== 'functional_privatization_audit'
    || value.schema_version !== 1
    || !Array.isArray(value.modules)
  ) {
    throw contractShapeError('Functional privatization audit defaults require the canonical v1 shape.');
  }
  const {
    defaults_profile: _defaultsProfile,
    classification_policy: classificationPolicy,
    private_functional_surface_admission_policy_ref: privatePolicyRef,
    forbidden_generic_owner_roles: forbiddenOwnerRoles,
    ...declaredDelta
  } = value;
  if (privatePolicyRef !== undefined || forbiddenOwnerRoles !== undefined) {
    throw contractShapeError(
      'Functional privatization audit defaults must not repeat platform-owned policy fields.',
      {
        repeated_fields: [
          ...(privatePolicyRef === undefined
            ? []
            : ['private_functional_surface_admission_policy_ref']),
          ...(forbiddenOwnerRoles === undefined ? [] : ['forbidden_generic_owner_roles']),
        ],
      },
    );
  }
  return {
    ...declaredDelta,
    classification_policy: functionalClassificationPolicy(classificationPolicy),
    private_functional_surface_admission_policy_ref:
      PRIVATE_FUNCTIONAL_SURFACE_ADMISSION_POLICY_REF,
    forbidden_generic_owner_roles: [...FORBIDDEN_DOMAIN_GENERIC_OWNER_ROLES],
  };
}

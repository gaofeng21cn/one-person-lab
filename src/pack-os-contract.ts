import {
  FrameworkContractError,
  expectString,
  expectStringArray,
  isRecord,
} from './contract-validation.ts';
import type { PackOsContract } from './types.ts';

const DESCRIPTOR_REQUIRED_FIELDS = [
  'pack_id',
  'version',
  'pack_kind',
  'owner',
  'capabilities',
  'resources',
  'artifact_lifecycle',
  'review_transport',
  'authority_boundary',
  'provenance',
] as const;

const ALLOWED_PACK_KINDS = [
  'display_pack',
  'domain_pack',
  'deck_pack',
  'report_pack',
  'app_ui_pack',
  'generic_capability_pack',
] as const;

const RESOURCE_ROLES = [
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
] as const;

const LOCK_REQUIRED_FIELDS = [
  'lock_id',
  'pack_id',
  'version',
  'pack_kind',
  'descriptor_ref',
  'descriptor_sha256',
  'resolved_resources',
  'artifact_lifecycle',
  'review_transport',
  'authority_boundary',
  'provenance',
] as const;

const LIFECYCLE_STATES = [
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
] as const;

const LIFECYCLE_HARD_BOUNDARIES = [
  'content_hash_required_for_present_local_file',
  'artifact_body_not_stored_in_opl_contract',
  'review_receipt_transport_does_not_authorize_quality_verdict',
  'domain_owner_receipt_required_for_domain_truth_or_artifact_authority',
] as const;

const FORBIDDEN_CLAIMS = [
  'pack_lock_is_domain_ready',
  'review_receipt_transport_is_quality_verdict',
  'artifact_locator_ref_is_artifact_authority',
  'provider_completion_is_pack_quality_ready',
  'OPL Pack OS owns MAS publication quality',
  'OPL Pack OS mutates domain artifact bodies',
] as const;

const FOCUSED_TESTS = [
  'tests/src/pack-os.test.ts',
  'tests/src/cli/cases/pack-os-command-surface.test.ts',
] as const;

const REQUIRED_COMMANDS_WHEN_CHANGED = [
  'node --experimental-strip-types --test tests/src/pack-os.test.ts tests/src/cli/cases/pack-os-command-surface.test.ts',
  'npm run typecheck',
  'scripts/verify.sh',
] as const;

function requireRecord(value: unknown, field: string, filePath: string) {
  if (!isRecord(value)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `${field} must be an object.`,
      { file: filePath, field },
    );
  }
  return value;
}

function requireSection(value: Record<string, unknown>, field: string, filePath: string) {
  return requireRecord(value[field], field, filePath);
}

function expectExactString<T extends string>(
  value: unknown,
  expected: T,
  field: string,
  filePath: string,
) {
  const actual = expectString(value, field, filePath);
  if (actual !== expected) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `${field} must be ${expected}.`,
      { file: filePath, field, expected, actual },
    );
  }
  return expected;
}

function expectExactBoolean<T extends boolean>(
  value: unknown,
  expected: T,
  field: string,
  filePath: string,
) {
  if (value !== expected) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `${field} must be ${String(expected)}.`,
      { file: filePath, field, expected, actual: value },
    );
  }
  return expected;
}

function expectSchemaVersion(value: unknown, filePath: string) {
  if (value !== 1) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'pack-os-contract.json schema_version must be 1.',
      { file: filePath, field: 'schema_version', expected: 1, actual: value },
    );
  }
  return 1;
}

function requireEveryValue(
  actual: string[],
  expected: readonly string[],
  field: string,
  filePath: string,
) {
  const missing = expected.filter((entry) => !actual.includes(entry));
  if (missing.length > 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `${field} is missing required values.`,
      { file: filePath, field, expected: [...expected], missing },
    );
  }
}

function exactStringArray(value: unknown, expected: readonly string[], field: string, filePath: string) {
  const actual = expectStringArray(value, field, filePath);
  requireEveryValue(actual, expected, field, filePath);
  const unexpected = actual.filter((entry) => !expected.includes(entry));
  if (unexpected.length > 0 || actual.length !== expected.length) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `${field} must match the Pack OS contract vocabulary.`,
      { file: filePath, field, expected: [...expected], actual },
    );
  }
  return actual;
}

function validateCliSurfaces(section: Record<string, unknown>, filePath: string) {
  return {
    inspect: expectExactString(section.inspect, 'opl pack os inspect --descriptor <path>', 'cli_surfaces.inspect', filePath),
    install: expectExactString(
      section.install,
      'opl pack os install --descriptor <path> --registry <path> [--cache-root <dir>]',
      'cli_surfaces.install',
      filePath,
    ),
    registry: expectExactString(
      section.registry,
      'opl pack os registry --registry <path>',
      'cli_surfaces.registry',
      filePath,
    ),
    cache: expectExactString(
      section.cache,
      'opl pack os cache --descriptor <path> --cache-root <dir>',
      'cli_surfaces.cache',
      filePath,
    ),
    distribute: expectExactString(
      section.distribute,
      'opl pack os distribute --descriptor <path> --output <path> [--cache-root <dir>]',
      'cli_surfaces.distribute',
      filePath,
    ),
    lock: expectExactString(section.lock, 'opl pack os lock --descriptor <path>', 'cli_surfaces.lock', filePath),
    validate: expectExactString(section.validate, 'opl pack os validate --descriptor <path>', 'cli_surfaces.validate', filePath),
    mas_display_smoke: expectExactString(
      section.mas_display_smoke,
      'opl pack os mas-display-smoke --contract <path>',
      'cli_surfaces.mas_display_smoke',
      filePath,
    ),
  };
}

function validateDescriptorContract(section: Record<string, unknown>, filePath: string) {
  return {
    surface_kind: expectExactString(
      section.surface_kind,
      'opl_generic_capability_pack_descriptor',
      'descriptor_contract.surface_kind',
      filePath,
    ),
    required_fields: exactStringArray(
      section.required_fields,
      DESCRIPTOR_REQUIRED_FIELDS,
      'descriptor_contract.required_fields',
      filePath,
    ),
    allowed_pack_kinds: exactStringArray(
      section.allowed_pack_kinds,
      ALLOWED_PACK_KINDS,
      'descriptor_contract.allowed_pack_kinds',
      filePath,
    ),
    resource_roles: exactStringArray(
      section.resource_roles,
      RESOURCE_ROLES,
      'descriptor_contract.resource_roles',
      filePath,
    ),
    relationship_to_domain_packs: expectString(
      section.relationship_to_domain_packs,
      'descriptor_contract.relationship_to_domain_packs',
      filePath,
    ),
  };
}

function validateLockContract(section: Record<string, unknown>, filePath: string) {
  return {
    surface_kind: expectExactString(
      section.surface_kind,
      'opl_generic_pack_lock',
      'lock_contract.surface_kind',
      filePath,
    ),
    output_role: expectExactString(
      section.output_role,
      'refs_only_pack_resolution_lock',
      'lock_contract.output_role',
      filePath,
    ),
    required_fields: exactStringArray(
      section.required_fields,
      LOCK_REQUIRED_FIELDS,
      'lock_contract.required_fields',
      filePath,
    ),
    content_hash_algorithm: expectExactString(
      section.content_hash_algorithm,
      'sha256',
      'lock_contract.content_hash_algorithm',
      filePath,
    ),
    lock_projection_rule: expectString(
      section.lock_projection_rule,
      'lock_contract.lock_projection_rule',
      filePath,
    ),
  };
}

function validateRegistryCacheDistributionContract(section: Record<string, unknown>, filePath: string) {
  return {
    registry_surface_kind: expectExactString(
      section.registry_surface_kind,
      'opl_pack_os_registry',
      'registry_cache_distribution_contract.registry_surface_kind',
      filePath,
    ),
    install_receipt_surface_kind: expectExactString(
      section.install_receipt_surface_kind,
      'opl_pack_os_install_receipt',
      'registry_cache_distribution_contract.install_receipt_surface_kind',
      filePath,
    ),
    cache_manifest_surface_kind: expectExactString(
      section.cache_manifest_surface_kind,
      'opl_pack_os_cache_manifest',
      'registry_cache_distribution_contract.cache_manifest_surface_kind',
      filePath,
    ),
    distribution_manifest_surface_kind: expectExactString(
      section.distribution_manifest_surface_kind,
      'opl_pack_os_distribution_manifest',
      'registry_cache_distribution_contract.distribution_manifest_surface_kind',
      filePath,
    ),
    distribution_bundle_surface_kind: expectExactString(
      section.distribution_bundle_surface_kind,
      'opl_pack_os_distribution_bundle',
      'registry_cache_distribution_contract.distribution_bundle_surface_kind',
      filePath,
    ),
    cache_layout: expectExactString(
      section.cache_layout,
      'sha256/<sha256>',
      'registry_cache_distribution_contract.cache_layout',
      filePath,
    ),
    registry_rule: expectString(
      section.registry_rule,
      'registry_cache_distribution_contract.registry_rule',
      filePath,
    ),
    distribution_rule: expectString(
      section.distribution_rule,
      'registry_cache_distribution_contract.distribution_rule',
      filePath,
    ),
  };
}

function validateLifecycleModel(section: Record<string, unknown>, filePath: string) {
  return {
    allowed_states: exactStringArray(
      section.allowed_states,
      LIFECYCLE_STATES,
      'lifecycle_model.allowed_states',
      filePath,
    ),
    hard_boundaries: exactStringArray(
      section.hard_boundaries,
      LIFECYCLE_HARD_BOUNDARIES,
      'lifecycle_model.hard_boundaries',
      filePath,
    ),
  };
}

function validateAuthorityBoundary(section: Record<string, unknown>, filePath: string) {
  return {
    opl_can_resolve_pack_descriptor: expectExactBoolean(
      section.opl_can_resolve_pack_descriptor,
      true,
      'authority_boundary.opl_can_resolve_pack_descriptor',
      filePath,
    ),
    opl_can_write_pack_lock: expectExactBoolean(
      section.opl_can_write_pack_lock,
      true,
      'authority_boundary.opl_can_write_pack_lock',
      filePath,
    ),
    opl_can_cache_pack_assets: expectExactBoolean(
      section.opl_can_cache_pack_assets,
      true,
      'authority_boundary.opl_can_cache_pack_assets',
      filePath,
    ),
    opl_can_project_artifact_locator_refs: expectExactBoolean(
      section.opl_can_project_artifact_locator_refs,
      true,
      'authority_boundary.opl_can_project_artifact_locator_refs',
      filePath,
    ),
    opl_can_transport_review_receipt_refs: expectExactBoolean(
      section.opl_can_transport_review_receipt_refs,
      true,
      'authority_boundary.opl_can_transport_review_receipt_refs',
      filePath,
    ),
    opl_can_write_domain_truth: expectExactBoolean(
      section.opl_can_write_domain_truth,
      false,
      'authority_boundary.opl_can_write_domain_truth',
      filePath,
    ),
    opl_can_mutate_artifact_body: expectExactBoolean(
      section.opl_can_mutate_artifact_body,
      false,
      'authority_boundary.opl_can_mutate_artifact_body',
      filePath,
    ),
    opl_can_sign_domain_owner_receipt: expectExactBoolean(
      section.opl_can_sign_domain_owner_receipt,
      false,
      'authority_boundary.opl_can_sign_domain_owner_receipt',
      filePath,
    ),
    opl_can_authorize_quality_verdict: expectExactBoolean(
      section.opl_can_authorize_quality_verdict,
      false,
      'authority_boundary.opl_can_authorize_quality_verdict',
      filePath,
    ),
    opl_can_authorize_publication_readiness: expectExactBoolean(
      section.opl_can_authorize_publication_readiness,
      false,
      'authority_boundary.opl_can_authorize_publication_readiness',
      filePath,
    ),
    opl_can_authorize_grant_readiness: expectExactBoolean(
      section.opl_can_authorize_grant_readiness,
      false,
      'authority_boundary.opl_can_authorize_grant_readiness',
      filePath,
    ),
    opl_can_authorize_visual_export_readiness: expectExactBoolean(
      section.opl_can_authorize_visual_export_readiness,
      false,
      'authority_boundary.opl_can_authorize_visual_export_readiness',
      filePath,
    ),
    opl_can_authorize_app_release_readiness: expectExactBoolean(
      section.opl_can_authorize_app_release_readiness,
      false,
      'authority_boundary.opl_can_authorize_app_release_readiness',
      filePath,
    ),
    provider_completion_is_pack_quality_ready: expectExactBoolean(
      section.provider_completion_is_pack_quality_ready,
      false,
      'authority_boundary.provider_completion_is_pack_quality_ready',
      filePath,
    ),
  };
}

function validateDomainHandoff(section: Record<string, unknown>, filePath: string) {
  const masDisplayPack = requireSection(section, 'mas_display_pack_v2', filePath);
  return {
    mas_display_pack_v2: {
      source_contract_ref: expectExactString(
        masDisplayPack.source_contract_ref,
        'med-autoscience:contracts/display-pack-contract.v2.json',
        'domain_handoff.mas_display_pack_v2.source_contract_ref',
        filePath,
      ),
      transport_role: expectString(
        masDisplayPack.transport_role,
        'domain_handoff.mas_display_pack_v2.transport_role',
        filePath,
      ),
      domain_authority_owner: expectExactString(
        masDisplayPack.domain_authority_owner,
        'MedAutoScience',
        'domain_handoff.mas_display_pack_v2.domain_authority_owner',
        filePath,
      ),
      consumer_smoke_surface: expectExactString(
        masDisplayPack.consumer_smoke_surface,
        'opl pack os mas-display-smoke --contract <path>',
        'domain_handoff.mas_display_pack_v2.consumer_smoke_surface',
        filePath,
      ),
      audit_surface: expectExactString(
        masDisplayPack.audit_surface,
        'opl_pack_os_mas_display_pack_v2_audit',
        'domain_handoff.mas_display_pack_v2.audit_surface',
        filePath,
      ),
      forbidden_claim: expectString(
        masDisplayPack.forbidden_claim,
        'domain_handoff.mas_display_pack_v2.forbidden_claim',
        filePath,
      ),
    },
    future_family_packs: expectStringArray(
      section.future_family_packs,
      'domain_handoff.future_family_packs',
      filePath,
    ),
  };
}

function validateVerification(section: Record<string, unknown>, filePath: string) {
  return {
    focused_tests: exactStringArray(
      section.focused_tests,
      FOCUSED_TESTS,
      'verification.focused_tests',
      filePath,
    ),
    required_commands_when_changed: exactStringArray(
      section.required_commands_when_changed,
      REQUIRED_COMMANDS_WHEN_CHANGED,
      'verification.required_commands_when_changed',
      filePath,
    ),
  };
}

export function validatePackOsContract(filePath: string, value: unknown): PackOsContract {
  const root = requireRecord(value, 'pack-os-contract.json', filePath);
  return {
    schema_version: expectSchemaVersion(root.schema_version, filePath),
    contract_id: expectExactString(root.contract_id, 'opl-pack-os-contract.v1', 'contract_id', filePath),
    owner: expectString(root.owner, 'owner', filePath),
    purpose: expectString(root.purpose, 'purpose', filePath),
    state: expectString(root.state, 'state', filePath),
    machine_boundary: expectString(root.machine_boundary, 'machine_boundary', filePath),
    source_module: expectExactString(root.source_module, 'src/pack-os.ts', 'source_module', filePath),
    cli_surfaces: validateCliSurfaces(requireSection(root, 'cli_surfaces', filePath), filePath),
    descriptor_contract: validateDescriptorContract(requireSection(root, 'descriptor_contract', filePath), filePath),
    registry_cache_distribution_contract: validateRegistryCacheDistributionContract(
      requireSection(root, 'registry_cache_distribution_contract', filePath),
      filePath,
    ),
    lock_contract: validateLockContract(requireSection(root, 'lock_contract', filePath), filePath),
    lifecycle_model: validateLifecycleModel(requireSection(root, 'lifecycle_model', filePath), filePath),
    authority_boundary: validateAuthorityBoundary(requireSection(root, 'authority_boundary', filePath), filePath),
    domain_handoff: validateDomainHandoff(requireSection(root, 'domain_handoff', filePath), filePath),
    forbidden_claims: exactStringArray(root.forbidden_claims, FORBIDDEN_CLAIMS, 'forbidden_claims', filePath),
    verification: validateVerification(requireSection(root, 'verification', filePath), filePath),
  };
}

import {
  FrameworkContractError,
  expectString,
  expectStringArray,
  isRecord,
} from '../../kernel/contract-validation.ts';
import type { PackBundleContract } from '../../kernel/types.ts';

const ASSEMBLY_REQUIRED_FIELDS = [
  'schema_version',
  'bundle_id',
  'owner',
  'state',
  'aggregate_ref',
  'manifest_ref',
  'source_root_ref',
  'generated_array_fields',
  'commands',
  'authority_boundary',
] as const;

const GENERATED_ARRAY_FIELD_REQUIRED_FIELDS = [
  'field',
  'source_dir_ref',
  'order',
] as const;

const MANIFEST_RECORDS = [
  'assembly_ref',
  'source_root_ref',
  'source_entries',
  'source_digest',
  'generated_artifact.expected_sha256',
  'generated_artifact.do_not_edit',
  'generated_artifact.aggregate_is_generated_consumer_surface',
] as const;

const GENERATED_METADATA_REQUIRED_FIELDS = [
  'generator',
  'assembly_ref',
  'source_digest',
  'source_entry_count',
  'do_not_edit',
] as const;

const NOT_CLAIMS = [
  'domain_ready',
  'quality_verdict',
  'artifact_authority',
  'production_ready',
  'owner_receipt',
  'typed_blocker',
] as const;

const FOCUSED_TESTS = [
  'tests/src/pack-bundle.test.ts',
  'tests/src/cli/cases/pack-bundle-command-surface.test.ts',
] as const;

const REQUIRED_COMMANDS_WHEN_CHANGED = [
  'node --test tests/src/pack-bundle.test.ts tests/src/cli/cases/pack-bundle-command-surface.test.ts',
  'npm run typecheck',
  'npm run test:fast',
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
      'pack-bundle-contract.json schema_version must be 1.',
      { file: filePath, field: 'schema_version', expected: 1, actual: value },
    );
  }
  return 1;
}

function exactStringArray(value: unknown, expected: readonly string[], field: string, filePath: string) {
  const actual = expectStringArray(value, field, filePath);
  const missing = expected.filter((entry) => !actual.includes(entry));
  const unexpected = actual.filter((entry) => !expected.includes(entry));
  if (missing.length > 0 || unexpected.length > 0 || actual.length !== expected.length) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `${field} must match the Pack Bundle contract vocabulary.`,
      { file: filePath, field, expected: [...expected], actual, missing, unexpected },
    );
  }
  return actual;
}

function validateCliSurfaces(section: Record<string, unknown>, filePath: string) {
  return {
    manifest: expectExactString(
      section.manifest,
      'opl pack bundle manifest --assembly <path>',
      'cli_surfaces.manifest',
      filePath,
    ),
    write: expectExactString(
      section.write,
      'opl pack bundle write --assembly <path>',
      'cli_surfaces.write',
      filePath,
    ),
    check: expectExactString(
      section.check,
      'opl pack bundle check --assembly <path>',
      'cli_surfaces.check',
      filePath,
    ),
  };
}

function validateAssemblyContract(section: Record<string, unknown>, filePath: string) {
  return {
    surface_kind: expectExactString(
      section.surface_kind,
      'opl_pack_bundle_assembly',
      'assembly_contract.surface_kind',
      filePath,
    ),
    required_fields: exactStringArray(
      section.required_fields,
      ASSEMBLY_REQUIRED_FIELDS,
      'assembly_contract.required_fields',
      filePath,
    ),
    generated_array_field_required_fields: exactStringArray(
      section.generated_array_field_required_fields,
      GENERATED_ARRAY_FIELD_REQUIRED_FIELDS,
      'assembly_contract.generated_array_field_required_fields',
      filePath,
    ),
    source_truth_rule: expectString(
      section.source_truth_rule,
      'assembly_contract.source_truth_rule',
      filePath,
    ),
  };
}

function validateManifestContract(section: Record<string, unknown>, filePath: string) {
  return {
    surface_kind: expectExactString(
      section.surface_kind,
      'opl_pack_bundle_manifest',
      'manifest_contract.surface_kind',
      filePath,
    ),
    records: exactStringArray(section.records, MANIFEST_RECORDS, 'manifest_contract.records', filePath),
    digest_algorithm: expectExactString(
      section.digest_algorithm,
      'sha256',
      'manifest_contract.digest_algorithm',
      filePath,
    ),
    compatibility_rule: expectString(
      section.compatibility_rule,
      'manifest_contract.compatibility_rule',
      filePath,
    ),
  };
}

function validateGeneratedMetadataContract(section: Record<string, unknown>, filePath: string) {
  return {
    surface_kind: expectExactString(
      section.surface_kind,
      'opl_pack_bundle_generated_metadata',
      'generated_metadata_contract.surface_kind',
      filePath,
    ),
    required_fields: exactStringArray(
      section.required_fields,
      GENERATED_METADATA_REQUIRED_FIELDS,
      'generated_metadata_contract.required_fields',
      filePath,
    ),
    do_not_edit: expectExactBoolean(
      section.do_not_edit,
      true,
      'generated_metadata_contract.do_not_edit',
      filePath,
    ),
  };
}

function validateAuthorityBoundary(section: Record<string, unknown>, filePath: string) {
  return {
    opl_can_write_generated_aggregate: expectExactBoolean(
      section.opl_can_write_generated_aggregate,
      true,
      'authority_boundary.opl_can_write_generated_aggregate',
      filePath,
    ),
    opl_can_write_bundle_manifest: expectExactBoolean(
      section.opl_can_write_bundle_manifest,
      true,
      'authority_boundary.opl_can_write_bundle_manifest',
      filePath,
    ),
    opl_can_validate_source_to_aggregate_drift: expectExactBoolean(
      section.opl_can_validate_source_to_aggregate_drift,
      true,
      'authority_boundary.opl_can_validate_source_to_aggregate_drift',
      filePath,
    ),
    opl_can_write_domain_truth: expectExactBoolean(
      section.opl_can_write_domain_truth,
      false,
      'authority_boundary.opl_can_write_domain_truth',
      filePath,
    ),
    opl_can_sign_owner_receipt: expectExactBoolean(
      section.opl_can_sign_owner_receipt,
      false,
      'authority_boundary.opl_can_sign_owner_receipt',
      filePath,
    ),
    opl_can_create_typed_blocker: expectExactBoolean(
      section.opl_can_create_typed_blocker,
      false,
      'authority_boundary.opl_can_create_typed_blocker',
      filePath,
    ),
    opl_can_authorize_quality_verdict: expectExactBoolean(
      section.opl_can_authorize_quality_verdict,
      false,
      'authority_boundary.opl_can_authorize_quality_verdict',
      filePath,
    ),
    opl_can_claim_domain_ready: expectExactBoolean(
      section.opl_can_claim_domain_ready,
      false,
      'authority_boundary.opl_can_claim_domain_ready',
      filePath,
    ),
    opl_can_claim_production_ready: expectExactBoolean(
      section.opl_can_claim_production_ready,
      false,
      'authority_boundary.opl_can_claim_production_ready',
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

export function validatePackBundleContract(filePath: string, value: unknown): PackBundleContract {
  const root = requireRecord(value, 'pack-bundle-contract.json', filePath);
  return {
    schema_version: expectSchemaVersion(root.schema_version, filePath),
    contract_id: expectExactString(root.contract_id, 'opl-pack-bundle-contract.v1', 'contract_id', filePath),
    owner: expectString(root.owner, 'owner', filePath),
    purpose: expectString(root.purpose, 'purpose', filePath),
    state: expectString(root.state, 'state', filePath),
    machine_boundary: expectString(root.machine_boundary, 'machine_boundary', filePath),
    source_module: expectExactString(root.source_module, 'src/pack-bundle.ts', 'source_module', filePath),
    cli_surfaces: validateCliSurfaces(requireSection(root, 'cli_surfaces', filePath), filePath),
    assembly_contract: validateAssemblyContract(requireSection(root, 'assembly_contract', filePath), filePath),
    manifest_contract: validateManifestContract(requireSection(root, 'manifest_contract', filePath), filePath),
    generated_metadata_contract: validateGeneratedMetadataContract(
      requireSection(root, 'generated_metadata_contract', filePath),
      filePath,
    ),
    authority_boundary: validateAuthorityBoundary(requireSection(root, 'authority_boundary', filePath), filePath),
    not_claims: exactStringArray(root.not_claims, NOT_CLAIMS, 'not_claims', filePath),
    verification: validateVerification(requireSection(root, 'verification', filePath), filePath),
  };
}

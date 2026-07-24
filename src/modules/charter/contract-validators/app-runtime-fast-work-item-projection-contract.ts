import {
  FrameworkContractError,
  expectBoolean,
  expectString,
  expectStringArray,
  isRecord,
} from '../../../kernel/contract-validation.ts';

export const APP_TYPED_DOMAIN_VIEWS_V3_CAPABILITY_ID = 'opl_app.typed_domain_views.v3';

function fail(filePath: string, field: string, message: string): never {
  throw new FrameworkContractError('contract_shape_invalid', message, { file: filePath, field });
}

function record(value: unknown, field: string, filePath: string) {
  if (!isRecord(value)) fail(filePath, field, `${field} must be an object.`);
  return value;
}

function records(value: unknown, field: string, filePath: string) {
  if (!Array.isArray(value) || !value.every(isRecord)) {
    fail(filePath, field, `${field} must be an array of objects.`);
  }
  return value;
}

function exactString(value: unknown, expected: string, field: string, filePath: string) {
  const actual = expectString(value, field, filePath);
  if (actual !== expected) fail(filePath, field, `${field} must remain ${expected}.`);
  return actual;
}

function exactStringList(value: unknown, expected: readonly string[], field: string, filePath: string) {
  const actual = expectStringArray(value, field, filePath);
  if (actual.length !== expected.length || actual.some((entry, index) => entry !== expected[index])) {
    fail(filePath, field, `${field} must remain ${expected.join(', ')}.`);
  }
  return actual;
}

function typedViewSchema(
  schema: unknown,
  path: readonly string[],
  filePath: string,
) {
  let current = record(schema, 'schema', filePath);
  for (const segment of path) current = record(current[segment], segment, filePath);
  const properties = record(current.properties, `${path.join('.')}.properties`, filePath);
  const viewKind = record(properties.view_kind, `${path.join('.')}.properties.view_kind`, filePath);
  exactString(viewKind.type, 'string', `${path.join('.')}.properties.view_kind.type`, filePath);
  const schemaRef = record(properties.schema_ref, `${path.join('.')}.properties.schema_ref`, filePath);
  const schemaVersion = record(properties.schema_version, `${path.join('.')}.properties.schema_version`, filePath);
  exactString(schemaRef.type, 'string', `${path.join('.')}.properties.schema_ref.type`, filePath);
  exactString(schemaVersion.type, 'string', `${path.join('.')}.properties.schema_version.type`, filePath);
}

export function validateAppRuntimeFastWorkItemProjectionContract(input: {
  filePath: string;
  value: unknown;
  standardAgentInterfaceSchema: unknown;
  workItemProjectionSchema: unknown;
  publicAppCommandIds: readonly string[];
}) {
  const root = record(input.value, 'root', input.filePath);
  exactString(
    root.contract_kind,
    'opl_app_runtime_fast_work_item_projection_producer.v1',
    'contract_kind',
    input.filePath,
  );
  exactString(root.owner, 'one-person-lab', 'owner', input.filePath);

  const capabilities = record(
    root.compatibility_capabilities,
    'compatibility_capabilities',
    input.filePath,
  );
  const ids = exactStringList(
    capabilities.ids,
    [APP_TYPED_DOMAIN_VIEWS_V3_CAPABILITY_ID],
    'compatibility_capabilities.ids',
    input.filePath,
  );
  const definitions = records(
    capabilities.definitions,
    'compatibility_capabilities.definitions',
    input.filePath,
  );
  if (definitions.length !== ids.length) {
    fail(
      input.filePath,
      'compatibility_capabilities.definitions',
      'Every compatibility capability id must have exactly one definition.',
    );
  }

  const definition = definitions[0]!;
  exactString(
    definition.capability_id,
    APP_TYPED_DOMAIN_VIEWS_V3_CAPABILITY_ID,
    'compatibility_capabilities.definitions[0].capability_id',
    input.filePath,
  );
  exactString(definition.producer_owner, 'one-person-lab', 'producer_owner', input.filePath);
  exactString(definition.state_surface, expectString(root.producer_surface, 'producer_surface', input.filePath), 'state_surface', input.filePath);
  exactString(definition.state_field, 'items[].domain_detail_views', 'state_field', input.filePath);
  exactString(
    definition.descriptor_contract_ref,
    'contracts/opl-framework/standard-agent-interface.schema.json#/properties/domain_detail_views',
    'descriptor_contract_ref',
    input.filePath,
  );
  exactString(
    definition.projection_contract_ref,
    'contracts/opl-framework/work-item-projection-v2.schema.json#/$defs/domainDetailView',
    'projection_contract_ref',
    input.filePath,
  );
  exactString(
    definition.descriptor_membership_source,
    'installed_present_kind_agent_descriptor',
    'descriptor_membership_source',
    input.filePath,
  );
  exactString(
    definition.accepted_view_contract,
    'generic_view_kind_plus_schema_ref_or_legacy_schema_version',
    'accepted_view_contract',
    input.filePath,
  );
  exactString(
    definition.payload_validation_boundary,
    'bounded_json_revision_and_owner_task_binding_only',
    'payload_validation_boundary',
    input.filePath,
  );
  if (!Array.isArray(definition.missing_descriptor_projection)
    || definition.missing_descriptor_projection.length !== 0) {
    fail(input.filePath, 'missing_descriptor_projection', 'Missing detail view declarations must project [].');
  }
  exactString(
    definition.lazy_read_command,
    'opl app view read --item-id <canonical-item-id> --view-id <view-id> [--if-revision <n>] --json',
    'lazy_read_command',
    input.filePath,
  );
  exactString(definition.lazy_read_surface_kind, 'opl_domain_detail_view', 'lazy_read_surface_kind', input.filePath);
  exactString(definition.lazy_read_schema_version, 'opl_domain_detail_view.v1', 'lazy_read_schema_version', input.filePath);

  const legacy = record(definition.legacy_consumer_policy, 'legacy_consumer_policy', input.filePath);
  for (const field of [
    'capability_discovery_additive',
    'domain_detail_views_optional_in_agent_descriptor',
    'missing_domain_detail_views_projects_empty_array',
    'consumer_may_ignore_capability',
  ]) {
    if (!expectBoolean(legacy[field], field, input.filePath)) {
      fail(input.filePath, field, `${field} must remain true.`);
    }
  }

  typedViewSchema(
    input.standardAgentInterfaceSchema,
    ['properties', 'domain_detail_views', 'items'],
    input.filePath,
  );
  typedViewSchema(
    input.workItemProjectionSchema,
    ['$defs', 'domainDetailView'],
    input.filePath,
  );
  if (!input.publicAppCommandIds.includes('app view read')) {
    fail(input.filePath, 'lazy_read_command', 'The declared lazy read command must exist in the public App command surface.');
  }

  return root;
}

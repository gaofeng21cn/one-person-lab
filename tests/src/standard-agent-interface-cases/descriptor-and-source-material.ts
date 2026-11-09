import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { readAgentPackageReadinessPort, registerAgentPackageReadinessPort } from '../../../src/kernel/agent-package-readiness-port.ts';
import { preflightDomainDispatchEvidencePayload } from '../../../src/authority/evidence/domain-dispatch-evidence-payload-preflight.ts';
import {
  buildSharedResources,
  profileFromTopologyContract,
} from '../../../src/authority/workspace/workspace-topology.ts';
import { parseJsonText } from '../../../src/kernel/json-file.ts';
import { validateJsonSchemaPayload } from '../../../src/kernel/schema-registry.ts';
import {
  parseStandardAgentInterface,
  readStandardAgentDescriptorInterface,
  readStandardAgentInterface,
  resolveStandardAgentSourceMaterialConsumerRoute,
  STANDARD_AGENT_INTERFACE_VERSION,
} from '../../../src/kernel/standard-agent-interface.ts';

export function fixture() {
  return {
    version: STANDARD_AGENT_INTERFACE_VERSION,
    workspace_binding: {
      locator_surface_kind: 'fixture_workspace_locator',
      default_profile_id: 'one_off',
      workspace_kind: 'fixture_workspace',
      project_kind: 'fixture_project',
      project_collection_label: 'projects',
      project_collection_path: 'projects',
      default_workspace_id: 'fixture-workspace',
      default_project_id: 'fixture-001',
      required_locator_fields: ['profile_ref'],
      optional_locator_fields: ['workspace_root'],
    },
    runtime: {
      runtime_domain_id: 'fixture',
      registration_ref: 'contracts/domain_descriptor.json#/runtime',
    },
    progress: {
      deliverable_delta_aliases: ['fixture_deliverable_delta'],
      platform_delta_aliases: ['fixture_platform_delta'],
    },
    routing: {
      explicit_aliases: ['fixture'],
      workstream_ids: ['fixture_ops'],
      intent_signals: ['fixture_delivery'],
      ambiguity_policy: 'require_explicit_workstream',
    },
  };
}

test('domain-owned workspace resources override the framework profile without changing its mode', () => {
  const resources = [
    { path: 'shared/sources', role: 'source_intake' },
    { path: 'shared/grant_memory', role: 'grant_strategy_memory' },
  ];
  const declared = parseStandardAgentInterface({
    ...fixture(),
    workspace_binding: { ...fixture().workspace_binding, shared_resources: resources },
  }, 'fixture');
  const profile = profileFromTopologyContract('one_off', 'projects', declared.workspace_binding.shared_resources);
  assert.equal(profile.workspace_mode, 'one_off');
  assert.deepEqual(profile.shared_resource_roots, resources.map((entry) => entry.path));
  assert.deepEqual(buildSharedResources(profile).map(({ path, role }) => ({ path, role })), resources);
  assert.throws(() => parseStandardAgentInterface({
    ...fixture(),
    workspace_binding: {
      ...fixture().workspace_binding,
      shared_resources: [{ path: '../outside', role: 'source_intake' }],
    },
  }, 'fixture'), /canonical workspace-relative path/);
});

export function standardAgentDescriptor(domainId: string, interfaceValue = fixture()) {
  return {
    domain_id: domainId,
    standard_agent_interface: {
      ...interfaceValue,
      runtime: {
        ...interfaceValue.runtime,
        runtime_domain_id: domainId,
      },
    },
  };
}

export function writeStandardAgentDescriptor(repoDir: string, descriptor: object) {
  fs.mkdirSync(path.join(repoDir, 'contracts'), { recursive: true });
  fs.writeFileSync(
    path.join(repoDir, 'contracts', 'domain_descriptor.json'),
    `${JSON.stringify(descriptor, null, 2)}\n`,
  );
}

test('domain-owned evidence projection binds custom work-item fields and result refs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-evidence-'));
  const previousPort = readAgentPackageReadinessPort();
  try {
    const input = {
      ...standardAgentDescriptor('fixture'),
      dispatch_evidence_projection: {
        work_item_id_field: 'case_key',
        result_collections: [{
          field: 'case_outcomes',
          ref_fields: { domain_receipt_refs: ['accepted_refs'] },
        }],
      },
    };
    writeStandardAgentDescriptor(root, input);
    const descriptor = readStandardAgentDescriptorInterface(root);
    assert.ok(descriptor);
    registerAgentPackageReadinessPort({
      readStatus: () => ({}),
      readStandardAgentDescriptorForDomain: (id) => id === 'fixture' ? descriptor : null,
    });
    const route = { domain_id: 'fixture', target_identity: { work_item_id: 'case-1' } };
    const payload = {
      case_key: 'case-1', case_outcomes: [{ accepted_refs: ['fixture://owner/current'] }],
    };
    assert.equal(preflightDomainDispatchEvidencePayload(payload, route).status, 'ready_to_record');
    const wrong = preflightDomainDispatchEvidencePayload({ ...payload, case_key: 'case-2' }, route);
    assert.equal(wrong.status, 'blocked');
    assert.deepEqual(wrong.identity_binding.conflict_fields, ['work_item_id', 'case_key']);
    const concealedAlias = preflightDomainDispatchEvidencePayload({
      ...payload, work_item_id: 'case-1', case_key: 'case-2',
    }, route);
    assert.equal(concealedAlias.status, 'blocked');
    assert.ok(concealedAlias.identity_binding.conflict_fields.includes('case_key'));
    fs.writeFileSync(path.join(root, 'conflicting.json'), JSON.stringify({ work_item_id: 'case-1', case_key: 'case-2' }));
    const concealedRefAlias = preflightDomainDispatchEvidencePayload({
      ...payload, domain_receipt_refs: ['conflicting.json'],
    }, { ...route, workspace_root: root });
    assert.equal(concealedRefAlias.status, 'blocked');
    const foreignRoute = { domain_id: 'another-owner', target_identity: { work_item_id: 'case-1' } };
    assert.equal(preflightDomainDispatchEvidencePayload(payload, foreignRoute).status, 'blocked');
    input.dispatch_evidence_projection.result_collections[0].field = '../outside';
    writeStandardAgentDescriptor(root, input);
    assert.throws(() => readStandardAgentDescriptorInterface(root), /plain JSON field names/);
  } finally {
    registerAgentPackageReadinessPort(previousPort ?? { readStatus: () => ({}) });
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function writeJson(repoDir: string, relativePath: string, payload: object) {
  const filePath = path.join(repoDir, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function sourceMaterialConsumerDescriptor() {
  return {
    ...standardAgentDescriptor('agent_engineering'),
    kind: 'agent',
    agent_id: 'oma',
    package_id: 'oma',
    public_action_ids: ['engineer-agent'],
    action_catalog_ref: 'contracts/action_catalog.json',
    source_material_consumer: {
      version: 'opl_source_material_consumer_projection.v1',
      role_bindings: {
        reference_design: {
          applicability: 'required',
          public_action_id: 'engineer-agent',
          request_ref_field: 'source_refs',
        },
      },
      provider_execution_at_ingest: 'not_applicable',
    },
    standard_contract_refs: {
      action_catalog: 'contracts/action_catalog.json',
      foundry_provider: 'contracts/foundry_provider.json',
    },
  };
}

function sourceMaterialActionCatalog(requiredFields = ['source_refs']) {
  return {
    surface_kind: 'family_action_catalog',
    version: 'family-action-catalog.v2',
    catalog_id: 'oma_action_catalog',
    target_domain_id: 'agent_engineering',
    owner: 'oma',
    authority_boundary: {
      domain_truth_owner: 'oma',
      opl_role: 'foundry_runtime_owner',
      write_policy: 'no_domain_truth_writes',
      opl_can_write_domain_truth: false,
    },
    actions: [{
      action_id: 'engineer-agent',
      title: 'Engineer Agent',
      summary: 'Consume source refs through the declared public action.',
      owner: 'oma',
      effect: 'mutating',
      execution_binding: {
        kind: 'foundry_binding',
        provider_manifest_ref: 'contracts/foundry_provider.json',
      },
      input_schema_ref: 'opl://foundry-protocol/DesignRequest',
      output_schema_ref: 'opl://foundry-control/FoundryRun',
      required_fields: requiredFields,
      optional_fields: [],
      workspace_locator_fields: [],
      human_gate_ids: [],
      supported_surfaces: {
        cli: {},
        mcp: { tool_name: 'oma_engineer_agent' },
        skill: { command_contract_id: 'oma.engineer-agent' },
        product_entry: { action_key: 'engineer-agent' },
        openai: { tool_name: 'oma_engineer_agent' },
        ai_sdk: { tool_name: 'oma_engineer_agent' },
      },
      authority_boundary: {
        oma_can_write_target_domain_truth: false,
        opl_can_write_target_domain_truth: false,
      },
    }],
    notes: [],
  };
}

function sourceMaterialProvider() {
  return {
    surface_kind: 'opl_foundry_provider',
    version: 'opl-foundry-provider.v1',
    provider_id: 'oma',
    agent_id: 'oma',
    package_id: 'oma',
    domain_id: 'agent_engineering',
  };
}

test('standard Agent interface parses a domain-owned descriptor without domain branching', () => {
  const descriptor = parseStandardAgentInterface(fixture(), 'fixture.json#/standard_agent_interface');
  assert.equal(descriptor.workspace_binding.locator_surface_kind, 'fixture_workspace_locator');
  assert.equal(descriptor.workspace_binding.project_collection_path, 'projects');
  assert.equal(descriptor.inventory_projection, null);
  assert.equal(descriptor.stage_catalog, null);
  assert.deepEqual(descriptor.domain_detail_views, []);
  assert.equal(descriptor.runtime.registration_ref, 'contracts/domain_descriptor.json#/runtime');
});

test('standard Agent interface parses command-free descriptors with nullable registration', () => {
  const value = {
    ...fixture(),
    runtime: {
      ...fixture().runtime,
      registration_ref: null,
    },
  };

  const parsed = parseStandardAgentInterface(value, 'fixture.json#/standard_agent_interface');

  assert.equal('entry_command_template' in parsed.workspace_binding, false);
  assert.equal('manifest_command_template' in parsed.workspace_binding, false);
  assert.equal('dispatch_command' in parsed.runtime, false);
  assert.equal(parsed.runtime.registration_ref, null);
});

test('standard Agent interface rejects unsafe project collection paths', () => {
  const schemaRef = 'contracts/opl-framework/standard-agent-interface.schema.json';
  const schema = parseJsonText(fs.readFileSync(path.join(process.cwd(), schemaRef), 'utf8')) as Record<string, unknown>;

  for (const projectCollectionPath of ['../studies', '.']) {
    const value = fixture();
    value.workspace_binding.project_collection_path = projectCollectionPath;

    assert.throws(
      () => parseStandardAgentInterface(value, 'fixture.json#/standard_agent_interface'),
      /canonical workspace-relative path/,
    );
    const validation = validateJsonSchemaPayload({
      schemaId: 'opl.standard_agent_interface.v1',
      schema,
      sourceRef: schemaRef,
    }, value);
    assert.equal(validation.ok, false, projectCollectionPath);
  }
});

test('standard Agent interface accepts optional inventory presentation fields', () => {
  const value = {
    ...fixture(),
    inventory_projection: {
      source_kind: 'workspace_relative_json',
      relative_path: 'workspace_index.json',
      items_pointer: '/studies',
      field_map: {
        display_name: 'display_name',
        next_action: 'next_action',
        stage_index_ref: 'stage_index_ref',
        work_item_id: 'study_id',
        work_item_root: 'canonical_study_root',
        business_status: 'status',
        current_stage_id: 'current_stage_id',
        current_stage_status: 'current_stage_status',
        package_status: 'package_status',
        lifecycle_ref: 'study_status_ref',
      },
    },
  };
  const descriptor = parseStandardAgentInterface(value, 'fixture.json#/standard_agent_interface');
  assert.equal(descriptor.inventory_projection?.relative_path, 'workspace_index.json');
  assert.equal(descriptor.inventory_projection?.field_map.display_name, 'display_name');
  assert.equal(descriptor.inventory_projection?.field_map.next_action, 'next_action');
  assert.equal(descriptor.inventory_projection?.field_map.stage_index_ref, 'stage_index_ref');

  const invalid = structuredClone(value);
  invalid.inventory_projection.relative_path = '../workspace_index.json';
  assert.throws(
    () => parseStandardAgentInterface(invalid, 'fixture.json#/standard_agent_interface'),
    /must stay inside the workspace/,
  );
});

test('standard Agent interface accepts a repo-relative Stage Catalog declaration', () => {
  const value = {
    ...fixture(),
    stage_catalog: {
      source_kind: 'agent_repo_relative_json',
      relative_path: 'contracts/stage_catalog.json',
      items_pointer: '/catalog/stages',
      field_map: {
        stage_id: 'id',
        display_name: 'name',
        display_names: 'localized_names',
      },
    },
  };

  const parsed = parseStandardAgentInterface(value, 'fixture.json#/standard_agent_interface');

  assert.deepEqual(parsed.stage_catalog, value.stage_catalog);
  const schemaRef = 'contracts/opl-framework/standard-agent-interface.schema.json';
  const schema = parseJsonText(fs.readFileSync(path.join(process.cwd(), schemaRef), 'utf8')) as Record<string, unknown>;
  const validation = validateJsonSchemaPayload({
    schemaId: 'opl.standard_agent_interface.v1',
    schema,
    sourceRef: schemaRef,
  }, value);
  assert.equal(validation.ok, true, validation.ok ? '' : JSON.stringify(validation.errors, null, 2));

  const escaped = structuredClone(value);
  escaped.stage_catalog.relative_path = '../stage_catalog.json';
  assert.throws(
    () => parseStandardAgentInterface(escaped, 'fixture.json#/standard_agent_interface'),
    /must stay inside the Agent repo/,
  );
  const relativePointer = structuredClone(value);
  relativePointer.stage_catalog.items_pointer = 'catalog/stages';
  assert.throws(
    () => parseStandardAgentInterface(relativePointer, 'fixture.json#/standard_agent_interface'),
    /must be an absolute JSON Pointer/,
  );
  const unsupportedSource = structuredClone(value);
  unsupportedSource.stage_catalog.source_kind = 'workspace_relative_json';
  assert.throws(
    () => parseStandardAgentInterface(unsupportedSource, 'fixture.json#/standard_agent_interface'),
    /stage_catalog source_kind is unsupported/,
  );
  const incomplete = structuredClone(value) as any;
  delete incomplete.stage_catalog.field_map.display_names;
  assert.throws(
    () => parseStandardAgentInterface(incomplete, 'fixture.json#/standard_agent_interface'),
    /field_map is incomplete/,
  );
});

test('standard Agent interface accepts generic typed work-item view declarations', () => {
  const value = {
    ...fixture(),
    domain_detail_views: [
      {
        view_id: 'research-roadmap',
        view_kind: 'research_roadmap',
        title: 'Research roadmap',
        schema_ref: 'contracts/schemas/research-roadmap.schema.json',
        source_kind: 'work_item_relative_json',
        relative_path: 'artifacts/research_trajectory/snapshot.json',
        revision_pointer: '/metadata/revision',
        owner_task_binding: {
          task_id_pointer: '/task/id',
          task_ref_pointer: '/task/ref',
          task_ref_template: 'task:{task_id}',
        },
      },
    ],
  };

  const schemaRef = 'contracts/opl-framework/standard-agent-interface.schema.json';
  const schema = parseJsonText(fs.readFileSync(path.join(process.cwd(), schemaRef), 'utf8')) as Record<string, unknown>;
  const parsed = parseStandardAgentInterface(value, 'fixture.json#/standard_agent_interface');
  assert.deepEqual(parsed.domain_detail_views, [{
    ...value.domain_detail_views[0],
    schema_version: null,
  }]);
  const validation = validateJsonSchemaPayload({
    schemaId: 'opl.standard_agent_interface.v1',
    schema,
    sourceRef: schemaRef,
  }, value);
  assert.equal(validation.ok, true, validation.ok ? '' : JSON.stringify(validation.errors, null, 2));

  const missingSchema = structuredClone(value) as any;
  delete missingSchema.domain_detail_views[0]!.schema_ref;
  assert.throws(
    () => parseStandardAgentInterface(missingSchema, 'fixture.json#/standard_agent_interface'),
    /must declare schema_ref or schema_version/,
  );

  const invalidPointer = structuredClone(value);
  invalidPointer.domain_detail_views[0]!.revision_pointer = 'metadata/revision';
  assert.throws(
    () => parseStandardAgentInterface(invalidPointer, 'fixture.json#/standard_agent_interface'),
    /JSON pointer must be absolute/,
  );

  const escaped = structuredClone(value);
  escaped.domain_detail_views[0]!.relative_path = '../snapshot.json';
  assert.throws(
    () => parseStandardAgentInterface(escaped, 'fixture.json#/standard_agent_interface'),
    /must stay inside the work item/,
  );

  const duplicateId = structuredClone(value);
  duplicateId.domain_detail_views.push({
    ...duplicateId.domain_detail_views[0]!,
    relative_path: 'artifacts/research_trajectory/other.json',
  });
  assert.throws(
    () => parseStandardAgentInterface(duplicateId, 'fixture.json#/standard_agent_interface'),
    /view ids must be unique/,
  );
});

test('standard Agent interface rejects retired private command templates', () => {
  const workspaceCommand = fixture() as ReturnType<typeof fixture> & {
    workspace_binding: ReturnType<typeof fixture>['workspace_binding'] & {
      entry_command_template: string[];
    };
  };
  workspaceCommand.workspace_binding.entry_command_template = ['fixture', 'status'];
  assert.throws(
    () => parseStandardAgentInterface(workspaceCommand, 'fixture.json#/standard_agent_interface'),
    /unknown properties/,
  );
  const runtimeCommand = fixture() as ReturnType<typeof fixture> & {
    runtime: ReturnType<typeof fixture>['runtime'] & { dispatch_command: string[] };
  };
  runtimeCommand.runtime.dispatch_command = ['fixture', 'dispatch'];
  assert.throws(
    () => parseStandardAgentInterface(runtimeCommand, 'fixture.json#/standard_agent_interface'),
    /unknown properties/,
  );
});

test('standard Agent interface rejects overlapping locator ownership', () => {
  const value = fixture();
  value.workspace_binding.optional_locator_fields = ['profile_ref'];
  assert.throws(
    () => parseStandardAgentInterface(value, 'fixture.json#/standard_agent_interface'),
    /cannot be both required and optional/,
  );
});

test('standard Agent interface follows a repo-local canonical JSON pointer', () => {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-standard-interface-'));
  try {
    fs.mkdirSync(path.join(repoDir, 'contracts'), { recursive: true });
    fs.writeFileSync(path.join(repoDir, 'contracts', 'domain_descriptor.json'), `${JSON.stringify({
      domain_id: 'fixture',
      standard_agent_interface: {
        ref_kind: 'repo_json_pointer',
        ref: 'contracts/standard_agent_interface.json#/standard_agent_interface',
      },
    })}\n`);
    fs.writeFileSync(path.join(repoDir, 'contracts', 'standard_agent_interface.json'), `${JSON.stringify({
      standard_agent_interface: fixture(),
    })}\n`);
    assert.equal(readStandardAgentInterface(repoDir)?.runtime.runtime_domain_id, 'fixture');
  } finally {
    fs.rmSync(repoDir, { recursive: true, force: true });
  }
});

test('source material consumer route derives only descriptor, action catalog, and provider refs', () => {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-source-consumer-route-'));
  try {
    writeStandardAgentDescriptor(repoDir, sourceMaterialConsumerDescriptor());
    writeJson(repoDir, 'contracts/action_catalog.json', sourceMaterialActionCatalog());
    writeJson(repoDir, 'contracts/foundry_provider.json', sourceMaterialProvider());

    assert.deepEqual(
      resolveStandardAgentSourceMaterialConsumerRoute(repoDir, 'reference_design'),
      {
        applicability: 'required',
        consumer_projection_ref:
          'contracts/domain_descriptor.json#/source_material_consumer/role_bindings/reference_design',
        consumer_route: {
          consumer_agent_id: 'oma',
          public_action_id: 'engineer-agent',
          action_catalog_ref: 'contracts/action_catalog.json',
          input_schema_ref: 'opl://foundry-protocol/DesignRequest',
          request_ref_field: 'source_refs',
          provider_manifest_ref: 'contracts/foundry_provider.json',
          provider_id: 'oma',
        },
        reason: null,
      },
    );
    assert.deepEqual(
      resolveStandardAgentSourceMaterialConsumerRoute(repoDir, 'dataset'),
      {
        applicability: 'not_applicable',
        consumer_projection_ref: 'contracts/domain_descriptor.json#/source_material_consumer',
        consumer_route: null,
        reason: 'source_material_role_not_declared',
      },
    );
  } finally {
    fs.rmSync(repoDir, { recursive: true, force: true });
  }
});

test('source material consumer route distinguishes unavailable descriptors from inconsistent linkage', () => {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-source-consumer-invalid-'));
  try {
    assert.deepEqual(
      resolveStandardAgentSourceMaterialConsumerRoute(repoDir, 'reference_design'),
      {
        applicability: 'not_applicable',
        consumer_projection_ref: null,
        consumer_route: null,
        reason: 'consumer_descriptor_unavailable',
      },
    );

    const malformedDescriptor = sourceMaterialConsumerDescriptor();
    malformedDescriptor.source_material_consumer.role_bindings.reference_design = null as never;
    writeStandardAgentDescriptor(repoDir, malformedDescriptor);
    assert.throws(
      () => resolveStandardAgentSourceMaterialConsumerRoute(repoDir, 'reference_design'),
      /role binding is invalid/,
    );

    writeStandardAgentDescriptor(repoDir, sourceMaterialConsumerDescriptor());
    writeJson(repoDir, 'contracts/action_catalog.json', sourceMaterialActionCatalog(['objective']));
    writeJson(repoDir, 'contracts/foundry_provider.json', sourceMaterialProvider());
    assert.throws(
      () => resolveStandardAgentSourceMaterialConsumerRoute(repoDir, 'reference_design'),
      (error: unknown) => {
        assert.equal(error instanceof Error, true);
        assert.match((error as Error).message, /request ref field is not declared/);
        return true;
      },
    );
  } finally {
    fs.rmSync(repoDir, { recursive: true, force: true });
  }
});

test('source material consumer route rejects repo linkage through an escaping symlink', () => {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-source-consumer-symlink-'));
  const externalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-source-consumer-external-'));
  try {
    writeStandardAgentDescriptor(repoDir, sourceMaterialConsumerDescriptor());
    writeJson(externalDir, 'action_catalog.json', sourceMaterialActionCatalog());
    fs.mkdirSync(path.join(repoDir, 'contracts'), { recursive: true });
    fs.symlinkSync(
      path.join(externalDir, 'action_catalog.json'),
      path.join(repoDir, 'contracts/action_catalog.json'),
    );
    writeJson(repoDir, 'contracts/foundry_provider.json', sourceMaterialProvider());
    assert.throws(
      () => resolveStandardAgentSourceMaterialConsumerRoute(repoDir, 'reference_design'),
      /does not resolve to a repository JSON file/,
    );
  } finally {
    fs.rmSync(repoDir, { recursive: true, force: true });
    fs.rmSync(externalDir, { recursive: true, force: true });
  }
});

test('standard Agent interface parser enforces closed objects', () => {
  const unknown = fixture() as ReturnType<typeof fixture> & { private_runtime: boolean };
  unknown.private_runtime = true;
  assert.throws(
    () => parseStandardAgentInterface(unknown, 'fixture.json#/standard_agent_interface'),
    /unknown properties/,
  );
  const multipleWorkstreams = fixture();
  multipleWorkstreams.routing.workstream_ids = ['fixture_ops', 'other_ops'];
  assert.throws(
    () => parseStandardAgentInterface(multipleWorkstreams, 'fixture.json#/standard_agent_interface'),
    /at most one admitted workstream/,
  );
});

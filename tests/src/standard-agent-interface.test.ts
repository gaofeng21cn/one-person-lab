import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { parseJsonText } from '../../src/kernel/json-file.ts';
import { validateJsonSchemaPayload } from '../../src/kernel/schema-registry.ts';
import {
  assertStandardAgentDescriptorIdentity,
  parseStandardAgentInterface,
  readStandardAgentDescriptorInterface,
  readStandardAgentInterface,
  resolveStandardAgentSourceMaterialConsumerRoute,
  STANDARD_AGENT_INTERFACE_VERSION,
} from '../../src/kernel/standard-agent-interface.ts';
import {
  readInstalledStandardAgentDescriptorForDomain,
  readInstalledStandardAgentDescriptorForPackage,
  readPackageManagedStandardAgentDescriptor,
  readStandardAgentDescriptorForDomain,
  resolveStandardAgentContractCheckout,
  standardAgentProgressDeltaKeySet,
  standardAgentProgressDeltaKeys,
} from '../../src/modules/connect/standard-agent-interface-discovery.ts';

function fixture() {
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

function standardAgentDescriptor(domainId: string, interfaceValue = fixture()) {
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

function writeStandardAgentDescriptor(repoDir: string, descriptor: object) {
  fs.mkdirSync(path.join(repoDir, 'contracts'), { recursive: true });
  fs.writeFileSync(
    path.join(repoDir, 'contracts', 'domain_descriptor.json'),
    `${JSON.stringify(descriptor, null, 2)}\n`,
  );
}

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

function initializeGitCheckout(repoDir: string) {
  execFileSync('git', ['init', '--quiet'], { cwd: repoDir });
  execFileSync('git', ['config', 'user.email', 'fixture@example.com'], { cwd: repoDir });
  execFileSync('git', ['config', 'user.name', 'Fixture'], { cwd: repoDir });
  execFileSync('git', ['add', '.'], { cwd: repoDir });
  execFileSync('git', ['commit', '--quiet', '-m', 'fixture'], { cwd: repoDir });
}

function withDeveloperBookForgeSources(
  run: (input: {
    siblingRepo: string;
    managedRepo: string;
    statusReader: PackageStatusReaderFixture;
    statusReads: string[];
  }) => void,
) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-standard-interface-source-'));
  const stateDir = path.join(fixtureRoot, 'state');
  const workspaceRoot = path.join(fixtureRoot, 'workspace');
  const siblingRepo = path.join(workspaceRoot, 'opl-bookforge');
  const managedRepo = path.join(stateDir, 'modules', 'opl-bookforge');
  const envKeys = [
    'OPL_STATE_DIR',
    'OPL_FAMILY_WORKSPACE_ROOT',
    'OPL_MODULES_ROOT',
    'OPL_MODULE_SOURCE_MODE',
    'OPL_MODULE_PATH_OPLBOOKFORGE',
    'OPL_MODULE_REPO_URL_OPLBOOKFORGE',
    'OPL_FULL_RUNTIME_HOME',
  ] as const;
  const previousEnv = new Map(envKeys.map((key) => [key, process.env[key]]));
  const statusReads: string[] = [];

  fs.mkdirSync(siblingRepo, { recursive: true });
  writeStandardAgentDescriptor(siblingRepo, standardAgentDescriptor('oplbookforge'));
  initializeGitCheckout(siblingRepo);
  writeStandardAgentDescriptor(managedRepo, standardAgentDescriptor('oplbookforge', {
    ...fixture(),
    workspace_binding: {
      ...fixture().workspace_binding,
      entry_command_template: ['stale', 'entry'],
    },
  } as ReturnType<typeof fixture>));
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, 'developer-supervisor.json'), `${JSON.stringify({
    version: 'g1',
    enabled: 'on',
    mode: 'developer_apply_safe',
    auto_enable_github_login: 'fixture',
    updated_at: '2026-07-14T00:00:00.000Z',
  }, null, 2)}\n`);

  const statusReader = ((input: { packageId?: string | null }) => {
    statusReads.push(input.packageId ?? '');
    return {
      opl_agent_package_status: {
        installed_package_count: 1,
        package_dependency_readiness: {
          status: 'current',
          operational_ready: true,
        },
        installed_carrier_readback: {
          lifecycle_authority: 'carrier_owned',
          source_ref: managedRepo,
        },
        installed_readiness: {
          installed: true,
          physical_status: 'available',
          callability: 'callable',
        },
        launch_allowed: true,
      },
    };
  }) as PackageStatusReaderFixture;

  try {
    process.env.OPL_STATE_DIR = stateDir;
    process.env.OPL_FAMILY_WORKSPACE_ROOT = workspaceRoot;
    for (const key of envKeys.slice(2)) delete process.env[key];
    run({ siblingRepo, managedRepo, statusReader, statusReads });
  } finally {
    for (const [key, value] of previousEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

type PackageStatusReaderFixture = Parameters<typeof readStandardAgentDescriptorForDomain>[1];

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
  const value = fixture();
  value.workspace_binding.project_collection_path = '../studies';

  assert.throws(
    () => parseStandardAgentInterface(value, 'fixture.json#/standard_agent_interface'),
    /canonical workspace-relative path/,
  );
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
  assert.equal(validation.ok, true, validation.ok ? undefined : JSON.stringify(validation.errors, null, 2));

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
  assert.equal(validation.ok, true, validation.ok ? undefined : JSON.stringify(validation.errors, null, 2));

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

test('package dependency and native carrier readiness gate descriptor discovery independently of workspace scope', () => {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-standard-interface-managed-'));
  try {
    fs.mkdirSync(path.join(repoDir, 'contracts'), { recursive: true });
    fs.writeFileSync(path.join(repoDir, 'contracts', 'domain_descriptor.json'), `${JSON.stringify({
      domain_id: 'fixture-agent',
      standard_agent_interface: fixture(),
    })}\n`);
    const statusReads: Array<{ packageId?: string | null }> = [];
    const statusReader = ((input: { packageId?: string | null }) => {
      statusReads.push(input);
      return {
      opl_agent_package_status: input.packageId === 'mas'
        ? {
            installed_package_count: 1,
            operational_ready: false,
            package_dependency_readiness: {
              status: 'current',
              operational_ready: true,
            },
            materialization_readiness: {
              status: 'scope_required',
            },
            installed_carrier_readback: {
              lifecycle_authority: 'carrier_owned',
              source_ref: repoDir,
            },
            installed_readiness: {
              installed: true,
              physical_status: 'available',
              callability: 'callable',
            },
            launch_allowed: true,
          }
        : {
            installed_package_count: 0,
            operational_ready: false,
            package_dependency_readiness: {
              status: 'missing',
              operational_ready: false,
            },
          },
      };
    }) as any;
    const descriptor = readPackageManagedStandardAgentDescriptor(['mas'], statusReader);
    assert.equal(fs.realpathSync.native(descriptor?.repo_dir ?? ''), fs.realpathSync.native(repoDir));
    assert.equal(descriptor?.interface.runtime.runtime_domain_id, 'fixture');
    assert.equal(Object.hasOwn(statusReads[0] ?? {}, 'recoverRuntimeSource'), false);
    assert.deepEqual(standardAgentProgressDeltaKeys('fixture-agent', 'deliverable', statusReader), [
      'deliverable_progress_delta',
      'fixture_deliverable_delta',
    ]);
    const statusReadCountBeforeKeySet = statusReads.length;
    assert.deepEqual(standardAgentProgressDeltaKeySet('fixture-agent', statusReader), {
      deliverable: ['deliverable_progress_delta', 'fixture_deliverable_delta'],
      platform: ['platform_repair_delta', 'fixture_platform_delta'],
    });
    assert.equal(statusReads.length, statusReadCountBeforeKeySet + 2);
    const observedDeveloperDriftReader = statusReader;
    assert.equal(
      fs.realpathSync.native(
        readPackageManagedStandardAgentDescriptor(['mas'], observedDeveloperDriftReader)?.repo_dir ?? '',
      ),
      fs.realpathSync.native(repoDir),
    );
    const observedDriftResolution = resolveStandardAgentContractCheckout(
      'mas',
      observedDeveloperDriftReader,
      () => null,
      { result: 'typed_resolution' },
    );
    assert.equal(observedDriftResolution.status, 'resolved');
    assert.equal(observedDriftResolution.launch_allowed, true);
    assert.equal(observedDriftResolution.reason, null);
    assert.equal(
      fs.realpathSync.native(observedDriftResolution.checkout?.checkout_path ?? ''),
      fs.realpathSync.native(repoDir),
    );
    const incompatibleSourceStatusReader = ((input: { packageId?: string | null }) => {
      const readback = statusReader(input);
      if (input.packageId === 'mas') {
        readback.opl_agent_package_status.launch_allowed = false;
        readback.opl_agent_package_status.launch_blocked_reason = 'installed_native_carrier_required';
        delete readback.opl_agent_package_status.installed_carrier_readback;
        delete readback.opl_agent_package_status.installed_readiness;
      }
      return readback;
    }) as any;
    assert.equal(readPackageManagedStandardAgentDescriptor(['mas'], incompatibleSourceStatusReader), null);
    const incompatibleResolution = resolveStandardAgentContractCheckout(
      'mas',
      incompatibleSourceStatusReader,
      () => null,
      { result: 'typed_resolution' },
    );
    assert.equal(incompatibleResolution.status, 'blocked');
    assert.equal(incompatibleResolution.launch_allowed, false);
    assert.equal(incompatibleResolution.reason, 'installed_native_carrier_required');
    const missingDependencyStatusReader = ((input: { packageId?: string | null }) => {
      const readback = statusReader(input);
      if (input.packageId === 'mas') {
        readback.opl_agent_package_status.package_dependency_readiness.operational_ready = false;
        readback.opl_agent_package_status.launch_allowed = false;
        readback.opl_agent_package_status.launch_blocked_reason = 'package_dependency_missing';
      }
      return readback;
    }) as any;
    assert.equal(readPackageManagedStandardAgentDescriptor(['mas'], missingDependencyStatusReader), null);
    assert.throws(
      () => assertStandardAgentDescriptorIdentity(descriptor!, {
        project: 'different-agent',
        domain_id: 'different',
      }),
      /identity does not match/,
    );
    assert.equal(assertStandardAgentDescriptorIdentity({
      ...descriptor!,
      domain_id: 'mas',
    }, {
      project: 'med-autoscience',
      domain_id: 'medautoscience',
    }).domain_id, 'mas');
    assert.equal(readStandardAgentDescriptorInterface(repoDir)?.domain_id, 'fixture-agent');
  } finally {
    fs.rmSync(repoDir, { recursive: true, force: true });
  }
});

test('known domain discovery probes only its matching managed package', () => {
  const statusReads: Array<string | null | undefined> = [];
  const statusReader = ((input: { packageId?: string | null }) => {
    statusReads.push(input.packageId);
    return {
      opl_agent_package_status: {
        operational_ready: false,
        runtime_source_readiness: {
          status: 'missing',
          operational_ready: false,
          checkout_path: null,
          expected_tree_sha256: null,
          actual_tree_sha256: null,
        },
      },
    };
  }) as any;

  readStandardAgentDescriptorForDomain('medautoscience', statusReader, () => null);

  assert.deepEqual(statusReads, ['mas']);
});

test('installed Agent discovery is presence-only while launch compatibility remains gated', () => {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-standard-interface-present-'));
  try {
    writeStandardAgentDescriptor(repoDir, {
      ...standardAgentDescriptor('fixture-agent'),
      kind: 'agent',
      agent_id: 'fixture-agent',
      package_id: 'fixture-agent',
    });
    const statusReader = (() => ({
      opl_agent_package_status: {
        installed_package_count: 1,
        package_dependency_readiness: {
          status: 'missing',
          operational_ready: false,
        },
        installed_carrier_readback: {
          lifecycle_authority: 'carrier_owned',
          source_ref: repoDir,
        },
        installed_readiness: {
          installed: true,
          physical_status: 'available',
          callability: 'callable',
        },
        launch_allowed: false,
        launch_blocked_reason: 'package_dependency_missing',
      },
    })) as PackageStatusReaderFixture;

    assert.equal(
      fs.realpathSync.native(
        readInstalledStandardAgentDescriptorForDomain('fixture-agent', statusReader, () => null)?.repo_dir ?? '',
      ),
      fs.realpathSync.native(repoDir),
    );
    assert.equal(readStandardAgentDescriptorForDomain('fixture-agent', statusReader, () => null), null);
  } finally {
    fs.rmSync(repoDir, { recursive: true, force: true });
  }
});

test('installed package descriptor discovery bypasses registry-selected module routing', () => {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-standard-interface-direct-package-'));
  const statusReads: string[] = [];
  try {
    writeStandardAgentDescriptor(repoDir, {
      ...standardAgentDescriptor('independent-agent'),
      kind: 'agent',
      agent_id: 'independent-agent',
      package_id: 'fixture-package',
    });
    const statusReader = ((input: { packageId?: string | null }) => {
      statusReads.push(input.packageId ?? '');
      return {
        opl_agent_package_status: {
          installed_package_count: 1,
          agent_id: 'independent-agent',
          installed_carrier_readback: {
            lifecycle_authority: 'carrier_owned',
            source_ref: repoDir,
          },
          installed_readiness: {
            installed: true,
            physical_status: 'available',
            callability: 'callable',
          },
          launch_allowed: true,
        },
      };
    }) as PackageStatusReaderFixture;

    const descriptor = readInstalledStandardAgentDescriptorForPackage('fixture-package', statusReader);

    assert.equal(descriptor?.package_id, 'fixture-package');
    assert.equal(descriptor?.agent_id, 'independent-agent');
    assert.equal(fs.realpathSync.native(descriptor?.repo_dir ?? ''), fs.realpathSync.native(repoDir));
    writeStandardAgentDescriptor(repoDir, {
      ...standardAgentDescriptor('other-agent'),
      kind: 'agent',
      agent_id: 'other-agent',
      package_id: 'other-agent',
    });
    assert.equal(readInstalledStandardAgentDescriptorForPackage('fixture-package', statusReader), null);
    writeStandardAgentDescriptor(repoDir, {
      ...standardAgentDescriptor('second-independent-agent'),
      kind: 'agent',
      agent_id: 'second-independent-agent',
      package_id: 'fixture-package',
    });
    assert.equal(
      readInstalledStandardAgentDescriptorForPackage('fixture-package', statusReader),
      null,
    );
    writeStandardAgentDescriptor(repoDir, {
      ...standardAgentDescriptor('independent-agent'),
      kind: 'workflow_profile',
      agent_id: 'independent-agent',
      package_id: 'fixture-package',
    });
    assert.throws(
      () => readInstalledStandardAgentDescriptorForPackage('fixture-package', statusReader),
      /descriptor kind must be agent/,
    );
    assert.deepEqual(statusReads, [
      'fixture-package',
      'fixture-package',
      'fixture-package',
      'fixture-package',
    ]);
  } finally {
    fs.rmSync(repoDir, { recursive: true, force: true });
  }
});

test('installed carrier source owns descriptor discovery without legacy runtime source readiness', () => {
  const carrierRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-standard-interface-carrier-'));
  const legacyRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-standard-interface-legacy-'));
  try {
    writeStandardAgentDescriptor(carrierRepo, {
      ...standardAgentDescriptor('future-agent'),
      kind: 'agent',
      agent_id: 'future-agent',
      package_id: 'future-package',
    });
    writeStandardAgentDescriptor(legacyRepo, {
      ...standardAgentDescriptor('legacy-agent'),
      kind: 'agent',
      agent_id: 'legacy-agent',
      package_id: 'future-package',
    });
    const carrierSource = { current: carrierRepo };
    const statusReader = (() => ({
      version: 'g2',
      opl_agent_package_status: {
        installed_package_count: 1,
        installed_carrier_readback: {
          kind: 'codex_plugin_manager',
          identity: 'future-package',
          source_ref: carrierSource.current,
          version: '1.0.0',
          enabled: true,
          lifecycle_authority: 'carrier_owned',
        },
        installed_readiness: {
          installed: true,
          physical_status: 'available',
          callability: 'callable',
        },
        launch_allowed: true,
      },
    })) as unknown as PackageStatusReaderFixture;

    const descriptor = readInstalledStandardAgentDescriptorForPackage('future-package', statusReader);
    assert.equal(descriptor?.agent_id, 'future-agent');
    assert.equal(fs.realpathSync.native(descriptor?.repo_dir ?? ''), fs.realpathSync.native(carrierRepo));

    carrierSource.current = path.join(carrierRepo, 'missing');
    assert.equal(readInstalledStandardAgentDescriptorForPackage('future-package', statusReader), null);

    const configuredStatus = { executorStatus: 'callable' };
    const configuredStatusReader = (() => ({
      version: 'g2',
      opl_agent_package_status: {
        installed_package_count: 1,
        configured_carrier: {
          status: 'installed',
          executor: { status: configuredStatus.executorStatus },
          plugin_source_path: carrierRepo,
        },
        installed_carrier_readback: null,
        installed_readiness: null,
        launch_allowed: true,
      },
    })) as unknown as PackageStatusReaderFixture;

    assert.equal(
      readInstalledStandardAgentDescriptorForPackage('future-package', configuredStatusReader)?.agent_id,
      'future-agent',
    );
    configuredStatus.executorStatus = 'attention_needed';
    assert.equal(
      readInstalledStandardAgentDescriptorForPackage('future-package', configuredStatusReader),
      null,
    );
  } finally {
    fs.rmSync(carrierRepo, { recursive: true, force: true });
    fs.rmSync(legacyRepo, { recursive: true, force: true });
  }
});

test('standard Agent contract checkout prefers the OPL-selected developer source', () => {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-standard-contract-checkout-'));
  const statusReads: string[] = [];
  const statusReader = ((input: { packageId?: string | null }) => {
    statusReads.push(input.packageId ?? '');
    throw new Error('Package status must not override a selected developer checkout.');
  }) as PackageStatusReaderFixture;
  try {
    const checkout = resolveStandardAgentContractCheckout('medautoscience', statusReader, () => ({
      installed: true,
      install_origin: 'sibling_workspace',
      checkout_path: repoDir,
      health_status: 'ready',
    }));

    assert.equal(checkout?.agent_id, 'mas');
    assert.equal(checkout?.domain_id, 'medautoscience');
    assert.equal(checkout?.source_kind, 'opl_selected_developer_checkout');
    assert.equal(fs.realpathSync.native(checkout?.checkout_path ?? ''), fs.realpathSync.native(repoDir));
    assert.deepEqual(statusReads, []);
  } finally {
    fs.rmSync(repoDir, { recursive: true, force: true });
  }
});

test('managed-root contract checkout requires matching current package source', () => {
  const selectedRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-standard-selected-managed-'));
  const packageRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-standard-package-managed-'));
  const statusReader = (() => ({
    opl_agent_package_status: {
      installed_package_count: 1,
      package_dependency_readiness: {
        status: 'current',
        operational_ready: true,
      },
      runtime_source_readiness: {
        status: 'current',
        operational_ready: true,
        checkout_path: packageRepo,
        expected_tree_sha256: 'sha256:current',
        actual_tree_sha256: 'sha256:current',
      },
    },
  })) as unknown as PackageStatusReaderFixture;
  try {
    const checkout = resolveStandardAgentContractCheckout('mas', statusReader, () => ({
      installed: true,
      install_origin: 'managed_root',
      checkout_path: selectedRepo,
      health_status: 'ready',
    }));

    assert.equal(checkout, null);
  } finally {
    fs.rmSync(selectedRepo, { recursive: true, force: true });
    fs.rmSync(packageRepo, { recursive: true, force: true });
  }
});

test('native carrier contract checkout uses the carrier source without runtime source readiness', () => {
  const carrierRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-standard-native-contract-carrier-'));
  const statusReader = (() => ({
    opl_agent_package_status: {
      installed_package_count: 1,
      installed_carrier_readback: {
        kind: 'codex_plugin_manager',
        identity: 'mas',
        source_ref: carrierRepo,
        version: '0.2.24',
        enabled: true,
        lifecycle_authority: 'carrier_owned',
      },
      installed_readiness: {
        installed: true,
        physical_status: 'available',
        callability: 'callable',
      },
      package_dependency_readiness: {
        status: 'current',
        operational_ready: true,
      },
    },
  })) as unknown as PackageStatusReaderFixture;

  try {
    const resolution = resolveStandardAgentContractCheckout(
      'mas',
      statusReader,
      () => null,
      { result: 'typed_resolution' },
    );

    assert.equal(resolution.status, 'resolved');
    assert.equal(resolution.launch_allowed, true);
    assert.equal(resolution.source_status, 'current');
    assert.equal(resolution.checkout?.source_kind, 'opl_managed_package_checkout');
    assert.equal(fs.realpathSync.native(resolution.checkout?.checkout_path ?? ''), fs.realpathSync.native(carrierRepo));
  } finally {
    fs.rmSync(carrierRepo, { recursive: true, force: true });
  }
});

test('typed contract checkout resolution fails closed without native carrier authority', () => {
  const statusReader = (() => ({
    opl_agent_package_status: {
      installed_package_count: 1,
      package_dependency_readiness: {
        status: 'current',
        operational_ready: true,
      },
      operational_ready: false,
      launch_allowed: false,
      launch_blocked_reason: 'installed_native_carrier_required',
    },
  })) as PackageStatusReaderFixture;

  const resolution = resolveStandardAgentContractCheckout(
    'mas',
    statusReader,
    () => null,
    { result: 'typed_resolution' },
  );

  assert.equal(resolution.status, 'blocked');
  assert.equal(resolution.reason, 'installed_native_carrier_required');
  assert.equal(resolution.source_status, null);
  assert.equal(resolution.launch_allowed, false);
  assert.equal(resolution.checkout, null);
  assert.equal(resolveStandardAgentContractCheckout('mas', statusReader, () => null), null);
});

test('developer-selected sibling descriptor wins over an inactive stale managed mirror', () => {
  withDeveloperBookForgeSources(({ siblingRepo, statusReader, statusReads }) => {
    const descriptor = readStandardAgentDescriptorForDomain('obf', statusReader);

    assert.equal(
      fs.realpathSync.native(descriptor?.repo_dir ?? ''),
      fs.realpathSync.native(siblingRepo),
    );
    assert.equal(descriptor?.domain_id, 'oplbookforge');
    assert.deepEqual(statusReads, []);
  });
});

test('selected descriptor accepts a canonical registry agent id as its domain identity', () => {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-standard-interface-agent-id-'));
  const statusReads: string[] = [];
  const statusReader = ((input: { packageId?: string | null }) => {
    statusReads.push(input.packageId ?? '');
    throw new Error('Package status should not be read for a selected sibling checkout.');
  }) as PackageStatusReaderFixture;
  try {
    writeStandardAgentDescriptor(repoDir, standardAgentDescriptor('mas'));
    const descriptor = readStandardAgentDescriptorForDomain('mas', statusReader, () => ({
      installed: true,
      install_origin: 'sibling_workspace',
      checkout_path: repoDir,
      health_status: 'ready',
    }));

    assert.equal(descriptor?.domain_id, 'mas');
    assert.equal(fs.realpathSync.native(descriptor?.repo_dir ?? ''), fs.realpathSync.native(repoDir));
    assert.deepEqual(statusReads, []);
  } finally {
    fs.rmSync(repoDir, { recursive: true, force: true });
  }
});

test('developer-selected sibling descriptor remains fail-closed when the selected source is invalid', () => {
  withDeveloperBookForgeSources(({ siblingRepo, statusReader, statusReads }) => {
    writeStandardAgentDescriptor(siblingRepo, standardAgentDescriptor('oplbookforge', {
      ...fixture(),
      workspace_binding: {
        ...fixture().workspace_binding,
        manifest_command_template: ['invalid', 'selected'],
      },
    } as ReturnType<typeof fixture>));

    assert.throws(
      () => readStandardAgentDescriptorForDomain('obf', statusReader),
      /unknown properties/,
    );
    assert.deepEqual(statusReads, []);
  });
});

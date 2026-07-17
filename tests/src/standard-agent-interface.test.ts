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
  STANDARD_AGENT_INTERFACE_VERSION,
} from '../../src/kernel/standard-agent-interface.ts';
import {
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
        runtime_source_readiness: {
          status: 'current',
          operational_ready: true,
          checkout_path: managedRepo,
          expected_tree_sha256: 'sha256:stale-managed',
          actual_tree_sha256: 'sha256:stale-managed',
        },
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

test('standard Agent interface accepts optional work-item detail view declarations', () => {
  const value = {
    ...fixture(),
    domain_detail_views: [
      {
        view_id: 'scientific-reasoning',
        view_kind: 'scientific_reasoning_map',
        schema_version: 'scientific-reasoning-map.v1',
        source_kind: 'work_item_relative_json',
        relative_path: 'artifacts/research_trajectory/snapshot.json',
      },
    ],
  };

  const parsed = parseStandardAgentInterface(value, 'fixture.json#/standard_agent_interface');
  assert.deepEqual(parsed.domain_detail_views, value.domain_detail_views);

  const schemaRef = 'contracts/opl-framework/standard-agent-interface.schema.json';
  const schema = parseJsonText(fs.readFileSync(path.join(process.cwd(), schemaRef), 'utf8')) as Record<string, unknown>;
  const validation = validateJsonSchemaPayload({
    schemaId: 'opl.standard_agent_interface.v1',
    schema,
    sourceRef: schemaRef,
  }, value);
  assert.equal(validation.ok, true, validation.ok ? undefined : JSON.stringify(validation.errors, null, 2));

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

test('package dependency and runtime source readiness gate descriptor discovery independently of workspace scope', () => {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-standard-interface-managed-'));
  try {
    fs.mkdirSync(path.join(repoDir, 'contracts'), { recursive: true });
    fs.writeFileSync(path.join(repoDir, 'contracts', 'domain_descriptor.json'), `${JSON.stringify({
      domain_id: 'fixture-agent',
      standard_agent_interface: fixture(),
    })}\n`);
    const statusReads: Array<{ packageId?: string | null; recoverRuntimeSource?: boolean }> = [];
    const statusReader = ((input: { packageId?: string | null; recoverRuntimeSource?: boolean }) => {
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
            runtime_source_readiness: {
              status: 'current',
              operational_ready: true,
              checkout_path: repoDir,
              expected_tree_sha256: 'sha256:current',
              actual_tree_sha256: 'sha256:current',
            },
          }
        : {
            installed_package_count: 0,
            operational_ready: false,
            package_dependency_readiness: {
              status: 'missing',
              operational_ready: false,
            },
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
    const descriptor = readPackageManagedStandardAgentDescriptor(['mas'], statusReader);
    assert.equal(descriptor?.repo_dir, repoDir);
    assert.equal(descriptor?.interface.runtime.runtime_domain_id, 'fixture');
    assert.equal(statusReads[0]?.recoverRuntimeSource, false);
    assert.deepEqual(standardAgentProgressDeltaKeys('fixture-agent', 'deliverable', statusReader), [
      'deliverable_progress_delta',
      'fixture_deliverable_delta',
    ]);
    const statusReadCountBeforeKeySet = statusReads.length;
    assert.deepEqual(standardAgentProgressDeltaKeySet('fixture-agent', statusReader), {
      deliverable: ['deliverable_progress_delta', 'fixture_deliverable_delta'],
      platform: ['platform_repair_delta', 'fixture_platform_delta'],
    });
    assert.equal(statusReads.length, statusReadCountBeforeKeySet + 1);
    const observedDeveloperDriftReader = ((input: { packageId?: string | null }) => {
      const readback = statusReader(input);
      if (input.packageId === 'mas') {
        readback.opl_agent_package_status.runtime_source_readiness.actual_tree_sha256 = 'sha256:stale';
        readback.opl_agent_package_status.runtime_source_readiness.provenance_observation = {
          policy: 'observation_only',
          status: 'changed',
        };
      }
      return readback;
    }) as any;
    assert.equal(
      readPackageManagedStandardAgentDescriptor(['mas'], observedDeveloperDriftReader)?.repo_dir,
      repoDir,
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
        readback.opl_agent_package_status.runtime_source_readiness.status = 'incompatible';
        readback.opl_agent_package_status.runtime_source_readiness.operational_ready = false;
        readback.opl_agent_package_status.runtime_source_readiness.reason =
          'managed_runtime_source_lock_mismatch';
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
    assert.equal(incompatibleResolution.reason, 'managed_runtime_source_lock_mismatch');
    const missingDependencyStatusReader = ((input: { packageId?: string | null }) => {
      const readback = statusReader(input);
      if (input.packageId === 'mas') {
        readback.opl_agent_package_status.package_dependency_readiness.operational_ready = false;
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
  })) as PackageStatusReaderFixture;
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

test('typed contract checkout resolution preserves managed runtime source reason', () => {
  const statusReader = (() => ({
    opl_agent_package_status: {
      installed_package_count: 1,
      package_dependency_readiness: {
        status: 'current',
        operational_ready: true,
      },
      runtime_source_readiness: {
        status: 'incompatible',
        operational_ready: false,
        checkout_path: '/tmp/opl-managed-runtime-source-mismatch',
        expected_tree_sha256: 'sha256:expected',
        actual_tree_sha256: 'sha256:actual',
        reason: 'managed_runtime_source_lock_mismatch',
      },
      operational_ready: false,
      launch_allowed: false,
      launch_blocked_reason: 'runtime_source_incompatible',
    },
  })) as PackageStatusReaderFixture;

  const resolution = resolveStandardAgentContractCheckout(
    'mas',
    statusReader,
    () => null,
    { result: 'typed_resolution' },
  );

  assert.equal(resolution.status, 'blocked');
  assert.equal(resolution.reason, 'managed_runtime_source_lock_mismatch');
  assert.equal(resolution.source_status, 'incompatible');
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

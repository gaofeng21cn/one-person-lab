import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

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

test('standard Agent interface parses a domain-owned descriptor without domain branching', () => {
  const descriptor = parseStandardAgentInterface(fixture(), 'fixture.json#/standard_agent_interface');
  assert.equal(descriptor.workspace_binding.locator_surface_kind, 'fixture_workspace_locator');
  assert.equal(descriptor.inventory_projection, null);
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
    const staleStatusReader = ((input: { packageId?: string | null }) => {
      const readback = statusReader(input);
      if (input.packageId === 'mas') {
        readback.opl_agent_package_status.runtime_source_readiness.actual_tree_sha256 = 'sha256:stale';
      }
      return readback;
    }) as any;
    assert.equal(readPackageManagedStandardAgentDescriptor(['mas'], staleStatusReader), null);
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

  readStandardAgentDescriptorForDomain('medautoscience', statusReader);

  assert.deepEqual(statusReads, ['mas']);
});

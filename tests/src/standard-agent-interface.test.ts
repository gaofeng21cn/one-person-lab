import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  assertStandardAgentDescriptorIdentity,
  materializeStandardAgentCommand,
  parseStandardAgentInterface,
  readStandardAgentDescriptorInterface,
  readStandardAgentInterface,
  STANDARD_AGENT_INTERFACE_VERSION,
} from '../../src/kernel/standard-agent-interface.ts';
import {
  readPackageManagedStandardAgentDescriptor,
  readStandardAgentDescriptorForDomain,
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
      entry_command_template: ['fixture', 'status', '--profile-ref', '{profile_ref}'],
      manifest_command_template: ['fixture', 'manifest', '--profile-ref', '{profile_ref}'],
    },
    runtime: {
      runtime_domain_id: 'fixture',
      dispatch_command: ['fixture', 'dispatch'],
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
  assert.deepEqual(
    materializeStandardAgentCommand(descriptor.workspace_binding.entry_command_template!, {
      profile_ref: '/tmp/profile.toml',
    }),
    ['fixture', 'status', '--profile-ref', '/tmp/profile.toml'],
  );
});

test('standard Agent interface rejects unknown command placeholders', () => {
  const value = fixture();
  value.workspace_binding.entry_command_template = ['fixture', '{domain_private_value}'];
  assert.throws(
    () => parseStandardAgentInterface(value, 'fixture.json#/standard_agent_interface'),
    /unsupported placeholder/,
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

test('standard Agent interface parser enforces closed objects and declared placeholders', () => {
  const unknown = fixture() as ReturnType<typeof fixture> & { private_runtime: boolean };
  unknown.private_runtime = true;
  assert.throws(
    () => parseStandardAgentInterface(unknown, 'fixture.json#/standard_agent_interface'),
    /unknown properties/,
  );
  const undeclared = fixture();
  undeclared.workspace_binding.required_locator_fields = [];
  assert.throws(
    () => parseStandardAgentInterface(undeclared, 'fixture.json#/standard_agent_interface'),
    /undeclared locator field/,
  );
  const multipleWorkstreams = fixture();
  multipleWorkstreams.routing.workstream_ids = ['fixture_ops', 'other_ops'];
  assert.throws(
    () => parseStandardAgentInterface(multipleWorkstreams, 'fixture.json#/standard_agent_interface'),
    /at most one admitted workstream/,
  );
});

test('package readiness is the canonical managed descriptor discovery gate', () => {
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
            operational_ready: true,
            runtime_source_readiness: {
              status: 'current',
              operational_ready: true,
              checkout_path: repoDir,
              expected_tree_sha256: 'sha256:current',
              actual_tree_sha256: 'sha256:current',
            },
          }
        : {
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
    const descriptor = readPackageManagedStandardAgentDescriptor(['mas'], statusReader);
    assert.equal(descriptor?.repo_dir, repoDir);
    assert.equal(descriptor?.interface.runtime.runtime_domain_id, 'fixture');
    assert.equal(statusReads[0]?.recoverRuntimeSource, false);
    assert.deepEqual(standardAgentProgressDeltaKeys('fixture-agent', 'deliverable', statusReader), [
      'deliverable_progress_delta',
      'fixture_deliverable_delta',
    ]);
    const staleStatusReader = ((input: { packageId?: string | null }) => {
      const readback = statusReader(input);
      if (input.packageId === 'mas') {
        readback.opl_agent_package_status.runtime_source_readiness.actual_tree_sha256 = 'sha256:stale';
      }
      return readback;
    }) as any;
    assert.equal(readPackageManagedStandardAgentDescriptor(['mas'], staleStatusReader), null);
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

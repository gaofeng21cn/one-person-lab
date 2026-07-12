import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  assertStandardAgentDescriptorIdentity,
  materializeStandardAgentCommand,
  parseStandardAgentInterface,
  readPackageManagedStandardAgentDescriptor,
  readStandardAgentDescriptorInterface,
  readStandardAgentInterface,
  STANDARD_AGENT_INTERFACE_VERSION,
  standardAgentProgressDeltaKeys,
} from '../../src/kernel/standard-agent-interface.ts';

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

test('package lock managed source is the canonical descriptor discovery path', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-standard-interface-state-'));
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-standard-interface-managed-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  try {
    fs.mkdirSync(path.join(repoDir, 'contracts'), { recursive: true });
    fs.writeFileSync(path.join(repoDir, 'contracts', 'domain_descriptor.json'), `${JSON.stringify({
      domain_id: 'fixture-agent',
      standard_agent_interface: fixture(),
    })}\n`);
    fs.writeFileSync(path.join(stateDir, 'agent-package-locks.json'), `${JSON.stringify({
      surface_kind: 'opl_agent_package_lock_index',
      version: 'opl-agent-package-lock-index.v1',
      packages: [{
        package_id: 'fixture',
        agent_id: 'fixture',
        managed_runtime_source: {
          status: 'current',
          checkout_path: repoDir,
        },
      }],
    })}\n`);
    process.env.OPL_STATE_DIR = stateDir;
    const descriptor = readPackageManagedStandardAgentDescriptor(['fixture']);
    assert.equal(descriptor?.repo_dir, repoDir);
    assert.equal(descriptor?.interface.runtime.runtime_domain_id, 'fixture');
    assert.deepEqual(standardAgentProgressDeltaKeys('fixture-agent', 'deliverable'), [
      'deliverable_progress_delta',
      'fixture_deliverable_delta',
    ]);
    assert.throws(
      () => assertStandardAgentDescriptorIdentity(descriptor!, {
        project: 'different-agent',
        domain_id: 'different',
      }),
      /identity does not match/,
    );
    assert.equal(readStandardAgentDescriptorInterface(repoDir)?.domain_id, 'fixture-agent');
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    fs.rmSync(stateDir, { recursive: true, force: true });
    fs.rmSync(repoDir, { recursive: true, force: true });
  }
});

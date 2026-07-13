import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseJsonText } from '../../src/kernel/json-file.ts';
import { validateJsonSchemaPayload } from '../../src/kernel/schema-registry.ts';
import { resolveCapabilityForCurrentDelta } from '../../src/modules/connect/capability-registry-resolver.ts';
import { buildCurrentOwnerDeltaReadModel } from '../../src/modules/ledger/current-owner-delta-projection.ts';

import './target-architecture-schema-contracts-cases/target-operating-architecture.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

const schemaPaths = [
  'contracts/opl-framework/current-owner-delta.schema.json',
  'contracts/opl-framework/stage-manifest.schema.json',
  'contracts/opl-framework/role-artifact-ref.schema.json',
  'contracts/opl-framework/stage-owner-receipt.schema.json',
  'contracts/opl-framework/stage-typed-blocker.schema.json',
  'contracts/opl-framework/stage-artifact-unit.schema.json',
  'contracts/opl-framework/progress-delta-receipt.schema.json',
  'contracts/opl-framework/owner-answer.schema.json',
  'contracts/opl-framework/evidence-ledger-event.schema.json',
  'contracts/opl-framework/golden-path-profile.schema.json',
  'contracts/opl-framework/default-surface-budget.schema.json',
  'contracts/opl-framework/workspace-topology-profile.schema.json',
  'contracts/opl-framework/workspace-index.schema.json',
  'contracts/opl-framework/capability-registry-resolver.schema.json',
] as const;

function readJson<T>(relativePath: string): T {
  return parseJsonText(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as T;
}

test('target architecture schemas compile and reject an empty canonical fixture', () => {
  for (const schemaPath of schemaPaths) {
    const schema = readJson<Record<string, any>>(schemaPath);

    assert.equal(schema.owner, 'one-person-lab', `${schemaPath} must stay OPL-owned`);
    assert.equal(schema.state, 'active_contract', `${schemaPath} must stay active`);
    assert.equal(typeof schema.purpose, 'string', `${schemaPath} must declare purpose`);
    assert.equal(typeof schema.machine_boundary, 'string', `${schemaPath} must declare boundary`);
    assert.equal(schema.type, 'object', `${schemaPath} must describe an object payload`);

    const result = validateJsonSchemaPayload({
      schemaId: schema.$id,
      schema,
      sourceRef: schemaPath,
    }, {});
    assert.equal(result.ok, false, `${schemaPath} must fail closed for an empty payload`);
    if (!result.ok) {
      assert.equal(result.errors.some((error) => error.keyword === 'required'), true, schemaPath);
    }
  }
});

test('current owner delta rejects the retired stop-loss enforcement field', () => {
  const schema = readJson<Record<string, any>>('contracts/opl-framework/current-owner-delta.schema.json');
  const currentOwnerDelta = buildCurrentOwnerDeltaReadModel({
    ownerDeltaFirst: {
      next_owner: 'med-autoscience',
      next_required_delta: 'domain_owner_answer_or_typed_blocker_required',
      required_return_shapes: ['domain_owner_receipt_ref', 'typed_blocker_ref'],
    },
  }).current_owner_delta;
  const entry = {
    schemaId: schema.$id,
    schema,
    sourceRef: 'contracts/opl-framework/current-owner-delta.schema.json',
  };

  assert.equal(validateJsonSchemaPayload(entry, currentOwnerDelta).ok, true);
  assert.equal(validateJsonSchemaPayload(entry, {
    ...currentOwnerDelta,
    stop_loss_state: { status: 'frozen' },
  }).ok, false);
});

test('target architecture schemas retain sparse identity, required-field, and authority boundaries', () => {
  const schemas = Object.fromEntries(
    schemaPaths.map((schemaPath) => [schemaPath, readJson<Record<string, any>>(schemaPath)]),
  );
  const ownerDelta = schemas['contracts/opl-framework/current-owner-delta.schema.json'];
  const stageManifest = schemas['contracts/opl-framework/stage-manifest.schema.json'];
  const roleArtifactRef = schemas['contracts/opl-framework/role-artifact-ref.schema.json'];
  const ownerReceipt = schemas['contracts/opl-framework/stage-owner-receipt.schema.json'];
  const typedBlocker = schemas['contracts/opl-framework/stage-typed-blocker.schema.json'];
  const stageArtifact = schemas['contracts/opl-framework/stage-artifact-unit.schema.json'];
  const progressReceipt = schemas['contracts/opl-framework/progress-delta-receipt.schema.json'];
  const ownerAnswer = schemas['contracts/opl-framework/owner-answer.schema.json'];
  const evidenceLedger = schemas['contracts/opl-framework/evidence-ledger-event.schema.json'];
  const goldenPath = schemas['contracts/opl-framework/golden-path-profile.schema.json'];
  const surfaceBudget = schemas['contracts/opl-framework/default-surface-budget.schema.json'];
  const workspaceTopology = schemas['contracts/opl-framework/workspace-topology-profile.schema.json'];
  const workspaceIndex = schemas['contracts/opl-framework/workspace-index.schema.json'];
  const capabilityResolver = schemas['contracts/opl-framework/capability-registry-resolver.schema.json'];

  assert.equal(ownerDelta.properties.surface_kind.const, 'opl_current_owner_delta');
  assert.equal(ownerDelta.properties.default_planning_root.const, 'current_owner_delta');
  assert.equal(ownerDelta.properties.progress_delta_receipt.properties.ordinary_receipt_kind.const, 'ProgressDeltaReceipt');
  assert.equal(evidenceLedger.properties.ledger_policy.const, 'record_everything_plan_from_nothing');
  assert.equal(capabilityResolver.properties.resolver_policy.const, 'current_delta_bound_jit_or_fail_open');

  for (const [schema, requiredFields] of [
    [stageManifest, ['required_roles', 'produced_roles', 'receipt_refs', 'typed_blocker_refs']],
    [roleArtifactRef, ['role', 'artifact_ref', 'content_hash']],
    [ownerReceipt, ['consumed_role_artifacts', 'accepted_delta', 'next_stage_or_owner']],
    [typedBlocker, ['blocked_surface', 'missing_or_failed_input', 'next_safe_action']],
    [workspaceTopology, ['default_profiles', 'domain_profile_defaults', 'runtime_state_boundary']],
    [workspaceIndex, ['canonical_topology', 'profile_binding', 'topology_events']],
  ] as const) {
    for (const field of requiredFields) {
      assert.equal(schema.required.includes(field), true, `${schema.$id} must require ${field}`);
    }
  }

  for (const [boundary, falseFields] of [
    [ownerDelta.$defs.authority_boundary.properties, ['route_reconciler_can_complete_stage', 'route_reconciler_can_sign_receipts', 'audit_tail_can_drive_default_planning']],
    [stageManifest.$defs.authority_boundary.properties, ['file_presence_counts_as_stage_complete', 'provider_completion_counts_as_stage_complete']],
    [roleArtifactRef.$defs.authority_boundary.properties, ['file_name_is_role_interface', 'artifact_body_included']],
    [ownerReceipt.$defs.authority_boundary.properties, ['opl_can_create_owner_receipt', 'provider_completion_counts_as_owner_receipt']],
    [typedBlocker.$defs.authority_boundary.properties, ['opl_can_create_typed_blocker', 'blocker_counts_as_stage_success']],
    [stageArtifact.$defs.authority_boundary.properties, ['provider_completion_counts_as_progress', 'can_publish_current_owner_delta']],
    [progressReceipt.$defs.authority_boundary.properties, ['can_authorize_stage_complete', 'can_sign_owner_receipt']],
    [ownerAnswer.$defs.authority_boundary.properties, ['opl_can_sign_domain_owner_answer', 'opl_can_authorize_quality_verdict']],
    [evidenceLedger.$defs.authority_boundary.properties, ['event_can_create_default_action_without_delta', 'opl_can_write_domain_truth']],
    [goldenPath.$defs.authority_boundary.properties, ['variant_can_be_default_without_explicit_selection', 'opl_can_authorize_domain_ready']],
    [surfaceBudget.$defs.authority_boundary.properties, ['default_surface_can_claim_production_ready', 'default_surface_can_replace_domain_owner']],
    [workspaceTopology.$defs.authority_boundary.properties, ['opl_can_write_domain_truth', 'runtime_state_counts_as_user_default_surface']],
    [workspaceIndex.$defs.authority_boundary.properties, ['opl_can_write_domain_truth', 'runtime_state_counts_as_user_default_surface']],
    [capabilityResolver.$defs.authority_boundary.properties, ['can_execute_capability', 'can_write_domain_truth', 'can_create_domain_typed_blocker']],
  ] as const) {
    for (const field of falseFields) {
      assert.equal(boundary[field].const, false, `${field} must remain false`);
    }
  }

  assert.equal(goldenPath.$defs.explicit_variant.properties.explicit_selection_required.const, true);
  assert.equal(
    fs.existsSync(path.join(repoRoot, 'contracts/opl-framework/stop-loss-policy.schema.json')),
    false,
    'stop-loss must be owned by current-owner-delta instead of a second schema',
  );
  assert.equal(Object.hasOwn(ownerDelta.properties, 'stop_loss_state'), false);
  assert.equal(Object.hasOwn(ownerDelta.$defs, 'stop_loss_authority_boundary'), false);
  const targetArchitecture = readJson<Record<string, any>>(
    'contracts/opl-framework/target-operating-architecture-contract.json',
  );
  const targetCapability = targetArchitecture.foundry_agent_os_standard.capability_registry_boundary;
  assert.deepEqual(
    [
      targetCapability.resolver_abi_ref,
      targetCapability.default_behavior,
      ownerDelta.properties.capability_invocation_hard_gate_policy.properties.runway_can_write_domain_truth.const,
    ],
    [
      'contracts/opl-framework/capability-registry-resolver.schema.json',
      capabilityResolver.$defs.capability_registry_readout.properties.default_behavior.const,
      capabilityResolver.$defs.authority_boundary.properties.can_write_domain_truth.const,
    ],
  );
  assert.equal(
    workspaceIndex.$defs.current_stage_pointer.properties.authority_boundary.properties
      .pointer_can_publish_current_owner_delta.const,
    false,
  );

  const capabilityPayload = resolveCapabilityForCurrentDelta({
    registry: { registry_id: 'schema-sentinel', owner_modules: [], capabilities: [] },
    currentOwnerDelta: {
      default_planning_root: 'current_owner_delta',
      delta_ref: 'delta:schema-sentinel',
      domain_id: 'mas',
      work_unit_ref: 'work:schema-sentinel',
      current_owner: 'med-autoscience',
    },
    capabilityRef: 'capability:missing',
    workUnitRef: 'work:schema-sentinel',
  });
  for (const [schemaPath, payload, group, field] of [
    ['contracts/opl-framework/capability-registry-resolver.schema.json', capabilityPayload, 'authority_boundary', 'can_write_domain_truth'],
  ] as const) {
    const schema = schemas[schemaPath];
    const entry = { schemaId: schema.$id, schema, sourceRef: schemaPath };
    assert.equal(validateJsonSchemaPayload(entry, payload).ok, true, `${schemaPath} fixture must stay valid`);

    const invalidPath = `/${group}/${field}`;
    const invalidPayload: any = structuredClone(payload);
    invalidPayload[group][field] = true;
    const result = validateJsonSchemaPayload(entry, invalidPayload);
    assert.equal(result.ok, false, `${schemaPath} must reject ${invalidPath}=true`);
    if (!result.ok) {
      assert.equal(
        result.errors.some((error) => error.instance_path === invalidPath && error.keyword === 'const'),
        true,
        `${schemaPath} must fail at ${invalidPath}`,
      );
    }
  }
});

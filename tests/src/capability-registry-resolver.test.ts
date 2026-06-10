import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCapabilityRegistryReadout,
  type CapabilityRegistryCatalog,
  type CurrentOwnerDeltaCapabilityBinding,
  resolveCapabilityForCurrentDelta,
} from '../../src/capability-registry-resolver.ts';

const currentOwnerDelta: CurrentOwnerDeltaCapabilityBinding = {
  surface_kind: 'opl_current_owner_delta',
  schema_version: 'current-owner-delta.v1',
  default_planning_root: 'current_owner_delta',
  delta_ref: 'opl://current-owner-delta/mas/delta-source-route',
  domain_id: 'mas',
  work_unit_ref: 'opl://stage-runs/mas/source-readiness',
  current_owner: 'med-autoscience',
  required_capability_refs: [
    {
      capability_ref: 'capability:source-readiness-route',
      binding_kind: 'route_required',
      hard_boundary: 'source_data_evidence',
      required_by_delta_ref: 'opl://current-owner-delta/mas/delta-source-route',
    },
  ],
};

const registry: CapabilityRegistryCatalog = {
  registry_id: 'opl.capability_registry.test',
  owner_modules: ['atlas', 'pack', 'stagecraft'],
  capabilities: [
    {
      capability_ref: 'capability:co-scientist-claim-support',
      capability_id: 'co_scientist_claim_support',
      owner: 'one-person-lab',
      source_family: 'co_scientist',
      surface_ref: 'opl://capabilities/co-scientist/claim-support',
      lifecycle: 'available',
    },
    {
      capability_ref: 'capability:light-literature-prioritization',
      capability_id: 'light_literature_prioritization',
      owner: 'one-person-lab',
      source_family: 'light',
      surface_ref: 'opl://capabilities/light/literature-prioritization',
      lifecycle: 'available',
    },
  ],
};

test('capability registry resolver fails open for missing optional capability refs', () => {
  const result = resolveCapabilityForCurrentDelta({
    registry,
    currentOwnerDelta,
    capabilityRef: 'capability:evo-ablation-hypothesis',
    workUnitRef: 'opl://stage-runs/mas/source-readiness',
    bindingKind: 'optional',
  });

  assert.equal(result.surface_kind, 'opl_capability_registry_resolution');
  assert.equal(result.resolution_status, 'fail_open');
  assert.equal(result.selection.action, 'advisory_or_audit');
  assert.equal(result.selection.capability_found, false);
  assert.equal(result.current_owner_delta_binding.default_planning_root, 'current_owner_delta');
  assert.equal(result.current_owner_delta_binding.bound, true);
  assert.equal(result.route_required_policy.is_route_required, false);
  assert.equal(result.blocker_candidate, null);
  assert.equal(result.authority_boundary.can_execute_capability, false);
  assert.equal(result.authority_boundary.can_write_domain_truth, false);
  assert.equal(result.authority_boundary.can_sign_owner_receipt, false);
  assert.equal(result.authority_boundary.can_create_domain_typed_blocker, false);
  assert.equal(result.authority_boundary.can_claim_quality_or_export_verdict, false);
});

test('capability registry resolver returns typed blocker candidate only for current delta route-required hard-boundary misses', () => {
  const result = resolveCapabilityForCurrentDelta({
    registry,
    currentOwnerDelta,
    capabilityRef: 'capability:source-readiness-route',
    workUnitRef: 'opl://stage-runs/mas/source-readiness',
    bindingKind: 'route_required',
  });

  assert.equal(result.resolution_status, 'route_required_blocker_candidate');
  assert.equal(result.selection.action, 'route_required_blocker_candidate');
  assert.equal(result.selection.capability_found, false);
  assert.equal(result.route_required_policy.is_route_required, true);
  assert.equal(result.route_required_policy.hard_boundary, 'source_data_evidence');
  assert.deepEqual(result.blocker_candidate, {
    candidate_kind: 'typed_blocker_candidate',
    candidate_id: 'capability_ref_missing:capability:source-readiness-route',
    blocker_policy: 'route_required_current_owner_delta_hard_boundary_missing_ref',
    missing_capability_ref: 'capability:source-readiness-route',
    current_owner_delta_ref: 'opl://current-owner-delta/mas/delta-source-route',
    work_unit_ref: 'opl://stage-runs/mas/source-readiness',
    route_back_owner: 'med-autoscience',
    may_create_domain_typed_blocker: false,
    repair_action: 'domain_or_gate_owner_must_supply_capability_ref_or_signed_typed_blocker',
  });
  assert.equal(result.authority_boundary.can_create_domain_typed_blocker, false);
});

test('capability registry resolver does not produce blocker candidates outside the bound current owner delta', () => {
  const result = resolveCapabilityForCurrentDelta({
    registry,
    currentOwnerDelta,
    capabilityRef: 'capability:source-readiness-route',
    workUnitRef: 'opl://stage-runs/mas/other-work-unit',
    bindingKind: 'route_required',
  });

  assert.equal(result.current_owner_delta_binding.bound, false);
  assert.equal(result.resolution_status, 'fail_open');
  assert.equal(result.selection.action, 'advisory_or_audit');
  assert.equal(result.route_required_policy.is_route_required, true);
  assert.equal(result.route_required_policy.hard_boundary, 'source_data_evidence');
  assert.equal(result.blocker_candidate, null);
});

test('capability registry resolver readout preserves external-learning refs as capability source families only', () => {
  const readout = buildCapabilityRegistryReadout({
    registry,
    currentOwnerDelta,
    requestedCapabilities: [
      {
        capabilityRef: 'capability:co-scientist-claim-support',
        workUnitRef: 'opl://stage-runs/mas/source-readiness',
        bindingKind: 'optional',
      },
      {
        capabilityRef: 'capability:evo-ablation-hypothesis',
        workUnitRef: 'opl://stage-runs/mas/source-readiness',
        bindingKind: 'optional',
      },
      {
        capabilityRef: 'capability:source-readiness-route',
        workUnitRef: 'opl://stage-runs/mas/source-readiness',
        bindingKind: 'route_required',
      },
    ],
  });

  assert.equal(readout.surface_kind, 'opl_capability_registry_readout');
  assert.equal(readout.default_behavior, 'current_owner_delta_bound_jit_or_fail_open');
  assert.equal(readout.summary.resolved_count, 1);
  assert.equal(readout.summary.fail_open_count, 1);
  assert.equal(readout.summary.blocker_candidate_count, 1);
  assert.deepEqual(readout.source_families, ['co_scientist', 'light']);
  assert.equal(readout.domain_local_selector_created, false);
  assert.equal(readout.always_on_sidecar_created, false);
  assert.equal(readout.default_preflight_created, false);
  assert.equal(readout.second_active_backlog_created, false);
  assert.equal(readout.authority_boundary.can_write_domain_truth, false);
  assert.equal(readout.authority_boundary.can_sign_owner_receipt, false);
  assert.equal(readout.authority_boundary.can_create_domain_typed_blocker, false);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  runFamilyTransition,
  runFamilyTransitionMatrix,
  type FamilyTransitionSpec,
} from '../../src/family-transition-runner.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function readJson(relativePath: string) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as Record<string, any>;
}

const masLikeTransitionSpec = {
  surface_kind: 'family_transition_spec',
  version: 'family-transition-runner.v1',
  spec_id: 'mas-like-publication-transition-fixture',
  target_domain_id: 'medautoscience',
  owner: 'med-autoscience',
  authority_boundary: {
    opl: 'transition_runner_transport_projection_only',
    domain: 'truth_quality_artifact_gate_owner',
  },
  guards: {
    owner_receipt_observed: {
      description: 'Domain owner has emitted a receipt ref.',
      owner: 'med-autoscience',
    },
    owner_receipt_missing: {
      description: 'Domain owner receipt is not present.',
      owner: 'med-autoscience',
    },
    publishability_issue_open: {
      description: 'Domain-owned publication gate is still blocked.',
      owner: 'med-autoscience',
    },
    human_publication_decision_required: {
      description: 'Domain asks for a human publication gate decision.',
      owner: 'med-autoscience',
    },
  },
  transitions: [
    {
      transition_id: 'bundle-ready-to-publication-check',
      current_state: 'bundle_stage_ready',
      event: 'domain_tick',
      required_guards: ['owner_receipt_observed'],
      next_state: 'publication_gate_check',
      next_work_unit: {
        work_unit_ref: 'mas-work-unit:publication-gate-check',
        action_refs: ['mas-action:run-publication-gate'],
      },
      owner_route: {
        owner: 'med-autoscience',
        route_ref: 'mas-route:publication-gate',
      },
      receipt: {
        receipt_refs: ['mas-receipt:bundle-owner-ready'],
      },
      projection: {
        route_node_refs: ['mas-route-node:bundle-stage-ready'],
        quality_ref: 'mas-quality-ref:domain-owned-only',
      },
    },
    {
      transition_id: 'bundle-blocked-to-owner-repair',
      current_state: 'bundle_stage_blocked',
      event: 'domain_tick',
      required_guards: ['owner_receipt_missing'],
      next_state: 'owner_repair_required',
      next_work_unit: {
        work_unit_ref: 'mas-work-unit:collect-owner-receipt',
        action_refs: ['mas-action:request-owner-receipt'],
      },
      owner_route: {
        owner: 'med-autoscience',
        route_ref: 'mas-route:owner-repair',
      },
      typed_blocker: {
        blocker_code: 'blocked_no_mas_owner_apply_receipt',
        owner: 'med-autoscience',
        refs: ['mas-blocker:missing-owner-receipt'],
      },
      receipt: {
        receipt_refs: ['mas-receipt:blocker-observed'],
      },
    },
    {
      transition_id: 'publishability-blocked-to-human-gate',
      current_state: 'publishability_gate_blocked',
      event: 'domain_tick',
      required_guards: [
        'publishability_issue_open',
        'human_publication_decision_required',
      ],
      next_state: 'human_gate_required',
      owner_route: {
        owner: 'human_operator',
        route_ref: 'human-gate:publication-decision',
      },
      human_gate: {
        gate_ref: 'human-gate:publication-decision',
        owner: 'human_operator',
        reason: 'domain_publication_gate_requires_human_decision',
      },
      receipt: {
        receipt_refs: ['mas-receipt:publishability-blocker'],
      },
    },
  ],
} satisfies FamilyTransitionSpec;

test('family transition runner advances bundle_stage_ready through domain-declared owner route without domain verdict ownership', () => {
  const result = runFamilyTransition({
    spec: masLikeTransitionSpec,
    domain_id: 'medautoscience',
    current_state: 'bundle_stage_ready',
    event: 'domain_tick',
    guards: { owner_receipt_observed: true },
    context: { attempt_id: 'sat_bundle_ready' },
  });

  assert.equal(result.status, 'transition_applied');
  assert.equal(result.next_state, 'publication_gate_check');
  assert.deepEqual(result.next_work_unit, {
    work_unit_ref: 'mas-work-unit:publication-gate-check',
    action_refs: ['mas-action:run-publication-gate'],
  });
  assert.deepEqual(result.owner_route, {
    owner: 'med-autoscience',
    route_ref: 'mas-route:publication-gate',
  });
  assert.equal(result.human_gate, null);
  assert.equal(result.typed_blocker, null);
  assert.equal(result.dead_letter_intent, null);
  assert.deepEqual(result.receipt.receipt_refs, ['mas-receipt:bundle-owner-ready']);
  assert.equal(result.projection.current_state, 'bundle_stage_ready');
  assert.equal(result.projection.next_state, 'publication_gate_check');
  assert.deepEqual(result.projection.route_node_refs, ['mas-route-node:bundle-stage-ready']);
  assert.equal(
    result.authority_boundary.opl,
    'transition_runner_transport_projection_only',
  );
  assert.equal(
    result.authority_boundary.domain,
    'truth_quality_artifact_gate_owner',
  );
});

test('family transition matrix keeps adjacent MAS-like blocked states from crossing into the ready route', () => {
  const result = runFamilyTransitionMatrix({
    spec: masLikeTransitionSpec,
    cases: [
      {
        case_id: 'ready-can-enter-publication-check',
        domain_id: 'medautoscience',
        current_state: 'bundle_stage_ready',
        event: 'domain_tick',
        guards: { owner_receipt_observed: true },
      },
      {
        case_id: 'bundle-blocked-stays-on-owner-repair',
        domain_id: 'medautoscience',
        current_state: 'bundle_stage_blocked',
        event: 'domain_tick',
        guards: { owner_receipt_missing: true },
      },
      {
        case_id: 'publishability-blocked-stays-on-human-gate',
        domain_id: 'medautoscience',
        current_state: 'publishability_gate_blocked',
        event: 'domain_tick',
        guards: {
          publishability_issue_open: true,
          human_publication_decision_required: true,
        },
      },
    ],
  });

  assert.equal(result.status, 'matrix_evaluated');
  assert.equal(result.summary.total, 3);
  assert.equal(result.summary.transition_applied, 3);
  assert.deepEqual(
    result.results.map((entry) => [entry.case_id, entry.result.next_state]),
    [
      ['ready-can-enter-publication-check', 'publication_gate_check'],
      ['bundle-blocked-stays-on-owner-repair', 'owner_repair_required'],
      ['publishability-blocked-stays-on-human-gate', 'human_gate_required'],
    ],
  );
  assert.equal(result.results[1].result.typed_blocker?.blocker_code, 'blocked_no_mas_owner_apply_receipt');
  assert.equal(result.results[2].result.human_gate?.gate_ref, 'human-gate:publication-decision');
});

test('family transition runner fails closed when an adjacent state provides the wrong guard', () => {
  const result = runFamilyTransition({
    spec: masLikeTransitionSpec,
    domain_id: 'medautoscience',
    current_state: 'bundle_stage_blocked',
    event: 'domain_tick',
    guards: { owner_receipt_observed: true },
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.next_state, 'bundle_stage_blocked');
  assert.equal(result.next_work_unit, null);
  assert.equal(result.owner_route.owner, 'med-autoscience');
  assert.equal(result.typed_blocker?.blocker_code, 'transition_guard_unsatisfied');
  assert.equal(result.dead_letter_intent, null);
  assert.equal(result.receipt.receipt_status, 'blocked_fail_closed');
  assert.deepEqual(result.receipt.missing_guard_ids, ['owner_receipt_missing']);
});

test('family transition runner dead-letters unknown transitions and guard ids fail closed', () => {
  const unknownTransition = runFamilyTransition({
    spec: masLikeTransitionSpec,
    domain_id: 'medautoscience',
    current_state: 'publishability_gate_blocked',
    event: 'owner_receipt_observed',
    guards: {
      publishability_issue_open: true,
      human_publication_decision_required: true,
    },
  });
  const unknownGuard = runFamilyTransition({
    spec: masLikeTransitionSpec,
    domain_id: 'medautoscience',
    current_state: 'bundle_stage_ready',
    event: 'domain_tick',
    guards: {
      owner_receipt_observed: true,
      unregistered_guard_from_domain: true,
    },
  });

  assert.equal(unknownTransition.status, 'dead_letter_intended');
  assert.equal(unknownTransition.next_state, 'publishability_gate_blocked');
  assert.equal(unknownTransition.dead_letter_intent?.reason, 'unknown_transition');
  assert.equal(unknownTransition.receipt.receipt_status, 'dead_letter_intended');

  assert.equal(unknownGuard.status, 'blocked');
  assert.equal(unknownGuard.next_state, 'bundle_stage_ready');
  assert.equal(unknownGuard.typed_blocker?.blocker_code, 'unknown_guard_id');
  assert.deepEqual(unknownGuard.receipt.unknown_guard_ids, ['unregistered_guard_from_domain']);
});

test('family transition runner contract keeps generic execution in OPL and domain semantics in the domain agent', () => {
  const contract = readJson('contracts/opl-framework/family-transition-runner-contract.json');
  const packageJson = readJson('package.json');

  assert.equal(contract.contract_kind, 'opl_family_transition_runner_contract.v1');
  assert.equal(contract.runner_model, 'domain_declared_transition_table');
  assert.equal(contract.contract_version, 'family-transition-runner.v1');
  assert.equal(packageJson.exports['./family-transition-runner'], './dist/family-transition-runner.js');

  for (const field of [
    'surface_kind',
    'version',
    'spec_id',
    'target_domain_id',
    'owner',
    'authority_boundary',
    'guards',
    'transitions',
  ]) {
    assert.ok((contract.required_spec_fields as string[]).includes(field));
  }

  for (const field of [
    'transition_id',
    'current_state',
    'event',
    'next_state',
    'owner_route',
  ]) {
    assert.ok((contract.required_transition_fields as string[]).includes(field));
  }

  for (const failClosedCase of [
    'unknown_guard_id',
    'transition_domain_mismatch',
    'unknown_transition',
    'transition_guard_unsatisfied',
    'transition_guard_forbidden',
    'ambiguous_transition',
  ]) {
    assert.ok((contract.fail_closed_cases as string[]).includes(failClosedCase));
  }

  assert.equal(contract.domain_truth_boundary.opl_interprets_domain_quality, false);
  assert.equal(contract.domain_truth_boundary.opl_executes_domain_action, false);
  assert.equal(contract.domain_truth_boundary.opl_writes_domain_truth, false);
  assert.ok((contract.authority_boundary.opl as string[]).includes('matrix runner'));
  assert.ok((contract.authority_boundary.domain_agent as string[]).includes('domain transition table'));
  assert.ok((contract.authority_boundary.domain_agent as string[]).includes('oracle fixtures'));
});

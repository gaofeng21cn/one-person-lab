import assert from 'node:assert/strict';
import test from 'node:test';

import { transitionTaskInputsFromMatrix } from '../../src/family-runtime-domain-intake-parts/transition-task-inputs.ts';

test('transition matrix intake emits family transition task input with authority boundary', () => {
  const transition = {
    surface_kind: 'family_transition_result',
    domain_id: 'redcube-ai',
    transition_id: 'rca-transition-1',
    owner_route: {
      owner: 'redcube-ai',
    },
    payload_ref: 'rca/transition.json',
  };

  const result = transitionTaskInputsFromMatrix('medautoscience', {
    family_transition_matrix_result: {
      surface_kind: 'family_transition_matrix_result',
      spec_id: 'domain-admission',
      results: [
        {
          case_id: 'rca-case',
          result: transition,
        },
      ],
    },
  }, 'transition-matrix-export');

  assert.equal(result.blocked.length, 0);
  assert.equal(result.inputs.length, 1);
  assert.equal(result.inputs[0].domainId, 'redcube');
  assert.equal(result.inputs[0].taskKind, 'family_transition/domain_tick');
  assert.equal(result.inputs[0].dedupeKey, 'domain-admission:rca-case:rca-transition-1');
  assert.equal(result.inputs[0].priority, 60);
  assert.equal(result.inputs[0].source, 'transition-matrix-export');
  assert.deepEqual(result.inputs[0].payload.source_refs, [
    {
      role: 'family_transition_matrix_case',
      ref: 'family_transition_matrix_result:domain-admission:rca-case',
    },
  ]);
  assert.deepEqual(result.inputs[0].payload.authority_boundary, {
    opl_can_write_domain_truth: false,
    opl_executes_domain_action: false,
    opl_authorizes_domain_verdict: false,
    domain_transition_owner: 'redcube-ai',
  });
  assert.equal(result.inputs[0].payload.family_transition, transition);
});

test('transition matrix intake accepts top-level matrix result and default domain owner', () => {
  const result = transitionTaskInputsFromMatrix('medautogrant', {
    surface_kind: 'family_transition_matrix_result',
    spec_id: 'standard-agent',
    results: [
      {
        case_id: 'mag-case',
        result: {
          surface_kind: 'family_transition_result',
          transition_id: 'mag-transition-1',
        },
      },
    ],
  }, 'transition-matrix-export');

  assert.equal(result.blocked.length, 0);
  assert.equal(result.inputs.length, 1);
  assert.equal(result.inputs[0].domainId, 'medautogrant');
  const authorityBoundary = result.inputs[0].payload.authority_boundary as Record<string, unknown>;
  assert.equal(authorityBoundary.domain_transition_owner, 'domain_agent');
});

test('transition matrix intake reports invalid entries and domains', () => {
  const result = transitionTaskInputsFromMatrix('medautoscience', {
    surface_kind: 'family_transition_matrix_result',
    spec_id: 'standard-agent',
    results: [
      'not-an-entry',
      {
        case_id: 'missing-result',
        result: {
          surface_kind: 'family_transition_result',
        },
      },
      {
        case_id: 'unknown-domain',
        result: {
          surface_kind: 'family_transition_result',
          domain_id: 'unknown-domain',
          transition_id: 'transition-1',
        },
      },
    ],
  }, 'transition-matrix-export');

  assert.equal(result.inputs.length, 0);
  assert.deepEqual(result.blocked.map((entry) => entry.reason), [
    'invalid_transition_matrix_entry',
    'invalid_transition_matrix_result',
    'invalid_transition_domain',
  ]);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertQualityAttemptTerminalRouteSelection,
  evaluateStageQualityAttemptRoute,
  sanitizeStageQualityAttemptRouteImpact,
} from '../../src/modules/stagecraft/stage-quality-route-selection.ts';

function attempt(input: {
  role: 'producer' | 'reviewer' | 'repairer' | 're_reviewer';
  decisiveRoles: string[];
  round?: number;
  maxRounds?: number;
}) {
  return {
    stage_id: 'review',
    attempt_role: input.role,
    quality_round_index: input.round ?? 0,
    context_manifest: {
      cross_stage_route_selection: {
        surface_kind: 'opl_stage_run_route_selection_context',
        version: 'stage-run-route-selection-context.v1',
        configured_decisive_attempt_roles: input.decisiveRoles,
        current_attempt_role: input.role,
        declared_stage_ids: ['author', 'review', 'deliver'],
        max_repair_rounds: input.maxRounds ?? 3,
      },
    },
    quality_context: {
      findings: [{
        finding_id: 'f1',
        severity: 'major',
        required: true,
        evidence_refs: ['evidence:f1'],
        repair_expectation: 'Close f1.',
      }],
      repair_map: [{
        finding_id: 'f1',
        repair_status: 'repaired',
        changed_artifact_refs: ['artifact:repaired'],
        repair_evidence_refs: ['diff:f1'],
      }],
    },
  };
}

const routeBackDecision = {
  decision_kind: 'route_back',
  target_stage_id: 'author',
  evidence_refs: ['finding:f1'],
};

test('primary-only producer may select any declared Stage with evidence', () => {
  const evaluation = assertQualityAttemptTerminalRouteSelection({
    attempt: attempt({ role: 'producer', decisiveRoles: ['producer'] }),
    routeImpact: { stage_route_decision: routeBackDecision },
  });
  assert.deepEqual(evaluation.decision, routeBackDecision);
});

test('producer and repairer cannot select terminal routes during formal Review', () => {
  for (const role of ['producer', 'repairer'] as const) {
    assert.throws(() => assertQualityAttemptTerminalRouteSelection({
      attempt: attempt({ role, decisiveRoles: ['reviewer', 're_reviewer'], round: role === 'repairer' ? 1 : 0 }),
      routeImpact: { stage_route_decision: routeBackDecision },
    }), /invalid or non-authoritative cross-Stage route output/);
  }
});

test('reviewer selects a route only when its verdict terminalizes the StageRun', () => {
  const reviewer = attempt({ role: 'reviewer', decisiveRoles: ['reviewer', 're_reviewer'] });
  assert.throws(() => assertQualityAttemptTerminalRouteSelection({
    attempt: reviewer,
    routeImpact: {
      stage_route_decision: routeBackDecision,
      stage_quality_cycle: { outcome: 'repair_required' },
    },
  }), /invalid or non-authoritative cross-Stage route output/);
  assert.doesNotThrow(() => assertQualityAttemptTerminalRouteSelection({
    attempt: reviewer,
    routeImpact: {
      stage_route_decision: routeBackDecision,
      stage_quality_cycle: { outcome: 'pass' },
    },
  }));
});

test('re-reviewer cannot route before closure but may route on closure or budget exhaustion', () => {
  const openRoute = {
    stage_route_decision: routeBackDecision,
    stage_quality_cycle: {
      finding_closures: [{
        finding_id: 'f1',
        status: 'still_open',
        evidence_refs: ['evidence:f1-still-open'],
      }],
      repair_regressions: [],
      critical_new_findings: [],
    },
  };
  assert.throws(() => assertQualityAttemptTerminalRouteSelection({
    attempt: attempt({ role: 're_reviewer', decisiveRoles: ['reviewer', 're_reviewer'], round: 1, maxRounds: 3 }),
    routeImpact: openRoute,
  }), /invalid or non-authoritative cross-Stage route output/);
  assert.doesNotThrow(() => assertQualityAttemptTerminalRouteSelection({
    attempt: attempt({ role: 're_reviewer', decisiveRoles: ['reviewer', 're_reviewer'], round: 3, maxRounds: 3 }),
    routeImpact: openRoute,
  }));
  assert.doesNotThrow(() => assertQualityAttemptTerminalRouteSelection({
    attempt: attempt({ role: 're_reviewer', decisiveRoles: ['reviewer', 're_reviewer'], round: 1, maxRounds: 3 }),
    routeImpact: {
      stage_route_decision: routeBackDecision,
      stage_quality_cycle: {
        finding_closures: [{
          finding_id: 'f1',
          status: 'closed',
          evidence_refs: ['evidence:f1-closed'],
        }],
        repair_regressions: [],
        critical_new_findings: [],
      },
    },
  }));
});

test('non-decisive Attempts may return one evidence-backed recommendation', () => {
  const evaluation = evaluateStageQualityAttemptRoute({
    attempt: attempt({ role: 'repairer', decisiveRoles: ['reviewer', 're_reviewer'], round: 1 }),
    routeImpact: {
      stage_route_recommendation: {
        ...routeBackDecision,
        reason: 'The finding belongs to the authoring Stage.',
      },
    },
  });
  assert.equal(evaluation.decision, null);
  assert.equal(evaluation.recommendation?.target_stage_id, 'author');
});

test('route output without a Framework role or route context is rejected', () => {
  const sanitized = sanitizeStageQualityAttemptRouteImpact({
    attempt: { stage_id: 'review' },
    routeImpact: { stage_route_decision: routeBackDecision },
  });
  assert.equal(sanitized.stage_route_decision, undefined);
  assert.deepEqual(
    (sanitized.stage_route_contract as Record<string, unknown>).rejection_reasons,
    [
      'route_target_is_not_a_declared_stage',
      'attempt_role_is_not_framework_quality_role',
      'missing_stage_run_route_selection_context',
      'stage_run_route_context_attempt_role_mismatch',
      'configured_decisive_attempt_roles_invalid',
      'stage_run_route_context_declared_stage_set_invalid',
    ],
  );
});

test('decision and recommendation in one Attempt are both rejected', () => {
  const producer = attempt({ role: 'producer', decisiveRoles: ['producer'] });
  const evaluation = evaluateStageQualityAttemptRoute({
    attempt: producer,
    routeImpact: {
      stage_route_decision: routeBackDecision,
      stage_route_recommendation: {
        ...routeBackDecision,
        reason: 'Duplicate route output.',
      },
    },
  });
  assert.equal(evaluation.decision, null);
  assert.equal(evaluation.recommendation, null);
  assert.ok(evaluation.decision_rejection_reasons.includes('decision_and_recommendation_are_mutually_exclusive'));
  assert.ok(evaluation.recommendation_rejection_reasons.includes('decision_and_recommendation_are_mutually_exclusive'));
});

test('re-review route decision requires a valid finding-closure packet', () => {
  const reReviewer = attempt({
    role: 're_reviewer',
    decisiveRoles: ['reviewer', 're_reviewer'],
    round: 3,
    maxRounds: 3,
  });
  const evaluation = evaluateStageQualityAttemptRoute({
    attempt: reReviewer,
    routeImpact: {
      stage_route_decision: routeBackDecision,
      stage_quality_cycle: {
        finding_closures: [],
        repair_regressions: [],
        critical_new_findings: [],
      },
    },
  });
  assert.equal(evaluation.decision, null);
  assert.ok(evaluation.decision_rejection_reasons.includes('re_review_closure_contract_invalid'));
});

test('undeclared targets, missing evidence, and legacy fields are non-authoritative', () => {
  const producer = attempt({ role: 'producer', decisiveRoles: ['producer'] });
  const evaluation = evaluateStageQualityAttemptRoute({
    attempt: producer,
    routeImpact: {
      stage_route_decision: {
        decision_kind: 'route_back',
        target_stage_id: 'missing',
        evidence_refs: [],
      },
      next_stage_ref: 'deliver',
    },
  });
  assert.equal(evaluation.decision, null);
  assert.ok(evaluation.decision_rejection_reasons.includes('route_target_is_not_a_declared_stage'));
  assert.ok(evaluation.decision_rejection_reasons.includes('route_selection_requires_evidence_refs'));
  assert.ok(evaluation.decision_rejection_reasons.includes('legacy_terminal_route_fields_are_not_authoritative'));

  const sanitized = sanitizeStageQualityAttemptRouteImpact({
    attempt: producer,
    routeImpact: {
      stage_route_decision: { decision_kind: 'route_back', target_stage_id: 'missing', evidence_refs: [] },
      next_stage_ref: 'deliver',
      domain_progress: 'observed',
    },
  });
  assert.equal(sanitized.stage_route_decision, undefined);
  assert.equal(sanitized.next_stage_ref, undefined);
  assert.equal(sanitized.domain_progress, 'observed');
});

test('complete is the only route decision that omits a target Stage', () => {
  const producer = attempt({ role: 'producer', decisiveRoles: ['producer'] });
  assert.doesNotThrow(() => assertQualityAttemptTerminalRouteSelection({
    attempt: producer,
    routeImpact: {
      stage_route_decision: { decision_kind: 'complete', evidence_refs: ['artifact:final'] },
    },
  }));
  assert.throws(() => assertQualityAttemptTerminalRouteSelection({
    attempt: producer,
    routeImpact: {
      stage_route_decision: { decision_kind: 'complete', target_stage_id: 'deliver', evidence_refs: ['artifact:final'] },
    },
  }), /invalid or non-authoritative cross-Stage route output/);
});

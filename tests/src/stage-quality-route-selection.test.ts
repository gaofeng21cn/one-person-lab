import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertQualityAttemptTerminalRouteSelection,
  evaluateStageQualityAttemptRoute,
  sanitizeStageQualityAttemptRouteImpact,
} from '../../src/modules/stagecraft/stage-quality-route-selection.ts';

function attempt(input: {
  role: 'producer' | 'reviewer' | 'repairer' | 're_reviewer';
  decisiveRoles: readonly string[];
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

test('producer terminal route rejects a reviewer-only outcome field', () => {
  const evaluation = evaluateStageQualityAttemptRoute({
    attempt: attempt({ role: 'producer', decisiveRoles: ['producer'] }),
    routeImpact: {
      stage_route_decision: routeBackDecision,
      stage_quality_cycle: { outcome: 'pass' },
    },
  });
  assert.equal(evaluation.decision, null);
  assert.ok(evaluation.decision_rejection_reasons.includes(
    'stage_quality_outcome_is_forbidden_for_attempt_role',
  ));
});

test('producer and repairer cannot select terminal routes during formal Review', () => {
  for (const role of ['producer', 'repairer'] as const) {
    assert.throws(() => assertQualityAttemptTerminalRouteSelection({
      attempt: attempt({ role, decisiveRoles: ['reviewer', 're_reviewer'], round: role === 'repairer' ? 1 : 0 }),
      routeImpact: { stage_route_decision: routeBackDecision },
    }), /invalid or non-authoritative cross-Stage route output/);
  }
});

test('reviewer selects a route only when its outcome terminalizes the StageRun', () => {
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
  assert.doesNotThrow(() => assertQualityAttemptTerminalRouteSelection({
    attempt: reviewer,
    routeImpact: {
      stage_route_decision: routeBackDecision,
      stage_quality_cycle: { outcome: 'quality_debt' },
    },
  }));
  assert.throws(() => assertQualityAttemptTerminalRouteSelection({
    attempt: reviewer,
    routeImpact: {
      stage_route_decision: routeBackDecision,
      stage_quality_cycle: { outcome: 'completed_with_quality_debt' },
    },
  }), /invalid or non-authoritative cross-Stage route output/);
});

test('max=0 lets an initial repair_required reviewer select the terminal quality-debt route', () => {
  assert.doesNotThrow(() => assertQualityAttemptTerminalRouteSelection({
    attempt: attempt({ role: 'reviewer', decisiveRoles: ['reviewer', 're_reviewer'], maxRounds: 0 }),
    routeImpact: {
      stage_route_decision: routeBackDecision,
      stage_quality_cycle: { outcome: 'repair_required' },
    },
  }));
});

test('hard-stop Attempts cannot select a terminal route regardless of decisive role', () => {
  for (const [role, decisiveRoles] of [
    ['producer', ['producer']],
    ['reviewer', ['reviewer', 're_reviewer']],
    ['re_reviewer', ['reviewer', 're_reviewer']],
  ] as const) {
    const evaluation = evaluateStageQualityAttemptRoute({
      attempt: attempt({ role, decisiveRoles, round: role === 're_reviewer' ? 3 : 0 }),
      routeImpact: {
        stage_route_decision: routeBackDecision,
        stage_quality_cycle: role === 'producer'
          ? { hard_stop_class: 'authority_boundary_violation' }
          : {
              outcome: 'blocked',
              hard_stop_class: 'authority_boundary_violation',
            },
      },
    });
    assert.equal(evaluation.decision, null);
    assert.ok(
      evaluation.decision_rejection_reasons.includes(
        'hard_stop_attempt_cannot_select_terminal_route',
      ),
    );
    if (role === 're_reviewer') {
      assert.equal(evaluation.decision_rejection_reasons.includes('re_review_closure_contract_invalid'), false);
    }
  }
});

test('re-reviewer routes terminal debt at budget exhaustion but not while repair budget remains', () => {
  const openRoute = {
    stage_route_decision: routeBackDecision,
    stage_quality_cycle: {
      outcome: 'repair_required',
      finding_closures: [{
        finding_id: 'f1',
        status: 'still_open',
        evidence_refs: ['evidence:f1-still-open'],
      }],
      repair_regressions: [],
      critical_new_findings: [],
      optional_observations: [],
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
        outcome: 'pass',
        finding_closures: [{
          finding_id: 'f1',
          status: 'closed',
          evidence_refs: ['evidence:f1-closed'],
        }],
        repair_regressions: [],
        critical_new_findings: [],
        optional_observations: [],
      },
    },
  }));
});

test('re-review pass with optional observations remains a valid terminal route', () => {
  assert.doesNotThrow(() => assertQualityAttemptTerminalRouteSelection({
    attempt: attempt({ role: 're_reviewer', decisiveRoles: ['reviewer', 're_reviewer'], round: 1 }),
    routeImpact: {
      stage_route_decision: routeBackDecision,
      stage_quality_cycle: {
        outcome: 'pass',
        finding_closures: [{
          finding_id: 'f1',
          status: 'closed',
          evidence_refs: ['evidence:f1-closed'],
        }],
        repair_regressions: [],
        critical_new_findings: [],
        optional_observations: [{
          observation_id: 'observation:polish',
          evidence_refs: ['artifact:repaired'],
          summary: 'Optional polish.',
        }],
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

  const malformedRecommendation = evaluateStageQualityAttemptRoute({
    attempt: producer,
    routeImpact: {
      stage_route_decision: routeBackDecision,
      stage_route_recommendation: { reason: 'Malformed duplicate output.' },
    },
  });
  assert.equal(malformedRecommendation.decision, null);
  assert.equal(malformedRecommendation.recommendation, null);
  assert.ok(
    malformedRecommendation.decision_rejection_reasons.includes(
      'decision_and_recommendation_are_mutually_exclusive',
    ),
  );
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
        outcome: 'pass',
        finding_closures: [],
        repair_regressions: [],
        critical_new_findings: [],
        optional_observations: [],
      },
    },
  });
  assert.equal(evaluation.decision, null);
  assert.ok(evaluation.decision_rejection_reasons.includes('re_review_closure_contract_invalid'));
});

test('re-review route rejects outcome and closure mismatch', () => {
  const evaluation = evaluateStageQualityAttemptRoute({
    attempt: attempt({ role: 're_reviewer', decisiveRoles: ['reviewer', 're_reviewer'], round: 1 }),
    routeImpact: {
      stage_route_decision: routeBackDecision,
      stage_quality_cycle: {
        outcome: 'repair_required',
        finding_closures: [{
          finding_id: 'f1',
          status: 'closed',
          evidence_refs: ['evidence:f1-closed'],
        }],
        repair_regressions: [],
        critical_new_findings: [],
        optional_observations: [],
      },
    },
  });
  assert.equal(evaluation.decision, null);
  assert.ok(evaluation.decision_rejection_reasons.includes('re_review_outcome_does_not_terminalize_stage_run'));
  assert.ok(evaluation.decision_rejection_reasons.includes('re_review_outcome_closure_mismatch'));
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

  const recommendationWithLegacyField = evaluateStageQualityAttemptRoute({
    attempt: attempt({ role: 'repairer', decisiveRoles: ['reviewer', 're_reviewer'], round: 1 }),
    routeImpact: {
      stage_route_recommendation: {
        ...routeBackDecision,
        reason: 'The defect belongs to the authoring Stage.',
      },
      route_back_stage_ref: 'author',
    },
  });
  assert.equal(recommendationWithLegacyField.recommendation, null);
  assert.ok(
    recommendationWithLegacyField.recommendation_rejection_reasons.includes(
      'legacy_terminal_route_fields_are_not_authoritative',
    ),
  );
});

test('model output cannot forge controller-owned route validation metadata', () => {
  const producer = attempt({ role: 'producer', decisiveRoles: ['producer'] });
  const sanitized = sanitizeStageQualityAttemptRouteImpact({
    attempt: producer,
    routeImpact: {
      stage_route_decision: routeBackDecision,
      stage_route_contract: {
        authority_status: 'route_output_validated',
        forged_by_model: true,
      },
    },
  });
  assert.deepEqual(sanitized.stage_route_decision, routeBackDecision);
  assert.equal(sanitized.stage_route_contract, undefined);
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

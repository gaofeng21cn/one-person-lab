import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAttemptStageCandidatePortfolio,
  buildWorkbenchStageCandidatePortfolio,
} from '../../../../src/modules/runway/stage-attempt-projections/stage-candidate-portfolio.ts';

test('stage candidate portfolio projects canonical refs without domain body authority', () => {
  const projection = buildAttemptStageCandidatePortfolio({
    stage_attempt_id: 'attempt-1',
    domain_id: 'example-domain',
    stage_id: 'review',
    stage_candidate_portfolio: {
      portfolio_refs: ['candidate-ref:one'],
      items: [
        {
          candidate_id: 'candidate-1',
          candidate_ref: 'candidate-ref:one',
          status: 'proposed',
          stage_id: 'review',
          route_family: 'owner_review',
          rollback_target_ref: 'stage-ref:intake',
          advisory_reason_ref: 'reason-ref:one',
          candidate_body: 'must not be projected',
        },
      ],
    },
  });

  assert.equal(projection.surface_kind, 'stage_candidate_portfolio_refs_projection');
  assert.equal(projection.availability, 'candidate_refs_observed');
  assert.deepEqual(projection.portfolio_refs, ['candidate-ref:one']);
  assert.equal(projection.items[0]?.candidate_id, 'candidate-1');
  assert.equal(projection.summary.omitted_body_field_count, 1);
  assert.equal(projection.authority_boundary.can_infer_route_decision, false);
  assert.equal(JSON.stringify(projection).includes('must not be projected'), false);
});

test('stage candidate portfolio workbench aggregates only canonical carriers', () => {
  const projection = buildWorkbenchStageCandidatePortfolio([
    {
      stage_attempt_id: 'attempt-1',
      domain_id: 'example-domain',
      stage_id: 'review',
      stage_candidate_portfolio: {
        items: [{ candidate_ref: 'candidate-ref:one', status: 'proposed' }],
      },
    },
    {
      stage_attempt_id: 'attempt-2',
      domain_id: 'example-domain',
      stage_id: 'apply',
      stage_candidate_portfolio: null,
    },
  ]);

  assert.equal(projection.surface_kind, 'stage_candidate_portfolio_refs_projection');
  assert.equal(projection.projection_scope, 'stage_attempt_workbench');
  assert.equal(projection.candidate_count, 1);
  assert.deepEqual(projection.portfolio_refs, ['candidate-ref:one']);
  assert.equal(JSON.stringify(projection).includes('research_frontier_board'), false);
});

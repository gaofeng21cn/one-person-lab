import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFamilyStallLineage,
} from '../../src/modules/runway/family-runtime-effective-current-context.ts';

test('family stall lineage does not treat platform repair or typed blockers as deliverable progress', () => {
  const lineage = buildFamilyStallLineage([
    {
      stage_attempt_id: 'sat-platform-repair',
      created_at: '2026-05-30T00:00:00.000Z',
      updated_at: '2026-05-30T00:00:00.000Z',
      domain_id: 'med-autoscience',
      stage_id: 'publication_review',
      artifact_refs: ['artifact:projection-refresh'],
      route_impact: {
        typed_blocker_refs: ['typed-blocker:reviewer-currentness'],
        typed_blockers: [{
          blocker_family: 'reviewer_currentness',
          required_owner: 'med-autoscience',
        }],
        progress_delta_classification: 'platform_repair',
        deliverable_progress_delta: {
          count: 0,
          refs: [],
        },
        platform_repair_delta: {
          count: 1,
          refs: ['repair:projection-refresh'],
        },
      },
    },
    {
      stage_attempt_id: 'sat-typed-blocker',
      created_at: '2026-05-30T00:10:00.000Z',
      updated_at: '2026-05-30T00:10:00.000Z',
      domain_id: 'med-autoscience',
      stage_id: 'publication_review',
      artifact_refs: ['artifact:typed-blocker-packet'],
      route_impact: {
        typed_blocker_refs: ['typed-blocker:reviewer-currentness'],
        typed_blockers: [{
          blocker_family: 'reviewer_currentness',
          required_owner: 'med-autoscience',
        }],
        progress_delta_classification: 'typed_blocker',
        deliverable_progress_delta: {
          count: 0,
          refs: [],
        },
      },
    },
  ]);

  const [entry] = lineage.lineages;
  assert.equal(entry.blocker_family, 'reviewer_currentness');
  assert.equal(entry.repeat_count, 2);
  assert.equal(entry.last_deliverable_delta, 'none');
  assert.equal(
    entry.next_forced_delta,
    'domain_deliverable_or_owner_receipt_delta_required',
  );
});

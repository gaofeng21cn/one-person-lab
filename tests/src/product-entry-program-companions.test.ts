import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDetailedReadiness,
  buildProductEntryPreflight,
  buildProgramCheck,
  buildWorkflowCoverageItem,
} from '../../src/product-entry-program-companions.ts';

test('product entry program companions normalize preflight and detailed readiness', () => {
  const preflight = buildProductEntryPreflight({
    summary: 'Current preflight passed.',
    recommended_check_command: 'redcube workspace doctor --workspace-root /tmp/demo',
    recommended_start_command: 'redcube product frontdesk --workspace-root /tmp/demo',
    checks: [
      buildProgramCheck({
        check_id: 'workspace_ready',
        title: 'Workspace Ready',
        status: 'pass',
        blocking: true,
        summary: 'workspace ready',
        command: 'redcube workspace doctor --workspace-root /tmp/demo',
      }),
      buildProgramCheck({
        check_id: 'runtime_ready',
        title: 'Runtime Ready',
        status: 'warn',
        blocking: false,
        summary: 'runtime attention',
        command: 'redcube workspace doctor --workspace-root /tmp/demo',
      }),
    ],
  });

  assert.equal(preflight.surface_kind, 'product_entry_preflight');
  assert.equal(preflight.ready_to_try_now, true);
  assert.deepEqual(preflight.blocking_check_ids, []);

  const blocked = buildProductEntryPreflight({
    summary: 'Current preflight is blocked.',
    recommended_check_command: 'redcube workspace doctor --workspace-root /tmp/demo',
    recommended_start_command: 'redcube product frontdesk --workspace-root /tmp/demo',
    checks: [
      buildProgramCheck({
        check_id: 'workspace_ready',
        title: 'Workspace Ready',
        status: 'fail',
        blocking: true,
        summary: 'workspace missing',
        command: 'redcube workspace doctor --workspace-root /tmp/demo',
      }),
    ],
  });
  assert.equal(blocked.ready_to_try_now, false);
  assert.deepEqual(blocked.blocking_check_ids, ['workspace_ready']);

  const readiness = buildDetailedReadiness({
    surface_kind: 'grant_authoring_readiness',
    verdict: 'agent_assisted_ready_not_product_grade',
    usable_now: true,
    good_to_use_now: false,
    fully_automatic: false,
    user_experience_level: 'agent_assisted_cli',
    summary: 'Current workflow is usable with operator guidance.',
    recommended_start_surface: 'product_frontdesk',
    recommended_start_command: 'redcube product frontdesk',
    recommended_loop_surface: 'grant_user_loop',
    recommended_loop_command: 'redcube product invoke',
    workflow_coverage: [
      buildWorkflowCoverageItem({
        step_id: 'collect_materials',
        manual_flow_label: 'Collect materials',
        coverage_status: 'landed_route',
        current_surface: 'workspace_cockpit',
        remaining_gap: 'Need real user materials.',
      }),
    ],
    blocking_gaps: ['Managed web shell pending.'],
  });

  assert.equal(readiness.surface_kind, 'grant_authoring_readiness');
  assert.equal(readiness.workflow_coverage[0].step_id, 'collect_materials');
  assert.deepEqual(readiness.blocking_gaps, ['Managed web shell pending.']);
});

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildProductEntryOverview,
  buildProductEntryQuickstart,
  buildProductEntryReadiness,
  buildProductEntryResumeSurface,
  collectFamilyHumanGateIds,
} from '../../src/product-entry-companions.ts';

test('product entry companion helpers build canonical shared payloads', () => {
  const familyOrchestration = {
    human_gates: [
      { gate_id: 'alpha_gate', title: 'Alpha gate' },
      { gate_id: 'beta_gate', title: 'Beta gate' },
    ],
    resume_contract: {
      surface_kind: 'product_entry_session',
      session_locator_field: 'entry_session_contract.entry_session_id',
      checkpoint_locator_field: 'continuation_snapshot.latest_managed_run_id',
    },
  };

  const humanGateIds = collectFamilyHumanGateIds(familyOrchestration);
  assert.deepEqual(humanGateIds, ['alpha_gate', 'beta_gate']);

  const resumeSurface = buildProductEntryResumeSurface(
    'redcube product session --entry-session-id <entry-session-id>',
    familyOrchestration.resume_contract,
  );
  assert.equal(resumeSurface.surface_kind, 'product_entry_session');
  assert.equal(resumeSurface.checkpoint_locator_field, 'continuation_snapshot.latest_managed_run_id');

  const quickstart = buildProductEntryQuickstart({
    summary: 'Open the frontdesk first.',
    recommended_step_id: 'open_frontdesk',
    steps: [
      {
        step_id: 'open_frontdesk',
        title: 'Open frontdesk',
        command: 'redcube product frontdesk',
        surface_kind: 'product_frontdesk',
        summary: 'Open the direct frontdoor.',
        requires: [],
      },
    ],
    resume_contract: familyOrchestration.resume_contract,
    human_gate_ids: humanGateIds,
  });
  assert.equal(quickstart.surface_kind, 'product_entry_quickstart');
  assert.deepEqual(quickstart.human_gate_ids, ['alpha_gate', 'beta_gate']);

  const overview = buildProductEntryOverview({
    summary: 'Current product-entry surface is usable.',
    frontdesk_command: 'redcube product frontdesk',
    recommended_command: 'redcube product invoke',
    operator_loop_command: 'redcube product invoke',
    progress_surface: {
      surface_kind: 'product_entry_session',
      command: 'redcube product session --entry-session-id <entry-session-id>',
      step_id: 'inspect_current_progress',
    },
    resume_surface: resumeSurface,
    recommended_step_id: quickstart.recommended_step_id,
    next_focus: ['Keep the same operator loop stable.'],
    remaining_gaps_count: 1,
    human_gate_ids: humanGateIds,
  });
  assert.equal(overview.resume_surface.session_locator_field, 'entry_session_contract.entry_session_id');
  assert.deepEqual(overview.next_focus, ['Keep the same operator loop stable.']);

  const readiness = buildProductEntryReadiness({
    verdict: 'service_surface_ready_not_managed_product',
    usable_now: true,
    good_to_use_now: false,
    fully_automatic: false,
    summary: 'Usable now with operator guidance.',
    recommended_start_surface: 'product_frontdesk',
    recommended_start_command: 'redcube product frontdesk',
    recommended_loop_surface: 'product_entry',
    recommended_loop_command: 'redcube product invoke',
    blocking_gaps: ['Managed web shell is still pending.'],
  });
  assert.equal(readiness.verdict, 'service_surface_ready_not_managed_product');
  assert.deepEqual(readiness.blocking_gaps, ['Managed web shell is still pending.']);
});

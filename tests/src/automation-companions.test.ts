import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAutomationCatalog,
  buildAutomationDescriptor,
} from '../../src/automation-companions.ts';

test('automation companion helpers normalize shared automation descriptors', () => {
  const masAutomation = buildAutomationDescriptor({
    automation_id: 'mas_runtime_supervision',
    title: 'MAS runtime supervision',
    owner: 'medautoscience',
    trigger_kind: 'interval',
    target_surface_kind: 'runtime_watch',
    summary: 'Refresh study runtime supervision on a managed interval.',
    readiness_status: 'automation_ready',
    gate_policy: 'publication_gated',
    output_expectation: ['refresh runtime watch', 'record controller intervention'],
    target_command: 'watch-runtime --interval-seconds 300 --max-ticks 1',
  });
  assert.equal(masAutomation.automation_id, 'mas_runtime_supervision');

  const rcaAutomation = buildAutomationDescriptor({
    automation_id: 'rca_autopilot_continuation',
    title: 'RCA autopilot continuation',
    owner: 'redcube_ai',
    trigger_kind: 'continuation_board',
    target_surface_kind: 'product_entry_session',
    summary: 'Continue the active deliverable loop through the tracked autopilot board.',
    readiness_status: 'tracked_follow_on',
    gate_policy: 'operator_review_gated',
    output_expectation: ['continue same entry session', 'preserve publication review truth'],
  });

  const catalog = buildAutomationCatalog({
    summary: 'Family automation surfaces exposed through the current domain entry repos.',
    automations: [masAutomation, rcaAutomation],
    readiness_summary: 'Some automations are landed, some remain tracked follow-on surfaces.',
  });

  assert.equal(catalog.surface_kind, 'automation');
  assert.equal(catalog.automations.length, 2);
  assert.equal(catalog.readiness_summary, 'Some automations are landed, some remain tracked follow-on surfaces.');
});

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildProductFrontdesk,
  buildProductEntryOverview,
  buildProductEntryQuickstart,
  buildProductEntryReadiness,
  buildProductEntryResumeSurface,
  buildProductEntryStart,
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

  const startWithoutResumeCommand = buildProductEntryStart({
    summary: 'Open the frontdesk first, then choose the durable continuation mode.',
    recommended_mode_id: 'open_frontdesk',
    modes: [
      {
        mode_id: 'open_frontdesk',
        title: 'Open frontdesk',
        command: 'redcube product frontdesk',
        surface_kind: 'product_frontdesk',
        summary: 'Open the direct frontdoor.',
        requires: [],
      },
      {
        mode_id: 'continue_loop',
        title: 'Continue loop',
        command: 'redcube product invoke --entry-session-id <entry-session-id>',
        surface_kind: 'product_entry',
        summary: 'Continue the current loop.',
        requires: ['entry_session_id'],
      },
    ],
    resume_surface: familyOrchestration.resume_contract,
    human_gate_ids: humanGateIds,
  });
  assert.equal(startWithoutResumeCommand.surface_kind, 'product_entry_start');
  assert.equal(startWithoutResumeCommand.resume_surface.surface_kind, 'product_entry_session');
  assert.equal(startWithoutResumeCommand.resume_surface.session_locator_field, 'entry_session_contract.entry_session_id');
  assert.equal('command' in startWithoutResumeCommand.resume_surface, false);

  const startWithResumeCommand = buildProductEntryStart({
    summary: 'Open the frontdesk first, then resume the same session.',
    recommended_mode_id: 'open_frontdesk',
    modes: startWithoutResumeCommand.modes,
    resume_surface: resumeSurface,
    human_gate_ids: humanGateIds,
  });
  assert.equal(startWithResumeCommand.resume_surface.command, 'redcube product session --entry-session-id <entry-session-id>');
  assert.equal(startWithResumeCommand.resume_surface.checkpoint_locator_field, 'continuation_snapshot.latest_managed_run_id');

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

  const frontdesk = buildProductFrontdesk({
    recommended_action: 'inspect_or_start_product_entry',
    target_domain_id: 'redcube_ai',
    workspace_locator: {
      workspace_surface_kind: 'redcube_workspace',
      workspace_root: '/tmp/redcube-workspace',
    },
    runtime: {
      runtime_owner: 'upstream_hermes_agent',
      session_store_root: '/tmp/runtime-state/product-entry-sessions',
    },
    product_entry_status: {
      summary: 'The direct product-entry surface is usable now.',
      next_focus: ['Keep the same session contract stable.'],
      remaining_gaps_count: 1,
    },
    frontdesk_surface: {
      shell_key: 'frontdesk',
      command: 'redcube product frontdesk',
      surface_kind: 'product_frontdesk',
      summary: 'Open the direct frontdesk.',
    },
    operator_loop_surface: {
      shell_key: 'direct',
      command: 'redcube product invoke',
      surface_kind: 'product_entry',
      summary: 'Continue the same direct loop.',
    },
    operator_loop_actions: {
      continue_session: {
        command: 'redcube product invoke --entry-session-id <entry-session-id>',
        surface_kind: 'product_entry',
        summary: 'Continue the same session.',
        requires: ['entry_session_id'],
      },
    },
    product_entry_start: startWithResumeCommand,
    product_entry_overview: overview,
    product_entry_preflight: {
      surface_kind: 'product_entry_preflight',
      summary: 'Current preflight is green.',
      ready_to_try_now: true,
      recommended_check_command: 'redcube product preflight',
      recommended_start_command: 'redcube product frontdesk',
      blocking_check_ids: [],
      checks: [],
    },
    product_entry_readiness: readiness,
    product_entry_quickstart: quickstart,
    family_orchestration: familyOrchestration,
    product_entry_manifest: {
      surface_kind: 'product_entry_manifest',
      target_domain_id: 'redcube_ai',
    },
    entry_surfaces: {
      frontdesk: {
        command: 'redcube product frontdesk',
      },
      session: {
        command: 'redcube product session --entry-session-id <entry-session-id>',
      },
    },
    summary: {
      frontdesk_command: 'redcube product frontdesk',
      recommended_command: 'redcube product invoke',
      operator_loop_command: 'redcube product invoke',
    },
    notes: ['Shared frontdesk core is active.'],
    extra_payload: {
      ok: true,
      schema_ref: 'contracts/schemas/v1/product-frontdesk.schema.json',
    },
  }) as {
    surface_kind: string;
    ok: boolean;
    schema_ref: string;
    product_entry_start: { recommended_mode_id: string };
  };
  assert.equal(frontdesk.surface_kind, 'product_frontdesk');
  assert.equal(frontdesk.ok, true);
  assert.equal(frontdesk.schema_ref, 'contracts/schemas/v1/product-frontdesk.schema.json');
  assert.equal(frontdesk.product_entry_start.recommended_mode_id, 'open_frontdesk');
});

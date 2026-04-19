import test from 'node:test';
import assert from 'node:assert/strict';

import type {
  FamilyProductEntryManifestSurface,
  FamilyProductFrontdeskSurface,
} from '../../src/product-entry-companions.ts';
import {
  buildFamilyProductFrontdesk,
  buildFamilyProductEntryManifest,
  buildProductFrontdesk,
  buildProductEntryOverview,
  buildProductEntryQuickstart,
  buildProductEntryReadiness,
  buildProductEntryResumeSurface,
  buildProductEntryStart,
  collectFamilyHumanGateIds,
  validateFamilyProductFrontdesk,
  validateFamilyProductEntryManifest,
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
  }) as FamilyProductFrontdeskSurface & {
    ok: boolean;
    schema_ref: string;
  };
  assert.equal(frontdesk.surface_kind, 'product_frontdesk');
  assert.equal(frontdesk.ok, true);
  assert.equal(frontdesk.schema_ref, 'contracts/schemas/v1/product-frontdesk.schema.json');
  const productEntryStart = frontdesk.product_entry_start as { recommended_mode_id: string };
  assert.equal(productEntryStart.recommended_mode_id, 'open_frontdesk');

  const manifest = buildFamilyProductEntryManifest({
    manifest_kind: 'redcube_product_entry_manifest',
    target_domain_id: 'redcube_ai',
    formal_entry: {
      default: 'CLI',
      supported_protocols: ['MCP'],
      internal_surface: 'gateway',
    },
    workspace_locator: {
      workspace_surface_kind: 'redcube_workspace',
      workspace_root: '/tmp/redcube-workspace',
    },
    runtime: {
      runtime_owner: 'upstream_hermes_agent',
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
    recommended_shell: 'direct',
    recommended_command: 'redcube product invoke',
    product_entry_shell: {
      frontdesk: {
        command: 'redcube product frontdesk',
        surface_kind: 'product_frontdesk',
      },
    },
    shared_handoff: {
      opl_return_surface: {
        surface_kind: 'product_entry',
        target_domain_id: 'redcube_ai',
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
    runtime_inventory: {
      surface_kind: 'runtime_inventory',
      summary: 'Runtime inventory is shared.',
    },
    task_lifecycle: {
      surface_kind: 'task_lifecycle',
      summary: 'Task lifecycle is shared.',
    },
    skill_catalog: {
      surface_kind: 'skill_catalog',
      summary: 'Skill catalog is shared.',
    },
    automation: {
      surface_kind: 'automation',
      summary: 'Automation is shared.',
      automations: [
        {
          surface_kind: 'automation_descriptor',
          automation_id: 'redcube_autopilot',
        },
      ],
    },
    remaining_gaps: ['Managed web shell is still pending.'],
    notes: ['Shared manifest shell is active.'],
    extra_payload: {
      recommended_action: 'invoke_product_entry',
      current_truth: {
        product_entry_contract: 'contracts/runtime-program/redcube-product-entry-mvp.json',
      },
    },
  }) as FamilyProductEntryManifestSurface & {
    recommended_action: string;
  };
  assert.equal(manifest.surface_kind, 'product_entry_manifest');
  assert.equal(manifest.manifest_version, 2);
  assert.equal(manifest.recommended_action, 'invoke_product_entry');
  assert.equal(manifest.product_entry_start.recommended_mode_id, 'open_frontdesk');

  assert.throws(
    () =>
      buildFamilyProductEntryManifest({
        manifest_kind: 'redcube_product_entry_manifest',
        target_domain_id: 'redcube_ai',
        formal_entry: {
          default: 'CLI',
          supported_protocols: ['MCP'],
        },
        workspace_locator: {
          workspace_surface_kind: 'redcube_workspace',
          workspace_root: '/tmp/redcube-workspace',
        },
        product_entry_shell: {
          frontdesk: {
            command: 'redcube product frontdesk',
          },
        },
        shared_handoff: {
          opl_return_surface: {
            surface_kind: 'product_entry',
          },
        },
        product_entry_start: startWithResumeCommand,
        family_orchestration: familyOrchestration,
        extra_payload: {
          target_domain_id: 'override',
        },
      }),
    /extra_payload 不允许覆盖核心字段/,
  );
});

test('family product frontdesk builder projects manifest core into canonical frontdesk payload', () => {
  const familyOrchestration = {
    human_gates: [{ gate_id: 'alpha_gate', title: 'Alpha gate' }],
    resume_contract: {
      surface_kind: 'product_entry_session',
      session_locator_field: 'entry_session_contract.entry_session_id',
      checkpoint_locator_field: 'continuation_snapshot.latest_managed_run_id',
    },
  };

  const start = buildProductEntryStart({
    summary: 'Open the frontdesk first.',
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
    ],
    resume_surface: familyOrchestration.resume_contract,
    human_gate_ids: ['alpha_gate'],
  });
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
    human_gate_ids: ['alpha_gate'],
  });
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
    resume_surface: {
      command: 'redcube product session --entry-session-id <entry-session-id>',
      ...familyOrchestration.resume_contract,
    },
    recommended_step_id: 'open_frontdesk',
    next_focus: ['Keep the same operator loop stable.'],
    remaining_gaps_count: 1,
    human_gate_ids: ['alpha_gate'],
  });
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
    blocking_gaps: ['Managed product shell still pending.'],
  });
  const manifest = buildFamilyProductEntryManifest({
    manifest_kind: 'redcube_product_entry_manifest',
    target_domain_id: 'redcube_ai',
    formal_entry: {
      default: 'CLI',
      supported_protocols: ['MCP'],
      internal_surface: 'gateway',
    },
    workspace_locator: {
      workspace_surface_kind: 'redcube_workspace',
      workspace_root: '/tmp/redcube-workspace',
    },
    runtime: {
      runtime_owner: 'upstream_hermes_agent',
      runtime_state_root: '/tmp/redcube-runtime',
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
        command: 'redcube product session --entry-session-id <entry-session-id>',
        surface_kind: 'product_entry_session',
        summary: 'Continue the same session.',
        requires: ['entry_session_id'],
      },
    },
    recommended_shell: 'direct',
    recommended_command: 'redcube product invoke',
    product_entry_shell: {
      frontdesk: {
        command: 'redcube product frontdesk',
        surface_kind: 'product_frontdesk',
      },
      direct: {
        command: 'redcube product invoke',
        surface_kind: 'product_entry',
      },
      session: {
        command: 'redcube product session --entry-session-id <entry-session-id>',
        surface_kind: 'product_entry_session',
      },
    },
    shared_handoff: {
      opl_return_surface: {
        surface_kind: 'product_entry',
        target_domain_id: 'redcube_ai',
      },
    },
    product_entry_start: start,
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
    schema_ref: 'contracts/schemas/v1/product-entry-manifest.schema.json',
    domain_entry_contract: {
      entry_adapter: 'RedCubeDomainEntry',
      service_safe_surface_kind: 'redcube_service_safe_domain_entry',
      product_entry_builder_command: 'redcube product invoke',
      supported_commands: ['redcube product frontdesk', 'redcube product invoke'],
      command_contracts: [
        {
          command: 'redcube product frontdesk',
          required_fields: [],
          optional_fields: [],
        },
        {
          command: 'redcube product invoke',
          required_fields: ['entry_session_id'],
          optional_fields: ['overlay'],
        },
      ],
    },
    gateway_interaction_contract: {
      surface_kind: 'gateway_interaction_contract',
      frontdoor_owner: 'opl_gateway_or_domain_gui',
      user_interaction_mode: 'natural_language_frontdoor',
      user_commands_required: false,
      command_surfaces_for_agent_consumption_only: true,
      shared_downstream_entry: 'RedCubeDomainEntry',
      shared_handoff_envelope: ['entry_session_contract'],
    },
  });

  const manifestPayload = manifest as FamilyProductEntryManifestSurface & {
    product_entry_shell: {
      direct: Record<string, unknown>;
      session: Record<string, unknown>;
    };
  };

  const frontdesk = buildFamilyProductFrontdesk({
    recommended_action: 'inspect_or_start_product_entry',
    product_entry_manifest: manifestPayload,
    entry_surfaces: {
      direct: manifestPayload.product_entry_shell.direct,
      session: manifestPayload.product_entry_shell.session,
    },
    notes: ['Thin frontdesk adapter is active.'],
    schema_ref: 'contracts/schemas/v1/product-frontdesk.schema.json',
    extra_payload: {
      ok: true,
    },
  }) as FamilyProductFrontdeskSurface & {
    ok: boolean;
  };

  assert.equal(frontdesk.surface_kind, 'product_frontdesk');
  assert.equal(frontdesk.ok, true);
  assert.equal(frontdesk.target_domain_id, 'redcube_ai');
  assert.equal(frontdesk.summary.frontdesk_command, 'redcube product frontdesk');
  assert.equal(frontdesk.summary.recommended_command, 'redcube product invoke');
  assert.equal(frontdesk.summary.operator_loop_command, 'redcube product invoke');
  assert.equal(manifest.schema_ref, 'contracts/schemas/v1/product-entry-manifest.schema.json');
  assert.equal(manifest.domain_entry_contract?.entry_adapter, 'RedCubeDomainEntry');
  assert.equal(manifest.gateway_interaction_contract?.frontdoor_owner, 'opl_gateway_or_domain_gui');
  assert.equal(frontdesk.schema_ref, 'contracts/schemas/v1/product-frontdesk.schema.json');
  assert.equal(frontdesk.domain_entry_contract?.entry_adapter, 'RedCubeDomainEntry');
  assert.equal(frontdesk.gateway_interaction_contract?.shared_downstream_entry, 'RedCubeDomainEntry');
});

test('product entry companion validators normalize shared family payloads', () => {
  const manifest = {
    surface_kind: 'product_entry_manifest',
    manifest_version: 2,
    manifest_kind: 'redcube_product_entry_manifest',
    target_domain_id: 'redcube_ai',
    formal_entry: {
      default: 'CLI',
      supported_protocols: ['MCP'],
      internal_surface: 'gateway',
    },
    workspace_locator: {
      workspace_surface_kind: 'redcube_workspace',
      workspace_root: '/tmp/redcube-workspace',
    },
    product_entry_shell: {
      frontdesk: {
        command: 'redcube product frontdesk',
        surface_kind: 'product_frontdesk',
      },
    },
    shared_handoff: {
      opl_return_surface: {
        surface_kind: 'product_entry',
      },
    },
    product_entry_start: {
      surface_kind: 'product_entry_start',
      summary: 'Open the frontdesk first.',
      recommended_mode_id: 'open_frontdesk',
      modes: [
        {
          mode_id: 'open_frontdesk',
          title: 'Open frontdesk',
          command: 'redcube product frontdesk',
          surface_kind: 'product_frontdesk',
          summary: 'Open the direct frontdesk.',
          requires: [],
        },
      ],
      resume_surface: {
        surface_kind: 'product_entry_session',
        command: 'redcube product session --entry-session-id <entry-session-id>',
        session_locator_field: 'entry_session_contract.entry_session_id',
      },
      human_gate_ids: ['alpha_gate'],
    },
    family_orchestration: {
      human_gates: [{ gate_id: 'alpha_gate' }],
      resume_contract: {
        surface_kind: 'product_entry_session',
        session_locator_field: 'entry_session_contract.entry_session_id',
      },
    },
    schema_ref: 'contracts/schemas/v1/product-entry-manifest.schema.json',
    domain_entry_contract: {
      entry_adapter: 'RedCubeDomainEntry',
      service_safe_surface_kind: 'domain_entry',
      product_entry_builder_command: 'redcube product entry',
      supported_commands: ['product-frontdesk'],
      command_contracts: [
        {
          command: 'product-frontdesk',
          required_fields: [],
          optional_fields: [],
        },
      ],
    },
    gateway_interaction_contract: {
      surface_kind: 'gateway_interaction_contract',
      frontdoor_owner: 'opl_gateway_or_domain_gui',
      user_interaction_mode: 'natural_language_frontdoor',
      user_commands_required: false,
      command_surfaces_for_agent_consumption_only: true,
      shared_downstream_entry: 'redcube_product_entry',
      shared_handoff_envelope: ['entry_session_contract'],
    },
    runtime_inventory: {
      surface_kind: 'runtime_inventory',
    },
    task_lifecycle: {
      surface_kind: 'task_lifecycle',
    },
    skill_catalog: {
      surface_kind: 'skill_catalog',
    },
    automation: {
      surface_kind: 'automation',
    },
    product_entry_overview: {
      surface_kind: 'product_entry_overview',
      summary: 'Current product-entry surface is usable.',
      frontdesk_command: 'redcube product frontdesk',
      recommended_command: 'redcube product invoke',
      operator_loop_command: 'redcube product invoke',
      progress_surface: {
        surface_kind: 'product_entry_session',
        command: 'redcube product session --entry-session-id <entry-session-id>',
      },
      resume_surface: {
        surface_kind: 'product_entry_session',
        command: 'redcube product session --entry-session-id <entry-session-id>',
        session_locator_field: 'entry_session_contract.entry_session_id',
      },
      recommended_step_id: 'open_frontdesk',
      next_focus: ['Keep the direct loop stable.'],
      remaining_gaps_count: 1,
      human_gate_ids: ['alpha_gate'],
    },
    product_entry_preflight: {
      surface_kind: 'product_entry_preflight',
      summary: 'Current preflight is green.',
      ready_to_try_now: true,
      recommended_check_command: 'redcube product preflight',
      recommended_start_command: 'redcube product frontdesk',
      blocking_check_ids: [],
      checks: [],
    },
    product_entry_readiness: {
      surface_kind: 'product_entry_readiness',
      verdict: 'service_surface_ready_not_managed_product',
      usable_now: true,
      good_to_use_now: false,
      fully_automatic: false,
      summary: 'Usable now with operator guidance.',
      recommended_start_surface: 'product_frontdesk',
      recommended_start_command: 'redcube product frontdesk',
      recommended_loop_surface: 'product_entry',
      recommended_loop_command: 'redcube product invoke',
      blocking_gaps: ['Managed product shell still pending.'],
    },
    product_entry_quickstart: {
      surface_kind: 'product_entry_quickstart',
      recommended_step_id: 'open_frontdesk',
      summary: 'Open the frontdesk first.',
      steps: [
        {
          step_id: 'open_frontdesk',
          title: 'Open frontdesk',
          command: 'redcube product frontdesk',
          surface_kind: 'product_frontdesk',
          summary: 'Open the direct frontdesk.',
          requires: [],
        },
      ],
      resume_contract: {
        surface_kind: 'product_entry_session',
        session_locator_field: 'entry_session_contract.entry_session_id',
      },
      human_gate_ids: ['alpha_gate'],
    },
  };

  const validatedManifest = validateFamilyProductEntryManifest(manifest, {
    requireContractBundle: true,
    requireRuntimeCompanions: true,
  });
  assert.equal(validatedManifest.surface_kind, 'product_entry_manifest');
  assert.equal(validatedManifest.product_entry_start.resume_surface.surface_kind, 'product_entry_session');
  assert.equal(validatedManifest.domain_entry_contract?.entry_adapter, 'RedCubeDomainEntry');
  assert.equal(validatedManifest.runtime_inventory?.surface_kind, 'runtime_inventory');

  const frontdesk = {
    surface_kind: 'product_frontdesk',
    recommended_action: 'inspect_or_start_product_entry',
    target_domain_id: 'redcube_ai',
    workspace_locator: {
      workspace_surface_kind: 'redcube_workspace',
      workspace_root: '/tmp/redcube-workspace',
    },
    runtime: {
      runtime_owner: 'upstream_hermes_agent',
    },
    product_entry_status: {
      summary: 'Usable now.',
      next_focus: ['Keep the same session contract stable.'],
      remaining_gaps_count: 1,
    },
    frontdesk_surface: {
      surface_kind: 'product_frontdesk',
      command: 'redcube product frontdesk',
    },
    operator_loop_surface: {
      surface_kind: 'product_entry',
      command: 'redcube product invoke',
    },
    operator_loop_actions: {},
    product_entry_start: manifest.product_entry_start,
    product_entry_overview: manifest.product_entry_overview,
    product_entry_preflight: manifest.product_entry_preflight,
    product_entry_readiness: manifest.product_entry_readiness,
    product_entry_quickstart: manifest.product_entry_quickstart,
    family_orchestration: manifest.family_orchestration,
    product_entry_manifest: manifest,
    entry_surfaces: {},
    summary: {
      frontdesk_command: 'redcube product frontdesk',
      recommended_command: 'redcube product invoke',
      operator_loop_command: 'redcube product invoke',
    },
    notes: ['Thin frontdesk adapter is active.'],
    schema_ref: 'contracts/schemas/v1/product-frontdesk.schema.json',
    domain_entry_contract: manifest.domain_entry_contract,
    gateway_interaction_contract: manifest.gateway_interaction_contract,
  };
  const validatedFrontdesk = validateFamilyProductFrontdesk(frontdesk, {
    requireContractBundle: true,
  });
  assert.equal(validatedFrontdesk.surface_kind, 'product_frontdesk');
  assert.equal(validatedFrontdesk.product_entry_manifest.surface_kind, 'product_entry_manifest');
  assert.equal(validatedFrontdesk.gateway_interaction_contract?.frontdoor_owner, 'opl_gateway_or_domain_gui');
});

test('product entry companion validators fail closed on missing required shared fields', () => {
  const manifest = {
    surface_kind: 'product_entry_manifest',
    manifest_version: 2,
    manifest_kind: 'redcube_product_entry_manifest',
    target_domain_id: 'redcube_ai',
    formal_entry: {
      default: 'CLI',
      supported_protocols: ['MCP'],
      internal_surface: 'gateway',
    },
    workspace_locator: {
      workspace_surface_kind: 'redcube_workspace',
      workspace_root: '/tmp/redcube-workspace',
    },
    product_entry_shell: {
      frontdesk: {
        command: 'redcube product frontdesk',
        surface_kind: 'product_frontdesk',
      },
    },
    shared_handoff: {
      opl_return_surface: {
        surface_kind: 'product_entry',
      },
    },
    product_entry_start: {
      surface_kind: 'product_entry_start',
      summary: 'Open the frontdesk first.',
      recommended_mode_id: 'open_frontdesk',
      modes: [
        {
          mode_id: 'open_frontdesk',
          title: 'Open frontdesk',
          command: 'redcube product frontdesk',
          surface_kind: 'product_frontdesk',
          summary: 'Open the direct frontdesk.',
          requires: [],
        },
      ],
      resume_surface: {
        surface_kind: 'product_entry_session',
        command: 'redcube product session --entry-session-id <entry-session-id>',
        session_locator_field: 'entry_session_contract.entry_session_id',
      },
      human_gate_ids: ['alpha_gate'],
    },
    family_orchestration: {
      human_gates: [{ gate_id: 'alpha_gate' }],
      resume_contract: {
        surface_kind: 'product_entry_session',
        session_locator_field: 'entry_session_contract.entry_session_id',
      },
    },
    schema_ref: 'contracts/schemas/v1/product-entry-manifest.schema.json',
    domain_entry_contract: {
      entry_adapter: 'RedCubeDomainEntry',
      service_safe_surface_kind: 'domain_entry',
      product_entry_builder_command: 'redcube product entry',
      supported_commands: ['product-frontdesk'],
      command_contracts: [
        {
          command: 'product-frontdesk',
          required_fields: [],
          optional_fields: [],
        },
      ],
    },
    gateway_interaction_contract: {
      surface_kind: 'gateway_interaction_contract',
      frontdoor_owner: 'opl_gateway_or_domain_gui',
      user_interaction_mode: 'natural_language_frontdoor',
      user_commands_required: false,
      command_surfaces_for_agent_consumption_only: true,
      shared_downstream_entry: 'redcube_product_entry',
      shared_handoff_envelope: ['entry_session_contract'],
    },
    runtime_inventory: {
      surface_kind: 'runtime_inventory',
    },
    task_lifecycle: {
      surface_kind: 'task_lifecycle',
    },
    skill_catalog: {
      surface_kind: 'skill_catalog',
    },
    automation: {
      surface_kind: 'automation',
    },
  };

  const missingSchemaRef = structuredClone(manifest) as Record<string, unknown>;
  delete missingSchemaRef.schema_ref;
  assert.throws(
    () => validateFamilyProductEntryManifest(missingSchemaRef, { requireContractBundle: true }),
    /schema_ref/,
  );

  const wrongRuntimeInventory = structuredClone(manifest);
  wrongRuntimeInventory.runtime_inventory.surface_kind = 'runtime_inventory_preview';
  assert.throws(
    () => validateFamilyProductEntryManifest(wrongRuntimeInventory, { requireRuntimeCompanions: true }),
    /runtime_inventory\.surface_kind/,
  );

  const frontdesk = {
    surface_kind: 'product_frontdesk',
    recommended_action: 'inspect_or_start_product_entry',
    target_domain_id: 'redcube_ai',
    workspace_locator: {
      workspace_surface_kind: 'redcube_workspace',
      workspace_root: '/tmp/redcube-workspace',
    },
    runtime: {
      runtime_owner: 'upstream_hermes_agent',
    },
    product_entry_status: {
      summary: 'Usable now.',
      next_focus: ['Keep the same session contract stable.'],
      remaining_gaps_count: 1,
    },
    frontdesk_surface: {
      surface_kind: 'product_frontdesk',
      command: 'redcube product frontdesk',
    },
    operator_loop_surface: {
      surface_kind: 'product_entry',
      command: 'redcube product invoke',
    },
    operator_loop_actions: {},
    product_entry_start: manifest.product_entry_start,
    product_entry_overview: {
      surface_kind: 'product_entry_overview',
      summary: 'Current product-entry surface is usable.',
      frontdesk_command: 'redcube product frontdesk',
      recommended_command: 'redcube product invoke',
      operator_loop_command: 'redcube product invoke',
      progress_surface: {
        surface_kind: 'product_entry_session',
        command: 'redcube product session --entry-session-id <entry-session-id>',
      },
      resume_surface: manifest.product_entry_start.resume_surface,
      recommended_step_id: 'open_frontdesk',
      next_focus: ['Keep the direct loop stable.'],
      remaining_gaps_count: 1,
      human_gate_ids: ['alpha_gate'],
    },
    product_entry_preflight: {
      surface_kind: 'product_entry_preflight',
      summary: 'Current preflight is green.',
      ready_to_try_now: true,
      recommended_check_command: 'redcube product preflight',
      recommended_start_command: 'redcube product frontdesk',
      blocking_check_ids: [],
      checks: [],
    },
    product_entry_readiness: {
      surface_kind: 'product_entry_readiness',
      verdict: 'service_surface_ready_not_managed_product',
      usable_now: true,
      good_to_use_now: false,
      fully_automatic: false,
      summary: 'Usable now with operator guidance.',
      recommended_start_surface: 'product_frontdesk',
      recommended_start_command: 'redcube product frontdesk',
      recommended_loop_surface: 'product_entry',
      recommended_loop_command: 'redcube product invoke',
      blocking_gaps: ['Managed product shell still pending.'],
    },
    product_entry_quickstart: {
      surface_kind: 'product_entry_quickstart',
      recommended_step_id: 'open_frontdesk',
      summary: 'Open the frontdesk first.',
      steps: [
        {
          step_id: 'open_frontdesk',
          title: 'Open frontdesk',
          command: 'redcube product frontdesk',
          surface_kind: 'product_frontdesk',
          summary: 'Open the direct frontdesk.',
          requires: [],
        },
      ],
      resume_contract: manifest.family_orchestration.resume_contract,
      human_gate_ids: ['alpha_gate'],
    },
    family_orchestration: manifest.family_orchestration,
    product_entry_manifest: manifest,
    entry_surfaces: {},
    summary: {
      frontdesk_command: 'redcube product frontdesk',
      recommended_command: 'redcube product invoke',
      operator_loop_command: 'redcube product invoke',
    },
    notes: ['Thin frontdesk adapter is active.'],
    schema_ref: 'contracts/schemas/v1/product-frontdesk.schema.json',
    domain_entry_contract: manifest.domain_entry_contract,
  };
  assert.throws(
    () => validateFamilyProductFrontdesk(frontdesk, { requireContractBundle: true }),
    /gateway_interaction_contract/,
  );
});

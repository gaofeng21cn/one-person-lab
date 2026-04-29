import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  FamilyProductEntryManifestSurface,
  FamilyProductFrontdoorSurface,
} from '../../../src/product-entry-companions.ts';
import {
  buildDeliveryIdentitySurface,
  buildEntrySessionSurface,
  buildOperatorLoopActionCatalog,
  buildFamilyFrontdoorEntrySurfaces,
  buildFamilyProductFrontdoor,
  buildFamilyProductFrontdoorFromManifest,
  buildFamilyProductEntryManifest,
  buildProductEntryContinuationSnapshot,
  buildProductEntryShellCatalog,
  buildProductEntryShellLinkedSurface,
  buildProductFrontdoor,
  buildProductEntryOverview,
  buildProductEntryQuickstart,
  buildProductEntryReadiness,
  buildProductEntryResumeSurface,
  buildProductEntryStart,
  buildReturnSurfaceContract,
  buildRuntimeSessionContract,
  collectFamilyHumanGateIds,
  validateFamilyProductFrontdoor,
  validateFamilyProductEntryManifest,
} from '../../../src/product-entry-companions.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function readFamilyManifestFixture(fileName: string) {
  const payload = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'tests/fixtures/family-manifests', fileName), 'utf8'),
  ) as Record<string, unknown>;
  return (payload.product_entry_manifest as Record<string, unknown> | undefined) ?? payload;
}


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
    summary: 'Open the frontdoor first.',
    recommended_step_id: 'open_frontdoor',
    steps: [
      {
        step_id: 'open_frontdoor',
        title: 'Open frontdoor',
        command: 'redcube product frontdoor',
        surface_kind: 'product_frontdoor',
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
    summary: 'Open the frontdoor first, then choose the durable continuation mode.',
    recommended_mode_id: 'open_frontdoor',
    modes: [
      {
        mode_id: 'open_frontdoor',
        title: 'Open frontdoor',
        command: 'redcube product frontdoor',
        surface_kind: 'product_frontdoor',
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
    summary: 'Open the frontdoor first, then resume the same session.',
    recommended_mode_id: 'open_frontdoor',
    modes: startWithoutResumeCommand.modes,
    resume_surface: resumeSurface,
    human_gate_ids: humanGateIds,
  });
  assert.equal(startWithResumeCommand.resume_surface.command, 'redcube product session --entry-session-id <entry-session-id>');
  assert.equal(startWithResumeCommand.resume_surface.checkpoint_locator_field, 'continuation_snapshot.latest_managed_run_id');

  const overview = buildProductEntryOverview({
    summary: 'Current product-entry surface is usable.',
    frontdoor_command: 'redcube product frontdoor',
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
    recommended_start_surface: 'product_frontdoor',
    recommended_start_command: 'redcube product frontdoor',
    recommended_loop_surface: 'product_entry',
    recommended_loop_command: 'redcube product invoke',
    blocking_gaps: ['Managed web shell is still pending.'],
  });
  assert.equal(readiness.verdict, 'service_surface_ready_not_managed_product');
  assert.deepEqual(readiness.blocking_gaps, ['Managed web shell is still pending.']);

  const frontdoor = buildProductFrontdoor({
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
    frontdoor_surface: {
      shell_key: 'frontdoor',
      command: 'redcube product frontdoor',
      surface_kind: 'product_frontdoor',
      summary: 'Open the direct frontdoor.',
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
      recommended_start_command: 'redcube product frontdoor',
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
      frontdoor: {
        command: 'redcube product frontdoor',
      },
      session: {
        command: 'redcube product session --entry-session-id <entry-session-id>',
      },
    },
    summary: {
      frontdoor_command: 'redcube product frontdoor',
      recommended_command: 'redcube product invoke',
      operator_loop_command: 'redcube product invoke',
    },
    notes: ['Shared frontdoor core is active.'],
    extra_payload: {
      ok: true,
      schema_ref: 'contracts/schemas/v1/product-frontdoor.schema.json',
    },
  }) as FamilyProductFrontdoorSurface & {
    ok: boolean;
    schema_ref: string;
  };
  assert.equal(frontdoor.surface_kind, 'product_frontdoor');
  assert.equal(frontdoor.ok, true);
  assert.equal(frontdoor.schema_ref, 'contracts/schemas/v1/product-frontdoor.schema.json');
  const productEntryStart = frontdoor.product_entry_start as { recommended_mode_id: string };
  assert.equal(productEntryStart.recommended_mode_id, 'open_frontdoor');

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
    frontdoor_surface: {
      shell_key: 'frontdoor',
      command: 'redcube product frontdoor',
      surface_kind: 'product_frontdoor',
      summary: 'Open the direct frontdoor.',
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
      frontdoor: {
        command: 'redcube product frontdoor',
        surface_kind: 'product_frontdoor',
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
      recommended_start_command: 'redcube product frontdoor',
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
  assert.equal(manifest.product_entry_start.recommended_mode_id, 'open_frontdoor');

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
          frontdoor: {
            command: 'redcube product frontdoor',
          },
        },
        shared_handoff: {
          opl_return_surface: {
            surface_kind: 'product_entry',
            target_domain_id: 'redcube_ai',
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

test('family product frontdoor builder projects manifest core into canonical frontdoor payload', () => {
  const familyOrchestration = {
    human_gates: [{ gate_id: 'alpha_gate', title: 'Alpha gate' }],
    resume_contract: {
      surface_kind: 'product_entry_session',
      session_locator_field: 'entry_session_contract.entry_session_id',
      checkpoint_locator_field: 'continuation_snapshot.latest_managed_run_id',
    },
  };

  const start = buildProductEntryStart({
    summary: 'Open the frontdoor first.',
    recommended_mode_id: 'open_frontdoor',
    modes: [
      {
        mode_id: 'open_frontdoor',
        title: 'Open frontdoor',
        command: 'redcube product frontdoor',
        surface_kind: 'product_frontdoor',
        summary: 'Open the direct frontdoor.',
        requires: [],
      },
    ],
    resume_surface: familyOrchestration.resume_contract,
    human_gate_ids: ['alpha_gate'],
  });
  const quickstart = buildProductEntryQuickstart({
    summary: 'Open the frontdoor first.',
    recommended_step_id: 'open_frontdoor',
    steps: [
      {
        step_id: 'open_frontdoor',
        title: 'Open frontdoor',
        command: 'redcube product frontdoor',
        surface_kind: 'product_frontdoor',
        summary: 'Open the direct frontdoor.',
        requires: [],
      },
    ],
    resume_contract: familyOrchestration.resume_contract,
    human_gate_ids: ['alpha_gate'],
  });
  const overview = buildProductEntryOverview({
    summary: 'Current product-entry surface is usable.',
    frontdoor_command: 'redcube product frontdoor',
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
    recommended_step_id: 'open_frontdoor',
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
    recommended_start_surface: 'product_frontdoor',
    recommended_start_command: 'redcube product frontdoor',
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
    frontdoor_surface: {
      shell_key: 'frontdoor',
      command: 'redcube product frontdoor',
      surface_kind: 'product_frontdoor',
      summary: 'Open the direct frontdoor.',
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
      frontdoor: {
        command: 'redcube product frontdoor',
        surface_kind: 'product_frontdoor',
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
      recommended_start_command: 'redcube product frontdoor',
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
      supported_commands: ['redcube product frontdoor', 'redcube product invoke'],
      command_contracts: [
        {
          command: 'redcube product frontdoor',
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

  const frontdoor = buildFamilyProductFrontdoor({
    recommended_action: 'inspect_or_start_product_entry',
    product_entry_manifest: manifestPayload,
    entry_surfaces: {
      direct: manifestPayload.product_entry_shell.direct,
      session: manifestPayload.product_entry_shell.session,
    },
    notes: ['Thin frontdoor adapter is active.'],
    schema_ref: 'contracts/schemas/v1/product-frontdoor.schema.json',
    extra_payload: {
      ok: true,
    },
  }) as FamilyProductFrontdoorSurface & {
    ok: boolean;
  };

  assert.equal(frontdoor.surface_kind, 'product_frontdoor');
  assert.equal(frontdoor.ok, true);
  assert.equal(frontdoor.target_domain_id, 'redcube_ai');
  assert.equal(frontdoor.summary.frontdoor_command, 'redcube product frontdoor');
  assert.equal(frontdoor.summary.recommended_command, 'redcube product invoke');
  assert.equal(frontdoor.summary.operator_loop_command, 'redcube product invoke');
  assert.equal(manifest.schema_ref, 'contracts/schemas/v1/product-entry-manifest.schema.json');
  assert.equal(manifest.domain_entry_contract?.entry_adapter, 'RedCubeDomainEntry');
  assert.equal(manifest.gateway_interaction_contract?.frontdoor_owner, 'opl_gateway_or_domain_gui');
  assert.equal(frontdoor.schema_ref, 'contracts/schemas/v1/product-frontdoor.schema.json');
  assert.equal(frontdoor.domain_entry_contract?.entry_adapter, 'RedCubeDomainEntry');
  assert.equal(frontdoor.gateway_interaction_contract?.shared_downstream_entry, 'RedCubeDomainEntry');
});

test('product entry companion helpers build family frontdoor entry surfaces from manifest shells', () => {
  const entrySurfaces = buildFamilyFrontdoorEntrySurfaces({
    product_entry_shell: {
      product_frontdoor: {
        command: 'redcube product frontdoor',
        surface_kind: 'product_frontdoor',
      },
      session: {
        command: 'redcube product session --entry-session-id <entry-session-id>',
        surface_kind: 'product_entry_session',
      },
    },
    shell_aliases: {
      frontdoor: 'product_frontdoor',
      session: 'session',
    },
    shared_handoff: {
      direct_entry_builder: {
        command: 'redcube product invoke --entry-mode direct',
        entry_mode: 'direct',
      },
      opl_return_surface: {
        surface_kind: 'product_entry',
        target_domain_id: 'redcube_ai',
      },
    },
  });

  assert.equal(entrySurfaces.frontdoor.command, 'redcube product frontdoor');
  assert.equal(
    entrySurfaces.session.command,
    'redcube product session --entry-session-id <entry-session-id>',
  );
  assert.equal(entrySurfaces.direct_entry_builder?.entry_mode, 'direct');
  assert.equal('opl_return_surface' in entrySurfaces, false);
});

test('product entry companion helpers build family frontdoor directly from the manifest shell projection', () => {
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
    product_entry_shell: {
      product_frontdoor: {
        command: 'redcube product frontdoor',
        surface_kind: 'product_frontdoor',
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
      direct_entry_builder: {
        command: 'redcube product invoke --entry-mode direct',
        entry_mode: 'direct',
      },
      opl_handoff_builder: {
        command: 'redcube product federate --entry-mode opl_gateway',
        entry_mode: 'opl_gateway',
      },
      opl_return_surface: {
        surface_kind: 'product_entry',
        target_domain_id: 'redcube_ai',
      },
    },
    product_entry_start: {
      surface_kind: 'product_entry_start',
      summary: 'Open the frontdoor first.',
      recommended_mode_id: 'open_frontdoor',
      modes: [
        {
          mode_id: 'open_frontdoor',
          title: 'Open frontdoor',
          command: 'redcube product frontdoor',
          surface_kind: 'product_frontdoor',
          summary: 'Open the direct frontdoor.',
          requires: [],
        },
      ],
      resume_surface: {
        surface_kind: 'product_entry_session',
        command: 'redcube product session --entry-session-id <entry-session-id>',
        session_locator_field: 'entry_session_contract.entry_session_id',
      },
      human_gate_ids: [],
    },
    family_orchestration: {
      human_gates: [],
      resume_contract: {
        surface_kind: 'product_entry_session',
        session_locator_field: 'entry_session_contract.entry_session_id',
      },
    },
    recommended_command: 'redcube product invoke',
    extra_payload: {
      runtime: {
        runtime_owner: 'upstream_hermes_agent',
      },
      product_entry_status: {
        summary: 'Usable now.',
        next_focus: ['Keep the same session contract stable.'],
        remaining_gaps_count: 1,
      },
      frontdoor_surface: {
        shell_key: 'product_frontdoor',
        command: 'redcube product frontdoor',
        surface_kind: 'product_frontdoor',
      },
      operator_loop_surface: {
        shell_key: 'direct',
        command: 'redcube product invoke',
        surface_kind: 'product_entry',
      },
      operator_loop_actions: {},
      product_entry_overview: {
        surface_kind: 'product_entry_overview',
        summary: 'Current product-entry surface is usable.',
        frontdoor_command: 'redcube product frontdoor',
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
        recommended_step_id: 'open_frontdoor',
        next_focus: ['Keep the direct loop stable.'],
        remaining_gaps_count: 1,
        human_gate_ids: [],
      },
      product_entry_preflight: {
        surface_kind: 'product_entry_preflight',
        summary: 'Current preflight is green.',
        ready_to_try_now: true,
        recommended_check_command: 'redcube product preflight',
        recommended_start_command: 'redcube product frontdoor',
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
        recommended_start_surface: 'product_frontdoor',
        recommended_start_command: 'redcube product frontdoor',
        recommended_loop_surface: 'product_entry',
        recommended_loop_command: 'redcube product invoke',
        blocking_gaps: ['Managed product shell still pending.'],
      },
      product_entry_quickstart: {
        surface_kind: 'product_entry_quickstart',
        recommended_step_id: 'open_frontdoor',
        summary: 'Open the frontdoor first.',
        steps: [
          {
            step_id: 'open_frontdoor',
            title: 'Open frontdoor',
            command: 'redcube product frontdoor',
            surface_kind: 'product_frontdoor',
            summary: 'Open the direct frontdoor.',
            requires: [],
          },
        ],
        resume_contract: {
          surface_kind: 'product_entry_session',
          session_locator_field: 'entry_session_contract.entry_session_id',
        },
        human_gate_ids: [],
      },
    },
  }) as FamilyProductEntryManifestSurface;

  const frontdoor = buildFamilyProductFrontdoorFromManifest({
    product_entry_manifest: manifest,
    shell_aliases: {
      frontdoor: 'product_frontdoor',
      direct: 'direct',
      session: 'session',
    },
    recommended_action: 'inspect_or_start_product_entry',
    schema_ref: 'contracts/schemas/v1/product-frontdoor.schema.json',
    notes: ['Thin frontdoor adapter is active.'],
    extra_payload: {
      ok: true,
    },
  }) as FamilyProductFrontdoorSurface & { ok: boolean };

  assert.equal(frontdoor.ok, true);
  assert.equal(frontdoor.entry_surfaces.frontdoor.command, 'redcube product frontdoor');
  assert.equal(frontdoor.entry_surfaces.direct.command, 'redcube product invoke');
  assert.equal(
    frontdoor.entry_surfaces.session.command,
    'redcube product session --entry-session-id <entry-session-id>',
  );
  assert.equal(frontdoor.entry_surfaces.opl_handoff_builder?.entry_mode, 'opl_gateway');
  assert.equal(frontdoor.schema_ref, 'contracts/schemas/v1/product-frontdoor.schema.json');
});


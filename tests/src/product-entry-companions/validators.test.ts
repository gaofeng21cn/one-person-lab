import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  FamilyProductEntryManifestSurface,
  FamilyProductFrontdeskSurface,
} from '../../../src/product-entry-companions.ts';
import {
  buildDeliveryIdentitySurface,
  buildEntrySessionSurface,
  buildOperatorLoopActionCatalog,
  buildFamilyFrontdeskEntrySurfaces,
  buildFamilyProductFrontdesk,
  buildFamilyProductFrontdeskFromManifest,
  buildFamilyProductEntryManifest,
  buildProductEntryContinuationSnapshot,
  buildProductEntryShellCatalog,
  buildProductEntryShellLinkedSurface,
  buildProductFrontdesk,
  buildProductEntryOverview,
  buildProductEntryQuickstart,
  buildProductEntryReadiness,
  buildProductEntryResumeSurface,
  buildProductEntryStart,
  buildReturnSurfaceContract,
  buildRuntimeSessionContract,
  collectFamilyHumanGateIds,
  validateFamilyProductFrontdesk,
  validateFamilyProductEntryManifest,
} from '../../../src/product-entry-companions.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function readFamilyManifestFixture(fileName: string) {
  const payload = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'tests/fixtures/family-manifests', fileName), 'utf8'),
  ) as Record<string, unknown>;
  return (payload.product_entry_manifest as Record<string, unknown> | undefined) ?? payload;
}


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
        target_domain_id: 'redcube_ai',
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
    runtime_loop_closure: {
      surface_kind: 'runtime_loop_closure',
    },
    session_continuity: {
      surface_kind: 'session_continuity',
    },
    progress_projection: {
      surface_kind: 'progress_projection',
    },
    artifact_inventory: {
      surface_kind: 'artifact_inventory',
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
    requireRuntimeContinuity: true,
  });
  assert.equal(validatedManifest.surface_kind, 'product_entry_manifest');
  assert.equal(validatedManifest.product_entry_start.resume_surface.surface_kind, 'product_entry_session');
  assert.equal(validatedManifest.domain_entry_contract?.entry_adapter, 'RedCubeDomainEntry');
  assert.equal(validatedManifest.runtime_inventory?.surface_kind, 'runtime_inventory');
  assert.equal(validatedManifest.runtime_loop_closure?.surface_kind, 'runtime_loop_closure');
  assert.equal(validatedManifest.session_continuity?.surface_kind, 'session_continuity');
  assert.equal(validatedManifest.progress_projection?.surface_kind, 'progress_projection');
  assert.equal(validatedManifest.artifact_inventory?.surface_kind, 'artifact_inventory');

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

test('runtime continuity validation accepts MAS, MAG, and RCA manifest fixtures', () => {
  const fixtureNames = [
    'med-autoscience-product-entry-manifest.json',
    'med-autogrant-product-entry-manifest.json',
    'redcube-product-entry-manifest.json',
  ];

  for (const fileName of fixtureNames) {
    const manifest = readFamilyManifestFixture(fileName);
    const validated = validateFamilyProductEntryManifest(manifest, {
      requireRuntimeContinuity: true,
    });
    assert.equal(validated.session_continuity?.surface_kind, 'session_continuity', fileName);
    assert.equal(validated.progress_projection?.surface_kind, 'progress_projection', fileName);
    assert.equal(validated.artifact_inventory?.surface_kind, 'artifact_inventory', fileName);
  }
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
        target_domain_id: 'redcube_ai',
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
    runtime_control: {
      surface_kind: 'runtime_control',
    },
    session_continuity: {
      surface_kind: 'session_continuity',
    },
    progress_projection: {
      surface_kind: 'progress_projection',
    },
    artifact_inventory: {
      surface_kind: 'artifact_inventory',
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

  const wrongSessionContinuity = structuredClone(manifest);
  wrongSessionContinuity.session_continuity.surface_kind = 'session_continuity_preview';
  assert.throws(
    () => validateFamilyProductEntryManifest(wrongSessionContinuity),
    /session_continuity\.surface_kind/,
  );

  const missingRuntimeControlReference = structuredClone(manifest);
  delete missingRuntimeControlReference.runtime_control;
  assert.throws(
    () => validateFamilyProductEntryManifest(missingRuntimeControlReference, { requireRuntimeContinuity: true }),
    /runtime continuity control reference/,
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

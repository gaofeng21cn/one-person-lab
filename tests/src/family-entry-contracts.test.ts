import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDomainEntryCommandContract,
  buildFamilyDomainEntryContract,
  buildGatewayInteractionContract,
  buildSharedHandoff,
  buildSharedHandoffBuilder,
  buildSharedHandoffReturnSurface,
  validateFamilyDomainEntryContract,
  validateGatewayInteractionContract,
  validateSharedHandoff,
  validateSharedHandoffBuilder,
  validateSharedHandoffReturnSurface,
} from '../../src/family-entry-contracts.ts';

test('family entry contract helpers build and validate shared domain entry payloads', () => {
  const workspaceCockpit = buildDomainEntryCommandContract({
    command: 'workspace-cockpit',
    required_fields: ['profile_ref'],
    optional_fields: ['entry_mode'],
    extra_payload: { target_surface_kind: 'workspace_cockpit' },
  });

  const contract = buildFamilyDomainEntryContract({
    entry_adapter: 'MedAutoScienceDomainEntry',
    service_safe_surface_kind: 'med_autoscience_service_safe_domain_entry',
    product_entry_builder_command: 'build-product-entry',
    product_entry_kind: 'med_autoscience_product_entry',
    supported_entry_modes: ['direct', 'opl-handoff'],
    supported_commands: ['workspace-cockpit'],
    command_contracts: [workspaceCockpit],
    extra_payload: {
      schema_ref: 'contracts/schemas/v1/product-entry-manifest.schema.json',
    },
  });

  const validated = validateFamilyDomainEntryContract(contract, 'product_entry_manifest.domain_entry_contract');
  assert.equal(validated.entry_adapter, 'MedAutoScienceDomainEntry');
  assert.equal(validated.product_entry_kind, 'med_autoscience_product_entry');
  assert.deepEqual(validated.supported_entry_modes, ['direct', 'opl-handoff']);
  assert.equal(validated.schema_ref, 'contracts/schemas/v1/product-entry-manifest.schema.json');
  assert.deepEqual(validated.command_contracts[0], workspaceCockpit);
});

test('family entry contract helpers build and validate gateway interaction payloads', () => {
  const contract = buildGatewayInteractionContract({
    frontdoor_owner: 'opl_gateway_or_domain_gui',
    user_interaction_mode: 'natural_language_frontdoor',
    user_commands_required: false,
    command_surfaces_for_agent_consumption_only: true,
    shared_downstream_entry: 'MedAutoScienceDomainEntry',
    shared_handoff_envelope: [
      'target_domain_id',
      'task_intent',
      'entry_mode',
    ],
    extra_payload: { recommended_route_surface: 'product_frontdesk' },
  });

  const validated = validateGatewayInteractionContract(
    contract,
    'product_entry_manifest.gateway_interaction_contract',
  );
  assert.equal(validated.surface_kind, 'gateway_interaction_contract');
  assert.equal(validated.recommended_route_surface, 'product_frontdesk');
});

test('family entry contract helpers build and validate shared handoff payloads', () => {
  const builder = buildSharedHandoffBuilder({
    command: 'medautoscience build-product-entry --entry-mode direct',
    entry_mode: 'direct',
    extra_payload: { summary: 'Build direct product entry handoff' },
  });
  const returnSurface = buildSharedHandoffReturnSurface({
    surface_kind: 'product_entry',
    target_domain_id: 'redcube_ai',
    extra_payload: { summary: 'Return into RedCube product entry' },
  });

  const validatedBuilder = validateSharedHandoffBuilder(
    builder,
    'product_entry_manifest.shared_handoff.direct_entry_builder',
  );
  const validatedReturnSurface = validateSharedHandoffReturnSurface(
    returnSurface,
    'product_entry_manifest.shared_handoff.opl_return_surface',
  );

  assert.equal(validatedBuilder.entry_mode, 'direct');
  assert.equal(validatedBuilder.summary, 'Build direct product entry handoff');
  assert.equal(validatedReturnSurface.surface_kind, 'product_entry');
  assert.equal(validatedReturnSurface.target_domain_id, 'redcube_ai');
  assert.equal(validatedReturnSurface.summary, 'Return into RedCube product entry');
});

test('family entry contract helpers build and validate aggregate shared handoff payloads', () => {
  const sharedHandoff = buildSharedHandoff({
    direct_entry_builder: {
      command: 'medautoscience build-product-entry --entry-mode direct',
      entry_mode: 'direct',
      summary: 'Build direct product entry handoff',
    },
    opl_return_surface: {
      surface_kind: 'product_entry',
      target_domain_id: 'redcube_ai',
      summary: 'Return into RedCube product entry',
    },
    extra_payload: {
      contract_owner: 'family_shared_contract',
    },
  });

  const validated = validateSharedHandoff(
    sharedHandoff,
    'product_entry_manifest.shared_handoff',
  );

  assert.equal(validated.direct_entry_builder?.entry_mode, 'direct');
  assert.equal(validated.direct_entry_builder?.summary, 'Build direct product entry handoff');
  assert.equal(validated.opl_return_surface?.target_domain_id, 'redcube_ai');
  assert.equal(validated.contract_owner, 'family_shared_contract');
  assert.throws(
    () => validateSharedHandoff({}, 'product_entry_manifest.shared_handoff'),
    /shared_handoff/,
  );
});

test('family entry contract validation fails closed when command contracts are missing', () => {
  assert.throws(
    () =>
      validateFamilyDomainEntryContract(
        {
          entry_adapter: 'MedAutoScienceDomainEntry',
          service_safe_surface_kind: 'med_autoscience_service_safe_domain_entry',
          product_entry_builder_command: 'build-product-entry',
          supported_commands: ['workspace-cockpit'],
        },
        'product_entry_manifest.domain_entry_contract',
      ),
    /command_contracts/,
  );
});

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDomainAgentEntrySpec,
  buildDomainEntryCommandContract,
  buildDomainEntryCommandCatalog,
  buildFamilyDirectOplSharedHandoff,
  buildFamilyDomainEntryContract,
  buildFamilyGatewayInteractionContract,
  buildGatewayInteractionContract,
  buildSharedHandoff,
  buildSharedHandoffBuilder,
  buildSharedHandoffReturnSurface,
  validateFamilyDomainEntryContract,
  validateDomainAgentEntrySpec,
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

test('family entry contract helpers build reusable command catalogs for cross-repo adapters', () => {
  const catalog = buildDomainEntryCommandCatalog([
    {
      command: 'workspace-cockpit',
      required_fields: ['profile_ref'],
    },
    {
      command: 'study-progress',
      required_fields: ['profile_ref', 'study_id'],
      optional_fields: ['entry_mode'],
      extra_payload: { target_surface_kind: 'study_progress' },
    },
  ]);

  assert.deepEqual(catalog.supported_commands, ['workspace-cockpit', 'study-progress']);
  assert.deepEqual(catalog.command_contracts, [
    buildDomainEntryCommandContract({
      command: 'workspace-cockpit',
      required_fields: ['profile_ref'],
    }),
    buildDomainEntryCommandContract({
      command: 'study-progress',
      required_fields: ['profile_ref', 'study_id'],
      optional_fields: ['entry_mode'],
      extra_payload: { target_surface_kind: 'study_progress' },
    }),
  ]);

  const contract = buildFamilyDomainEntryContract({
    entry_adapter: 'MedAutoScienceDomainEntry',
    service_safe_surface_kind: 'med_autoscience_service_safe_domain_entry',
    product_entry_builder_command: 'build-product-entry',
    ...catalog,
  });

  assert.deepEqual(contract.supported_commands, catalog.supported_commands);
  assert.deepEqual(contract.command_contracts, catalog.command_contracts);
});

test('family entry contract helpers build and validate domain agent entry specs', () => {
  const spec = buildDomainAgentEntrySpec({
    agent_id: 'mas',
    title: 'Med Auto Science',
    description: 'Medical research domain agent.',
    default_engine: 'codex',
    workspace_requirement: 'required',
    locator_schema: {
      required_fields: ['profile_ref'],
      optional_fields: ['study_id'],
    },
    codex_entry_strategy: 'domain_agent_entry',
    artifact_conventions: 'paper_and_submission_package',
    progress_conventions: 'study_runtime_narration',
    entry_command: 'product-frontdoor',
    manifest_command: 'product-entry-manifest',
  });

  const validated = validateDomainAgentEntrySpec(spec, 'domain_entry_contract.domain_agent_entry_spec');
  assert.equal(validated.surface_kind, 'domain_agent_entry_spec');
  assert.equal(validated.agent_id, 'mas');
  assert.deepEqual(validated.locator_schema.required_fields, ['profile_ref']);
  assert.deepEqual(validated.locator_schema.optional_fields, ['study_id']);
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
    extra_payload: { recommended_route_surface: 'product_frontdoor' },
  });

  const validated = validateGatewayInteractionContract(
    contract,
    'product_entry_manifest.gateway_interaction_contract',
  );
  assert.equal(validated.surface_kind, 'gateway_interaction_contract');
  assert.equal(validated.recommended_route_surface, 'product_frontdoor');
});

test('family entry contract helpers expose the default family gateway contract with extendable envelope fields', () => {
  const contract = buildFamilyGatewayInteractionContract({
    shared_downstream_entry: 'MedAutoScienceDomainEntry',
    extra_shared_handoff_envelope: ['entry_session_contract'],
    extra_payload: { recommended_route_surface: 'product_frontdoor' },
  });

  const validated = validateGatewayInteractionContract(
    contract,
    'product_entry_manifest.gateway_interaction_contract',
  );
  assert.equal(validated.frontdoor_owner, 'opl_gateway_or_domain_gui');
  assert.equal(validated.user_interaction_mode, 'natural_language_frontdoor');
  assert.equal(validated.user_commands_required, false);
  assert.equal(validated.command_surfaces_for_agent_consumption_only, true);
  assert.deepEqual(validated.shared_handoff_envelope, [
    'target_domain_id',
    'task_intent',
    'entry_mode',
    'workspace_locator',
    'runtime_session_contract',
    'return_surface_contract',
    'entry_session_contract',
  ]);
  assert.equal(validated.recommended_route_surface, 'product_frontdoor');
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

test('family entry contract helpers build the default direct and OPL handoff bundle', () => {
  const validated = validateSharedHandoff(
    buildFamilyDirectOplSharedHandoff({
      direct_entry_builder_command: 'medautoscience build-product-entry --entry-mode direct',
      opl_handoff_builder_command: 'medautoscience build-product-entry --entry-mode opl-handoff',
      extra_payload: { contract_owner: 'family_shared_contract' },
    }),
    'product_entry_manifest.shared_handoff',
  );

  assert.equal(
    validated.direct_entry_builder?.command,
    'medautoscience build-product-entry --entry-mode direct',
  );
  assert.equal(validated.direct_entry_builder?.entry_mode, 'direct');
  assert.equal(
    validated.opl_handoff_builder?.command,
    'medautoscience build-product-entry --entry-mode opl-handoff',
  );
  assert.equal(validated.opl_handoff_builder?.entry_mode, 'opl-handoff');
  assert.equal(validated.contract_owner, 'family_shared_contract');
});

test('family entry contract helpers validate nested domain agent entry specs inside the domain entry contract', () => {
  const contract = buildFamilyDomainEntryContract({
    entry_adapter: 'MedAutoScienceDomainEntry',
    service_safe_surface_kind: 'med_autoscience_service_safe_domain_entry',
    product_entry_builder_command: 'build-product-entry',
    supported_commands: ['workspace-cockpit'],
    command_contracts: [
      buildDomainEntryCommandContract({
        command: 'workspace-cockpit',
        required_fields: ['profile_ref'],
      }),
    ],
    domain_agent_entry_spec: {
      surface_kind: 'domain_agent_entry_spec',
      agent_id: 'mas',
      title: 'Med Auto Science',
      description: 'Medical research domain agent.',
      default_engine: 'codex',
      workspace_requirement: 'required',
      locator_schema: {
        required_fields: ['profile_ref'],
        optional_fields: [],
      },
      codex_entry_strategy: 'domain_agent_entry',
      artifact_conventions: 'paper_and_submission_package',
      progress_conventions: 'study_runtime_narration',
      entry_command: 'product-frontdoor',
      manifest_command: 'product-entry-manifest',
    },
  });

  assert.equal(contract.domain_agent_entry_spec?.agent_id, 'mas');
  assert.throws(
    () =>
      validateFamilyDomainEntryContract(
        {
          ...contract,
          domain_agent_entry_spec: {
            surface_kind: 'domain_agent_entry_spec',
            agent_id: 'mas',
          },
        },
        'product_entry_manifest.domain_entry_contract',
      ),
    /domain_agent_entry_spec\.title/,
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

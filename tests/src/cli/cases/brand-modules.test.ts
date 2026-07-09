import { spawnSync } from 'node:child_process';

import { assert, fs, loadFrameworkContracts, os, parseJsonText, path, repoRoot, runCli, test } from '../helpers.ts';
import './brand-modules-cases/agent-and-foundry-surfaces.ts';
import './brand-modules-cases/l5-evidence-gate.ts';
import './brand-modules-cases/module-command-surfaces.ts';
import './brand-modules-cases/runway-control-loop.ts';
import { expectedModuleIds, type L5Module } from './brand-modules-cases/shared.ts';
import { runFamilyRuntimeEvidenceWorklist } from '../../../../src/modules/runway/family-runtime-evidence-worklist.ts';

test('brand module registry is loaded as a required framework contract', () => {
  const contracts = loadFrameworkContracts(repoRoot);

  assert.equal(contracts.brandModuleRegistry.scope, 'opl_brand_module_registry');
  assert.equal(contracts.brandModuleSurfaces.scope, 'opl_brand_module_executable_surfaces');
  assert.equal(contracts.brandModuleL5OperatingEvidence.scope, 'opl_brand_module_l5_operating_evidence');
  assert.equal(contracts.brandSystemProfile.scope, 'opl_brand_system_freeze_profile');
  assert.equal(contracts.sourceModuleMap.scope, 'opl_framework_source_module_map');
  assert.deepEqual(
    contracts.brandModuleRegistry.modules.map((entry) => entry.module_id),
    expectedModuleIds,
  );
  assert.deepEqual(
    contracts.brandModuleSurfaces.modules.map((entry) => entry.module_id),
    expectedModuleIds,
  );
  assert.deepEqual(
    contracts.brandModuleL5OperatingEvidence.modules.map((entry) => entry.module_id),
    expectedModuleIds,
  );
  assert.deepEqual(
    contracts.sourceModuleMap.modules.map((entry) => entry.module_id),
    expectedModuleIds,
  );
  assert.deepEqual(
    contracts.sourceModuleMap.modules.map((entry) => entry.physical_root),
    expectedModuleIds.map((moduleId) => `src/modules/${moduleId}`),
  );
});

test('brand system profile freezes product grammar and language against the brand module baseline', () => {
  const contracts = loadFrameworkContracts(repoRoot);
  const profile = contracts.brandSystemProfile;
  const validation = loadFrameworkContracts(repoRoot);

  assert.equal(profile.version, 'brand-system-profile.v1');
  assert.deepEqual(
    profile.product_cognition_layers.map((entry) => entry.layer_id),
    ['opl_framework', 'one_person_lab_app', 'foundry_agents'],
  );
  assert.deepEqual(profile.brand_module_product_grammar.module_ids, expectedModuleIds);
  assert.deepEqual(
    profile.brand_module_product_grammar.module_role_refs.map((entry) => entry.module_id),
    expectedModuleIds,
  );
  for (const moduleRef of profile.brand_module_product_grammar.module_role_refs) {
    assert.equal(
      contracts.brandModuleRegistry.modules.some((entry) => entry.module_id === moduleRef.module_id),
      true,
    );
    assert.equal(
      contracts.brandModuleSurfaces.modules.some((entry) => entry.module_id === moduleRef.module_id),
      true,
    );
    assert.equal(moduleRef.registry_ref, `contracts/opl-framework/brand-module-registry.json#modules.${moduleRef.module_id}`);
    assert.equal(moduleRef.surface_contract_ref, `contracts/opl-framework/brand-module-surfaces.json#modules.${moduleRef.module_id}`);
  }
  assert.equal(profile.agent_naming.family_label, 'One Person Lab Foundry Agent');
  assert.deepEqual(profile.agent_naming.required_agent_ids, ['mas', 'mag', 'rca', 'oma']);
  assert.deepEqual(profile.app_status_language.default_terms, [
    'current owner',
    'next action',
    'artifact',
    'receipt',
    'typed blocker',
    'human gate',
  ]);
  assert.equal(profile.app_status_language.diagnostic_only_terms.includes('ledger'), true);
  assert.equal(profile.app_status_language.diagnostic_only_terms.includes('provider'), true);
  assert.deepEqual(
    profile.visual_system.pattern_groups.map((entry) => entry.group_id),
    ['design_tokens', 'icons', 'cards', 'status_patterns'],
  );
  assert.deepEqual(
    profile.ordinary_app_experience.experience_axes.map((entry) => entry.axis_id),
    ['running_fluency', 'output_quality', 'brand_feel'],
  );
  assert.equal(
    profile.ordinary_app_experience.default_read_surface_ref,
    'app_state.operator.ordinary_cockpit',
  );
  assert.equal(profile.ordinary_app_experience.l5_evidence_refs_only, true);
  assert.equal(profile.ordinary_app_experience.authority_boundary.can_claim_l5, false);
  assert.equal(profile.ordinary_app_experience.authority_boundary.can_claim_app_release_ready, false);
  assert.equal(profile.ordinary_app_experience.authority_boundary.can_authorize_quality_verdict, false);
  assert.equal(profile.receipt_blocker_language.success_shape, 'domain_owner_receipt_ref');
  assert.equal(profile.receipt_blocker_language.blocked_shape, 'domain_owned_typed_blocker_ref');
  assert.equal(profile.authority_boundary.can_claim_domain_ready, false);
  assert.equal(profile.authority_boundary.can_claim_production_ready, false);
  assert.equal(profile.authority_boundary.can_sign_owner_receipt, false);
  assert.equal(profile.authority_boundary.can_create_typed_blocker, false);
  assert.equal(
    validation.brandSystemProfile.source_refs.includes('human_doc:opl_brand_modules_reference'),
    true,
  );
  const appExperienceClass = contracts.brandModuleL5OperatingEvidence.evidence_classes.find((entry) =>
    entry.class_id === 'ordinary_app_experience'
  );
  assert.equal(appExperienceClass?.accepted_ref_shapes.includes('brand_experience_profile_ref'), true);
  assert.equal(
    contracts.brandModuleL5OperatingEvidence.owner_route_work_order_policy.non_closing_inputs.includes(
      'brand_experience_profile',
    ),
    true,
  );
});

test('brand modules list exposes all current modules at the Workspace structural baseline', () => {
  const output = runCli(['brand-modules', 'list']);

  assert.equal(output.version, 'g2');
  assert.equal(output.brand_modules.surface_kind, 'opl_brand_modules');
  assert.deepEqual(
    output.brand_modules.modules.map((entry: { module_id: string }) => entry.module_id),
    expectedModuleIds,
  );
  assert.equal(
    output.brand_modules.modules.every((entry: { maturity_level: string }) =>
      entry.maturity_level === 'L4_structural_baseline'
    ),
    true,
  );
});

test('brand modules inspect returns one module with refs-only authority flags', () => {
  const output = runCli(['brand-modules', 'inspect', '--module', 'workspace']);
  const module = output.brand_module;

  assert.equal(module.module_id, 'workspace');
  assert.equal(module.brand_name, 'OPL Workspace');
  assert.equal(module.module_doc_ref, 'human_doc:opl_brand_module_workspace');
  assert.equal(module.module_doc_path, 'docs/references/brand-modules/workspace.md');
  assert.equal(module.maturity_level, 'L4_structural_baseline');
  assert.equal(module.authority_boundary.can_claim_domain_ready, false);
  assert.equal(module.authority_boundary.can_claim_quality_verdict, false);
  assert.equal(module.authority_boundary.can_claim_artifact_authority, false);
  assert.equal(module.authority_boundary.can_claim_production_ready, false);
  assert.equal(module.authority_boundary.can_write_domain_truth, false);
  assert.equal(module.authority_boundary.can_sign_owner_receipt, false);
  assert.equal(module.contract_refs.includes('contracts/opl-framework/workspace-index.schema.json'), true);
  assert.equal(module.cli_surfaces.includes('opl workspace ensure --json'), true);
  assert.equal(module.validation_surfaces.includes('opl workspace validate --json'), true);
});

test('brand modules maturity and validation are contract-derived', () => {
  const maturity = runCli(['brand-modules', 'maturity']).brand_module_maturity;
  assert.equal(maturity.baseline_module_id, 'workspace');
  assert.equal(maturity.module_count, 10);
  assert.equal(maturity.l4_structural_baseline_count, 10);
  assert.deepEqual(maturity.below_baseline_module_ids, []);
  assert.equal(maturity.l5_target_level, 'L5_production_operating_maturity');
  assert.equal(maturity.l5_claimed_count, 0);
  assert.deepEqual(maturity.l5_claimed_module_ids, []);
  assert.equal(maturity.l5_open_gap_count, 10);
  assert.deepEqual(maturity.l5_open_gap_module_ids, expectedModuleIds);

  const validation = runCli(['brand-modules', 'validate']).brand_module_validation;
  assert.equal(validation.status, 'valid');
  assert.equal(validation.validated_module_count, 10);
  assert.deepEqual(validation.missing_l4_gate_modules, []);
  assert.deepEqual(validation.authority_boundary_violations, []);
});

test('capability invocation OS stays inside the ten brand-module boundaries', () => {
  const list = runCli(['brand-modules', 'list']).brand_modules;
  const contracts = loadFrameworkContracts(repoRoot);
  const modules = Object.fromEntries(
    contracts.brandModuleRegistry.modules.map((entry) => [entry.module_id, entry]),
  );

  assert.equal(list.module_count, 10);
  assert.deepEqual(
    list.modules.map((entry: { module_id: string }) => entry.module_id),
    expectedModuleIds,
  );
  assert.match(modules.pack.purpose, /Capability Invocation ABI/);
  assert.match(modules.pack.machine_boundary, /capability invocation ABI/);
  assert.equal(modules.pack.contract_refs.includes('domain_contract:agent_tool_arsenal'), true);
  assert.equal(modules.pack.forbidden_claims.includes('tool_result_envelope_is_owner_answer'), true);
  assert.equal(modules.pack.forbidden_claims.includes('tool_availability_is_current_owner_authorization'), true);
  assert.match(modules.atlas.purpose, /tool cards/);
  assert.match(modules.stagecraft.purpose, /invocation policy/);
  assert.match(modules.console.purpose, /invocation-plan projection/);
  assert.match(modules.connect.purpose, /ToolResultEnvelope descriptors/);
});

test('Agent Execution OS ordinary path consumes Pack execution views without raw MAS contract details', () => {
  const contracts = loadFrameworkContracts(repoRoot);
  const surfaces = Object.fromEntries(
    contracts.brandModuleSurfaces.modules.map((entry) => [entry.module_id, entry]),
  );
  const consoleInterfaces = runCli(['console', 'interfaces']).opl_console_interfaces;
  const connectInterfaces = runCli(['connect', 'interfaces']).opl_connect_interfaces;

  assert.deepEqual(
    contracts.brandModuleSurfaces.modules.map((entry) => entry.module_id),
    expectedModuleIds,
  );
  assert.equal(expectedModuleIds.includes('agent-execution-os'), false);
  assert.equal(expectedModuleIds.includes('capability-invocation'), false);
  assert.equal(expectedModuleIds.includes('tool-arsenal'), false);

  for (const objectId of [
    'capability_execution_view',
    'agent_operational_card',
    'tool_result_envelope',
  ]) {
    assert.equal(surfaces.pack.object_model.primary_objects.includes(objectId), true);
  }
  assert.equal(
    surfaces.pack.validation.required_refs.includes('domain_contract:agent_tool_arsenal'),
    true,
  );
  assert.equal(
    surfaces.pack.forbidden_claims.includes('tool_result_envelope_is_owner_answer'),
    true,
  );

  for (const projectionRef of [
    'app_projection:capability_execution_view',
    'app_projection:agent_operational_card',
    'app_projection:tool_result_envelope',
  ]) {
    assert.equal(surfaces.console.app_read_model.projection_refs.includes(projectionRef), true);
    assert.equal(consoleInterfaces.app.projection_refs.includes(projectionRef), true);
  }
  assert.equal(
    surfaces.console.forbidden_claims.includes('console_consumes_mas_raw_contract_details'),
    true,
  );

  for (const delegateId of [
    'capability_execution_view_descriptor',
    'agent_operational_card_descriptor',
    'tool_result_envelope_descriptor',
  ]) {
    assert.equal(surfaces.connect.descriptor_surface.delegate_ids.includes(delegateId), true);
    assert.equal(connectInterfaces.descriptor.delegate_ids.includes(delegateId), true);
  }
  assert.equal(
    surfaces.connect.forbidden_claims.includes('connect_exports_mas_raw_contract_details'),
    true,
  );

  const ordinaryConsumptionRefs = [
    ...surfaces.console.object_model.primary_objects,
    ...surfaces.console.object_model.read_model_refs,
    ...surfaces.console.app_read_model.projection_refs,
    ...surfaces.connect.object_model.primary_objects,
    ...surfaces.connect.object_model.read_model_refs,
    ...surfaces.connect.app_read_model.projection_refs,
    ...surfaces.connect.descriptor_surface.delegate_ids,
  ];
  assert.equal(
    ordinaryConsumptionRefs.some((ref) =>
      /mas_raw|mas-original|medautosci.*raw.*contract|med-autoscience.*raw.*contract/.test(ref)
    ),
    false,
  );
});

test('Capability Invocation OS lifecycle folds back into existing Pack Console Connect and Runway surfaces', () => {
  const contracts = loadFrameworkContracts(repoRoot);
  const rawSurfaces = parseJsonText(
    fs.readFileSync(path.join(repoRoot, 'contracts/opl-framework/brand-module-surfaces.json'), 'utf8'),
  ) as {
    modules: Array<{
      capability_invocation_lifecycle: {
        layers: Array<{
          fail_closed_on: string[];
          forbidden_claims: string[];
          layer_id: string;
          owner_modules: string[];
        }>;
        status: string;
      };
      module_id: string;
    }>;
  };
  const surfaces = Object.fromEntries(
    contracts.brandModuleSurfaces.modules.map((entry) => [entry.module_id, entry]),
  );
  const rawSurfaceByModule = Object.fromEntries(
    rawSurfaces.modules.map((entry) => [entry.module_id, entry]),
  ) as Record<string, (typeof rawSurfaces.modules)[number]>;
  const packInspect = runCli(['pack', 'inspect']).opl_pack_inspect;
  const runwayInspect = runCli(['runway', 'inspect']).opl_runway_inspect;

  assert.equal(
    contracts.brandModuleSurfaces.modules.some((entry: { module_id: string }) =>
      entry.module_id === 'capability-invocation-os'
    ),
    false,
  );
  assert.deepEqual(
    rawSurfaceByModule.pack.capability_invocation_lifecycle.layers.map((entry: { layer_id: string }) => entry.layer_id),
    ['soft_discovery', 'scored_fit', 'hard_gate'],
  );
  assert.deepEqual(rawSurfaceByModule.pack.capability_invocation_lifecycle.layers[0].owner_modules, ['atlas', 'pack']);
  assert.deepEqual(rawSurfaceByModule.pack.capability_invocation_lifecycle.layers[1].owner_modules, [
    'pack',
    'stagecraft',
  ]);
  assert.deepEqual(rawSurfaceByModule.pack.capability_invocation_lifecycle.layers[2].owner_modules, [
    'current_owner_delta',
    'stagecraft',
    'runway',
  ]);
  assert.equal(
    rawSurfaceByModule.pack.capability_invocation_lifecycle.layers[2].fail_closed_on.includes('route_required_missing_capability_ref'),
    true,
  );
  assert.equal(
    rawSurfaceByModule.pack.capability_invocation_lifecycle.layers[2].forbidden_claims.includes('runway_writes_domain_truth'),
    true,
  );
  assert.equal(packInspect.object_model.primary_objects.includes('capability_invocation_lifecycle'), true);
  assert.equal(
    surfaces.console.app_read_model.projection_refs.includes('app_projection:capability_invocation_lifecycle'),
    true,
  );
  assert.equal(
    surfaces.connect.descriptor_surface.delegate_ids.includes('capability_invocation_lifecycle_descriptor'),
    true,
  );
  assert.equal(
    surfaces.runway.object_model.primary_objects.includes('capability_invocation_hard_gate'),
    true,
  );
  assert.equal(runwayInspect.forbidden_claims.includes('runway_writes_domain_truth'), true);
  assert.equal(runwayInspect.authority_boundary.can_write_domain_truth, false);
  assert.equal(runwayInspect.authority_boundary.can_sign_owner_receipt, false);
  assert.equal(runwayInspect.authority_boundary.can_create_typed_blocker, false);
});

test('pack brand module contract shape does not fail-close family evidence worklist', async () => {
  const contracts = loadFrameworkContracts(repoRoot);
  const output = await runFamilyRuntimeEvidenceWorklist(contracts, {
    familyDefaults: true,
    providerKind: 'temporal',
    executorKind: 'codex_cli',
    detailLevel: 'full',
    runtimeSnapshot: {
      runtime_tray_snapshot: {
        runtime_health: {
          provider_kind: 'temporal',
        },
        app_operator_drilldown: {
          app_execution_bridge: {
            safe_action_routes: [],
          },
          operator_action_routing_refs: {
            refs: [],
          },
          domain_evidence_request_refs: {
            external_receipts: [],
            evidence_gate_receipts: [],
          },
          domain_dispatch_evidence: {
            attempts: [],
          },
          default_caller_deletion_evidence_refs: {
            domains: [],
          },
          evidence_envelope: {
            surface_kind: 'opl_evidence_envelope_projection',
            model_version: 'evidence_envelope.v1',
            projection_policy: 'fixture_refs_only_projection',
            source_refs: ['/fixture/evidence_envelope'],
            summary: {
              envelope_count: 0,
              open_envelope_count: 0,
              closed_envelope_count: 0,
              blocked_envelope_count: 0,
              superseded_envelope_count: 0,
              owner_count: 0,
              owners: [],
            },
            authority_boundary: {
              refs_only: true,
              can_authorize_domain_ready: false,
              can_claim_production_ready: false,
            },
          },
        },
      },
    } as never,
    stageReadiness: {
      domains: [],
    },
  });
  const worklist = output.family_runtime_evidence_worklist;
  const packL5 = runCli(['brand-modules', 'l5-status', '--module', 'pack']).brand_module_l5_status;

  assert.equal(worklist.surface_kind, 'opl_family_runtime_evidence_worklist');
  assert.equal(worklist.family_defaults, true);
  assert.equal(worklist.summary.zero_open_worklist_is_domain_ready, false);
  assert.equal(worklist.summary.zero_open_worklist_is_production_ready, false);
  assert.equal(packL5.modules[0].module_id, 'pack');
  assert.equal(packL5.modules[0].current_level, 'L4_structural_baseline');
  assert.equal(packL5.modules[0].l5_completion_status, 'evidence_required');
  assert.equal(packL5.modules[0].l5_can_be_claimed, false);
});

test('brand modules interfaces expose CLI, app, descriptor, and validation surfaces without mutation authority', () => {
  const interfaces = runCli(['brand-modules', 'interfaces']).brand_module_interfaces;

  assert.equal(interfaces.surface_kind, 'opl_brand_module_interface_bundle');
  assert.equal(interfaces.module_count, 10);
  assert.equal(interfaces.cli.commands.includes('opl brand-modules list --json'), true);
  assert.equal(interfaces.cli.commands.includes('opl brand-modules l5-status --json'), true);
  assert.equal(interfaces.cli.commands.includes('opl runway l5-status --json'), true);
  assert.equal(interfaces.app.descriptors.some((entry: { action_id: string }) => entry.action_id === 'brand_modules_list'), true);
  assert.equal(interfaces.app.descriptors.some((entry: { action_id: string }) => entry.action_id === 'brand_modules_l5_status'), true);
  assert.equal(interfaces.descriptor.delegates.some((entry: { delegate_id: string }) => entry.delegate_id === 'brand_modules_registry'), true);
  assert.equal(interfaces.descriptor.delegates.some((entry: { delegate_id: string }) => entry.delegate_id === 'brand_modules_l5_evidence'), true);
  assert.equal(interfaces.validation.commands.includes('opl brand-modules validate --json'), true);
  assert.equal(interfaces.validation.commands.includes('opl brand-modules l5-validate --json'), true);
  assert.equal(interfaces.authority_boundary.can_claim_domain_ready, false);
  assert.equal(interfaces.authority_boundary.can_claim_quality_verdict, false);
  assert.equal(interfaces.authority_boundary.can_claim_artifact_authority, false);
  assert.equal(interfaces.authority_boundary.can_claim_production_ready, false);
  assert.equal(interfaces.authority_boundary.can_write_domain_truth, false);
  assert.equal(interfaces.authority_boundary.can_sign_owner_receipt, false);
});

test('Connect brand module surfaces use canonical Connect commands instead of retired implementation buckets', () => {
  const inspect = runCli(['brand-modules', 'inspect', '--module', 'connect']).brand_module;
  const status = runCli(['connect', 'status']).opl_connect_status;
  const interfaces = runCli(['connect', 'interfaces']).opl_connect_interfaces;
  const forbiddenCommands = [
    'opl skill sync --json',
    'opl skill list --json',
    'opl modules --json',
    'opl module install --module medautoscience --json',
    'opl packages manifest --json',
  ];

  assert.equal(inspect.module_id, 'connect');
  assert.equal(inspect.cli_surfaces.includes('opl connect update --module medautoscience --json'), true);
  assert.equal(inspect.cli_surfaces.includes('opl connect reinstall --module medautoscience --json'), true);
  assert.equal(inspect.cli_surfaces.includes('opl connect remove --module medautoscience --json'), true);
  assert.equal(inspect.cli_surfaces.includes('opl connect exec --module medautoscience -- doctor entry-modes'), true);
  assert.equal(inspect.validation_surfaces.includes('opl connect reconcile-modules --json'), true);

  for (const command of forbiddenCommands) {
    assert.equal(inspect.cli_surfaces.includes(command), false);
    assert.equal(status.native_cli_family.additional_commands.includes(command), false);
    assert.equal(interfaces.cli.commands.includes(command), false);
  }

  for (const command of [
    'opl connect skills --json',
    'opl connect sync-skills --json',
    'opl connect modules --json',
    'opl connect packages manifest --json',
    'opl connect reconcile-modules --json',
  ]) {
    assert.equal(status.native_cli_family.additional_commands.includes(command), true);
    assert.equal(interfaces.cli.commands.includes(command), true);
  }
});

test('brand module L5 validation passes the matrix shape while keeping readiness open', () => {
  const validation = runCli(['brand-modules', 'l5-validate']).brand_module_l5_validation;

  assert.equal(validation.status, 'valid');
  assert.equal(validation.l5_readiness_status, 'evidence_required');
  assert.equal(validation.validated_module_count, 10);
  assert.equal(validation.l5_complete_module_count, 0);
  assert.deepEqual(validation.evidence_required_module_ids, expectedModuleIds);
  assert.deepEqual(validation.missing_evidence_class_modules, []);
  assert.deepEqual(validation.false_completion_violations, []);
  assert.deepEqual(validation.completion_status_violations, []);
  assert.equal(validation.l5_claim_policy.docs_foldback_counts_as_l5, false);
  assert.equal(validation.authority_boundary.can_claim_production_ready, false);
});

test('brand module L5 status surfaces ledger typed blockers as owner-needed evidence without closing L5', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-brand-l5-ledger-blocker-state-'));
  const env = { OPL_STATE_DIR: stateDir };

  try {
      const record = runCli([
        'runtime',
        'brand-module-l5-evidence',
        'record',
        '--payload',
        JSON.stringify({
          module_id: 'charter',
          evidence_class_id: 'cross_agent_scaleout',
          typed_blocker_refs: ['typed-blocker:charter/cross-agent-scaleout-owner-needed'],
        }),
      ], env).brand_module_l5_evidence_ledger_record;
      const status = runCli(['brand-modules', 'l5-status', '--module', 'charter'], env).brand_module_l5_status;
      const module = status.modules[0];
      const route = module.owner_evidence_routes.find((entry: { class_id: string }) =>
        entry.class_id === 'cross_agent_scaleout'
      );

    assert.equal(status.status, 'evidence_required');
    assert.equal(status.module_count, 1);
    assert.equal(status.l5_complete_module_count, 0);
    assert.deepEqual(status.l5_complete_module_ids, []);
    assert.equal(module.module_id, 'charter');
    assert.equal(module.l5_can_be_claimed, false);
    assert.equal(module.evidence_required, true);
    assert.equal(module.next_action_summary.l5_can_be_claimed, false);
    assert.equal(module.next_action_summary.false_completion_guard.ready_claim_authorized, false);
    assert.equal(module.next_action_summary.false_completion_guard.verified_ledger_closes_l5, false);
      assert.equal(module.evidence_ledger.receipt_count, 1);
      assert.deepEqual(module.evidence_ledger.observed_evidence_class_ids, ['cross_agent_scaleout']);
    assert.equal(route.owner_route_status, 'owner_typed_blocker_recorded');
    assert.equal(route.blocker_state, 'typed_blocker_recorded');
    assert.equal(route.next_owner_action, 'resolve_typed_blocker_or_record_owner_acceptance_ref');
    assert.equal(route.owner_evidence_closure_state, 'owner_typed_blocker_recorded');
    assert.equal(route.ready_claim_authorized, false);
    assert.equal(route.observed_receipt_count, 1);
    assert.equal(route.observed_typed_blocker_ref_count, 2);
    assert.equal(route.verified_receipt_count, 0);
      assert.deepEqual(route.observed_receipt_refs, [record.receipt_ref]);
      assert.equal(
        route.observed_evidence_refs.includes(
          'typed-blocker:opl-brand-l5/charter/cross_agent_scaleout/owner-evidence-needed-20260612',
        ),
        true,
      );
      assert.equal(route.observed_evidence_refs.includes('typed-blocker:charter/cross-agent-scaleout-owner-needed'), true);
    assert.equal(route.observed_ref_shapes.includes('typed_blocker_ref'), true);
    assert.equal(route.observed_ref_shapes.includes('ledger_receipt_ref'), true);
    assert.equal(route.l5_claim_status, 'owner_typed_blocker_recorded_not_l5_claimed');
    assert.equal(route.authority_boundary.route_can_claim_l5, false);
    assert.equal(route.authority_boundary.route_can_create_typed_blocker, false);
      assert.deepEqual(
        module.next_action_summary.missing_evidence_groups.typed_blocker_recorded_class_ids,
        [
          'cross_agent_scaleout',
          'long_soak_recovery',
          'release_install_evidence',
          'cross_agent_foundry_agent_os_adoption',
        ],
      );
      assert.equal(module.next_action_summary.typed_blocker_recorded_class_count, 4);
      assert.equal(module.next_action_summary.observed_refs_not_l5_claim_class_count, 9);
    assert.equal(module.next_action_summary.missing_owner_evidence_class_count, 0);
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});

test('brand module L5 status separates owner-needed typed blockers from missing owner evidence across remaining requirements', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-brand-l5-owner-needed-state-'));
  const env = { OPL_STATE_DIR: stateDir };
    try {
      const status = runCli(['brand-modules', 'l5-status'], env).brand_module_l5_status;

    assert.equal(status.status, 'evidence_required');
    assert.equal(status.l5_complete_module_count, 0);
    assert.deepEqual(status.l5_complete_module_ids, []);
    for (const entry of status.modules as L5Module[]) {
      assert.equal(entry.evidence_required, true);
      assert.equal(entry.l5_can_be_claimed, false);
      assert.equal(entry.next_action_summary.false_completion_guard.ready_claim_authorized, false);
      assert.equal(entry.next_action_summary.false_completion_guard.verified_ledger_closes_l5, false);
      assert.equal(entry.next_action_summary.missing_owner_evidence_class_count, 0);
        assert.equal(
          entry.next_action_summary.observed_refs_not_l5_claim_class_count,
          entry.owner_evidence_routes.filter((route) =>
            route.owner_evidence_closure_state === 'owner_evidence_recorded_not_l5_claim'
          ).length,
        );
        assert.equal(
          entry.next_action_summary.typed_blocker_recorded_class_count,
          entry.owner_evidence_routes.filter((route) =>
            route.owner_evidence_closure_state === 'owner_typed_blocker_recorded'
          ).length,
        );
      assert.deepEqual(
        entry.next_action_summary.missing_evidence_groups.missing_owner_evidence_class_ids,
        [],
      );
        assert.deepEqual(
          entry.next_action_summary.missing_evidence_groups.typed_blocker_recorded_class_ids,
          entry.owner_evidence_routes
            .filter((route) => route.owner_evidence_closure_state === 'owner_typed_blocker_recorded')
            .map((route) => route.class_id),
        );
      assert.equal(
        entry.owner_evidence_routes.every((route) => route.ready_claim_authorized === false),
        true,
      );
        for (const classId of entry.next_action_summary.missing_evidence_groups.typed_blocker_recorded_class_ids) {
          const route = entry.owner_evidence_routes.find((candidate) => candidate.class_id === classId);
        assert.equal(route?.owner_route_status, 'owner_typed_blocker_recorded');
        assert.equal(route?.blocker_state, 'typed_blocker_recorded');
        assert.equal(route?.owner_evidence_closure_state, 'owner_typed_blocker_recorded');
        assert.equal(route?.observed_typed_blocker_ref_count, 1);
        assert.equal(route?.l5_claim_status, 'owner_typed_blocker_recorded_not_l5_claimed');
        assert.equal(route?.authority_boundary.route_can_claim_l5, false);
        assert.equal(route?.authority_boundary.route_can_create_typed_blocker, false);
      }
    }
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});

test('brand module L5 interfaces expose aggregate and module-owned read surfaces', () => {
  const interfaces = runCli(['brand-modules', 'l5-interfaces']).brand_module_l5_interfaces;

  assert.equal(interfaces.surface_kind, 'opl_brand_module_l5_interface_bundle');
  assert.equal(interfaces.cli.commands.includes('opl brand-modules l5-status --json'), true);
  assert.equal(interfaces.cli.commands.includes('opl brand-modules l5-status --module <module_id> --json'), true);
  assert.equal(interfaces.cli.commands.includes('opl brand-modules l5-validate --json'), true);
  assert.equal(interfaces.cli.commands.includes('opl brand-modules l5-interfaces --json'), true);
  assert.equal(interfaces.cli.commands.includes('opl runtime brand-module-l5-evidence record --payload <json> --json'), true);
  assert.equal(interfaces.cli.commands.includes('opl runtime brand-module-l5-evidence verify --receipt-ref <ref> --json'), true);
  assert.equal(interfaces.cli.commands.includes('opl runtime brand-module-l5-evidence list --module <module_id> --json'), true);
  assert.equal(interfaces.cli.commands.includes('opl runway l5-status --json'), true);
  assert.equal(interfaces.app.descriptors.some((entry: { action_id: string }) => entry.action_id === 'brand_modules_l5_status'), true);
  const evidenceRecord = interfaces.app.descriptors.find(
    (entry: { action_id: string }) => entry.action_id === 'brand_modules_l5_evidence_record',
  );
  assert.equal(evidenceRecord.command, 'opl runtime brand-module-l5-evidence record --payload <json> --json');
  assert.equal(evidenceRecord.mutation, true);
  assert.equal(interfaces.validation.commands.includes('opl brand-modules l5-validate --json'), true);
  assert.equal(interfaces.validation.commands.includes('opl runtime brand-module-l5-evidence verify --receipt-ref <ref> --json'), true);
  assert.equal(interfaces.authority_boundary.can_claim_domain_ready, false);
  assert.equal(interfaces.authority_boundary.can_claim_production_ready, false);
});

test('module-owned L5 status is readable from the module command surface and remains fail-closed', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runway-l5-status-state-'));
  const env = { OPL_STATE_DIR: stateDir };

  try {
    const aggregate = runCli(['brand-modules', 'l5-status', '--module', 'runway'], env).brand_module_l5_status;
    const output = runCli(['runway', 'l5-status'], env);
    const status = output.opl_runway_l5_status;

    assert.equal(aggregate.module_count, 1);
    assert.equal(aggregate.modules[0].module_id, 'runway');
    assert.equal(output.brand_module_l5_status.module_count, 1);
    assert.equal(status.surface_kind, 'opl_runway_l5_status');
    assert.equal(status.module_id, 'runway');
    assert.equal(status.status, 'evidence_required');
    assert.equal(status.l5_can_be_claimed, false);
    assert.equal(status.evidence_requirements.length, 13);
    assert.equal(status.owner_evidence_routes.length, 13);
    assert.equal(
      status.owner_evidence_routes.some((entry: {
        class_id: string;
        owner: string;
        owner_route_ref: string;
        owner_repo_ref: string;
        accepted_ref_shapes: string[];
      }) =>
        entry.class_id === 'owner_acceptance'
        && entry.owner === 'runtime and domain owners'
        && entry.owner_route_ref === 'opl-owner-route:brand-module/runway/owner_acceptance/domain-owner-repos'
        && entry.owner_repo_ref === 'MAS/MAG/RCA/OMA domain repositories'
        && entry.accepted_ref_shapes.includes('human_gate_ref')
      ),
      true,
    );
    assert.equal(
      status.owner_evidence_routes.some((entry: {
        class_id: string;
        accepted_ref_shapes: string[];
        blocker_state: string;
      }) =>
          entry.class_id === 'cross_agent_scaleout'
          && entry.accepted_ref_shapes.includes('scaleout_receipt_ref')
          && entry.blocker_state === 'typed_blocker_recorded'
        ),
      true,
    );
    assert.equal(status.evidence_requirements.some((entry: { class_id: string }) => entry.class_id === 'long_soak_recovery'), true);
    assert.equal(status.evidence_requirements.some((entry: { class_id: string }) => entry.class_id === 'domain_authority_false_boundary'), true);
    assert.equal(status.not_claims.includes('production_long_soak_complete'), true);
    assert.equal(status.not_claims.includes('provider_completion_is_domain_completion'), true);
    assert.equal(status.authority_boundary.can_claim_production_ready, false);
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});

test('bin/opl routes module-owned brand commands into the OPL CLI instead of Codex passthrough', () => {
  for (const [moduleId, surfaceKind] of [
    ['charter', 'opl_charter_brand_module_status'],
    ['pack', 'opl_pack_brand_module_status'],
  ] as const) {
    const result = spawnSync(
      path.join(repoRoot, 'bin', 'opl'),
      [moduleId, 'status', '--json'],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          NODE_NO_WARNINGS: '1',
          OPL_SKIP_SKILL_SYNC: '1',
        },
      },
    );

    assert.equal(result.status, 0, result.stderr);
    const output = parseJsonText(result.stdout) as Record<string, { status: string }> & {
      brand_module_surface: { surface_kind: string };
    };
    const moduleStatus = output[`opl_${moduleId.replaceAll('-', '_')}_status`];
    assert.equal(output.brand_module_surface.surface_kind, surfaceKind);
    assert.equal(moduleStatus.status, 'valid');
  }
});

test('bin/opl routes Foundry Agent series commands into the OPL CLI instead of Codex passthrough', () => {
  const result = spawnSync(
    path.join(repoRoot, 'bin', 'opl'),
    ['foundry', 'agents', 'inspect', 'mas', '--json'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        OPL_SKIP_SKILL_SYNC: '1',
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  const output = parseJsonText(result.stdout) as {
    foundry_agent: {
      agent_id: string;
      foundry_command_surface: string;
      surface_kind: string;
    };
  };
  assert.equal(output.foundry_agent.surface_kind, 'opl_foundry_agent_series_agent_inspect');
  assert.equal(output.foundry_agent.agent_id, 'mas');
  assert.equal(output.foundry_agent.foundry_command_surface, 'opl foundry agents inspect mas');
  assert.equal('compatibility_command_surface' in output.foundry_agent, false);
  assert.equal('domain_native_foundry_command_surface' in output.foundry_agent, false);
  assert.equal('direct_domain_cli' in output.foundry_agent, false);
});

test('Foundry exposes the evidence-grounded decision agent profile as a cross-cutting profile readback', () => {
  const output = runCli(['foundry', 'evidence-profile', 'inspect']);
  const profile = output.foundry_evidence_profile;

  assert.equal(
    profile.surface_kind,
    'opl_foundry_evidence_grounded_decision_agent_profile_inspect',
  );
  assert.equal(profile.profile_id, 'evidence_grounded_decision_agent_profile.v1');
  assert.equal(profile.no_new_brand_module, true);
  assert.equal(profile.implements_concrete_domain_agent, false);
  assert.equal(profile.implements_medical_or_hematology_agent, false);
  assert.equal(profile.module_owner_ids.includes('pack'), true);
  assert.equal(profile.module_owner_ids.includes('stagecraft'), true);
  assert.equal(profile.module_owner_ids.includes('runway'), true);
  assert.equal(profile.module_owner_ids.includes('ledger'), true);
  assert.equal(profile.first_class_object_names.includes('ModeRoutingReceipt'), true);
  assert.equal(profile.first_class_object_names.includes('EvidencePacket'), true);
  assert.equal(profile.first_class_object_names.includes('DecisionSupportArtifact'), true);
  assert.equal(profile.fail_closed_rule_ids.includes('no_evidence'), true);
  assert.equal(profile.fail_closed_rule_ids.includes('unsafe_tool_data_sharing'), true);
  assert.equal(profile.forbidden_claim_ids.includes('final_decision'), true);
  assert.equal(profile.authority_boundary.profile_can_claim_domain_ready, false);
  assert.equal(profile.authority_boundary.profile_can_claim_final_decision, false);
  assert.equal(profile.authority_boundary.pack_can_create_owner_receipt, false);
  assert.equal(profile.evidence_policy.body_storage_policy, 'refs_only_no_source_body_in_profile_contract');
  assert.equal(
    profile.unsupported_evidence_blocker_policy.required_blocker_reasons.includes(
      'required_provider_receipt_missing',
    ),
    true,
  );
});

import { spawnSync } from 'node:child_process';

import { assert, fs, loadFrameworkContracts, os, path, repoRoot, runCli, test } from '../helpers.ts';
import { runFamilyRuntimeEvidenceWorklist } from '../../../../src/family-runtime-evidence-worklist.ts';
import { parseRegisteredFamilyRuntimeCommand } from '../../../../src/family-runtime-command-parts/registry.ts';

const expectedModuleIds = [
  'charter',
  'atlas',
  'workspace',
  'pack',
  'stagecraft',
  'runway',
  'vault',
  'console',
  'foundry-lab',
  'connect',
];

const moduleSurfaceIds = expectedModuleIds.filter((moduleId) => moduleId !== 'workspace');
const runwayControlLoopStateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runway-control-loop-test-'));

test('brand module registry is loaded as a required framework contract', () => {
  const contracts = loadFrameworkContracts(repoRoot);

  assert.equal(contracts.brandModuleRegistry.scope, 'opl_brand_module_registry');
  assert.equal(contracts.brandModuleSurfaces.scope, 'opl_brand_module_executable_surfaces');
  assert.equal(contracts.brandModuleL5OperatingEvidence.scope, 'opl_brand_module_l5_operating_evidence');
  assert.equal(contracts.brandSystemProfile.scope, 'opl_brand_system_freeze_profile');
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

test('brand module L5 evidence gate is executable but does not claim production maturity', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-brand-l5-status-state-'));
  const env = { OPL_STATE_DIR: stateDir };

  try {
    const status = runCli(['brand-modules', 'l5-status'], env).brand_module_l5_status;

    assert.equal(status.surface_kind, 'opl_brand_module_l5_status');
    assert.equal(status.baseline_level, 'L4_structural_baseline');
    assert.equal(status.target_level, 'L5_production_operating_maturity');
    assert.equal(status.module_count, 10);
    assert.equal(status.l5_complete_module_count, 0);
    assert.deepEqual(status.l5_complete_module_ids, []);
    assert.deepEqual(status.evidence_required_module_ids, expectedModuleIds);
    assert.equal(status.l5_claim_policy.contract_validation_counts_as_l5, false);
    assert.equal(status.evidence_classes.length, 12);
    assert.equal(
      status.evidence_classes.some((entry: { class_id: string }) =>
        entry.class_id === 'capability_fail_open_boundary'
      ),
      true,
    );
    assert.equal(
      status.evidence_classes.some((entry: { class_id: string }) =>
        entry.class_id === 'cross_agent_foundry_agent_os_adoption'
      ),
      true,
    );
    assert.equal(status.modules.every((entry: { l5_can_be_claimed: boolean }) => entry.l5_can_be_claimed === false), true);
    assert.equal(status.owner_route_work_order_policy.surface_kind, 'opl_brand_module_l5_owner_route_work_order_policy');
    assert.equal(status.owner_route_work_order_policy.work_orders_close_l5, false);
    assert.equal(status.owner_route_work_order_policy.work_orders_can_create_owner_receipt, false);
    assert.equal(status.owner_route_work_order_policy.work_orders_can_create_typed_blocker, false);
    assert.equal(
      status.owner_route_work_order_policy.accepted_route_ref_shapes.includes('owner_acceptance_ref'),
      true,
    );
    assert.equal(
      status.owner_route_work_order_policy.accepted_route_ref_shapes.includes('typed_blocker_ref'),
      true,
    );
    assert.equal(
      status.modules.every((entry: {
        owner_evidence_routes: Array<{
          owner: string;
          owner_route_status: string;
          next_owner_action: string;
          accepted_ref_shapes: string[];
          authority_boundary: { route_can_claim_l5: boolean };
        }>;
      }) =>
        entry.owner_evidence_routes.length === status.evidence_classes.length
        && entry.owner_evidence_routes.every((route) =>
          route.owner.length > 0
          && route.owner_route_status === 'owner_evidence_required'
          && route.next_owner_action === 'record_owner_evidence_ref_or_typed_blocker_for_l5_requirement'
          && route.accepted_ref_shapes.includes('typed_blocker_ref')
          && route.authority_boundary.route_can_claim_l5 === false
        )
      ),
      true,
    );
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
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
    assert.equal(status.evidence_requirements.length, 12);
    assert.equal(status.owner_evidence_routes.length, 12);
    assert.equal(
      status.owner_evidence_routes.some((entry: {
        class_id: string;
        owner: string;
        accepted_ref_shapes: string[];
      }) =>
        entry.class_id === 'owner_acceptance'
        && entry.owner === 'runtime and domain owners'
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
        entry.class_id === 'long_soak_recovery'
        && entry.accepted_ref_shapes.includes('long_soak_ref')
        && entry.blocker_state === 'owner_route_evidence_missing'
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

test('Runway status and interfaces expose control-loop command objects without semantic authority', () => {
  const status = runCli(['runway', 'status']).opl_runway_status;
  const interfaces = runCli(['runway', 'interfaces']).opl_runway_interfaces;

  for (const objectId of [
    'control_loop',
    'progress_reconciler',
    'handoff_gate',
    'recovery_repair',
  ]) {
    assert.equal(status.object_model.includes(objectId), true);
  }
  for (const command of [
    'opl runway readiness --json',
    'opl runway reconcile --json',
    'opl runway control-loop status --json',
    'opl runway handoff-gates --json',
    'opl runway recovery-repair --json',
    'opl family-runtime control-loop status --provider temporal --json',
  ]) {
    assert.equal(interfaces.cli.commands.includes(command), true);
  }
  assert.equal(status.authority_boundary.can_write_domain_truth, false);
  assert.equal(status.authority_boundary.can_sign_owner_receipt, false);
  assert.equal(status.authority_boundary.can_create_typed_blocker, false);
  assert.equal(status.not_claims.includes('provider_completion_is_semantic_progress'), true);
});

test('family-runtime control-loop status command parses the Temporal substrate status surface', () => {
  const parsed = parseRegisteredFamilyRuntimeCommand([
    'control-loop',
    'status',
    '--provider',
    'temporal',
  ]);

  assert.deepEqual(parsed, {
    mode: 'control_loop_status',
    providerKind: 'temporal',
  });
});

test('family-runtime control-loop status distinguishes substrate liveness from semantic authority', () => {
  const output = runCli([
    'family-runtime',
    'control-loop',
    'status',
    '--provider',
    'temporal',
  ], {
    OPL_TEMPORAL_ADDRESS: '',
    TEMPORAL_ADDRESS: '',
    OPL_TEMPORAL_WORKER_STATUS: '',
  });
  const controlLoop = output.family_runtime_control_loop;

  assert.equal(controlLoop.surface_kind, 'opl_family_runtime_control_loop_status');
  assert.equal(controlLoop.provider_kind, 'temporal');
  assert.equal(controlLoop.provider_runtime.substrate, 'temporal');
  assert.equal(controlLoop.worker_supervisor_liveness.substrate, 'temporal_worker_supervisor');
  assert.equal(controlLoop.scheduler_cadence.substrate, 'temporal_scheduler');
  assert.equal(controlLoop.semantic_loop.progress_reconciler_id, 'runway_progress_reconciler');
  assert.equal(controlLoop.semantic_loop.provider_completion_is_semantic_progress, false);
  assert.equal(controlLoop.authority_boundary.can_write_domain_truth, false);
  assert.equal(controlLoop.authority_boundary.can_sign_owner_receipt, false);
  assert.equal(controlLoop.authority_boundary.can_create_typed_blocker, false);
  assert.equal(controlLoop.authority_boundary.can_authorize_domain_ready, false);
});

test('Runway control-loop status delegates to the family runtime control-loop surface', () => {
  const output = runCli([
    'runway',
    'control-loop',
    'status',
  ], {
    OPL_TEMPORAL_ADDRESS: '',
    TEMPORAL_ADDRESS: '',
    OPL_TEMPORAL_WORKER_STATUS: '',
  });
  const controlLoop = output.family_runtime_control_loop;

  assert.equal(controlLoop.surface_kind, 'opl_family_runtime_control_loop_status');
  assert.equal(controlLoop.module_id, 'runway');
  assert.equal(controlLoop.provider_runtime.substrate, 'temporal');
  assert.equal(controlLoop.worker_supervisor_liveness.substrate, 'temporal_worker_supervisor');
  assert.equal(controlLoop.semantic_loop.provider_completion_is_semantic_progress, false);
});

test('Runway control-loop sibling commands execute from the module surface', () => {
  const env = {
    OPL_TEMPORAL_ADDRESS: '',
    TEMPORAL_ADDRESS: '',
    OPL_TEMPORAL_WORKER_STATUS: '',
    OPL_STATE_DIR: runwayControlLoopStateDir,
  };
  const readiness = runCli(['runway', 'readiness'], env).opl_runway_readiness;
  const reconcile = runCli(['runway', 'reconcile'], env).opl_runway_reconcile;
  const handoff = runCli(['runway', 'handoff-gates'], env).opl_runway_handoff_gates;
  const repair = runCli(['runway', 'recovery-repair'], env).opl_runway_recovery_repair;

  assert.equal(readiness.surface_kind, 'opl_runway_readiness');
  assert.equal(readiness.readiness_status, 'blocked_provider_not_ready');
  assert.equal(readiness.next_safe_action.action_id, 'repair_provider_liveness');
  assert.equal(readiness.provider_backed_runtime_ready, false);
  assert.equal(readiness.authority_boundary.can_authorize_domain_ready, false);

  assert.equal(reconcile.surface_kind, 'opl_runway_reconcile');
  assert.equal(reconcile.reconciler_id, 'runway_progress_reconciler');
  assert.equal(reconcile.selected_next_safe_action.action_id, 'repair_provider_liveness');
  assert.equal(reconcile.mutation_performed, false);
  assert.equal(reconcile.forbidden_next_actions.includes('sign_owner_receipt'), true);

  assert.equal(handoff.surface_kind, 'opl_runway_handoff_gates');
  assert.equal(handoff.accepted_owner_answer_refs.includes('domain_owner_receipt_ref'), true);
  assert.equal(handoff.provider_completion_is_owner_answer, false);
  assert.equal(handoff.provider_completion_is_semantic_progress, false);

  assert.equal(repair.surface_kind, 'opl_runway_recovery_repair');
  assert.equal(repair.repair_status, 'repair_action_available');
  assert.equal(repair.selected_repair_action.action_id, 'repair_provider_liveness');
  assert.equal(repair.authority_boundary.can_create_typed_blocker, false);
});

test('bin/opl routes Runway control-loop sibling commands into OPL CLI', () => {
  for (const [args, key] of [
    [['runway', 'readiness', '--json'], 'opl_runway_readiness'],
    [['runway', 'reconcile', '--json'], 'opl_runway_reconcile'],
    [['runway', 'handoff-gates', '--json'], 'opl_runway_handoff_gates'],
    [['runway', 'recovery-repair', '--json'], 'opl_runway_recovery_repair'],
    [['runway', 'control-loop', 'status', '--json'], 'family_runtime_control_loop'],
  ] as const) {
    const result = spawnSync(
      path.join(repoRoot, 'bin', 'opl'),
      args,
      {
        cwd: repoRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          NODE_NO_WARNINGS: '1',
          OPL_SKIP_SKILL_SYNC: '1',
          OPL_TEMPORAL_ADDRESS: '',
          TEMPORAL_ADDRESS: '',
          OPL_TEMPORAL_WORKER_STATUS: '',
          OPL_STATE_DIR: runwayControlLoopStateDir,
        },
      },
    );

    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(typeof output[key], 'object');
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
    const output = JSON.parse(result.stdout);
    assert.equal(output.brand_module_surface.surface_kind, surfaceKind);
    assert.equal(output[`opl_${moduleId.replaceAll('-', '_')}_status`].status, 'valid');
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
  const output = JSON.parse(result.stdout);
  assert.equal(output.foundry_agent.surface_kind, 'opl_foundry_agent_series_agent_inspect');
  assert.equal(output.foundry_agent.agent_id, 'mas');
  assert.equal(output.foundry_agent.compatibility_command_surface, 'medautosci foundry');
});

test('each non-workspace brand module exposes its own executable status validate doctor and interfaces family', () => {
  const operations = ['status', 'inspect', 'interfaces', 'validate', 'doctor'] as const;

  for (const moduleId of moduleSurfaceIds) {
    const surfaceKindPrefix = `opl_${moduleId.replace(/-/g, '_')}`;

    for (const operation of operations) {
      const output = runCli([moduleId, operation]);
      const surface = output.brand_module_surface;

      assert.equal(surface.surface_kind, `${surfaceKindPrefix}_brand_module_${operation}`);
      assert.equal(surface.module_id, moduleId);
      assert.equal(surface.operation, operation);
      assert.equal(surface.canonical_command_surface, `opl ${moduleId}`);
      assert.equal(surface.status, operation === 'doctor' ? 'pass' : 'valid');
      assert.equal(surface.authority_boundary.can_claim_domain_ready, false);
      assert.equal(surface.authority_boundary.can_claim_quality_verdict, false);
      assert.equal(surface.authority_boundary.can_claim_artifact_authority, false);
      assert.equal(surface.authority_boundary.can_claim_production_ready, false);
      assert.equal(surface.authority_boundary.can_write_domain_truth, false);
      assert.equal(surface.authority_boundary.can_sign_owner_receipt, false);
    }

    const statusKey = `${surfaceKindPrefix}_status`;
    const validationKey = `${surfaceKindPrefix}_validation`;
    const doctorKey = `${surfaceKindPrefix}_doctor`;
    const interfacesKey = `${surfaceKindPrefix}_interfaces`;

    const status = runCli([moduleId, 'status'])[statusKey];
    assert.equal(status.module_id, moduleId);
    assert.equal(status.completion_level, 'L4_structural_baseline');
    assert.equal(status.status, 'valid');
    assert.equal(status.native_cli_family.status, `opl ${moduleId} status --json`);
    assert.equal(status.native_cli_family.inspect, `opl ${moduleId} inspect --json`);
    assert.equal(status.native_cli_family.interfaces, `opl ${moduleId} interfaces --json`);
    assert.equal(status.native_cli_family.validate, `opl ${moduleId} validate --json`);
    assert.equal(status.native_cli_family.doctor, `opl ${moduleId} doctor --json`);
    assert.equal(status.checks.every((entry: { status: string }) => entry.status === 'pass'), true);
    assert.equal(status.authority_boundary.can_claim_domain_ready, false);
    assert.equal(status.authority_boundary.can_sign_owner_receipt, false);

    const validation = runCli([moduleId, 'validate'])[validationKey];
    assert.equal(validation.status, 'valid');
    assert.equal(validation.contract_ref, `contracts/opl-framework/brand-module-surfaces.json#modules.${moduleId}`);
    assert.equal(validation.checks.every((entry: { status: string }) => entry.status === 'pass'), true);

    const doctor = runCli([moduleId, 'doctor'])[doctorKey];
    assert.equal(doctor.status, 'pass');
    assert.equal(doctor.next_safe_action, null);

    const interfaces = runCli([moduleId, 'interfaces'])[interfacesKey];
    assert.equal(interfaces.cli.commands.includes(`opl ${moduleId} status --json`), true);
    assert.equal(interfaces.cli.commands.includes(`opl ${moduleId} validate --json`), true);
    assert.equal(interfaces.app.descriptors.some((entry: { action_id: string }) => entry.action_id === `${moduleId.replace(/-/g, '_')}_status`), true);
    assert.equal(interfaces.descriptor.descriptor_refs.includes(`opl ${moduleId} interfaces --json`), true);
  }
});

test('workspace keeps its existing validate doctor and interfaces implementations while gaining status and inspect', () => {
  const statusOutput = runCli(['workspace', 'status']);
  const inspectOutput = runCli(['workspace', 'inspect']);
  const status = statusOutput.opl_workspace_status;
  const inspect = inspectOutput.opl_workspace_inspect;
  const interfaces = runCli(['workspace', 'interfaces']).workspace_interfaces;

  assert.equal(statusOutput.brand_module_surface.surface_kind, 'opl_workspace_brand_module_status');
  assert.equal(statusOutput.brand_module_surface.command_surface_collision_policy, 'preserve_workspace_operational_validate_doctor_interfaces');
  assert.equal(inspectOutput.brand_module_surface.surface_kind, 'opl_workspace_brand_module_inspect');
  assert.equal(inspectOutput.brand_module_surface.command_surface_collision_policy, 'preserve_workspace_operational_validate_doctor_interfaces');
  assert.equal(status.module_id, 'workspace');
  assert.equal(inspect.module_id, 'workspace');
  assert.equal(status.status, 'valid');
  assert.equal(inspect.status, 'valid');
  assert.equal(interfaces.surface_kind, 'opl_workspace_initialize_interfaces');
  assert.equal(interfaces.surfaces.cli.validator_command, 'opl workspace validate');
  assert.equal(interfaces.surfaces.cli.doctor_command, 'opl workspace doctor');
});

test('agent-owned internal modules expose the same branding spine without becoming OPL platform modules', () => {
  const list = runCli(['agents', 'modules', 'list']).agent_internal_modules;

  assert.equal(list.surface_kind, 'opl_agent_internal_brand_module_list');
  assert.deepEqual(list.platform_module_ids, expectedModuleIds);
  assert.deepEqual(list.agent_module_ids, expectedModuleIds.map((moduleId) => `agent-${moduleId}`));
  assert.equal(list.domain_count, 3);
  assert.equal(list.module_count_per_domain, 10);
  assert.equal(list.canonical_command_surface, 'opl agents modules');
  assert.equal(list.authority_boundary.can_write_domain_truth, false);
  assert.equal(list.authority_boundary.can_replace_domain_owner, false);

  const inspect = runCli([
    'agents',
    'modules',
    'inspect',
    '--domain',
    'medautoscience',
    '--module',
    'agent-runway',
  ]).agent_internal_module;

  assert.equal(inspect.surface_kind, 'opl_agent_internal_brand_module_inspect');
  assert.equal(inspect.domain_id, 'medautoscience');
  assert.equal(inspect.agent_module_id, 'agent-runway');
  assert.equal(inspect.platform_analogue_module_id, 'runway');
  assert.equal(inspect.canonical_command_surface, 'opl agents modules');
  assert.equal(inspect.module_command_surface, 'opl agents modules inspect --domain medautoscience --module agent-runway');
  assert.equal(inspect.authority_boundary.can_write_domain_truth, false);
  assert.equal(inspect.authority_boundary.can_claim_production_ready, false);

  const interfaces = runCli(['agents', 'modules', 'interfaces']).agent_internal_module_interfaces;
  assert.equal(interfaces.surface_kind, 'opl_agent_internal_brand_module_interfaces');
  assert.equal(interfaces.cli.commands.includes('opl agents modules validate --json'), true);
  assert.equal(interfaces.descriptor.refs.includes('contracts/opl-framework/brand-cli-governance.json#agent_internal_modules'), true);
  assert.equal(interfaces.authority_boundary.can_write_domain_truth, false);

  const validation = runCli(['agents', 'modules', 'validate']).agent_internal_module_validation;
  assert.equal(validation.surface_kind, 'opl_agent_internal_brand_module_validation');
  assert.equal(validation.status, 'valid');
  assert.deepEqual(validation.missing_domain_module_sets, []);

  const doctor = runCli(['agents', 'modules', 'doctor']).agent_internal_module_doctor;
  assert.equal(doctor.surface_kind, 'opl_agent_internal_brand_module_doctor');
  assert.equal(doctor.status, 'pass');
});

test('Foundry Agent series exposes a shared CLI spine instead of copying OPL brand modules into each agent', () => {
  for (const operation of ['status', 'inspect', 'interfaces', 'validate', 'doctor', 'peers']) {
    const output = runCli(['agents', 'foundry', operation]).foundry_agent_cli_spine;

    assert.equal(output.series_id, 'opl_foundry_agent_series.v1');
    assert.equal(output.series_label, 'OPL Foundry Agent');
    assert.equal(output.operation, operation);
    assert.equal(output.canonical_command_surface, 'opl agents foundry');
    assert.equal(output.status, operation === 'doctor' ? 'pass' : 'valid');
    assert.equal(output.command_surface_policy.agent_cli_uses_foundry_series_spine, true);
    assert.equal(output.command_surface_policy.agent_cli_does_not_replicate_opl_nine_brand_modules, true);
    assert.equal(output.command_surface_policy.old_implementation_buckets_are_not_ordinary_command_surfaces, true);
    assert.equal('canonical_frontdoor' in output, false);
    assert.equal('frontdoor_policy' in output, false);
    assert.equal('ordinary_frontdoor' in output, false);
    assert.deepEqual(
      output.spine.map((entry: { object: string }) => entry.object),
      ['workspace', 'work', 'stage', 'run', 'vault', 'handoff', 'connect'],
    );
    assert.deepEqual(
      output.peers.map((entry: { agent_id: string }) => entry.agent_id),
      ['mas', 'mag', 'rca', 'oma'],
    );
    assert.equal(output.authority_boundary.generated_surface_can_write_domain_truth, false);
    assert.equal(output.authority_boundary.generated_surface_can_create_owner_receipt, false);
    assert.equal(output.mcp_and_skill_policy.skill_pack_must_delegate_to_series_spine, true);
    assert.equal(output.mcp_and_skill_policy.mcp_descriptor_must_delegate_to_series_spine, true);
    assert.equal(output.mcp_and_skill_policy.expose_legacy_buckets_as_diagnostic_or_migration_only, true);
    assert.equal(
      output.retired_implementation_buckets.some((entry: { bucket: string }) => entry.bucket === 'skill'),
      true,
    );
  }
});

test('OPL Foundry Agent index exposes MAS MAG RCA OMA direct and generated CLI command surfaces', () => {
  const list = runCli(['foundry', 'agents', 'list']).foundry_agents;
  assert.deepEqual(
    list.agents.map((entry: { agent_id: string }) => entry.agent_id),
    ['mas', 'mag', 'rca', 'oma'],
  );
  assert.deepEqual(
    list.agents.map((entry: { foundry_command_surface: string }) => entry.foundry_command_surface),
    ['medautosci foundry', 'medautogrant foundry', 'redcube foundry', 'opl foundry agents inspect oma'],
  );
  assert.deepEqual(
    list.agents.map((entry: { cli_smoke: { executable_brand_cli_command_surface: string | null } }) =>
      entry.cli_smoke.executable_brand_cli_command_surface
    ),
    [null, null, null, null],
  );
  assert.deepEqual(
    list.agents.map((entry: { cli_smoke: { json_flag_aliases: string[] } }) =>
      entry.cli_smoke.json_flag_aliases
    ),
    [
      ['--json', '--format json'],
      ['--json', '--format json'],
      ['--json', '--format json'],
      ['--json'],
    ],
  );

  const mas = runCli(['foundry', 'agents', 'inspect', 'mas']).foundry_agent;
  assert.equal(mas.status, 'direct_domain_surface_ready');
  assert.equal(mas.work_object.natural_alias, 'study');
  assert.equal(mas.brand_cli, 'mas');
  assert.equal(mas.cli_smoke.executable_brand_cli_command_surface, null);
  assert.equal(mas.cli_smoke.executable_direct_cli_command_surface, 'medautosci foundry');
  assert.equal('foundry_frontdoor' in mas, false);
  assert.equal('compatibility_frontdoor' in mas, false);
  assert.equal('executable_brand_cli_frontdoor' in mas.cli_smoke, false);
  assert.equal(mas.cli_smoke.status_json_command, 'medautosci foundry status --json');
  assert.equal(mas.compatibility_command_surface, 'medautosci foundry');
  assert.equal(mas.mcp_projection.mcp_descriptor_must_delegate_to_series_spine, true);

  const mag = runCli(['foundry', 'agents', 'inspect', 'mag']).foundry_agent;
  assert.equal(mag.status, 'direct_domain_surface_ready');
  assert.equal(mag.brand_cli, 'mag');
  assert.equal(mag.foundry_command_surface, 'medautogrant foundry');
  assert.equal(mag.cli_smoke.executable_brand_cli_command_surface, null);
  assert.equal(
    mag.cli_smoke.executable_direct_cli_command_surface,
    '<med-autogrant-repo>/scripts/run-python-clean.sh -m med_autogrant.cli foundry',
  );
  assert.equal(
    mag.cli_smoke.status_json_command,
    '<med-autogrant-repo>/scripts/run-python-clean.sh -m med_autogrant.cli foundry status --json',
  );
  assert.equal(mag.cli_smoke.compatibility_status_json_command, 'medautogrant foundry status --json');

  const rca = runCli(['foundry', 'agents', 'inspect', 'rca']).foundry_agent;
  assert.equal(rca.status, 'direct_domain_surface_ready');
  assert.equal(rca.brand_cli, 'rca');
  assert.equal(rca.foundry_command_surface, 'redcube foundry');
  assert.equal(rca.cli_smoke.executable_brand_cli_command_surface, null);
  assert.equal(
    rca.cli_smoke.executable_direct_cli_command_surface,
    'npm run --prefix <redcube-ai-repo> redcube -- foundry',
  );
  assert.equal(
    rca.cli_smoke.status_json_command,
    'npm run --prefix <redcube-ai-repo> redcube -- foundry status --json',
  );
  assert.equal(rca.cli_smoke.compatibility_status_json_command, 'redcube foundry status --json');

  const oma = runCli(['foundry', 'agents', 'inspect', 'oma']).foundry_agent;
  assert.equal(oma.status, 'generated_surface_only');
  assert.equal(oma.direct_domain_cli, 'opl agents interfaces --repo-dir <opl-meta-agent-repo>');
  assert.equal(oma.foundry_command_surface, 'opl foundry agents inspect oma');
  assert.equal(oma.compatibility_command_surface, 'opl agents interfaces --repo-dir <opl-meta-agent-repo>');
  assert.equal(oma.cli_smoke.executable_brand_cli_command_surface, null);
  assert.equal(oma.direct_cli_command_surface_policy.first_screen_must_identify_series, true);
});

import { assert, fs, parseJsonText, path, runCli, test } from '../helpers.ts';
import { buildReadyAgentRepo, writeJson } from './agents-conformance-fixtures.ts';
import { buildFunctionalPrivatizationAudit } from '../../../../src/modules/foundry-lab/functional-privatization-audit.ts';

test('generated interfaces expose a family-defaults source for readiness drilldown', () => {
  const report = runCli([
    'agents',
    'interfaces',
    '--family-defaults',
  ]).generated_agent_interfaces;

  assert.equal(report.surface_kind, 'opl_generated_agent_interfaces_family_report');
  assert.equal(report.owner, 'one-person-lab');
  assert.equal(report.status, 'blocked');
  assert.equal(report.summary.total_domain_count, report.reports.length);
  assert.equal(report.summary.ready_domain_count, 3);
  assert.equal(report.summary.blocked_domain_count, 2);
  for (const agentId of ['mas', 'mag', 'rca', 'oma', 'obf']) {
    assert.equal(
      report.reports.some((entry: { requested_agent_id: string }) => entry.requested_agent_id === agentId),
      true,
    );
  }
  for (const [agentId, targetDomainId] of [
    ['mas', 'mas'],
    ['mag', 'med-autogrant'],
    ['oma', 'opl-meta-agent'],
  ]) {
    const entry = report.reports.find(
      (candidate: { requested_agent_id: string }) => candidate.requested_agent_id === agentId,
    );
    assert.equal(entry.agent_id, agentId);
    assert.equal(entry.target_domain_id, targetDomainId);
    assert.equal(entry.compiler_status, 'ready');
  }
  for (const agentId of ['rca', 'obf']) {
    const entry = report.reports.find(
      (candidate: { requested_agent_id: string }) => candidate.requested_agent_id === agentId,
    );
    assert.equal(entry.agent_id, null);
    assert.equal(entry.target_domain_id, null);
    assert.equal(entry.compiler_status, 'blocked');
  }
  assert.equal(
    report.reports.some((entry: { agent_id: string; repo_dir: string }) => (
      entry.agent_id === 'oma'
      && entry.repo_dir.endsWith('/opl-meta-agent')
    )),
    true,
  );
  assert.equal(
    report.reports.some(
      (entry: { requested_agent_id: string }) => entry.requested_agent_id === 'mas-scholar-skills',
    ),
    false,
  );
  assert.equal(report.authority_boundary.report_can_claim_domain_ready, false);
  assert.equal(report.authority_boundary.report_can_claim_production_ready, false);
  assert.equal(
    report.reports.every((entry: {
      compiler_status: string;
      generated_agent_interfaces: { owner: string | null };
    }) => (
      (entry.generated_agent_interfaces.owner ?? null) === (
        entry.compiler_status === 'ready' ? 'one-person-lab' : null
      )
    )),
    true,
  );
});

test('generated interfaces and default callers accept domain action adapter export dispatch as domain handler target', () => {
  const repoDir = buildReadyAgentRepo();
  const handoffPath = path.join(repoDir, 'contracts', 'generated_surface_handoff.json');
  const handoff = parseJsonText(fs.readFileSync(handoffPath, 'utf8')) as any;
  handoff.generated_surfaces = handoff.generated_surfaces.map((surface: { surface_id?: string }) => (
    surface.surface_id === 'domain_handler'
      ? {
          ...surface,
          surface_id: 'domain_action_adapter_export_dispatch',
          owner: 'SampleBriefAgent',
        }
      : surface
  ));
  handoff.handoff_surfaces = handoff.handoff_surfaces.map((surface: { surface_id?: string }) => (
    surface.surface_id === 'domain_handler'
      ? {
          ...surface,
          surface_id: 'domain_action_adapter_export_dispatch',
          current_paths: ['runtime/domain-action-adapter-export-dispatch.ts'],
        }
      : surface
  ));
  writeJson(handoffPath, handoff);

  const auditPath = path.join(repoDir, 'contracts', 'functional_privatization_audit.json');
  const audit = parseJsonText(fs.readFileSync(auditPath, 'utf8')) as any;
  audit.modules = audit.modules.map((module: { module_id?: string }) => (
    module.module_id === 'sample_brief_domain_handler'
      ? {
          ...module,
          module_id: 'sample_brief_domain_action_adapter_export_dispatch',
          code_paths: ['runtime/domain-action-adapter-export-dispatch.ts'],
          current_surface_refs: ['domain_action_adapter_export_dispatch'],
          active_caller_status: 'domain_action_adapter_export_dispatch_returns_owner_receipt_or_typed_blocker',
        }
      : module
  ));
  writeJson(auditPath, audit);

  const bundle = runCli(['agents', 'interfaces', '--repo-dir', repoDir]).generated_agent_interfaces;
  const domainHandlerScope = bundle.generated_wrapper_bundle.descriptor_scope.find(
    (scope: { surface_id: string }) => scope.surface_id === 'domain_handler',
  );
  assert.equal(bundle.status, 'ready');
  assert.equal(bundle.generated_wrapper_bundle.status, 'ready');
  assert.deepEqual(domainHandlerScope.canonical_target_surface_ids, [
    'domain_action_adapter_export_dispatch',
    'domain_action_adapter',
    'domain_handler',
  ]);
  assert.equal(domainHandlerScope.active_caller_module_id, 'sample_brief_domain_action_adapter_export_dispatch');

  const defaultCallers = runCli([
    'agents',
    'default-callers',
    '--agent',
    `sample=${repoDir}`,
  ]).agent_default_caller_readiness;
  const report = defaultCallers.reports[0];
  const domainHandlerGate = report.surface_gates.find(
    (gate: { surface_id: string }) => gate.surface_id === 'domain_handler',
  );
  assert.equal(defaultCallers.status, 'ready_domain_evidence_required');
  assert.deepEqual(domainHandlerGate.canonical_target_surface_ids, [
    'domain_action_adapter_export_dispatch',
    'domain_action_adapter',
    'domain_handler',
  ]);
  assert.equal(
    domainHandlerGate.deletion_evidence_worklist.replacement_parity.source_refs.includes(
      'active_caller_target_proof.surface_targets.domain_action_adapter_export_dispatch',
    ),
    true,
  );
});

test('generated interfaces accept OPL storage substrate with MAS refs projection as standard inventory', () => {
  const repoDir = buildReadyAgentRepo();
  const auditPath = path.join(repoDir, 'contracts', 'functional_privatization_audit.json');
  const audit = parseJsonText(fs.readFileSync(auditPath, 'utf8')) as any;
  audit.modules.push({
    module_id: 'runtime_storage_maintenance',
    classification: 'domain_authority_refs',
    migration_class: 'opl_storage_substrate_mas_refs_projection',
    owner: 'one-person-lab',
    code_paths: ['src/med_autoscience/controllers/restore_proof_compaction_helpers.py'],
    current_ref_status: 'opl_owned_storage_substrate_mas_refs_only_projection',
    authority_boundary: 'opl_storage_substrate_mas_refs_only_projection_no_generic_cleanup_policy_owner',
    retention_reason: 'OPL owns runtime storage maintenance; MAS exposes refs only.',
  });
  writeJson(auditPath, audit);

  const bundle = runCli(['agents', 'interfaces', '--repo-dir', repoDir]).generated_agent_interfaces;
  assert.equal(bundle.status, 'ready');
  const normalizedAudit = buildFunctionalPrivatizationAudit({ functional_privatization_audit: audit });
  const storageModule = normalizedAudit.modules.find(
    (module: { module_id: string }) => module.module_id === 'runtime_storage_maintenance',
  );
  if (!storageModule) {
    throw new Error('runtime_storage_maintenance module missing from normalized audit');
  }
  assert.equal(storageModule.migration_class, 'opl_storage_substrate_mas_refs_projection');
  assert.equal(storageModule.standardization_layer, 'standard_domain_pack_inventory');
  assert.equal(normalizedAudit.summary.default_watchlist_count, 0);

  const defaultCallers = runCli([
    'agents',
    'default-callers',
    '--agent',
    `sample=${repoDir}`,
  ]).agent_default_caller_readiness;
  assert.equal(defaultCallers.status, 'ready_domain_evidence_required');
});

test('generated interfaces project stage pack v2 tool affordance boundaries into all stage routes', () => {
  const repoDir = buildReadyAgentRepo();
  const bundle = runCli(['agents', 'interfaces', '--repo-dir', repoDir]).generated_agent_interfaces;
  const stageRoute = bundle.stage_routes[0];

  assert.equal(stageRoute.tool_refs[0].ref, 'agent/tools/domain_affordances.md');
  assert.equal(stageRoute.tool_refs[0].role, 'stage_tool_affordance_catalog');
  assert.equal(
    stageRoute.tool_affordance_boundary.catalog_role,
    'available_affordance_catalog_not_workflow_script',
  );
  assert.equal(stageRoute.tool_affordance_boundary.tool_ref_count, 1);
  assert.equal(stageRoute.tool_affordance_boundary.capability_refs[0].ref, 'agent/tools/domain_affordances.md');
  assert.equal(stageRoute.tool_affordance_boundary.executor_autonomy.executor_can_choose_tools, true);
  assert.equal(stageRoute.tool_affordance_boundary.executor_autonomy.executor_can_skip_tools, true);
  assert.equal(
    stageRoute.tool_affordance_boundary.executor_autonomy.executor_can_choose_order_and_parallelism,
    true,
  );
  assert.equal(
    stageRoute.tool_affordance_boundary.executor_autonomy.tool_catalog_can_prescribe_tool_sequence,
    false,
  );
  assert.equal(
    stageRoute.tool_affordance_boundary.executor_autonomy.tool_catalog_can_define_cognitive_strategy,
    false,
  );
  assert.deepEqual(
    bundle.product_session.session_routes[0].tool_affordance_boundary,
    stageRoute.tool_affordance_boundary,
  );
  assert.deepEqual(bundle.workbench.stage_routes[0].tool_refs, stageRoute.tool_refs);
});

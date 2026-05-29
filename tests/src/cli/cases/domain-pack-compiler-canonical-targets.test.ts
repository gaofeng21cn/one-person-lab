import { assert, fs, path, runCli, test } from '../helpers.ts';
import { buildReadyAgentRepo, writeJson } from './agents-conformance-fixtures.ts';

test('generated interfaces expose a family-defaults source for readiness drilldown', () => {
  const report = runCli([
    'agents',
    'interfaces',
    '--family-defaults',
  ]).generated_agent_interfaces;

  assert.equal(report.surface_kind, 'opl_generated_agent_interfaces_family_report');
  assert.equal(report.owner, 'one-person-lab');
  assert.equal(report.status, 'ready');
  assert.equal(report.summary.total_domain_count, 4);
  assert.equal(report.summary.ready_domain_count, report.summary.total_domain_count);
  assert.equal(report.summary.blocked_domain_count, 0);
  assert.equal(
    report.reports.some((entry: { agent_id: string; repo_dir: string }) => (
      entry.agent_id === 'opl-meta-agent'
      && entry.repo_dir.endsWith('/opl-meta-agent')
    )),
    true,
  );
  assert.equal(report.authority_boundary.report_can_claim_domain_ready, false);
  assert.equal(report.authority_boundary.report_can_claim_production_ready, false);
  assert.equal(
    report.reports.every((entry: { generated_agent_interfaces: { owner: string } }) => (
      entry.generated_agent_interfaces.owner === 'one-person-lab'
    )),
    true,
  );
});

test('generated interfaces and default callers accept domain action adapter export dispatch as domain handler target', () => {
  const repoDir = buildReadyAgentRepo();
  const handoffPath = path.join(repoDir, 'contracts', 'generated_surface_handoff.json');
  const handoff = JSON.parse(fs.readFileSync(handoffPath, 'utf8'));
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
  const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
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

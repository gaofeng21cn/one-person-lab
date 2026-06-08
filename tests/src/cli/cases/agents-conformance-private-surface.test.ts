import { assert, fs, path, runCli, test } from '../helpers.ts';
import {
  buildReadyAgentRepo,
  writeJson,
} from './agents-conformance-fixtures.ts';

test('agents conformance blocks active private generic residue before standard-agent thinning passes', () => {
  const repoDir = buildReadyAgentRepo();
  const functionalAuditPath = path.join(repoDir, 'contracts', 'functional_privatization_audit.json');
  const functionalAudit = JSON.parse(fs.readFileSync(functionalAuditPath, 'utf8'));
  functionalAudit.modules.push({
    module_id: 'sample_brief_legacy_scheduler',
    classification: 'generic_scheduler_or_daemon',
    owner: 'SampleBriefAgent',
    code_paths: ['runtime/legacy-scheduler.ts'],
    active_callers: ['legacy local cadence'],
    active_caller_status: 'active_private_scheduler_still_called',
    migration_action: 'move_to_opl_provider_scheduler_then_tombstone',
  });
  writeJson(functionalAuditPath, functionalAudit);

  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ]).standard_domain_agent_conformance;
  const checks = report.reports[0].private_surface_checks;

  assert.equal(report.status, 'blocked');
  assert.equal(checks.status, 'blocked');
  assert.equal(checks.active_private_generic_residue_count, 1);
  assert.equal(checks.default_watchlist_count, 1);
  assert.equal(
    checks.blockers.includes('functional_audit_active_private_generic_residue_not_retired:1'),
    true,
  );
  assert.equal(
    checks.blockers.includes('functional_audit_default_watchlist_not_empty:1'),
    true,
  );
});

test('agents conformance blocks retired route aliases from re-entering active caller inventory', () => {
  const repoDir = buildReadyAgentRepo();
  const functionalAuditPath = path.join(repoDir, 'contracts', 'functional_privatization_audit.json');
  const functionalAudit = JSON.parse(fs.readFileSync(functionalAuditPath, 'utf8'));
  functionalAudit.modules.push({
    module_id: 'retired_product_api_alias',
    classification: 'diagnostic_cleanup_path',
    owner: 'SampleBriefAgent',
    code_paths: ['bin/legacy-product-api-alias.ts'],
    active_callers: ['legacy product API alias'],
    active_caller_status: 'retired_route_alias_no_active_caller',
    retired_route_alias_allowed: true,
    migration_action: 'tombstone_only',
  });
  writeJson(functionalAuditPath, functionalAudit);

  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ]).standard_domain_agent_conformance;
  const checks = report.reports[0].private_surface_checks;

  assert.equal(report.status, 'passed');
  assert.equal(checks.status, 'passed');
  assert.deepEqual(checks.private_platform_residue_module_ids, ['retired_product_api_alias']);
  assert.equal(checks.default_watchlist_count, 0);
  assert.equal(checks.source_purity_tail_read_model.private_platform_residue_inventory_audit_only_count, 1);
  assert.equal(checks.source_purity_tail_read_model.private_platform_residue_inventory_counts_as_action_required, false);
  assert.equal(checks.source_purity_tail_read_model.private_platform_residue_inventory_counts_as_blocker, false);
});

test('agents conformance classifies private platform residue deletion gate dispositions', () => {
  const repoDir = buildReadyAgentRepo();
  const functionalAuditPath = path.join(repoDir, 'contracts', 'functional_privatization_audit.json');
  const functionalAudit = JSON.parse(fs.readFileSync(functionalAuditPath, 'utf8'));
  functionalAudit.modules.push(
    {
      module_id: 'mas_scheduler_residue',
      classification: 'generic_scheduler_or_daemon',
      owner: 'MAS',
      code_paths: ['src/med_autoscience/runtime/scheduler.py'],
      active_callers: ['legacy local cadence'],
      active_caller_status: 'active_private_scheduler_still_called',
      migration_action: 'absorb_to_opl_runway_provider_queue',
      private_platform_residue_gate: {
        residue_kind: 'scheduler',
        disposition: 'absorb_opl_primitive',
      },
    },
    {
      module_id: 'mag_queue_residue',
      classification: 'generic_queue_or_attempt_ledger',
      owner: 'MAG',
      code_paths: ['src/med_autogrant/runtime/queue.py'],
      active_callers: [],
      active_caller_status: 'no_active_caller_after_opl_queue_cutover',
      migration_action: 'delete_after_no_active_caller_gate',
      private_platform_residue_gate: {
        residue_kind: 'queue',
        disposition: 'no_active_caller_delete',
      },
    },
    {
      module_id: 'rca_runtime_watch_residue',
      classification: 'generic_runtime_watch',
      owner: 'RCA',
      code_paths: ['src/runtimeWatch.ts'],
      active_callers: ['visual export owner review'],
      active_caller_status: 'owner_typed_blocker_required_before_cleanup',
      migration_action: 'return_owner_typed_blocker_or_keep_authority_ref',
      private_platform_residue_gate: {
        residue_kind: 'runtime_watch',
        disposition: 'owner_typed_blocker',
      },
    },
    {
      module_id: 'oma_agent_lab_materializer_residue',
      classification: 'generic_agent_lab_materializer',
      owner: 'OPL Meta Agent',
      code_paths: ['scripts/agent-lab-materializer.ts'],
      active_callers: [],
      active_caller_status: 'historical_work_order_fixture_only',
      migration_action: 'history_tombstone_only',
      private_platform_residue_gate: {
        residue_kind: 'agent_lab_materializer',
        disposition: 'tombstone',
      },
    },
    {
      module_id: 'rca_visual_authority_wrapper',
      classification: 'domain_authority',
      owner: 'RCA',
      code_paths: ['src/authority/visual-export.ts'],
      active_callers: ['domain handler target'],
      active_caller_status: 'retained_authority_function_target',
      migration_action: 'keep_as_minimal_authority_function',
      private_platform_residue_gate: {
        residue_kind: 'domain_wrapper',
        disposition: 'retain_authority_function',
      },
    },
  );
  writeJson(functionalAuditPath, functionalAudit);

  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ]).standard_domain_agent_conformance;
  const checks = report.reports[0].private_surface_checks;
  const cleanupGate = checks.private_platform_residue_deletion_gate;

  assert.equal(report.status, 'blocked');
  assert.equal(checks.status, 'blocked');
  assert.equal(cleanupGate.physical_delete_authorized, false);
  assert.deepEqual(cleanupGate.allowed_dispositions, [
    'retain_authority_function',
    'absorb_opl_primitive',
    'no_active_caller_delete',
    'tombstone',
    'owner_typed_blocker',
  ]);
  assert.deepEqual(cleanupGate.residue_target_kinds, [
    'scheduler',
    'queue',
    'session_store',
    'workbench',
    'status_shell',
    'domain_wrapper',
    'runtime_watch',
    'agent_lab_materializer',
  ]);
  assert.equal(cleanupGate.disposition_summary.absorb_opl_primitive, 1);
  assert.equal(cleanupGate.disposition_summary.no_active_caller_delete, 1);
  assert.equal(cleanupGate.disposition_summary.owner_typed_blocker, 1);
  assert.equal(cleanupGate.disposition_summary.tombstone, 1);
  assert.equal(cleanupGate.disposition_summary.retain_authority_function, 1);
  assert.deepEqual(cleanupGate.by_residue_kind.scheduler.map((item: { module_id: string }) => item.module_id), [
    'mas_scheduler_residue',
  ]);
  assert.deepEqual(cleanupGate.by_residue_kind.queue.map((item: { module_id: string }) => item.module_id), [
    'mag_queue_residue',
  ]);
  assert.deepEqual(cleanupGate.by_residue_kind.runtime_watch.map((item: { module_id: string }) => item.module_id), [
    'rca_runtime_watch_residue',
  ]);
  assert.deepEqual(
    cleanupGate.by_residue_kind.agent_lab_materializer.map((item: { module_id: string }) => item.module_id),
    ['oma_agent_lab_materializer_residue'],
  );
  assert.equal(cleanupGate.by_residue_kind.domain_wrapper[0].disposition, 'retain_authority_function');
});

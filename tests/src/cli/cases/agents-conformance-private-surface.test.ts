import { assert, fs, parseJsonText, path, runCliReadOnly, test } from '../helpers.ts';
import {
  buildReadyAgentRepo,
  writeJson,
} from './agents-conformance-fixtures.ts';

test('agents conformance blocks active private generic residue before standard-agent thinning passes', async () => {
  const repoDir = buildReadyAgentRepo();
  const functionalAuditPath = path.join(repoDir, 'contracts', 'functional_privatization_audit.json');
  const functionalAudit = parseJsonText(fs.readFileSync(functionalAuditPath, 'utf8')) as Record<string, any>;
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

  const report = (await runCliReadOnly([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ])).standard_domain_agent_conformance;
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

test('agents conformance blocks generic source behavior omitted from the domain audit', async () => {
  const repoDir = buildReadyAgentRepo();
  const privateSchedulerPath = path.join(repoDir, 'src', 'private-scheduler.ts');
  fs.mkdirSync(path.dirname(privateSchedulerPath), { recursive: true });
  fs.writeFileSync(privateSchedulerPath, 'setInterval(() => runNextTask(), 60_000);\n');

  const report = (await runCliReadOnly([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ])).standard_domain_agent_conformance;
  const checks = report.reports[0].source_behavior_checks;

  assert.equal(report.status, 'blocked');
  assert.equal(checks.status, 'blocked');
  assert.equal(checks.matched_source_behavior_count, 1);
  assert.equal(checks.allowed_source_behavior_count, 0);
  assert.equal(checks.unclassified_generic_behavior_count, 1);
  assert.equal(checks.active_private_generic_residue_count, 0);
  assert.equal(checks.matches[0].audit_disposition, 'unclassified_generic_behavior');
  assert.deepEqual(checks.matches[0].audit_coverage, []);
  assert.deepEqual(checks.matched_signature_ids, ['repo_owned_scheduler_or_daemon']);
  assert.equal(checks.matches[0].path, 'src/private-scheduler.ts');
  assert.equal(
    checks.blockers.includes(
      'source_behavior_generic_capability_residue:repo_owned_scheduler_or_daemon:src/private-scheduler.ts',
    ),
    true,
  );
});

test('agents conformance source behavior gate blocks audit-declared active private residue', async () => {
  const repoDir = buildReadyAgentRepo();
  const privateSchedulerPath = path.join(repoDir, 'src', 'private-scheduler.ts');
  fs.mkdirSync(path.dirname(privateSchedulerPath), { recursive: true });
  fs.writeFileSync(privateSchedulerPath, 'setInterval(() => runNextTask(), 60_000);\n');
  const functionalAuditPath = path.join(repoDir, 'contracts', 'functional_privatization_audit.json');
  const functionalAudit = parseJsonText(fs.readFileSync(functionalAuditPath, 'utf8')) as Record<string, any>;
  functionalAudit.modules.push({
    module_id: 'sample_brief_private_scheduler',
    classification: 'generic_scheduler_or_daemon',
    owner: 'SampleBriefAgent',
    code_paths: ['src/private-scheduler.ts'],
    active_callers: ['legacy local cadence'],
    active_caller_status: 'active_private_scheduler_still_called',
    migration_action: 'move_to_opl_provider_scheduler_then_tombstone',
  });
  writeJson(functionalAuditPath, functionalAudit);

  const report = (await runCliReadOnly([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ])).standard_domain_agent_conformance;
  const checks = report.reports[0].source_behavior_checks;

  assert.equal(checks.status, 'blocked');
  assert.equal(checks.matched_source_behavior_count, 1);
  assert.equal(checks.allowed_source_behavior_count, 0);
  assert.equal(checks.unclassified_generic_behavior_count, 0);
  assert.equal(checks.active_private_generic_residue_count, 1);
  assert.equal(checks.matches[0].audit_disposition, 'active_private_generic_residue');
  assert.deepEqual(checks.matches[0].audit_coverage.map((entry: { module_id: string }) => entry.module_id), [
    'sample_brief_private_scheduler',
  ]);
});

test('agents conformance source behavior gate records legal audit declarations as evidence', async () => {
  const repoDir = buildReadyAgentRepo();
  const adapterPath = path.join(repoDir, 'src', 'product-status-domain-adapter.ts');
  fs.mkdirSync(path.dirname(adapterPath), { recursive: true });
  fs.writeFileSync(adapterPath, 'export const productStatusRef = "owner-receipt-ref";\n');
  const functionalAuditPath = path.join(repoDir, 'contracts', 'functional_privatization_audit.json');
  const functionalAudit = parseJsonText(fs.readFileSync(functionalAuditPath, 'utf8')) as Record<string, any>;
  functionalAudit.modules.push({
    module_id: 'sample_brief_product_status_refs',
    classification: 'refs_only_domain_adapter',
    owner: 'SampleBriefAgent',
    code_paths: ['src/product-status-domain-adapter.ts'],
    active_callers: ['OPL hosted product status projection'],
    active_caller_status: 'refs_only_adapter_active',
    migration_action: 'keep_domain_refs_only_adapter',
  });
  writeJson(functionalAuditPath, functionalAudit);

  const report = (await runCliReadOnly([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ])).standard_domain_agent_conformance;
  const checks = report.reports[0].source_behavior_checks;

  assert.equal(report.status, 'passed');
  assert.equal(checks.status, 'passed');
  assert.equal(checks.detected_source_behavior_count, 1);
  assert.equal(checks.matched_source_behavior_count, 0);
  assert.equal(checks.allowed_source_behavior_count, 1);
  assert.equal(checks.declared_domain_boundary_evidence_count, 1);
  assert.equal(checks.unclassified_generic_behavior_count, 0);
  assert.equal(checks.active_private_generic_residue_count, 0);
  assert.deepEqual(checks.matches, []);
  assert.equal(checks.allowed_matches[0].audit_disposition, 'declared_domain_boundary_evidence');
  assert.deepEqual(checks.allowed_matches[0].audit_coverage.map((entry: { module_id: string }) => entry.module_id), [
    'sample_brief_product_status_refs',
  ]);
  assert.deepEqual(checks.blockers, []);
});

test('agents conformance blocks diagnostic cleanup source that still has an active caller', async () => {
  const repoDir = buildReadyAgentRepo();
  const hygienePath = path.join(repoDir, 'src', 'project-hygiene.py');
  fs.mkdirSync(path.dirname(hygienePath), { recursive: true });
  fs.writeFileSync(hygienePath, 'def scan():\n    return None\n');
  const functionalAuditPath = path.join(repoDir, 'contracts', 'functional_privatization_audit.json');
  const functionalAudit = parseJsonText(fs.readFileSync(functionalAuditPath, 'utf8')) as Record<string, any>;
  functionalAudit.modules.push({
    module_id: 'sample_project_hygiene_diagnostic',
    classification: 'diagnostic_cleanup_path',
    code_paths: ['src/project-hygiene.py'],
    active_caller_allowed: false,
    active_callers: ['scripts/verify.sh'],
    active_caller_status: 'explicit_diagnostic_helper_still_called_by_default_verify',
    migration_action: 'move_generic_source_byproduct_guard_to_opl_workspace',
  });
  writeJson(functionalAuditPath, functionalAudit);

  const report = (await runCliReadOnly([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ])).standard_domain_agent_conformance;
  const checks = report.reports[0].source_behavior_checks;

  assert.equal(report.status, 'blocked');
  assert.equal(checks.status, 'blocked');
  assert.equal(checks.active_private_generic_residue_count, 1);
  assert.equal(checks.matches[0].audit_disposition, 'active_private_generic_residue');
  assert.deepEqual(checks.matches[0].audit_coverage[0].active_callers, ['scripts/verify.sh']);
});

test('agents conformance blocks retired route aliases from re-entering active caller inventory', async () => {
  const repoDir = buildReadyAgentRepo();
  const functionalAuditPath = path.join(repoDir, 'contracts', 'functional_privatization_audit.json');
  const functionalAudit = parseJsonText(fs.readFileSync(functionalAuditPath, 'utf8')) as Record<string, any>;
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

  const report = (await runCliReadOnly([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ])).standard_domain_agent_conformance;
  const checks = report.reports[0].private_surface_checks;

  assert.equal(report.status, 'passed');
  assert.equal(checks.status, 'passed');
  assert.deepEqual(checks.private_platform_residue_module_ids, ['retired_product_api_alias']);
  assert.equal(checks.default_watchlist_count, 0);
  assert.equal(checks.source_purity_tail_read_model.private_platform_residue_inventory_audit_only_count, 1);
  assert.equal(checks.source_purity_tail_read_model.private_platform_residue_inventory_counts_as_action_required, false);
  assert.equal(checks.source_purity_tail_read_model.private_platform_residue_inventory_counts_as_blocker, false);
});

test('agents conformance classifies private platform residue deletion gate dispositions', async () => {
  const repoDir = buildReadyAgentRepo();
  const functionalAuditPath = path.join(repoDir, 'contracts', 'functional_privatization_audit.json');
  const functionalAudit = parseJsonText(fs.readFileSync(functionalAuditPath, 'utf8')) as Record<string, any>;
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
      module_id: 'oma_legacy_agent_materializer_residue',
      classification: 'generic_legacy_agent_materializer',
      owner: 'OPL Meta Agent',
      code_paths: ['scripts/legacy-agent-materializer.ts'],
      active_callers: [],
      active_caller_status: 'historical_work_order_fixture_only',
      migration_action: 'history_tombstone_only',
      private_platform_residue_gate: {
        residue_kind: 'legacy_agent_materializer',
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

  const report = (await runCliReadOnly([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ])).standard_domain_agent_conformance;
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
    'legacy_agent_materializer',
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
    cleanupGate.by_residue_kind.legacy_agent_materializer.map((item: { module_id: string }) => item.module_id),
    ['oma_legacy_agent_materializer_residue'],
  );
  assert.equal(cleanupGate.by_residue_kind.domain_wrapper[0].disposition, 'retain_authority_function');
});

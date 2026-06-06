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

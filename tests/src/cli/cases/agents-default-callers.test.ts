import { assert, fs, path, runCli, test } from '../helpers.ts';
import { buildReadyAgentRepo, writeJson } from './agents-conformance-fixtures.ts';

test('agents default-callers blocks private generic owner claims without authorizing deletion', () => {
  const repoDir = buildReadyAgentRepo();
  const functionalAuditPath = path.join(repoDir, 'contracts', 'functional_privatization_audit.json');
  const functionalAudit = JSON.parse(fs.readFileSync(functionalAuditPath, 'utf8'));
  functionalAudit.authority_boundary.domain_can_claim_generic_runtime_owner = true;
  writeJson(functionalAuditPath, functionalAudit);

  const defaultCallers = runCli([
    'agents',
    'default-callers',
    '--agent',
    `sample=${repoDir}`,
  ]).agent_default_caller_readiness;

  assert.equal(defaultCallers.status, 'blocked');
  assert.equal(defaultCallers.summary.blocked_count, 1);
  assert.equal(defaultCallers.reports[0].status, 'blocked');
  assert.equal(
    defaultCallers.reports[0].blockers.includes('platform_surface_ownership_blocked'),
    true,
  );
  assert.equal(defaultCallers.reports[0].deletion_gate.replacement_parity, 'blocked');
  assert.equal(defaultCallers.reports[0].deletion_gate.physical_delete_authorized, false);
  assert.equal(defaultCallers.authority_boundary.report_can_claim_production_ready, false);
  assert.equal(defaultCallers.authority_boundary.report_can_authorize_domain_repo_physical_delete, false);
});

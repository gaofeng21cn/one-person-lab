import { assert, fs, path, runCli, test } from '../helpers.ts';
import {
  buildReadyAgentRepo,
  writeJson,
} from './agents-conformance-fixtures.ts';

test('agents platform-surfaces blocks explicit generic platform owner claims', () => {
  const repoDir = buildReadyAgentRepo();
  const functionalAuditPath = path.join(repoDir, 'contracts', 'functional_privatization_audit.json');
  const functionalAudit = JSON.parse(fs.readFileSync(functionalAuditPath, 'utf8'));
  functionalAudit.authority_boundary.domain_can_claim_generic_runtime_owner = true;
  writeJson(functionalAuditPath, functionalAudit);

  const platformSurfaces = runCli([
    'agents',
    'platform-surfaces',
    '--agent',
    `sample=${repoDir}`,
  ]).agent_platform_surface_ownership;

  assert.equal(platformSurfaces.status, 'blocked');
  assert.equal(platformSurfaces.summary.explicit_forbidden_owner_claim_count, 1);
  assert.match(
    platformSurfaces.reports[0].blockers[0],
    /domain_declares_generic_platform_owner:contracts\/functional_privatization_audit\.json/,
  );
  assert.equal(platformSurfaces.reports[0].authority_boundary.report_can_claim_domain_ready, false);

  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ]).standard_domain_agent_conformance;

  assert.equal(report.status, 'blocked');
  assert.equal(report.reports[0].platform_surface_ownership_checks.status, 'blocked');
  assert.equal(
    report.reports[0].blockers.some((blocker: string) => (
      blocker.includes('domain_declares_generic_platform_owner:contracts/functional_privatization_audit.json')
    )),
    true,
  );
});

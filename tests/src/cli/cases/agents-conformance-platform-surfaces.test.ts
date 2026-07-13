import { assert, fs, parseJsonText, path, runCliReadOnly, test } from '../helpers.ts';
import {
  buildReadyAgentRepo,
  writeJson,
} from './agents-conformance-fixtures.ts';

test('agents platform-surfaces blocks explicit generic platform owner claims', async () => {
  const repoDir = buildReadyAgentRepo();
  const functionalAuditPath = path.join(repoDir, 'contracts', 'functional_privatization_audit.json');
  const functionalAudit = parseJsonText(fs.readFileSync(functionalAuditPath, 'utf8')) as any;
  functionalAudit.authority_boundary.domain_can_claim_generic_runtime_owner = true;
  writeJson(functionalAuditPath, functionalAudit);

  const platformSurfaces = (await runCliReadOnly([
    'agents',
    'platform-surfaces',
    '--agent',
    `sample=${repoDir}`,
  ])).agent_platform_surface_ownership;

  assert.equal(platformSurfaces.status, 'blocked');
  assert.equal(platformSurfaces.summary.explicit_forbidden_owner_claim_count, 1);
  assert.equal(
    platformSurfaces.summary.hard_gate_source_policy,
    'machine_contracts_receipts_and_proofs_only',
  );
  assert.equal(
    platformSurfaces.summary.advisory_diagnostics_can_block_standard_agent_admission,
    false,
  );
  assert.equal(platformSurfaces.reports[0].hard_gate.status, 'blocked');
  assert.equal(
    platformSurfaces.reports[0].hard_gate.evidence_refs.includes(
      'contracts/functional_privatization_audit.json#authority_boundary',
    ),
    true,
  );
  assert.equal(platformSurfaces.reports[0].advisory_diagnostics.can_block_standard_agent_admission, false);
  assert.match(
    platformSurfaces.reports[0].blockers[0],
    /domain_declares_generic_platform_owner:contracts\/functional_privatization_audit\.json/,
  );
  assert.equal(platformSurfaces.reports[0].authority_boundary.report_can_claim_domain_ready, false);

  const report = (await runCliReadOnly([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ])).standard_domain_agent_conformance;

  assert.equal(report.status, 'blocked');
  assert.equal(report.reports[0].platform_surface_ownership_checks.status, 'blocked');
  assert.equal(
    report.reports[0].blockers.some((blocker: string) => (
      blocker.includes('domain_declares_generic_platform_owner:contracts/functional_privatization_audit.json')
    )),
    true,
  );
});

test('agents platform-surfaces reports filename and prose matches as advisory diagnostics only', async () => {
  const repoDir = buildReadyAgentRepo();
  const prosePath = path.join(repoDir, 'docs', 'active', 'status-workbench-notes.md');
  const codePath = path.join(repoDir, 'agent', 'product-entry-status-workbench.ts');
  fs.mkdirSync(path.dirname(prosePath), { recursive: true });
  fs.writeFileSync(
    prosePath,
    'This prose mentions scheduler, queue, workbench, status, and action_catalog as context only.\n',
    'utf8',
  );
  fs.writeFileSync(
    codePath,
    'export const productEntryStatusWorkbenchNote = "diagnostic only";\n',
    'utf8',
  );

  const platformSurfaces = (await runCliReadOnly([
    'agents',
    'platform-surfaces',
    '--agent',
    `sample=${repoDir}`,
  ])).agent_platform_surface_ownership;

  const statusSurface = platformSurfaces.reports[0].generic_subdomains
    .find((surface: { subdomain_id: string }) => (
      surface.subdomain_id === 'status_read_model_and_workbench_shell'
    ));

  assert.equal(platformSurfaces.status, 'passed');
  assert.equal(platformSurfaces.summary.explicit_forbidden_owner_claim_count, 0);
  assert.equal(platformSurfaces.summary.advisory_diagnostics_can_block_standard_agent_admission, false);
  assert.equal(platformSurfaces.reports[0].hard_gate.status, 'passed');
  assert.deepEqual(platformSurfaces.reports[0].hard_gate.explicit_forbidden_owner_claims, []);
  assert.equal(platformSurfaces.reports[0].advisory_diagnostics.status, 'reported_not_blocking');
  assert.equal(platformSurfaces.reports[0].advisory_diagnostics.can_block_standard_agent_admission, false);
  assert.equal(statusSurface.status, 'advisory_diagnostic_observed');
  assert.equal(
    statusSurface.advisory_diagnostic_refs.includes('agent/product-entry-status-workbench.ts'),
    true,
  );
  assert.equal(
    statusSurface.advisory_diagnostic_refs.includes('docs/active/status-workbench-notes.md'),
    true,
  );
  assert.equal(
    statusSurface.advisory_diagnostic_policy,
    'filename_contract_text_and_prose_refs_are_diagnostic_only_not_admission_blockers',
  );
  assert.equal(statusSurface.observed_source_refs_role, 'compatibility_alias_for_advisory_diagnostic_refs');

  const report = (await runCliReadOnly([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ])).standard_domain_agent_conformance;

  assert.equal(report.status, 'passed');
  assert.equal(report.reports[0].platform_surface_ownership_checks.hard_gate.status, 'passed');
  assert.equal(
    report.reports[0].platform_surface_ownership_checks.advisory_diagnostics
      .can_block_standard_agent_admission,
    false,
  );
});

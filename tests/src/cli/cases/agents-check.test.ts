import { assert, fs, os, parseJsonText, path, runCli, test } from '../helpers.ts';
import {
  buildStandardDomainAgentScaffold,
  validateStandardDomainAgentScaffold,
} from '../../../../src/modules/pack/standard-domain-agent-scaffold.ts';
import {
  PRIVATE_FUNCTIONAL_SURFACE_ADMISSION_POLICY,
  PRIVATE_FUNCTIONAL_SURFACE_ADMISSION_POLICY_REF,
} from '../../../../src/modules/pack/standard-domain-agent-scaffold-constants.ts';

function readJson(filePath: string) {
  return parseJsonText(fs.readFileSync(filePath, 'utf8')) as Record<string, any>;
}

function writeJson(filePath: string, value: unknown) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

test('agents check aggregates existing standard Agent checks without creating a second verdict', () => {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agents-check-'));
  try {
    buildStandardDomainAgentScaffold({ targetDir, domainId: 'sample-check' });
    const output = runCli(['agents', 'check', '--repo', targetDir]);
    const check = output.standard_agent_check;

    assert.equal(check.status, 'passed');
    assert.equal(check.checks.scaffold.status, 'passed');
    assert.equal(check.checks.generated_interfaces.status, 'ready');
    assert.equal(check.checks.profile_conformance.status, 'not_requested');
    assert.equal(check.checks.framework_compatibility.status, 'not_applicable');
    assert.equal(check.authority_boundary.can_claim_domain_ready, false);
    assert.equal(check.authority_boundary.can_claim_production_ready, false);
  } finally {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
});

test('agents check returns one blocked report when an existing check rejects the repo', () => {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agents-check-blocked-'));
  try {
    buildStandardDomainAgentScaffold({ targetDir, domainId: 'sample-blocked' });
    fs.rmSync(path.join(targetDir, 'contracts', 'pack_compiler_input.json'));

    const check = runCli(['agents', 'check', '--repo', targetDir]).standard_agent_check;
    assert.equal(check.status, 'blocked');
    assert.equal(check.blocked_checks.includes('scaffold'), true);
    assert.equal(check.blocked_checks.includes('generated_interfaces'), true);
  } finally {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
});

test('standard agent scaffold projects the canonical private policy by ref and keeps only domain morphology', () => {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-private-policy-ref-'));
  try {
    buildStandardDomainAgentScaffold({ targetDir, domainId: 'sample-private-policy' });
    const audit = readJson(path.join(targetDir, 'contracts', 'functional_privatization_audit.json'));
    const skeleton = readJson('contracts/opl-framework/standard-domain-agent-skeleton-contract.json');

    assert.equal(
      audit.private_functional_surface_admission_policy_ref,
      PRIVATE_FUNCTIONAL_SURFACE_ADMISSION_POLICY_REF,
    );
    assert.equal(audit.private_functional_surface_admission_policy, undefined);
    assert.equal(
      fs.existsSync(path.join(targetDir, 'contracts', 'private_functional_surface_policy.json')),
      false,
    );
    assert.deepEqual(
      skeleton.new_agent_scaffold.private_functional_surface_admission_policy,
      PRIVATE_FUNCTIONAL_SURFACE_ADMISSION_POLICY,
    );
    assert.equal(
      audit.physical_source_morphology_policy.authority_boundary.domain_can_claim_generic_runtime_owner,
      false,
    );
    assert.equal(
      audit.physical_source_morphology_policy.authority_boundary.domain_repo_can_own_generated_surface,
      false,
    );
    assert.equal(
      validateStandardDomainAgentScaffold({ repoDir: targetDir }).standard_domain_agent_scaffold_validation.status,
      'passed',
    );
  } finally {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
});

test('standard agent scaffold fails closed on unknown private policy refs and morphology owner overclaims', () => {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-private-policy-fail-close-'));
  try {
    buildStandardDomainAgentScaffold({ targetDir, domainId: 'sample-private-policy-blocked' });
    const auditPath = path.join(targetDir, 'contracts', 'functional_privatization_audit.json');
    const audit = readJson(auditPath);

    audit.private_functional_surface_admission_policy_ref =
      'contracts/opl-framework/standard-domain-agent-skeleton-contract.json#/unknown_private_policy';
    writeJson(auditPath, audit);
    let validation = validateStandardDomainAgentScaffold({ repoDir: targetDir })
      .standard_domain_agent_scaffold_validation;
    assert.equal(validation.status, 'blocked');
    assert.equal(
      validation.blockers.includes('private_functional_surface_admission_policy_ref_must_equal_canonical_ref'),
      true,
    );

    audit.private_functional_surface_admission_policy_ref = PRIVATE_FUNCTIONAL_SURFACE_ADMISSION_POLICY_REF;
    audit.physical_source_morphology_policy.authority_boundary.domain_can_claim_generic_runtime_owner = true;
    writeJson(auditPath, audit);
    validation = validateStandardDomainAgentScaffold({ repoDir: targetDir })
      .standard_domain_agent_scaffold_validation;
    assert.equal(validation.status, 'blocked');
    assert.equal(
      validation.blockers.includes(
        'physical_source_morphology_policy_domain_can_claim_generic_runtime_owner_must_be_false',
      ),
      true,
    );
  } finally {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
});

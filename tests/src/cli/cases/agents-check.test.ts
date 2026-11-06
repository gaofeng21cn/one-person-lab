import { assert, fs, os, parseJsonText, path, runCli, test } from '../helpers.ts';
import {
  buildStandardDomainAgentScaffold,
  validateStandardDomainAgentScaffold,
} from '../../../../src/authority/packages/standard-domain-agent-scaffold.ts';
import {
  PRIVATE_FUNCTIONAL_SURFACE_ADMISSION_POLICY,
} from '../../../../src/authority/packages/standard-domain-agent-scaffold-constants.ts';
import {
  STANDARD_FUNCTIONAL_PRIVATIZATION_AUDIT_DEFAULTS_PROFILE,
} from '../../../../src/authority/packages/standard-agent-proof-contract-defaults.ts';
import { materializeStandardAgentFrameworkLink } from '../../../../src/adapters/integration/standard-agent-framework-link.ts';
import { buildOplFrameworkLocator } from '../../../../src/authority/contracts/index.ts';

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

test('agents check and link-framework share Python helper dependency discovery', () => {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agents-check-python-helper-'));
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agents-check-state-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateDir;
  try {
    buildStandardDomainAgentScaffold({ targetDir, domainId: 'sample-python-helper' });
    const helperDir = path.join(targetDir, 'runtime', 'native_helpers');
    fs.mkdirSync(helperDir, { recursive: true });
    fs.writeFileSync(
      path.join(helperDir, 'consumer.py'),
      'from opl_framework.artifact_inspection import sha256_bytes\n',
    );

    let compatibility = runCli(['agents', 'check', '--repo', targetDir])
      .standard_agent_check.checks.framework_compatibility;
    assert.equal(compatibility.status, 'blocked');
    assert.equal(compatibility.requires_python_framework, true);
    assert.equal(
      compatibility.blockers.includes('opl_managed_framework_python_link_missing'),
      true,
    );

    const link = materializeStandardAgentFrameworkLink({ agentRoot: targetDir });
    assert.equal(link.status, 'linked');
    compatibility = runCli(['agents', 'check', '--repo', targetDir])
      .standard_agent_check.checks.framework_compatibility;
    assert.equal(compatibility.status, 'compatible');
    assert.equal(compatibility.managed_python_link, true);
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    fs.rmSync(stateDir, { recursive: true, force: true });
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
});

test('agents check accepts an OPL-managed Python Framework link and rejects an arbitrary same-shaped directory', () => {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agents-check-managed-python-'));
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agents-check-managed-state-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateDir;
  try {
    buildStandardDomainAgentScaffold({ targetDir, domainId: 'sample-managed-python' });
    fs.writeFileSync(
      path.join(targetDir, 'runtime', 'native_helpers', 'consumer.py'),
      'from opl_framework.artifact_inspection import sha256_bytes\n',
    );
    const linkPath = path.join(targetDir, 'src', 'opl_framework');
    fs.rmSync(linkPath, { force: true, recursive: true });
    fs.mkdirSync(path.dirname(linkPath), { recursive: true });
    const managedPythonTarget = path.join(
      buildOplFrameworkLocator().framework_locator.resolved.root,
      'python',
      'opl_framework',
    );
    fs.symlinkSync(managedPythonTarget, linkPath, 'dir');
    let compatibility = runCli(['agents', 'check', '--repo', targetDir])
      .standard_agent_check.checks.framework_compatibility;
    assert.equal(compatibility.status, 'compatible');
    assert.equal(compatibility.managed_python_link, true);

    fs.rmSync(linkPath, { force: true, recursive: true });
    const fake = path.join(targetDir, 'python', 'opl_framework');
    fs.mkdirSync(fake, { recursive: true });
    fs.writeFileSync(path.join(fake, '__init__.py'), '');
    fs.symlinkSync(fake, linkPath, 'dir');
    compatibility = runCli(['agents', 'check', '--repo', targetDir])
      .standard_agent_check.checks.framework_compatibility;
    assert.equal(compatibility.status, 'blocked');
    assert.equal(compatibility.blockers.includes('opl_managed_framework_python_link_missing'), true);
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    fs.rmSync(stateDir, { recursive: true, force: true });
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
});

test('standard agent scaffold inherits platform proof policy and keeps only domain morphology', () => {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-private-policy-ref-'));
  try {
    buildStandardDomainAgentScaffold({ targetDir, domainId: 'sample-private-policy' });
    const audit = readJson(path.join(targetDir, 'contracts', 'functional_privatization_audit.json'));
    const skeleton = readJson('contracts/opl-framework/standard-domain-agent-skeleton-contract.json');

    assert.equal(
      audit.defaults_profile,
      STANDARD_FUNCTIONAL_PRIVATIZATION_AUDIT_DEFAULTS_PROFILE,
    );
    assert.equal(audit.private_functional_surface_admission_policy_ref, undefined);
    assert.equal(audit.forbidden_generic_owner_roles, undefined);
    assert.equal(audit.classification_policy, undefined);
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

test('standard agent scaffold emits an Agent Plugins 1.0 carrier with one byte-identical primary Skill', () => {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-plugin-scaffold-'));
  try {
    const scaffold = buildStandardDomainAgentScaffold({
      targetDir,
      domainId: 'sample_agent',
      domainLabel: 'Sample Agent',
    }).standard_domain_agent_scaffold;
    const pluginName = 'sample-agent';
    const pluginRoot = path.join(targetDir, 'plugins', pluginName);
    const portable = readJson(path.join(pluginRoot, 'plugin.json'));
    const legacy = readJson(path.join(pluginRoot, '.codex-plugin', 'plugin.json'));
    const primarySkill = fs.readFileSync(
      path.join(targetDir, 'agent', 'primary_skill', 'SKILL.md'),
    );
    const carrierSkill = fs.readFileSync(
      path.join(pluginRoot, 'skills', pluginName, 'SKILL.md'),
    );
    const packCompilerInput = readJson(path.join(targetDir, 'contracts', 'pack_compiler_input.json'));

    assert.equal(scaffold.plugin_name, pluginName);
    assert.equal(portable.$schema, 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');
    assert.equal(portable.name, pluginName);
    assert.equal(legacy.name, portable.name);
    assert.equal(legacy.version, portable.version);
    assert.deepEqual(legacy.interface, portable.extensions['com.openai'].interface);
    assert.equal(primarySkill.compare(carrierSkill), 0);
    assert.equal(packCompilerInput.required_domain_pack_paths.includes('agent/primary_skill/SKILL.md'), true);
    assert.equal(fs.existsSync(path.join(pluginRoot, 'mcp.json')), false);
    const validation = validateStandardDomainAgentScaffold({ repoDir: targetDir })
      .standard_domain_agent_scaffold_validation;
    assert.equal(validation.agent_plugin_1_0_validation.status, 'passed');
    assert.equal(validation.status, 'passed');
  } finally {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
});

test('standard agent scaffold fails closed on repeated platform policy and morphology owner overclaims', () => {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-private-policy-fail-close-'));
  try {
    buildStandardDomainAgentScaffold({ targetDir, domainId: 'sample-private-policy-blocked' });
    const auditPath = path.join(targetDir, 'contracts', 'functional_privatization_audit.json');
    const audit = readJson(auditPath);

    audit.private_functional_surface_admission_policy_ref =
      'contracts/opl-framework/standard-domain-agent-skeleton-contract.json#/unknown_private_policy';
    writeJson(auditPath, audit);
    assert.throws(
      () => validateStandardDomainAgentScaffold({ repoDir: targetDir }),
      /must not repeat platform-owned policy fields/,
    );

    delete audit.private_functional_surface_admission_policy_ref;
    audit.physical_source_morphology_policy.authority_boundary.domain_can_claim_generic_runtime_owner = true;
    writeJson(auditPath, audit);
    const validation = validateStandardDomainAgentScaffold({ repoDir: targetDir })
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

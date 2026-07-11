import { assert, fs, os, path, runCli, test } from '../helpers.ts';

test('agents check aggregates existing standard Agent checks without creating a second verdict', () => {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agents-check-'));
  try {
    runCli(['agents', 'scaffold', '--target-dir', targetDir, '--domain-id', 'sample-check']);
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
    runCli(['agents', 'scaffold', '--target-dir', targetDir, '--domain-id', 'sample-blocked']);
    fs.rmSync(path.join(targetDir, 'contracts', 'pack_compiler_input.json'));

    const check = runCli(['agents', 'check', '--repo', targetDir]).standard_agent_check;
    assert.equal(check.status, 'blocked');
    assert.equal(check.blocked_checks.includes('scaffold'), true);
    assert.equal(check.blocked_checks.includes('generated_interfaces'), true);
  } finally {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
});

import { assert, fs, parseJsonText, path, runCli, test } from '../helpers.ts';
import {
  buildReadyAgentRepo,
  writeJson,
} from './agents-conformance-fixtures.ts';

test('agents conformance requires State Index Kernel adoption as refs-only SQLite sidecar policy', () => {
  const repoDir = buildReadyAgentRepo();
  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ]).standard_domain_agent_conformance;
  const repo = report.reports[0];

  assert.equal(report.status, 'passed');
  assert.equal(repo.state_index_kernel_adoption_checks.status, 'passed');
  assert.equal(repo.state_index_kernel_adoption_checks.policy_status, 'declared');
  assert.equal(
    repo.state_index_kernel_adoption_checks.kernel_contract_ref,
    'contracts/opl-framework/state-index-kernel-contract.json',
  );
  assert.equal(repo.state_index_kernel_adoption_checks.sqlite_role, 'rebuildable_refs_only_sidecar_index');
  assert.deepEqual(repo.state_index_kernel_adoption_checks.required_index_databases, [
    'queue',
    'lifecycle_index',
    'artifact_index',
    'operator_read_model',
  ]);
  assert.equal(
    repo.state_index_kernel_adoption_checks.compaction_policy.large_payload_strategy,
    'store_preview_hash_and_refs_never_body',
  );
  assert.equal(repo.state_index_kernel_adoption_checks.maintenance_policy.journal_mode, 'WAL');
  assert.equal(repo.state_index_kernel_adoption_checks.authority_boundary.sqlite_sidecar_source_of_truth, false);
  assert.equal(repo.state_index_kernel_adoption_checks.authority_boundary.opl_can_write_artifact_body, false);
  assert.equal(
    repo.state_index_kernel_adoption_checks.authority_boundary
      .domain_repo_can_own_generic_sqlite_persistence_engine,
    false,
  );
  assert.deepEqual(repo.blockers, []);
});

test('agents conformance blocks domain repos that turn SQLite sidecar into truth or artifact body storage', () => {
  const repoDir = buildReadyAgentRepo();
  const adoptionPath = path.join(repoDir, 'contracts', 'state_index_kernel_adoption.json');
  const adoption = parseJsonText(fs.readFileSync(adoptionPath, 'utf8')) as Record<string, any>;
  adoption.authority_boundary.sqlite_sidecar_source_of_truth = true;
  adoption.authority_boundary.opl_can_write_artifact_body = true;
  adoption.authority_boundary.domain_repo_can_own_generic_sqlite_persistence_engine = true;
  adoption.compaction_policy.large_payload_strategy = 'store_body_in_sqlite';
  writeJson(adoptionPath, adoption);

  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ]).standard_domain_agent_conformance;

  assert.equal(report.status, 'blocked');
  assert.equal(report.reports[0].state_index_kernel_adoption_checks.status, 'blocked');
  assert.equal(
    report.reports[0].blockers.includes(
      'state_index_kernel_authority_flag_must_be_false:sqlite_sidecar_source_of_truth',
    ),
    true,
  );
  assert.equal(
    report.reports[0].blockers.includes(
      'state_index_kernel_authority_flag_must_be_false:opl_can_write_artifact_body',
    ),
    true,
  );
  assert.equal(
    report.reports[0].blockers.includes(
      'state_index_kernel_authority_flag_must_be_false:domain_repo_can_own_generic_sqlite_persistence_engine',
    ),
    true,
  );
  assert.equal(
    report.reports[0].blockers.includes('state_index_kernel_large_payload_strategy_invalid'),
    true,
  );
});

import { assert, fs, parseJsonText, path, runCli, test } from '../helpers.ts';
import {
  buildReadyAgentRepo,
  writeJson,
} from './agents-conformance-fixtures.ts';

function replaceLegacyStateIndexContractWithOplSidecar(repoDir: string) {
  fs.rmSync(path.join(repoDir, 'contracts', 'state_index_kernel_adoption.json'));
  const adoptionPath = path.join(repoDir, 'contracts', 'stage_artifact_kernel_adoption.json');
  const adoption = parseJsonText(fs.readFileSync(adoptionPath, 'utf8')) as Record<string, any>;
  adoption.opl_state_index_kernel_adoption = {
    surface_kind: 'opl_state_index_kernel_sidecar_adoption',
    version: 'opl-state-index-kernel-sidecar-adoption.v1',
    owner: 'one-person-lab',
    consumer: 'sample',
    adoption_status: 'deferred_until_measured_trigger',
    sqlite_enabled_now: false,
    index_backend: 'sqlite_sidecar_index',
    sidecar_owner: 'one-person-lab',
    sidecar_is_domain_runtime: false,
    rebuild_policy: {
      rebuildable: true,
      delete_safe: true,
    },
    authority_boundary: {
      opl_owns_state_index_kernel: true,
      opl_can_store_refs_hashes_provenance: true,
      opl_can_rebuild_sidecar_index: true,
      sqlite_can_be_truth_source: false,
      sqlite_can_store_visual_artifact_body: false,
      sqlite_can_store_review_export_judgment: false,
    },
  };
  writeJson(adoptionPath, adoption);
  return adoption.opl_state_index_kernel_adoption;
}

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

test('agents conformance accepts an OPL-owned deferred sidecar declared by Stage Artifact adoption', () => {
  const repoDir = buildReadyAgentRepo();
  replaceLegacyStateIndexContractWithOplSidecar(repoDir);

  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ]).standard_domain_agent_conformance;
  const repo = report.reports[0];

  assert.equal(report.status, 'passed');
  assert.equal(repo.state_index_kernel_adoption_checks.status, 'passed');
  assert.equal(
    repo.state_index_kernel_adoption_checks.policy_source,
    'contracts/stage_artifact_kernel_adoption.json#/opl_state_index_kernel_adoption',
  );
});

test('agents conformance permits explicit domain ownership declarations in an OPL sidecar', () => {
  const repoDir = buildReadyAgentRepo();
  const sidecar = replaceLegacyStateIndexContractWithOplSidecar(repoDir);
  sidecar.authority_boundary.sample_owns_domain_truth = true;
  sidecar.authority_boundary.sample_owns_artifact_authority = true;
  const adoptionPath = path.join(repoDir, 'contracts', 'stage_artifact_kernel_adoption.json');
  const adoption = parseJsonText(fs.readFileSync(adoptionPath, 'utf8')) as Record<string, any>;
  adoption.opl_state_index_kernel_adoption = sidecar;
  writeJson(adoptionPath, adoption);

  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ]).standard_domain_agent_conformance;

  assert.equal(report.status, 'passed');
  assert.equal(report.reports[0].state_index_kernel_adoption_checks.status, 'passed');
});

test('agents conformance blocks an OPL sidecar that claims domain truth, artifact body, or verdict authority', () => {
  const repoDir = buildReadyAgentRepo();
  const sidecar = replaceLegacyStateIndexContractWithOplSidecar(repoDir);
  sidecar.authority_boundary.sqlite_can_be_truth_source = true;
  sidecar.authority_boundary.sqlite_can_store_visual_artifact_body = true;
  sidecar.authority_boundary.sqlite_can_store_review_export_judgment = true;
  const adoptionPath = path.join(repoDir, 'contracts', 'stage_artifact_kernel_adoption.json');
  const adoption = parseJsonText(fs.readFileSync(adoptionPath, 'utf8')) as Record<string, any>;
  adoption.opl_state_index_kernel_adoption = sidecar;
  writeJson(adoptionPath, adoption);

  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ]).standard_domain_agent_conformance;

  assert.equal(report.status, 'blocked');
  assert.equal(
    report.reports[0].blockers.includes('state_index_kernel_sidecar_truth_authority_must_be_false'),
    true,
  );
  assert.equal(
    report.reports[0].blockers.includes('state_index_kernel_sidecar_artifact_body_authority_must_be_false'), true);
  assert.equal(
    report.reports[0].blockers.includes('state_index_kernel_sidecar_verdict_authority_must_be_false'), true);
});

test('agents conformance blocks an OPL sidecar with a wrong contract version', () => {
  const repoDir = buildReadyAgentRepo();
  const sidecar = replaceLegacyStateIndexContractWithOplSidecar(repoDir);
  sidecar.version = 'wrong';
  const adoptionPath = path.join(repoDir, 'contracts', 'stage_artifact_kernel_adoption.json');
  const adoption = parseJsonText(fs.readFileSync(adoptionPath, 'utf8')) as Record<string, any>;
  adoption.opl_state_index_kernel_adoption = sidecar;
  writeJson(adoptionPath, adoption);

  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ]).standard_domain_agent_conformance;

  assert.equal(report.status, 'blocked');
  assert.equal(
    report.reports[0].blockers.includes('state_index_kernel_sidecar_version_invalid'),
    true,
  );
});

test('agents conformance blocks an OPL sidecar with undeclared authority', () => {
  const repoDir = buildReadyAgentRepo();
  const sidecar = replaceLegacyStateIndexContractWithOplSidecar(repoDir);
  sidecar.authority_boundary.sqlite_can_create_domain_owner_receipt = true;
  const adoptionPath = path.join(repoDir, 'contracts', 'stage_artifact_kernel_adoption.json');
  const adoption = parseJsonText(fs.readFileSync(adoptionPath, 'utf8')) as Record<string, any>;
  adoption.opl_state_index_kernel_adoption = sidecar;
  writeJson(adoptionPath, adoption);

  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ]).standard_domain_agent_conformance;

  assert.equal(report.status, 'blocked');
  assert.equal(
    report.reports[0].blockers.includes(
      'state_index_kernel_sidecar_authority_field_unsupported:sqlite_can_create_domain_owner_receipt',
    ),
    true,
  );
});

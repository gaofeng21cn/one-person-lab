import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type JsonRecord = Record<string, unknown>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const contractPath = 'contracts/opl-framework/advisory-knowledge-boundary-contract.json';

function readJson(relativePath: string): JsonRecord {
  assert.equal(fs.existsSync(path.join(repoRoot, relativePath)), true, `${relativePath} should exist`);
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as JsonRecord;
}

function record(value: unknown): JsonRecord {
  assert.equal(typeof value, 'object');
  assert.notEqual(value, null);
  assert.equal(Array.isArray(value), false);
  return value as JsonRecord;
}

test('advisory knowledge boundary keeps Markdown memory as prompt context', () => {
  const contract = readJson(contractPath);
  const usePolicy = record(contract.default_use_policy);
  const boundary = record(contract.machine_boundary);
  const oplOwns = record(boundary.opl_owns);
  const domainOwns = record(boundary.domain_owns);

  assert.equal(contract.surface_kind, 'opl_advisory_knowledge_boundary_contract');
  assert.equal(usePolicy.body_mode, 'markdown_first');
  assert.equal(usePolicy.stage_packet_role, 'reference_only_prompt_context');
  assert.equal(usePolicy.missing_memory_blocks_launch_by_default, false);
  assert.equal(usePolicy.memory_conflict_blocks_launch_by_default, false);
  assert.equal(usePolicy.memory_can_authorize_stage_progress, false);
  assert.equal(usePolicy.memory_can_authorize_domain_ready, false);

  assert.equal(oplOwns.domain_memory_catalog_refs, true);
  assert.equal(oplOwns.body_free_locator_refs, true);
  assert.equal(oplOwns.stage_packet_knowledge_refs, true);
  assert.equal(domainOwns.markdown_memory_body, true);
  assert.equal(domainOwns.memory_accept_reject, true);
  assert.equal(domainOwns.route_judgment, true);
  assert.equal(domainOwns.quality_verdict, true);
});

test('advisory knowledge boundary forbids programmatic route and verdict authority', () => {
  const contract = readJson(contractPath);
  const forbiddenRoles = record(contract.forbidden_roles);
  const hardGateTriggers = contract.hard_gate_triggers as string[];
  const expectations = record(contract.conformance_expectations);

  for (const role of [
    'route_scorer',
    'winning_path_generator',
    'recipe_engine',
    'controller_decision_source',
    'quality_gate',
    'publication_or_submission_gate',
    'export_gate',
    'domain_truth_source',
    'memory_body_owner',
    'owner_receipt_signer',
    'typed_blocker_creator',
  ]) {
    assert.equal(forbiddenRoles[role], false, `${role} must be false`);
  }

  assert.equal(hardGateTriggers.includes('forbidden_write_or_body_exposure'), true);
  assert.equal(hardGateTriggers.includes('quality_verdict_claim'), true);
  assert.equal(hardGateTriggers.includes('publication_or_submission_claim'), true);
  assert.equal(hardGateTriggers.includes('final_export_claim'), true);
  assert.equal(expectations.must_not_fail_closed_on_missing_advisory_memory, true);
  assert.equal(expectations.must_fail_closed_on_authority_claim_from_memory_refs, true);
});

test('advisory knowledge boundary maps brand modules to refs-only responsibilities', () => {
  const contract = readJson(contractPath);
  const modules = record(contract.brand_module_boundaries);

  for (const moduleId of ['atlas', 'pack', 'stagecraft', 'runway', 'vault', 'console', 'connect']) {
    const moduleBoundary = record(modules[moduleId]);
    assert.equal(Array.isArray(moduleBoundary.may_hold), true);
    assert.equal(Array.isArray(moduleBoundary.must_not_hold), true);
  }

  assert.deepEqual(record(modules.atlas).must_not_hold, [
    'markdown_body',
    'route_score',
    'route_verdict',
    'quality_verdict',
  ]);
  assert.equal((record(modules.stagecraft).must_not_hold as unknown[]).includes('route_scoring'), true);
  assert.equal(
    (record(modules.vault).must_not_hold as unknown[]).includes('domain_memory_body_store'),
    true,
  );
  assert.equal(
    (record(modules.connect).must_not_hold as unknown[]).includes('connector_output_as_quality_gate'),
    true,
  );
});

test('advisory knowledge boundary names current domain memory families without moving body ownership', () => {
  const contract = readJson(contractPath);
  const families = contract.known_domain_memory_families as JsonRecord[];
  const byDomain = new Map(families.map((entry) => [entry.domain_id, entry]));

  assert.equal(record(byDomain.get('mas')).memory_family, 'publication_strategy_memory');
  assert.equal(record(byDomain.get('mas')).compatible_implementation_family, 'publication_route_memory');
  assert.equal(record(byDomain.get('mag')).body_owner, 'med-autogrant');
  assert.equal(record(byDomain.get('rca')).body_owner, 'redcube-ai');
  assert.equal(record(byDomain.get('opl-bookforge')).body_owner, 'opl-bookforge');
  assert.equal(record(byDomain.get('opl-meta-agent')).body_owner, 'opl-meta-agent');
});

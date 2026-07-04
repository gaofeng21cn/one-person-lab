import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJsonText } from '../../src/kernel/json-file.ts';
import {
  buildAdvisoryKnowledgeOperatorProjection,
} from '../../src/modules/charter/advisory-knowledge-boundary.ts';

type JsonRecord = Record<string, unknown>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const contractPath = 'contracts/opl-framework/advisory-knowledge-boundary-contract.json';

function readJson(relativePath: string): JsonRecord {
  assert.equal(fs.existsSync(path.join(repoRoot, relativePath)), true, `${relativePath} should exist`);
  return parseJsonText(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as JsonRecord;
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

test('advisory knowledge boundary freezes gate intent semantics', () => {
  const contract = readJson(contractPath);
  const policy = record(contract.gate_intent_policy);
  const intents = record(policy.intents);

  assert.equal(policy.intent_field, 'gate_intent');
  assert.equal(policy.default_intent_for_memory_refs, 'context');
  assert.deepEqual(policy.blocking_intents, ['claim_gate', 'authority_gate']);
  assert.deepEqual(policy.nonblocking_intents, ['context', 'advisory_check']);
  assert.deepEqual(policy.blocking_signal_required_fields, [
    'gate_intent',
    'blocking_claim',
    'source_ref',
    'owner_ref_or_authority_ref',
  ]);

  assert.equal(record(intents.context).blocking_allowed, false);
  assert.equal(record(intents.context).fail_mode, 'fail_open');
  assert.equal(record(intents.advisory_check).blocking_allowed, false);
  assert.equal(record(intents.advisory_check).fail_mode, 'fail_open');
  assert.equal(record(intents.claim_gate).blocking_allowed, true);
  assert.equal(record(intents.claim_gate).claim_binding_required, true);
  assert.equal(record(intents.authority_gate).blocking_allowed, true);
  assert.equal(record(intents.authority_gate).authority_binding_required, true);
  assert.deepEqual(policy.advisory_signal_must_not_create, [
    'owner_receipt',
    'typed_blocker',
    'route_verdict',
    'quality_verdict',
    'publication_or_submission_verdict',
    'artifact_authority',
  ]);
});

test('advisory knowledge operator projection contract exposes three columns without authority', () => {
  const contract = readJson(contractPath);
  const projection = record(contract.operator_projection_contract);
  const columns = projection.columns as JsonRecord[];
  const byColumn = new Map(columns.map((column) => [column.column_id, column]));
  const authority = record(projection.authority_boundary);

  assert.equal(projection.surface_kind, 'opl_advisory_knowledge_operator_projection_contract');
  assert.equal(projection.projection_role, 'three_column_operator_boundary');
  assert.deepEqual(record(byColumn.get('reference_suggestions')).gate_intents, ['context']);
  assert.equal(record(byColumn.get('reference_suggestions')).can_block, false);
  assert.deepEqual(record(byColumn.get('soft_gaps')).gate_intents, ['advisory_check']);
  assert.equal(record(byColumn.get('soft_gaps')).can_block, false);
  assert.deepEqual(record(byColumn.get('hard_owner_gates')).gate_intents, ['claim_gate', 'authority_gate']);
  assert.equal(record(byColumn.get('hard_owner_gates')).can_block, true);
  assert.deepEqual(record(byColumn.get('hard_owner_gates')).required_item_fields, [
    'blocking_claim',
    'source_ref',
    'owner_ref_or_authority_ref',
  ]);

  assert.equal(authority.projection_only, true);
  assert.equal(authority.can_write_domain_truth, false);
  assert.equal(authority.can_write_memory_body, false);
  assert.equal(authority.can_accept_or_reject_writeback, false);
  assert.equal(authority.can_sign_owner_receipt, false);
  assert.equal(authority.can_create_typed_blocker, false);
  assert.equal(authority.can_authorize_domain_ready, false);
  assert.equal(authority.can_authorize_quality_or_export_verdict, false);
});

test('advisory knowledge operator projection sorts signals into reference soft and hard columns', () => {
  const projection = buildAdvisoryKnowledgeOperatorProjection([
    {
      signal_id: 'mas-risk-model-card',
      gate_intent: 'context',
      role: 'prompt_context_ref',
      title: 'Risk stratification model pattern',
      source_ref: 'mas://publication-strategy-memory/risk-model',
    },
    {
      signal_id: 'bookforge-reference-style-gap',
      gate_intent: 'advisory_check',
      role: 'repair_suggestion',
      title: 'Reference draft style needs review',
      source_ref: 'bookforge://reference-draft/style-gap',
    },
    {
      signal_id: 'final-export-owner-gate',
      gate_intent: 'claim_gate',
      role: 'claim_blocker_ref',
      title: 'Final export requires owner proof',
      blocking_claim: 'final_export_ready',
      source_ref: 'bookforge://proof/latest',
      owner_ref_or_authority_ref: 'owner-receipt://bookforge/final-export',
    },
    {
      signal_id: 'invalid-authority-gate',
      gate_intent: 'authority_gate',
      role: 'owner_or_authority_blocker_ref',
      title: 'Authority gate missing owner ref',
      blocking_claim: 'owner_receipt_claim',
      source_ref: 'opl://runtime/authority',
    },
  ]);

  assert.equal(projection.surface_kind, 'opl_advisory_knowledge_operator_projection');
  assert.equal(projection.projection_role, 'three_column_operator_boundary');
  assert.deepEqual(projection.counts, {
    reference_suggestion_count: 1,
    soft_gap_count: 1,
    hard_owner_gate_count: 2,
    blocking_count: 2,
  });
  assert.equal(projection.reference_suggestions[0].signal_id, 'mas-risk-model-card');
  assert.equal(projection.soft_gaps[0].signal_id, 'bookforge-reference-style-gap');
  assert.equal(projection.hard_owner_gates[0].blocking_claim, 'final_export_ready');
  assert.deepEqual(projection.hard_owner_gates[1].missing_required_fields, ['owner_ref_or_authority_ref']);
  assert.equal(projection.authority_boundary.can_write_memory_body, false);
  assert.equal(projection.authority_boundary.can_sign_owner_receipt, false);
  assert.equal(projection.authority_boundary.can_create_typed_blocker, false);
  assert.equal(projection.authority_boundary.can_authorize_quality_or_export_verdict, false);
});

test('advisory knowledge boundary maps brand modules to refs-only responsibilities', () => {
  const contract = readJson(contractPath);
  const modules = record(contract.brand_module_boundaries);

  for (const moduleId of ['atlas', 'pack', 'stagecraft', 'runway', 'ledger', 'console', 'connect']) {
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
    (record(modules.ledger).must_not_hold as unknown[]).includes('domain_memory_body_store'),
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

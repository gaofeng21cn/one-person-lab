import { isRecord } from '../../../kernel/contract-validation.ts';
import { fail, requiredString, requiredUniqueStringList, assertExactKeys, assertDigest } from './validation-values.ts';
import { assertBase } from './semantic-boundary.ts';
import type { EvolutionProposal } from './types.ts';
import { validateAgentBlueprint } from './blueprint.ts';

export function validateEvolutionProposal(value: unknown): EvolutionProposal {
  const input = assertBase(value, 'opl_foundry_evolution_proposal', 'EvolutionProposal');
  assertExactKeys(input, 'EvolutionProposal', [
    'surface_kind',
    'version',
    'proposal_id',
    'target_agent_id',
    'target_domain_id',
    'target_version_ref',
    'blueprint_digest',
    'evidence_digest',
    'root_causes',
    'next_blueprint',
    'semantic_diff',
    'expected_benefits',
    'new_tests',
    'trade_offs',
    'risk_hints',
  ]);
  requiredString(input.proposal_id, 'EvolutionProposal.proposal_id');
  assertDigest(input.blueprint_digest, 'EvolutionProposal.blueprint_digest');
  assertDigest(input.evidence_digest, 'EvolutionProposal.evidence_digest');
  if (!Array.isArray(input.root_causes) || input.root_causes.length === 0) fail('EvolutionProposal.root_causes must not be empty.');
  for (const [index, entry] of input.root_causes.entries()) {
    if (!isRecord(entry)) fail(`EvolutionProposal.root_causes[${index}] must be an object.`);
    const label = `EvolutionProposal.root_causes[${index}]`;
    assertExactKeys(entry, label, ['failure_class', 'explanation', 'evidence_refs']);
    requiredString(entry.failure_class, `${label}.failure_class`);
    requiredString(entry.explanation, `${label}.explanation`);
    requiredUniqueStringList(entry.evidence_refs, `${label}.evidence_refs`);
  }
  const next = validateAgentBlueprint(input.next_blueprint);
  if (!Array.isArray(input.semantic_diff)) fail('EvolutionProposal.semantic_diff must be an array.');
  for (const [index, entry] of input.semantic_diff.entries()) {
    if (!isRecord(entry) || !['add', 'replace', 'remove'].includes(String(entry.operation))) {
      fail(`EvolutionProposal.semantic_diff[${index}] is invalid.`);
    }
    assertExactKeys(entry, `EvolutionProposal.semantic_diff[${index}]`, ['operation', 'semantic_path', 'rationale']);
    const semanticPath = requiredString(entry.semantic_path, `EvolutionProposal.semantic_diff[${index}].semantic_path`);
    if (!semanticPath.startsWith('/')) fail('EvolutionProposal semantic paths must be JSON pointers.');
    requiredString(entry.rationale, `EvolutionProposal.semantic_diff[${index}].rationale`);
  }
  requiredUniqueStringList(input.expected_benefits, 'EvolutionProposal.expected_benefits');
  if (!Array.isArray(input.new_tests)) fail('EvolutionProposal.new_tests must be an array.');
  const newTestIds = input.new_tests.map((entry, index) => {
    if (!isRecord(entry)) fail(`EvolutionProposal.new_tests[${index}] must be an object.`);
    const label = `EvolutionProposal.new_tests[${index}]`;
    assertExactKeys(entry, label, ['case_id', 'test_ref', 'rationale']);
    const caseId = requiredString(entry.case_id, `${label}.case_id`);
    requiredString(entry.test_ref, `${label}.test_ref`);
    requiredString(entry.rationale, `${label}.rationale`);
    return caseId;
  });
  if (new Set(newTestIds).size !== newTestIds.length) fail('EvolutionProposal.new_tests case ids must be unique.');
  requiredUniqueStringList(input.trade_offs, 'EvolutionProposal.trade_offs');
  const riskHints = requiredUniqueStringList(input.risk_hints, 'EvolutionProposal.risk_hints');
  if (riskHints.some((entry) => !['low', 'medium', 'high'].includes(entry))) {
    fail('EvolutionProposal.risk_hints contains an invalid risk tier.');
  }
  return { ...(input as unknown as EvolutionProposal), next_blueprint: next };
}

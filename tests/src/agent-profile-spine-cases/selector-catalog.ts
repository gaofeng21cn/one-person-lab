import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAgentProfileInspect,
  buildAgentProfileSelection,
} from '../../../src/modules/foundry-lab/agent-profile-spine.ts';
import { buildProfileCommandSpecs } from '../../../src/entrypoints/cli/cases/public-command-specs-parts/profiles.ts';
import { profileCatalogEntry } from './fixtures.ts';

test('profile selector chooses evidence-grounded profile for decision-support risk intent', () => {
  const inspect = buildAgentProfileInspect([
    'evidence_grounded_decision_agent_profile.v1',
  ]).agent_profile_inspect;
  const receipt = buildAgentProfileSelection([
    '--intent',
    'Build a colorectal surgery risk decision support agent with guideline evidence.',
  ]).profile_selection_receipt;

  assert.ok(inspect.profile);
  assert.ok(receipt.profile_requirements);
  assert.equal(
    inspect.profile.source_readback_command,
    'opl profiles inspect evidence_grounded_decision_agent_profile.v1 --json',
  );
  assert.equal(receipt.status, 'selected');
  assert.equal(receipt.selected_profile_id, 'evidence_grounded_decision_agent_profile.v1');
  assert.equal(receipt.matched_trigger_signals.includes('risk'), true);
  assert.equal(receipt.profile_requirements.required_stage_archetypes.includes('mode_routing'), true);
  assert.equal(receipt.profile_requirements.required_capability_kinds.includes('reference_pack'), true);
  assert.equal(receipt.authority_boundary.selector_can_claim_domain_ready, false);
});

test('profile selector accepts explicit canonical intent signals without heuristic scoring', () => {
  const receipt = buildAgentProfileSelection([
    '--intent',
    'Build a specialist workflow',
    '--intent-signal',
    'RISK',
  ]).profile_selection_receipt;

  assert.equal(receipt.status, 'selected');
  assert.deepEqual(receipt.intent_signals, ['risk']);
  assert.deepEqual(receipt.matched_trigger_signals, ['risk']);
  assert.equal(receipt.selected_profile_id, 'evidence_grounded_decision_agent_profile.v1');
});

test('profile selector routes unmatched paper-backed intent to source-derived design', () => {
  const receipt = buildAgentProfileSelection([
    '--intent',
    'Build a poetry workshop scheduling agent',
    '--reference-source',
    'paper-ref:uploaded-agent-framework',
    '--pattern-packet',
    'pattern-packet-ref:oma/uploaded-agent-framework/design',
  ]).profile_selection_receipt;

  assert.equal(receipt.status, 'selected');
  assert.equal(receipt.profile_selection_mode, 'source_derived_design');
  assert.equal(receipt.selected_profile_id, 'source_derived_design_profile_route.v1');
  assert.equal(receipt.selected_profile_ref, 'opl-profile-route:source_derived_design_profile_route.v1');
  assert.deepEqual(receipt.blockers, []);
  assert.ok(receipt.source_derived_design_receipt);
  assert.deepEqual(receipt.source_derived_design_receipt.source_refs, [
    'paper-ref:uploaded-agent-framework',
  ]);
  assert.deepEqual(receipt.source_derived_design_receipt.reference_design_pattern_packet_refs, [
    'pattern-packet-ref:oma/uploaded-agent-framework/design',
  ]);
  const requirements = receipt.profile_requirements as Record<string, string[]>;
  assert.ok(requirements.stage_archetype_candidates.includes('transferable_pattern_mapping'));
  assert.ok(receipt.transferable_pattern_requirements.includes('source_anchor_ref'));
  assert.ok(receipt.transferable_pattern_requirements.includes('disposition'));
  assert.equal(receipt.authority_boundary.selector_can_claim_domain_ready, false);
});

test('profile selector keeps builtin lower-bound and adds source-derived route for hybrid intents', () => {
  const receipt = buildAgentProfileSelection([
    '--intent',
    'Build a colorectal surgery risk decision support agent with guideline evidence',
    '--reference-source',
    'paper-ref:uploaded-surgical-risk-agent-framework',
  ]).profile_selection_receipt;

  assert.equal(receipt.status, 'selected');
  assert.equal(receipt.profile_selection_mode, 'hybrid');
  assert.equal(receipt.selected_profile_id, 'evidence_grounded_decision_agent_profile.v1');
  assert.ok(receipt.selected_profile_refs.includes('opl-profile:evidence_grounded_decision_agent_profile.v1'));
  assert.ok(receipt.selected_profile_refs.includes('opl-profile-route:source_derived_design_profile_route.v1'));
  const requirements = receipt.profile_requirements as Record<string, string[]>;
  assert.ok(requirements.required_stage_archetypes.includes('mode_routing'));
  assert.ok(requirements.required_stage_archetypes.includes('reference_design_pattern_extraction'));
});

test('profile selector uses repeated canonical signals for Chinese hybrid intent', async () => {
  const output = await buildProfileCommandSpecs()['profiles select'].handler([
    '--intent',
    '为结直肠手术患者构建风险决策支持智能体',
    '--intent-signal',
    'risk',
    '--intent-signal',
    'surgery',
    '--intent-signal',
    'colorectal',
    '--reference-source',
    'paper-ref:uploaded-surgical-risk-agent-framework',
  ]) as ReturnType<typeof buildAgentProfileSelection>;
  const receipt = output.profile_selection_receipt;

  assert.equal(receipt.status, 'selected');
  assert.equal(receipt.profile_selection_mode, 'hybrid');
  assert.deepEqual(receipt.intent_signals, ['risk', 'surgery', 'colorectal']);
  assert.equal(receipt.matched_trigger_signals.includes('risk'), true);
  assert.equal(receipt.matched_trigger_signals.includes('surgery'), true);
  assert.equal(receipt.matched_trigger_signals.includes('colorectal'), true);
  assert.ok(receipt.selected_profile_refs.includes('opl-profile:evidence_grounded_decision_agent_profile.v1'));
  assert.ok(receipt.selected_profile_refs.includes('opl-profile-route:source_derived_design_profile_route.v1'));
});

test('profile selector remains blocked when no builtin match and no reference design source exists', () => {
  const receipt = buildAgentProfileSelection([
    '--intent',
    'Build a poetry workshop scheduling agent',
  ]).profile_selection_receipt;

  assert.equal(receipt.status, 'blocked');
  assert.equal(receipt.profile_selection_mode, null);
  assert.deepEqual(receipt.selected_profile_refs, []);
  assert.deepEqual(receipt.blockers, ['no_profile_trigger_match']);
});

test('profile catalog consumes contract-owned profile entry requirements', () => {
  const profile = profileCatalogEntry();

  assert.equal(profile.profile_ref, 'opl-profile:evidence_grounded_decision_agent_profile.v1');
  assert.equal(profile.trigger_signals.includes('colorectal'), true);
  assert.equal(profile.required_reference_pack_roles.includes('guideline_reference_pack'), true);
  assert.equal(profile.required_evidence_objects.includes('DecisionSupportArtifact'), true);
  assert.equal(profile.can_claim_domain_ready, false);
});

test('profile public command specs keep catalog as guardrail, not design source', () => {
  const specs = buildProfileCommandSpecs();

  assert.match(specs['profiles list'].summary, /lower-bound conformance guardrails/);
  assert.match(specs['profiles list'].summary, /not target-agent design sources/);
  assert.match(specs['profiles select'].summary, /reference sources remain the design source/);
  assert.match(specs['profiles select'].usage, /--intent-signal/);
  assert.equal(
    specs['profiles select'].registry?.options.find((option) => option.name === 'intent-signal')?.multiple,
    true,
  );
  assert.match(specs['profiles conformance'].summary, /does not validate design quality or readiness/);
});

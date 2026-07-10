import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildEvidenceGroundedDecisionAgentProfileReadback,
  EVIDENCE_GROUNDED_DECISION_AGENT_PROFILE_CONTRACT_REF,
} from '../../src/modules/pack/index.ts';
import { buildFoundryEvidenceProfileInspect } from '../../src/modules/foundry-lab/foundry-agent-cli-spine.ts';

const modules = [
  'pack',
  'stagecraft',
  'runway',
  'ledger',
  'connect',
  'workspace',
  'atlas',
  'console',
  'foundry-lab',
  'charter',
];

test('evidence profile keeps the Pack contract, module ownership, and fail-closed boundary', () => {
  const profile = buildEvidenceGroundedDecisionAgentProfileReadback()
    .evidence_grounded_decision_agent_profile as any;

  assert.equal(profile.contract_ref, EVIDENCE_GROUNDED_DECISION_AGENT_PROFILE_CONTRACT_REF);
  assert.deepEqual(profile.module_surface_ids, modules);
  assert.deepEqual(profile.module_owner_ids, modules);
  assert.deepEqual(
    Object.fromEntries(profile.module_ownership.map((entry: any) => [entry.module_id, entry.owns])),
    {
      pack: 'profile_and_abi',
      stagecraft: 'mode_routing_and_evidence_policy',
      runway: 'durable_attempt_and_human_gate',
      ledger: 'evidence_and_provenance_refs',
      connect: 'tool_and_resource_connector_trust',
      workspace: 'sensitive_source_lifecycle',
      atlas: 'catalog_and_discovery',
      console: 'drilldown_projection',
      'foundry-lab': 'evaluation_and_promotion',
      charter: 'forbidden_claims_and_false_authority_policy',
    },
  );
  assert.equal(profile.fail_closed_rules.every((rule: any) => rule.success_closeout_allowed === false), true);
  assert.equal(profile.fail_closed_rules.some((rule: any) => rule.allowed_outcomes.includes('success')), false);
  assert.deepEqual(profile.forbidden_claim_ids, [
    'domain_ready',
    'quality_verdict',
    'final_decision',
    'artifact_authority',
    'owner_receipt',
    'production_ready',
  ]);
  assert.equal(
    Object.entries(profile.authority_boundary).every(([, value]) => value === false),
    true,
  );
  assert.equal(profile.contract.machine_boundary.profile_catalog_is_agent_design_template_source, false);
  assert.equal(profile.contract.machine_boundary.reference_design_sources_remain_design_source, true);
  assert.equal(profile.contract.profile_catalog_entry.catalog_role, 'lower_bound_conformance_guardrail');
  assert.equal(
    profile.contract.profile_catalog_entry.design_source_boundary
      .target_agent_pack_requires_source_derived_design_consumption_refs,
    true,
  );
});

test('Foundry evidence inspect composes all module readbacks without creating authority', () => {
  const inspect = buildFoundryEvidenceProfileInspect([]).foundry_evidence_profile as any;

  assert.deepEqual(inspect.module_surface_status.module_surface_ids, modules);
  assert.equal(inspect.module_surface_status.non_live_surface_count, modules.length);
  assert.equal(inspect.module_surface_status.live_evidence_performed, false);
  assert.equal(inspect.module_surface_status.can_claim_runtime_ready, false);
  assert.equal(inspect.module_surface_status.can_claim_domain_ready, false);
  assert.deepEqual(
    Object.fromEntries(Object.entries(inspect.module_surfaces).map(([moduleId, surface]: [string, any]) => [
      moduleId,
      surface.surface_kind,
    ])),
    {
      pack: 'opl_pack_evidence_grounded_decision_agent_profile_abi_surface',
      stagecraft: 'opl_evidence_grounded_stagecraft_profile_policy_readback',
      runway: 'opl_evidence_grounded_runway_profile_policy_readback',
      ledger: 'opl_ledger_evidence_grounded_decision_agent_profile_substrate',
      connect: 'opl_connect_evidence_grounded_decision_agent_profile_substrate',
      workspace: 'opl_workspace_evidence_grounded_decision_agent_profile_substrate',
      atlas: 'opl_atlas_evidence_grounded_decision_agent_profile_catalog',
      console: 'opl_console_evidence_grounded_decision_agent_profile_drilldown_ref',
      'foundry-lab': 'opl_foundry_lab_evidence_grounded_decision_agent_profile_eval_surface',
      charter: 'opl_charter_evidence_grounded_decision_agent_profile_boundary',
    },
  );
  assert.deepEqual(
    {
      pack: inspect.module_surfaces.pack.can_claim_domain_ready,
      stagecraft: inspect.module_surfaces.stagecraft.authority_boundary.can_claim_domain_ready,
      runway: inspect.module_surfaces.runway.authority_boundary.can_claim_domain_ready,
      ledger: inspect.module_surfaces.ledger.authority_boundary.can_claim_domain_ready,
      connect: inspect.module_surfaces.connect.authority_boundary.can_claim_domain_ready,
      workspace: inspect.module_surfaces.workspace.authority_boundary.can_claim_domain_ready,
      atlas: inspect.module_surfaces.atlas.authority_boundary.catalog_can_claim_domain_ready,
      console: inspect.module_surfaces.console.authority_boundary.can_claim_domain_ready,
      'foundry-lab': inspect.module_surfaces['foundry-lab'].authority_boundary
        .eval_surface_can_claim_domain_ready,
      charter: inspect.module_surfaces.charter.authority_boundary.can_claim_domain_ready,
    },
    Object.fromEntries(modules.map((moduleId) => [moduleId, false])),
  );
});

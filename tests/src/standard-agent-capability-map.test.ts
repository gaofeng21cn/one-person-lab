import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { assertRepoJsonSchemaPayload } from '../../src/kernel/repo-json-schema.ts';
import {
  materializeStandardAgentCapabilityMap,
} from '../../src/modules/pack/standard-agent-capability-map.ts';
import {
  buildProfileCapabilityPlan,
  buildProfileCapabilityPlanInputProjection,
} from '../../src/modules/pack/profile-capability-plan.ts';

const AUTHORITY_BOUNDARY = {
  can_write_domain_truth: false,
  can_write_memory_body: false,
  can_mutate_artifact_body: false,
  can_sign_owner_receipt: false,
  can_create_typed_blocker: false,
  can_authorize_quality_or_export: false,
  can_claim_domain_ready: false,
  can_claim_production_ready: false,
};

const POLICY_PROFILE = {
  authority_boundary: AUTHORITY_BOUNDARY,
  forbidden_surfaces: ['domain_truth'],
  verification_refs: ['scripts/verify.sh'],
  owner_closeout_boundary: {
    owner: 'demo-agent',
    required_return_shapes: ['owner_receipt_ref'],
    can_write_owner_receipt_body: false,
    can_create_typed_blocker: false,
  },
};

const CARRIER_PROJECTION_CONTRACT = {
  canonical_source: 'agent/primary_skill/SKILL.md',
  carrier_skill_ref: 'plugins/demo/skills/demo/SKILL.md',
  carrier_materialization: 'materialized_full_skill_copy',
  codex_install_requires_real_skill_md: true,
  plugin_skill_must_remain_real_file: true,
  carrier_role: 'transport_install_detail_not_agent_membership_or_status',
  authority: false,
  carrier_can_override_canonical_source: false,
  carrier_can_claim_agent_membership_or_status: false,
  carrier_is_domain_truth_source: false,
};

function write(filePath: string, content = 'fixture\n') {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function writeJson(filePath: string, payload: unknown) {
  write(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function derivedCapabilityMap() {
  return {
    surface_kind: 'opl_standard_agent_capability_map',
    schema_version: 'standard-agent-capability-map.v1',
    domain_id: 'demo-agent',
    domain_label: 'Demo Agent',
    owner: 'demo-agent',
    schema_ref: 'contracts/opl-framework/standard-agent-capability-map.schema.json',
    resolver_policy: 'resolver_index_only_no_domain_truth',
    capability_pack: {
      pack_id: 'demo-agent.capability-pack',
      pack_root_ref: 'agent/',
      map_ref: 'contracts/capability_map.json',
      pack_role: 'declarative_domain_capability_pack',
      capability_pack_can_claim_domain_ready: false,
    },
    capability_policy_profiles: { standard: POLICY_PROFILE },
    authority_boundary: AUTHORITY_BOUNDARY,
    capability_inventory: {
      source_kind: 'standard_agent_repo_scan.v1',
      policy_profile_ref: '#/capability_policy_profiles/standard',
      professional_skill_order: ['skill-b', 'skill-a'],
      feedback_index_ref: 'contracts/capability_map.json#/feedback_token_index',
      deltas: [
        {
          capability_id: 'demo-agent.primary_skill',
          source_ref: 'agent/primary_skill/SKILL.md',
          carrier_projection_contract: CARRIER_PROJECTION_CONTRACT,
        },
        {
          capability_id: 'demo-agent.stage-prompts',
          source_ref: 'agent/prompts/',
          projection_refs: ['agent/stages/manifest.json'],
        },
        {
          capability_id: 'demo-agent.tools',
          source_ref: 'agent/tools/domain_affordances.md',
        },
        {
          capability_id: 'demo-agent.knowledge',
          source_ref: 'agent/knowledge/',
        },
        {
          capability_id: 'demo-agent.quality',
          source_ref: 'agent/quality_gates/',
        },
        {
          capability_id: 'demo-agent.eval',
          source_ref: 'contracts/eval.json',
          surface_role: 'eval_suite',
          capability_kind: 'contract_module',
        },
      ],
    },
    feedback_token_index: {
      beta: {
        canonical_capability_ids: ['skill-b'],
        owner_stage_refs: ['stage-b'],
      },
      alpha: {
        canonical_capability_ids: ['skill-a'],
        owner_stage_refs: ['stage-a'],
      },
      shared: {
        canonical_capability_ids: ['skill-a', 'skill-b'],
        owner_stage_refs: ['stage-shared'],
      },
    },
  };
}

function createDerivedRepo(root: string) {
  write(path.join(root, 'scripts/verify.sh'));
  write(path.join(root, 'agent/primary_skill/SKILL.md'));
  write(path.join(root, 'agent/professional_skills/skill-a/SKILL.md'));
  write(path.join(root, 'agent/professional_skills/skill-b/SKILL.md'));
  write(path.join(root, 'agent/professional_skills/skill-b/resources/minimal-resource-pack.md'));
  write(path.join(root, 'agent/prompts/stage.md'));
  writeJson(path.join(root, 'agent/stages/manifest.json'), {});
  write(path.join(root, 'agent/tools/domain_affordances.md'));
  write(path.join(root, 'agent/knowledge/domain.md'));
  write(path.join(root, 'agent/quality_gates/quality.md'));
  writeJson(path.join(root, 'contracts/eval.json'), {});
  const capabilityMap = derivedCapabilityMap();
  writeJson(path.join(root, 'contracts/capability_map.json'), capabilityMap);
  return capabilityMap;
}

test('explicit capability maps retain their existing policy-profile normalization path', () => {
  const capabilityMap = {
    capability_policy_profiles: { standard: POLICY_PROFILE },
    capabilities: [{
      capability_id: 'explicit',
      capability_policy_profile_ref: '#/capability_policy_profiles/standard',
    }],
  };
  const result = materializeStandardAgentCapabilityMap(process.cwd(), capabilityMap);
  assert.deepEqual(result.blockers, []);
  assert.equal((result.capabilityMap as any).capabilities[0].capability_id, 'explicit');
  assert.deepEqual((result.capabilityMap as any).capabilities[0].authority_boundary, AUTHORITY_BOUNDARY);
});

test('scan-derived capability inventory preserves declared order and derives skill routing metadata', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-capability-inventory-'));
  try {
    const capabilityMap = createDerivedRepo(root);
    const result = materializeStandardAgentCapabilityMap(root, capabilityMap);
    assert.deepEqual(result.blockers, []);
    const capabilities = (result.capabilityMap as any).capabilities;
    assert.deepEqual(capabilities.map((entry: any) => entry.capability_id), [
      'demo-agent.primary_skill',
      'skill-b',
      'skill-a',
      'demo-agent.stage-prompts',
      'demo-agent.tools',
      'demo-agent.knowledge',
      'demo-agent.quality',
      'demo-agent.eval',
    ]);
    assert.deepEqual(capabilities[1].improvement_tokens, ['skill-b', 'beta', 'shared']);
    assert.deepEqual(capabilities[1].stage_refs, ['stage-b', 'stage-shared']);
    assert.deepEqual(capabilities[1].resource_refs, [
      'agent/professional_skills/skill-b/resources/minimal-resource-pack.md',
    ]);
    assert.equal(capabilities[1].codex_default_exposure, false);
    assert.deepEqual(capabilities[1].allowed_exposure_scopes, ['domain_runtime_stage']);
    assert.deepEqual(capabilities[1].authority_boundary, AUTHORITY_BOUNDARY);
    assert.deepEqual(capabilities[0].carrier_projection_contract, CARRIER_PROJECTION_CONTRACT);
    assert.equal(Object.hasOwn(capabilities[3], 'source_ref'), false);

    const missingSkill = structuredClone(capabilityMap);
    missingSkill.capability_inventory.professional_skill_order = ['skill-b'];
    assert.equal(
      materializeStandardAgentCapabilityMap(root, missingSkill).blockers.includes(
        'capability_inventory_professional_skill_order_missing:skill-a',
      ),
      true,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('scan-derived capability deltas cannot override Framework-owned defaults', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-capability-inventory-override-'));
  try {
    const capabilityMap = createDerivedRepo(root);
    const injected = structuredClone(capabilityMap);
    Object.assign(injected.capability_inventory.deltas[0], {
      canonical_owner: 'injected-owner',
      capability_policy_profile_ref: '#/capability_policy_profiles/injected',
      physical_source_ref: { ref_kind: 'repo_path', ref: 'outside', role: 'injected' },
      authority_boundary: { can_write_domain_truth: true },
    });
    assert.throws(() => assertRepoJsonSchemaPayload({
      repoRoot: process.cwd(),
      schemaRef: 'contracts/opl-framework/standard-agent-capability-map.schema.json',
      payload: injected,
      label: 'Injected capability map',
    }), /failed JSON Schema validation/);
    const result = materializeStandardAgentCapabilityMap(root, injected);
    assert.equal(result.blockers.some((blocker) => blocker.startsWith(
      'capability_inventory_delta_fields_unsupported:demo-agent.primary_skill:',
    )), true);
    assert.equal((result.capabilityMap as any).capabilities.some(
      (entry: any) => entry.canonical_owner === 'injected-owner'
        || entry.authority_boundary?.can_write_domain_truth === true,
    ), false);

    const malformedRuntimeRefs = structuredClone(capabilityMap);
    (malformedRuntimeRefs.capability_inventory.deltas[0] as any).runtime_projection_refs = [{
      ref_kind: 'repo_path',
      ref: 'agent/primary_skill/SKILL.md',
    }];
    assert.equal(materializeStandardAgentCapabilityMap(root, malformedRuntimeRefs).blockers.includes(
      'capability_inventory_runtime_projection_refs_invalid:demo-agent.primary_skill',
    ), true);

    const carrierAuthority = structuredClone(capabilityMap);
    const carrierDelta = carrierAuthority.capability_inventory.deltas[0] as {
      carrier_projection_contract: typeof CARRIER_PROJECTION_CONTRACT;
    };
    carrierDelta.carrier_projection_contract.authority = true;
    carrierDelta.carrier_projection_contract.carrier_can_override_canonical_source = true;
    assert.equal(materializeStandardAgentCapabilityMap(root, carrierAuthority).blockers.includes(
      'capability_inventory_delta_shape_invalid:demo-agent.primary_skill',
    ), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('profile capability planning resolves exact refs from a scan-derived catalog', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-derived-capability-plan-'));
  try {
    createDerivedRepo(root);
    const selectionFile = path.join(root, 'selection.json');
    writeJson(selectionFile, {
      version: 'g2',
      profile_capability_plan_input: buildProfileCapabilityPlanInputProjection({
        exactCapabilityRefs: ['skill-b', 'contracts/capability_map.json#/capabilities/1'],
      }),
      profile_selection_receipt: {
        surface_kind: 'opl_profile_selection_receipt',
        version: 'profile-selection-receipt.v1',
        status: 'selected',
        selected_profile_refs: ['opl-profile:demo.v1'],
      },
    });
    const readback = buildProfileCapabilityPlan({
      selectionFile,
      catalogRepos: [root],
    }).capability_plan;
    assert.deepEqual(readback.exact_capability_readout.capability_refs, [
      'contracts/capability_map.json#/capabilities/1',
      'skill-b',
    ]);
    assert.equal(readback.dependency_feasibility.candidate_capability_count, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

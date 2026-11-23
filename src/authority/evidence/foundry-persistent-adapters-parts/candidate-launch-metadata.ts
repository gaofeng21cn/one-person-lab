import { normalizeAgentPluginName } from '../../../kernel/agent-plugin-manifest.ts';
import { canonicalJsonBytes } from '../../../kernel/canonical-json.ts';
import type { AgentBlueprint } from '../../evolution/index.ts';
import { CANDIDATE_QUALITY_RUBRIC_PATH, type CandidateResourceBinding } from './shared.ts';

const PRIMARY_SKILL_PATH = 'agent/primary_skill/SKILL.md';
const CAPABILITY_MAP_PATH = 'contracts/capability_map.json';
const KNOWLEDGE_CATALOG_PATH = 'contracts/durable_knowledge_catalog.json';

export function candidateLaunchMetadata(
  blueprint: AgentBlueprint,
  resources: CandidateResourceBinding[],
) {
  const domainId = blueprint.target_domain_id;
  const skillName = normalizeAgentPluginName(blueprint.target_agent_id);
  const boundary = {
    can_write_domain_truth: false,
    can_write_memory_body: false,
    can_mutate_artifact_body: false,
    can_sign_owner_receipt: false,
    can_create_typed_blocker: false,
    can_authorize_quality_or_export: false,
    can_claim_domain_ready: false,
    can_claim_production_ready: false,
  };
  const surfaces: Array<readonly [id: string, role: string, kind: string, ref: string]> = [
    ['primary', 'primary_skill', 'primary_skill', PRIMARY_SKILL_PATH],
    ['authority', 'policy_pack', 'contract_module', 'contracts/authority_policy.json'],
    ['memory', 'policy_pack', 'contract_module', 'contracts/memory_policy.json'],
    ['rubric', 'quality_gate', 'reference_pack', CANDIDATE_QUALITY_RUBRIC_PATH],
    ['evaluation', 'eval_suite', 'contract_module', 'contracts/evaluation_spec.json'],
    ...resources.filter(({ kind }) => kind === 'prompt')
      .map(({ sha256, pack_path }) => [sha256, 'stage_prompt', 'stage_prompt', pack_path] as const),
    ...resources.filter(({ kind }) => kind === 'knowledge')
      .map(({ sha256, pack_path }) => [sha256, 'knowledge_pack', 'reference_pack', pack_path] as const),
    ...resources.filter(({ kind }) => kind === 'tool')
      .map(({ sha256, pack_path }) => [sha256, 'tool_connector', 'tool_connector', pack_path] as const),
  ];
  const capabilities = surfaces.map(([id, role, kind, ref]) => {
    const source = { ref_kind: ref.startsWith('contracts/') ? 'contract_ref' : 'repo_path', ref, role };
    return {
      capability_id: `${domainId}.${role}.${id}`,
      surface_role: role,
      capability_kind: kind,
      canonical_owner: domainId,
      physical_source_ref: source,
      runtime_projection_refs: [source],
      sync_policy: 'repo_local_default',
      externalization_reason: 'Foundry candidate resource.',
      authority_boundary: boundary,
    };
  });
  const skill = `---
name: ${skillName}
description: Use this Skill to start a declared action for this Foundry-generated Agent.
---

# ${skillName}

Use the generated action catalog and Stage manifest to choose a declared action and locate its Stage instructions, skills and evidence requirements. The Agent's owner controls domain truth, quality verdicts and acceptance.
`;
  return [
    { path: PRIMARY_SKILL_PATH, bytes: Buffer.from(skill, 'utf8') },
    { path: CAPABILITY_MAP_PATH, bytes: canonicalJsonBytes({
      surface_kind: 'opl_standard_agent_capability_map',
      schema_version: 'standard-agent-capability-map.v1',
      domain_id: domainId,
      owner: domainId,
      resolver_policy: 'resolver_index_only_no_domain_truth',
      capability_pack: {
        pack_id: `${domainId}.capability_pack.v1`,
        pack_root_ref: 'agent/',
        map_ref: CAPABILITY_MAP_PATH,
        pack_role: 'declarative_domain_capability_pack',
        capability_pack_can_claim_domain_ready: false,
      },
      capabilities,
      authority_boundary: boundary,
    }) },
    { path: KNOWLEDGE_CATALOG_PATH, bytes: canonicalJsonBytes({
      surface_kind: 'opl_durable_knowledge_catalog',
      version: 'durable-knowledge-catalog.v2',
      owner: 'one-person-lab',
      domain_id: domainId,
      // A locked Stage resource does not declare a durable item's owner, scope, or review.
      items: [],
    }) },
  ];
}

import fs from 'node:fs';
import path from 'node:path';

import { isRecord } from '../../kernel/contract-validation.ts';
import { resolveContainedRepoPath } from '../../kernel/repo-contained-json-file.ts';

type JsonRecord = Record<string, unknown>;
type Surface = [role: string, kind: string, physicalRole: string, runtimeRole: string];

const INVENTORY_SOURCE_KIND = 'standard_agent_repo_scan.v1';
const PRIMARY_SKILL_REF = 'agent/primary_skill/SKILL.md';
const PROFESSIONAL_SKILL_ROOT = 'agent/professional_skills';
const DELTA_KEYS = new Set([
  'capability_id',
  'source_ref',
  'projection_refs',
  'physical_source_role',
  'surface_role',
  'capability_kind',
  'runtime_projection_refs',
  'sync_policy',
  'carrier_projection_contract',
]);
const SURFACE_ROLES = new Set([
  'stage_prompt',
  'primary_skill',
  'professional_skill',
  'tool_connector',
  'knowledge_pack',
  'quality_gate',
  'eval_suite',
]);
const CAPABILITY_KINDS = new Set([
  'stage_prompt',
  'stage_projection',
  'runtime_projection',
  'primary_skill',
  'professional_skill',
  'tool_connector',
  'reference_pack',
  'contract_module',
]);
const REF_KINDS = new Set(['repo_path', 'contract_ref', 'external_capability_ref']);
const CARRIER_PROJECTION_KEYS = new Set([
  'canonical_source',
  'carrier_skill_ref',
  'carrier_materialization',
  'codex_install_requires_real_skill_md',
  'plugin_skill_must_remain_real_file',
  'carrier_role',
  'authority',
  'carrier_can_override_canonical_source',
  'carrier_can_claim_agent_membership_or_status',
  'carrier_is_domain_truth_source',
]);

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function records(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function unique(values: string[]) {
  return [...new Set(values)];
}

export function listRepoProfessionalSkillRefs(repoRoot: string) {
  const root = path.join(repoRoot, PROFESSIONAL_SKILL_ROOT);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `${PROFESSIONAL_SKILL_ROOT}/${entry.name}/SKILL.md`)
    .filter((ref) => {
      try {
        return fs.lstatSync(path.join(repoRoot, ref)).isFile();
      } catch {
        return false;
      }
    })
    .sort();
}

function inferredSurface(ref: string): Surface | null {
  if (ref === PRIMARY_SKILL_REF) return ['primary_skill', 'primary_skill', 'standard_opl_primary_skill_source', 'standard_opl_primary_skill_source'];
  if (/^agent\/professional_skills\/[^/]+\/SKILL\.md$/.test(ref)) return ['professional_skill', 'professional_skill', 'repo_local_professional_skill_source', 'codex_skill_guidance_source'];
  if (ref.startsWith('agent/prompts/')) return ['stage_prompt', 'stage_prompt', 'stage_operating_prompt_sources', 'stage_prompt_pack'];
  if (ref.startsWith('agent/tools/')) return ['tool_connector', 'tool_connector', 'domain_tool_connector_catalog', 'tool_affordance_boundary'];
  if (ref.startsWith('agent/knowledge/')) return ['knowledge_pack', 'reference_pack', 'knowledge_pack', 'knowledge_pack'];
  if (ref.startsWith('agent/quality_gates/')) return ['quality_gate', 'contract_module', 'quality_gate_pack', 'quality_gate_pack'];
  return null;
}

function refKind(ref: string) {
  return ref.startsWith('contracts/') ? 'contract_ref' : 'repo_path';
}

function validCarrierProjectionContract(value: unknown) {
  return isRecord(value)
    && Object.keys(value).every((key) => CARRIER_PROJECTION_KEYS.has(key))
    && typeof value.canonical_source === 'string'
    && value.canonical_source.trim().length > 0
    && typeof value.carrier_skill_ref === 'string'
    && value.carrier_skill_ref.trim().length > 0
    && typeof value.carrier_materialization === 'string'
    && value.carrier_materialization.trim().length > 0
    && value.codex_install_requires_real_skill_md === true
    && value.plugin_skill_must_remain_real_file === true
    && typeof value.carrier_role === 'string'
    && value.carrier_role.trim().length > 0
    && value.authority === false
    && value.carrier_can_override_canonical_source === false
    && value.carrier_can_claim_agent_membership_or_status === false
    && value.carrier_is_domain_truth_source === false;
}

function sourceExists(repoDir: string, ref: string, id: string, blockers: string[]) {
  if (ref.includes('#')) {
    blockers.push(`capability_inventory_source_ref_has_pointer:${id}:${ref}`);
    return false;
  }
  try {
    const resolved = resolveContainedRepoPath(repoDir, ref, `Capability inventory source ${id}`);
    const canonical = `${resolved.repo_relative_ref}${fs.statSync(resolved.real_path).isDirectory() ? '/' : ''}`;
    if (canonical === ref) return true;
  } catch {
    // Report one stable blocker below.
  }
  blockers.push(`capability_inventory_source_unresolved:${id}:${ref}`);
  return false;
}

function feedbackRouting(map: JsonRecord, id: string) {
  const tokens: string[] = [];
  const stages: string[] = [];
  const index = isRecord(map.feedback_token_index) ? map.feedback_token_index : {};
  Object.entries(index).forEach(([token, value]) => {
    if (!isRecord(value) || !stringList(value.canonical_capability_ids).includes(id)) return;
    tokens.push(token);
    stages.push(...stringList(value.owner_stage_refs));
  });
  return { tokens: unique(tokens), stages: unique(stages) };
}

function professionalCapability(input: {
  map: JsonRecord;
  id: string;
  ref: string;
  owner: string;
  policyRef: string;
  feedbackRef: string | null;
  repoDir: string;
}) {
  const routing = feedbackRouting(input.map, input.id);
  const resourceRef = input.ref.replace(/\/SKILL\.md$/, '/resources/minimal-resource-pack.md');
  return {
    capability_id: input.id,
    surface_role: 'professional_skill',
    capability_kind: 'professional_skill',
    canonical_owner: input.owner,
    physical_source_ref: { ref_kind: 'repo_path', ref: input.ref, role: 'repo_local_professional_skill_source' },
    runtime_projection_refs: [
      { ref_kind: 'repo_path', ref: input.ref, role: 'codex_skill_guidance_source' },
      ...(input.feedbackRef
        ? [{ ref_kind: 'contract_ref', ref: input.feedbackRef, role: 'domain_feedback_target_mapping' }]
        : []),
    ],
    sync_policy: 'repo_local_default',
    externalization_reason: 'Repo-local professional method discovered from the standard Agent Pack.',
    capability_policy_profile_ref: input.policyRef,
    canonical_target_paths: [input.ref],
    improvement_tokens: unique([input.id, ...routing.tokens]),
    stage_refs: routing.stages,
    ...(fs.existsSync(path.join(input.repoDir, resourceRef)) ? { resource_refs: [resourceRef] } : {}),
    exposure_layer: 'repo_internal_professional_skill',
    codex_default_exposure: false,
    allowed_exposure_scopes: ['domain_runtime_stage'],
  };
}

function deltaCapability(
  repoDir: string,
  owner: string,
  policyRef: string,
  delta: JsonRecord,
  blockers: string[],
) {
  const id = typeof delta.capability_id === 'string' ? delta.capability_id.trim() : '';
  const sourceRef = typeof delta.source_ref === 'string' ? delta.source_ref.trim() : '';
  const unsupportedKeys = Object.keys(delta).filter((key) => !DELTA_KEYS.has(key)).sort();
  if (unsupportedKeys.length > 0) {
    blockers.push(`capability_inventory_delta_fields_unsupported:${id || 'unknown'}:${unsupportedKeys.join(',')}`);
    return null;
  }
  if (!id || !sourceRef || !sourceExists(repoDir, sourceRef, id, blockers)) {
    if (!id || !sourceRef) blockers.push('capability_inventory_delta_identity_invalid');
    return null;
  }
  const inferred = inferredSurface(sourceRef);
  const role = typeof delta.surface_role === 'string' ? delta.surface_role : inferred?.[0];
  const kind = typeof delta.capability_kind === 'string' ? delta.capability_kind : inferred?.[1];
  if (!role || !kind || !SURFACE_ROLES.has(role) || !CAPABILITY_KINDS.has(kind)) {
    blockers.push(`capability_inventory_surface_kind_unresolved:${id}:${sourceRef}`);
    return null;
  }
  const projectionRefs = delta.projection_refs;
  if (projectionRefs !== undefined && (
    !Array.isArray(projectionRefs)
    || projectionRefs.length !== stringList(projectionRefs).length
  )) {
    blockers.push(`capability_inventory_projection_refs_invalid:${id}`);
    return null;
  }
  const runtimeProjectionRefs = delta.runtime_projection_refs;
  if (runtimeProjectionRefs !== undefined && (
    !Array.isArray(runtimeProjectionRefs)
    || runtimeProjectionRefs.length === 0
    || !runtimeProjectionRefs.every((entry) => isRecord(entry)
      && typeof entry.ref_kind === 'string'
      && REF_KINDS.has(entry.ref_kind)
      && typeof entry.ref === 'string'
      && entry.ref.trim().length > 0
      && typeof entry.role === 'string'
      && entry.role.trim().length > 0)
  )) {
    blockers.push(`capability_inventory_runtime_projection_refs_invalid:${id}`);
    return null;
  }
  const physicalRole = delta.physical_source_role;
  const syncPolicy = delta.sync_policy;
  const carrierProjectionContract = delta.carrier_projection_contract;
  if ((physicalRole !== undefined && (typeof physicalRole !== 'string' || !physicalRole.trim()))
    || (syncPolicy !== undefined && (typeof syncPolicy !== 'string' || !syncPolicy.trim()))
    || (carrierProjectionContract !== undefined && !validCarrierProjectionContract(carrierProjectionContract))) {
    blockers.push(`capability_inventory_delta_shape_invalid:${id}`);
    return null;
  }
  const sourceKind = refKind(sourceRef);
  return {
    capability_id: id,
    surface_role: role,
    capability_kind: kind,
    canonical_owner: owner,
    physical_source_ref: {
      ref_kind: sourceKind,
      ref: sourceRef,
      role: typeof physicalRole === 'string' ? physicalRole : inferred?.[2] ?? `${role}_source`,
    },
    runtime_projection_refs: runtimeProjectionRefs ?? [
      { ref_kind: sourceKind, ref: sourceRef, role: inferred?.[3] ?? `${role}_source` },
      ...stringList(projectionRefs).map((ref) => ({ ref_kind: refKind(ref), ref, role: `${role}_projection` })),
    ],
    sync_policy: typeof syncPolicy === 'string' ? syncPolicy : 'repo_local_default',
    externalization_reason: 'Repo-owned standard Agent Pack surface.',
    capability_policy_profile_ref: policyRef,
    canonical_target_paths: [sourceRef],
    improvement_tokens: [id, role],
    ...(validCarrierProjectionContract(carrierProjectionContract)
      ? { carrier_projection_contract: carrierProjectionContract }
      : {}),
  };
}

export function deriveStandardAgentCapabilityInventory(repoDir: string, capabilityMap: unknown) {
  if (!isRecord(capabilityMap) || !isRecord(capabilityMap.capability_inventory)) {
    return { capabilityMap, blockers: [] as string[] };
  }
  const inventory = capabilityMap.capability_inventory;
  const blockers: string[] = [];
  if (inventory.source_kind !== INVENTORY_SOURCE_KIND) blockers.push('capability_inventory_source_kind_invalid');
  if (Array.isArray(capabilityMap.capabilities)) blockers.push('capability_inventory_conflicts_with_explicit_capabilities');
  const owner = typeof capabilityMap.owner === 'string' ? capabilityMap.owner.trim() : '';
  const policyRef = typeof inventory.policy_profile_ref === 'string' ? inventory.policy_profile_ref.trim() : '';
  if (!owner || !policyRef) blockers.push('capability_inventory_defaults_invalid');

  const refs = listRepoProfessionalSkillRefs(repoDir);
  const refById = new Map(refs.map((ref) => [ref.split('/').at(-2) ?? '', ref]));
  const order = stringList(inventory.professional_skill_order);
  [...refById.keys()].filter((id) => !order.includes(id))
    .forEach((id) => blockers.push(`capability_inventory_professional_skill_order_missing:${id}`));
  order.filter((id) => !refById.has(id))
    .forEach((id) => blockers.push(`capability_inventory_professional_skill_source_missing:${id}`));
  if (order.length !== new Set(order).size) blockers.push('capability_inventory_professional_skill_order_repeats_id');

  const deltas = records(inventory.deltas);
  if (!Array.isArray(inventory.deltas) || deltas.length !== inventory.deltas.length) {
    blockers.push('capability_inventory_deltas_invalid');
  }
  const deltaIds = deltas.map((delta) => typeof delta.capability_id === 'string' ? delta.capability_id.trim() : '');
  deltaIds.filter((id, index) => id && deltaIds.indexOf(id) !== index)
    .forEach((id) => blockers.push(`capability_inventory_delta_repeats_id:${id}`));
  order.filter((id) => deltaIds.includes(id))
    .forEach((id) => blockers.push(`capability_inventory_professional_skill_has_redundant_delta:${id}`));

  const materializedDeltas = deltas.map((delta) => deltaCapability(repoDir, owner, policyRef, delta, blockers))
    .filter((entry): entry is NonNullable<ReturnType<typeof deltaCapability>> => entry !== null);
  const primary = materializedDeltas.filter((entry) =>
    isRecord(entry.physical_source_ref) && entry.physical_source_ref.ref === PRIMARY_SKILL_REF
  );
  if (fs.existsSync(path.join(repoDir, PRIMARY_SKILL_REF)) && primary.length !== 1) {
    blockers.push('capability_inventory_primary_skill_delta_required_once');
  }
  const feedbackRef = typeof inventory.feedback_index_ref === 'string' ? inventory.feedback_index_ref.trim() : null;
  const professional = order.flatMap((id) => {
    const ref = refById.get(id);
    return ref ? [professionalCapability({ map: capabilityMap, id, ref, owner, policyRef, feedbackRef, repoDir })] : [];
  });
  const capabilities = [
    ...primary,
    ...professional,
    ...materializedDeltas.filter((entry) => !primary.includes(entry)),
  ];
  const ids = capabilities.map((entry) => String(entry.capability_id));
  ids.filter((id, index) => ids.indexOf(id) !== index)
    .forEach((id) => blockers.push(`capability_inventory_materialized_id_repeats:${id}`));
  return {
    capabilityMap: { ...capabilityMap, capabilities },
    blockers: unique(blockers),
  };
}

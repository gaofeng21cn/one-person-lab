import fs from 'node:fs';
import path from 'node:path';

import { isRecord } from '../../kernel/contract-validation.ts';
import { readJsonFileOrNull } from '../../kernel/json-file.ts';
import { buildEvidenceGroundedDecisionAgentProfileReadback } from '../pack/index.ts';

const EVIDENCE_PROFILE_ID = 'evidence_grounded_decision_agent_profile.v1';
const EVIDENCE_PROFILE_REF = `opl-profile:${EVIDENCE_PROFILE_ID}`;

const REQUIRED_STAGE_ARCHETYPES = [
  'material_or_case_intake',
  'structured_extraction',
  'enrichment',
  'mode_routing',
  'evidence_and_tool_execution',
  'synthesis',
  'independent_review_or_human_gate',
  'decision_support_artifact_with_evidence_trace',
];

const REQUIRED_CAPABILITY_KINDS = [
  'stage_prompt',
  'tool_connector',
  'reference_pack',
  'contract_module',
];

const REQUIRED_SURFACE_ROLES = [
  'stage_prompt',
  'tool_connector',
  'knowledge_pack',
  'quality_gate',
  'eval_suite',
];

const EVIDENCE_TRIGGER_SIGNALS = [
  'case',
  'clinical',
  'decision',
  'diagnosis',
  'differential',
  'evidence',
  'guideline',
  'recommendation',
  'risk',
  'surgery',
  'triage',
];

type ProfileCatalogEntry = {
  profile_id: string;
  profile_ref: string;
  profile_role: string;
  contract_ref: string;
  trigger_signals: string[];
  required_stage_archetypes: string[];
  required_capability_kinds: string[];
  required_surface_roles: string[];
  required_evidence_objects: string[];
  required_reference_pack_roles: string[];
  source_readback_command: string;
  can_claim_domain_ready: false;
  can_claim_production_ready: false;
};

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.filter((entry): entry is string => typeof entry === 'string' && entry.trim()).map((entry) => entry.trim()))];
}

function stringOrFallback(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function stringsOrFallback(value: unknown, fallback: string[]) {
  const values = uniqueStrings(value);
  return values.length > 0 ? values : fallback;
}

function evidenceGroundedCatalogEntry(): ProfileCatalogEntry {
  const readback = buildEvidenceGroundedDecisionAgentProfileReadback()
    .evidence_grounded_decision_agent_profile;
  const contractEntry = isRecord(readback.contract.profile_catalog_entry)
    ? readback.contract.profile_catalog_entry
    : {};
  return {
    profile_id: stringOrFallback(contractEntry.profile_id, readback.profile_id),
    profile_ref: stringOrFallback(contractEntry.profile_ref, EVIDENCE_PROFILE_REF),
    profile_role: stringOrFallback(readback.contract.profile_role, 'standard_profile_for_evidence_grounded_decision_support_agents'),
    contract_ref: readback.contract_ref,
    trigger_signals: stringsOrFallback(contractEntry.trigger_signals, EVIDENCE_TRIGGER_SIGNALS),
    required_stage_archetypes: stringsOrFallback(contractEntry.required_stage_archetypes, REQUIRED_STAGE_ARCHETYPES),
    required_capability_kinds: stringsOrFallback(contractEntry.required_capability_kinds, REQUIRED_CAPABILITY_KINDS),
    required_surface_roles: stringsOrFallback(contractEntry.required_surface_roles, REQUIRED_SURFACE_ROLES),
    required_evidence_objects: stringsOrFallback(contractEntry.required_evidence_objects, readback.first_class_object_names),
    required_reference_pack_roles: stringsOrFallback(contractEntry.reference_pack_requirements, [
      'guideline_or_reference_pack',
      'evidence_source_freshness_policy',
      'provenance_and_scope_policy',
    ]),
    source_readback_command: 'opl profiles inspect evidence_grounded_decision_agent_profile.v1 --json',
    can_claim_domain_ready: false,
    can_claim_production_ready: false,
  };
}

function catalogEntries(): ProfileCatalogEntry[] {
  return [evidenceGroundedCatalogEntry()];
}

function matchedTriggerSignals(intent: string, profile: ProfileCatalogEntry): string[] {
  const normalized = intent.toLowerCase();
  return profile.trigger_signals.filter((signal) => normalized.includes(signal));
}

function parseIntentArgs(args: string[]) {
  if (args.length === 0) {
    return '';
  }
  if (args[0] === '--intent') {
    return args.slice(1).join(' ').trim();
  }
  return args.join(' ').trim();
}

function parseInspectArgs(args: string[]) {
  if (args.length > 1) {
    throw new Error('opl profiles inspect accepts at most one profile id.');
  }
  return args[0] ?? EVIDENCE_PROFILE_ID;
}

function parseConformanceArgs(args: string[]) {
  let repoDir = '';
  let profileId = EVIDENCE_PROFILE_ID;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--repo-dir') {
      repoDir = args[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (arg === '--profile') {
      profileId = args[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (!repoDir) {
      repoDir = arg;
      continue;
    }
    throw new Error(`Unknown profiles conformance argument: ${arg}`);
  }
  if (!repoDir) {
    throw new Error('opl profiles conformance requires --repo-dir <path>.');
  }
  return { repoDir: path.resolve(repoDir), profileId };
}

function selectedProfileRefs(payload: unknown): string[] {
  if (!isRecord(payload)) {
    return [];
  }
  return [
    ...uniqueStrings(payload.selected_profile_refs),
    ...uniqueStrings(payload.profile_refs),
    ...uniqueStrings(payload.profile_conformance_refs),
    ...(typeof payload.selected_profile_ref === 'string' ? [payload.selected_profile_ref] : []),
    ...(typeof payload.profile_ref === 'string' ? [payload.profile_ref] : []),
    ...(isRecord(payload.profile_selection_receipt)
      ? selectedProfileRefs(payload.profile_selection_receipt)
      : []),
    ...(isRecord(payload.profile_selection)
      ? selectedProfileRefs(payload.profile_selection)
      : []),
  ];
}

function profileRequirements(payload: unknown) {
  if (!isRecord(payload)) {
    return {};
  }
  if (isRecord(payload.profile_requirements)) {
    return payload.profile_requirements;
  }
  if (isRecord(payload.profile_selection_receipt) && isRecord(payload.profile_selection_receipt.profile_requirements)) {
    return payload.profile_selection_receipt.profile_requirements;
  }
  return {};
}

function capabilityEntries(capabilityMap: unknown): Record<string, unknown>[] {
  if (!isRecord(capabilityMap) || !Array.isArray(capabilityMap.capabilities)) {
    return [];
  }
  return capabilityMap.capabilities.filter(isRecord);
}

function stageEntries(stageControlPlane: unknown): Record<string, unknown>[] {
  if (!isRecord(stageControlPlane) || !Array.isArray(stageControlPlane.stages)) {
    return [];
  }
  return stageControlPlane.stages.filter(isRecord);
}

function includesProfileRef(refs: string[], profile: ProfileCatalogEntry) {
  return refs.includes(profile.profile_id) || refs.includes(profile.profile_ref);
}

function missingRequired(values: string[], required: string[]) {
  return required.filter((entry) => !values.includes(entry));
}

export function buildAgentProfileCatalog() {
  const profiles = catalogEntries();
  return {
    version: 'g2',
    agent_profile_catalog: {
      surface_kind: 'opl_agent_profile_catalog',
      version: 'agent-profile-catalog.v1',
      owner: 'one-person-lab',
      profiles,
      profile_count: profiles.length,
      authority_boundary: {
        refs_only: true,
        can_write_domain_truth: false,
        can_create_owner_receipt: false,
        can_claim_domain_ready: false,
        can_claim_production_ready: false,
      },
    },
  };
}

export function buildAgentProfileInspect(args: string[]) {
  const profileId = parseInspectArgs(args);
  const profile = catalogEntries().find((entry) => entry.profile_id === profileId || entry.profile_ref === profileId);
  if (!profile) {
    return {
      version: 'g2',
      agent_profile_inspect: {
        surface_kind: 'opl_agent_profile_inspect',
        status: 'blocked',
        profile_id: profileId,
        blockers: [`unknown_profile:${profileId}`],
      },
    };
  }
  return {
    version: 'g2',
    agent_profile_inspect: {
      surface_kind: 'opl_agent_profile_inspect',
      status: 'found',
      profile,
    },
  };
}

export function buildAgentProfileSelection(args: string[]) {
  const intent = parseIntentArgs(args);
  const candidates = catalogEntries()
    .map((profile) => ({
      profile,
      matched_trigger_signals: matchedTriggerSignals(intent, profile),
    }))
    .filter((candidate) => candidate.matched_trigger_signals.length > 0);
  const selected = candidates[0] ?? null;
  return {
    version: 'g2',
    profile_selection_receipt: {
      surface_kind: 'opl_profile_selection_receipt',
      version: 'profile-selection-receipt.v1',
      status: selected ? 'selected' : 'blocked',
      intent,
      selected_profile_id: selected?.profile.profile_id ?? null,
      selected_profile_ref: selected?.profile.profile_ref ?? null,
      matched_trigger_signals: selected?.matched_trigger_signals ?? [],
      candidate_profile_ids: candidates.map((candidate) => candidate.profile.profile_id),
      profile_requirements: selected
        ? {
            required_stage_archetypes: selected.profile.required_stage_archetypes,
            required_capability_kinds: selected.profile.required_capability_kinds,
            required_surface_roles: selected.profile.required_surface_roles,
            required_evidence_objects: selected.profile.required_evidence_objects,
            required_reference_pack_roles: selected.profile.required_reference_pack_roles,
          }
        : null,
      blockers: selected ? [] : ['no_profile_trigger_match'],
      authority_boundary: {
        refs_only: true,
        selector_can_write_domain_truth: false,
        selector_can_create_owner_receipt: false,
        selector_can_claim_domain_ready: false,
        selector_can_claim_production_ready: false,
      },
    },
  };
}

export function buildAgentProfileConformance(args: string[]) {
  const { repoDir, profileId } = parseConformanceArgs(args);
  const profile = catalogEntries().find((entry) => entry.profile_id === profileId || entry.profile_ref === profileId);
  if (!profile) {
    return {
      version: 'g2',
      profile_conformance: {
        surface_kind: 'opl_agent_profile_conformance',
        status: 'blocked',
        repo_dir: repoDir,
        profile_id: profileId,
        blockers: [`unknown_profile:${profileId}`],
      },
    };
  }

  const capabilityMap = readJsonFileOrNull(path.join(repoDir, 'contracts', 'capability_map.json'));
  const stageControlPlane = readJsonFileOrNull(path.join(repoDir, 'contracts', 'stage_control_plane.json'));
  const capabilities = capabilityEntries(capabilityMap);
  const stages = stageEntries(stageControlPlane);
  const capabilityProfileRefs = selectedProfileRefs(capabilityMap);
  const stageProfileRefs = selectedProfileRefs(stageControlPlane);
  const requirements = {
    ...profileRequirements(capabilityMap),
    ...profileRequirements(stageControlPlane),
  };
  const observedCapabilityKinds = uniqueStrings(capabilities.map((entry) => entry.capability_kind));
  const observedSurfaceRoles = uniqueStrings(capabilities.map((entry) => entry.surface_role));
  const requiredStageArchetypes = uniqueStrings((requirements as Record<string, unknown>).required_stage_archetypes);
  const requiredEvidenceObjects = uniqueStrings((requirements as Record<string, unknown>).required_evidence_objects);
  const stagesWithKnowledgeRefs = stages.filter((stage) => Array.isArray(stage.knowledge_refs) && stage.knowledge_refs.length > 0).length;
  const stagesWithToolRefs = stages.filter((stage) => Array.isArray(stage.tool_refs) && stage.tool_refs.length > 0).length;
  const stagesWithEvaluationRefs = stages.filter((stage) => Array.isArray(stage.evaluation) && stage.evaluation.length > 0).length;

  const blockers = [
    fs.existsSync(path.join(repoDir, 'contracts', 'capability_map.json')) ? null : 'missing_contract:contracts/capability_map.json',
    fs.existsSync(path.join(repoDir, 'contracts', 'stage_control_plane.json')) ? null : 'missing_contract:contracts/stage_control_plane.json',
    includesProfileRef(capabilityProfileRefs, profile)
      ? null
      : `capability_map_missing_selected_profile_ref:${profile.profile_id}`,
    includesProfileRef(stageProfileRefs, profile)
      ? null
      : `stage_control_plane_missing_selected_profile_ref:${profile.profile_id}`,
    ...missingRequired(observedCapabilityKinds, profile.required_capability_kinds)
      .map((kind) => `capability_map_missing_capability_kind:${kind}`),
    ...missingRequired(observedSurfaceRoles, profile.required_surface_roles)
      .map((role) => `capability_map_missing_surface_role:${role}`),
    ...missingRequired(requiredStageArchetypes, profile.required_stage_archetypes)
      .map((stage) => `profile_requirements_missing_stage_archetype:${stage}`),
    ...missingRequired(requiredEvidenceObjects, profile.required_evidence_objects)
      .map((object) => `profile_requirements_missing_evidence_object:${object}`),
    stagesWithKnowledgeRefs > 0 ? null : 'stage_control_plane_missing_knowledge_refs',
    stagesWithToolRefs > 0 ? null : 'stage_control_plane_missing_tool_refs',
    stagesWithEvaluationRefs > 0 ? null : 'stage_control_plane_missing_evaluation_refs',
  ].filter((blocker): blocker is string => Boolean(blocker));

  return {
    version: 'g2',
    profile_conformance: {
      surface_kind: 'opl_agent_profile_conformance',
      version: 'agent-profile-conformance.v1',
      repo_dir: repoDir,
      profile_id: profile.profile_id,
      profile_ref: profile.profile_ref,
      status: blockers.length === 0 ? 'passed' : 'blocked',
      observed: {
        capability_profile_refs: capabilityProfileRefs,
        stage_profile_refs: stageProfileRefs,
        capability_kinds: observedCapabilityKinds,
        surface_roles: observedSurfaceRoles,
        required_stage_archetypes: requiredStageArchetypes,
        required_evidence_objects: requiredEvidenceObjects,
        stages_with_knowledge_refs: stagesWithKnowledgeRefs,
        stages_with_tool_refs: stagesWithToolRefs,
        stages_with_evaluation_refs: stagesWithEvaluationRefs,
      },
      blockers,
      authority_boundary: {
        refs_only: true,
        conformance_can_write_domain_truth: false,
        conformance_can_create_owner_receipt: false,
        conformance_can_claim_domain_ready: false,
        conformance_can_claim_production_ready: false,
      },
    },
  };
}

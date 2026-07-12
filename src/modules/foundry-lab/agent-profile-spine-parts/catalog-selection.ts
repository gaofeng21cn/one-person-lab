import path from 'node:path';

import { isRecord } from '../../../kernel/contract-validation.ts';
import {
  buildEvidenceGroundedDecisionAgentProfileReadback,
} from '../../pack/index.ts';
import { buildProfileCapabilityPlanInputProjection } from '../profile-capability-plan.ts';
import {
  matchedProfileTriggerSignals,
  parseProfileSelectionArgs,
  type ParsedProfileSelectionArgs,
} from '../profile-selection-intent.ts';

const EVIDENCE_PROFILE_ID = 'evidence_grounded_decision_agent_profile.v1';
const EVIDENCE_PROFILE_REF = `opl-profile:${EVIDENCE_PROFILE_ID}`;
const SOURCE_DERIVED_PROFILE_ID = 'source_derived_design_profile_route.v1';
const SOURCE_DERIVED_PROFILE_REF = `opl-profile-route:${SOURCE_DERIVED_PROFILE_ID}`;

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

const SOURCE_DERIVED_STAGE_ARCHETYPE_CANDIDATES = [
  'source_material_intake',
  'reference_design_pattern_extraction',
  'transferable_pattern_mapping',
  'capability_plan_synthesis',
  'authority_boundary_review',
];

const SOURCE_DERIVED_DESIGN_CONSUMPTION_OBJECTS = [
  'ReferenceDesignPacket',
  'TransferMap',
  'AgentPackPlan',
];

const REFERENCE_DESIGN_PATTERN_PACKET_REQUIREMENTS = [
  'source_material_ref',
  'source_fingerprint_ref',
  'pattern_summary_ref',
  'transferable_pattern_refs',
  'non_transferable_constraint_refs',
  'authority_boundary_notes_ref',
];

const REFERENCE_DESIGN_PACKET_REQUIREMENTS = [
  'packet_ref',
  'reference_source_refs',
  'reference_design_pattern_packet_refs',
  'source_anchor_refs',
  'transferable_design_patterns',
  'extractable_design_aspects',
  'non_transferable_constraints',
];

const TRANSFERABLE_PATTERN_REQUIREMENTS = [
  'pattern_id',
  'source_anchor_ref',
  'target_stage_or_capability_slot',
  'transfer_rationale',
  'known_limits',
  'disposition',
];

const TRANSFER_MAP_REQUIREMENTS = TRANSFERABLE_PATTERN_REQUIREMENTS;

const AGENT_PACK_PLAN_REQUIREMENTS = [
  'plan_ref',
  'planned_stage_refs',
  'planned_prompt_refs',
  'planned_skill_refs',
  'planned_knowledge_refs',
  'planned_tool_refs',
  'planned_quality_gate_refs',
  'source_pattern_ref_requirements',
];

const SOURCE_DERIVED_CAPABILITY_PLAN_REQUIREMENTS = AGENT_PACK_PLAN_REQUIREMENTS;

export const REFERENCE_DESIGN_SOURCE_REF_FIELDS = [
  'reference_design_source_refs',
  'reference_source_refs',
  'source_refs',
];

export const REFERENCE_DESIGN_PACKET_REF_FIELDS = [
  'reference_design_packet_ref',
  'reference_design_packet_refs',
  'reference_design_pattern_packet_refs',
  'pattern_packet_refs',
];

export const REFERENCE_DESIGN_PACKET_REQUIREMENT_FIELDS = [
  'reference_design_packet_requirements',
  'reference_design_pattern_packet_requirements',
];

export const TRANSFER_MAP_REF_FIELDS = [
  'transfer_map_ref',
  'transfer_map_refs',
  'transferable_pattern_map_refs',
  'transferable_pattern_refs',
];

export const TRANSFER_MAP_REQUIREMENT_FIELDS = [
  'transfer_map_requirements',
  'transferable_pattern_requirements',
];

export const AGENT_PACK_PLAN_REF_FIELDS = [
  'agent_pack_plan_refs',
  'agent_pack_plan_ref',
  'capability_plan_refs',
  'capability_plan_ref',
];

export const AGENT_PACK_PLAN_REQUIREMENT_FIELDS = [
  'agent_pack_plan_requirements',
  'capability_plan_requirements',
];

export const DESIGN_ADMISSION_RECEIPT_REF_FIELDS = [
  'design_admission_receipt_refs',
  'design_admission_receipt_ref',
];

export const DESIGN_ADMISSION_RECEIPT_REQUIREMENT_FIELDS = [
  'design_admission_receipt_requirements',
  'required_admission_receipts',
];

export const DESIGN_ADMISSION_RECEIPT_SOURCE_STAGE_FIELDS = [
  'design_derived_stage_refs',
  'design_admission_stage_refs',
  'source_derived_stage_refs',
  'source_pattern_stage_refs',
];

export const DESIGN_ADMISSION_RECEIPT_REJECTED_PATTERN_FIELDS = [
  'rejected_source_pattern_refs',
  'rejected_pattern_refs',
];

export const DESIGN_ADMISSION_RECEIPT_FORBIDDEN_CLAIM_FIELDS = [
  'forbidden_claims',
  'forbidden_claim_refs',
];

export const BUILD_RECEIPT_REF_FIELDS = [
  'build_receipt_refs',
  'build_receipt_ref',
  'source_derived_build_receipt_refs',
  'source_derived_build_receipt_ref',
];

export const BUILD_RECEIPT_REQUIREMENT_FIELDS = [
  'build_receipt_requirements',
  'source_derived_build_receipt_requirements',
];

export const BUILD_RECEIPT_SOURCE_STAGE_FIELDS = [
  'source_derived_stage_refs',
  'source_pattern_stage_refs',
];

export const BUILD_RECEIPT_REJECTED_PATTERN_FIELDS = [
  'rejected_source_pattern_refs',
  'rejected_pattern_refs',
];

export const BUILD_RECEIPT_FORBIDDEN_CLAIM_FIELDS = [
  'forbidden_claims',
  'forbidden_claim_refs',
];

export const STAGE_PATTERN_SOURCE_REF_FIELDS = [
  'source_pattern_ref',
  'stage_pattern_source_refs',
  'stage_pattern_refs',
];

export const TARGET_ONLY_REQUIREMENT_FIELDS = [
  'target_only_requirement_ref',
  'target_only_requirement',
  'target_only_requirements',
];

export type ProfileCatalogEntry = {
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

type ProfileSelectionMode = 'builtin_profile' | 'source_derived_design' | 'hybrid';
export function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return [
    ...new Set(
      value
        .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
        .map((entry) => entry.trim()),
    ),
  ];
}

function machineFieldStrings(value: unknown): string[] {
  if (typeof value === 'string' && value.trim().length > 0) {
    return [value.trim()];
  }
  if (Array.isArray(value)) {
    return uniqueStrings(value.flatMap(machineFieldStrings));
  }
  if (!isRecord(value)) {
    return [];
  }
  return uniqueStrings([
    ...[
      value.ref,
      value.id,
      value.source_ref,
      value.packet_ref,
      value.stage_ref,
      value.requirement,
      value.requirement_id,
    ].flatMap(machineFieldStrings),
  ]);
}

function hasMachineValue(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return isRecord(value) && Object.keys(value).length > 0;
}

export function collectDirectMachineFieldStrings(
  payloads: unknown[],
  fieldNames: string[],
): string[] {
  return uniqueStrings(
    payloads.flatMap((payload) => {
      if (!isRecord(payload)) {
        return [];
      }
      return Object.entries(payload).flatMap(([key, value]) =>
        fieldNames.includes(key) ? machineFieldStrings(value) : []
      );
    }),
  );
}

export function hasDirectMachineField(payloads: unknown[], fieldNames: string[]): boolean {
  return payloads.some((payload) => {
    if (!isRecord(payload)) {
      return false;
    }
    return Object.entries(payload).some(([key, value]) =>
      fieldNames.includes(key) && hasMachineValue(value)
    );
  });
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
    profile_id: stringOrFallback(contractEntry.profile_id, EVIDENCE_PROFILE_ID),
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

function sourceDerivedDesignProfileEntry(): ProfileCatalogEntry {
  return {
    profile_id: SOURCE_DERIVED_PROFILE_ID,
    profile_ref: SOURCE_DERIVED_PROFILE_REF,
    profile_role: 'refs_only_route_for_source_derived_agent_design',
    contract_ref: 'opl-profile-route:source-derived-design.v1',
    trigger_signals: [],
    required_stage_archetypes: SOURCE_DERIVED_STAGE_ARCHETYPE_CANDIDATES,
    required_capability_kinds: REQUIRED_CAPABILITY_KINDS,
    required_surface_roles: REQUIRED_SURFACE_ROLES,
    required_evidence_objects: [],
    required_reference_pack_roles: [
      'reference_design_source',
      'reference_design_pattern_packet',
      'transferable_pattern_map',
    ],
    source_readback_command: 'opl profiles select --intent <intent> --reference-source <source-ref> --json',
    can_claim_domain_ready: false,
    can_claim_production_ready: false,
  };
}

function parseInspectArgs(args: string[]) {
  if (args.length > 1) {
    throw new Error('opl profiles inspect accepts at most one profile id.');
  }
  return args[0] ?? EVIDENCE_PROFILE_ID;
}

export function parseConformanceArgs(args: string[]) {
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

export function selectedProfileRefs(payload: unknown): string[] {
  if (!isRecord(payload)) {
    return [];
  }
  return [
    ...uniqueStrings(payload.selected_profile_refs),
    ...uniqueStrings(payload.profile_refs),
    ...uniqueStrings(payload.profile_conformance_refs),
    ...(typeof payload.selected_profile_ref === 'string' ? [payload.selected_profile_ref] : []),
    ...(typeof payload.profile_ref === 'string' ? [payload.profile_ref] : []),
    ...(typeof payload.route_ref === 'string' ? [payload.route_ref] : []),
    ...(typeof payload.route_id === 'string' ? [payload.route_id] : []),
    ...(isRecord(payload.profile_selection_receipt)
      ? selectedProfileRefs(payload.profile_selection_receipt)
      : []),
    ...(isRecord(payload.profile_selection)
      ? selectedProfileRefs(payload.profile_selection)
      : []),
    ...(isRecord(payload.source_derived_design_receipt)
      ? selectedProfileRefs(payload.source_derived_design_receipt)
      : []),
  ];
}

export function profileRequirements(payload: unknown) {
  if (!isRecord(payload)) {
    return {};
  }
  const requirements: Record<string, unknown> = {};
  [
    payload.profile_requirements,
    isRecord(payload.profile_selection_receipt)
      ? payload.profile_selection_receipt.profile_requirements
      : null,
    isRecord(payload.source_derived_design_receipt)
      ? payload.source_derived_design_receipt.profile_requirements
      : null,
    isRecord(payload.profile_selection_receipt)
      && isRecord(payload.profile_selection_receipt.source_derived_design_receipt)
      ? payload.profile_selection_receipt.source_derived_design_receipt.profile_requirements
      : null,
  ].forEach((candidate) => {
    if (!isRecord(candidate)) {
      return;
    }
    Object.entries(candidate).forEach(([key, value]) => {
      requirements[key] = Array.isArray(value)
        ? uniqueStrings([
            ...uniqueStrings(requirements[key]),
            ...uniqueStrings(value),
          ])
        : value;
    });
  });
  return requirements;
}

export function capabilityEntries(capabilityMap: unknown): Record<string, unknown>[] {
  if (!isRecord(capabilityMap) || !Array.isArray(capabilityMap.capabilities)) {
    return [];
  }
  return capabilityMap.capabilities.filter(isRecord);
}

export function stageEntries(stageControlPlane: unknown): Record<string, unknown>[] {
  if (!isRecord(stageControlPlane) || !Array.isArray(stageControlPlane.stages)) {
    return [];
  }
  return stageControlPlane.stages.filter(isRecord);
}

export function includesProfileRef(refs: string[], profile: ProfileCatalogEntry) {
  return refs.includes(profile.profile_id) || refs.includes(profile.profile_ref);
}

export function matchesSourceDerivedProfileId(profileId: string) {
  return profileId === SOURCE_DERIVED_PROFILE_ID || profileId === SOURCE_DERIVED_PROFILE_REF;
}

export function hasSourceDerivedRoute(payload: unknown): boolean {
  if (!isRecord(payload)) {
    return false;
  }
  return payload.profile_selection_mode === 'source_derived_design'
    || payload.profile_selection_mode === 'hybrid'
    || payload.route_ref === SOURCE_DERIVED_PROFILE_REF
    || payload.route_id === SOURCE_DERIVED_PROFILE_ID
    || isRecord(payload.source_derived_design_receipt)
    || (
      isRecord(payload.profile_selection_receipt)
      && hasSourceDerivedRoute(payload.profile_selection_receipt)
    );
}

export function missingRequired(values: string[], required: string[]) {
  return required.filter((entry) => !values.includes(entry));
}

function sourceDerivedProfileRequirements() {
  return {
    required_design_consumption_objects: SOURCE_DERIVED_DESIGN_CONSUMPTION_OBJECTS,
    required_stage_archetypes: SOURCE_DERIVED_STAGE_ARCHETYPE_CANDIDATES,
    required_capability_kinds: REQUIRED_CAPABILITY_KINDS,
    required_surface_roles: REQUIRED_SURFACE_ROLES,
    required_reference_pack_roles: sourceDerivedDesignProfileEntry().required_reference_pack_roles,
    reference_design_packet_requirements: REFERENCE_DESIGN_PACKET_REQUIREMENTS,
    reference_design_pattern_packet_requirements: REFERENCE_DESIGN_PATTERN_PACKET_REQUIREMENTS,
    transfer_map_requirements: TRANSFER_MAP_REQUIREMENTS,
    transferable_pattern_requirements: TRANSFERABLE_PATTERN_REQUIREMENTS,
    stage_archetype_candidates: SOURCE_DERIVED_STAGE_ARCHETYPE_CANDIDATES,
    agent_pack_plan_requirements: AGENT_PACK_PLAN_REQUIREMENTS,
    capability_plan_requirements: SOURCE_DERIVED_CAPABILITY_PLAN_REQUIREMENTS,
  };
}

function buildSourceDerivedDesignReceipt(parsed: ParsedProfileSelectionArgs) {
  return {
    route_id: SOURCE_DERIVED_PROFILE_ID,
    route_ref: SOURCE_DERIVED_PROFILE_REF,
    required_design_consumption_objects: SOURCE_DERIVED_DESIGN_CONSUMPTION_OBJECTS,
    source_refs: parsed.reference_source_refs,
    reference_design_source_refs: parsed.reference_source_refs,
    reference_design_packet_refs: parsed.reference_design_pattern_packet_refs,
    reference_design_pattern_packet_refs: parsed.reference_design_pattern_packet_refs,
    source_material_body_policy: 'refs_only_no_external_body_import',
    profile_requirements: sourceDerivedProfileRequirements(),
    reference_design_packet_requirements: REFERENCE_DESIGN_PACKET_REQUIREMENTS,
    reference_design_pattern_packet_requirements: REFERENCE_DESIGN_PATTERN_PACKET_REQUIREMENTS,
    transfer_map_requirements: TRANSFER_MAP_REQUIREMENTS,
    transferable_pattern_requirements: TRANSFERABLE_PATTERN_REQUIREMENTS,
    stage_archetype_candidates: SOURCE_DERIVED_STAGE_ARCHETYPE_CANDIDATES,
    agent_pack_plan_requirements: AGENT_PACK_PLAN_REQUIREMENTS,
    capability_plan_requirements: SOURCE_DERIVED_CAPABILITY_PLAN_REQUIREMENTS,
    design_consumption_objects: {
      ReferenceDesignPacket: {
        source_refs: parsed.reference_source_refs,
        packet_refs: parsed.reference_design_pattern_packet_refs,
        requirements: REFERENCE_DESIGN_PACKET_REQUIREMENTS,
      },
      TransferMap: {
        requirements: TRANSFER_MAP_REQUIREMENTS,
      },
      AgentPackPlan: {
        requirements: AGENT_PACK_PLAN_REQUIREMENTS,
      },
    },
    stage_pattern_source_policy: 'stage_pattern_source_refs_or_target_only_requirement_required',
    authority_boundary_notes: [
      'source-derived route may extract transferable design patterns only as refs',
      'OPL does not import external runtime truth or target domain truth',
      'OMA or target agent owner must author and accept domain-specific pack content',
    ],
  };
}

function builtinProfileRequirements(profile: ProfileCatalogEntry) {
  return {
    required_stage_archetypes: profile.required_stage_archetypes,
    required_capability_kinds: profile.required_capability_kinds,
    required_surface_roles: profile.required_surface_roles,
    required_evidence_objects: profile.required_evidence_objects,
    required_reference_pack_roles: profile.required_reference_pack_roles,
  };
}

export function conformanceProfileFor(
  profileId: string,
  capabilityMap: unknown,
) {
  const builtin = catalogEntries().find((entry) => entry.profile_id === profileId || entry.profile_ref === profileId);
  if (builtin) {
    return builtin;
  }
  if (
    matchesSourceDerivedProfileId(profileId)
    || hasSourceDerivedRoute(capabilityMap)
  ) {
    return sourceDerivedDesignProfileEntry();
  }
  return null;
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
  const parsed = parseProfileSelectionArgs(args);
  const intent = parsed.intent;
  const hasReferenceDesignSignal = parsed.reference_source_refs.length > 0
    || parsed.reference_design_pattern_packet_refs.length > 0;
  const candidates = catalogEntries()
    .map((profile) => ({
      profile,
      matched_trigger_signals: matchedProfileTriggerSignals(
        intent,
        parsed.intent_signals,
        profile.trigger_signals,
      ),
    }))
    .filter((candidate) => candidate.matched_trigger_signals.length > 0);
  const selected = candidates[0] ?? null;
  const sourceDerivedReceipt = hasReferenceDesignSignal
    ? buildSourceDerivedDesignReceipt(parsed)
    : null;
  const profileSelectionMode: ProfileSelectionMode | null = selected
    ? (sourceDerivedReceipt ? 'hybrid' : 'builtin_profile')
    : (sourceDerivedReceipt ? 'source_derived_design' : null);
  const selectedProfileId = selected?.profile.profile_id ?? (sourceDerivedReceipt ? SOURCE_DERIVED_PROFILE_ID : null);
  const selectedProfileRef = selected?.profile.profile_ref ?? (sourceDerivedReceipt ? SOURCE_DERIVED_PROFILE_REF : null);
  const selectedProfileRefs = uniqueStrings([
    ...(selected ? [selected.profile.profile_ref] : []),
    ...(sourceDerivedReceipt ? [SOURCE_DERIVED_PROFILE_REF] : []),
  ]);
  const builtinRequirements = selected ? builtinProfileRequirements(selected.profile) : null;
  const sourceRequirements = sourceDerivedReceipt?.profile_requirements ?? null;
  const profileRequirements = builtinRequirements && sourceRequirements
    ? {
        ...sourceRequirements,
        required_stage_archetypes: uniqueStrings([
          ...builtinRequirements.required_stage_archetypes,
          ...sourceRequirements.required_stage_archetypes,
        ]),
        required_capability_kinds: uniqueStrings([
          ...builtinRequirements.required_capability_kinds,
          ...sourceRequirements.required_capability_kinds,
        ]),
        required_surface_roles: uniqueStrings([
          ...builtinRequirements.required_surface_roles,
          ...sourceRequirements.required_surface_roles,
        ]),
        required_evidence_objects: builtinRequirements.required_evidence_objects,
        required_reference_pack_roles: uniqueStrings([
          ...builtinRequirements.required_reference_pack_roles,
          ...sourceRequirements.required_reference_pack_roles,
        ]),
      }
    : builtinRequirements ?? sourceRequirements;
  return {
    version: 'g2',
    profile_capability_plan_input: buildProfileCapabilityPlanInputProjection({
      requiredCapabilityKinds: profileRequirements?.required_capability_kinds ?? [],
      requiredSurfaceRoles: profileRequirements?.required_surface_roles ?? [],
    }),
    profile_selection_receipt: {
      surface_kind: 'opl_profile_selection_receipt',
      version: 'profile-selection-receipt.v1',
      status: selected || sourceDerivedReceipt ? 'selected' : 'blocked',
      intent,
      intent_signals: parsed.intent_signals,
      profile_selection_mode: profileSelectionMode,
      selected_profile_id: selectedProfileId,
      selected_profile_ref: selectedProfileRef,
      selected_profile_refs: selectedProfileRefs,
      matched_trigger_signals: selected?.matched_trigger_signals ?? [],
      candidate_profile_ids: candidates.map((candidate) => candidate.profile.profile_id),
      source_derived_design_receipt: sourceDerivedReceipt,
      reference_design_pattern_packet_requirements:
        sourceDerivedReceipt?.reference_design_pattern_packet_requirements ?? [],
      transferable_pattern_requirements: sourceDerivedReceipt?.transferable_pattern_requirements ?? [],
      stage_archetype_candidates: sourceDerivedReceipt?.stage_archetype_candidates ?? [],
      capability_plan_requirements: sourceDerivedReceipt?.capability_plan_requirements ?? [],
      profile_requirements: profileRequirements,
      blockers: selected || sourceDerivedReceipt ? [] : ['no_profile_trigger_match'],
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

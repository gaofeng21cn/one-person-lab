import fs from 'node:fs';
import path from 'node:path';

import { isRecord } from '../../kernel/contract-validation.ts';
import { readJsonFileOrNull } from '../../kernel/json-file.ts';
import {
  buildEvidenceGroundedDecisionAgentProfileReadback,
  buildStandardAgentRepoContractReadout,
  STANDARD_AGENT_STAGE_MANIFEST_REF,
} from '../pack/index.ts';
import {
  inspectSourceDerivedTypedObjectProjections,
  validateReferenceSourcePacketPolicy,
} from './agent-profile-spine-conformance.ts';
import { validateReferenceBuildReceiptMaterialization } from './reference-build-proof.ts';
import { buildProfileCapabilityPlanInputProjection } from './profile-capability-plan.ts';
import {
  matchedProfileTriggerSignals,
  parseProfileSelectionArgs,
  type ParsedProfileSelectionArgs,
} from './profile-selection-intent.ts';

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

const REFERENCE_DESIGN_SOURCE_REF_FIELDS = [
  'reference_design_source_refs',
  'reference_source_refs',
  'source_refs',
];

const REFERENCE_DESIGN_PACKET_REF_FIELDS = [
  'reference_design_packet_ref',
  'reference_design_packet_refs',
  'reference_design_pattern_packet_refs',
  'pattern_packet_refs',
];

const REFERENCE_DESIGN_PACKET_REQUIREMENT_FIELDS = [
  'reference_design_packet_requirements',
  'reference_design_pattern_packet_requirements',
];

const TRANSFER_MAP_REF_FIELDS = [
  'transfer_map_ref',
  'transfer_map_refs',
  'transferable_pattern_map_refs',
  'transferable_pattern_refs',
];

const TRANSFER_MAP_REQUIREMENT_FIELDS = [
  'transfer_map_requirements',
  'transferable_pattern_requirements',
];

const AGENT_PACK_PLAN_REF_FIELDS = [
  'agent_pack_plan_refs',
  'agent_pack_plan_ref',
  'capability_plan_refs',
  'capability_plan_ref',
];

const AGENT_PACK_PLAN_REQUIREMENT_FIELDS = [
  'agent_pack_plan_requirements',
  'capability_plan_requirements',
];

const DESIGN_ADMISSION_RECEIPT_REF_FIELDS = [
  'design_admission_receipt_refs',
  'design_admission_receipt_ref',
];

const DESIGN_ADMISSION_RECEIPT_REQUIREMENT_FIELDS = [
  'design_admission_receipt_requirements',
  'required_admission_receipts',
];

const DESIGN_ADMISSION_RECEIPT_SOURCE_STAGE_FIELDS = [
  'design_derived_stage_refs',
  'design_admission_stage_refs',
  'source_derived_stage_refs',
  'source_pattern_stage_refs',
];

const DESIGN_ADMISSION_RECEIPT_REJECTED_PATTERN_FIELDS = [
  'rejected_source_pattern_refs',
  'rejected_pattern_refs',
];

const DESIGN_ADMISSION_RECEIPT_FORBIDDEN_CLAIM_FIELDS = [
  'forbidden_claims',
  'forbidden_claim_refs',
];

const BUILD_RECEIPT_REF_FIELDS = [
  'build_receipt_refs',
  'build_receipt_ref',
  'source_derived_build_receipt_refs',
  'source_derived_build_receipt_ref',
];

const BUILD_RECEIPT_REQUIREMENT_FIELDS = [
  'build_receipt_requirements',
  'source_derived_build_receipt_requirements',
];

const BUILD_RECEIPT_SOURCE_STAGE_FIELDS = [
  'source_derived_stage_refs',
  'source_pattern_stage_refs',
];

const BUILD_RECEIPT_REJECTED_PATTERN_FIELDS = [
  'rejected_source_pattern_refs',
  'rejected_pattern_refs',
];

const BUILD_RECEIPT_FORBIDDEN_CLAIM_FIELDS = [
  'forbidden_claims',
  'forbidden_claim_refs',
];

const STAGE_PATTERN_SOURCE_REF_FIELDS = [
  'source_pattern_ref',
  'stage_pattern_source_refs',
  'stage_pattern_refs',
];

const TARGET_ONLY_REQUIREMENT_FIELDS = [
  'target_only_requirement_ref',
  'target_only_requirement',
  'target_only_requirements',
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

type ProfileSelectionMode = 'builtin_profile' | 'source_derived_design' | 'hybrid';
function uniqueStrings(value: unknown): string[] {
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

function collectDirectMachineFieldStrings(
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

function hasDirectMachineField(payloads: unknown[], fieldNames: string[]): boolean {
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

function profileRequirements(payload: unknown) {
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

function matchesSourceDerivedProfileId(profileId: string) {
  return profileId === SOURCE_DERIVED_PROFILE_ID || profileId === SOURCE_DERIVED_PROFILE_REF;
}

function hasSourceDerivedRoute(payload: unknown): boolean {
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

function missingRequired(values: string[], required: string[]) {
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

function conformanceProfileFor(
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

type SourceWorkflowStep = {
  key: string;
  pattern_id: string;
  step_id: string;
  source_anchor_refs: string[];
};

function machineString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function hasTypedObjectIdentity(
  value: Record<string, unknown> | null,
  surfaceKind: string,
  version: string,
  refField: string,
) {
  return value?.surface_kind === surfaceKind
    && value.version === version
    && machineString(value[refField]) !== null;
}

function buildSourceDerivedTypedObjectFloor(
  repoDir: string,
  capabilityMap: unknown,
  stageEntries: Record<string, unknown>[],
  declaredReferenceSourceRefs: string[],
) {
  const projectionIntegrity = inspectSourceDerivedTypedObjectProjections(capabilityMap);
  const blockers = [...projectionIntegrity.blockers];
  const packet = projectionIntegrity.typedObjects.reference_design_packet;
  const transferMap = projectionIntegrity.typedObjects.transfer_map;
  const agentPackPlan = projectionIntegrity.typedObjects.agent_pack_plan;
  const admissionReceipt = projectionIntegrity.typedObjects.design_admission_receipt;
  const buildReceipt = projectionIntegrity.typedObjects.build_receipt;
  const typedObjects = [
    ['ReferenceDesignPacket', packet],
    ['TransferMap', transferMap],
    ['AgentPackPlan', agentPackPlan],
    ['DesignAdmissionReceipt', admissionReceipt],
    ['AgentBuildReceipt', buildReceipt],
  ] as const;
  typedObjects.forEach(([name, value]) => {
    if (!value) {
      blockers.push(`source_derived_design_missing_typed_object:${name}`);
    }
  });

  const packetRef = machineString(packet?.packet_ref);
  if (packet && !hasTypedObjectIdentity(
    packet,
    'opl_foundry_reference_design_packet',
    'opl.foundry.reference-design-packet.v1',
    'packet_ref',
  )) {
    blockers.push('source_derived_design_typed_object_identity_invalid:ReferenceDesignPacket');
  }
  const steps: SourceWorkflowStep[] = [];
  const patterns = recordArray(packet?.transferable_design_patterns);
  if (packet && patterns.length === 0) {
    blockers.push('source_derived_design_reference_design_packet_missing_transferable_design_patterns');
  }
  patterns.forEach((pattern, patternIndex) => {
    const patternId = machineString(pattern.pattern_id);
    const workflowSteps = recordArray(pattern.transferable_workflow_steps);
    if (!patternId || workflowSteps.length === 0) {
      blockers.push(`source_derived_design_reference_design_packet_workflow_steps_invalid:${patternId ?? patternIndex}`);
      return;
    }
    workflowSteps.forEach((step, stepIndex) => {
      const stepId = machineString(step.step_id);
      const stageArchetype = machineString(step.stage_archetype);
      const provenanceKind = machineString(step.provenance_kind);
      const sourceAnchorRefs = uniqueStrings(step.source_anchor_refs);
      if (
        !stepId
        || !stageArchetype
        || sourceAnchorRefs.length === 0
        || !provenanceKind
        || !['source_derived', 'internal_synthesis'].includes(provenanceKind)
      ) {
        blockers.push(`source_derived_design_reference_design_packet_workflow_step_invalid:${patternId}/${stepId ?? stepIndex}`);
        return;
      }
      steps.push({
        key: `${patternId}\0${stepId}`,
        pattern_id: patternId,
        step_id: stepId,
        source_anchor_refs: sourceAnchorRefs,
      });
    });
  });

  const transferMapRef = machineString(transferMap?.transfer_map_ref);
  if (transferMap && (
    !hasTypedObjectIdentity(
      transferMap,
      'opl_foundry_transfer_map',
      'opl.foundry.transfer-map.v1',
      'transfer_map_ref',
    )
    || !packetRef
    || transferMap.reference_design_packet_ref !== packetRef
  )) {
    blockers.push('source_derived_design_typed_object_identity_invalid:TransferMap');
  }
  const mappings = recordArray(transferMap?.mappings);
  if (transferMap && mappings.length === 0) {
    blockers.push('source_derived_design_transfer_map_missing_mappings');
  }
  const workflowMappings = mappings.filter((mapping) => {
    const disposition = machineString(mapping.disposition);
    return machineString(mapping.pattern_id) !== null
      && machineString(mapping.step_id) !== null
      && machineString(mapping.source_anchor_ref) !== null
      && machineString(mapping.target_stage_or_capability_slot) !== null
      && machineString(mapping.transfer_rationale) !== null
      && uniqueStrings(mapping.known_limits).length > 0
      && disposition !== null
      && ['adopt', 'adapt'].includes(disposition);
  });
  if (transferMap && workflowMappings.length === 0) {
    blockers.push('source_derived_design_transfer_map_missing_typed_workflow_mappings');
  }
  const mappedStepKeys: string[] = [];
  const mappedStageRefs = new Map<string, string>();
  steps.forEach((step) => {
    const mapping = workflowMappings.find((candidate) => {
      const sourceAnchorRef = machineString(candidate.source_anchor_ref);
      return candidate.pattern_id === step.pattern_id
        && candidate.step_id === step.step_id
        && sourceAnchorRef !== null
        && step.source_anchor_refs.includes(sourceAnchorRef);
    });
    const mappedStageRef = machineString(mapping?.target_stage_or_capability_slot);
    if (mapping && mappedStageRef) {
      mappedStepKeys.push(step.key);
      mappedStageRefs.set(step.key, mappedStageRef);
    } else {
      blockers.push(`source_derived_design_transfer_map_missing_workflow_step_mapping:${step.pattern_id}/${step.step_id}`);
    }
  });

  const rejectedMappings = mappings.filter((mapping) => {
    const sourceAnchorRef = machineString(mapping.source_anchor_ref);
    return mapping.disposition === 'reject'
      && sourceAnchorRef !== null
      && sourceAnchorRef.startsWith('non-transferable:');
  });
  if (transferMap && rejectedMappings.length === 0) {
    blockers.push('source_derived_design_transfer_map_missing_non_transferable_rejection');
  }

  const agentPackPlanRef = machineString(agentPackPlan?.plan_ref);
  if (agentPackPlan && (
    !hasTypedObjectIdentity(
      agentPackPlan,
      'opl_foundry_agent_pack_plan',
      'opl.foundry.agent-pack-plan.v1',
      'plan_ref',
    )
    || !packetRef
    || agentPackPlan.reference_design_packet_ref !== packetRef
    || !transferMapRef
    || agentPackPlan.transfer_map_ref !== transferMapRef
  )) {
    blockers.push('source_derived_design_typed_object_identity_invalid:AgentPackPlan');
  }
  const plannedStages = recordArray(agentPackPlan?.planned_stage_refs);
  blockers.push(...validateReferenceSourcePacketPolicy(
    declaredReferenceSourceRefs,
    packet,
    plannedStages,
    stageEntries,
  ));
  if (agentPackPlan && plannedStages.length === 0) {
    blockers.push('source_derived_design_agent_pack_plan_missing_planned_stage_refs');
  }
  const workflowStagePlans = plannedStages.filter((stage) =>
    stage.origin === 'source_pattern_ref'
    && machineString(stage.stage_id) !== null
    && machineString(stage.pattern_id) !== null
    && machineString(stage.step_id) !== null
    && uniqueStrings(stage.source_anchor_refs).length > 0
    && machineString(stage.stage_ref) !== null
  );
  if (agentPackPlan && workflowStagePlans.length === 0) {
    blockers.push('source_derived_design_agent_pack_plan_missing_typed_workflow_stages');
  }
  const plannedStageRefs: string[] = [];
  const plannedStageIds: string[] = [];
  steps.forEach((step) => {
    const stage = workflowStagePlans.find((candidate) => {
      const sourceAnchorRefs = uniqueStrings(candidate.source_anchor_refs);
      const stageRef = machineString(candidate.stage_ref);
      return candidate.pattern_id === step.pattern_id
        && candidate.step_id === step.step_id
        && sourceAnchorRefs.some((ref) => step.source_anchor_refs.includes(ref))
        && stageRef !== null
        && stageRef === mappedStageRefs.get(step.key);
    });
    const stageRef = machineString(stage?.stage_ref);
    if (stageRef) {
      plannedStageRefs.push(stageRef);
      const stageId = machineString(stage?.stage_id);
      if (stageId) {
        plannedStageIds.push(stageId);
      } else {
        blockers.push(`source_derived_design_agent_pack_plan_missing_workflow_step_stage_id:${step.pattern_id}/${step.step_id}`);
      }
    } else {
      blockers.push(`source_derived_design_agent_pack_plan_missing_workflow_step_stage:${step.pattern_id}/${step.step_id}`);
    }
  });
  if (steps.length > 1 && uniqueStrings(plannedStageRefs).length < 2) {
    blockers.push('source_derived_design_agent_pack_plan_collapsed_workflow_stages');
  }
  uniqueStrings(plannedStageIds).forEach((stageId) => {
    if (!stageEntries.some((stage) => stage.stage_id === stageId)) {
      blockers.push(`source_derived_design_stage_control_plane_missing_planned_stage:${stageId}`);
    }
  });

  const allPlannedStageIds: string[] = [];
  const allPlannedStageRefs: string[] = [];
  const targetOnlyRequirementRefs: string[] = [];
  plannedStages.forEach((plannedStage, index) => {
    const stageId = machineString(plannedStage.stage_id);
    const stageRef = machineString(plannedStage.stage_ref);
    const origin = machineString(plannedStage.origin);
    if (!stageId || !stageRef || !origin) {
      blockers.push(`source_derived_design_agent_pack_plan_invalid_planned_stage:${index}`);
      return;
    }
    allPlannedStageIds.push(stageId);
    allPlannedStageRefs.push(stageRef);
    const actualStages = stageEntries.filter((stage) => stage.stage_id === stageId);
    if (actualStages.length !== 1) {
      blockers.push(`source_derived_design_stage_control_plane_planned_stage_count_invalid:${stageId}`);
      return;
    }
    const actualStage = actualStages[0];
    const actualOrigin = machineString(actualStage.stage_origin);
    if (actualOrigin !== origin) {
      blockers.push(`source_derived_design_stage_manifest_origin_mismatch:${stageId}`);
    }
    if (origin === 'target_only_requirement') {
      const targetOnlyRequirementRef = machineString(plannedStage.target_only_requirement_ref);
      if (!targetOnlyRequirementRef) {
        blockers.push(`source_derived_design_agent_pack_plan_missing_target_only_requirement_ref:${stageId}`);
        return;
      }
      targetOnlyRequirementRefs.push(targetOnlyRequirementRef);
      if (machineString(actualStage.target_only_requirement_ref) !== targetOnlyRequirementRef) {
        blockers.push(`source_derived_design_stage_manifest_target_only_requirement_ref_mismatch:${stageId}`);
      }
    } else if (origin === 'source_pattern_ref') {
      const plannedPatternId = machineString(plannedStage.pattern_id);
      const plannedStepId = machineString(plannedStage.step_id);
      const plannedSourcePatternRef = machineString(plannedStage.source_pattern_ref);
      if (!plannedPatternId || !plannedStepId || !plannedSourcePatternRef) {
        blockers.push(`source_derived_design_agent_pack_plan_invalid_source_provenance:${stageId}`);
        return;
      }
      if (machineString(actualStage.pattern_id) !== plannedPatternId) {
        blockers.push(`source_derived_design_stage_manifest_pattern_id_mismatch:${stageId}`);
      }
      if (machineString(actualStage.step_id) !== plannedStepId) {
        blockers.push(`source_derived_design_stage_manifest_step_id_mismatch:${stageId}`);
      }
      if (machineString(actualStage.source_pattern_ref) !== plannedSourcePatternRef) {
        blockers.push(`source_derived_design_stage_manifest_source_pattern_ref_mismatch:${stageId}`);
      }
    } else if (origin !== 'source_pattern_ref') {
      blockers.push(`source_derived_design_agent_pack_plan_invalid_stage_origin:${stageId}`);
    }
  });
  if (uniqueStrings(allPlannedStageIds).length !== allPlannedStageIds.length) {
    blockers.push('source_derived_design_agent_pack_plan_duplicate_stage_ids');
  }
  stageEntries.forEach((stage) => {
    const stageId = machineString(stage.stage_id);
    if (stageId && !allPlannedStageIds.includes(stageId)) {
      blockers.push(`source_derived_design_stage_control_plane_unplanned_stage:${stageId}`);
    }
  });

  if (admissionReceipt && (
    !hasTypedObjectIdentity(
      admissionReceipt,
      'opl_foundry_design_admission_receipt',
      'opl.foundry.design-admission-receipt.v1',
      'receipt_ref',
    )
    || !packetRef
    || admissionReceipt.reference_design_packet_ref !== packetRef
    || !transferMapRef
    || admissionReceipt.transfer_map_ref !== transferMapRef
    || !agentPackPlanRef
    || admissionReceipt.agent_pack_plan_ref !== agentPackPlanRef
  )) {
    blockers.push('source_derived_design_typed_object_identity_invalid:DesignAdmissionReceipt');
  }
  const admittedStageRefs = uniqueStrings(
    recordArray(admissionReceipt?.design_derived_stage_refs).map((stage) => stage.stage_ref),
  );
  if (admissionReceipt && admittedStageRefs.length === 0) {
    blockers.push('source_derived_design_design_admission_receipt_missing_stage_refs');
  }
  uniqueStrings(plannedStageRefs).forEach((stageRef) => {
    if (!admittedStageRefs.includes(stageRef)) {
      blockers.push(`source_derived_design_design_admission_receipt_missing_planned_stage:${stageRef}`);
    }
  });
  const admittedTargetOnlyRequirementRefs = uniqueStrings(admissionReceipt?.target_only_requirement_refs);
  uniqueStrings(targetOnlyRequirementRefs).forEach((requirementRef) => {
    if (!admittedTargetOnlyRequirementRefs.includes(requirementRef)) {
      blockers.push(`source_derived_design_design_admission_receipt_missing_target_only_requirement:${requirementRef}`);
    }
  });

  const buildReceiptRef = machineString(buildReceipt?.receipt_ref);
  const materialization = isRecord(buildReceipt?.materialization) ? buildReceipt.materialization : null;
  const materializedReceiptStageIds = uniqueStrings(materialization?.materialized_stage_ids);
  const materializedFileDigests = recordArray(materialization?.materialized_file_digests);
  if (!buildReceipt || (
    buildReceipt.surface_kind !== 'opl_foundry_agent_build_receipt'
    || buildReceipt.receipt_kind !== 'AgentBuildReceipt'
    || !buildReceiptRef
    || buildReceipt.receipt_timing !== 'post_materialization'
    || materialization?.status !== 'passed'
    || materialization?.all_planned_stages_materialized_exactly_once !== true
    || materialization?.all_planned_stage_files_present !== true
    || JSON.stringify(materializedReceiptStageIds) !== JSON.stringify(allPlannedStageIds)
    || materializedFileDigests.length === 0
    || materializedFileDigests.some((digest) =>
      machineString(digest.ref) === null
      || !/^[a-f0-9]{64}$/.test(machineString(digest.sha256) ?? '')
    )
  )) {
    blockers.push('source_derived_design_build_receipt_not_post_materialization_proof');
  }
  blockers.push(...validateReferenceBuildReceiptMaterialization(repoDir, agentPackPlan, buildReceipt));

  return {
    blockers: uniqueStrings(blockers),
    observed: {
      workflow_step_refs: steps.map((step) => `${step.pattern_id}/${step.step_id}`),
      mapped_workflow_step_count: mappedStepKeys.length,
      planned_stage_refs: uniqueStrings(plannedStageRefs),
      all_planned_stage_refs: allPlannedStageRefs,
      materialized_stage_ids: uniqueStrings(plannedStageIds),
      all_materialized_stage_ids: allPlannedStageIds,
      admitted_design_stage_refs: admittedStageRefs,
      admitted_target_only_requirement_refs: admittedTargetOnlyRequirementRefs,
      build_receipt_ref: buildReceiptRef,
    },
  };
}

export function buildAgentProfileConformance(args: string[]) {
  const { repoDir, profileId } = parseConformanceArgs(args);
  const capabilityMap = readJsonFileOrNull(path.join(repoDir, 'contracts', 'capability_map.json'));
  const repoContractReadout = buildStandardAgentRepoContractReadout(repoDir);
  const stageControlPlane = repoContractReadout.stage_control_plane;
  const profile = conformanceProfileFor(profileId, capabilityMap);
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

  const capabilities = capabilityEntries(capabilityMap);
  const stages = stageEntries(stageControlPlane);
  const capabilityProfileRefs = selectedProfileRefs(capabilityMap);
  const requirements = profileRequirements(capabilityMap);
  const sourceDerivedRoutePresent = matchesSourceDerivedProfileId(profileId)
    || hasSourceDerivedRoute(capabilityMap);
  const observedCapabilityKinds = uniqueStrings(capabilities.map((entry) => entry.capability_kind));
  const observedSurfaceRoles = uniqueStrings(capabilities.map((entry) => entry.surface_role));
  const requiredStageArchetypes = uniqueStrings((requirements as Record<string, unknown>).required_stage_archetypes);
  const requiredEvidenceObjects = uniqueStrings((requirements as Record<string, unknown>).required_evidence_objects);
  const stagesWithKnowledgeRefs = stages.filter((stage) => Array.isArray(stage.knowledge_refs) && stage.knowledge_refs.length > 0).length;
  const stagesWithToolRefs = stages.filter((stage) => Array.isArray(stage.tool_refs) && stage.tool_refs.length > 0).length;
  const stagesWithEvaluationRefs = stages.filter((stage) => Array.isArray(stage.evaluation) && stage.evaluation.length > 0).length;
  const sourceDerivedPayloads = [
    capabilityMap,
    isRecord(capabilityMap) ? capabilityMap.source_derived_design_receipt : null,
    isRecord(capabilityMap) ? capabilityMap.reference_design_packet : null,
    isRecord(capabilityMap) ? capabilityMap.transfer_map : null,
    isRecord(capabilityMap) ? capabilityMap.agent_pack_plan : null,
    isRecord(capabilityMap) ? capabilityMap.design_admission_receipt : null,
    isRecord(capabilityMap) ? capabilityMap.build_receipt : null,
    ...(isRecord(capabilityMap) && isRecord(capabilityMap.agent_pack_plan)
      ? recordArray(capabilityMap.agent_pack_plan.planned_stage_refs)
      : []),
  ];
  const sourceDerivedDeclarationPayloads = [
    capabilityMap,
    isRecord(capabilityMap) ? capabilityMap.source_derived_design_receipt : null,
  ];
  const declaredReferenceSourceRefs = collectDirectMachineFieldStrings(
    sourceDerivedDeclarationPayloads,
    REFERENCE_DESIGN_SOURCE_REF_FIELDS,
  );
  const typedObjectFloor = sourceDerivedRoutePresent
    ? buildSourceDerivedTypedObjectFloor(
        repoDir,
        capabilityMap,
        stages,
        declaredReferenceSourceRefs,
      )
    : null;
  const designConsumptionObjects = collectDirectMachineFieldStrings(sourceDerivedPayloads, [
    'required_design_consumption_objects',
    'design_consumption_objects',
    'source_derived_design_consumption_objects',
    'required_machine_objects',
  ]);
  const referenceDesignSourceRefs = collectDirectMachineFieldStrings(
    sourceDerivedPayloads,
    REFERENCE_DESIGN_SOURCE_REF_FIELDS,
  );
  const referenceDesignPacketRefs = collectDirectMachineFieldStrings(
    sourceDerivedPayloads,
    REFERENCE_DESIGN_PACKET_REF_FIELDS,
  );
  const referenceDesignPacketRequirements = collectDirectMachineFieldStrings(
    sourceDerivedPayloads,
    REFERENCE_DESIGN_PACKET_REQUIREMENT_FIELDS,
  );
  const transferMapRefs = collectDirectMachineFieldStrings(sourceDerivedPayloads, TRANSFER_MAP_REF_FIELDS);
  const transferMapRequirements = collectDirectMachineFieldStrings(
    sourceDerivedPayloads,
    TRANSFER_MAP_REQUIREMENT_FIELDS,
  );
  const agentPackPlanRefs = collectDirectMachineFieldStrings(sourceDerivedPayloads, AGENT_PACK_PLAN_REF_FIELDS);
  const agentPackPlanRequirements = collectDirectMachineFieldStrings(
    sourceDerivedPayloads,
    AGENT_PACK_PLAN_REQUIREMENT_FIELDS,
  );
  const designAdmissionReceiptRefs = collectDirectMachineFieldStrings(
    sourceDerivedPayloads,
    DESIGN_ADMISSION_RECEIPT_REF_FIELDS,
  );
  const designAdmissionReceiptRequirements = collectDirectMachineFieldStrings(
    sourceDerivedPayloads,
    DESIGN_ADMISSION_RECEIPT_REQUIREMENT_FIELDS,
  );
  const designAdmissionReceiptSourceStageRefs = collectDirectMachineFieldStrings(
    sourceDerivedPayloads,
    DESIGN_ADMISSION_RECEIPT_SOURCE_STAGE_FIELDS,
  );
  const designAdmissionReceiptRejectedPatternRefs = collectDirectMachineFieldStrings(
    sourceDerivedPayloads,
    DESIGN_ADMISSION_RECEIPT_REJECTED_PATTERN_FIELDS,
  );
  const designAdmissionReceiptForbiddenClaims = collectDirectMachineFieldStrings(
    sourceDerivedPayloads,
    DESIGN_ADMISSION_RECEIPT_FORBIDDEN_CLAIM_FIELDS,
  );
  const buildReceiptRefs = collectDirectMachineFieldStrings(sourceDerivedPayloads, BUILD_RECEIPT_REF_FIELDS);
  const buildReceiptRequirements = collectDirectMachineFieldStrings(
    sourceDerivedPayloads,
    BUILD_RECEIPT_REQUIREMENT_FIELDS,
  );
  const buildReceiptSourceStageRefs = collectDirectMachineFieldStrings(
    sourceDerivedPayloads,
    BUILD_RECEIPT_SOURCE_STAGE_FIELDS,
  );
  const buildReceiptRejectedPatternRefs = collectDirectMachineFieldStrings(
    sourceDerivedPayloads,
    BUILD_RECEIPT_REJECTED_PATTERN_FIELDS,
  );
  const buildReceiptForbiddenClaims = collectDirectMachineFieldStrings(
    sourceDerivedPayloads,
    BUILD_RECEIPT_FORBIDDEN_CLAIM_FIELDS,
  );
  const stagePatternSourceRefs = collectDirectMachineFieldStrings(
    sourceDerivedPayloads,
    STAGE_PATTERN_SOURCE_REF_FIELDS,
  );
  const hasTargetOnlyRequirement = hasDirectMachineField(sourceDerivedPayloads, TARGET_ONLY_REQUIREMENT_FIELDS);
  const hasReferenceDesignPacketConsumption = referenceDesignSourceRefs.length > 0
    && referenceDesignPacketRefs.length > 0;
  const hasTransferMapConsumption = transferMapRefs.length > 0;
  const hasAgentPackPlanConsumption = agentPackPlanRefs.length > 0;
  const hasDesignAdmissionReceiptConsumption = designAdmissionReceiptRefs.length > 0
    && designAdmissionReceiptSourceStageRefs.length > 0
    && designAdmissionReceiptRejectedPatternRefs.length > 0
    && designAdmissionReceiptForbiddenClaims.length > 0;

  const blockers = [
    fs.existsSync(path.join(repoDir, 'contracts', 'capability_map.json')) ? null : 'missing_contract:contracts/capability_map.json',
    fs.existsSync(path.join(repoDir, STANDARD_AGENT_STAGE_MANIFEST_REF))
      ? null
      : `missing_contract:${STANDARD_AGENT_STAGE_MANIFEST_REF}`,
    ...repoContractReadout.blockers,
    includesProfileRef(capabilityProfileRefs, profile)
      ? null
      : `capability_map_missing_selected_profile_ref:${profile.profile_id}`,
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
    !sourceDerivedRoutePresent || hasReferenceDesignPacketConsumption
      ? null
      : 'source_derived_design_missing_design_consumption_object:ReferenceDesignPacket',
    !sourceDerivedRoutePresent || hasTransferMapConsumption
      ? null
      : 'source_derived_design_missing_design_consumption_object:TransferMap',
    !sourceDerivedRoutePresent || hasAgentPackPlanConsumption
      ? null
      : 'source_derived_design_missing_design_consumption_object:AgentPackPlan',
    !sourceDerivedRoutePresent || hasDesignAdmissionReceiptConsumption
      ? null
      : 'source_derived_design_missing_design_admission_receipt_refs',
    !sourceDerivedRoutePresent || referenceDesignSourceRefs.length > 0
      ? null
      : 'source_derived_design_missing_reference_design_source_refs',
    !sourceDerivedRoutePresent || referenceDesignPacketRefs.length > 0
      ? null
      : 'source_derived_design_missing_reference_design_packet_refs',
    !sourceDerivedRoutePresent || transferMapRefs.length > 0
      ? null
      : 'source_derived_design_missing_transfer_map_refs',
    !sourceDerivedRoutePresent || agentPackPlanRefs.length > 0
      ? null
      : 'source_derived_design_missing_agent_pack_plan_refs',
    !sourceDerivedRoutePresent || buildReceiptRefs.length > 0
      ? null
      : 'source_derived_design_missing_build_receipt_refs',
    !sourceDerivedRoutePresent || designAdmissionReceiptSourceStageRefs.length > 0
      ? null
      : 'source_derived_design_missing_design_admission_stage_refs',
    !sourceDerivedRoutePresent || designAdmissionReceiptRejectedPatternRefs.length > 0
      ? null
      : 'source_derived_design_missing_design_admission_rejected_source_pattern_refs',
    !sourceDerivedRoutePresent || designAdmissionReceiptForbiddenClaims.length > 0
      ? null
      : 'source_derived_design_missing_design_admission_forbidden_claims',
    !sourceDerivedRoutePresent || stagePatternSourceRefs.length > 0 || hasTargetOnlyRequirement
      ? null
      : 'source_derived_design_missing_stage_pattern_source_refs_or_target_only_requirement',
    ...(typedObjectFloor?.blockers ?? []),
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
        profile_truth_source: 'contracts/capability_map.json',
        stage_source_ref: STANDARD_AGENT_STAGE_MANIFEST_REF,
        capability_kinds: observedCapabilityKinds,
        surface_roles: observedSurfaceRoles,
        required_stage_archetypes: requiredStageArchetypes,
        required_evidence_objects: requiredEvidenceObjects,
        stages_with_knowledge_refs: stagesWithKnowledgeRefs,
        stages_with_tool_refs: stagesWithToolRefs,
        stages_with_evaluation_refs: stagesWithEvaluationRefs,
        source_derived_design: sourceDerivedRoutePresent
          ? {
              required_design_consumption_objects: designConsumptionObjects,
              reference_design_source_refs: referenceDesignSourceRefs,
              reference_design_packet_refs: referenceDesignPacketRefs,
              reference_design_packet_requirements: referenceDesignPacketRequirements,
              transfer_map_refs: transferMapRefs,
              transfer_map_requirements: transferMapRequirements,
              agent_pack_plan_refs: agentPackPlanRefs,
              agent_pack_plan_requirements: agentPackPlanRequirements,
              design_admission_receipt_refs: designAdmissionReceiptRefs,
              design_admission_receipt_requirements: designAdmissionReceiptRequirements,
              design_admission_receipt_stage_refs: designAdmissionReceiptSourceStageRefs,
              design_admission_receipt_rejected_source_pattern_refs: designAdmissionReceiptRejectedPatternRefs,
              design_admission_receipt_forbidden_claims: designAdmissionReceiptForbiddenClaims,
              build_receipt_refs: buildReceiptRefs,
              build_receipt_requirements: buildReceiptRequirements,
              build_receipt_source_stage_refs: buildReceiptSourceStageRefs,
              build_receipt_rejected_source_pattern_refs: buildReceiptRejectedPatternRefs,
              build_receipt_forbidden_claims: buildReceiptForbiddenClaims,
              stage_pattern_source_refs: stagePatternSourceRefs,
              has_target_only_requirement: hasTargetOnlyRequirement,
              typed_object_floor: typedObjectFloor?.observed ?? null,
            }
          : null,
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

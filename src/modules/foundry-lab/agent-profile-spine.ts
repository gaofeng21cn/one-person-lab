import fs from 'node:fs';
import path from 'node:path';

import { isRecord } from '../../kernel/contract-validation.ts';
import { readJsonFileOrNull } from '../../kernel/json-file.ts';
import { buildEvidenceGroundedDecisionAgentProfileReadback } from '../pack/index.ts';

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

const REFERENCE_DESIGN_PATTERN_PACKET_REQUIREMENTS = [
  'source_ref',
  'source_fingerprint_or_locator_ref',
  'pattern_summary_ref',
  'transferable_pattern_refs',
  'non_transferable_constraints_ref',
  'authority_boundary_notes_ref',
];

const TRANSFERABLE_PATTERN_REQUIREMENTS = [
  'pattern_id',
  'source_anchor_ref',
  'target_stage_or_capability_slot',
  'transfer_rationale',
  'known_limits',
];

const SOURCE_DERIVED_CAPABILITY_PLAN_REQUIREMENTS = [
  'capability_plan_ref',
  'stage_archetype_candidate_refs',
  'required_prompt_skill_knowledge_tool_refs',
  'evaluation_or_review_gate_refs',
  'no_domain_truth_or_runtime_import_notes',
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

type ParsedSelectionArgs = {
  intent: string;
  reference_source_refs: string[];
  reference_design_pattern_packet_refs: string[];
};

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

function matchedTriggerSignals(intent: string, profile: ProfileCatalogEntry): string[] {
  const normalized = intent.toLowerCase();
  return profile.trigger_signals.filter((signal) => normalized.includes(signal));
}

function takeOptionText(args: string[], index: number, option: string) {
  const values: string[] = [];
  let cursor = index + 1;
  while (cursor < args.length && !args[cursor].startsWith('--')) {
    values.push(args[cursor]);
    cursor += 1;
  }
  if (values.length === 0) {
    throw new Error(`opl profiles select requires a value for ${option}.`);
  }
  return { value: values.join(' ').trim(), nextIndex: cursor - 1 };
}

function pushCsvRefs(target: string[], value: string) {
  target.push(...value.split(',').map((entry) => entry.trim()).filter(Boolean));
}

function parseIntentArgs(args: string[]): ParsedSelectionArgs {
  const intentParts: string[] = [];
  const referenceSourceRefs: string[] = [];
  const patternPacketRefs: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--intent') {
      const parsed = takeOptionText(args, index, arg);
      intentParts.push(parsed.value);
      index = parsed.nextIndex;
      continue;
    }
    if (arg.startsWith('--intent=')) {
      intentParts.push(arg.slice('--intent='.length).trim());
      continue;
    }
    if (
      arg === '--reference-source'
      || arg === '--reference-source-ref'
      || arg === '--reference-design-source'
      || arg === '--source-ref'
      || arg === '--paper'
      || arg === '--paper-ref'
    ) {
      const parsed = takeOptionText(args, index, arg);
      pushCsvRefs(referenceSourceRefs, parsed.value);
      index = parsed.nextIndex;
      continue;
    }
    if (
      arg.startsWith('--reference-source=')
      || arg.startsWith('--reference-source-ref=')
      || arg.startsWith('--reference-design-source=')
      || arg.startsWith('--source-ref=')
      || arg.startsWith('--paper=')
      || arg.startsWith('--paper-ref=')
    ) {
      pushCsvRefs(referenceSourceRefs, arg.slice(arg.indexOf('=') + 1));
      continue;
    }
    if (
      arg === '--reference-design-pattern-packet'
      || arg === '--reference-design-pattern-packet-ref'
      || arg === '--pattern-packet'
      || arg === '--pattern-packet-ref'
    ) {
      const parsed = takeOptionText(args, index, arg);
      pushCsvRefs(patternPacketRefs, parsed.value);
      index = parsed.nextIndex;
      continue;
    }
    if (
      arg.startsWith('--reference-design-pattern-packet=')
      || arg.startsWith('--reference-design-pattern-packet-ref=')
      || arg.startsWith('--pattern-packet=')
      || arg.startsWith('--pattern-packet-ref=')
    ) {
      pushCsvRefs(patternPacketRefs, arg.slice(arg.indexOf('=') + 1));
      continue;
    }
    intentParts.push(arg);
  }

  return {
    intent: intentParts.join(' ').trim(),
    reference_source_refs: uniqueStrings(referenceSourceRefs),
    reference_design_pattern_packet_refs: uniqueStrings(patternPacketRefs),
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
    required_stage_archetypes: SOURCE_DERIVED_STAGE_ARCHETYPE_CANDIDATES,
    required_capability_kinds: REQUIRED_CAPABILITY_KINDS,
    required_surface_roles: REQUIRED_SURFACE_ROLES,
    required_reference_pack_roles: sourceDerivedDesignProfileEntry().required_reference_pack_roles,
    reference_design_pattern_packet_requirements: REFERENCE_DESIGN_PATTERN_PACKET_REQUIREMENTS,
    transferable_pattern_requirements: TRANSFERABLE_PATTERN_REQUIREMENTS,
    stage_archetype_candidates: SOURCE_DERIVED_STAGE_ARCHETYPE_CANDIDATES,
    capability_plan_requirements: SOURCE_DERIVED_CAPABILITY_PLAN_REQUIREMENTS,
  };
}

function buildSourceDerivedDesignReceipt(parsed: ParsedSelectionArgs) {
  return {
    route_id: SOURCE_DERIVED_PROFILE_ID,
    route_ref: SOURCE_DERIVED_PROFILE_REF,
    source_refs: parsed.reference_source_refs,
    reference_design_pattern_packet_refs: parsed.reference_design_pattern_packet_refs,
    source_material_body_policy: 'refs_only_no_external_body_import',
    profile_requirements: sourceDerivedProfileRequirements(),
    reference_design_pattern_packet_requirements: REFERENCE_DESIGN_PATTERN_PACKET_REQUIREMENTS,
    transferable_pattern_requirements: TRANSFERABLE_PATTERN_REQUIREMENTS,
    stage_archetype_candidates: SOURCE_DERIVED_STAGE_ARCHETYPE_CANDIDATES,
    capability_plan_requirements: SOURCE_DERIVED_CAPABILITY_PLAN_REQUIREMENTS,
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
  stageControlPlane: unknown,
) {
  const builtin = catalogEntries().find((entry) => entry.profile_id === profileId || entry.profile_ref === profileId);
  if (builtin) {
    return builtin;
  }
  if (
    matchesSourceDerivedProfileId(profileId)
    || hasSourceDerivedRoute(capabilityMap)
    || hasSourceDerivedRoute(stageControlPlane)
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
  const parsed = parseIntentArgs(args);
  const intent = parsed.intent;
  const hasReferenceDesignSignal = parsed.reference_source_refs.length > 0
    || parsed.reference_design_pattern_packet_refs.length > 0;
  const candidates = catalogEntries()
    .map((profile) => ({
      profile,
      matched_trigger_signals: matchedTriggerSignals(intent, profile),
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
    profile_selection_receipt: {
      surface_kind: 'opl_profile_selection_receipt',
      version: 'profile-selection-receipt.v1',
      status: selected || sourceDerivedReceipt ? 'selected' : 'blocked',
      intent,
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

export function buildAgentProfileConformance(args: string[]) {
  const { repoDir, profileId } = parseConformanceArgs(args);
  const capabilityMap = readJsonFileOrNull(path.join(repoDir, 'contracts', 'capability_map.json'));
  const stageControlPlane = readJsonFileOrNull(path.join(repoDir, 'contracts', 'stage_control_plane.json'));
  const profile = conformanceProfileFor(profileId, capabilityMap, stageControlPlane);
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

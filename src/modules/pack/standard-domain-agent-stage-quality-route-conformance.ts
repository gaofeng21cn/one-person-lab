import fs from 'node:fs';
import path from 'node:path';

import {
  readStandardAgentQualityRolePromptFile,
  resolveStandardAgentRepoFile,
  STANDARD_AGENT_STAGE_MANIFEST_REF,
} from '../pack/index.ts';
import {
  collectFieldValues,
  isRecord,
  optionalString,
  readJsonFile,
  unique,
  type JsonRecord,
} from './standard-domain-agent-conformance-utils.ts';

const STAGE_QUALITY_POLICY_REF = 'contracts/stage_quality_cycle_policy.json';
const REQUIRED_CROSS_STAGE_ROUTE_SELECTION_FLAGS = {
  primary_only_decisive_attempt_role: 'producer',
  formal_review_decisive_attempt_roles: ['reviewer', 're_reviewer'],
  repairer_can_be_decisive_attempt: false,
  repair_required_review_or_re_review_may_select_cross_stage_route_back_before_budget_exhaustion: true,
  repair_required_cross_stage_route_back_requires_target_different_from_current_stage: true,
  repair_required_review_or_re_review_may_select_other_terminal_route_before_budget_exhaustion: false,
  repair_required_review_or_re_review_may_select_terminal_route_after_budget_exhaustion: true,
  same_stage_repair_required_with_budget_remaining_continues_quality_loop: true,
  cross_stage_route_back_requires_narrowest_canonical_owner_stage: true,
} as const;
const REQUIRED_REVIEW_ROUTE_PROMPT_MARKERS = [
  'same_stage_repair_required',
  'cross_stage_route_back_before_budget_exhaustion',
] as const;
const REVIEW_ROUTE_ROLES = ['reviewer', 're_reviewer'] as const;
const AMBIGUOUS_ROUTE_POLICY_FIELDS = [
  'repair_required_with_budget_remaining_route_output',
  'producer_or_repairer_may_return_terminal_route_decision',
] as const;

function promptRefsForRole(policy: JsonRecord, role: typeof REVIEW_ROUTE_ROLES[number]) {
  return unique(collectFieldValues(policy, 'role_prompt_refs')
    .map((entry) => isRecord(entry.value) ? optionalString(entry.value[role]) : null)
    .filter((entry): entry is string => Boolean(entry)));
}

function referencedPromptFiles(policy: JsonRecord) {
  const refs = [
    ...collectFieldValues(policy, 'stage_prompt_ref').map((entry) => optionalString(entry.value)),
    ...collectFieldValues(policy, 'quality_rubric_refs').flatMap((entry) =>
      Array.isArray(entry.value) ? entry.value.map(optionalString) : []
    ),
    ...collectFieldValues(policy, 'role_prompt_refs').flatMap((entry) =>
      isRecord(entry.value) ? Object.values(entry.value).map(optionalString) : []
    ),
  ].filter((entry): entry is string => Boolean(entry));
  return unique(refs.map((ref) => ref.split('#', 1)[0]!).filter(Boolean));
}

function expectedRouteSelectionValueMatches(observed: unknown, expected: unknown) {
  return Array.isArray(expected)
    ? Array.isArray(observed)
      && observed.length === expected.length
      && observed.every((entry, index) => entry === expected[index])
    : observed === expected;
}

function stageQualityPolicyDeclaration(repoDir: string) {
  const manifestPath = fs.existsSync(path.join(repoDir, STANDARD_AGENT_STAGE_MANIFEST_REF))
    ? STANDARD_AGENT_STAGE_MANIFEST_REF
    : null;
  if (!manifestPath) {
    return {
      status: 'not_declared' as const,
      manifest_status: 'missing',
      declared_policy_refs: [] as string[],
      blockers: [] as string[],
    };
  }
  try {
    resolveStandardAgentRepoFile(repoDir, manifestPath, 'stage_quality_route.manifest_ref');
  } catch {
    return {
      status: 'invalid' as const,
      manifest_status: 'invalid_ref',
      declared_policy_refs: [] as string[],
      blockers: ['stage_quality_route_manifest_ref_invalid'],
    };
  }
  const manifestFile = readJsonFile(repoDir, manifestPath);
  const manifest = isRecord(manifestFile.payload) ? manifestFile.payload : null;
  if (manifestFile.status !== 'resolved' || !manifest || !Array.isArray(manifest.stages)) {
    return {
      status: 'invalid' as const,
      manifest_status: manifestFile.status,
      declared_policy_refs: [] as string[],
      blockers: ['stage_quality_route_manifest_invalid'],
    };
  }
  const malformedRefs: string[] = [];
  const declaredPolicyRefs = unique(manifest.stages.flatMap((stage, index) => {
    if (!isRecord(stage) || stage.stage_quality_cycle_policy_ref === undefined) return [];
    const ref = optionalString(stage.stage_quality_cycle_policy_ref);
    if (!ref) {
      malformedRefs.push(`stage_quality_cycle_policy_ref_invalid:manifest.stages[${index}]`);
      return [];
    }
    return [ref];
  }));
  const applicablePolicyRefs = declaredPolicyRefs.filter((ref) =>
    ref.split('#', 1)[0] === STAGE_QUALITY_POLICY_REF
  );
  if (applicablePolicyRefs.length === 0 && malformedRefs.length === 0) {
    return {
      status: 'not_declared' as const,
      manifest_status: 'resolved',
      declared_policy_refs: declaredPolicyRefs,
      applicable_policy_refs: applicablePolicyRefs,
      blockers: [] as string[],
    };
  }
  const refBlockers = applicablePolicyRefs.flatMap((ref) => {
    const fileRef = ref.split('#', 1)[0]!;
    try {
      resolveStandardAgentRepoFile(repoDir, fileRef, 'stage_quality_cycle_policy_ref');
      return [];
    } catch {
      return [`stage_quality_cycle_policy_ref_invalid:${ref}`];
    }
  });
  const blockers = unique([...malformedRefs, ...refBlockers]);
  return {
    status: blockers.length === 0 ? 'declared' as const : 'invalid' as const,
    manifest_status: 'resolved',
    declared_policy_refs: declaredPolicyRefs,
    applicable_policy_refs: applicablePolicyRefs,
    blockers,
  };
}

function promptMarkerBlockers(content: string, sourceRef: string, role?: string) {
  return REQUIRED_REVIEW_ROUTE_PROMPT_MARKERS
    .filter((marker) => !content.includes(marker))
    .map((marker) => [
      'stage_quality_route_prompt_marker_missing',
      role ?? 'repair_required_prompt',
      sourceRef,
      marker,
    ].join(':'));
}

export function buildStageQualityRoutePromptAlignmentChecks(repoDir: string) {
  const declaration = stageQualityPolicyDeclaration(repoDir);
  if (declaration.status === 'not_declared') {
    return {
      status: 'not_applicable',
      policy_ref: STAGE_QUALITY_POLICY_REF,
      policy_status: 'not_declared',
      manifest_status: declaration.manifest_status,
      declared_policy_refs: declaration.declared_policy_refs,
      required_cross_stage_route_selection: REQUIRED_CROSS_STAGE_ROUTE_SELECTION_FLAGS,
      required_review_route_prompt_markers: REQUIRED_REVIEW_ROUTE_PROMPT_MARKERS,
      resolved_role_prompt_refs: {},
      repair_required_prompt_refs: [] as string[],
      blockers: [],
    };
  }
  if (declaration.status === 'invalid') {
    return {
      status: 'blocked',
      policy_ref: STAGE_QUALITY_POLICY_REF,
      policy_status: 'invalid_declaration',
      manifest_status: declaration.manifest_status,
      declared_policy_refs: declaration.declared_policy_refs,
      required_cross_stage_route_selection: REQUIRED_CROSS_STAGE_ROUTE_SELECTION_FLAGS,
      required_review_route_prompt_markers: REQUIRED_REVIEW_ROUTE_PROMPT_MARKERS,
      resolved_role_prompt_refs: {},
      repair_required_prompt_refs: [] as string[],
      blockers: declaration.blockers,
    };
  }

  try {
    resolveStandardAgentRepoFile(repoDir, STAGE_QUALITY_POLICY_REF, 'stage_quality_cycle_policy_ref');
  } catch {
    return {
      status: 'blocked',
      policy_ref: STAGE_QUALITY_POLICY_REF,
      policy_status: 'invalid_ref',
      manifest_status: declaration.manifest_status,
      declared_policy_refs: declaration.declared_policy_refs,
      required_cross_stage_route_selection: REQUIRED_CROSS_STAGE_ROUTE_SELECTION_FLAGS,
      required_review_route_prompt_markers: REQUIRED_REVIEW_ROUTE_PROMPT_MARKERS,
      resolved_role_prompt_refs: {},
      repair_required_prompt_refs: [] as string[],
      blockers: [`stage_quality_cycle_policy_ref_invalid:${STAGE_QUALITY_POLICY_REF}`],
    };
  }
  const policyFile = readJsonFile(repoDir, STAGE_QUALITY_POLICY_REF);
  const policy = isRecord(policyFile.payload) ? policyFile.payload : null;
  const routeSelection = isRecord(policy?.cross_stage_route_selection)
    ? policy.cross_stage_route_selection
    : {};
  const resolvedRolePromptRefs: Record<string, string[]> = {};
  const promptBlockers: string[] = [];

  if (policy) {
    for (const role of REVIEW_ROUTE_ROLES) {
      const refs = promptRefsForRole(policy, role);
      resolvedRolePromptRefs[role] = refs;
      if (refs.length === 0) {
        promptBlockers.push(`stage_quality_route_prompt_ref_missing:${role}`);
        continue;
      }
      for (const ref of refs) {
        try {
          const prompt = readStandardAgentQualityRolePromptFile(repoDir, ref);
          promptBlockers.push(...promptMarkerBlockers(prompt.content, ref, role));
        } catch {
          promptBlockers.push(`stage_quality_route_prompt_ref_invalid:${role}:${ref}`);
        }
      }
    }
  }

  const policyPromptRefs = policy ? referencedPromptFiles(policy) : [];
  const resolvedPolicyPromptFiles = policyPromptRefs.flatMap((ref) => {
    try {
      return [{ ref, absolute_path: resolveStandardAgentRepoFile(repoDir, ref, 'stage_quality_cycle_prompt_ref') }];
    } catch {
      promptBlockers.push(`stage_quality_cycle_prompt_ref_invalid:${ref}`);
      return [];
    }
  });
  const repairRequiredPromptRefs = resolvedPolicyPromptFiles
    .filter(({ ref, absolute_path }) =>
      ref.endsWith('.md') && fs.readFileSync(absolute_path, 'utf8').includes('repair_required')
    )
    .map(({ ref }) => ref);
  for (const ref of repairRequiredPromptRefs) {
    const absolutePath = resolveStandardAgentRepoFile(repoDir, ref, 'stage_quality_cycle_prompt_ref');
    promptBlockers.push(...promptMarkerBlockers(fs.readFileSync(absolutePath, 'utf8'), ref));
  }

  const blockers = unique([
    policyFile.status === 'resolved'
      ? null
      : `stage_quality_cycle_policy_${policyFile.status}`,
    policy ? null : 'stage_quality_cycle_policy_root_invalid',
    ...Object.entries(REQUIRED_CROSS_STAGE_ROUTE_SELECTION_FLAGS).map(([field, expected]) =>
      expectedRouteSelectionValueMatches(routeSelection[field], expected)
        ? null
        : `stage_quality_cross_stage_route_selection_invalid:${field}`
    ),
    ...(policy ? AMBIGUOUS_ROUTE_POLICY_FIELDS.flatMap((field) =>
      collectFieldValues(policy, field).map((entry) =>
        `stage_quality_ambiguous_route_policy_field_forbidden:${entry.path}`
      )
    ) : []),
    ...promptBlockers,
  ].filter((entry): entry is string => Boolean(entry)));

  return {
    status: blockers.length === 0 ? 'passed' : 'blocked',
    policy_ref: STAGE_QUALITY_POLICY_REF,
    policy_status: policyFile.status,
    manifest_status: declaration.manifest_status,
    declared_policy_refs: declaration.declared_policy_refs,
    required_cross_stage_route_selection: REQUIRED_CROSS_STAGE_ROUTE_SELECTION_FLAGS,
    observed_cross_stage_route_selection: routeSelection,
    required_review_route_prompt_markers: REQUIRED_REVIEW_ROUTE_PROMPT_MARKERS,
    resolved_role_prompt_refs: resolvedRolePromptRefs,
    repair_required_prompt_refs: repairRequiredPromptRefs,
    blockers,
  };
}

import type { JsonRecord } from '../runtime-tray-snapshot-types.ts';
import {
  refsFromRecord,
  stringList,
  uniqueStrings,
} from './value-utils.ts';

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function versionCohortFromRef(value: string) {
  const decoded = safeDecodeURIComponent(value);
  const segmentMatch = decoded.match(
    /(?:^|[/:?&=])v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?)(?=$|[/?#&:])/,
  );
  if (segmentMatch) {
    return `app-release-cohort:${segmentMatch[1]}`;
  }
  const assetMatch = decoded.match(
    /One-Person-Lab(?:-Full)?-v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?)-mac-/,
  );
  if (assetMatch) {
    return `app-release-cohort:${assetMatch[1]}`;
  }
  const match = decoded.match(/(?:^|[^0-9A-Za-z.])v?(\d+\.\d+\.\d+)(?:[^0-9A-Za-z.]|$)/);
  return match ? `app-release-cohort:${match[1]}` : null;
}

function cohortIdsFromRecord(value: JsonRecord) {
  return uniqueStrings([
    ...refsFromRecord(value, ['app_release_cohort_id', 'release_cohort_id', 'cohort_id']),
    ...refsFromRecord(value, [
      'release_package_refs',
      'release_bundle_refs',
      'app_release_artifact_refs',
      'dmg_refs',
      'sidecar_refs',
      'screenshot_refs',
      'app_screenshot_refs',
      'first_run_screenshot_refs',
      'operator_screenshot_refs',
      'reload_prompt_user_path_refs',
      'reload_prompt_receipt_refs',
      'first_run_log_refs',
      'startup_maintenance_reload_prompt_refs',
      'provider_state_linkage_refs',
      'provider_state_receipt_refs',
      'provider_cadence_receipt_refs',
      'provider_slo_receipt_refs',
      'long_operator_evidence_refs',
      'operator_long_soak_refs',
      'app_user_path_long_soak_refs',
      'production_long_soak_refs',
    ]).map(versionCohortFromRef).filter((entry): entry is string => Boolean(entry)),
  ]);
}

export function refsFromRecords(values: JsonRecord[], keys: string[]) {
  return uniqueStrings(values.flatMap((value) => refsFromRecord(value, keys)));
}

export function buildAppReleaseUserPathCohortGuard(records: JsonRecord[]) {
  const candidateCohortIds = uniqueStrings(records.flatMap(cohortIdsFromRecord)).sort();
  const completeCohortIds = completeAppReleaseCohortIds(records, candidateCohortIds);
  const newestCandidateCohortId = newestCohortId(candidateCohortIds);
  const selectedCohortId = candidateCohortIds.length === 1
    ? candidateCohortIds[0]
    : newestCandidateCohortId && completeCohortIds.includes(newestCandidateCohortId)
      ? newestCandidateCohortId
      : null;
  return {
    status: candidateCohortIds.length === 0
      ? 'cohort_unscoped'
      : selectedCohortId
        ? 'cohort_selected'
        : 'cohort_ambiguous',
    selected_cohort_id: selectedCohortId,
    candidate_cohort_ids: candidateCohortIds,
    complete_cohort_ids: completeCohortIds,
    newest_candidate_cohort_id: newestCandidateCohortId,
    selection_policy:
      'single_cohort_or_newest_candidate_when_complete_without_cross_cohort_gate_mixing',
    requires_single_release_user_path_cohort: true,
  };
}

type AppReleaseUserPathCohortGuard = ReturnType<typeof buildAppReleaseUserPathCohortGuard>;

function completeAppReleaseCohortIds(records: JsonRecord[], candidateCohortIds: string[]) {
  return candidateCohortIds.filter((cohortId) => {
    const scopedRecords = records.filter((entry) => cohortIdsFromRecord(entry).includes(cohortId));
    return (
      refsFromRecords(scopedRecords, [
        'release_package_refs',
        'release_bundle_refs',
        'app_release_artifact_refs',
        'dmg_refs',
        'sidecar_refs',
      ]).length > 0
      && refsFromRecords(scopedRecords, [
        'screenshot_refs',
        'app_screenshot_refs',
        'first_run_screenshot_refs',
        'operator_screenshot_refs',
      ]).length > 0
      && refsFromRecords(scopedRecords, [
        'reload_prompt_user_path_refs',
        'reload_prompt_receipt_refs',
        'first_run_log_refs',
        'startup_maintenance_reload_prompt_refs',
      ]).length > 0
      && refsFromRecords(scopedRecords, [
        'provider_state_linkage_refs',
        'provider_state_receipt_refs',
        'provider_cadence_receipt_refs',
        'provider_slo_receipt_refs',
      ]).length > 0
      && refsFromRecords(scopedRecords, [
        'long_operator_evidence_refs',
        'operator_long_soak_refs',
        'app_user_path_long_soak_refs',
        'production_long_soak_refs',
      ]).length > 0
    );
  });
}

function newestCohortId(cohortIds: string[]) {
  if (cohortIds.length === 0) {
    return null;
  }
  return [...cohortIds].sort((left, right) =>
    compareReleaseVersions(releaseVersionFromCohortId(left), releaseVersionFromCohortId(right))
  ).at(-1) ?? null;
}

function releaseVersionFromCohortId(cohortId: string) {
  return cohortId.startsWith('app-release-cohort:')
    ? cohortId.slice('app-release-cohort:'.length)
    : cohortId;
}

function compareReleaseVersions(left: string, right: string) {
  const leftParsed = parseReleaseVersion(left);
  const rightParsed = parseReleaseVersion(right);
  for (const key of ['major', 'minor', 'patch'] as const) {
    const delta = leftParsed[key] - rightParsed[key];
    if (delta !== 0) {
      return delta;
    }
  }
  return comparePrerelease(leftParsed.prerelease, rightParsed.prerelease);
}

function parseReleaseVersion(version: string) {
  const match = version.match(
    /^(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)(?:-(?<prerelease>[0-9A-Za-z.-]+))?$/,
  );
  if (!match?.groups) {
    return { major: 0, minor: 0, patch: 0, prerelease: version };
  }
  return {
    major: Number.parseInt(match.groups.major, 10),
    minor: Number.parseInt(match.groups.minor, 10),
    patch: Number.parseInt(match.groups.patch, 10),
    prerelease: match.groups.prerelease ?? '',
  };
}

function comparePrerelease(left: string, right: string) {
  if (left === right) {
    return 0;
  }
  if (!left) {
    return 1;
  }
  if (!right) {
    return -1;
  }
  const leftParts = left.split('.');
  const rightParts = right.split('.');
  const partCount = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < partCount; index += 1) {
    const leftPart = leftParts[index];
    const rightPart = rightParts[index];
    if (leftPart === undefined) {
      return -1;
    }
    if (rightPart === undefined) {
      return 1;
    }
    const leftNumber = /^\d+$/.test(leftPart) ? Number.parseInt(leftPart, 10) : null;
    const rightNumber = /^\d+$/.test(rightPart) ? Number.parseInt(rightPart, 10) : null;
    if (leftNumber !== null && rightNumber !== null) {
      const delta = leftNumber - rightNumber;
      if (delta !== 0) {
        return delta;
      }
      continue;
    }
    if (leftNumber !== null) {
      return -1;
    }
    if (rightNumber !== null) {
      return 1;
    }
    const delta = leftPart.localeCompare(rightPart);
    if (delta !== 0) {
      return delta;
    }
  }
  return 0;
}

export function recordsForAppReleaseUserPathCohortGuard(
  records: JsonRecord[],
  cohortGuard: AppReleaseUserPathCohortGuard,
) {
  if (cohortGuard.status === 'cohort_unscoped') {
    return records;
  }
  if (!cohortGuard.selected_cohort_id) {
    return [];
  }
  return records.filter((entry) => cohortIdsFromRecord(entry).includes(cohortGuard.selected_cohort_id!));
}

function typedBlockerGateIdFromRef(value: string) {
  try {
    const parsed = new URL(value);
    const gateId = parsed.searchParams.get('gate');
    if (gateId && gateId.trim().length > 0) {
      return gateId.trim();
    }
  } catch {
    // Fall through to the regex path for non-URL refs.
  }
  const match = value.match(/[?&]gate=([^&]+)/);
  return match ? safeDecodeURIComponent(match[1]).trim() : null;
}

export function currentAppReleaseUserPathTypedBlockerRefs(input: {
  typedBlockerRefs: string[];
  openGateIds: Set<string>;
  selectedCohortId: string | null;
}) {
  return input.typedBlockerRefs.filter((ref) => {
    const blockerCohortId = versionCohortFromRef(ref);
    if (
      input.selectedCohortId
      && blockerCohortId
      && blockerCohortId !== input.selectedCohortId
    ) {
      return false;
    }
    const gateId = typedBlockerGateIdFromRef(ref);
    return !gateId || input.openGateIds.has(gateId);
  });
}

function appReleaseUserPathEvidenceGate(input: {
  gateId: string;
  requiredRefsAnyOf: string[];
  observedRefs: string[];
  cohortGuardStatus: string;
  selectedCohortId: string | null;
  candidateCohortIds: string[];
}) {
  return {
    gate_id: input.gateId,
    status: input.observedRefs.length > 0 ? 'refs_observed' : `missing_${input.gateId}`,
    required_refs_any_of: input.requiredRefsAnyOf,
    observed_refs: input.observedRefs,
    observed_ref_count: input.observedRefs.length,
    cohort_guard_status: input.cohortGuardStatus,
    selected_cohort_id: input.selectedCohortId,
    candidate_cohort_ids: input.candidateCohortIds,
    current_contract_status: 'not_claimed_by_contract',
    full_detail_section: 'app_release_user_path_evidence',
    authority_boundary: {
      refs_only: true,
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_close_domain_ready: false,
      can_claim_production_ready: false,
      can_authorize_quality_or_export: false,
      can_mutate_artifact_body: false,
    },
  };
}

export function buildAppReleaseUserPathEvidenceGates(input: {
  cohortGuard: AppReleaseUserPathCohortGuard;
  scopedEvidenceRecords: JsonRecord[];
}) {
  const { cohortGuard, scopedEvidenceRecords } = input;
  return [
    appReleaseUserPathEvidenceGate({
      gateId: 'release_package_refs',
      requiredRefsAnyOf: [
        'release_package_receipt_ref',
        'release_bundle_ref',
        'app_release_artifact_ref',
        'release_sidecar_ref',
      ],
      observedRefs: refsFromRecords(scopedEvidenceRecords, [
        'release_package_refs',
        'release_bundle_refs',
        'app_release_artifact_refs',
        'dmg_refs',
        'sidecar_refs',
      ]),
      cohortGuardStatus: cohortGuard.status,
      selectedCohortId: cohortGuard.selected_cohort_id,
      candidateCohortIds: cohortGuard.candidate_cohort_ids,
    }),
    appReleaseUserPathEvidenceGate({
      gateId: 'screenshot_refs',
      requiredRefsAnyOf: [
        'screenshot_evidence_ref',
        'first_run_screenshot_ref',
        'operator_screenshot_ref',
      ],
      observedRefs: refsFromRecords(scopedEvidenceRecords, [
        'screenshot_refs',
        'app_screenshot_refs',
        'first_run_screenshot_refs',
        'operator_screenshot_refs',
      ]),
      cohortGuardStatus: cohortGuard.status,
      selectedCohortId: cohortGuard.selected_cohort_id,
      candidateCohortIds: cohortGuard.candidate_cohort_ids,
    }),
    appReleaseUserPathEvidenceGate({
      gateId: 'reload_prompt_user_path_refs',
      requiredRefsAnyOf: [
        'reload_prompt_user_path_receipt_ref',
        'startup_maintenance_reload_prompt_ref',
        'first_run_log_ref',
      ],
      observedRefs: refsFromRecords(scopedEvidenceRecords, [
        'reload_prompt_user_path_refs',
        'reload_prompt_receipt_refs',
        'first_run_log_refs',
        'startup_maintenance_reload_prompt_refs',
      ]),
      cohortGuardStatus: cohortGuard.status,
      selectedCohortId: cohortGuard.selected_cohort_id,
      candidateCohortIds: cohortGuard.candidate_cohort_ids,
    }),
    appReleaseUserPathEvidenceGate({
      gateId: 'provider_state_linkage_refs',
      requiredRefsAnyOf: [
        'provider_state_linkage_ref',
        'provider_cadence_receipt_ref',
        'provider_slo_receipt_ref',
      ],
      observedRefs: refsFromRecords(scopedEvidenceRecords, [
        'provider_state_linkage_refs',
        'provider_state_receipt_refs',
        'provider_cadence_receipt_refs',
        'provider_slo_receipt_refs',
      ]),
      cohortGuardStatus: cohortGuard.status,
      selectedCohortId: cohortGuard.selected_cohort_id,
      candidateCohortIds: cohortGuard.candidate_cohort_ids,
    }),
    appReleaseUserPathEvidenceGate({
      gateId: 'long_operator_evidence_refs',
      requiredRefsAnyOf: [
        'long_operator_evidence_ref',
        'operator_long_soak_ref',
        'app_user_path_long_soak_ref',
      ],
      observedRefs: refsFromRecords(scopedEvidenceRecords, [
        'long_operator_evidence_refs',
        'operator_long_soak_refs',
        'app_user_path_long_soak_refs',
        'production_long_soak_refs',
      ]),
      cohortGuardStatus: cohortGuard.status,
      selectedCohortId: cohortGuard.selected_cohort_id,
      candidateCohortIds: cohortGuard.candidate_cohort_ids,
    }),
  ];
}

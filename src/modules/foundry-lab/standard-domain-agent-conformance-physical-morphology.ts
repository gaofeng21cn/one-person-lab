import fs from 'node:fs';
import path from 'node:path';

import {
  countBy,
  escapeRegex,
  gitTrackedOrWalkedFiles,
  optionalString,
  stringList,
  unique,
  type JsonRecord,
} from './standard-domain-agent-conformance-utils.ts';
import { readStandardAgentConformanceProfile } from './standard-agent-conformance-profile.ts';

export function buildPhysicalMorphologyChecks(repoDir: string, _domainId?: string) {
  const profileReadout = readStandardAgentConformanceProfile(repoDir);
  const policy = profileReadout.profile?.physical_morphology ?? null;
  const requiredSurfaceIds = policy?.required_surface_ids ?? [];
  const classifications = policy?.surface_classifications ?? [];
  const classifiedSurfaceIds = stringList(classifications.map((entry) => entry.surface_id));
  const policyBlockers = [
    ...profileReadout.blockers,
    ...requiredSurfaceIds
      .filter((surfaceId) => !classifiedSurfaceIds.includes(surfaceId))
      .map((surfaceId) => `physical_morphology_surface_unclassified:${surfaceId}`),
  ];
  const forbiddenNameResidue = policy
    ? scanForbiddenNameResidue(
        repoDir,
        policy.scan_roots,
        policy.forbidden_name_tokens,
        policy.allowed_residue_prefixes,
      )
    : [];
  const residueClassification = classifyForbiddenNameResidue(forbiddenNameResidue);
  const blockers = unique([
    ...policyBlockers,
    ...residueClassification.active_forbidden_name_residue
      .map((entry) => `active_forbidden_name_residue:${entry.token}:${entry.path}`),
  ]);
  return {
    status: blockers.length === 0 ? 'passed' : 'blocked',
    policy_status: profileReadout.status,
    policy_sources: [profileReadout.source_ref],
    profile_id: profileReadout.profile?.profile_id ?? null,
    required_surface_ids: requiredSurfaceIds,
    surface_classifications: classifications,
    required_parity_gates: policy?.required_parity_gates ?? [],
    allowed_tombstone_provenance_locations: policy?.allowed_residue_prefixes ?? [],
    residue_classification_summary: residueClassification.summary,
    active_forbidden_name_residue: residueClassification.active_forbidden_name_residue,
    allowed_name_residue: residueClassification.allowed_name_residue,
    forbidden_name_residue: forbiddenNameResidue,
    blockers,
  };
}

function scanForbiddenNameResidue(
  repoDir: string,
  scanRoots: string[],
  tokens: string[],
  allowedPrefixes: string[],
) {
  if (tokens.length === 0) return [];
  const activeFiles = gitTrackedOrWalkedFiles(repoDir).filter((relativePath) =>
    scanRoots.some((root) => root.endsWith('/')
      ? relativePath.startsWith(root)
      : relativePath === root));
  return activeFiles.flatMap((relativePath) => {
    let content = '';
    try {
      content = fs.readFileSync(path.join(repoDir, relativePath), 'utf8');
    } catch {
      return [];
    }
    return tokens.flatMap((token) => {
      const tokenPattern = new RegExp(`(?<![A-Za-z0-9_])${escapeRegex(token)}(?![A-Za-z0-9_])`);
      if (!tokenPattern.test(content)) return [];
      return [{
        token,
        path: relativePath,
        allowed: allowedPrefixes.some((prefix) => prefix.endsWith('/')
          ? relativePath.startsWith(prefix)
          : relativePath === prefix),
      }];
    });
  });
}

function classifyForbiddenNameResidue(entries: JsonRecord[]) {
  const activeForbiddenNameResidue = entries.filter((entry) => entry.allowed !== true);
  const allowedNameResidue = entries.filter((entry) => entry.allowed === true).map((entry) => ({
    ...entry,
    allowance_classification: allowedResidueClassification(optionalString(entry.path)),
  }));
  return {
    summary: {
      status: activeForbiddenNameResidue.length === 0
        ? 'no_active_forbidden_name_residue'
        : 'active_forbidden_name_residue_present',
      total_match_count: entries.length,
      active_forbidden_name_residue_count: activeForbiddenNameResidue.length,
      allowed_name_residue_count: allowedNameResidue.length,
      allowed_name_residue_by_classification: countBy(allowedNameResidue.map((entry) =>
        optionalString(entry.allowance_classification) ?? 'allowed_other')),
    },
    active_forbidden_name_residue: activeForbiddenNameResidue,
    allowed_name_residue: allowedNameResidue,
  };
}

function allowedResidueClassification(relativePath: string | null) {
  if (!relativePath) return 'allowed_other';
  if (relativePath.startsWith('docs/')) return 'history_tombstone_or_provenance';
  if (relativePath.startsWith('tests/')) return 'contract_or_legacy_guard_test';
  if (relativePath.startsWith('contracts/')) return 'machine_contract_policy_or_projection';
  return 'allowed_other';
}

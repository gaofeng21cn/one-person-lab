import fs from 'node:fs';
import path from 'node:path';

import { isRecord } from '../../kernel/contract-validation.ts';
import { readJsonPayloadFile } from '../../kernel/json-file.ts';
import { record, stringValue } from '../../kernel/json-record.ts';
import {
  resolveDomainOwnerAnswerProjectionProfiles,
  type DomainOwnerAnswerProjectionProfile,
} from '../../kernel/domain-owner-answer-projection-profile.ts';
import type { StandardDomainAgentRepoInput } from '../../kernel/standard-domain-agent-family-repos.ts';
import type {
  StageRunExecutionAuthorizationReceipt,
} from './stage-run-execution-authorization-ledger.ts';
import { getActiveWorkspaceBinding } from '../workspace/index.ts';

type JsonRecord = Record<string, unknown>;

export const OWNER_ANSWER_PROJECTION_REGISTRY_SURFACE_KIND =
  'opl_domain_owner_answer_projection_profile_registry';
const OWNER_ANSWER_PROJECTION_MATCH_SURFACE_KIND =
  'opl_domain_owner_answer_projection_registry_match';
const OWNER_ANSWER_PROJECTION_POLICY =
  'generic_domain_owner_answer_refs_only_no_domain_truth_or_readiness_claim';
const OWNER_ANSWER_PROJECTION_REGISTRY_READBACK_SURFACE_KIND =
  'opl_domain_owner_answer_projection_profile_registry_readback';

export type OwnerAnswerProjectionProfile = DomainOwnerAnswerProjectionProfile;

export function buildOwnerAnswerProjectionProfileRegistryReadback(
  profiles: ReadonlyArray<OwnerAnswerProjectionProfile> = resolveDomainOwnerAnswerProjectionProfiles(),
) {
  const entries = profiles.map((profile) => {
    const projectionRole = profileProjectionRole(profile);
    return {
      profile_id: profile.profileId,
      profile_role: profile.profileRole,
      projection_role: projectionRole,
      domain_id: profile.domainId,
      binding_project_id: profile.bindingProjectId,
      source_owner: profile.sourceOwner,
      compatibility_projection: profile.profileRole === 'compatibility',
      studies_dir_name: profile.studiesDirName,
      projection_relative_path: profile.projectionRelativePath,
    };
  });
  return {
    surface_kind: OWNER_ANSWER_PROJECTION_REGISTRY_READBACK_SURFACE_KIND,
    version: 'owner-answer-projection-profile-registry-readback.v1',
    registry_surface_kind: OWNER_ANSWER_PROJECTION_REGISTRY_SURFACE_KIND,
    registry_role: 'generic_domain_owner_answer_projection_profile_registry',
    projection_policy: OWNER_ANSWER_PROJECTION_POLICY,
    profile_count: entries.length,
    compatibility_profile_count: entries.filter((entry) => entry.profile_role === 'compatibility').length,
    domain_profile_count: entries.filter((entry) => entry.profile_role === 'registry').length,
    profiles: entries,
    authority_boundary: {
      surface_kind: 'opl_domain_owner_answer_projection_registry_authority_boundary',
      registry_surface_kind: OWNER_ANSWER_PROJECTION_REGISTRY_SURFACE_KIND,
      refs_only: true,
      consumer_owner: 'one-person-lab',
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      can_claim_domain_ready: false,
      can_claim_production_ready: false,
    },
  };
}

function profileProjectionRole(profile: OwnerAnswerProjectionProfile) {
  return profile.profileRole === 'compatibility'
    ? 'compatibility_projection'
    : 'domain_profile_projection';
}

function readJsonRecord(filePath: string) {
  try {
    const parsed = readJsonPayloadFile(filePath);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function workspaceRootFromProfileRef(profileRef: string | null, profile: OwnerAnswerProjectionProfile) {
  if (!profileRef || !profile.workspaceRootProfileRef) {
    return null;
  }
  const expected = profile.workspaceRootProfileRef;
  const profileDir = path.dirname(profileRef);
  const domainDir = path.dirname(profileDir);
  const opsDir = path.dirname(domainDir);
  return path.basename(profileDir) === expected.profileDirName
    && path.basename(domainDir) === expected.domainDirName
    && path.basename(opsDir) === expected.opsDirName
    ? path.dirname(opsDir)
    : null;
}

function workspaceRootCandidates(profile: OwnerAnswerProjectionProfile) {
  const binding = getActiveWorkspaceBinding(profile.bindingProjectId);
  const locator = binding?.direct_entry.workspace_locator;
  const workspaceRoot = stringValue(locator?.workspace_root) ?? stringValue(binding?.workspace_path);
  const profileRef = stringValue(locator?.profile_ref);
  return [...new Set([
    workspaceRootFromProfileRef(profileRef, profile),
    workspaceRoot,
  ].filter((entry): entry is string => Boolean(entry)))];
}

function immediateStudyRoots(workspaceRoot: string, profile: OwnerAnswerProjectionProfile) {
  const studiesDir = path.join(workspaceRoot, profile.studiesDirName);
  try {
    return fs.readdirSync(studiesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(studiesDir, entry.name))
      .sort();
  } catch {
    return [];
  }
}

function projectionPath(studyRoot: string, profile: OwnerAnswerProjectionProfile) {
  return path.join(studyRoot, ...profile.projectionRelativePath);
}

function bindingMatchesReceipt(
  projection: JsonRecord,
  receipt: StageRunExecutionAuthorizationReceipt,
) {
  const closeoutBinding = record(projection.closeout_binding);
  return closeoutBinding.trusted_opl_execution_authorization === true
    && stringValue(closeoutBinding.provider_attempt_ref) === receipt.provider_attempt_ref
    && stringValue(closeoutBinding.attempt_lease_ref) === receipt.attempt_lease_ref
    && stringValue(closeoutBinding.attempt_lease_status) === receipt.attempt_lease_status
    && stringValue(closeoutBinding.execution_authorization_decision_ref)
      === receipt.execution_authorization_decision_ref
    && stringValue(closeoutBinding.source_fingerprint) === receipt.source_fingerprint
    && stringValue(closeoutBinding.idempotency_key) === receipt.idempotency_key;
}

export function findOwnerAnswerProjection(input: {
  receipt: StageRunExecutionAuthorizationReceipt | null;
  profiles?: ReadonlyArray<OwnerAnswerProjectionProfile>;
  repoInputs?: readonly StandardDomainAgentRepoInput[];
}) {
  if (!input.receipt) {
    return null;
  }
  const profiles = input.profiles ?? resolveDomainOwnerAnswerProjectionProfiles(input.repoInputs);
  const profile = profiles.find((entry) => entry.domainId === input.receipt?.domain_id);
  if (!profile) {
    return null;
  }
  for (const workspaceRoot of workspaceRootCandidates(profile)) {
    for (const studyRoot of immediateStudyRoots(workspaceRoot, profile)) {
      const filePath = projectionPath(studyRoot, profile);
      const projection = readJsonRecord(filePath);
      if (!projection || !bindingMatchesReceipt(projection, input.receipt)) {
        continue;
      }
      const projectionRole = profileProjectionRole(profile);
      return {
        surface_kind: OWNER_ANSWER_PROJECTION_MATCH_SURFACE_KIND,
        projection_registry: OWNER_ANSWER_PROJECTION_REGISTRY_SURFACE_KIND,
        projection_policy: OWNER_ANSWER_PROJECTION_POLICY,
        profile_id: profile.profileId,
        profile_role: profile.profileRole,
        projection_role: projectionRole,
        domain_profile: {
          profile_id: profile.profileId,
          profile_role: profile.profileRole,
          projection_role: projectionRole,
          domain_id: profile.domainId,
          source_owner: profile.sourceOwner,
          compatibility_projection: profile.profileRole === 'compatibility',
        },
        projection,
        projection_ref: filePath,
        workspace_root: workspaceRoot,
        study_id: path.basename(studyRoot),
        authority_boundary: {
          surface_kind: 'opl_domain_owner_answer_projection_authority_boundary',
          projection_registry: OWNER_ANSWER_PROJECTION_REGISTRY_SURFACE_KIND,
          projection_role: projectionRole,
          profile_id: profile.profileId,
          profile_role: profile.profileRole,
          domain_id: profile.domainId,
          compatibility_projection: profile.profileRole === 'compatibility',
          refs_only: true,
          source_owner: profile.sourceOwner,
          consumer_owner: 'one-person-lab',
          can_write_domain_truth: false,
          can_create_owner_receipt: false,
          can_create_typed_blocker: false,
          can_claim_domain_ready: false,
          can_claim_production_ready: false,
        },
      };
    }
  }
  return null;
}

import fs from 'node:fs';
import path from 'node:path';

import { isRecord } from '../../kernel/contract-validation.ts';
import { readJsonPayloadFile } from '../../kernel/json-file.ts';
import { record, stringValue } from '../../kernel/json-record.ts';
import type {
  StageRunExecutionAuthorizationReceipt,
} from './stage-run-execution-authorization-ledger.ts';
import { getActiveWorkspaceBinding } from '../workspace/index.ts';

type JsonRecord = Record<string, unknown>;

export type OwnerAnswerProjectionProfile = {
  domainId: string;
  bindingProjectId: string;
  sourceOwner: string;
  workspaceRootProfileRef?: {
    profileDirName: string;
    domainDirName: string;
    opsDirName: string;
  };
  studiesDirName: string;
  projectionRelativePath: string[];
};

export const MEDAUTOSCIENCE_PUBLICATION_HANDOFF_OWNER_ANSWER_PROFILE: OwnerAnswerProjectionProfile = {
  domainId: 'medautoscience',
  bindingProjectId: 'medautoscience',
  sourceOwner: 'medautoscience',
  workspaceRootProfileRef: {
    profileDirName: 'profiles',
    domainDirName: 'medautoscience',
    opsDirName: 'ops',
  },
  studiesDirName: 'studies',
  projectionRelativePath: [
    'artifacts',
    'stage_outputs',
    '08-publication_package_handoff',
    'projection',
    'current_owner_delta.json',
  ],
};

const DEFAULT_OWNER_ANSWER_PROJECTION_PROFILES = [
  MEDAUTOSCIENCE_PUBLICATION_HANDOFF_OWNER_ANSWER_PROFILE,
] as const;

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

export function findMasPublicationHandoffOwnerAnswerProjection(input: {
  receipt: StageRunExecutionAuthorizationReceipt | null;
}) {
  return findOwnerAnswerProjection({
    ...input,
    profiles: [MEDAUTOSCIENCE_PUBLICATION_HANDOFF_OWNER_ANSWER_PROFILE],
  });
}

export function findOwnerAnswerProjection(input: {
  receipt: StageRunExecutionAuthorizationReceipt | null;
  profiles?: ReadonlyArray<OwnerAnswerProjectionProfile>;
}) {
  if (!input.receipt) {
    return null;
  }
  const profiles = input.profiles ?? DEFAULT_OWNER_ANSWER_PROJECTION_PROFILES;
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
      return {
        projection,
        projection_ref: filePath,
        workspace_root: workspaceRoot,
        study_id: path.basename(studyRoot),
        authority_boundary: {
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

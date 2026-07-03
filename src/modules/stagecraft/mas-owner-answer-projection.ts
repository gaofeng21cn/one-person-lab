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

function readJsonRecord(filePath: string) {
  try {
    const parsed = readJsonPayloadFile(filePath);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function workspaceRootFromProfileRef(profileRef: string | null) {
  if (!profileRef) {
    return null;
  }
  const profileDir = path.dirname(profileRef);
  const medAutoScienceDir = path.dirname(profileDir);
  const opsDir = path.dirname(medAutoScienceDir);
  return path.basename(profileDir) === 'profiles'
    && path.basename(medAutoScienceDir) === 'medautoscience'
    && path.basename(opsDir) === 'ops'
    ? path.dirname(opsDir)
    : null;
}

function workspaceRootCandidates() {
  const binding = getActiveWorkspaceBinding('medautoscience');
  const locator = binding?.direct_entry.workspace_locator;
  const workspaceRoot = stringValue(locator?.workspace_root) ?? stringValue(binding?.workspace_path);
  const profileRef = stringValue(locator?.profile_ref);
  return [...new Set([
    workspaceRootFromProfileRef(profileRef),
    workspaceRoot,
  ].filter((entry): entry is string => Boolean(entry)))];
}

function immediateStudyRoots(workspaceRoot: string) {
  const studiesDir = path.join(workspaceRoot, 'studies');
  try {
    return fs.readdirSync(studiesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(studiesDir, entry.name))
      .sort();
  } catch {
    return [];
  }
}

function projectionPath(studyRoot: string) {
  return path.join(
    studyRoot,
    'artifacts',
    'stage_outputs',
    '08-publication_package_handoff',
    'projection',
    'current_owner_delta.json',
  );
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
  if (!input.receipt || input.receipt.domain_id !== 'medautoscience') {
    return null;
  }
  for (const workspaceRoot of workspaceRootCandidates()) {
    for (const studyRoot of immediateStudyRoots(workspaceRoot)) {
      const filePath = projectionPath(studyRoot);
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
          source_owner: 'medautoscience',
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

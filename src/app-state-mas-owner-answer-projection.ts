import fs from 'node:fs';
import path from 'node:path';

import type {
  StageRunExecutionAuthorizationReceipt,
} from './stage-run-execution-authorization-ledger.ts';
import { getActiveWorkspaceBinding } from './workspace-registry.ts';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readJsonRecord(filePath: string) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
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
  const workspaceRoot = text(locator?.workspace_root) ?? text(binding?.workspace_path);
  const profileRef = text(locator?.profile_ref);
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
    && text(closeoutBinding.provider_attempt_ref) === receipt.provider_attempt_ref
    && text(closeoutBinding.attempt_lease_ref) === receipt.attempt_lease_ref
    && text(closeoutBinding.attempt_lease_status) === receipt.attempt_lease_status
    && text(closeoutBinding.execution_authorization_decision_ref)
      === receipt.execution_authorization_decision_ref
    && text(closeoutBinding.source_fingerprint) === receipt.source_fingerprint
    && text(closeoutBinding.idempotency_key) === receipt.idempotency_key;
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

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { formatJsonPayload, parseJsonText } from '../../kernel/json-file.ts';
import {
  assertExecutableWorkOrder,
  missingOmaTargetAgentWorkOrderGuardFields,
} from './agent-lab-work-order-execution/admission.ts';

export const WORK_ORDER_MATERIALIZATION_REQUEST_SCHEMA_REF =
  'contracts/opl-framework/work-order-materialization-request.schema.json';
export const DEVELOPER_PATCH_WORK_ORDER_SCHEMA_REF =
  'contracts/opl-framework/developer-patch-work-order.schema.json';
export const WORK_ORDER_OWNER_CLOSEOUT_RECEIPT_SCHEMA_REF =
  'contracts/opl-framework/work-order-owner-closeout-receipt.schema.json';
export const WORK_ORDER_MATERIALIZATION_RECEIPT_SCHEMA_REF =
  'contracts/opl-framework/work-order-materialization-receipt.schema.json';

type JsonRecord = Record<string, unknown>;

export type WorkOrderMaterializationInput = {
  requestPath: string;
  targetDir: string;
};

function fail(message: string, details: JsonRecord = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, details);
}

function requireObject(value: unknown, field: string): JsonRecord {
  if (!isRecord(value)) fail(`${field} must be a JSON object.`, { field });
  return value;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail(`${field} must be a non-empty string.`, { field });
  }
  return value;
}

function requireStringList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((entry) => (
    typeof entry !== 'string' || entry.trim().length === 0
  ))) {
    fail(`${field} must be a non-empty string array.`, { field });
  }
  const values = value as string[];
  if (new Set(values).size !== values.length) {
    fail(`${field} must not contain duplicate entries.`, { field });
  }
  return values;
}

function sha256(bytes: string | Buffer): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function readRequest(requestPath: string) {
  const resolved = path.resolve(requestPath);
  let raw: string;
  try {
    raw = fs.readFileSync(resolved, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new FrameworkContractError(
        'contract_file_missing',
        `Work-order materialization request is missing: ${resolved}.`,
        { request: resolved },
      );
    }
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = parseJsonText(raw);
  } catch (error) {
    throw new FrameworkContractError(
      'contract_json_invalid',
      'Work-order materialization request contains invalid JSON.',
      { request: resolved, cause: error instanceof Error ? error.message : String(error) },
    );
  }
  return { path: resolved, raw, value: requireObject(parsed, 'request') };
}

function validateHeader(request: JsonRecord): void {
  const expected = {
    surface_kind: 'opl_work_order_materialization_request',
    version: 'opl-work-order-materialization-request.v1',
    canonical_schema_ref: WORK_ORDER_MATERIALIZATION_REQUEST_SCHEMA_REF,
    execution_owner: 'one-person-lab/OPL Foundry Lab',
  };
  for (const [field, expectedValue] of Object.entries(expected)) {
    if (request[field] !== expectedValue) {
      fail(`Work-order materialization request ${field} is invalid.`, { field, expected: expectedValue });
    }
  }
  requireString(request.request_owner, 'request_owner');
  const boundary = requireObject(request.authority_boundary, 'authority_boundary');
  const expectedBoundary = {
    request_contains_semantics_and_refs_only: true,
    request_can_write_target_files: false,
    request_can_sign_owner_receipt: false,
    opl_owns_work_order_materialization: true,
    opl_owns_materialization_receipt: true,
    opl_can_write_target_domain_truth: false,
    opl_can_sign_target_owner_receipt: false,
    target_owner_closeout_required: true,
  };
  for (const [field, expectedValue] of Object.entries(expectedBoundary)) {
    if (boundary[field] !== expectedValue) {
      fail(`authority_boundary.${field} is invalid.`, { field, expected: expectedValue });
    }
  }
  const unsupported = Object.keys(boundary).filter((field) => !Object.hasOwn(expectedBoundary, field));
  if (unsupported.length > 0) {
    fail('authority_boundary contains unsupported fields.', { unsupported_fields: unsupported });
  }
}

function buildExecutableWorkOrder(request: JsonRecord): JsonRecord {
  validateHeader(request);
  const targetAgent = requireObject(request.target_agent, 'target_agent');
  const domainId = requireString(targetAgent.domain_id, 'target_agent.domain_id');
  const repoDir = requireString(targetAgent.repo_dir, 'target_agent.repo_dir');
  const semantic = requireObject(request.semantic_request, 'semantic_request');
  const workOrderId = requireString(semantic.work_order_id, 'semantic_request.work_order_id');
  const sourceEvidenceRefs = requireStringList(
    semantic.source_evidence_refs,
    'semantic_request.source_evidence_refs',
  );
  const targetedFix = requireStringList(semantic.targeted_fix, 'semantic_request.targeted_fix');
  const allowedEditableSurfaces = requireStringList(
    semantic.allowed_editable_surfaces,
    'semantic_request.allowed_editable_surfaces',
  );
  const targetRepoFileHints = requireStringList(
    semantic.target_repo_file_hints,
    'semantic_request.target_repo_file_hints',
  );
  const requiredVerificationRefs = requireStringList(
    semantic.required_verification_refs,
    'semantic_request.required_verification_refs',
  );
  const forbiddenTargetSurfaces = requireStringList(
    semantic.forbidden_target_surfaces,
    'semantic_request.forbidden_target_surfaces',
  );
  const ownerRouteRefs = requireStringList(semantic.owner_route_refs, 'semantic_request.owner_route_refs');
  const noForbiddenWriteProofRefs = requireStringList(
    semantic.no_forbidden_write_proof_refs,
    'semantic_request.no_forbidden_write_proof_refs',
  );
  const ownerCloseout = requireObject(semantic.target_owner_closeout, 'semantic_request.target_owner_closeout');
  const closeoutOwner = requireString(ownerCloseout.owner, 'semantic_request.target_owner_closeout.owner');
  const acceptedReturnShapes = requireStringList(
    ownerCloseout.accepted_return_shapes,
    'semantic_request.target_owner_closeout.accepted_return_shapes',
  );
  const allowedReturnShapes = new Set(['domain_receipt', 'typed_blocker', 'no_regression_evidence']);
  if (acceptedReturnShapes.some((shape) => !allowedReturnShapes.has(shape))) {
    fail('semantic_request.target_owner_closeout.accepted_return_shapes contains an unsupported shape.', {
      accepted_return_shapes: acceptedReturnShapes,
    });
  }

  const targetRuntimeConsumptionRef = requireString(
    semantic.target_runtime_read_model_consumption_ref,
    'semantic_request.target_runtime_read_model_consumption_ref',
  );
  const sourceMorphologyProofRef = requireString(
    semantic.source_morphology_proof_ref,
    'semantic_request.source_morphology_proof_ref',
  );
  const privateResidueDecisionRef = requireString(
    semantic.private_residue_decision_ref,
    'semantic_request.private_residue_decision_ref',
  );
  const materializationReceiptRef = `work-order-materialization-receipt:${domainId}/${workOrderId}`;
  const ownerAnswerRef = `target-owner-receipt-or-typed-blocker:${domainId}/${workOrderId}`;

  const workOrder = {
    surface_kind: 'opl_developer_patch_work_order',
    version: 'opl.developer-patch-work-order.v1',
    canonical_schema_ref: DEVELOPER_PATCH_WORK_ORDER_SCHEMA_REF,
    canonical_closeout_receipt_schema_ref: WORK_ORDER_OWNER_CLOSEOUT_RECEIPT_SCHEMA_REF,
    materialization_receipt_ref: materializationReceiptRef,
    request_owner: request.request_owner,
    materialization_owner: 'one-person-lab/OPL Foundry Lab',
    work_order_id: workOrderId,
    status: 'ready_for_target_agent_source_patch',
    target_agent: { domain_id: domainId, repo_dir: path.resolve(repoDir) },
    source_agent_lab_result_ref: sourceEvidenceRefs[0],
    source_evidence_refs: sourceEvidenceRefs,
    executor_lease_ref: `executor-lease:codex-cli/${workOrderId}`,
    patch_execution_bundle_ref: `patch-execution-bundle:target-agent/${domainId}/${workOrderId}`,
    allowed_editable_surfaces: allowedEditableSurfaces,
    target_repo_file_hints: targetRepoFileHints,
    required_verification_refs: requiredVerificationRefs,
    owner_route_refs: ownerRouteRefs,
    source_morphology_proof_ref: sourceMorphologyProofRef,
    private_residue_decision_ref: privateResidueDecisionRef,
    ahe_developer_work_order: {
      failure_evidence: sourceEvidenceRefs,
      root_cause: requireString(semantic.root_cause, 'semantic_request.root_cause'),
      targeted_fix: targetedFix,
      predicted_impact: requireString(semantic.predicted_impact, 'semantic_request.predicted_impact'),
    },
    no_forbidden_write_proof: {
      required: true,
      proof_refs: noForbiddenWriteProofRefs,
      can_write_target_domain_truth: false,
      can_write_target_domain_memory_body: false,
      can_mutate_target_domain_artifact_body: false,
      can_authorize_target_domain_quality_or_export: false,
    },
    machine_closeout_refs: {
      blocked_suite_result_ref: sourceEvidenceRefs[0],
      developer_patch_work_order_ref: `developer-patch-work-order:${domainId}/${workOrderId}`,
      patch_traceability_matrix_ref: `developer-patch-work-order:${domainId}/${workOrderId}#/patch_traceability_matrix`,
      target_repo_verification_refs: requiredVerificationRefs,
      target_runtime_read_model_consumption_ref: targetRuntimeConsumptionRef,
      workspace_environment_proof_ref: `workspace-environment-proof:${domainId}/${workOrderId}`,
      no_forbidden_write_proof_ref: noForbiddenWriteProofRefs[0],
      target_owner_receipt_or_typed_blocker_ref: ownerAnswerRef,
      patch_absorption_ref: `patch-absorption:${domainId}/${workOrderId}`,
      worktree_cleanup_ref: `worktree-cleanup:${domainId}/${workOrderId}`,
      agent_lab_re_evaluation_ref: `agent-lab-re-evaluation:${domainId}/${workOrderId}`,
    },
    owner_closeout_boundary: {
      owner: closeoutOwner,
      accepted_return_shapes: acceptedReturnShapes,
      canonical_receipt_schema_ref: WORK_ORDER_OWNER_CLOSEOUT_RECEIPT_SCHEMA_REF,
      target_owner_acceptance_required: true,
      opl_can_sign_target_owner_receipt: false,
      opl_can_create_target_typed_blocker: false,
    },
    implementation_controls: {
      source_patch_required: true,
      patch_must_be_limited_to_traceable_surfaces: true,
      no_target_domain_truth_write_proof_required: true,
      forbidden_target_paths_or_surfaces: forbiddenTargetSurfaces,
    },
    authority_boundary: {
      can_write_target_domain_truth: false,
      can_write_target_domain_memory_body: false,
      can_mutate_target_domain_artifact_body: false,
      can_authorize_target_domain_quality_or_export: false,
      can_sign_target_owner_receipt: false,
      can_create_target_typed_blocker: false,
    },
  } satisfies JsonRecord;
  assertExecutableWorkOrder(workOrder);
  return workOrder;
}

type MaterializedSemanticFile = {
  fileName: string;
  role: string;
  schemaRef: string | null;
  value: JsonRecord;
};

function safeFileName(value: unknown, field: string): string {
  const fileName = requireString(value, field);
  if (path.basename(fileName) !== fileName || !fileName.endsWith('.json')) {
    fail(`${field} must be a JSON file name without directory segments.`, { field, file_name: fileName });
  }
  return fileName;
}

function schemaRef(value: JsonRecord): string | null {
  return typeof value.canonical_schema_ref === 'string' && value.canonical_schema_ref.length > 0
    ? value.canonical_schema_ref
    : typeof value.schema_ref === 'string' && value.schema_ref.length > 0
      ? value.schema_ref
      : null;
}

function executableWorkOrderFromSemanticEnvelope(candidate: JsonRecord, requestOwner: string): JsonRecord {
  const workOrderId = requireString(candidate.work_order_id, 'semantic_requests.developer_patch_work_order.work_order_id');
  const targetAgent = requireObject(candidate.target_agent, 'semantic_requests.developer_patch_work_order.target_agent');
  const domainId = requireString(targetAgent.domain_id, 'semantic_requests.developer_patch_work_order.target_agent.domain_id');
  const workOrder = {
    ...candidate,
    producer_surface_kind: candidate.surface_kind ?? null,
    producer_version: candidate.version ?? null,
    surface_kind: 'opl_developer_patch_work_order',
    version: 'opl.developer-patch-work-order.v1',
    canonical_schema_ref: DEVELOPER_PATCH_WORK_ORDER_SCHEMA_REF,
    canonical_closeout_receipt_schema_ref: WORK_ORDER_OWNER_CLOSEOUT_RECEIPT_SCHEMA_REF,
    materialization_receipt_ref: `work-order-materialization-receipt:${domainId}/${workOrderId}`,
    request_owner: requestOwner,
    materialization_owner: 'one-person-lab/OPL Foundry Lab',
    authority_boundary: {
      ...(isRecord(candidate.authority_boundary) ? candidate.authority_boundary : {}),
      can_write_target_domain_truth: false,
      can_write_target_domain_memory_body: false,
      can_mutate_target_domain_artifact_body: false,
      can_authorize_target_domain_quality_or_export: false,
      can_sign_target_owner_receipt: false,
      can_create_target_typed_blocker: false,
    },
  };
  assertExecutableWorkOrder(workOrder);
  const missingGuardFields = missingOmaTargetAgentWorkOrderGuardFields(workOrder);
  if (missingGuardFields.length > 0) {
    fail('semantic_requests.developer_patch_work_order is missing executable guard evidence.', {
      missing_guard_fields: missingGuardFields,
    });
  }
  return workOrder;
}

function semanticEnvelopeFiles(request: JsonRecord): MaterializedSemanticFile[] | null {
  const semanticRequests = isRecord(request.semantic_requests) ? request.semantic_requests : null;
  if (!semanticRequests) return null;
  if (semanticRequests.physical_materialization_owner !== 'one-person-lab/OPL Foundry Lab'
    || semanticRequests.oma_writes_request_files !== false) {
    fail('semantic_requests must delegate physical materialization to OPL Foundry Lab.', {
      physical_materialization_owner: semanticRequests.physical_materialization_owner,
      oma_writes_request_files: semanticRequests.oma_writes_request_files,
    });
  }
  const requestOwner = typeof request.product_id === 'string' && request.product_id.length > 0
    ? request.product_id
    : 'opl-meta-agent';
  if (isRecord(semanticRequests.developer_patch_work_order)) {
    if (semanticRequests.requested_file_name !== 'developer-patch-work-order.json'
      || semanticRequests.execution_surface !== 'opl work-order execute --work-order <developer-patch-work-order.json>') {
      fail('developer patch semantic request must declare the canonical file and execution surface.');
    }
    return [{
      fileName: 'developer-patch-work-order.json',
      role: 'canonical_executable_work_order',
      schemaRef: DEVELOPER_PATCH_WORK_ORDER_SCHEMA_REF,
      value: executableWorkOrderFromSemanticEnvelope(semanticRequests.developer_patch_work_order, requestOwner),
    }];
  }

  const requestedFileNames = requireObject(
    semanticRequests.requested_file_names,
    'semantic_requests.requested_file_names',
  );
  const judgment = requireObject(request.agent_building_judgment, 'agent_building_judgment');
  const declarations: Array<{
    key: string;
    role: string;
    source: unknown;
  }> = [
    { key: 'foundry_evaluation_request', role: 'foundry_evaluation_request', source: semanticRequests.foundry_evaluation_request },
    { key: 'owner_receipt_refs', role: 'owner_receipt_refs', source: semanticRequests.owner_receipt_refs },
    {
      key: 'target_capability_improvement_candidate',
      role: 'target_capability_improvement_candidate',
      source: judgment.target_capability_improvement_candidate,
    },
    { key: 'foundry_lab_work_order', role: 'foundry_lab_work_order', source: semanticRequests.foundry_lab_work_order },
  ];
  const files = declarations.map(({ key, role, source }) => {
    const value = requireObject(source, key === 'target_capability_improvement_candidate'
      ? `agent_building_judgment.${key}`
      : `semantic_requests.${key}`);
    return {
      fileName: safeFileName(requestedFileNames[key], `semantic_requests.requested_file_names.${key}`),
      role,
      schemaRef: schemaRef(value),
      value,
    };
  });
  if (new Set(files.map((entry) => entry.fileName)).size !== files.length) {
    fail('semantic_requests.requested_file_names must be unique.');
  }
  return files;
}

function materializationFiles(request: JsonRecord): MaterializedSemanticFile[] {
  const semanticFiles = semanticEnvelopeFiles(request);
  if (semanticFiles) return semanticFiles;
  const workOrder = buildExecutableWorkOrder(request);
  return [{
    fileName: 'developer-patch-work-order.json',
    role: 'canonical_executable_work_order',
    schemaRef: DEVELOPER_PATCH_WORK_ORDER_SCHEMA_REF,
    value: workOrder,
  }];
}

function assertNewTargetDirectory(targetDir: string): { target: string; parent: string } {
  const target = path.resolve(targetDir);
  if (fs.existsSync(target)) {
    fail('Work-order materialization target directory must not already exist.', { target_dir: target });
  }
  return { target, parent: path.dirname(target) };
}

export function materializeWorkOrderRequest(input: WorkOrderMaterializationInput) {
  const request = readRequest(input.requestPath);
  const files = materializationFiles(request.value);
  const destination = assertNewTargetDirectory(input.targetDir);
  const materializedFiles = files.map((file) => {
    const bytes = Buffer.from(formatJsonPayload(file.value));
    return { ...file, bytes, sha256: sha256(bytes) };
  });
  const executableWorkOrder = files.find((file) => file.role === 'canonical_executable_work_order')?.value ?? null;
  const foundryWorkOrder = files.find((file) => file.role === 'foundry_lab_work_order')?.value ?? null;
  const workOrder = executableWorkOrder ?? foundryWorkOrder;
  if (!workOrder) fail('Materialization request did not contain a work order.');
  const workOrderId = requireString(workOrder.work_order_id, 'work_order.work_order_id');
  const workOrderFile = materializedFiles.find((file) => (
    file.role === 'canonical_executable_work_order' || file.role === 'foundry_lab_work_order'
  ));
  if (!workOrderFile) fail('Materialization request did not resolve a work-order file.');
  const receipt = {
    surface_kind: 'opl_work_order_materialization_receipt',
    version: 'opl.work-order-materialization-receipt.v1',
    canonical_schema_ref: WORK_ORDER_MATERIALIZATION_RECEIPT_SCHEMA_REF,
    status: 'materialized',
    work_order_id: workOrderId,
    request_ref: request.path,
    request_sha256: sha256(request.raw),
    target_dir: destination.target,
    materialized_files: materializedFiles.map((file) => ({
      path: file.fileName,
      role: file.role,
      schema_ref: file.schemaRef,
      sha256: file.sha256,
    })),
    work_order_ref: typeof workOrder.work_order_id === 'string'
      ? `work-order:${workOrder.work_order_id}`
      : null,
    work_order_path: workOrderFile.fileName,
    closeout_receipt_schema_ref: WORK_ORDER_OWNER_CLOSEOUT_RECEIPT_SCHEMA_REF,
    execution_command: 'opl work-order execute --work-order <target-dir>/developer-patch-work-order.json',
    authority_boundary: {
      receipt_proves_materialization_only: true,
      receipt_can_claim_patch_execution: false,
      receipt_can_claim_target_owner_closeout: false,
      receipt_can_write_target_domain_truth: false,
      receipt_can_sign_target_owner_receipt: false,
    },
  };
  const receiptBytes = Buffer.from(formatJsonPayload(receipt));
  fs.mkdirSync(destination.parent, { recursive: true });
  const staging = path.join(
    destination.parent,
    `.${path.basename(destination.target)}.opl-${process.pid}-${crypto.randomUUID()}`,
  );
  try {
    fs.mkdirSync(staging, { mode: 0o700 });
    for (const file of materializedFiles) {
      fs.writeFileSync(path.join(staging, file.fileName), file.bytes, { flag: 'wx' });
    }
    fs.writeFileSync(path.join(staging, 'work-order-materialization-receipt.json'), receiptBytes, { flag: 'wx' });
    fs.renameSync(staging, destination.target);
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw error;
  }
  return {
    version: 'g2',
    work_order_materialization: {
      surface_id: 'opl_work_order_request_materialization',
      status: 'materialized',
      target_dir: destination.target,
      work_order_path: path.join(destination.target, workOrderFile.fileName),
      materialization_receipt_path: path.join(destination.target, 'work-order-materialization-receipt.json'),
      receipt,
    },
  };
}

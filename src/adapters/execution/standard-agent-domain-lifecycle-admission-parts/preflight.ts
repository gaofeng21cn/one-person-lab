import fs from 'node:fs';

import { canonicalJsonBytes } from '../../../kernel/canonical-json.ts';
import { isRecord } from '../../../kernel/contract-validation.ts';
import type { FamilyActionCatalogAction } from '../../../kernel/family-action-catalog-contract.ts';
import { resolveOplStatePaths } from '../../../kernel/runtime-state-paths.ts';
import {
  DOMAIN_ARTIFACT_CAS_CAPABILITY_ID,
  domainArtifactCasMaterializationInProgress,
} from '../domain-artifact-cas-materialization.ts';
import { parseStandardAgentLifecycleAdmission, standardAgentLifecycleAdmissionContract } from './contract.ts';
import {
  blocked,
  digest,
  exactAuthorityFile,
  integer,
  locateLifecycle,
  sha256,
  strings,
  text,
} from './shared.ts';
import type {
  ExactFile,
  ParsedStandardAgentLifecycleAdmission,
  StandardAgentLifecycleAdmissionContract,
} from './types.ts';

function validateInitializationAdmission(input: {
  admission: Extract<ParsedStandardAgentLifecycleAdmission, { mode: 'initialization_receipt' }>;
  contract: StandardAgentLifecycleAdmissionContract;
  workspaceRoot: string;
  domainId: string;
  materializationDomainId: string;
  actionId: string;
  runId: string;
  originalInvocationSha256: string;
  workItemId: string;
  lifecycle: ExactFile;
  lifecycleState: string;
  lifecycleGeneration: number;
}) {
  if (
    !input.contract.initialization_action_id
    || !input.contract.initialization_receipt_output_field
    || !input.contract.initialization_materialization_authorization_output_field
  ) blocked('Lifecycle initialization receipt was supplied without a declared initialization authority contract.');
  const authority = exactAuthorityFile(
    input.admission.domainAuthorityResultRef,
    input.workspaceRoot,
    'domain_authority_result_ref',
  );
  if (authority.sha256 !== input.admission.domainAuthorityResultSha256) {
    blocked('Domain initialization authority result bytes do not match lifecycle_admission.');
  }
  const stateRoot = resolveOplStatePaths().state_dir;
  fs.mkdirSync(stateRoot, { recursive: true });
  const materialization = exactAuthorityFile(
    input.admission.materializationReceiptRef,
    stateRoot,
    'materialization_receipt_ref',
  );
  if (materialization.sha256 !== input.admission.materializationReceiptSha256) {
    blocked('CAS initialization materialization receipt bytes do not match lifecycle_admission.');
  }
  const receipt = materialization.payload;
  if (
    receipt.surface_kind !== 'opl_domain_artifact_cas_materialization_receipt'
    || receipt.version !== 'opl-domain-artifact-cas-materialization-receipt.v1'
    || receipt.capability_id !== DOMAIN_ARTIFACT_CAS_CAPABILITY_ID
    || receipt.domain_id !== input.materializationDomainId
    || receipt.status !== 'materialized'
    || !isRecord(receipt.transaction)
    || receipt.transaction.journal_must_be_absent_for_admission !== true
  ) blocked('CAS initialization materialization receipt identity does not match the lifecycle-gated action.');
  const requestSha256 = digest(receipt.request_sha256, 'materialization_receipt.request_sha256');
  if (domainArtifactCasMaterializationInProgress({
    workspaceRoot: input.workspaceRoot,
    requestSha256,
  })) blocked('CAS initialization materialization transaction journal is still in progress.');
  const domainResult = isRecord(receipt.domain_authority_result) ? receipt.domain_authority_result : null;
  if (
    !domainResult
    || domainResult.action_id !== input.contract.initialization_action_id
    || domainResult.output_ref !== authority.ref
    || digest(domainResult.output_sha256, 'receipt.domain_authority_result.output_sha256') !== authority.sha256
  ) blocked('CAS initialization receipt does not bind the exact domain authority result.');
  const initialization = authority.payload[input.contract.initialization_receipt_output_field];
  const authorization = authority.payload[
    input.contract.initialization_materialization_authorization_output_field
  ];
  if (!isRecord(initialization) || !isRecord(authorization)) {
    blocked('Domain authority result is missing its initialization receipt or CAS authorization.');
  }
  const originalRef = text(
    initialization.original_admission_request_ref,
    'initialization_receipt.original_admission_request_ref',
  );
  const original = exactAuthorityFile(originalRef, input.workspaceRoot, 'original_admission_request_ref');
  const originalSha256 = digest(
    initialization.original_admission_request_sha256,
    'initialization_receipt.original_admission_request_sha256',
  );
  if (original.sha256 !== originalSha256) blocked('Initialization receipt original request digest is stale.');
  const expectedInvocationSha256 = digest(input.originalInvocationSha256, 'original_invocation_sha256');
  if (
    original.payload.canonical_domain_id !== input.domainId
    || original.payload.requested_action_id !== input.actionId
    || original.payload.requested_run_id !== input.runId
    || original.payload.work_item_id !== input.workItemId
    || original.payload.original_invocation_sha256 !== expectedInvocationSha256
    || initialization.requested_action_id !== input.actionId
    || initialization.requested_run_id !== input.runId
    || digest(
      initialization.original_invocation_sha256,
      'initialization_receipt.original_invocation_sha256',
    ) !== expectedInvocationSha256
  ) blocked('Initialization receipt is not scoped to this exact Stage invocation.');
  const expectedScopeId = `lifecycle-initialization:${sha256(canonicalJsonBytes({
    canonical_domain_id: input.domainId,
    requested_action_id: input.actionId,
    requested_run_id: input.runId,
    work_item_id: input.workItemId,
    original_invocation_sha256: expectedInvocationSha256,
    original_admission_request_sha256: originalSha256,
  }))}`;
  if (initialization.admission_scope_id !== expectedScopeId) {
    blocked('Initialization receipt admission_scope_id is stale or belongs to another Stage invocation.');
  }
  const authorityReceiptRef = text(initialization.receipt_ref, 'initialization_receipt.receipt_ref');
  const fromState = text(initialization.from_state, 'initialization_receipt.from_state');
  const fromGeneration = integer(initialization.from_generation, 'initialization_receipt.from_generation');
  const toState = text(initialization.to_state, 'initialization_receipt.to_state');
  const toGeneration = integer(initialization.to_generation, 'initialization_receipt.to_generation');
  if (
    initialization[input.contract.work_item_id_field] !== input.workItemId
    || fromState !== 'uninitialized'
    || fromGeneration !== 0
    || toState !== input.contract.active_state
    || toGeneration !== 1
    || input.lifecycleGeneration !== 1
    || digest(initialization.lifecycle_sha256, 'initialization_receipt.lifecycle_sha256') !== input.lifecycle.sha256
    || initialization.stage_body_authorized !== true
    || initialization.publication_authorized !== false
    || initialization.submission_authorized !== false
  ) blocked('Initialization receipt does not bind the generation-zero to generation-one active lifecycle.');
  if (
    authorization.authority_receipt_ref !== authorityReceiptRef
    || receipt.authority_receipt_ref !== authorityReceiptRef
    || authorization.authorization_ref !== receipt.authorization_ref
    || digest(authorization.operations_sha256, 'authorization.operations_sha256')
      !== digest(receipt.operations_sha256, 'materialization_receipt.operations_sha256')
  ) blocked('CAS authorization and materialization receipt do not preserve initialization authority lineage.');
  if (!Array.isArray(receipt.operations)) blocked('CAS initialization receipt operations are missing.');
  const lifecycleOperation = receipt.operations.find((operation) => (
    isRecord(operation) && operation.target_ref === input.lifecycle.ref
  ));
  if (
    !isRecord(lifecycleOperation)
    || digest(lifecycleOperation.after_sha256, 'materialization_receipt.operations[].after_sha256')
      !== input.lifecycle.sha256
    || lifecycleOperation.after_byte_size !== input.lifecycle.bytes.byteLength
  ) blocked('CAS initialization receipt does not bind the current canonical lifecycle bytes.');
  if (input.lifecycleState !== input.contract.active_state) {
    blocked('Initialization receipt exists but canonical domain lifecycle is still inactive.', {
      lifecycle_state: input.lifecycleState,
    });
  }
  return {
    status: 'admitted_by_current_initialization_receipt' as const,
    lifecycle_ref: input.lifecycle.ref,
    lifecycle_sha256: input.lifecycle.sha256,
    lifecycle_generation: input.lifecycleGeneration,
    initialization_receipt_ref: authorityReceiptRef,
    materialization_receipt_ref: materialization.ref,
    admission_scope_id: expectedScopeId,
  };
}

function validateMaterializedAdmission(input: {
  admission: Extract<ParsedStandardAgentLifecycleAdmission, { mode: 'materialized_receipt' }>;
  contract: StandardAgentLifecycleAdmissionContract;
  workspaceRoot: string;
  domainId: string;
  materializationDomainId: string;
  actionId: string;
  runId: string;
  originalInvocationSha256: string;
  workItemId: string;
  lifecycle: ExactFile;
  lifecycleState: string;
  lifecycleGeneration: number;
}) {
  const authority = exactAuthorityFile(
    input.admission.domainAuthorityResultRef,
    input.workspaceRoot,
    'domain_authority_result_ref',
  );
  if (authority.sha256 !== input.admission.domainAuthorityResultSha256) {
    blocked('Domain authority result bytes do not match lifecycle_admission.');
  }
  const stateRoot = resolveOplStatePaths().state_dir;
  fs.mkdirSync(stateRoot, { recursive: true });
  const materialization = exactAuthorityFile(
    input.admission.materializationReceiptRef,
    stateRoot,
    'materialization_receipt_ref',
  );
  if (materialization.sha256 !== input.admission.materializationReceiptSha256) {
    blocked('CAS materialization receipt bytes do not match lifecycle_admission.');
  }
  const receipt = materialization.payload;
  if (
    receipt.surface_kind !== 'opl_domain_artifact_cas_materialization_receipt'
    || receipt.version !== 'opl-domain-artifact-cas-materialization-receipt.v1'
    || receipt.capability_id !== DOMAIN_ARTIFACT_CAS_CAPABILITY_ID
    || receipt.domain_id !== input.materializationDomainId
    || receipt.status !== 'materialized'
    || !isRecord(receipt.transaction)
    || receipt.transaction.journal_must_be_absent_for_admission !== true
  ) blocked('CAS materialization receipt identity does not match the lifecycle-gated action.');
  const requestSha256 = digest(receipt.request_sha256, 'materialization_receipt.request_sha256');
  if (domainArtifactCasMaterializationInProgress({
    workspaceRoot: input.workspaceRoot,
    requestSha256,
  })) blocked('CAS materialization transaction journal is still in progress.');
  const domainResult = isRecord(receipt.domain_authority_result) ? receipt.domain_authority_result : null;
  if (
    !domainResult
    || domainResult.action_id !== input.contract.reactivation_action_id
    || domainResult.output_ref !== authority.ref
    || digest(domainResult.output_sha256, 'receipt.domain_authority_result.output_sha256') !== authority.sha256
  ) blocked('CAS materialization receipt does not bind the exact domain authority result.');
  const reactivation = authority.payload[input.contract.reactivation_receipt_output_field];
  const authorization = authority.payload[input.contract.materialization_authorization_output_field];
  if (!isRecord(reactivation) || !isRecord(authorization)) {
    blocked('Domain authority result is missing its reactivation receipt or CAS authorization.');
  }
  const originalRef = text(
    reactivation.original_admission_request_ref,
    'reactivation_receipt.original_admission_request_ref',
  );
  const original = exactAuthorityFile(originalRef, input.workspaceRoot, 'original_admission_request_ref');
  const originalSha256 = digest(
    reactivation.original_admission_request_sha256,
    'reactivation_receipt.original_admission_request_sha256',
  );
  if (original.sha256 !== originalSha256) blocked('Reactivation receipt original request digest is stale.');
  const expectedInvocationSha256 = digest(input.originalInvocationSha256, 'original_invocation_sha256');
  if (
    original.payload.canonical_domain_id !== input.domainId
    || original.payload.requested_action_id !== input.actionId
    || original.payload.requested_run_id !== input.runId
    || original.payload.work_item_id !== input.workItemId
    || original.payload.original_invocation_sha256 !== expectedInvocationSha256
    || reactivation.requested_action_id !== input.actionId
    || reactivation.requested_run_id !== input.runId
    || digest(
      reactivation.original_invocation_sha256,
      'reactivation_receipt.original_invocation_sha256',
    ) !== expectedInvocationSha256
  ) blocked('Reactivation receipt is not scoped to this exact Stage invocation.');
  const expectedScopeId = `lifecycle-admission:${sha256(canonicalJsonBytes({
    canonical_domain_id: input.domainId,
    requested_action_id: input.actionId,
    requested_run_id: input.runId,
    work_item_id: input.workItemId,
    original_invocation_sha256: expectedInvocationSha256,
    original_admission_request_sha256: originalSha256,
  }))}`;
  if (reactivation.admission_scope_id !== expectedScopeId) {
    blocked('Reactivation receipt admission_scope_id is stale or belongs to another Stage invocation.');
  }
  const originalAdmission = parseStandardAgentLifecycleAdmission(original.payload.lifecycle_admission);
  if (originalAdmission.mode !== 'reactivation_request') {
    blocked('Original lifecycle admission record does not contain a reactivation request.');
  }
  const request = originalAdmission.reactivationRequest;
  if (
    reactivation.user_authority_ref !== request.user_authority_ref
    || digest(reactivation.user_authority_sha256, 'reactivation_receipt.user_authority_sha256') !== request.user_authority_sha256
    || reactivation.reviewer_revision_intake_ref !== request.reviewer_revision_intake_ref
    || digest(
      reactivation.reviewer_revision_intake_sha256,
      'reactivation_receipt.reviewer_revision_intake_sha256',
    ) !== request.reviewer_revision_intake_sha256
    || reactivation.profile_ref !== request.profile_ref
    || digest(reactivation.profile_sha256, 'reactivation_receipt.profile_sha256') !== request.profile_sha256
  ) blocked('Reactivation receipt does not bind the exact user authority, revision intake, and profile refs.');
  const authorityReceiptRef = text(reactivation.receipt_ref, 'reactivation_receipt.receipt_ref');
  const satisfiedGateIds = strings(reactivation.satisfied_gate_ids, 'reactivation_receipt.satisfied_gate_ids');
  const fromState = text(reactivation.from_state, 'reactivation_receipt.from_state');
  const toState = text(reactivation.to_state, 'reactivation_receipt.to_state');
  const toGeneration = integer(reactivation.to_generation, 'reactivation_receipt.to_generation');
  if (
    reactivation[input.contract.work_item_id_field] !== input.workItemId
    || toState !== input.contract.active_state
    || toGeneration !== input.lifecycleGeneration
    || digest(reactivation.after_sha256, 'reactivation_receipt.after_sha256') !== input.lifecycle.sha256
    || !satisfiedGateIds.includes(input.contract.required_wakeup_gate_id)
  ) blocked('Reactivation receipt does not bind the current active lifecycle generation.');
  if (fromState === input.contract.stopped_state && !satisfiedGateIds.includes(input.contract.stopped_relaunch_gate_id)) {
    blocked('Stopped lifecycle reactivation is missing its additional relaunch gate.');
  }
  const receiptGateIds = strings(receipt.satisfied_gate_ids, 'materialization_receipt.satisfied_gate_ids');
  if (
    authorization.authority_receipt_ref !== authorityReceiptRef
    || receipt.authority_receipt_ref !== authorityReceiptRef
    || authorization.authorization_ref !== receipt.authorization_ref
    || JSON.stringify([...satisfiedGateIds].sort()) !== JSON.stringify([...receiptGateIds].sort())
  ) blocked('CAS authorization and materialization receipt do not preserve reactivation authority lineage.');
  if (!Array.isArray(receipt.operations)) blocked('CAS materialization receipt operations are missing.');
  const lifecycleOperation = receipt.operations.find((operation) => (
    isRecord(operation) && operation.target_ref === input.lifecycle.ref
  ));
  if (
    !isRecord(lifecycleOperation)
    || digest(lifecycleOperation.after_sha256, 'materialization_receipt.operations[].after_sha256') !== input.lifecycle.sha256
    || lifecycleOperation.after_byte_size !== input.lifecycle.bytes.byteLength
  ) blocked('CAS materialization receipt does not bind the current canonical lifecycle bytes.');
  if (input.lifecycleState !== input.contract.active_state) {
    blocked('Materialization receipt exists but canonical domain lifecycle is still inactive.', {
      lifecycle_state: input.lifecycleState,
    });
  }
  return {
    status: 'admitted_by_current_reactivation_receipt' as const,
    lifecycle_ref: input.lifecycle.ref,
    lifecycle_sha256: input.lifecycle.sha256,
    lifecycle_generation: input.lifecycleGeneration,
    reactivation_receipt_ref: authorityReceiptRef,
    materialization_receipt_ref: materialization.ref,
    admission_scope_id: expectedScopeId,
  };
}

function currentStandardAgentDomainLifecycle(input: {
  action: FamilyActionCatalogAction;
  payload: Record<string, unknown>;
  checkoutRoot: string;
  workspaceRoot: string;
}) {
  const contract = standardAgentLifecycleAdmissionContract(input.action);
  if (!contract) {
    return {
      contract: null,
      workItemId: null,
      lifecycle: null,
      lifecycleState: null,
      lifecycleGeneration: null,
    } as const;
  }
  const workItemId = text(input.payload[contract.work_item_id_field], contract.work_item_id_field);
  const located = locateLifecycle({
    checkoutRoot: input.checkoutRoot,
    workspaceRoot: input.workspaceRoot,
    workItemId,
  });
  const lifecycle = located.lifecycle;
  if (lifecycle.payload[contract.work_item_id_field] !== workItemId) {
    blocked('Canonical lifecycle identity does not match the requested work item.', { work_item_id: workItemId });
  }
  const lifecycleState = text(
    lifecycle.payload[contract.lifecycle_state_field],
    `lifecycle.${contract.lifecycle_state_field}`,
  );
  const lifecycleGeneration = integer(
    lifecycle.payload[contract.lifecycle_generation_field],
    `lifecycle.${contract.lifecycle_generation_field}`,
  );
  return { contract, workItemId, lifecycle, lifecycleState, lifecycleGeneration };
}

function activeLifecycleAdmission(input: ReturnType<typeof currentStandardAgentDomainLifecycle>) {
  if (!input.contract || !input.lifecycle || input.lifecycleGeneration === null) {
    blocked('Canonical domain lifecycle admission is not declared.');
  }
  return {
    status: 'admitted_by_canonical_active_lifecycle' as const,
    lifecycle_ref: input.lifecycle.ref,
    lifecycle_sha256: input.lifecycle.sha256,
    lifecycle_generation: input.lifecycleGeneration,
    reactivation_receipt_ref: null,
    materialization_receipt_ref: null,
    admission_scope_id: null,
  };
}

function assertOrdinaryLifecycleAuthority(input: ReturnType<typeof currentStandardAgentDomainLifecycle>) {
  if (!input.contract || !input.lifecycle) return;
  const lifecycle = input.lifecycle.payload;
  const boundary = isRecord(lifecycle.authority_boundary) ? lifecycle.authority_boundary : null;
  const forbidden = [
    'stage_body_authorized',
    'business_action_authorized',
  ].filter((field) => lifecycle[field] === false || boundary?.[field] === false);
  if (
    lifecycle.qualification_only === true
    || lifecycle.business_status === 'qualification_only'
    || forbidden.length > 0
  ) {
    blocked('Qualification-only lifecycle cannot authorize an ordinary Stage or business route.', {
      lifecycle_ref: input.lifecycle.ref,
      lifecycle_state: input.lifecycleState,
      qualification_only: lifecycle.qualification_only === true,
      business_status: lifecycle.business_status ?? null,
      explicitly_unauthorized_routes: forbidden,
    });
  }
}

function inactiveLifecycleBlocked(input: ReturnType<typeof currentStandardAgentDomainLifecycle>): never {
  if (!input.contract || !input.lifecycle || input.workItemId === null || input.lifecycleGeneration === null) {
    blocked('Canonical domain lifecycle admission is not declared.');
  }
  blocked('Canonical domain lifecycle is inactive and no current reactivation authority was supplied.', {
    work_item_id: input.workItemId,
    lifecycle_state: input.lifecycleState,
    lifecycle_generation: input.lifecycleGeneration,
    lifecycle_ref: input.lifecycle.ref,
  });
}

export function preflightStandardAgentDomainLifecycleAdmission(input: {
  action: FamilyActionCatalogAction;
  payload: Record<string, unknown>;
  checkoutRoot: string;
  workspaceRoot: string;
  domainId: string;
  materializationDomainId?: string;
  runId: string;
  originalInvocationSha256: string;
}) {
  const current = currentStandardAgentDomainLifecycle(input);
  const {
    contract,
    workItemId,
    lifecycle,
    lifecycleState,
    lifecycleGeneration,
  } = current;
  if (!contract) return { status: 'not_declared' as const };
  assertOrdinaryLifecycleAuthority(current);
  const admissionValue = input.payload[contract.admission_payload_field];
  if (lifecycleState === contract.active_state && admissionValue === undefined) {
    return activeLifecycleAdmission(current);
  }
  if (admissionValue !== undefined) {
    const admission = parseStandardAgentLifecycleAdmission(admissionValue);
    if (admission.mode === 'reactivation_request') {
      blocked('Reactivation request must be authority-evaluated and CAS-materialized before Stage admission.');
    }
    if (admission.mode === 'initialization_receipt') {
      return validateInitializationAdmission({
        admission,
        contract,
        workspaceRoot: input.workspaceRoot,
        domainId: input.domainId,
        materializationDomainId: input.materializationDomainId ?? input.domainId,
        actionId: input.action.action_id,
        runId: input.runId,
        originalInvocationSha256: input.originalInvocationSha256,
        workItemId,
        lifecycle,
        lifecycleState,
        lifecycleGeneration,
      });
    }
    return validateMaterializedAdmission({
      admission,
      contract,
      workspaceRoot: input.workspaceRoot,
      domainId: input.domainId,
      materializationDomainId: input.materializationDomainId ?? input.domainId,
      actionId: input.action.action_id,
      runId: input.runId,
      originalInvocationSha256: input.originalInvocationSha256,
      workItemId,
      lifecycle,
      lifecycleState,
      lifecycleGeneration,
    });
  }
  inactiveLifecycleBlocked(current);
}

export function preflightCanonicalActiveStandardAgentDomainLifecycle(input: {
  action: FamilyActionCatalogAction;
  payload: Record<string, unknown>;
  checkoutRoot: string;
  workspaceRoot: string;
}) {
  const current = currentStandardAgentDomainLifecycle(input);
  if (!current.contract) return { status: 'not_declared' as const };
  assertOrdinaryLifecycleAuthority(current);
  if (current.lifecycleState !== current.contract.active_state) inactiveLifecycleBlocked(current);
  return activeLifecycleAdmission(current);
}

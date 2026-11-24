import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { canonicalJsonBytes } from '../../../kernel/canonical-json.ts';
import { isRecord } from '../../../kernel/contract-validation.ts';
import type { FamilyActionCatalogAction } from '../../../kernel/family-action-catalog-contract.ts';
import { readStandardAgentDescriptorInterface } from '../../../kernel/standard-agent-interface.ts';
import { standardAgentLifecycleAdmissionContract } from './contract.ts';
import {
  blocked,
  digest,
  locateWorkItemIdentity,
  persistContentAddressedWorkspaceRecord,
  setJsonPointer,
  sha256,
  text,
} from './shared.ts';
import {
  INITIALIZATION_REQUEST_FIELD_MAP_KEYS,
  type PreparedStandardAgentLifecycleInitialization,
  type StandardAgentLifecycleInitializationBinding,
} from './types.ts';

export function standardAgentLifecycleInitializationHandlerRunId(input: {
  domainId: string;
  actionId: string;
  runId: string;
  workItemId: string;
  originalInvocationSha256: string;
}) {
  return `lifecycle_initialization_${sha256(canonicalJsonBytes({
    canonical_domain_id: input.domainId,
    requested_action_id: input.actionId,
    requested_run_id: input.runId,
    work_item_id: input.workItemId,
    original_invocation_sha256: digest(input.originalInvocationSha256, 'original_invocation_sha256'),
  }))}`;
}

export function prepareStandardAgentLifecycleInitialization(input: {
  action: FamilyActionCatalogAction;
  payload: Record<string, unknown>;
  checkoutRoot: string;
  workspaceRoot: string;
  domainId: string;
  runId: string;
  originalInvocationSha256: string;
}): PreparedStandardAgentLifecycleInitialization | null {
  const contract = standardAgentLifecycleAdmissionContract(input.action);
  if (
    !contract
    || !contract.initialization_action_id
    || !contract.initialization_receipt_output_field
    || !contract.initialization_materialization_authorization_output_field
    || !contract.initialization_request_input_field_map
    || input.payload[contract.admission_payload_field] !== undefined
  ) return null;
  const workItemId = text(input.payload[contract.work_item_id_field], contract.work_item_id_field);
  const located = locateWorkItemIdentity({
    checkoutRoot: input.checkoutRoot,
    workspaceRoot: input.workspaceRoot,
    workItemId,
  });
  const descriptor = readStandardAgentDescriptorInterface(input.checkoutRoot)!;
  const lifecycleField = descriptor.interface.inventory_projection!.field_map.lifecycle_ref;
  if (Object.hasOwn(located.inventoryItem, lifecycleField)) return null;

  const original = persistContentAddressedWorkspaceRecord({
    workspaceRoot: input.workspaceRoot,
    relativeDirectory: 'control/opl/lifecycle_initialization_requests/sha256',
    label: 'Original lifecycle initialization request',
    record: {
      surface_kind: 'opl_domain_lifecycle_initialization_request_record',
      version: 'opl-domain-lifecycle-initialization-request-record.v1',
      canonical_domain_id: input.domainId,
      requested_action_id: input.action.action_id,
      requested_run_id: input.runId,
      work_item_id: workItemId,
      original_invocation_sha256: digest(input.originalInvocationSha256, 'original_invocation_sha256'),
      inventory_ref: located.inventory.ref,
      inventory_sha256: located.inventory.sha256,
      inventory_item_index: located.inventoryItemIndex,
      initialization_reason: 'identity_only_work_item',
    },
  });
  const handlerRunId = standardAgentLifecycleInitializationHandlerRunId({
    domainId: input.domainId,
    actionId: input.action.action_id,
    runId: input.runId,
    workItemId,
    originalInvocationSha256: input.originalInvocationSha256,
  });
  const admissionScopeId = `lifecycle-initialization:${sha256(canonicalJsonBytes({
    canonical_domain_id: input.domainId,
    requested_action_id: input.action.action_id,
    requested_run_id: input.runId,
    work_item_id: workItemId,
    original_invocation_sha256: digest(input.originalInvocationSha256, 'original_invocation_sha256'),
    original_admission_request_sha256: original.sha256,
  }))}`;
  const ownerLedger = persistContentAddressedWorkspaceRecord({
    workspaceRoot: input.workspaceRoot,
    relativeDirectory: 'control/opl/lifecycle_admission_owner_ledger/sha256',
    label: 'Lifecycle initialization owner ledger entry',
    record: {
      surface_kind: 'opl_lifecycle_admission_owner_ledger_entry',
      version: 'opl-lifecycle-admission-owner-ledger-entry.v1',
      status: 'initialization_requested',
      canonical_domain_id: input.domainId,
      requested_action_id: input.action.action_id,
      requested_run_id: input.runId,
      work_item_id: workItemId,
      handler_action_id: contract.initialization_action_id,
      handler_run_id: handlerRunId,
      admission_scope_id: admissionScopeId,
      original_invocation_sha256: digest(input.originalInvocationSha256, 'original_invocation_sha256'),
      original_admission_request_ref: original.ref,
      original_admission_request_sha256: original.sha256,
      authority_boundary: {
        opl_role: 'host_invocation_provenance_ledger',
        domain_role: 'study_initialization_and_owner_receipt_authority',
        can_authorize_domain_lifecycle: false,
        can_replace_domain_owner_receipt: false,
      },
    },
  });
  const workspaceRoot = fs.realpathSync.native(input.workspaceRoot);
  const canonicalWorkItemRoot = fs.realpathSync.native(located.workItemRoot);
  const canonicalRelativeRoot = path.relative(workspaceRoot, canonicalWorkItemRoot).split(path.sep).join('/');
  const values: Record<typeof INITIALIZATION_REQUEST_FIELD_MAP_KEYS[number], unknown> = {
    authority_context: {
      action_id: contract.initialization_action_id,
      handler_call_ref: `opl://standard-agent-action-run/${encodeURIComponent(handlerRunId)}`,
      owner_ledger_ref: ownerLedger.ref,
      original_admission_request_ref: original.ref,
      original_admission_request_sha256: original.sha256,
      admission_scope_id: admissionScopeId,
      requested_action_id: input.action.action_id,
      requested_run_id: input.runId,
      original_invocation_sha256: digest(input.originalInvocationSha256, 'original_invocation_sha256'),
      requested_at: new Date().toISOString(),
    },
    work_item_identity: {
      work_item_id: workItemId,
      canonical_workspace_root: workspaceRoot,
      canonical_work_item_root: canonicalRelativeRoot,
      work_item_root_ref: pathToFileURL(canonicalWorkItemRoot).href,
      descriptor_domain_id: located.descriptorDomainId,
    },
    current_inventory: {
      inventory_ref: path.relative(workspaceRoot, located.inventory.file).split(path.sep).join('/'),
      inventory_sha256: located.inventory.sha256,
      inventory_bytes_base64: located.inventory.bytes.toString('base64'),
      inventory_byte_size: located.inventory.bytes.byteLength,
      record: located.inventory.payload,
      selected_item_index: located.inventoryItemIndex,
    },
  };
  const handlerPayload: Record<string, unknown> = {};
  for (const field of INITIALIZATION_REQUEST_FIELD_MAP_KEYS) {
    setJsonPointer(handlerPayload, contract.initialization_request_input_field_map[field], values[field]);
  }
  return {
    contract,
    handlerActionId: contract.initialization_action_id,
    handlerRunId,
    admissionPayloadField: contract.admission_payload_field,
    admissionScopeId,
    originalAdmissionRequestRef: original.ref,
    originalAdmissionRequestSha256: original.sha256,
    ownerLedgerRef: ownerLedger.ref,
    workItemId,
    handlerPayload,
  };
}

export function materializedStandardAgentLifecycleInitializationAdmission(input: {
  prepared: StandardAgentLifecycleInitializationBinding;
  handlerRun: unknown;
}) {
  if (!isRecord(input.handlerRun) || !isRecord(input.handlerRun.standard_agent_action_run)) {
    blocked('Initialization handler did not return a Standard Agent action run.');
  }
  const run = input.handlerRun.standard_agent_action_run;
  if (
    run.execution_kind !== 'handler_ref'
    || run.status !== 'completed'
    || run.action_id !== input.prepared.handlerActionId
    || run.run_id !== input.prepared.handlerRunId
    || !isRecord(run.output)
    || !isRecord(run.result)
  ) blocked('Initialization handler run is not a completed host-materialized authority result.');
  if (run.result.status === 'typed_blocker' || run.result.status === 'invalid_host_input') {
    blocked('Domain lifecycle initialization authority did not authorize materialization or Stage admission.', {
      failure_code: run.result.status === 'typed_blocker'
        ? 'domain_lifecycle_initialization_typed_blocker'
        : 'domain_lifecycle_initialization_invalid_host_input',
      domain_authority_status: run.result.status,
      domain_authority_result_ref: text(run.output.ref, 'initialization_handler.output.ref'),
      domain_authority_result_sha256: digest(run.output.sha256, 'initialization_handler.output.sha256'),
      domain_authority_blocker: isRecord(run.result.typed_blocker) ? run.result.typed_blocker : null,
      domain_authority_error: isRecord(run.result.error) ? run.result.error : null,
    });
  }
  if (!isRecord(run.host_materialization)) {
    blocked('Initialization handler run is not a completed host-materialized authority result.');
  }
  const initialization = run.result[input.prepared.contract.initialization_receipt_output_field!];
  if (!isRecord(initialization)) blocked('Initialization handler output is missing its domain authority receipt.');
  if (
    initialization.admission_scope_id !== input.prepared.admissionScopeId
    || initialization.original_admission_request_ref !== input.prepared.originalAdmissionRequestRef
    || digest(
      initialization.original_admission_request_sha256,
      'initialization_receipt.original_admission_request_sha256',
    ) !== input.prepared.originalAdmissionRequestSha256
  ) blocked('Initialization authority result does not preserve the OPL-bound request scope.');
  return {
    surface_kind: 'opl_domain_lifecycle_admission',
    version: 'opl-domain-lifecycle-admission.v1',
    mode: 'initialization_receipt',
    domain_authority_result_ref: text(run.output.ref, 'initialization_handler.output.ref'),
    domain_authority_result_sha256: `sha256:${digest(
      run.output.sha256,
      'initialization_handler.output.sha256',
    )}`,
    materialization_receipt_ref: text(
      run.host_materialization.receipt_ref,
      'host_materialization.receipt_ref',
    ),
    materialization_receipt_sha256: `sha256:${digest(
      run.host_materialization.receipt_sha256,
      'host_materialization.receipt_sha256',
    )}`,
  } as const;
}

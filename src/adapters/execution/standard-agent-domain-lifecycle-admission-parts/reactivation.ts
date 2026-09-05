import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { canonicalJsonBytes } from '../../../kernel/canonical-json.ts';
import { isRecord } from '../../../kernel/contract-validation.ts';
import type { FamilyActionCatalogAction } from '../../../kernel/family-action-catalog-contract.ts';
import {
  parseStandardAgentLifecycleAdmission,
  standardAgentLifecycleAdmissionContract,
} from './contract.ts';
import {
  assertContained,
  blocked,
  digest,
  exactWorkspaceFileRef,
  exactJsonFile,
  locateLifecycle,
  persistContentAddressedWorkspaceRecord,
  resolveContained,
  setJsonPointer,
  sha256,
  text,
} from './shared.ts';
import {
  REQUEST_FIELD_MAP_KEYS,
  type ExactByteBindingFieldMap,
  type ExactFile,
  type LocatedLifecycle,
  type ParsedStandardAgentLifecycleAdmission,
  type PreparedStandardAgentLifecycleReactivation,
  type StandardAgentLifecycleAdmissionContract,
  type StandardAgentLifecycleReactivationBinding,
} from './types.ts';

function persistOriginalAdmissionRequest(input: {
  workspaceRoot: string;
  domainId: string;
  actionId: string;
  runId: string;
  workItemId: string;
  originalInvocationSha256: string;
  admission: Record<string, unknown>;
}) {
  const record = {
    surface_kind: 'opl_domain_lifecycle_admission_request_record',
    version: 'opl-domain-lifecycle-admission-request-record.v1',
    canonical_domain_id: input.domainId,
    requested_action_id: input.actionId,
    requested_run_id: input.runId,
    work_item_id: input.workItemId,
    original_invocation_sha256: digest(input.originalInvocationSha256, 'original_invocation_sha256'),
    lifecycle_admission: input.admission,
  };
  return persistContentAddressedWorkspaceRecord({
    workspaceRoot: input.workspaceRoot,
    relativeDirectory: 'control/opl/lifecycle_admission_requests/sha256',
    label: 'Original lifecycle admission request',
    record,
  });
}

export function standardAgentLifecycleReactivationHandlerRunId(input: {
  domainId: string;
  actionId: string;
  runId: string;
  payload: Record<string, unknown>;
}) {
  const fingerprint = sha256(canonicalJsonBytes({
    domain_id: input.domainId,
    action_id: input.actionId,
    run_id: input.runId,
    lifecycle_admission: input.payload,
  }));
  return `lifecycle_reactivation_${fingerprint}`;
}

export function bindStandardAgentLifecycleReactivation(input: {
  action: FamilyActionCatalogAction;
  payload: Record<string, unknown>;
  workspaceRoot: string;
  domainId: string;
  runId: string;
  originalInvocationSha256: string;
}): (StandardAgentLifecycleReactivationBinding & {
  workItemId: string;
  admission: Extract<ParsedStandardAgentLifecycleAdmission, { mode: 'reactivation_request' }>;
}) | null {
  const contract = standardAgentLifecycleAdmissionContract(input.action);
  if (!contract) return null;
  const admissionValue = input.payload[contract.admission_payload_field];
  if (admissionValue === undefined) return null;
  const admission = parseStandardAgentLifecycleAdmission(admissionValue);
  if (admission.mode !== 'reactivation_request') return null;
  const workItemId = text(input.payload[contract.work_item_id_field], contract.work_item_id_field);
  const original = persistOriginalAdmissionRequest({
    workspaceRoot: input.workspaceRoot,
    domainId: input.domainId,
    actionId: input.action.action_id,
    runId: input.runId,
    workItemId,
    originalInvocationSha256: input.originalInvocationSha256,
    admission: admission.value,
  });
  const handlerRunId = standardAgentLifecycleReactivationHandlerRunId({
    domainId: input.domainId,
    actionId: input.action.action_id,
    runId: input.runId,
    payload: admission.value,
  });
  const admissionScopeId = `lifecycle-admission:${sha256(canonicalJsonBytes({
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
    label: 'Lifecycle admission owner ledger entry',
    record: {
      surface_kind: 'opl_lifecycle_admission_owner_ledger_entry',
      version: 'opl-lifecycle-admission-owner-ledger-entry.v1',
      status: 'reactivation_requested',
      canonical_domain_id: input.domainId,
      requested_action_id: input.action.action_id,
      requested_run_id: input.runId,
      work_item_id: workItemId,
      handler_action_id: contract.reactivation_action_id,
      handler_run_id: handlerRunId,
      admission_scope_id: admissionScopeId,
      original_invocation_sha256: digest(input.originalInvocationSha256, 'original_invocation_sha256'),
      original_admission_request_ref: original.ref,
      original_admission_request_sha256: original.sha256,
      authority_boundary: {
        opl_role: 'host_invocation_provenance_ledger',
        domain_role: 'lifecycle_mutation_and_owner_receipt_authority',
        can_authorize_domain_lifecycle: false,
        can_replace_domain_owner_receipt: false,
      },
    },
  });
  return {
    contract,
    handlerActionId: contract.reactivation_action_id,
    handlerRunId,
    admissionPayloadField: contract.admission_payload_field,
    admissionScopeId,
    originalAdmissionRequestRef: original.ref,
    originalAdmissionRequestSha256: original.sha256,
    ownerLedgerRef: ownerLedger.ref,
    workItemId,
    admission,
  };
}

function injectedExactJsonFile(input: {
  exactFile: ExactFile;
  refField: string;
  binding: ExactByteBindingFieldMap | null;
  legacySha256Field: string;
  legacyIncludesByteSize?: boolean;
}) {
  if (!input.binding) {
    return {
      [input.refField]: input.exactFile.ref,
      [input.legacySha256Field]: input.exactFile.sha256,
      ...(input.legacyIncludesByteSize ? { byte_size: input.exactFile.bytes.byteLength } : {}),
      record: input.exactFile.payload,
    };
  }
  return {
    [input.refField]: input.exactFile.ref,
    [input.binding.bytes_base64]: input.exactFile.bytes.toString('base64'),
    [input.binding.byte_size]: input.exactFile.bytes.byteLength,
    [input.binding.sha256]: input.exactFile.sha256,
    [input.binding.record]: input.exactFile.payload,
  };
}

function buildProjectionInventory(input: {
  contract: StandardAgentLifecycleAdmissionContract;
  located: LocatedLifecycle;
  workspaceRoot: string;
}) {
  const workspaceRoot = fs.realpathSync.native(input.workspaceRoot);
  const targets: Record<string, unknown>[] = [];
  const absentOptionalProjectionIds: string[] = [];
  for (const source of input.contract.reactivation_projection_sources) {
    const sourceRoot = source.root === 'workspace' ? workspaceRoot : input.located.workItemRoot;
    const target = resolveContained(sourceRoot, source.relative_path, `projection.${source.projection_id}`);
    if (!fs.existsSync(target)) {
      const parent = fs.realpathSync.native(path.dirname(target));
      assertContained(fs.realpathSync.native(sourceRoot), parent, `projection.${source.projection_id}.parent`);
      if (parent !== path.dirname(target)) {
        blocked('Projection target parent must not traverse a symbolic-link alias.', {
          projection_id: source.projection_id,
        });
      }
      if (source.required) {
        blocked('Required lifecycle reactivation projection is missing.', {
          projection_id: source.projection_id,
          relative_path: source.relative_path,
        });
      }
      absentOptionalProjectionIds.push(source.projection_id);
      continue;
    }
    const realTarget = fs.realpathSync.native(target);
    assertContained(fs.realpathSync.native(sourceRoot), realTarget, `projection.${source.projection_id}`);
    if (realTarget !== target) {
      blocked('Projection target must use a canonical physical path.', { projection_id: source.projection_id });
    }
    const current = exactJsonFile(realTarget, `projection.${source.projection_id}`);
    targets.push({
      projection_id: source.projection_id,
      root: source.root,
      relative_path: source.relative_path,
      ...injectedExactJsonFile({
        exactFile: current,
        refField: 'ref',
        binding: input.contract.exact_byte_binding_fields?.projection_target ?? null,
        legacySha256Field: 'sha256',
        legacyIncludesByteSize: true,
      }),
    });
  }
  return {
    discovery_complete: true,
    targets,
    absent_optional_projection_ids: absentOptionalProjectionIds,
  };
}

export function prepareStandardAgentLifecycleReactivation(input: {
  action: FamilyActionCatalogAction;
  payload: Record<string, unknown>;
  checkoutRoot: string;
  workspaceRoot: string;
  domainId: string;
  runId: string;
  originalInvocationSha256: string;
}): PreparedStandardAgentLifecycleReactivation | null {
  const binding = bindStandardAgentLifecycleReactivation(input);
  if (!binding) return null;
  const { contract, workItemId, admission } = binding;
  const located = locateLifecycle({
    checkoutRoot: input.checkoutRoot,
    workspaceRoot: input.workspaceRoot,
    workItemId,
  });
  const lifecycle = located.lifecycle;
  const request = admission.reactivationRequest;
  if (
    lifecycle.payload[contract.work_item_id_field] !== workItemId
    || lifecycle.ref !== request.current_lifecycle_ref
    || lifecycle.sha256 !== request.current_lifecycle_sha256
    || lifecycle.payload[contract.lifecycle_state_field] !== request.observed_lifecycle_state
    || lifecycle.payload[contract.lifecycle_generation_field] !== request.observed_lifecycle_generation
  ) blocked('Reactivation request does not bind the current canonical lifecycle bytes and generation.', {
    actual: {
      work_item_id: lifecycle.payload[contract.work_item_id_field] ?? null,
      lifecycle_ref: lifecycle.ref,
      lifecycle_sha256: lifecycle.sha256,
      lifecycle_state: lifecycle.payload[contract.lifecycle_state_field] ?? null,
      lifecycle_generation: lifecycle.payload[contract.lifecycle_generation_field] ?? null,
    },
    requested: {
      work_item_id: workItemId,
      lifecycle_ref: request.current_lifecycle_ref,
      lifecycle_sha256: request.current_lifecycle_sha256,
      lifecycle_state: request.observed_lifecycle_state,
      lifecycle_generation: request.observed_lifecycle_generation,
    },
  });
  if (request.observed_lifecycle_state === contract.active_state) {
    blocked('A reactivation request cannot target an already active canonical lifecycle.');
  }
  if (!request.explicit_user_wakeup) blocked('Reactivation request is missing explicit user wakeup authority.');
  if (request.observed_lifecycle_state === contract.stopped_state && !request.allow_stopped_relaunch) {
    blocked('Stopped lifecycle reactivation requires allow_stopped_relaunch.');
  }

  const userAuthority = exactWorkspaceFileRef({
    ref: request.user_authority_ref,
    expectedSha256: request.user_authority_sha256,
    workspaceRoot: input.workspaceRoot,
    field: 'user_authority',
    json: true,
  });
  const revisionIntake = exactWorkspaceFileRef({
    ref: request.reviewer_revision_intake_ref,
    expectedSha256: request.reviewer_revision_intake_sha256,
    workspaceRoot: input.workspaceRoot,
    field: 'reviewer_revision_intake',
    json: true,
  });
  const profile = exactWorkspaceFileRef({
    ref: request.profile_ref,
    expectedSha256: request.profile_sha256,
    workspaceRoot: input.workspaceRoot,
    field: 'profile',
    json: false,
  });
  const projectionInventory = buildProjectionInventory({
    contract,
    located,
    workspaceRoot: input.workspaceRoot,
  });
  const values: Record<(typeof REQUEST_FIELD_MAP_KEYS)[number], unknown> = {
    work_item_id: workItemId,
    reactivation_request: request,
    authority_context: {
      handler_call_ref: `opl://standard-agent-action-run/${encodeURIComponent(binding.handlerRunId)}`,
      owner_ledger_ref: binding.ownerLedgerRef,
      original_admission_request_ref: binding.originalAdmissionRequestRef,
      original_admission_request_sha256: binding.originalAdmissionRequestSha256,
      admission_scope_id: binding.admissionScopeId,
      requested_action_id: input.action.action_id,
      requested_run_id: input.runId,
      original_invocation_sha256: digest(input.originalInvocationSha256, 'original_invocation_sha256'),
    },
    work_item_identity: {
      [contract.work_item_id_field]: workItemId,
      work_item_root_ref: pathToFileURL(located.workItemRoot).href,
      lifecycle_ref: lifecycle.ref,
      descriptor_domain_id: located.descriptorDomainId,
    },
    user_authority: injectedExactJsonFile({
      exactFile: {
        file: userAuthority.file,
        ref: userAuthority.ref,
        bytes: userAuthority.bytes,
        sha256: userAuthority.sha256,
        payload: userAuthority.record!,
      },
      refField: 'authority_ref',
      binding: contract.exact_byte_binding_fields?.user_authority ?? null,
      legacySha256Field: 'authority_sha256',
    }),
    reviewer_revision_intake: injectedExactJsonFile({
      exactFile: {
        file: revisionIntake.file,
        ref: revisionIntake.ref,
        bytes: revisionIntake.bytes,
        sha256: revisionIntake.sha256,
        payload: revisionIntake.record!,
      },
      refField: 'intake_ref',
      binding: contract.exact_byte_binding_fields?.reviewer_revision_intake ?? null,
      legacySha256Field: 'intake_sha256',
    }),
    current_lifecycle: injectedExactJsonFile({
      exactFile: lifecycle,
      refField: 'lifecycle_ref',
      binding: contract.exact_byte_binding_fields?.current_lifecycle ?? null,
      legacySha256Field: 'lifecycle_sha256',
    }),
    profile: {
      profile_ref: profile.ref,
      profile_sha256: profile.sha256,
      profile_byte_size: profile.bytes.byteLength,
      profile_body_utf8: profile.bytes.toString('utf8'),
    },
    projection_inventory: projectionInventory,
  };
  const handlerPayload: Record<string, unknown> = {};
  for (const field of REQUEST_FIELD_MAP_KEYS) {
    setJsonPointer(handlerPayload, contract.reactivation_request_input_field_map[field], values[field]);
  }
  return {
    ...binding,
    handlerPayload,
  };
}

export function materializedStandardAgentLifecycleAdmission(input: {
  prepared: StandardAgentLifecycleReactivationBinding;
  handlerRun: unknown;
}) {
  if (!isRecord(input.handlerRun) || !isRecord(input.handlerRun.standard_agent_action_run)) {
    blocked('Reactivation handler did not return a Standard Agent action run.');
  }
  const run = input.handlerRun.standard_agent_action_run;
  if (
    run.execution_kind !== 'handler_ref'
    || run.status !== 'completed'
    || run.action_id !== input.prepared.handlerActionId
    || run.run_id !== input.prepared.handlerRunId
    || !isRecord(run.output)
    || !isRecord(run.result)
  ) blocked('Reactivation handler run is not a completed host-materialized authority result.');
  if (run.result.status === 'typed_blocker' || run.result.status === 'invalid_host_input') {
    blocked('Domain lifecycle reactivation authority did not authorize materialization or Stage admission.', {
      failure_code: run.result.status === 'typed_blocker'
        ? 'domain_lifecycle_reactivation_typed_blocker'
        : 'domain_lifecycle_reactivation_invalid_host_input',
      domain_authority_status: run.result.status,
      domain_authority_result_ref: text(run.output.ref, 'reactivation_handler.output.ref'),
      domain_authority_result_sha256: digest(run.output.sha256, 'reactivation_handler.output.sha256'),
      domain_authority_blocker: isRecord(run.result.typed_blocker) ? run.result.typed_blocker : null,
      domain_authority_error: isRecord(run.result.error) ? run.result.error : null,
    });
  }
  if (!isRecord(run.host_materialization)) {
    blocked('Reactivation handler run is not a completed host-materialized authority result.');
  }
  const outputRef = text(run.output.ref, 'reactivation_handler.output.ref');
  const outputSha256 = digest(run.output.sha256, 'reactivation_handler.output.sha256');
  const receiptRef = text(run.host_materialization.receipt_ref, 'host_materialization.receipt_ref');
  const receiptSha256 = digest(
    run.host_materialization.receipt_sha256,
    'host_materialization.receipt_sha256',
  );
  const reactivation = run.result[input.prepared.contract.reactivation_receipt_output_field];
  if (!isRecord(reactivation)) blocked('Reactivation handler output is missing its domain authority receipt.');
  if (
    reactivation.admission_scope_id !== input.prepared.admissionScopeId
    || reactivation.original_admission_request_ref !== input.prepared.originalAdmissionRequestRef
    || digest(
      reactivation.original_admission_request_sha256,
      'reactivation_receipt.original_admission_request_sha256',
    ) !== input.prepared.originalAdmissionRequestSha256
  ) blocked('Reactivation authority result does not preserve the OPL-bound request scope.');
  return {
    surface_kind: 'opl_domain_lifecycle_admission',
    version: 'opl-domain-lifecycle-admission.v1',
    mode: 'materialized_receipt',
    domain_authority_result_ref: outputRef,
    domain_authority_result_sha256: `sha256:${outputSha256}`,
    materialization_receipt_ref: receiptRef,
    materialization_receipt_sha256: `sha256:${receiptSha256}`,
  } as const;
}

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import receiptSchema from
  '../../../../contracts/opl-framework/domain-artifact-cas-materialization-receipt.schema.json' with { type: 'json' };
import requestSchema from
  '../../../../contracts/opl-framework/domain-artifact-cas-materialization-request.schema.json' with { type: 'json' };
import { canonicalJsonBytes } from '../../../kernel/canonical-json.ts';
import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import { assertJsonSchemaPayload } from '../../../kernel/schema-registry.ts';
import { formatJsonPayload, parseJsonText } from '../../../kernel/json-file.ts';
import {
  DOMAIN_ARTIFACT_CAS_CAPABILITY_ID,
  assertAbsentPreconditions,
  bindSingleUseRequest,
  digest,
  durableExclusiveFile,
  exactFileMatches,
  exactStringList,
  fail,
  fsyncDirectory,
  operationIdentity,
  readJsonRecord,
  readStableFile,
  replacementBytes,
  safeRelativePath,
  sha256,
  stringList,
  targetsMatch,
  text,
  transactionPaths,
  type CasRequest,
  type DomainArtifactCasMaterialization,
  type DomainArtifactCasMaterializationHooks,
  type PreparedOperation,
  type TransactionPaths,
} from './shared.ts';
import {
  acquireLock,
  prepareOperations,
  switchTransaction,
  validatePreparedPaths,
} from './transaction.ts';
import { writeReadEpoch } from './read-window.ts';

const REQUEST_SCHEMA_REF =
  'contracts/opl-framework/domain-artifact-cas-materialization-request.schema.json';
const RECEIPT_SCHEMA_REF =
  'contracts/opl-framework/domain-artifact-cas-materialization-receipt.schema.json';
const NON_MATERIALIZING_AUTHORITY_STATUSES = new Set(['typed_blocker', 'invalid_host_input']);

type HostMaterializationContract = {
  capability_id: typeof DOMAIN_ARTIFACT_CAS_CAPABILITY_ID;
  request_output_field: string;
  authorization_output_field: string;
  receipt_output_field: string | null;
  receipt_content_binding_output_field: string | null;
  materialization_scope_sha256_field: string | null;
  absent_relative_path_preconditions_field: string | null;
};
function hostContract(value: unknown): HostMaterializationContract | null {
  if (value === undefined) return null;
  if (!isRecord(value)) fail('host_materialization_contract must be an object.');
  const allowed = [
    'capability_id',
    'request_output_field',
    'authorization_output_field',
    'receipt_output_field',
    'receipt_content_binding_output_field',
    'materialization_scope_sha256_field',
    'absent_relative_path_preconditions_field',
  ];
  const unsupported = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unsupported.length > 0) {
    fail('host_materialization_contract contains unsupported fields.', { unsupported_fields: unsupported });
  }
  if (value.capability_id !== DOMAIN_ARTIFACT_CAS_CAPABILITY_ID) {
    fail('host_materialization_contract capability_id is unsupported.', { capability_id: value.capability_id });
  }
  const materializationScopeField = value.materialization_scope_sha256_field === undefined
    ? null
    : text(value.materialization_scope_sha256_field, 'materialization_scope_sha256_field');
  const absentPreconditionsField = value.absent_relative_path_preconditions_field === undefined
    ? null
    : text(value.absent_relative_path_preconditions_field, 'absent_relative_path_preconditions_field');
  if ((materializationScopeField === null) !== (absentPreconditionsField === null)) {
    fail('host_materialization_contract scope fields must be declared together.');
  }
  if (materializationScopeField !== null && materializationScopeField === absentPreconditionsField) {
    fail('host_materialization_contract scope field names must be distinct.');
  }
  const receiptOutputField = value.receipt_output_field === undefined
    ? null
    : text(value.receipt_output_field, 'receipt_output_field');
  const receiptContentBindingOutputField = value.receipt_content_binding_output_field === undefined
    ? null
    : text(value.receipt_content_binding_output_field, 'receipt_content_binding_output_field');
  if ((receiptOutputField === null) !== (receiptContentBindingOutputField === null)) {
    fail('host_materialization_contract receipt fields must be declared together.');
  }
  return {
    capability_id: DOMAIN_ARTIFACT_CAS_CAPABILITY_ID,
    request_output_field: text(value.request_output_field, 'request_output_field'),
    authorization_output_field: text(value.authorization_output_field, 'authorization_output_field'),
    receipt_output_field: receiptOutputField,
    receipt_content_binding_output_field: receiptContentBindingOutputField,
    materialization_scope_sha256_field: materializationScopeField,
    absent_relative_path_preconditions_field: absentPreconditionsField,
  };
}

function existingReceipt(input: {
  paths: TransactionPaths;
  request: CasRequest;
  requestSha256: string;
  operationsSha256: string;
  operations: PreparedOperation[];
  domainId: string;
  actionId: string;
  runId: string;
  handlerOutputRef: string;
  handlerOutputSha256: string;
  requestBindingRef: string;
}) {
  if (!fs.existsSync(input.paths.receiptByRequest) || fs.existsSync(input.paths.journal)) return null;
  const stored = readJsonRecord(input.paths.receiptByRequest, 'Stored CAS materialization receipt');
  assertJsonSchemaPayload({
    schemaId: 'opl-domain-artifact-cas-materialization-receipt.v1',
    schema: receiptSchema,
    sourceRef: RECEIPT_SCHEMA_REF,
  }, stored.value);
  const result = isRecord(stored.value.domain_authority_result) ? stored.value.domain_authority_result : null;
  const transaction = isRecord(stored.value.transaction) ? stored.value.transaction : null;
  if (
    stored.value.request_id !== input.request.request_id
    || stored.value.request_sha256 !== input.requestSha256
    || stored.value.domain_id !== input.domainId
    || stored.value.authorization_ref !== input.request.authorization_ref
    || stored.value.operations_sha256 !== input.operationsSha256
    || !result
    || result.run_id !== input.runId
    || result.action_id !== input.actionId
    || result.output_ref !== input.handlerOutputRef
    || result.output_sha256 !== input.handlerOutputSha256
    || !transaction
    || (
      transaction.single_use_request_binding_ref !== undefined
      && transaction.single_use_request_binding_ref !== input.requestBindingRef
    )
  ) fail('Stored CAS materialization receipt does not bind current exact bytes and run identity.');
  const receiptPath = input.paths.receiptByRequest;
  const receiptRef = pathToFileURL(receiptPath).href;
  const receiptSha256 = sha256(stored.bytes);
  if (stored.value.status === 'failed_rolled_back') {
    if (!isRecord(stored.value.failure) || !targetsMatch(input.operations, 'before')) {
      fail('Stored CAS failure receipt does not bind an exact rolled-back transaction.');
    }
    fail('CAS request previously failed and was rolled back.', {
      failure_receipt_ref: receiptRef,
      failure_receipt_sha256: receiptSha256,
      original_failure: stored.value.failure,
    });
  }
  if (
    !['materialized', 'already_materialized'].includes(String(stored.value.status))
    || !targetsMatch(input.operations, 'after')
  ) fail('Stored CAS materialization receipt does not bind current exact bytes and run identity.');
  return {
    receipt_path: receiptPath,
    receipt_ref: receiptRef,
    receipt_sha256: receiptSha256,
    receipt: stored.value,
  } satisfies DomainArtifactCasMaterialization;
}

function persistReceipt(paths: TransactionPaths, receipt: Record<string, unknown>) {
  const bytes = Buffer.from(formatJsonPayload(receipt));
  const receiptSha256 = sha256(bytes);
  const contentAddressed = path.join(paths.receiptRoot, `${receiptSha256}.json`);
  fs.mkdirSync(paths.receiptRoot, { recursive: true });
  if (!fs.existsSync(contentAddressed)) {
    const temporary = `${contentAddressed}.${process.pid}.${crypto.randomUUID()}.tmp`;
    durableExclusiveFile(temporary, bytes);
    try {
      fs.linkSync(temporary, contentAddressed);
      fsyncDirectory(paths.receiptRoot);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    } finally {
      fs.rmSync(temporary, { force: true });
    }
  }
  const contentBytes = readStableFile(contentAddressed, 'Content-addressed CAS receipt');
  if (!contentBytes.equals(bytes)) fail('Content-addressed CAS receipt bytes conflict with their digest path.');
  fs.mkdirSync(path.dirname(paths.receiptByRequest), { recursive: true });
  if (!fs.existsSync(paths.receiptByRequest)) {
    fs.linkSync(contentAddressed, paths.receiptByRequest);
    fsyncDirectory(path.dirname(paths.receiptByRequest));
  }
  const requestBytes = readStableFile(paths.receiptByRequest, 'Request-addressed CAS receipt');
  if (!requestBytes.equals(bytes)) fail('Request-addressed CAS receipt conflicts with the exact signed receipt bytes.');
  return {
    receipt_path: paths.receiptByRequest,
    receipt_ref: pathToFileURL(paths.receiptByRequest).href,
    receipt_sha256: sha256(requestBytes),
    receipt,
  } satisfies DomainArtifactCasMaterialization;
}

export function applyDomainArtifactCasMaterialization(input: {
  workspaceRoot: string;
  domainId: string;
  actionId: string;
  runId: string;
  handlerRef: string;
  hostedRuntimeBindingRef: string;
  actionAuthorityBoundary: Record<string, unknown> | null;
  handlerOutput: unknown;
  handlerOutputRef: string;
  handlerOutputSha256: string;
  replayOnly?: boolean;
}, hooks: DomainArtifactCasMaterializationHooks = {}): DomainArtifactCasMaterialization | null {
  const contract = hostContract(input.actionAuthorityBoundary?.host_materialization_contract);
  const output = isRecord(input.handlerOutput) ? input.handlerOutput : null;
  const undeclaredRequest = output?.opl_host_materialization_request;
  if (!contract) {
    if (undeclaredRequest !== undefined) {
      fail('Handler output requested host materialization without a declared host capability.');
    }
    return null;
  }
  if (!output) fail('Host materialization requires an object handler output.');
  const requestValue = output[contract.request_output_field];
  const authorization = output[contract.authorization_output_field];
  const domainReceipt = contract.receipt_output_field === null
    ? undefined
    : output[contract.receipt_output_field];
  const domainReceiptBinding = contract.receipt_content_binding_output_field === null
    ? undefined
    : output[contract.receipt_content_binding_output_field];
  if (NON_MATERIALIZING_AUTHORITY_STATUSES.has(String(output.status))) {
    if (
      requestValue !== null
      || authorization !== null
      || domainReceipt !== undefined && domainReceipt !== null
      || domainReceiptBinding !== undefined && domainReceiptBinding !== null
    ) {
      fail('Non-materializing domain authority output must set its host request, authorization, and receipt to null.', {
        domain_authority_status: output.status,
      });
    }
    return null;
  }
  if (!isRecord(requestValue) || !isRecord(authorization)) {
    fail('Declared host materialization output is missing its request or authorization record.');
  }
  assertJsonSchemaPayload({
    schemaId: 'opl-domain-artifact-cas-materialization-request.v1',
    schema: requestSchema,
    sourceRef: REQUEST_SCHEMA_REF,
  }, requestValue);
  const request = requestValue as unknown as CasRequest;
  if (request.domain_id !== input.domainId) {
    fail('Host materialization request domain does not match the bound action.', {
      request_domain_id: request.domain_id,
      action_domain_id: input.domainId,
    });
  }
  const operationsSha256 = sha256(canonicalJsonBytes(request.operations));
  if (digest(request.operations_sha256, 'operations_sha256') !== operationsSha256) {
    fail('Host materialization operations_sha256 does not bind operations.');
  }
  if (contract.receipt_output_field !== null) {
    if (!isRecord(domainReceipt) || !isRecord(domainReceiptBinding)) {
      fail('Declared host materialization receipt output is missing its receipt or exact content binding.');
    }
    const receiptTarget = safeRelativePath(
      text(domainReceiptBinding.target_relative_path, 'receipt_content_binding.target_relative_path'),
      'receipt_content_binding.target_relative_path',
    );
    const receiptSha256 = digest(domainReceiptBinding.sha256, 'receipt_content_binding.sha256');
    const receiptByteSize = domainReceiptBinding.byte_size;
    if (!Number.isSafeInteger(receiptByteSize) || Number(receiptByteSize) < 1) {
      fail('receipt_content_binding.byte_size must be a positive safe integer.');
    }
    const receiptOperation = request.operations.find((operation) => (
      operation.target_relative_path === receiptTarget
    ));
    const receiptBytes = receiptOperation
      ? replacementBytes(
          receiptOperation.replacement_bytes_base64,
          receiptOperation.replacement_byte_size,
        )
      : null;
    let materializedReceipt: unknown = null;
    try {
      materializedReceipt = receiptBytes
        ? parseJsonText(new TextDecoder('utf-8', { fatal: true }).decode(receiptBytes))
        : null;
    } catch {
      fail('Domain owner receipt replacement bytes must be strict UTF-8 JSON.');
    }
    if (
      !receiptOperation
      || !receiptBytes
      || receiptSha256 !== sha256(receiptBytes)
      || receiptByteSize !== receiptBytes.byteLength
      || digest(receiptOperation.replacement_sha256, 'receipt operation replacement_sha256') !== receiptSha256
      || receiptOperation.replacement_byte_size !== receiptByteSize
      || canonicalJsonBytes(materializedReceipt).toString('base64')
        !== canonicalJsonBytes(domainReceipt).toString('base64')
      || domainReceiptBinding.receipt_ref !== domainReceipt.receipt_ref
    ) {
      fail('Domain owner receipt content binding does not match one exact CAS replacement operation.');
    }
  }
  const scopeSha256Field = contract.materialization_scope_sha256_field;
  const absentPreconditionsField = contract.absent_relative_path_preconditions_field;
  const scopedContract = scopeSha256Field !== null && absentPreconditionsField !== null;
  let absentRelativePathPreconditions: string[] = [];
  if (!scopedContract) {
    const undeclaredScopeFields = [
      'materialization_scope_sha256',
      'absent_relative_path_preconditions',
    ].filter((field) => Object.hasOwn(requestValue, field) || Object.hasOwn(authorization, field));
    if (undeclaredScopeFields.length > 0) {
      fail('Legacy host materialization contract cannot consume undeclared authorization scope fields.', {
        undeclared_scope_fields: undeclaredScopeFields,
      });
    }
  } else {
    const scopeField = scopeSha256Field!;
    const absentField = absentPreconditionsField!;
    const missingScopeBindings = [
      [requestValue, scopeField, `request.${scopeField}`],
      [requestValue, absentField, `request.${absentField}`],
      [authorization, scopeField, `authorization.${scopeField}`],
      [authorization, absentField, `authorization.${absentField}`],
    ].filter(([record, field]) => !Object.hasOwn(record as Record<string, unknown>, String(field)))
      .map(([, , label]) => label);
    if (missingScopeBindings.length > 0) {
      fail('Declared host materialization authorization scope fields are missing.', {
        missing_scope_fields: missingScopeBindings,
      });
    }
    absentRelativePathPreconditions = exactStringList(
      requestValue[absentField],
      `request.${absentField}`,
    );
    const authorizedAbsentPreconditions = exactStringList(
      authorization[absentField],
      `authorization.${absentField}`,
    );
    if (JSON.stringify(authorizedAbsentPreconditions) !== JSON.stringify(absentRelativePathPreconditions)) {
      fail('Host materialization authorization absent-path scope does not bind the request.');
    }
    const materializationScopeSha256 = sha256(canonicalJsonBytes({
      operations: request.operations,
      absent_relative_path_preconditions: absentRelativePathPreconditions,
    }));
    if (
      digest(requestValue[scopeField], `request.${scopeField}`) !== materializationScopeSha256
      || digest(authorization[scopeField], `authorization.${scopeField}`)
        !== materializationScopeSha256
    ) {
      fail('Host materialization materialization_scope_sha256 does not bind operations and absent paths.');
    }
  }
  const authorizationFields = {
    authorization_ref: text(authorization.authorization_ref, 'authorization.authorization_ref'),
    capability_id: text(authorization.capability_id, 'authorization.capability_id'),
    request_id: text(authorization.request_id, 'authorization.request_id'),
    domain_id: text(authorization.domain_id, 'authorization.domain_id'),
    operations_sha256: digest(authorization.operations_sha256, 'authorization.operations_sha256'),
    authority_receipt_ref: text(authorization.authority_receipt_ref, 'authorization.authority_receipt_ref'),
    satisfied_gate_ids: stringList(authorization.satisfied_gate_ids, 'authorization.satisfied_gate_ids'),
  };
  if (
    authorization.authorized !== true
    || authorizationFields.authorization_ref !== request.authorization_ref
    || authorizationFields.capability_id !== DOMAIN_ARTIFACT_CAS_CAPABILITY_ID
    || authorizationFields.request_id !== request.request_id
    || authorizationFields.domain_id !== input.domainId
    || authorizationFields.operations_sha256 !== operationsSha256
  ) fail('Host materialization authorization does not bind the exact request.');

const workspaceRoot = fs.realpathSync.native(input.workspaceRoot);
  const requestSha256 = sha256(canonicalJsonBytes(request));
  const {
    operations,
    parentDirectories,
    independentAbsentPreconditions,
  } = prepareOperations({
    workspaceRoot,
    request,
    requestSha256,
    absentRelativePathPreconditions,
  });
  assertAbsentPreconditions(independentAbsentPreconditions, 'before_receipt_reuse');
  const paths = transactionPaths(workspaceRoot, requestSha256, input.replayOnly);
  const requestBindingRef = bindSingleUseRequest({ paths, request, requestSha256, replayOnly: input.replayOnly });
  const receiptInput = {
    paths,
    request,
    requestSha256,
    operationsSha256,
    operations,
    domainId: input.domainId,
    actionId: input.actionId,
    runId: input.runId,
    handlerOutputRef: input.handlerOutputRef,
    handlerOutputSha256: digest(input.handlerOutputSha256, 'handler_output_sha256'),
    requestBindingRef,
  };
  const prior = existingReceipt(receiptInput);
  if (input.replayOnly) {
    if (!prior) fail('Completed action replay requires an existing settled CAS receipt.');
    return prior;
  }
  if (prior) {
    writeReadEpoch({
      file: paths.readEpoch,
      workspaceRoot,
      requestSha256,
      phase: 'settled',
      outcome: 'materialized',
    });
    return prior;
  }

  acquireLock(paths.lock, requestSha256);
  let readEpochStarted = false;
  try {
    validatePreparedPaths(workspaceRoot, operations, parentDirectories);
    assertAbsentPreconditions(independentAbsentPreconditions, 'before_locked_receipt_reuse');
    const existing = existingReceipt(receiptInput);
    if (existing) {
      writeReadEpoch({
        file: paths.readEpoch,
        workspaceRoot,
        requestSha256,
        phase: 'settled',
        outcome: 'materialized',
      });
      return existing;
    }
    writeReadEpoch({
      file: paths.readEpoch,
      workspaceRoot,
      requestSha256,
      phase: 'in_progress',
      outcome: null,
    });
    readEpochStarted = true;
    const transaction = switchTransaction({
      workspaceRoot,
      requestSha256,
      paths,
      operations,
      parentDirectories,
      absentPreconditions: independentAbsentPreconditions,
      rename: hooks.rename ?? fs.renameSync,
      beforeJournalSwitch: hooks.beforeJournalSwitch,
    });
    if (fs.existsSync(paths.receiptByRequest)) {
      fs.rmSync(paths.journal, { force: true });
      fsyncDirectory(path.dirname(paths.journal));
      const recovered = existingReceipt(receiptInput)
        ?? fail('Recovered CAS receipt is not admissible after transaction finalization.');
      writeReadEpoch({
        file: paths.readEpoch,
        workspaceRoot,
        requestSha256,
        phase: 'settled',
        outcome: 'materialized',
      });
      return recovered;
    }
    const receipt = {
      surface_kind: 'opl_domain_artifact_cas_materialization_receipt',
      version: 'opl-domain-artifact-cas-materialization-receipt.v1',
      capability_id: DOMAIN_ARTIFACT_CAS_CAPABILITY_ID,
      status: 'materialized',
      request_id: request.request_id,
      request_sha256: requestSha256,
      domain_id: input.domainId,
      authorization_ref: authorizationFields.authorization_ref,
      authority_receipt_ref: authorizationFields.authority_receipt_ref,
      satisfied_gate_ids: authorizationFields.satisfied_gate_ids,
      domain_authority_result: {
        run_id: input.runId,
        action_id: input.actionId,
        handler_ref: input.handlerRef,
        hosted_runtime_binding_ref: input.hostedRuntimeBindingRef,
        output_ref: input.handlerOutputRef,
        output_sha256: receiptInput.handlerOutputSha256,
      },
      operations_sha256: operationsSha256,
      operations: operations.map(operationIdentity),
      transaction: {
        all_targets_preflighted_before_write: true,
        all_targets_revalidated_before_switch: true,
        rollback_on_failure: true,
        durable_recovery_journal: true,
        recovery_action: transaction.recoveryAction,
        visibility_model: 'journaled_all_or_rollback_for_cooperating_opl_readers',
        journal_must_be_absent_for_admission: true,
        single_use_request_binding_ref: requestBindingRef,
        exact_request_replay_is_idempotent: true,
        created_parent_directory_refs: transaction.createdDirectories.map((directory) => (
          pathToFileURL(directory.target).href
        )),
      },
      authority_boundary: {
        opl_role: 'exact_byte_cas_transport_and_receipt',
        domain_role: 'mutation_semantics_and_authorization_owner',
        opl_interprets_domain_semantics: false,
        provider_completion_is_domain_truth: false,
        receipt_is_domain_owner_receipt: false,
      },
      failure: null,
    };
    assertJsonSchemaPayload({
      schemaId: 'opl-domain-artifact-cas-materialization-receipt.v1',
      schema: receiptSchema,
      sourceRef: RECEIPT_SCHEMA_REF,
    }, receipt);
    hooks.beforePersistReceipt?.();
    const persisted = persistReceipt(paths, receipt);
    fs.rmSync(paths.journal, { force: true });
    fsyncDirectory(path.dirname(paths.journal));
    writeReadEpoch({
      file: paths.readEpoch,
      workspaceRoot,
      requestSha256,
      phase: 'settled',
      outcome: 'materialized',
    });
    return persisted;
  } catch (error) {
    if (readEpochStarted && !fs.existsSync(paths.journal)) {
      writeReadEpoch({
        file: paths.readEpoch,
        workspaceRoot,
        requestSha256,
        phase: 'settled',
        outcome: fs.existsSync(paths.receiptByRequest) ? 'materialized' : 'rolled_back',
      });
    }
    if (
      !fs.existsSync(paths.journal)
      && !fs.existsSync(paths.receiptByRequest)
      && targetsMatch(operations, 'before')
    ) {
      const failureReceipt = {
        surface_kind: 'opl_domain_artifact_cas_materialization_receipt',
        version: 'opl-domain-artifact-cas-materialization-receipt.v1',
        capability_id: DOMAIN_ARTIFACT_CAS_CAPABILITY_ID,
        status: 'failed_rolled_back',
        request_id: request.request_id,
        request_sha256: requestSha256,
        domain_id: input.domainId,
        authorization_ref: authorizationFields.authorization_ref,
        authority_receipt_ref: authorizationFields.authority_receipt_ref,
        satisfied_gate_ids: authorizationFields.satisfied_gate_ids,
        domain_authority_result: {
          run_id: input.runId,
          action_id: input.actionId,
          handler_ref: input.handlerRef,
          hosted_runtime_binding_ref: input.hostedRuntimeBindingRef,
          output_ref: input.handlerOutputRef,
          output_sha256: receiptInput.handlerOutputSha256,
        },
        operations_sha256: operationsSha256,
        operations: operations.map(operationIdentity),
        transaction: {
          all_targets_preflighted_before_write: true,
          all_targets_revalidated_before_switch: true,
          rollback_on_failure: true,
          durable_recovery_journal: true,
          recovery_action: 'rolled_back_after_failure',
          visibility_model: 'journaled_all_or_rollback_for_cooperating_opl_readers',
          journal_must_be_absent_for_admission: true,
          single_use_request_binding_ref: requestBindingRef,
          exact_request_replay_is_idempotent: true,
          created_parent_directory_refs: [],
        },
        authority_boundary: {
          opl_role: 'exact_byte_cas_transport_and_receipt',
          domain_role: 'mutation_semantics_and_authorization_owner',
          opl_interprets_domain_semantics: false,
          provider_completion_is_domain_truth: false,
          receipt_is_domain_owner_receipt: false,
        },
        failure: {
          code: 'domain_artifact_cas_materialization_failed',
          message: error instanceof Error ? error.message : String(error),
          rolled_back: true,
        },
      };
      assertJsonSchemaPayload({
        schemaId: 'opl-domain-artifact-cas-materialization-receipt.v1',
        schema: receiptSchema,
        sourceRef: RECEIPT_SCHEMA_REF,
      }, failureReceipt);
      const persistedFailure = persistReceipt(paths, failureReceipt);
      if (error instanceof FrameworkContractError) {
        throw new FrameworkContractError(error.code, error.message, {
          ...error.details,
          failure_receipt_ref: persistedFailure.receipt_ref,
          failure_receipt_sha256: persistedFailure.receipt_sha256,
        }, error.exitCode);
      }
      throw new FrameworkContractError('contract_shape_invalid', failureReceipt.failure.message, {
        failure_code: failureReceipt.failure.code,
        original_error_name: error instanceof Error ? error.name : typeof error,
        failure_receipt_ref: persistedFailure.receipt_ref,
        failure_receipt_sha256: persistedFailure.receipt_sha256,
      });
    }
    throw error;
  } finally {
    for (const operation of operations) fs.rmSync(operation.staging, { force: true });
    fs.rmSync(paths.lock, { force: true });
  }
}

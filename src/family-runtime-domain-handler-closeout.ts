type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function stringValues(value: unknown) {
  if (!isRecord(value)) {
    return [];
  }
  return Object.values(value)
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
}

function recordList(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function firstRecord(...values: unknown[]) {
  return values.find(isRecord) as JsonRecord | undefined;
}

export function canonicalCloseoutPacketFromDomainHandlerOutput(output: Record<string, unknown>) {
  const explicitPacket = firstRecord(output.closeout_packet);
  if (explicitPacket?.surface_kind === 'domain_stage_closeout_packet') {
    return explicitPacket;
  }
  return null;
}

export function legacyCloseoutPacketFromDomainHandlerOutput(output: Record<string, unknown>) {
  const rcaPacket = rcaCloseoutPacketFromDomainHandlerOutput(output);
  if (rcaPacket) {
    return rcaPacket;
  }
  const magPacket = magCloseoutPacketFromDomainHandlerOutput(output);
  if (magPacket) {
    return magPacket;
  }
  if (output.surface_kind !== 'mas_family_domain_handler_dispatch_receipt') {
    return null;
  }
  const dispatch = firstRecord(output.dispatch);
  const result = firstRecord(dispatch?.result);
  if (!result || result.surface !== 'real_paper_autonomy_provider_hosted_guarded_apply_receipt') {
    return null;
  }
  const receiptRef = optionalString(output.receipt_ref);
  const taskId = optionalString(output.task_id);
  const closeoutRefs = [
    receiptRef,
    taskId ? `mas-domain-handler-dispatch:${taskId}` : null,
  ].filter((entry): entry is string => Boolean(entry));
  if (closeoutRefs.length === 0) {
    return null;
  }
  const forbiddenGuard = firstRecord(result.forbidden_write_guard, output.forbidden_write_guard_proof);
  const publicationMemoryProof = firstRecord(result.publication_route_memory_final_proof);
  const consumedRefs = [
    ...stringList(result.source_refs),
    ...stringList(publicationMemoryProof?.consumed_refs),
  ];
  const writebackReceiptRefs = stringList(publicationMemoryProof?.writeback_receipt_refs);
  const typedBlockers = recordList(result.typed_blockers);
  const rejectedWrites = [
    ...typedBlockers,
    ...recordList(publicationMemoryProof?.typed_blocker ? [publicationMemoryProof.typed_blocker] : []),
  ];
  return {
    surface_kind: 'domain_stage_closeout_packet',
    closeout_refs: closeoutRefs,
    consumed_refs: consumedRefs,
    writeback_receipt_refs: writebackReceiptRefs,
    rejected_writes: rejectedWrites,
    next_owner: 'med-autoscience',
    domain_ready_verdict: optionalString(result.status) === 'typed_blocker'
      ? 'domain_gate_pending'
      : 'domain_owner_receipt_observed',
    route_impact: {
      decision: optionalString(result.status) ?? 'domain_handler_dispatch_receipt',
      guarded_apply_status: optionalString(result.guarded_apply_status),
      provider_attempt_state: optionalString(firstRecord(result.provider_attempt)?.attempt_state),
      receipt_ref: receiptRef,
      typed_blocker_count: typedBlockers.length,
      forbidden_write_guard_result: optionalString(forbiddenGuard?.aggregate_result ?? forbiddenGuard?.result),
      writes_performed: firstRecord(result.summary)?.writes_performed === true,
    },
    authority_boundary: isRecord(result.authority_boundary)
      ? result.authority_boundary
      : {
          opl: 'closeout_transport_only',
          domain: 'truth_quality_artifact_gate_owner',
    },
  };
}

function rcaCloseoutPacketFromDomainHandlerOutput(output: Record<string, unknown>) {
  if (output.surface_kind !== 'product_domain_handler_dispatch') {
    return null;
  }
  const result = firstRecord(output.result_surface);
  if (!result) {
    return null;
  }
  const action = optionalString(output.action);
  const evidenceRef = optionalString(result.evidence_ref);
  const runtimeLocatorRef = optionalString(result.runtime_locator_ref);
  const evidenceFile = optionalString(result.evidence_file);
  const taskId = optionalString(output.task_id);
  const closeoutRefs = [
    evidenceRef,
    runtimeLocatorRef,
    evidenceFile,
    taskId ? `redcube-domain-handler-dispatch:${taskId}` : null,
  ].filter((entry): entry is string => Boolean(entry));
  if (closeoutRefs.length === 0) {
    return null;
  }
  const typedBlockers = recordList(result.typed_blockers);
  const returnShape = optionalString(result.return_shape);
  return {
    surface_kind: 'domain_stage_closeout_packet',
    closeout_refs: closeoutRefs,
    consumed_refs: [
      ...stringList(result.source_refs),
      ...stringValues(result.source_manifest_refs),
    ],
    writeback_receipt_refs: [],
    rejected_writes: typedBlockers,
    next_owner: 'redcube-ai',
    domain_ready_verdict: 'domain_gate_pending',
    route_impact: {
      decision: returnShape ?? optionalString(result.surface_kind) ?? action ?? 'product_domain_handler_dispatch',
      action,
      result_surface_kind: optionalString(result.surface_kind),
      no_regression_evidence_observed: returnShape === 'no_regression_evidence' && Boolean(evidenceRef),
      no_regression_evidence_ref: evidenceRef,
      runtime_locator_ref: runtimeLocatorRef,
      evidence_file: evidenceFile,
      typed_blocker_count: typedBlockers.length,
      writes_performed: false,
    },
    authority_boundary: isRecord(output.owner_boundary)
      ? output.owner_boundary
      : {
          opl: 'closeout_transport_only',
          domain: 'truth_quality_artifact_gate_owner',
        },
  };
}

function magCloseoutPacketFromDomainHandlerOutput(output: Record<string, unknown>) {
  const dispatch = firstRecord(output.domain_handler_dispatch);
  if (
    !dispatch
    || dispatch.surface_kind !== 'mag_product_domain_handler_dispatch'
  ) {
    return null;
  }
  const result = firstRecord(dispatch.result);
  const resultReceiptRefs = firstRecord(result?.receipt_refs);
  const taskId = optionalString(dispatch.task_id);
  const action = optionalString(dispatch.action);
  const status = optionalString(dispatch.status);
  const returnShape = optionalString(result?.return_shape);
  const ownerReceiptRef = optionalString(resultReceiptRefs?.owner_receipt_ref);
  const lifecycleReceiptRef = optionalString(resultReceiptRefs?.lifecycle_receipt_ref);
  const noRegressionReceiptRef = returnShape === 'no_regression_evidence'
    ? optionalString(result?.receipt_ref) ?? ownerReceiptRef
    : null;
  const receiptRefs = [
    ...stringValues(dispatch.receipt_refs),
    ...stringValues(resultReceiptRefs),
    optionalString(result?.receipt_ref),
    taskId && action ? `mag-domain-handler-dispatch:${action}:${taskId}` : null,
  ].filter((entry): entry is string => Boolean(entry));
  if (receiptRefs.length === 0) {
    return null;
  }
  const typedBlockers = [
    ...recordList(dispatch.typed_blockers),
    ...recordList(result?.typed_blockers),
    ...(isRecord(result?.typed_blocker) ? [result.typed_blocker] : []),
  ];
  const decision = optionalString(result?.return_shape)
    ?? optionalString(result?.surface_kind)
    ?? status
    ?? action
    ?? 'mag_product_domain_handler_dispatch';
  const writesPerformed = firstRecord(result?.summary)?.writes_performed === true;
  return {
    surface_kind: 'domain_stage_closeout_packet',
    closeout_refs: receiptRefs,
    consumed_refs: [
      ...stringList(result?.source_refs),
      ...stringValues(result?.source_manifest_refs),
    ],
    consumed_memory_refs: stringList(result?.consumed_memory_refs),
    writeback_receipt_refs: stringList(result?.writeback_receipt_refs),
    rejected_writes: typedBlockers,
    next_owner: 'med-autogrant',
    domain_ready_verdict: 'domain_gate_pending',
    route_impact: {
      decision,
      action,
      status,
      result_surface_kind: optionalString(result?.surface_kind),
      receipt_status: optionalString(result?.receipt_status),
      owner_receipt_ref: ownerReceiptRef,
      lifecycle_receipt_ref: lifecycleReceiptRef,
      no_regression_evidence_ref: noRegressionReceiptRef,
      no_regression_evidence_observed: Boolean(noRegressionReceiptRef),
      lifecycle_receipt_observed: Boolean(lifecycleReceiptRef),
      typed_blocker_count: typedBlockers.length,
      writes_performed: writesPerformed,
    },
    authority_boundary: {
      opl: 'closeout_transport_only',
      domain: 'truth_quality_artifact_gate_owner',
    },
  };
}

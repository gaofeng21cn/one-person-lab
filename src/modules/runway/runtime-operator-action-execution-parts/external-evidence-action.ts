import { FrameworkContractError } from '../../charter/index.ts';

type JsonRecord = Record<string, unknown>;

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.map(stringValue).filter((entry): entry is string => Boolean(entry))
    : [];
}

function refsFromPayload(payload: JsonRecord, keys: string[]) {
  return keys.flatMap((key) => {
    const value = payload[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return [value.trim()];
    }
    return stringList(value);
  });
}

export function externalEvidenceApplyArgs(
  route: JsonRecord,
  payload: JsonRecord,
  commandOrSurfaceRef: string,
  options: { allowEmptyRecordPayload?: boolean } = {},
) {
  const args = stringList(route.opl_cli_args);
  if (args.length === 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'Unsupported OPL external evidence action route.', {
      command_or_surface_ref: commandOrSurfaceRef,
      supported_command:
        'opl agents evidence apply --domain <domain> --request-id <id> [--mode verify] [refs-only evidence inputs]',
    });
  }
  if (args[0] !== 'agents' || args[1] !== 'evidence' || args[2] !== 'apply') {
    throw new FrameworkContractError('contract_shape_invalid', 'OPL external evidence route has invalid opl_cli_args.', {
      action_id: stringValue(route.action_id),
      opl_cli_args: args,
    });
  }
  const actionKind = stringValue(route.action_kind);
  if (
    actionKind === 'external_evidence_receipt_verify'
    || actionKind === 'evidence_gate_receipt_verify'
    || actionKind === 'stage_production_evidence_receipt_verify'
    || actionKind === 'domain_dispatch_evidence_receipt_verify'
  ) {
    return args;
  }
  const functionalSemanticRecord =
    actionKind === 'functional_privatization_semantic_equivalence_receipt_record';
  const evidenceRefs = refsFromPayload(payload, [
    'evidence_refs',
    'evidence_ref',
    ...(functionalSemanticRecord
      ? ['semantic_equivalence_proof_refs', 'semantic_equivalence_proof_ref']
      : []),
  ]);
  const domainReceiptRefs = refsFromPayload(payload, [
    'domain_receipt_refs',
    'domain_receipt_ref',
    ...(functionalSemanticRecord ? ['domain_owner_receipt_refs', 'domain_owner_receipt_ref'] : []),
    'receipt_refs',
    'receipt_ref',
  ]);
  const typedBlockerRefs = refsFromPayload(payload, ['typed_blocker_refs', 'typed_blocker_ref']);
  const noRegressionRefs = refsFromPayload(payload, ['no_regression_refs', 'no_regression_ref']);
  const releaseDistRefs = refsFromPayload(payload, ['release_dist_refs', 'release_dist_ref']);
  const directHostedParityRefs = refsFromPayload(payload, [
    'direct_hosted_parity_refs',
    'direct_hosted_parity_ref',
    ...(functionalSemanticRecord
      ? [
          'opl_generated_or_hosted_surface_consumption_refs',
          'opl_generated_or_hosted_surface_consumption_ref',
        ]
      : []),
  ]);
  const ownerChainRefs = refsFromPayload(payload, ['owner_chain_refs', 'owner_chain_ref']);
  const sourceScopeRefs = refsFromPayload(payload, ['source_scope_refs', 'source_scope_ref']);
  const runtimeEventRefs = refsFromPayload(payload, ['runtime_event_refs', 'runtime_event_ref']);
  const memoryWritebackReceiptRefs = refsFromPayload(payload, [
    'memory_writeback_receipt_refs',
    'memory_writeback_receipt_ref',
  ]);
  const artifactMutationReceiptRefs = refsFromPayload(payload, [
    'artifact_mutation_receipt_refs',
    'artifact_mutation_receipt_ref',
  ]);
  const packageLifecycleReceiptRefs = refsFromPayload(payload, [
    'package_lifecycle_receipt_refs',
    'package_lifecycle_receipt_ref',
  ]);
  const lifecycleReceiptRefs = refsFromPayload(payload, [
    'lifecycle_receipt_refs',
    'lifecycle_receipt_ref',
  ]);
  const restoreProofRefs = refsFromPayload(payload, [
    'restore_proof_refs',
    'restore_proof_ref',
  ]);
  const receiptRef = stringValue(payload.receipt_ref);
  const receiptSemantics = stringValue(payload.receipt_semantics);
  const extraArgs = [
    ...evidenceRefs.flatMap((ref) => ['--evidence-ref', ref]),
    ...domainReceiptRefs.flatMap((ref) => ['--domain-receipt-ref', ref]),
    ...typedBlockerRefs.flatMap((ref) => ['--typed-blocker-ref', ref]),
    ...noRegressionRefs.flatMap((ref) => ['--no-regression-ref', ref]),
    ...releaseDistRefs.flatMap((ref) => ['--release-dist-ref', ref]),
    ...directHostedParityRefs.flatMap((ref) => ['--direct-hosted-parity-ref', ref]),
    ...ownerChainRefs.flatMap((ref) => ['--owner-chain-ref', ref]),
    ...sourceScopeRefs.flatMap((ref) => ['--source-scope-ref', ref]),
    ...runtimeEventRefs.flatMap((ref) => ['--runtime-event-ref', ref]),
    ...memoryWritebackReceiptRefs.flatMap((ref) => ['--memory-writeback-receipt-ref', ref]),
    ...artifactMutationReceiptRefs.flatMap((ref) => ['--artifact-mutation-receipt-ref', ref]),
    ...packageLifecycleReceiptRefs.flatMap((ref) => ['--package-lifecycle-receipt-ref', ref]),
    ...lifecycleReceiptRefs.flatMap((ref) => ['--lifecycle-receipt-ref', ref]),
    ...restoreProofRefs.flatMap((ref) => ['--restore-proof-ref', ref]),
    ...(receiptSemantics ? ['--receipt-semantics', receiptSemantics] : []),
    ...(receiptRef ? ['--receipt-ref', receiptRef] : []),
  ];
  if (extraArgs.length === 0) {
    if (options.allowEmptyRecordPayload === true) {
      return args;
    }
    throw new FrameworkContractError('cli_usage_error', 'External evidence record action requires refs-only payload evidence.', {
      action_id: stringValue(route.action_id),
      required_any: [
        'evidence_refs',
        'domain_receipt_refs',
        'typed_blocker_refs',
        'source_scope_refs',
        'runtime_event_refs',
        'no_regression_refs',
        'release_dist_refs',
        'direct_hosted_parity_refs',
        'owner_chain_refs',
        'memory_writeback_receipt_refs',
        'artifact_mutation_receipt_refs',
        'package_lifecycle_receipt_refs',
        'lifecycle_receipt_refs',
        'restore_proof_refs',
      ],
    });
  }
  return [...args, ...extraArgs];
}

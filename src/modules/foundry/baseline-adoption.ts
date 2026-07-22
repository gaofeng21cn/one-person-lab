import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import {
  foundryContentDigest,
  validateDesignRequest,
  type DesignRequest,
} from './protocol.ts';
import {
  validateOwnerGateVerification,
  validateOwnerGateVerificationContext,
} from './owner-gate.ts';
import type {
  ActivationPointer,
  AgentVersion,
  OwnerGate,
  VersionRegistry,
} from './ports.ts';

export const BASELINE_ADOPTION_PREFLIGHT_VERSION = 'opl-foundry-baseline-adoption-preflight.v1' as const;

export const BASELINE_ADOPTION_FAILURE_CODES = [
  'foundry_baseline_adoption_contract_missing',
  'foundry_baseline_adoption_contract_invalid',
  'foundry_baseline_adoption_run_id_missing',
  'foundry_baseline_adoption_mode_must_be_improve',
  'foundry_baseline_adoption_target_version_missing',
  'foundry_baseline_adoption_target_version_invalid',
  'foundry_baseline_adoption_source_refs_missing',
  'foundry_baseline_adoption_source_refs_invalid',
  'foundry_baseline_adoption_evidence_refs_missing',
  'foundry_baseline_adoption_evidence_refs_invalid',
  'foundry_baseline_adoption_permission_refs_missing',
  'foundry_baseline_adoption_qualification_obligations_missing',
  'foundry_baseline_adoption_qualification_obligations_invalid',
  'foundry_baseline_adoption_owner_authorization_missing',
  'foundry_baseline_adoption_owner_authorization_invalid',
  'foundry_baseline_adoption_content_resolver_unconfigured',
  'foundry_baseline_adoption_content_unavailable',
  'foundry_baseline_adoption_target_version_registry_unavailable',
  'foundry_baseline_adoption_target_version_unregistered',
  'foundry_baseline_adoption_registered_version_mismatch',
  'foundry_baseline_adoption_currentness_unavailable',
  'foundry_baseline_adoption_active_version_missing',
  'foundry_baseline_adoption_target_version_not_current',
  'foundry_baseline_adoption_owner_authorization_unverified',
] as const;

export type BaselineAdoptionFailureCode = typeof BASELINE_ADOPTION_FAILURE_CODES[number];

export interface BaselineAdoptionFailureDetail {
  code: BaselineAdoptionFailureCode;
  message: string;
  refs: string[];
}

export interface BaselineAdoptionContentRefResolver {
  has(ref: string): boolean | Promise<boolean>;
}

export interface BaselineAdoptionPreflightReceipt {
  surface_kind: 'opl_foundry_baseline_adoption_preflight_receipt';
  version: typeof BASELINE_ADOPTION_PREFLIGHT_VERSION;
  disposition: 'admitted' | 'blocked';
  invocation_status: 'not_invoked';
  run_id: string | null;
  request_digest: string | null;
  target_agent_id: string | null;
  target_domain_id: string | null;
  target_version_ref: string | null;
  registered_version_id: string | null;
  registered_version_ref: string | null;
  active_version_ref: string | null;
  activation_revision: number | null;
  owner_authorization_ref: string | null;
  owner_verification_ref: string | null;
  source_refs: string[];
  evidence_refs: string[];
  permission_refs: string[];
  qualification_obligation_refs: string[];
  content_refs_verified: boolean;
  failure_code: BaselineAdoptionFailureCode | null;
  failure_codes: BaselineAdoptionFailureCode[];
  failure_details: BaselineAdoptionFailureDetail[];
  currentness: {
    active_version_required: true;
    active_version_matches_target: boolean | null;
    historical_evidence_retained: true;
  };
  authority_boundary: {
    authority_mutation_performed: false;
    foundry_object_written: false;
    foundry_run_created: false;
    provider_invoked: false;
    registry_written: false;
    qualification_established: false;
    activation_performed: false;
    rollback_performed: false;
    permissions_expanded: false;
  };
  checked_at: string;
}

export interface BaselineAdoptionPreflightDependencies {
  versions: Pick<VersionRegistry, 'resolveVersion' | 'activation'>;
  ownerGate: OwnerGate;
  contentRefs?: BaselineAdoptionContentRefResolver;
  now?: () => string;
}

type ReceiptContext = {
  run_id: string | null;
  request_digest: string | null;
  target_agent_id: string | null;
  target_domain_id: string | null;
  target_version_ref: string | null;
  registered_version: AgentVersion | null;
  activation: ActivationPointer | null;
  owner_authorization_ref: string | null;
  owner_verification_ref: string | null;
  source_refs: string[];
  evidence_refs: string[];
  permission_refs: string[];
  qualification_obligation_refs: string[];
  content_refs_verified: boolean;
  active_version_matches_target: boolean | null;
};

const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
const CONTENT_REF_PATTERN = /^opl-content:\/\/sha256\/[a-f0-9]{64}$/;
const OWNER_RECEIPT_REF_PATTERN = /^opl:\/\/foundry\/owner-authority-receipts\/sha256:[a-f0-9]{64}$/;

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.map(stringValue).filter((entry): entry is string => entry !== null)
    : [];
}

function uniqueFailures(failures: BaselineAdoptionFailureDetail[]) {
  const seen = new Set<BaselineAdoptionFailureCode>();
  return failures.filter((failure) => {
    if (seen.has(failure.code)) return false;
    seen.add(failure.code);
    return true;
  });
}

function failure(
  code: BaselineAdoptionFailureCode,
  message: string,
  refs: string[] = [],
): BaselineAdoptionFailureDetail {
  return { code, message, refs };
}

function safeRequestDigest(value: unknown) {
  if (!isRecord(value)) return null;
  try {
    return foundryContentDigest(value);
  } catch {
    return null;
  }
}

function baseContext(requestValue: unknown, runIdValue: unknown): ReceiptContext {
  const request = isRecord(requestValue) ? requestValue : {};
  const baseline = isRecord(request.baseline_adoption) ? request.baseline_adoption : {};
  const constraints = isRecord(request.constraints) ? request.constraints : {};
  return {
    run_id: stringValue(runIdValue),
    request_digest: safeRequestDigest(requestValue),
    target_agent_id: stringValue(request.target_agent_id),
    target_domain_id: stringValue(request.target_domain_id),
    target_version_ref: stringValue(request.target_version_ref),
    registered_version: null,
    activation: null,
    owner_authorization_ref: stringValue(baseline.owner_authorization_ref),
    owner_verification_ref: null,
    source_refs: stringList(request.source_refs),
    evidence_refs: stringList(baseline.evidence_refs),
    permission_refs: stringList(constraints.permission_refs),
    qualification_obligation_refs: stringList(baseline.qualification_obligation_refs),
    content_refs_verified: false,
    active_version_matches_target: null,
  };
}

function receipt(
  context: ReceiptContext,
  failures: BaselineAdoptionFailureDetail[],
  checkedAt: string,
): BaselineAdoptionPreflightReceipt {
  const exactFailures = uniqueFailures(failures);
  const failureCodes = exactFailures.map(({ code }) => code);
  return {
    surface_kind: 'opl_foundry_baseline_adoption_preflight_receipt',
    version: BASELINE_ADOPTION_PREFLIGHT_VERSION,
    disposition: failureCodes.length === 0 ? 'admitted' : 'blocked',
    invocation_status: 'not_invoked',
    run_id: context.run_id,
    request_digest: context.request_digest,
    target_agent_id: context.target_agent_id,
    target_domain_id: context.target_domain_id,
    target_version_ref: context.target_version_ref,
    registered_version_id: context.registered_version?.version_id ?? null,
    registered_version_ref: context.registered_version?.version_digest ?? null,
    active_version_ref: context.activation?.active_version_digest ?? null,
    activation_revision: context.activation?.revision ?? null,
    owner_authorization_ref: context.owner_authorization_ref,
    owner_verification_ref: context.owner_verification_ref,
    source_refs: context.source_refs,
    evidence_refs: context.evidence_refs,
    permission_refs: context.permission_refs,
    qualification_obligation_refs: context.qualification_obligation_refs,
    content_refs_verified: context.content_refs_verified,
    failure_code: failureCodes[0] ?? null,
    failure_codes: failureCodes,
    failure_details: exactFailures,
    currentness: {
      active_version_required: true,
      active_version_matches_target: context.active_version_matches_target,
      historical_evidence_retained: true,
    },
    authority_boundary: {
      authority_mutation_performed: false,
      foundry_object_written: false,
      foundry_run_created: false,
      provider_invoked: false,
      registry_written: false,
      qualification_established: false,
      activation_performed: false,
      rollback_performed: false,
      permissions_expanded: false,
    },
    checked_at: checkedAt,
  };
}

function staticFailures(value: unknown, context: ReceiptContext) {
  const request = isRecord(value) ? value : {};
  const baseline = isRecord(request.baseline_adoption) ? request.baseline_adoption : null;
  const failures: BaselineAdoptionFailureDetail[] = [];
  if (!isRecord(value)) {
    failures.push(failure('foundry_baseline_adoption_contract_invalid', 'DesignRequest must be an object.'));
  }
  if (!context.run_id) {
    failures.push(failure('foundry_baseline_adoption_run_id_missing', 'Baseline adoption must bind one FoundryRun id.'));
  }
  if (!Object.hasOwn(request, 'baseline_adoption')) {
    failures.push(failure(
      'foundry_baseline_adoption_contract_missing',
      'DesignRequest does not declare the baseline_adoption machine contract.',
    ));
  } else if (!baseline) {
    failures.push(failure('foundry_baseline_adoption_contract_invalid', 'baseline_adoption must be an object.'));
  }
  if (request.mode !== 'improve') {
    failures.push(failure(
      'foundry_baseline_adoption_mode_must_be_improve',
      'Baseline adoption cannot use create or takeover; DesignRequest.mode must be improve.',
    ));
  }
  if (!context.target_version_ref) {
    failures.push(failure(
      'foundry_baseline_adoption_target_version_missing',
      'Baseline adoption requires an exact registered target AgentVersion digest.',
    ));
  } else if (!DIGEST_PATTERN.test(context.target_version_ref)) {
    failures.push(failure(
      'foundry_baseline_adoption_target_version_invalid',
      'target_version_ref must be an AgentVersion SHA-256 digest, not a package or installation ref.',
      [context.target_version_ref],
    ));
  }
  if (context.source_refs.length === 0) {
    failures.push(failure('foundry_baseline_adoption_source_refs_missing', 'At least one source content ref is required.'));
  } else if (context.source_refs.some((ref) => !CONTENT_REF_PATTERN.test(ref))) {
    failures.push(failure(
      'foundry_baseline_adoption_source_refs_invalid',
      'All source refs must be exact opl-content SHA-256 refs.',
      context.source_refs.filter((ref) => !CONTENT_REF_PATTERN.test(ref)),
    ));
  }
  if (context.permission_refs.length === 0) {
    failures.push(failure(
      'foundry_baseline_adoption_permission_refs_missing',
      'The target permission_refs closure must be preserved exactly and cannot be inferred.',
    ));
  }
  if (!context.owner_authorization_ref) {
    failures.push(failure(
      'foundry_baseline_adoption_owner_authorization_missing',
      'An exact target-owner authorization receipt is required before FoundryRun creation.',
    ));
  } else if (!OWNER_RECEIPT_REF_PATTERN.test(context.owner_authorization_ref)) {
    failures.push(failure(
      'foundry_baseline_adoption_owner_authorization_invalid',
      'owner_authorization_ref must bind an exact content-addressed OwnerGate receipt.',
      [context.owner_authorization_ref],
    ));
  }
  if (context.evidence_refs.length === 0) {
    failures.push(failure('foundry_baseline_adoption_evidence_refs_missing', 'At least one evidence content ref is required.'));
  } else if (context.evidence_refs.some((ref) => !CONTENT_REF_PATTERN.test(ref))) {
    failures.push(failure(
      'foundry_baseline_adoption_evidence_refs_invalid',
      'All evidence refs must be exact opl-content SHA-256 refs.',
      context.evidence_refs.filter((ref) => !CONTENT_REF_PATTERN.test(ref)),
    ));
  }
  if (context.qualification_obligation_refs.length === 0) {
    failures.push(failure(
      'foundry_baseline_adoption_qualification_obligations_missing',
      'At least one content-addressed qualification obligation set is required.',
    ));
  } else if (context.qualification_obligation_refs.some((ref) => !CONTENT_REF_PATTERN.test(ref))) {
    failures.push(failure(
      'foundry_baseline_adoption_qualification_obligations_invalid',
      'Qualification obligation refs must be exact opl-content SHA-256 refs.',
      context.qualification_obligation_refs.filter((ref) => !CONTENT_REF_PATTERN.test(ref)),
    ));
  }
  return failures;
}

function exactRegisteredVersion(request: DesignRequest, version: AgentVersion) {
  return version.surface_kind === 'opl_foundry_agent_version'
    && version.version_digest === request.target_version_ref
    && version.target_agent_id === request.target_agent_id
    && version.target_domain_id === request.target_domain_id
    && DIGEST_PATTERN.test(version.blueprint_digest)
    && DIGEST_PATTERN.test(version.candidate_digest)
    && DIGEST_PATTERN.test(version.qualification_digest);
}

export function isBaselineAdoptionDesignRequest(value: unknown): value is DesignRequest & {
  baseline_adoption: NonNullable<DesignRequest['baseline_adoption']>;
} {
  return isRecord(value) && Object.hasOwn(value, 'baseline_adoption');
}

export async function preflightFoundryBaselineAdoption(
  input: { request: unknown; run_id: unknown },
  dependencies: BaselineAdoptionPreflightDependencies,
): Promise<BaselineAdoptionPreflightReceipt> {
  const checkedAt = (dependencies.now ?? (() => new Date().toISOString()))();
  const context = baseContext(input.request, input.run_id);
  const failures = staticFailures(input.request, context);
  if (failures.length > 0) return receipt(context, failures, checkedAt);

  let request: DesignRequest;
  try {
    request = validateDesignRequest(input.request);
  } catch (error) {
    return receipt(context, [failure(
      'foundry_baseline_adoption_contract_invalid',
      error instanceof Error ? error.message : 'DesignRequest validation failed.',
    )], checkedAt);
  }

  if (!dependencies.contentRefs) {
    return receipt(context, [failure(
      'foundry_baseline_adoption_content_resolver_unconfigured',
      'Baseline adoption cannot verify source, evidence, and qualification content availability.',
    )], checkedAt);
  }
  const allContentRefs = [
    ...request.source_refs,
    ...request.baseline_adoption!.evidence_refs,
    ...request.baseline_adoption!.qualification_obligation_refs,
  ];
  const unavailable: string[] = [];
  try {
    for (const ref of allContentRefs) {
      if (!await dependencies.contentRefs.has(ref)) unavailable.push(ref);
    }
  } catch (error) {
    return receipt(context, [failure(
      'foundry_baseline_adoption_content_unavailable',
      error instanceof Error ? error.message : 'Content availability verification failed.',
      allContentRefs,
    )], checkedAt);
  }
  if (unavailable.length > 0) {
    return receipt(context, [failure(
      'foundry_baseline_adoption_content_unavailable',
      'One or more required source, evidence, or qualification content refs are unavailable.',
      unavailable,
    )], checkedAt);
  }
  context.content_refs_verified = true;

  let registered: AgentVersion | null;
  try {
    registered = await dependencies.versions.resolveVersion(
      request.target_version_ref,
      request.target_agent_id,
      request.target_domain_id,
    );
  } catch (error) {
    return receipt(context, [failure(
      'foundry_baseline_adoption_target_version_registry_unavailable',
      error instanceof Error ? error.message : 'AgentVersion registry read failed.',
    )], checkedAt);
  }
  if (!registered) {
    return receipt(context, [failure(
      'foundry_baseline_adoption_target_version_unregistered',
      'target_version_ref does not resolve to a registered AgentVersion; package evidence is not a substitute.',
      [request.target_version_ref!],
    )], checkedAt);
  }
  context.registered_version = registered;
  if (!exactRegisteredVersion(request, registered)) {
    return receipt(context, [failure(
      'foundry_baseline_adoption_registered_version_mismatch',
      'The registry result does not bind the exact target identity, version, candidate, and qualification records.',
      [registered.version_digest],
    )], checkedAt);
  }

  try {
    context.activation = await dependencies.versions.activation(
      request.target_agent_id,
      request.target_domain_id,
    );
  } catch (error) {
    return receipt(context, [failure(
      'foundry_baseline_adoption_currentness_unavailable',
      error instanceof Error ? error.message : 'Activation currentness read failed.',
    )], checkedAt);
  }
  if (context.activation.active_version_digest === null) {
    context.active_version_matches_target = false;
    return receipt(context, [failure(
      'foundry_baseline_adoption_active_version_missing',
      'The target has no active AgentVersion.',
    )], checkedAt);
  }
  context.active_version_matches_target = context.activation.active_version_digest === request.target_version_ref;
  if (!context.active_version_matches_target) {
    return receipt(context, [failure(
      'foundry_baseline_adoption_target_version_not_current',
      'Only the exact active AgentVersion may be adopted as the improve baseline; historical evidence remains retained.',
      [request.target_version_ref!, context.activation.active_version_digest],
    )], checkedAt);
  }

  const ownerContext = validateOwnerGateVerificationContext({
    surface_kind: 'opl_foundry_owner_gate_verification_context',
    version: 'opl-foundry-owner-gate-verification-context.v1',
    authority_receipt_ref: request.baseline_adoption!.owner_authorization_ref,
    action: 'authorize_improve',
    decision: 'approve',
    target_agent_id: request.target_agent_id,
    target_domain_id: request.target_domain_id,
    run_id: context.run_id,
    version_digest: request.target_version_ref,
    expected_revision: context.activation.revision,
  });
  try {
    const verification = validateOwnerGateVerification(
      ownerContext,
      await dependencies.ownerGate.verify(ownerContext),
    );
    context.owner_verification_ref = verification.verification_ref;
  } catch (error) {
    return receipt(context, [failure(
      'foundry_baseline_adoption_owner_authorization_unverified',
      error instanceof Error ? error.message : 'Owner authorization verification failed.',
      [request.baseline_adoption!.owner_authorization_ref],
    )], checkedAt);
  }
  return receipt(context, [], checkedAt);
}

export class BaselineAdoptionPreflightError extends FrameworkContractError {
  readonly receipt: BaselineAdoptionPreflightReceipt;

  constructor(receiptValue: BaselineAdoptionPreflightReceipt) {
    super(
      'contract_shape_invalid',
      `Foundry baseline adoption preflight blocked: ${receiptValue.failure_code ?? 'unknown_failure'}.`,
      {
        failure_code: receiptValue.failure_code,
        failure_codes: receiptValue.failure_codes,
        preflight_receipt: receiptValue,
      },
    );
    this.name = 'BaselineAdoptionPreflightError';
    this.receipt = receiptValue;
  }
}

export function assertBaselineAdoptionAdmitted(receiptValue: BaselineAdoptionPreflightReceipt) {
  if (receiptValue.disposition !== 'admitted' || receiptValue.failure_codes.length > 0) {
    throw new BaselineAdoptionPreflightError(receiptValue);
  }
  return receiptValue;
}

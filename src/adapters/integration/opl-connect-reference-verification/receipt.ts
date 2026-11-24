import crypto from 'node:crypto';

import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import { validateJsonSchemaPayload } from '../../../kernel/schema-registry.ts';
import type {
  InstalledPackageRuntimeModuleContext,
  LoadedInstalledPackageRuntimeModule,
} from '../agent-package-registry-parts/installed-runtime-module.ts';
import {
  providerDefinition,
  type ProviderId,
  type ReferenceProviderDefinition,
} from './provider-registry.ts';
import type { ReferenceRecord } from './reference-normalization.ts';
import type {
  ReferenceAdapterRequest,
  RetryAttempt,
} from './transport.ts';

export type ProviderMatchStatus = 'identifier_matched' | 'metadata_conflict' | 'provider_found' | 'deferred' | 'error';

export type MismatchDetail = {
  field: 'doi' | 'pmid' | 'pmcid' | 'title';
  expected: string;
  actual: string;
  normalized_expected: string;
  normalized_actual: string;
};

export type ReferenceMatchAssessment = {
  match_status: 'identifier_matched' | 'metadata_conflict' | 'provider_found';
  matched_identifiers: Record<string, string>;
  mismatch_details: MismatchDetail[];
  deferred_reason?: string;
  deferred_code?: 'provider_metadata_conflict' | 'provider_found_without_identifier_match';
};

export type ProviderEvidence = {
  reference_id: string;
  provider: string;
  provider_id: ProviderId;
  lookup_status: 'found' | 'not_found' | 'deferred' | 'error';
  status: 'matched' | 'deferred';
  match_schema_version: 'strict_provider_match_v1';
  match_status: ProviderMatchStatus;
  deferred_reason?: string;
  match_basis: 'doi' | 'pmid' | 'pmcid' | 'title' | 'none';
  receipt_ref: string;
  matched_identifiers: Record<string, string>;
  provider_identifiers: Record<string, string>;
  mismatch_details: MismatchDetail[];
  metadata: {
    title?: string;
    year?: string;
    journal?: string;
    authors?: string[];
    abstract?: string;
    article_types?: string[];
  };
  retraction_or_update_flags: Record<string, unknown>;
  verification_scope: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  normalized: {
    doi: string | null;
    pmid: string | null;
    pmcid: string | null;
    title: string | null;
  };
  cache: {
    status: 'disabled' | 'hit' | 'miss';
    write_status: string;
    cache_ref: string | null;
  };
  retry_attempts: RetryAttempt[];
};

export type ProviderEvidenceError = NonNullable<ProviderEvidence['error']>;
export type ProviderEvidenceDraft = Omit<ProviderEvidence, 'receipt_ref'>;

export const STRICT_MATCH_SCHEMA_VERSION = 'strict_provider_match_v1';

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function adapterContractFailure(error: unknown, context: Record<string, unknown>): never {
  const errorRecord = typeof error === 'object' && error !== null
    ? error as Record<string, unknown>
    : {};
  const details = asRecord(errorRecord.details);
  throw new FrameworkContractError(
    'codex_command_failed',
    'OPL Connect reference provider adapter returned an invalid contract result.',
    {
      ...context,
      adapter_code: asString(errorRecord.code),
      adapter_details: details,
      cause: error instanceof Error ? error.message : String(error),
      reason_code: 'reference_provider_adapter_contract_error',
    },
  );
}

export function deferredEvidence(
  reference: ReferenceRecord,
  providerId: ProviderId,
  reason: string,
  verificationScopeOverride: Record<string, unknown> = {},
  runtime: InstalledPackageRuntimeModuleContext,
): ProviderEvidenceDraft {
  return {
    reference_id: reference.id,
    provider: providerName(providerId, runtime),
    provider_id: providerId,
    lookup_status: 'deferred',
    status: 'deferred',
    match_schema_version: STRICT_MATCH_SCHEMA_VERSION,
    match_status: 'deferred',
    deferred_reason: reason,
    match_basis: 'none',
    matched_identifiers: identifiersFromReference(reference),
    provider_identifiers: {},
    mismatch_details: [],
    metadata: metadataFromReference(reference),
    retraction_or_update_flags: {},
    verification_scope: {
      ...verificationScope(providerId, runtime),
      ...verificationScopeOverride,
    },
    error: {
      code: 'provider_receipt_requirement_deferred',
      message: reason,
    },
    normalized: {
      doi: reference.doi,
      pmid: reference.pmid,
      pmcid: reference.pmcid,
      title: reference.title,
    },
    cache: {
      status: 'disabled',
      write_status: 'skipped',
      cache_ref: null,
    },
    retry_attempts: [],
  };
}

export function providerErrorEvidence(
  reference: ReferenceRecord,
  providerId: ProviderId,
  error: unknown,
  runtime: InstalledPackageRuntimeModuleContext,
): ProviderEvidenceDraft {
  const payload = providerErrorPayload(error);
  return {
    reference_id: reference.id,
    provider: providerName(providerId, runtime),
    provider_id: providerId,
    lookup_status: 'error',
    status: 'deferred',
    match_schema_version: STRICT_MATCH_SCHEMA_VERSION,
    match_status: 'error',
    deferred_reason: payload.message,
    match_basis: 'none',
    matched_identifiers: identifiersFromReference(reference),
    provider_identifiers: {},
    mismatch_details: [],
    metadata: metadataFromReference(reference),
    retraction_or_update_flags: {},
    verification_scope: verificationScope(providerId, runtime),
    error: payload,
    normalized: {
      doi: reference.doi,
      pmid: reference.pmid,
      pmcid: reference.pmcid,
      title: reference.title,
    },
    cache: {
      status: 'disabled',
      write_status: 'skipped',
      cache_ref: null,
    },
    retry_attempts: retryAttemptsFromError(error),
  };
}

function providerErrorPayload(error: unknown): ProviderEvidenceError {
  if (error instanceof FrameworkContractError) {
    return {
      code: typeof error.details?.reason_code === 'string'
        ? error.details.reason_code
        : typeof error.details?.status === 'number' ? 'provider_non_ok_status' : 'provider_request_failed',
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    };
  }
  return {
    code: 'provider_request_failed',
    message: error instanceof Error ? error.message : String(error),
    ...(error instanceof Error ? { details: { error_name: error.name } } : {}),
  };
}

export function retryAttemptsFromError(error: unknown): RetryAttempt[] {
  const attempts = error instanceof FrameworkContractError ? error.details?.retry_attempts : null;
  return Array.isArray(attempts) ? attempts as RetryAttempt[] : [];
}

export function foundEvidence(
  reference: ReferenceRecord,
  input: {
    provider: ProviderEvidence['provider'];
    provider_id: ProviderId;
    match_basis: ProviderEvidence['match_basis'];
    provider_identifiers: Record<string, string | null | undefined>;
    metadata: ProviderEvidence['metadata'];
    retraction_or_update_flags: Record<string, unknown>;
    normalized: Pick<ReferenceRecord, 'doi' | 'pmid' | 'pmcid' | 'title'>;
    match_assessment: ReferenceMatchAssessment;
    retry_attempts: RetryAttempt[];
    verification_scope?: Record<string, unknown>;
  },
): ProviderEvidenceDraft {
  const providerIdentifiers = compactIdentifiers(input.provider_identifiers);
  const assessment = input.match_assessment;
  const mismatchDetails = assessment.mismatch_details;
  const matchedIdentifiers = assessment.matched_identifiers;
  const matchStatus = assessment.match_status;
  const status = matchStatus === 'identifier_matched' ? 'matched' : 'deferred';
  const deferredReason = assessment.deferred_reason;
  return {
    reference_id: reference.id,
    provider: input.provider,
    provider_id: input.provider_id,
    lookup_status: 'found',
    status,
    match_schema_version: STRICT_MATCH_SCHEMA_VERSION,
    match_status: matchStatus,
    ...(status === 'deferred' ? { deferred_reason: deferredReason } : {}),
    match_basis: input.match_basis,
    matched_identifiers: matchedIdentifiers,
    provider_identifiers: providerIdentifiers,
    mismatch_details: mismatchDetails,
    metadata: input.metadata,
    retraction_or_update_flags: input.retraction_or_update_flags,
    verification_scope: input.verification_scope ?? {},
    ...(status === 'deferred' ? {
      error: {
        code: assessment.deferred_code!,
        message: deferredReason!,
        details: {
          match_status: matchStatus,
          mismatch_details: mismatchDetails,
          provider_identifiers: providerIdentifiers,
        },
      },
    } : {}),
    normalized: input.normalized,
    cache: {
      status: 'disabled',
      write_status: 'skipped',
      cache_ref: null,
    },
    retry_attempts: input.retry_attempts,
  };
}

export function adapterStringMap(value: unknown, providerId: ProviderId, field: string): Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new FrameworkContractError(
      'codex_command_failed',
      'Reference provider adapter returned an invalid string map.',
      { provider_id: providerId, field, reason_code: 'reference_provider_adapter_evidence_invalid' },
    );
  }
  const record = value as Record<string, unknown>;
  if (Object.values(record).some((entry) => typeof entry !== 'string')) {
    throw new FrameworkContractError(
      'codex_command_failed',
      'Reference provider adapter returned a string map with non-string values.',
      { provider_id: providerId, field, reason_code: 'reference_provider_adapter_evidence_invalid' },
    );
  }
  return record as Record<string, string>;
}

function adapterOptionalString(value: unknown, providerId: ProviderId, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new FrameworkContractError(
      'codex_command_failed',
      'Reference provider adapter returned an invalid normalized field.',
      { provider_id: providerId, field, reason_code: 'reference_provider_adapter_evidence_invalid' },
    );
  }
  return value;
}

export function adapterMatchAssessment(value: unknown, providerId: ProviderId): ReferenceMatchAssessment {
  const assessment = asRecord(value);
  const matchStatus = asString(assessment.match_status);
  const mismatchDetails = assessment.mismatch_details;
  if (!['identifier_matched', 'metadata_conflict', 'provider_found'].includes(matchStatus ?? '')
    || !Array.isArray(mismatchDetails)) {
    throw new FrameworkContractError(
      'codex_command_failed',
      'Reference provider adapter returned an invalid match assessment.',
      { provider_id: providerId, reason_code: 'reference_provider_adapter_evidence_invalid' },
    );
  }
  const details = mismatchDetails.map((entry): MismatchDetail => {
    const detail = asRecord(entry);
    const field = asString(detail.field);
    if (!['doi', 'pmid', 'pmcid', 'title'].includes(field ?? '')
      || !['expected', 'actual', 'normalized_expected', 'normalized_actual']
        .every((key) => typeof detail[key] === 'string')) {
      throw new FrameworkContractError(
        'codex_command_failed',
        'Reference provider adapter returned invalid mismatch details.',
        { provider_id: providerId, reason_code: 'reference_provider_adapter_evidence_invalid' },
      );
    }
    return detail as MismatchDetail;
  });
  const matchedIdentifiers = adapterStringMap(assessment.matched_identifiers, providerId, 'match_assessment.matched_identifiers');
  const deferredReason = asString(assessment.deferred_reason);
  const deferredCode = asString(assessment.deferred_code);
  const valid = matchStatus === 'identifier_matched'
    ? Object.keys(matchedIdentifiers).length > 0 && details.length === 0 && !deferredReason && !deferredCode
    : matchStatus === 'metadata_conflict'
      ? details.length > 0 && Boolean(deferredReason) && deferredCode === 'provider_metadata_conflict'
      : Object.keys(matchedIdentifiers).length === 0 && details.length === 0
        && Boolean(deferredReason) && deferredCode === 'provider_found_without_identifier_match';
  if (!valid) {
    throw new FrameworkContractError(
      'codex_command_failed',
      'Reference provider adapter returned an inconsistent match assessment.',
      { provider_id: providerId, reason_code: 'reference_provider_adapter_evidence_invalid' },
    );
  }
  return {
    match_status: matchStatus as ReferenceMatchAssessment['match_status'],
    matched_identifiers: matchedIdentifiers,
    mismatch_details: details,
    ...(deferredReason ? { deferred_reason: deferredReason } : {}),
    ...(deferredCode ? { deferred_code: deferredCode as ReferenceMatchAssessment['deferred_code'] } : {}),
  };
}

export function adapterEvidenceToProviderEvidence(
  reference: ReferenceRecord,
  provider: ReferenceProviderDefinition,
  rawEvidence: unknown,
  retryAttempts: RetryAttempt[],
  runtime: InstalledPackageRuntimeModuleContext,
  verificationScopeOverride: Record<string, unknown> = {},
): ProviderEvidenceDraft {
  const evidence = asRecord(rawEvidence);
  const matchBasis = asString(evidence.match_basis);
  const allowedMatchBases = new Set(['doi', 'pmid', 'pmcid', 'title', 'none']);
  if (!matchBasis || !allowedMatchBases.has(matchBasis)) {
    throw new FrameworkContractError(
      'codex_command_failed',
      'Reference provider adapter returned an invalid match basis.',
      { provider_id: provider.provider_id, match_basis: matchBasis, reason_code: 'reference_provider_adapter_evidence_invalid' },
    );
  }
  const normalizedRecord = asRecord(evidence.normalized);
  const normalized = {
    doi: adapterOptionalString(normalizedRecord.doi, provider.provider_id, 'normalized.doi'),
    pmid: adapterOptionalString(normalizedRecord.pmid, provider.provider_id, 'normalized.pmid'),
    pmcid: adapterOptionalString(normalizedRecord.pmcid, provider.provider_id, 'normalized.pmcid'),
    title: adapterOptionalString(normalizedRecord.title, provider.provider_id, 'normalized.title'),
  };
  const verificationScope = asRecord(evidence.verification_scope);
  if (matchBasis === 'none') {
    const reason = asString(verificationScope.adapter_deferred_reason)
      ?? `${provider.provider_id} provider returned no usable metadata`;
    return deferredEvidence(
      reference,
      provider.provider_id,
      reason,
      { ...verificationScope, ...verificationScopeOverride },
      runtime,
    );
  }
  return foundEvidence(reference, {
    provider: provider.receipt_provider_name,
    provider_id: provider.provider_id,
    match_basis: matchBasis as ProviderEvidence['match_basis'],
    provider_identifiers: adapterStringMap(evidence.provider_identifiers, provider.provider_id, 'provider_identifiers'),
    metadata: asRecord(evidence.metadata) as ProviderEvidence['metadata'],
    retraction_or_update_flags: asRecord(evidence.retraction_or_update_flags),
    normalized,
    match_assessment: adapterMatchAssessment(evidence.match_assessment, provider.provider_id),
    retry_attempts: retryAttempts,
    verification_scope: {
      ...provider.verification_scope,
      ...verificationScope,
      ...verificationScopeOverride,
    },
  });
}

export function referenceAdapterNext(
  result: unknown,
  providerId: ProviderId,
  runtime: LoadedInstalledPackageRuntimeModule,
): { kind: 'complete'; evidence: unknown } | { kind: 'request'; request: ReferenceAdapterRequest; state: unknown } {
  const stepSchema = runtime.readJson(runtime.binding.step_schema_ref);
  delete stepSchema.$id;
  const validation = validateJsonSchemaPayload({
    schemaId: `${runtime.binding.step_schema_ref}@${runtime.contentDigest}`,
    schema: stepSchema,
    sourceRef: runtime.binding.step_schema_ref,
  }, result);
  if (!validation.ok) {
    throw new FrameworkContractError(
      'codex_command_failed',
      'OPL Connect reference provider adapter returned a result outside its locked step schema.',
      {
        provider_id: providerId,
        schema_ref: runtime.binding.step_schema_ref,
        schema_errors: validation.errors,
        reason_code: 'reference_provider_adapter_result_schema_invalid',
      },
    );
  }
  const next = asRecord(asRecord(result).next);
  const kind = asString(next.kind);
  if (kind === 'complete' && next.evidence !== undefined) {
    return { kind: 'complete' as const, evidence: next.evidence };
  }
  if (kind === 'request' && typeof next.request === 'object' && next.request !== null && next.state !== undefined) {
    return {
      kind: 'request' as const,
      request: next.request as ReferenceAdapterRequest,
      state: next.state,
    };
  }
  throw new FrameworkContractError(
    'codex_command_failed',
    'OPL Connect reference provider adapter returned an invalid next step.',
    { provider_id: providerId, next_kind: kind, reason_code: 'reference_provider_adapter_transition_invalid' },
  );
}

export function withReceiptRef(evidence: ProviderEvidenceDraft): ProviderEvidence {
  return {
    ...evidence,
    receipt_ref: receiptRef(evidence),
  };
}

export function receiptRef(evidence: { reference_id: string; provider_id: string; normalized?: unknown }) {
  const digest = crypto.createHash('sha256').update(JSON.stringify({
    reference_id: evidence.reference_id,
    provider_id: evidence.provider_id,
    normalized: evidence.normalized,
  })).digest('hex');
  return `opl://connect/references/verify/${digest}`;
}

function providerName(
  providerId: ProviderId,
  runtime: InstalledPackageRuntimeModuleContext,
): ProviderEvidence['provider'] {
  return providerDefinition(providerId, runtime).receipt_provider_name;
}

function verificationScope(
  providerId: ProviderId,
  runtime: InstalledPackageRuntimeModuleContext,
): Record<string, unknown> {
  return providerDefinition(providerId, runtime).verification_scope;
}

function identifiersFromReference(reference: ReferenceRecord): Record<string, string> {
  return compactIdentifiers({ doi: reference.doi, pmid: reference.pmid, pmcid: reference.pmcid });
}

function metadataFromReference(reference: ReferenceRecord): ProviderEvidence['metadata'] {
  return compactMetadata({ title: reference.title });
}

function compactIdentifiers(input: Record<string, string | null | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(input).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0),
  );
}

function compactMetadata(input: {
  title?: string | null;
  year?: string | null;
  journal?: string | null;
  authors?: string[];
  abstract?: string | null;
}): ProviderEvidence['metadata'] {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) =>
      Array.isArray(value) ? value.length > 0 : typeof value === 'string' && value.length > 0
    ),
  ) as ProviderEvidence['metadata'];
}

export function noAuthorityBoundary() {
  return {
    read_only: true,
    can_write_domain_truth: false,
    can_create_owner_receipt: false,
    can_create_typed_blocker: false,
    can_claim_reference_truth: false,
    can_claim_citation_quality: false,
    can_claim_claim_support: false,
    can_claim_citation_truth: false,
    can_claim_publication_readiness: false,
    can_claim_domain_ready: false,
    can_claim_production_ready: false,
  };
}

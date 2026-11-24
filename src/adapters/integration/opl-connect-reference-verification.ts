import path from 'node:path';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import {
  loadInstalledPackageRuntimeModule,
  type LoadedInstalledPackageRuntimeModule,
} from './agent-package-registry/installed-runtime-module.ts';
import {
  normalizeReferenceVerificationProviders,
  providerDefinition,
  REFERENCE_PROVIDER_ADAPTER_ABI,
  REFERENCE_PROVIDER_MODULE_KIND,
} from './opl-connect-reference-verification/provider-registry.ts';
import type { ReferenceVerificationProviderId } from './opl-connect-reference-verification/provider-registry.ts';
import {
  resolveReferences,
  type ReferenceRecord,
  type ReferenceVerificationInput,
} from './opl-connect-reference-verification/reference-normalization.ts';
import {
  cacheRef,
  fetchReferenceAdapterRequest,
  readCache,
  writeCache,
  type ReferenceAdapterHttpResponse,
  type RetryAttempt,
} from './opl-connect-reference-verification/transport.ts';
import {
  adapterContractFailure,
  adapterEvidenceToProviderEvidence,
  noAuthorityBoundary,
  providerErrorEvidence,
  referenceAdapterNext,
  receiptRef,
  retryAttemptsFromError,
  STRICT_MATCH_SCHEMA_VERSION,
  withReceiptRef,
  type ProviderEvidence,
  type ProviderEvidenceDraft,
} from './opl-connect-reference-verification/receipt.ts';

export type { ReferenceVerificationInput } from './opl-connect-reference-verification/reference-normalization.ts';
export type { ReferenceVerificationProviderId } from './opl-connect-reference-verification/provider-registry.ts';
export {
  normalizeReferenceVerificationProviders,
  referenceVerificationProviderIds,
} from './opl-connect-reference-verification/provider-registry.ts';

type ReferenceProviderAdapterHandler = (request: unknown) => unknown;

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function verifyProviderWithAdapter(
  reference: ReferenceRecord,
  providerId: ReferenceVerificationProviderId,
  input: ReferenceVerificationInput,
  runtime: LoadedInstalledPackageRuntimeModule,
): Promise<ProviderEvidenceDraft> {
  const provider = providerDefinition(providerId, runtime);
  const handler = runtime.handler as ReferenceProviderAdapterHandler;
  const requestBase = {
    surface_kind: 'opl_connect_reference_provider_adapter_step_request.v1',
    adapter_abi: REFERENCE_PROVIDER_ADAPTER_ABI,
    provider,
    reference,
  };
  let result: unknown;
  try {
    result = handler({ ...requestBase, operation: 'build_request' });
  } catch (error) {
    adapterContractFailure(error, { provider_id: providerId, operation: 'build_request' });
  }
  let retryAttempts: RetryAttempt[] = [];
  for (let requestCount = 0; requestCount <= runtime.binding.max_steps; requestCount += 1) {
    const next = referenceAdapterNext(result, providerId, runtime);
    if (next.kind === 'complete') {
      return adapterEvidenceToProviderEvidence(reference, provider, next.evidence, retryAttempts, runtime);
    }
    if (requestCount === runtime.binding.max_steps) {
      throw new FrameworkContractError(
        'codex_command_failed',
        'OPL Connect reference provider adapter exceeded its state-machine step cap.',
        {
          provider_id: providerId,
          max_steps: runtime.binding.max_steps,
          reason_code: 'reference_provider_adapter_step_cap_exceeded',
        },
      );
    }
    let fetched: { response: ReferenceAdapterHttpResponse; retryAttempts: RetryAttempt[] };
    try {
      fetched = await fetchReferenceAdapterRequest(next.request, provider, input);
    } catch (error) {
      const state = asRecord(next.state);
      const retainedEvidence = asRecord(asRecord(state.retained).evidence);
      if (state.step === 'full_text_xml' && Object.keys(retainedEvidence).length > 0) {
        return adapterEvidenceToProviderEvidence(
          reference,
          provider,
          retainedEvidence,
          [...retryAttempts, ...retryAttemptsFromError(error)],
          runtime,
          { full_text_probe_status: 'request_failed' },
        );
      }
      throw error;
    }
    retryAttempts = [...retryAttempts, ...fetched.retryAttempts];
    try {
      result = handler({
        ...requestBase,
        operation: 'parse_response',
        state: next.state,
        response: fetched.response,
      });
    } catch (error) {
      adapterContractFailure(error, { provider_id: providerId, operation: 'parse_response' });
    }
  }
  throw new FrameworkContractError('codex_command_failed', 'OPL Connect reference provider adapter did not complete.', {
    provider_id: providerId,
    reason_code: 'reference_provider_adapter_incomplete',
  });
}

async function verifyProviderWithCache(
  reference: ReferenceRecord,
  providerId: ReferenceVerificationProviderId,
  input: ReferenceVerificationInput,
  runtime: LoadedInstalledPackageRuntimeModule,
): Promise<ProviderEvidence> {
  const cachePath = cacheRef(input.cacheRoot, providerId, reference);
  const cached = readCache(cachePath);
  if (cached && cached.match_schema_version === STRICT_MATCH_SCHEMA_VERSION) {
    const cachedEvidence = cached as Omit<ProviderEvidence, 'cache' | 'retry_attempts'>;
    return {
      ...cachedEvidence,
      receipt_ref: cachedEvidence.receipt_ref ?? receiptRef(cachedEvidence),
      cache: {
        status: 'hit',
        write_status: 'skipped',
        cache_ref: cachePath,
      },
      retry_attempts: [],
    };
  }
  const evidence = withReceiptRef(await verifyProviderWithAdapter(reference, providerId, input, runtime).catch((error) =>
    providerErrorEvidence(reference, providerId, error, runtime)
  ));
  const writeStatus = evidence.status === 'matched'
    ? writeCache(cachePath, {
        ...evidence,
        cache: undefined,
        retry_attempts: undefined,
      })
    : 'skipped';
  return {
    ...evidence,
    cache: {
      status: cachePath ? 'miss' : 'disabled',
      write_status: writeStatus,
      cache_ref: cachePath,
    },
  };
}

export async function runOplConnectReferenceVerification(input: ReferenceVerificationInput) {
  const runtime = await loadInstalledPackageRuntimeModule({
    moduleKind: REFERENCE_PROVIDER_MODULE_KIND,
    adapterAbi: REFERENCE_PROVIDER_ADAPTER_ABI,
    ...(input.installedPackage ?? {}),
  });
  const referenceInput = resolveReferences(input);
  const references = referenceInput.references;
  const providers = normalizeReferenceVerificationProviders(input.providers, {}, runtime);
  const providerEvidence: ProviderEvidence[] = [];
  for (const reference of references) {
    for (const providerId of providers) {
      providerEvidence.push(await verifyProviderWithCache(reference, providerId, input, runtime));
    }
  }
  const retryAttempts = providerEvidence.flatMap((entry) =>
    entry.retry_attempts.map((attempt) => ({
      provider_id: entry.provider_id,
      reference_id: entry.reference_id,
      operation: 'provider_request',
      ...attempt,
    }))
  );
  const providerReceipts = providerEvidence
    .filter((entry) => entry.status === 'matched' && entry.match_status === 'identifier_matched' && entry.mismatch_details.length === 0)
    .map((entry) => ({
      reference_id: entry.reference_id,
      provider_id: entry.provider_id,
      status: entry.status,
      match_status: entry.match_status,
      match_basis: entry.match_basis,
      receipt_ref: entry.receipt_ref,
      receipt_scope: 'metadata_provider_receipt_only',
      authority: 'provider_receipt_candidate_only',
      verification_scope: entry.verification_scope,
    }));
  const deferredProviderReceiptRequirements = providerEvidence
    .filter((entry) => entry.status === 'deferred')
    .map((entry) => ({
      reference_id: entry.reference_id,
      provider_id: entry.provider_id,
      status: 'deferred',
      match_status: entry.match_status,
      reason: entry.deferred_reason,
      mismatch_details: entry.mismatch_details,
    }));

  return {
    version: 'g2',
    opl_connect_reference_verification: {
      surface_kind: 'opl_connect_reference_verification_readonly',
      connector_id: 'reference_verification',
      verification_role: 'metadata_provider_receipt_only',
      connector_family: 'OPL Connect',
      status: 'completed',
      request: {
        references_file: referenceInput.referencesFile,
        reference_source_kind: referenceInput.sourceKind,
        reference_count: references.length,
        providers,
        cache_root: input.cacheRoot ? path.resolve(input.cacheRoot) : null,
        max_retries: input.maxRetries,
      },
      provider_evidence: providerEvidence,
      provider_receipts: providerReceipts,
      deferred_provider_receipt_requirements: deferredProviderReceiptRequirements,
      cache: {
        enabled: Boolean(input.cacheRoot),
        root: input.cacheRoot ? path.resolve(input.cacheRoot) : null,
        entries: providerEvidence.map((entry) => entry.cache),
      },
      retry_attempts: retryAttempts,
      no_authority_boundary: noAuthorityBoundary(),
    },
  };
}

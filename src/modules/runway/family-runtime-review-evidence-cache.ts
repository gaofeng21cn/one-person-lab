import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJsonBytes, canonicalJsonText } from '../../kernel/canonical-json.ts';
import {
  canonicalReviewTransportSha256, ensureReviewTransportDirectory,
  persistCanonicalReviewTransportJson, readReviewTransportJsonExactRef,
  requireExactReviewTransportKeys, requireReviewTransportRecord, requiredReviewTransportText,
  reviewTransportError, reviewTransportRoots, reviewTransportSize, type ReviewTransportExactRef,
} from './family-runtime-review-transport-store.ts';
import { readReviewerInputSnapshotManifest } from './family-runtime-reviewer-input-snapshot.ts';

const PAGE_HASH_RASTER_CONTRACT = {
  contract_id: 'scholarskills_pdf_page_pixel_raster',
  contract_version: 1,
  scale_x: 2, scale_y: 2, nominal_dpi: 144,
  colorspace: 'sRGB', pixel_format: 'RGB8', alpha: false, annotations: true,
  hash_algorithm: 'sha256', page_order: 'document_order',
} as const;

const CACHE_AUTHORITY_BOUNDARY = {
  cache_authority: false, can_emit_verdict: false,
  can_sign_reviewer_receipt: false, can_sign_owner_receipt: false,
  can_create_typed_blocker: false, can_claim_quality_readiness: false,
  can_claim_publication_readiness: false, can_claim_current_package_authority: false,
  cache_hit_can_skip_fresh_reviewer_invocation: false,
  cache_hit_can_skip_fresh_reviewer_receipt: false, cache_hit_can_skip_mas_judgment: false,
} as const;

const CANDIDATE_AUTHORITY_FIELDS = [
  'can_emit_verdict', 'can_sign_reviewer_receipt', 'can_sign_owner_receipt',
  'can_create_typed_blocker', 'can_claim_quality_readiness', 'can_claim_publication_readiness',
  'can_claim_current_package_authority',
] as const;

const ENTRY_FIELDS = [
  'surface_kind', 'schema_version', 'cache_key_sha256', 'review_lane',
  'context_binding_sha256', 'review_scope_sha256', 'rubric_sha256', 'raster_contract', 'pages',
  'origin_reviewer_invocation_ref', 'origin_reviewer_evidence_ref', 'cache_authority',
  'requires_fresh_reviewer_invocation', 'requires_fresh_reviewer_receipt',
  'requires_mas_judgment',
] as const;

const RECEIPT_FIELDS = [
  'surface_kind', 'schema_version', 'status', 'cache_hit', 'cache_key_sha256',
  'review_lane', 'review_scope_sha256', 'rubric_sha256', 'evidence_candidate_ref',
  'stored_entry_ref', 'candidate_origin_reviewer_invocation_ref',
  'candidate_origin_reviewer_evidence_ref', 'reusable_origin_reviewer_invocation_ref',
  'reusable_origin_reviewer_evidence_ref', 'context_binding', 'context_binding_sha256',
  'context_binding_match', 'cache_reuse_eligible', 'quality_debt', 'stage_transition_allowed',
  'typed_blocker_ref', 'cache_authority', 'requires_fresh_reviewer_invocation',
  'requires_fresh_reviewer_receipt', 'requires_mas_judgment', 'authority_boundary',
] as const;

const QUALITY_DEBT_RESUME_CONDITION =
  'run the required fresh reviewer invocation without cache reuse';

export type ReviewEvidenceCacheQualityDebtReason =
  | 'review_evidence_cache_context_binding_missing'
  | 'review_evidence_cache_context_binding_invalid'
  | 'review_evidence_cache_context_binding_mismatch'
  | 'review_evidence_cache_receipt_context_mismatch'
  | 'review_evidence_cache_receipt_unsupported';

export type ReviewEvidenceCacheExactRef = ReviewTransportExactRef;

export type ReviewEvidenceCacheOriginRef = {
  kind: string; ref: string; sha256: string; size_bytes?: number;
};

export type ReviewEvidenceCacheContextBinding = {
  reviewer_attempt_ref: string; execution_content_binding_sha256: string;
  snapshot_manifest_ref: ReviewEvidenceCacheExactRef; snapshot_manifest_sha256: string;
  review_scope_sha256: string; rubric_sha256: string;
  origin_reviewer_invocation_ref: ReviewEvidenceCacheOriginRef;
  origin_reviewer_evidence_ref: ReviewEvidenceCacheOriginRef;
};

export type ReviewEvidenceCacheReceiptEvaluation = {
  surface_kind: 'opl_review_evidence_cache_receipt_evaluation'; schema_version: 1;
  status: 'cache_reusable' | 'quality_debt'; receipt_ref: ReviewEvidenceCacheExactRef;
  current_context_binding: ReviewEvidenceCacheContextBinding | null;
  current_context_binding_sha256: string | null; receipt_context_binding_sha256: string | null;
  cache_reuse_eligible: boolean; quality_debt: ReviewEvidenceCacheQualityDebt | null;
  stage_transition_allowed: true; typed_blocker_ref: null;
  requires_fresh_reviewer_invocation: true; requires_fresh_reviewer_receipt: true;
  requires_mas_judgment: true;
};

type PageHashEvidencePage = {
  page_number: number; width: number; height: number;
  pixel_format: 'RGB8'; pixel_sha256: string;
};

type PageHashEvidenceCandidate = {
  surface_kind: 'scholarskills_page_hash_evidence_candidate'; schema_version: 1;
  review_lane: 'display'; review_scope_sha256: string; rubric_sha256: string;
  raster_contract: typeof PAGE_HASH_RASTER_CONTRACT; pages: PageHashEvidencePage[];
  cache_key_sha256: string;
  origin_reviewer_invocation_ref: ReviewEvidenceCacheOriginRef | null;
  origin_reviewer_evidence_ref: ReviewEvidenceCacheOriginRef | null;
  cache_reuse_eligible: boolean; cache_authority: false;
  requires_fresh_reviewer_invocation: true; requires_fresh_reviewer_receipt: true;
  requires_mas_judgment: true;
  authority_boundary: Record<string, false>;
};

type ReviewEvidenceCacheEntry = {
  surface_kind: 'opl_review_evidence_cache_entry'; schema_version: 1;
  cache_key_sha256: string; context_binding_sha256: string; review_lane: 'display';
  review_scope_sha256: string; rubric_sha256: string;
  raster_contract: typeof PAGE_HASH_RASTER_CONTRACT; pages: PageHashEvidencePage[];
  origin_reviewer_invocation_ref: ReviewEvidenceCacheOriginRef;
  origin_reviewer_evidence_ref: ReviewEvidenceCacheOriginRef;
  cache_authority: false; requires_fresh_reviewer_invocation: true;
  requires_fresh_reviewer_receipt: true; requires_mas_judgment: true;
};

export type ReviewEvidenceCacheQualityDebt = {
  status: 'quality_debt'; reason_code: ReviewEvidenceCacheQualityDebtReason;
  resume_condition: typeof QUALITY_DEBT_RESUME_CONDITION; cache_reuse_allowed: false;
  ordinary_progress_may_advance: true; stage_transition_allowed: true; typed_blocker_ref: null;
};

function normalizePage(value: unknown, index: number): PageHashEvidencePage {
  const field = `pages[${index}]`;
  const page = requireReviewTransportRecord(value, field);
  requireExactReviewTransportKeys(page, ['page_number', 'width', 'height', 'pixel_format', 'pixel_sha256'], field);
  const pageNumber = reviewTransportSize(page.page_number, `${field}.page_number`, 1);
  if (pageNumber !== index + 1) throw reviewTransportError(
    'review_evidence_cache_page_order_invalid',
    'Page evidence cache pages must use contiguous document-order page numbers.',
    { expected_page_number: index + 1, received_page_number: pageNumber },
  );
  if (page.pixel_format !== 'RGB8') throw reviewTransportError(
    'review_evidence_cache_pixel_format_invalid',
    'Page evidence cache pixel_format must match the fixed RGB8 raster contract.',
    { page_number: pageNumber, pixel_format: page.pixel_format ?? null },
  );
  return {
    page_number: pageNumber, width: reviewTransportSize(page.width, `${field}.width`, 1),
    height: reviewTransportSize(page.height, `${field}.height`, 1), pixel_format: 'RGB8',
    pixel_sha256: canonicalReviewTransportSha256(page.pixel_sha256, `${field}.pixel_sha256`),
  };
}

function normalizeExactRef(value: unknown, field: string, expectedKind?: string): ReviewEvidenceCacheExactRef {
  const exactRef = requireReviewTransportRecord(value, field);
  requireExactReviewTransportKeys(exactRef, ['kind', 'ref', 'size_bytes', 'sha256'], field);
  const kind = requiredReviewTransportText(exactRef.kind, `${field}.kind`);
  if (expectedKind && kind !== expectedKind) throw reviewTransportError(
    'review_evidence_cache_exact_ref_kind_mismatch', `${field} does not use the expected exact-ref kind.`,
    { field, expected_kind: expectedKind, received_kind: kind },
  );
  const ref = requiredReviewTransportText(exactRef.ref, `${field}.ref`);
  let canonicalRef: string;
  try {
    canonicalRef = pathToFileURL(fileURLToPath(ref)).href;
  } catch (error) {
    throw reviewTransportError('review_evidence_cache_exact_ref_not_file_url',
      `${field} must use a canonical local file URL.`,
      { field, ref, parse_error: error instanceof Error ? error.message : String(error) },
    );
  }
  if (canonicalRef !== ref) throw reviewTransportError(
    'review_evidence_cache_exact_ref_not_canonical', `${field} must use the canonical file URL for its local path.`,
    { field, received_ref: ref, canonical_ref: canonicalRef },
  );
  return {
    kind, ref,
    size_bytes: reviewTransportSize(exactRef.size_bytes, `${field}.size_bytes`),
    sha256: canonicalReviewTransportSha256(exactRef.sha256, `${field}.sha256`),
  };
}

function normalizeNullableExactRef(value: unknown, field: string, expectedKind?: string) {
  if (value === null || value === undefined) return null;
  return normalizeExactRef(value, field, expectedKind);
}

function normalizeOriginRef(value: unknown, field: string): ReviewEvidenceCacheOriginRef {
  const originRef = requireReviewTransportRecord(value, field);
  requireExactReviewTransportKeys(
    originRef, originRef.size_bytes === undefined
      ? ['kind', 'ref', 'sha256'] : ['kind', 'ref', 'sha256', 'size_bytes'], field,
  );
  return {
    kind: requiredReviewTransportText(originRef.kind, `${field}.kind`),
    ref: requiredReviewTransportText(originRef.ref, `${field}.ref`),
    sha256: canonicalReviewTransportSha256(originRef.sha256, `${field}.sha256`),
    ...(originRef.size_bytes === undefined
      ? {}
      : { size_bytes: reviewTransportSize(originRef.size_bytes, `${field}.size_bytes`) }),
  };
}

function normalizeNullableOriginRef(value: unknown, field: string) {
  if (value === null || value === undefined) return null;
  return normalizeOriginRef(value, field);
}

function refsEqual(left: unknown, right: unknown) {
  return canonicalJsonText(left) === canonicalJsonText(right);
}

function canonicalSha256(value: unknown) {
  return `sha256:${crypto.createHash('sha256').update(canonicalJsonBytes(value)).digest('hex')}`;
}

function pythonCompatibleCacheKeyJson(value: {
  ordered_pages: PageHashEvidencePage[];
  raster_contract: typeof PAGE_HASH_RASTER_CONTRACT;
  review_scope_sha256: string;
  rubric_sha256: string;
}) {
  // ScholarSkills computes the ABI key with Python json.dumps, which retains 2.0.
  return canonicalJsonText(value)
    .replace('"scale_x":2,', '"scale_x":2.0,')
    .replace('"scale_y":2}', '"scale_y":2.0}');
}

export function reviewEvidenceCacheKey(input: {
  pages: PageHashEvidencePage[];
  reviewScopeSha256: string;
  rubricSha256: string;
}) {
  const payload = {
    ordered_pages: input.pages,
    raster_contract: PAGE_HASH_RASTER_CONTRACT,
    review_scope_sha256: input.reviewScopeSha256,
    rubric_sha256: input.rubricSha256,
  };
  return `sha256:${crypto.createHash('sha256').update(pythonCompatibleCacheKeyJson(payload)).digest('hex')}`;
}

function normalizeCandidate(value: unknown): PageHashEvidenceCandidate {
  const candidate = requireReviewTransportRecord(value, 'page_hash_evidence_candidate');
  requireExactReviewTransportKeys(candidate, [
    'surface_kind', 'schema_version', 'review_lane', 'review_scope_sha256', 'rubric_sha256',
    'raster_contract', 'pages', 'cache_key_sha256', 'origin_reviewer_invocation_ref',
    'origin_reviewer_evidence_ref', 'cache_reuse_eligible', 'cache_authority',
    'requires_fresh_reviewer_invocation', 'requires_fresh_reviewer_receipt',
    'requires_mas_judgment', 'authority_boundary',
  ], 'page_hash_evidence_candidate');
  if (
    candidate.surface_kind !== 'scholarskills_page_hash_evidence_candidate'
    || candidate.schema_version !== 1
    || candidate.review_lane !== 'display'
  ) throw reviewTransportError(
    'review_evidence_cache_candidate_surface_invalid',
    'Page evidence cache candidate must use the ScholarSkills display schema 1 surface.',
    { surface_kind: candidate.surface_kind ?? null, schema_version: candidate.schema_version ?? null,
      review_lane: candidate.review_lane ?? null },
  );
  const rasterContract = requireReviewTransportRecord(candidate.raster_contract, 'raster_contract');
  if (canonicalJsonText(rasterContract) !== canonicalJsonText(PAGE_HASH_RASTER_CONTRACT)) throw reviewTransportError(
    'review_evidence_cache_raster_contract_mismatch',
    'Page evidence cache candidate does not use the fixed ScholarSkills raster contract.',
    { expected_raster_contract: PAGE_HASH_RASTER_CONTRACT },
  );
  if (!Array.isArray(candidate.pages) || candidate.pages.length === 0) throw reviewTransportError(
    'review_evidence_cache_pages_missing', 'Page evidence cache candidate must contain ordered pages.',
  );
  const pages = candidate.pages.map(normalizePage);
  const reviewScopeSha256 = canonicalReviewTransportSha256(candidate.review_scope_sha256, 'review_scope_sha256');
  const rubricSha256 = canonicalReviewTransportSha256(candidate.rubric_sha256, 'rubric_sha256');
  const expectedCacheKey = reviewEvidenceCacheKey({ pages, reviewScopeSha256, rubricSha256 });
  const suppliedCacheKey = canonicalReviewTransportSha256(candidate.cache_key_sha256, 'cache_key_sha256');
  if (suppliedCacheKey !== expectedCacheKey) throw reviewTransportError(
    'review_evidence_cache_key_mismatch',
    'Page evidence cache candidate key does not match its canonical pages, raster, scope, and rubric.',
    { supplied_cache_key_sha256: suppliedCacheKey, expected_cache_key_sha256: expectedCacheKey },
  );
  const originInvocation = normalizeNullableOriginRef(candidate.origin_reviewer_invocation_ref, 'origin_reviewer_invocation_ref');
  const originEvidence = normalizeNullableOriginRef(candidate.origin_reviewer_evidence_ref, 'origin_reviewer_evidence_ref');
  const originBound = originInvocation !== null && originEvidence !== null;
  if ((originInvocation === null) !== (originEvidence === null)) throw reviewTransportError(
    'review_evidence_cache_origin_ref_pair_invalid',
    'Page evidence cache origin invocation and evidence refs must both be present or both be null.',
  );
  const authority = requireReviewTransportRecord(candidate.authority_boundary, 'authority_boundary');
  requireExactReviewTransportKeys(authority, CANDIDATE_AUTHORITY_FIELDS, 'authority_boundary');
  if (
    candidate.cache_reuse_eligible !== originBound
    || candidate.cache_authority !== false
    || candidate.requires_fresh_reviewer_invocation !== true
    || candidate.requires_fresh_reviewer_receipt !== true
    || candidate.requires_mas_judgment !== true
    || CANDIDATE_AUTHORITY_FIELDS.some((field) => authority[field] !== false)
  ) throw reviewTransportError(
    'review_evidence_cache_candidate_authority_invalid',
    'Page evidence cache candidate grants authority or contradicts its fresh-review requirements.',
  );
  return {
    surface_kind: 'scholarskills_page_hash_evidence_candidate', schema_version: 1,
    review_lane: 'display', review_scope_sha256: reviewScopeSha256, rubric_sha256: rubricSha256,
    raster_contract: PAGE_HASH_RASTER_CONTRACT, pages, cache_key_sha256: expectedCacheKey,
    origin_reviewer_invocation_ref: originInvocation,
    origin_reviewer_evidence_ref: originEvidence,
    cache_reuse_eligible: originBound, cache_authority: false,
    requires_fresh_reviewer_invocation: true, requires_fresh_reviewer_receipt: true,
    requires_mas_judgment: true,
    authority_boundary: Object.fromEntries(CANDIDATE_AUTHORITY_FIELDS.map((field) => [field, false])),
  };
}

function normalizeContextBinding(value: unknown): ReviewEvidenceCacheContextBinding {
  const binding = requireReviewTransportRecord(value, 'context_binding');
  requireExactReviewTransportKeys(binding, [
    'reviewer_attempt_ref', 'execution_content_binding_sha256', 'snapshot_manifest_ref',
    'snapshot_manifest_sha256', 'review_scope_sha256', 'rubric_sha256',
    'origin_reviewer_invocation_ref', 'origin_reviewer_evidence_ref',
  ], 'context_binding');
  const snapshotManifestRef = normalizeExactRef(binding.snapshot_manifest_ref,
    'context_binding.snapshot_manifest_ref', 'opl_reviewer_input_snapshot_manifest');
  const snapshotManifestSha256 = canonicalReviewTransportSha256(binding.snapshot_manifest_sha256,
    'context_binding.snapshot_manifest_sha256');
  if (snapshotManifestRef.sha256 !== snapshotManifestSha256) throw reviewTransportError(
    'review_evidence_cache_context_snapshot_mismatch',
    'Review evidence cache context snapshot manifest digest must match its exact ref.',
    { snapshot_manifest_ref_sha256: snapshotManifestRef.sha256, snapshot_manifest_sha256: snapshotManifestSha256 },
  );
  const reviewerAttemptRef = requiredReviewTransportText(
    binding.reviewer_attempt_ref,
    'context_binding.reviewer_attempt_ref',
  );
  const executionContentBindingSha256 = canonicalReviewTransportSha256(
    binding.execution_content_binding_sha256,
    'context_binding.execution_content_binding_sha256',
  );
  const originInvocation = normalizeOriginRef(
    binding.origin_reviewer_invocation_ref,
    'context_binding.origin_reviewer_invocation_ref',
  );
  if (
    originInvocation.kind !== 'opl_stage_attempt'
    || originInvocation.ref !== reviewerAttemptRef
    || originInvocation.sha256 !== executionContentBindingSha256
  ) throw reviewTransportError(
    'review_evidence_cache_context_attempt_binding_mismatch',
    'Review evidence cache context must bind one reviewer Attempt and execution identity.',
  );
  return {
    reviewer_attempt_ref: reviewerAttemptRef,
    execution_content_binding_sha256: executionContentBindingSha256,
    snapshot_manifest_ref: snapshotManifestRef, snapshot_manifest_sha256: snapshotManifestSha256,
    review_scope_sha256: canonicalReviewTransportSha256(binding.review_scope_sha256, 'context_binding.review_scope_sha256'),
    rubric_sha256: canonicalReviewTransportSha256(binding.rubric_sha256, 'context_binding.rubric_sha256'),
    origin_reviewer_invocation_ref: originInvocation,
    origin_reviewer_evidence_ref: normalizeOriginRef(binding.origin_reviewer_evidence_ref,
      'context_binding.origin_reviewer_evidence_ref'),
  };
}

function validateContextSnapshot(binding: ReviewEvidenceCacheContextBinding) {
  const persisted = readReviewerInputSnapshotManifest(binding.snapshot_manifest_ref);
  if (
    !refsEqual(persisted.manifest_ref, binding.snapshot_manifest_ref)
    || persisted.manifest.surface_kind !== 'opl_reviewer_input_snapshot_manifest'
    || persisted.manifest.schema_version !== 1
    || persisted.manifest.review_lane !== 'display'
    || canonicalReviewTransportSha256(persisted.manifest.review_scope_sha256,
      'snapshot_manifest.review_scope_sha256') !== binding.review_scope_sha256
  ) throw reviewTransportError(
    'review_evidence_cache_context_snapshot_scope_mismatch',
    'Review evidence cache context does not bind a matching reviewer snapshot manifest.',
  );
}

function contextBindingMatchesCandidate(binding: ReviewEvidenceCacheContextBinding, candidate: PageHashEvidenceCandidate) {
  return candidate.cache_reuse_eligible
    && binding.review_scope_sha256 === candidate.review_scope_sha256
    && binding.rubric_sha256 === candidate.rubric_sha256
    && refsEqual(binding.origin_reviewer_invocation_ref, candidate.origin_reviewer_invocation_ref)
    && refsEqual(binding.origin_reviewer_evidence_ref, candidate.origin_reviewer_evidence_ref);
}

function assertCanonicalPersistedValue(input: {
  value: Record<string, unknown>; normalized: unknown; exactRef: ReviewEvidenceCacheExactRef;
  failureCode: string; label: string;
}) {
  const normalizedBytes = canonicalJsonBytes(input.normalized);
  const normalizedSha256 = `sha256:${crypto.createHash('sha256').update(normalizedBytes).digest('hex')}`;
  if (
    canonicalJsonText(input.value) !== canonicalJsonText(input.normalized)
    || normalizedSha256 !== input.exactRef.sha256
    || normalizedBytes.length !== input.exactRef.size_bytes
  ) throw reviewTransportError(
    input.failureCode, `${input.label} is not the canonical normalized value bound by its exact ref.`,
    { expected_sha256: input.exactRef.sha256, normalized_sha256: normalizedSha256,
      expected_size_bytes: input.exactRef.size_bytes, normalized_size_bytes: normalizedBytes.length },
  );
}

function exactRefForJsonFile(kind: string, filePath: string): ReviewEvidenceCacheExactRef {
  const stat = fs.lstatSync(filePath);
  if (stat.isSymbolicLink() || !stat.isFile()) throw reviewTransportError(
    'review_evidence_cache_entry_path_invalid', 'Review evidence cache entry must be a direct regular file.',
    { entry_path: filePath },
  );
  const filenameDigest = path.basename(filePath).replace(/\.json$/, '');
  return { kind, ref: pathToFileURL(filePath).href, size_bytes: stat.size, sha256: `sha256:${filenameDigest}` };
}

function entryRootFor(cacheKey: string, contextBindingSha256: string) {
  return path.join(reviewTransportRoots().evidence_cache_entry_root, cacheKey.replace(/^sha256:/, ''),
    contextBindingSha256.replace(/^sha256:/, ''));
}

function assertDirectDirectory(root: string, parent: string) {
  const stat = fs.lstatSync(root);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw reviewTransportError(
    'review_evidence_cache_entry_root_invalid',
    'Review evidence cache key root must be a direct OPL-owned directory.', { entry_root: root },
  );
  const realBase = fs.realpathSync.native(parent);
  const realRoot = fs.realpathSync.native(root);
  if (path.dirname(realRoot) !== realBase) throw reviewTransportError(
    'review_evidence_cache_entry_root_escape', 'Review evidence cache key root escapes OPL storage.',
    { entry_root: root },
  );
}

function prepareEntryRoot(cacheKey: string, contextBindingSha256: string) {
  const base = reviewTransportRoots().evidence_cache_entry_root;
  const keyRoot = path.join(base, cacheKey.replace(/^sha256:/, ''));
  ensureReviewTransportDirectory(keyRoot);
  assertDirectDirectory(keyRoot, base);
  const root = entryRootFor(cacheKey, contextBindingSha256);
  ensureReviewTransportDirectory(root);
  assertDirectDirectory(root, keyRoot);
  return root;
}

function normalizeEntry(value: unknown, candidate: PageHashEvidenceCandidate,
  contextBindingSha256: string): ReviewEvidenceCacheEntry {
  const entry = requireReviewTransportRecord(value, 'review_evidence_cache_entry');
  requireExactReviewTransportKeys(entry, ENTRY_FIELDS, 'review_evidence_cache_entry');
  if (
    entry.surface_kind !== 'opl_review_evidence_cache_entry'
    || entry.schema_version !== 1
    || entry.review_lane !== 'display'
    || entry.cache_authority !== false
    || entry.requires_fresh_reviewer_invocation !== true
    || entry.requires_fresh_reviewer_receipt !== true
    || entry.requires_mas_judgment !== true
  ) throw reviewTransportError('review_evidence_cache_entry_invalid',
    'Persisted review evidence cache entry violates its surface or no-authority contract.');
  const rasterContract = requireReviewTransportRecord(entry.raster_contract, 'entry.raster_contract');
  if (canonicalJsonText(rasterContract) !== canonicalJsonText(PAGE_HASH_RASTER_CONTRACT))
    throw reviewTransportError('review_evidence_cache_entry_raster_contract_mismatch',
      'Persisted review evidence cache entry does not use the fixed raster contract.');
  if (!Array.isArray(entry.pages) || entry.pages.length === 0)
    throw reviewTransportError('review_evidence_cache_entry_pages_missing',
      'Persisted review evidence cache entry must contain ordered pages.');
  const pages = entry.pages.map(normalizePage);
  const reviewScopeSha256 = canonicalReviewTransportSha256(entry.review_scope_sha256,
    'entry.review_scope_sha256');
  const rubricSha256 = canonicalReviewTransportSha256(entry.rubric_sha256, 'entry.rubric_sha256');
  const recomputedCacheKey = reviewEvidenceCacheKey({ pages, reviewScopeSha256, rubricSha256 });
  const suppliedCacheKey = canonicalReviewTransportSha256(entry.cache_key_sha256, 'entry.cache_key_sha256');
  const suppliedContextBindingSha256 = canonicalReviewTransportSha256(entry.context_binding_sha256,
    'entry.context_binding_sha256');
  const originInvocation = normalizeOriginRef(entry.origin_reviewer_invocation_ref,
    'entry.origin_reviewer_invocation_ref');
  const originEvidence = normalizeOriginRef(entry.origin_reviewer_evidence_ref,
    'entry.origin_reviewer_evidence_ref');
  if (
    suppliedCacheKey !== recomputedCacheKey
    || suppliedCacheKey !== candidate.cache_key_sha256
    || suppliedContextBindingSha256 !== contextBindingSha256
    || reviewScopeSha256 !== candidate.review_scope_sha256
    || rubricSha256 !== candidate.rubric_sha256
    || canonicalJsonText(pages) !== canonicalJsonText(candidate.pages)
    || !refsEqual(originInvocation, candidate.origin_reviewer_invocation_ref)
    || !refsEqual(originEvidence, candidate.origin_reviewer_evidence_ref)
  ) throw reviewTransportError('review_evidence_cache_entry_context_mismatch',
    'Persisted review evidence cache entry does not bind the candidate pages, scope, rubric, origins, and key.',
    { supplied_cache_key_sha256: suppliedCacheKey, recomputed_cache_key_sha256: recomputedCacheKey });
  return {
    surface_kind: 'opl_review_evidence_cache_entry', schema_version: 1,
    cache_key_sha256: suppliedCacheKey, context_binding_sha256: suppliedContextBindingSha256,
    review_lane: 'display', review_scope_sha256: reviewScopeSha256, rubric_sha256: rubricSha256,
    raster_contract: PAGE_HASH_RASTER_CONTRACT, pages,
    origin_reviewer_invocation_ref: originInvocation, origin_reviewer_evidence_ref: originEvidence,
    cache_authority: false, requires_fresh_reviewer_invocation: true,
    requires_fresh_reviewer_receipt: true, requires_mas_judgment: true,
  };
}

function readEntryExactRef(exactRef: unknown, candidate: PageHashEvidenceCandidate,
  contextBindingSha256: string) {
  const root = entryRootFor(candidate.cache_key_sha256, contextBindingSha256);
  assertDirectDirectory(path.dirname(root), reviewTransportRoots().evidence_cache_entry_root);
  assertDirectDirectory(root, path.dirname(root));
  const persisted = readReviewTransportJsonExactRef({
    exactRef,
    expectedKind: 'opl_review_evidence_cache_entry',
    trustedRoot: root,
  });
  const entry = normalizeEntry(persisted.value, candidate, contextBindingSha256);
  assertCanonicalPersistedValue({
    value: persisted.value,
    normalized: entry,
    exactRef: persisted.exact_ref,
    failureCode: 'review_evidence_cache_entry_canonical_bytes_mismatch',
    label: 'Persisted review evidence cache entry',
  });
  return { entry_ref: persisted.exact_ref, entry };
}

function listEntryFiles(root: string) {
  return fs.readdirSync(root)
    .filter((name) => /^[a-f0-9]{64}\.json$/.test(name))
    .sort();
}

function readExistingEntry(candidate: PageHashEvidenceCandidate, contextBindingSha256: string) {
  const root = entryRootFor(candidate.cache_key_sha256, contextBindingSha256);
  if (!fs.existsSync(root)) return null;
  assertDirectDirectory(path.dirname(root), reviewTransportRoots().evidence_cache_entry_root);
  assertDirectDirectory(root, path.dirname(root));
  const entries = listEntryFiles(root);
  if (entries.length === 0) return null;
  if (entries.length !== 1) throw reviewTransportError('review_evidence_cache_entry_ambiguous',
    'Review evidence cache key resolves to multiple persisted entries.',
    { cache_key_sha256: candidate.cache_key_sha256, entry_count: entries.length });
  const filePath = path.join(root, entries[0]!);
  const entry = readEntryExactRef(exactRefForJsonFile('opl_review_evidence_cache_entry', filePath),
    candidate, contextBindingSha256);
  if (canonicalJsonText(entries) !== canonicalJsonText(listEntryFiles(root)))
    throw reviewTransportError('review_evidence_cache_entry_set_changed',
      'Review evidence cache entry set changed while it was being verified.',
      { cache_key_sha256: candidate.cache_key_sha256 });
  return entry;
}

function cacheEntryFor(candidate: PageHashEvidenceCandidate,
  contextBindingSha256: string): ReviewEvidenceCacheEntry {
  if (!candidate.origin_reviewer_invocation_ref || !candidate.origin_reviewer_evidence_ref)
    throw reviewTransportError('review_evidence_cache_entry_origin_missing',
      'Reusable review evidence cache entry requires both origin exact refs.');
  return {
    surface_kind: 'opl_review_evidence_cache_entry', schema_version: 1,
    cache_key_sha256: candidate.cache_key_sha256, context_binding_sha256: contextBindingSha256,
    review_lane: candidate.review_lane, review_scope_sha256: candidate.review_scope_sha256,
    rubric_sha256: candidate.rubric_sha256, raster_contract: candidate.raster_contract, pages: candidate.pages,
    origin_reviewer_invocation_ref: candidate.origin_reviewer_invocation_ref,
    origin_reviewer_evidence_ref: candidate.origin_reviewer_evidence_ref,
    cache_authority: false, requires_fresh_reviewer_invocation: true,
    requires_fresh_reviewer_receipt: true, requires_mas_judgment: true,
  };
}

function qualityDebt(reasonCode: ReviewEvidenceCacheQualityDebtReason): ReviewEvidenceCacheQualityDebt {
  return {
    status: 'quality_debt', reason_code: reasonCode,
    resume_condition: QUALITY_DEBT_RESUME_CONDITION, cache_reuse_allowed: false,
    ordinary_progress_may_advance: true, stage_transition_allowed: true, typed_blocker_ref: null,
  };
}

function normalizeQualityDebt(value: unknown): ReviewEvidenceCacheQualityDebt | null {
  if (value === null) return null;
  const debt = requireReviewTransportRecord(value, 'quality_debt');
  requireExactReviewTransportKeys(debt, [
    'status', 'reason_code', 'resume_condition', 'cache_reuse_allowed',
    'ordinary_progress_may_advance', 'stage_transition_allowed', 'typed_blocker_ref',
  ], 'quality_debt');
  const allowedReasons = new Set<unknown>([
    'review_evidence_cache_context_binding_missing',
    'review_evidence_cache_context_binding_invalid',
    'review_evidence_cache_context_binding_mismatch',
    'review_evidence_cache_receipt_context_mismatch',
    'review_evidence_cache_receipt_unsupported',
  ]);
  if (
    debt.status !== 'quality_debt'
    || !allowedReasons.has(debt.reason_code)
    || debt.resume_condition !== QUALITY_DEBT_RESUME_CONDITION
    || debt.cache_reuse_allowed !== false
    || debt.ordinary_progress_may_advance !== true
    || debt.stage_transition_allowed !== true
    || debt.typed_blocker_ref !== null
  ) {
    throw reviewTransportError(
      'review_evidence_cache_quality_debt_invalid',
      'Review evidence cache quality debt does not preserve progress-first semantics.',
    );
  }
  return qualityDebt(debt.reason_code as ReviewEvidenceCacheQualityDebtReason);
}

function normalizeAuthorityBoundary(value: unknown) {
  const authority = requireReviewTransportRecord(value, 'authority_boundary');
  const fields = Object.keys(CACHE_AUTHORITY_BOUNDARY);
  requireExactReviewTransportKeys(authority, fields, 'authority_boundary');
  if (fields.some((field) => authority[field] !== false)) {
    throw reviewTransportError(
      'review_evidence_cache_authority_boundary_invalid',
      'Review evidence cache receipt grants forbidden authority.',
    );
  }
  return CACHE_AUTHORITY_BOUNDARY;
}

function normalizeReceipt(value: unknown) {
  const receipt = requireReviewTransportRecord(value, 'review_evidence_cache_receipt');
  requireExactReviewTransportKeys(receipt, RECEIPT_FIELDS, 'review_evidence_cache_receipt');
  if (
    receipt.surface_kind !== 'opl_review_evidence_cache_receipt'
    || receipt.schema_version !== 2
    || !['cache_miss_stored', 'cache_hit', 'stored_not_reusable'].includes(String(receipt.status))
    || typeof receipt.cache_hit !== 'boolean'
    || receipt.review_lane !== 'display'
    || typeof receipt.context_binding_match !== 'boolean'
    || typeof receipt.cache_reuse_eligible !== 'boolean'
    || receipt.stage_transition_allowed !== true
    || receipt.typed_blocker_ref !== null
    || receipt.cache_authority !== false
    || receipt.requires_fresh_reviewer_invocation !== true
    || receipt.requires_fresh_reviewer_receipt !== true
    || receipt.requires_mas_judgment !== true
  ) {
    throw reviewTransportError(
      'review_evidence_cache_receipt_invalid',
      'Persisted review evidence cache receipt violates its surface, progress, or no-authority contract.',
    );
  }
  const contextBinding = receipt.context_binding === null
    ? null
    : normalizeContextBinding(receipt.context_binding);
  const contextBindingSha256 = receipt.context_binding_sha256 === null
    ? null
    : canonicalReviewTransportSha256(
        receipt.context_binding_sha256,
        'receipt.context_binding_sha256',
      );
  if (
    (contextBinding === null) !== (contextBindingSha256 === null)
    || (contextBinding && contextBindingSha256 !== canonicalSha256(contextBinding))
  ) {
    throw reviewTransportError(
      'review_evidence_cache_receipt_context_digest_mismatch',
      'Review evidence cache receipt context binding does not match its canonical digest.',
    );
  }
  const candidateOriginInvocation = normalizeNullableOriginRef(
    receipt.candidate_origin_reviewer_invocation_ref,
    'receipt.candidate_origin_reviewer_invocation_ref',
  );
  const candidateOriginEvidence = normalizeNullableOriginRef(
    receipt.candidate_origin_reviewer_evidence_ref,
    'receipt.candidate_origin_reviewer_evidence_ref',
  );
  const reusableOriginInvocation = normalizeNullableOriginRef(
    receipt.reusable_origin_reviewer_invocation_ref,
    'receipt.reusable_origin_reviewer_invocation_ref',
  );
  const reusableOriginEvidence = normalizeNullableOriginRef(
    receipt.reusable_origin_reviewer_evidence_ref,
    'receipt.reusable_origin_reviewer_evidence_ref',
  );
  if (
    (candidateOriginInvocation === null) !== (candidateOriginEvidence === null)
    || (reusableOriginInvocation === null) !== (reusableOriginEvidence === null)
  ) {
    throw reviewTransportError(
      'review_evidence_cache_receipt_origin_pair_invalid',
      'Review evidence cache receipt origin exact refs must be complete pairs.',
    );
  }
  const status = receipt.status as 'cache_miss_stored' | 'cache_hit' | 'stored_not_reusable';
  const storedEntryRef = normalizeNullableExactRef(
    receipt.stored_entry_ref,
    'receipt.stored_entry_ref',
    'opl_review_evidence_cache_entry',
  );
  const debt = normalizeQualityDebt(receipt.quality_debt);
  const isDebt = status === 'stored_not_reusable';
  if (
    isDebt
      ? (
          receipt.cache_hit !== false
          || receipt.cache_reuse_eligible !== false
          || storedEntryRef !== null
          || reusableOriginInvocation !== null
          || reusableOriginEvidence !== null
          || debt === null
        )
      : (
          debt !== null
          || contextBinding === null
          || receipt.context_binding_match !== true
          || receipt.cache_reuse_eligible !== true
          || storedEntryRef === null
          || candidateOriginInvocation === null
          || candidateOriginEvidence === null
          || reusableOriginInvocation === null
          || reusableOriginEvidence === null
          || (status === 'cache_hit' && receipt.cache_hit !== true)
          || (status === 'cache_miss_stored' && receipt.cache_hit !== false)
          || !refsEqual(candidateOriginInvocation, reusableOriginInvocation)
          || !refsEqual(candidateOriginEvidence, reusableOriginEvidence)
        )
  ) {
    throw reviewTransportError(
      'review_evidence_cache_receipt_state_invalid',
      'Review evidence cache receipt status contradicts its cache, context, or quality-debt state.',
    );
  }
  return {
    surface_kind: 'opl_review_evidence_cache_receipt' as const,
    schema_version: 2 as const,
    status,
    cache_hit: receipt.cache_hit,
    cache_key_sha256: canonicalReviewTransportSha256(
      receipt.cache_key_sha256,
      'receipt.cache_key_sha256',
    ),
    review_lane: 'display' as const,
    review_scope_sha256: canonicalReviewTransportSha256(
      receipt.review_scope_sha256,
      'receipt.review_scope_sha256',
    ),
    rubric_sha256: canonicalReviewTransportSha256(
      receipt.rubric_sha256,
      'receipt.rubric_sha256',
    ),
    evidence_candidate_ref: normalizeExactRef(
      receipt.evidence_candidate_ref,
      'receipt.evidence_candidate_ref',
      'scholarskills_page_hash_evidence_candidate',
    ),
    stored_entry_ref: storedEntryRef,
    candidate_origin_reviewer_invocation_ref: candidateOriginInvocation,
    candidate_origin_reviewer_evidence_ref: candidateOriginEvidence,
    reusable_origin_reviewer_invocation_ref: reusableOriginInvocation,
    reusable_origin_reviewer_evidence_ref: reusableOriginEvidence,
    context_binding: contextBinding,
    context_binding_sha256: contextBindingSha256,
    context_binding_match: receipt.context_binding_match,
    cache_reuse_eligible: receipt.cache_reuse_eligible,
    quality_debt: debt,
    stage_transition_allowed: true as const,
    typed_blocker_ref: null,
    cache_authority: false as const,
    requires_fresh_reviewer_invocation: true as const,
    requires_fresh_reviewer_receipt: true as const,
    requires_mas_judgment: true as const,
    authority_boundary: normalizeAuthorityBoundary(receipt.authority_boundary),
  };
}

function readCandidateExactRef(exactRef: unknown) {
  const persisted = readReviewTransportJsonExactRef({
    exactRef,
    expectedKind: 'scholarskills_page_hash_evidence_candidate',
    trustedRoot: reviewTransportRoots().evidence_cache_candidate_root,
  });
  const candidate = normalizeCandidate(persisted.value);
  assertCanonicalPersistedValue({
    value: persisted.value,
    normalized: candidate,
    exactRef: persisted.exact_ref,
    failureCode: 'review_evidence_cache_candidate_canonical_bytes_mismatch',
    label: 'Persisted review evidence candidate',
  });
  return { candidate_ref: persisted.exact_ref, candidate };
}

export function persistReviewEvidenceCacheCandidate(value: unknown,
  context?: unknown) {
  const candidate = normalizeCandidate(value);
  const roots = reviewTransportRoots();
  const candidatePersisted = persistCanonicalReviewTransportJson({
    root: roots.evidence_cache_candidate_root,
    kind: 'scholarskills_page_hash_evidence_candidate',
    value: candidate,
  });

  let contextBinding: ReviewEvidenceCacheContextBinding | null = null;
  let debtReason: ReviewEvidenceCacheQualityDebtReason | null = null;
  if (context === null || context === undefined) {
    debtReason = 'review_evidence_cache_context_binding_missing';
  } else {
    try {
      contextBinding = normalizeContextBinding(context);
    } catch {
      debtReason = 'review_evidence_cache_context_binding_invalid';
    }
  }
  if (contextBinding) {
    try {
      validateContextSnapshot(contextBinding);
    } catch (error) {
      if (
        error instanceof Error
        && 'details' in error
        && (error as { details?: Record<string, unknown> }).details?.failure_code
          === 'review_evidence_cache_context_snapshot_scope_mismatch'
      ) {
        contextBinding = null;
        debtReason = 'review_evidence_cache_context_binding_invalid';
      } else {
        throw error;
      }
    }
  }
  const contextBindingMatch = contextBinding !== null
    && contextBindingMatchesCandidate(contextBinding, candidate);
  if (!debtReason && !contextBindingMatch) {
    debtReason = 'review_evidence_cache_context_binding_mismatch';
  }
  const contextBindingSha256 = contextBinding ? canonicalSha256(contextBinding) : null;

  let entry: ReturnType<typeof readExistingEntry> = null;
  let cacheHit = false;
  if (!debtReason) {
    if (!contextBindingSha256) throw new Error('unreachable missing context binding digest');
    entry = readExistingEntry(candidate, contextBindingSha256);
    cacheHit = entry !== null;
    if (!entry) {
      const entryValue = cacheEntryFor(candidate, contextBindingSha256);
      const persistedEntry = persistCanonicalReviewTransportJson({
        root: prepareEntryRoot(candidate.cache_key_sha256, contextBindingSha256),
        kind: 'opl_review_evidence_cache_entry',
        value: entryValue,
      });
      entry = readExistingEntry(candidate, contextBindingSha256);
      if (!entry) {
        throw reviewTransportError(
          'review_evidence_cache_entry_missing_after_persist',
          'Review evidence cache entry is missing after persistence.',
        );
      }
      cacheHit = !persistedEntry.created;
    }
  }

  const debt = debtReason ? qualityDebt(debtReason) : null;
  const receipt = {
    surface_kind: 'opl_review_evidence_cache_receipt',
    schema_version: 2,
    status: debt ? 'stored_not_reusable' : cacheHit ? 'cache_hit' : 'cache_miss_stored',
    cache_hit: debt ? false : cacheHit,
    cache_key_sha256: candidate.cache_key_sha256,
    review_lane: candidate.review_lane,
    review_scope_sha256: candidate.review_scope_sha256,
    rubric_sha256: candidate.rubric_sha256,
    evidence_candidate_ref: candidatePersisted.exact_ref,
    stored_entry_ref: debt ? null : entry?.entry_ref ?? null,
    candidate_origin_reviewer_invocation_ref: candidate.origin_reviewer_invocation_ref,
    candidate_origin_reviewer_evidence_ref: candidate.origin_reviewer_evidence_ref,
    reusable_origin_reviewer_invocation_ref: debt
      ? null
      : entry?.entry.origin_reviewer_invocation_ref ?? null,
    reusable_origin_reviewer_evidence_ref: debt
      ? null
      : entry?.entry.origin_reviewer_evidence_ref ?? null,
    context_binding: contextBinding,
    context_binding_sha256: contextBindingSha256,
    context_binding_match: contextBindingMatch,
    cache_reuse_eligible: !debt && entry !== null,
    quality_debt: debt,
    stage_transition_allowed: true,
    typed_blocker_ref: null,
    cache_authority: false,
    requires_fresh_reviewer_invocation: true,
    requires_fresh_reviewer_receipt: true,
    requires_mas_judgment: true,
    authority_boundary: CACHE_AUTHORITY_BOUNDARY,
  } as const;
  const persistedReceipt = persistCanonicalReviewTransportJson({
    root: roots.evidence_cache_receipt_root,
    kind: 'opl_review_evidence_cache_receipt',
    value: receipt,
  });
  return readReviewEvidenceCacheReceipt(persistedReceipt.exact_ref, contextBinding);
}

function readReceiptTransport(exactRef: unknown) {
  return readReviewTransportJsonExactRef({
    exactRef, expectedKind: 'opl_review_evidence_cache_receipt',
    trustedRoot: reviewTransportRoots().evidence_cache_receipt_root,
  });
}

function readPersistedReceipt(exactRef: unknown) {
  const persisted = readReceiptTransport(exactRef);
  const receipt = normalizeReceipt(persisted.value);
  if (receipt.context_binding) validateContextSnapshot(receipt.context_binding);
  assertCanonicalPersistedValue({
    value: persisted.value,
    normalized: receipt,
    exactRef: persisted.exact_ref,
    failureCode: 'review_evidence_cache_receipt_canonical_bytes_mismatch',
    label: 'Persisted review evidence cache receipt',
  });
  return { receipt_ref: persisted.exact_ref, receipt };
}

function validateReceiptReferences(receipt: ReturnType<typeof normalizeReceipt>) {
  const persistedCandidate = readCandidateExactRef(receipt.evidence_candidate_ref);
  const candidate = persistedCandidate.candidate;
  const actualContextMatch = receipt.context_binding !== null
    && contextBindingMatchesCandidate(receipt.context_binding, candidate);
  if (
    !refsEqual(receipt.evidence_candidate_ref, persistedCandidate.candidate_ref)
    || receipt.cache_key_sha256 !== candidate.cache_key_sha256
    || receipt.review_scope_sha256 !== candidate.review_scope_sha256
    || receipt.rubric_sha256 !== candidate.rubric_sha256
    || !refsEqual(
      receipt.candidate_origin_reviewer_invocation_ref,
      candidate.origin_reviewer_invocation_ref,
    )
    || !refsEqual(
      receipt.candidate_origin_reviewer_evidence_ref,
      candidate.origin_reviewer_evidence_ref,
    )
    || receipt.context_binding_match !== actualContextMatch
  ) {
    throw reviewTransportError(
      'review_evidence_cache_receipt_candidate_mismatch',
      'Review evidence cache receipt does not bind its persisted candidate and context.',
    );
  }
  if (receipt.stored_entry_ref) {
    if (!receipt.context_binding_sha256) {
      throw reviewTransportError(
        'review_evidence_cache_receipt_entry_context_missing',
        'Reusable review evidence cache receipt is missing its context digest.',
      );
    }
    const stored = readEntryExactRef(
      receipt.stored_entry_ref,
      candidate,
      receipt.context_binding_sha256,
    );
    if (
      !refsEqual(receipt.stored_entry_ref, stored.entry_ref)
      || !refsEqual(
        receipt.reusable_origin_reviewer_invocation_ref,
        stored.entry.origin_reviewer_invocation_ref,
      )
      || !refsEqual(
        receipt.reusable_origin_reviewer_evidence_ref,
        stored.entry.origin_reviewer_evidence_ref,
      )
    ) {
      throw reviewTransportError(
        'review_evidence_cache_receipt_entry_mismatch',
        'Review evidence cache receipt does not bind its persisted reusable entry.',
      );
    }
  }
}

export function readReviewEvidenceCacheReceipt(exactRef: unknown,
  expectedContext?: ReviewEvidenceCacheContextBinding | null) {
  const persisted = readPersistedReceipt(exactRef);
  const { receipt } = persisted;
  validateReceiptReferences(receipt);
  if (expectedContext !== null && expectedContext !== undefined) {
    const normalizedExpectedContext = normalizeContextBinding(expectedContext);
    if (
      !receipt.context_binding
      || canonicalJsonText(receipt.context_binding) !== canonicalJsonText(normalizedExpectedContext)
    ) {
      throw reviewTransportError(
        'review_evidence_cache_receipt_replay_context_mismatch',
        'Review evidence cache receipt does not match the expected package-owner context binding.',
      );
    }
  }
  return { receipt_ref: persisted.receipt_ref, receipt, context_binding: receipt.context_binding };
}

function receiptEvaluation(input: {
  receiptRef: ReviewEvidenceCacheExactRef; currentContext: ReviewEvidenceCacheContextBinding | null;
  receiptContextSha256: string | null; debt: ReviewEvidenceCacheQualityDebt | null;
}): ReviewEvidenceCacheReceiptEvaluation {
  return {
    surface_kind: 'opl_review_evidence_cache_receipt_evaluation', schema_version: 1,
    status: input.debt ? 'quality_debt' : 'cache_reusable', receipt_ref: input.receiptRef,
    current_context_binding: input.currentContext,
    current_context_binding_sha256: input.currentContext
      ? canonicalSha256(input.currentContext)
      : null,
    receipt_context_binding_sha256: input.receiptContextSha256,
    cache_reuse_eligible: input.debt === null, quality_debt: input.debt,
    stage_transition_allowed: true, typed_blocker_ref: null,
    requires_fresh_reviewer_invocation: true, requires_fresh_reviewer_receipt: true,
    requires_mas_judgment: true,
  };
}

export function evaluateReviewEvidenceCacheReceipt(exactRef: unknown,
  currentContext: unknown, expectedReceiptBody?: unknown): ReviewEvidenceCacheReceiptEvaluation {
  let normalizedContext: ReviewEvidenceCacheContextBinding | null = null;
  try {
    normalizedContext = normalizeContextBinding(currentContext);
  } catch {
    // A missing or malformed current binding cannot authorize reuse, but must not block progress.
  }
  if (normalizedContext) {
    try {
      validateContextSnapshot(normalizedContext);
    } catch (error) {
      if (
        error instanceof Error
        && 'details' in error
        && (error as { details?: Record<string, unknown> }).details?.failure_code
          === 'review_evidence_cache_context_snapshot_scope_mismatch'
      ) normalizedContext = null;
      else throw error;
    }
  }
  const transport = readReceiptTransport(exactRef);
  if (
    expectedReceiptBody !== undefined
    && canonicalJsonText(transport.value) !== canonicalJsonText(expectedReceiptBody)
  ) {
    throw reviewTransportError(
      'review_evidence_cache_receipt_persisted_body_mismatch',
      'Persisted reviewer page-evidence cache receipt body does not match its exact bytes.',
    );
  }
  const unsupported = transport.value.surface_kind !== 'opl_review_evidence_cache_receipt'
    || transport.value.schema_version !== 2;
  if (unsupported) {
    return receiptEvaluation({
      receiptRef: transport.exact_ref,
      currentContext: normalizedContext,
      receiptContextSha256: null,
      debt: qualityDebt('review_evidence_cache_receipt_unsupported'),
    });
  }
  const persisted = readPersistedReceipt(transport.exact_ref);
  validateReceiptReferences(persisted.receipt);
  const contextMatches = normalizedContext !== null
    && persisted.receipt.context_binding !== null
    && refsEqual(normalizedContext, persisted.receipt.context_binding);
  const debt = !contextMatches
    ? qualityDebt('review_evidence_cache_receipt_context_mismatch')
    : persisted.receipt.quality_debt;
  return receiptEvaluation({
    receiptRef: persisted.receipt_ref,
    currentContext: normalizedContext,
    receiptContextSha256: persisted.receipt.context_binding_sha256,
    debt,
  });
}

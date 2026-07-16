import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { canonicalJsonText } from '../../kernel/canonical-json.ts';
import { isRecord } from '../../kernel/contract-validation.ts';
import {
  canonicalReviewTransportSha256,
  persistCanonicalReviewTransportJson,
  readReviewTransportJsonExactRef,
  requireExactReviewTransportKeys,
  requireReviewTransportRecord,
  requiredReviewTransportText,
  reviewTransportError,
  reviewTransportRoots,
  reviewTransportSize,
  type ReviewTransportExactRef,
} from './family-runtime-review-transport-store.ts';

const PAGE_HASH_RASTER_CONTRACT = {
  contract_id: 'scholarskills_pdf_page_pixel_raster',
  contract_version: 1,
  scale_x: 2,
  scale_y: 2,
  nominal_dpi: 144,
  colorspace: 'sRGB',
  pixel_format: 'RGB8',
  alpha: false,
  annotations: true,
  hash_algorithm: 'sha256',
  page_order: 'document_order',
} as const;

const CACHE_AUTHORITY_BOUNDARY = {
  cache_authority: false,
  can_emit_verdict: false,
  can_sign_reviewer_receipt: false,
  can_sign_owner_receipt: false,
  can_create_typed_blocker: false,
  can_claim_quality_readiness: false,
  can_claim_publication_readiness: false,
  can_claim_current_package_authority: false,
  cache_hit_can_skip_fresh_reviewer_invocation: false,
  cache_hit_can_skip_fresh_reviewer_receipt: false,
  cache_hit_can_skip_mas_judgment: false,
} as const;

type PageHashEvidencePage = {
  page_number: number;
  width: number;
  height: number;
  pixel_format: 'RGB8';
  pixel_sha256: string;
};

type PageHashEvidenceCandidate = {
  surface_kind: 'scholarskills_page_hash_evidence_candidate';
  schema_version: 1;
  review_lane: 'display';
  review_scope_sha256: string;
  rubric_sha256: string;
  raster_contract: typeof PAGE_HASH_RASTER_CONTRACT;
  pages: PageHashEvidencePage[];
  cache_key_sha256: string;
  origin_reviewer_invocation_ref: Record<string, unknown> | null;
  origin_reviewer_evidence_ref: Record<string, unknown> | null;
  cache_reuse_eligible: boolean;
  cache_authority: false;
  requires_fresh_reviewer_invocation: true;
  requires_fresh_reviewer_receipt: true;
  requires_mas_judgment: true;
  authority_boundary: Record<string, false>;
};

function normalizePage(value: unknown, index: number): PageHashEvidencePage {
  const field = `pages[${index}]`;
  const page = requireReviewTransportRecord(value, field);
  requireExactReviewTransportKeys(
    page,
    ['page_number', 'width', 'height', 'pixel_format', 'pixel_sha256'],
    field,
  );
  const pageNumber = reviewTransportSize(page.page_number, `${field}.page_number`, 1);
  if (pageNumber !== index + 1) {
    throw reviewTransportError(
      'review_evidence_cache_page_order_invalid',
      'Page evidence cache pages must use contiguous document-order page numbers.',
      { expected_page_number: index + 1, received_page_number: pageNumber },
    );
  }
  if (page.pixel_format !== 'RGB8') {
    throw reviewTransportError(
      'review_evidence_cache_pixel_format_invalid',
      'Page evidence cache pixel_format must match the fixed RGB8 raster contract.',
      { page_number: pageNumber, pixel_format: page.pixel_format ?? null },
    );
  }
  return {
    page_number: pageNumber,
    width: reviewTransportSize(page.width, `${field}.width`, 1),
    height: reviewTransportSize(page.height, `${field}.height`, 1),
    pixel_format: 'RGB8',
    pixel_sha256: canonicalReviewTransportSha256(page.pixel_sha256, `${field}.pixel_sha256`),
  };
}

function normalizeOriginRef(value: unknown, field: string) {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) return null;
  const ref = typeof value.ref === 'string' && value.ref.trim() ? value.ref.trim() : null;
  let sha256: string | null = null;
  try {
    sha256 = canonicalReviewTransportSha256(value.sha256, `${field}.sha256`);
  } catch {
    return null;
  }
  if (!ref) return null;
  if (
    value.size_bytes !== undefined
    && (!Number.isSafeInteger(value.size_bytes) || Number(value.size_bytes) < 0)
  ) return null;
  return {
    ...value,
    ref,
    sha256,
    ...(value.size_bytes === undefined ? {} : { size_bytes: Number(value.size_bytes) }),
  };
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
    'surface_kind',
    'schema_version',
    'review_lane',
    'review_scope_sha256',
    'rubric_sha256',
    'raster_contract',
    'pages',
    'cache_key_sha256',
    'origin_reviewer_invocation_ref',
    'origin_reviewer_evidence_ref',
    'cache_reuse_eligible',
    'cache_authority',
    'requires_fresh_reviewer_invocation',
    'requires_fresh_reviewer_receipt',
    'requires_mas_judgment',
    'authority_boundary',
  ], 'page_hash_evidence_candidate');
  if (
    candidate.surface_kind !== 'scholarskills_page_hash_evidence_candidate'
    || candidate.schema_version !== 1
    || candidate.review_lane !== 'display'
  ) {
    throw reviewTransportError(
      'review_evidence_cache_candidate_surface_invalid',
      'Page evidence cache candidate must use the ScholarSkills display schema 1 surface.',
      {
        surface_kind: candidate.surface_kind ?? null,
        schema_version: candidate.schema_version ?? null,
        review_lane: candidate.review_lane ?? null,
      },
    );
  }
  const rasterContract = requireReviewTransportRecord(candidate.raster_contract, 'raster_contract');
  if (canonicalJsonText(rasterContract) !== canonicalJsonText(PAGE_HASH_RASTER_CONTRACT)) {
    throw reviewTransportError(
      'review_evidence_cache_raster_contract_mismatch',
      'Page evidence cache candidate does not use the fixed ScholarSkills raster contract.',
      { expected_raster_contract: PAGE_HASH_RASTER_CONTRACT },
    );
  }
  if (!Array.isArray(candidate.pages) || candidate.pages.length === 0) {
    throw reviewTransportError(
      'review_evidence_cache_pages_missing',
      'Page evidence cache candidate must contain at least one ordered page projection.',
    );
  }
  const pages = candidate.pages.map(normalizePage);
  const reviewScopeSha256 = canonicalReviewTransportSha256(
    candidate.review_scope_sha256,
    'review_scope_sha256',
  );
  const rubricSha256 = canonicalReviewTransportSha256(candidate.rubric_sha256, 'rubric_sha256');
  const expectedCacheKey = reviewEvidenceCacheKey({
    pages,
    reviewScopeSha256,
    rubricSha256,
  });
  const suppliedCacheKey = canonicalReviewTransportSha256(
    candidate.cache_key_sha256,
    'cache_key_sha256',
  );
  if (suppliedCacheKey !== expectedCacheKey) {
    throw reviewTransportError(
      'review_evidence_cache_key_mismatch',
      'Page evidence cache candidate key does not match its canonical pages, raster, scope, and rubric.',
      { supplied_cache_key_sha256: suppliedCacheKey, expected_cache_key_sha256: expectedCacheKey },
    );
  }
  const originInvocation = normalizeOriginRef(
    candidate.origin_reviewer_invocation_ref,
    'origin_reviewer_invocation_ref',
  );
  const originEvidence = normalizeOriginRef(
    candidate.origin_reviewer_evidence_ref,
    'origin_reviewer_evidence_ref',
  );
  const originBound = originInvocation !== null && originEvidence !== null;
  const authority = requireReviewTransportRecord(candidate.authority_boundary, 'authority_boundary');
  const forbiddenAuthority = [
    'can_emit_verdict',
    'can_sign_reviewer_receipt',
    'can_sign_owner_receipt',
    'can_create_typed_blocker',
    'can_claim_quality_readiness',
    'can_claim_publication_readiness',
    'can_claim_current_package_authority',
  ];
  if (
    candidate.cache_reuse_eligible !== originBound
    || candidate.cache_authority !== false
    || candidate.requires_fresh_reviewer_invocation !== true
    || candidate.requires_fresh_reviewer_receipt !== true
    || candidate.requires_mas_judgment !== true
    || forbiddenAuthority.some((field) => authority[field] !== false)
  ) {
    throw reviewTransportError(
      'review_evidence_cache_candidate_authority_invalid',
      'Page evidence cache candidate grants authority or contradicts its fresh-review requirements.',
    );
  }
  return {
    surface_kind: 'scholarskills_page_hash_evidence_candidate',
    schema_version: 1,
    review_lane: 'display',
    review_scope_sha256: reviewScopeSha256,
    rubric_sha256: rubricSha256,
    raster_contract: PAGE_HASH_RASTER_CONTRACT,
    pages,
    cache_key_sha256: expectedCacheKey,
    origin_reviewer_invocation_ref: originInvocation,
    origin_reviewer_evidence_ref: originEvidence,
    cache_reuse_eligible: originBound,
    cache_authority: false,
    requires_fresh_reviewer_invocation: true,
    requires_fresh_reviewer_receipt: true,
    requires_mas_judgment: true,
    authority_boundary: Object.fromEntries(forbiddenAuthority.map((field) => [field, false])),
  };
}

function exactRefForJsonFile(kind: string, filePath: string): ReviewTransportExactRef {
  const filenameDigest = path.basename(filePath).replace(/\.json$/, '');
  return {
    kind,
    ref: pathToFileURL(filePath).href,
    size_bytes: fs.statSync(filePath).size,
    sha256: `sha256:${filenameDigest}`,
  };
}

function readExistingEntry(cacheKey: string) {
  const root = path.join(
    reviewTransportRoots().evidence_cache_entry_root,
    cacheKey.replace(/^sha256:/, ''),
  );
  if (!fs.existsSync(root)) return null;
  const entries = fs.readdirSync(root)
    .filter((name) => /^[a-f0-9]{64}\.json$/.test(name))
    .sort();
  if (entries.length === 0) return null;
  const exactRef = exactRefForJsonFile('opl_review_evidence_cache_entry', path.join(root, entries[0]!));
  const persisted = readReviewTransportJsonExactRef({
    exactRef,
    expectedKind: 'opl_review_evidence_cache_entry',
    trustedRoot: root,
  });
  const entry = persisted.value;
  if (
    entry.surface_kind !== 'opl_review_evidence_cache_entry'
    || entry.schema_version !== 1
    || entry.cache_key_sha256 !== cacheKey
    || entry.cache_authority !== false
  ) {
    throw reviewTransportError(
      'review_evidence_cache_entry_invalid',
      'Persisted page evidence cache entry does not bind its key or no-authority boundary.',
      { cache_key_sha256: cacheKey },
    );
  }
  return { entry_ref: persisted.exact_ref, entry };
}

function cacheEntryFor(candidate: PageHashEvidenceCandidate) {
  return {
    surface_kind: 'opl_review_evidence_cache_entry',
    schema_version: 1,
    cache_key_sha256: candidate.cache_key_sha256,
    review_lane: candidate.review_lane,
    review_scope_sha256: candidate.review_scope_sha256,
    rubric_sha256: candidate.rubric_sha256,
    raster_contract: candidate.raster_contract,
    pages: candidate.pages,
    origin_reviewer_invocation_ref: candidate.origin_reviewer_invocation_ref,
    origin_reviewer_evidence_ref: candidate.origin_reviewer_evidence_ref,
    cache_authority: false,
    requires_fresh_reviewer_invocation: true,
    requires_fresh_reviewer_receipt: true,
    requires_mas_judgment: true,
  };
}

export function persistReviewEvidenceCacheCandidate(value: unknown) {
  const candidate = normalizeCandidate(value);
  const roots = reviewTransportRoots();
  const candidatePersisted = persistCanonicalReviewTransportJson({
    root: roots.evidence_cache_candidate_root,
    kind: 'scholarskills_page_hash_evidence_candidate',
    value: candidate,
  });
  const existing = candidate.cache_reuse_eligible
    ? readExistingEntry(candidate.cache_key_sha256)
    : null;
  let entry = existing;
  if (candidate.cache_reuse_eligible && !entry) {
    const entryRoot = path.join(
      roots.evidence_cache_entry_root,
      candidate.cache_key_sha256.replace(/^sha256:/, ''),
    );
    const persisted = persistCanonicalReviewTransportJson({
      root: entryRoot,
      kind: 'opl_review_evidence_cache_entry',
      value: cacheEntryFor(candidate),
    });
    entry = readExistingEntry(candidate.cache_key_sha256) ?? {
      entry_ref: persisted.exact_ref,
      entry: cacheEntryFor(candidate),
    };
  }
  const receipt = {
    surface_kind: 'opl_review_evidence_cache_receipt',
    schema_version: 1,
    status: !candidate.cache_reuse_eligible
      ? 'stored_not_reusable'
      : existing
        ? 'cache_hit'
        : 'cache_miss_stored',
    cache_hit: existing !== null,
    cache_key_sha256: candidate.cache_key_sha256,
    review_lane: candidate.review_lane,
    review_scope_sha256: candidate.review_scope_sha256,
    rubric_sha256: candidate.rubric_sha256,
    evidence_candidate_ref: candidatePersisted.exact_ref,
    stored_entry_ref: entry?.entry_ref ?? null,
    candidate_origin_reviewer_invocation_ref: candidate.origin_reviewer_invocation_ref,
    candidate_origin_reviewer_evidence_ref: candidate.origin_reviewer_evidence_ref,
    reusable_origin_reviewer_invocation_ref:
      isRecord(entry?.entry) ? entry.entry.origin_reviewer_invocation_ref ?? null : null,
    reusable_origin_reviewer_evidence_ref:
      isRecord(entry?.entry) ? entry.entry.origin_reviewer_evidence_ref ?? null : null,
    cache_reuse_eligible: candidate.cache_reuse_eligible && entry !== null,
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
  return {
    receipt_ref: persistedReceipt.exact_ref,
    receipt,
  };
}

export function readReviewEvidenceCacheReceipt(exactRef: unknown) {
  const persisted = readReviewTransportJsonExactRef({
    exactRef,
    expectedKind: 'opl_review_evidence_cache_receipt',
    trustedRoot: reviewTransportRoots().evidence_cache_receipt_root,
  });
  const receipt = persisted.value;
  if (
    receipt.surface_kind !== 'opl_review_evidence_cache_receipt'
    || receipt.schema_version !== 1
    || receipt.cache_authority !== false
    || receipt.requires_fresh_reviewer_invocation !== true
    || receipt.requires_fresh_reviewer_receipt !== true
    || receipt.requires_mas_judgment !== true
  ) {
    throw reviewTransportError(
      'review_evidence_cache_receipt_invalid',
      'Persisted page evidence cache receipt violates its refs-only no-authority contract.',
    );
  }
  return { receipt_ref: persisted.exact_ref, receipt };
}

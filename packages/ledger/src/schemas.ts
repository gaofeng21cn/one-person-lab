import { z } from 'zod';

import { newId, nowIso } from '@opl/core';

import { assertRefsOnlyPayload, assertSafeRefPath } from './refs-only.ts';
import {
  LEDGER_ENTRY_KINDS,
  LedgerError,
  type AppendLedgerEntryInput,
  type LedgerEntry,
  type LedgerEntryKind,
  type LedgerPayloadByKind,
} from './types.ts';

const nonEmptyShortString = z.string().trim().min(1).max(128);
const refString = z.string().trim().min(1).max(1_024);
const optionalShortText = z.string().trim().min(1).max(2_048).optional();
const sha256Pattern = /^(?:sha256:)?[a-fA-F0-9]{6,128}$/;

export const artifactRefPayloadSchema = z
  .looseObject({
    path: refString.superRefine((value, ctx) => {
      try {
        assertSafeRefPath(value, '$.path');
      } catch (err) {
        ctx.addIssue({
          code: 'custom',
          message: err instanceof Error ? err.message : 'Invalid artifact path',
        });
      }
    }),
    sha256: z.string().trim().regex(sha256Pattern, 'Invalid sha256 hex digest').optional(),
    artifact_id: nonEmptyShortString.optional(),
    media_type: nonEmptyShortString.optional(),
    size_bytes: z.number().int().nonnegative().optional(),
    role: nonEmptyShortString.optional(),
    summary: optionalShortText,
    source_refs: z.array(refString).optional(),
    lineage_refs: z.array(refString).optional(),
    checksum_status: z.enum(['verified', 'missing', 'mismatch', 'unchecked']).optional(),
  });

export const ownerReceiptPayloadSchema = z
  .looseObject({
    receipt_id: nonEmptyShortString.optional(),
    status: nonEmptyShortString.optional(),
    delta_classification: z
      .enum([
        'deliverable_progress_delta',
        'platform_repair_delta',
        'advisory_delta',
        'typed_blocker',
        'human_gate',
      ])
      .optional(),
    produced_refs: z.array(refString).optional(),
    consumed_refs: z.array(refString).optional(),
    resolves_debt: nonEmptyShortString.optional(),
    resolves_debt_ids: z.array(nonEmptyShortString).optional(),
    next_owner: nonEmptyShortString.optional(),
    evidence_refs: z.array(refString).optional(),
    summary: optionalShortText,
    seq: z.number().int().nonnegative().optional(),
  })
  .superRefine((val, ctx) => {
    if (
      val.status === undefined
      && val.receipt_id === undefined
      && val.delta_classification === undefined
      && val.seq === undefined
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'owner_receipt requires at least one of status, receipt_id, delta_classification, or seq.',
      });
    }
  });

export const qualityDebtPayloadSchema = z
  .looseObject({
    debt_id: nonEmptyShortString.optional(),
    id: nonEmptyShortString.optional(),
    code: nonEmptyShortString.optional(),
    summary: optionalShortText,
    severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    blocks_submission: z.boolean().optional(),
    evidence_refs: z.array(refString).optional(),
    finding_ref: refString.optional(),
    stage_id: nonEmptyShortString.optional(),
  })
  .superRefine((val, ctx) => {
    if (val.debt_id === undefined && val.id === undefined && val.code === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'quality_debt requires at least one of debt_id, id, or code.',
      });
    }
  });

export const reviewVerdictPayloadSchema = z.looseObject({
  verdict: z.enum([
    'pass',
    'approved',
    'repair_required',
    'quality_debt',
    'hard_stop',
    'rejected',
  ]),
  reviewer_id: nonEmptyShortString.optional(),
  reviewer_role: z.enum(['reviewer', 're_reviewer', 'human']).optional(),
  reviewed_artifact_refs: z.array(refString).optional(),
  verified_hashes: z.array(z.string().trim().regex(sha256Pattern)).optional(),
  finding_refs: z.array(refString).optional(),
  quality_debt_ids: z.array(nonEmptyShortString).optional(),
  hard_stop_class: z
    .enum([
      'zero_consumable_artifact',
      'safety_or_compliance',
      'permission_or_credential_boundary',
      'human_decision_required',
      'authority_boundary_violation',
      'stale_or_mismatched_stage_identity',
    ])
    .optional(),
  summary: optionalShortText,
});

export const typedBlockerPayloadSchema = z.looseObject({
  code: nonEmptyShortString,
  blocker_class: nonEmptyShortString.optional(),
  message: optionalShortText,
  summary: optionalShortText,
  retryable: z.boolean().optional(),
  next_safe_action: nonEmptyShortString.optional(),
  evidence_refs: z.array(refString).optional(),
  typed_blocker_ref: refString.optional(),
});

export const humanDecisionPayloadSchema = z.looseObject({
  decision: nonEmptyShortString,
  actor_id: nonEmptyShortString.optional(),
  gate_id: nonEmptyShortString.optional(),
  selected_option: nonEmptyShortString.optional(),
  reason: optionalShortText,
  note: optionalShortText,
  waived_debt_ids: z.array(nonEmptyShortString).optional(),
  evidence_refs: z.array(refString).optional(),
});

export const failedPathNotePayloadSchema = z.looseObject({
  summary: z.string().trim().min(1).max(2_048),
  path_id: nonEmptyShortString.optional(),
  code: nonEmptyShortString.optional(),
  attempted_approach: optionalShortText,
  failure_mode: optionalShortText,
  failed_path_ref: refString.optional(),
  artifact_refs: z.array(refString).optional(),
  recoverable: z.boolean().optional(),
});

export const PAYLOAD_SCHEMAS_BY_KIND = {
  artifact_ref: artifactRefPayloadSchema,
  owner_receipt: ownerReceiptPayloadSchema,
  quality_debt: qualityDebtPayloadSchema,
  review_verdict: reviewVerdictPayloadSchema,
  typed_blocker: typedBlockerPayloadSchema,
  human_decision: humanDecisionPayloadSchema,
  failed_path_note: failedPathNotePayloadSchema,
} as const;

const entryEnvelopeSchema = z.object({
  entry_id: nonEmptyShortString.optional(),
  task_id: nonEmptyShortString,
  stage_run_id: nonEmptyShortString.nullable().optional(),
  attempt_id: nonEmptyShortString.nullable().optional(),
  entry_kind: z.enum(LEDGER_ENTRY_KINDS),
  owner_id: nonEmptyShortString,
  payload: z.record(z.string(), z.unknown()),
  created_at: z.string().trim().min(1).max(64).optional(),
});

export interface ValidatedLedgerEntry<K extends LedgerEntryKind = LedgerEntryKind> {
  readonly entry: LedgerEntry<K>;
  readonly payloadJson: string;
}

export function validateLedgerEntryInput<K extends LedgerEntryKind>(
  input: AppendLedgerEntryInput<K>,
): ValidatedLedgerEntry<K> {
  const envelopeParsed = entryEnvelopeSchema.safeParse(input);
  if (!envelopeParsed.success) {
    throw new LedgerError('INVALID_LEDGER_INPUT', 'Invalid ledger entry envelope.', {
      issues: envelopeParsed.error.issues,
    });
  }

  const env = envelopeParsed.data;
  const kindSchema = PAYLOAD_SCHEMAS_BY_KIND[env.entry_kind];
  const payloadParsed = kindSchema.safeParse(env.payload);
  if (!payloadParsed.success) {
    const firstPath = payloadParsed.error.issues[0]?.path.join('.');
    if (firstPath === 'path') {
      const msg = payloadParsed.error.issues[0]?.message ?? '';
      if (
        msg.includes('traversal')
        || msg.includes('null bytes')
        || msg.includes('control')
        || msg.includes('absolute')
        || msg.includes('escape')
      ) {
        throw new LedgerError('REFS_ONLY_VIOLATION', msg, { path: '$.path' });
      }
    }
    throw new LedgerError(
      'INVALID_LEDGER_INPUT',
      `Invalid payload for entry_kind '${env.entry_kind}'.`,
      {
        entry_kind: env.entry_kind,
        issues: payloadParsed.error.issues,
      },
    );
  }

  const payloadJson = assertRefsOnlyPayload(payloadParsed.data);

  const entry: LedgerEntry<K> = {
    entry_id: env.entry_id ?? newId('le'),
    task_id: env.task_id,
    stage_run_id: env.stage_run_id ?? null,
    attempt_id: env.attempt_id ?? null,
    entry_kind: env.entry_kind as K,
    owner_id: env.owner_id,
    payload: payloadParsed.data as LedgerPayloadByKind[K],
    created_at: env.created_at ?? nowIso(),
  };

  return { entry, payloadJson };
}

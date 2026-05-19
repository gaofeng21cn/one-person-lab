import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildFamilyStageDomainValidityProjection } from '../../src/family-stage-domain-validity.ts';
import { normalizeFamilyStageControlPlane } from '../../src/family-stage-control-plane-contract.ts';
import type { FamilyStageControlPlane } from '../../src/family-stage-control-plane-contract.ts';

type JsonRecord = Record<string, unknown>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function readJson(relativePath: string): JsonRecord {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as JsonRecord;
}

function record(value: unknown): JsonRecord {
  assert.equal(typeof value, 'object');
  assert.notEqual(value, null);
  assert.equal(Array.isArray(value), false);
  return value as JsonRecord;
}

function stringArray(value: unknown): string[] {
  assert.equal(Array.isArray(value), true);
  return value as string[];
}

function buildPlane(overrides: {
  authorProperties?: string[];
  authorEvaluationRefs?: JsonRecord[];
  reviewProperties?: string[];
  reviewEvaluationRefs?: JsonRecord[];
  reviewTrustBoundary?: JsonRecord;
} = {}): FamilyStageControlPlane {
  const plane = normalizeFamilyStageControlPlane({
    surface_kind: 'family_stage_control_plane',
    version: 'family-stage-control-plane.v1',
    plane_id: 'mas_stage_control_plane',
    target_domain_id: 'med-autoscience',
    owner: 'med-autoscience',
    authority_boundary: { opl_role: 'projection_consumer_only' },
    stages: [
      {
        stage_id: 'manuscript_authoring',
        stage_kind: 'creation',
        title: 'Manuscript authoring',
        summary: 'Author from explicit source refs.',
        goal: 'Produce a manuscript draft under MAS authority.',
        owner: 'med-autoscience',
        domain_stage_refs: ['write'],
        inputs: [],
        knowledge_refs: [],
        skills: [],
        prompt_refs: [],
        allowed_action_refs: [],
        outputs: [],
        evaluation: overrides.authorEvaluationRefs ?? [],
        handoff: null,
        source_refs: [],
        freshness: null,
        action_parity: null,
        stage_contract: {
          requires: ['sources_ready'],
          ensures: ['draft_ready'],
          boundary_assumptions: [],
          properties: overrides.authorProperties ?? [],
          runtime_assumptions: [],
          monitor_refs: [],
          source_scope_refs: [],
          artifact_scope_refs: [],
          workspace_scope_refs: [],
        },
        trust_boundary: {
          lane: 'domain_agent',
          static_check_eligible: true,
          effect_boundary: false,
          records_runtime_events: false,
        },
        authority_boundary: {
          opl_role: 'projection_consumer_only',
          can_write_domain_truth: false,
          can_authorize_quality_verdict: false,
        },
      },
      {
        stage_id: 'publication_review',
        stage_kind: 'review',
        title: 'Publication review',
        summary: 'Review draft refs with independent receipt.',
        goal: 'Gate the draft through MAS publication review authority.',
        owner: 'med-autoscience',
        domain_stage_refs: ['review'],
        inputs: [],
        knowledge_refs: [],
        skills: [],
        prompt_refs: [],
        allowed_action_refs: [],
        outputs: [],
        evaluation: overrides.reviewEvaluationRefs ?? [],
        handoff: null,
        source_refs: [],
        freshness: null,
        action_parity: null,
        stage_contract: {
          requires: ['draft_ready'],
          ensures: ['review_receipt_ready'],
          boundary_assumptions: ['reviewer_judgment_recorded_as_receipt'],
          properties: overrides.reviewProperties ?? [],
          runtime_event_refs: ['runtime_event:publication_review.gate_recorded'],
          runtime_assumptions: [],
          monitor_refs: [],
          source_scope_refs: [],
          artifact_scope_refs: [],
          workspace_scope_refs: [],
        },
        trust_boundary: {
          lane: 'human_gate',
          static_check_eligible: false,
          effect_boundary: true,
          records_runtime_events: true,
          runtime_event_refs: ['runtime_event:publication_review.gate_recorded'],
          owner_receipt_required: true,
          human_gate_required: true,
          ...(overrides.reviewTrustBoundary ?? {}),
        },
        authority_boundary: {
          opl_role: 'projection_consumer_only',
          independent_gate_receipt_required: true,
          can_authorize_quality_verdict: false,
        },
      },
    ],
    notes: [],
  });
  assert.ok(plane);
  return plane;
}

test('family stage domain validity validates contract review refs from properties and surface refs', () => {
  const projection = buildFamilyStageDomainValidityProjection(buildPlane({
    authorProperties: [
      'domain_contract_review_ref:receipt:mas/authoring-contract-reviewed',
      'intent_validation_ref:receipt:mas/authoring-intent-validated',
    ],
    authorEvaluationRefs: [
      {
        ref_kind: 'owner_acceptance_ref',
        ref: 'receipt:mas/authoring-owner-accepted',
        role: 'owner_acceptance',
      },
    ],
    reviewEvaluationRefs: [
      {
        ref_kind: 'domain_contract_review',
        ref: 'receipt:mas/review-contract-reviewed',
        role: 'domain_contract_review_ref',
      },
      {
        ref_kind: 'intent_validation_ref',
        ref: 'receipt:mas/review-intent-validated',
        role: 'intent_validation',
      },
      {
        ref_kind: 'owner_acceptance',
        ref: 'receipt:mas/review-owner-accepted',
        role: 'owner_acceptance_ref',
      },
    ],
  }));

  assert.equal(projection.surface_kind, 'opl_family_stage_domain_validity_projection');
  assert.equal(projection.summary.stage_count, 2);
  assert.equal(projection.summary.validated_count, 2);
  assert.equal(projection.summary.needs_domain_review_count, 0);
  assert.equal(projection.summary.blocked_invalid_or_stale_review_count, 0);
  assert.equal(projection.summary.blocker_count, 0);
  assert.deepEqual(projection.stages.map((stage) => stage.review_status), ['validated', 'validated']);
  assert.equal(projection.stages[0]?.domain_contract_review_refs[0]?.ref, 'receipt:mas/authoring-contract-reviewed');
  assert.equal(projection.stages[0]?.intent_validation_refs[0]?.ref, 'receipt:mas/authoring-intent-validated');
  assert.equal(projection.stages[0]?.owner_acceptance_refs[0]?.ref, 'receipt:mas/authoring-owner-accepted');
  assert.equal(projection.authority_boundary.refs_only, true);
  assert.equal(projection.authority_boundary.can_authorize_domain_ready, false);
  assert.equal(projection.authority_boundary.can_authorize_quality_verdict, false);
  assert.equal(projection.authority_boundary.can_mutate_artifact_body, false);
});

test('family stage domain validity blocks admitted-like or runtime boundary stages missing review refs', () => {
  const projection = buildFamilyStageDomainValidityProjection(buildPlane({
    authorProperties: [
      'domain_contract_review_ref:receipt:mas/authoring-contract-reviewed',
      'intent_validation_ref:receipt:mas/authoring-intent-validated',
      'owner_acceptance_ref:receipt:mas/authoring-owner-accepted',
    ],
  }));
  const reviewStage = projection.stages.find((stage) => stage.stage_id === 'publication_review');

  assert.equal(projection.summary.needs_domain_review_count, 1);
  assert.equal(projection.summary.blocker_count, 1);
  assert.equal(reviewStage?.review_status, 'needs_domain_review');
  assert.equal(reviewStage?.domain_validity_required, true);
  assert.deepEqual(reviewStage?.minimal_counterexamples, [
    {
      stage_id: 'publication_review',
      blocker_kind: 'missing_domain_validity_refs',
      missing_ref_kinds: [
        'domain_contract_review_ref',
        'intent_validation_ref',
        'owner_acceptance_ref',
      ],
      reason: 'stage contract can be admitted or launchable while its business intent has no domain-owner review refs',
    },
  ]);
});

test('family stage domain validity marks stale or invalid review refs as blocked', () => {
  const projection = buildFamilyStageDomainValidityProjection(buildPlane({
    authorProperties: [
      'domain_contract_review_ref:receipt:mas/authoring-contract-reviewed',
      'intent_validation_ref:receipt:mas/authoring-intent-validated',
      'owner_acceptance_ref:receipt:mas/authoring-owner-accepted',
    ],
    reviewProperties: [
      'domain_contract_review_ref:receipt:mas/review-contract-reviewed',
      'intent_validation_ref:receipt:mas/review-intent-validated',
      'owner_acceptance_ref:receipt:mas/review-owner-accepted',
    ],
    reviewEvaluationRefs: [
      {
        ref_kind: 'stale_domain_contract_review_ref',
        ref: 'receipt:mas/review-contract-reviewed@old',
        role: 'domain_contract_review_ref',
      },
    ],
  }));
  const reviewStage = projection.stages.find((stage) => stage.stage_id === 'publication_review');

  assert.equal(projection.summary.blocked_invalid_or_stale_review_count, 1);
  assert.equal(projection.summary.blocker_count, 1);
  assert.equal(reviewStage?.review_status, 'blocked_invalid_or_stale_review');
  assert.deepEqual(reviewStage?.minimal_counterexamples, [
    {
      stage_id: 'publication_review',
      blocker_kind: 'invalid_or_stale_domain_validity_ref',
      invalid_or_stale_refs: ['receipt:mas/review-contract-reviewed@old'],
      reason: 'domain validity review refs are explicitly marked invalid or stale',
    },
  ]);
});

test('family stage domain validity schema freezes refs-only non-authority boundary', () => {
  const schema = readJson('contracts/family-orchestration/family-stage-domain-validity.schema.json');
  const properties = record(schema.properties);
  const defs = record(schema.$defs);
  const stage = record(record(schema.$defs).stage);
  const stageProperties = record(stage.properties);
  const authority = record(record(defs.authority_boundary).properties);
  const blocker = record(defs.counterexample);
  const blockerProperties = record(blocker.properties);

  assert.equal(record(properties.surface_kind).const, 'opl_family_stage_domain_validity_projection');
  assert.equal(stringArray(record(record(stageProperties.review_status).$ref ? defs.review_status : stageProperties.review_status).enum).includes('validated'), true);
  assert.equal(Boolean(stageProperties.domain_contract_review_refs), true);
  assert.equal(Boolean(stageProperties.intent_validation_refs), true);
  assert.equal(Boolean(stageProperties.owner_acceptance_refs), true);
  assert.equal(stringArray(record(blockerProperties.blocker_kind).enum).includes('missing_domain_validity_refs'), true);
  assert.equal(record(authority.opl_role).const, 'domain_validity_refs_projection_only');
  assert.equal(record(authority.refs_only).const, true);
  assert.equal(record(authority.can_authorize_domain_ready).const, false);
  assert.equal(record(authority.can_authorize_quality_verdict).const, false);
  assert.equal(record(authority.can_mutate_artifact_body).const, false);
});

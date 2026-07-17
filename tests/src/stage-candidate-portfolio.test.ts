import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseJsonText } from '../../src/kernel/json-file.ts';

type JsonRecord = Record<string, unknown>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const schemaPath = 'contracts/family-orchestration/stage-candidate-portfolio.schema.json';

function readJson(relativePath: string): JsonRecord {
  assert.equal(fs.existsSync(path.join(repoRoot, relativePath)), true, `${relativePath} should exist`);
  return parseJsonText(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as JsonRecord;
}

function record(value: unknown): JsonRecord {
  assert.equal(typeof value, 'object');
  assert.notEqual(value, null);
  assert.equal(Array.isArray(value), false);
  return value as JsonRecord;
}

function schemaDef(schema: JsonRecord, name: string): JsonRecord {
  return record(record(schema.$defs)[name]);
}

async function loadHelper() {
  try {
    return await import('../../src/modules/console/stage-candidate-portfolio.ts');
  } catch (error) {
    assert.fail(error instanceof Error ? error.message : 'stage candidate portfolio helper module should load');
  }
}

function surfaceProps(surface: JsonRecord): JsonRecord {
  return record(surface.properties);
}

function collectBodyIncluded(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value.flatMap(collectBodyIncluded);
  }
  if (!value || typeof value !== 'object') {
    return [];
  }
  return Object.entries(value as JsonRecord).flatMap(([key, entry]) =>
    key === 'body_included' ? [entry] : collectBodyIncluded(entry)
  );
}

function collectForbiddenBodyKeys(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(collectForbiddenBodyKeys);
  }
  if (!value || typeof value !== 'object') {
    return [];
  }
  return Object.entries(value as JsonRecord).flatMap(([key, entry]) =>
    key === 'domain_body' || key === 'body' || key === 'content' || key === 'payload_body'
      ? [key]
      : collectForbiddenBodyKeys(entry)
  );
}

test('stage candidate portfolio schema freezes refs-only surface family', async () => {
  const schema = readJson(schemaPath);
  const props = record(schema.properties);

  assert.equal(record(props.surface_kind).const, 'stage_candidate_portfolio');
  assert.equal(record(props.version).const, 'stage_candidate_portfolio.v1');
  for (const [defName, surfaceKind, version] of [
    [
      'assumption_decomposition',
      'stage_candidate_assumption_refs',
      'stage_candidate_assumption_refs.v1',
    ],
    [
      'provenance_checks',
      'stage_candidate_provenance_checks',
      'stage_candidate_provenance_checks.v1',
    ],
    [
      'stage_candidate_negative_path_ledger',
      'stage_candidate_negative_path_ledger',
      'stage_candidate_negative_path_ledger.v1',
    ],
    [
      'advisory_metrics',
      'stage_candidate_advisory_metrics',
      'stage_candidate_advisory_metrics.v1',
    ],
    [
      'human_review_refs',
      'stage_candidate_human_review_refs',
      'stage_candidate_human_review_refs.v1',
    ],
  ]) {
    const properties = surfaceProps(schemaDef(schema, defName));
    assert.equal(record(properties.surface_kind).const, surfaceKind);
    assert.equal(record(properties.version).const, version);
  }

  const example = record((schema.examples as JsonRecord[])[0]);
  assert.deepEqual(collectBodyIncluded(example).every((entry) => entry === false), true);
  assert.deepEqual(collectForbiddenBodyKeys(example), []);
  assert.equal(record(example).target_domain_id, 'example-domain');
  assert.equal(Array.isArray(example.stage_candidates), true);
  assert.equal((example.stage_candidates as unknown[]).length, 1);

  const helper = await loadHelper();
  const validation = helper.validateStageCandidatePortfolio(example);
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
});

test('stage candidate portfolio freezes advisory metrics and authority away from domain truth', () => {
  const schema = readJson(schemaPath);
  const props = record(schema.properties);
  const required = schema.required as string[];
  const example = record((schema.examples as JsonRecord[])[0]);
  const boundary = record(example.authority_boundary);
  const authorityProperties = surfaceProps(schemaDef(schema, 'authority_boundary'));
  const metrics = record(example.advisory_metrics);
  const metricsBoundary = record(metrics.authority_boundary);
  const metricsBoundaryProperties = surfaceProps(schemaDef(schema, 'advisory_metrics_authority_boundary'));

  for (const field of [
    'stage_candidates',
    'assumption_decomposition',
    'provenance_checks',
    'negative_path_ledger',
    'advisory_metrics',
    'human_review_refs',
    'authority_boundary',
  ]) {
    assert.equal(required.includes(field), true);
  }

  assert.equal(boundary.opl_role, 'stage_candidate_portfolio_refs_projection_owner');
  assert.equal(boundary.domain_role, 'domain_truth_quality_receipt_and_artifact_authority');
  assert.equal(boundary.portfolio_scope, 'refs_status_advisory_projection_only');
  assert.equal(boundary.holds_domain_truth, false);
  assert.equal(boundary.can_read_domain_body, false);
  assert.equal(boundary.can_write_domain_truth, false);
  assert.equal(boundary.can_authorize_candidate_acceptance, false);
  assert.equal(boundary.can_authorize_domain_ready, false);
  assert.equal(boundary.can_authorize_quality_verdict, false);
  assert.equal(boundary.can_mutate_artifact_body, false);
  assert.equal(boundary.can_accept_or_reject_owner_receipt, false);
  assert.equal(boundary.advisory_metrics_are_domain_verdict, false);
  assert.equal(record(authorityProperties.holds_domain_truth).const, false);
  assert.equal(record(authorityProperties.can_authorize_quality_verdict).const, false);

  assert.equal(metricsBoundary.opl_role, 'advisory_metric_ref_projection_only');
  assert.equal(metricsBoundary.metrics_scope, 'refs_status_advisory_only');
  assert.equal(metricsBoundary.metrics_are_domain_verdict, false);
  assert.equal(metricsBoundary.can_authorize_candidate_acceptance, false);
  assert.equal(metricsBoundary.can_rank_as_domain_truth, false);
  assert.equal(record(metricsBoundaryProperties.metrics_are_domain_verdict).const, false);
  assert.equal(record(metricsBoundaryProperties.can_rank_as_domain_truth).const, false);
});

test('stage candidate portfolio helper projects refs-only summary and fails closed on body or authority expansion', async () => {
  const helper = await loadHelper();
  const example = record((readJson(schemaPath).examples as JsonRecord[])[0]);
  const portfolio = {
    ...example,
    stage_context_refs: [
      ...((example.stage_context_refs as unknown[]) ?? []),
      {
        ref_id: 'context:stale-source',
        role: 'stage_context',
        ref_kind: 'workspace_relative_path',
        ref: 'studies/example/context/stale-source.json',
        status: 'stale',
        required: true,
        body_included: false,
      },
    ],
    human_review_refs: {
      ...(example.human_review_refs as JsonRecord),
      reviews: [
        ...((record(example.human_review_refs).reviews as unknown[]) ?? []),
        {
          review_id: 'review:c1:route-back',
          candidate_id: 'candidate:c1',
          review_type: 'independent_expert_review',
          status: 'route_back',
          reviewer_owner_ref: 'owner:example-domain-reviewer',
          request_ref: 'review-request:example-domain/c1/independent',
          decision_ref: 'review-decision:example-domain/c1/independent',
          route_back_ref: 'route-back:example-domain/c1/missing-source',
          body_included: false,
        },
      ],
    },
  };

  const summary = helper.summarizeStageCandidatePortfolio(portfolio);

  assert.equal(summary.surface_kind, 'stage_candidate_portfolio_summary');
  assert.equal(summary.portfolio_id, 'stage-candidate-portfolio:example-domain');
  assert.equal(summary.candidate_count, 1);
  assert.equal(summary.candidate_status_counts.selected_for_domain_review, 1);
  assert.equal(summary.assumption_count, 1);
  assert.equal(summary.provenance_check_count, 1);
  assert.equal(summary.failed_path_count, 1);
  assert.equal(summary.advisory_metric_count, 1);
  assert.equal(summary.advisory_ranking_count, 1);
  assert.equal(summary.human_review_count, 2);
  assert.equal(summary.pending_human_review_count, 2);
  assert.equal(summary.portfolio_refs.some((entry: { ref: string }) =>
    entry.ref === 'domain://example-domain/stage-candidates/c1'), true);
  assert.deepEqual(summary.missing_refs.map((entry) => entry.ref_id), [
    'context:stale-source',
  ]);
  assert.deepEqual(summary.advisory_refs, [
    'domain://example-domain/stage-candidates/c1/metrics/review-priority',
    'domain://example-domain/stage-candidates/rankings/review-queue',
  ]);
  assert.deepEqual(summary.route_back_refs, ['route-back:example-domain/c1/missing-source']);
  assert.equal(summary.authority_boundary.can_authorize_candidate_acceptance, false);
  assert.equal(summary.advisory_metrics_authority_boundary.can_rank_as_domain_truth, false);

  const invalid = {
    ...example,
    candidate_body: { forbidden: true },
    authority_boundary: {
      ...record(example.authority_boundary),
      can_authorize_quality_verdict: true,
    },
  };
  assert.deepEqual(
    helper.validateStageCandidatePortfolio(invalid).errors.map((entry) => entry.code),
    ['authority_boundary_invalid', 'domain_body_forbidden'],
  );
  assert.throws(
    () => helper.summarizeStageCandidatePortfolio(invalid),
    /Stage candidate portfolio failed fail-closed validation/,
  );
});

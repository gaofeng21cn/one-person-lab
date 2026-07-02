import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type JsonRecord = Record<string, unknown>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const schemaPath = 'contracts/family-orchestration/research-hypothesis-portfolio.schema.json';

function readJson(relativePath: string): JsonRecord {
  assert.equal(fs.existsSync(path.join(repoRoot, relativePath)), true, `${relativePath} should exist`);
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as JsonRecord;
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
    return await import('../../src/modules/foundry-lab/research-hypothesis-portfolio.ts');
  } catch (error) {
    assert.fail(error instanceof Error ? error.message : 'research hypothesis portfolio helper module should load');
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

test('research hypothesis portfolio schema freezes refs-only surface family', async () => {
  const schema = readJson(schemaPath);
  const props = record(schema.properties);

  assert.equal(record(props.surface_kind).const, 'research_hypothesis_portfolio');
  assert.equal(record(props.version).const, 'research_hypothesis_portfolio.v1');
  for (const [defName, surfaceKind, version] of [
    [
      'assumption_decomposition',
      'research_hypothesis_assumption_decomposition',
      'research_hypothesis_assumption_decomposition.v1',
    ],
    [
      'novelty_provenance_checks',
      'research_hypothesis_novelty_provenance_checks',
      'research_hypothesis_novelty_provenance_checks.v1',
    ],
    [
      'hypothesis_negative_failed_path_ledger',
      'research_hypothesis_negative_failed_path_ledger',
      'research_hypothesis_negative_failed_path_ledger.v1',
    ],
    [
      'ranking_proximity_advisory_metrics',
      'research_hypothesis_ranking_proximity_advisory_metrics',
      'research_hypothesis_ranking_proximity_advisory_metrics.v1',
    ],
    [
      'human_review_refs',
      'research_hypothesis_human_review_refs',
      'research_hypothesis_human_review_refs.v1',
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
  assert.equal(Array.isArray(example.hypothesis_candidates), true);
  assert.equal((example.hypothesis_candidates as unknown[]).length, 1);

  const helper = await loadHelper();
  const validation = helper.validateResearchHypothesisPortfolio(example);
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
});

test('research hypothesis portfolio freezes advisory metrics and authority away from domain truth', () => {
  const schema = readJson(schemaPath);
  const props = record(schema.properties);
  const required = schema.required as string[];
  const example = record((schema.examples as JsonRecord[])[0]);
  const boundary = record(example.authority_boundary);
  const authorityProperties = surfaceProps(schemaDef(schema, 'authority_boundary'));
  const metrics = record(example.ranking_proximity_advisory_metrics);
  const metricsBoundary = record(metrics.authority_boundary);
  const metricsBoundaryProperties = surfaceProps(schemaDef(schema, 'advisory_metrics_authority_boundary'));

  for (const field of [
    'hypothesis_candidates',
    'assumption_decomposition',
    'novelty_provenance_checks',
    'negative_failed_path_ledger',
    'ranking_proximity_advisory_metrics',
    'human_review_refs',
    'authority_boundary',
  ]) {
    assert.equal(required.includes(field), true);
  }

  assert.equal(boundary.opl_role, 'hypothesis_portfolio_refs_projection_owner');
  assert.equal(boundary.domain_role, 'hypothesis_truth_quality_receipt_and_artifact_authority');
  assert.equal(boundary.portfolio_scope, 'refs_status_advisory_projection_only');
  assert.equal(boundary.holds_domain_truth, false);
  assert.equal(boundary.can_read_domain_body, false);
  assert.equal(boundary.can_write_domain_truth, false);
  assert.equal(boundary.can_authorize_hypothesis_acceptance, false);
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
  assert.equal(metricsBoundary.can_authorize_hypothesis_acceptance, false);
  assert.equal(metricsBoundary.can_rank_as_domain_truth, false);
  assert.equal(record(metricsBoundaryProperties.metrics_are_domain_verdict).const, false);
  assert.equal(record(metricsBoundaryProperties.can_rank_as_domain_truth).const, false);
});

test('research hypothesis portfolio helper projects refs-only summary and fails closed on body or authority expansion', async () => {
  const helper = await loadHelper();
  const example = record((readJson(schemaPath).examples as JsonRecord[])[0]);
  const portfolio = {
    ...example,
    research_context_refs: [
      ...((example.research_context_refs as unknown[]) ?? []),
      {
        ref_id: 'context:stale-source',
        role: 'research_context',
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
          review_id: 'review:h1:route-back',
          candidate_id: 'candidate:h1',
          review_type: 'independent_expert_review',
          status: 'route_back',
          reviewer_owner_ref: 'owner:example-domain-reviewer',
          request_ref: 'review-request:example-study/h1/independent',
          decision_ref: 'review-decision:example-study/h1/independent',
          route_back_ref: 'route-back:example-study/h1/missing-source',
          body_included: false,
        },
      ],
    },
  };

  const summary = helper.summarizeResearchHypothesisPortfolio(portfolio);

  assert.equal(summary.surface_kind, 'research_hypothesis_portfolio_summary');
  assert.equal(summary.portfolio_id, 'hypothesis-portfolio:example-study');
  assert.equal(summary.candidate_count, 1);
  assert.equal(summary.candidate_status_counts.selected_for_domain_review, 1);
  assert.equal(summary.assumption_count, 1);
  assert.equal(summary.novelty_check_count, 1);
  assert.equal(summary.failed_path_count, 1);
  assert.equal(summary.advisory_metric_count, 1);
  assert.equal(summary.advisory_ranking_count, 1);
  assert.equal(summary.human_review_count, 2);
  assert.equal(summary.pending_human_review_count, 2);
  assert.equal(summary.portfolio_refs.some((entry: { ref: string }) =>
    entry.ref === 'domain://example-study/hypotheses/h1'), true);
  assert.deepEqual(summary.missing_refs.map((entry) => entry.ref_id), [
    'context:stale-source',
  ]);
  assert.deepEqual(summary.advisory_refs, [
    'domain://example-study/hypotheses/h1/metrics/review-priority',
    'domain://example-study/hypotheses/rankings/review-queue',
  ]);
  assert.deepEqual(summary.route_back_refs, ['route-back:example-study/h1/missing-source']);
  assert.equal(summary.authority_boundary.can_authorize_hypothesis_acceptance, false);
  assert.equal(summary.advisory_metrics_authority_boundary.can_rank_as_domain_truth, false);

  const invalid = {
    ...example,
    hypothesis_body: { forbidden: true },
    authority_boundary: {
      ...record(example.authority_boundary),
      can_authorize_quality_verdict: true,
    },
  };
  assert.deepEqual(
    helper.validateResearchHypothesisPortfolio(invalid).errors.map((entry) => entry.code),
    ['authority_boundary_invalid', 'domain_body_forbidden'],
  );
  assert.throws(
    () => helper.summarizeResearchHypothesisPortfolio(invalid),
    /Research hypothesis portfolio failed fail-closed validation/,
  );
});

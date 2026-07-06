import { assert, fs, os, parseJsonText, path, repoRoot, runCli, runCliFailure, test } from '../helpers.ts';

function readSchemaExample() {
  const schemaPath = path.join(
    repoRoot,
    'contracts/family-orchestration/stage-candidate-portfolio.schema.json',
  );
  const schema = parseJsonText(fs.readFileSync(schemaPath, 'utf8')) as {
    examples: Array<Record<string, unknown>>;
  };
  return schema.examples[0];
}

function writePayload(payload: unknown) {
  const payloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-candidate-cli-'));
  const payloadFile = path.join(payloadDir, 'stage-candidate-portfolio.json');
  fs.writeFileSync(payloadFile, `${JSON.stringify(payload, null, 2)}\n`);
  return { payloadDir, payloadFile };
}

test('runtime stage-candidate-portfolio summary projects a body-free CLI read model', () => {
  const example = readSchemaExample();
  const pack = {
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
      ...(example.human_review_refs as Record<string, unknown>),
      reviews: [
        ...(((example.human_review_refs as Record<string, unknown>).reviews as unknown[]) ?? []),
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
  const { payloadDir, payloadFile } = writePayload(pack);
  try {
    const output = runCli([
      'runtime',
      'stage-candidate-portfolio',
      'summary',
      '--payload-file',
      payloadFile,
    ]);
    const readModel = output.stage_candidate_portfolio_read_model;

    assert.equal(readModel.surface_kind, 'stage_candidate_portfolio_summary');
    assert.equal(readModel.portfolio_id, 'stage-candidate-portfolio:example-domain');
    assert.equal(readModel.target_domain_id, 'example-domain');
    assert.equal(readModel.candidate_count, 1);
    assert.equal(readModel.candidate_status_counts.selected_for_domain_review, 1);
    assert.equal(readModel.assumption_count, 1);
    assert.equal(readModel.provenance_check_count, 1);
    assert.equal(readModel.failed_path_count, 1);
    assert.equal(readModel.negative_result_count, 0);
    assert.equal(readModel.advisory_metric_count, 1);
    assert.equal(readModel.advisory_ranking_count, 1);
    assert.equal(readModel.human_review_count, 2);
    assert.equal(readModel.pending_human_review_count, 2);
    assert.equal(readModel.portfolio_refs.some((entry: { ref: string }) =>
      entry.ref === 'domain://example-domain/stage-candidates/c1'), true);
    assert.equal(readModel.portfolio_refs.some((entry: { ref: string }) =>
      entry.ref === 'domain://example-domain/stage-candidates/rankings/review-queue'), true);
    assert.deepEqual(readModel.missing_refs.map((entry: { ref_id: string }) => entry.ref_id), [
      'context:stale-source',
    ]);
    assert.deepEqual(readModel.advisory_refs, [
      'domain://example-domain/stage-candidates/c1/metrics/review-priority',
      'domain://example-domain/stage-candidates/rankings/review-queue',
    ]);
    assert.deepEqual(readModel.human_review_decision_refs, [
      'review-decision:example-domain/c1/independent',
    ]);
    assert.deepEqual(readModel.route_back_refs, [
      'route-back:example-domain/c1/missing-source',
    ]);
    assert.equal(readModel.authority_boundary.can_read_domain_body, false);
    assert.equal(readModel.authority_boundary.can_authorize_candidate_acceptance, false);
    assert.equal(readModel.authority_boundary.can_authorize_quality_verdict, false);
    assert.equal(readModel.authority_boundary.can_mutate_artifact_body, false);
    assert.equal(readModel.authority_boundary.can_accept_or_reject_owner_receipt, false);
    assert.equal(readModel.advisory_metrics_authority_boundary.can_rank_as_domain_truth, false);
    assert.equal(readModel.advisory_metrics_authority_boundary.metrics_are_domain_verdict, false);
  } finally {
    fs.rmSync(payloadDir, { recursive: true, force: true });
  }
});

test('runtime stage-candidate-portfolio summary fails closed on bodies and advisory authority expansion', () => {
  const { payloadDir, payloadFile } = writePayload({
    ...readSchemaExample(),
    candidate_body: { forbidden: true },
    advisory_metrics: {
      ...(readSchemaExample().advisory_metrics as Record<string, unknown>),
      authority_boundary: {
        ...((readSchemaExample().advisory_metrics as Record<string, unknown>)
          .authority_boundary as Record<string, unknown>),
        can_rank_as_domain_truth: true,
      },
    },
  });
  try {
    const failure = runCliFailure([
      'runtime',
      'stage-candidate-portfolio',
      'summary',
      '--payload-file',
      payloadFile,
    ]);

    assert.equal(failure.payload.error.code, 'cli_usage_error');
    assert.match(failure.payload.error.message, /valid body-free stage candidate portfolio/);
    assert.deepEqual(
      failure.payload.error.details.validation_errors.map((entry: { code: string }) => entry.code),
      ['authority_boundary_invalid', 'domain_body_forbidden'],
    );
  } finally {
    fs.rmSync(payloadDir, { recursive: true, force: true });
  }
});

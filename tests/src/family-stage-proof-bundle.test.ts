import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildFamilyStageAdmissionReview } from '../../src/family-stage-admission.ts';
import { buildFamilyStageProofBundle } from '../../src/family-stage-proof-bundle.ts';
import type { FamilyActionCatalog } from '../../src/family-action-catalog-contract.ts';
import type { FamilyStageControlPlane } from '../../src/family-stage-control-plane-contract.ts';

type JsonRecord = Record<string, unknown>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function readJson(relativePath: string): JsonRecord {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as JsonRecord;
}

function buildActionCatalog(): FamilyActionCatalog {
  return {
    surface_kind: 'family_action_catalog',
    version: 'family-action-catalog.v1',
    catalog_id: 'mas_stage_actions',
    target_domain_id: 'med-autoscience',
    owner: 'med-autoscience',
    authority_boundary: {
      opl_role: 'projection_consumer_only',
    },
    actions: [
      {
        action_id: 'author_draft',
        title: 'Author draft',
        summary: 'Produce a draft artifact under the domain stage.',
        owner: 'med-autoscience',
        effect: 'read_only',
        source_command: {
          command: 'medautosci write',
          surface_kind: 'domain_cli',
        },
        input_schema_ref: 'schemas/author.input.schema.json',
        output_schema_ref: 'schemas/author.output.schema.json',
        workspace_locator_fields: ['workspace_root'],
        human_gate_ids: [],
        supported_surfaces: {
          cli: null,
          mcp: null,
          skill: null,
          product_entry: null,
          openai: null,
          ai_sdk: null,
        },
        authority_boundary: {
          opl_role: 'projection_consumer_only',
        },
      },
      {
        action_id: 'review_draft',
        title: 'Review draft',
        summary: 'Review explicit artifact refs and emit owner receipt refs.',
        owner: 'med-autoscience',
        effect: 'read_only',
        source_command: {
          command: 'medautosci review',
          surface_kind: 'domain_cli',
        },
        input_schema_ref: 'schemas/review.input.schema.json',
        output_schema_ref: 'schemas/review.output.schema.json',
        workspace_locator_fields: ['workspace_root'],
        human_gate_ids: ['publication_quality_gate'],
        supported_surfaces: {
          cli: null,
          mcp: null,
          skill: null,
          product_entry: null,
          openai: null,
          ai_sdk: null,
        },
        authority_boundary: {
          opl_role: 'projection_consumer_only',
        },
      },
    ],
    notes: [],
  };
}

function buildStagePlane(overrides: {
  authorEnsures?: string[];
  reviewRequires?: string[];
  reviewStageContract?: FamilyStageControlPlane['stages'][number]['stage_contract'];
  omitReviewStageContract?: boolean;
} = {}): FamilyStageControlPlane {
  return {
    surface_kind: 'family_stage_control_plane',
    version: 'family-stage-control-plane.v1',
    plane_id: 'mas_stage_control_plane',
    target_domain_id: 'med-autoscience',
    owner: 'med-autoscience',
    authority_boundary: {
      opl_role: 'projection_consumer_only',
    },
    stages: [
      {
        stage_id: 'manuscript_authoring',
        stage_kind: 'creation',
        title: 'Manuscript authoring',
        summary: 'Author from explicit source refs.',
        goal: 'Produce a manuscript draft under MAS domain authority.',
        owner: 'med-autoscience',
        domain_stage_refs: ['write'],
        inputs: [],
        knowledge_refs: [],
        skills: [],
        prompt_refs: [],
        allowed_action_refs: ['author_draft'],
        outputs: [
          {
            ref_kind: 'proof',
            ref: 'artifacts/manuscript-draft-proof.json',
            role: 'proof_ref',
          },
        ],
        evaluation: [],
        handoff: {
          next_stage_refs: ['publication_review'],
          provides: overrides.authorEnsures ?? ['draft_ready'],
        },
        source_refs: [],
        freshness: null,
        action_parity: null,
        stage_contract: {
          requires: ['sources_ready'],
          ensures: overrides.authorEnsures ?? ['draft_ready'],
          boundary_assumptions: ['source_refs_are_domain_owned'],
          properties: ['deterministic_handoff_refs'],
          runtime_assumptions: [],
          monitor_refs: [],
        },
        trust_boundary: {
          lane: 'domain_agent',
          static_check_eligible: true,
          effect_boundary: false,
          records_runtime_events: false,
          owner_receipt_required: false,
        },
        authority_boundary: {
          opl_role: 'projection_consumer_only',
          can_write_domain_truth: false,
          idempotency_assumptions: ['same_source_refs_keep_same_handoff_refs'],
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
        allowed_action_refs: ['review_draft'],
        outputs: [],
        evaluation: [
          {
            ref_kind: 'test',
            ref: 'tests/publication-review.test.ts',
            role: 'proof_ref',
          },
        ],
        handoff: null,
        source_refs: [],
        freshness: null,
        action_parity: null,
        stage_contract: overrides.omitReviewStageContract
          ? null
          : overrides.reviewStageContract ?? {
              requires: overrides.reviewRequires ?? ['draft_ready'],
              ensures: ['review_receipt_ready'],
              boundary_assumptions: ['reviewer_judgment_recorded_as_receipt'],
              runtime_event_refs: ['runtime_event:publication_review.gate_recorded'],
              properties: [],
              runtime_assumptions: [],
              monitor_refs: [],
            },
        trust_boundary: {
          lane: 'human_gate',
          static_check_eligible: false,
          effect_boundary: true,
          records_runtime_events: true,
          runtime_event_refs: ['runtime_event:publication_review.gate_recorded'],
          owner_receipt_required: true,
          human_gate_required: true,
        },
        authority_boundary: {
          opl_role: 'projection_consumer_only',
          independent_gate_receipt_required: true,
          expected_receipt_refs: ['mas:publication_review_receipt'],
          can_authorize_quality_verdict: false,
        },
      },
    ],
    notes: [],
  };
}

test('stage proof bundle projects an admitted stage pack into consumable obligations', () => {
  const plane = buildStagePlane();
  const actionCatalog = buildActionCatalog();
  const admissionReview = buildFamilyStageAdmissionReview(plane, {
    family_action_catalog: actionCatalog,
  });
  const bundle = buildFamilyStageProofBundle(plane, {
    actionCatalog,
    admissionReview,
  });

  assert.equal(bundle.surface_kind, 'opl_stage_pack_proof_bundle');
  assert.equal(bundle.version, 'opl-stage-pack-proof-bundle.v1');
  assert.equal(bundle.identity.stage_pack_id, 'med-autoscience:mas_stage_control_plane');
  assert.equal(bundle.identity.action_catalog_id, 'mas_stage_actions');
  assert.equal(bundle.admission_status, 'admitted');
  assert.equal(bundle.authority_boundary.proof_passed, true);
  assert.deepEqual(bundle.composition_obligations[0], {
    edge_id: 'manuscript_authoring->publication_review',
    upstream_stage_id: 'manuscript_authoring',
    downstream_stage_id: 'publication_review',
    upstream_ensures: ['draft_ready'],
    downstream_requires: ['draft_ready'],
    satisfied_by: ['draft_ready'],
    missing: [],
    status: 'satisfied',
  });
  assert.deepEqual(bundle.boundary_assumptions, [
    {
      stage_id: 'manuscript_authoring',
      assumptions: ['source_refs_are_domain_owned'],
    },
    {
      stage_id: 'publication_review',
      assumptions: ['reviewer_judgment_recorded_as_receipt'],
    },
  ]);
  assert.deepEqual(bundle.idempotency_assumptions[0], {
    stage_id: 'manuscript_authoring',
    assumptions: ['same_source_refs_keep_same_handoff_refs', 'deterministic_handoff_refs'],
  });
  assert.ok(bundle.expected_receipt_refs.some((ref) => ref.ref === 'mas:publication_review_receipt'));
  assert.ok(bundle.expected_receipt_refs.some((ref) => ref.ref === 'human_gate:publication_quality_gate'));
  assert.deepEqual(bundle.runtime_event_requirements.find((entry) => entry.stage_id === 'publication_review'), {
    stage_id: 'publication_review',
    trust_lane: 'human_gate',
    required: true,
    satisfied_by_records_runtime_events: true,
    runtime_event_refs: ['runtime_event:publication_review.gate_recorded'],
    satisfied_by_runtime_event_refs: true,
    reason: 'effect_boundary_requires_replayable_runtime_events',
  });
  assert.deepEqual(bundle.test_proof_refs.map((ref) => ref.ref), [
    'artifacts/manuscript-draft-proof.json',
    'tests/publication-review.test.ts',
  ]);
  assert.deepEqual(bundle.proof_runtime_metrics, {
    composition_obligation_count: 1,
    runtime_event_requirement_count: 1,
    satisfied_runtime_event_ref_count: 1,
    expected_receipt_ref_count: 3,
    test_proof_ref_count: 2,
    blocker_count: 0,
    warning_count: 0,
    authority_boundary: {
      opl_role: 'scheduling_operator_observability_only',
      domain_role: 'truth_quality_receipt_and_artifact_authority',
      can_execute_stage: false,
      can_write_domain_truth: false,
      can_authorize_domain_ready: false,
      can_authorize_quality_verdict: false,
      can_mutate_artifact_body: false,
      can_accept_or_reject_owner_receipt: false,
      metrics_are_domain_verdict: false,
    },
  });
});

test('stage proof bundle exposes missing composition and does not mark blocked proof as passed', () => {
  const plane = buildStagePlane({
    authorEnsures: ['draft_exists'],
    reviewRequires: ['draft_ready'],
  });
  const bundle = buildFamilyStageProofBundle(plane, {
    actionCatalog: buildActionCatalog(),
  });

  assert.equal(bundle.admission_status, 'blocked');
  assert.equal(bundle.authority_boundary.proof_passed, false);
  assert.ok(bundle.blocking_reasons.some((finding) => finding.code === 'composition_obligation_not_satisfied'));
  assert.deepEqual(bundle.composition_obligations[0]?.missing, ['draft_ready']);
  assert.equal(bundle.composition_obligations[0]?.status, 'missing');
  assert.equal(bundle.proof_runtime_metrics.composition_obligation_count, 1);
  assert.equal(bundle.proof_runtime_metrics.blocker_count, 1);
  assert.equal(bundle.proof_runtime_metrics.authority_boundary.metrics_are_domain_verdict, false);
});

test('stage proof bundle exposes needs-contracts admission without pretending proof passed', () => {
  const plane = buildStagePlane({
    omitReviewStageContract: true,
  });
  const bundle = buildFamilyStageProofBundle(plane, {
    actionCatalog: buildActionCatalog(),
  });

  assert.equal(bundle.admission_status, 'needs_contracts');
  assert.equal(bundle.authority_boundary.proof_passed, false);
  assert.ok(bundle.blocking_reasons.some((finding) => finding.code === 'missing_stage_contract'));
  assert.ok(bundle.stage_results.some((result) => result.status === 'needs_contracts'));
  assert.equal(bundle.proof_runtime_metrics.blocker_count, 0);
  assert.equal(bundle.proof_runtime_metrics.warning_count, 1);
});

test('stage proof bundle schema freezes authority boundary away from domain truth and artifact body', () => {
  const schema = readJson('contracts/family-orchestration/family-stage-proof-bundle.schema.json');
  const properties = schema.properties as Record<string, JsonRecord>;
  const authoritySchema = properties.authority_boundary as JsonRecord;
  const authorityProperties = authoritySchema.properties as Record<string, JsonRecord>;
  const examples = schema.examples as JsonRecord[];
  const authority = examples[0]?.authority_boundary as JsonRecord;
  const metricsSchema = properties.proof_runtime_metrics as JsonRecord;
  const metrics = examples[0]?.proof_runtime_metrics as JsonRecord;
  const metricsAuthority = metrics.authority_boundary as JsonRecord;

  assert.equal(properties.surface_kind.const, 'opl_stage_pack_proof_bundle');
  assert.equal(properties.version.const, 'opl-stage-pack-proof-bundle.v1');
  assert.equal((metricsSchema.description as string).includes('operator observability'), true);
  assert.equal(metrics.composition_obligation_count, 1);
  assert.equal(metrics.runtime_event_requirement_count, 1);
  assert.equal(metrics.satisfied_runtime_event_ref_count, 1);
  assert.equal(metrics.expected_receipt_ref_count, 1);
  assert.equal(metrics.test_proof_ref_count, 1);
  assert.equal(metricsAuthority.opl_role, 'scheduling_operator_observability_only');
  assert.equal(metricsAuthority.metrics_are_domain_verdict, false);
  assert.equal(metricsAuthority.can_authorize_domain_ready, false);
  assert.equal(metricsAuthority.can_authorize_quality_verdict, false);
  assert.equal(authorityProperties.opl_role.const, 'proof_bundle_projection_owner');
  assert.equal(authorityProperties.domain_role.const, 'truth_quality_receipt_and_artifact_authority');
  assert.equal(authority.can_execute_stage, false);
  assert.equal(authority.can_write_domain_truth, false);
  assert.equal(authority.can_authorize_domain_ready, false);
  assert.equal(authority.can_authorize_quality_verdict, false);
  assert.equal(authority.can_mutate_artifact_body, false);
  assert.equal(authority.can_accept_or_reject_owner_receipt, false);
});

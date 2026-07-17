import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseJsonText } from '../../src/kernel/json-file.ts';
import { buildFamilyStageConformanceReview } from '../../src/modules/stagecraft/family-stage-conformance.ts';
import { buildFamilyStageProofBundle } from '../../src/modules/stagecraft/family-stage-proof-bundle.ts';
import type { FamilyActionCatalog } from '../../src/kernel/family-action-catalog-contract.ts';
import type { FamilyStageContract, FamilyStageControlPlane } from '../../src/modules/stagecraft/family-stage-control-plane-contract.ts';
import {
  STANDARD_PROGRESS_DELTA_POLICY,
  STANDARD_TYPED_BLOCKER_LINEAGE_POLICY,
} from '../../src/modules/pack/standard-domain-agent-scaffold-constants.ts';

type JsonRecord = Record<string, unknown>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function readJson(relativePath: string): JsonRecord {
  return parseJsonText(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as JsonRecord;
}

function buildActionCatalog(): FamilyActionCatalog {
  return {
    surface_kind: 'family_action_catalog',
    version: 'family-action-catalog.v2',
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
        execution_binding: {
          kind: 'stage_binding',
          stage_manifest_ref: 'agent/stages/manifest.json',
        },
        input_schema_ref: 'schemas/author.input.schema.json',
        output_schema_ref: 'schemas/author.output.schema.json',
        required_fields: ['workspace_root'],
        optional_fields: [],
        workspace_locator_fields: ['workspace_root'],
        human_gate_ids: [],
        stage_route: {
          entry_stage_ref: 'manuscript_authoring',
          required_stage_refs: ['manuscript_authoring'],
          optional_stage_refs: [],
          terminal_stage_refs: ['manuscript_authoring'],
          route_policy: 'ai_selected_progress_route',
        },
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
        execution_binding: {
          kind: 'stage_binding',
          stage_manifest_ref: 'agent/stages/manifest.json',
        },
        input_schema_ref: 'schemas/review.input.schema.json',
        output_schema_ref: 'schemas/review.output.schema.json',
        required_fields: ['workspace_root'],
        optional_fields: [],
        workspace_locator_fields: ['workspace_root'],
        human_gate_ids: ['publication_quality_gate'],
        stage_route: {
          entry_stage_ref: 'publication_review',
          required_stage_refs: ['publication_review'],
          optional_stage_refs: [],
          terminal_stage_refs: ['publication_review'],
          route_policy: 'ai_selected_progress_route',
        },
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

function progressFirstPolicies(): Pick<
  FamilyStageContract,
  'progress_delta_policy' | 'typed_blocker_lineage_policy'
> {
  return {
    progress_delta_policy: STANDARD_PROGRESS_DELTA_POLICY,
    typed_blocker_lineage_policy: STANDARD_TYPED_BLOCKER_LINEAGE_POLICY,
  };
}

function buildStagePlane(overrides: {
  authorEnsures?: string[];
  reviewRequires?: string[];
  reviewStageContract?: FamilyStageControlPlane['stages'][number]['stage_contract'];
  omitReviewStageContract?: boolean;
  publicationReviewEvaluationRefs?: FamilyStageControlPlane['stages'][number]['evaluation'];
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
          source_scope_refs: [],
          artifact_scope_refs: [],
          workspace_scope_refs: [],
          ...progressFirstPolicies(),
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
        evaluation: overrides.publicationReviewEvaluationRefs ?? [
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
              expected_receipt_refs: [
                {
                  ref_kind: 'receipt_ref_template',
                  ref: 'receipt:mas/publication-review/domain-owner-or-typed-blocker',
                  role: 'domain_owner_receipt_or_typed_blocker_expected',
                },
              ],
              properties: [],
              runtime_assumptions: [],
              monitor_refs: [],
              source_scope_refs: [],
              artifact_scope_refs: [],
              workspace_scope_refs: [],
              ...progressFirstPolicies(),
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
  const conformanceReview = buildFamilyStageConformanceReview(plane, {
    family_action_catalog: actionCatalog,
  });
  const bundle = buildFamilyStageProofBundle(plane, {
    actionCatalog,
    conformanceReview,
  });

  assert.equal(bundle.surface_kind, 'opl_stage_pack_proof_bundle');
  assert.equal(bundle.version, 'opl-stage-pack-proof-bundle.v1');
  assert.equal(bundle.identity.stage_pack_id, 'med-autoscience:mas_stage_control_plane');
  assert.equal(bundle.identity.action_catalog_id, 'mas_stage_actions');
  assert.equal(bundle.conformance_status, 'conformant');
  assert.equal(bundle.authority_boundary.proof_passed, true);
  assert.deepEqual(bundle.stage_results.map((result) => [result.stage_id, result.mode_tags]), [
    ['manuscript_authoring', {
      verified_core_eligible: true,
      durable_runtime_only: false,
      runtime_boundary_required: false,
    }],
    ['publication_review', {
      verified_core_eligible: false,
      durable_runtime_only: true,
      runtime_boundary_required: true,
    }],
  ]);
  assert.deepEqual(bundle.failure_localization, []);
  assert.equal(bundle.human_review_burden_budget.status, 'ready');
  assert.equal(bundle.human_review_burden_budget.summary.gate_count, 2);
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
  assert.ok(bundle.expected_receipt_refs.some((ref) =>
    ref.ref === 'receipt:mas/publication-review/domain-owner-or-typed-blocker'
    && ref.reason === 'explicit_stage_contract_expected_receipt_ref'
  ));
  assert.equal(
    bundle.expected_receipt_refs.some((ref) => ref.ref === 'owner_receipt:publication_review'),
    false,
  );
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
    human_review_gate_count: 2,
    blocked_human_review_gate_count: 0,
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
  assert.equal(bundle.integrity.surface_kind, 'opl_stage_pack_integrity_metadata');
  assert.equal(bundle.integrity.hash_algorithm, 'sha256');
  assert.match(bundle.integrity.stage_pack_hash, /^[0-9a-f]{64}$/);
  assert.equal(bundle.integrity.signature_status, 'unsigned_digest_only');
  assert.equal(bundle.integrity.authority_boundary.can_execute_stage, false);
  assert.equal(bundle.integrity.authority_boundary.can_verify_external_signature, false);
  assert.equal(bundle.generated_artifact_manifest.surface_kind, 'opl_stage_pack_generated_artifact_manifest');
  assert.equal(bundle.generated_artifact_manifest.stage_pack_hash, bundle.integrity.stage_pack_hash);
  assert.equal(bundle.generated_artifact_manifest.source_of_truth.kind, 'diagram_stage_pack');
  assert.equal(
    bundle.generated_artifact_manifest.source_of_truth.generated_artifacts_are_regenerable_supply_chain_inputs,
    true,
  );
  assert.equal(bundle.generated_artifact_manifest.summary.regeneration_required_when_stage_pack_hash_changes, true);
  assert.equal(bundle.generated_artifact_manifest.summary.missing_source_hash_ref_count, 4);
  assert.equal(bundle.generated_artifact_manifest.summary.needs_regeneration_ref_count, 0);
  assert.deepEqual(bundle.generated_artifact_manifest.generated_test_refs.map((ref) => ref.ref), [
    'tests/publication-review.test.ts',
  ]);
  assert.deepEqual(bundle.generated_artifact_manifest.generated_test_refs.map((ref) => ({
    ref: ref.ref,
    source_stage_pack_hash: ref.source_stage_pack_hash,
    declared_source_stage_pack_hash: ref.declared_source_stage_pack_hash,
    regeneration_policy: ref.regeneration_policy,
    drift_status: ref.drift_status,
  })), [
    {
      ref: 'tests/publication-review.test.ts',
      source_stage_pack_hash: bundle.integrity.stage_pack_hash,
      declared_source_stage_pack_hash: null,
      regeneration_policy: 'regenerate_when_source_stage_pack_hash_changes',
      drift_status: 'missing_source_hash',
    },
  ]);
  assert.deepEqual(bundle.generated_artifact_manifest.generated_proof_refs.map((ref) => ref.ref), [
    'artifacts/manuscript-draft-proof.json',
    'tests/publication-review.test.ts',
  ]);
  assert.deepEqual(bundle.generated_artifact_manifest.generated_artifact_refs.map((ref) => ref.ref), [
    'artifacts/manuscript-draft-proof.json',
  ]);
  assert.equal(bundle.generated_artifact_manifest.authority_boundary.manifest_is_build_review_input, true);
  assert.equal(bundle.generated_artifact_manifest.authority_boundary.can_execute_stage, false);
  assert.equal(bundle.generated_artifact_manifest.authority_boundary.can_authorize_quality_verdict, false);
});

test('stage proof bundle flags generated refs that were bound to an older stage pack hash', () => {
  const oldStagePackHash = 'b'.repeat(64);
  const plane = buildStagePlane({
    publicationReviewEvaluationRefs: [
      {
        ref_kind: 'test',
        ref: 'tests/publication-review.test.ts',
        role: 'proof_ref',
        source_stage_pack_hash: oldStagePackHash,
      } as FamilyStageControlPlane['stages'][number]['evaluation'][number],
    ],
  });
  const bundle = buildFamilyStageProofBundle(plane, {
    actionCatalog: buildActionCatalog(),
  });
  const generatedTestRef = bundle.generated_artifact_manifest.generated_test_refs[0];

  assert.notEqual(bundle.integrity.stage_pack_hash, oldStagePackHash);
  assert.equal(generatedTestRef?.declared_source_stage_pack_hash, oldStagePackHash);
  assert.equal(generatedTestRef?.source_stage_pack_hash, bundle.integrity.stage_pack_hash);
  assert.equal(generatedTestRef?.source_stage_pack_ref, bundle.generated_artifact_manifest.source_stage_pack_ref);
  assert.equal(generatedTestRef?.source_graph_projection_ref, bundle.generated_artifact_manifest.graph_projection_ref);
  assert.equal(generatedTestRef?.regeneration_policy, 'regenerate_when_source_stage_pack_hash_changes');
  assert.equal(generatedTestRef?.drift_status, 'needs_regeneration');
  assert.equal(
    generatedTestRef?.drift_reason,
    'declared_source_stage_pack_hash_differs_from_current_stage_pack_hash',
  );
  assert.equal(bundle.generated_artifact_manifest.summary.needs_regeneration_ref_count, 2);
  assert.equal(bundle.generated_artifact_manifest.summary.missing_source_hash_ref_count, 2);
  assert.equal(bundle.generated_artifact_manifest.authority_boundary.graphflow_runtime_dependency, false);
});

test('stage proof bundle integrity digest is stable and changes with contract refs', () => {
  const actionCatalog = buildActionCatalog();
  const baseBundle = buildFamilyStageProofBundle(buildStagePlane(), { actionCatalog });
  const reordered = buildFamilyStageProofBundle(buildStagePlane(), { actionCatalog });
  const changed = buildFamilyStageProofBundle(buildStagePlane({
    authorEnsures: ['draft_ready', 'source_trace_ready'],
  }), { actionCatalog });
  const signed = buildFamilyStageProofBundle({
    ...buildStagePlane(),
    authority_boundary: {
      opl_role: 'projection_consumer_only',
      stage_pack_signer_ref: 'kms:domain-owner',
      stage_pack_signature_ref: 'artifact:stage-pack.sig',
    },
  }, { actionCatalog });

  assert.equal(baseBundle.integrity.stage_pack_hash, reordered.integrity.stage_pack_hash);
  assert.notEqual(baseBundle.integrity.stage_pack_hash, changed.integrity.stage_pack_hash);
  assert.equal(baseBundle.generated_artifact_manifest.stage_pack_hash, baseBundle.integrity.stage_pack_hash);
  assert.equal(changed.generated_artifact_manifest.stage_pack_hash, changed.integrity.stage_pack_hash);
  assert.notEqual(
    baseBundle.generated_artifact_manifest.source_stage_pack_ref,
    changed.generated_artifact_manifest.source_stage_pack_ref,
  );
  assert.equal(signed.integrity.signature_status, 'signature_ref_declared');
  assert.equal(signed.integrity.signer_ref, 'kms:domain-owner');
  assert.equal(signed.integrity.signature_ref, 'artifact:stage-pack.sig');
  assert.equal(signed.integrity.authority_boundary.can_verify_external_signature, false);
});

test('stage proof bundle exposes missing composition and does not mark blocked proof as passed', () => {
  const plane = buildStagePlane({
    authorEnsures: ['draft_exists'],
    reviewRequires: ['draft_ready'],
  });
  const bundle = buildFamilyStageProofBundle(plane, {
    actionCatalog: buildActionCatalog(),
  });

  assert.equal(bundle.conformance_status, 'nonconformant');
  assert.equal(bundle.authority_boundary.proof_passed, false);
  assert.ok(bundle.conformance_findings.some((finding) => finding.code === 'composition_obligation_not_satisfied'));
  assert.deepEqual(bundle.failure_localization.map((item) => [item.lane, item.code, item.source_ref]), [
    ['domain', 'composition_obligation_not_satisfied', 'family_stage:publication_review'],
  ]);
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

  assert.equal(bundle.conformance_status, 'quality_debt');
  assert.equal(bundle.authority_boundary.proof_passed, false);
  assert.ok(bundle.conformance_findings.some((finding) => finding.code === 'missing_stage_contract'));
  assert.deepEqual(bundle.failure_localization.map((item) => [item.lane, item.code, item.stage_id]), [
    ['human', 'missing_stage_contract', 'publication_review'],
  ]);
  assert.ok(bundle.stage_results.some((result) => result.status === 'quality_debt'));
  assert.equal(bundle.proof_runtime_metrics.blocker_count, 0);
  assert.equal(bundle.proof_runtime_metrics.warning_count, 1);
});

test('stage proof bundle schema freezes authority boundary away from domain truth and artifact body', () => {
  const schema = readJson('contracts/family-orchestration/family-stage-proof-bundle.schema.json');
  const properties = schema.properties as Record<string, JsonRecord>;
  const required = schema.required as string[];
  const defs = schema.$defs as Record<string, JsonRecord>;
  const authoritySchema = properties.authority_boundary as JsonRecord;
  const authorityProperties = authoritySchema.properties as Record<string, JsonRecord>;
  const examples = schema.examples as JsonRecord[];
  const authority = examples[0]?.authority_boundary as JsonRecord;
  const metricsSchema = defs.proof_runtime_metrics as JsonRecord;
  const integritySchema = defs.stage_pack_integrity as JsonRecord;
  const generatedManifestSchema = defs.generated_artifact_manifest as JsonRecord;
  const integrityProperties = integritySchema.properties as Record<string, JsonRecord>;
  const generatedManifestProperties = generatedManifestSchema.properties as Record<string, JsonRecord>;
  const metrics = examples[0]?.proof_runtime_metrics as JsonRecord;
  const integrity = examples[0]?.integrity as JsonRecord;
  const generatedManifest = examples[0]?.generated_artifact_manifest as JsonRecord;
  const generatedManifestSummary = generatedManifest.summary as JsonRecord;
  const generatedManifestSourceOfTruth = generatedManifest.source_of_truth as JsonRecord;
  const metricsAuthority = metrics.authority_boundary as JsonRecord;
  const integrityAuthority = integrity.authority_boundary as JsonRecord;
  const generatedManifestAuthority = generatedManifest.authority_boundary as JsonRecord;

  assert.equal(properties.surface_kind.const, 'opl_stage_pack_proof_bundle');
  assert.equal(properties.version.const, 'opl-stage-pack-proof-bundle.v1');
  assert.equal((metricsSchema.description as string).includes('operator observability'), true);
  assert.ok(required.includes('integrity'));
  assert.ok(required.includes('generated_artifact_manifest'));
  assert.ok(required.includes('failure_localization'));
  assert.ok(required.includes('human_review_burden_budget'));
  assert.ok((defs.stage_result.required as string[]).includes('mode_tags'));
  assert.ok((defs.stage_result.required as string[]).includes('runtime_event_refs'));
  assert.ok((defs.proof_runtime_metrics.required as string[]).includes('human_review_gate_count'));
  assert.ok((defs.proof_runtime_metrics.required as string[]).includes('blocked_human_review_gate_count'));
  assert.equal(Boolean(defs.human_review_burden_budget), true);
  assert.equal((metrics.human_review_gate_count as number), 0);
  assert.equal((metrics.blocked_human_review_gate_count as number), 0);
  assert.ok((defs.failure_localization.required as string[]).includes('minimal_counterexample'));
  assert.equal(metrics.composition_obligation_count, 1);
  assert.equal(metrics.runtime_event_requirement_count, 1);
  assert.equal(metrics.satisfied_runtime_event_ref_count, 1);
  assert.equal(metrics.expected_receipt_ref_count, 1);
  assert.equal(metrics.test_proof_ref_count, 1);
  assert.equal(metricsAuthority.opl_role, 'scheduling_operator_observability_only');
  assert.equal(metricsAuthority.metrics_are_domain_verdict, false);
  assert.equal(metricsAuthority.can_authorize_domain_ready, false);
  assert.equal(metricsAuthority.can_authorize_quality_verdict, false);
  assert.equal(integrityProperties.stage_pack_hash.pattern, '^[0-9a-f]{64}$');
  assert.equal(integrity.surface_kind, 'opl_stage_pack_integrity_metadata');
  assert.equal(integrity.hash_scope, 'family_stage_control_plane_and_action_catalog_contract_refs');
  assert.equal(integrityAuthority.opl_role, 'digest_projection_only');
  assert.equal(integrityAuthority.can_execute_stage, false);
  assert.equal(integrityAuthority.can_write_domain_truth, false);
  assert.equal(integrityAuthority.can_verify_external_signature, false);
  assert.equal(generatedManifestProperties.stage_pack_hash.pattern, '^[0-9a-f]{64}$');
  assert.equal(generatedManifest.surface_kind, 'opl_stage_pack_generated_artifact_manifest');
  assert.equal(generatedManifest.stage_pack_hash, integrity.stage_pack_hash);
  assert.equal((defs.generated_artifact_manifest.required as string[]).includes('source_of_truth'), true);
  assert.equal((defs.generated_artifact_ref.required as string[]).includes('source_stage_pack_hash'), true);
  assert.equal((defs.generated_artifact_ref.required as string[]).includes('regeneration_policy'), true);
  assert.equal((defs.generated_artifact_ref.required as string[]).includes('drift_status'), true);
  assert.equal(generatedManifestSourceOfTruth.kind, 'diagram_stage_pack');
  assert.equal(generatedManifestSourceOfTruth.generated_artifacts_are_regenerable_supply_chain_inputs, true);
  assert.equal(generatedManifestSummary.regeneration_required_when_stage_pack_hash_changes, true);
  assert.equal(generatedManifestSummary.missing_source_hash_ref_count, 2);
  assert.equal(generatedManifestSummary.needs_regeneration_ref_count, 0);
  assert.equal((generatedManifest.generated_test_refs as JsonRecord[])[0]?.drift_status, 'missing_source_hash');
  assert.equal(
    (generatedManifest.generated_test_refs as JsonRecord[])[0]?.regeneration_policy,
    'regenerate_when_source_stage_pack_hash_changes',
  );
  assert.equal(generatedManifestAuthority.opl_role, 'generated_artifact_manifest_projection_only');
  assert.equal(generatedManifestAuthority.manifest_is_build_review_input, true);
  assert.equal(generatedManifestAuthority.graphflow_runtime_dependency, false);
  assert.equal(generatedManifestAuthority.can_execute_stage, false);
  assert.equal(generatedManifestAuthority.can_write_domain_truth, false);
  assert.equal(generatedManifestAuthority.can_authorize_quality_verdict, false);
  assert.equal(authorityProperties.opl_role.const, 'proof_bundle_projection_owner');
  assert.equal(authorityProperties.domain_role.const, 'truth_quality_receipt_and_artifact_authority');
  assert.equal(authority.can_execute_stage, false);
  assert.equal(authority.can_write_domain_truth, false);
  assert.equal(authority.can_authorize_domain_ready, false);
  assert.equal(authority.can_authorize_quality_verdict, false);
  assert.equal(authority.can_mutate_artifact_body, false);
  assert.equal(authority.can_accept_or_reject_owner_receipt, false);
});

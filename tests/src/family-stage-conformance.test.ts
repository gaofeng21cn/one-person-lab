import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseJsonText } from '../../src/kernel/json-file.ts';

import { buildFamilyStageConformanceReview } from '../../src/modules/stagecraft/family-stage-conformance.ts';
import type { FamilyActionCatalog } from '../../src/kernel/family-action-catalog-contract.ts';
import {
  normalizeFamilyStageControlPlane,
  type FamilyStageContract,
  type FamilyStageControlPlane,
} from '../../src/modules/stagecraft/family-stage-control-plane-contract.ts';

type JsonRecord = Record<string, unknown>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function readJson(relativePath: string): JsonRecord {
  return parseJsonText(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as JsonRecord;
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
        required_fields: ['workspace_root'],
        optional_fields: [],
        workspace_locator_fields: ['workspace_root'],
        handler_binding: null,
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
        required_fields: ['workspace_root'],
        optional_fields: [],
        workspace_locator_fields: ['workspace_root'],
        handler_binding: null,
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

function buildToolAffordanceBoundary() {
  const ref = {
    ref_kind: 'repo_path',
    ref: 'agent/tools/domain_affordances.md',
    role: 'tool_affordance_boundary_ref',
  };
  return {
    catalog_role: 'available_affordance_catalog_not_workflow_script',
    capability_refs: [ref],
    permission_scope_refs: [ref],
    credential_boundary_refs: [ref],
    write_scope_refs: [ref],
    side_effect_risk_refs: [ref],
    forbidden_authority_refs: [ref],
    executor_autonomy: {
      executor_can_choose_tools: true,
      executor_can_skip_tools: true,
      executor_can_substitute_tools_within_boundary: true,
      executor_can_choose_order_and_parallelism: true,
      executor_can_request_missing_context_or_human_gate: true,
      tool_catalog_can_prescribe_tool_sequence: false,
      tool_catalog_can_define_cognitive_strategy: false,
      tool_catalog_can_override_stage_goal: false,
      tool_catalog_can_authorize_forbidden_write: false,
    },
  };
}

function withStagePackV2ToolBoundary(plane: FamilyStageControlPlane) {
  plane.stage_pack_conformance_version = 'standard-stage-pack.v2';
  for (const stage of plane.stages) {
    stage.stage_pack_conformance_version = 'standard-stage-pack.v2';
    stage.tool_refs = [
      {
        ref_kind: 'repo_path',
        ref: 'agent/tools/domain_affordances.md',
        role: 'tool_affordance_catalog',
      },
    ];
    stage.tool_affordance_boundary = buildToolAffordanceBoundary();
  }
  return plane;
}

function buildStagePlane(overrides: {
  authorEnsures?: string[];
  reviewRequires?: string[];
  reviewRecordsRuntimeEvents?: boolean;
  reviewRuntimeEventRefs?: string[];
  omitProgressFirstPolicies?: boolean;
  cycle?: boolean;
} = {}): FamilyStageControlPlane {
  const progressFirstPolicies: Partial<
    Pick<FamilyStageContract, 'user_stage_log_contract' | 'progress_delta_policy' | 'typed_blocker_lineage_policy'>
  > = overrides.omitProgressFirstPolicies ? {} : {
    user_stage_log_contract: {
      required_fields: [
        'stage_name',
        'problem_summary',
        'stage_goal',
        'progress_delta_classification',
        'deliverable_progress_delta',
        'platform_repair_delta',
        'next_forced_delta',
        'stage_work_done',
        'changed_stage_surfaces',
        'outcome',
        'remaining_blockers',
        'evidence_refs',
      ],
      no_domain_body_authority: true,
    },
    progress_delta_policy: {
      surface_kind: 'opl_stage_progress_delta_policy',
      version: 'progress-delta-policy.v1',
      required_fields: [
        'progress_delta_classification',
        'deliverable_progress_delta',
        'platform_repair_delta',
        'next_forced_delta',
      ],
      classification_values: [
        'deliverable_progress',
        'platform_repair',
        'mixed',
        'typed_blocker',
        'human_gate',
        'stop_loss',
      ],
      platform_only_is_not_deliverable_progress: true,
    },
    typed_blocker_lineage_policy: {
      surface_kind: 'family-stall-lineage.v1',
      repeat_budget: {
        mechanism_repair_after_repeat_count: 2,
        human_gate_or_stop_loss_after_repeat_count: 3,
      },
      required_fields: [
        'blocker_family',
        'study_id_or_domain_identity',
        'work_unit_id',
        'source_fingerprint',
        'repeat_count',
        'next_forced_delta',
        'escalation_owner',
      ],
    },
  };
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
        outputs: [],
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
          boundary_assumptions: [],
          properties: ['deterministic_handoff_refs'],
          ...progressFirstPolicies,
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
          owner_receipt_required: false,
        },
        authority_boundary: {
          opl_role: 'projection_consumer_only',
          can_write_domain_truth: false,
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
        evaluation: [],
        handoff: overrides.cycle ? { next_stage_refs: ['manuscript_authoring'] } : null,
        source_refs: [],
        freshness: null,
        action_parity: null,
        stage_contract: {
          requires: overrides.reviewRequires ?? ['draft_ready'],
          ensures: ['review_receipt_ready'],
          boundary_assumptions: ['reviewer_judgment_recorded_as_receipt'],
          properties: [],
          ...progressFirstPolicies,
          runtime_event_refs: overrides.reviewRuntimeEventRefs ?? ['runtime_event:publication_review.gate_recorded'],
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
          records_runtime_events: overrides.reviewRecordsRuntimeEvents ?? true,
          runtime_event_refs: overrides.reviewRuntimeEventRefs ?? ['runtime_event:publication_review.gate_recorded'],
          owner_receipt_required: true,
          human_gate_required: true,
        },
        authority_boundary: {
          opl_role: 'projection_consumer_only',
          independent_gate_receipt_required: true,
          can_authorize_quality_verdict: false,
        },
      },
    ],
    notes: [],
  };
}

test('family stage admission admits contracted static core and recorded boundary stages', () => {
  const review = buildFamilyStageConformanceReview(buildStagePlane(), {
    family_action_catalog: buildActionCatalog(),
  });

  assert.equal(review.status, 'conformant');
  assert.equal(review.summary.conformant_stages_count, 2);
  assert.equal(review.summary.nonconformances_count, 0);
  assert.equal(review.summary.verified_core_eligible_count, 1);
  assert.equal(review.summary.durable_runtime_only_count, 1);
  assert.equal(review.summary.runtime_boundary_required_count, 1);
  assert.equal(review.summary.human_review_gate_count, 2);
  assert.equal(review.summary.blocked_human_review_gate_count, 0);
  assert.equal(review.human_review_burden_budget.status, 'ready');
  assert.deepEqual(
    review.human_review_burden_budget.gates.map((gate) => [gate.gate_id, gate.source, gate.status]),
    [
      ['publication_review:quality_owner_review', 'trust_boundary', 'ready'],
      ['publication_quality_gate', 'action_catalog', 'ready'],
    ],
  );
  assert.equal(review.stage_results[0]?.trust_lane, 'domain_agent');
  assert.equal(review.stage_results[0]?.static_check_eligible, true);
  assert.deepEqual(review.stage_results[0]?.mode_tags, {
    verified_core_eligible: true,
    durable_runtime_only: false,
    runtime_boundary_required: false,
  });
  assert.equal(review.stage_results[1]?.effect_boundary, true);
  assert.deepEqual(review.stage_results[1]?.mode_tags, {
    verified_core_eligible: false,
    durable_runtime_only: true,
    runtime_boundary_required: true,
  });
  assert.deepEqual(review.stage_results[1]?.runtime_event_refs, ['runtime_event:publication_review.gate_recorded']);
  assert.deepEqual(review.failure_localization, []);
  assert.equal(review.authority_boundary.can_write_domain_truth, false);
  assert.equal(review.authority_boundary.can_authorize_quality_verdict, false);
});

test('family stage control plane normalization preserves user stage log progress contract', () => {
  const plane = normalizeFamilyStageControlPlane(withStagePackV2ToolBoundary(buildStagePlane()));

  assert.ok(plane);
  const stageContract = plane.stages[0]?.stage_contract;
  assert.ok(stageContract?.user_stage_log_contract);
  assert.deepEqual(stageContract.user_stage_log_contract.required_fields, [
    'stage_name',
    'problem_summary',
    'stage_goal',
    'progress_delta_classification',
    'deliverable_progress_delta',
    'platform_repair_delta',
    'next_forced_delta',
    'stage_work_done',
    'changed_stage_surfaces',
    'outcome',
    'remaining_blockers',
    'evidence_refs',
  ]);
  assert.equal(stageContract.user_stage_log_contract.no_domain_body_authority, true);
  assert.equal(plane.stages[0]?.tool_refs?.[0]?.ref, 'agent/tools/domain_affordances.md');
  assert.equal(
    plane.stages[0]?.tool_affordance_boundary?.executor_autonomy?.executor_can_choose_tools,
    true,
  );
});

test('family stage admission admits standard stage pack v2 tool affordance boundaries', () => {
  const review = buildFamilyStageConformanceReview(withStagePackV2ToolBoundary(buildStagePlane()), {
    family_action_catalog: buildActionCatalog(),
  });

  assert.equal(review.status, 'conformant');
  assert.equal(review.summary.nonconformances_count, 0);
  assert.equal(review.stage_results[0]?.tool_affordance_boundary.status, 'declared');
  assert.equal(review.stage_results[0]?.tool_affordance_boundary.tool_ref_count, 1);
  assert.equal(
    review.stage_results[0]?.tool_affordance_boundary.executor_autonomy
      .executor_can_choose_order_and_parallelism,
    true,
  );
});

test('family stage admission blocks v2 stages missing tool affordance boundary', () => {
  const plane = buildStagePlane();
  plane.stage_pack_conformance_version = 'standard-stage-pack.v2';

  const review = buildFamilyStageConformanceReview(plane, {
    family_action_catalog: buildActionCatalog(),
  });

  assert.equal(review.status, 'nonconformant');
  assert.equal(review.stage_results[0]?.tool_affordance_boundary.status, 'missing');
  assert.ok(review.findings.some((finding) =>
    finding.code === 'missing_tool_affordance_boundary'
    && finding.stage_id === 'manuscript_authoring',
  ));
});

test('family stage admission blocks tool catalogs that prescribe workflow authority', () => {
  const plane = withStagePackV2ToolBoundary(buildStagePlane());
  const boundary = plane.stages[0]?.tool_affordance_boundary;
  assert.ok(boundary?.executor_autonomy);
  boundary.executor_autonomy.tool_catalog_can_prescribe_tool_sequence = true;

  const review = buildFamilyStageConformanceReview(plane, {
    family_action_catalog: buildActionCatalog(),
  });

  assert.equal(review.status, 'nonconformant');
  assert.equal(review.stage_results[0]?.tool_affordance_boundary.status, 'invalid');
  assert.ok(review.findings.some((finding) =>
    finding.code === 'invalid_tool_affordance_boundary'
    && finding.stage_id === 'manuscript_authoring',
  ));
});

test('family stage admission blocks stages missing Progress-First delta and blocker lineage policies', () => {
  const review = buildFamilyStageConformanceReview(
    buildStagePlane({
      omitProgressFirstPolicies: true,
    }),
    {
      family_action_catalog: buildActionCatalog(),
    },
  );

  assert.equal(review.status, 'nonconformant');
  assert.equal(review.summary.nonconformances_count, 4);
  assert.deepEqual(
    review.failure_localization.map((item) => [item.lane, item.code, item.stage_id]),
    [
      ['domain', 'missing_progress_delta_policy', 'manuscript_authoring'],
      ['domain', 'missing_typed_blocker_lineage_policy', 'manuscript_authoring'],
      ['domain', 'missing_progress_delta_policy', 'publication_review'],
      ['domain', 'missing_typed_blocker_lineage_policy', 'publication_review'],
    ],
  );
  assert.ok(review.findings.every((finding) => {
    const requiredFields = finding.minimal_counterexample?.required_fields;
    return finding.code !== 'missing_progress_delta_policy'
      || (Array.isArray(requiredFields) && requiredFields.includes('deliverable_progress_delta'));
  }));
});

test('family stage admission blocks unsatisfied composition obligations', () => {
  const review = buildFamilyStageConformanceReview(
    buildStagePlane({
      authorEnsures: ['draft_exists'],
      reviewRequires: ['draft_ready'],
    }),
    {
      family_action_catalog: buildActionCatalog(),
    },
  );

  assert.equal(review.status, 'nonconformant');
  assert.equal(review.summary.nonconformant_stages_count, 1);
  assert.deepEqual(review.failure_localization.map((item) => [item.lane, item.code, item.stage_id, item.target_stage_id]), [
    ['domain', 'composition_obligation_not_satisfied', 'manuscript_authoring', 'publication_review'],
  ]);
  assert.equal(review.failure_localization[0]?.source_ref, 'family_stage:publication_review');
  assert.deepEqual(review.failure_localization[0]?.minimal_counterexample, {
    lane: 'domain',
    code: 'composition_obligation_not_satisfied',
    stage_id: 'manuscript_authoring',
    target_stage_id: 'publication_review',
    source_ref: 'family_stage:publication_review',
  });
  assert.ok(
    review.findings.some((finding) => finding.code === 'composition_obligation_not_satisfied'),
  );
});

test('family stage admission blocks effect boundaries without replayable event records', () => {
  const review = buildFamilyStageConformanceReview(
    buildStagePlane({
      reviewRecordsRuntimeEvents: false,
    }),
    {
      family_action_catalog: buildActionCatalog(),
    },
  );

  assert.equal(review.status, 'nonconformant');
  assert.ok(
    review.findings.some((finding) => finding.code === 'effect_boundary_without_event_recording'),
  );
});

test('family stage admission blocks effect boundaries without runtime event refs', () => {
  const review = buildFamilyStageConformanceReview(
    buildStagePlane({
      reviewRuntimeEventRefs: [],
    }),
    {
      family_action_catalog: buildActionCatalog(),
    },
  );

  assert.equal(review.status, 'nonconformant');
  assert.deepEqual(review.stage_results[1]?.runtime_event_refs, []);
  assert.ok(
    review.findings.some((finding) =>
      finding.code === 'effect_boundary_missing_runtime_event_refs'
      && finding.runtime_event_refs_missing_reason === 'runtime_event_refs is empty on trust_boundary and stage_contract',
    ),
  );
});

test('family stage admission blocks runtime guards without runtime event refs', () => {
  const plane = buildStagePlane();
  const stage = plane.stages[0];
  assert.ok(stage.trust_boundary);
  stage.trust_boundary = {
    ...stage.trust_boundary,
    records_runtime_events: true,
    runtime_guard_required: true,
  };

  const review = buildFamilyStageConformanceReview(plane, {
    family_action_catalog: buildActionCatalog(),
  });

  assert.equal(review.status, 'nonconformant');
  assert.deepEqual(review.stage_results[0]?.runtime_event_refs, []);
  assert.deepEqual(review.stage_results[0]?.mode_tags, {
    verified_core_eligible: false,
    durable_runtime_only: true,
    runtime_boundary_required: true,
  });
  assert.deepEqual(review.failure_localization.map((item) => [item.lane, item.code, item.stage_id, item.source_ref]), [
    ['runtime', 'runtime_guard_missing_runtime_event_refs', 'manuscript_authoring', 'family_stage:manuscript_authoring'],
  ]);
  assert.ok(
    review.findings.some((finding) =>
      finding.code === 'runtime_guard_missing_runtime_event_refs'
      && finding.runtime_event_refs_missing_reason === 'runtime_guard_required is true but runtime_event_refs is empty on trust_boundary and stage_contract',
    ),
  );
});

test('family stage admission blocks runtime guards without event recording', () => {
  const plane = buildStagePlane();
  const stage = plane.stages[0];
  assert.ok(stage.trust_boundary);
  assert.ok(stage.stage_contract);
  stage.trust_boundary = {
    ...stage.trust_boundary,
    runtime_guard_required: true,
    records_runtime_events: false,
    runtime_event_refs: ['runtime_event:manuscript_authoring.owner_receipt_recorded'],
  };
  stage.stage_contract = {
    ...stage.stage_contract,
    runtime_event_refs: ['runtime_event:manuscript_authoring.owner_receipt_recorded'],
  };

  const review = buildFamilyStageConformanceReview(plane, {
    family_action_catalog: buildActionCatalog(),
  });

  assert.equal(review.status, 'nonconformant');
  assert.deepEqual(review.failure_localization.map((item) => [item.lane, item.code, item.stage_id]), [
    ['runtime', 'runtime_guard_without_event_recording', 'manuscript_authoring'],
  ]);
  assert.ok(
    review.findings.some((finding) =>
      finding.code === 'runtime_guard_without_event_recording'
      && finding.runtime_event_refs_missing_reason === 'runtime_guard_required is true but records_runtime_events is not true',
    ),
  );
});

test('family stage admission blocks human review gates without typed refs', () => {
  const plane = buildStagePlane();
  const stage = plane.stages[1];
  assert.ok(stage.authority_boundary);
  stage.authority_boundary = {
    ...stage.authority_boundary,
    expected_receipt_refs: [],
    human_review_gates: [
      {
        gate_id: 'publication_review:operator_quality_gate',
        gate_type: 'quality_owner_review',
        owner: 'med-autoscience',
        missing_refs: ['missing:publication_quality_receipt'],
      },
    ],
  };

  const review = buildFamilyStageConformanceReview(plane, {
    family_action_catalog: buildActionCatalog(),
  });

  assert.equal(review.status, 'nonconformant');
  assert.equal(review.human_review_burden_budget.status, 'blocked');
  assert.equal(review.summary.blocked_human_review_gate_count, 1);
  assert.ok(review.findings.some((finding) =>
    finding.code === 'human_review_gate_budget_blocked'
    && finding.stage_id === 'publication_review',
  ));
  assert.deepEqual(review.failure_localization.map((item) => [item.lane, item.code, item.stage_id]), [
    ['human', 'human_review_gate_budget_blocked', 'publication_review'],
  ]);
});

test('family stage admission schema freezes OPL non-authority read model', () => {
  const schema = readJson('contracts/family-orchestration/family-stage-conformance.schema.json');
  const properties = schema.properties as Record<string, JsonRecord>;
  const examples = schema.examples as JsonRecord[];
  const authority = (examples[0]?.authority_boundary ?? {}) as JsonRecord;

  assert.equal(properties.surface_kind.const, 'family_stage_conformance_review');
  assert.equal(properties.version.const, 'family-stage-conformance-review.v1');
  assert.equal(authority.opl_role, 'static_conformance_projection_only');
  assert.equal(authority.can_execute_stage, false);
  assert.equal(authority.can_write_domain_truth, false);
  assert.equal(authority.can_authorize_domain_ready, false);
  assert.equal(authority.can_authorize_quality_verdict, false);
  assert.equal(authority.can_mutate_artifact_body, false);
  const stageResultRequired = (((schema.$defs as JsonRecord).stage_result as JsonRecord).required as string[]);
  const toolAffordanceProjection =
    ((schema.$defs as JsonRecord).tool_affordance_boundary_projection as JsonRecord);
  const toolAffordanceProjectionRequired = toolAffordanceProjection.required as string[];
  const toolExecutorAutonomy =
    (((toolAffordanceProjection.properties as JsonRecord).executor_autonomy as JsonRecord) as JsonRecord);
  const toolExecutorAutonomyRequired = toolExecutorAutonomy.required as string[];
  const firstStageResult = (examples[0]?.stage_results as JsonRecord[])[0] as JsonRecord;
  const exampleToolBoundary = firstStageResult.tool_affordance_boundary as JsonRecord;
  const findingProperties = (((schema.$defs as JsonRecord).finding as JsonRecord).properties as JsonRecord);
  assert.ok(stageResultRequired.includes('runtime_event_refs'));
  assert.ok(stageResultRequired.includes('mode_tags'));
  assert.ok(stageResultRequired.includes('tool_affordance_boundary'));
  assert.ok(toolAffordanceProjectionRequired.includes('executor_autonomy'));
  assert.deepEqual(toolExecutorAutonomyRequired, [
    'executor_can_choose_tools',
    'executor_can_skip_tools',
    'executor_can_substitute_tools_within_boundary',
    'executor_can_choose_order_and_parallelism',
    'executor_can_request_missing_context_or_human_gate',
    'tool_catalog_can_prescribe_tool_sequence',
    'tool_catalog_can_define_cognitive_strategy',
    'tool_catalog_can_override_stage_goal',
    'tool_catalog_can_authorize_forbidden_write',
  ]);
  assert.equal(exampleToolBoundary.status, 'missing');
  assert.equal((exampleToolBoundary.executor_autonomy as JsonRecord).executor_can_choose_tools, null);
  assert.ok((schema.required as string[]).includes('failure_localization'));
  assert.ok((schema.required as string[]).includes('human_review_burden_budget'));
  assert.ok((((schema.$defs as JsonRecord).mode_tags as JsonRecord).required as string[]).includes('verified_core_eligible'));
  assert.equal(Boolean((schema.$defs as JsonRecord).human_review_burden_budget), true);
  assert.equal(Boolean((schema.$defs as JsonRecord).human_review_budget_gate), true);
  assert.equal(Boolean(findingProperties.runtime_event_refs_missing_reason), true);
  assert.equal(Boolean(findingProperties.assumption_id), true);
  assert.equal(Boolean(findingProperties.failure_lane), true);
  assert.equal(Boolean(findingProperties.source_ref), true);
  assert.equal(Boolean(findingProperties.minimal_counterexample), true);
});

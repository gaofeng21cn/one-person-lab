import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildFamilyStageAdmissionReview } from '../../src/family-stage-admission.ts';
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
  reviewRecordsRuntimeEvents?: boolean;
  reviewRuntimeEventRefs?: string[];
  cycle?: boolean;
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
          runtime_event_refs: overrides.reviewRuntimeEventRefs ?? ['runtime_event:publication_review.gate_recorded'],
          runtime_assumptions: [],
          monitor_refs: [],
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
  const review = buildFamilyStageAdmissionReview(buildStagePlane(), {
    family_action_catalog: buildActionCatalog(),
  });

  assert.equal(review.status, 'admitted');
  assert.equal(review.summary.admitted_stages_count, 2);
  assert.equal(review.summary.blockers_count, 0);
  assert.equal(review.stage_results[0]?.trust_lane, 'domain_agent');
  assert.equal(review.stage_results[0]?.static_check_eligible, true);
  assert.equal(review.stage_results[1]?.effect_boundary, true);
  assert.deepEqual(review.stage_results[1]?.runtime_event_refs, ['runtime_event:publication_review.gate_recorded']);
  assert.equal(review.authority_boundary.can_write_domain_truth, false);
  assert.equal(review.authority_boundary.can_authorize_quality_verdict, false);
});

test('family stage admission blocks unsatisfied composition obligations', () => {
  const review = buildFamilyStageAdmissionReview(
    buildStagePlane({
      authorEnsures: ['draft_exists'],
      reviewRequires: ['draft_ready'],
    }),
    {
      family_action_catalog: buildActionCatalog(),
    },
  );

  assert.equal(review.status, 'blocked');
  assert.equal(review.summary.blocked_stages_count, 1);
  assert.ok(
    review.findings.some((finding) => finding.code === 'composition_obligation_not_satisfied'),
  );
});

test('family stage admission blocks effect boundaries without replayable event records', () => {
  const review = buildFamilyStageAdmissionReview(
    buildStagePlane({
      reviewRecordsRuntimeEvents: false,
    }),
    {
      family_action_catalog: buildActionCatalog(),
    },
  );

  assert.equal(review.status, 'blocked');
  assert.ok(
    review.findings.some((finding) => finding.code === 'effect_boundary_without_event_recording'),
  );
});

test('family stage admission blocks effect boundaries without runtime event refs', () => {
  const review = buildFamilyStageAdmissionReview(
    buildStagePlane({
      reviewRuntimeEventRefs: [],
    }),
    {
      family_action_catalog: buildActionCatalog(),
    },
  );

  assert.equal(review.status, 'blocked');
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

  const review = buildFamilyStageAdmissionReview(plane, {
    family_action_catalog: buildActionCatalog(),
  });

  assert.equal(review.status, 'blocked');
  assert.deepEqual(review.stage_results[0]?.runtime_event_refs, []);
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

  const review = buildFamilyStageAdmissionReview(plane, {
    family_action_catalog: buildActionCatalog(),
  });

  assert.equal(review.status, 'blocked');
  assert.ok(
    review.findings.some((finding) =>
      finding.code === 'runtime_guard_without_event_recording'
      && finding.runtime_event_refs_missing_reason === 'runtime_guard_required is true but records_runtime_events is not true',
    ),
  );
});

test('family stage admission schema freezes OPL non-authority read model', () => {
  const schema = readJson('contracts/family-orchestration/family-stage-admission.schema.json');
  const properties = schema.properties as Record<string, JsonRecord>;
  const examples = schema.examples as JsonRecord[];
  const authority = (examples[0]?.authority_boundary ?? {}) as JsonRecord;

  assert.equal(properties.surface_kind.const, 'family_stage_admission_review');
  assert.equal(properties.version.const, 'family-stage-admission-review.v1');
  assert.equal(authority.opl_role, 'admission_projection_and_contract_checker');
  assert.equal(authority.can_execute_stage, false);
  assert.equal(authority.can_write_domain_truth, false);
  assert.equal(authority.can_authorize_domain_ready, false);
  assert.equal(authority.can_authorize_quality_verdict, false);
  assert.equal(authority.can_mutate_artifact_body, false);
  const stageResultRequired = (((schema.$defs as JsonRecord).stage_result as JsonRecord).required as string[]);
  const findingProperties = (((schema.$defs as JsonRecord).finding as JsonRecord).properties as JsonRecord);
  assert.ok(stageResultRequired.includes('runtime_event_refs'));
  assert.equal(Boolean(findingProperties.runtime_event_refs_missing_reason), true);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseJsonText } from '../../src/kernel/json-file.ts';
import type { FamilyActionCatalog } from '../../src/kernel/family-action-catalog-contract.ts';
import type { FamilyStageContract, FamilyStageControlPlane } from '../../src/modules/stagecraft/family-stage-control-plane-contract.ts';
import { buildFamilyStageProofBundle } from '../../src/modules/stagecraft/family-stage-proof-bundle.ts';
import {
  buildFamilyStagePackRegistryEntry,
  buildFamilyStagePackRegistryProjection,
} from '../../src/modules/stagecraft/family-stage-pack-registry.ts';
import { buildFamilyStageAssumptionLifecycleProjection } from '../../src/modules/stagecraft/family-stage-assumption-lifecycle.ts';
import { buildFamilyStageCohortLoopProjection } from '../../src/modules/stagecraft/family-stage-cohort-loop.ts';
import { buildFamilyStageReplayCertification } from '../../src/modules/stagecraft/family-stage-replay-certification.ts';
import { buildFamilyStagePackSourceSpecProjection } from '../../src/modules/stagecraft/family-stage-source-spec.ts';
import {
  STANDARD_PROGRESS_DELTA_POLICY,
  STANDARD_TYPED_BLOCKER_LINEAGE_POLICY,
} from '../../src/modules/foundry-lab/standard-domain-agent-scaffold-constants.ts';

type JsonRecord = Record<string, unknown>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function readJson(relativePath: string): JsonRecord {
  return parseJsonText(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as JsonRecord;
}

function actionCatalog(): FamilyActionCatalog {
  return {
    surface_kind: 'family_action_catalog',
    version: 'family-action-catalog.v2',
    catalog_id: 'mas_stage_actions',
    target_domain_id: 'med-autoscience',
    owner: 'med-autoscience',
    authority_boundary: { opl_role: 'projection_consumer_only' },
    actions: [],
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

function plane(ensures: string[] = ['draft_ready']): FamilyStageControlPlane {
  return {
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
        goal: 'Produce a manuscript draft under MAS domain authority.',
        owner: 'med-autoscience',
        domain_stage_refs: ['write'],
        inputs: [],
        knowledge_refs: [],
        skills: [],
        prompt_refs: [],
        allowed_action_refs: [],
        outputs: [],
        evaluation: [],
        handoff: null,
        source_refs: [],
        freshness: null,
        action_parity: null,
        stage_contract: {
          requires: ['sources_ready'],
          ensures,
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
        },
      },
    ],
    notes: [],
  };
}

function bundle(ensures?: string[]) {
  return buildFamilyStageProofBundle(plane(ensures), { actionCatalog: actionCatalog() });
}

test('stage pack registry creates reusable refs-only entries keyed by stage pack hash', () => {
  const entry = buildFamilyStagePackRegistryEntry(bundle());
  const projection = buildFamilyStagePackRegistryProjection([entry]);

  assert.equal(projection.surface_kind, 'opl_family_stage_pack_registry');
  assert.equal(projection.summary.entry_count, 1);
  assert.equal(projection.summary.reusable_entry_count, 1);
  assert.equal(entry.reusable_library_entry, true);
  assert.equal(entry.library_lifecycle.status, 'admitted');
  assert.equal(entry.library_lifecycle.migration_blocker_count, 0);
  assert.match(entry.stage_pack_hash, /^[0-9a-f]{64}$/);
  assert.equal(entry.refs.proof_bundle_ref.includes(entry.stage_pack_hash), true);
  assert.equal(entry.refs.graph_projection_ref.includes(entry.stage_pack_hash), true);
  assert.equal(entry.migration.status, 'stable_hash');
  assert.equal(entry.migration.active_attempt_policy, 'no_active_attempt_binding');
  assert.equal(entry.authority_boundary.stores_body_payloads, false);
  assert.equal(projection.authority_boundary.registry_is_scheduler_input, true);
  assert.equal(projection.authority_boundary.can_write_domain_truth, false);
});

test('stage pack registry leaves unchanged hashes stable for bound attempts', () => {
  const current = bundle();
  const entry = buildFamilyStagePackRegistryEntry(current, {
    previousStagePackHash: current.integrity.stage_pack_hash,
    attemptBinding: {
      stage_attempt_id: 'attempt:1',
      stage_id: 'manuscript_authoring',
      stage_pack_hash: current.integrity.stage_pack_hash,
    },
  });

  assert.equal(entry.migration.status, 'stable_hash');
  assert.equal(entry.migration.active_attempt_policy, 'attempt_continues_bound_hash');
  assert.deepEqual(entry.migration.blockers, []);
});

test('stage pack registry allows explicit migration to a new hash', () => {
  const previous = bundle(['draft_ready']);
  const current = bundle(['draft_ready', 'source_trace_ready']);
  const entry = buildFamilyStagePackRegistryEntry(current, {
    previousStagePackHash: previous.integrity.stage_pack_hash,
    migrationPolicy: 'migrate_to_new_hash',
    migrationPolicyRef: 'policy:stage-pack-migrate',
    reusedByRefs: ['opl://stage-packs/rca/visual-review'],
    attemptBinding: {
      stage_attempt_id: 'attempt:2',
      stage_id: 'manuscript_authoring',
      stage_pack_hash: previous.integrity.stage_pack_hash,
    },
  });

  assert.notEqual(previous.integrity.stage_pack_hash, current.integrity.stage_pack_hash);
  assert.equal(entry.migration.status, 'migrate_to_new_hash');
  assert.equal(entry.migration.active_attempt_policy, 'attempt_migrates_to_current_hash');
  assert.equal(entry.refs.migration_policy_ref, 'policy:stage-pack-migrate');
  assert.equal(entry.library_lifecycle.status, 'reused');
  assert.deepEqual(entry.library_lifecycle.reused_by_refs, ['opl://stage-packs/rca/visual-review']);
  assert.deepEqual(entry.migration.blockers, []);
});

test('stage pack registry projects library deprecation and supersession lifecycle refs without changing migration rules', () => {
  const deprecated = buildFamilyStagePackRegistryEntry(bundle(), {
    deprecationRef: 'human_gate:mas-stage-pack-deprecation',
  });
  const superseded = buildFamilyStagePackRegistryEntry(bundle(), {
    supersessionRef: 'decision:stage-pack-supersession',
    supersededByStagePackRef: 'opl://stage-packs/med-autoscience:new-pack',
  });
  const projection = buildFamilyStagePackRegistryProjection([deprecated, superseded]);

  assert.equal(deprecated.library_lifecycle.status, 'deprecated');
  assert.equal(deprecated.library_lifecycle.deprecation_ref, 'human_gate:mas-stage-pack-deprecation');
  assert.equal(deprecated.migration.status, 'stable_hash');
  assert.equal(superseded.library_lifecycle.status, 'superseded');
  assert.equal(superseded.library_lifecycle.supersession_ref, 'decision:stage-pack-supersession');
  assert.equal(superseded.library_lifecycle.superseded_by_stage_pack_ref, 'opl://stage-packs/med-autoscience:new-pack');
  assert.equal(projection.summary.deprecated_count, 1);
  assert.equal(projection.summary.superseded_count, 1);
});

test('stage pack source spec bundles only diffable refs and never carries stage or artifact bodies', () => {
  const proofBundle = bundle();
  const registryProjection = buildFamilyStagePackRegistryProjection([
    buildFamilyStagePackRegistryEntry(proofBundle, {
      libraryLifecycleStatus: 'reused',
      reusedByRefs: ['opl://stage-packs/redcube_ai:visual_delivery'],
    }),
  ]);
  const graphProjection = {
    surface_kind: 'opl_family_stage_graph_projection' as const,
    version: 'family-stage-graph-projection.v1' as const,
    project_id: 'medautoscience',
    project: 'MedAutoScience',
    target_domain_id: proofBundle.identity.target_domain_id,
    plane_id: proofBundle.identity.plane_id,
    graph_summary: {
      node_count: proofBundle.identity.stage_ids.length,
      edge_count: proofBundle.composition_obligations.length,
      blocked_node_count: 0,
      needs_contracts_node_count: 0,
      missing_edge_count: 0,
      runtime_enforced_node_count: 0,
      verified_core_eligible_node_count: 0,
      durable_runtime_only_node_count: 0,
      runtime_boundary_required_node_count: 0,
      monitor_ref_count: 0,
    },
    nodes: [],
    edges: [],
    failure_localization: [],
    conformance_status: proofBundle.conformance_status,
    integrity: proofBundle.integrity,
    authority_boundary: {
      opl_role: 'graph_projection_only' as const,
      graph_is_scheduler_input: true as const,
      can_execute_stage: false as const,
      can_write_domain_truth: false as const,
      can_authorize_domain_ready: false as const,
      can_authorize_quality_verdict: false as const,
      can_mutate_artifact_body: false as const,
    },
  };
  const sourceSpec = buildFamilyStagePackSourceSpecProjection({
    plane: plane(),
    proofBundle,
    graphProjection,
    registryProjection,
    replayCertification: buildFamilyStageReplayCertification(proofBundle),
    assumptionLifecycle: buildFamilyStageAssumptionLifecycleProjection(plane()),
    cohortLoop: buildFamilyStageCohortLoopProjection(plane()),
  });

  assert.equal(sourceSpec.surface_kind, 'opl_family_stage_pack_source_spec');
  assert.equal(sourceSpec.review_mode, 'diffable_refs_only_visual_equivalent_spec');
  assert.equal(sourceSpec.diff_keys.registry_lifecycle_statuses[0], 'reused');
  assert.deepEqual(sourceSpec.diff_keys.registry_lifecycle_refs, ['opl://stage-packs/redcube_ai:visual_delivery']);
  assert.equal(sourceSpec.source_refs.proof_bundle_ref.includes(proofBundle.integrity.stage_pack_hash), true);
  assert.equal(sourceSpec.review_summary.body_free, true);
  assert.equal(sourceSpec.body_policy.includes_control_plane_body, false);
  assert.equal(sourceSpec.body_policy.includes_artifact_body, false);
  assert.equal(sourceSpec.body_policy.executes_stage, false);
  assert.equal('stages' in sourceSpec, false);
  assert.equal('proof_bundle' in sourceSpec, false);
  assert.equal(sourceSpec.authority_boundary.can_execute_stage, false);
  assert.equal(sourceSpec.authority_boundary.can_mutate_artifact_body, false);
});

test('stage pack source spec hash changes with source-spec refs without changing stage pack hash', () => {
  const proofBundle = bundle();
  const graphProjection = {
    surface_kind: 'opl_family_stage_graph_projection' as const,
    version: 'family-stage-graph-projection.v1' as const,
    project_id: 'medautoscience',
    project: 'MedAutoScience',
    target_domain_id: proofBundle.identity.target_domain_id,
    plane_id: proofBundle.identity.plane_id,
    graph_summary: {
      node_count: proofBundle.identity.stage_ids.length,
      edge_count: proofBundle.composition_obligations.length,
      blocked_node_count: 0,
      needs_contracts_node_count: 0,
      missing_edge_count: 0,
      runtime_enforced_node_count: 0,
      verified_core_eligible_node_count: 0,
      durable_runtime_only_node_count: 0,
      runtime_boundary_required_node_count: 0,
      monitor_ref_count: 0,
    },
    nodes: [],
    edges: [],
    failure_localization: [],
    conformance_status: proofBundle.conformance_status,
    integrity: proofBundle.integrity,
    authority_boundary: {
      opl_role: 'graph_projection_only' as const,
      graph_is_scheduler_input: true as const,
      can_execute_stage: false as const,
      can_write_domain_truth: false as const,
      can_authorize_domain_ready: false as const,
      can_authorize_quality_verdict: false as const,
      can_mutate_artifact_body: false as const,
    },
  };
  const buildSpec = (reusedByRefs: string[]) => buildFamilyStagePackSourceSpecProjection({
    plane: plane(),
    proofBundle,
    graphProjection,
    registryProjection: buildFamilyStagePackRegistryProjection([
      buildFamilyStagePackRegistryEntry(proofBundle, {
        libraryLifecycleStatus: 'reused',
        reusedByRefs,
      }),
    ]),
    replayCertification: buildFamilyStageReplayCertification(proofBundle),
    assumptionLifecycle: buildFamilyStageAssumptionLifecycleProjection(plane()),
    cohortLoop: buildFamilyStageCohortLoopProjection(plane()),
  });
  const base = buildSpec(['opl://stage-packs/redcube_ai:visual_delivery']);
  const changed = buildSpec(['opl://stage-packs/mag:grant_authoring']);

  assert.equal(base.stage_pack_hash, changed.stage_pack_hash);
  assert.notEqual(base.source_spec_hash, changed.source_spec_hash);
  assert.match(base.source_spec_hash, /^[0-9a-f]{64}$/);
});

test('stage pack registry blocks changed hashes without policy or when human gate is required', () => {
  const previous = bundle(['draft_ready']);
  const current = bundle(['draft_ready', 'source_trace_ready']);
  const missingPolicy = buildFamilyStagePackRegistryEntry(current, {
    previousStagePackHash: previous.integrity.stage_pack_hash,
  });
  const humanGate = buildFamilyStagePackRegistryEntry(current, {
    previousStagePackHash: previous.integrity.stage_pack_hash,
    migrationPolicy: 'blocked_human_gate',
  });

  assert.equal(missingPolicy.migration.status, 'blocked');
  assert.equal(missingPolicy.migration.blockers[0]?.blocker_id, 'stage_pack_hash_changed_without_policy');
  assert.equal(
    missingPolicy.migration.blockers[0]?.minimal_counterexample.previous_stage_pack_hash,
    previous.integrity.stage_pack_hash,
  );
  assert.equal(humanGate.migration.status, 'blocked_human_gate');
  assert.equal(humanGate.migration.blockers[0]?.repair_action, 'record_human_gate_for_stage_pack_migration');
});

test('stage pack registry schema freezes no-body non-authority boundary and typed migration blockers', () => {
  const schema = readJson('contracts/family-orchestration/family-stage-pack-registry.schema.json');
  const properties = schema.properties as Record<string, JsonRecord>;
  const defs = schema.$defs as Record<string, JsonRecord>;
  const projectionAuthority = defs.projection_authority_boundary as JsonRecord;
  const projectionAuthorityProperties = projectionAuthority.properties as Record<string, JsonRecord>;
  const blocker = defs.blocker as JsonRecord;
  const blockerProperties = blocker.properties as Record<string, JsonRecord>;
  const example = (schema.examples as JsonRecord[])[0];
  const exampleAuthority = example.authority_boundary as JsonRecord;

  assert.equal(properties.surface_kind.const, 'opl_family_stage_pack_registry');
  assert.equal(properties.version.const, 'family-stage-pack-registry.v1');
  assert.equal(projectionAuthorityProperties.opl_role.const, 'stage_pack_registry_projection_only');
  assert.equal(projectionAuthorityProperties.registry_is_scheduler_input.const, true);
  assert.equal(projectionAuthorityProperties.stores_body_payloads.const, false);
  assert.equal(projectionAuthorityProperties.can_execute_stage.const, false);
  assert.equal(projectionAuthorityProperties.can_authorize_quality_verdict.const, false);
  assert.deepEqual(blockerProperties.blocker_id.enum, [
    'stage_pack_hash_changed_without_policy',
    'stage_pack_hash_migration_requires_human_gate',
    'attempt_stage_pack_hash_conflict',
  ]);
  assert.equal(exampleAuthority.stores_body_payloads, false);
  assert.deepEqual(defs.library_lifecycle_status.enum, [
    'candidate',
    'admitted',
    'reused',
    'deprecated',
    'superseded',
  ]);
  assert.equal((defs.lifecycle_authority_boundary.properties as Record<string, JsonRecord>).stores_body_payloads.const, false);
});

test('stage pack source spec schema freezes refs-only visual-equivalent boundary', () => {
  const schema = readJson('contracts/family-orchestration/family-stage-pack-source-spec.schema.json');
  const defs = schema.$defs as Record<string, JsonRecord>;
  const bodyPolicy = defs.body_policy as JsonRecord;
  const bodyPolicyProperties = bodyPolicy.properties as Record<string, JsonRecord>;
  const authority = defs.authority_boundary as JsonRecord;
  const authorityProperties = authority.properties as Record<string, JsonRecord>;
  const example = (schema.examples as JsonRecord[])[0];

  assert.equal((schema.properties as Record<string, JsonRecord>).surface_kind.const, 'opl_family_stage_pack_source_spec');
  assert.equal((schema.properties as Record<string, JsonRecord>).review_mode.const, 'diffable_refs_only_visual_equivalent_spec');
  assert.equal(bodyPolicyProperties.includes_control_plane_body.const, false);
  assert.equal(bodyPolicyProperties.includes_artifact_body.const, false);
  assert.equal(bodyPolicyProperties.executes_stage.const, false);
  assert.equal(authorityProperties.visual_equivalent_spec.const, true);
  assert.equal(authorityProperties.stores_body_payloads.const, false);
  assert.equal((example.body_policy as JsonRecord).executes_stage, false);
});

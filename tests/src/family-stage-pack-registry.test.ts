import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { FamilyActionCatalog } from '../../src/family-action-catalog-contract.ts';
import type { FamilyStageControlPlane } from '../../src/family-stage-control-plane-contract.ts';
import { buildFamilyStageProofBundle } from '../../src/family-stage-proof-bundle.ts';
import {
  buildFamilyStagePackRegistryEntry,
  buildFamilyStagePackRegistryProjection,
} from '../../src/family-stage-pack-registry.ts';

type JsonRecord = Record<string, unknown>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function readJson(relativePath: string): JsonRecord {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as JsonRecord;
}

function actionCatalog(): FamilyActionCatalog {
  return {
    surface_kind: 'family_action_catalog',
    version: 'family-action-catalog.v1',
    catalog_id: 'mas_stage_actions',
    target_domain_id: 'med-autoscience',
    owner: 'med-autoscience',
    authority_boundary: { opl_role: 'projection_consumer_only' },
    actions: [],
    notes: [],
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
  assert.deepEqual(entry.migration.blockers, []);
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
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  FamilyProductEntryManifestSurface,
  FamilyProductEntrySurface,
} from '../../../src/modules/console/product-entry-companions.ts';
import {
  buildDeliveryIdentitySurface,
  buildEntrySessionSurface,
  buildOperatorLoopActionCatalog,
  buildFamilyProductEntrySurfaces,
  buildFamilyProductEntrySurface,
  buildFamilyProductEntrySurfaceFromManifest,
  buildFamilyProductEntryManifest,
  buildProductEntryContinuationSnapshot,
  buildOplProductEntryLifecycleAdapterSurface,
  buildProductEntryShellCatalog,
  buildProductEntryShellLinkedSurface,
  buildProductEntrySurface,
  buildProductEntryOverview,
  buildProductEntryQuickstart,
  buildProductEntryReadiness,
  buildProductEntryResumeSurface,
  buildProductEntryStart,
  buildReturnSurfaceContract,
  buildRuntimeSessionContract,
  collectFamilyHumanGateIds,
  validateFamilyProductEntrySurface,
  validateFamilyProductEntryManifest,
} from '../../../src/modules/console/product-entry-companions.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function record(value: unknown) {
  assert.equal(typeof value, 'object');
  assert.notEqual(value, null);
  assert.equal(Array.isArray(value), false);
  return value as Record<string, any>;
}

function readFamilyManifestFixture(fileName: string) {
  const payload = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'tests/fixtures/family-manifests', fileName), 'utf8'),
  ) as Record<string, unknown>;
  return (payload.product_entry_manifest as Record<string, unknown> | undefined) ?? payload;
}


test('product entry session helpers normalize runtime, continuation, and delivery surfaces', () => {
  const runtimeSessionContract = buildRuntimeSessionContract({
    runtime_owner: 'provider_backed_family_runtime',
    expected_runtime_owner: 'provider_backed_family_runtime',
    default_adapter_surface: '@redcube/codex-cli-client',
    default_session_mode: 'entry_session',
  });
  assert.deepEqual(runtimeSessionContract, {
    runtime_owner: 'provider_backed_family_runtime',
    adapter_surface: '@redcube/codex-cli-client',
    session_mode: 'entry_session',
  });

  const returnSurfaceContract = buildReturnSurfaceContract({
    requested_surface_kind: 'managed_run',
    expected_surface_kind: 'managed_run',
    actual_surface_kind: 'managed_run',
    durable_truth_surfaces: ['runtimeWatch', 'getReviewState'],
  });
  assert.deepEqual(returnSurfaceContract, {
    requested_surface_kind: 'managed_run',
    actual_surface_kind: 'managed_run',
    durable_truth_surfaces: ['runtimeWatch', 'getReviewState'],
  });

  const continuationSnapshot = buildProductEntryContinuationSnapshot({
    latest_managed_run_id: 'managed-run-1',
    managed_progress_projection: {
      stage: 'drafting',
    },
  });
  assert.deepEqual(continuationSnapshot, {
    latest_managed_run_id: 'managed-run-1',
    latest_run_id: null,
    managed_progress_projection: {
      stage: 'drafting',
    },
    runtime_supervision: null,
  });

  const entrySession = buildEntrySessionSurface({
    entry_session_id: 'entry-session-1',
    session_file: '/tmp/entry-session-1.json',
    runtime_owner: 'provider_backed_family_runtime',
    resumed_from_session: true,
  });
  assert.deepEqual(entrySession, {
    entry_session_id: 'entry-session-1',
    session_file: '/tmp/entry-session-1.json',
    runtime_owner: 'provider_backed_family_runtime',
    resumed_from_session: true,
  });

  const deliveryIdentity = buildDeliveryIdentitySurface({
    deliverable_family: 'ppt_deck',
    topic_id: 'topic-1',
    deliverable_id: 'deliverable-1',
    profile_id: 'profile-1',
  });
  assert.deepEqual(deliveryIdentity, {
    deliverable_family: 'ppt_deck',
    topic_id: 'topic-1',
    deliverable_id: 'deliverable-1',
    profile_id: 'profile-1',
  });
});

test('OPL product-entry lifecycle adapter preserves framework and domain authority boundaries', () => {
  const continuationSnapshot = buildProductEntryContinuationSnapshot({
    latest_run_id: 'run-1',
    extra_payload: {
      latest_stage_execution_plan_ref: 'opl-stage-plan-1',
      stage_execution_plan: {
        summary: {
          first_stage: 'draft',
          terminal_stage: 'export',
          planned_stage_count: 2,
        },
        control_policy: {
          approval_required: true,
        },
        stage_attempts: [
          { stage_id: 'draft' },
          { stage_id: 'export' },
        ],
      },
      runtime_projection: {
        health_status: 'healthy',
        worker_running: true,
        active_run_id: 'run-1',
        next_action: 'continue',
        refs: {
          stage_execution_plan_path: '/tmp/plan.json',
          progress_projection_path: '/tmp/progress.json',
        },
      },
    },
  });
  const adapter = buildOplProductEntryLifecycleAdapterSurface({
    domain_id: 'redcube_ai',
    domain_owner: 'redcube_ai',
    runtime_owner: 'configured_family_runtime_provider',
    entry_session_id: 'entry-session-1',
    session_file: '/tmp/entry-session-1.json',
    delivery_identity: {
      deliverable_family: 'ppt_deck',
      topic_id: 'topic-1',
      deliverable_id: 'deliverable-1',
      profile_id: null,
    },
    continuation_snapshot: continuationSnapshot,
    runtime_loop_closure: {
      artifact_pickup: {
        artifact_refs: ['artifact-ref-1'],
        artifact_ref_count: 1,
      },
      control_policy: {
        approval_required: true,
        continue_action: {
          surface_kind: 'product_entry_session',
        },
      },
      resume_point: {
        checkpoint_locator_field: 'continuation_snapshot.latest_stage_execution_plan_ref',
      },
    },
    review_projection: {
      surface_kind: 'review_state',
    },
    publication_projection: {
      surface_kind: 'publication_projection',
    },
    product_entry_session_command_template: 'redcube product session --entry-session-id <entry-session-id>',
    direct_product_entry_command: 'redcube product invoke',
    opl_hosted_handoff_ref: 'opl_framework:hosted_product_entry',
    source: 'session',
    entry_mode: 'redcube_product_entry',
  });
  const discovery = record(adapter.discovery);
  const ownerSplit = record(discovery.owner_split);
  const persistence = record(adapter.persistence);
  const session = record(persistence.session);
  const stageExecutionPlan = record(persistence.stage_execution_plan);
  const lifecycle = record(adapter.lifecycle);
  const reviewPublication = record(lifecycle.review_publication);
  const reviewStateRef = record(reviewPublication.review_state_ref);
  const ownerRouteDiscovery = record(adapter.owner_route_discovery);
  const adoption = record(adapter.adoption);
  const authorityBoundary = record(adapter.authority_boundary);

  assert.equal(adapter.surface_kind, 'opl_family_lifecycle_adapter');
  assert.equal(discovery.adoption_state, 'hydrated_session_projection');
  assert.equal(ownerSplit.session_shell_owner, 'one-person-lab');
  assert.equal(ownerSplit.stage_attempt_owner, 'one-person-lab');
  assert.equal(ownerSplit.attempt_ledger_owner, 'one-person-lab');
  assert.equal(ownerSplit.domain_truth_owner, 'redcube_ai');
  assert.equal(session.entry_session_id, 'entry-session-1');
  assert.equal(stageExecutionPlan.plan_ref, 'opl-stage-plan-1');
  assert.equal(lifecycle.current_stage, 'draft');
  assert.equal(reviewStateRef.owner, 'redcube_ai');
  assert.equal(ownerRouteDiscovery.recommended_owner_route, 'resolve_review_gate');
  assert.equal(adoption.next_surface_ref, '/session_continuity');
  assert.equal(authorityBoundary.owns_domain_truth, false);
  assert.equal(authorityBoundary.owns_canonical_artifacts, false);
  assert.equal(authorityBoundary.owns_review_truth, false);
  assert.equal(authorityBoundary.owns_concrete_executor, false);
});

test('OPL product-entry lifecycle adapter supports manifest-only discovery without session runtime ownership', () => {
  const adapter = buildOplProductEntryLifecycleAdapterSurface({
    domain_id: 'med_autogrant',
    domain_owner: 'med_autogrant',
    manifest_projection: true,
    entry_session_id: 'ignored-at-manifest-level',
    session_file: '/tmp/ignored.json',
    product_entry_session_command_template: 'medautogrant product-entry session --entry-session-id <entry-session-id>',
  });
  const discovery = record(adapter.discovery);
  const persistence = record(adapter.persistence);
  const session = record(persistence.session);
  const ownerRouteDiscovery = record(adapter.owner_route_discovery);
  const candidateRoutes = ownerRouteDiscovery.candidate_routes as Record<string, unknown>[];
  const nonGoals = adapter.non_goals as string[];

  assert.equal(discovery.adoption_state, 'discoverable_manifest_projection');
  assert.equal(session.entry_session_id, null);
  assert.equal(session.session_file, null);
  assert.equal(candidateRoutes[0].route_id, 'product_entry_session');
  assert.deepEqual(
    nonGoals.slice(0, 3),
    [
      'not_a_domain_truth_owner',
      'not_a_canonical_artifact_owner',
      'not_a_review_or_publication_projection_owner',
    ],
  );
});

test('product entry shell scaffold helpers normalize shell surfaces and operator loop actions', () => {
  const productEntryShell = buildProductEntryShellCatalog({
    product_entry: {
      command: 'redcube product status',
      surface_kind: 'product_entry_surface',
      purpose: 'Open the direct product_entry.',
      command_template: 'redcube product status --workspace-root <workspace-root>',
    },
    session: {
      command: 'redcube product session',
      surface_kind: 'product_entry_session',
      command_template: 'redcube product session --entry-session-id <entry-session-id>',
    },
  });

  assert.equal(productEntryShell.product_entry.command, 'redcube product status');
  assert.equal(productEntryShell.product_entry.purpose, 'Open the direct product_entry.');
  assert.equal(
    productEntryShell.session.command_template,
    'redcube product session --entry-session-id <entry-session-id>',
  );

  const product_entrySurface = buildProductEntryShellLinkedSurface({
    shell_key: 'product_entry',
    shell_surface: productEntryShell.product_entry,
    summary: 'Open the direct product_entry.',
    extra_payload: {
      lane: 'product_entry',
    },
  });
  assert.deepEqual(product_entrySurface, {
    shell_key: 'product_entry',
    command: 'redcube product status',
    surface_kind: 'product_entry_surface',
    summary: 'Open the direct product_entry.',
    lane: 'product_entry',
  });

  const operatorLoopActions = buildOperatorLoopActionCatalog({
    continue_session: {
      command: 'redcube product session --entry-session-id <entry-session-id>',
      surface_kind: 'product_entry_session',
      summary: 'Continue the same deliverable loop.',
      requires: ['entry_session_id'],
    },
  });
  assert.deepEqual(operatorLoopActions.continue_session, {
    command: 'redcube product session --entry-session-id <entry-session-id>',
    surface_kind: 'product_entry_session',
    summary: 'Continue the same deliverable loop.',
    requires: ['entry_session_id'],
  });
});

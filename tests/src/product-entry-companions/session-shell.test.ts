import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  FamilyProductEntryManifestSurface,
  FamilyProductFrontdoorSurface,
} from '../../../src/product-entry-companions.ts';
import {
  buildDeliveryIdentitySurface,
  buildEntrySessionSurface,
  buildOperatorLoopActionCatalog,
  buildFamilyFrontdoorEntrySurfaces,
  buildFamilyProductFrontdoor,
  buildFamilyProductFrontdoorFromManifest,
  buildFamilyProductEntryManifest,
  buildProductEntryContinuationSnapshot,
  buildProductEntryShellCatalog,
  buildProductEntryShellLinkedSurface,
  buildProductFrontdoor,
  buildProductEntryOverview,
  buildProductEntryQuickstart,
  buildProductEntryReadiness,
  buildProductEntryResumeSurface,
  buildProductEntryStart,
  buildReturnSurfaceContract,
  buildRuntimeSessionContract,
  collectFamilyHumanGateIds,
  validateFamilyProductFrontdoor,
  validateFamilyProductEntryManifest,
} from '../../../src/product-entry-companions.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function readFamilyManifestFixture(fileName: string) {
  const payload = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'tests/fixtures/family-manifests', fileName), 'utf8'),
  ) as Record<string, unknown>;
  return (payload.product_entry_manifest as Record<string, unknown> | undefined) ?? payload;
}


test('product entry session helpers normalize runtime, continuation, and delivery surfaces', () => {
  const runtimeSessionContract = buildRuntimeSessionContract({
    runtime_owner: 'upstream_hermes_agent',
    expected_runtime_owner: 'upstream_hermes_agent',
    default_adapter_surface: '@redcube/codex-cli-client',
    default_session_mode: 'entry_session',
  });
  assert.deepEqual(runtimeSessionContract, {
    runtime_owner: 'upstream_hermes_agent',
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
    runtime_owner: 'upstream_hermes_agent',
    resumed_from_session: true,
  });
  assert.deepEqual(entrySession, {
    entry_session_id: 'entry-session-1',
    session_file: '/tmp/entry-session-1.json',
    runtime_owner: 'upstream_hermes_agent',
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

test('product entry shell scaffold helpers normalize shell surfaces and operator loop actions', () => {
  const productEntryShell = buildProductEntryShellCatalog({
    frontdoor: {
      command: 'redcube product frontdoor',
      surface_kind: 'product_frontdoor',
      purpose: 'Open the direct frontdoor.',
      command_template: 'redcube product frontdoor --workspace-root <workspace-root>',
    },
    session: {
      command: 'redcube product session',
      surface_kind: 'product_entry_session',
      command_template: 'redcube product session --entry-session-id <entry-session-id>',
    },
  });

  assert.equal(productEntryShell.frontdoor.command, 'redcube product frontdoor');
  assert.equal(productEntryShell.frontdoor.purpose, 'Open the direct frontdoor.');
  assert.equal(
    productEntryShell.session.command_template,
    'redcube product session --entry-session-id <entry-session-id>',
  );

  const frontdoorSurface = buildProductEntryShellLinkedSurface({
    shell_key: 'frontdoor',
    shell_surface: productEntryShell.frontdoor,
    summary: 'Open the direct frontdoor.',
    extra_payload: {
      lane: 'frontdoor',
    },
  });
  assert.deepEqual(frontdoorSurface, {
    shell_key: 'frontdoor',
    command: 'redcube product frontdoor',
    surface_kind: 'product_frontdoor',
    summary: 'Open the direct frontdoor.',
    lane: 'frontdoor',
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


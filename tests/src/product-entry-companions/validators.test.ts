import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  validateFamilyProductEntrySurface,
  validateFamilyProductEntryManifest,
} from '../../../src/modules/console/product-entry-companions.ts';
import { parseJsonText } from '../../../src/kernel/json-file.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function readFamilyManifestFixture(fileName: string) {
  const payload = parseJsonText(
    fs.readFileSync(path.join(repoRoot, 'tests/fixtures/family-manifests', fileName), 'utf8'),
  ) as Record<string, unknown>;
  return (payload.product_entry_manifest as Record<string, unknown> | undefined) ?? payload;
}

function readValidatorManifestFixture() {
  const manifest = structuredClone(readFamilyManifestFixture('redcube-product-entry-manifest.json')) as Record<string, any>;
  manifest.persistence_policy ??= { surface_kind: 'family_persistence_policy' };
  manifest.lifecycle_ledger ??= { surface_kind: 'family_lifecycle_ledger' };
  manifest.owner_route ??= { surface_kind: 'family_owner_route' };
  manifest.product_entry_quickstart ??= {
    surface_kind: 'product_entry_quickstart',
    recommended_step_id: 'open_product_entry',
    summary: 'Open the product_entry first.',
    steps: [{
      step_id: 'open_product_entry',
      title: 'Open product_entry',
      command: 'redcube product status',
      surface_kind: 'product_entry_surface',
      summary: 'Open the direct product_entry.',
      requires: [],
    }],
    resume_contract: manifest.family_orchestration.resume_contract,
    human_gate_ids: manifest.product_entry_start.human_gate_ids ?? [],
  };
  return manifest;
}

function buildValidatorProductEntry(manifest: Record<string, any>) {
  return {
    surface_kind: 'product_entry_surface',
    recommended_action: 'inspect_or_start_product_entry',
    target_domain_id: manifest.target_domain_id,
    workspace_locator: manifest.workspace_locator,
    runtime: manifest.runtime,
    product_entry_status: manifest.product_entry_status,
    product_entry_surface: manifest.product_entry_surface,
    operator_loop_surface: manifest.operator_loop_surface,
    operator_loop_actions: manifest.operator_loop_actions ?? {},
    product_entry_start: manifest.product_entry_start,
    product_entry_overview: manifest.product_entry_overview,
    product_entry_preflight: manifest.product_entry_preflight,
    product_entry_readiness: manifest.product_entry_readiness,
    product_entry_quickstart: manifest.product_entry_quickstart,
    family_orchestration: manifest.family_orchestration,
    product_entry_manifest: manifest,
    entry_surfaces: {},
    summary: {
      product_entry_command: manifest.product_entry_overview.product_entry_command,
      recommended_command: manifest.product_entry_overview.recommended_command,
      operator_loop_command: manifest.product_entry_overview.operator_loop_command,
    },
    notes: ['Thin product_entry adapter is active.'],
    schema_ref: 'contracts/schemas/v1/product-status.schema.json',
    domain_entry_contract: manifest.domain_entry_contract,
    user_interaction_contract: manifest.user_interaction_contract,
  };
}


test('product entry companion validators normalize shared family payloads', () => {
  const manifest = readValidatorManifestFixture();

  const validatedManifest = validateFamilyProductEntryManifest(manifest, {
    requireContractBundle: true,
    requireRuntimeCompanions: true,
    requireRuntimeContinuity: true,
  });
  assert.equal(validatedManifest.surface_kind, 'product_entry_manifest');
  assert.equal(validatedManifest.product_entry_start.resume_surface.surface_kind, 'product_entry_session');
  assert.equal(validatedManifest.domain_entry_contract?.entry_adapter, 'RedCubeDomainEntry');
  assert.equal(validatedManifest.runtime_inventory?.surface_kind, 'runtime_inventory');
  assert.equal(validatedManifest.runtime_loop_closure?.surface_kind, 'runtime_loop_closure');
  assert.equal(validatedManifest.persistence_policy?.surface_kind, 'family_persistence_policy');
  assert.equal(validatedManifest.lifecycle_ledger?.surface_kind, 'family_lifecycle_ledger');
  assert.equal(validatedManifest.owner_route?.surface_kind, 'family_owner_route');
  assert.equal(validatedManifest.session_continuity?.surface_kind, 'session_continuity');
  assert.equal(validatedManifest.progress_projection?.surface_kind, 'progress_projection');
  assert.equal(validatedManifest.artifact_inventory?.surface_kind, 'artifact_inventory');

  const product_entry = buildValidatorProductEntry(manifest);
  const validatedProductEntry = validateFamilyProductEntrySurface(product_entry, {
    requireContractBundle: true,
  });
  assert.equal(validatedProductEntry.surface_kind, 'product_entry_surface');
  assert.equal(validatedProductEntry.product_entry_manifest.surface_kind, 'product_entry_manifest');
  assert.equal(validatedProductEntry.user_interaction_contract?.entry_owner, 'opl_framework_or_domain_app');
});

test('runtime continuity validation accepts MAS, MAG, and RCA manifest fixtures', () => {
  const fixtureNames = [
    'med-autoscience-product-entry-manifest.json',
    'med-autogrant-product-entry-manifest.json',
    'redcube-product-entry-manifest.json',
  ];

  for (const fileName of fixtureNames) {
    const manifest = readFamilyManifestFixture(fileName);
    const validated = validateFamilyProductEntryManifest(manifest, {
      requireRuntimeContinuity: true,
    });
    assert.equal(validated.session_continuity?.surface_kind, 'session_continuity', fileName);
    assert.equal(validated.progress_projection?.surface_kind, 'progress_projection', fileName);
    assert.equal(validated.artifact_inventory?.surface_kind, 'artifact_inventory', fileName);
  }
});

test('product entry companion validators fail closed on missing required shared fields', () => {
  const manifest = readValidatorManifestFixture();

  const missingSchemaRef = structuredClone(manifest) as Record<string, unknown>;
  delete missingSchemaRef.schema_ref;
  assert.throws(
    () => validateFamilyProductEntryManifest(missingSchemaRef, { requireContractBundle: true }),
    /schema_ref/,
  );

  const wrongRuntimeInventory = structuredClone(manifest);
  wrongRuntimeInventory.runtime_inventory.surface_kind = 'runtime_inventory_preview';
  assert.throws(
    () => validateFamilyProductEntryManifest(wrongRuntimeInventory, { requireRuntimeCompanions: true }),
    /runtime_inventory\.surface_kind/,
  );

  const wrongSessionContinuity = structuredClone(manifest);
  wrongSessionContinuity.session_continuity.surface_kind = 'session_continuity_preview';
  assert.throws(
    () => validateFamilyProductEntryManifest(wrongSessionContinuity),
    /session_continuity\.surface_kind/,
  );

  const missingRuntimeControlReference = structuredClone(manifest);
  delete (missingRuntimeControlReference as { runtime_loop_closure?: unknown }).runtime_loop_closure;
  assert.throws(
    () => validateFamilyProductEntryManifest(missingRuntimeControlReference, { requireRuntimeContinuity: true }),
    /runtime continuity control reference/,
  );

  const wrongOwnerRoute = structuredClone(manifest);
  wrongOwnerRoute.owner_route.surface_kind = 'owner_route_preview';
  assert.throws(
    () => validateFamilyProductEntryManifest(wrongOwnerRoute),
    /owner_route\.surface_kind/,
  );

  const product_entry = buildValidatorProductEntry(manifest);
  delete product_entry.user_interaction_contract;
  assert.throws(
    () => validateFamilyProductEntrySurface(product_entry, { requireContractBundle: true }),
    /user_interaction_contract/,
  );
});

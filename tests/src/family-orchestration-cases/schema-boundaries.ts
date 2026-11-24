import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseJsonText } from '../../../src/kernel/json-file.ts';

type Json = Record<string, unknown>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const familyManifestFixtureDir = path.join(repoRoot, 'tests', 'fixtures', 'family-manifests');

function readJson(relativePath: string): Json {
  return parseJsonText(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as Json;
}

function readFamilyManifestFixture(name: string): Json {
  return parseJsonText(fs.readFileSync(path.join(familyManifestFixtureDir, name), 'utf8')) as Json;
}

function readFirstSchemaExample(relativePath: string): Json {
  const payload = readJson(relativePath);
  const examples = payload.examples;
  assert.ok(Array.isArray(examples), `${relativePath} is missing examples`);
  assert.ok(examples.length > 0, `${relativePath} is missing the first example`);
  return examples[0] as Json;
}

const genericExampleSchemaPaths = [
  'contracts/family-orchestration/family-stage-conformance.schema.json',
  'contracts/family-orchestration/family-stage-replay-certification.schema.json',
  'contracts/family-orchestration/family-stage-proof-bundle.schema.json',
  'contracts/family-orchestration/family-stage-pack-registry.schema.json',
  'contracts/family-orchestration/family-stage-pack-source-spec.schema.json',
  'contracts/family-orchestration/family-stage-cohort-loop.schema.json',
  'contracts/family-orchestration/family-stage-runtime-budget.schema.json',
] as const;

const genericExampleResiduePattern =
  /med-autoscience|medautoscience|mas_stage_control_plane|publication_review|manuscript_authoring|paper_autonomy|medical_paper|visual_stage_profile|redcube_ai|redcube_operator_review_gate|(?:^|[/:_-])rca(?:$|[/:_-])/i;

function collectGenericExampleResidue(value: unknown, pathLabel = '$'): string[] {
  if (typeof value === 'string') {
    return genericExampleResiduePattern.test(value) ? [`${pathLabel}: ${value}`] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => collectGenericExampleResidue(entry, `${pathLabel}[${index}]`));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, entry]) =>
      [
        ...(genericExampleResiduePattern.test(key) ? [`${pathLabel}.${key}: <key>`] : []),
        ...collectGenericExampleResidue(entry, `${pathLabel}.${key}`),
      ],
    );
  }
  return [];
}

export function registerFamilyOrchestrationSchemaBoundaryTests(): void {
  test('family orchestration schema examples distinguish fixture-aligned and generic identifiers', () => {
    const redcubeManifest = readFamilyManifestFixture('redcube-product-entry-manifest.json');
    const redcubeExample = readFirstSchemaExample(
      'contracts/family-orchestration/family-product-entry-manifest-v2.schema.json',
    );

    assert.equal(redcubeExample.target_domain_id, redcubeManifest.target_domain_id);
    assert.equal(
      ((redcubeExample.formal_entry as Json).internal_surface),
      ((redcubeManifest.formal_entry as Json).internal_surface),
    );
    assert.equal(
      ((redcubeExample.shared_handoff as Json).opl_return_surface as Json).target_domain_id,
      redcubeManifest.target_domain_id,
    );
    assert.deepEqual(
      ((redcubeExample.family_orchestration as Json).action_graph_ref as Json),
      ((redcubeManifest.family_orchestration as Json).action_graph_ref as Json),
    );
    assert.equal(
      (((redcubeExample.family_orchestration as Json).resume_contract) as Json).checkpoint_locator_field,
      (((redcubeManifest.family_orchestration as Json).resume_contract) as Json).checkpoint_locator_field,
    );
    assert.equal(
      (((redcubeExample.family_orchestration as Json).resume_contract) as Json).session_locator_field,
      (((redcubeManifest.family_orchestration as Json).resume_contract) as Json).session_locator_field,
    );
    assert.equal(
      ((redcubeExample.session_continuity as Json).surface_kind),
      ((redcubeManifest.session_continuity as Json).surface_kind),
    );
    assert.equal(
      ((redcubeExample.progress_projection as Json).surface_kind),
      ((redcubeManifest.progress_projection as Json).surface_kind),
    );
    assert.equal(
      ((redcubeExample.artifact_inventory as Json).surface_kind),
      ((redcubeManifest.artifact_inventory as Json).surface_kind),
    );
    assert.equal(
      ((redcubeExample.runtime_loop_closure as Json).surface_kind),
      ((redcubeManifest.runtime_loop_closure as Json).surface_kind),
    );
    assert.equal(
      ((redcubeExample.persistence_policy as Json).surface_kind),
      'family_persistence_policy',
    );
    assert.deepEqual(
      (((redcubeExample.persistence_policy as Json).authority_surfaces as Json[])[0] as Json).storage_role,
      'file_authority',
    );
    assert.equal(
      ((redcubeExample.lifecycle_ledger as Json).surface_kind),
      'family_lifecycle_ledger',
    );
    assert.equal(
      (((((redcubeExample.lifecycle_ledger as Json).actions as Json[])[0] as Json).manifest_ref as Json).ref_kind),
      'repo_path',
    );
    assert.equal(
      ((redcubeExample.owner_route as Json).surface_kind),
      'family_owner_route',
    );
    assert.equal(
      ((redcubeExample.owner_route as Json).next_owner),
      redcubeManifest.target_domain_id,
    );
    assert.equal(
      (((redcubeExample.runtime_loop_closure as Json).source_linkage) as Json).entry_mode,
      (((redcubeManifest.runtime_loop_closure as Json).source_linkage) as Json).entry_mode,
    );
  });

  test('selected generic family orchestration schema examples reject domain-specific residue', () => {
    for (const schemaPath of genericExampleSchemaPaths) {
      const firstExample = readFirstSchemaExample(schemaPath);
      assert.deepEqual(collectGenericExampleResidue(firstExample), [], schemaPath);
    }
  });

  test('family orchestration schemas use generic domain-boundary vocabulary', () => {
    const productEntrySchema = readJson(
      'contracts/family-orchestration/family-product-entry-manifest-v2.schema.json',
    );
    const productEntryProperties = productEntrySchema.properties as Json;
    const productEntryDefs = productEntrySchema.$defs as Json;
    assert.equal(
      (productEntryProperties.product_entry_domain_readiness as Json).$ref,
      '#/$defs/domainReadinessProfile',
    );
    assert.equal((productEntryProperties.grant_authoring_readiness as Json).deprecated, true);
    assert.equal(
      (((productEntryDefs.domainReadinessProfile as Json).properties as Json).surface_kind as Json).const,
      'product_entry_domain_readiness',
    );
    assert.equal(
      (((productEntryDefs.grantAuthoringReadiness as Json).properties as Json).surface_kind as Json).const,
      'grant_authoring_readiness',
    );

    const stagePlaneSchema = readJson(
      'contracts/family-orchestration/family-stage-control-plane.schema.json',
    );
    const stageProperties = (((stagePlaneSchema.$defs as Json).stage as Json).properties as Json);
    const stageKinds = (
      ((stageProperties.stage_kind as Json).enum)
    ) as string[];
    assert.ok(stageKinds.includes('release_gate'));
    assert.equal(stageKinds.includes('publish'), false);
    const displayNames = stageProperties.display_names as Json;
    assert.deepEqual(displayNames.required, ['en-US']);
    assert.equal((displayNames.propertyNames as Json).pattern, '^\\S+$');
    assert.equal((displayNames.additionalProperties as Json).pattern, '\\S');
  });

  test('family manifest schema requires repo-owned runtime continuity discovery surfaces', () => {
    const schema = readJson('contracts/family-orchestration/family-product-entry-manifest-v2.schema.json');
    const required = schema.required as string[];

    assert.ok(required.includes('skill_catalog'));
    assert.ok(required.includes('runtime_control'));
    assert.ok(required.includes('session_continuity'));
    assert.ok(required.includes('progress_projection'));
    assert.ok(required.includes('artifact_inventory'));
    assert.ok(required.includes('runtime_loop_closure'));

    const properties = schema.properties as Json;
    const runtimeControl = properties.runtime_control as Json;
    assert.equal(runtimeControl.$ref, '#/$defs/runtimeControlSurface');
    assert.equal((properties.family_runtime_supervision as Json).$ref, '#/$defs/familyRuntimeSupervisionSurface');
    assert.equal((properties.persistence_policy as Json).$ref, '#/$defs/persistencePolicySurface');
    assert.equal((properties.lifecycle_ledger as Json).$ref, '#/$defs/lifecycleLedgerSurface');
    assert.equal((properties.owner_route as Json).$ref, '#/$defs/ownerRouteSurface');

    const stageControlPlaneRef = (schema.$defs as Json).stageControlPlaneContractRef as Json;
    assert.equal(stageControlPlaneRef.additionalProperties, false);
    assert.deepEqual(stageControlPlaneRef.required, ['ref_kind', 'ref', 'source_ref']);
    assert.deepEqual(Object.keys(stageControlPlaneRef.properties as Json).sort(), [
      'label',
      'ref',
      'ref_kind',
      'source_ref',
    ]);
    assert.deepEqual((stageControlPlaneRef.properties as Json).ref_kind, {
      const: 'generated_surface',
    });
    assert.deepEqual((stageControlPlaneRef.properties as Json).ref, {
      const: 'opl-generated:family_stage_control_plane',
    });
    assert.deepEqual((stageControlPlaneRef.properties as Json).source_ref, {
      const: 'agent/stages/manifest.json',
    });
    assert.ok((schema.allOf as Json[]).some((entry) => {
      const required = ((entry.not as Json | undefined)?.required ?? []) as string[];
      return required.length === 1 && required[0] === 'family_stage_control_plane';
    }));
  });

  test('family domain memory contracts freeze locator and writeback receipt authority boundaries', () => {
    const catalogSchema = readJson('contracts/opl-framework/durable-knowledge-catalog.schema.json');
    const itemSchema = readJson('contracts/opl-framework/durable-knowledge-item.schema.json');
    const writebackSchema = readJson('contracts/family-orchestration/family-domain-memory-writeback.schema.json');
    const stagePlaneSchema = readJson('contracts/family-orchestration/family-stage-control-plane.schema.json');
    const writebackExample = readFirstSchemaExample('contracts/family-orchestration/family-domain-memory-writeback.schema.json');
    assert.deepEqual((catalogSchema.properties as Json).surface_kind, { const: 'opl_durable_knowledge_catalog' });
    assert.ok((catalogSchema.required as string[]).includes('items'));
    assert.ok((itemSchema.required as string[]).includes('scope'));
    assert.ok((itemSchema.required as string[]).includes('content_kind'));
    assert.equal((itemSchema.properties as Json).layer, undefined);
    assert.ok((itemSchema.required as string[]).includes('next_review_at'));
    assert.equal(itemSchema.additionalProperties, false);

    assert.deepEqual(
      (writebackSchema.properties as Json).surface_kind,
      { const: 'family_domain_memory_writeback' },
    );
    assert.ok((writebackSchema.required as string[]).includes('proposal'));
    assert.ok((writebackSchema.required as string[]).includes('domain_router_receipt'));
    assert.equal(Boolean((writebackSchema.properties as Json).receipt_projection_status), true);
    assert.equal((writebackExample.domain_router_receipt as Json).router_owner, 'MedAutoScience');
    assert.equal((writebackExample.receipt_projection_status as Json).accepted_rejected_authority_owner, 'MedAutoScience');
    assert.equal((writebackExample.receipt_projection_status as Json).opl_can_accept_memory_write, false);
    assert.equal((writebackExample.authority_boundary as Json).can_accept_memory_write, false);
    assert.equal((writebackExample.authority_boundary as Json).can_write_domain_truth, false);

    const stageDefs = stagePlaneSchema.$defs as Json;
    const stageProps = ((stageDefs.stage as Json).properties as Json);
    assert.deepEqual((stageProps.knowledge_refs as Json).items, { $ref: '#/$defs/surface_ref' });
    assert.deepEqual((stageProps.tool_refs as Json).items, { $ref: '#/$defs/surface_ref' });
    assert.equal(
      (stageProps.tool_affordance_boundary as Json).$ref,
      '#/$defs/tool_affordance_boundary',
    );
    const toolBoundary = stageDefs.tool_affordance_boundary as Json;
    const toolBoundaryProperties = toolBoundary.properties as Json;
    assert.equal(
      (toolBoundaryProperties.catalog_role as Json).const,
      'available_affordance_catalog_not_workflow_script',
    );
    assert.ok((toolBoundary.required as string[]).includes('capability_refs'));
    assert.ok((toolBoundary.required as string[]).includes('permission_scope_refs'));
    assert.ok((toolBoundary.required as string[]).includes('credential_boundary_refs'));
    assert.ok((toolBoundary.required as string[]).includes('write_scope_refs'));
    assert.ok((toolBoundary.required as string[]).includes('side_effect_risk_refs'));
    assert.ok((toolBoundary.required as string[]).includes('forbidden_authority_refs'));
    assert.equal(
      (toolBoundaryProperties.executor_autonomy as Json).$ref,
      '#/$defs/tool_executor_autonomy',
    );
    const toolExecutorAutonomy = stageDefs.tool_executor_autonomy as Json;
    assert.deepEqual(toolExecutorAutonomy.required, [
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
    const autonomyProperties = toolExecutorAutonomy.properties as Json;
    assert.deepEqual((autonomyProperties.executor_can_choose_tools as Json), { const: true });
    assert.deepEqual((autonomyProperties.tool_catalog_can_prescribe_tool_sequence as Json), { const: false });
  });
}

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
  'contracts/family-orchestration/family-stage-graph-projection.schema.json',
  'contracts/family-orchestration/family-stage-proof-bundle.schema.json',
  'contracts/family-orchestration/family-stage-pack-registry.schema.json',
  'contracts/family-orchestration/family-stage-pack-source-spec.schema.json',
  'contracts/family-orchestration/family-stage-cohort-loop.schema.json',
  'contracts/family-orchestration/family-stage-runtime-budget.schema.json',
  'contracts/family-orchestration/family-checkpoint-lineage.schema.json',
  'contracts/family-orchestration/family-event-envelope.schema.json',
  'contracts/family-orchestration/family-conflict-envelope.schema.json',
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
    const humanGateExample = readFirstSchemaExample(
      'contracts/family-orchestration/family-human-gate.schema.json',
    );
    const eventEnvelopeExample = readFirstSchemaExample(
      'contracts/family-orchestration/family-event-envelope.schema.json',
    );
    const checkpointLineageExample = readFirstSchemaExample(
      'contracts/family-orchestration/family-checkpoint-lineage.schema.json',
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
    assert.equal(humanGateExample.target_domain_id, redcubeManifest.target_domain_id);
    assert.equal(
      humanGateExample.gate_id,
      (((redcubeManifest.family_orchestration as Json).human_gates as Json[])[0] as Json).gate_id,
    );
    assert.equal(eventEnvelopeExample.target_domain_id, 'example-domain');
    assert.equal(eventEnvelopeExample.envelope_id, 'evt-example-domain-2026-04-13-01');
    assert.equal(checkpointLineageExample.target_domain_id, 'example-domain');
    assert.equal(checkpointLineageExample.lineage_id, 'lineage-example-domain-2026-04-13-01');
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

    const checkpointSchema = readJson(
      'contracts/family-orchestration/family-checkpoint-lineage.schema.json',
    );
    const stateRefRoles = (
      (((checkpointSchema.$defs as Json).stateRef as Json).properties as Json).role as Json
    ).enum as string[];
    assert.ok(stateRefRoles.includes('domain_delivery'));
    assert.ok(stateRefRoles.includes('owner_gate'));
    assert.equal(stateRefRoles.includes('publication'), false);

    const actionGraphSchema = readJson(
      'contracts/family-orchestration/family-action-graph.schema.json',
    );
    const actionGraphExample = readFirstSchemaExample(
      'contracts/family-orchestration/family-action-graph.schema.json',
    );
    const nodeKinds = (
      ((((actionGraphSchema.$defs as Json).node as Json).properties as Json).node_kind as Json)
        .enum
    ) as string[];
    assert.ok(nodeKinds.includes('discovery'));
    assert.ok(nodeKinds.includes('release_gate'));
    assert.equal(nodeKinds.includes('research'), false);
    assert.equal(nodeKinds.includes('publish'), false);
    assert.equal(actionGraphExample.target_domain_id, 'example-domain');
    assert.equal(String(actionGraphExample.graph_id).includes('grant'), false);
    assert.equal(String(actionGraphExample.graph_kind).includes('grant'), false);

    const stagePlaneSchema = readJson(
      'contracts/family-orchestration/family-stage-control-plane.schema.json',
    );
    const stageKinds = (
      ((((stagePlaneSchema.$defs as Json).stage as Json).properties as Json).stage_kind as Json)
        .enum
    ) as string[];
    assert.ok(stageKinds.includes('release_gate'));
    assert.equal(stageKinds.includes('publish'), false);
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

  test('family persistence lifecycle owner-route and supervision schemas freeze shared control surfaces', () => {
    const persistenceSchema = readJson('contracts/family-orchestration/family-persistence-policy.schema.json');
    const lifecycleSchema = readJson('contracts/family-orchestration/family-lifecycle-ledger.schema.json');
    const ownerRouteSchema = readJson('contracts/family-orchestration/family-owner-route.schema.json');
    const supervisionSchema = readJson('contracts/family-orchestration/family-runtime-supervision.schema.json');
    const conflictEnvelopeSchema = readJson('contracts/family-orchestration/family-conflict-envelope.schema.json');

    assert.deepEqual(
      (persistenceSchema.properties as Json).surface_kind,
      { const: 'family_persistence_policy' },
    );
    assert.deepEqual(
      (((persistenceSchema.$defs as Json).fileAuthoritySurface as Json).allOf as Json[])[1],
      { properties: { storage_role: { const: 'file_authority' } } },
    );
    assert.deepEqual(
      (((persistenceSchema.$defs as Json).sqliteSidecarSurface as Json).allOf as Json[])[1],
      { properties: { storage_role: { const: 'sqlite_sidecar_index' } } },
    );

    const lifecycleAction = (lifecycleSchema.$defs as Json).lifecycleAction as Json;
    assert.ok((lifecycleAction.required as string[]).includes('manifest_ref'));
    assert.ok((lifecycleAction.required as string[]).includes('sha256'));
    assert.ok((lifecycleAction.required as string[]).includes('restore_ref'));
    assert.equal((((lifecycleAction.properties as Json).sha256 as Json).pattern), '^[A-Fa-f0-9]{64}$');

    const ownerRouteRequired = ownerRouteSchema.required as string[];
    assert.ok(ownerRouteRequired.includes('route_epoch'));
    assert.ok(ownerRouteRequired.includes('source_fingerprint'));
    assert.ok(ownerRouteRequired.includes('idempotency_key'));

    const supervisionRequired = supervisionSchema.required as string[];
    assert.ok(supervisionRequired.includes('adapter_id'));
    assert.ok(supervisionRequired.includes('cadence'));
    assert.ok(supervisionRequired.includes('last_success'));
    assert.ok(supervisionRequired.includes('last_tick'));
    assert.ok(supervisionRequired.includes('lease_freshness'));
    assert.ok(supervisionRequired.includes('slo_state'));
    assert.ok(supervisionRequired.includes('repair_command'));
    assert.ok(supervisionRequired.includes('safe_reconcile_hint'));
    assert.ok(supervisionRequired.includes('domain_owned_source_refs'));
    assert.ok(supervisionRequired.includes('read_only_authority_boundary'));
    const supervisionExample = (supervisionSchema.examples as Json[])[0] as Json;
    assert.equal(
      supervisionExample.repair_command,
      'medautosci runtime domain-health-diagnostic --runtime-root <runtime_root> --profile <profile> --request-opl-stage-attempts --dry-run',
    );
    assert.doesNotMatch(String(supervisionExample.repair_command), /runtime-ensure-supervision|runtime ensure-supervision/);
    assert.match(String(supervisionExample.safe_reconcile_hint), /read-only current-control probe/);
    assert.deepEqual(
      (supervisionSchema.properties as Json).surface_kind,
      { const: 'family_runtime_supervision' },
    );
    assert.equal(
      ((((supervisionSchema.properties as Json).read_only_authority_boundary as Json).properties as Json).authority as Json).const,
      'read_only_projection',
    );

    assert.deepEqual(
      (conflictEnvelopeSchema.properties as Json).kind,
      { const: 'opl_conflict_or_blocker.v1' },
    );
    assert.deepEqual(
      ((conflictEnvelopeSchema.properties as Json).classification as Json).enum,
      [
        'duplicate_task',
        'authority_conflict',
        'evidence_blocker',
        'quality_blocker',
        'human_gate',
        'execution_retryable',
        'identity_incomplete',
        'receipt_conflict',
      ],
    );
    assert.deepEqual(
      ((conflictEnvelopeSchema.properties as Json).owner as Json).enum,
      ['opl_runtime', 'domain_agent', 'human', 'infrastructure'],
    );
    assert.deepEqual(
      ((conflictEnvelopeSchema.properties as Json).status as Json).enum,
      ['blocked', 'waiting_for_human', 'retry_scheduled', 'dead_lettered', 'conflict_fail_closed', 'deduplicated'],
    );
    assert.ok((conflictEnvelopeSchema.required as string[]).includes('allowed_next_actions'));
    assert.ok((conflictEnvelopeSchema.required as string[]).includes('forbidden_actions'));
    assert.ok((conflictEnvelopeSchema.required as string[]).includes('authority_boundary'));
    const subjectRequired = (((conflictEnvelopeSchema.$defs as Json).subject as Json).required as string[]);
    assert.deepEqual(subjectRequired, ['domain', 'stage_id', 'task_kind', 'source_fingerprint', 'idempotency_key']);
    const boundaryProperties = (((conflictEnvelopeSchema.properties as Json).authority_boundary as Json).properties as Json);
    assert.deepEqual(boundaryProperties.provider_completion_is_domain_ready, { const: false });
    assert.deepEqual(boundaryProperties.can_write_domain_truth, { const: false });
    assert.deepEqual(boundaryProperties.can_fallback_complete, { const: false });
  });

  test('family domain memory contracts freeze locator and writeback receipt authority boundaries', () => {
    const memoryRefSchema = readJson('contracts/family-orchestration/family-domain-memory-ref.schema.json');
    const writebackSchema = readJson('contracts/family-orchestration/family-domain-memory-writeback.schema.json');
    const stagePlaneSchema = readJson('contracts/family-orchestration/family-stage-control-plane.schema.json');
    const memoryRefExample = readFirstSchemaExample(
      'contracts/family-orchestration/family-domain-memory-ref.schema.json',
    );
    const writebackExample = readFirstSchemaExample(
      'contracts/family-orchestration/family-domain-memory-writeback.schema.json',
    );

    assert.deepEqual(
      (memoryRefSchema.properties as Json).surface_kind,
      { const: 'family_domain_memory_ref' },
    );
    assert.ok((memoryRefSchema.required as string[]).includes('memory_pack_ref'));
    assert.ok((memoryRefSchema.required as string[]).includes('stage_applicability'));
    assert.equal(Boolean((memoryRefSchema.properties as Json).migration_plan_ref), true);
    assert.equal(Boolean((memoryRefSchema.properties as Json).seed_corpus_ref), true);
    assert.equal(Boolean((memoryRefSchema.properties as Json).writeback_receipt_locator_ref), true);
    assert.equal(Boolean((memoryRefSchema.properties as Json).migration_readiness), true);
    assert.equal(Boolean((memoryRefSchema.properties as Json).receipt_projection), true);
    assert.equal(
      (((memoryRefSchema.properties as Json).authority_boundary as Json).properties as Json).opl_role !== undefined,
      true,
    );
    assert.deepEqual(
      (((((memoryRefSchema.properties as Json).authority_boundary as Json).properties as Json).forbidden_opl_authority as Json).contains),
      { const: 'memory_store_owner' },
    );
    assert.equal(
      (((memoryRefExample.authority_boundary as Json).forbidden_opl_authority as string[]).includes('domain_truth_owner')),
      true,
    );
    assert.equal((memoryRefExample.authority_boundary as Json).can_write_domain_truth, false);
    assert.equal((memoryRefExample.authority_boundary as Json).can_authorize_quality_verdict, false);
    assert.equal((memoryRefExample.authority_boundary as Json).can_write_artifacts, false);
    assert.equal((memoryRefExample.migration_plan_ref as Json).role, 'domain_owned_migration_plan');
    assert.equal((memoryRefExample.seed_corpus_ref as Json).role, 'domain_owned_seed_corpus');
    assert.equal((memoryRefExample.writeback_receipt_locator_ref as Json).role, 'domain_owned_router_receipts');
    assert.equal((memoryRefExample.migration_readiness as Json).opl_apply_allowed, false);
    assert.equal((memoryRefExample.receipt_projection as Json).accepted_rejected_authority_owner, 'MedAutoScience');
    assert.equal((memoryRefExample.receipt_projection as Json).can_accept_memory_write, false);
    assert.equal((memoryRefExample.receipt_projection as Json).can_write_domain_truth, false);

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

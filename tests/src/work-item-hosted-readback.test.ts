import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { FrameworkContractError } from '../../src/kernel/contract-validation.ts';
import { parseJsonText } from '../../src/kernel/json-file.ts';
import { validateJsonSchemaPayload } from '../../src/kernel/schema-registry.ts';
import { buildHostedWorkItemReadback } from '../../src/modules/console/work-item-hosted-readback.ts';
import type { WorkItemProjectionV2 } from '../../src/modules/console/work-item-projection/types.ts';

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeHostedCasReadState(input: {
  stateRoot: string;
  workspaceRoot: string;
  phase: 'in_progress' | 'settled';
  transitionId: string;
  journal: boolean;
}) {
  const workspaceKey = crypto.createHash('sha256')
    .update(fs.realpathSync.native(input.workspaceRoot))
    .digest('hex');
  const requestSha256 = 'b'.repeat(64);
  const root = path.join(input.stateRoot, 'runway', 'domain-artifact-cas');
  const epochPath = path.join(root, 'read-epochs', `${workspaceKey}.json`);
  const journalPath = path.join(root, 'transactions', `${workspaceKey}-${requestSha256}.json`);
  writeJson(epochPath, {
    surface_kind: 'opl_domain_artifact_cas_read_epoch',
    version: 'opl-domain-artifact-cas-read-epoch.v1',
    workspace_sha256: workspaceKey,
    request_sha256: requestSha256,
    transition_id: input.transitionId,
    phase: input.phase,
    outcome: input.phase === 'settled' ? 'materialized' : null,
    updated_at: new Date().toISOString(),
  });
  if (input.journal) {
    writeJson(journalPath, {
      surface_kind: 'opl_domain_artifact_cas_transaction_journal',
      version: 'opl-domain-artifact-cas-transaction-journal.v1',
      request_sha256: requestSha256,
      phase: 'switching',
      visibility_model: 'cooperating_opl_readers_must_treat_journal_as_sync_pending',
      operations: [],
    });
  } else {
    fs.rmSync(journalPath, { force: true });
  }
  return { epochPath, journalPath };
}

function fixtureProjection(workspaceRoot: string, workItemRoot: string): WorkItemProjectionV2 {
  return {
    surface_kind: 'opl_work_item_projection',
    schema_version: 'work-item-projection.v2',
    profile: 'full',
    generated_at: '2026-07-15T00:00:00.000Z',
    agent_catalog: [],
    agent_availability: [],
    project_catalog: [],
    summary: {
      agent_count: 1,
      project_count: 1,
      work_item_count: 1,
      visible_work_item_count: 1,
      archived_work_item_count: 0,
      total_work_item_count: 1,
      running_count: 1,
      user_attention_count: 0,
      system_attention_count: 0,
      telemetry_observed_count: 1,
      telemetry_missing_count: 0
    },
    items: [{
      item_id: 'mas:study-003',
      identity: {
        agent_id: 'mas',
        agent_display_name: 'Med Auto Science',
        domain_id: 'medautoscience',
        project_id: 'fixture-project',
        project_display_name: 'Fixture Project',
        project_scope_id: 'project:fixture-project',
        workspace_binding_id: 'binding-1',
        workspace_path: workspaceRoot,
        work_item_id: 'study-003',
        work_item_display_name: 'Study 003',
        work_item_kind: 'study',
        work_item_root: workItemRoot,
        work_item_scope_id: 'work-item:fixture-project:study-003',
        source_kind: 'domain_inventory'
      },
      lifecycle: {
        business_state: 'delivered_paused',
        domain_business_state: 'delivered_paused',
        control_state: null,
        primary_state: 'delivered_auto_paused',
        primary_state_label: 'Delivered and paused',
        primary_state_reason: 'latest_result_delivered',
        reason: 'latest_result_delivered',
        last_transition_at: '2026-07-15T00:00:00.000Z',
        raw_business_status: 'delivered_paused',
        current_stage_id: null,
        current_stage_display_name: null,
        current_stage_status: null,
        package_status: 'milestone_delivered',
        lifecycle_ref: path.join(workItemRoot, 'control/lifecycle.json'),
        source: 'domain_inventory_projection',
        control_ref: null,
        control_updated_at: null,
        observed_generation: 'sha256:fixture'
      },
      visibility: {
        state: 'visible',
        source: 'default',
        updated_at: null,
        control_ref: null,
        generation: 0
      },
      execution: {
        state: 'running',
        stage_id: 'review_and_quality_gate',
        stage_status: 'running',
        current_stage_id: 'review_and_quality_gate',
        current_stage_display_name: 'Review and quality gate',
        next_stage_id: 'finalize_and_publication_handoff',
        next_stage_display_name: 'Finalize and publication handoff',
        attempt_id: 'sat_fixture',
        attempt_ids: ['sat_fixture'],
        workflow_id: 'workflow-fixture',
        provider_kind: 'temporal',
        started_at: '2026-07-15T00:00:00.000Z',
        last_heartbeat_at: '2026-07-15T00:01:00.000Z',
        updated_at: '2026-07-15T00:01:00.000Z',
        running_proof_status: 'observed',
        diagnostic_reason: null,
        quality_budget: {
          state: 'available',
          scope_id: 'quality-cycle:fixture',
          max_attempts: 3,
          attempts_used: 1,
          attempts_remaining: 2,
          max_elapsed_ms: 21600000,
          elapsed_ms: 60000,
          max_tokens: 1000000,
          tokens_used: 42,
          token_observation_status: 'observed',
          stop_reason: null
        }
      },
      attention: {
        kind: 'none',
        reason: 'none',
        owner: null,
        responsible_component: null,
        issue: null,
        impact: null,
        repair_action: null,
        expected_outcome: null
      },
      telemetry: {
        state: 'observed',
        current_stage: {
          state: 'observed',
          input_tokens: 30,
          output_tokens: 12,
          total_tokens: 42,
          observed_at: '2026-07-15T00:01:00.000Z',
          missing_reason: null,
          source_refs: ['codex://fixture']
        },
        cumulative: {
          state: 'observed',
          input_tokens: 30,
          output_tokens: 12,
          total_tokens: 42,
          observed_at: '2026-07-15T00:01:00.000Z',
          missing_reason: null,
          source_refs: ['codex://fixture']
        },
        missing_reason: null
      },
      action: {
        kind: 'agent_action',
        title: 'Continue review',
        title_key: 'fixture.continue',
        summary: 'Continue the current review stage.',
        summary_key: 'fixture.continue.summary',
        message_args: {},
        owner: 'mas',
        owner_kind: 'agent',
        owner_display_name: 'Med Auto Science',
        action_ref: 'review_and_quality_gate',
        dry_run_required: false
      },
      stage_map: [{
        stage_id: 'review_and_quality_gate',
        display_name: 'Review and quality gate',
        display_names: { 'en-US': 'Review and quality gate' },
        state: 'current',
        owner: 'mas',
        owner_display_name: 'Med Auto Science',
        elapsed_seconds: 60,
        usage: null,
        next_action: 'finalize_and_publication_handoff'
      }],
      conditions: [],
      freshness: {
        state: 'current',
        inventory_observed_at: '2026-07-15T00:01:00.000Z',
        execution_observed_at: '2026-07-15T00:01:00.000Z',
        last_transition_time: '2026-07-15T00:00:00.000Z',
        observed_generation: 'sha256:fixture',
        reason: 'current'
      },
      source_refs: []
    }],
    diagnostics: { count: 0, items: [], detail_policy: 'included' },
    detail_policy: {
      all_work_item_summaries_included: true,
      attempt_ref_limit_per_item: 8,
      diagnostic_details: 'included',
      inventory_detail: 'included',
      full_detail_surface: 'opl app state --profile full --json'
    },
    authority_boundary: {
      projection_only: true,
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      can_authorize_quality_verdict: false,
      temporal_is_work_item_inventory: false
    }
  };
}

test('hosted work-item readback keeps runtime projection and domain truth authority separate', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-hosted-readback-'));
  const itemRoot = path.join(root, 'studies/study-003');
  const manifestPath = path.join(root, 'ops/medautoscience/hosted-readback-sources.json');
  try {
    writeJson(path.join(itemRoot, 'control/lifecycle.json'), {
      lifecycle_state: 'delivered_paused',
      submission_ready: false
    });
    writeJson(path.join(itemRoot, 'manuscript/delivery_manifest.json'), {
      can_submit: true
    });
    writeJson(manifestPath, {
      surface_kind: 'opl_hosted_work_item_readback_sources',
      schema_version: 1,
      domain_id: 'medautoscience',
      declaration_owner: 'MedAutoScience',
      sources: [
        {
          source_id: 'lifecycle',
          role: 'business_lifecycle_authority',
          claim_scope: 'business_lifecycle_and_submission_readiness',
          authority_scope: 'domain_owner',
          relative_path: 'control/lifecycle.json',
          required: true,
          summary_fields: { submission_clearance: '/submission_ready' },
          currentness_anchor_relative_path: null
        },
        {
          source_id: 'delivery',
          role: 'derived_delivery_projection',
          claim_scope: 'generated_delivery_package',
          authority_scope: 'derived_non_authority',
          relative_path: 'manuscript/delivery_manifest.json',
          required: false,
          summary_fields: { submission_clearance: '/can_submit' },
          currentness_anchor_relative_path: 'control/lifecycle.json'
        }
      ],
      consistency_checks: [{
        check_id: 'submission_clearance_claim',
        left: { source_id: 'lifecycle', field: 'submission_clearance' },
        right: { source_id: 'delivery', field: 'submission_clearance' }
      }],
      authority_boundary: {
        opl_consumption: 'read_only_exact_value_projection',
        app_state_is_domain_quality_authority: false,
        filesystem_mtime_is_semantic_currentness: false
      }
    });

    const output = buildHostedWorkItemReadback({
      workspaceRoot: root,
      workItemId: 'study-003',
      agentId: 'mas',
      sourceManifestPath: manifestPath,
      profile: 'full'
    }, { projection: fixtureProjection(root, itemRoot) });
    const readback = output.hosted_work_item_readback;
    assert.equal(readback.business.lifecycle.business_state, 'delivered_paused');
    assert.equal(readback.runtime.execution.attempt_id, 'sat_fixture');
    assert.equal(readback.runtime.telemetry.cumulative.total_tokens, 42);
    assert.equal(readback.domain_truth_sources.sources[0]?.summary.submission_clearance, false);
    assert.equal(readback.domain_truth_sources.sources[1]?.summary.submission_clearance, true);
    assert.equal(readback.domain_truth_sources.consistency_checks[0]?.status, 'different');
    assert.equal(readback.domain_truth_sources.consistency_checks[0]?.authority_precedence, 'lifecycle');
    assert.equal(readback.authority_boundary.app_state_is_domain_quality_authority, false);
    assert.equal(readback.authority_boundary.can_authorize_quality_publication_or_submission, false);

    const registry = parseJsonText(fs.readFileSync(
      path.join(process.cwd(), 'contracts/opl-framework/cli-command-registry.json'),
      'utf8'
    )) as Record<string, any>;
    const schema = registry.commands.workspace_work_item_readback.output_schema;
    const validation = validateJsonSchemaPayload({
      schemaId: 'opl.workspace.work-item.readback',
      schema,
      sourceRef: 'contracts/opl-framework/cli-command-registry.json#/commands/workspace_work_item_readback/output_schema'
    }, output);
    assert.equal(validation.ok, true, validation.ok ? undefined : JSON.stringify(validation.errors, null, 2));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('hosted work-item readback fails closed on CAS recovery journal and recovers after settlement', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-hosted-readback-cas-'));
  const itemRoot = path.join(root, 'studies/study-003');
  const stateRoot = path.join(root, 'opl-state');
  const previousStateDir = process.env.OPL_STATE_DIR;
  fs.mkdirSync(itemRoot, { recursive: true });
  process.env.OPL_STATE_DIR = stateRoot;
  try {
    const projection = fixtureProjection(root, itemRoot);
    writeHostedCasReadState({
      stateRoot,
      workspaceRoot: root,
      phase: 'in_progress',
      transitionId: 'hosted-readback-in-progress',
      journal: true,
    });
    assert.throws(
      () => buildHostedWorkItemReadback({
        workspaceRoot: root,
        workItemId: 'study-003',
        agentId: 'mas',
        profile: 'full',
      }, { projection }),
      (error: unknown) => error instanceof FrameworkContractError
        && error.details?.failure_code === 'hosted_work_item_sync_pending'
        && error.details?.sync_state === 'sync_pending'
        && error.details?.observation_reason === 'workspace_cas_epoch_in_progress',
    );

    writeHostedCasReadState({
      stateRoot,
      workspaceRoot: root,
      phase: 'settled',
      transitionId: 'hosted-readback-settled',
      journal: false,
    });
    const recovered = buildHostedWorkItemReadback({
      workspaceRoot: root,
      workItemId: 'study-003',
      agentId: 'mas',
      profile: 'full',
    }, { projection }).hosted_work_item_readback;
    assert.equal(recovered.business.lifecycle.business_state, 'delivered_paused');
    assert.equal(recovered.business.next_owner.owner, 'mas');
    assert.equal(recovered.runtime.execution.attempt_id, 'sat_fixture');
    assert.equal(recovered.runtime.execution.running_proof_status, 'observed');
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('hosted readback contract retires private control-plane compatibility authority', () => {
  const contract = parseJsonText(fs.readFileSync(
    path.join(process.cwd(), 'contracts/opl-framework/hosted-work-item-readback-contract.json'),
    'utf8'
  )) as Record<string, any>;
  assert.equal(contract.command, 'opl workspace work-item readback');
  assert.equal(contract.retirement_migration.private_dispatch_compatibility_authority_allowed, false);
  assert.equal(contract.authority_boundary.app_state_is_domain_quality_authority, false);
  assert.equal(contract.authority_boundary.can_authorize_quality_verdict, false);
});

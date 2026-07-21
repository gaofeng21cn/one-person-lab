import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJsonBytes } from '../../src/kernel/canonical-json.ts';
import { resolveStandardAgent } from '../../src/kernel/standard-agent-registry.ts';
import {
  inspectStandardAgentActionRunBinding,
  inspectStandardAgentActionRunCompletion,
  inspectStandardAgentActionRunPlan,
} from '../../src/modules/runway/standard-agent-action-run-state.ts';
import { runStandardAgentAction } from '../../src/modules/runway/standard-agent-action-runtime.ts';
import { applyDomainArtifactCasMaterialization } from
  '../../src/modules/runway/domain-artifact-cas-materialization.ts';
import { standardAgentLifecycleReactivationHandlerRunId } from
  '../../src/modules/runway/standard-agent-domain-lifecycle-admission.ts';
import type { StandardAgentHandlerSandboxReceipt } from
  '../../src/modules/runway/standard-agent-handler-sandbox.ts';

function temporaryRoot(prefix: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function digest(bytes: string | Buffer) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function writeJson(file: string, value: unknown) {
  const bytes = canonicalJsonBytes(value);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes);
  return { ref: pathToFileURL(fs.realpathSync.native(file)).href, sha256: digest(bytes), bytes };
}

function supportedSurfaces(internal = false) {
  return internal
    ? { cli: null, mcp: null, skill: null, product_entry: null, openai: null, ai_sdk: null }
    : { cli: {}, mcp: null, skill: null, product_entry: null, openai: null, ai_sdk: null };
}

function packageUseBinding() {
  return {
    surface_kind: 'opl_agent_package_use_binding.v1',
    use_boundary_id: 'package-use:lifecycle-fixture',
    use_receipt_ref: 'opl://agent-package/use/lifecycle-fixture',
    root_package: {
      package_id: 'mas',
      package_version: '0.2.15',
      owner_language_version: { scheme: 'pep440', value: '0.2.15' },
      package_lock_ref: 'opl://agent-package-lock/mas/0.2.15',
      manifest_sha256: '1'.repeat(64),
      content_digest: `sha256:${'2'.repeat(64)}`,
      source_artifact_ref: 'oci://opl/mas@sha256:fixture',
      artifact_digest: `sha256:${'3'.repeat(64)}`,
      source_kind: 'first_party_managed_cohort',
    },
    provider_packages: [],
    dependency_closure_digest: '4'.repeat(64),
    core_skill_tree_digest: null,
    skill_tree_digest: null,
  };
}

function writeLifecycleContracts(checkoutRoot: string) {
  const lifecycleContract = {
    capability_id: 'opl_domain_lifecycle_admission.v1',
    work_item_id_field: 'study_id',
    lifecycle_state_field: 'lifecycle_state',
    lifecycle_generation_field: 'lifecycle_generation',
    active_state: 'active',
    stopped_state: 'stopped',
    admission_payload_field: 'lifecycle_admission',
    reactivation_action_id: 'reactivate_study',
    reactivation_receipt_output_field: 'reactivation_receipt',
    materialization_authorization_output_field: 'mas_lifecycle_cas_mutation_authorization',
    required_wakeup_gate_id: 'explicit_user_wakeup',
    stopped_relaunch_gate_id: 'allow_stopped_relaunch',
    reactivation_projection_sources: [
      {
        projection_id: 'study_lifecycle_current',
        root: 'work_item',
        relative_path: 'control/lifecycle.json',
        required: true,
        media_type: 'application/json',
      },
      {
        projection_id: 'workspace_index',
        root: 'workspace',
        relative_path: 'workspace_index.json',
        required: true,
        media_type: 'application/json',
      },
    ],
    reactivation_request_input_field_map: {
      work_item_id: '/study_id',
      reactivation_request: '/reactivation_request',
      authority_context: '/authority_context',
      work_item_identity: '/study_identity',
      user_authority: '/user_authority',
      reviewer_revision_intake: '/reviewer_revision_intake',
      current_lifecycle: '/current_lifecycle',
      profile: '/profile',
      projection_inventory: '/projection_inventory',
    },
  };
  const stageAction = {
    action_id: 'launch_stage',
    title: 'Launch stage',
    summary: 'Launch one lifecycle-gated stage.',
    owner: 'mas',
    effect: 'mutating',
    execution_binding: { kind: 'stage_binding', stage_manifest_ref: 'agent/stages/manifest.json' },
    input_schema_ref: 'contracts/stage-input.schema.json',
    output_schema_ref: 'contracts/stage-output.schema.json',
    required_fields: ['workspace_root', 'study_id', 'value'],
    optional_fields: ['lifecycle_admission'],
    workspace_locator_fields: ['workspace_root'],
    human_gate_ids: [],
    stage_route: {
      entry_stage_ref: 'intake',
      required_stage_refs: ['intake'],
      optional_stage_refs: [],
      terminal_stage_refs: ['intake'],
      route_policy: 'ai_selected_progress_route',
    },
    supported_surfaces: supportedSurfaces(),
    authority_boundary: { lifecycle_admission_contract: lifecycleContract },
  };
  const handlerAction = {
    action_id: 'reactivate_study',
    title: 'Reactivate study',
    summary: 'Internal lifecycle authority handler.',
    owner: 'mas',
    effect: 'mutating',
    execution_binding: { kind: 'handler_ref', handler_ref: 'handler:fixture.reactivate' },
    input_schema_ref: 'contracts/reactivate-input.schema.json',
    output_schema_ref: 'contracts/reactivate-output.schema.json',
    required_fields: [
      'workspace_root', 'study_id', 'reactivation_request', 'authority_context', 'study_identity',
      'user_authority', 'reviewer_revision_intake', 'current_lifecycle', 'profile', 'projection_inventory',
    ],
    optional_fields: [],
    workspace_locator_fields: ['workspace_root'],
    human_gate_ids: [],
    supported_surfaces: supportedSurfaces(true),
    authority_boundary: {
      host_materialization_contract: {
        capability_id: 'opl_domain_artifact_cas_materialization.v1',
        request_output_field: 'opl_host_materialization_request',
        authorization_output_field: 'mas_lifecycle_cas_mutation_authorization',
      },
    },
  };
  fs.mkdirSync(path.join(checkoutRoot, 'contracts'), { recursive: true });
  fs.mkdirSync(path.join(checkoutRoot, 'agent', 'stages'), { recursive: true });
  fs.writeFileSync(path.join(checkoutRoot, 'agent', 'stages', 'manifest.json'), '{"stages":["intake"]}');
  fs.writeFileSync(path.join(checkoutRoot, 'contracts', 'action_catalog.json'), JSON.stringify({
    surface_kind: 'family_action_catalog',
    version: 'family-action-catalog.v2',
    catalog_id: 'lifecycle-fixture',
    target_domain_id: 'medautoscience',
    owner: 'mas',
    authority_boundary: {
      domain_truth_owner: 'mas',
      opl_role: 'projection_consumer_only',
      write_policy: 'no_domain_truth_writes',
      opl_can_write_domain_truth: false,
      provider_completion_is_domain_completion: false,
    },
    actions: [stageAction, handlerAction],
    notes: [],
  }));
  fs.writeFileSync(path.join(checkoutRoot, 'contracts', 'domain_handler_registry.json'), JSON.stringify({
    surface_kind: 'domain_handler_registry',
    version: 'domain-handler-registry.v1',
    handlers: [{
      handler_id: 'fixture.reactivate',
      binding: { kind: 'typescript_export', file: 'reactivate.ts', export: 'reactivate' },
    }],
  }));
  fs.writeFileSync(path.join(checkoutRoot, 'contracts', 'stage-input.schema.json'), JSON.stringify({
    type: 'object',
    required: ['workspace_root', 'study_id', 'value'],
    properties: {
      workspace_root: { type: 'string' },
      study_id: { type: 'string' },
      value: { type: 'integer' },
      lifecycle_admission: { type: 'object' },
    },
    additionalProperties: false,
  }));
  fs.writeFileSync(path.join(checkoutRoot, 'contracts', 'stage-output.schema.json'), '{"type":"object"}');
  fs.writeFileSync(path.join(checkoutRoot, 'contracts', 'reactivate-input.schema.json'), '{"type":"object"}');
  fs.writeFileSync(path.join(checkoutRoot, 'contracts', 'reactivate-output.schema.json'), '{"type":"object"}');
  fs.writeFileSync(path.join(checkoutRoot, 'contracts', 'domain_descriptor.json'), JSON.stringify({
    domain_id: 'medautoscience',
    standard_agent_interface: {
      version: 'opl_standard_agent_interface.v1',
      inventory_projection: {
        source_kind: 'workspace_relative_json',
        relative_path: 'workspace_index.json',
        items_pointer: '/studies',
        field_map: {
          work_item_id: 'study_id',
          work_item_root: 'study_root',
          business_status: 'status',
          current_stage_id: 'current_stage_id',
          current_stage_status: 'current_stage_status',
          package_status: 'package_status',
          lifecycle_ref: 'lifecycle_ref',
        },
      },
      stage_catalog: null,
      domain_detail_views: [],
      workspace_binding: {
        locator_surface_kind: 'mas_workspace_locator',
        default_profile_id: 'one_off',
        workspace_kind: 'medical_research_workspace',
        project_kind: 'study',
        project_collection_label: 'studies',
        default_workspace_id: 'fixture-workspace',
        default_project_id: 'study-001',
        required_locator_fields: ['workspace_root'],
        optional_locator_fields: [],
      },
      runtime: { runtime_domain_id: 'medautoscience', registration_ref: null },
      progress: { deliverable_delta_aliases: [], platform_delta_aliases: [] },
      routing: {
        explicit_aliases: ['mas'],
        workstream_ids: ['medical_research'],
        intent_signals: ['manuscript_revision'],
        ambiguity_policy: 'require_explicit_study',
      },
    },
  }));
}

function writeLifecycleWorkspace(workspaceRoot: string) {
  const studyRoot = path.join(workspaceRoot, 'studies', '001');
  const lifecycle = writeJson(path.join(studyRoot, 'control', 'lifecycle.json'), {
    study_id: 'study-001', lifecycle_state: 'paused', lifecycle_generation: 7,
  });
  writeJson(path.join(workspaceRoot, 'workspace_index.json'), {
    studies: [{
      study_id: 'study-001', study_root: 'studies/001', status: 'paused',
      current_stage_id: 'review', current_stage_status: 'paused', package_status: 'not_ready',
      lifecycle_ref: 'control/lifecycle.json',
    }],
  });
  const userAuthority = writeJson(path.join(workspaceRoot, 'control', 'user-authority.json'), {
    explicit_user_wakeup: true,
  });
  const revisionIntake = writeJson(path.join(studyRoot, 'control', 'reviewer-revision-intake.json'), {
    task_kind: 'reviewer_revision', status: 'accepted',
  });
  const profile = writeJson(path.join(workspaceRoot, 'control', 'profile.json'), {
    developer_supervisor_mode: 'on',
  });
  return { lifecycle, userAuthority, revisionIntake, profile };
}

function reactivationAdmission(refs: ReturnType<typeof writeLifecycleWorkspace>, lifecycleSha256 = refs.lifecycle.sha256) {
  return {
    surface_kind: 'opl_domain_lifecycle_admission',
    version: 'opl-domain-lifecycle-admission.v1',
    mode: 'reactivation_request',
    reactivation_request: {
      user_authority_ref: refs.userAuthority.ref,
      user_authority_sha256: refs.userAuthority.sha256,
      reviewer_revision_intake_ref: refs.revisionIntake.ref,
      reviewer_revision_intake_sha256: refs.revisionIntake.sha256,
      current_lifecycle_ref: refs.lifecycle.ref,
      current_lifecycle_sha256: lifecycleSha256,
      profile_ref: refs.profile.ref,
      profile_sha256: refs.profile.sha256,
      observed_lifecycle_state: 'paused',
      observed_lifecycle_generation: 7,
      explicit_user_wakeup: true,
      allow_stopped_relaunch: false,
      requested_at: '2026-07-21T00:00:00.000Z',
      reason_code: 'reviewer_revision_reactivation',
      reason_summary: 'Apply accepted reviewer revisions.',
    },
  };
}

function authorityHandler(workspaceRoot: string, onCall: () => void) {
  const canonicalWorkspaceRoot = fs.realpathSync.native(workspaceRoot);
  return (input: { request: unknown }): StandardAgentHandlerSandboxReceipt => {
    onCall();
    const request = input.request as Record<string, any>;
    const authority = request.authority_context;
    const reactivation = request.reactivation_request;
    const projectionTargets = request.projection_inventory.targets as Record<string, any>[];
    const nextGeneration = Number(reactivation.observed_lifecycle_generation) + 1;
    const replacements = projectionTargets.map((target) => {
      const replacement = target.projection_id === 'study_lifecycle_current'
        ? { ...target.record, lifecycle_state: 'active', lifecycle_generation: nextGeneration }
        : {
            ...target.record,
            studies: target.record.studies.map((study: Record<string, unknown>) => ({
              ...study, status: 'active', current_stage_status: 'ready',
            })),
          };
      const bytes = canonicalJsonBytes(replacement);
      return { target, bytes, sha256: digest(bytes) };
    });
    const operations = replacements.map(({ target, bytes, sha256 }) => ({
      target_relative_path: path.relative(canonicalWorkspaceRoot, fileURLToPath(target.ref)),
      precondition: { kind: 'existing_exact', sha256: target.sha256, byte_size: target.byte_size },
      replacement_bytes_base64: bytes.toString('base64'),
      replacement_sha256: sha256,
      replacement_byte_size: bytes.byteLength,
    }));
    const operationsSha256 = digest(canonicalJsonBytes(operations));
    const requestId = `reactivation:${authority.admission_scope_id}`;
    const authorizationRef = `opl://mas/lifecycle-authorization/${encodeURIComponent(requestId)}`;
    const authorityReceiptRef = `opl://mas/lifecycle-reactivation/${encodeURIComponent(requestId)}`;
    const gateIds = ['explicit_user_wakeup'];
    const lifecycleReplacement = replacements.find(({ target }) => (
      target.projection_id === 'study_lifecycle_current'
    ))!;
    const output = {
      reactivation_receipt: {
        receipt_ref: authorityReceiptRef,
        study_id: request.study_id,
        satisfied_gate_ids: gateIds,
        from_state: reactivation.observed_lifecycle_state,
        to_state: 'active',
        to_generation: nextGeneration,
        after_sha256: lifecycleReplacement.sha256,
        admission_scope_id: authority.admission_scope_id,
        original_admission_request_ref: authority.original_admission_request_ref,
        original_admission_request_sha256: authority.original_admission_request_sha256,
        requested_action_id: authority.requested_action_id,
        requested_run_id: authority.requested_run_id,
        original_invocation_sha256: authority.original_invocation_sha256,
        user_authority_ref: reactivation.user_authority_ref,
        user_authority_sha256: reactivation.user_authority_sha256,
        reviewer_revision_intake_ref: reactivation.reviewer_revision_intake_ref,
        reviewer_revision_intake_sha256: reactivation.reviewer_revision_intake_sha256,
        profile_ref: reactivation.profile_ref,
        profile_sha256: reactivation.profile_sha256,
      },
      opl_host_materialization_request: {
        surface_kind: 'opl_domain_artifact_cas_materialization_request',
        version: 'opl-domain-artifact-cas-materialization.v1',
        capability_id: 'opl_domain_artifact_cas_materialization.v1',
        request_id: requestId,
        domain_id: 'mas',
        authorization_ref: authorizationRef,
        operations_sha256: operationsSha256,
        operations,
      },
      mas_lifecycle_cas_mutation_authorization: {
        authorized: true,
        authorization_ref: authorizationRef,
        capability_id: 'opl_domain_artifact_cas_materialization.v1',
        request_id: requestId,
        domain_id: 'mas',
        operations_sha256: operationsSha256,
        authority_receipt_ref: authorityReceiptRef,
        satisfied_gate_ids: gateIds,
      },
    };
    return {
      runtime_kind: 'node_permission_model',
      sandbox_kind: 'macos_sandbox_exec',
      exit_code: 0,
      timed_out: false,
      stdout_bytes: canonicalJsonBytes(output),
      stderr: '',
      output,
    };
  };
}

function refusingAuthorityHandler(
  status: 'typed_blocker' | 'invalid_host_input',
  onCall: () => void,
) {
  return (input: { request: unknown }): StandardAgentHandlerSandboxReceipt => {
    onCall();
    const request = input.request as Record<string, any>;
    const reactivation = request.reactivation_request;
    const typedBlocker = status === 'typed_blocker' ? {
      blocker_kind: 'mas_study_lifecycle_reactivation_typed_blocker',
      gate_kind: 'source_currentness',
      reason_code: 'stale_revision_intake',
      current_lifecycle_ref: reactivation.current_lifecycle_ref,
      current_lifecycle_sha256: reactivation.current_lifecycle_sha256,
      reviewer_revision_intake_ref: reactivation.reviewer_revision_intake_ref,
      reviewer_revision_intake_sha256: reactivation.reviewer_revision_intake_sha256,
      next_owner: 'MedAutoScience',
      resume_condition: 'Provide a current reviewer revision intake.',
      authorizes_lifecycle_transition: false,
      authorizes_attempt_admission: false,
      requires_host_exact_byte_persistence: true,
    } : null;
    const error = status === 'invalid_host_input' ? {
      error_kind: 'mas_study_lifecycle_reactivation_invalid_host_input',
      code: 'invalid_host_input',
      detail: 'The authority input is not admissible.',
      retryable: false,
    } : null;
    const output = {
      surface_kind: 'mas_study_lifecycle_reactivation_result',
      schema_version: 'mas-study-lifecycle-reactivation-result.v1',
      status,
      study_identity: status === 'typed_blocker' ? request.study_identity : null,
      reactivation_receipt: null,
      mas_lifecycle_cas_mutation_authorization: null,
      opl_host_materialization_request: null,
      typed_blocker: typedBlocker,
      error,
      authority_boundary: { owner: 'MedAutoScience', opl_role: 'transport_only' },
      decision_id: `decision-${status}`,
      decision_fingerprint: digest(status),
    };
    return {
      runtime_kind: 'node_permission_model',
      sandbox_kind: 'macos_sandbox_exec',
      exit_code: 0,
      timed_out: false,
      stdout_bytes: canonicalJsonBytes(output),
      stderr: '',
      output,
    };
  };
}

test('lifecycle admission preserves non-materializing MAS authority failures without reserving a Stage', async () => {
  for (const status of ['typed_blocker', 'invalid_host_input'] as const) {
    const fixtureRoot = temporaryRoot(`opl-lifecycle-${status}-`);
    const checkoutRoot = path.join(fixtureRoot, 'checkout');
    const workspaceRoot = path.join(fixtureRoot, 'workspace');
    const stateRoot = path.join(fixtureRoot, 'state');
    const previousStateRoot = process.env.OPL_STATE_DIR;
    let handlerCalls = 0;
    let attemptCalls = 0;
    try {
      fs.mkdirSync(checkoutRoot, { recursive: true });
      fs.mkdirSync(workspaceRoot, { recursive: true });
      process.env.OPL_STATE_DIR = stateRoot;
      writeLifecycleContracts(checkoutRoot);
      const refs = writeLifecycleWorkspace(workspaceRoot);
      const packageBinding = packageUseBinding();
      const runId = `authority-${status}`;
      const admission = reactivationAdmission(refs);
      const childRunId = standardAgentLifecycleReactivationHandlerRunId({
        domainId: 'mas', actionId: 'launch_stage', runId, payload: admission,
      });

      await assert.rejects(runStandardAgentAction({
        domainId: 'mas', actionId: 'launch_stage', workspaceRoot,
        payload: { study_id: 'study-001', value: 1, lifecycle_admission: admission }, runId,
      }, {
        resolveManagedCheckout: async () => ({
          agent: resolveStandardAgent('mas')!,
          package_id: 'mas',
          workspace_root: fs.realpathSync.native(workspaceRoot),
          checkout_root: fs.realpathSync.native(checkoutRoot),
          package_status: {
            installed_package_count: 1,
            launch_allowed: true,
            runtime_source_readiness: { operational_ready: true, checkout_path: checkoutRoot },
          },
          package_use_binding: packageBinding,
          use_boundary_id: packageBinding.use_boundary_id,
        }) as never,
        compileStageManifest: (() => ({})) as never,
        recordLedger: ((ledger: Record<string, unknown>) => ({
          ledger_entry: { run_id: ledger.runId, status: ledger.status },
          recorded_event: { event_type: 'standard_agent_action_run_recorded' },
        })) as never,
        runHandler: refusingAuthorityHandler(status, () => { handlerCalls += 1; }) as never,
        runStageRuntime: async () => {
          attemptCalls += 1;
          return {};
        },
      }), (caught: any) => {
        assert.equal(caught.details?.failure_code, status === 'typed_blocker'
          ? 'domain_lifecycle_reactivation_typed_blocker'
          : 'domain_lifecycle_reactivation_invalid_host_input');
        assert.equal(caught.details?.domain_authority_status, status);
        assert.match(caught.details?.domain_authority_result_ref, /^file:/u);
        if (status === 'typed_blocker') {
          assert.equal(caught.details?.domain_authority_blocker?.reason_code, 'stale_revision_intake');
        } else {
          assert.equal(caught.details?.domain_authority_error?.code, 'invalid_host_input');
        }
        return true;
      });
      assert.equal(handlerCalls, 1);
      assert.equal(attemptCalls, 0);
      assert.equal(inspectStandardAgentActionRunBinding({ workspaceRoot, runId }), null);
      assert.equal(inspectStandardAgentActionRunPlan({ workspaceRoot, runId }), null);
      assert.equal(inspectStandardAgentActionRunCompletion({ workspaceRoot, runId: childRunId })?.status,
        'completed');
      assert.equal(JSON.parse(fs.readFileSync(fileURLToPath(refs.lifecycle.ref), 'utf8')).lifecycle_state,
        'paused');
      assert.equal(fs.existsSync(path.join(stateRoot, 'runway', 'domain-artifact-cas')), false);
    } finally {
      if (previousStateRoot === undefined) delete process.env.OPL_STATE_DIR;
      else process.env.OPL_STATE_DIR = previousStateRoot;
      fs.rmSync(fixtureRoot, { recursive: true, force: true });
    }
  }
});

test('lifecycle admission blocks inactive Stage reservation, materializes reactivation, and replays frozen receipt', async () => {
  const fixtureRoot = temporaryRoot('opl-lifecycle-admission-');
  const checkoutRoot = path.join(fixtureRoot, 'checkout');
  const workspaceRoot = path.join(fixtureRoot, 'workspace');
  const stateRoot = path.join(fixtureRoot, 'state');
  const previousStateRoot = process.env.OPL_STATE_DIR;
  let handlerCalls = 0;
  let attemptCalls = 0;
  let crashBeforeReceipt = true;
  try {
    fs.mkdirSync(checkoutRoot, { recursive: true });
    fs.mkdirSync(workspaceRoot, { recursive: true });
    process.env.OPL_STATE_DIR = stateRoot;
    writeLifecycleContracts(checkoutRoot);
    const refs = writeLifecycleWorkspace(workspaceRoot);
    const packageBinding = packageUseBinding();
    const dependencies = {
      resolveManagedCheckout: async () => ({
        agent: resolveStandardAgent('mas')!,
        package_id: 'mas',
        workspace_root: fs.realpathSync.native(workspaceRoot),
        checkout_root: fs.realpathSync.native(checkoutRoot),
        package_status: {
          installed_package_count: 1,
          launch_allowed: true,
          runtime_source_readiness: { operational_ready: true, checkout_path: checkoutRoot },
        },
        package_use_binding: packageBinding,
        use_boundary_id: packageBinding.use_boundary_id,
      }) as never,
      compileStageManifest: (() => ({})) as never,
      recordLedger: ((input: Record<string, unknown>) => ({
        ledger_entry: { run_id: input.runId, status: input.status },
        recorded_event: { event_type: 'standard_agent_action_run_recorded' },
      })) as never,
      runHandler: authorityHandler(workspaceRoot, () => { handlerCalls += 1; }) as never,
      applyDomainArtifactCas: ((input: Parameters<typeof applyDomainArtifactCasMaterialization>[0]) => {
        if (crashBeforeReceipt) {
          crashBeforeReceipt = false;
          return applyDomainArtifactCasMaterialization(input, {
            beforePersistReceipt: () => { throw new Error('simulated host receipt persistence crash'); },
          });
        }
        return applyDomainArtifactCasMaterialization(input);
      }) as never,
      runStageRuntime: async (args: string[]) => {
        if (args[0] === 'attempt') {
          attemptCalls += 1;
          return {
            family_runtime_stage_run: {
              stage_run_input: { workflow_id: 'wf-lifecycle-stage' },
              blocked_reason: null,
              temporal_start: { start_status: 'started' },
            },
          };
        }
        return { family_runtime_stage_run_query: { status: 'running' } };
      },
    };

    await assert.rejects(runStandardAgentAction({
      domainId: 'mas', actionId: 'launch_stage', workspaceRoot,
      payload: { study_id: 'study-001', value: 1 }, runId: 'inactive-stage',
    }, dependencies), /lifecycle is inactive/i);
    assert.equal(handlerCalls, 0);
    assert.equal(attemptCalls, 0);
    assert.equal(inspectStandardAgentActionRunBinding({ workspaceRoot, runId: 'inactive-stage' }), null);
    assert.equal(inspectStandardAgentActionRunPlan({ workspaceRoot, runId: 'inactive-stage' }), null);

    await assert.rejects(runStandardAgentAction({
      domainId: 'mas', actionId: 'launch_stage', workspaceRoot,
      payload: {
        study_id: 'study-001', value: 1,
        lifecycle_admission: reactivationAdmission(refs, 'f'.repeat(64)),
      },
      runId: 'stale-reactivation',
    }, dependencies), /current canonical lifecycle bytes|bytes do not match/i);
    assert.equal(handlerCalls, 0);
    assert.equal(attemptCalls, 0);
    assert.equal(inspectStandardAgentActionRunBinding({ workspaceRoot, runId: 'stale-reactivation' }), null);

    const originalPayload = {
      study_id: 'study-001', value: 1, lifecycle_admission: reactivationAdmission(refs),
    };
    const childRunId = standardAgentLifecycleReactivationHandlerRunId({
      domainId: 'mas', actionId: 'launch_stage', runId: 'reactivated-stage',
      payload: originalPayload.lifecycle_admission,
    });
    await assert.rejects(runStandardAgentAction({
      domainId: 'mas', actionId: 'launch_stage', workspaceRoot,
      payload: originalPayload, runId: 'reactivated-stage',
    }, dependencies), (error: any) => {
      assert.equal(error.details?.failure_disposition, 'unknown_success');
      assert.equal(error.details?.same_run_retry_required, true);
      return true;
    });
    assert.equal(handlerCalls, 1);
    assert.equal(attemptCalls, 0);
    assert.equal(inspectStandardAgentActionRunBinding({ workspaceRoot, runId: 'reactivated-stage' }), null);
    assert.equal(inspectStandardAgentActionRunCompletion({ workspaceRoot, runId: childRunId }), null);
    assert.equal(fs.readdirSync(path.join(stateRoot, 'runway', 'domain-artifact-cas', 'transactions')).length, 1);

    const launched = await runStandardAgentAction({
      domainId: 'mas', actionId: 'launch_stage', workspaceRoot,
      payload: originalPayload, runId: 'reactivated-stage',
    }, dependencies);
    const replayed = await runStandardAgentAction({
      domainId: 'mas', actionId: 'launch_stage', workspaceRoot,
      payload: originalPayload, runId: 'reactivated-stage',
    }, dependencies);

    assert.equal(launched.standard_agent_action_run.execution_kind, 'stage_binding');
    assert.equal(replayed.standard_agent_action_run.execution_kind, 'stage_binding');
    if (
      launched.standard_agent_action_run.execution_kind !== 'stage_binding'
      || replayed.standard_agent_action_run.execution_kind !== 'stage_binding'
    ) assert.fail('expected lifecycle-gated Stage action results');
    assert.equal(launched.standard_agent_action_run.domain_lifecycle_admission.status,
      'admitted_by_current_reactivation_receipt');
    assert.equal(replayed.standard_agent_action_run.domain_lifecycle_admission.status,
      'admitted_by_current_reactivation_receipt');
    assert.equal(handlerCalls, 1);
    assert.equal(attemptCalls, 1);
    assert.equal(fs.readdirSync(path.join(stateRoot, 'runway', 'domain-artifact-cas', 'transactions')).length, 0);
    assert.equal(JSON.parse(fs.readFileSync(fileURLToPath(refs.lifecycle.ref), 'utf8')).lifecycle_state, 'active');
    assert.equal(JSON.parse(fs.readFileSync(path.join(workspaceRoot, 'workspace_index.json'), 'utf8')).studies[0].status,
      'active');
    const plan = inspectStandardAgentActionRunPlan({ workspaceRoot, runId: 'reactivated-stage' });
    assert.equal((plan?.effective_payload?.lifecycle_admission as Record<string, unknown>).mode,
      'materialized_receipt');
    assert.equal(JSON.stringify(plan?.effective_payload).includes('reactivation_request'), false);
  } finally {
    if (previousStateRoot === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateRoot;
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

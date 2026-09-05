import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { canonicalJsonBytes } from '../../../src/kernel/canonical-json.ts';
import { FrameworkContractError } from '../../../src/kernel/contract-validation.ts';
import { resolveStandardAgent } from '../../../src/kernel/standard-agent-registry.ts';
import {
  inspectStandardAgentActionRunBinding,
  inspectStandardAgentActionRunCompletion,
  inspectStandardAgentActionRunPlan,
} from '../../../src/adapters/execution/standard-agent-action-run-state.ts';
import {
  runStandardAgentAction,
  runStandardAgentQualificationProvisioning,
} from '../../../src/adapters/execution/standard-agent-action-runtime.ts';
import { runStandardAgentHandlerSandbox } from
  '../../../src/adapters/execution/standard-agent-handler-sandbox.ts';
import { runFamilyRuntime } from '../../../src/adapters/execution/family-runtime.ts';
import {
  applyDomainArtifactCasMaterialization,
  observeDomainArtifactCasMaterialization,
} from
  '../../../src/adapters/execution/domain-artifact-cas-materialization.ts';
import {
  preflightStandardAgentDomainLifecycleAdmission,
  prepareStandardAgentLifecycleReactivation,
  standardAgentLifecycleInitializationHandlerRunId,
  standardAgentLifecycleAdmissionContract,
  standardAgentLifecycleReactivationHandlerRunId,
} from
  '../../../src/adapters/execution/standard-agent-domain-lifecycle-admission.ts';
import { preflightFamilyRuntimeDomainLifecycleAdmission } from
  '../../../src/adapters/execution/family-runtime-domain-lifecycle-admission.ts';
import { ensureProviderHostedStageAttempt } from
  '../../../src/adapters/execution/family-runtime-provider-hosted-attempts.ts';
import { launchRegisteredStageRun } from
  '../../../src/adapters/execution/family-runtime-stage-run-launch.ts';
import { createStageRunLaunchTable } from
  '../../../src/adapters/execution/family-runtime-stage-run-launch-registry.ts';
import { createFamilyRuntimeQueueTables, type FamilyRuntimeTaskRow } from
  '../../../src/adapters/execution/family-runtime-store.ts';
import { buildPackBoundTemporalStageRunInput } from
  '../../../src/adapters/execution/family-runtime-pack-bound-stage-run.ts';
import { materializeStageRunRoute } from
  '../../../src/adapters/execution/family-runtime-stage-run-route-launch.ts';
import {
  buildRouteStageRunInvocation,
  stageAttemptExecutionContentBindingSha256,
  stageRunSpecSha256,
} from '../../../src/adapters/execution/family-runtime-stage-run-identity.ts';
import { normalizeStageQualityCyclePolicy } from '../../../src/authority/stages/stage-quality-cycle.ts';
import type { StandardAgentStageQualityRuntimeBinding } from '../../../src/authority/packages/index.ts';
import type { StandardAgentHandlerSandboxReceipt } from
  '../../../src/adapters/execution/standard-agent-handler-sandbox.ts';
import { createCordisBaseHeadlessComposition } from '../../../src/host/composition-profiles.ts';

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

function writeLifecycleCasReadState(input: {
  stateRoot: string;
  workspaceRoot: string;
  phase: 'in_progress' | 'settled';
  transitionId: string;
  journal: boolean;
}) {
  const workspaceKey = digest(fs.realpathSync.native(input.workspaceRoot));
  const requestSha256 = 'c'.repeat(64);
  const casRoot = path.join(input.stateRoot, 'runway', 'domain-artifact-cas');
  const journalPath = path.join(
    casRoot,
    'transactions',
    `${workspaceKey}-${requestSha256}.json`,
  );
  writeJson(path.join(casRoot, 'read-epochs', `${workspaceKey}.json`), {
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
}

function supportedSurfaces(internal = false) {
  return internal
    ? { cli: null, mcp: null, skill: null, product_entry: null, openai: null, ai_sdk: null }
    : { cli: {}, mcp: null, skill: null, product_entry: null, openai: null, ai_sdk: null };
}

function exactByteBindingFields() {
  return {
    user_authority: {
      bytes_base64: 'authority_bytes_base64', byte_size: 'authority_byte_size',
      sha256: 'authority_sha256', record: 'record',
    },
    reviewer_revision_intake: {
      bytes_base64: 'intake_bytes_base64', byte_size: 'intake_byte_size',
      sha256: 'intake_sha256', record: 'record',
    },
    current_lifecycle: {
      bytes_base64: 'lifecycle_bytes_base64', byte_size: 'lifecycle_byte_size',
      sha256: 'lifecycle_sha256', record: 'record',
    },
    projection_target: {
      bytes_base64: 'bytes_base64', byte_size: 'byte_size', sha256: 'sha256', record: 'record',
    },
  };
}

function packageUseBinding() {
  return {
    surface_kind: 'opl_agent_package_use_binding.v1',
    use_boundary_id: 'package-use:lifecycle-fixture',
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

function nativeCarrierReadiness(checkoutRoot: string) {
  return {
    configured_carrier: {
      status: 'installed',
      executor: { status: 'callable' },
      plugin_source_path: checkoutRoot,
    },
  };
}

function writeNativeCarrierDescriptor(checkoutRoot: string) {
  fs.writeFileSync(path.join(checkoutRoot, 'opl-package.json'), JSON.stringify({
    surface_kind: 'opl_agent_package_manifest.v1',
    version: '0.2.25',
    package_id: 'mas',
    agent_id: 'mas',
    codex_surface: {
      plugin_id: 'med-autoscience',
      configured_codex_plugin_carrier: {
        kind: 'codex_plugin_manager',
        plugin_selector: 'med-autoscience@med-autoscience',
        marketplace_source: 'gaofeng21cn/med-autoscience',
        publication_ref: 'ghcr.io/gaofeng21cn/one-person-lab-packages/mas:latest-stable',
        executor_route: 'codex_cli',
      },
    },
  }));
}

function nativeManagedCheckout(checkoutRoot: string, workspaceRoot: string) {
  const sourceRoot = fs.realpathSync.native(checkoutRoot);
  const installedVersion = `0.2.25-${'b'.repeat(64)}`;
  const pluginId = 'med-autoscience@med-autoscience';
  const marketplaceSource = 'gaofeng21cn/med-autoscience';
  const manifestSha256 = `sha256:${digest(fs.readFileSync(path.join(sourceRoot, 'opl-package.json')))}`;
  const status = {
    installed_package_count: 1,
    launch_allowed: true,
    launch_blocked_reason: null,
    runtime_source_readiness: { operational_ready: true, checkout_path: sourceRoot },
    configured_carrier: {
      surface_kind: 'opl_configured_codex_plugin_carrier_readback.v1',
      package_id: 'mas',
      carrier: {
        kind: 'codex_plugin_manager',
        plugin_id: pluginId,
        marketplace_source: marketplaceSource,
        observed_sources: [{
          plugin_id: pluginId,
          marketplace_source: marketplaceSource,
          installed_version: installedVersion,
          enabled: true,
          plugin_source_path: sourceRoot,
          source_tree_sha256: `sha256:${'c'.repeat(64)}`,
        }],
        precedence: 'exact_single_source',
      },
      executor: { route: 'codex_cli', required_skill_ids: ['med-autoscience'], status: 'callable' },
      publication_ref: 'ghcr.io/gaofeng21cn/one-person-lab-packages/mas:latest-stable',
      status: 'installed',
      installed_version: installedVersion,
      enabled: true,
      plugin_source_path: sourceRoot,
      operation: 'list',
      native_command: ['plugin', 'list', '--json'],
      native_action_dispatched: true,
      reason: null,
    },
    installed_carrier_readback: {
      kind: 'codex_plugin_manager',
      identity: pluginId,
      source_ref: sourceRoot,
      version: installedVersion,
      enabled: true,
      lifecycle_authority: 'carrier_owned',
    },
    installed_readiness: {
      installed: true,
      physical_status: 'available',
      callability: 'callable',
    },
  };
  return {
    agent: resolveStandardAgent('mas')!,
    package_id: 'mas',
    workspace_root: fs.realpathSync.native(workspaceRoot),
    checkout_root: sourceRoot,
    package_status: status,
    package_use_binding: null,
    use_boundary_id: null,
    runtime_source_kind: 'installed_native_carrier',
    native_runtime: {
      package_version: '0.2.25',
      carrier_installed_version: installedVersion,
      manifest_sha256: manifestSha256,
      plugin_selector: pluginId,
      marketplace_source: marketplaceSource,
      plugin_source_path: sourceRoot,
      source_tree_sha256: `sha256:${'c'.repeat(64)}`,
    },
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
    initialization_action_id: 'initialize_study',
    initialization_receipt_output_field: 'initialization_receipt',
    initialization_materialization_authorization_output_field: 'mas_study_initialization_cas_mutation_authorization',
    initialization_request_input_field_map: {
      authority_context: '/authority_context',
      work_item_identity: '/work_item_identity',
      current_inventory: '/current_inventory',
    },
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
    exact_byte_binding_fields: exactByteBindingFields(),
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
      optional_stage_refs: ['draft'],
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
        materialization_scope_sha256_field: 'materialization_scope_sha256',
        absent_relative_path_preconditions_field: 'absent_relative_path_preconditions',
      },
    },
  };
  const initializationAction = {
    action_id: 'initialize_study',
    title: 'Initialize study',
    summary: 'Internal study initialization authority handler.',
    owner: 'mas',
    effect: 'read_only',
    execution_binding: { kind: 'handler_ref', handler_ref: 'handler:fixture.initialize' },
    execution_scope: { kind: 'work_item', alias_fields: ['work_item_identity.work_item_id'] },
    input_schema_ref: 'contracts/initialize-input.schema.json',
    output_schema_ref: 'contracts/initialize-output.schema.json',
    required_fields: ['authority_context', 'work_item_identity', 'current_inventory'],
    optional_fields: [],
    workspace_locator_fields: [],
    human_gate_ids: [],
    supported_surfaces: supportedSurfaces(true),
    authority_boundary: {
      host_materialization_contract: {
        capability_id: 'opl_domain_artifact_cas_materialization.v1',
        request_output_field: 'opl_host_materialization_request',
        authorization_output_field: 'mas_study_initialization_cas_mutation_authorization',
        receipt_output_field: 'initialization_receipt',
        receipt_content_binding_output_field: 'initialization_receipt_content_binding',
        materialization_scope_sha256_field: 'materialization_scope_sha256',
        absent_relative_path_preconditions_field: 'absent_relative_path_preconditions',
      },
    },
  };
  const provisioningAction = {
    action_id: 'qualification_work_item_provisioning_authority_evaluate',
    title: 'Qualification provisioning authority',
    summary: 'Authorize exact qualification-only work-item bytes.',
    owner: 'MedAutoScience',
    effect: 'read_only',
    execution_binding: {
      kind: 'handler_ref',
      handler_ref: 'handler:mas.qualification-work-item-provisioning-authority-evaluate',
    },
    execution_scope: { kind: 'none' },
    input_schema_ref: 'contracts/qualification-provisioning-input.schema.json',
    output_schema_ref: 'contracts/qualification-provisioning-output.schema.json',
    required_fields: [
      'surface_kind', 'schema_version', 'authority_context',
      'qualification_authority', 'current_workspace_index',
    ],
    optional_fields: [],
    workspace_locator_fields: [],
    human_gate_ids: [],
    supported_surfaces: supportedSurfaces(true),
    authority_boundary: {
      qualification_only: true,
      public_action: false,
      opl_can_derive_or_choose_study_id: false,
      opl_can_write_domain_truth_without_exact_mas_authorization: false,
      opl_can_sign_owner_receipt: false,
      authorizes_stage_body: false,
      authorizes_business_action: false,
      authorizes_publication: false,
      authorizes_submission: false,
      host_materialization_contract: {
        capability_id: 'opl_domain_artifact_cas_materialization.v1',
        request_output_field: 'opl_host_materialization_request',
        authorization_output_field: 'mas_qualification_work_item_cas_mutation_authorization',
        receipt_output_field: 'provisioning_receipt',
        receipt_content_binding_output_field: 'provisioning_receipt_content_binding',
        materialization_scope_sha256_field: 'materialization_scope_sha256',
        absent_relative_path_preconditions_field: 'absent_relative_path_preconditions',
      },
    },
  };
  fs.mkdirSync(path.join(checkoutRoot, 'contracts'), { recursive: true });
  fs.mkdirSync(path.join(checkoutRoot, 'agent', 'stages'), { recursive: true });
  fs.writeFileSync(path.join(checkoutRoot, 'agent', 'stages', 'manifest.json'), '{"stages":["intake","draft"]}');
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
    actions: [stageAction, handlerAction, initializationAction, provisioningAction],
    notes: [],
  }));
  fs.writeFileSync(path.join(checkoutRoot, 'contracts', 'domain_handler_registry.json'), JSON.stringify({
    surface_kind: 'domain_handler_registry',
    version: 'domain-handler-registry.v1',
    handlers: [
      {
        handler_id: 'fixture.reactivate',
        binding: { kind: 'typescript_export', file: 'reactivate.ts', export: 'reactivate' },
      },
      {
        handler_id: 'fixture.initialize',
        binding: { kind: 'typescript_export', file: 'initialize.ts', export: 'initialize' },
      },
      {
        handler_id: 'mas.qualification-work-item-provisioning-authority-evaluate',
        binding: {
          kind: 'python_callable',
          module: 'med_autoscience.authority_handlers.qualification_work_item_provisioning',
          callable: 'evaluate_qualification_work_item_provisioning_authority',
        },
      },
    ],
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
  fs.writeFileSync(path.join(checkoutRoot, 'contracts', 'initialize-input.schema.json'), JSON.stringify({
    type: 'object',
    required: initializationAction.required_fields,
    properties: Object.fromEntries(initializationAction.required_fields.map((field) => [field, {}])),
    additionalProperties: false,
  }));
  fs.writeFileSync(path.join(checkoutRoot, 'contracts', 'initialize-output.schema.json'), '{"type":"object"}');
  fs.writeFileSync(
    path.join(checkoutRoot, 'contracts', 'qualification-provisioning-input.schema.json'),
    JSON.stringify({
      type: 'object',
      required: provisioningAction.required_fields,
      properties: Object.fromEntries(provisioningAction.required_fields.map((field) => [field, {}])),
      additionalProperties: false,
    }),
  );
  fs.writeFileSync(
    path.join(checkoutRoot, 'contracts', 'qualification-provisioning-output.schema.json'),
    '{"type":"object"}',
  );
  fs.writeFileSync(path.join(checkoutRoot, 'contracts', 'domain_descriptor.json'), JSON.stringify({
    domain_id: 'medautoscience',
    standard_agent_interface: {
      version: 'opl_standard_agent_interface.v1',
      inventory_projection: {
        source_kind: 'workspace_relative_json',
        relative_path: 'workspace_index.json',
        items_pointer: '/studies',
        work_item_root_template: 'studies/{study_id}',
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

function writeIdentityOnlyLifecycleWorkspace(workspaceRoot: string) {
  const studyRoot = path.join(workspaceRoot, 'studies', 'study-001');
  fs.mkdirSync(studyRoot, { recursive: true });
  const inventory = writeJson(path.join(workspaceRoot, 'workspace_index.json'), {
    studies: [{ study_id: 'study-001', study_root: 'studies/study-001' }],
  });
  return { studyRoot, inventory };
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

function prepareCanonicalLifecycleAuthorityPayload() {
  const fixtureRoot = temporaryRoot('opl-lifecycle-authority-shape-');
  const checkoutRoot = path.join(fixtureRoot, 'checkout');
  const workspaceRoot = path.join(fixtureRoot, 'workspace');
  fs.mkdirSync(checkoutRoot, { recursive: true });
  fs.mkdirSync(workspaceRoot, { recursive: true });
  writeLifecycleContracts(checkoutRoot);
  const refs = writeLifecycleWorkspace(workspaceRoot);
  const catalog = JSON.parse(fs.readFileSync(
    path.join(checkoutRoot, 'contracts', 'action_catalog.json'),
    'utf8',
  ));
  const action = {
    ...catalog.actions[0],
    action_id: 'review_and_quality_gate',
  };
  const prepared = prepareStandardAgentLifecycleReactivation({
    action,
    payload: {
      study_id: 'study-001',
      lifecycle_admission: reactivationAdmission(refs),
    },
    checkoutRoot,
    workspaceRoot,
    domainId: 'mas',
    runId: 'canonical-authority-shape',
    originalInvocationSha256: 'a'.repeat(64),
  });
  assert.ok(prepared);
  return { fixtureRoot, handlerPayload: prepared.handlerPayload, refs };
}

function loadCanonicalMasAuthorityRequest(masRepo: string) {
  const python = [
    process.env.OPL_REAL_MAS_PYTHON,
    path.join(masRepo, '.venv', 'bin', 'python'),
    path.join(masRepo, '.venv', 'bin', 'python3'),
    '/opt/homebrew/bin/python3',
    '/usr/bin/python3',
  ].find((candidate): candidate is string => Boolean(candidate && fs.existsSync(candidate)));
  assert.ok(python, 'A Python runtime is required for the real MAS ABI smoke.');
  const script = String.raw`
import importlib.util
import json
import os
import sys
import types

repo = os.path.realpath(sys.argv[1])
framework_python_root = os.path.realpath(sys.argv[2])
sys.path.insert(0, os.path.join(repo, "src"))
sys.path.insert(0, framework_python_root)
pytest = types.ModuleType("pytest")
pytest.mark = types.SimpleNamespace(parametrize=lambda *args, **kwargs: lambda function: function)
sys.modules["pytest"] = pytest
jsonschema = types.ModuleType("jsonschema")
jsonschema.Draft202012Validator = object
jsonschema.ValidationError = Exception
sys.modules["jsonschema"] = jsonschema
test_file = os.path.join(repo, "tests", "test_study_lifecycle_reactivation_authority.py")
spec = importlib.util.spec_from_file_location("mas_lifecycle_authority_fixture", test_file)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
sys.stdout.write(json.dumps(module._request(), sort_keys=True, separators=(",", ":")))
`;
  const loaded = spawnSync(python, [
    '-I', '-B', '-c', script, masRepo, path.join(process.cwd(), 'python'),
  ], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH ?? '/usr/bin:/bin',
      HOME: process.env.HOME ?? '/',
      LANG: process.env.LANG ?? 'C.UTF-8',
      LC_ALL: process.env.LC_ALL ?? process.env.LANG ?? 'C.UTF-8',
      PYTHONDONTWRITEBYTECODE: '1',
    },
  });
  assert.equal(loaded.status, 0, loaded.stderr);
  return JSON.parse(loaded.stdout) as Record<string, unknown>;
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
    const absentRelativePathPreconditions = request.projection_inventory
      .absent_optional_projection_ids
      .map((projectionId: string) => {
        const source = request.projection_inventory.targets.find(
          (target: Record<string, unknown>) => target.projection_id === projectionId,
        );
        return source?.relative_path;
      })
      .filter((relativePath: unknown): relativePath is string => typeof relativePath === 'string');
    const materializationScopeSha256 = digest(canonicalJsonBytes({
      operations,
      absent_relative_path_preconditions: absentRelativePathPreconditions,
    }));
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
        domain_id: 'medautoscience',
        authorization_ref: authorizationRef,
        operations_sha256: operationsSha256,
        materialization_scope_sha256: materializationScopeSha256,
        absent_relative_path_preconditions: absentRelativePathPreconditions,
        operations,
      },
      mas_lifecycle_cas_mutation_authorization: {
        authorized: true,
        authorization_ref: authorizationRef,
        capability_id: 'opl_domain_artifact_cas_materialization.v1',
        request_id: requestId,
        domain_id: 'medautoscience',
        operations_sha256: operationsSha256,
        materialization_scope_sha256: materializationScopeSha256,
        absent_relative_path_preconditions: absentRelativePathPreconditions,
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

function initializationAuthorityHandler(
  workspaceRoot: string,
  onCall: () => void,
  mutateOutput?: (output: Record<string, any>) => void,
) {
  const canonicalWorkspaceRoot = fs.realpathSync.native(workspaceRoot);
  return (input: { request: unknown }): StandardAgentHandlerSandboxReceipt => {
    onCall();
    const request = input.request as Record<string, any>;
    const authority = request.authority_context;
    const identity = request.work_item_identity;
    const currentInventory = request.current_inventory;
    const lifecycle = {
      study_id: identity.work_item_id,
      lifecycle_state: 'active',
      lifecycle_generation: 1,
      authority_boundary: {
        stage_body_authorized: true,
        publication_authorized: false,
        submission_authorized: false,
      },
    };
    const lifecycleBytes = canonicalJsonBytes(lifecycle);
    const lifecycleSha256 = digest(lifecycleBytes);
    const inventory = structuredClone(currentInventory.record);
    inventory.studies[currentInventory.selected_item_index] = {
      ...inventory.studies[currentInventory.selected_item_index],
      status: 'active',
      lifecycle_ref: 'control/lifecycle.json',
    };
    const inventoryBytes = canonicalJsonBytes(inventory);
    const receiptRef = `opl://mas/study-initialization/${encodeURIComponent(authority.admission_scope_id)}`;
    const lifecycleRelativePath = `${identity.canonical_work_item_root}/control/lifecycle.json`;
    const receiptRelativePath = `${identity.canonical_work_item_root}/control/initialization-receipt.json`;
    const initializationReceipt = {
      receipt_ref: receiptRef,
      study_id: identity.work_item_id,
      from_state: 'uninitialized',
      from_generation: 0,
      to_state: 'active',
      to_generation: 1,
      requested_action_id: authority.requested_action_id,
      requested_run_id: authority.requested_run_id,
      original_invocation_sha256: authority.original_invocation_sha256,
      admission_scope_id: authority.admission_scope_id,
      original_admission_request_ref: authority.original_admission_request_ref,
      original_admission_request_sha256: authority.original_admission_request_sha256,
      lifecycle_relative_path: lifecycleRelativePath,
      lifecycle_sha256: lifecycleSha256,
      stage_body_authorized: true,
      publication_authorized: false,
      submission_authorized: false,
    };
    const receiptBytes = canonicalJsonBytes(initializationReceipt);
    const operations = [
      {
        target_relative_path: currentInventory.inventory_ref,
        precondition: {
          kind: 'existing_exact',
          sha256: currentInventory.inventory_sha256,
          byte_size: currentInventory.inventory_byte_size,
        },
        replacement_bytes_base64: inventoryBytes.toString('base64'),
        replacement_sha256: digest(inventoryBytes),
        replacement_byte_size: inventoryBytes.byteLength,
      },
      {
        target_relative_path: lifecycleRelativePath,
        precondition: { kind: 'absent' },
        replacement_bytes_base64: lifecycleBytes.toString('base64'),
        replacement_sha256: lifecycleSha256,
        replacement_byte_size: lifecycleBytes.byteLength,
      },
      {
        target_relative_path: receiptRelativePath,
        precondition: { kind: 'absent' },
        replacement_bytes_base64: receiptBytes.toString('base64'),
        replacement_sha256: digest(receiptBytes),
        replacement_byte_size: receiptBytes.byteLength,
      },
    ];
    const absentRelativePathPreconditions = [lifecycleRelativePath, receiptRelativePath];
    const operationsSha256 = digest(canonicalJsonBytes(operations));
    const materializationScopeSha256 = digest(canonicalJsonBytes({
      operations,
      absent_relative_path_preconditions: absentRelativePathPreconditions,
    }));
    const requestId = `initialization:${authority.admission_scope_id}`;
    const authorizationRef = `opl://mas/study-initialization-authorization/${encodeURIComponent(requestId)}`;
    const output: Record<string, any> = {
      status: 'authorized',
      initialization_receipt: initializationReceipt,
      initialization_receipt_content_binding: {
        receipt_ref: receiptRef,
        target_relative_path: receiptRelativePath,
        sha256: digest(receiptBytes),
        byte_size: receiptBytes.byteLength,
      },
      opl_host_materialization_request: {
        surface_kind: 'opl_domain_artifact_cas_materialization_request',
        version: 'opl-domain-artifact-cas-materialization.v1',
        capability_id: 'opl_domain_artifact_cas_materialization.v1',
        request_id: requestId,
        domain_id: 'medautoscience',
        authorization_ref: authorizationRef,
        operations_sha256: operationsSha256,
        materialization_scope_sha256: materializationScopeSha256,
        absent_relative_path_preconditions: absentRelativePathPreconditions,
        operations,
      },
      mas_study_initialization_cas_mutation_authorization: {
        authorized: true,
        authorization_ref: authorizationRef,
        capability_id: 'opl_domain_artifact_cas_materialization.v1',
        request_id: requestId,
        domain_id: 'medautoscience',
        operations_sha256: operationsSha256,
        materialization_scope_sha256: materializationScopeSha256,
        absent_relative_path_preconditions: absentRelativePathPreconditions,
        authority_receipt_ref: receiptRef,
        satisfied_gate_ids: [],
      },
    };
    mutateOutput?.(output);
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

export {
  assert,
  spawnSync,
  crypto,
  fs,
  os,
  path,
  test,
  fileURLToPath,
  pathToFileURL,
  DatabaseSync,
  canonicalJsonBytes,
  FrameworkContractError,
  resolveStandardAgent,
  inspectStandardAgentActionRunBinding,
  inspectStandardAgentActionRunCompletion,
  inspectStandardAgentActionRunPlan,
  runStandardAgentAction,
  runStandardAgentQualificationProvisioning,
  runStandardAgentHandlerSandbox,
  runFamilyRuntime,
  applyDomainArtifactCasMaterialization,
  observeDomainArtifactCasMaterialization,
  preflightStandardAgentDomainLifecycleAdmission,
  prepareStandardAgentLifecycleReactivation,
  standardAgentLifecycleAdmissionContract,
  standardAgentLifecycleInitializationHandlerRunId,
  standardAgentLifecycleReactivationHandlerRunId,
  preflightFamilyRuntimeDomainLifecycleAdmission,
  ensureProviderHostedStageAttempt,
  launchRegisteredStageRun,
  createStageRunLaunchTable,
  createFamilyRuntimeQueueTables,
  buildPackBoundTemporalStageRunInput,
  materializeStageRunRoute,
  buildRouteStageRunInvocation,
  stageAttemptExecutionContentBindingSha256,
  stageRunSpecSha256,
  normalizeStageQualityCyclePolicy,
  createCordisBaseHeadlessComposition,
  temporaryRoot,
  digest,
  writeJson,
  writeLifecycleCasReadState,
  supportedSurfaces,
  exactByteBindingFields,
  packageUseBinding,
  nativeCarrierReadiness,
  writeNativeCarrierDescriptor,
  nativeManagedCheckout,
  writeLifecycleContracts,
  writeLifecycleWorkspace,
  writeIdentityOnlyLifecycleWorkspace,
  reactivationAdmission,
  prepareCanonicalLifecycleAuthorityPayload,
  loadCanonicalMasAuthorityRequest,
  authorityHandler,
  initializationAuthorityHandler,
  refusingAuthorityHandler,
};

export type {
  FamilyRuntimeTaskRow,
  StandardAgentStageQualityRuntimeBinding,
  StandardAgentHandlerSandboxReceipt,
};

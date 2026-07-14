import { spawn } from 'node:child_process';
import net from 'node:net';

import { assert, fs, os, parseJsonText, path, repoRoot, runCli, test } from '../helpers.ts';
import { resolveTemporalWorkerTaskQueue } from '../../../../src/modules/runway/family-runtime-temporal-provider-parts/worker-task-queue.ts';
import {
  FAMILY_RUNTIME_DOMAIN_IDS,
  runtimeDomainOwnerProfiles,
  runtimeManagerDomainProfiles,
} from '../../../../src/modules/runway/family-runtime-types.ts';
import { writeNativeHelperFixtureScripts } from './native-helper-fixtures.ts';

test('runtime manager reports OPL control plane over provider-backed family runtime', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-manager-state-'));

  try {
    const output = runCli(['runtime', 'manager'], {
      OPL_STATE_DIR: stateRoot,
      OPL_FAMILY_RUNTIME_PROVIDER: '',
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
    });

    assert.equal(output.version, 'g2');
    assert.equal(output.runtime_manager.surface_id, 'opl_runtime_manager');
    assert.equal(output.runtime_manager.layer_role, 'product_control_plane_over_provider_backed_family_runtime');
    assert.equal(output.runtime_manager.status, 'provider_code_landed_unconfigured');
    assert.equal(output.runtime_manager.owner_split.online_runtime_substrate_owner, 'provider_backed_family_runtime');
    assert.equal(output.runtime_manager.owner_split.product_control_plane_owner, 'one-person-lab');
    assert.deepEqual(
      output.runtime_manager.owner_split.domain_truth_owners.map((owner: { domain_id: string }) => owner.domain_id),
      FAMILY_RUNTIME_DOMAIN_IDS,
    );
    assert.deepEqual(output.runtime_manager.owner_split.domain_truth_owners, runtimeDomainOwnerProfiles());
    assert.equal(output.runtime_manager.family_runtime_stage_attempt_index.provider_model, 'provider_backed_stage_attempt_runtime');
    assert.equal(output.runtime_manager.family_runtime_stage_attempt_index.configured_provider, 'temporal');
    assert.deepEqual(output.runtime_manager.family_runtime_stage_attempt_index.allowed_providers, [
      'temporal',
      'external_sandbox',
    ]);
    assert.equal(output.runtime_manager.family_scheduler_replacement.surface_kind, 'opl_family_scheduler_replacement');
    assert.equal(output.runtime_manager.family_scheduler_replacement.scheduler_owner, 'opl_provider_runtime_manager');
    assert.equal(output.runtime_manager.family_scheduler_replacement.cadence_owner, 'provider_backed_family_runtime');
    assert.equal(output.runtime_manager.family_scheduler_replacement.configured_provider, 'temporal');
    assert.deepEqual(output.runtime_manager.family_scheduler_replacement.allowed_opl_targets, [
      'provider_slo_tick',
      'scheduler_cadence',
      'runtime_manager_projection',
    ]);
    const masManagedDomain = output.runtime_manager.family_scheduler_replacement.managed_domains.find(
      (domain: { domain_id: string }) => domain.domain_id === 'medautoscience',
    );
    assert.ok(masManagedDomain);
    assert.equal(
      masManagedDomain.legacy_scheduler_owner,
      null,
    );
    assert.equal(
      masManagedDomain.legacy_scheduler_residue_policy,
      'history_tombstone_or_negative_guard_only',
    );
    assert.deepEqual(
      masManagedDomain.required_domain_refs,
      [],
    );
    assert.equal(
      masManagedDomain.migration_priority,
      'package_managed',
    );
    assert.deepEqual(output.runtime_manager.family_runtime_stage_attempt_index.domain_route_projection.canonical_task_kinds, [
      'domain_route/stage-route',
      'domain_route/reconcile-apply',
    ]);
    assert.equal(
      output.runtime_manager.family_runtime_stage_attempt_index.domain_route_projection.owner_route_handoff_ref,
      'domain_runtime_owner_route_handoff',
    );
    assert.equal(
      output.runtime_manager.family_runtime_stage_attempt_index.domain_route_projection.accepted_runtime_owner_route_ref,
      'opl_runtime_owner_route',
    );
    assert.deepEqual(
      output.runtime_manager.family_runtime_stage_attempt_index.domain_route_projection.accepted_runtime_responsibilities,
      [
        'stage_attempt_index',
        'stage_attempt_ledger',
        'liveness_projection',
        'provider_wakeup',
        'typed_blocker_or_temporal_failure_projection',
      ],
    );
    assert.equal(
      output.runtime_manager.family_runtime_stage_attempt_index.domain_route_projection.action_ref_source,
      'domain_route_runtime_request.command_kind_or_action_ref',
    );
    assert.equal(output.runtime_manager.family_scheduler_replacement.authority_boundary.can_write_domain_truth, false);
    assert.equal(output.runtime_manager.family_scheduler_replacement.authority_boundary.can_install_domain_daemon, false);
    assert.equal(output.runtime_manager.family_scheduler_replacement.authority_boundary.can_write_domain_memory_body, false);
    assert.equal(output.runtime_manager.family_scheduler_replacement.command_set.provider_slo_tick, 'opl family-runtime provider-slo tick --provider temporal');
    assert.equal(output.runtime_manager.family_scheduler_replacement.command_set.scheduler_status, 'opl family-runtime scheduler status --provider temporal');
    assert.equal(output.runtime_manager.family_scheduler_replacement.command_set.scheduler_trigger, 'opl family-runtime scheduler trigger --provider temporal');
    assert.equal(output.runtime_manager.provider_runtime.selected_provider, 'temporal');
    assert.equal(output.runtime_manager.provider_runtime.default_resolution.fallback, 'temporal');
    assert.equal(output.runtime_manager.provider_runtime.default_resolution.local_sqlite_role, 'retired_runtime_provider');
    assert.equal(output.runtime_manager.provider_runtime.providers.temporal.ready, false);
    assert.equal(output.runtime_manager.provider_runtime.providers.temporal.details.worker_readiness.blockers.includes('temporal_runtime_not_configured'), true);
    assert.equal(
      output.runtime_manager.provider_runtime.provider_catalog.external_sandbox.provider_role,
      'agent_sandbox_execution_substrate',
    );
    assert.equal(
      output.runtime_manager.provider_runtime.provider_catalog.external_sandbox.production_online_readiness_provider,
      false,
    );
    assert.equal(output.runtime_manager.reconcile.recommended_actions[0].action_id, 'configure_temporal_provider');
    assert.equal(output.runtime_manager.daemon_policy.local_daemon_added, false);
    assert.equal(output.runtime_manager.daemon_policy.opl_domain_daemon_installation_allowed, false);
    assert.equal(output.runtime_manager.daemon_policy.cadence_owner, 'provider_backed_family_runtime');
    assert.equal(
      output.runtime_manager.daemon_policy.domain_launchagent_policy.medautoscience,
      'not_installed_or_maintained_by_opl',
    );
    assert.deepEqual(
      output.runtime_manager.daemon_policy.domain_launchagent_policy,
      Object.fromEntries(runtimeManagerDomainProfiles().map((profile) => [
        profile.domain_id,
        profile.scheduler.daemon_policy,
      ])),
    );
    assert.equal(output.runtime_manager.non_goals.includes('not_a_domain_runtime_truth_owner'), true);
    assert.equal(output.runtime_manager.registration_registry.surface_kind, 'opl_stage_runtime_registration_registry');
    const registrationDomains = output.runtime_manager.registration_registry.domains;
    assert.equal(registrationDomains.length, runtimeManagerDomainProfiles().length);
    assert.deepEqual(
      registrationDomains,
      runtimeManagerDomainProfiles().map((profile) => {
        const { scheduler: _scheduler, ...registration } = profile;
        return registration;
      }),
    );
    const masRegistration = registrationDomains.find(
      (domain: { domain_id: string }) => domain.domain_id === 'medautoscience',
    );
    const rcaRegistration = registrationDomains.find(
      (domain: { domain_id: string }) => domain.domain_id === 'redcube_ai',
    );
    assert.ok(masRegistration);
    assert.ok(rcaRegistration);
    assert.equal(
      masRegistration.expected_registration_surface.ref,
      'package:mas#/standard_agent_interface/runtime/registration_ref',
    );
    assert.deepEqual(
      rcaRegistration.consumable_projection_refs,
      [],
    );
    assert.equal(
      output.runtime_manager.registration_registry.required_domain_registration_fields.includes('state_index_inputs'),
      true,
    );
    assert.equal(output.runtime_manager.standard_domain_agent_scaffold.surface_kind, 'opl_standard_domain_agent_scaffold');
    assert.equal(output.runtime_manager.standard_domain_agent_scaffold.owner, 'one-person-lab');
    assert.equal(output.runtime_manager.standard_domain_agent_scaffold.generation_policy.scaffold_command_is_read_only, true);
    assert.equal(output.runtime_manager.standard_domain_agent_scaffold.generation_policy.creates_files, false);
    assert.equal(
      output.runtime_manager.standard_domain_agent_scaffold.opl_owned_generic_primitives
        .some((primitive: { primitive_id: string }) => primitive.primitive_id === 'stage_attempt_projection_ledger'),
      true,
    );
    assert.equal(
      output.runtime_manager.standard_domain_agent_scaffold.forbidden_domain_generic_owner_roles
        .includes('generic_scheduler_owner'),
      true,
    );
    assert.equal(
      output.runtime_manager.standard_domain_agent_scaffold.domain_retained_thin_surfaces.includes('owner_receipt'),
      true,
    );
    assert.equal(
      output.runtime_manager.standard_domain_agent_scaffold.declarative_domain_pack.includes('owner_receipt_schema'),
      true,
    );
    assert.equal(
      output.runtime_manager.standard_domain_agent_scaffold.minimal_authority_functions.includes(
        'quality_or_export_verdict_authorizer',
      ),
      true,
    );
    assert.equal(
      output.runtime_manager.standard_domain_agent_scaffold.pack_compiler_contract.generated_surface_owner,
      'one-person-lab',
    );
    assert.equal(
      output.runtime_manager.standard_domain_agent_scaffold.opl_generated_surfaces
        .some((surface: { surface_id: string }) => surface.surface_id === 'product_entry_manifest'),
      true,
    );
    assert.equal(output.runtime_manager.native_helper_target.status, 'contracted_optional_rust_helpers');
    assert.equal(output.runtime_manager.native_helper_target.language, 'rust');
    assert.equal(output.runtime_manager.native_helper_target.protocol.transport, 'cli_stdio');
    assert.deepEqual(
      output.runtime_manager.native_helper_target.helpers.map((helper: { helper_id: string }) => helper.helper_id),
      ['opl-sysprobe', 'opl-doctor-native', 'opl-runtime-watch', 'opl-artifact-indexer', 'opl-state-indexer'],
    );
    assert.equal(output.runtime_manager.state_index_target.status, 'rust_helper_backed_contract_first');
    assert.equal(
      output.runtime_manager.state_index_target.index_catalog.artifact_projection_index.backing_helper_id,
      'opl-artifact-indexer',
    );
    const nativeHelperContract = parseJsonText(
      fs.readFileSync(path.join(repoRoot, 'contracts/opl-framework/native-helper-contract.json'), 'utf8'),
    ) as any;
    assert.deepEqual(
      nativeHelperContract.helpers.map((helper: { helper_id: string }) => helper.helper_id),
      output.runtime_manager.native_helper_target.helpers.map((helper: { helper_id: string }) => helper.helper_id),
    );
    const runtimeManagerContract = parseJsonText(
      fs.readFileSync(path.join(repoRoot, 'contracts/opl-framework/runtime-manager-contract.json'), 'utf8'),
    ) as any;
    assert.equal(runtimeManagerContract.family_scheduler_replacement.surface_kind, output.runtime_manager.family_scheduler_replacement.surface_kind);
    assert.equal(runtimeManagerContract.family_scheduler_replacement.scheduler_owner, output.runtime_manager.family_scheduler_replacement.scheduler_owner);
    assert.equal(Object.hasOwn(runtimeManagerContract.owner_split, 'domain_truth_owners'), false);
    assert.equal(
      runtimeManagerContract.owner_split.domain_truth_owners_projection.runtime_projection,
      'runtimeDomainOwnerProfiles',
    );
    assert.equal(Object.hasOwn(runtimeManagerContract.domain_registration_registry, 'registered_domains'), false);
    assert.equal(
      runtimeManagerContract.domain_registration_registry.registered_domains_projection.runtime_projection,
      'runtimeManagerDomainProfiles',
    );
    assert.equal(
      runtimeManagerContract.family_scheduler_replacement.managed_domains_projection.source_of_truth_ref,
      'src/kernel/standard-agent-registry.ts#family_runtime_profile.runtime_manager_registration',
    );
    assert.equal(
      runtimeManagerContract.daemon_policy.domain_launchagent_policy_projection.source_of_truth_ref,
      'src/kernel/standard-agent-registry.ts#family_runtime_profile.runtime_manager_registration.scheduler.daemon_policy',
    );
    assert.deepEqual(
      runtimeManagerContract.family_runtime_stage_attempt_index.domain_route_projection.canonical_task_kinds,
      output.runtime_manager.family_runtime_stage_attempt_index.domain_route_projection.canonical_task_kinds,
    );
    assert.deepEqual(
      runtimeManagerContract.family_runtime_stage_attempt_index.domain_route_projection.action_ref_source,
      output.runtime_manager.family_runtime_stage_attempt_index.domain_route_projection.action_ref_source,
    );
    assert.equal(
      runtimeManagerContract.standard_domain_agent_scaffold.surface_kind,
      output.runtime_manager.standard_domain_agent_scaffold.surface_kind,
    );
    assert.equal(output.runtime_manager.future_sidecar_migration.enabled_now, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('runtime manager fail-closes external sandbox provider when adapter config is missing', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-manager-external-sandbox-missing-'));

  try {
    const output = runCli(['runtime', 'manager'], {
      OPL_STATE_DIR: stateRoot,
      OPL_FAMILY_RUNTIME_PROVIDER: 'external_sandbox',
      OPL_EXTERNAL_SANDBOX_ENDPOINT: '',
      OPL_EXTERNAL_SANDBOX_CREDENTIAL_REF: '',
      OPL_EXTERNAL_SANDBOX_PROVIDER_RECEIPT_REF: '',
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
    }).runtime_manager;

    const provider = output.provider_runtime.providers.external_sandbox;
    assert.equal(output.family_runtime_stage_attempt_index.configured_provider, 'external_sandbox');
    assert.equal(output.status, 'provider_attention_needed');
    assert.equal(provider.status, 'attention_needed');
    assert.equal(provider.ready, false);
    assert.equal(provider.degraded_reason, 'external_sandbox_adapter_unconfigured');
    assert.equal(provider.capabilities.includes('isolated_filesystem'), true);
    assert.equal(provider.details.provider_role, 'agent_sandbox_execution_substrate');
    assert.equal(
      provider.details.substrate_boundary,
      'external_agent_sandbox_not_temporal_durable_workflow_substrate',
    );
    assert.equal(provider.details.external_api_called, false);
    assert.equal(provider.details.credential_material_read, false);
    assert.equal(provider.details.temporal_durable_workflow_substrate_replacement, false);
    assert.equal(provider.details.adapter_id, 'opl.external_sandbox_provider_adapter.v1');
    assert.equal(provider.details.adapter.adapter_status, 'external_sandbox_provider_adapter_unconfigured');
    assert.deepEqual(provider.details.missing_required_env, [
      'OPL_EXTERNAL_SANDBOX_ENDPOINT',
      'OPL_EXTERNAL_SANDBOX_CREDENTIAL_REF',
      'OPL_EXTERNAL_SANDBOX_PROVIDER_RECEIPT_REF',
    ]);
    assert.equal(output.reconcile.overall_status, 'attention_needed');
    assert.equal(output.reconcile.checked_surfaces.provider_runtime, 'provider_attention_needed');
    assert.deepEqual(
      output.reconcile.recommended_actions
        .filter((action: { action_lane: string }) => action.action_lane === 'external_agent_sandbox')
        .map((action: { action_id: string; capability: string; blocking: boolean }) => [
          action.action_id,
          action.capability,
          action.blocking,
        ]),
      [['configure_external_sandbox_provider', 'agent_sandbox_execution_substrate', true]],
    );
    assert.deepEqual(
      output.reconcile.recommended_actions
        .filter((action: { action_id: string }) => action.action_id === 'configure_temporal_provider'),
      [],
    );
    assert.equal(
      output.notes.includes(
        'external_sandbox is an agent_sandbox_execution_substrate readback for E2B/Daytona/Modal-style adapters; it is not a Temporal durable workflow substrate replacement.',
      ),
      true,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('runtime manager keeps configured external sandbox separate from Temporal runtime readiness', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-manager-external-sandbox-configured-'));

  try {
    const output = runCli(['runtime', 'manager'], {
      OPL_STATE_DIR: stateRoot,
      OPL_FAMILY_RUNTIME_PROVIDER: 'external_sandbox',
      OPL_EXTERNAL_SANDBOX_ENDPOINT: 'https://sandbox.invalid',
      OPL_EXTERNAL_SANDBOX_CREDENTIAL_REF: 'keychain://opl/external-sandbox/test',
      OPL_EXTERNAL_SANDBOX_PROVIDER_RECEIPT_REF: 'opl://provider/external-sandbox/test-receipt',
      OPL_EXTERNAL_SANDBOX_SUBSTRATE: 'e2b',
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
    }).runtime_manager;

    const provider = output.provider_runtime.providers.external_sandbox;
    assert.equal(provider.status, 'attention_needed');
    assert.equal(provider.ready, false);
    assert.equal(provider.degraded_reason, 'external_sandbox_not_temporal_durable_workflow_substrate');
    assert.equal(provider.details.endpoint, 'https://sandbox.invalid');
    assert.equal(provider.details.credential_ref, 'keychain://opl/external-sandbox/test');
    assert.equal(provider.details.provider_receipt_ref, 'opl://provider/external-sandbox/test-receipt');
    assert.equal(provider.details.adapter_configured, true);
    assert.equal(provider.details.adapter_id, 'opl.external_sandbox_provider_adapter.v1');
    assert.equal(provider.details.adapter_mode, 'external_sandbox_provider_adapter_configured');
    assert.equal(provider.details.adapter.can_bind_provider_receipt, true);
    assert.equal(provider.details.selected_external_substrate, 'e2b');
    assert.equal(provider.details.provider_ready_counts_as_online_runtime_ready, false);
    assert.equal(output.status, 'external_sandbox_configured_not_temporal_durable_runtime_ready');
    assert.equal(
      output.reconcile.checked_surfaces.provider_runtime,
      'external_sandbox_configured_not_temporal_durable_runtime_ready',
    );
    assert.equal(output.reconcile.overall_status, 'attention_needed');
    assert.deepEqual(
      output.reconcile.recommended_actions
        .filter((action: { action_id: string }) => action.action_id === 'configure_external_sandbox_provider'),
      [],
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime status does not treat configured external sandbox as full online runtime ready', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-external-sandbox-configured-'));

  try {
    const output = runCli(['family-runtime', 'status', '--provider', 'external_sandbox'], {
      OPL_STATE_DIR: stateRoot,
      OPL_FAMILY_RUNTIME_PROVIDER: 'external_sandbox',
      OPL_EXTERNAL_SANDBOX_ENDPOINT: 'https://sandbox.invalid',
      OPL_EXTERNAL_SANDBOX_CREDENTIAL_REF: 'keychain://opl/external-sandbox/test',
      OPL_EXTERNAL_SANDBOX_PROVIDER_RECEIPT_REF: 'opl://provider/external-sandbox/test-receipt',
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
    }).family_runtime;

    assert.equal(output.configured_provider, 'external_sandbox');
    assert.equal(output.readiness.provider_ready, false);
    assert.equal(output.readiness.full_online_ready, false);
    assert.equal(output.readiness.durable_online_ready, false);
    assert.equal(output.provider_runtime.providers.external_sandbox.ready, false);
    assert.equal(output.provider_runtime.providers.external_sandbox.details.adapter_configured, true);
    assert.equal(
      output.provider_runtime.providers.external_sandbox.details.substrate_boundary,
      'external_agent_sandbox_not_temporal_durable_workflow_substrate',
    );
    assert.equal(output.provider_runtime.providers.external_sandbox.details.external_api_called, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime status defaults to temporal production provider and blocks instead of falling back to local sqlite', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-default-provider-'));

  try {
    const output = runCli(['family-runtime', 'status'], {
      OPL_STATE_DIR: stateRoot,
      OPL_FAMILY_RUNTIME_PROVIDER: '',
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
    }).family_runtime;

    assert.equal(output.configured_provider, 'temporal');
    assert.equal(output.readiness.provider_ready, false);
    assert.equal(output.readiness.full_online_ready, false);
    assert.equal(output.readiness.durable_online_ready, false);
    assert.equal(output.readiness.degraded, true);
    assert.equal(output.provider_runtime.default_resolution.fallback, 'temporal');
    assert.equal(output.provider_runtime.default_resolution.fail_closed_when_temporal_not_ready, true);
    assert.equal(output.provider_runtime.providers.temporal.status, 'provider_code_landed_unconfigured');
    assert.equal(
      output.provider_runtime.providers.temporal.details.worker_readiness.temporal_service_lifecycle.service_status,
      'not_configured',
    );
    assert.equal(Object.hasOwn(output.provider_runtime.provider_catalog, 'local_sqlite'), false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('runtime status, family-runtime status, and runtime manager consume the same lifecycle-aware provider readiness truth', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-provider-readiness-truth-'));
  const runtimeRoot = path.join(stateRoot, 'family-runtime');
  const helperBinDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-provider-readiness-helper-bin-'));
  const server = net.createServer((socket) => socket.end());
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = `127.0.0.1:${(server.address() as net.AddressInfo).port}`;
  const service = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30_000);'], {
    detached: true,
    stdio: 'ignore',
  });
  const worker = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30_000);'], {
    detached: true,
    stdio: 'ignore',
  });
  service.unref();
  worker.unref();

  writeNativeHelperFixtureScripts(helperBinDir);

  try {
    assert.equal(typeof service.pid, 'number');
    assert.equal(typeof worker.pid, 'number');
    fs.mkdirSync(runtimeRoot, { recursive: true });
    const taskQueue = resolveTemporalWorkerTaskQueue({ root: runtimeRoot });
    fs.writeFileSync(path.join(runtimeRoot, 'temporal-service.json'), `${JSON.stringify({
      provider_kind: 'temporal',
      service_kind: 'custom_command',
      pid: service.pid,
      address,
      started_at: new Date().toISOString(),
      status: 'running',
      command: 'test temporal service',
    }, null, 2)}\n`);
    fs.writeFileSync(path.join(runtimeRoot, 'temporal-worker.json'), `${JSON.stringify({
      provider_kind: 'temporal',
      pid: worker.pid,
      address,
      namespace: 'default',
      task_queue: taskQueue,
      started_at: new Date().toISOString(),
      status: 'ready',
      source_version: 'git:runtime-manager-provider-current',
    }, null, 2)}\n`);

    const env = {
      OPL_STATE_DIR: stateRoot,
      OPL_NATIVE_HELPER_BIN_DIR: helperBinDir,
      OPL_FAMILY_RUNTIME_PROVIDER: '',
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
      OPL_TEMPORAL_WORKER_STATUS: '',
      OPL_TEMPORAL_WORKER_ENABLED: '',
      OPL_TEMPORAL_WORKER_SOURCE_VERSION: 'git:runtime-manager-provider-current',
    };
    const runtimeStatus = runCli(['status', 'runtime'], env).runtime_status;
    const familyRuntime = runCli(['family-runtime', 'status', '--provider', 'temporal'], env).family_runtime;
    const runtimeManager = runCli(['runtime', 'manager'], env).runtime_manager;

    const statusProvider = runtimeStatus.family_runtime_providers.providers.temporal;
    const familyProvider = familyRuntime.provider_runtime.providers.temporal;
    const managerProvider = runtimeManager.provider_runtime.providers.temporal;

    assert.equal(runtimeStatus.configured_provider, 'temporal');
    assert.equal(familyRuntime.configured_provider, 'temporal');
    assert.equal(runtimeManager.family_runtime_stage_attempt_index.configured_provider, 'temporal');
    assert.equal(statusProvider.ready, true);
    assert.equal(familyProvider.ready, true);
    assert.equal(managerProvider.ready, true);
    assert.equal(statusProvider.status, familyProvider.status);
    assert.equal(managerProvider.status, familyProvider.status);
    assert.equal(statusProvider.degraded_reason, familyProvider.degraded_reason);
    assert.equal(managerProvider.degraded_reason, familyProvider.degraded_reason);
    assert.equal(statusProvider.details.address, familyProvider.details.address);
    assert.equal(managerProvider.details.address, familyProvider.details.address);
    assert.equal(statusProvider.details.address_source, familyProvider.details.address_source);
    assert.equal(managerProvider.details.address_source, familyProvider.details.address_source);
    assert.equal(statusProvider.details.worker_readiness.lifecycle_status, 'ready');
    assert.equal(familyProvider.details.worker_readiness.lifecycle_status, 'ready');
    assert.equal(managerProvider.details.worker_readiness.lifecycle_status, 'ready');
    assert.deepEqual(runtimeManager.reconcile.recommended_actions
      .filter((action: { action_id: string }) => action.action_id === 'configure_temporal_provider'), []);
  } finally {
    if (typeof service.pid === 'number') {
      try {
        process.kill(service.pid, 'SIGTERM');
      } catch {
        // already stopped
      }
    }
    if (typeof worker.pid === 'number') {
      try {
        process.kill(worker.pid, 'SIGTERM');
      } catch {
        // already stopped
      }
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(helperBinDir, { recursive: true, force: true });
  }
});

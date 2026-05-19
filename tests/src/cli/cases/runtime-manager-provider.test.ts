import { spawn } from 'node:child_process';
import net from 'node:net';

import { assert, fs, os, path, repoRoot, runCli, test } from '../helpers.ts';

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
    assert.equal(output.runtime_manager.family_runtime_queue.provider_model, 'provider_backed_stage_attempt_runtime');
    assert.equal(output.runtime_manager.family_runtime_queue.configured_provider, 'temporal');
    assert.deepEqual(output.runtime_manager.family_runtime_queue.allowed_providers, [
      'local_sqlite',
      'temporal',
    ]);
    assert.equal(output.runtime_manager.family_scheduler_replacement.surface_kind, 'opl_family_scheduler_replacement');
    assert.equal(output.runtime_manager.family_scheduler_replacement.scheduler_owner, 'opl_provider_runtime_manager');
    assert.equal(output.runtime_manager.family_scheduler_replacement.cadence_owner, 'provider_backed_family_runtime');
    assert.equal(output.runtime_manager.family_scheduler_replacement.configured_provider, 'temporal');
    assert.deepEqual(output.runtime_manager.family_scheduler_replacement.allowed_opl_targets, [
      'provider_slo_tick',
      'domain_registration_intake',
      'family_runtime_tick',
      'runtime_manager_projection',
    ]);
    assert.equal(
      output.runtime_manager.family_scheduler_replacement.managed_domains[0].legacy_scheduler_owner,
      'mas_supervision_scheduler',
    );
    assert.equal(output.runtime_manager.family_scheduler_replacement.managed_domains[0].migration_priority, 'p0');
    assert.equal(output.runtime_manager.family_scheduler_replacement.authority_boundary.can_write_domain_truth, false);
    assert.equal(output.runtime_manager.family_scheduler_replacement.authority_boundary.can_install_domain_daemon, false);
    assert.equal(output.runtime_manager.family_scheduler_replacement.authority_boundary.can_write_domain_memory_body, false);
    assert.equal(output.runtime_manager.family_scheduler_replacement.command_set.provider_slo_tick, 'opl family-runtime provider-slo tick --provider temporal');
    assert.equal(output.runtime_manager.family_scheduler_replacement.command_set.family_runtime_tick, 'opl family-runtime tick --source provider-scheduler --hydrate');
    assert.equal(output.runtime_manager.provider_runtime.selected_provider, 'temporal');
    assert.equal(output.runtime_manager.provider_runtime.default_resolution.fallback, 'temporal');
    assert.equal(output.runtime_manager.provider_runtime.default_resolution.local_sqlite_role, 'dev_ci_offline_diagnostic_baseline');
    assert.equal(output.runtime_manager.provider_runtime.providers.temporal.ready, false);
    assert.equal(output.runtime_manager.provider_runtime.providers.temporal.details.worker_readiness.blockers.includes('temporal_runtime_not_configured'), true);
    assert.equal(output.runtime_manager.reconcile.recommended_actions[0].action_id, 'configure_temporal_provider');
    assert.equal(output.runtime_manager.daemon_policy.local_daemon_added, false);
    assert.equal(output.runtime_manager.daemon_policy.opl_domain_daemon_installation_allowed, false);
    assert.equal(output.runtime_manager.daemon_policy.cadence_owner, 'provider_backed_family_runtime');
    assert.equal(output.runtime_manager.daemon_policy.domain_launchagent_policy.medautoscience, 'legacy_diagnostic_cleanup_only');
    assert.equal(output.runtime_manager.non_goals.includes('not_a_domain_runtime_truth_owner'), true);
    assert.equal(output.runtime_manager.registration_registry.surface_kind, 'opl_stage_runtime_registration_registry');
    assert.equal(output.runtime_manager.registration_registry.domains.length, 3);
    assert.equal(
      output.runtime_manager.registration_registry.domains[0].expected_registration_surface.ref,
      '/skill_catalog/skills/0/domain_projection/opl_stage_runtime_registration',
    );
    assert.deepEqual(
      output.runtime_manager.registration_registry.domains[2].consumable_projection_refs.slice(-2),
      ['/review_state', '/publication_projection'],
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
        .some((primitive: { primitive_id: string }) => primitive.primitive_id === 'queue_attempt_ledger'),
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
    const nativeHelperContract = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'contracts/opl-framework/native-helper-contract.json'), 'utf8'),
    );
    assert.deepEqual(
      nativeHelperContract.helpers.map((helper: { helper_id: string }) => helper.helper_id),
      output.runtime_manager.native_helper_target.helpers.map((helper: { helper_id: string }) => helper.helper_id),
    );
    const runtimeManagerContract = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'contracts/opl-framework/runtime-manager-contract.json'), 'utf8'),
    );
    assert.equal(runtimeManagerContract.family_scheduler_replacement.surface_kind, output.runtime_manager.family_scheduler_replacement.surface_kind);
    assert.equal(runtimeManagerContract.family_scheduler_replacement.scheduler_owner, output.runtime_manager.family_scheduler_replacement.scheduler_owner);
    assert.equal(
      runtimeManagerContract.standard_domain_agent_scaffold.surface_kind,
      output.runtime_manager.standard_domain_agent_scaffold.surface_kind,
    );
    assert.equal(output.runtime_manager.future_sidecar_migration.enabled_now, false);
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
    assert.equal(
      output.provider_runtime.provider_catalog.local_sqlite.provider_role,
      'dev_ci_offline_diagnostic_baseline',
    );
    assert.equal(output.provider_runtime.provider_catalog.local_sqlite.production_online_readiness_provider, false);
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

  for (const binary of ['opl-doctor-native', 'opl-runtime-watch', 'opl-artifact-indexer', 'opl-state-indexer']) {
    const helperPath = path.join(helperBinDir, binary);
    fs.writeFileSync(
      helperPath,
      `#!/bin/sh
cat >/dev/null
case "$(basename "$0")" in
  opl-doctor-native)
    printf '%s\\n' '{"protocol_version":"opl_native_helper.v1","helper_id":"opl-doctor-native","ok":true,"request_id":"runtime-manager-doctor","result":{"surface_kind":"native_doctor_snapshot"},"errors":[]}'
    ;;
  opl-runtime-watch)
    printf '%s\\n' '{"protocol_version":"opl_native_helper.v1","helper_id":"opl-runtime-watch","ok":true,"request_id":"runtime-manager-runtime-watch","result":{"surface_kind":"runtime_health_snapshot_index","roots":[]},"errors":[]}'
    ;;
  opl-artifact-indexer)
    printf '%s\\n' '{"protocol_version":"opl_native_helper.v1","helper_id":"opl-artifact-indexer","ok":true,"request_id":"runtime-manager-artifact-index","result":{"surface_kind":"native_artifact_manifest","summary":{"total_files_count":1},"files":[]},"errors":[]}'
    ;;
  opl-state-indexer)
    printf '%s\\n' '{"protocol_version":"opl_native_helper.v1","helper_id":"opl-state-indexer","ok":true,"request_id":"runtime-manager-state-index","result":{"surface_kind":"native_state_index","roots":[],"json_validation":{"checked_files_count":0,"invalid_files_count":0,"files":[]}},"errors":[]}'
    ;;
esac
`,
      { mode: 0o755 },
    );
  }

  try {
    assert.equal(typeof service.pid, 'number');
    assert.equal(typeof worker.pid, 'number');
    fs.mkdirSync(runtimeRoot, { recursive: true });
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
      task_queue: 'opl-stage-attempts',
      started_at: new Date().toISOString(),
      status: 'ready',
    }, null, 2)}\n`);

    const env = {
      OPL_STATE_DIR: stateRoot,
      OPL_NATIVE_HELPER_BIN_DIR: helperBinDir,
      OPL_FAMILY_RUNTIME_PROVIDER: '',
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
      OPL_TEMPORAL_WORKER_STATUS: '',
      OPL_TEMPORAL_WORKER_ENABLED: '',
    };
    const runtimeStatus = runCli(['status', 'runtime'], env).runtime_status;
    const familyRuntime = runCli(['family-runtime', 'status', '--provider', 'temporal'], env).family_runtime;
    const runtimeManager = runCli(['runtime', 'manager'], env).runtime_manager;

    const statusProvider = runtimeStatus.family_runtime_providers.providers.temporal;
    const familyProvider = familyRuntime.provider_runtime.providers.temporal;
    const managerProvider = runtimeManager.provider_runtime.providers.temporal;

    assert.equal(runtimeStatus.configured_provider, 'temporal');
    assert.equal(familyRuntime.configured_provider, 'temporal');
    assert.equal(runtimeManager.family_runtime_queue.configured_provider, 'temporal');
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

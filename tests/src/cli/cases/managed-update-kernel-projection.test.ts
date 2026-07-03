import { assert, createFakeCodexFixture, fs, os, path, repoRoot, runCli, test } from '../helpers.ts';

function readManagedUpdateKernelContract() {
  return JSON.parse(
    fs.readFileSync(
      path.join(repoRoot, 'contracts/opl-framework/managed-update-kernel-contract.json'),
      'utf8',
    ),
  ) as {
    components: string[];
    component_classes: string[];
    providers: Array<{
      provider_id: string;
      controlled_execution_path?: string;
      repair_action?: string;
      rollback_action?: string;
      post_apply_actions?: string[];
      default_policy?: string;
      mutation_scope?: string;
      apply_allowed?: boolean;
      managed_kernel_apply_allowed?: boolean;
      status_fields?: string[];
      carrier_variants?: Array<{
        carrier_type: string;
        host_update_route: string;
        host_update_route_examples?: string[];
        managed_kernel_apply_allowed: boolean;
        host_executor_required: boolean;
        manual_required: boolean;
        manual_required_when?: string[];
        data_volume_preservation_proof_required?: boolean;
        preserved_mounts?: string[];
      }>;
      auto_apply?: {
        mode: string;
        app_background_safe: boolean;
        command_ref: string;
        eligible_scope: string;
        eligible_when: string[];
        blocked_when: string[];
      };
    }>;
    update_plane_state_machine: {
      state_axis: string[];
      states: Array<{
        state_id: string;
        allowed_component_classes: string[];
      }>;
      component_routes: Array<{
        component_class: string;
        canonical_route_state: string;
        readback_state: string;
        owner: string;
        not_opl_update_apply_target?: boolean;
        semantic_merge_required?: boolean;
      }>;
    };
    owner_route_contract: {
      required_fields: string[];
      route_kinds: string[];
      package_manager_claim_must_be_false: boolean;
    };
    runner_result_shape: {
      adapter_post_apply_action_shape: { required_fields: string[]; status_values: string[] };
      adapter_status_detail_shape: {
        required_fields: string[];
        post_apply_status_values: string[];
        reload_status_values: string[];
      };
      reload_guidance_shape: { required_fields: string[]; reload_targets: string[] };
      runtime_substrate_adapter_result_shape: {
        required_fields: string[];
        controlled_execution_path: string;
      };
    };
  };
}

test('managed update kernel contract keeps runtime and agent post-apply execution shapes explicit', () => {
  const contract = readManagedUpdateKernelContract();
  assert.deepEqual(contract.components, [
    'installation_carrier',
    'runtime_substrate',
    'capability_packages',
    'codex_surface',
    'companion_tools',
    'workflow_profile',
  ]);
  assert.deepEqual(contract.component_classes, contract.components);
  assert.equal(
    contract.providers.some((entry) => entry.provider_id === 'app_binary'),
    false,
  );
  assert.deepEqual(contract.update_plane_state_machine.state_axis, [
    'auto_apply',
    'controlled_apply',
    'prompt_only',
    'projection_only',
  ]);
  assert.deepEqual(
    contract.update_plane_state_machine.component_routes.map((entry) => entry.component_class),
    contract.component_classes,
  );
  assert.deepEqual(contract.owner_route_contract.required_fields, [
    'owner',
    'authority_surface',
    'route_kind',
    'readback_ref',
    'apply_owner',
    'package_manager_claim',
    'forbidden_claims',
  ]);
  assert.equal(contract.owner_route_contract.package_manager_claim_must_be_false, true);
  assert.equal(contract.owner_route_contract.route_kinds.includes('clean_managed_package_executor'), true);

  const routeByClass = new Map(
    contract.update_plane_state_machine.component_routes.map((entry) => [entry.component_class, entry]),
  );
  assert.equal(routeByClass.get('capability_packages')?.canonical_route_state, 'auto_apply');
  assert.equal(routeByClass.get('runtime_substrate')?.canonical_route_state, 'controlled_apply');
  assert.equal(routeByClass.get('installation_carrier')?.canonical_route_state, 'prompt_only');
  assert.equal(routeByClass.get('installation_carrier')?.readback_state, 'projection_only');
  assert.equal(routeByClass.get('installation_carrier')?.not_opl_update_apply_target, true);
  assert.equal(routeByClass.get('codex_surface')?.canonical_route_state, 'projection_only');
  assert.equal(routeByClass.get('workflow_profile')?.canonical_route_state, 'prompt_only');
  assert.equal(routeByClass.get('workflow_profile')?.semantic_merge_required, true);

  for (const route of contract.update_plane_state_machine.component_routes) {
    assert.equal(
      contract.update_plane_state_machine.state_axis.includes(route.canonical_route_state),
      true,
    );
    assert.equal(
      contract.update_plane_state_machine.state_axis.includes(route.readback_state),
      true,
    );
  }

  const installationCarrier = contract.providers.find((entry) => entry.provider_id === 'installation_carrier');
  assert.ok(installationCarrier);
  assert.equal(installationCarrier.default_policy, 'carrier_specific_status_with_host_update_route');
  assert.equal(installationCarrier.mutation_scope, 'projection_only_no_opl_update_apply_component_target');
  assert.equal(installationCarrier.apply_allowed, false);
  assert.equal(installationCarrier.managed_kernel_apply_allowed, false);
  assert.equal(installationCarrier.status_fields?.includes('carrier_type'), true);
  assert.equal(installationCarrier.status_fields?.includes('image_ref'), true);
  assert.equal(installationCarrier.status_fields?.includes('image_digest'), true);
  assert.equal(installationCarrier.status_fields?.includes('host_update_route'), true);
  assert.equal(installationCarrier.status_fields?.includes('data_volume_preservation'), true);
  const dockerWebuiImage = installationCarrier.carrier_variants?.find((entry) =>
    entry.carrier_type === 'docker_webui_image'
  );
  assert.ok(dockerWebuiImage);
  assert.equal(dockerWebuiImage.host_update_route, 'host_executor_runs_documented_installer_or_compose_pull_and_up');
  assert.equal(dockerWebuiImage.managed_kernel_apply_allowed, false);
  assert.equal(dockerWebuiImage.host_executor_required, true);
  assert.equal(dockerWebuiImage.manual_required, true);
  assert.equal(dockerWebuiImage.data_volume_preservation_proof_required, true);
  assert.equal(dockerWebuiImage.preserved_mounts?.includes('OnePersonLab/data -> /data'), true);
  const linuxPackageCarrier = installationCarrier.carrier_variants?.find((entry) =>
    entry.carrier_type === 'linux_package_carrier'
  );
  assert.ok(linuxPackageCarrier);
  assert.equal(linuxPackageCarrier.host_update_route, 'host_package_manager_or_documented_host_executor');
  assert.equal(linuxPackageCarrier.host_update_route_examples?.includes('sudo dnf upgrade one-person-lab'), true);
  assert.equal(linuxPackageCarrier.managed_kernel_apply_allowed, false);
  assert.equal(linuxPackageCarrier.host_executor_required, true);
  assert.equal(linuxPackageCarrier.manual_required, true);
  assert.equal(linuxPackageCarrier.manual_required_when?.includes('host_policy_disallows_app_executor'), true);

  const runtime = contract.providers.find((entry) => entry.provider_id === 'runtime_substrate');
  assert.ok(runtime);
  assert.equal(runtime.controlled_execution_path, 'opl system startup-maintenance --json');
  assert.equal(runtime.repair_action, 'run_startup_maintenance');
  assert.equal(runtime.rollback_action, 'rollback_opl_framework_runtime_or_restart_app_with_previous_runtime_pointer');
  assert.equal(runtime.status_fields?.includes('opl_framework_runtime'), true);

  const agents = contract.providers.find((entry) => entry.provider_id === 'capability_packages');
  assert.ok(agents);
  assert.equal(agents.auto_apply?.mode, 'auto_apply');
  assert.equal(agents.auto_apply?.app_background_safe, true);
  assert.equal(agents.auto_apply?.command_ref, 'opl update apply --component capability_packages --json');
  assert.equal(agents.auto_apply?.eligible_scope, 'clean_opl_managed_module_roots_only');
  assert.equal(agents.auto_apply?.blocked_when.includes('dirty checkout'), true);
  assert.deepEqual(agents.post_apply_actions, [
    'reconcile_modules',
    'sync_skills',
    'codex_surface',
  ]);

  const workflowProfile = contract.providers.find((entry) => entry.provider_id === 'workflow_profile');
  assert.ok(workflowProfile);
  assert.equal(workflowProfile.default_policy, 'semantic_merge_required_no_silent_overwrite');
  assert.equal(workflowProfile.mutation_scope, 'projection_only_no_opl_update_apply_component_target');
  assert.equal(workflowProfile.apply_allowed, false);
  assert.deepEqual(contract.runner_result_shape.adapter_post_apply_action_shape.required_fields, [
    'action_id',
    'command_ref',
    'status',
    'result_ref',
    'result',
  ]);
  assert.deepEqual(contract.runner_result_shape.adapter_post_apply_action_shape.status_values, [
    'completed',
    'skipped',
    'manual_required',
    'failed',
  ]);
  assert.deepEqual(contract.runner_result_shape.adapter_status_detail_shape.required_fields, [
    'component_state',
    'auto_apply_eligible',
    'app_background_safe',
    'clean_managed_targets_count',
    'manual_required_targets_count',
    'post_apply_status',
    'reload_status',
  ]);
  assert.equal(contract.runner_result_shape.adapter_status_detail_shape.post_apply_status_values.includes('completed'), true);
  assert.equal(contract.runner_result_shape.adapter_status_detail_shape.reload_status_values.includes('recommended'), true);
  assert.deepEqual(contract.runner_result_shape.reload_guidance_shape.required_fields, [
    'reload_required',
    'reload_recommended',
    'reload_targets',
    'command_ref',
    'reason',
  ]);
  assert.deepEqual(contract.runner_result_shape.reload_guidance_shape.reload_targets, [
    'one_person_lab_app',
    'codex_plugin_cache',
  ]);
  assert.deepEqual(contract.runner_result_shape.runtime_substrate_adapter_result_shape.required_fields, [
    'action',
    'receipt_ref',
    'rollback_ref',
    'repair_action',
  ]);
  assert.equal(
    contract.runner_result_shape.runtime_substrate_adapter_result_shape.controlled_execution_path,
    'startup_maintenance_runtime_substrate_adapter',
  );
});

test('update status exposes the managed update kernel projection without mutating global tools or domain truth', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-managed-update-status-'));
  const codexFixture = createFakeCodexFixture(`
if [ "$1" = "--version" ]; then
  echo "codex-cli 0.130.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 2
`);

  try {
    const output = runCli(['update', 'status'], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_STATE_DIR: path.join(homeRoot, 'state'),
      OPL_MODULES_ROOT: path.join(homeRoot, 'modules'),
      OPL_FAMILY_WORKSPACE_ROOT: path.join(homeRoot, 'family'),
      OPL_CODEX_CLI_LATEST_VERSION: '0.134.0',
      PATH: `${codexFixture.fixtureRoot}:/usr/bin:/bin`,
    }) as {
      managed_update: {
        operation: string;
        surface_id: string;
        operation_mode: string;
        lifecycle: string[];
        state_vocabulary: string[];
        idempotency_lock: {
          lock_id: string;
          lock_scope: string;
          read_operations: string[];
          exclusive_operations: string[];
          status: string;
          stale_after_seconds: number;
          contention_policy: string;
        };
        summary: Record<string, number>;
        components: Array<{
          component_id: string;
          provider_id: string;
          adapter_id: string;
          policy_id: string;
          owner_route: {
            owner: string;
            authority_surface: string;
            route_kind: string;
            readback_ref: string;
            apply_owner: string;
            package_manager_claim: boolean;
            forbidden_claims: string[];
          };
          state: string;
          conditions: Array<{ type: string; status: string; reason: string; message: string; observed_generation: number }>;
          plan: { action: string; command_refs: Array<{ command: string; mode: string; destructive: boolean }> };
          receipt: {
            schema_version: string;
            source_manifest_ref: string | null;
            verify_result: string;
            post_apply_hooks: string[];
            content_identity_fields: string[];
            repair_action: string | null;
            apply_mode: string;
            status_detail: {
              component_state: string | null;
              auto_apply_eligible: boolean | null;
              app_background_safe: boolean | null;
              clean_managed_targets_count: number | null;
              manual_required_targets_count: number | null;
              post_apply_status: string;
              reload_status: string;
            };
            post_apply_action_statuses: Array<{ action_id: string; status: string; result_ref: string | null }>;
            reload_guidance: {
              reload_required: boolean;
              reload_recommended: boolean;
              reload_targets: string[];
              command_ref: string | null;
              reason: string | null;
            };
          };
          auto_apply: {
            mode: string;
            eligible: boolean;
            app_background_safe: boolean;
            scope: string;
            command_ref: string | null;
            blocked_reasons: string[];
          };
          status_detail: {
            component_state: string | null;
            auto_apply_eligible: boolean | null;
            app_background_safe: boolean | null;
            clean_managed_targets_count: number | null;
            manual_required_targets_count: number | null;
            post_apply_status: string;
            reload_status: string;
          };
          post_apply_guidance: {
            required: boolean;
            command_refs: string[];
            reload_guidance: {
              reload_required: boolean;
              reload_recommended: boolean;
              reload_targets: string[];
              command_ref: string | null;
              reason: string | null;
            };
          };
          authority_boundary: Record<string, boolean>;
          current: Record<string, unknown>;
          target: Record<string, unknown> | null;
        }>;
        receipts: { component_receipt_schema: string; required_fields: string[]; write_policy: string };
        authority_boundary: Record<string, boolean>;
      };
    };

    assert.equal(output.managed_update.operation, 'status');
    assert.equal(output.managed_update.surface_id, 'opl_managed_updater_kernel');
    assert.equal(output.managed_update.operation_mode, 'read_only_projection');
    assert.deepEqual(output.managed_update.lifecycle.slice(0, 4), [
      'read_manifest',
      'read_current_state',
      'diff_plan',
      'fetch_artifacts',
    ]);
    assert.deepEqual(output.managed_update.state_vocabulary, [
      'current',
      'update_available',
      'staged',
      'needs_restart',
      'needs_reload',
      'failed_with_repair',
      'skipped_manual_required',
    ]);
    assert.equal(output.managed_update.idempotency_lock.lock_id, 'opl_managed_updater_kernel.global');
    assert.equal(output.managed_update.idempotency_lock.status, 'not_acquired_for_projection');
    assert.deepEqual(output.managed_update.idempotency_lock.exclusive_operations, ['apply', 'repair', 'rollback']);
    assert.equal(output.managed_update.receipts.component_receipt_schema, 'opl_managed_update_component_receipt.v1');
    assert.deepEqual(output.managed_update.receipts.required_fields, [
      'source_manifest_ref',
      'from_version',
      'from_digest',
      'to_version',
      'to_digest',
      'verify_result',
      'activated_at',
      'post_apply_hooks',
      'rollback_ref',
      'repair_action',
      'apply_mode',
      'status_detail',
      'post_apply_action_statuses',
      'reload_guidance',
    ]);
    assert.equal(output.managed_update.summary.total_components_count, 6);
    assert.equal(Number.isInteger(output.managed_update.summary.failed_with_repair_components_count), true);
    assert.equal(Number.isInteger(output.managed_update.summary.skipped_manual_required_components_count), true);
    assert.equal(output.managed_update.authority_boundary.can_mutate_user_global_homebrew, false);
    assert.equal(output.managed_update.authority_boundary.can_mutate_app_owned_runtime_root, false);
    assert.equal(output.managed_update.authority_boundary.can_write_domain_truth, false);
    assert.equal(output.managed_update.authority_boundary.can_claim_quality_or_export_verdict, false);
    assert.deepEqual(
      output.managed_update.components.map((entry) => entry.component_id),
      ['installation_carrier', 'runtime_substrate', 'capability_packages', 'codex_surface', 'companion_tools', 'workflow_profile'],
    );
    assert.equal(
      output.managed_update.components.every((component) =>
        component.conditions.every((entry) =>
          typeof entry.type === 'string'
          && ['True', 'False', 'Unknown'].includes(entry.status)
          && typeof entry.reason === 'string'
          && typeof entry.message === 'string'
          && Number.isInteger(entry.observed_generation)
        )
      ),
      true,
    );

    const installationCarrier = output.managed_update.components.find((entry) =>
      entry.component_id === 'installation_carrier'
    );
    assert.ok(installationCarrier);
    assert.equal(installationCarrier.provider_id, 'installation_carrier');
    assert.equal(installationCarrier.adapter_id, 'installation_carrier_status_adapter');
    assert.equal(installationCarrier.policy_id, 'carrier_specific_status_with_host_update_route');
    assert.equal(installationCarrier.owner_route.owner, 'one-person-lab-app');
    assert.equal(installationCarrier.owner_route.route_kind, 'manual_owner_route');
    assert.equal(installationCarrier.owner_route.package_manager_claim, false);
    assert.equal(installationCarrier.owner_route.forbidden_claims.includes('opl_update_apply_updates_app_binary'), true);
    assert.equal(installationCarrier.state, 'skipped_manual_required');
    assert.equal(installationCarrier.auto_apply.mode, 'projection_only');
    assert.equal(installationCarrier.auto_apply.eligible, false);
    assert.equal(installationCarrier.auto_apply.app_background_safe, false);
    assert.equal(installationCarrier.auto_apply.command_ref, null);
    assert.equal(
      installationCarrier.auto_apply.blocked_reasons.includes(
        'installation_carrier_requires_carrier_specific_host_update_route',
      ),
      true,
    );
    assert.equal(installationCarrier.current.managed_kernel_apply_allowed, false);
    assert.equal(installationCarrier.current.opl_update_apply_must_not_claim_carrier_update_complete, true);
    const carrierVariants = installationCarrier.current.carrier_variants as Array<{
      carrier_type: string;
      currentness: string;
      update_available: string;
      image_ref?: string;
      image_digest?: string | null;
      package_manager?: string | null;
      package_name?: string | null;
      installed_version?: string | null;
      detected_package_managers?: string[];
      host_update_route: string;
      host_update_route_examples?: string[];
      host_executor_required: boolean;
      manual_required: boolean;
      manual_required_when?: string[];
      data_volume_preservation: { required: boolean; preserved_mounts?: string[] };
      managed_kernel_apply_allowed: boolean;
    }>;
    const dockerWebuiImage = carrierVariants.find((entry) => entry.carrier_type === 'docker_webui_image');
    assert.ok(dockerWebuiImage);
    assert.equal(dockerWebuiImage.image_ref, 'ghcr.io/gaofeng21cn/one-person-lab-webui:stable');
    assert.equal(dockerWebuiImage.image_digest, null);
    assert.equal(dockerWebuiImage.currentness, 'unknown');
    assert.equal(dockerWebuiImage.update_available, 'unknown');
    assert.equal(dockerWebuiImage.host_update_route, 'host_executor_runs_documented_installer_or_compose_pull_and_up');
    assert.equal(dockerWebuiImage.host_executor_required, true);
    assert.equal(dockerWebuiImage.manual_required, true);
    assert.equal(dockerWebuiImage.data_volume_preservation.required, true);
    assert.equal(dockerWebuiImage.data_volume_preservation.preserved_mounts?.includes('OnePersonLab/data -> /data'), true);
    assert.equal(dockerWebuiImage.managed_kernel_apply_allowed, false);
    const linuxPackageCarrier = carrierVariants.find((entry) => entry.carrier_type === 'linux_package_carrier');
    assert.ok(linuxPackageCarrier);
    assert.equal(linuxPackageCarrier.currentness, 'unknown');
    assert.equal(linuxPackageCarrier.update_available, 'unknown');
    assert.equal(linuxPackageCarrier.host_update_route, 'host_package_manager_or_documented_host_executor');
    assert.equal(Array.isArray(linuxPackageCarrier.detected_package_managers), true);
    assert.equal(Object.hasOwn(linuxPackageCarrier, 'package_manager'), true);
    assert.equal(Object.hasOwn(linuxPackageCarrier, 'package_name'), true);
    assert.equal(Object.hasOwn(linuxPackageCarrier, 'installed_version'), true);
    assert.equal(linuxPackageCarrier.host_update_route_examples?.includes('sudo apt update && sudo apt install --only-upgrade one-person-lab'), true);
    assert.equal(linuxPackageCarrier.host_executor_required, true);
    assert.equal(linuxPackageCarrier.manual_required, true);
    assert.equal(linuxPackageCarrier.manual_required_when?.includes('repository_or_signature_configuration_required'), true);
    assert.equal(linuxPackageCarrier.managed_kernel_apply_allowed, false);
    assert.equal(installationCarrier.current.host_update_route, 'carrier_specific_host_update_route_required');
    assert.equal(
      (installationCarrier.current.host_update_route_examples as string[]).includes('sudo zypper update one-person-lab'),
      true,
    );
    assert.equal(
      (installationCarrier.current.host_update_route_examples as string[]).includes('docker compose pull && docker compose up -d'),
      true,
    );
    assert.equal(installationCarrier.receipt.apply_mode, 'projection_only');
    assert.equal(installationCarrier.receipt.status_detail.manual_required_targets_count, 2);
    assert.equal(installationCarrier.receipt.content_identity_fields.includes('carrier_type'), true);
    assert.equal(installationCarrier.receipt.content_identity_fields.includes('image_ref'), true);
    assert.equal(installationCarrier.authority_boundary.can_replace_docker_webui_image, false);
    assert.equal(installationCarrier.authority_boundary.can_run_docker_socket_or_host_executor, false);
    assert.equal(installationCarrier.authority_boundary.can_update_linux_package_carrier, false);
    assert.equal(installationCarrier.authority_boundary.can_claim_carrier_update_complete, false);
    assert.equal(
      installationCarrier.conditions.some((entry) =>
        entry.type === 'ManagedKernelApplyForbidden' && entry.status === 'True'
      ),
      true,
    );

    const runtime = output.managed_update.components.find((entry) => entry.component_id === 'runtime_substrate');
    assert.ok(runtime);
    assert.equal(runtime.provider_id, 'runtime_substrate');
    assert.equal(runtime.adapter_id, 'runtime_substrate_adapter');
    assert.equal(runtime.policy_id, 'silent_background_verified_stage_apply_on_next_restart');
    assert.equal(runtime.owner_route.route_kind, 'controlled_framework_executor');
    assert.equal(runtime.owner_route.readback_ref, 'opl system startup-maintenance --json');
    assert.equal(runtime.owner_route.package_manager_claim, false);
    assert.equal(runtime.state, 'update_available');
    assert.equal(typeof runtime.current.current_pointer, 'string');
    assert.equal(typeof runtime.current.staged_root, 'string');
    assert.equal(Object.hasOwn(runtime.current, 'rollback_pointer'), true);
    assert.equal(Object.hasOwn(runtime.current, 'opl_framework_runtime'), true);
    const frameworkRuntime = runtime.current.opl_framework_runtime as Record<string, unknown>;
    assert.equal(frameworkRuntime.command_ref, 'opl update apply --component runtime_substrate --json');
    assert.equal(frameworkRuntime.rollback_command_ref, 'opl update rollback --component runtime_substrate --json');
    assert.equal(typeof runtime.target?.staged_root, 'string');
    assert.equal(runtime.plan.command_refs.some((entry) => entry.command === 'opl system startup-maintenance --json'), true);
    assert.equal(runtime.receipt.schema_version, 'opl_managed_update_component_receipt.v1');
    assert.equal(runtime.receipt.source_manifest_ref, 'app-runtime-update-channel.json');
    assert.equal(runtime.receipt.verify_result, 'not_run_projection_only');
    assert.deepEqual(runtime.receipt.post_apply_hooks, ['startup_smoke', 'apply_opl_framework_runtime', 'swap_runtime_current_pointer_with_rollback']);
    assert.equal(runtime.receipt.content_identity_fields.includes('opl_framework_runtime'), true);
    assert.equal(runtime.authority_boundary.can_mutate_opl_framework_runtime, true);
    assert.equal(runtime.authority_boundary.can_mutate_homebrew, false);
    assert.equal(runtime.authority_boundary.can_mutate_global_npm, false);

    const agents = output.managed_update.components.find((entry) => entry.component_id === 'capability_packages');
    assert.ok(agents);
    assert.equal(agents.provider_id, 'capability_packages');
    assert.equal(agents.adapter_id, 'capability_packages_adapter');
    assert.equal(agents.policy_id, 'ordinary_user_non_development_silent_background');
    assert.equal(agents.owner_route.owner, 'one-person-lab-managed-modules');
    assert.equal(agents.owner_route.route_kind, 'clean_managed_package_executor');
    assert.match(agents.owner_route.authority_surface, /OCI\/content-addressed/);
    assert.equal(agents.owner_route.package_manager_claim, false);
    assert.equal(agents.current.tag_role, 'selector_only');
    assert.deepEqual(agents.current.oci_distribution, {
      descriptor_media_type: 'application/vnd.opl.capability-package.channel.v1+json',
      channel_ref: 'ghcr.io/gaofeng21cn/one-person-lab-manifest:stable',
      tag_role: 'selector_only',
      installed_receipt_must_record_digest: true,
      digest_field: 'to_digest',
    });
    assert.equal(agents.auto_apply.mode, 'auto_apply');
    assert.equal(agents.auto_apply.eligible, true);
    assert.equal(agents.auto_apply.app_background_safe, true);
    assert.equal(agents.auto_apply.command_ref, 'opl update apply --component capability_packages --json');
    assert.equal(agents.auto_apply.scope, 'clean_opl_managed_module_roots_only');
    assert.equal(agents.status_detail.auto_apply_eligible, true);
    assert.equal(agents.status_detail.app_background_safe, true);
    assert.equal(typeof agents.status_detail.clean_managed_targets_count, 'number');
    assert.equal(agents.status_detail.manual_required_targets_count, 0);
    assert.equal(agents.post_apply_guidance.reload_guidance.reload_recommended, true);
    assert.equal(agents.receipt.source_manifest_ref, 'ghcr.io/gaofeng21cn/one-person-lab-manifest:stable');
    assert.equal(agents.receipt.apply_mode, 'auto_apply');
    assert.equal(agents.receipt.status_detail.auto_apply_eligible, true);
    assert.equal(agents.receipt.status_detail.manual_required_targets_count, 0);
    assert.equal(agents.receipt.reload_guidance.reload_recommended, true);
    assert.deepEqual(agents.receipt.post_apply_hooks, [
      'reconcile_modules',
      'sync_skills',
      'sync_plugin_registry',
      'sync_plugin_packaged_skills',
      'sync_oma_generated_plugin_surface',
    ]);
    assert.equal(
      agents.conditions.some((entry) => entry.type === 'DigestPinned' && entry.reason === 'ChannelTagSelectorOnly'),
      true,
    );
    assert.equal(agents.authority_boundary.can_overwrite_dirty_checkout, false);
    assert.equal(agents.authority_boundary.can_write_domain_truth, false);

    const exposure = output.managed_update.components.find((entry) => entry.component_id === 'codex_surface');
    assert.ok(exposure);
    assert.equal(exposure.adapter_id, 'codex_surface_status_adapter');
    assert.equal(exposure.auto_apply.mode, 'projection_only');
    assert.equal(exposure.auto_apply.eligible, false);
    assert.equal(exposure.auto_apply.app_background_safe, false);
    assert.equal(exposure.auto_apply.command_ref, null);
    assert.equal(
      exposure.auto_apply.blocked_reasons.includes('codex_surface_is_post_apply_projection_only'),
      true,
    );
    assert.equal(exposure.receipt.source_manifest_ref, 'module_post_apply_projection');
    assert.equal(
      exposure.conditions.some((entry) => entry.type === 'DerivedProjection' && entry.status === 'True'),
      true,
    );

    const companionTools = output.managed_update.components.find((entry) => entry.component_id === 'companion_tools');
    assert.ok(companionTools);
    assert.equal(companionTools.adapter_id, 'companion_tools_status_adapter');
    assert.equal(companionTools.current.source, 'opl_companion_skill_sync_tools');

    const workflowProfile = output.managed_update.components.find((entry) => entry.component_id === 'workflow_profile');
    assert.ok(workflowProfile);
    assert.equal(workflowProfile.adapter_id, 'workflow_profile_adapter');
    assert.equal(workflowProfile.policy_id, 'semantic_merge_required_no_silent_overwrite');
    assert.equal(workflowProfile.state, 'current');
    assert.equal(workflowProfile.auto_apply.mode, 'projection_only');
    assert.equal(workflowProfile.auto_apply.eligible, false);
    assert.equal(workflowProfile.auto_apply.app_background_safe, false);
    assert.equal(workflowProfile.auto_apply.command_ref, null);
    assert.equal(
      workflowProfile.auto_apply.blocked_reasons.includes('workflow_profile_requires_codex_semantic_merge'),
      true,
    );
    assert.equal(workflowProfile.current.semantic_merge_required, true);
    assert.equal(workflowProfile.current.silent_overwrite_allowed, false);
    assert.deepEqual(workflowProfile.current.managed_profile_parts, [
      'codex_profile_agents',
      'codex_profile_taste',
      'codex_profile_prompts',
    ]);
    assert.equal(workflowProfile.receipt.source_manifest_ref, 'opl-flow://workflow-profile');
    assert.equal(workflowProfile.receipt.apply_mode, 'projection_only');
    assert.equal(workflowProfile.authority_boundary.can_write_user_codex_profile, false);
    assert.equal(workflowProfile.authority_boundary.can_silently_overwrite_agents_md, false);
    assert.equal(workflowProfile.authority_boundary.can_silently_overwrite_taste_md, false);
    assert.equal(workflowProfile.authority_boundary.can_silently_overwrite_prompts, false);
    assert.equal(
      workflowProfile.conditions.some((entry) => entry.type === 'SemanticMergeRequired' && entry.status === 'True'),
      true,
    );
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
  }
});

test('update plan can be scoped to capability packages and preserves safe command refs', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-managed-update-plan-'));
  const codexFixture = createFakeCodexFixture(`
if [ "$1" = "--version" ]; then
  echo "codex-cli 0.134.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 2
`);

  try {
    const output = runCli(['update', 'plan', '--component', 'capability_packages'], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_STATE_DIR: path.join(homeRoot, 'state'),
      OPL_MODULES_ROOT: path.join(homeRoot, 'modules'),
      OPL_FAMILY_WORKSPACE_ROOT: path.join(homeRoot, 'family'),
      OPL_CODEX_CLI_LATEST_VERSION: '0.134.0',
      PATH: `${codexFixture.fixtureRoot}:/usr/bin:/bin`,
    }) as {
      managed_update: {
        operation: string;
        requested_component_id: string;
        components: Array<{
          component_id: string;
          provider_id: string;
          plan: { command_refs: Array<{ action_id: string; command: string; mode: string; destructive: boolean }> };
          receipt: {
            schema_version: string;
            source_manifest_ref: string;
            content_identity_fields: string[];
            post_apply_hooks: string[];
            apply_mode: string;
            status_detail: { auto_apply_eligible: boolean | null; app_background_safe: boolean | null };
            reload_guidance: { reload_recommended: boolean };
          };
          auto_apply: { eligible: boolean; app_background_safe: boolean; command_ref: string | null };
          post_apply_guidance: { command_refs: string[]; reload_guidance: { reload_recommended: boolean } };
          authority_boundary: Record<string, boolean>;
        }>;
      };
    };

    assert.equal(output.managed_update.operation, 'plan');
    assert.equal(output.managed_update.requested_component_id, 'capability_packages');
    assert.equal(output.managed_update.components.length, 1);
    const agents = output.managed_update.components[0];
    assert.equal(agents.component_id, 'capability_packages');
    assert.equal(agents.provider_id, 'capability_packages');
    assert.equal(agents.receipt.schema_version, 'opl_managed_update_component_receipt.v1');
    assert.equal(agents.receipt.source_manifest_ref, 'ghcr.io/gaofeng21cn/one-person-lab-manifest:stable');
    assert.equal(agents.receipt.content_identity_fields.includes('digest'), true);
    assert.equal(agents.receipt.content_identity_fields.includes('sha256'), true);
    assert.equal(agents.receipt.post_apply_hooks.includes('sync_plugin_registry'), true);
    assert.equal(agents.receipt.apply_mode, 'auto_apply');
    assert.equal(agents.receipt.status_detail.auto_apply_eligible, true);
    assert.equal(agents.receipt.status_detail.app_background_safe, true);
    assert.equal(agents.receipt.reload_guidance.reload_recommended, true);
    assert.equal(agents.auto_apply.eligible, true);
    assert.equal(agents.auto_apply.app_background_safe, true);
    assert.equal(agents.auto_apply.command_ref, 'opl update apply --component capability_packages --json');
    assert.deepEqual(agents.post_apply_guidance.command_refs, [
      'opl connect reconcile-modules --json',
      'opl connect sync-skills --json',
    ]);
    assert.equal(agents.post_apply_guidance.reload_guidance.reload_recommended, true);
    assert.equal(agents.authority_boundary.can_overwrite_developer_checkout, false);
    assert.equal(
      agents.plan.command_refs.every((entry) => entry.destructive === false),
      true,
    );
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
  }
});

test('update apply does not execute the projection-only Installation Carrier component', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-managed-update-installation-carrier-apply-'));
  const codexFixture = createFakeCodexFixture(`
if [ "$1" = "--version" ]; then
  echo "codex-cli 0.134.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 2
`);

  try {
    const output = runCli(['update', 'apply', '--component', 'installation_carrier'], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_STATE_DIR: path.join(homeRoot, 'state'),
      OPL_MODULES_ROOT: path.join(homeRoot, 'modules'),
      OPL_CODEX_CLI_LATEST_VERSION: '0.134.0',
      PATH: `${codexFixture.fixtureRoot}:/usr/bin:/bin`,
    }) as {
      managed_update: {
        operation: string;
        operation_mode: string;
        requested_component_id: string;
        summary: { execution_status: string };
        components: Array<{
          component_id: string;
          auto_apply: {
            mode: string;
            eligible: boolean;
            app_background_safe: boolean;
            command_ref: string | null;
            blocked_reasons: string[];
          };
          current: { managed_kernel_apply_allowed: boolean };
          authority_boundary: Record<string, boolean>;
        }>;
        execution: {
          status: string;
          adapter_results: unknown[];
          receipt_record: { receipts: unknown[] };
        };
      };
    };

    assert.equal(output.managed_update.operation, 'apply');
    assert.equal(output.managed_update.operation_mode, 'controlled_apply');
    assert.equal(output.managed_update.requested_component_id, 'installation_carrier');
    assert.equal(output.managed_update.summary.execution_status, 'skipped');
    assert.equal(output.managed_update.components.length, 1);
    const component = output.managed_update.components[0];
    assert.equal(component.component_id, 'installation_carrier');
    assert.equal(component.auto_apply.mode, 'projection_only');
    assert.equal(component.auto_apply.eligible, false);
    assert.equal(component.auto_apply.app_background_safe, false);
    assert.equal(component.auto_apply.command_ref, null);
    assert.equal(
      component.auto_apply.blocked_reasons.includes('installation_carrier_requires_carrier_specific_host_update_route'),
      true,
    );
    assert.equal(component.current.managed_kernel_apply_allowed, false);
    assert.equal(component.authority_boundary.can_replace_docker_webui_image, false);
    assert.deepEqual(output.managed_update.execution.adapter_results, []);
    assert.deepEqual(output.managed_update.execution.receipt_record.receipts, []);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
  }
});

test('update apply does not execute the projection-only Codex Surface component', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-managed-update-codex-surface-apply-'));
  const codexFixture = createFakeCodexFixture(`
if [ "$1" = "--version" ]; then
  echo "codex-cli 0.134.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 2
`);

  try {
    const output = runCli(['update', 'apply', '--component', 'codex_surface'], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_STATE_DIR: path.join(homeRoot, 'state'),
      OPL_MODULES_ROOT: path.join(homeRoot, 'modules'),
      OPL_CODEX_CLI_LATEST_VERSION: '0.134.0',
      PATH: `${codexFixture.fixtureRoot}:/usr/bin:/bin`,
    }) as {
      managed_update: {
        operation: string;
        operation_mode: string;
        requested_component_id: string;
        summary: { execution_status: string };
        components: Array<{
          component_id: string;
          auto_apply: { mode: string; eligible: boolean; app_background_safe: boolean; command_ref: string | null };
        }>;
        execution: {
          status: string;
          adapter_results: unknown[];
          receipt_record: { receipts: unknown[] };
        };
      };
    };

    assert.equal(output.managed_update.operation, 'apply');
    assert.equal(output.managed_update.operation_mode, 'controlled_apply');
    assert.equal(output.managed_update.requested_component_id, 'codex_surface');
    assert.equal(output.managed_update.summary.execution_status, 'skipped');
    assert.equal(output.managed_update.components.length, 1);
    assert.equal(output.managed_update.components[0].component_id, 'codex_surface');
    assert.equal(output.managed_update.components[0].auto_apply.mode, 'projection_only');
    assert.equal(output.managed_update.components[0].auto_apply.eligible, false);
    assert.equal(output.managed_update.components[0].auto_apply.app_background_safe, false);
    assert.equal(output.managed_update.components[0].auto_apply.command_ref, null);
    assert.deepEqual(output.managed_update.execution.adapter_results, []);
    assert.deepEqual(output.managed_update.execution.receipt_record.receipts, []);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
  }
});

test('update apply does not execute the projection-only Workflow Profile component', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-managed-update-workflow-profile-apply-'));
  const codexFixture = createFakeCodexFixture(`
if [ "$1" = "--version" ]; then
  echo "codex-cli 0.134.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 2
`);

  try {
    const output = runCli(['update', 'apply', '--component', 'workflow_profile'], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_STATE_DIR: path.join(homeRoot, 'state'),
      OPL_MODULES_ROOT: path.join(homeRoot, 'modules'),
      OPL_CODEX_CLI_LATEST_VERSION: '0.134.0',
      PATH: `${codexFixture.fixtureRoot}:/usr/bin:/bin`,
    }) as {
      managed_update: {
        operation: string;
        operation_mode: string;
        requested_component_id: string;
        summary: { execution_status: string };
        components: Array<{
          component_id: string;
          auto_apply: {
            mode: string;
            eligible: boolean;
            app_background_safe: boolean;
            command_ref: string | null;
            blocked_reasons: string[];
          };
        }>;
        execution: {
          status: string;
          adapter_results: unknown[];
          receipt_record: { receipts: unknown[] };
        };
      };
    };

    assert.equal(output.managed_update.operation, 'apply');
    assert.equal(output.managed_update.operation_mode, 'controlled_apply');
    assert.equal(output.managed_update.requested_component_id, 'workflow_profile');
    assert.equal(output.managed_update.summary.execution_status, 'skipped');
    assert.equal(output.managed_update.components.length, 1);
    assert.equal(output.managed_update.components[0].component_id, 'workflow_profile');
    assert.equal(output.managed_update.components[0].auto_apply.mode, 'projection_only');
    assert.equal(output.managed_update.components[0].auto_apply.eligible, false);
    assert.equal(output.managed_update.components[0].auto_apply.app_background_safe, false);
    assert.equal(output.managed_update.components[0].auto_apply.command_ref, null);
    assert.equal(
      output.managed_update.components[0].auto_apply.blocked_reasons.includes(
        'workflow_profile_requires_codex_semantic_merge',
      ),
      true,
    );
    assert.deepEqual(output.managed_update.execution.adapter_results, []);
    assert.deepEqual(output.managed_update.execution.receipt_record.receipts, []);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
  }
});

test('update component filter keeps the retired agent_packages alias as a non-authoritative selector', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-managed-update-agent-packages-alias-'));
  const codexFixture = createFakeCodexFixture(`
if [ "$1" = "--version" ]; then
  echo "codex-cli 0.134.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 2
`);

  try {
    const output = runCli(['update', 'status', '--component', 'agent_packages'], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_STATE_DIR: path.join(homeRoot, 'state'),
      OPL_MODULES_ROOT: path.join(homeRoot, 'modules'),
      OPL_CODEX_CLI_LATEST_VERSION: '0.134.0',
      PATH: `${codexFixture.fixtureRoot}:/usr/bin:/bin`,
    }) as {
      managed_update: {
        requested_component_id: string;
        components: Array<{ component_id: string; provider_id: string }>;
      };
    };

    assert.equal(output.managed_update.requested_component_id, 'agent_packages');
    assert.equal(output.managed_update.components.length, 1);
    assert.equal(output.managed_update.components[0].component_id, 'capability_packages');
    assert.equal(output.managed_update.components[0].provider_id, 'capability_packages');
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
  }
});

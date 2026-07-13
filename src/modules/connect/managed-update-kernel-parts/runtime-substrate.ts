import { readOplFrameworkRuntimeUpdateStatus } from '../system-installation/framework-self-update.ts';
import { inspectBaseManagedDependencies } from '../base-managed-dependencies.ts';
import { resolveProjectRoot } from '../system-installation/shared.ts';
import {
  componentReceipt,
  condition,
  controlledCommand,
  KERNEL_LIFECYCLE,
  MANAGED_UPDATE_OWNER_ACTIONS,
  managedUpdateComponent,
  noReloadGuidance,
  ownerExecutionBoundary,
  ownerRoute,
  readOnlyCommand,
  statusDetail,
  type ManagedUpdateComponent,
  type ManagedUpdateComponentState,
} from '../managed-update-owner-boundary.ts';
import { asRecord, booleanValue, stringValue } from './shared.ts';

type RuntimeSubstrateComponentOptions = {
  allowFrameworkChannelLookup?: boolean;
  refreshManagedDependencyLatest?: boolean;
};

export function buildRuntimeSubstrateComponent(
  systemEnvironment: Record<string, unknown>,
  channel: string,
  options: RuntimeSubstrateComponentOptions = {},
): ManagedUpdateComponent {
  const coreEngines = asRecord(systemEnvironment.core_engines);
  const codex = asRecord(coreEngines?.codex);
  const runtimeSubstrate = asRecord(codex?.runtime_substrate_updater);
  const frameworkRuntime = readOplFrameworkRuntimeUpdateStatus(resolveProjectRoot(), {
    allowChannelLookup: options.allowFrameworkChannelLookup,
  });
  const dependencyCatalog = inspectBaseManagedDependencies(process.env.HOME?.trim() || process.cwd(), {
    refreshManagedLatest: options.refreshManagedDependencyLatest,
  });
  const dependencyRecords = dependencyCatalog.dependencies as Array<Record<string, unknown>>;
  const managedDependencyUpdateAvailable = dependencyRecords.some((entry) => (
    entry.update_mode === 'silent_managed' && entry.currentness === 'update_available'
  ));
  const codexDependency = dependencyRecords.find((entry) => entry.dependency_id === 'codex-cli');
  const installed = booleanValue(codex, 'installed') === true;
  const updateAvailable = booleanValue(codex, 'update_available') === true
    && codexDependency?.update_mode === 'silent_managed';
  const frameworkUpdateAvailable = frameworkRuntime.update_available && !frameworkRuntime.target_is_developer_checkout;
  const developerSourceOverride = frameworkRuntime.source_root_configured === true;
  const runtimeLatestStatus = stringValue(runtimeSubstrate, 'latest_version_status');
  const binarySource = stringValue(codex, 'binary_source');
  const currentPointer = runtimeSubstrate?.current_root ?? null;
  const stagedRoot = runtimeSubstrate?.staging_root ?? null;
  const rollbackPointer = runtimeSubstrate?.rollback_pointer ?? null;
  const state: ManagedUpdateComponentState =
    !installed
      ? 'failed_with_repair'
      : updateAvailable
        || (runtimeLatestStatus === 'outdated' && codexDependency?.update_mode === 'silent_managed')
        || frameworkUpdateAvailable
        || managedDependencyUpdateAvailable
        ? 'update_available'
        : 'current';
  const action = state === 'current' ? 'none' : state === 'failed_with_repair' ? 'install' : 'update';
  const postApplyHooks = ['startup_smoke', 'apply_opl_framework_runtime', 'swap_runtime_current_pointer_with_rollback'];
  const detail = statusDetail({
    component_state: state,
    post_apply_status: state === 'current' ? 'skipped' : 'not_run',
  });
  const reloadGuidance = noReloadGuidance();
  const route = ownerRoute({
    owner: 'one-person-lab-app-and-opl-framework',
    authority_surface: 'App-owned runtime root and OPL framework runtime artifact channel',
    route_kind: 'controlled_framework_executor',
    readback_ref: 'opl system startup-maintenance --json',
    apply_owner: 'opl_runtime_substrate_materializer',
    forbidden_claims: [
      'opl_base_update_is_opl_app_update',
      'runtime_substrate_update_mutates_global_toolchain',
      'managed_update_kernel_is_package_manager',
    ],
  });

  return managedUpdateComponent({
    lifecycle_owner: 'opl_base',
    component_id: 'opl_base',
    provider_id: 'runtime_substrate',
    adapter_id: 'runtime_substrate_adapter',
    component_class: 'opl_base',
    coordination_role: 'executable_target',
    policy_id: 'silent_background_verified_stage_apply_on_next_restart',
    owner_route: route,
    owner_execution_boundary: ownerExecutionBoundary(route, {
      owner_executor_id: 'opl_runtime_substrate_materializer',
      executor_kind: 'controlled_framework_executor',
      runner_can_execute: true,
      allowed_operations: ['apply', 'repair', MANAGED_UPDATE_OWNER_ACTIONS.revert], // reuse-first: allow App-owned runtime materializer operations.
      receipt_projection: 'component_receipt_with_owner_route',
      diagnostic_only: false,
      notes: [
        'Runner may only mutate App-owned runtime roots and must keep system package managers and global toolchains read-only.',
      ],
    }),
    label: 'OPL Base',
    state,
    channel,
    current: {
      codex_version: codex?.version ?? null,
      parsed_version: codex?.parsed_version ?? null,
      latest_version: codex?.latest_version ?? null,
      selected_binary_path: codex?.binary_path ?? null,
      selected_binary_source: binarySource,
      current_pointer: currentPointer,
      staged_root: stagedRoot,
      rollback_pointer: rollbackPointer,
      embedded_codex_executor: {
        executor_id: 'embedded_codex_executor',
        selected_binary_path: codex?.binary_path ?? null,
        selected_binary_source: binarySource,
      },
      opl_framework_runtime: frameworkRuntime,
      runtime_substrate_updater: runtimeSubstrate,
      dependency_catalog: dependencyCatalog,
      owner_route: {
        route_kind: 'controlled_framework_executor',
        readback_ref: 'opl system startup-maintenance --json',
      },
    },
    target: state === 'current'
      ? null
      : {
        codex_latest_version: codex?.latest_version ?? null,
        opl_framework_runtime: frameworkUpdateAvailable
          ? {
            target_root: frameworkRuntime.target_root,
            source_archive: frameworkRuntime.source_archive,
            source_root: frameworkRuntime.source_root,
            rollback_ref: frameworkRuntime.rollback_ref,
          }
          : null,
        staged_root: stagedRoot,
        current_pointer: currentPointer,
        rollback_pointer: rollbackPointer,
      },
    conditions: [
      condition(
        'Ready',
        state === 'current' ? 'True' : 'False',
        state === 'current' ? 'RuntimeSubstrateCurrent' : 'RuntimeSubstrateNeedsMaintenance',
        state === 'current'
          ? 'App-owned runtime substrate projection is current.'
          : 'App-owned runtime substrate maintenance is available through controlled OPL commands.',
      ),
      condition(
        'GlobalMutationBlocked',
        'True',
        'AppOwnedRuntimeOnly',
        'Managed runtime updates must not mutate user Homebrew, global npm, system PATH Codex, or system Temporal.',
      ),
      condition(
        'OplFrameworkRuntimeUpdate',
        frameworkUpdateAvailable ? 'True' : 'False',
        frameworkRuntime.target_is_developer_checkout
          ? 'FrameworkDeveloperCheckoutSkipped'
          : frameworkUpdateAvailable
            ? 'FrameworkRuntimeUpdateConfigured'
            : 'FrameworkRuntimeUpdateSourceNotConfigured',
        frameworkRuntime.target_is_developer_checkout
          ? 'OPL Framework runtime target is a developer checkout and is not mutated by managed runtime updates.'
          : frameworkUpdateAvailable
            ? 'OPL Framework runtime archive or source is configured for controlled runtime_substrate apply.'
            : 'OPL Framework runtime self-update is idle until an explicit runtime artifact or source is configured.',
      ),
    ],
    lifecycle: KERNEL_LIFECYCLE,
    postApplyHooks,
    auto_apply: {
      mode: 'controlled_apply',
      eligible: state !== 'current' && !developerSourceOverride,
      app_background_safe: state !== 'current' && !developerSourceOverride,
      scope: 'app_owned_runtime_root_only',
      command_ref: state === 'current' || developerSourceOverride ? null : 'opl update apply --json',
      blocked_reasons: developerSourceOverride ? ['developer_framework_source_override_detect_only'] : [],
    },
    status_detail: detail,
    post_apply_guidance: {
      required: state !== 'current',
      command_refs: state === 'current' ? [] : ['opl system startup-maintenance --json'],
      reload_guidance: reloadGuidance,
    },
    plan: {
      action,
      summary: state === 'current'
        ? 'No runtime substrate update is required.'
        : 'Stage and verify App-owned runtime substrate payloads through startup maintenance or engine update.',
      command_refs: state === 'current'
        ? [
          readOnlyCommand(
            'inspect_system_environment',
            'opl system --json',
            'Read the runtime substrate environment projection.',
          ),
        ]
        : [
          controlledCommand(
            'run_startup_maintenance',
            'opl system startup-maintenance --json',
            'Stage, verify, and apply App-owned runtime maintenance without global tool mutation.',
          ),
          controlledCommand(
            'update_embedded_codex_executor',
            'opl engine update --engine codex --json',
            'Refresh the App-owned embedded Codex executor when the selected substrate is outdated.',
          ),
        ],
    },
    receipt: componentReceipt({
      component_id: 'opl_base',
      sourceManifestRef: 'app-runtime-update-channel.json',
      from_version: typeof codex?.version === 'string' ? codex.version : null,
      to_version: typeof codex?.latest_version === 'string' ? codex.latest_version : null,
      postApplyHooks,
      apply_mode: 'controlled_apply',
      status_detail: detail,
      reload_guidance: reloadGuidance,
      repair_action: state === 'failed_with_repair' ? 'run_startup_maintenance' : null,
      contentIdentityFields: ['runtime_version', 'sha256', 'current_pointer', 'staged_root', 'opl_framework_runtime'],
    }),
    authority_boundary: {
      can_mutate_app_owned_runtime_root: true,
      can_mutate_opl_framework_runtime: true,
      can_swap_current_pointer: true,
      can_rollback_pointer: true,
      can_rollback_opl_framework_runtime: frameworkRuntime.previous_root_available,
      can_mutate_homebrew: false,
      can_mutate_global_npm: false,
      can_mutate_system_path_tools: false,
      can_claim_domain_ready: false,
    },
    notes: [
      'Runtime substrate updates share the managed update kernel lifecycle but keep an App-owned runtime authority boundary.',
      'Compatible newer system tools may be selected at runtime after checks; they are not silently upgraded by OPL.',
      'Verified Homebrew or global npm dependencies may expose explicit owner-delegated App actions, but they never enter Base auto-apply.',
    ],
  });
}

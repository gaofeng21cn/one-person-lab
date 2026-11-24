import { readOplUpdateChannel, readOplWorkspaceRoot } from '../../kernel/system-preferences.ts';
import type { FrameworkContracts } from '../../kernel/types.ts';
import { resolveCodexVersion } from './system-installation/engine-helpers.ts';
import { packageBackgroundUpdatePolicy } from './agent-package-registry/registry-status-projection.ts';
import {
  discoverCurrentOwnerPackageDescriptors,
  discoverInstalledPackageDescriptors,
  installedDescriptorMatchesConfiguredCarrier,
  type InstalledPackageDescriptor,
} from './agent-package-registry/installed-codex-plugin-directory.ts';
import {
  managedUpdateComponentReceiptLedgerFilePath,
} from './managed-update-component-receipts.ts';
import { managedUpdateLockFilePath, MANAGED_UPDATE_LOCK_STALE_AFTER_SECONDS } from './managed-update-lock.ts';
import {
  bindOwnerReceiptProjection,
  COMPONENT_RECEIPT_REQUIRED_FIELDS,
  componentReceipt,
  condition,
  controlledCommand,
  filterManagedUpdateComponents,
  KERNEL_LIFECYCLE,
  MANAGED_UPDATE_OWNER_ACTIONS,
  MANAGED_UPDATE_KERNEL_ID,
  managedUpdateComponent,
  managedUpdateOperationMode,
  managedUpdateReceiptWritePolicy,
  manualCommand,
  noAutoApply,
  noReloadGuidance,
  ownerExecutionBoundary,
  ownerRoute,
  readOnlyCommand,
  STATE_VOCABULARY,
  statusDetail,
  summarizeManagedUpdateComponents,
  type ManagedUpdateComponent,
  type ManagedUpdateComponentState,
  type ManagedUpdateCondition,
  type ManagedUpdateConditionStatus,
  type ManagedUpdateKernelInput,
  type ManagedUpdateProviderId,
  type ManagedUpdateReceiptStatusDetail,
  type ManagedUpdateReloadGuidance,
} from './managed-update-owner-boundary.ts';
import { buildInstallationCarrierComponent } from './managed-update-kernel/installation-carrier.ts';
import { buildRuntimeSubstrateComponent } from './managed-update-kernel/runtime-substrate.ts';

function requestedComponentId(componentId: string | undefined) {
  const requested = componentId?.trim();
  return requested || null;
}

function shouldBuildComponent(requested: string | null, componentId: string) {
  return !requested || requested === componentId;
}

function buildManagedUpdateRuntimeEnvironment(
  operation: ManagedUpdateKernelInput['operation'],
  allowExternalProbes: boolean,
) {
  return {
    core_engines: {
      codex: resolveCodexVersion({
        skipLatestLookup: !allowExternalProbes,
        preferOfflineLatestLookup: allowExternalProbes && operation === 'status',
      }),
    },
  };
}

function packageProjection(
  descriptor: InstalledPackageDescriptor,
  currentOwner?: InstalledPackageDescriptor | null,
) {
  const callable = descriptor.readiness.installed
    && descriptor.readiness.physical_status === 'available'
    && (descriptor.readiness.projection_callability ?? descriptor.readiness.callability) === 'callable';
  return {
    package_id: descriptor.manifest.package_id,
    label: descriptor.manifest.display_name,
    state: callable ? 'currentness_not_checked' as const : 'failed_with_repair' as const,
    background_update: packageBackgroundUpdatePolicy(descriptor, undefined, currentOwner),
    installed_owner_descriptor: {
      manifest_path: descriptor.manifestPath,
      manifest_sha256: descriptor.manifest_sha256,
      package_version: descriptor.manifest.version,
      source_path: descriptor.sourcePath,
    },
    native_carrier: {
      ...descriptor.carrier_readback,
      plugin_id: descriptor.pluginId,
      marketplace_source: descriptor.marketplaceSource,
      readiness: descriptor.readiness,
    },
  };
}

function buildCapabilityPackagesComponent(
  descriptors: InstalledPackageDescriptor[],
  currentOwners: Map<string, InstalledPackageDescriptor>,
  channel: string,
  operation: ManagedUpdateKernelInput['operation'],
): ManagedUpdateComponent {
  const packageStates = descriptors.map((descriptor) => packageProjection(descriptor, currentOwners.get(descriptor.manifest.package_id) ?? null));
  const failedCount = packageStates.filter((entry) => entry.state === 'failed_with_repair').length;
  const eligibleCount = packageStates.filter((entry) => entry.background_update.eligible).length;
  const actionRequested = operation === 'apply' || operation === 'repair';
  const autoApplyEligible = ['check', 'plan', 'apply'].includes(operation) && eligibleCount > 0;
  const state: ManagedUpdateComponentState = failedCount > 0
    ? 'failed_with_repair'
    : packageStates.length > 0 ? 'currentness_not_checked' : 'current';
  const action = autoApplyEligible
    ? 'update'
    : failedCount > 0
    ? 'manual_review'
    : operation === 'repair' && packageStates.length > 0
      ? 'install'
      : operation === 'apply' && packageStates.length > 0
        ? 'update'
        : 'none';
  const postApplyHooks: string[] = [];
  const reloadGuidance = noReloadGuidance();
  const detail = statusDetail({
    component_state: state,
    auto_apply_eligible: autoApplyEligible,
    app_background_safe: eligibleCount > 0,
    clean_managed_targets_count: eligibleCount,
    failed_targets_count: failedCount,
    post_apply_status: actionRequested ? 'not_run' : 'skipped',
    reload_status: failedCount > 0 ? 'manual_required' : 'not_required',
  });
  const route = ownerRoute({
    owner: 'installed-package-owner-descriptors',
    authority_surface: 'Installed owner descriptors and native carrier presence/callability readback',
    route_kind: 'clean_managed_package_executor',
    readback_ref: 'opl packages list --json',
    apply_owner: 'opl_connect_native_package_carrier',
    forbidden_claims: [
      'capability_package_currentness_is_domain_ready',
      'capability_package_channel_signs_owner_receipt',
      'managed_update_kernel_is_package_manager',
    ],
  });
  const updateCommand = operation === 'repair'
    ? 'opl packages repair --package-id <package_id> --json'
    : 'opl packages update --json';

  return managedUpdateComponent({
    lifecycle_owner: 'opl_packages',
    component_id: 'opl_packages',
    provider_id: 'capability_packages',
    adapter_id: 'capability_packages_adapter',
    component_class: 'opl_packages',
    coordination_role: 'executable_target',
    policy_id: 'native_carrier_owner_delegation',
    owner_route: route,
    owner_execution_boundary: ownerExecutionBoundary(route, {
      owner_executor_id: 'opl_connect_native_package_carrier',
      executor_kind: 'clean_managed_package_executor',
      runner_can_execute: true,
      allowed_operations: ['apply', 'repair'],
      receipt_projection: 'external_owner_receipt_required',
      diagnostic_only: false,
      notes: [
        'Framework delegates the request; the native carrier owns mutation, rollback, and currentness.',
      ],
    }),
    label: 'OPL Packages',
    state,
    channel,
    current: {
      currentness_authority: 'installed_owner_descriptor_and_native_carrier',
      projection_source: 'installed_owner_descriptor',
      installed_package_count: packageStates.length,
      package_states: packageStates,
    },
    target: actionRequested && packageStates.length > 0
      ? { source: 'owner-selected native carrier update' }
      : null,
    conditions: [
      condition(
        'Ready',
        failedCount === 0 ? 'True' : 'False',
        failedCount === 0 ? 'InstalledPackageCarriersReady' : 'InstalledPackageCarrierAttentionRequired',
        failedCount === 0
          ? 'Installed owner descriptors and native carriers are callable.'
          : 'At least one installed Package native carrier requires owner repair.',
      ),
    ],
    lifecycle: KERNEL_LIFECYCLE,
    postApplyHooks,
    auto_apply: {
      mode: autoApplyEligible ? 'auto_apply' : failedCount > 0 ? 'manual_required' : 'projection_only',
      eligible: autoApplyEligible,
      app_background_safe: eligibleCount > 0,
      scope: 'installed_package_owner_channels_only',
      command_ref: autoApplyEligible ? updateCommand : null,
      blocked_reasons: failedCount > 0 ? ['native_carrier_attention_required'] : [],
    },
    status_detail: detail,
    post_apply_guidance: {
      required: false,
      command_refs: [],
      reload_guidance: reloadGuidance,
    },
    plan: {
      action,
      summary: action === 'none'
        ? 'Installed Package callability was read back; upstream freshness has not been checked.'
        : action === 'manual_review'
          ? 'One or more installed Package carriers require owner repair.'
          : 'Refresh eligible installed Packages through their native carriers and verify fresh callability.',
      command_refs: action === 'manual_review'
        ? [manualCommand('inspect_packages', 'opl packages list --json', 'Inspect native carrier blockers.')]
        : action === 'none'
          ? [readOnlyCommand('inspect_packages', 'opl packages list --json', 'Read installed Package carrier state.')]
          : [controlledCommand('update_packages', updateCommand, 'Delegate to installed Package native carriers.')],
    },
    receipt: componentReceipt({
      component_id: 'opl_packages',
      sourceManifestRef: null,
      postApplyHooks,
      required: false,
      apply_mode: autoApplyEligible ? 'auto_apply' : failedCount > 0 ? 'manual_required' : 'projection_only',
      status_detail: detail,
      reload_guidance: reloadGuidance,
      repair_action: failedCount > 0 ? 'repair_installed_package_owner' : null,
      contentIdentityFields: [],
    }),
    authority_boundary: {
      can_delegate_installed_owner_package_updates: true,
      can_overwrite_dirty_checkout: false,
      can_overwrite_developer_checkout: false,
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_claim_quality_or_export_verdict: false,
    },
    notes: [
      'Ordinary Package state comes only from installed owner descriptors and native carrier readback.',
      'Framework does not own Package locks, payload materialization, rollback, or a second currentness ledger.',
    ],
  });
}

export async function buildManagedUpdateKernelProjection(
  contracts: FrameworkContracts,
  input: ManagedUpdateKernelInput,
  options: { allowExternalProbes?: boolean } = {},
) {
  const channel = readOplUpdateChannel().channel;
  const requested = requestedComponentId(input.componentId);
  const allowExternalProbes = options.allowExternalProbes !== false;
  const components: ManagedUpdateComponent[] = [];

  if (shouldBuildComponent(requested, 'opl_app')) {
    components.push(buildInstallationCarrierComponent(channel, {
      allowNetworkLookup: allowExternalProbes,
    }));
  }
  if (shouldBuildComponent(requested, 'opl_base')) {
    components.push(buildRuntimeSubstrateComponent(
      buildManagedUpdateRuntimeEnvironment(input.operation, allowExternalProbes),
      channel,
      {
        allowFrameworkChannelLookup: allowExternalProbes
          && (input.operation === 'check' || input.operation === 'plan' || input.operation === 'apply'),
        refreshManagedDependencyLatest: allowExternalProbes && input.operation !== 'status',
        inspectExternalDependencyOwners: allowExternalProbes,
      },
    ));
  }
  if (shouldBuildComponent(requested, 'opl_packages')) {
    const descriptors = [...discoverInstalledPackageDescriptors().values()]
      .filter((descriptor) => installedDescriptorMatchesConfiguredCarrier(descriptor)
        && descriptor.carrier_readback.kind !== 'project_local_owner_projection');
    const currentOwners = discoverCurrentOwnerPackageDescriptors();
    components.push(buildCapabilityPackagesComponent(descriptors, currentOwners, channel, input.operation));
  }
  const selectedComponents = filterManagedUpdateComponents(
    components,
    requested ?? undefined,
  ).map(bindOwnerReceiptProjection);

  return {
    version: 'g2',
    managed_update: {
      surface_id: MANAGED_UPDATE_KERNEL_ID,
      operation: input.operation,
      operation_mode: managedUpdateOperationMode(input.operation),
      update_channel: channel,
      workspace_root: readOplWorkspaceRoot(),
      requested_component_id: requested,
      requested_lifecycle_owner: requested ? selectedComponents[0]?.lifecycle_owner ?? null : null,
      requested_receipt_id: input.receiptId ?? null,
      lifecycle: KERNEL_LIFECYCLE,
      state_vocabulary: STATE_VOCABULARY,
      idempotency_lock: {
        lock_id: `${MANAGED_UPDATE_KERNEL_ID}.global`,
        lock_scope: 'single_writer_for_owner_delegated_apply_or_runtime_apply',
        read_operations: ['status', 'check', 'plan'],
        exclusive_operations: ['apply', 'repair', MANAGED_UPDATE_OWNER_ACTIONS.revert],
        status: 'not_acquired_for_projection',
        lock_file: managedUpdateLockFilePath(),
        stale_after_seconds: MANAGED_UPDATE_LOCK_STALE_AFTER_SECONDS,
        contention_policy: 'report_in_progress_or_skip_without_parallel_owner_mutation',
      },
      summary: summarizeManagedUpdateComponents(selectedComponents),
      components: selectedComponents,
      repair_actions: selectedComponents.flatMap((component) => component.plan.command_refs),
      receipts: {
        receipt_id: input.receiptId ?? null,
        receipt_store: 'runtime_substrate_component_receipts_only',
        component_receipt_schema: 'opl_managed_update_component_receipt.v1',
        component_receipt_ledger_file: managedUpdateComponentReceiptLedgerFilePath(),
        required_fields: COMPONENT_RECEIPT_REQUIRED_FIELDS,
        write_policy: managedUpdateReceiptWritePolicy(input.operation),
      },
      authority_boundary: {
        can_mutate_app_owned_runtime_root: false,
        can_mutate_installation_carrier: false,
        can_replace_docker_webui_image: false,
        can_update_linux_package_carrier: false,
        can_claim_carrier_update_complete: false,
        can_delegate_installed_owner_package_updates: false,
        can_mutate_user_global_homebrew: false,
        can_mutate_user_global_npm: false,
        can_mutate_system_path_tools: false,
        can_overwrite_dirty_or_developer_checkout: false,
        can_write_domain_truth: false,
        can_write_domain_memory_body: false,
        can_mutate_domain_artifact_body: false,
        can_create_owner_receipt: false,
        can_claim_quality_or_export_verdict: false,
      },
      notes: [
        'Public lifecycle ownership is limited to OPL Base, OPL App, and OPL Packages.',
        'OPL Packages delegates installed owner descriptors to their native carrier path.',
        'OPL App replacement remains App-owned and must not be claimed by opl update apply.',
        'Real artifact fetch/verify/stage/activate remains provider-specific; this surface exposes the shared state machine and safe action refs.',
        'Package freshness and runtime maintenance do not imply domain readiness, owner receipt authority, artifact authority, quality verdict, or export readiness.',
      ],
    },
  };
}

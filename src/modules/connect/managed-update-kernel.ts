import { readOplUpdateChannel, readOplWorkspaceRoot } from '../../kernel/system-preferences.ts';
import type { FrameworkContracts } from '../../kernel/types.ts';
import { resolveCodexVersion } from './system-installation/engine-helpers.ts';
import { buildOplModules } from './system-installation/modules.ts';
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
  MANAGED_UPDATE_OWNER_FIELDS,
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
import { buildInstallationCarrierComponent } from './managed-update-kernel-parts/installation-carrier.ts';
import { buildRuntimeSubstrateComponent } from './managed-update-kernel-parts/runtime-substrate.ts';
import { asRecord, booleanValue, stringValue } from './managed-update-kernel-parts/shared.ts';

function requestedComponentId(componentId: string | undefined) {
  const requested = componentId?.trim();
  return requested || null;
}

function shouldBuildComponent(requested: string | null, componentId: string) {
  return !requested || requested === componentId;
}

function buildManagedUpdateRuntimeEnvironment(operation: ManagedUpdateKernelInput['operation']) {
  return {
    core_engines: {
      codex: resolveCodexVersion({
        preferOfflineLatestLookup: operation === 'status',
      }),
    },
  };
}

function moduleState(module: Record<string, unknown>): ManagedUpdateComponentState {
  const installed = booleanValue(module, 'installed') === true;
  const healthStatus = stringValue(module, 'health_status');
  const recommendedAction = stringValue(module, 'recommended_action');
  const installOrigin = stringValue(module, 'install_origin');
  const git = asRecord(module.git);
  const dirty = booleanValue(git, 'dirty') === true;
  const syncStatus = stringValue(git, 'sync_status');
  if (!installed || healthStatus === 'missing') {
    return 'failed_with_repair';
  }
  if (
    dirty
    || healthStatus === 'dirty'
    || healthStatus === 'invalid_checkout'
    || installOrigin === 'env_override'
    || installOrigin === 'sibling_workspace'
    || syncStatus === 'ahead'
    || syncStatus === 'diverged'
    || syncStatus === 'no_upstream'
    || syncStatus === 'unknown'
  ) {
    return 'skipped_manual_required';
  }
  if (recommendedAction === 'update') {
    return 'update_available';
  }
  return 'current';
}

function buildCapabilityPackagesComponent(modules: Record<string, unknown>[], channel: string): ManagedUpdateComponent {
  const defaultModules = modules.filter((entry) => booleanValue(entry, 'default_install') === true);
  const moduleStates = defaultModules.map((entry) => ({
    module_id: stringValue(entry, 'module_id'),
    label: stringValue(entry, 'label'),
    state: moduleState(entry),
    install_origin: stringValue(entry, 'install_origin'),
    checkout_path: stringValue(entry, 'checkout_path'),
    managed_checkout_path: stringValue(entry, 'managed_checkout_path'),
    source_policy: entry.source_policy ?? null,
    git: entry.git ?? null,
  }));
  const failedWithRepairCount = moduleStates.filter((entry) => entry.state === 'failed_with_repair').length;
  const updateCount = moduleStates.filter((entry) => entry.state === 'update_available').length;
  const manualCount = moduleStates.filter((entry) => entry.state === 'skipped_manual_required').length;
  const cleanManagedTargetsCount = defaultModules.length - manualCount;
  const state: ManagedUpdateComponentState =
    manualCount > 0
      ? 'skipped_manual_required'
      : failedWithRepairCount > 0
        ? 'failed_with_repair'
        : updateCount > 0
          ? 'update_available'
          : 'current';
  const action = manualCount > 0
    ? 'manual_review'
    : failedWithRepairCount > 0
      ? 'install'
      : updateCount > 0
        ? 'update'
        : 'none';
  const postApplyHooks = [
    'reconcile_modules',
    'sync_skills',
    'sync_plugin_registry',
    'sync_plugin_packaged_skills',
    'sync_oma_generated_plugin_surface',
  ];
  const cleanManagedScopeSafe = manualCount === 0 && cleanManagedTargetsCount > 0;
  const autoApplyEligible = cleanManagedScopeSafe && action !== 'none';
  const reloadRecommended = autoApplyEligible;
  const reloadGuidance: ManagedUpdateReloadGuidance = reloadRecommended
    ? {
      reload_required: false,
      reload_recommended: true,
      reload_targets: ['one_person_lab_app', 'codex_plugin_cache'],
      command_ref: 'Reload One Person Lab App or Codex plugin cache',
      reason: 'Codex may cache plugin metadata until App/Codex reload after managed module package changes.',
    }
    : noReloadGuidance();
  const detail = statusDetail({
    component_state: state,
    auto_apply_eligible: autoApplyEligible,
    app_background_safe: cleanManagedScopeSafe,
    clean_managed_targets_count: cleanManagedTargetsCount,
    manual_required_targets_count: manualCount,
    post_apply_status: action === 'none' ? 'skipped' : 'not_run',
    reload_status: reloadRecommended ? 'recommended' : manualCount > 0 ? 'manual_required' : 'not_required',
  });
  const route = ownerRoute({
    owner: 'one-person-lab-managed-modules',
    authority_surface: 'OCI/content-addressed capability package channel and clean managed module roots',
    route_kind: 'clean_managed_package_executor',
    readback_ref: 'opl connect modules --json',
    apply_owner: 'opl_connect_managed_module_reconciler',
    forbidden_claims: [
      'capability_package_currentness_is_domain_ready',
      'capability_package_channel_signs_owner_receipt',
      'managed_update_kernel_is_package_manager',
    ],
  });

  return managedUpdateComponent({
    lifecycle_owner: 'opl_packages',
    component_id: 'opl_packages',
    provider_id: 'capability_packages',
    adapter_id: 'capability_packages_adapter',
    component_class: 'opl_packages',
    coordination_role: 'executable_target',
    policy_id: 'ordinary_user_non_development_silent_background',
    owner_route: route,
    owner_execution_boundary: ownerExecutionBoundary(route, {
      owner_executor_id: 'opl_connect_managed_module_reconciler',
      executor_kind: 'clean_managed_package_executor',
      runner_can_execute: true,
      allowed_operations: ['apply', 'repair', MANAGED_UPDATE_OWNER_ACTIONS.revert], // reuse-first: allow clean content-addressed module roots only.
      receipt_projection: 'component_receipt_with_owner_route',
      diagnostic_only: false,
      notes: [
        'Runner is limited to clean managed module roots with digest/source identity; it does not own domain truth or package-manager semantics.',
      ],
    }),
    label: 'OPL Packages',
    state,
    channel,
    current: {
      channel_manifest: 'ghcr.io/gaofeng21cn/one-person-lab-manifest:latest',
      tag_role: 'selector_only',
      transaction_guards: {
        installed_digest_required: true,
        content_identity_fields: ['digest', 'sha256', 'source_fingerprint', 'git_head_sha'],
        dirty_checkout_policy: 'fail_closed_no_overwrite',
        developer_checkout_policy: 'fail_closed_no_auto_update',
        codex_skill_plugin_sync: 'same_transaction_post_apply',
        profile_semantic_merge: 'fail_closed_owner_handoff',
        receipt_policy: 'single_package_transaction_receipt',
      },
      oci_distribution: {
        descriptor_media_type: 'application/vnd.opl.capability-package.channel.v1+json',
        channel_ref: 'ghcr.io/gaofeng21cn/one-person-lab-manifest:latest',
        tag_role: 'selector_only',
        installed_receipt_must_record_digest: true,
        digest_field: MANAGED_UPDATE_OWNER_FIELDS.toDigest,
      },
      default_modules_count: defaultModules.length,
      module_states: moduleStates,
    },
    target: state === 'current'
      ? null
      : {
        source: 'GHCR one-person-lab-manifest channel target',
        content_identity: 'digest_or_source_fingerprint_required_in_receipt',
        oci_descriptor: {
          media_type: 'application/vnd.opl.capability-package.channel.v1+json',
          digest_required: true,
          digest_algorithm: 'sha256',
        },
      },
    conditions: [
      condition(
        'Ready',
        state === 'current' ? 'True' : 'False',
        state === 'current' ? 'CapabilityPackagesCurrent' : 'CapabilityPackageMaintenanceAvailable',
        state === 'current'
          ? 'Managed default capability packages are current or have no clean update available.'
          : 'Managed package-channel maintenance is available for clean OPL module roots.',
      ),
      condition(
        'DigestPinned',
        'Unknown',
        'ChannelTagSelectorOnly',
        'GHCR latest is a rolling channel selector; installed receipts must record digest, sha256, source fingerprint, or git head.',
      ),
      condition(
        'DeveloperCheckoutProtected',
        manualCount > 0 ? 'False' : 'True',
        manualCount > 0 ? 'ManualSourceVisible' : 'CleanManagedRootsOnly',
        manualCount > 0
          ? 'At least one module is dirty, developer-sourced, or otherwise manual; silent update is blocked for that module.'
          : 'Silent capability package updates are limited to clean OPL-managed module roots.',
      ),
    ],
    lifecycle: KERNEL_LIFECYCLE,
    postApplyHooks,
    auto_apply: {
      mode: cleanManagedScopeSafe ? 'auto_apply' : 'manual_required',
      eligible: autoApplyEligible,
      app_background_safe: cleanManagedScopeSafe,
      scope: 'clean_opl_managed_module_roots_only',
      command_ref: autoApplyEligible ? 'opl packages update --json' : null,
      blocked_reasons: manualCount > 0
        ? ['manual_or_developer_checkout_visible']
        : [],
    },
    status_detail: detail,
    post_apply_guidance: {
      required: autoApplyEligible,
      command_refs: autoApplyEligible
        ? ['opl connect reconcile-modules --json', 'opl connect sync-skills --json']
        : [],
      reload_guidance: reloadGuidance,
    },
    plan: {
      action,
      summary: action === 'none'
        ? 'No managed capability package maintenance is required.'
        : action === 'manual_review'
          ? 'Manual review is required before OPL can update one or more capability package roots.'
          : 'Reconcile managed modules from the GHCR package channel, then sync Codex-visible skills and plugins.',
      command_refs: action === 'manual_review'
        ? [
          manualCommand(
            'inspect_connect_modules',
            'opl connect modules --json',
            'Inspect manual, dirty, ahead, diverged, or developer checkout module state.',
          ),
        ]
        : action === 'none'
          ? [
            readOnlyCommand(
              'inspect_connect_modules',
              'opl connect modules --json',
              'Read the managed package-channel projection.',
            ),
          ]
          : [
            controlledCommand(
              'reconcile_managed_modules',
              'opl connect reconcile-modules --json',
              'Install missing modules and update clean managed package-channel modules.',
            ),
            controlledCommand(
              'sync_codex_skills',
              'opl connect sync-skills --json',
              'Refresh plugin-packaged skills and generated Codex-visible surfaces after module changes.',
            ),
          ],
    },
    receipt: componentReceipt({
      component_id: 'opl_packages',
      sourceManifestRef: 'ghcr.io/gaofeng21cn/one-person-lab-manifest:latest',
      postApplyHooks,
      apply_mode: cleanManagedScopeSafe ? 'auto_apply' : 'manual_required',
      status_detail: detail,
      reload_guidance: reloadGuidance,
      repair_action: state === 'failed_with_repair' ? 'reconcile_managed_modules' : null,
      contentIdentityFields: ['digest', 'sha256', 'source_fingerprint', 'git_head_sha'],
    }),
    authority_boundary: {
      can_silently_update_clean_managed_modules: true,
      can_overwrite_dirty_checkout: false,
      can_overwrite_developer_checkout: false,
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_claim_quality_or_export_verdict: false,
    },
    notes: [
      'GHCR package channel is the ordinary non-development source for managed capability packages.',
      'Package-channel freshness does not claim domain readiness, artifact authority, quality verdict, or export readiness.',
    ],
  });
}

function buildCodexProjectionStatus(capabilityPackages: ManagedUpdateComponent) {
  const needsReload = capabilityPackages.plan.command_refs.some((entry) => entry.action_id === 'sync_codex_skills');
  return {
    status: needsReload ? 'needs_reload' : 'current',
    codex_skill_plugin_sync: needsReload ? 'not_run' : 'skipped',
    reload_status: needsReload ? 'recommended' : 'not_required',
    materialized_by: 'package_transaction_post_apply',
    separate_lifecycle_owner: false,
  };
}

function buildProfileMigrationStatus() {
  return {
    status: 'current',
    semantic_merge_required: true,
    silent_overwrite_allowed: false,
    apply_mode: 'fail_closed_owner_handoff',
    separate_lifecycle_owner: false,
  };
}

export async function buildManagedUpdateKernelProjection(
  contracts: FrameworkContracts,
  input: ManagedUpdateKernelInput,
) {
  const channel = readOplUpdateChannel().channel;
  const requested = requestedComponentId(input.componentId);
  const components: ManagedUpdateComponent[] = [];

  if (shouldBuildComponent(requested, 'opl_app')) {
    components.push(buildInstallationCarrierComponent(channel));
  }
  if (shouldBuildComponent(requested, 'opl_base')) {
    components.push(buildRuntimeSubstrateComponent(buildManagedUpdateRuntimeEnvironment(input.operation), channel, {
      allowFrameworkChannelLookup: input.operation === 'check' || input.operation === 'plan',
    }));
  }
  if (shouldBuildComponent(requested, 'opl_packages')) {
    const modulesPayload = buildOplModules({ profile: 'fast' }).modules;
    const modules = modulesPayload.modules as Record<string, unknown>[];
    const capabilityPackages = buildCapabilityPackagesComponent(modules, channel);
    const projectionStatus = buildCodexProjectionStatus(capabilityPackages);
    components.push({
      ...capabilityPackages,
      projection_status: projectionStatus,
      profile_migration_status: buildProfileMigrationStatus(),
    });
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
      requested_lifecycle_owner: selectedComponents[0]?.lifecycle_owner ?? null,
      requested_receipt_id: input.receiptId ?? null,
      lifecycle: KERNEL_LIFECYCLE,
      state_vocabulary: STATE_VOCABULARY,
      idempotency_lock: {
        lock_id: `${MANAGED_UPDATE_KERNEL_ID}.global`,
        lock_scope: 'single_writer_for_fetch_verify_stage_activate_post_apply_write_receipt',
        read_operations: ['status', 'check', 'plan'],
        exclusive_operations: ['apply', 'repair', MANAGED_UPDATE_OWNER_ACTIONS.revert],
        status: 'not_acquired_for_projection',
        lock_file: managedUpdateLockFilePath(),
        stale_after_seconds: MANAGED_UPDATE_LOCK_STALE_AFTER_SECONDS,
        contention_policy: 'report_in_progress_or_skip_without_parallel_stage_or_plugin_sync',
      },
      summary: summarizeManagedUpdateComponents(selectedComponents),
      components: selectedComponents,
      repair_actions: selectedComponents.flatMap((component) => component.plan.command_refs),
      receipts: {
        receipt_id: input.receiptId ?? null,
        receipt_store: 'opl_managed_install_update_ledger_and_future_runtime_update_receipts',
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
        can_silently_update_clean_managed_modules: false,
        can_sync_codex_plugin_skill_projection: false,
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
        'Codex skill/plugin projection and workflow profile migration are OPL Packages transaction statuses, not lifecycle owners.',
        'OPL App replacement remains App-owned and must not be claimed by opl update apply.',
        'Real artifact fetch/verify/stage/activate remains provider-specific; this surface exposes the shared state machine and safe action refs.',
        'Package freshness and runtime maintenance do not imply domain readiness, owner receipt authority, artifact authority, quality verdict, or export readiness.',
      ],
    },
  };
}

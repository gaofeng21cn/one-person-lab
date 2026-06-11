import { readOplUpdateChannel, readOplWorkspaceRoot } from './system-preferences.ts';
import type { FrameworkContracts } from './types.ts';
import { buildOplEnvironment } from './system-installation/environment.ts';
import { buildOplModules } from './system-installation/modules.ts';
import {
  findLatestManagedUpdateReceipt,
  managedUpdateComponentReceiptLedgerFilePath,
} from './managed-update-component-receipts.ts';
import { managedUpdateLockFilePath, MANAGED_UPDATE_LOCK_STALE_AFTER_SECONDS } from './managed-update-lock.ts';

export type ManagedUpdateOperation = 'status' | 'check' | 'plan' | 'apply' | 'repair' | 'rollback';
export type ManagedUpdateProviderId =
  | 'app_binary'
  | 'runtime_toolchain'
  | 'agent_package_channel'
  | 'capability_exposure';
export type ManagedUpdateProviderAdapterId =
  | 'electron_standard_updater'
  | 'runtime_toolchain_adapter'
  | 'agent_package_channel_adapter'
  | 'codex_exposure_status_adapter';
export type ManagedUpdateConditionStatus = 'True' | 'False' | 'Unknown';
export type ManagedUpdateComponentState =
  | 'current'
  | 'update_available'
  | 'staged'
  | 'needs_reload'
  | 'needs_restart'
  | 'failed_with_repair'
  | 'skipped_manual_required';

export type ManagedUpdateCondition = {
  type: string;
  status: ManagedUpdateConditionStatus;
  reason: string;
  message: string;
  observed_generation: number;
};

type ManagedUpdateActionRef = {
  action_id: string;
  command: string;
  mode: 'read_only' | 'controlled_apply' | 'manual';
  destructive: boolean;
  reason: string;
};

type ManagedUpdateComponent = {
  component_id: string;
  provider_id: ManagedUpdateProviderId;
  adapter_id: ManagedUpdateProviderAdapterId;
  policy_id: string;
  label: string;
  state: ManagedUpdateComponentState;
  channel: string;
  current: Record<string, unknown>;
  target: Record<string, unknown> | null;
  conditions: ManagedUpdateCondition[];
  lifecycle: string[];
  post_apply_hooks: string[];
  plan: {
    action: 'none' | 'check' | 'install' | 'update' | 'sync' | 'reload' | 'restart' | 'manual_review';
    summary: string;
    command_refs: ManagedUpdateActionRef[];
  };
  receipt: {
    schema_version: 'opl_managed_update_component_receipt.v1';
    required: boolean;
    last_receipt_ref: string | null;
    source_manifest_ref: string | null;
    from_version: string | null;
    from_digest: string | null;
    to_version: string | null;
    to_digest: string | null;
    verify_result: 'not_run_projection_only' | 'passed' | 'failed' | 'unknown';
    activated_at: string | null;
    post_apply_hooks: string[];
    rollback_ref: string | null;
    repair_action: string | null;
    content_identity_fields: string[];
  };
  authority_boundary: Record<string, boolean>;
  notes: string[];
};

export type ManagedUpdateKernelInput = {
  operation: ManagedUpdateOperation;
  componentId?: string;
  receiptId?: string;
};

const COMPONENT_ALIASES: Record<string, string> = {
  agent_packages: 'agent_package_channel',
  agent_package_channel: 'agent_package_channel',
};

const MANAGED_UPDATE_KERNEL_ID = 'opl_managed_updater_kernel';

const KERNEL_LIFECYCLE = [
  'read_manifest',
  'read_current_state',
  'diff_plan',
  'fetch_artifacts',
  'verify',
  'stage',
  'activate',
  'post_apply',
  'write_receipt',
  'report_status_or_repair',
];

const STATE_VOCABULARY: ManagedUpdateComponentState[] = [
  'current',
  'update_available',
  'staged',
  'needs_restart',
  'needs_reload',
  'failed_with_repair',
  'skipped_manual_required',
];

const COMPONENT_RECEIPT_REQUIRED_FIELDS = [
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
];

function condition(
  type: string,
  status: ManagedUpdateConditionStatus,
  reason: string,
  message: string,
  observedGeneration = 1,
): ManagedUpdateCondition {
  return {
    type,
    status,
    reason,
    message,
    observed_generation: observedGeneration,
  };
}

function controlledCommand(actionId: string, command: string, reason: string): ManagedUpdateActionRef {
  return {
    action_id: actionId,
    command,
    mode: 'controlled_apply',
    destructive: false,
    reason,
  };
}

function readOnlyCommand(actionId: string, command: string, reason: string): ManagedUpdateActionRef {
  return {
    action_id: actionId,
    command,
    mode: 'read_only',
    destructive: false,
    reason,
  };
}

function manualCommand(actionId: string, command: string, reason: string): ManagedUpdateActionRef {
  return {
    action_id: actionId,
    command,
    mode: 'manual',
    destructive: false,
    reason,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function booleanValue(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === 'boolean' ? value : null;
}

function componentReceipt(options: {
  component_id: string;
  source_manifest_ref: string | null;
  content_identity_fields: string[];
  post_apply_hooks: string[];
  from_version?: string | null;
  from_digest?: string | null;
  to_version?: string | null;
  to_digest?: string | null;
  repair_action?: string | null;
}) {
  const latestReceipt = findLatestManagedUpdateReceipt(options.component_id);
  return {
    schema_version: 'opl_managed_update_component_receipt.v1' as const,
    required: true,
    last_receipt_ref: latestReceipt?.receipt_ref ?? null,
    source_manifest_ref: options.source_manifest_ref,
    from_version: latestReceipt?.from_version ?? options.from_version ?? null,
    from_digest: latestReceipt?.from_digest ?? options.from_digest ?? null,
    to_version: latestReceipt?.to_version ?? options.to_version ?? null,
    to_digest: latestReceipt?.to_digest ?? options.to_digest ?? null,
    verify_result: latestReceipt?.verify_result ?? 'not_run_projection_only' as const,
    activated_at: latestReceipt?.activated_at ?? null,
    post_apply_hooks: options.post_apply_hooks,
    rollback_ref: latestReceipt?.rollback_ref ?? null,
    repair_action: latestReceipt?.repair_action ?? options.repair_action ?? null,
    content_identity_fields: options.content_identity_fields,
  };
}

function buildAppBinaryComponent(channel: string): ManagedUpdateComponent {
  const postApplyHooks = ['replace_desktop_app_bundle_after_standard_updater_download'];
  return {
    component_id: 'app_binary',
    provider_id: 'app_binary',
    adapter_id: 'electron_standard_updater',
    policy_id: 'user_visible_release_channel_check',
    label: 'One Person Lab desktop App',
    state: 'current',
    channel,
    current: {
      source: 'app_release_standard_updater',
      updater_metadata: ['latest-mac.yml', 'latest-arm64-mac.yml'],
    },
    target: null,
    conditions: [
      condition(
        'BoundaryReady',
        'True',
        'DesktopAssetsOnly',
        'Standard updater metadata is projected as desktop App assets only.',
      ),
    ],
    lifecycle: KERNEL_LIFECYCLE,
    post_apply_hooks: postApplyHooks,
    plan: {
      action: 'none',
      summary: 'Desktop App update checks stay in the App-owned standard updater.',
      command_refs: [
        readOnlyCommand(
          'inspect_app_release_contract',
          'opl update status --component app_binary --json',
          'Read the App updater boundary projection.',
        ),
      ],
    },
    receipt: componentReceipt({
      component_id: 'app_binary',
      source_manifest_ref: 'github_release_standard_updater_metadata',
      post_apply_hooks: postApplyHooks,
      content_identity_fields: ['release_tag', 'asset_sha256', 'updater_metadata_sha256'],
    }),
    authority_boundary: {
      can_update_desktop_app_bundle: true,
      can_update_full_first_install_assets: false,
      can_update_domain_modules: false,
      can_claim_domain_ready: false,
    },
    notes: [
      'This projection exists so App binary updates appear in the same status plane.',
      'Full first-install assets and managed agent packages are not standard updater targets.',
    ],
  };
}

function buildRuntimeToolchainComponent(systemEnvironment: Record<string, unknown>, channel: string): ManagedUpdateComponent {
  const coreEngines = asRecord(systemEnvironment.core_engines);
  const codex = asRecord(coreEngines?.codex);
  const runtimeToolchain = asRecord(codex?.runtime_toolchain_updater);
  const installed = booleanValue(codex, 'installed') === true;
  const updateAvailable = booleanValue(codex, 'update_available') === true;
  const runtimeLatestStatus = stringValue(runtimeToolchain, 'latest_version_status');
  const binarySource = stringValue(codex, 'binary_source');
  const currentPointer = runtimeToolchain?.current_root ?? null;
  const stagedRoot = runtimeToolchain?.staging_root ?? null;
  const rollbackPointer = runtimeToolchain?.rollback_pointer ?? null;
  const state: ManagedUpdateComponentState =
    !installed
      ? 'failed_with_repair'
      : updateAvailable || runtimeLatestStatus === 'outdated'
        ? 'update_available'
        : 'current';
  const action = state === 'current' ? 'none' : state === 'failed_with_repair' ? 'install' : 'update';
  const postApplyHooks = ['startup_smoke', 'swap_runtime_current_pointer_with_rollback'];

  return {
    component_id: 'runtime_toolchain',
    provider_id: 'runtime_toolchain',
    adapter_id: 'runtime_toolchain_adapter',
    policy_id: 'silent_background_verified_stage_apply_on_next_restart',
    label: 'App-owned runtime/toolchain layer',
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
      runtime_toolchain_updater: runtimeToolchain,
    },
    target: state === 'current'
      ? null
      : {
        codex_latest_version: codex?.latest_version ?? null,
        staged_root: stagedRoot,
        current_pointer: currentPointer,
        rollback_pointer: rollbackPointer,
      },
    conditions: [
      condition(
        'Ready',
        state === 'current' ? 'True' : 'False',
        state === 'current' ? 'RuntimeToolchainCurrent' : 'RuntimeToolchainNeedsMaintenance',
        state === 'current'
          ? 'App-owned runtime/toolchain projection is current.'
          : 'App-owned runtime/toolchain maintenance is available through controlled OPL commands.',
      ),
      condition(
        'GlobalMutationBlocked',
        'True',
        'AppOwnedRuntimeOnly',
        'Managed runtime updates must not mutate user Homebrew, global npm, system PATH Codex, or system Temporal.',
      ),
    ],
    lifecycle: KERNEL_LIFECYCLE,
    post_apply_hooks: postApplyHooks,
    plan: {
      action,
      summary: state === 'current'
        ? 'No runtime/toolchain update is required.'
        : 'Stage and verify App-owned runtime/toolchain payloads through startup maintenance or engine update.',
      command_refs: state === 'current'
        ? [
          readOnlyCommand(
            'inspect_system_environment',
            'opl system --json',
            'Read the runtime/toolchain environment projection.',
          ),
        ]
        : [
          controlledCommand(
            'run_startup_maintenance',
            'opl system startup-maintenance --json',
            'Stage, verify, and apply App-owned runtime maintenance without global tool mutation.',
          ),
          controlledCommand(
            'update_codex_runtime_fallback',
            'opl engine update --engine codex --json',
            'Refresh the App-owned Codex fallback when the selected toolchain is outdated.',
          ),
        ],
    },
    receipt: componentReceipt({
      component_id: 'runtime_toolchain',
      source_manifest_ref: 'app-runtime-update-channel.json',
      from_version: typeof codex?.version === 'string' ? codex.version : null,
      to_version: typeof codex?.latest_version === 'string' ? codex.latest_version : null,
      post_apply_hooks: postApplyHooks,
      repair_action: state === 'failed_with_repair' ? 'run_startup_maintenance' : null,
      content_identity_fields: ['runtime_version', 'sha256', 'current_pointer', 'staged_root'],
    }),
    authority_boundary: {
      can_mutate_app_owned_runtime_root: true,
      can_swap_current_pointer: true,
      can_rollback_pointer: true,
      can_mutate_homebrew: false,
      can_mutate_global_npm: false,
      can_mutate_system_path_tools: false,
      can_claim_domain_ready: false,
    },
    notes: [
      'Runtime/toolchain updates share the managed update kernel lifecycle but keep an App-owned runtime authority boundary.',
      'Compatible newer system tools may be selected at runtime after checks; they are not silently upgraded by OPL.',
    ],
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

function buildAgentPackageComponent(modules: Record<string, unknown>[], channel: string): ManagedUpdateComponent {
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

  return {
    component_id: 'agent_package_channel',
    provider_id: 'agent_package_channel',
    adapter_id: 'agent_package_channel_adapter',
    policy_id: 'ordinary_user_non_development_silent_background',
    label: 'MAS/MAG/RCA/OMA managed agent packages',
    state,
    channel,
    current: {
      channel_manifest: 'ghcr.io/gaofeng21cn/one-person-lab-manifest:stable',
      tag_role: 'selector_only',
      default_modules_count: defaultModules.length,
      module_states: moduleStates,
    },
    target: state === 'current'
      ? null
      : {
        source: 'GHCR one-person-lab-manifest channel target',
        content_identity: 'digest_or_source_fingerprint_required_in_receipt',
      },
    conditions: [
      condition(
        'Ready',
        state === 'current' ? 'True' : 'False',
        state === 'current' ? 'AgentPackagesCurrent' : 'AgentPackageMaintenanceAvailable',
        state === 'current'
          ? 'Managed default agent packages are current or have no clean update available.'
          : 'Managed package-channel maintenance is available for clean OPL module roots.',
      ),
      condition(
        'DigestPinned',
        'Unknown',
        'ChannelTagSelectorOnly',
        'GHCR stable/latest tags select channel targets; installed receipts must record digest, sha256, source fingerprint, or git head.',
      ),
      condition(
        'DeveloperCheckoutProtected',
        manualCount > 0 ? 'False' : 'True',
        manualCount > 0 ? 'ManualSourceVisible' : 'CleanManagedRootsOnly',
        manualCount > 0
          ? 'At least one module is dirty, developer-sourced, or otherwise manual; silent update is blocked for that module.'
          : 'Silent agent package updates are limited to clean OPL-managed module roots.',
      ),
    ],
    lifecycle: KERNEL_LIFECYCLE,
    post_apply_hooks: postApplyHooks,
    plan: {
      action,
      summary: action === 'none'
        ? 'No managed agent package maintenance is required.'
        : action === 'manual_review'
          ? 'Manual review is required before OPL can update one or more agent package roots.'
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
              'Read the managed module package-channel projection.',
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
      component_id: 'agent_package_channel',
      source_manifest_ref: 'ghcr.io/gaofeng21cn/one-person-lab-manifest:stable',
      post_apply_hooks: postApplyHooks,
      repair_action: state === 'failed_with_repair' ? 'reconcile_managed_modules' : null,
      content_identity_fields: ['digest', 'sha256', 'source_fingerprint', 'git_head_sha'],
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
      'GHCR package channel is the ordinary non-development source for managed agent packages.',
      'Package-channel freshness does not claim domain readiness, artifact authority, quality verdict, or export readiness.',
    ],
  };
}

function buildCapabilityExposureComponent(agentPackages: ManagedUpdateComponent, channel: string): ManagedUpdateComponent {
  const needsReload = agentPackages.plan.command_refs.some((entry) => entry.action_id === 'sync_codex_skills');
  const postApplyHooks = ['sync_plugin_registry', 'sync_plugin_packaged_skills', 'sync_oma_generated_plugin_surface'];
  return {
    component_id: 'capability_exposure',
    provider_id: 'capability_exposure',
    adapter_id: 'codex_exposure_status_adapter',
    policy_id: 'display_visibility_and_repair_actions_without_duplicate_semantics',
    label: 'Codex plugin and skill exposure',
    state: needsReload ? 'needs_reload' : 'current',
    channel,
    current: {
      source: 'module_post_apply_projection',
      plugin_registry: 'Codex plugin registry',
      skill_surfaces: ['plugin-packaged MAS/MAG/RCA skills', 'OMA generated plugin surface'],
    },
    target: needsReload
      ? {
        post_apply: ['reconcile-modules', 'sync-skills', 'reload_app_and_codex_plugin_cache'],
      }
      : null,
    conditions: [
      condition(
        'DerivedProjection',
        'True',
        'NotSecondTruthSource',
        'Skill and plugin exposure is generated from managed module state and does not own domain truth.',
      ),
      condition(
        'ReloadRequired',
        needsReload ? 'True' : 'False',
        needsReload ? 'PluginCacheRefreshAvailable' : 'PluginCacheCurrent',
        needsReload
          ? 'Codex plugin cache may need a reload after managed module package changes.'
          : 'No plugin cache reload is projected from the current managed update plan.',
      ),
    ],
    lifecycle: KERNEL_LIFECYCLE,
    post_apply_hooks: postApplyHooks,
    plan: {
      action: needsReload ? 'reload' : 'none',
      summary: needsReload
        ? 'Sync skills/plugins after managed package updates, then reload the App/Codex plugin cache if needed.'
        : 'Capability exposure is current.',
      command_refs: needsReload
        ? [
          controlledCommand(
            'sync_codex_skills',
            'opl connect sync-skills --json',
            'Regenerate Codex-visible plugin and skill surfaces.',
          ),
          manualCommand(
            'reload_codex_plugin_cache',
            'Reload One Person Lab App or Codex plugin cache',
            'Codex may cache plugin metadata until reload.',
          ),
        ]
        : [
          readOnlyCommand(
            'inspect_codex_skills',
            'opl connect skills --json',
            'Read the current Codex-visible family skill projection.',
          ),
        ],
    },
    receipt: componentReceipt({
      component_id: 'capability_exposure',
      source_manifest_ref: 'module_post_apply_projection',
      post_apply_hooks: postApplyHooks,
      repair_action: needsReload ? 'sync_codex_skills' : null,
      content_identity_fields: ['plugin_manifest_hash', 'skill_pack_hash', 'generated_surface_hash'],
    }),
    authority_boundary: {
      can_sync_plugin_registry: true,
      can_sync_skill_projection: true,
      can_write_domain_truth: false,
      can_mutate_artifact_body: false,
      can_claim_domain_ready: false,
    },
    notes: [
      'Capability exposure is a post-apply projection, not a separate agent update source.',
    ],
  };
}

function filterComponents(components: ManagedUpdateComponent[], componentId: string | undefined) {
  if (!componentId) {
    return components;
  }
  const requested = componentId.trim();
  const normalized = COMPONENT_ALIASES[requested] ?? requested;
  return components.filter((entry) => entry.component_id === normalized || entry.provider_id === normalized);
}

function summarize(components: ManagedUpdateComponent[]) {
  return {
    total_components_count: components.length,
    current_components_count: components.filter((entry) => entry.state === 'current').length,
    update_available_components_count: components.filter((entry) => entry.state === 'update_available').length,
    staged_components_count: components.filter((entry) => entry.state === 'staged').length,
    restart_required_components_count: components.filter((entry) => entry.state === 'needs_restart').length,
    reload_required_components_count: components.filter((entry) => entry.state === 'needs_reload').length,
    failed_with_repair_components_count: components.filter((entry) => entry.state === 'failed_with_repair').length,
    skipped_manual_required_components_count: components.filter((entry) => entry.state === 'skipped_manual_required').length,
  };
}

function operationMode(operation: ManagedUpdateOperation) {
  if (operation === 'apply') {
    return 'controlled_apply';
  }
  if (operation === 'repair') {
    return 'controlled_repair';
  }
  if (operation === 'rollback') {
    return 'controlled_rollback';
  }
  return 'read_only_projection';
}

function receiptWritePolicy(operation: ManagedUpdateOperation) {
  if (operation === 'status' || operation === 'check' || operation === 'plan') {
    return 'read_only';
  }
  return 'recorded_component_receipt';
}

export async function buildManagedUpdateKernelProjection(
  contracts: FrameworkContracts,
  input: ManagedUpdateKernelInput,
) {
  const channel = readOplUpdateChannel().channel;
  const environment = (await buildOplEnvironment(contracts)).system_environment as Record<string, unknown>;
  const modulesPayload = buildOplModules({ profile: 'fast' }).modules;
  const modules = modulesPayload.modules as Record<string, unknown>[];
  const appBinary = buildAppBinaryComponent(channel);
  const runtimeToolchain = buildRuntimeToolchainComponent(environment, channel);
  const agentPackages = buildAgentPackageComponent(modules, channel);
  const capabilityExposure = buildCapabilityExposureComponent(agentPackages, channel);
  const selectedComponents = filterComponents(
    [appBinary, runtimeToolchain, agentPackages, capabilityExposure],
    input.componentId,
  );

  return {
    version: 'g2',
    managed_update: {
      surface_id: MANAGED_UPDATE_KERNEL_ID,
      operation: input.operation,
      operation_mode: operationMode(input.operation),
      update_channel: channel,
      workspace_root: readOplWorkspaceRoot(),
      requested_component_id: input.componentId ?? null,
      requested_receipt_id: input.receiptId ?? null,
      lifecycle: KERNEL_LIFECYCLE,
      state_vocabulary: STATE_VOCABULARY,
      idempotency_lock: {
        lock_id: `${MANAGED_UPDATE_KERNEL_ID}.global`,
        lock_scope: 'single_writer_for_fetch_verify_stage_activate_post_apply_write_receipt',
        read_operations: ['status', 'check', 'plan'],
        exclusive_operations: ['apply', 'repair', 'rollback'],
        status: 'not_acquired_for_projection',
        lock_file: managedUpdateLockFilePath(),
        stale_after_seconds: MANAGED_UPDATE_LOCK_STALE_AFTER_SECONDS,
        contention_policy: 'report_in_progress_or_skip_without_parallel_stage_or_plugin_sync',
      },
      summary: summarize(selectedComponents),
      components: selectedComponents,
      repair_actions: selectedComponents.flatMap((component) => component.plan.command_refs),
      receipts: {
        receipt_id: input.receiptId ?? null,
        receipt_store: 'opl_managed_install_update_ledger_and_future_runtime_update_receipts',
        component_receipt_schema: 'opl_managed_update_component_receipt.v1',
        component_receipt_ledger_file: managedUpdateComponentReceiptLedgerFilePath(),
        required_fields: COMPONENT_RECEIPT_REQUIRED_FIELDS,
        write_policy: receiptWritePolicy(input.operation),
      },
      authority_boundary: {
        can_mutate_app_owned_runtime_root: false,
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
        'This kernel unifies update status, plan, receipt, and repair projections across App binary, runtime/toolchain, agent packages, and Codex capability exposure.',
        'Real artifact fetch/verify/stage/activate remains provider-specific; this surface exposes the shared state machine and safe action refs.',
        'Package freshness and runtime maintenance do not imply domain readiness, owner receipt authority, artifact authority, quality verdict, or export readiness.',
      ],
    },
  };
}

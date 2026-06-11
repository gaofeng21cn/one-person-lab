import { readOplUpdateChannel, readOplWorkspaceRoot } from './system-preferences.ts';
import type { FrameworkContracts } from './types.ts';
import { buildOplEnvironment } from './system-installation/environment.ts';
import { buildOplModules } from './system-installation/modules.ts';

export type ManagedUpdateOperation = 'status' | 'check' | 'plan' | 'apply' | 'repair' | 'rollback';
export type ManagedUpdateProviderId =
  | 'app_binary'
  | 'runtime_toolchain'
  | 'agent_package_channel'
  | 'capability_exposure';
export type ManagedUpdateConditionStatus = 'True' | 'False' | 'Unknown';
export type ManagedUpdateComponentState =
  | 'current'
  | 'update_available'
  | 'missing'
  | 'manual_required'
  | 'staged'
  | 'needs_reload'
  | 'needs_restart'
  | 'unsupported';

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
  label: string;
  state: ManagedUpdateComponentState;
  channel: string;
  current: Record<string, unknown>;
  target: Record<string, unknown> | null;
  conditions: ManagedUpdateCondition[];
  lifecycle: string[];
  plan: {
    action: 'none' | 'check' | 'install' | 'update' | 'sync' | 'reload' | 'restart' | 'manual_review';
    summary: string;
    command_refs: ManagedUpdateActionRef[];
  };
  receipt: {
    required: boolean;
    last_receipt_ref: string | null;
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

const KERNEL_LIFECYCLE = [
  'manifest',
  'current_state',
  'plan',
  'fetch',
  'verify',
  'stage',
  'activate',
  'post_apply',
  'receipt',
  'status_projection',
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

function buildAppBinaryComponent(channel: string): ManagedUpdateComponent {
  return {
    component_id: 'app_binary',
    provider_id: 'app_binary',
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
    receipt: {
      required: true,
      last_receipt_ref: null,
      content_identity_fields: ['release_tag', 'asset_sha256', 'updater_metadata_sha256'],
    },
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
      ? 'missing'
      : updateAvailable || runtimeLatestStatus === 'outdated'
        ? 'update_available'
        : 'current';
  const action = state === 'current' ? 'none' : state === 'missing' ? 'install' : 'update';

  return {
    component_id: 'runtime_toolchain',
    provider_id: 'runtime_toolchain',
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
    receipt: {
      required: true,
      last_receipt_ref: null,
      content_identity_fields: ['runtime_version', 'sha256', 'current_pointer', 'staged_root'],
    },
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
    return 'missing';
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
    return 'manual_required';
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
  const missingCount = moduleStates.filter((entry) => entry.state === 'missing').length;
  const updateCount = moduleStates.filter((entry) => entry.state === 'update_available').length;
  const manualCount = moduleStates.filter((entry) => entry.state === 'manual_required').length;
  const state: ManagedUpdateComponentState =
    manualCount > 0
      ? 'manual_required'
      : missingCount > 0
        ? 'missing'
        : updateCount > 0
          ? 'update_available'
          : 'current';
  const action = manualCount > 0
    ? 'manual_review'
    : missingCount > 0
      ? 'install'
      : updateCount > 0
        ? 'update'
        : 'none';

  return {
    component_id: 'agent_package_channel',
    provider_id: 'agent_package_channel',
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
    receipt: {
      required: true,
      last_receipt_ref: null,
      content_identity_fields: ['digest', 'sha256', 'source_fingerprint', 'git_head_sha'],
    },
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
  return {
    component_id: 'capability_exposure',
    provider_id: 'capability_exposure',
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
    receipt: {
      required: true,
      last_receipt_ref: null,
      content_identity_fields: ['plugin_manifest_hash', 'skill_pack_hash', 'generated_surface_hash'],
    },
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
    missing_components_count: components.filter((entry) => entry.state === 'missing').length,
    manual_required_components_count: components.filter((entry) => entry.state === 'manual_required').length,
    reload_required_components_count: components.filter((entry) => entry.state === 'needs_reload').length,
  };
}

function operationMode(operation: ManagedUpdateOperation) {
  if (operation === 'apply' || operation === 'repair' || operation === 'rollback') {
    return 'controlled_projection';
  }
  return 'read_only_projection';
}

function receiptWritePolicy(operation: ManagedUpdateOperation) {
  if (operation === 'status' || operation === 'check' || operation === 'plan') {
    return 'read_only';
  }
  return 'projection_only_no_receipt_write';
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
      surface_id: 'opl_managed_update_kernel',
      operation: input.operation,
      operation_mode: operationMode(input.operation),
      update_channel: channel,
      workspace_root: readOplWorkspaceRoot(),
      requested_component_id: input.componentId ?? null,
      requested_receipt_id: input.receiptId ?? null,
      lifecycle: KERNEL_LIFECYCLE,
      summary: summarize(selectedComponents),
      components: selectedComponents,
      repair_actions: selectedComponents.flatMap((component) => component.plan.command_refs),
      receipts: {
        receipt_id: input.receiptId ?? null,
        receipt_store: 'opl_managed_install_update_ledger_and_future_runtime_update_receipts',
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

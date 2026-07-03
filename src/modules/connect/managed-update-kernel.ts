import { execFileSync } from 'node:child_process';
import os from 'node:os';

import { readOplUpdateChannel, readOplWorkspaceRoot } from '../console/index.ts';
import type { FrameworkContracts } from '../../kernel/types.ts';
import {
  resolveMineruOpenApiTool,
  resolveOfficeCliTool,
  type OplCompanionToolSyncItem,
} from './install-companions-parts/tools.ts';
import { buildOplEnvironment } from './system-installation/environment.ts';
import { readOplFrameworkRuntimeUpdateStatus } from './system-installation/framework-self-update.ts';
import { buildOplModules } from './system-installation/modules.ts';
import { resolveProjectRoot } from './system-installation/shared.ts';
import { scholarSkillsStateForAgentPackageChannel } from './system-installation/scholarskills-package-channel.ts';
import {
  findLatestManagedUpdateReceipt,
  managedUpdateComponentReceiptLedgerFilePath,
  type ManagedUpdatePostApplyActionReceipt,
  type ManagedUpdateReceiptApplyMode,
  type ManagedUpdateReceiptStatusDetail,
  type ManagedUpdateReloadGuidance,
} from './managed-update-component-receipts.ts';
import { managedUpdateLockFilePath, MANAGED_UPDATE_LOCK_STALE_AFTER_SECONDS } from './managed-update-lock.ts';

export type ManagedUpdateOperation = 'status' | 'check' | 'plan' | 'apply' | 'repair' | 'rollback';
export type ManagedUpdateProviderId =
  | 'installation_carrier'
  | 'runtime_substrate'
  | 'capability_packages'
  | 'codex_surface'
  | 'companion_tools'
  | 'workflow_profile';
export type ManagedUpdateProviderAdapterId =
  | 'installation_carrier_status_adapter'
  | 'runtime_substrate_adapter'
  | 'capability_packages_adapter'
  | 'codex_surface_status_adapter'
  | 'companion_tools_status_adapter'
  | 'workflow_profile_adapter';
type ManagedUpdateComponentClass = ManagedUpdateProviderId;
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
  component_class: ManagedUpdateComponentClass;
  policy_id: string;
  label: string;
  state: ManagedUpdateComponentState;
  channel: string;
  current: Record<string, unknown>;
  target: Record<string, unknown> | null;
  conditions: ManagedUpdateCondition[];
  lifecycle: string[];
  post_apply_hooks: string[];
  auto_apply: {
    mode: ManagedUpdateReceiptApplyMode;
    eligible: boolean;
    app_background_safe: boolean;
    scope: string;
    command_ref: string | null;
    blocked_reasons: string[];
  };
  status_detail: ManagedUpdateReceiptStatusDetail;
  post_apply_guidance: {
    required: boolean;
    command_refs: string[];
    reload_guidance: ManagedUpdateReloadGuidance;
  };
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
    apply_mode: ManagedUpdateReceiptApplyMode;
    status_detail: ManagedUpdateReceiptStatusDetail;
    post_apply_action_statuses: ManagedUpdatePostApplyActionReceipt[];
    reload_guidance: ManagedUpdateReloadGuidance;
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
  app_binary: 'installation_carrier',
  installation_carrier: 'installation_carrier',
  macos_app: 'installation_carrier',
  docker_webui_image: 'installation_carrier',
  linux_package_carrier: 'installation_carrier',
  runtime_toolchain: 'runtime_substrate',
  runtime_substrate: 'runtime_substrate',
  codex_cli_fallback: 'runtime_substrate',
  embedded_codex_executor: 'runtime_substrate',
  agent_packages: 'capability_packages',
  agent_package_channel: 'capability_packages',
  capability_packages: 'capability_packages',
  capability_exposure: 'codex_surface',
  codex_surface: 'codex_surface',
  workflow_profile: 'workflow_profile',
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
  'apply_mode',
  'status_detail',
  'post_apply_action_statuses',
  'reload_guidance',
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
  apply_mode: ManagedUpdateReceiptApplyMode;
  status_detail: ManagedUpdateReceiptStatusDetail;
  reload_guidance: ManagedUpdateReloadGuidance;
  from_version?: string | null;
  from_digest?: string | null;
  to_version?: string | null;
  to_digest?: string | null;
  repair_action?: string | null;
}) {
  const latestReceipt = findLatestManagedUpdateReceipt(options.component_id);
  const latestActionStatuses = latestReceipt?.post_apply_action_statuses ?? [];
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
    apply_mode: latestReceipt?.apply_mode ?? options.apply_mode,
    status_detail: latestReceipt?.status_detail ?? options.status_detail,
    post_apply_action_statuses: latestActionStatuses,
    reload_guidance: latestReceipt?.reload_guidance ?? options.reload_guidance,
  };
}

function noAutoApply(scope: string): ManagedUpdateComponent['auto_apply'] {
  return {
    mode: 'projection_only',
    eligible: false,
    app_background_safe: false,
    scope,
    command_ref: null,
    blocked_reasons: [],
  };
}

function noReloadGuidance(): ManagedUpdateReloadGuidance {
  return {
    reload_required: false,
    reload_recommended: false,
    reload_targets: [],
    command_ref: null,
    reason: null,
  };
}

function statusDetail(input: {
  component_state: ManagedUpdateComponentState;
  auto_apply_eligible?: boolean;
  app_background_safe?: boolean;
  clean_managed_targets_count?: number | null;
  manual_required_targets_count?: number | null;
  post_apply_status?: ManagedUpdateReceiptStatusDetail['post_apply_status'];
  reload_status?: ManagedUpdateReceiptStatusDetail['reload_status'];
}): ManagedUpdateReceiptStatusDetail {
  return {
    component_state: input.component_state,
    auto_apply_eligible: input.auto_apply_eligible ?? false,
    app_background_safe: input.app_background_safe ?? false,
    clean_managed_targets_count: input.clean_managed_targets_count ?? null,
    manual_required_targets_count: input.manual_required_targets_count ?? null,
    post_apply_status: input.post_apply_status ?? 'not_run',
    reload_status: input.reload_status ?? 'not_required',
  };
}

const LINUX_PACKAGE_CARRIER_NAMES = ['one-person-lab', 'opl'];
const DOCKER_WEBUI_HOST_UPDATE_ROUTE_EXAMPLES = [
  'install-docker-webui.sh --yes --update',
  'install-docker-webui.ps1 -Yes -Update',
  'docker compose pull && docker compose up -d',
];
const LINUX_PACKAGE_HOST_UPDATE_ROUTE_EXAMPLES = [
  'sudo apt update && sudo apt install --only-upgrade one-person-lab',
  'sudo dnf upgrade one-person-lab',
  'sudo zypper update one-person-lab',
];
const LINUX_PACKAGE_MANUAL_REQUIRED_WHEN = [
  'package_manager_requires_sudo_or_root',
  'host_policy_disallows_app_executor',
  'repository_or_signature_configuration_required',
];

function readCommandOutput(command: string, args: string[]): string | null {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 1000,
    }).trim();
  } catch {
    return null;
  }
}

function commandAvailable(command: string): boolean {
  return readCommandOutput('sh', ['-lc', `command -v ${command}`]) !== null;
}

function installedDebPackageVersion(packageName: string): string | null {
  return readCommandOutput('dpkg-query', ['-W', '-f=${Version}', packageName]);
}

function installedRpmPackageVersion(packageName: string): string | null {
  return readCommandOutput('rpm', ['-q', '--qf', '%{VERSION}-%{RELEASE}', packageName]);
}

function installedPacmanPackageVersion(packageName: string): string | null {
  const output = readCommandOutput('pacman', ['-Q', packageName]);
  if (!output) return null;
  return output.split(/\s+/)[1] ?? null;
}

function buildLinuxPackageCarrierReadback() {
  const candidateManagers = [
    { id: 'apt', binary: 'apt', query: installedDebPackageVersion },
    { id: 'dnf', binary: 'dnf', query: installedRpmPackageVersion },
    { id: 'yum', binary: 'yum', query: installedRpmPackageVersion },
    { id: 'zypper', binary: 'zypper', query: installedRpmPackageVersion },
    { id: 'pacman', binary: 'pacman', query: installedPacmanPackageVersion },
  ];
  const detectedPackageManagers = os.platform() === 'linux'
    ? candidateManagers.filter((entry) => commandAvailable(entry.binary))
    : [];
  const installedPackage = detectedPackageManagers
    .flatMap((manager) =>
      LINUX_PACKAGE_CARRIER_NAMES.map((packageName) => ({
        manager: manager.id,
        package_name: packageName,
        installed_version: manager.query(packageName),
      }))
    )
    .find((entry) => entry.installed_version);

  return {
    package_manager: installedPackage?.manager ?? detectedPackageManagers[0]?.id ?? null,
    package_name: installedPackage?.package_name ?? null,
    installed_version: installedPackage?.installed_version ?? null,
    detected_package_managers: detectedPackageManagers.map((entry) => entry.id),
  };
}

function buildInstallationCarrierComponent(channel: string): ManagedUpdateComponent {
  const linuxPackageCarrierReadback = buildLinuxPackageCarrierReadback();
  const dockerDataVolumePreservation = {
    required: true,
    status: 'required_before_host_image_replacement',
    preserved_mounts: [
      'OnePersonLab/data -> /data',
      'OnePersonLab/projects -> /projects',
    ],
    required_evidence: [
      'compose.yaml volume mapping readback',
      'data-preservation.txt',
      'pre_data_inventory',
      'post_data_inventory',
      'install_manifest_readback',
      'projects_mount_readback',
    ],
  };
  const carrierVariants = [
    {
      carrier_type: 'docker_webui_image',
      carrier_status: 'unknown',
      currentness: 'unknown',
      update_available: 'unknown',
      image_ref: 'ghcr.io/gaofeng21cn/one-person-lab-webui:stable',
      image_digest: null,
      container_id: null,
      compose_file: null,
      host_update_route: 'host_executor_runs_documented_installer_or_compose_pull_and_up',
      host_update_route_examples: DOCKER_WEBUI_HOST_UPDATE_ROUTE_EXAMPLES,
      host_executor_required: true,
      manual_required: true,
      data_volume_preservation: dockerDataVolumePreservation,
      managed_kernel_apply_allowed: false,
    },
    {
      carrier_type: 'linux_package_carrier',
      carrier_status: 'unknown',
      currentness: 'unknown',
      update_available: 'unknown',
      package_manager: linuxPackageCarrierReadback.package_manager,
      package_name: linuxPackageCarrierReadback.package_name,
      installed_version: linuxPackageCarrierReadback.installed_version,
      detected_package_managers: linuxPackageCarrierReadback.detected_package_managers,
      host_update_route: 'host_package_manager_or_documented_host_executor',
      host_update_route_examples: LINUX_PACKAGE_HOST_UPDATE_ROUTE_EXAMPLES,
      host_executor_required: true,
      manual_required: true,
      manual_required_when: LINUX_PACKAGE_MANUAL_REQUIRED_WHEN,
      data_volume_preservation: {
        required: false,
        status: 'not_a_docker_webui_image_replacement',
      },
      managed_kernel_apply_allowed: false,
    },
  ];
  const detail = statusDetail({
    component_state: 'skipped_manual_required',
    manual_required_targets_count: carrierVariants.length,
    post_apply_status: 'manual_required',
    reload_status: 'manual_required',
  });
  const reloadGuidance: ManagedUpdateReloadGuidance = {
    reload_required: false,
    reload_recommended: false,
    reload_targets: [],
    command_ref: null,
    reason: 'Installation carrier replacement happens through the host carrier route, not opl update apply.',
  };

  return {
    component_id: 'installation_carrier',
    provider_id: 'installation_carrier',
    adapter_id: 'installation_carrier_status_adapter',
    component_class: 'installation_carrier',
    policy_id: 'carrier_specific_status_with_host_update_route',
    label: 'Installation carrier',
    state: 'skipped_manual_required',
    channel,
    current: {
      source: 'one-person-lab-app install/update taxonomy',
      carrier_type: 'carrier_specific_status_projection',
      carrier_status: 'unknown',
      currentness: 'unknown',
      managed_kernel_apply_allowed: false,
      opl_update_apply_must_not_claim_carrier_update_complete: true,
      host_update_route: 'carrier_specific_host_update_route_required',
      host_update_route_examples: [
        ...DOCKER_WEBUI_HOST_UPDATE_ROUTE_EXAMPLES,
        ...LINUX_PACKAGE_HOST_UPDATE_ROUTE_EXAMPLES,
      ],
      manual_guidance: 'Use the host package manager or documented host executor for Linux package carrier updates; opl update apply is intentionally projection-only for installation_carrier.',
      carrier_variants: carrierVariants,
    },
    target: {
      carrier_variants: carrierVariants.map((entry) => ({
        carrier_type: entry.carrier_type,
        host_update_route: entry.host_update_route,
        host_update_route_examples: entry.host_update_route_examples,
        host_executor_required: entry.host_executor_required,
        manual_required: entry.manual_required,
        managed_kernel_apply_allowed: false,
      })),
    },
    conditions: [
      condition(
        'ManagedKernelApplyForbidden',
        'True',
        'CarrierSpecificHostRouteRequired',
        'Installation carrier updates require the carrier-specific host route; opl update apply must not claim carrier replacement.',
      ),
      condition(
        'DockerWebuiImageCurrentness',
        'Unknown',
        'HostImageDigestReadbackRequired',
        'Docker/WebUI image currentness requires host image digest and compose/container readback.',
      ),
      condition(
        'LinuxPackageCarrierCurrentness',
        'Unknown',
        'HostPackageReadbackRequired',
        'Linux package carrier currentness requires host package-manager or documented host executor readback.',
      ),
      condition(
        'DockerDataVolumePreservation',
        'Unknown',
        'PreservationProofRequiredBeforeImageReplacement',
        'Docker/WebUI image replacement requires compose/data volume preservation proof before host update.',
      ),
    ],
    lifecycle: KERNEL_LIFECYCLE,
    post_apply_hooks: ['carrier_specific_host_route_readback'],
    auto_apply: {
      mode: 'projection_only',
      eligible: false,
      app_background_safe: false,
      scope: 'installation_carrier_status_projection_only',
      command_ref: null,
      blocked_reasons: [
        'installation_carrier_requires_carrier_specific_host_update_route',
        'docker_webui_image_replacement_requires_host_executor_and_data_volume_preservation',
        'linux_package_carrier_requires_host_package_manager_or_documented_host_executor',
      ],
    },
    status_detail: detail,
    post_apply_guidance: {
      required: true,
      command_refs: [
        'install-docker-webui.sh --yes --update',
        'install-docker-webui.ps1 -Yes -Update',
        'docker compose pull && docker compose up -d',
      ],
      reload_guidance: reloadGuidance,
    },
    plan: {
      action: 'manual_review',
      summary: 'Installation carrier status is readback-only in the Framework kernel; carrier replacement uses host-specific routes.',
      command_refs: [
        manualCommand(
          'docker_webui_host_update_route',
          'install-docker-webui.sh --yes --update',
          'Update Docker/WebUI image through the host route with data volume preservation proof.',
        ),
        manualCommand(
          'docker_compose_pull_and_up',
          'docker compose pull && docker compose up -d',
          'Replace the Docker/WebUI container only through host compose after volume mapping readback.',
        ),
        manualCommand(
          'linux_package_host_update_route',
          'host package manager or documented host executor',
          'Update Linux package carriers outside the Framework managed update kernel.',
        ),
      ],
    },
    receipt: componentReceipt({
      component_id: 'installation_carrier',
      source_manifest_ref: 'one-person-lab-app://contracts/app-release-channel.json#managed_update_plane.planes.installation_carrier',
      post_apply_hooks: ['carrier_specific_host_route_readback'],
      apply_mode: 'projection_only',
      status_detail: detail,
      reload_guidance: reloadGuidance,
      repair_action: 'carrier_specific_host_update_route',
      content_identity_fields: ['carrier_type', 'image_ref', 'image_digest', 'package_manager', 'host_update_route'],
    }),
    authority_boundary: {
      can_mutate_installation_carrier: false,
      can_replace_docker_webui_image: false,
      can_run_docker_socket_or_host_executor: false,
      can_update_linux_package_carrier: false,
      can_claim_carrier_update_complete: false,
      requires_data_volume_preservation_proof_for_docker_webui: true,
      can_mutate_runtime_substrate: false,
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_claim_domain_ready: false,
    },
    notes: [
      'Installation carrier is projected so App Settings can show carrier-specific status and routes without making Framework the host updater.',
      'Docker/WebUI image and Linux package carrier replacement require host readback; this kernel must skip opl update apply for installation_carrier.',
    ],
  };
}

function buildRuntimeSubstrateComponent(systemEnvironment: Record<string, unknown>, channel: string): ManagedUpdateComponent {
  const coreEngines = asRecord(systemEnvironment.core_engines);
  const codex = asRecord(coreEngines?.codex);
  const runtimeSubstrate = asRecord(codex?.runtime_substrate_updater) ?? asRecord(codex?.runtime_toolchain_updater);
  const frameworkRuntime = readOplFrameworkRuntimeUpdateStatus(resolveProjectRoot());
  const installed = booleanValue(codex, 'installed') === true;
  const updateAvailable = booleanValue(codex, 'update_available') === true;
  const frameworkUpdateAvailable = frameworkRuntime.update_available && !frameworkRuntime.target_is_developer_checkout;
  const runtimeLatestStatus = stringValue(runtimeSubstrate, 'latest_version_status');
  const binarySource = stringValue(codex, 'binary_source');
  const currentPointer = runtimeSubstrate?.current_root ?? null;
  const stagedRoot = runtimeSubstrate?.staging_root ?? null;
  const rollbackPointer = runtimeSubstrate?.rollback_pointer ?? null;
  const state: ManagedUpdateComponentState =
    !installed
      ? 'failed_with_repair'
      : updateAvailable || runtimeLatestStatus === 'outdated' || frameworkUpdateAvailable
        ? 'update_available'
        : 'current';
  const action = state === 'current' ? 'none' : state === 'failed_with_repair' ? 'install' : 'update';
  const postApplyHooks = ['startup_smoke', 'apply_opl_framework_runtime', 'swap_runtime_current_pointer_with_rollback'];
  const detail = statusDetail({
    component_state: state,
    post_apply_status: state === 'current' ? 'skipped' : 'not_run',
  });
  const reloadGuidance = noReloadGuidance();

  return {
    component_id: 'runtime_substrate',
    provider_id: 'runtime_substrate',
    adapter_id: 'runtime_substrate_adapter',
    component_class: 'runtime_substrate',
    policy_id: 'silent_background_verified_stage_apply_on_next_restart',
    label: 'App-owned runtime substrate',
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
    post_apply_hooks: postApplyHooks,
    auto_apply: {
      mode: 'controlled_apply',
      eligible: state !== 'current',
      app_background_safe: false,
      scope: 'app_owned_runtime_root_only',
      command_ref: state === 'current' ? null : 'opl update apply --component runtime_substrate --json',
      blocked_reasons: [],
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
      component_id: 'runtime_substrate',
      source_manifest_ref: 'app-runtime-update-channel.json',
      from_version: typeof codex?.version === 'string' ? codex.version : null,
      to_version: typeof codex?.latest_version === 'string' ? codex.latest_version : null,
      post_apply_hooks: postApplyHooks,
      apply_mode: 'controlled_apply',
      status_detail: detail,
      reload_guidance: reloadGuidance,
      repair_action: state === 'failed_with_repair' ? 'run_startup_maintenance' : null,
      content_identity_fields: ['runtime_version', 'sha256', 'current_pointer', 'staged_root', 'opl_framework_runtime'],
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

  return {
    component_id: 'capability_packages',
    provider_id: 'capability_packages',
    adapter_id: 'capability_packages_adapter',
    component_class: 'capability_packages',
    policy_id: 'ordinary_user_non_development_silent_background',
    label: 'OPL managed capability packages',
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
        state === 'current' ? 'CapabilityPackagesCurrent' : 'CapabilityPackageMaintenanceAvailable',
        state === 'current'
          ? 'Managed default capability packages are current or have no clean update available.'
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
          : 'Silent capability package updates are limited to clean OPL-managed module roots.',
      ),
    ],
    lifecycle: KERNEL_LIFECYCLE,
    post_apply_hooks: postApplyHooks,
    auto_apply: {
      mode: cleanManagedScopeSafe ? 'auto_apply' : 'manual_required',
      eligible: autoApplyEligible,
      app_background_safe: cleanManagedScopeSafe,
      scope: 'clean_opl_managed_module_roots_only',
      command_ref: autoApplyEligible ? 'opl update apply --component capability_packages --json' : null,
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
      component_id: 'capability_packages',
      source_manifest_ref: 'ghcr.io/gaofeng21cn/one-person-lab-manifest:stable',
      post_apply_hooks: postApplyHooks,
      apply_mode: cleanManagedScopeSafe ? 'auto_apply' : 'manual_required',
      status_detail: detail,
      reload_guidance: reloadGuidance,
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
      'GHCR package channel is the ordinary non-development source for managed capability packages.',
      'Package-channel freshness does not claim domain readiness, artifact authority, quality verdict, or export readiness.',
    ],
  };
}

function buildCodexSurfaceComponent(capabilityPackages: ManagedUpdateComponent, channel: string): ManagedUpdateComponent {
  const needsReload = capabilityPackages.plan.command_refs.some((entry) => entry.action_id === 'sync_codex_skills');
  const postApplyHooks = ['sync_plugin_registry', 'sync_plugin_packaged_skills', 'sync_oma_generated_plugin_surface'];
  const reloadGuidance: ManagedUpdateReloadGuidance = needsReload
    ? {
      reload_required: false,
      reload_recommended: true,
      reload_targets: ['one_person_lab_app', 'codex_plugin_cache'],
      command_ref: 'Reload One Person Lab App or Codex plugin cache',
      reason: 'Codex may cache plugin metadata until reload.',
    }
    : noReloadGuidance();
  const detail = statusDetail({
    component_state: needsReload ? 'needs_reload' : 'current',
    auto_apply_eligible: needsReload,
    app_background_safe: needsReload,
    post_apply_status: needsReload ? 'not_run' : 'skipped',
    reload_status: needsReload ? 'recommended' : 'not_required',
  });
  return {
    component_id: 'codex_surface',
    provider_id: 'codex_surface',
    adapter_id: 'codex_surface_status_adapter',
    component_class: 'codex_surface',
    policy_id: 'display_visibility_and_repair_actions_without_duplicate_semantics',
    label: 'Codex plugin and skill surface',
    state: needsReload ? 'needs_reload' : 'current',
    channel,
    current: {
      source: 'module_post_apply_projection',
      plugin_registry: 'Codex plugin registry',
      skill_surfaces: ['plugin-packaged MAS/MAG/RCA skills', 'OMA/Book Forge generated plugin surfaces'],
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
    auto_apply: {
      mode: 'projection_only',
      eligible: false,
      app_background_safe: false,
      scope: 'codex_plugin_registry_and_skill_projection_only',
      command_ref: null,
      blocked_reasons: needsReload ? ['codex_surface_is_post_apply_projection_only'] : [],
    },
    status_detail: detail,
    post_apply_guidance: {
      required: needsReload,
      command_refs: needsReload ? ['opl connect sync-skills --json'] : [],
      reload_guidance: reloadGuidance,
    },
    plan: {
      action: needsReload ? 'reload' : 'none',
      summary: needsReload
        ? 'Sync skills/plugins after managed package updates, then reload the App/Codex plugin cache if needed.'
        : 'Codex Surface projection is current.',
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
      component_id: 'codex_surface',
      source_manifest_ref: 'module_post_apply_projection',
      post_apply_hooks: postApplyHooks,
      apply_mode: needsReload ? 'auto_apply' : 'projection_only',
      status_detail: detail,
      reload_guidance: reloadGuidance,
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
      'Codex surface is a capability packages post-apply projection, not a separate package update source.',
    ],
  };
}

function companionToolState(tool: OplCompanionToolSyncItem): ManagedUpdateComponentState {
  if (tool.status === 'ready' || tool.status === 'installed') {
    return 'current';
  }
  if (tool.status === 'missing') {
    return 'failed_with_repair';
  }
  return 'skipped_manual_required';
}

function buildCompanionToolsComponent(channel: string): ManagedUpdateComponent {
  const home = process.env.HOME?.trim() || os.homedir();
  const tools: OplCompanionToolSyncItem[] = [
    resolveOfficeCliTool(home) ?? {
      tool_id: 'officecli',
      binary_path: null,
      version: null,
      status: 'missing',
      action: 'none',
      note: 'officecli binary is not available.',
    },
    resolveMineruOpenApiTool(home) ?? {
      tool_id: 'mineru-open-api',
      binary_path: null,
      version: null,
      status: 'missing',
      action: 'none',
      note: 'mineru-open-api binary is not available.',
    },
  ];
  const toolStates = tools.map((tool) => ({
    tool_id: tool.tool_id === 'mineru-open-api' ? 'mineru_open_api' : tool.tool_id,
    binary_path: tool.binary_path,
    version: tool.version,
    status: tool.status,
    state: companionToolState(tool),
    action: tool.action,
    note: tool.note,
  }));
  const missingCount = toolStates.filter((entry) => entry.state === 'failed_with_repair').length;
  const manualCount = toolStates.filter((entry) => entry.state === 'skipped_manual_required').length;
  const state: ManagedUpdateComponentState = manualCount > 0
    ? 'skipped_manual_required'
    : missingCount > 0
      ? 'failed_with_repair'
      : 'current';
  const action = state === 'current' ? 'none' : state === 'failed_with_repair' ? 'install' : 'manual_review';
  const detail = statusDetail({
    component_state: state,
    clean_managed_targets_count: toolStates.length - missingCount - manualCount,
    manual_required_targets_count: manualCount,
    post_apply_status: state === 'current' ? 'skipped' : 'not_run',
  });
  const reloadGuidance = noReloadGuidance();

  return {
    component_id: 'companion_tools',
    provider_id: 'companion_tools',
    adapter_id: 'companion_tools_status_adapter',
    component_class: 'companion_tools',
    policy_id: 'recommended_companion_tools_observe_or_managed_install',
    label: 'Recommended companion tools',
    state,
    channel,
    current: {
      source: 'opl_companion_skill_sync_tools',
      tools: toolStates,
    },
    target: state === 'current'
      ? null
      : {
        tools: toolStates
          .filter((entry) => entry.state !== 'current')
          .map((entry) => entry.tool_id),
      },
    conditions: [
      condition(
        'ToolsReady',
        state === 'current' ? 'True' : 'False',
        state === 'current' ? 'CompanionToolsCurrent' : 'CompanionToolsNeedMaintenance',
        state === 'current'
          ? 'Recommended companion tools are available.'
          : 'Recommended companion tools are separate from the runtime substrate and need companion maintenance.',
      ),
    ],
    lifecycle: KERNEL_LIFECYCLE,
    post_apply_hooks: ['inspect_companion_tools'],
    auto_apply: {
      mode: state === 'current' ? 'projection_only' : 'manual_required',
      eligible: false,
      app_background_safe: false,
      scope: 'recommended_companion_tools_only',
      command_ref: null,
      blocked_reasons: state === 'current' ? [] : ['companion_tool_install_requires_explicit_companion_apply'],
    },
    status_detail: detail,
    post_apply_guidance: {
      required: state !== 'current',
      command_refs: state === 'current' ? [] : ['opl skill companion status --json'],
      reload_guidance: reloadGuidance,
    },
    plan: {
      action,
      summary: state === 'current'
        ? 'No companion tool maintenance is required.'
        : 'Inspect recommended companion tools separately from the runtime substrate.',
      command_refs: state === 'current'
        ? [
          readOnlyCommand(
            'inspect_companion_tools',
            'opl skill companion status --json',
            'Read companion tool status without changing user skill configuration.',
          ),
        ]
        : [
          manualCommand(
            'inspect_companion_tools',
            'opl skill companion status --json',
            'Inspect missing or failed recommended companion tools.',
          ),
          manualCommand(
            'apply_companion_tools',
            'opl skill companion apply --mode managed --json',
            'Install recommended companion tools only through the companion skill route.',
          ),
        ],
    },
    receipt: componentReceipt({
      component_id: 'companion_tools',
      source_manifest_ref: 'opl_companion_skill_sync_tools',
      post_apply_hooks: ['inspect_companion_tools'],
      apply_mode: state === 'current' ? 'projection_only' : 'manual_required',
      status_detail: detail,
      reload_guidance: reloadGuidance,
      repair_action: state === 'current' ? null : 'inspect_companion_tools',
      content_identity_fields: ['tool_id', 'binary_path', 'version'],
    }),
    authority_boundary: {
      can_install_companion_tools: true,
      can_mutate_runtime_substrate: false,
      can_mutate_homebrew: false,
      can_mutate_global_npm: false,
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_claim_domain_ready: false,
    },
    notes: [
      'Companion tools are status-classified separately from the runtime substrate.',
      'The managed update kernel may project companion tool status but does not turn tool availability into domain truth or owner receipts.',
    ],
  };
}

function buildWorkflowProfileComponent(channel: string): ManagedUpdateComponent {
  const managedProfileParts = ['codex_profile_agents', 'codex_profile_taste', 'codex_profile_prompts'];
  const detail = statusDetail({
    component_state: 'current',
    post_apply_status: 'skipped',
    reload_status: 'not_required',
  });
  const reloadGuidance = noReloadGuidance();

  return {
    component_id: 'workflow_profile',
    provider_id: 'workflow_profile',
    adapter_id: 'workflow_profile_adapter',
    component_class: 'workflow_profile',
    policy_id: 'semantic_merge_required_no_silent_overwrite',
    label: 'OPL Flow workflow profile',
    state: 'current',
    channel,
    current: {
      source: 'OPL Flow AGENTS/TASTE/prompts profile',
      managed_profile_parts: managedProfileParts,
      semantic_merge_required: true,
      silent_overwrite_allowed: false,
      profile_pointer: 'contracts/opl-native-profile.json',
    },
    target: null,
    conditions: [
      condition(
        'SemanticMergeRequired',
        'True',
        'NoSilentProfileOverwrite',
        'Existing user AGENTS.md, TASTE.md, and prompt files require Codex semantic merge instead of updater apply.',
      ),
      condition(
        'WorkflowProfileCurrent',
        'True',
        'NoProfileDeltaReported',
        'No workflow profile delta is reported by the current projection.',
      ),
    ],
    lifecycle: KERNEL_LIFECYCLE,
    post_apply_hooks: ['semantic_merge_packet'],
    auto_apply: {
      mode: 'projection_only',
      eligible: false,
      app_background_safe: false,
      scope: 'workflow_profile_semantic_merge_only',
      command_ref: null,
      blocked_reasons: ['workflow_profile_requires_codex_semantic_merge'],
    },
    status_detail: detail,
    post_apply_guidance: {
      required: false,
      command_refs: ['Codex semantic merge packet for OPL Flow profile changes'],
      reload_guidance: reloadGuidance,
    },
    plan: {
      action: 'none',
      summary: 'Workflow profile is current; future OPL Flow profile changes require Codex semantic merge, not opl update apply.',
      command_refs: [
        manualCommand(
          'workflow_profile_semantic_merge',
          'Codex semantic merge packet for OPL Flow AGENTS.md, TASTE.md, and prompts',
          'Merge workflow profile changes semantically without silently overwriting user Codex profile files.',
        ),
      ],
    },
    receipt: componentReceipt({
      component_id: 'workflow_profile',
      source_manifest_ref: 'opl-flow://workflow-profile',
      post_apply_hooks: ['semantic_merge_packet'],
      apply_mode: 'projection_only',
      status_detail: detail,
      reload_guidance: reloadGuidance,
      repair_action: null,
      content_identity_fields: ['profile_id', 'profile_version', 'agents_hash', 'taste_hash', 'prompts_hash'],
    }),
    authority_boundary: {
      can_write_user_codex_profile: false,
      can_silently_overwrite_agents_md: false,
      can_silently_overwrite_taste_md: false,
      can_silently_overwrite_prompts: false,
      can_require_codex_semantic_merge: true,
      can_mutate_runtime_substrate: false,
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_claim_domain_ready: false,
    },
    notes: [
      'Workflow profile status is projected in the managed update plane so Settings can show OPL Flow profile merge guidance.',
      'The managed update kernel does not apply workflow profile changes; existing user profiles require Codex semantic merge packets.',
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
  const modules = [
    ...(modulesPayload.modules as Record<string, unknown>[]),
    scholarSkillsStateForAgentPackageChannel() as unknown as Record<string, unknown>,
  ];
  const runtimeSubstrate = buildRuntimeSubstrateComponent(environment, channel);
  const capabilityPackages = buildCapabilityPackagesComponent(modules, channel);
  const codexSurface = buildCodexSurfaceComponent(capabilityPackages, channel);
  const companionTools = buildCompanionToolsComponent(channel);
  const workflowProfile = buildWorkflowProfileComponent(channel);
  const installationCarrier = buildInstallationCarrierComponent(channel);
  const selectedComponents = filterComponents(
    [installationCarrier, runtimeSubstrate, capabilityPackages, codexSurface, companionTools, workflowProfile],
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
        can_mutate_installation_carrier: false,
        can_replace_docker_webui_image: false,
        can_update_linux_package_carrier: false,
        can_claim_carrier_update_complete: false,
        can_silently_update_clean_managed_modules: false,
        can_sync_codex_plugin_skill_projection: false,
        can_install_companion_tools: false,
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
        'This kernel unifies update status, plan, receipt, and repair projections across installation carrier, runtime substrate, capability packages, Codex surface, companion tools, and workflow profile.',
        'Installation carrier replacement remains carrier-specific and must not be claimed by opl update apply.',
        'Real artifact fetch/verify/stage/activate remains provider-specific; this surface exposes the shared state machine and safe action refs.',
        'Package freshness and runtime maintenance do not imply domain readiness, owner receipt authority, artifact authority, quality verdict, or export readiness.',
      ],
    },
  };
}

import { execFileSync } from 'node:child_process';
import os from 'node:os';

import {
  componentReceipt,
  condition,
  KERNEL_LIFECYCLE,
  managedUpdateComponent,
  manualCommand,
  ownerExecutionBoundary,
  ownerRoute,
  statusDetail,
  type ManagedUpdateComponent,
  type ManagedUpdateReloadGuidance,
} from '../managed-update-owner-boundary.ts';

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

export function buildInstallationCarrierComponent(channel: string): ManagedUpdateComponent {
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
  const route = ownerRoute({
    owner: 'one-person-lab-app',
    authority_surface: 'App installation carrier and host update route',
    route_kind: 'manual_owner_route',
    readback_ref: 'contracts/opl-framework/managed-update-kernel-contract.json#providers/installation_carrier',
    apply_owner: 'host_carrier_owner',
    forbidden_claims: [
      'opl_base_update_updates_opl_app_binary',
      'opl_update_apply_replaces_docker_webui_image',
      'managed_update_kernel_is_package_manager',
    ],
  });

  return managedUpdateComponent({
    lifecycle_owner: 'opl_app',
    component_id: 'opl_app',
    provider_id: 'installation_carrier',
    adapter_id: 'installation_carrier_status_adapter',
    component_class: 'opl_app',
    coordination_role: 'owner_handoff',
    policy_id: 'carrier_specific_status_with_host_update_route',
    owner_route: route,
    owner_execution_boundary: ownerExecutionBoundary(route, {
      owner_executor_id: 'host_carrier_owner',
      executor_kind: 'manual_owner_route',
      runner_can_execute: false,
      allowed_operations: [],
      receipt_projection: 'external_owner_receipt_required',
      diagnostic_only: false,
      notes: [
        'Framework status may project carrier routes, but host/App owner executes and reads back carrier replacement.',
      ],
    }),
    label: 'OPL App',
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
      host_executor_required: true,
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
    postApplyHooks: ['carrier_specific_host_route_readback'],
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
      component_id: 'opl_app',
      sourceManifestRef: 'one-person-lab-app://contracts/app-release-channel.json#managed_update_plane.planes.installation_carrier',
      postApplyHooks: ['carrier_specific_host_route_readback'],
      apply_mode: 'projection_only',
      status_detail: detail,
      reload_guidance: reloadGuidance,
      repair_action: 'carrier_specific_host_update_route',
      contentIdentityFields: ['carrier_type', 'image_ref', 'image_digest', 'package_manager', 'host_update_route'],
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
  });
}

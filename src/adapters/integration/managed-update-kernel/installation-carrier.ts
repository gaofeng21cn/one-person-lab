import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compare, valid } from 'semver';

import { parseJsonText } from '../../../kernel/json-file.ts';
import { getOplReleaseRepo } from '../opl-release.ts';

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

function readCommandOutput(command: string, args: string[], timeout = 1000): string | null {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout,
    }).trim();
  } catch {
    return null;
  }
}

function resolveApplicationsDir() {
  return process.env.OPL_APPLICATIONS_DIR?.trim() || '/Applications';
}

function resolveMacAppPath() {
  const explicit = process.env.OPL_APP_INSTALLED_PATH?.trim();
  if (explicit) return explicit;
  const candidates = [
    path.join(resolveApplicationsDir(), 'One Person Lab.app'),
    path.join(os.homedir(), 'Applications', 'One Person Lab.app'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
}

function readMacAppBundle(appPath: string) {
  const infoPlist = path.join(appPath, 'Contents', 'Info.plist');
  if (!fs.existsSync(infoPlist)) return null;
  const plutil = process.env.OPL_PLUTIL_BIN?.trim() || 'plutil';
  const raw = readCommandOutput(plutil, ['-convert', 'json', '-o', '-', '--', infoPlist]);
  if (!raw) return null;
  try {
    const payload = parseJsonText(raw) as Record<string, unknown>;
    const identifier = typeof payload.CFBundleIdentifier === 'string'
      ? payload.CFBundleIdentifier.trim()
      : null;
    const version = typeof payload.CFBundleShortVersionString === 'string'
      ? payload.CFBundleShortVersionString.trim()
      : typeof payload.CFBundleVersion === 'string'
        ? payload.CFBundleVersion.trim()
        : null;
    if (identifier !== 'cn.onepersonlab.opl' || !version) return null;
    return {
      app_path: appPath,
      bundle_identifier: identifier,
      installed_version: valid(version),
    };
  } catch {
    return null;
  }
}

function readMacLatestVersion(allowNetworkLookup: boolean) {
  const metadataUrl = process.env.OPL_APP_LATEST_METADATA_URL?.trim()
    || `https://github.com/${getOplReleaseRepo()}/releases/latest/download/latest-mac.yml`;
  if (!allowNetworkLookup) {
    return {
      metadata_url: metadataUrl,
      latest_version: null,
      lookup_status: 'not_checked' as const,
    };
  }
  const curl = process.env.OPL_CURL_BIN?.trim() || 'curl';
  const raw = readCommandOutput(curl, ['-fsSL', '--max-time', '10', metadataUrl], 12000);
  const version = raw?.match(/^version:\s*([^\s#]+)\s*$/m)?.[1] ?? null;
  return {
    metadata_url: metadataUrl,
    latest_version: version && valid(version) ? version : null,
    lookup_status: 'checked' as const,
  };
}

function buildMacAppCarrierReadback(allowNetworkLookup: boolean) {
  const appPath = resolveMacAppPath();
  const app = readMacAppBundle(appPath);
  const latest = readMacLatestVersion(allowNetworkLookup);
  const installedVersion = app?.installed_version ?? null;
  const latestVersion = latest.latest_version;
  const currentness = installedVersion && latestVersion
    ? compare(installedVersion, latestVersion) >= 0 ? 'current' : 'update_available'
    : 'unknown';
  return {
    carrier_type: 'macos_standard',
    carrier_status: app ? 'installed' : 'not_detected',
    currentness,
    update_available: currentness === 'update_available',
    app_path: app?.app_path ?? appPath,
    bundle_identifier: app?.bundle_identifier ?? null,
    installed_version: installedVersion,
    latest_version: latestVersion,
    latest_version_status: currentness,
    latest_version_lookup_status: latest.lookup_status,
    release_metadata_url: latest.metadata_url,
    host_update_route: 'one_person_lab_app_standard_updater_or_signed_installer',
    host_update_route_examples: [
      'One Person Lab App standard updater',
      'One-Person-Lab-<version>-mac-arm64.dmg',
    ],
    host_executor_required: false,
    manual_required: !app || (latest.lookup_status === 'checked' && currentness === 'unknown'),
    managed_kernel_apply_allowed: false,
  };
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

export function buildInstallationCarrierComponent(
  channel: string,
  options: { allowNetworkLookup?: boolean } = {},
): ManagedUpdateComponent {
  const macAppCarrierReadback = (process.platform === 'darwin'
    || process.env.OPL_APP_CARRIER_PLATFORM?.trim() === 'darwin')
    ? buildMacAppCarrierReadback(options.allowNetworkLookup !== false)
    : null;
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
  const carrierVariants = macAppCarrierReadback ? [macAppCarrierReadback] : [
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
  const macAppState = macAppCarrierReadback?.currentness ?? 'unknown';
  const state: ManagedUpdateComponent['state'] = macAppCarrierReadback?.carrier_status !== 'installed'
    ? 'skipped_manual_required'
    : macAppState === 'current'
      ? 'current'
      : macAppState === 'update_available'
        ? 'update_available'
        : macAppCarrierReadback.latest_version_lookup_status === 'not_checked'
          ? 'currentness_not_checked'
          : 'skipped_manual_required';
  const manualRequiredCount = state === 'skipped_manual_required' ? carrierVariants.length : 0;
  const actionRequired = state !== 'current' && state !== 'currentness_not_checked';
  const detail = statusDetail({
    component_state: state,
    manual_required_targets_count: manualRequiredCount,
    post_apply_status: actionRequired ? 'manual_required' : 'skipped',
    reload_status: actionRequired ? 'manual_required' : 'not_required',
  });
  const reloadGuidance: ManagedUpdateReloadGuidance = {
    reload_required: false,
    reload_recommended: false,
    reload_targets: [],
    command_ref: null,
    reason: 'Installation carrier replacement happens through the App-owned updater or host carrier route, not opl update apply.',
  };
  const appOwnerRoute = macAppCarrierReadback
    ? 'one-person-lab-app-standard-updater'
    : 'host_carrier_owner';
  const hostUpdateRoute = macAppCarrierReadback
    ? macAppCarrierReadback.host_update_route
    : 'carrier_specific_host_update_route_required';
  const route = ownerRoute({
    owner: 'one-person-lab-app',
    authority_surface: 'App installation carrier and host update route',
    route_kind: 'manual_owner_route',
    readback_ref: 'contracts/opl-framework/managed-update-kernel-contract.json#providers/installation_carrier',
    apply_owner: appOwnerRoute,
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
      owner_executor_id: appOwnerRoute,
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
    state,
    channel,
    current: {
      source: 'one-person-lab-app install/update taxonomy',
      carrier_type: macAppCarrierReadback?.carrier_type ?? 'carrier_specific_status_projection',
      carrier_status: macAppCarrierReadback?.carrier_status ?? 'unknown',
      currentness: macAppCarrierReadback?.currentness ?? 'unknown',
      update_available: macAppCarrierReadback?.update_available ?? 'unknown',
      app_path: macAppCarrierReadback?.app_path ?? null,
      bundle_identifier: macAppCarrierReadback?.bundle_identifier ?? null,
      installed_version: macAppCarrierReadback?.installed_version ?? null,
      latest_version: macAppCarrierReadback?.latest_version ?? null,
      latest_version_status: macAppCarrierReadback?.latest_version_status ?? 'unknown',
      latest_version_lookup_status: macAppCarrierReadback?.latest_version_lookup_status ?? 'not_applicable',
      release_metadata_url: macAppCarrierReadback?.release_metadata_url ?? null,
      managed_kernel_apply_allowed: false,
      opl_update_apply_must_not_claim_carrier_update_complete: true,
      host_update_route: hostUpdateRoute,
      host_executor_required: macAppCarrierReadback?.host_executor_required ?? true,
      host_update_route_examples: macAppCarrierReadback?.host_update_route_examples ?? [
        ...DOCKER_WEBUI_HOST_UPDATE_ROUTE_EXAMPLES,
        ...LINUX_PACKAGE_HOST_UPDATE_ROUTE_EXAMPLES,
      ],
      manual_guidance: state === 'currentness_not_checked'
        ? null
        : macAppCarrierReadback
          ? 'Use the OPL App standard updater or signed macOS installer; opl update apply is intentionally projection-only for installation_carrier.'
          : 'Use the host package manager or documented host executor for Linux package carriers; opl update apply is intentionally projection-only for installation_carrier.',
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
      ...(macAppCarrierReadback ? [condition(
        'MacosStandardCurrentness',
        macAppCarrierReadback.currentness === 'unknown' ? 'Unknown' : 'True',
        macAppCarrierReadback.currentness === 'unknown'
          ? macAppCarrierReadback.carrier_status !== 'installed'
            ? 'AppInstallationNotDetected'
            : macAppCarrierReadback.latest_version_lookup_status === 'not_checked'
              ? 'AppReleaseMetadataLookupNotRun'
              : 'AppReleaseMetadataReadbackRequired'
          : 'OwnerReleaseMetadataReadback',
        macAppCarrierReadback.currentness === 'unknown'
          ? macAppCarrierReadback.carrier_status !== 'installed'
            ? 'The macOS App installation carrier was not detected at the configured path.'
            : macAppCarrierReadback.latest_version_lookup_status === 'not_checked'
              ? 'macOS App latest release metadata was intentionally not checked for this bounded projection.'
              : 'macOS App currentness requires the installed bundle and owner latest-mac.yml readback.'
          : 'macOS App bundle and owner latest-mac.yml currentness were read back from the App carrier owner.',
      )] : [
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
      ]),
    ],
    lifecycle: KERNEL_LIFECYCLE,
    postApplyHooks: ['carrier_specific_host_route_readback'],
    auto_apply: {
      mode: 'projection_only',
      eligible: false,
      app_background_safe: false,
      scope: 'installation_carrier_status_projection_only',
      command_ref: null,
      blocked_reasons: macAppCarrierReadback
        ? ['opl_app_lifecycle_is_owned_by_the_standard_updater']
        : [
          'installation_carrier_requires_carrier_specific_host_update_route',
          'docker_webui_image_replacement_requires_host_executor_and_data_volume_preservation',
          'linux_package_carrier_requires_host_package_manager_or_documented_host_executor',
        ],
    },
    status_detail: detail,
    post_apply_guidance: {
      required: actionRequired,
      command_refs: !actionRequired
        ? []
        : macAppCarrierReadback
          ? ['One Person Lab App standard updater or signed installer']
          : [
              'install-docker-webui.sh --yes --update',
              'install-docker-webui.ps1 -Yes -Update',
              'docker compose pull && docker compose up -d',
          ],
      reload_guidance: reloadGuidance,
    },
    plan: {
      action: actionRequired ? 'manual_review' : 'none',
      summary: state === 'current'
        ? 'Installed macOS App matches or exceeds the owner latest-stable updater target.'
        : state === 'currentness_not_checked'
          ? 'Installed App version was read locally; latest release currentness was not checked for this bounded projection.'
          : 'Installation carrier status is readback-only in the Framework kernel; carrier replacement uses the App or host-specific route.',
      command_refs: !actionRequired ? [] : macAppCarrierReadback
        ? [
          manualCommand(
            'macos_standard_app_update_route',
            'One Person Lab App standard updater or signed installer',
            'Update the installed macOS App through its owner updater without changing OPL Base or Packages.',
          ),
          ]
        : [
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
      repair_action: actionRequired ? 'carrier_specific_host_update_route' : null,
      contentIdentityFields: ['carrier_type', 'installed_version', 'latest_version', 'image_ref', 'image_digest', 'package_manager', 'host_update_route'],
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
      macAppCarrierReadback
        ? 'macOS App currentness is compared monotonically with owner latest-mac.yml metadata; a newer installed App is never downgraded.'
        : 'Docker/WebUI image and Linux package carrier replacement require host readback; this kernel must skip opl update apply for installation_carrier.',
    ],
  });
}

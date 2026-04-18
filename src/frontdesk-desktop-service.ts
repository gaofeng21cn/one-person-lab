import fs from 'node:fs';
import path from 'node:path';

import { GatewayContractError } from './contracts.ts';
import {
  buildFrontDeskApiBaseUrl,
  buildFrontDeskEntryUrl,
  normalizeBasePath,
} from './frontdesk-paths.ts';
import {
  buildFrontDeskDesktopPackage,
} from './frontdesk-desktop-package.ts';
import { ensureFrontDeskStateDir } from './frontdesk-state.ts';
import {
  OPL_FRONTDOOR_AGENT_LABEL,
  OPL_FRONTDOOR_APP_TITLE,
} from './frontdesk-librechat-identity.ts';
import {
  installFrontDeskService,
  type FrontDeskServiceOptions,
} from './frontdesk-service.ts';
import { readLocalCodexDefaults } from './local-codex-defaults.ts';
import {
  bootstrapLocalPaperclipControlPlane,
} from './paperclip-control-plane.ts';
import type { GatewayContracts } from './types.ts';
import { bindWorkspace } from './workspace-registry.ts';

export type FrontDeskDesktopBootstrapOptions = FrontDeskServiceOptions & {
  paperclipBaseUrl?: string;
};

type ActiveProjectBinding = {
  project_id: string;
  project: string;
  workspace_path: string;
};

function normalizeBaseUrl(host: string, port: number) {
  const normalizedHost =
    host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
  return `http://${normalizedHost}:${port}`;
}

function shellSingleQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function normalizeWorkspacePath(workspacePath?: string) {
  const resolved = path.resolve(workspacePath ?? process.cwd());
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new GatewayContractError(
      'cli_usage_error',
      'frontdesk-bootstrap requires an existing workspace directory.',
      {
        workspace_path: resolved,
      },
    );
  }

  return resolved;
}

function resolveMasWorkspaceProfile(workspacePath: string) {
  const sharedPath = path.join(workspacePath, 'ops', 'medautoscience', 'bin', '_shared.sh');
  const profilesRoot = path.join(workspacePath, 'ops', 'medautoscience', 'profiles');

  if (!fs.existsSync(sharedPath) || !fs.existsSync(profilesRoot) || !fs.statSync(profilesRoot).isDirectory()) {
    return null;
  }

  const defaultProfile = path.join(profilesRoot, 'nfpitnet.workspace.toml');
  if (fs.existsSync(defaultProfile)) {
    return {
      sharedPath,
      profilePath: defaultProfile,
    };
  }

  const profilePath = fs.readdirSync(profilesRoot)
    .filter((entry) => entry.endsWith('.workspace.toml'))
    .sort()
    .map((entry) => path.join(profilesRoot, entry))
    .find((candidate) => fs.statSync(candidate).isFile());

  if (!profilePath) {
    return null;
  }

  return {
    sharedPath,
    profilePath,
  };
}

function syncMasWorkspaceBinding(
  contracts: GatewayContracts,
  workspacePath: string,
  frontdeskUrl: string,
) {
  const profile = resolveMasWorkspaceProfile(workspacePath);
  if (!profile) {
    return null;
  }

  const payload = bindWorkspace(contracts, {
    projectId: 'medautoscience',
    workspacePath,
    entryCommand:
      `source ${shellSingleQuote(profile.sharedPath)}`
      + ` && run_medautosci product-frontdesk --profile ${shellSingleQuote(profile.profilePath)}`,
    manifestCommand:
      `source ${shellSingleQuote(profile.sharedPath)}`
      + ` && run_medautosci product-entry-manifest --profile ${shellSingleQuote(profile.profilePath)} --format json`,
    entryUrl: frontdeskUrl,
  });

  return payload.workspace_catalog.binding
    ? {
        project_id: payload.workspace_catalog.binding.project_id,
        project: payload.workspace_catalog.binding.project,
        workspace_path: payload.workspace_catalog.binding.workspace_path,
      } satisfies ActiveProjectBinding
    : null;
}

export async function bootstrapFrontDeskDesktop(
  contracts: GatewayContracts,
  options: FrontDeskDesktopBootstrapOptions = {},
) {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 8787;
  const basePath = normalizeBasePath(options.basePath);
  const workspacePath = normalizeWorkspacePath(options.workspacePath);
  const sessionsLimit = options.sessionsLimit ?? 5;
  const baseUrl = normalizeBaseUrl(host, port);
  const frontdeskUrl = buildFrontDeskEntryUrl(baseUrl, basePath);
  const apiBaseUrl = buildFrontDeskApiBaseUrl(baseUrl, basePath);
  const statePaths = ensureFrontDeskStateDir();

  const servicePayload = await installFrontDeskService(contracts, {
    host,
    port,
    workspacePath,
    sessionsLimit,
    basePath,
  });
  const activeBinding = syncMasWorkspaceBinding(contracts, workspacePath, frontdeskUrl);
  const codexDefaults = readLocalCodexDefaults();
  const desktopPackage = buildFrontDeskDesktopPackage({
    outputDir: statePaths.desktop_pilot_root,
    configFile: statePaths.desktop_config_file,
    frontdeskUrl,
    apiBaseUrl,
    workspacePath,
    sessionsLimit,
    appTitle: OPL_FRONTDOOR_APP_TITLE,
    modelDisplayLabel: OPL_FRONTDOOR_AGENT_LABEL,
    activeProjectId: activeBinding?.project_id ?? null,
    activeProjectLabel: activeBinding?.project ?? null,
    codexDefaults,
  });

  const paperclipSummary = activeBinding?.project_id
    ? await bootstrapLocalPaperclipControlPlane(contracts, {
        workspacePath,
        projectId: activeBinding.project_id,
        explicitBaseUrl: options.paperclipBaseUrl,
      })
    : null;

  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    frontdesk_service: servicePayload.frontdesk_service,
    ...(paperclipSummary ? { paperclip_control_plane: paperclipSummary } : {}),
    frontdesk_desktop: {
      action: 'bootstrap',
      installed: true,
      default_entry: 'desktop',
      shell_kind: 'electron_desktop_shell',
      app_title: OPL_FRONTDOOR_APP_TITLE,
      model_display_label: OPL_FRONTDOOR_AGENT_LABEL,
      frontdesk_url: frontdeskUrl,
      api_base_url: apiBaseUrl,
      workspace_path: workspacePath,
      sessions_limit: sessionsLimit,
      active_project_id: activeBinding?.project_id ?? null,
      active_project_label: activeBinding?.project ?? null,
      codex_config_file: codexDefaults.config_path,
      codex_model: codexDefaults.model,
      codex_reasoning_effort: codexDefaults.reasoning_effort ?? null,
      librechat_retired_from_default: true,
      launch_command: desktopPackage.launch_command,
      assets: desktopPackage.assets,
      notes: [
        'This is the default local Desktop front door for OPL.',
        'The Desktop shell reuses the existing OPL web front desk as its truth surface.',
        'LibreChat remains available only as an explicit optional lane through frontdesk librechat install.',
      ],
    },
  };
}

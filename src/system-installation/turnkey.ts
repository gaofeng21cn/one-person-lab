import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildOplGuiArtifactName, buildOplReleaseTag, getOplReleaseRepo, getOplReleaseVersion } from '../opl-release.ts';
import { buildOplGuiShellSurface, syncOplCompanionSkills } from '../install-companions.ts';
import { bootstrapLocalCodexDefaults } from '../local-codex-defaults.ts';
import { runNativeHelperRepairAction } from '../native-helper-runtime.ts';
import { runRuntimeManagerAction } from '../runtime-manager.ts';
import type { GatewayContracts } from '../types.ts';

import { runOplEngineAction } from './engine-actions.ts';
import { registerOplFamilyCodexPlugins } from './codex-plugin-registry.ts';
import { buildOplEnvironment } from './environment.ts';
import {
  appendOplFirstRunLogEvent,
  buildOplFirstRunLogSurface,
} from './first-run-contract.ts';
import { buildOplInitialize } from './initialize.ts';
import { runOplModuleAction } from './modules.ts';
import { resolveProjectRoot, runCommand } from './shared.ts';
import type { OplModuleId, OplTurnkeyInstallInput } from './shared.ts';

const DEFAULT_MODULES: OplModuleId[] = ['medautoscience', 'meddeepscientist', 'medautogrant', 'redcube'];
const DEFAULT_ENGINES = ['codex', 'hermes'] as const;

function normalizeModuleId(raw: string): OplModuleId {
  const normalized = raw.trim().toLowerCase();
  const aliases = new Map<string, OplModuleId>([
    ['mas', 'medautoscience'],
    ['med-autoscience', 'medautoscience'],
    ['med_autoscience', 'medautoscience'],
    ['medautoscience', 'medautoscience'],
    ['mds', 'meddeepscientist'],
    ['med-deepscientist', 'meddeepscientist'],
    ['med_deepscientist', 'meddeepscientist'],
    ['meddeepscientist', 'meddeepscientist'],
    ['mag', 'medautogrant'],
    ['med-autogrant', 'medautogrant'],
    ['med_autogrant', 'medautogrant'],
    ['medautogrant', 'medautogrant'],
    ['rca', 'redcube'],
    ['redcube-ai', 'redcube'],
    ['redcube_ai', 'redcube'],
    ['redcube', 'redcube'],
  ]);
  const resolved = aliases.get(normalized);
  if (!resolved) {
    throw new Error(`Unknown turnkey module id: ${raw}`);
  }
  return resolved;
}

function normalizeModuleSelection(modules?: string[]) {
  const selected = modules && modules.length > 0 ? modules : DEFAULT_MODULES;
  return [...new Set(selected.map((moduleId) => normalizeModuleId(moduleId)))];
}

function buildMacReleaseAssetName() {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  return buildOplGuiArtifactName({ platform: 'macos', arch, ext: 'dmg' });
}

function buildOplGuiReleaseUrl() {
  const releaseRepo = getOplReleaseRepo();
  const releaseTag = buildOplReleaseTag();
  const assetName = buildMacReleaseAssetName();
  return `https://github.com/${releaseRepo}/releases/download/${releaseTag}/${encodeURIComponent(assetName)}`;
}


function getOpenCommand() {
  return process.env.OPL_OPEN_BIN ?? 'open';
}

function getCurlCommand() {
  return process.env.OPL_CURL_BIN ?? 'curl';
}

function getHdiutilCommand() {
  return process.env.OPL_HDIUTIL_BIN ?? 'hdiutil';
}

function getApplicationsDir() {
  return process.env.OPL_APPLICATIONS_DIR ?? '/Applications';
}

function getGuiInstallPlatform() {
  return process.env.OPL_GUI_INSTALL_PLATFORM ?? process.platform;
}

function buildGuiActionBase() {
  const releaseVersion = getOplReleaseVersion();
  const releaseRepo = getOplReleaseRepo();
  const releaseTag = buildOplReleaseTag(releaseVersion);
  const releaseAsset = getGuiInstallPlatform() === 'darwin' ? buildMacReleaseAssetName() : null;
  const releaseUrl = getGuiInstallPlatform() === 'darwin' ? buildOplGuiReleaseUrl() : null;
  return { releaseVersion, releaseRepo, releaseTag, releaseAsset, releaseUrl };
}

function openInstalledOplGui(appPath: string, base = buildGuiActionBase()) {
  const result = runCommand(getOpenCommand(), [appPath]);
  return {
    status: result.exitCode === 0 ? 'completed' as const : 'failed' as const,
    strategy: 'open_installed_app',
    release_repo: base.releaseRepo,
    release_tag: base.releaseTag,
    opl_release_version: base.releaseVersion,
    release_asset: base.releaseAsset,
    release_url: base.releaseUrl,
    installed_app_path: appPath,
    command_preview: [getOpenCommand(), appPath],
    note: result.exitCode === 0 ? null : (result.stderr || result.stdout || 'open command failed'),
  };
}

function copyMountedApp(mountPoint: string, applicationsDir: string) {
  try {
    const appName = fs.readdirSync(mountPoint).find((entry) => entry.endsWith('.app'));
    if (!appName) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: `No .app bundle found in mounted OPL GUI image: ${mountPoint}`,
        appPath: null,
      };
    }

    fs.mkdirSync(applicationsDir, { recursive: true });
    const sourcePath = path.join(mountPoint, appName);
    const appPath = path.join(applicationsDir, appName);
    fs.rmSync(appPath, { recursive: true, force: true });
    fs.cpSync(sourcePath, appPath, { recursive: true });
    return {
      exitCode: 0,
      stdout: '',
      stderr: '',
      appPath,
    };
  } catch (error) {
    return {
      exitCode: 1,
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error),
      appPath: null,
    };
  }
}

function installOplGuiFromRelease(base = buildGuiActionBase()) {
  if (getGuiInstallPlatform() !== 'darwin' || !base.releaseUrl || !base.releaseAsset) {
    return {
      status: 'unsupported_platform' as const,
      strategy: 'install_release_asset_then_open_app',
      release_repo: base.releaseRepo,
      release_tag: base.releaseTag,
      opl_release_version: base.releaseVersion,
      release_asset: base.releaseAsset,
      release_url: base.releaseUrl,
      installed_app_path: null,
      command_preview: [],
      note: 'Automatic OPL GUI installation currently supports macOS release DMG assets only.',
    };
  }

  const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-gui-install-'));
  const dmgPath = path.join(workRoot, base.releaseAsset);
  const mountPoint = path.join(workRoot, 'mount');
  fs.mkdirSync(mountPoint, { recursive: true });

  const curlResult = runCommand(getCurlCommand(), ['-fL', '--create-dirs', '-o', dmgPath, base.releaseUrl]);
  if (curlResult.exitCode !== 0) {
    fs.rmSync(workRoot, { recursive: true, force: true });
    return {
      status: 'failed' as const,
      strategy: 'install_release_asset_then_open_app',
      release_repo: base.releaseRepo,
      release_tag: base.releaseTag,
      opl_release_version: base.releaseVersion,
      release_asset: base.releaseAsset,
      release_url: base.releaseUrl,
      installed_app_path: null,
      command_preview: [getCurlCommand(), '-fL', '--create-dirs', '-o', dmgPath, base.releaseUrl],
      note: curlResult.stderr || curlResult.stdout || 'GUI release asset download failed',
    };
  }

  const attachResult = runCommand(getHdiutilCommand(), ['attach', dmgPath, '-nobrowse', '-readonly', '-mountpoint', mountPoint]);
  if (attachResult.exitCode !== 0) {
    fs.rmSync(workRoot, { recursive: true, force: true });
    return {
      status: 'failed' as const,
      strategy: 'install_release_asset_then_open_app',
      release_repo: base.releaseRepo,
      release_tag: base.releaseTag,
      opl_release_version: base.releaseVersion,
      release_asset: base.releaseAsset,
      release_url: base.releaseUrl,
      installed_app_path: null,
      command_preview: [getHdiutilCommand(), 'attach', dmgPath, '-nobrowse', '-readonly', '-mountpoint', mountPoint],
      note: attachResult.stderr || attachResult.stdout || 'GUI release asset mount failed',
    };
  }

  try {
    const copyResult = copyMountedApp(mountPoint, getApplicationsDir());
    if (copyResult.exitCode !== 0 || !copyResult.appPath) {
      return {
        status: 'failed' as const,
        strategy: 'install_release_asset_then_open_app',
        release_repo: base.releaseRepo,
        release_tag: base.releaseTag,
        opl_release_version: base.releaseVersion,
        release_asset: base.releaseAsset,
        release_url: base.releaseUrl,
        installed_app_path: null,
        command_preview: ['cp', '-R', `${mountPoint}/*.app`, getApplicationsDir()],
        note: copyResult.stderr || copyResult.stdout || 'GUI app copy failed',
      };
    }

    const openResult = openInstalledOplGui(copyResult.appPath, base);
    return {
      ...openResult,
      strategy: 'install_release_asset_then_open_app' as const,
      installed_app_path: copyResult.appPath,
      command_preview: [
        getCurlCommand(), '-fL', '--create-dirs', '-o', dmgPath, base.releaseUrl,
        '&&', getHdiutilCommand(), 'attach', dmgPath, '-nobrowse', '-readonly', '-mountpoint', mountPoint,
        '&&', 'cp', '-R', `${mountPoint}/*.app`, getApplicationsDir(),
        '&&', getOpenCommand(), copyResult.appPath,
      ],
    };
  } finally {
    runCommand(getHdiutilCommand(), ['detach', mountPoint]);
    fs.rmSync(workRoot, { recursive: true, force: true });
  }
}

function installOrOpenOplGui() {
  const candidates = [
    path.join(getApplicationsDir(), 'One Person Lab.app'),
    path.join(getApplicationsDir(), 'OPL.app'),
  ];
  const candidate = candidates.find((appPath) => runCommand('test', ['-d', appPath]).exitCode === 0);
  if (candidate) {
    return openInstalledOplGui(candidate);
  }
  return installOplGuiFromRelease();
}

export async function runOplTurnkeyInstall(
  contracts: GatewayContracts,
  input: OplTurnkeyInstallInput = {},
) {
  const modules = normalizeModuleSelection(input.modules);
  const firstRunLog = buildOplFirstRunLogSurface();
  const firstRunLogEvents = [
    appendOplFirstRunLogEvent('install_started', {
      selected_modules: input.skipModules ? [] : modules,
      selected_engines: input.skipEngines ? [] : [...DEFAULT_ENGINES],
      skip_gui_open: Boolean(input.skipGuiOpen),
      skip_native_helper_repair: Boolean(input.skipNativeHelperRepair),
    }),
  ];

  try {
    const codexConfigBootstrap = bootstrapLocalCodexDefaults();
    const environment = (await buildOplEnvironment(contracts)).system_environment;
    const engineActions = input.skipEngines
      ? []
      : await Promise.all(DEFAULT_ENGINES.map(async (engineId) => {
        const engine = environment.core_engines[engineId];
        const shouldReuseExisting =
          engine.health_status === 'ready'
          || (engineId === 'hermes' && engine.installed);
        if (shouldReuseExisting) {
          return {
            version: 'g2',
            engine_action: {
              engine_id: engineId,
              action: 'install' as const,
              status: 'skipped_installed' as const,
              strategy: 'already_installed',
              command_preview: [],
              note: `${engineId} is already installed; OPL install reuses the existing local runtime dependency.`,
              stdout: '',
              stderr: '',
              system_environment: environment,
            },
          };
        }
        return runOplEngineAction(contracts, 'install', engineId);
      }));
    const moduleActions = input.skipModules
      ? []
      : modules.map((moduleId) => runOplModuleAction('install', moduleId));
    const moduleRepoPaths = new Map<OplModuleId, string>(
      moduleActions.map((entry) => [
        entry.module_action.module.module_id,
        entry.module_action.module.checkout_path,
      ]),
    );
    const codexPluginRegistry = registerOplFamilyCodexPlugins(modules, moduleRepoPaths);
    const serviceAction: null = null;
    const guiOpenAction = input.skipGuiOpen ? null : installOrOpenOplGui();
    const nativeHelperAction = runNativeHelperRepairAction({ skip: input.skipNativeHelperRepair });
    firstRunLogEvents.push(
      appendOplFirstRunLogEvent('runtime_manager_repair_started', {
        status: 'started',
        skip_native_helper_repair: Boolean(input.skipNativeHelperRepair),
      }),
      appendOplFirstRunLogEvent('online_management_repair_started', {
        status: 'started',
        blocking: false,
        repair_action: 'repair_hermes_gateway',
        skip_native_helper_repair: Boolean(input.skipNativeHelperRepair),
      }),
    );
    const runtimeManagerAction = runRuntimeManagerAction({
      mode: 'apply',
      skipNativeHelpers: Boolean(input.skipNativeHelperRepair),
    });
    const onlineManagementRepair = runtimeManagerAction.runtime_manager_action.executed_actions.find(
      (action) => action.action_id === 'repair_hermes_gateway',
    );
    const onlineManagementRepairEventType =
      onlineManagementRepair?.status === 'failed'
        ? 'online_management_repair_failed'
        : 'online_management_repair_completed';
    firstRunLogEvents.push(
      appendOplFirstRunLogEvent('runtime_manager_repair_completed', {
        status: runtimeManagerAction.runtime_manager_action.status,
        executed_actions: runtimeManagerAction.runtime_manager_action.executed_actions.map((action) => ({
          action_id: action.action_id,
          status: action.status,
        })),
      }),
      appendOplFirstRunLogEvent(onlineManagementRepairEventType, {
        status: onlineManagementRepair?.status ?? 'skipped',
        blocking: false,
        executed_actions: runtimeManagerAction.runtime_manager_action.executed_actions
          .filter((action) => action.action_id === 'repair_hermes_gateway')
          .map((action) => ({
            action_id: action.action_id,
            status: action.status,
            blocking: action.blocking ?? false,
            action_lane: action.action_lane ?? 'online_management',
            capability: action.capability ?? 'online_task_management',
          })),
      }),
    );
    const companionSkillSync = syncOplCompanionSkills(undefined, { mode: 'managed', superpowersProfile: 'keep' });
    const initialize = await buildOplInitialize(contracts);
    firstRunLogEvents.push(
      appendOplFirstRunLogEvent('install_completed', {
        status: 'completed',
        selected_modules: modules,
        engine_actions_count: engineActions.length,
        module_actions_count: moduleActions.length,
        gui_open_status: guiOpenAction?.status ?? 'skipped',
        setup_phase: initialize.system_initialize.setup_flow.phase,
        blocking_items: initialize.system_initialize.setup_flow.blocking_items,
      }),
    );

    return {
      version: 'g2',
      opl_install: {
        surface_id: 'opl_install',
        status: 'completed',
        selected_engines: [...DEFAULT_ENGINES],
        selected_modules: modules,
        codex_config_bootstrap: codexConfigBootstrap,
        codex_plugin_registry: codexPluginRegistry,
        engine_actions: engineActions.map((entry) => entry.engine_action),
        module_actions: moduleActions.map((entry) => entry.module_action),
        service_action: serviceAction,
        runtime_manager_action: runtimeManagerAction.runtime_manager_action,
        background_actions: runtimeManagerAction.runtime_manager_action.background_actions,
        non_blocking_actions: runtimeManagerAction.runtime_manager_action.non_blocking_actions,
        gui_open_action: guiOpenAction,
        gui_shell: buildOplGuiShellSurface(resolveProjectRoot()),
        native_helper_action: nativeHelperAction,
        companion_skill_sync: companionSkillSync,
        system_initialize: initialize.system_initialize,
        first_run_log: firstRunLog,
        first_run_log_events: firstRunLogEvents,
        notes: [
          'This command is the user-facing one-shot path for OPL + Codex CLI + Hermes online management + family modules + recommended Codex skills + desktop GUI. Hermes-Agent remains the external online-management runtime substrate and is installed or reused by default.',
          'Hermes gateway repair is reported as a non-blocking online-management background action; local Codex and core OPL entry can continue while that service becomes ready.',
          'Recommended skill sync is conservative: existing user-managed skill directories are preserved, Superpowers stays on the current user profile by default, and missing optional skill sources are reported for Environment Management.',
          'GUI startup opens the installed One Person Lab app when present; otherwise it downloads and installs the matching one-person-lab release asset before opening the app. opl-aion-shell remains an internal GUI source/build input.',
        ],
      },
    };
  } catch (error) {
    firstRunLogEvents.push(
      appendOplFirstRunLogEvent('install_failed', {
        status: 'failed',
        selected_modules: modules,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    throw error;
  }
}

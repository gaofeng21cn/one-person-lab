import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildOplGuiArtifactName, buildOplReleaseTag, getOplReleaseRepo, getOplReleaseVersion } from '../opl-release.ts';
import { buildOplGuiShellSurface, syncOplCompanionSkills } from '../install-companions.ts';
import { bootstrapLocalCodexDefaults } from '../local-codex-defaults.ts';
import { runNativeHelperRepairAction } from '../native-helper-runtime.ts';
import type { GatewayContracts } from '../types.ts';

import { runFrontDeskEngineAction } from './engine-actions.ts';
import { registerOplFamilyCodexPlugins } from './codex-plugin-registry.ts';
import { buildFrontDeskEnvironment } from './environment.ts';
import { buildFrontDeskInitialize } from './initialize.ts';
import { runFrontDeskModuleAction } from './modules.ts';
import { resolveProjectRoot, runCommand } from './shared.ts';
import type { FrontDeskModuleId, FrontDeskTurnkeyInstallInput } from './shared.ts';

const DEFAULT_MODULES: FrontDeskModuleId[] = ['medautoscience', 'meddeepscientist', 'medautogrant', 'redcube'];
const DEFAULT_ENGINES = ['codex', 'hermes'] as const;

function normalizeModuleId(raw: string): FrontDeskModuleId {
  const normalized = raw.trim().toLowerCase();
  const aliases = new Map<string, FrontDeskModuleId>([
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

export async function runFrontDeskTurnkeyInstall(
  contracts: GatewayContracts,
  input: FrontDeskTurnkeyInstallInput = {},
) {
  const codexConfigBootstrap = bootstrapLocalCodexDefaults();
  const modules = normalizeModuleSelection(input.modules);
  const environment = (await buildFrontDeskEnvironment(contracts)).frontdesk_environment;
  const engineActions = input.skipEngines
    ? []
    : await Promise.all(DEFAULT_ENGINES.map(async (engineId) => {
      const engine = environment.core_engines[engineId];
      if (engine.health_status === 'ready') {
        return {
          version: 'g2',
          frontdesk_engine_action: {
            engine_id: engineId,
            action: 'install' as const,
            status: 'skipped_installed' as const,
            strategy: 'already_installed',
            command_preview: [],
            note: `${engineId} is already installed; OPL install reuses the existing local runtime dependency.`,
            stdout: '',
            stderr: '',
            frontdesk_environment: environment,
          },
        };
      }
      return runFrontDeskEngineAction(contracts, 'install', engineId);
    }));
  const moduleActions = input.skipModules
    ? []
    : modules.map((moduleId) => runFrontDeskModuleAction('install', moduleId));
  const moduleRepoPaths = new Map<FrontDeskModuleId, string>(
    moduleActions.map((entry) => [
      entry.frontdesk_module_action.module.module_id,
      entry.frontdesk_module_action.module.checkout_path,
    ]),
  );
  const codexPluginRegistry = registerOplFamilyCodexPlugins(modules, moduleRepoPaths);
  const serviceAction: null = null;
  const guiOpenAction = input.skipGuiOpen ? null : installOrOpenOplGui();
  const nativeHelperAction = runNativeHelperRepairAction({ skip: input.skipNativeHelperRepair });
  const companionSkillSync = syncOplCompanionSkills(undefined, { mode: 'observe', superpowersProfile: 'keep' });
  const initialize = await buildFrontDeskInitialize(contracts);

  return {
    version: 'g2',
    frontdesk_turnkey_install: {
      surface_id: 'opl_install',
      status: 'completed',
      selected_engines: [...DEFAULT_ENGINES],
      selected_modules: modules,
      codex_config_bootstrap: codexConfigBootstrap,
      codex_plugin_registry: codexPluginRegistry,
      engine_actions: engineActions.map((entry) => entry.frontdesk_engine_action),
      module_actions: moduleActions.map((entry) => entry.frontdesk_module_action),
      gui_open_action: guiOpenAction,
      gui_shell: buildOplGuiShellSurface(resolveProjectRoot()),
      native_helper_action: nativeHelperAction,
      companion_skill_sync: companionSkillSync,
      system_initialize: initialize.frontdesk_initialize,
      notes: [
        'This command is the user-facing one-shot path for OPL + Codex CLI + Hermes-Agent + family modules + desktop GUI. Companion skills are inspected by default and only applied through an explicit managed skill action.',
        'GUI startup opens the installed One Person Lab app when present; otherwise it downloads and installs the matching one-person-lab release asset before opening the app. opl-aion-shell remains an internal GUI source/build input.',
      ],
    },
  };
}

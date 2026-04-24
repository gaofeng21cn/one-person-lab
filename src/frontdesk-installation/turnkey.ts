import { buildOplGuiArtifactName, buildOplReleaseTag, getOplReleaseRepo, getOplReleaseVersion } from '../opl-release.ts';
import { openFrontDeskService } from '../frontdesk-service.ts';
import { buildOplGuiShellSurface, syncOplCompanionSkills } from '../install-companions.ts';
import type { GatewayContracts } from '../types.ts';

import { runFrontDeskEngineAction } from './engine-actions.ts';
import { buildFrontDeskEnvironment } from './environment.ts';
import { buildFrontDeskInitialize } from './initialize.ts';
import { runFrontDeskModuleAction } from './modules.ts';
import { resolveProjectRoot, runCommand } from './shared.ts';
import { runFrontDeskSystemAction } from './system-actions.ts';
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

function tryOpenOplGui() {
  const candidates = ['/Applications/One Person Lab.app', '/Applications/OPL.app'];
  const candidate = candidates.find((appPath) => runCommand('test', ['-d', appPath]).exitCode === 0);
  const releaseVersion = getOplReleaseVersion();
  const releaseRepo = getOplReleaseRepo();
  const releaseTag = buildOplReleaseTag(releaseVersion);
  const releaseAsset = process.platform === 'darwin' ? buildMacReleaseAssetName() : null;
  const releaseUrl = process.platform === 'darwin' ? buildOplGuiReleaseUrl() : null;

  if (!candidate) {
    return {
      status: 'manual_required' as const,
      strategy: 'download_opl_release_asset_then_open_app',
      release_repo: releaseRepo,
      release_tag: releaseTag,
      opl_release_version: releaseVersion,
      release_asset: releaseAsset,
      release_url: releaseUrl,
      command_preview: releaseUrl ? ['open', releaseUrl] : ['open', '/Applications/One Person Lab.app'],
      note: 'The One Person Lab desktop app is distributed from the one-person-lab GitHub Release. The opl-aion-shell repository is the internal GUI source/build input and is only used for fallback source builds.',
    };
  }

  const result = runCommand('open', [candidate]);
  return {
    status: result.exitCode === 0 ? 'completed' as const : 'failed' as const,
    strategy: 'open_installed_app',
    release_repo: releaseRepo,
    release_tag: releaseTag,
    opl_release_version: releaseVersion,
    release_asset: releaseAsset,
    release_url: releaseUrl,
    command_preview: ['open', candidate],
    note: result.exitCode === 0 ? null : (result.stderr || result.stdout || 'open command failed'),
  };
}

export async function runFrontDeskTurnkeyInstall(
  contracts: GatewayContracts,
  input: FrontDeskTurnkeyInstallInput = {},
) {
  const modules = normalizeModuleSelection(input.modules);
  const environment = (await buildFrontDeskEnvironment(contracts)).frontdesk_environment;
  const engineActions = input.skipEngines
    ? []
    : await Promise.all(DEFAULT_ENGINES.map(async (engineId) => {
      const engine = environment.core_engines[engineId];
      if (engine.installed) {
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
  const serviceAction = input.skipService
    ? null
    : await runFrontDeskSystemAction(contracts, 'reinstall_support', {
      host: input.host,
      port: input.port,
      workspacePath: input.workspacePath,
      sessionsLimit: input.sessionsLimit,
      basePath: input.basePath,
    });
  const webOpenAction = input.skipWebOpen || input.skipService
    ? null
    : await openFrontDeskService(contracts);
  const guiOpenAction = input.skipGuiOpen ? null : tryOpenOplGui();
  const companionSkillSync = syncOplCompanionSkills();
  const initialize = await buildFrontDeskInitialize(contracts);

  return {
    version: 'g2',
    frontdesk_turnkey_install: {
      surface_id: 'opl_install',
      status: 'completed',
      selected_engines: [...DEFAULT_ENGINES],
      selected_modules: modules,
      engine_actions: engineActions.map((entry) => entry.frontdesk_engine_action),
      module_actions: moduleActions.map((entry) => entry.frontdesk_module_action),
      service_action: serviceAction?.frontdesk_system_action ?? null,
      web_open_action: webOpenAction?.frontdesk_service ?? null,
      gui_open_action: guiOpenAction,
      gui_shell: buildOplGuiShellSurface(resolveProjectRoot()),
      companion_skill_sync: companionSkillSync,
      system_initialize: initialize.frontdesk_initialize,
      notes: [
        'This command is the user-facing one-shot path for OPL + Codex CLI + Hermes-Agent + family modules + companion Codex skills.',
        'GUI startup opens the installed One Person Lab app when present; otherwise it reports the matching one-person-lab release asset to download. opl-aion-shell remains an internal GUI source/build input.',
      ],
    },
  };
}

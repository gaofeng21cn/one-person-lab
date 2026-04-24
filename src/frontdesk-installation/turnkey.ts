import { openFrontDeskService } from '../frontdesk-service.ts';
import { buildOplGuiShellSurface } from '../install-companions.ts';
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

function tryOpenOplGui() {
  const candidates = ['/Applications/One Person Lab.app', '/Applications/OPL.app'];
  const candidate = candidates.find((appPath) => runCommand('test', ['-d', appPath]).exitCode === 0);
  if (!candidate) {
    return {
      status: 'manual_required' as const,
      strategy: 'opl_branded_prebuilt_release_or_source_build',
      command_preview: ['open', '/Applications/One Person Lab.app'],
      note: 'The OPL-branded desktop GUI is not installed under /Applications. Install a matching opl-aion-shell OPL release asset, or build the OPL-branded shell from source as the fallback. The upstream AionUI.app is not treated as the OPL GUI.',
    };
  }

  const result = runCommand('open', [candidate]);
  return {
    status: result.exitCode === 0 ? 'completed' as const : 'failed' as const,
    strategy: 'open_installed_app',
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
      system_initialize: initialize.frontdesk_initialize,
      notes: [
        'This command is the user-facing one-shot path for OPL + Codex CLI + Hermes-Agent + family modules + local Product API.',
        'GUI startup only opens an installed OPL-branded desktop app. The upstream AionUI app is not treated as the OPL GUI.',
      ],
    },
  };
}

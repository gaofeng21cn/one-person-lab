import { openFrontDeskService } from '../frontdesk-service.ts';
import { buildOplGuiShellSurface } from '../install-companions.ts';
import type { GatewayContracts } from '../types.ts';

import { buildFrontDeskInitialize } from './initialize.ts';
import { runFrontDeskModuleAction } from './modules.ts';
import { resolveProjectRoot, runCommand } from './shared.ts';
import { runFrontDeskSystemAction } from './system-actions.ts';
import type { FrontDeskModuleId, FrontDeskTurnkeyInstallInput } from './shared.ts';

const DEFAULT_MODULES: FrontDeskModuleId[] = ['medautoscience', 'medautogrant', 'redcube'];

function normalizeModuleId(raw: string): FrontDeskModuleId {
  const normalized = raw.trim().toLowerCase();
  const aliases = new Map<string, FrontDeskModuleId>([
    ['mas', 'medautoscience'],
    ['med-autoscience', 'medautoscience'],
    ['med_autoscience', 'medautoscience'],
    ['medautoscience', 'medautoscience'],
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

function tryOpenAionUi() {
  const candidates = ['/Applications/AionUi.app', '/Applications/AionUI.app'];
  const candidate = candidates.find((appPath) => runCommand('test', ['-d', appPath]).exitCode === 0);
  if (!candidate) {
    return {
      status: 'manual_required' as const,
      strategy: 'prebuilt_release_or_source_build',
      command_preview: ['open', '/Applications/AionUi.app'],
      note: 'AionUI.app is not installed under /Applications. Install a matching opl-aion-shell release asset, or build from source as the fallback.',
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
  const guiOpenAction = input.skipGuiOpen ? null : tryOpenAionUi();
  const initialize = await buildFrontDeskInitialize(contracts);

  return {
    version: 'g2',
    frontdesk_turnkey_install: {
      surface_id: 'opl_install',
      status: 'completed',
      selected_modules: modules,
      module_actions: moduleActions.map((entry) => entry.frontdesk_module_action),
      service_action: serviceAction?.frontdesk_system_action ?? null,
      web_open_action: webOpenAction?.frontdesk_service ?? null,
      gui_open_action: guiOpenAction,
      gui_shell: buildOplGuiShellSurface(resolveProjectRoot()),
      system_initialize: initialize.frontdesk_initialize,
      notes: [
        'This command is the user-facing one-shot path for OPL + family modules + local Product API.',
        'GUI startup opens an installed AionUI app when present; otherwise the payload points to the prebuilt release or source-build fallback.',
      ],
    },
  };
}

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { OplModuleId } from './shared.ts';

const FIRST_RUN_EVENT_SCHEMA_VERSION = 'opl_first_run_event.v1';

const GUI_FIRST_RUN_ACCESSIBILITY_LABELS = {
  window: 'opl-first-run-window',
  progress: 'opl-first-run-progress',
  blockersList: 'opl-first-run-blockers-list',
  installButton: 'opl-first-run-install-button',
  codexApiKeyInput: 'opl-first-run-codex-api-key-input',
  codexConfigureButton: 'opl-first-run-configure-codex-button',
  retryButton: 'opl-first-run-retry-button',
  environmentButton: 'opl-first-run-open-environment-button',
  modulesButton: 'opl-first-run-open-modules-button',
  readyEntry: 'opl-first-run-ready-entry',
  settingsEnvironment: 'opl-settings-environment',
} as const;

type FirstRunLogEventType =
  | 'install_started'
  | 'install_completed'
  | 'install_failed';

function resolveHomeDir() {
  return process.env.HOME?.trim() || os.homedir();
}

export function resolveOplFirstRunLogPath() {
  const explicitPath = process.env.OPL_FIRST_RUN_LOG_PATH?.trim();
  if (explicitPath) {
    return path.resolve(explicitPath);
  }

  return path.join(resolveHomeDir(), 'Library', 'Logs', 'One Person Lab', 'first-run.jsonl');
}

export function buildOplFirstRunLogSurface() {
  return {
    surface_id: 'opl_first_run_log',
    log_format: 'jsonl',
    event_schema_version: FIRST_RUN_EVENT_SCHEMA_VERSION,
    log_path: resolveOplFirstRunLogPath(),
    override_env: 'OPL_FIRST_RUN_LOG_PATH',
    required_event_fields: ['timestamp', 'event_type', 'schema_version', 'surface_id', 'payload'],
    writer_owner: 'OPL CLI',
    consumer_owner: 'One Person Lab GUI',
  };
}

export function buildOplGuiFirstRunAutomationContract() {
  return {
    surface_id: 'opl_gui_first_run_automation',
    command_flow: [
      'opl system initialize',
      'opl install --skip-gui-open',
      'opl modules',
    ],
    accessibility_labels: GUI_FIRST_RUN_ACCESSIBILITY_LABELS,
    vm_artifacts: [
      '~/Library/Logs/One Person Lab/first-run.jsonl',
      '~/Library/Application Support/OPL/state',
      'opl system initialize --json',
      'opl modules --json',
      'launch screenshot',
      'macOS unified log excerpt for One Person Lab',
    ],
    vm_implementation: {
      repo: 'gaofeng21cn/opl-aion-shell',
      packaged_guest_smoke_command: 'bun run test:opl-first-run-vm -- --dmg <release.dmg> --assert-clean',
      tart_host_smoke_command:
        'bun run test:opl-first-run-vm:tart -- --source-vm <clean-tart-vm> --dmg <release.dmg>',
      nightly_workflow: '.github/workflows/opl-first-run-vm.yml',
      default_self_hosted_runner_labels: ['self-hosted', 'macOS', 'opl-gui-vm'],
      required_guest_capabilities: [
        'clean macOS user state',
        'SSH access from the host runner',
        'Node.js for the guest smoke harness',
        'logged-in GUI session',
        'Accessibility permission for osascript/System Events',
      ],
    },
    owner_split: {
      opl_cli: 'installs dependencies, reports machine-readable state, and writes first-run JSONL events',
      opl_aion_shell: 'renders first-run state, exposes stable accessibility labels, and shows blockers',
    },
  };
}

export function buildOplFreshInstallTestMatrix() {
  const requiredModules: OplModuleId[] = ['medautoscience', 'meddeepscientist', 'medautogrant', 'redcube'];

  return {
    surface_id: 'opl_fresh_install_test_matrix',
    version: 'g1',
    local_smoke_command: 'npm run test:fresh-install',
    vm_smoke_command: 'npm run fresh-install:smoke -- --vm-artifacts-only',
    required_modules: requiredModules,
    scenarios: [
      {
        scenario_id: 'clean_user_missing_codex',
        layer: 'local_cli',
        setup: 'temporary HOME and OPL_STATE_DIR, no codex on PATH, empty managed modules root',
        expected_phase: 'environment',
        expected_blockers: ['codex', 'codex_config', 'domain_modules'],
      },
      {
        scenario_id: 'compatible_codex_missing_modules',
        layer: 'local_cli',
        setup: 'temporary HOME and OPL_STATE_DIR, fake compatible codex on PATH, empty managed modules root',
        expected_phase: 'environment',
        expected_blockers: ['codex_config', 'domain_modules'],
      },
      {
        scenario_id: 'outdated_codex',
        layer: 'local_cli',
        setup: 'temporary HOME and OPL_STATE_DIR, fake outdated codex on PATH',
        expected_phase: 'environment',
        expected_blockers: ['codex', 'codex_config', 'domain_modules'],
      },
      {
        scenario_id: 'ready_baseline',
        layer: 'local_cli',
        setup: 'temporary HOME and OPL_STATE_DIR, fake compatible codex, and git-backed managed module fixtures',
        expected_phase: 'review',
        expected_blockers: [],
      },
      {
        scenario_id: 'offline_module_install_blocker',
        layer: 'local_cli',
        setup: 'temporary HOME and invalid module repo URL without network access',
        expected_failure_code: 'build_command_failed',
      },
      {
        scenario_id: 'clean_vm_release_first_launch',
        layer: 'macos_vm_gui',
        setup:
          'clean macOS VM snapshot through gaofeng21cn/opl-aion-shell .github/workflows/opl-first-run-vm.yml, downloaded One Person Lab release DMG, no existing OPL state',
        expected_artifacts: [
          'first-run JSONL log',
          'system initialize JSON',
          'modules JSON',
          'launch screenshot',
          'macOS unified log excerpt for One Person Lab',
        ],
      },
    ],
  };
}

export function appendOplFirstRunLogEvent(
  eventType: FirstRunLogEventType,
  payload: Record<string, unknown>,
) {
  const surface = buildOplFirstRunLogSurface();
  const event = {
    timestamp: new Date().toISOString(),
    event_type: eventType,
    schema_version: FIRST_RUN_EVENT_SCHEMA_VERSION,
    surface_id: surface.surface_id,
    pid: process.pid,
    cwd: process.cwd(),
    payload,
  };

  try {
    fs.mkdirSync(path.dirname(surface.log_path), { recursive: true });
    fs.appendFileSync(surface.log_path, `${JSON.stringify(event)}\n`, 'utf8');
    return {
      status: 'written' as const,
      event_type: eventType,
      log_path: surface.log_path,
    };
  } catch (error) {
    return {
      status: 'failed' as const,
      event_type: eventType,
      log_path: surface.log_path,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

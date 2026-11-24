import {
  buildOplDockerWebuiDoctor,
  runOplSystemAction,
  runOplTurnkeyInstall,
} from '../../../adapters/integration/index.ts';
import type { FrameworkContracts } from '../../../kernel/types.ts';
import {
  buildDockerWebuiSettingsManualAction,
} from './action-execute-previews.ts';
import type { AppActionExecuteOptions } from './action-execute-parser.ts';

export async function executeDockerWebuiSetupAction(
  contracts: FrameworkContracts,
  options: AppActionExecuteOptions,
) {
  if (options.actionId === 'settings_install_docker_webui') {
    return {
      delegatedSurface: 'opl install --headless',
      result: options.dryRun
        ? buildDockerWebuiSettingsManualAction(options.actionId, ['opl', 'install', '--headless', '--json'], options.payload)
        : await runOplTurnkeyInstall(contracts, { headless: true }),
    };
  }

  if (options.actionId === 'settings_configure_webui_api_key') {
    return {
      delegatedSurface: 'printf <api-key> | opl system configure-codex --api-key-stdin',
      result: buildDockerWebuiSettingsManualAction(
        options.actionId,
        ['printf', '<api-key>', '|', 'opl', 'system', 'configure-codex', '--api-key-stdin', '--json'],
        options.payload,
      ),
    };
  }

  return null;
}

export async function executeDockerWebuiOperationalAction(
  contracts: FrameworkContracts,
  options: AppActionExecuteOptions,
) {
  if (options.actionId === 'settings_run_webui_startup_maintenance') {
    return {
      delegatedSurface: 'opl system startup-maintenance',
      result: options.dryRun
        ? buildDockerWebuiSettingsManualAction(options.actionId, ['opl', 'system', 'startup-maintenance', '--json'], options.payload)
        : await runOplSystemAction(contracts, 'startup_maintenance'),
    };
  }

  if (options.actionId === 'settings_open_docker_webui') {
    const doctor = buildOplDockerWebuiDoctor();
    return {
      delegatedSurface: 'opl system docker-webui doctor --json#docker_webui_doctor.browser.url',
      result: {
        docker_webui_browser_entry: {
          surface_kind: 'opl_docker_webui_browser_entry.v1',
          action_id: options.actionId,
          status: doctor.docker_webui_doctor.browser.url ? 'url_available' : 'url_not_visible',
          browser_url: doctor.docker_webui_doctor.browser.url,
          verify_action_id: 'settings_diagnose_docker_webui',
          doctor_summary: doctor.docker_webui_doctor.diagnostic_summary,
          authority_boundary: {
            mutates: 'none_read_only',
            shell_owns_browser_navigation: true,
            can_claim_runtime_ready: false,
            can_claim_app_release_ready: false,
          },
        },
      },
    };
  }

  if (options.actionId === 'settings_diagnose_docker_webui') {
    return {
      delegatedSurface: 'opl system docker-webui doctor',
      result: buildOplDockerWebuiDoctor(),
    };
  }

  return null;
}

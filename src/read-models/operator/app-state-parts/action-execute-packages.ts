import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import { readAppPackagePreferences, setAppPackageEnabled } from '../../../kernel/app-package-preferences.ts';
import {
  runOplAgentPackageExposureAction,
  runOplAgentPackageHomeShortcutPreferencesSet,
  runOplAgentPackageInstall,
  runOplAgentPackageRepair,
  runOplAgentPackageUninstall,
  runOplAgentPackageUpdate,
  agentPackageDelegatedSurface,
} from '../../../adapters/integration/index.ts';
import { preflightAppContribution, runAppContribution } from '../app-contribution-broker.ts';
import {
  agentPackageIdPayload,
  agentPackageInstallPayload,
  agentPackageManifestInstallPayload,
  agentPackagePreferencesPayload,
  packageContributionExecutePayload,
} from './action-execute-payloads.ts';
import type { AppActionExecuteOptions } from './action-execute-parser.ts';
import type { AppActionExecuteServices } from './action-execute-types.ts';
import {
  OPL_PACK_PROVISION_SUBMISSION_RESOURCE_ACTION_ID,
  provisionSubmissionResource,
} from '../../../authority/packages/index.ts';

function requireAgentPackageDelegatedSurface(actionId: string) {
  const delegatedSurface = agentPackageDelegatedSurface(actionId);
  if (!delegatedSurface) {
    throw new FrameworkContractError('contract_shape_invalid', `Unknown Agent Package action catalog entry: ${actionId}.`, {
      action_id: actionId,
    });
  }
  return delegatedSurface;
}

export function executePackageContributionAppAction(
  options: AppActionExecuteOptions,
  services: AppActionExecuteServices,
) {
  if (options.actionId === 'package_contribution_execute') {
    const contribution = packageContributionExecutePayload(options.payload);
    if (readAppPackagePreferences()[contribution.packageId] === false) {
      throw new FrameworkContractError('cli_usage_error', 'This package is disabled in OPL App.', {
        failure_code: 'package_disabled_in_app',
        package_id: contribution.packageId,
        recovery_action: 'package_app_set_enabled',
      });
    }
    const request = { ...contribution, operation: 'execute' as const };
    return {
      delegatedSurface: 'opl app contribution execute',
      result: options.dryRun
        ? preflightAppContribution(request, { descriptorDiscovery: services.descriptorDiscovery })
        : runAppContribution(request, { descriptorDiscovery: services.descriptorDiscovery }),
    };
  }

  if (options.actionId === OPL_PACK_PROVISION_SUBMISSION_RESOURCE_ACTION_ID) {
    return {
      delegatedSurface: 'opl pack provision-submission-resource',
      result: provisionSubmissionResource({
        ...options.payload,
        dry_run: options.dryRun,
      }),
    };
  }

  return null;
}

export async function executeAgentPackageAppAction(options: AppActionExecuteOptions) {
  if (options.actionId === 'package_app_set_enabled') {
    return {
      delegatedSurface: requireAgentPackageDelegatedSurface(options.actionId),
      result: setAppPackageEnabled({
        ...agentPackageIdPayload(options.actionId, options.payload),
        enabled: options.payload.enabled,
        dryRun: options.dryRun,
      }),
    };
  }

  if (options.actionId === 'agent_package_install') {
    const installPayload = agentPackageInstallPayload(options.payload);
    return {
      delegatedSurface: requireAgentPackageDelegatedSurface(options.actionId),
      result: await runOplAgentPackageInstall({
        ...installPayload,
        dryRun: options.dryRun,
      }),
    };
  }

  if (options.actionId === 'install_from_manifest_url') {
    return {
      delegatedSurface: requireAgentPackageDelegatedSurface(options.actionId),
      result: await runOplAgentPackageInstall({
        ...agentPackageManifestInstallPayload(options.payload),
        dryRun: options.dryRun,
      }),
    };
  }

  if (options.actionId === 'agent_package_update') {
    const installPayload = agentPackageInstallPayload(options.payload);
    return {
      delegatedSurface: requireAgentPackageDelegatedSurface(options.actionId),
      result: await runOplAgentPackageUpdate({
        ...installPayload,
        dryRun: options.dryRun,
      }),
    };
  }

  if (options.actionId === 'agent_package_repair') {
    return {
      delegatedSurface: requireAgentPackageDelegatedSurface(options.actionId),
      result: await runOplAgentPackageRepair({
        ...agentPackageIdPayload(options.actionId, options.payload),
        dryRun: options.dryRun,
      }),
    };
  }

  if (options.actionId === 'agent_package_uninstall') {
    return {
      delegatedSurface: requireAgentPackageDelegatedSurface(options.actionId),
      result: await runOplAgentPackageUninstall({
        ...agentPackageIdPayload(options.actionId, options.payload),
        dryRun: options.dryRun,
      }),
    };
  }

  if (options.actionId === 'agent_package_preferences_set') {
    const preferencesPayload = agentPackagePreferencesPayload(options.payload);
    if (preferencesPayload.exposureAction) {
      return {
        delegatedSurface: `opl packages ${preferencesPayload.exposureAction} --package-id <package_id>`,
        result: await runOplAgentPackageExposureAction(preferencesPayload.exposureAction, {
          packageId: preferencesPayload.packageId,
          dryRun: options.dryRun,
        }),
      };
    }
    return {
      delegatedSurface: 'opl packages preferences set --package-id <package_id> --shortcut-id <shortcut_id>',
      result: await runOplAgentPackageHomeShortcutPreferencesSet({
        packageId: preferencesPayload.packageId,
        shortcutId: preferencesPayload.shortcutId,
        visible: preferencesPayload.visible,
        sortOrder: preferencesPayload.sortOrder,
        dryRun: options.dryRun,
      }),
    };
  }

  return null;
}

import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import {
  buildTaskActionReceiptPreview,
  buildTaskExportBundlePreview,
} from './action-execute-previews.ts';
import type { AppActionExecuteOptions } from './action-execute-parser.ts';

export function executeTaskPreviewAppAction(options: AppActionExecuteOptions) {
  if (options.actionId === 'task_action_receipt_preview') {
    if (!options.dryRun) {
      throw new FrameworkContractError('cli_usage_error', 'task_action_receipt_preview is a dry-run App preview only; execute through the domain owner route.', {
        action_id: options.actionId,
        required_mode: 'dry_run',
        can_write_domain_truth: false,
        can_mutate_artifact_body: false,
        can_create_owner_receipt: false,
      });
    }
    return {
      delegatedSurface: 'opl app action execute --action task_action_receipt_preview --dry-run',
      result: buildTaskActionReceiptPreview(options.payload),
    };
  }

  if (options.actionId === 'task_export_bundle_preview') {
    if (!options.dryRun) {
      throw new FrameworkContractError('cli_usage_error', 'task_export_bundle_preview is a dry-run App preview only; generate bundles through the domain owner route.', {
        action_id: options.actionId,
        required_mode: 'dry_run',
        can_generate_domain_export_bundle: false,
        can_write_domain_truth: false,
        can_create_owner_receipt: false,
      });
    }
    return {
      delegatedSurface: 'opl app action execute --action task_export_bundle_preview --dry-run',
      result: buildTaskExportBundlePreview(options.payload),
    };
  }

  return null;
}

import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import { runOplEngineAction } from '../../../adapters/integration/index.ts';
import {
  setWorkItemControlState,
  setWorkItemVisibilityState,
  type WorkItemUserLifecycleState,
  type WorkItemVisibilityState,
} from '../../../authority/evidence/index.ts';
import { buildOplRuntimeAppState } from '../app-runtime-state.ts';
import {
  observeWorkItemExecutionSessionBinding,
  resolveWorkItemExecutionSessionObservationTarget,
  type ObserveWorkItemExecutionSessionInput,
} from '../work-item-projection/session-activity.ts';
import {
  parseCodexAction,
  stringPayloadField,
} from './action-execute-payloads.ts';
import {
  dryRunEngineAction,
} from './action-execute-previews.ts';
import type { AppActionExecuteOptions } from './action-execute-parser.ts';
import type { runFamilyRuntime } from '../../../adapters/execution/index.ts';
import type { FrameworkContracts } from '../../../kernel/types.ts';

function expectedWorkItemControlGeneration(options: AppActionExecuteOptions) {
  const expectedGeneration = options.payload.expected_generation;
  if (
    expectedGeneration !== undefined
    && expectedGeneration !== null
    && (!Number.isInteger(expectedGeneration) || (expectedGeneration as number) < 0)
  ) {
    throw new FrameworkContractError(
      'cli_usage_error',
      `${options.actionId} expected_generation must be a non-negative integer.`,
      { action_id: options.actionId },
    );
  }
  return expectedGeneration as number | null | undefined;
}

export async function executeRuntimeWorkItemAppAction(
  contracts: FrameworkContracts,
  options: AppActionExecuteOptions,
  familyRuntime: typeof runFamilyRuntime,
) {
  if (options.actionId === 'runtime_archive_attempt' || options.actionId === 'runtime_restore_attempt') {
    const stageAttemptId = stringPayloadField(options.payload, 'stage_attempt_id');
    if (!stageAttemptId) {
      throw new FrameworkContractError('cli_usage_error', `${options.actionId} requires stage_attempt_id.`, {
        action_id: options.actionId,
        required_payload_fields: ['stage_attempt_id'],
      });
    }
    const archive = options.actionId === 'runtime_archive_attempt';
    const reason = stringPayloadField(options.payload, 'reason') ?? (archive ? 'user_archived' : 'user_restored');
    const args = [
      'attempt',
      archive ? 'archive' : 'restore',
      stageAttemptId,
      '--reason',
      reason,
      '--source',
      'opl-app',
    ];
    return {
      delegatedSurface: `opl family-runtime ${args.join(' ')}`,
      result: options.dryRun
        ? {
            surface_kind: 'opl_runtime_attempt_archive_preflight',
            action: archive ? 'archive' : 'restore',
            stage_attempt_id: stageAttemptId,
            reason,
            status: 'dry_run',
          }
        : await familyRuntime(args),
    };
  }

  if (options.actionId === 'work_item_execution_session_observe') {
    const currentProjection = buildOplRuntimeAppState()
      .app_state.operator.workbench.work_item_projection_v2;
    const input = options.payload as ObserveWorkItemExecutionSessionInput;
    const currentItem = resolveWorkItemExecutionSessionObservationTarget(
      currentProjection.items,
      input,
    );
    return {
      delegatedSurface: 'OPL work-item coordination-session binding ledger',
      result: observeWorkItemExecutionSessionBinding(
        input,
        { currentItem, dryRun: options.dryRun },
      ),
    };
  }

  if (options.actionId === 'work_item_lifecycle_set') {
    return {
      delegatedSurface: 'OPL Ledger work-item control transition',
      result: setWorkItemControlState({
        agent_id: stringPayloadField(options.payload, 'agent_id') ?? '',
        project_id: stringPayloadField(options.payload, 'project_id') ?? '',
        work_item_id: stringPayloadField(options.payload, 'work_item_id') ?? '',
        lifecycle_state: stringPayloadField(options.payload, 'lifecycle_state') as WorkItemUserLifecycleState,
        reason: stringPayloadField(options.payload, 'reason'),
        source: 'opl_app',
        expected_generation: expectedWorkItemControlGeneration(options),
      }, { dryRun: options.dryRun }),
    };
  }

  if (options.actionId === 'work_item_visibility_set') {
    return {
      delegatedSurface: 'OPL Ledger work-item visibility transition',
      result: setWorkItemVisibilityState({
        agent_id: stringPayloadField(options.payload, 'agent_id') ?? '',
        project_id: stringPayloadField(options.payload, 'project_id') ?? '',
        work_item_id: stringPayloadField(options.payload, 'work_item_id') ?? '',
        visibility_state: stringPayloadField(options.payload, 'visibility_state') as WorkItemVisibilityState,
        reason: stringPayloadField(options.payload, 'reason'),
        source: 'opl_app',
        expected_generation: expectedWorkItemControlGeneration(options),
      }, { dryRun: options.dryRun }),
    };
  }

  const codexAction = parseCodexAction(options.actionId);
  if (codexAction) {
    return {
      delegatedSurface: `opl engine ${codexAction} --engine codex`,
      result: options.dryRun
        ? dryRunEngineAction(codexAction)
        : await runOplEngineAction(contracts, codexAction, 'codex'),
    };
  }

  return null;
}

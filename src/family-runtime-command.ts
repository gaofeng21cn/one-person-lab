import { FrameworkContractError } from './contracts.ts';
import { parseAttemptArgs } from './family-runtime-command-parts/attempt.ts';
import {
  parseLifecycleApplyArgs,
  parseLifecycleReconcileArgs,
} from './family-runtime-command-parts/lifecycle.ts';
import {
  parseProviderOnlyArgs,
  parseProviderSloTickArgs,
  parseResidencyProofArgs,
} from './family-runtime-command-parts/provider.ts';
import {
  parseApproveArgs,
  parseEnqueueArgs,
  parseIntakeArgs,
  parseQueueArgs,
  parseTickArgs,
} from './family-runtime-command-parts/queue.ts';
import {
  parseSchedulerLifecycleArgs,
  parseSchedulerTickArgs,
} from './family-runtime-command-parts/scheduler.ts';
import { parseRuntimeProcessArgs } from './family-runtime-command-parts/service-worker.ts';
import {
  FAMILY_RUNTIME_DOMAIN_IDS,
  type FamilyRuntimeDomainId,
  type FamilyRuntimeProviderKind,
  type TemporalStageAttemptSignalKind,
} from './family-runtime-types.ts';

export {
  FAMILY_RUNTIME_DOMAIN_IDS,
  type FamilyRuntimeDomainId,
} from './family-runtime-types.ts';

export type EnqueueInput = {
  domainId: FamilyRuntimeDomainId;
  taskKind: string;
  payload: Record<string, unknown>;
  dedupeKey?: string;
  priority?: number;
  source?: string;
  requiresApproval?: boolean;
  requireStageAdmission?: boolean;
};

export type FamilyRuntimeCommandInput =
  | {
    mode: 'status' | 'doctor' | 'install' | 'repair';
    providerKind?: FamilyRuntimeProviderKind;
  }
  | {
    mode: 'worker_start' | 'worker_status' | 'worker_stop';
    providerKind?: FamilyRuntimeProviderKind;
    detach?: boolean;
  }
  | {
    mode: 'service_start' | 'service_status' | 'service_stop';
    providerKind?: FamilyRuntimeProviderKind;
    detach?: boolean;
  }
  | { mode: 'residency_proof'; providerKind?: FamilyRuntimeProviderKind; live?: boolean; production?: boolean }
  | { mode: 'provider_slo_tick'; providerKind?: FamilyRuntimeProviderKind; force?: boolean }
  | { mode: 'scheduler_tick'; providerKind?: FamilyRuntimeProviderKind; force?: boolean; limit?: number; hydrate?: boolean }
  | { mode: 'scheduler_status' | 'scheduler_install' | 'scheduler_remove' | 'scheduler_trigger'; providerKind?: FamilyRuntimeProviderKind }
  | {
    mode: 'lifecycle_apply';
    input: {
      mode: 'dry-run' | 'apply' | 'verify';
      target_domain_id: string;
      source_ref?: string;
      manifest_ref?: string;
      receipt_ref?: string;
      actions?: Record<string, unknown>[];
    };
  }
  | {
    mode: 'lifecycle_reconcile';
    input: {
      target_domain_id?: string;
      expected_source_refs?: string[];
      expected_receipt_refs?: string[];
      expected_restore_proof_refs?: string[];
      expected_domain_artifact_mutation_receipt_refs?: string[];
      max_age_ms?: number | null;
    };
  }
  | { mode: 'notify_list' | 'events_export' | 'queue_list' | 'attempt_list' }
  | { mode: 'tick'; source?: string; limit?: number; hydrate?: boolean }
  | { mode: 'intake'; domainId?: FamilyRuntimeDomainId; source?: string }
  | { mode: 'enqueue'; input: EnqueueInput }
  | { mode: 'queue_inspect'; taskId: string }
  | { mode: 'attempt_inspect'; stageAttemptId: string }
  | { mode: 'attempt_start'; stageAttemptId: string }
  | { mode: 'attempt_query'; stageAttemptId: string }
  | {
    mode: 'attempt_signal';
    stageAttemptId: string;
    signalKind: TemporalStageAttemptSignalKind;
    payload: Record<string, unknown>;
    source?: string;
  }
  | {
    mode: 'attempt_fixture_run';
    stageAttemptId: string;
    stagePacketRef?: string;
    checkpointRefs?: string[];
    closeoutPacket?: Record<string, unknown>;
  }
  | {
    mode: 'attempt_create';
    input: {
      domainId: FamilyRuntimeDomainId;
      stageId: string;
      providerKind?: FamilyRuntimeProviderKind;
      workspaceLocator: Record<string, unknown>;
      sourceFingerprint?: string;
      executorKind?: string;
      taskId?: string;
      retryBudget?: Record<string, unknown>;
      checkpointRefs?: string[];
      closeoutRefs?: string[];
      humanGateRefs?: string[];
      blockedReason?: string;
      requireStageAdmission?: boolean;
      newAttempt?: boolean;
      start?: boolean;
    };
  }
  | { mode: 'approve'; taskId: string; decision: 'approve' | 'deny'; reason?: string };

export const DOMAIN_ADAPTERS: Record<FamilyRuntimeDomainId, {
  repo_id: string;
  truth_owner: string;
  dispatch_command: string[];
}> = {
  medautoscience: {
    repo_id: 'med-autoscience',
    truth_owner: 'med-autoscience',
    dispatch_command: ['medautosci', 'sidecar', 'dispatch'],
  },
  medautogrant: {
    repo_id: 'med-autogrant',
    truth_owner: 'med-autogrant',
    dispatch_command: ['medautogrant', 'product', 'sidecar', 'dispatch'],
  },
  redcube: {
    repo_id: 'redcube-ai',
    truth_owner: 'redcube-ai',
    dispatch_command: ['redcube', 'product', 'sidecar', 'dispatch'],
  },
};

export function parseFamilyRuntimeCommand(args: string[]): FamilyRuntimeCommandInput {
  const [mode, ...rest] = args;
  if (!mode || mode === 'status') {
    return parseProviderOnlyArgs('status', rest);
  }
  if (mode === 'doctor' || mode === 'install' || mode === 'repair') {
    return parseProviderOnlyArgs(mode, rest);
  }
  if (mode === 'worker' || mode === 'service') {
    return parseRuntimeProcessArgs(mode, rest);
  }
  if (mode === 'residency' && rest[0] === 'proof') {
    return parseResidencyProofArgs(rest);
  }
  if (mode === 'provider-slo' && rest[0] === 'tick') {
    return parseProviderSloTickArgs(rest);
  }
  if (mode === 'scheduler' && rest[0] === 'tick') {
    return parseSchedulerTickArgs(rest);
  }
  if (
    mode === 'scheduler'
    && (rest[0] === 'status' || rest[0] === 'install' || rest[0] === 'remove' || rest[0] === 'trigger')
  ) {
    return parseSchedulerLifecycleArgs(rest);
  }
  if (mode === 'lifecycle' && rest[0] === 'apply') {
    return parseLifecycleApplyArgs(rest);
  }
  if (mode === 'lifecycle' && rest[0] === 'reconcile') {
    return parseLifecycleReconcileArgs(rest);
  }
  if (mode === 'notify' && rest[0] === 'list') {
    return { mode: 'notify_list' };
  }
  if (mode === 'events' && rest[0] === 'export') {
    return { mode: 'events_export' };
  }
  if (mode === 'queue') {
    const parsed = parseQueueArgs(rest);
    if (parsed) {
      return parsed;
    }
  }
  if (mode === 'attempt') {
    const parsed = parseAttemptArgs(rest);
    if (parsed) {
      return parsed;
    }
  }
  if (mode === 'tick') {
    return parseTickArgs(rest);
  }
  if (mode === 'intake') {
    return parseIntakeArgs(rest);
  }
  if (mode === 'approve') {
    return parseApproveArgs(rest);
  }
  if (mode === 'enqueue') {
    return parseEnqueueArgs(rest);
  }
  throw new FrameworkContractError('unknown_command', `Unknown family-runtime subcommand: ${mode}.`, {
    usage: 'opl family-runtime status|doctor|install|repair|service start|service status|service stop|worker start|worker status|worker stop|scheduler status|scheduler install|scheduler remove|scheduler trigger|scheduler tick|intake|tick|enqueue|lifecycle apply|attempt create|attempt start|attempt list|attempt inspect|attempt query|attempt signal|attempt fixture-run|queue list|queue inspect|approve|notify list|events export',
  });
}

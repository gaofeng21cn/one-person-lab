import {
  parseRegisteredFamilyRuntimeCommand,
} from './family-runtime-command-parts/registry.ts';
import type { PaperAutonomyStageRunIdentity } from './family-runtime-paper-autonomy.ts';
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

export type FamilyRuntimeTaskScope = {
  domainId?: FamilyRuntimeDomainId;
  taskKind?: string;
  payloadMatches?: Array<{ path: string; value: string }>;
};

export type FamilyRuntimeDomainProfiles = Partial<Record<FamilyRuntimeDomainId, string>>;

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
  | { mode: 'control_loop_status'; providerKind?: FamilyRuntimeProviderKind }
  | {
    mode: 'provider_worker_supervisor';
    action: 'status' | 'install' | 'remove' | 'trigger';
    providerKind?: FamilyRuntimeProviderKind;
  }
  | {
    mode: 'scheduler_tick';
    providerKind?: FamilyRuntimeProviderKind;
    force?: boolean;
    limit?: number;
    hydrate?: boolean;
    taskScope?: FamilyRuntimeTaskScope;
    domainProfiles?: FamilyRuntimeDomainProfiles;
  }
  | {
    mode: 'scheduler_status' | 'scheduler_install' | 'scheduler_remove' | 'scheduler_trigger';
    providerKind?: FamilyRuntimeProviderKind;
    domainProfiles?: FamilyRuntimeDomainProfiles;
  }
  | {
    mode: 'evidence_worklist';
    input: {
      familyDefaults: boolean;
      providerKind: FamilyRuntimeProviderKind;
      executorKind: 'codex_cli';
      detailLevel?: 'summary' | 'full';
    };
  }
  | {
    mode: 'lifecycle_apply';
    input: {
      mode: 'dry-run' | 'apply' | 'verify';
      target_domain_id: string;
      source_ref?: string;
      manifest_ref?: string;
      receipt_ref?: string;
      actions?: Record<string, unknown>[];
      handoffs?: Record<string, unknown>[];
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
  | {
    mode: 'paper_autonomy_supervisor_readback';
    input: {
      obligation_ledger_path: string;
      decision_ledger_path: string;
      obligation_id: string;
      current_identity: PaperAutonomyStageRunIdentity;
    };
  }
  | {
    mode: 'paper_autonomy_supervisor_decide';
    input: {
      obligation_ledger_path: string;
      decision_ledger_path: string;
      obligation_id: string;
      current_identity: PaperAutonomyStageRunIdentity;
      current_owner_delta_ref?: string;
      provider_admission_identity_ref?: string;
      terminal_closeout_ref?: string;
      recovery_action_ref?: string;
      no_progress_or_inconsistency_ref?: string;
      human_gate_ref?: string;
      resume_token?: string;
      typed_blocker_ref?: string;
      owner_receipt_ref?: string;
      budget_or_missing_evidence_ref?: string;
      evidence_refs: string[];
      observability_refs: string[];
    };
  }
  | {
    mode: 'stage_artifact';
    input: {
      action: 'open' | 'commit' | 'status' | 'explain' | 'rebuild' | 'promote' | 'gc' | 'restore' | 'validate' | 'conformance' | 'workbench';
      domain_id: string;
      program_id: string;
      topic_id: string;
      deliverable_id: string;
      stage_id?: string;
      stage_order?: number;
      attempt_id?: string;
      terminal_status?: 'success' | 'blocked' | 'skipped' | 'deferred';
      required_outputs?: string[];
      owner_receipt_refs?: string[];
      typed_blocker_refs?: string[];
      decision_receipt_refs?: string[];
      artifact_ref?: string;
      restore_ref?: string;
      dry_run?: boolean;
    };
  }
  | { mode: 'notify_list' | 'events_export' }
  | {
    mode: 'queue_list';
    status?: string;
    taskScope?: FamilyRuntimeTaskScope;
  }
  | {
    mode: 'attempt_list';
    filters?: {
      domainId?: FamilyRuntimeDomainId;
      status?: string;
      studyId?: string;
      sinceHours?: number;
      compactTimeline?: boolean;
    };
  }
  | {
    mode: 'tick';
    source?: string;
    limit?: number;
    hydrate?: boolean;
    taskScope?: FamilyRuntimeTaskScope;
    domainProfiles?: FamilyRuntimeDomainProfiles;
  }
  | {
    mode: 'intake';
    domainId?: FamilyRuntimeDomainId;
    source?: string;
    taskScope?: FamilyRuntimeTaskScope;
    domainProfiles?: FamilyRuntimeDomainProfiles;
  }
  | { mode: 'enqueue'; input: EnqueueInput }
  | { mode: 'queue_inspect'; taskId: string }
  | { mode: 'queue_redrive'; taskId: string; reason: string; source?: string }
  | { mode: 'queue_hold'; taskScope: FamilyRuntimeTaskScope; reason: string; source?: string }
  | { mode: 'queue_release'; taskScope: FamilyRuntimeTaskScope; reason: string; source?: string; repairStrandedHold?: boolean }
  | { mode: 'queue_retire'; taskScope: FamilyRuntimeTaskScope; reason: string; source?: string }
  | { mode: 'attempt_inspect'; stageAttemptId: string }
  | { mode: 'attempt_start'; stageAttemptId: string }
  | { mode: 'attempt_query'; stageAttemptId: string }
  | { mode: 'attempt_cancel'; stageAttemptId: string; reason: string; source?: string }
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
      executorBindingRef?: string;
      invocationMode?: 'invocation' | 'authoring';
      boundedEditRef?: string;
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

export type FamilyRuntimeDomainAdapter = {
  repo_id: string;
  truth_owner: string;
  dispatch_command: string[];
};

export const DOMAIN_ADAPTERS: Partial<Record<FamilyRuntimeDomainId, FamilyRuntimeDomainAdapter>> = {
  medautoscience: {
    repo_id: 'med-autoscience',
    truth_owner: 'med-autoscience',
    dispatch_command: ['medautosci', 'domain-handler', 'dispatch'],
  },
  medautogrant: {
    repo_id: 'med-autogrant',
    truth_owner: 'med-autogrant',
    dispatch_command: ['medautogrant', 'domain-handler', 'dispatch'],
  },
  redcube: {
    repo_id: 'redcube-ai',
    truth_owner: 'redcube-ai',
    dispatch_command: ['redcube', 'domain-handler', 'dispatch'],
  },
};

export function parseFamilyRuntimeCommand(args: string[]): FamilyRuntimeCommandInput {
  return parseRegisteredFamilyRuntimeCommand(args);
}

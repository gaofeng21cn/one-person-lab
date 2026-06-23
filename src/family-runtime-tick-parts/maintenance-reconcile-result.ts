export type MaintenanceReconcileResult = {
  defaultExecutorTerminalSyncedCount: number;
  defaultExecutorTemporalQueryHandlerMissingCount: number;
  repairedMissingIdentityRunningCount: number;
  repairedMissingIdentityDeadLetteredCount: number;
  repairedMissingIdentityTaskIds: Set<string>;
  repairedPaperAutonomyMissingCloseoutCount: number;
  repairedPaperAutonomyMissingCloseoutTaskIds: Set<string>;
  reconciledPaperMissionStageRouteTerminalCount: number;
  reconciledPaperMissionStageRouteTerminalTaskIds: Set<string>;
  repairedMasDomainRouteAdmissionRequestedCount: number;
  repairedMasDomainRouteAdmissionRequestedTaskIds: Set<string>;
  blockedMasDomainRouteOwnerAnswerObservedCount: number;
  blockedMasDomainRouteOwnerAnswerObservedTaskIds: Set<string>;
  defaultExecutorSupersededAttemptReconciledCount: number;
  waitingApprovalAttemptReconciledCount: number;
  defaultExecutorAutoRedrivenCount: number;
  defaultExecutorAutoDeadLetteredCount: number;
  defaultExecutorAutoRedriveStaleSkippedCount: number;
};

export function zeroMaintenanceReconcileResult(): MaintenanceReconcileResult {
  return {
    defaultExecutorTerminalSyncedCount: 0,
    defaultExecutorTemporalQueryHandlerMissingCount: 0,
    repairedMissingIdentityRunningCount: 0,
    repairedMissingIdentityDeadLetteredCount: 0,
    repairedMissingIdentityTaskIds: new Set<string>(),
    repairedPaperAutonomyMissingCloseoutCount: 0,
    repairedPaperAutonomyMissingCloseoutTaskIds: new Set<string>(),
    reconciledPaperMissionStageRouteTerminalCount: 0,
    reconciledPaperMissionStageRouteTerminalTaskIds: new Set<string>(),
    repairedMasDomainRouteAdmissionRequestedCount: 0,
    repairedMasDomainRouteAdmissionRequestedTaskIds: new Set<string>(),
    blockedMasDomainRouteOwnerAnswerObservedCount: 0,
    blockedMasDomainRouteOwnerAnswerObservedTaskIds: new Set<string>(),
    defaultExecutorSupersededAttemptReconciledCount: 0,
    waitingApprovalAttemptReconciledCount: 0,
    defaultExecutorAutoRedrivenCount: 0,
    defaultExecutorAutoDeadLetteredCount: 0,
    defaultExecutorAutoRedriveStaleSkippedCount: 0,
  };
}

export function mergeTaskIdSets(...sets: Set<string>[]) {
  return new Set(sets.flatMap((set) => [...set]));
}

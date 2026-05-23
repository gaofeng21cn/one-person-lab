type JsonRecord = Record<string, unknown>;

export function frameworkReadinessBlockers(input: {
  agentHardBlockerCount: number;
  stageHardBlockerCount: number;
  packCompilerBlockerCount: number;
  diagnosticFailureCount: number;
}): JsonRecord[] {
  const blockers: JsonRecord[] = [];
  if (input.packCompilerBlockerCount > 0) {
    blockers.push({
      blocker_id: 'pack_compiler_framework_kernel_blocker_present',
      count: input.packCompilerBlockerCount,
      route_ref: '/framework_readiness/pack_compiler',
      source_command: 'opl agents pack-compiler --json',
    });
  }
  if (input.diagnosticFailureCount > 0) {
    blockers.push({
      blocker_id: 'framework_diagnostic_unavailable',
      count: input.diagnosticFailureCount,
      route_ref: '/framework_readiness/diagnostic_failures',
      source_command: 'see_diagnostic_failure_items',
    });
  }
  if (input.stageHardBlockerCount > 0) {
    blockers.push({
      blocker_id: 'stage_readiness_hard_blocker_present',
      count: input.stageHardBlockerCount,
      route_ref: '/framework_readiness/stages',
      source_command: 'opl stages readiness --domain mas --json',
    });
  }
  if (input.agentHardBlockerCount > 0) {
    blockers.push({
      blocker_id: 'agent_structural_conformance_blocker_present',
      count: input.agentHardBlockerCount,
      route_ref: '/framework_readiness/agent_conformance_tail',
      source_command: 'opl agents readiness --family-defaults --json',
    });
  }
  return blockers;
}

export const AGENT_PACKAGE_LAUNCH_STATE_SCHEMA_VERSION =
  'opl-agent-package-launch-state.v1' as const;

export type AgentPackageLaunchState = 'ready' | 'degraded' | 'package_unavailable';

export type AgentPackageLaunchStateProjection = {
  launch_state_schema_version: typeof AGENT_PACKAGE_LAUNCH_STATE_SCHEMA_VERSION;
  launch_state: AgentPackageLaunchState;
  launch_state_reason: string | null;
};

export type AgentPackageLaunchStateInput = {
  installed: boolean;
  exposure_state: string | null;
  operational_ready: boolean;
  launch_blocked_reason?: string | null;
  degraded_reason?: string | null;
  unavailable_reason?: string | null;
};

function reason(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function projection(
  launchState: AgentPackageLaunchState,
  launchStateReason: string | null,
): AgentPackageLaunchStateProjection {
  return {
    launch_state_schema_version: AGENT_PACKAGE_LAUNCH_STATE_SCHEMA_VERSION,
    launch_state: launchState,
    launch_state_reason: launchStateReason,
  };
}

export function deriveAgentPackageLaunchState(
  input: AgentPackageLaunchStateInput,
): AgentPackageLaunchStateProjection {
  const blockedReason = reason(input.launch_blocked_reason);
  const degradedReason = reason(input.degraded_reason);
  const unavailableReason = reason(input.unavailable_reason);

  if (!input.installed) {
    return projection('package_unavailable', unavailableReason ?? blockedReason ?? 'package_not_installed');
  }
  if (input.exposure_state === 'disabled') {
    return projection('package_unavailable', 'package_disabled');
  }
  if (unavailableReason) {
    return projection('package_unavailable', unavailableReason);
  }
  if (degradedReason) {
    return projection('degraded', degradedReason);
  }
  if (input.operational_ready) {
    return projection('ready', null);
  }
  return projection('package_unavailable', blockedReason ?? 'package_readiness_unavailable');
}

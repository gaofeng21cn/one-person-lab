import {
  resolveStandardAgent,
  STANDARD_AGENT_REGISTRY,
  type StandardAgentFamilyRuntimeProfile,
} from '../../kernel/standard-agent-registry.ts';

type RuntimeEnabledStandardAgent = Extract<
  typeof STANDARD_AGENT_REGISTRY[number],
  { readonly family_runtime_profile: { readonly supported: true } }
>;

export type FamilyRuntimeDomainId =
  RuntimeEnabledStandardAgent['family_runtime_profile']['runtime_domain_id'];

function runtimeEnabledStandardAgents(): RuntimeEnabledStandardAgent[] {
  return STANDARD_AGENT_REGISTRY.filter((entry): entry is RuntimeEnabledStandardAgent => (
    'family_runtime_profile' in entry && entry.family_runtime_profile?.supported === true
  ));
}

export const FAMILY_RUNTIME_DOMAIN_IDS = runtimeEnabledStandardAgents().map((entry) => (
  entry.family_runtime_profile.runtime_domain_id
));

export function runtimeDomainProfileFor(domainId: string): StandardAgentFamilyRuntimeProfile | null {
  const entry = runtimeEnabledStandardAgents().find((candidate) => (
    candidate.family_runtime_profile.runtime_domain_id === domainId
  ));
  return entry?.family_runtime_profile ?? null;
}

export function resolveFamilyRuntimeDomainId(value: string) {
  const agent = resolveStandardAgent(value);
  if (!agent || !('family_runtime_profile' in agent) || !agent.family_runtime_profile?.supported) {
    return null;
  }
  return agent.family_runtime_profile.runtime_domain_id as FamilyRuntimeDomainId;
}

export function runtimeDomainAliases(domainId: string) {
  const entry = runtimeEnabledStandardAgents().find((candidate) => (
    candidate.family_runtime_profile.runtime_domain_id === domainId
  ));
  if (!entry) {
    return [];
  }
  return [
    entry.agent_id,
    entry.domain_id,
    entry.domain_alias,
    entry.work_alias,
    ...entry.aliases,
    entry.family_runtime_profile.runtime_domain_id,
  ];
}

export function runtimeDomainOwnerProfiles() {
  return runtimeEnabledStandardAgents().map((entry) => ({
    domain_id: entry.family_runtime_profile.runtime_domain_id,
    domain_owner:
      ('runtime_manager_registration' in entry.family_runtime_profile
        ? entry.family_runtime_profile.runtime_manager_registration?.domain_owner
        : undefined) ?? entry.plugin_name,
    executor_owner: 'codex_cli_or_stage_selected_executor',
  }));
}

export function runtimeManagerDomainProfiles() {
  return runtimeEnabledStandardAgents().flatMap((entry) => {
    const profile = entry.family_runtime_profile;
    const registration = 'runtime_manager_registration' in profile
      ? profile.runtime_manager_registration
      : undefined;
    if (!registration) {
      return [];
    }
    return [{
      domain_id: profile.runtime_domain_id,
      project: entry.project,
      ...registration,
    }];
  });
}

export const FAMILY_RUNTIME_SCHEDULER_DOMAIN_IDS = runtimeManagerDomainProfiles().map((profile) => (
  profile.domain_id
));

export function resolveFamilyRuntimeSchedulerDomainId(value: string) {
  const domainId = resolveFamilyRuntimeDomainId(value);
  return domainId && FAMILY_RUNTIME_SCHEDULER_DOMAIN_IDS.includes(domainId)
    ? domainId
    : null;
}

export function runtimeDomainDaemonReplacementSurfaces() {
  return Object.fromEntries(runtimeManagerDomainProfiles().map((profile) => [
    profile.domain_id,
    profile.scheduler.daemon_replacement_surface,
  ])) as Partial<Record<FamilyRuntimeDomainId, string>>;
}

export function runtimeDomainAdapterProfiles() {
  return runtimeEnabledStandardAgents().flatMap((entry) => {
    const profile = entry.family_runtime_profile;
    const dispatchCommand = 'dispatch_command' in profile ? profile.dispatch_command : undefined;
    const registration = 'runtime_manager_registration' in profile
      ? profile.runtime_manager_registration
      : undefined;
    if (!dispatchCommand) {
      return [];
    }
    return [{
      domain_id: profile.runtime_domain_id,
      repo_id: entry.project,
      truth_owner: registration?.domain_owner ?? entry.plugin_name,
      dispatch_command: [...dispatchCommand],
    }];
  });
}

export const FAMILY_RUNTIME_PROVIDER_KINDS = ['temporal', 'external_sandbox'] as const;

export type FamilyRuntimeProviderKind = typeof FAMILY_RUNTIME_PROVIDER_KINDS[number];

export const TEMPORAL_STAGE_ATTEMPT_SIGNAL_KINDS = ['human_gate', 'owner_receipt', 'user_instruction', 'resume'] as const;

export type TemporalStageAttemptSignalKind = typeof TEMPORAL_STAGE_ATTEMPT_SIGNAL_KINDS[number];

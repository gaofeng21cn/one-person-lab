import {
  resolveStandardAgent,
  STANDARD_AGENT_REGISTRY,
  STANDARD_AGENT_SERIES_MEMBERSHIP,
  type StandardAgentRegistryEntry,
} from '../../kernel/standard-agent-registry.ts';
import { readStandardAgentDescriptorForDomain } from '../connect/index.ts';

type RuntimeAgent = StandardAgentRegistryEntry & {
  series_membership: typeof STANDARD_AGENT_SERIES_MEMBERSHIP;
};

export type FamilyRuntimeDomainId = string;

export type StandardAgentFamilyRuntimeProfile = {
  supported: true;
  runtime_domain_id: string;
  dispatch_command?: readonly string[];
  registration_ref: string | null;
};

function runtimeEnabledStandardAgents() {
  return STANDARD_AGENT_REGISTRY.filter((entry): entry is typeof entry & RuntimeAgent =>
    entry.series_membership === STANDARD_AGENT_SERIES_MEMBERSHIP
  );
}

function descriptorFor(entry: RuntimeAgent) {
  return readStandardAgentDescriptorForDomain(entry.target_domain_id);
}

function runtimeProfile(entry: RuntimeAgent): StandardAgentFamilyRuntimeProfile {
  const runtime = descriptorFor(entry)?.interface.runtime;
  return {
    supported: true,
    runtime_domain_id: runtime?.runtime_domain_id ?? entry.target_domain_id,
    ...(runtime?.dispatch_command ? { dispatch_command: runtime.dispatch_command } : {}),
    registration_ref: runtime?.registration_ref ?? null,
  };
}

export const FAMILY_RUNTIME_DOMAIN_IDS = runtimeEnabledStandardAgents().map((entry) =>
  runtimeProfile(entry).runtime_domain_id
);

export function runtimeDomainProfileFor(domainId: string): StandardAgentFamilyRuntimeProfile | null {
  const entry = resolveStandardAgent(domainId);
  return entry?.series_membership === STANDARD_AGENT_SERIES_MEMBERSHIP
    ? runtimeProfile(entry)
    : null;
}

export function resolveFamilyRuntimeDomainId(value: string) {
  return runtimeDomainProfileFor(value)?.runtime_domain_id ?? null;
}

export function runtimeDomainAliases(domainId: string) {
  const entry = resolveStandardAgent(domainId);
  if (!entry || entry.series_membership !== STANDARD_AGENT_SERIES_MEMBERSHIP) return [];
  const profile = runtimeProfile(entry);
  return [
    entry.agent_id,
    entry.domain_id,
    entry.target_domain_id,
    entry.project,
    entry.plugin_name,
    ...entry.aliases,
    profile.runtime_domain_id,
  ];
}

export function runtimeDomainOwnerProfiles() {
  return runtimeEnabledStandardAgents().map((entry) => ({
    domain_id: runtimeProfile(entry).runtime_domain_id,
    domain_owner: entry.plugin_name,
    executor_owner: 'codex_cli_or_stage_selected_executor',
  }));
}

export function runtimeManagerDomainProfiles() {
  return runtimeEnabledStandardAgents().map((entry) => {
    const profile = runtimeProfile(entry);
    const packageStatusCommand = `opl packages status --package-id ${entry.agent_id}`;
    return {
      domain_id: profile.runtime_domain_id,
      project: entry.project,
      domain_owner: entry.plugin_name,
      runtime_owner: 'one-person-lab',
      registration_id: `${entry.agent_id}.standard_agent_interface.v1`,
      expected_registration_surface: {
        surface_kind: 'opl_standard_agent_runtime_registration_ref',
        ref: profile.registration_ref
          ?? `package:${entry.agent_id}#/standard_agent_interface/runtime/registration_ref`,
        command: packageStatusCommand,
      },
      domain_entry_surface: 'package_managed_standard_agent_interface',
      consumable_projection_refs: profile.registration_ref ? [profile.registration_ref] : [],
      state_index_inputs: {
        workspace_registry_index: '/workspace_locator',
        managed_session_ledger_index: '/stage_attempt_ledger',
        artifact_projection_index: '/current_owner_delta/artifact_refs',
        attention_queue_index: '/current_owner_delta/next_action',
        runtime_health_snapshot_index: '/package_status/runtime_source_readiness',
      },
      non_goals: [
        'not_a_domain_truth_owner',
        'not_a_domain_quality_or_export_owner',
        'not_a_repo_local_scheduler',
      ],
      scheduler: {
        migration_priority: 'package_managed',
        legacy_scheduler_owner: null,
        legacy_scheduler_residue_policy: 'history_tombstone_or_negative_guard_only',
        replacement_role: 'OPL Runway owns provider cadence and StageRun transport for package-managed standard agents.',
        required_domain_refs: profile.registration_ref ? [profile.registration_ref] : [],
        daemon_policy: 'not_installed_or_maintained_by_opl',
        daemon_replacement_surface: 'opl_runway_provider_cadence_and_stage_attempt_runtime',
      },
    };
  });
}

export const FAMILY_RUNTIME_SCHEDULER_DOMAIN_IDS = runtimeManagerDomainProfiles().map((profile) =>
  profile.domain_id
);

export function resolveFamilyRuntimeSchedulerDomainId(value: string) {
  const domainId = resolveFamilyRuntimeDomainId(value);
  return domainId && FAMILY_RUNTIME_SCHEDULER_DOMAIN_IDS.includes(domainId) ? domainId : null;
}

export function runtimeDomainDaemonReplacementSurfaces() {
  return Object.fromEntries(runtimeManagerDomainProfiles().map((profile) => [
    profile.domain_id,
    profile.scheduler.daemon_replacement_surface,
  ])) as Partial<Record<FamilyRuntimeDomainId, string>>;
}

export function runtimeDomainAdapterProfiles() {
  return runtimeEnabledStandardAgents().flatMap((entry) => {
    const profile = runtimeProfile(entry);
    if (!profile.dispatch_command) return [];
    return [{
      domain_id: profile.runtime_domain_id,
      repo_id: entry.project,
      truth_owner: entry.plugin_name,
      dispatch_command: [...profile.dispatch_command],
    }];
  });
}

export const FAMILY_RUNTIME_PROVIDER_KINDS = ['temporal', 'external_sandbox'] as const;

export type FamilyRuntimeProviderKind = typeof FAMILY_RUNTIME_PROVIDER_KINDS[number];

export const TEMPORAL_STAGE_ATTEMPT_SIGNAL_KINDS = ['human_gate', 'owner_receipt', 'user_instruction', 'resume'] as const;

export type TemporalStageAttemptSignalKind = typeof TEMPORAL_STAGE_ATTEMPT_SIGNAL_KINDS[number];

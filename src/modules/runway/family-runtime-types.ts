export const FAMILY_RUNTIME_DOMAIN_IDS = ['medautoscience', 'medautogrant', 'redcube', 'opl-meta-agent'] as const;

export type FamilyRuntimeDomainId = typeof FAMILY_RUNTIME_DOMAIN_IDS[number];

export const FAMILY_RUNTIME_PROVIDER_KINDS = ['local_sqlite', 'temporal', 'external_sandbox'] as const;

export type FamilyRuntimeProviderKind = typeof FAMILY_RUNTIME_PROVIDER_KINDS[number];

export const TEMPORAL_STAGE_ATTEMPT_SIGNAL_KINDS = ['human_gate', 'owner_receipt', 'user_instruction', 'resume'] as const;

export type TemporalStageAttemptSignalKind = typeof TEMPORAL_STAGE_ATTEMPT_SIGNAL_KINDS[number];

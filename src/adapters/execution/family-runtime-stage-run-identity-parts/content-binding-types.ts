import type {
  FamilyRuntimeExecutionScopeKind,
} from '../family-runtime-execution-scope.ts';

export const STAGE_RUN_CONTENT_PURPOSES = [
  'stage_manifest',
  'quality_policy',
  'stage_prompt',
  'role_prompt',
  'quality_rubric',
  'knowledge',
  'skill',
  'policy',
  'stage_goal',
  'source',
  'lineage',
  'stage_packet',
  'checkpoint',
  'input_artifact',
] as const;

export const STAGE_RUN_CONTENT_VERIFICATION_KINDS = [
  'managed_pack_file_bytes',
  'workspace_file_bytes',
  'trusted_artifact_identity_receipt',
] as const;

export type StageRunContentPurpose = typeof STAGE_RUN_CONTENT_PURPOSES[number];
export type StageRunContentVerificationKind = typeof STAGE_RUN_CONTENT_VERIFICATION_KINDS[number];

export const PACK_ONLY_CONTENT_PURPOSES: ReadonlySet<StageRunContentPurpose> = new Set([
  'stage_manifest',
  'quality_policy',
  'stage_prompt',
  'role_prompt',
  'quality_rubric',
  'knowledge',
  'skill',
  'policy',
  'stage_goal',
  'lineage',
]);

export type StageRunImmutableContentBinding = {
  purpose: StageRunContentPurpose;
  ref: string;
  sha256: string;
  byte_size: number | null;
  effective_content_sha256: string | null;
  effective_content_byte_size: number | null;
  verification_kind: StageRunContentVerificationKind;
  identity_receipt_ref: string | null;
  producing_stage_run_ref: string | null;
  producing_attempt_ref: string | null;
  scope_kind: FamilyRuntimeExecutionScopeKind | null;
  work_item_scope_id: string | null;
  scope_digest: string | null;
};

export type ArtifactIdentity = {
  ref: string;
  sha256: string;
  identity_receipt_ref: string | null;
};

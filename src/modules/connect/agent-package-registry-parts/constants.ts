export const REGISTRY_REQUIRED_FIELDS = [
  'package_id',
  'display_name',
  'publisher',
  'source',
  'manifest_url',
  'latest_version',
  'trust_tier',
] as const;

export const MANIFEST_REQUIRED_FIELDS = [
  'package_id',
  'agent_id',
  'display_name',
  'publisher',
  'version',
  'source',
  'codex_surface',
  'skill_packs',
  'entrypoints',
  'health_check',
  'permissions',
  'update_channel',
  'rollback_ref',
] as const;

export const FORBIDDEN_AGENT_PACKAGE_FIELDS = [
  'session_contract_ref',
  'domain_workflow_schema',
  'prompt_body',
  'artifact_schema',
  'readiness_verdict_rule',
  'quality_verdict_rule',
  'owner_receipt_authority',
] as const;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => optionalString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

export type FamilyRuntimeLifecyclePrimitives = {
  surface_kind: 'family_runtime_lifecycle_primitives';
  artifact_locator_index: {
    locator_kind: string;
    workspace_root: string | null;
    runtime_root: string | null;
    artifact_root: string | null;
    content_policy: 'locator_only_no_artifact_content';
  };
  retention_policy: {
    policy_kind: 'domain_workspace_retention_ref';
    owner: 'domain_agent';
    opl_role: 'index_policy_and_restore_refs_only';
  };
  restore_proof: {
    proof_kind: 'restore_ref_required_before_cleanup';
    required_refs: string[];
  };
  migration_ledger: {
    ledger_kind: 'framework_migration_ledger';
    owner: 'opl_framework';
    writes_domain_truth: false;
  };
  workspace_lifecycle_metadata: {
    workspace_locator: JsonRecord;
    lifecycle_owner: 'domain_agent';
    provider_attempt_owner: 'opl_framework';
  };
};

export function buildFamilyRuntimeLifecyclePrimitives(input: {
  workspaceLocator: JsonRecord;
  artifactRefs?: string[];
}): FamilyRuntimeLifecyclePrimitives {
  const locator = input.workspaceLocator;
  const runtimeRoot =
    optionalString(locator.runtime_root)
    ?? optionalString(locator.runtimeRoot)
    ?? null;
  const artifactRoot =
    optionalString(locator.artifact_root)
    ?? optionalString(locator.artifactRoot)
    ?? optionalString(locator.workspace_artifact_root)
    ?? null;
  return {
    surface_kind: 'family_runtime_lifecycle_primitives',
    artifact_locator_index: {
      locator_kind: 'workspace_runtime_artifact_locator',
      workspace_root:
        optionalString(locator.workspace_root)
        ?? optionalString(locator.workspaceRoot)
        ?? optionalString(locator.workspace)
        ?? null,
      runtime_root: runtimeRoot,
      artifact_root: artifactRoot,
      content_policy: 'locator_only_no_artifact_content',
    },
    retention_policy: {
      policy_kind: 'domain_workspace_retention_ref',
      owner: 'domain_agent',
      opl_role: 'index_policy_and_restore_refs_only',
    },
    restore_proof: {
      proof_kind: 'restore_ref_required_before_cleanup',
      required_refs: [
        ...readStringList(locator.restore_refs),
        ...(input.artifactRefs ?? []),
      ],
    },
    migration_ledger: {
      ledger_kind: 'framework_migration_ledger',
      owner: 'opl_framework',
      writes_domain_truth: false,
    },
    workspace_lifecycle_metadata: {
      workspace_locator: isRecord(locator) ? locator : {},
      lifecycle_owner: 'domain_agent',
      provider_attempt_owner: 'opl_framework',
    },
  };
}

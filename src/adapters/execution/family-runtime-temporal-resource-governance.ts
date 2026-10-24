import governance from '../../../contracts/opl-framework/temporal-resource-governance.json' with { type: 'json' };

export const TEMPORAL_RESOURCE_GOVERNANCE = governance;
export const TEMPORAL_RESOURCE_GOVERNANCE_REF = 'contracts/opl-framework/temporal-resource-governance.json' as const;
export const TEMPORAL_VISIBILITY_MODES = ['required', 'best_effort', 'disabled'] as const;
export type TemporalVisibilityMode = typeof TEMPORAL_VISIBILITY_MODES[number];

export function resolveTemporalVisibilityMode(value: unknown): TemporalVisibilityMode {
  return TEMPORAL_VISIBILITY_MODES.includes(value as TemporalVisibilityMode)
    ? value as TemporalVisibilityMode
    : governance.launch_policy.default_visibility_mode as TemporalVisibilityMode;
}
export function temporalVisibilityBudget() {
  return {
    keyword_limit: governance.budgets.keyword_attribute_limit,
    schema_version: governance.search_attribute_schema.schema_version,
    owner: governance.owner,
    runtime_owner: governance.runtime_owner,
    automatic_remove_allowed: governance.search_attribute_schema.automatic_remove_allowed,
  };
}

type TemporalResourcePool = (typeof governance.resource_pools)[number];

type TemporalEndpointBinding = {
  endpoint_id: string;
  cluster_identity: string;
  address_patterns: string[];
};

function normalizeAddress(address: unknown) {
  return typeof address === 'string' ? address.trim().toLowerCase() : '';
}

function addressPatternMatches(address: string, pattern: string) {
  const normalizedPattern = normalizeAddress(pattern);
  if (!normalizedPattern || !address) return false;
  if (!normalizedPattern.includes('*')) return address === normalizedPattern;
  const escaped = normalizedPattern
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${escaped}$`).test(address);
}

function endpointBindingForPool(
  pool: TemporalResourcePool,
  input: { address?: string | null; clusterIdentity?: string | null } = {},
) {
  const address = normalizeAddress(input.address);
  const clusterIdentity = input.clusterIdentity?.trim() || null;
  const bindings = (pool as TemporalResourcePool & { endpoint_bindings?: TemporalEndpointBinding[] }).endpoint_bindings ?? [];
  const matched = bindings.find((binding) =>
    clusterIdentity !== null
    && binding.cluster_identity === clusterIdentity
    && binding.address_patterns.some((pattern) => addressPatternMatches(address, pattern))
  ) ?? null;
  return {
    status: matched ? 'matched' : 'unmatched',
    endpoint_id: matched?.endpoint_id ?? null,
    cluster_identity: clusterIdentity,
    address: address || null,
    allowed_address_patterns: bindings.flatMap((binding) => binding.address_patterns),
  } as const;
}

export function resolveTemporalResourcePool(
  namespace: string,
  input: { address?: string | null; clusterIdentity?: string | null } = {},
) {
  const pool = governance.resource_pools.find((candidate) => candidate.namespace === namespace);
  if (!pool) {
    return {
      pool_id: 'unmanaged',
      namespace,
      allocation: 'unmanaged',
      schema_version: 'unmanaged',
      automatic_mutation: 'disabled',
      migration_policy: 'operator_review_required',
      endpoint_binding: {
        status: 'unmatched' as const,
        endpoint_id: null,
        cluster_identity: input.clusterIdentity?.trim() || null,
        address: normalizeAddress(input.address) || null,
        allowed_address_patterns: [],
      },
    };
  }
  return {
    ...pool,
    endpoint_binding: endpointBindingForPool(pool, input),
  };
}

export function temporalSearchAttributeMutationAllowed(
  namespace: string,
  address?: string | null,
  clusterIdentity?: string | null,
) {
  const effectiveClusterIdentity = clusterIdentity
    ?? process.env.OPL_TEMPORAL_CLUSTER_IDENTITY?.trim()
    ?? null;
  const pool = resolveTemporalResourcePool(namespace, { address, clusterIdentity: effectiveClusterIdentity });
  return pool.automatic_mutation === 'add_only_declared_schema'
    && pool.endpoint_binding.status === 'matched';
}

export function temporalSearchAttributeIndexingAllowed(namespace: string) {
  const pool = governance.resource_pools.find((candidate) => candidate.namespace === namespace) as
    | (TemporalResourcePool & { workflow_visibility_policy?: string })
    | undefined;
  return pool?.workflow_visibility_policy !== 'best_effort_refs_only';
}

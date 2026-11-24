import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import { assertJsonSchemaPayload } from '../../../kernel/schema-registry.ts';
import type {
  AgentPackageFlowCapabilityBuildLock,
  AgentPackageFlowCapabilityBuildResolution,
  AgentPackageFlowCapabilityBundle,
  AgentPackageFlowCapabilityPlanItem,
  AgentPackageFlowCapabilityStrategyProjection,
  AgentPackageManagedPolicyDependency,
} from './types.ts';

const CAPABILITY_KINDS = new Set<AgentPackageManagedPolicyDependency['kind']>([
  'base',
  'codex_skill',
  'codex_plugin',
  'mcp_server',
  'cli',
  'runtime_capability',
]);

const ACTIVATIONS = ['always', 'task_routed', 'explicit'] as const;
const OFFLINE_BUNDLES = ['none', 'full'] as const;
const CONFLICT_POLICIES = [
  'managed_reconcile',
  'preserve_user_surface',
  'fail_closed_on_collision',
] as const;
const CREDENTIAL_POLICIES = ['none', 'user_or_provider_owned_not_bundled'] as const;
const READINESS_ADAPTERS = [
  'codex_skill_payload',
  'binary_version',
  'agent_reach_doctor',
  'runtime_observation',
] as const;

function contractError(message: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, {
    failure_code: 'opl_flow_capability_strategy_invalid',
    ...details,
  });
}

function sha256(value: string | Buffer) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stableValue(entry)]),
  );
}

function stableJson(value: unknown) {
  return JSON.stringify(stableValue(value));
}

export function flowCapabilityRef(
  value: Pick<AgentPackageManagedPolicyDependency, 'kind' | 'id'>,
) {
  return `${value.kind}:${value.id}`;
}

function stringValue(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) contractError(`${field} must be a non-empty string.`, { field });
  return value.trim();
}

function stringArray(value: unknown, field: string) {
  if (!Array.isArray(value) || value.length === 0) {
    contractError(`${field} must be a non-empty array.`, { field });
  }
  const normalized = value.map((entry, index) => stringValue(entry, `${field}[${index}]`));
  if (new Set(normalized).size !== normalized.length) {
    contractError(`${field} must contain unique values.`, { field });
  }
  return normalized;
}

function enumValue<const T extends readonly string[]>(value: unknown, allowed: T, field: string): T[number] {
  if (typeof value !== 'string' || !allowed.includes(value as T[number])) {
    contractError(`${field} is invalid.`, { field, allowed_values: [...allowed] });
  }
  return value as T[number];
}

export function normalizeFlowCapabilityBundles(
  value: unknown,
): AgentPackageFlowCapabilityBundle[] {
  if (!Array.isArray(value)) {
    contractError('capability_bundles must be an array.', { field: 'capability_bundles' });
  }
  const bundles = value.map((entry, index): AgentPackageFlowCapabilityBundle => {
    const field = `capability_bundles[${index}]`;
    if (!isRecord(entry) || !isRecord(entry.readiness)) {
      contractError(`${field} must be an object with readiness semantics.`, { field });
    }
    const relationship = entry.relationship;
    const onlineMaterialization = entry.online_materialization;
    const fullDistribution = entry.full_distribution;
    const aggregation = entry.readiness.aggregation;
    const absenceEffect = entry.readiness.absence_effect;
    const repairPolicy = entry.readiness.repair_policy;
    if (!['experience_baseline', 'compatible_optional'].includes(String(relationship))) {
      contractError(`${field}.relationship is invalid.`, { field: `${field}.relationship` });
    }
    if (!['members_marked_default', 'observe_only'].includes(String(onlineMaterialization))) {
      contractError(`${field}.online_materialization is invalid.`, { field: `${field}.online_materialization` });
    }
    if (!['members_marked_full', 'none'].includes(String(fullDistribution))) {
      contractError(`${field}.full_distribution is invalid.`, { field: `${field}.full_distribution` });
    }
    if (!['all_members', 'observe_members'].includes(String(aggregation))) {
      contractError(`${field}.readiness.aggregation is invalid.`, { field: `${field}.readiness.aggregation` });
    }
    if (!['degraded_non_blocking', 'optional_absent'].includes(String(absenceEffect))) {
      contractError(`${field}.readiness.absence_effect is invalid.`, { field: `${field}.readiness.absence_effect` });
    }
    if (!['framework_or_owner_adapter', 'none'].includes(String(repairPolicy))) {
      contractError(`${field}.readiness.repair_policy is invalid.`, { field: `${field}.readiness.repair_policy` });
    }
    return {
      id: stringValue(entry.id, `${field}.id`),
      label: stringValue(entry.label, `${field}.label`),
      relationship: relationship as AgentPackageFlowCapabilityBundle['relationship'],
      member_refs: stringArray(entry.member_refs, `${field}.member_refs`),
      online_materialization: onlineMaterialization as AgentPackageFlowCapabilityBundle['online_materialization'],
      full_distribution: fullDistribution as AgentPackageFlowCapabilityBundle['full_distribution'],
      readiness: {
        aggregation: aggregation as AgentPackageFlowCapabilityBundle['readiness']['aggregation'],
        absence_effect: absenceEffect as AgentPackageFlowCapabilityBundle['readiness']['absence_effect'],
        repair_policy: repairPolicy as AgentPackageFlowCapabilityBundle['readiness']['repair_policy'],
      },
    };
  });
  if (new Set(bundles.map((bundle) => bundle.id)).size !== bundles.length) {
    contractError('capability_bundles must use unique ids.', { field: 'capability_bundles' });
  }
  return bundles;
}

function planItem(
  dependency: AgentPackageManagedPolicyDependency,
  relationship: AgentPackageFlowCapabilityPlanItem['relationship'],
): AgentPackageFlowCapabilityPlanItem {
  return {
    ...structuredClone(dependency),
    capability_ref: flowCapabilityRef(dependency),
    relationship,
  };
}

function assertBundleClosure(input: {
  bundles: AgentPackageFlowCapabilityBundle[];
  experienceBaseline: AgentPackageManagedPolicyDependency[];
  compatibleOptional: AgentPackageManagedPolicyDependency[];
}) {
  const declared = new Map<string, { dependency: AgentPackageManagedPolicyDependency; relationship: AgentPackageFlowCapabilityBundle['relationship'] }>();
  for (const [relationship, dependencies] of [
    ['experience_baseline', input.experienceBaseline],
    ['compatible_optional', input.compatibleOptional],
  ] as const) {
    for (const dependency of dependencies) {
      const capabilityRef = flowCapabilityRef(dependency);
      if (!dependency.bundle_id) {
        contractError('Bundled Flow capabilities must declare bundle_id.', { capability_ref: capabilityRef });
      }
      declared.set(capabilityRef, { dependency, relationship });
    }
  }
  const seen = new Set<string>();
  for (const bundle of input.bundles) {
    const expectedSemantics = bundle.relationship === 'experience_baseline'
      ? {
          online: 'members_marked_default',
          full: 'members_marked_full',
          aggregation: 'all_members',
          absence: 'degraded_non_blocking',
          repair: 'framework_or_owner_adapter',
        }
      : {
          online: 'observe_only',
          full: 'none',
          aggregation: 'observe_members',
          absence: 'optional_absent',
          repair: 'none',
        };
    if (
      bundle.online_materialization !== expectedSemantics.online
      || bundle.full_distribution !== expectedSemantics.full
      || bundle.readiness.aggregation !== expectedSemantics.aggregation
      || bundle.readiness.absence_effect !== expectedSemantics.absence
      || bundle.readiness.repair_policy !== expectedSemantics.repair
    ) {
      contractError('Capability bundle semantics do not match its relationship.', { bundle_id: bundle.id });
    }
    for (const capabilityRef of bundle.member_refs) {
      if (seen.has(capabilityRef)) {
        contractError('Capability bundle membership must have one owner bundle.', { capability_ref: capabilityRef });
      }
      seen.add(capabilityRef);
      const member = declared.get(capabilityRef);
      if (!member || member.relationship !== bundle.relationship || member.dependency.bundle_id !== bundle.id) {
        contractError('Capability bundle membership does not match the declared dependency.', {
          bundle_id: bundle.id,
          capability_ref: capabilityRef,
        });
      }
    }
  }
  const missing = [...declared.keys()].filter((capabilityRef) => !seen.has(capabilityRef));
  const extra = [...seen].filter((capabilityRef) => !declared.has(capabilityRef));
  if (missing.length > 0 || extra.length > 0) {
    contractError('Capability bundles must cover every baseline and optional dependency exactly once.', {
      missing_capability_refs: missing,
      extra_capability_refs: extra,
    });
  }
}

export function compileFlowCapabilityStrategy(input: {
  schema: 'opl_flow_workflow_policy.v4';
  package: { id: string; version: string };
  requires: AgentPackageManagedPolicyDependency[];
  experienceBaseline: AgentPackageManagedPolicyDependency[];
  compatibleOptional: AgentPackageManagedPolicyDependency[];
  capabilityBundles: AgentPackageFlowCapabilityBundle[];
  policySha256: string;
}): AgentPackageFlowCapabilityStrategyProjection {
  if (!/^[a-f0-9]{64}$/.test(input.policySha256)) {
    contractError('Flow capability strategy requires the exact policy sha256.', { policy_sha256: input.policySha256 });
  }
  const requires = input.requires.map((entry, index) => normalizeSourceDependency(entry, `requires[${index}]`));
  const experienceBaseline = input.experienceBaseline
    .map((entry, index) => normalizeSourceDependency(entry, `experience_baseline[${index}]`));
  const compatibleOptional = input.compatibleOptional
    .map((entry, index) => normalizeSourceDependency(entry, `compatible_optional[${index}]`));
  const capabilityBundles = normalizeFlowCapabilityBundles(input.capabilityBundles);
  const dependencyRefs = [...requires, ...experienceBaseline, ...compatibleOptional].map(flowCapabilityRef);
  if (new Set(dependencyRefs).size !== dependencyRefs.length) {
    contractError('Flow capability dependencies must use one relationship per capability_ref.', {
      field: 'dependencies',
      duplicate_capability_refs: dependencyRefs.filter((entry, index) => dependencyRefs.indexOf(entry) !== index),
    });
  }
  assertBundleClosure({
    bundles: capabilityBundles,
    experienceBaseline,
    compatibleOptional,
  });
  const materializationItems = [
    ...requires.map((dependency) => planItem(dependency, 'required')),
    ...experienceBaseline.map((dependency) => planItem(dependency, 'recommended')),
  ]
    .filter((item) => item.online_install_default)
    .sort((left, right) => left.capability_ref.localeCompare(right.capability_ref));
  const fullDistributionItems = materializationItems
    .filter((item) => item.offline_bundle === 'full')
    .sort((left, right) => left.capability_ref.localeCompare(right.capability_ref));
  const projectionWithoutDigest = {
    surface_kind: 'opl_flow_capability_strategy_projection.v1' as const,
    authority: 'opl-flow' as const,
    policy_schema: input.schema,
    policy_sha256: input.policySha256,
    package: structuredClone(input.package),
    bundles: structuredClone(capabilityBundles),
    materialization_plan: {
      target: 'online_default' as const,
      items: materializationItems,
    },
    full_distribution_plan: {
      target: 'full_offline_seed' as const,
      items: fullDistributionItems,
    },
  };
  return {
    ...projectionWithoutDigest,
    strategy_digest: sha256(stableJson(projectionWithoutDigest)),
  };
}

function normalizeSourceDependency(value: unknown, field: string): AgentPackageManagedPolicyDependency {
  if (!isRecord(value)) contractError(`${field} must be an object.`, { field });
  const id = stringValue(value.id, `${field}.id`);
  const kind = value.kind;
  if (!CAPABILITY_KINDS.has(kind as AgentPackageManagedPolicyDependency['kind'])) {
    contractError(`${field}.kind is invalid.`, { field: `${field}.kind` });
  }
  if (typeof value.online_install_default !== 'boolean') {
    contractError(`${field}.online_install_default must be boolean.`, { field: `${field}.online_install_default` });
  }
  const activation = value.activation;
  const normalizedActivation = enumValue(activation, ACTIVATIONS, `${field}.activation`);
  const optionalStrings = [
    'bundle_id',
    'source',
    'source_path',
    'owner',
    'version_requirement',
    'install_source',
    'lifecycle_owner',
  ] as const;
  const normalized: AgentPackageManagedPolicyDependency = {
    id,
    kind: kind as AgentPackageManagedPolicyDependency['kind'],
    online_install_default: value.online_install_default,
    activation: normalizedActivation,
  };
  for (const key of optionalStrings) {
    if (value[key] !== undefined) normalized[key] = stringValue(value[key], `${field}.${key}`);
  }
  if (value.offline_bundle !== undefined) {
    normalized.offline_bundle = enumValue(value.offline_bundle, OFFLINE_BUNDLES, `${field}.offline_bundle`);
  }
  if (value.conflict_policy !== undefined) {
    normalized.conflict_policy = enumValue(value.conflict_policy, CONFLICT_POLICIES, `${field}.conflict_policy`);
  }
  if (value.credential_policy !== undefined) {
    normalized.credential_policy = enumValue(
      value.credential_policy,
      CREDENTIAL_POLICIES,
      `${field}.credential_policy`,
    );
  }
  if (value.readiness_adapter !== undefined) {
    normalized.readiness_adapter = enumValue(
      value.readiness_adapter,
      READINESS_ADAPTERS,
      `${field}.readiness_adapter`,
    );
  }
  return normalized;
}

export function compileFlowCapabilityStrategyFromSourceRoot(
  sourceRoot: string,
): AgentPackageFlowCapabilityStrategyProjection {
  const policyPath = path.join(sourceRoot, 'contracts', 'workflow-policy.json');
  const schemaPath = path.join(sourceRoot, 'contracts', 'workflow-policy.schema.json');
  if (!fs.existsSync(policyPath) || !fs.statSync(policyPath).isFile()) {
    contractError('OPL Flow workflow policy is unavailable for capability compilation.', { policy_path: policyPath });
  }
  if (!fs.existsSync(schemaPath) || !fs.statSync(schemaPath).isFile()) {
    contractError('OPL Flow workflow policy schema is unavailable for capability compilation.', { schema_path: schemaPath });
  }
  const policyBytes = fs.readFileSync(policyPath);
  let payload: unknown;
  let schemaPayload: unknown;
  try {
    payload = JSON.parse(policyBytes.toString('utf8'));
  } catch {
    contractError('OPL Flow workflow policy is not valid JSON.', { policy_path: policyPath });
  }
  try {
    schemaPayload = JSON.parse(fs.readFileSync(schemaPath, 'utf8')) as unknown;
  } catch {
    contractError('OPL Flow workflow policy schema is not valid JSON.', { schema_path: schemaPath });
  }
  if (!isRecord(schemaPayload)) {
    contractError('OPL Flow workflow policy schema must be a JSON object.', { schema_path: schemaPath });
  }
  assertJsonSchemaPayload({
    schemaId: `opl-flow-capability-policy:${sha256(fs.readFileSync(schemaPath))}`,
    schema: schemaPayload,
    sourceRef: schemaPath,
  }, payload);
  if (!isRecord(payload) || payload.schema !== 'opl_flow_workflow_policy.v4' || !isRecord(payload.package)) {
    contractError('OPL Flow workflow policy does not expose a compatible capability strategy.', { policy_path: policyPath });
  }
  const sourceList = (value: unknown, field: string) => {
    if (!Array.isArray(value)) contractError(`${field} must be an array.`, { field });
    return value as AgentPackageManagedPolicyDependency[];
  };
  return compileFlowCapabilityStrategy({
    schema: 'opl_flow_workflow_policy.v4',
    package: {
      id: stringValue(payload.package.id, 'package.id'),
      version: stringValue(payload.package.version, 'package.version'),
    },
    requires: sourceList(payload.requires, 'requires'),
    experienceBaseline: sourceList(payload.experience_baseline, 'experience_baseline'),
    compatibleOptional: sourceList(payload.compatible_optional, 'compatible_optional'),
    capabilityBundles: payload.capability_bundles as AgentPackageFlowCapabilityBundle[],
    policySha256: sha256(policyBytes),
  });
}

export function compileFlowCapabilityBuildLock(input: {
  strategy: AgentPackageFlowCapabilityStrategyProjection;
  resolutions: AgentPackageFlowCapabilityBuildResolution[];
}): AgentPackageFlowCapabilityBuildLock {
  const resolutionByRef = new Map<string, AgentPackageFlowCapabilityBuildResolution>();
  for (const resolution of input.resolutions) {
    if (typeof resolution.capability_ref !== 'string' || !resolution.capability_ref.trim()) {
      contractError('Flow capability build resolution must name capability_ref.', {
        capability_ref: resolution.capability_ref,
      });
    }
    if (resolutionByRef.has(resolution.capability_ref)) {
      contractError('Flow capability build resolutions must be unique.', {
        capability_ref: resolution.capability_ref,
      });
    }
    if (
      typeof resolution.source_ref !== 'string'
      || !resolution.source_ref.trim()
      || typeof resolution.source_sha256 !== 'string'
      || !/^[a-f0-9]{64}$/.test(resolution.source_sha256)
      || (resolution.version !== null && (typeof resolution.version !== 'string' || !resolution.version.trim()))
    ) {
      contractError('Flow capability build resolution must include logical source_ref and sha256.', {
        capability_ref: resolution.capability_ref,
      });
    }
    resolutionByRef.set(resolution.capability_ref, structuredClone(resolution));
  }
  const selectedRefs = new Set(input.strategy.full_distribution_plan.items.map((item) => item.capability_ref));
  const unselectedRefs = [...resolutionByRef.keys()].filter((capabilityRef) => !selectedRefs.has(capabilityRef));
  if (unselectedRefs.length > 0) {
    contractError('Flow capability build resolutions include unselected capabilities.', {
      unselected_capability_refs: unselectedRefs,
    });
  }
  const items = input.strategy.full_distribution_plan.items.map((item) => {
    const resolution = resolutionByRef.get(item.capability_ref);
    if (!resolution) {
      contractError('Flow Full distribution plan is missing an exact source resolution.', {
        capability_ref: item.capability_ref,
      });
    }
    return { ...structuredClone(item), ...resolution };
  });
  const lockWithoutDigest = {
    surface_kind: 'opl_flow_capability_build_lock.v1' as const,
    authority: 'opl-framework' as const,
    target: 'full_offline_seed' as const,
    flow_package: {
      id: input.strategy.package.id,
      version: input.strategy.package.version,
      policy_sha256: input.strategy.policy_sha256,
      strategy_digest: input.strategy.strategy_digest,
    },
    items,
  };
  return {
    ...lockWithoutDigest,
    lock_digest: sha256(stableJson(lockWithoutDigest)),
  };
}

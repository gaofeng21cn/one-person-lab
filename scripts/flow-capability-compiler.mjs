import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';

const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => [key, canonicalValue(entry)]));
}

function digest(projection) {
  return sha256(JSON.stringify(canonicalValue(projection)));
}

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} requires a nonempty string.`);
  return value.trim();
}

function normalizeMember(row) {
  return Object.fromEntries(Object.entries(row).map(([field, value]) =>
    [field, typeof value === 'string' ? requireText(value, field) : value]));
}

function verifyMembership(bundles, members) {
  const bundleIds = new Set();
  const assignedRefs = new Set();
  for (const bundle of bundles) {
    if (bundleIds.has(bundle.id)) throw new Error(`Duplicate Flow bundle: ${bundle.id}.`);
    bundleIds.add(bundle.id);
    const baseline = bundle.relationship === 'experience_baseline';
    if (bundle.online_materialization !== (baseline ? 'members_marked_default' : 'observe_only')
      || bundle.full_distribution !== (baseline ? 'members_marked_full' : 'none')
      || bundle.readiness.aggregation !== (baseline ? 'all_members' : 'observe_members')
      || bundle.readiness.absence_effect !== (baseline ? 'degraded_non_blocking' : 'optional_absent')
      || bundle.readiness.repair_policy !== (baseline ? 'framework_or_owner_adapter' : 'none')) {
      throw new Error(`Flow bundle semantics differ from its relationship: ${bundle.id}.`);
    }
    for (const ref of bundle.member_refs) {
      const member = members.get(ref);
      if (assignedRefs.has(ref) || member?.bundle_id !== bundle.id || member?.relationship !== bundle.relationship) {
        throw new Error(`Invalid capability ${ref} in Flow bundle ${bundle.id}.`);
      }
      assignedRefs.add(ref);
    }
  }
  if (assignedRefs.size !== members.size) throw new Error('Flow bundles must cover every baseline and optional capability.');
}

export function compileFlowCapabilityStrategyFromSourceRoot(sourceRoot) {
  const read = name => fs.readFileSync(path.join(sourceRoot, 'contracts', name));
  const bytes = read('workflow-policy.json');
  const policy = JSON.parse(bytes);
  const schema = JSON.parse(read('workflow-policy.schema.json'));
  const validate = new Ajv2020({ strict: false }).compile(schema);
  if (!validate(policy)) throw new Error(`Invalid Flow workflow policy: ${JSON.stringify(validate.errors)}`);
  if (policy.schema !== 'opl_flow_workflow_policy.v4') throw new Error('Unsupported Flow workflow policy.');

  const members = new Map();
  const seen = new Set();
  const online = [];
  for (const [field, relationship] of [['requires', 'required'], ['experience_baseline', 'recommended'], ['compatible_optional', 'optional']]) {
    for (const row of policy[field]) {
      const member = normalizeMember(row);
      const ref = `${member.kind}:${member.id}`;
      if (seen.has(ref)) throw new Error(`Duplicate Flow capability: ${ref}.`);
      seen.add(ref);
      if (field !== 'requires') members.set(ref, { ...member, relationship: field });
      if (field !== 'compatible_optional' && member.online_install_default) {
        online.push({ ...member, capability_ref: ref, relationship });
      }
    }
  }
  verifyMembership(policy.capability_bundles, members);
  online.sort((a, b) => a.capability_ref.localeCompare(b.capability_ref));
  const strategy = {
    surface_kind: 'opl_flow_capability_strategy_projection.v1',
    authority: 'opl-flow',
    policy_schema: policy.schema,
    policy_sha256: sha256(bytes),
    package: { id: policy.package.id, version: policy.package.version },
    bundles: policy.capability_bundles,
    materialization_plan: { target: 'online_default', items: online },
    full_distribution_plan: { target: 'full_offline_seed', items: online.filter(item => item.offline_bundle === 'full') },
  };
  return { ...strategy, strategy_digest: digest(strategy) };
}

export function compileFlowCapabilityBuildLock({ strategy, resolutions }) {
  const byRef = new Map();
  for (const resolution of resolutions) {
    const { capability_ref, source_ref, source_sha256, version } = resolution;
    requireText(capability_ref, 'capability_ref');
    requireText(source_ref, 'source_ref');
    if (typeof source_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(source_sha256)) throw new Error(`Invalid source SHA-256 for ${capability_ref}.`);
    if (version !== null) requireText(version, 'version');
    if (byRef.has(capability_ref)) throw new Error(`Duplicate source resolution for ${capability_ref}.`);
    byRef.set(capability_ref, { source_ref, source_sha256, version });
  }
  const items = strategy.full_distribution_plan.items.map(item => {
    const source = byRef.get(item.capability_ref);
    if (!source) throw new Error(`Missing exact source resolution for ${item.capability_ref}.`);
    byRef.delete(item.capability_ref);
    return { ...item, ...source };
  });
  if (byRef.size) throw new Error(`Unexpected sources outside the Full distribution plan: ${[...byRef.keys()].join(', ')}.`);
  const lock = {
    surface_kind: 'opl_flow_capability_build_lock.v1',
    authority: 'opl-framework',
    target: 'full_offline_seed',
    flow_package: { ...strategy.package, policy_sha256: strategy.policy_sha256, strategy_digest: strategy.strategy_digest },
    items,
  };
  return { ...lock, lock_digest: digest(lock) };
}

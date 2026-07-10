import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { isRecord } from '../../kernel/contract-validation.ts';

type JsonRecord = Record<string, unknown>;

export type ReferenceBuildDigestTarget = {
  ref: string;
  local_file_ref: string;
  json_pointer?: string;
  source_kinds: string[];
};

const RECEIPT_PROJECTION_FIELDS = new Set([
  'build_receipt',
  'build_receipt_ref',
  'build_receipt_refs',
]);

function machineString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function uniqueStrings(values: unknown): string[] {
  return [...new Set((Array.isArray(values) ? values : [values])
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim()))];
}

function recordArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function targetPath(targetAgentDir: string, fileRef: string): string {
  const root = path.resolve(targetAgentDir);
  const resolved = path.resolve(root, fileRef);
  if (resolved === root || !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`reference_build_proof_local_ref_outside_target_root:${fileRef}`);
  }
  return resolved;
}

function parseDirectLocalRef(ref: string) {
  const hashIndex = ref.indexOf('#');
  const fileRef = hashIndex >= 0 ? ref.slice(0, hashIndex) : ref;
  const jsonPointer = hashIndex >= 0 ? ref.slice(hashIndex + 1) : undefined;
  if (
    !fileRef
    || path.isAbsolute(fileRef)
    || fileRef.includes(':')
    || (!fileRef.startsWith('agent/') && !fileRef.startsWith('contracts/'))
  ) {
    return null;
  }
  return { fileRef, ...(jsonPointer ? { jsonPointer } : {}) };
}

function actionDigestTarget(targetAgentDir: string, ref: string) {
  const actionId = ref.slice('action-ref:'.length);
  const actionCatalogRef = 'contracts/action_catalog.json';
  const actionCatalog = JSON.parse(fs.readFileSync(targetPath(targetAgentDir, actionCatalogRef), 'utf8'));
  const actions = recordArray(isRecord(actionCatalog) ? actionCatalog.actions : null);
  const actionIndex = actions.findIndex((action) => action.action_id === actionId);
  if (actionIndex < 0) {
    throw new Error(`reference_build_proof_action_ref_unresolved:${ref}`);
  }
  return {
    ref,
    local_file_ref: actionCatalogRef,
    json_pointer: `/actions/${actionIndex}`,
  };
}

function digestTargetForRef(
  targetAgentDir: string,
  ref: string,
  sourceKind: string,
): ReferenceBuildDigestTarget | null {
  if (ref.startsWith('action-ref:')) {
    return { ...actionDigestTarget(targetAgentDir, ref), source_kinds: [sourceKind] };
  }
  const directRef = parseDirectLocalRef(
    ref.startsWith('domain-skill-ref:') ? ref.slice('domain-skill-ref:'.length) : ref,
  );
  if (!directRef) {
    return null;
  }
  return {
    ref,
    local_file_ref: directRef.fileRef,
    ...(directRef.jsonPointer ? { json_pointer: directRef.jsonPointer } : {}),
    source_kinds: [sourceKind],
  };
}

function mergeDigestTarget(targets: ReferenceBuildDigestTarget[], next: ReferenceBuildDigestTarget): void {
  const current = targets.find((target) => (
    target.ref === next.ref
    && target.local_file_ref === next.local_file_ref
    && target.json_pointer === next.json_pointer
  ));
  if (current) {
    current.source_kinds = uniqueStrings([...current.source_kinds, ...next.source_kinds]);
    return;
  }
  targets.push(next);
}

function addRefs(
  targets: ReferenceBuildDigestTarget[],
  targetAgentDir: string,
  refs: unknown,
  sourceKind: string,
  requireResolution: boolean,
): void {
  for (const ref of uniqueStrings(refs)) {
    const target = digestTargetForRef(targetAgentDir, ref, sourceKind);
    if (!target) {
      if (requireResolution) {
        throw new Error(`reference_build_proof_required_local_ref_unresolved:${ref}`);
      }
      continue;
    }
    mergeDigestTarget(targets, target);
  }
}

export function buildReferenceBuildDigestTargets(
  targetAgentDir: string,
  agentPackPlan: JsonRecord,
): ReferenceBuildDigestTarget[] {
  const targets: ReferenceBuildDigestTarget[] = [];
  addRefs(targets, targetAgentDir, agentPackPlan.planned_control_refs, 'planned_control_ref', true);
  addRefs(targets, targetAgentDir, agentPackPlan.planned_capability_refs, 'planned_capability_ref', false);
  addRefs(targets, targetAgentDir, agentPackPlan.planned_knowledge_refs, 'planned_knowledge_ref', true);
  addRefs(targets, targetAgentDir, agentPackPlan.planned_tool_refs, 'planned_tool_ref', true);
  addRefs(targets, targetAgentDir, agentPackPlan.planned_quality_gate_refs, 'planned_quality_gate_ref', true);
  for (const stage of recordArray(agentPackPlan.planned_stage_refs)) {
    addRefs(targets, targetAgentDir, stage.prompt_ref, 'planned_stage_prompt_ref', true);
    addRefs(targets, targetAgentDir, stage.stage_path, 'planned_stage_ref', true);
    addRefs(targets, targetAgentDir, stage.skill_ref, 'planned_stage_skill_ref', true);
    addRefs(targets, targetAgentDir, stage.knowledge_refs, 'planned_stage_knowledge_ref', true);
    addRefs(targets, targetAgentDir, stage.tool_refs, 'planned_stage_tool_ref', true);
    addRefs(targets, targetAgentDir, stage.quality_gate_refs, 'planned_stage_quality_gate_ref', true);
  }
  return targets;
}

function withoutReceiptProjection(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(withoutReceiptProjection);
  }
  if (!isRecord(value)) {
    return value;
  }
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !RECEIPT_PROJECTION_FIELDS.has(key))
    .map(([key, entry]) => [key, withoutReceiptProjection(entry)]));
}

function jsonPointerValue(payload: unknown, pointer: string, ref: string): unknown {
  if (!pointer.startsWith('/')) {
    throw new Error(`reference_build_proof_json_pointer_invalid:${ref}`);
  }
  let current = payload;
  for (const rawToken of pointer.slice(1).split('/')) {
    const token = rawToken.replace(/~1/g, '/').replace(/~0/g, '~');
    if (Array.isArray(current)) {
      const index = Number(token);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        throw new Error(`reference_build_proof_json_pointer_unresolved:${ref}`);
      }
      current = current[index];
      continue;
    }
    if (!isRecord(current) || !Object.hasOwn(current, token)) {
      throw new Error(`reference_build_proof_json_pointer_unresolved:${ref}`);
    }
    current = current[token];
  }
  return current;
}

export function materializeReferenceBuildFileDigest(
  targetAgentDir: string,
  target: ReferenceBuildDigestTarget,
): JsonRecord {
  const filePath = targetPath(targetAgentDir, target.local_file_ref);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`reference_build_proof_materialized_file_missing:${target.ref}`);
  }
  const isJson = target.local_file_ref.endsWith('.json');
  let digestInput: string | Buffer;
  if (isJson) {
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const selected = target.json_pointer
      ? jsonPointerValue(payload, target.json_pointer, target.ref)
      : withoutReceiptProjection(payload);
    digestInput = JSON.stringify(selected);
  } else {
    digestInput = fs.readFileSync(filePath);
  }
  return {
    ref: target.ref,
    local_file_ref: target.local_file_ref,
    ...(target.json_pointer ? { json_pointer: target.json_pointer } : {}),
    source_kinds: target.source_kinds,
    digest_scope: target.json_pointer ? 'json_pointer_value' : 'file_content',
    digest_normalization: isJson
      ? 'canonical_json_without_agent_build_receipt_projection'
      : 'raw_file_bytes',
    sha256: createHash('sha256').update(digestInput).digest('hex'),
  };
}

export function validateReferenceBuildReceiptMaterialization(
  repoDir: string,
  agentPackPlan: JsonRecord | null,
  buildReceipt: JsonRecord | null,
): string[] {
  if (!agentPackPlan || !buildReceipt) {
    return [];
  }
  const blockers: string[] = [];
  let expectedTargets: ReferenceBuildDigestTarget[];
  try {
    expectedTargets = buildReferenceBuildDigestTargets(repoDir, agentPackPlan);
  } catch (error) {
    return [error instanceof Error ? error.message : 'reference_build_proof_target_resolution_failed'];
  }
  const materialization = isRecord(buildReceipt.materialization) ? buildReceipt.materialization : null;
  const entries = recordArray(materialization?.materialized_file_digests);
  const entriesByRef = new Map<string, JsonRecord>();
  for (const entry of entries) {
    const ref = machineString(entry.ref);
    if (!ref) {
      blockers.push('source_derived_design_build_receipt_invalid_materialized_file_digest:missing-ref');
      continue;
    }
    if (entriesByRef.has(ref)) {
      blockers.push(`source_derived_design_build_receipt_duplicate_materialized_file_digest:${ref}`);
      continue;
    }
    entriesByRef.set(ref, entry);
  }
  for (const target of expectedTargets) {
    const entry = entriesByRef.get(target.ref);
    if (!entry) {
      blockers.push(`source_derived_design_build_receipt_missing_planned_file_digest:${target.ref}`);
      continue;
    }
    let expected: JsonRecord;
    try {
      expected = materializeReferenceBuildFileDigest(repoDir, target);
    } catch (error) {
      blockers.push(error instanceof Error ? error.message : `reference_build_proof_digest_failed:${target.ref}`);
      continue;
    }
    for (const field of [
      'local_file_ref',
      'json_pointer',
      'digest_scope',
      'digest_normalization',
      'sha256',
    ]) {
      if ((entry[field] ?? null) !== (expected[field] ?? null)) {
        blockers.push(`source_derived_design_build_receipt_materialized_file_digest_mismatch:${target.ref}:${field}`);
      }
    }
    const sourceKinds = uniqueStrings(entry.source_kinds);
    if (target.source_kinds.some((sourceKind) => !sourceKinds.includes(sourceKind))) {
      blockers.push(`source_derived_design_build_receipt_materialized_file_digest_mismatch:${target.ref}:source_kinds`);
    }
    entriesByRef.delete(target.ref);
  }
  for (const ref of entriesByRef.keys()) {
    blockers.push(`source_derived_design_build_receipt_unplanned_materialized_file_digest:${ref}`);
  }
  return [...new Set(blockers)];
}

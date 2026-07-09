import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { isRecord } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import { stringValue as optionalString, type JsonRecord } from '../../kernel/json-record.ts';

type Classifier = (payload: JsonRecord, context: {
  source_path: string;
  source_sha256: string;
}) => JsonRecord | null | undefined;

export interface BuildWorkspaceReceiptInventoryInput {
  roots: string[];
  receipt_root_locator: JsonRecord;
  classifyReceipt?: Classifier;
}

export interface BuildWorkspaceArtifactLocatorProjectionInput {
  roots: string[];
  artifact_root_locator: JsonRecord;
  classifyArtifact?: Classifier;
}

function requireString(value: unknown, field: string) {
  const text = optionalString(value);
  if (!text) {
    throw new Error(`generic substrate locator 缺少字符串字段: ${field}`);
  }
  return text;
}

function cloneRecord(value: unknown, field: string) {
  if (!isRecord(value)) {
    throw new Error(`generic substrate locator ${field} 必须是 object`);
  }
  return structuredClone(value) as JsonRecord;
}

function normalizeRoots(roots: string[]) {
  if (!Array.isArray(roots) || roots.length === 0) {
    throw new Error('generic substrate locator roots 至少需要一个路径');
  }
  return [...new Set(roots.map((root, index) => path.resolve(requireString(root, `roots[${index}]`))))];
}

function jsonFiles(root: string): string[] {
  if (!fs.existsSync(root)) {
    return [];
  }
  const stat = fs.lstatSync(root);
  if (stat.isSymbolicLink()) {
    return [];
  }
  if (stat.isFile()) {
    return root.endsWith('.json') ? [root] : [];
  }
  if (!stat.isDirectory()) {
    return [];
  }
  return fs.readdirSync(root, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') {
        return [];
      }
      const absolutePath = path.join(root, entry.name);
      return entry.isSymbolicLink() ? [] : entry.isDirectory() ? jsonFiles(absolutePath) : entry.isFile() && entry.name.endsWith('.json') ? [absolutePath] : [];
    });
}

function sha256(content: string) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function keyAllowsRefOnlyAuthorityField(key: string) {
  return key.endsWith('_ref') || key.endsWith('_refs') || key.endsWith('_ref_count');
}

function rejectClassifierAuthorityBodies(value: unknown, field: string): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => rejectClassifierAuthorityBodies(entry, `${field}[${index}]`));
    return;
  }
  if (!isRecord(value)) {
    return;
  }
  for (const [rawKey, entry] of Object.entries(value)) {
    const key = rawKey.trim().toLowerCase().replaceAll('-', '_').replaceAll(' ', '_');
    const forbidden = [
      'artifact_body',
      'domain_truth',
      'memory_body',
      'owner_receipt',
      'receipt_body',
      'typed_blocker',
      'verdict_body',
    ].some((token) => key.includes(token));
    if (forbidden && !keyAllowsRefOnlyAuthorityField(key)) {
      throw new Error(`generic substrate locator ${field}.${rawKey} 不得携带 authority body`);
    }
    rejectClassifierAuthorityBodies(entry, `${field}.${rawKey}`);
  }
}

function readJsonRecord(filePath: string) {
  const content = fs.readFileSync(filePath, 'utf8');
  const parsed = parseJsonText(content);
  if (!isRecord(parsed)) {
    throw new Error(`generic substrate locator JSON root 必须是 object: ${filePath}`);
  }
  return { payload: parsed, content, source_sha256: sha256(content) };
}

function classify(
  classifier: Classifier | undefined,
  payload: JsonRecord,
  context: { source_path: string; source_sha256: string },
) {
  if (!classifier) {
    return null;
  }
  const projection = classifier(structuredClone(payload) as JsonRecord, context);
  if (projection === null || projection === undefined) {
    return null;
  }
  const normalized = cloneRecord(projection, `classification:${context.source_path}`);
  rejectClassifierAuthorityBodies(normalized, `classification:${context.source_path}`);
  return normalized;
}

function receiptProjection(payload: JsonRecord) {
  return {
    surface_kind: optionalString(payload.surface_kind) ?? optionalString(payload.receipt_kind) ?? 'unknown_receipt',
    receipt_id: optionalString(payload.receipt_id) ?? optionalString(payload.id),
    receipt_shape: optionalString(payload.receipt_shape),
    stage_id: optionalString(payload.stage_id),
    status: optionalString(payload.status) ?? optionalString(payload.state),
    observed_at: optionalString(payload.observed_at)
      ?? optionalString(payload.recorded_at)
      ?? optionalString(payload.created_at),
    owner_receipt_ref: optionalString(payload.owner_receipt_ref),
    typed_blocker_ref: optionalString(payload.typed_blocker_ref),
    no_regression_evidence_ref: optionalString(payload.no_regression_evidence_ref),
  };
}

function refEntries(value: unknown, currentPath = '$'): Array<{ key: string; json_path: string; ref: string }> {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => refEntries(entry, `${currentPath}[${index}]`));
  }
  if (!isRecord(value)) {
    return [];
  }
  return Object.entries(value).flatMap(([key, entry]) => {
    const jsonPath = `${currentPath}.${key}`;
    const normalizedKey = key.trim().toLowerCase().replaceAll('-', '_');
    if (
      ['_ref', '_file', '_path', '_uri', '_url', '_html'].some((suffix) => normalizedKey.endsWith(suffix))
      && typeof entry === 'string'
      && entry.trim()
    ) {
      return [{ key, json_path: jsonPath, ref: entry.trim() }];
    }
    if (normalizedKey.endsWith('_refs') && Array.isArray(entry)) {
      return entry.flatMap((ref, index) => typeof ref === 'string' && ref.trim()
        ? [{ key, json_path: `${jsonPath}[${index}]`, ref: ref.trim() }]
        : []);
    }
    return refEntries(entry, jsonPath);
  });
}

export function buildWorkspaceReceiptInventory(input: BuildWorkspaceReceiptInventoryInput) {
  const roots = normalizeRoots(input.roots);
  const locator = cloneRecord(input.receipt_root_locator, 'receipt_root_locator');
  rejectClassifierAuthorityBodies(locator, 'receipt_root_locator');
  const diagnostics: JsonRecord[] = [];
  const receipts = roots.flatMap((root) => jsonFiles(root).flatMap((sourcePath) => {
    try {
      const { payload, source_sha256 } = readJsonRecord(sourcePath);
      const context = { source_path: sourcePath, source_sha256 };
      return [{
        ref_kind: 'workspace_receipt_json',
        ref: sourcePath,
        source_sha256,
        size_bytes: fs.statSync(sourcePath).size,
        modified_at: fs.statSync(sourcePath).mtime.toISOString(),
        receipt_projection: receiptProjection(payload),
        domain_classification: classify(input.classifyReceipt, payload, context),
        body_included: false,
        write_permitted: false,
      }];
    } catch (error) {
      diagnostics.push({
        source_path: sourcePath,
        status: 'invalid_receipt_json',
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }));
  return {
    surface_kind: 'opl_workspace_receipt_inventory',
    version: 'opl-workspace-receipt-inventory.v1',
    roots,
    receipt_root_locator: locator,
    summary: {
      receipt_ref_count: receipts.length,
      invalid_receipt_count: diagnostics.length,
      typed_blocker_ref_count: receipts.filter((entry) => entry.receipt_projection.typed_blocker_ref).length,
      owner_receipt_ref_count: receipts.filter((entry) => entry.receipt_projection.owner_receipt_ref).length,
    },
    receipts,
    diagnostics,
    authority_boundary: {
      refs_and_metadata_only: true,
      body_included: false,
      write_permitted: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
      can_issue_domain_verdict: false,
    },
  };
}

export function buildWorkspaceArtifactLocatorProjection(
  input: BuildWorkspaceArtifactLocatorProjectionInput,
) {
  const roots = normalizeRoots(input.roots);
  const locator = cloneRecord(input.artifact_root_locator, 'artifact_root_locator');
  rejectClassifierAuthorityBodies(locator, 'artifact_root_locator');
  const diagnostics: JsonRecord[] = [];
  const refs = roots.flatMap((root) => jsonFiles(root).flatMap((sourcePath) => {
    try {
      const { payload, source_sha256 } = readJsonRecord(sourcePath);
      const context = { source_path: sourcePath, source_sha256 };
      const classification = classify(input.classifyArtifact, payload, context);
      return refEntries(payload).map((entry) => ({
        ...entry,
        source_path: sourcePath,
        source_sha256,
        domain_classification: classification,
        body_included: false,
        write_permitted: false,
        opaque_to_opl: true,
      }));
    } catch (error) {
      diagnostics.push({
        source_path: sourcePath,
        status: 'invalid_artifact_locator_json',
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }));
  const uniqueRefs = [...new Map(refs.map((entry) => [`${entry.ref}|${entry.source_path}|${entry.json_path}`, entry])).values()];
  return {
    surface_kind: 'opl_workspace_artifact_locator_projection',
    version: 'opl-workspace-artifact-locator-projection.v1',
    roots,
    artifact_root_locator: locator,
    summary: {
      artifact_ref_count: uniqueRefs.length,
      invalid_locator_count: diagnostics.length,
      artifact_body_count: 0,
    },
    refs: uniqueRefs,
    diagnostics,
    authority_boundary: {
      refs_and_metadata_only: true,
      body_included: false,
      write_permitted: false,
      can_mutate_artifact: false,
      can_issue_artifact_or_quality_verdict: false,
    },
  };
}

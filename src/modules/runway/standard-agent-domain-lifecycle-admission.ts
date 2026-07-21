import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJsonBytes } from '../../kernel/canonical-json.ts';
import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import type { FamilyActionCatalogAction } from '../../kernel/family-action-catalog-contract.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import { resolveOplStatePaths } from '../../kernel/runtime-state-paths.ts';
import { readStandardAgentDescriptorInterface } from '../../kernel/standard-agent-interface.ts';
import {
  DOMAIN_ARTIFACT_CAS_CAPABILITY_ID,
  domainArtifactCasMaterializationInProgress,
} from './domain-artifact-cas-materialization.ts';

export const DOMAIN_LIFECYCLE_ADMISSION_CAPABILITY_ID = 'opl_domain_lifecycle_admission.v1' as const;

const DIGEST = /^(?:sha256:)?([a-f0-9]{64})$/u;
const DEFAULT_REACTIVATION_RECEIPT_FIELD = 'mas_study_lifecycle_reactivation_receipt';
const DEFAULT_MATERIALIZATION_AUTHORIZATION_FIELD = 'mas_lifecycle_cas_mutation_authorization';
const REQUEST_FIELD_MAP_KEYS = [
  'work_item_id',
  'reactivation_request',
  'authority_context',
  'work_item_identity',
  'user_authority',
  'reviewer_revision_intake',
  'current_lifecycle',
  'profile',
  'projection_inventory',
] as const;

type ReactivationRequestInputField = typeof REQUEST_FIELD_MAP_KEYS[number];

type LifecycleProjectionSource = {
  projection_id: string;
  root: 'workspace' | 'work_item';
  relative_path: string;
  required: boolean;
  media_type: 'application/json';
};

export type StandardAgentLifecycleAdmissionContract = {
  capability_id: typeof DOMAIN_LIFECYCLE_ADMISSION_CAPABILITY_ID;
  work_item_id_field: string;
  lifecycle_state_field: string;
  lifecycle_generation_field: string;
  active_state: string;
  stopped_state: string;
  admission_payload_field: string;
  reactivation_action_id: string;
  reactivation_receipt_output_field: string;
  materialization_authorization_output_field: string;
  required_wakeup_gate_id: string;
  stopped_relaunch_gate_id: string;
  reactivation_projection_sources: LifecycleProjectionSource[];
  reactivation_request_input_field_map: Record<ReactivationRequestInputField, string>;
};

type ExactFile = {
  file: string;
  ref: string;
  bytes: Buffer;
  sha256: string;
  payload: Record<string, unknown>;
};

type LocatedLifecycle = {
  descriptorDomainId: string;
  inventory: ExactFile;
  inventoryItem: Record<string, unknown>;
  workItemRoot: string;
  lifecycle: ExactFile;
};

export type StandardAgentLifecycleReactivationRequest = {
  user_authority_ref: string;
  user_authority_sha256: string;
  reviewer_revision_intake_ref: string;
  reviewer_revision_intake_sha256: string;
  current_lifecycle_ref: string;
  current_lifecycle_sha256: string;
  profile_ref: string;
  profile_sha256: string;
  observed_lifecycle_state: string;
  observed_lifecycle_generation: number;
  explicit_user_wakeup: boolean;
  allow_stopped_relaunch: boolean;
  requested_at: string;
  reason_code: 'reviewer_revision_reactivation';
  reason_summary: string;
};

export type ParsedStandardAgentLifecycleAdmission =
  | {
      mode: 'reactivation_request';
      value: Record<string, unknown>;
      reactivationRequest: StandardAgentLifecycleReactivationRequest;
    }
  | {
      mode: 'materialized_receipt';
      value: Record<string, unknown>;
      domainAuthorityResultRef: string;
      domainAuthorityResultSha256: string;
      materializationReceiptRef: string;
      materializationReceiptSha256: string;
    };

export type StandardAgentLifecycleReactivationBinding = {
  contract: StandardAgentLifecycleAdmissionContract;
  handlerActionId: string;
  handlerRunId: string;
  admissionPayloadField: string;
  admissionScopeId: string;
  originalAdmissionRequestRef: string;
  originalAdmissionRequestSha256: string;
  ownerLedgerRef: string;
};

export type PreparedStandardAgentLifecycleReactivation = StandardAgentLifecycleReactivationBinding & {
  handlerPayload: Record<string, unknown>;
};

function blocked(message: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, {
    failure_code: 'domain_lifecycle_stage_launch_blocked',
    repair_route: {
      responsible_component: 'domain_lifecycle_authority_and_opl_stage_admission',
      issue: message,
      impact: 'A StageRun cannot start while canonical domain lifecycle authority is inactive, stale, or mid-transaction.',
      repair_action: 'Replay the same registry-bound reactivation transaction, close its CAS journal, and retry the Stage action with current exact refs.',
      expected_outcome: 'Canonical domain lifecycle is active and the StageRun starts from current authority bytes.',
    },
    ...details,
  });
}

function text(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) blocked(`${field} must be a non-empty string.`, { field });
  return value.trim();
}

function integer(value: unknown, field: string) {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    blocked(`${field} must be a non-negative safe integer.`, { field, value });
  }
  return Number(value);
}

function boolean(value: unknown, field: string) {
  if (typeof value !== 'boolean') blocked(`${field} must be boolean.`, { field, value });
  return value;
}

function digest(value: unknown, field: string) {
  if (typeof value !== 'string') blocked(`${field} must be a SHA-256 digest.`, { field });
  const match = DIGEST.exec(value);
  if (!match) blocked(`${field} must be a SHA-256 digest.`, { field, value });
  return match[1]!;
}

function strings(value: unknown, field: string) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !entry.trim())) {
    blocked(`${field} must be an array of non-empty strings.`, { field });
  }
  const normalized = value.map((entry) => String(entry).trim());
  if (new Set(normalized).size !== normalized.length) blocked(`${field} must not contain duplicates.`, { field });
  return normalized;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], field: string) {
  const allowed = new Set(expected);
  const unsupported = Object.keys(value).filter((key) => !allowed.has(key));
  const missing = expected.filter((key) => !Object.hasOwn(value, key));
  if (unsupported.length > 0 || missing.length > 0) {
    blocked(`${field} has an invalid exact shape.`, {
      field,
      unsupported_fields: unsupported,
      missing_fields: missing,
    });
  }
}

function optionalContractText(value: Record<string, unknown>, field: string, fallback: string) {
  return value[field] === undefined ? fallback : text(value[field], `lifecycle_admission_contract.${field}`);
}

function jsonPointerText(value: unknown, field: string) {
  const pointer = text(value, field);
  if (!pointer.startsWith('/') || pointer === '/') blocked(`${field} must be a non-root absolute JSON Pointer.`);
  return pointer;
}

export function standardAgentLifecycleAdmissionContract(
  action: FamilyActionCatalogAction,
): StandardAgentLifecycleAdmissionContract | null {
  const value = action.authority_boundary?.lifecycle_admission_contract;
  if (value === undefined) return null;
  if (action.execution_binding.kind !== 'stage_binding' || !isRecord(value)) {
    blocked('lifecycle_admission_contract is valid only on a stage-bound action.');
  }
  const allowed = new Set([
    'capability_id',
    'work_item_id_field',
    'lifecycle_state_field',
    'lifecycle_generation_field',
    'active_state',
    'stopped_state',
    'admission_payload_field',
    'reactivation_action_id',
    'reactivation_receipt_output_field',
    'materialization_authorization_output_field',
    'required_wakeup_gate_id',
    'stopped_relaunch_gate_id',
    'reactivation_projection_sources',
    'reactivation_request_input_field_map',
  ]);
  const unsupported = Object.keys(value).filter((key) => !allowed.has(key));
  if (unsupported.length > 0) {
    blocked('lifecycle_admission_contract contains unsupported fields.', { unsupported_fields: unsupported });
  }
  if (value.capability_id !== DOMAIN_LIFECYCLE_ADMISSION_CAPABILITY_ID) {
    blocked('lifecycle_admission_contract capability_id is unsupported.', { capability_id: value.capability_id });
  }
  if (!isRecord(value.reactivation_request_input_field_map)) {
    blocked('lifecycle_admission_contract.reactivation_request_input_field_map must be an object.');
  }
  const requestInputFieldMap = value.reactivation_request_input_field_map;
  exactKeys(
    requestInputFieldMap,
    REQUEST_FIELD_MAP_KEYS,
    'lifecycle_admission_contract.reactivation_request_input_field_map',
  );
  const fieldMap = Object.fromEntries(REQUEST_FIELD_MAP_KEYS.map((field) => [
    field,
    jsonPointerText(
      requestInputFieldMap[field],
      `lifecycle_admission_contract.reactivation_request_input_field_map.${field}`,
    ),
  ])) as Record<ReactivationRequestInputField, string>;
  const pointers = Object.values(fieldMap);
  if (new Set(pointers).size !== pointers.length || pointers.some((left) => (
    pointers.some((right) => left !== right && (left.startsWith(`${right}/`) || right.startsWith(`${left}/`)))
  ))) blocked('reactivation_request_input_field_map pointers must be unique and non-overlapping.');
  if (!Array.isArray(value.reactivation_projection_sources) || value.reactivation_projection_sources.length === 0) {
    blocked('lifecycle_admission_contract.reactivation_projection_sources must be a non-empty array.');
  }
  const projectionIds = new Set<string>();
  const projectionSources = value.reactivation_projection_sources.map((entry, index): LifecycleProjectionSource => {
    if (!isRecord(entry)) blocked('reactivation_projection_sources entries must be objects.', { index });
    exactKeys(
      entry,
      ['projection_id', 'root', 'relative_path', 'required', 'media_type'],
      `reactivation_projection_sources[${index}]`,
    );
    const projectionId = text(entry.projection_id, `reactivation_projection_sources[${index}].projection_id`);
    if (projectionIds.has(projectionId)) {
      blocked('reactivation_projection_sources projection_id values must be unique.', { projection_id: projectionId });
    }
    projectionIds.add(projectionId);
    if (entry.root !== 'workspace' && entry.root !== 'work_item') {
      blocked('reactivation_projection_sources root is unsupported.', { index });
    }
    if (entry.media_type !== 'application/json') {
      blocked('reactivation_projection_sources media_type must be application/json.', { index });
    }
    const relativePath = text(entry.relative_path, `reactivation_projection_sources[${index}].relative_path`);
    if (path.isAbsolute(relativePath) || relativePath.split(/[\\/]+/u).includes('..')) {
      blocked('reactivation_projection_sources relative_path must stay inside its declared root.', { index });
    }
    return {
      projection_id: projectionId,
      root: entry.root,
      relative_path: relativePath,
      required: boolean(entry.required, `reactivation_projection_sources[${index}].required`),
      media_type: 'application/json',
    };
  });
  return {
    capability_id: DOMAIN_LIFECYCLE_ADMISSION_CAPABILITY_ID,
    work_item_id_field: text(value.work_item_id_field, 'lifecycle_admission_contract.work_item_id_field'),
    lifecycle_state_field: text(value.lifecycle_state_field, 'lifecycle_admission_contract.lifecycle_state_field'),
    lifecycle_generation_field: text(
      value.lifecycle_generation_field,
      'lifecycle_admission_contract.lifecycle_generation_field',
    ),
    active_state: text(value.active_state, 'lifecycle_admission_contract.active_state'),
    stopped_state: text(value.stopped_state, 'lifecycle_admission_contract.stopped_state'),
    admission_payload_field: text(value.admission_payload_field, 'lifecycle_admission_contract.admission_payload_field'),
    reactivation_action_id: text(value.reactivation_action_id, 'lifecycle_admission_contract.reactivation_action_id'),
    reactivation_receipt_output_field: optionalContractText(
      value,
      'reactivation_receipt_output_field',
      DEFAULT_REACTIVATION_RECEIPT_FIELD,
    ),
    materialization_authorization_output_field: optionalContractText(
      value,
      'materialization_authorization_output_field',
      DEFAULT_MATERIALIZATION_AUTHORIZATION_FIELD,
    ),
    required_wakeup_gate_id: optionalContractText(value, 'required_wakeup_gate_id', 'explicit_user_wakeup'),
    stopped_relaunch_gate_id: optionalContractText(value, 'stopped_relaunch_gate_id', 'allow_stopped_relaunch'),
    reactivation_projection_sources: projectionSources,
    reactivation_request_input_field_map: fieldMap,
  };
}

function sameFileIdentity(left: fs.BigIntStats, right: fs.BigIntStats) {
  return left.dev === right.dev && left.ino === right.ino;
}

function sameStableFile(left: fs.BigIntStats, right: fs.BigIntStats) {
  return sameFileIdentity(left, right)
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

function readStableBytes(file: string, field: string) {
  let before: fs.BigIntStats;
  try {
    before = fs.lstatSync(file, { bigint: true });
  } catch (error) {
    blocked(`${field} is missing.`, { file, cause: error instanceof Error ? error.message : String(error) });
  }
  if (before!.isSymbolicLink() || !before!.isFile()) blocked(`${field} must be a physical file.`, { file });
  const noFollow = typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0;
  const descriptor = fs.openSync(file, fs.constants.O_RDONLY | noFollow);
  try {
    const openedBefore = fs.fstatSync(descriptor, { bigint: true });
    if (!sameFileIdentity(before!, openedBefore)) blocked(`${field} changed before reading.`, { file });
    const bytes = fs.readFileSync(descriptor);
    const openedAfter = fs.fstatSync(descriptor, { bigint: true });
    const after = fs.lstatSync(file, { bigint: true });
    if (
      after.isSymbolicLink()
      || !sameStableFile(openedBefore, openedAfter)
      || !sameStableFile(openedAfter, after)
      || BigInt(bytes.byteLength) !== after.size
    ) blocked(`${field} changed while reading.`, { file });
    return bytes;
  } finally {
    fs.closeSync(descriptor);
  }
}

function sha256(bytes: string | Buffer | Uint8Array) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function jsonRecord(bytes: Buffer, file: string, field: string) {
  let payload: unknown;
  try {
    payload = parseJsonText(bytes.toString('utf8'));
  } catch (error) {
    blocked(`${field} must be valid JSON.`, { file, cause: error instanceof Error ? error.message : String(error) });
  }
  if (!isRecord(payload)) blocked(`${field} must contain a JSON object.`, { file });
  return payload!;
}

function exactJsonFile(file: string, field: string): ExactFile {
  const bytes = readStableBytes(file, field);
  return {
    file,
    ref: pathToFileURL(file).href,
    bytes,
    sha256: sha256(bytes),
    payload: jsonRecord(bytes, file, field),
  };
}

function assertContained(root: string, candidate: string, field: string) {
  const relative = path.relative(root, candidate);
  if (relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) {
    return candidate;
  }
  blocked(`${field} escapes its authority root.`, { authority_root: root, file: candidate });
}

function resolveContained(root: string, value: string | null, field: string) {
  if (!value) blocked(`${field} is missing.`, { field });
  const candidate = path.isAbsolute(value) ? path.resolve(value) : path.resolve(root, value);
  assertContained(root, candidate, field);
  return candidate;
}

function exactWorkspaceFileRef(input: {
  ref: unknown;
  expectedSha256: unknown;
  workspaceRoot: string;
  field: string;
  json: boolean;
}) {
  const ref = text(input.ref, `${input.field}_ref`);
  if (!ref.startsWith('file://')) blocked(`${input.field}_ref must be an exact file URL.`);
  let declaredPath: string;
  try {
    declaredPath = fileURLToPath(ref);
  } catch (error) {
    blocked(`${input.field}_ref is not a valid file URL.`, {
      ref,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  const workspaceRoot = fs.realpathSync.native(input.workspaceRoot);
  const realPath = fs.realpathSync.native(assertContained(workspaceRoot, path.resolve(declaredPath!), input.field));
  assertContained(workspaceRoot, realPath, input.field);
  if (pathToFileURL(realPath).href !== ref) blocked(`${input.field}_ref must use the canonical physical file URL.`);
  const bytes = readStableBytes(realPath, input.field);
  const actualSha256 = sha256(bytes);
  const expectedSha256 = digest(input.expectedSha256, `${input.field}_sha256`);
  if (actualSha256 !== expectedSha256) {
    blocked(`${input.field} bytes do not match the supplied exact digest.`, {
      expected_sha256: expectedSha256,
      actual_sha256: actualSha256,
    });
  }
  return {
    file: realPath,
    ref,
    bytes,
    sha256: actualSha256,
    ...(input.json ? { record: jsonRecord(bytes, realPath, input.field) } : {}),
  };
}

function jsonPointer(value: unknown, pointer: string) {
  let current = value;
  for (const raw of pointer.replace(/^\//u, '').split('/').filter(Boolean)) {
    const key = raw.replace(/~1/gu, '/').replace(/~0/gu, '~');
    if (Array.isArray(current)) {
      const index = Number(key);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return null;
      current = current[index];
    } else if (isRecord(current) && Object.hasOwn(current, key)) {
      current = current[key];
    } else {
      return null;
    }
  }
  return current;
}

function locateLifecycle(input: {
  checkoutRoot: string;
  workspaceRoot: string;
  workItemId: string;
}): LocatedLifecycle {
  const descriptor = readStandardAgentDescriptorInterface(input.checkoutRoot);
  const declaration = descriptor?.interface.inventory_projection;
  if (!descriptor || !declaration) {
    blocked('Lifecycle-gated action requires a Standard Agent inventory projection declaration.');
  }
  const workspaceRoot = fs.realpathSync.native(input.workspaceRoot);
  const inventoryPath = resolveContained(workspaceRoot, declaration.relative_path, 'inventory_projection.relative_path');
  const inventory = exactJsonFile(inventoryPath, 'domain inventory');
  const values = jsonPointer(inventory.payload, declaration.items_pointer);
  if (!Array.isArray(values)) blocked('Domain inventory items_pointer does not resolve to an array.');
  const fieldMap = declaration.field_map;
  const item = values.find((candidate) => (
    isRecord(candidate) && candidate[fieldMap.work_item_id] === input.workItemId
  ));
  if (!isRecord(item)) {
    blocked('Lifecycle-gated work item is absent from the domain inventory.', { work_item_id: input.workItemId });
  }
  const workItemRootValue = text(item[fieldMap.work_item_root], `inventory.${fieldMap.work_item_root}`);
  const workItemRoot = resolveContained(workspaceRoot, workItemRootValue, 'work_item_root');
  const lifecycleValue = text(item[fieldMap.lifecycle_ref], `inventory.${fieldMap.lifecycle_ref}`);
  const lifecyclePath = resolveContained(workItemRoot, lifecycleValue, 'lifecycle_ref');
  return {
    descriptorDomainId: descriptor.domain_id,
    inventory,
    inventoryItem: item,
    workItemRoot,
    lifecycle: exactJsonFile(lifecyclePath, 'canonical domain lifecycle'),
  };
}

function parseReactivationRequest(value: unknown): StandardAgentLifecycleReactivationRequest {
  if (!isRecord(value)) blocked('reactivation_request must be an object.');
  const fields = [
    'user_authority_ref',
    'user_authority_sha256',
    'reviewer_revision_intake_ref',
    'reviewer_revision_intake_sha256',
    'current_lifecycle_ref',
    'current_lifecycle_sha256',
    'profile_ref',
    'profile_sha256',
    'observed_lifecycle_state',
    'observed_lifecycle_generation',
    'explicit_user_wakeup',
    'allow_stopped_relaunch',
    'requested_at',
    'reason_code',
    'reason_summary',
  ] as const;
  exactKeys(value, fields, 'reactivation_request');
  const requestedAt = text(value.requested_at, 'reactivation_request.requested_at');
  if (!Number.isFinite(Date.parse(requestedAt))) blocked('reactivation_request.requested_at must be an ISO date-time.');
  if (value.reason_code !== 'reviewer_revision_reactivation') {
    blocked('reactivation_request.reason_code is unsupported.', { reason_code: value.reason_code });
  }
  return {
    user_authority_ref: text(value.user_authority_ref, 'reactivation_request.user_authority_ref'),
    user_authority_sha256: digest(value.user_authority_sha256, 'reactivation_request.user_authority_sha256'),
    reviewer_revision_intake_ref: text(
      value.reviewer_revision_intake_ref,
      'reactivation_request.reviewer_revision_intake_ref',
    ),
    reviewer_revision_intake_sha256: digest(
      value.reviewer_revision_intake_sha256,
      'reactivation_request.reviewer_revision_intake_sha256',
    ),
    current_lifecycle_ref: text(value.current_lifecycle_ref, 'reactivation_request.current_lifecycle_ref'),
    current_lifecycle_sha256: digest(value.current_lifecycle_sha256, 'reactivation_request.current_lifecycle_sha256'),
    profile_ref: text(value.profile_ref, 'reactivation_request.profile_ref'),
    profile_sha256: digest(value.profile_sha256, 'reactivation_request.profile_sha256'),
    observed_lifecycle_state: text(value.observed_lifecycle_state, 'reactivation_request.observed_lifecycle_state'),
    observed_lifecycle_generation: integer(
      value.observed_lifecycle_generation,
      'reactivation_request.observed_lifecycle_generation',
    ),
    explicit_user_wakeup: boolean(value.explicit_user_wakeup, 'reactivation_request.explicit_user_wakeup'),
    allow_stopped_relaunch: boolean(
      value.allow_stopped_relaunch,
      'reactivation_request.allow_stopped_relaunch',
    ),
    requested_at: requestedAt,
    reason_code: 'reviewer_revision_reactivation',
    reason_summary: text(value.reason_summary, 'reactivation_request.reason_summary'),
  };
}

export function parseStandardAgentLifecycleAdmission(value: unknown): ParsedStandardAgentLifecycleAdmission {
  if (!isRecord(value)) blocked('lifecycle_admission must be an object.');
  if (
    value.surface_kind !== 'opl_domain_lifecycle_admission'
    || value.version !== 'opl-domain-lifecycle-admission.v1'
  ) blocked('lifecycle_admission identity is unsupported.');
  if (value.mode === 'reactivation_request') {
    exactKeys(value, ['surface_kind', 'version', 'mode', 'reactivation_request'], 'lifecycle_admission');
    return {
      mode: 'reactivation_request',
      value,
      reactivationRequest: parseReactivationRequest(value.reactivation_request),
    };
  }
  if (value.mode === 'materialized_receipt') {
    exactKeys(value, [
      'surface_kind',
      'version',
      'mode',
      'domain_authority_result_ref',
      'domain_authority_result_sha256',
      'materialization_receipt_ref',
      'materialization_receipt_sha256',
    ], 'lifecycle_admission');
    return {
      mode: 'materialized_receipt',
      value,
      domainAuthorityResultRef: text(value.domain_authority_result_ref, 'domain_authority_result_ref'),
      domainAuthorityResultSha256: digest(value.domain_authority_result_sha256, 'domain_authority_result_sha256'),
      materializationReceiptRef: text(value.materialization_receipt_ref, 'materialization_receipt_ref'),
      materializationReceiptSha256: digest(value.materialization_receipt_sha256, 'materialization_receipt_sha256'),
    };
  }
  blocked('lifecycle_admission.mode is unsupported.', { mode: value.mode ?? null });
}

function setJsonPointer(target: Record<string, unknown>, pointer: string, value: unknown) {
  const segments = pointer.replace(/^\//u, '').split('/').map((entry) => (
    entry.replace(/~1/gu, '/').replace(/~0/gu, '~')
  ));
  let current = target;
  for (const segment of segments.slice(0, -1)) {
    const existing = current[segment];
    if (existing !== undefined) {
      if (!isRecord(existing)) blocked('Handler input field-map pointers collide.');
      current = existing;
    } else {
      const child: Record<string, unknown> = {};
      current[segment] = child;
      current = child;
    }
  }
  const leaf = segments.at(-1)!;
  if (Object.hasOwn(current, leaf)) blocked('Handler input field-map pointers collide.');
  current[leaf] = value;
}

function fsyncDirectory(directory: string) {
  const descriptor = fs.openSync(directory, fs.constants.O_RDONLY);
  try {
    fs.fsyncSync(descriptor);
  } catch (error) {
    if (!['EINVAL', 'ENOTSUP', 'EBADF'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
  } finally {
    fs.closeSync(descriptor);
  }
}

function persistContentAddressedWorkspaceRecord(input: {
  workspaceRoot: string;
  relativeDirectory: string;
  label: string;
  record: Record<string, unknown>;
}) {
  const bytes = canonicalJsonBytes(input.record);
  const recordSha256 = sha256(bytes);
  const directory = path.join(fs.realpathSync.native(input.workspaceRoot), input.relativeDirectory);
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${recordSha256}.json`);
  if (!fs.existsSync(file)) {
    const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
    const descriptor = fs.openSync(temporary, 'wx', 0o600);
    try {
      fs.writeFileSync(descriptor, bytes);
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    try {
      fs.linkSync(temporary, file);
      fsyncDirectory(directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    } finally {
      fs.rmSync(temporary, { force: true });
    }
  }
  const persisted = readStableBytes(file, input.label);
  if (!persisted.equals(bytes)) blocked(`${input.label} digest path has conflicting bytes.`);
  return { ref: pathToFileURL(file).href, sha256: recordSha256, record: input.record };
}

function persistOriginalAdmissionRequest(input: {
  workspaceRoot: string;
  domainId: string;
  actionId: string;
  runId: string;
  workItemId: string;
  originalInvocationSha256: string;
  admission: Record<string, unknown>;
}) {
  const record = {
    surface_kind: 'opl_domain_lifecycle_admission_request_record',
    version: 'opl-domain-lifecycle-admission-request-record.v1',
    canonical_domain_id: input.domainId,
    requested_action_id: input.actionId,
    requested_run_id: input.runId,
    work_item_id: input.workItemId,
    original_invocation_sha256: digest(input.originalInvocationSha256, 'original_invocation_sha256'),
    lifecycle_admission: input.admission,
  };
  return persistContentAddressedWorkspaceRecord({
    workspaceRoot: input.workspaceRoot,
    relativeDirectory: 'control/opl/lifecycle_admission_requests/sha256',
    label: 'Original lifecycle admission request',
    record,
  });
}

export function standardAgentLifecycleReactivationHandlerRunId(input: {
  domainId: string;
  actionId: string;
  runId: string;
  payload: Record<string, unknown>;
}) {
  const fingerprint = sha256(canonicalJsonBytes({
    domain_id: input.domainId,
    action_id: input.actionId,
    run_id: input.runId,
    lifecycle_admission: input.payload,
  }));
  return `lifecycle_reactivation_${fingerprint}`;
}

export function bindStandardAgentLifecycleReactivation(input: {
  action: FamilyActionCatalogAction;
  payload: Record<string, unknown>;
  workspaceRoot: string;
  domainId: string;
  runId: string;
  originalInvocationSha256: string;
}): (StandardAgentLifecycleReactivationBinding & {
  workItemId: string;
  admission: Extract<ParsedStandardAgentLifecycleAdmission, { mode: 'reactivation_request' }>;
}) | null {
  const contract = standardAgentLifecycleAdmissionContract(input.action);
  if (!contract) return null;
  const admissionValue = input.payload[contract.admission_payload_field];
  if (admissionValue === undefined) return null;
  const admission = parseStandardAgentLifecycleAdmission(admissionValue);
  if (admission.mode === 'materialized_receipt') return null;
  const workItemId = text(input.payload[contract.work_item_id_field], contract.work_item_id_field);
  const original = persistOriginalAdmissionRequest({
    workspaceRoot: input.workspaceRoot,
    domainId: input.domainId,
    actionId: input.action.action_id,
    runId: input.runId,
    workItemId,
    originalInvocationSha256: input.originalInvocationSha256,
    admission: admission.value,
  });
  const handlerRunId = standardAgentLifecycleReactivationHandlerRunId({
    domainId: input.domainId,
    actionId: input.action.action_id,
    runId: input.runId,
    payload: admission.value,
  });
  const admissionScopeId = `lifecycle-admission:${sha256(canonicalJsonBytes({
    canonical_domain_id: input.domainId,
    requested_action_id: input.action.action_id,
    requested_run_id: input.runId,
    work_item_id: workItemId,
    original_invocation_sha256: digest(input.originalInvocationSha256, 'original_invocation_sha256'),
    original_admission_request_sha256: original.sha256,
  }))}`;
  const ownerLedger = persistContentAddressedWorkspaceRecord({
    workspaceRoot: input.workspaceRoot,
    relativeDirectory: 'control/opl/lifecycle_admission_owner_ledger/sha256',
    label: 'Lifecycle admission owner ledger entry',
    record: {
      surface_kind: 'opl_lifecycle_admission_owner_ledger_entry',
      version: 'opl-lifecycle-admission-owner-ledger-entry.v1',
      status: 'reactivation_requested',
      canonical_domain_id: input.domainId,
      requested_action_id: input.action.action_id,
      requested_run_id: input.runId,
      work_item_id: workItemId,
      handler_action_id: contract.reactivation_action_id,
      handler_run_id: handlerRunId,
      admission_scope_id: admissionScopeId,
      original_invocation_sha256: digest(input.originalInvocationSha256, 'original_invocation_sha256'),
      original_admission_request_ref: original.ref,
      original_admission_request_sha256: original.sha256,
      authority_boundary: {
        opl_role: 'host_invocation_provenance_ledger',
        domain_role: 'lifecycle_mutation_and_owner_receipt_authority',
        can_authorize_domain_lifecycle: false,
        can_replace_domain_owner_receipt: false,
      },
    },
  });
  return {
    contract,
    handlerActionId: contract.reactivation_action_id,
    handlerRunId,
    admissionPayloadField: contract.admission_payload_field,
    admissionScopeId,
    originalAdmissionRequestRef: original.ref,
    originalAdmissionRequestSha256: original.sha256,
    ownerLedgerRef: ownerLedger.ref,
    workItemId,
    admission,
  };
}

function buildProjectionInventory(input: {
  contract: StandardAgentLifecycleAdmissionContract;
  located: LocatedLifecycle;
  workspaceRoot: string;
}) {
  const workspaceRoot = fs.realpathSync.native(input.workspaceRoot);
  const targets: Record<string, unknown>[] = [];
  const absentOptionalProjectionIds: string[] = [];
  for (const source of input.contract.reactivation_projection_sources) {
    const sourceRoot = source.root === 'workspace' ? workspaceRoot : input.located.workItemRoot;
    const target = resolveContained(sourceRoot, source.relative_path, `projection.${source.projection_id}`);
    if (!fs.existsSync(target)) {
      const parent = fs.realpathSync.native(path.dirname(target));
      assertContained(fs.realpathSync.native(sourceRoot), parent, `projection.${source.projection_id}.parent`);
      if (parent !== path.dirname(target)) {
        blocked('Projection target parent must not traverse a symbolic-link alias.', {
          projection_id: source.projection_id,
        });
      }
      if (source.required) {
        blocked('Required lifecycle reactivation projection is missing.', {
          projection_id: source.projection_id,
          relative_path: source.relative_path,
        });
      }
      absentOptionalProjectionIds.push(source.projection_id);
      continue;
    }
    const realTarget = fs.realpathSync.native(target);
    assertContained(fs.realpathSync.native(sourceRoot), realTarget, `projection.${source.projection_id}`);
    if (realTarget !== target) {
      blocked('Projection target must use a canonical physical path.', { projection_id: source.projection_id });
    }
    const current = exactJsonFile(realTarget, `projection.${source.projection_id}`);
    targets.push({
      projection_id: source.projection_id,
      root: source.root,
      relative_path: source.relative_path,
      ref: current.ref,
      sha256: current.sha256,
      byte_size: current.bytes.byteLength,
      record: current.payload,
    });
  }
  return {
    discovery_complete: true,
    targets,
    absent_optional_projection_ids: absentOptionalProjectionIds,
  };
}

export function prepareStandardAgentLifecycleReactivation(input: {
  action: FamilyActionCatalogAction;
  payload: Record<string, unknown>;
  checkoutRoot: string;
  workspaceRoot: string;
  domainId: string;
  runId: string;
  originalInvocationSha256: string;
}): PreparedStandardAgentLifecycleReactivation | null {
  const binding = bindStandardAgentLifecycleReactivation(input);
  if (!binding) return null;
  const { contract, workItemId, admission } = binding;
  const located = locateLifecycle({
    checkoutRoot: input.checkoutRoot,
    workspaceRoot: input.workspaceRoot,
    workItemId,
  });
  const lifecycle = located.lifecycle;
  const request = admission.reactivationRequest;
  if (
    lifecycle.payload[contract.work_item_id_field] !== workItemId
    || lifecycle.ref !== request.current_lifecycle_ref
    || lifecycle.sha256 !== request.current_lifecycle_sha256
    || lifecycle.payload[contract.lifecycle_state_field] !== request.observed_lifecycle_state
    || lifecycle.payload[contract.lifecycle_generation_field] !== request.observed_lifecycle_generation
  ) blocked('Reactivation request does not bind the current canonical lifecycle bytes and generation.', {
    actual: {
      work_item_id: lifecycle.payload[contract.work_item_id_field] ?? null,
      lifecycle_ref: lifecycle.ref,
      lifecycle_sha256: lifecycle.sha256,
      lifecycle_state: lifecycle.payload[contract.lifecycle_state_field] ?? null,
      lifecycle_generation: lifecycle.payload[contract.lifecycle_generation_field] ?? null,
    },
    requested: {
      work_item_id: workItemId,
      lifecycle_ref: request.current_lifecycle_ref,
      lifecycle_sha256: request.current_lifecycle_sha256,
      lifecycle_state: request.observed_lifecycle_state,
      lifecycle_generation: request.observed_lifecycle_generation,
    },
  });
  if (request.observed_lifecycle_state === contract.active_state) {
    blocked('A reactivation request cannot target an already active canonical lifecycle.');
  }
  if (!request.explicit_user_wakeup) blocked('Reactivation request is missing explicit user wakeup authority.');
  if (request.observed_lifecycle_state === contract.stopped_state && !request.allow_stopped_relaunch) {
    blocked('Stopped lifecycle reactivation requires allow_stopped_relaunch.');
  }

  const userAuthority = exactWorkspaceFileRef({
    ref: request.user_authority_ref,
    expectedSha256: request.user_authority_sha256,
    workspaceRoot: input.workspaceRoot,
    field: 'user_authority',
    json: true,
  });
  const revisionIntake = exactWorkspaceFileRef({
    ref: request.reviewer_revision_intake_ref,
    expectedSha256: request.reviewer_revision_intake_sha256,
    workspaceRoot: input.workspaceRoot,
    field: 'reviewer_revision_intake',
    json: true,
  });
  const profile = exactWorkspaceFileRef({
    ref: request.profile_ref,
    expectedSha256: request.profile_sha256,
    workspaceRoot: input.workspaceRoot,
    field: 'profile',
    json: false,
  });
  const projectionInventory = buildProjectionInventory({
    contract,
    located,
    workspaceRoot: input.workspaceRoot,
  });
  const values: Record<ReactivationRequestInputField, unknown> = {
    work_item_id: workItemId,
    reactivation_request: request,
    authority_context: {
      handler_call_ref: `opl://standard-agent-action-run/${encodeURIComponent(binding.handlerRunId)}`,
      owner_ledger_ref: binding.ownerLedgerRef,
      original_admission_request_ref: binding.originalAdmissionRequestRef,
      original_admission_request_sha256: binding.originalAdmissionRequestSha256,
      admission_scope_id: binding.admissionScopeId,
      requested_action_id: input.action.action_id,
      requested_run_id: input.runId,
      original_invocation_sha256: digest(input.originalInvocationSha256, 'original_invocation_sha256'),
    },
    work_item_identity: {
      [contract.work_item_id_field]: workItemId,
      work_item_root_ref: pathToFileURL(located.workItemRoot).href,
      lifecycle_ref: lifecycle.ref,
      descriptor_domain_id: located.descriptorDomainId,
    },
    user_authority: {
      authority_ref: userAuthority.ref,
      authority_sha256: userAuthority.sha256,
      record: userAuthority.record,
    },
    reviewer_revision_intake: {
      intake_ref: revisionIntake.ref,
      intake_sha256: revisionIntake.sha256,
      record: revisionIntake.record,
    },
    current_lifecycle: {
      lifecycle_ref: lifecycle.ref,
      lifecycle_sha256: lifecycle.sha256,
      record: lifecycle.payload,
    },
    profile: {
      profile_ref: profile.ref,
      profile_sha256: profile.sha256,
      profile_byte_size: profile.bytes.byteLength,
      profile_body_utf8: profile.bytes.toString('utf8'),
    },
    projection_inventory: projectionInventory,
  };
  const handlerPayload: Record<string, unknown> = {};
  for (const field of REQUEST_FIELD_MAP_KEYS) {
    setJsonPointer(handlerPayload, contract.reactivation_request_input_field_map[field], values[field]);
  }
  return {
    ...binding,
    handlerPayload,
  };
}

export function materializedStandardAgentLifecycleAdmission(input: {
  prepared: StandardAgentLifecycleReactivationBinding;
  handlerRun: unknown;
}) {
  if (!isRecord(input.handlerRun) || !isRecord(input.handlerRun.standard_agent_action_run)) {
    blocked('Reactivation handler did not return a Standard Agent action run.');
  }
  const run = input.handlerRun.standard_agent_action_run;
  if (
    run.execution_kind !== 'handler_ref'
    || run.status !== 'completed'
    || run.action_id !== input.prepared.handlerActionId
    || run.run_id !== input.prepared.handlerRunId
    || !isRecord(run.output)
    || !isRecord(run.result)
  ) blocked('Reactivation handler run is not a completed host-materialized authority result.');
  if (run.result.status === 'typed_blocker' || run.result.status === 'invalid_host_input') {
    blocked('Domain lifecycle reactivation authority did not authorize materialization or Stage admission.', {
      failure_code: run.result.status === 'typed_blocker'
        ? 'domain_lifecycle_reactivation_typed_blocker'
        : 'domain_lifecycle_reactivation_invalid_host_input',
      domain_authority_status: run.result.status,
      domain_authority_result_ref: text(run.output.ref, 'reactivation_handler.output.ref'),
      domain_authority_result_sha256: digest(run.output.sha256, 'reactivation_handler.output.sha256'),
      domain_authority_blocker: isRecord(run.result.typed_blocker) ? run.result.typed_blocker : null,
      domain_authority_error: isRecord(run.result.error) ? run.result.error : null,
    });
  }
  if (!isRecord(run.host_materialization)) {
    blocked('Reactivation handler run is not a completed host-materialized authority result.');
  }
  const outputRef = text(run.output.ref, 'reactivation_handler.output.ref');
  const outputSha256 = digest(run.output.sha256, 'reactivation_handler.output.sha256');
  const receiptRef = text(run.host_materialization.receipt_ref, 'host_materialization.receipt_ref');
  const receiptSha256 = digest(
    run.host_materialization.receipt_sha256,
    'host_materialization.receipt_sha256',
  );
  const reactivation = run.result[input.prepared.contract.reactivation_receipt_output_field];
  if (!isRecord(reactivation)) blocked('Reactivation handler output is missing its domain authority receipt.');
  if (
    reactivation.admission_scope_id !== input.prepared.admissionScopeId
    || reactivation.original_admission_request_ref !== input.prepared.originalAdmissionRequestRef
    || digest(
      reactivation.original_admission_request_sha256,
      'reactivation_receipt.original_admission_request_sha256',
    ) !== input.prepared.originalAdmissionRequestSha256
  ) blocked('Reactivation authority result does not preserve the OPL-bound request scope.');
  return {
    surface_kind: 'opl_domain_lifecycle_admission',
    version: 'opl-domain-lifecycle-admission.v1',
    mode: 'materialized_receipt',
    domain_authority_result_ref: outputRef,
    domain_authority_result_sha256: outputSha256,
    materialization_receipt_ref: receiptRef,
    materialization_receipt_sha256: receiptSha256,
  } as const;
}

function exactAuthorityFile(value: unknown, root: string, field: string) {
  const ref = text(value, field);
  if (!ref.startsWith('file://')) blocked(`${field} must be a file URL.`);
  let file: string;
  try {
    file = fileURLToPath(ref);
  } catch (error) {
    blocked(`${field} is not a valid file URL.`, { cause: error instanceof Error ? error.message : String(error) });
  }
  const authorityRoot = fs.realpathSync.native(root);
  const real = fs.realpathSync.native(assertContained(authorityRoot, path.resolve(file!), field));
  assertContained(authorityRoot, real, field);
  if (pathToFileURL(real).href !== ref) blocked(`${field} must be a canonical physical file URL.`);
  return exactJsonFile(real, field);
}

function validateMaterializedAdmission(input: {
  admission: Extract<ParsedStandardAgentLifecycleAdmission, { mode: 'materialized_receipt' }>;
  contract: StandardAgentLifecycleAdmissionContract;
  workspaceRoot: string;
  domainId: string;
  actionId: string;
  runId: string;
  originalInvocationSha256: string;
  workItemId: string;
  lifecycle: ExactFile;
  lifecycleState: string;
  lifecycleGeneration: number;
}) {
  const authority = exactAuthorityFile(
    input.admission.domainAuthorityResultRef,
    input.workspaceRoot,
    'domain_authority_result_ref',
  );
  if (authority.sha256 !== input.admission.domainAuthorityResultSha256) {
    blocked('Domain authority result bytes do not match lifecycle_admission.');
  }
  const stateRoot = resolveOplStatePaths().state_dir;
  fs.mkdirSync(stateRoot, { recursive: true });
  const materialization = exactAuthorityFile(
    input.admission.materializationReceiptRef,
    stateRoot,
    'materialization_receipt_ref',
  );
  if (materialization.sha256 !== input.admission.materializationReceiptSha256) {
    blocked('CAS materialization receipt bytes do not match lifecycle_admission.');
  }
  const receipt = materialization.payload;
  if (
    receipt.surface_kind !== 'opl_domain_artifact_cas_materialization_receipt'
    || receipt.version !== 'opl-domain-artifact-cas-materialization-receipt.v1'
    || receipt.capability_id !== DOMAIN_ARTIFACT_CAS_CAPABILITY_ID
    || receipt.domain_id !== input.domainId
    || receipt.status !== 'materialized'
    || !isRecord(receipt.transaction)
    || receipt.transaction.journal_must_be_absent_for_admission !== true
  ) blocked('CAS materialization receipt identity does not match the lifecycle-gated action.');
  const requestSha256 = digest(receipt.request_sha256, 'materialization_receipt.request_sha256');
  if (domainArtifactCasMaterializationInProgress({
    workspaceRoot: input.workspaceRoot,
    requestSha256,
  })) blocked('CAS materialization transaction journal is still in progress.');
  const domainResult = isRecord(receipt.domain_authority_result) ? receipt.domain_authority_result : null;
  if (
    !domainResult
    || domainResult.action_id !== input.contract.reactivation_action_id
    || domainResult.output_ref !== authority.ref
    || digest(domainResult.output_sha256, 'receipt.domain_authority_result.output_sha256') !== authority.sha256
  ) blocked('CAS materialization receipt does not bind the exact domain authority result.');
  const reactivation = authority.payload[input.contract.reactivation_receipt_output_field];
  const authorization = authority.payload[input.contract.materialization_authorization_output_field];
  if (!isRecord(reactivation) || !isRecord(authorization)) {
    blocked('Domain authority result is missing its reactivation receipt or CAS authorization.');
  }
  const originalRef = text(
    reactivation.original_admission_request_ref,
    'reactivation_receipt.original_admission_request_ref',
  );
  const original = exactAuthorityFile(originalRef, input.workspaceRoot, 'original_admission_request_ref');
  const originalSha256 = digest(
    reactivation.original_admission_request_sha256,
    'reactivation_receipt.original_admission_request_sha256',
  );
  if (original.sha256 !== originalSha256) blocked('Reactivation receipt original request digest is stale.');
  const expectedInvocationSha256 = digest(input.originalInvocationSha256, 'original_invocation_sha256');
  if (
    original.payload.canonical_domain_id !== input.domainId
    || original.payload.requested_action_id !== input.actionId
    || original.payload.requested_run_id !== input.runId
    || original.payload.work_item_id !== input.workItemId
    || original.payload.original_invocation_sha256 !== expectedInvocationSha256
    || reactivation.requested_action_id !== input.actionId
    || reactivation.requested_run_id !== input.runId
    || digest(
      reactivation.original_invocation_sha256,
      'reactivation_receipt.original_invocation_sha256',
    ) !== expectedInvocationSha256
  ) blocked('Reactivation receipt is not scoped to this exact Stage invocation.');
  const expectedScopeId = `lifecycle-admission:${sha256(canonicalJsonBytes({
    canonical_domain_id: input.domainId,
    requested_action_id: input.actionId,
    requested_run_id: input.runId,
    work_item_id: input.workItemId,
    original_invocation_sha256: expectedInvocationSha256,
    original_admission_request_sha256: originalSha256,
  }))}`;
  if (reactivation.admission_scope_id !== expectedScopeId) {
    blocked('Reactivation receipt admission_scope_id is stale or belongs to another Stage invocation.');
  }
  const originalAdmission = parseStandardAgentLifecycleAdmission(original.payload.lifecycle_admission);
  if (originalAdmission.mode !== 'reactivation_request') {
    blocked('Original lifecycle admission record does not contain a reactivation request.');
  }
  const request = originalAdmission.reactivationRequest;
  if (
    reactivation.user_authority_ref !== request.user_authority_ref
    || digest(reactivation.user_authority_sha256, 'reactivation_receipt.user_authority_sha256') !== request.user_authority_sha256
    || reactivation.reviewer_revision_intake_ref !== request.reviewer_revision_intake_ref
    || digest(
      reactivation.reviewer_revision_intake_sha256,
      'reactivation_receipt.reviewer_revision_intake_sha256',
    ) !== request.reviewer_revision_intake_sha256
    || reactivation.profile_ref !== request.profile_ref
    || digest(reactivation.profile_sha256, 'reactivation_receipt.profile_sha256') !== request.profile_sha256
  ) blocked('Reactivation receipt does not bind the exact user authority, revision intake, and profile refs.');
  const authorityReceiptRef = text(reactivation.receipt_ref, 'reactivation_receipt.receipt_ref');
  const satisfiedGateIds = strings(reactivation.satisfied_gate_ids, 'reactivation_receipt.satisfied_gate_ids');
  const fromState = text(reactivation.from_state, 'reactivation_receipt.from_state');
  const toState = text(reactivation.to_state, 'reactivation_receipt.to_state');
  const toGeneration = integer(reactivation.to_generation, 'reactivation_receipt.to_generation');
  if (
    reactivation[input.contract.work_item_id_field] !== input.workItemId
    || toState !== input.contract.active_state
    || toGeneration !== input.lifecycleGeneration
    || digest(reactivation.after_sha256, 'reactivation_receipt.after_sha256') !== input.lifecycle.sha256
    || !satisfiedGateIds.includes(input.contract.required_wakeup_gate_id)
  ) blocked('Reactivation receipt does not bind the current active lifecycle generation.');
  if (fromState === input.contract.stopped_state && !satisfiedGateIds.includes(input.contract.stopped_relaunch_gate_id)) {
    blocked('Stopped lifecycle reactivation is missing its additional relaunch gate.');
  }
  const receiptGateIds = strings(receipt.satisfied_gate_ids, 'materialization_receipt.satisfied_gate_ids');
  if (
    authorization.authority_receipt_ref !== authorityReceiptRef
    || receipt.authority_receipt_ref !== authorityReceiptRef
    || authorization.authorization_ref !== receipt.authorization_ref
    || JSON.stringify([...satisfiedGateIds].sort()) !== JSON.stringify([...receiptGateIds].sort())
  ) blocked('CAS authorization and materialization receipt do not preserve reactivation authority lineage.');
  if (!Array.isArray(receipt.operations)) blocked('CAS materialization receipt operations are missing.');
  const lifecycleOperation = receipt.operations.find((operation) => (
    isRecord(operation) && operation.target_ref === input.lifecycle.ref
  ));
  if (
    !isRecord(lifecycleOperation)
    || digest(lifecycleOperation.after_sha256, 'materialization_receipt.operations[].after_sha256') !== input.lifecycle.sha256
    || lifecycleOperation.after_byte_size !== input.lifecycle.bytes.byteLength
  ) blocked('CAS materialization receipt does not bind the current canonical lifecycle bytes.');
  if (input.lifecycleState !== input.contract.active_state) {
    blocked('Materialization receipt exists but canonical domain lifecycle is still inactive.', {
      lifecycle_state: input.lifecycleState,
    });
  }
  return {
    status: 'admitted_by_current_reactivation_receipt' as const,
    lifecycle_ref: input.lifecycle.ref,
    lifecycle_sha256: input.lifecycle.sha256,
    lifecycle_generation: input.lifecycleGeneration,
    reactivation_receipt_ref: authorityReceiptRef,
    materialization_receipt_ref: materialization.ref,
    admission_scope_id: expectedScopeId,
  };
}

export function preflightStandardAgentDomainLifecycleAdmission(input: {
  action: FamilyActionCatalogAction;
  payload: Record<string, unknown>;
  checkoutRoot: string;
  workspaceRoot: string;
  domainId: string;
  runId: string;
  originalInvocationSha256: string;
}) {
  const current = currentStandardAgentDomainLifecycle(input);
  const {
    contract,
    workItemId,
    lifecycle,
    lifecycleState,
    lifecycleGeneration,
  } = current;
  if (!contract) return { status: 'not_declared' as const };
  const admissionValue = input.payload[contract.admission_payload_field];
  if (lifecycleState === contract.active_state && admissionValue === undefined) {
    return activeLifecycleAdmission(current);
  }
  if (admissionValue !== undefined) {
    const admission = parseStandardAgentLifecycleAdmission(admissionValue);
    if (admission.mode === 'reactivation_request') {
      blocked('Reactivation request must be authority-evaluated and CAS-materialized before Stage admission.');
    }
    return validateMaterializedAdmission({
      admission,
      contract,
      workspaceRoot: input.workspaceRoot,
      domainId: input.domainId,
      actionId: input.action.action_id,
      runId: input.runId,
      originalInvocationSha256: input.originalInvocationSha256,
      workItemId,
      lifecycle,
      lifecycleState,
      lifecycleGeneration,
    });
  }
  inactiveLifecycleBlocked(current);
}

function currentStandardAgentDomainLifecycle(input: {
  action: FamilyActionCatalogAction;
  payload: Record<string, unknown>;
  checkoutRoot: string;
  workspaceRoot: string;
}) {
  const contract = standardAgentLifecycleAdmissionContract(input.action);
  if (!contract) {
    return {
      contract: null,
      workItemId: null,
      lifecycle: null,
      lifecycleState: null,
      lifecycleGeneration: null,
    } as const;
  }
  const workItemId = text(input.payload[contract.work_item_id_field], contract.work_item_id_field);
  const located = locateLifecycle({
    checkoutRoot: input.checkoutRoot,
    workspaceRoot: input.workspaceRoot,
    workItemId,
  });
  const lifecycle = located.lifecycle;
  if (lifecycle.payload[contract.work_item_id_field] !== workItemId) {
    blocked('Canonical lifecycle identity does not match the requested work item.', { work_item_id: workItemId });
  }
  const lifecycleState = text(
    lifecycle.payload[contract.lifecycle_state_field],
    `lifecycle.${contract.lifecycle_state_field}`,
  );
  const lifecycleGeneration = integer(
    lifecycle.payload[contract.lifecycle_generation_field],
    `lifecycle.${contract.lifecycle_generation_field}`,
  );
  return { contract, workItemId, lifecycle, lifecycleState, lifecycleGeneration };
}

function activeLifecycleAdmission(input: ReturnType<typeof currentStandardAgentDomainLifecycle>) {
  if (!input.contract || !input.lifecycle || input.lifecycleGeneration === null) {
    blocked('Canonical domain lifecycle admission is not declared.');
  }
  return {
    status: 'admitted_by_canonical_active_lifecycle' as const,
    lifecycle_ref: input.lifecycle.ref,
    lifecycle_sha256: input.lifecycle.sha256,
    lifecycle_generation: input.lifecycleGeneration,
    reactivation_receipt_ref: null,
    materialization_receipt_ref: null,
    admission_scope_id: null,
  };
}

function inactiveLifecycleBlocked(input: ReturnType<typeof currentStandardAgentDomainLifecycle>): never {
  if (!input.contract || !input.lifecycle || input.workItemId === null || input.lifecycleGeneration === null) {
    blocked('Canonical domain lifecycle admission is not declared.');
  }
  blocked('Canonical domain lifecycle is inactive and no current reactivation authority was supplied.', {
    work_item_id: input.workItemId,
    lifecycle_state: input.lifecycleState,
    lifecycle_generation: input.lifecycleGeneration,
    lifecycle_ref: input.lifecycle.ref,
  });
}

export function preflightCanonicalActiveStandardAgentDomainLifecycle(input: {
  action: FamilyActionCatalogAction;
  payload: Record<string, unknown>;
  checkoutRoot: string;
  workspaceRoot: string;
}) {
  const current = currentStandardAgentDomainLifecycle(input);
  if (!current.contract) return { status: 'not_declared' as const };
  if (current.lifecycleState !== current.contract.active_state) inactiveLifecycleBlocked(current);
  return activeLifecycleAdmission(current);
}

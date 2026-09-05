import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { TextDecoder } from 'node:util';

import { canonicalJsonBytes } from '../../../kernel/canonical-json.ts';
import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import { parseJsonText } from '../../../kernel/json-file.ts';
import { readStandardAgentDescriptorInterface } from '../../../kernel/standard-agent-interface.ts';
import {
  EXACT_BYTE_BINDING_FIELD_KEYS,
  EXACT_BYTE_BINDING_SOURCE_KEYS,
  type ExactByteBindingFieldMap,
  type ExactByteBindingSource,
  type ExactFile,
  type LifecycleExactByteBindingFields,
  type LocatedLifecycle,
  type LocatedWorkItemIdentity,
} from './types.ts';

const DIGEST = /^(?:sha256:)?([a-f0-9]{64})$/u;

export function blocked(message: string, details: Record<string, unknown> = {}): never {
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

export function text(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) blocked(`${field} must be a non-empty string.`, { field });
  return value.trim();
}

export function integer(value: unknown, field: string) {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    blocked(`${field} must be a non-negative safe integer.`, { field, value });
  }
  return Number(value);
}

export function boolean(value: unknown, field: string) {
  if (typeof value !== 'boolean') blocked(`${field} must be boolean.`, { field, value });
  return value;
}

export function digest(value: unknown, field: string) {
  if (typeof value !== 'string') blocked(`${field} must be a SHA-256 digest.`, { field });
  const match = DIGEST.exec(value);
  if (!match) blocked(`${field} must be a SHA-256 digest.`, { field, value });
  return match[1]!;
}

export function strings(value: unknown, field: string) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !entry.trim())) {
    blocked(`${field} must be an array of non-empty strings.`, { field });
  }
  const normalized = value.map((entry) => String(entry).trim());
  if (new Set(normalized).size !== normalized.length) blocked(`${field} must not contain duplicates.`, { field });
  return normalized;
}

export function exactKeys(value: Record<string, unknown>, expected: readonly string[], field: string) {
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

export function optionalContractText(value: Record<string, unknown>, field: string, fallback: string) {
  return value[field] === undefined ? fallback : text(value[field], `lifecycle_admission_contract.${field}`);
}

export function jsonPointerText(value: unknown, field: string) {
  const pointer = text(value, field);
  if (!pointer.startsWith('/') || pointer === '/') blocked(`${field} must be a non-root absolute JSON Pointer.`);
  return pointer;
}

export function exactByteBindingObjectField(value: unknown, field: string) {
  const name = text(value, field);
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(name)) {
    blocked(`${field} must be a safe JSON object field name.`, { field, value });
  }
  return name;
}

export function lifecycleExactByteBindingFields(value: unknown): LifecycleExactByteBindingFields | null {
  if (value === undefined) return null;
  if (!isRecord(value)) {
    blocked('lifecycle_admission_contract.exact_byte_binding_fields must be an object.');
  }
  exactKeys(
    value,
    EXACT_BYTE_BINDING_SOURCE_KEYS,
    'lifecycle_admission_contract.exact_byte_binding_fields',
  );
  const reservedFields: Record<ExactByteBindingSource, readonly string[]> = {
    user_authority: ['authority_ref'],
    reviewer_revision_intake: ['intake_ref'],
    current_lifecycle: ['lifecycle_ref'],
    projection_target: ['projection_id', 'root', 'relative_path', 'ref'],
  };
  return Object.fromEntries(EXACT_BYTE_BINDING_SOURCE_KEYS.map((source) => {
    const entry = value[source];
    const entryField = `lifecycle_admission_contract.exact_byte_binding_fields.${source}`;
    if (!isRecord(entry)) blocked(`${entryField} must be an object.`);
    exactKeys(entry, EXACT_BYTE_BINDING_FIELD_KEYS, entryField);
    const fields = Object.fromEntries(EXACT_BYTE_BINDING_FIELD_KEYS.map((bindingField) => [
      bindingField,
      exactByteBindingObjectField(entry[bindingField], `${entryField}.${bindingField}`),
    ])) as ExactByteBindingFieldMap;
    const names = Object.values(fields);
    if (new Set(names).size !== names.length) {
      blocked(`${entryField} field names must be unique.`, { field_names: names });
    }
    const reservedCollision = names.find((name) => reservedFields[source].includes(name));
    if (reservedCollision) {
      blocked(`${entryField} collides with a fixed injected field.`, { field_name: reservedCollision });
    }
    return [source, fields];
  })) as LifecycleExactByteBindingFields;
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

export function readStableBytes(file: string, field: string) {
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

export function sha256(bytes: string | Buffer | Uint8Array) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function assertNoDuplicateJsonKeys(raw: string) {
  let index = 0;
  const invalid = (reason: string): never => {
    throw new SyntaxError(`${reason} at character ${index}`);
  };
  const whitespace = () => {
    while (index < raw.length && /[\t\n\r ]/u.test(raw[index]!)) index += 1;
  };
  const quoted = (): string => {
    if (raw[index] !== '"') invalid('expected JSON string');
    const start = index;
    index += 1;
    while (index < raw.length) {
      const character = raw[index]!;
      if (character === '"') {
        index += 1;
        return parseJsonText(raw.slice(start, index)) as string;
      }
      if (character === '\\') {
        index += 1;
        const escape = raw[index];
        if (escape === 'u') {
          if (!/^[0-9a-fA-F]{4}$/u.test(raw.slice(index + 1, index + 5))) {
            invalid('invalid JSON Unicode escape');
          }
          index += 5;
          continue;
        }
        if (!escape || !'"\\/bfnrt'.includes(escape)) invalid('invalid JSON string escape');
        index += 1;
        continue;
      }
      if (character.charCodeAt(0) < 0x20) invalid('unescaped JSON control character');
      index += 1;
    }
    return invalid('unterminated JSON string');
  };
  const value = (): void => {
    whitespace();
    const character = raw[index];
    if (character === '{') {
      index += 1;
      whitespace();
      const keys = new Set<string>();
      if (raw[index] === '}') {
        index += 1;
        return;
      }
      while (index < raw.length) {
        whitespace();
        const key = quoted();
        if (keys.has(key)) invalid(`duplicate JSON object key ${JSON.stringify(key)}`);
        keys.add(key);
        whitespace();
        if (raw[index] !== ':') invalid('expected JSON object colon');
        index += 1;
        value();
        whitespace();
        if (raw[index] === '}') {
          index += 1;
          return;
        }
        if (raw[index] !== ',') invalid('expected JSON object comma');
        index += 1;
      }
      invalid('unterminated JSON object');
    }
    if (character === '[') {
      index += 1;
      whitespace();
      if (raw[index] === ']') {
        index += 1;
        return;
      }
      while (index < raw.length) {
        value();
        whitespace();
        if (raw[index] === ']') {
          index += 1;
          return;
        }
        if (raw[index] !== ',') invalid('expected JSON array comma');
        index += 1;
      }
      invalid('unterminated JSON array');
    }
    if (character === '"') {
      quoted();
      return;
    }
    for (const literal of ['true', 'false', 'null']) {
      if (raw.startsWith(literal, index)) {
        index += literal.length;
        return;
      }
    }
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u.exec(raw.slice(index));
    const numberText = number?.[0] ?? invalid('expected JSON value');
    index += numberText.length;
  };
  value();
  whitespace();
  if (index !== raw.length) invalid('unexpected trailing JSON content');
}

function assertFiniteJsonNumbers(value: unknown, field: string): void {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new SyntaxError(`${field} contains a non-finite JSON number`);
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertFiniteJsonNumbers(entry, `${field}[${index}]`));
  } else if (isRecord(value)) {
    for (const [key, entry] of Object.entries(value)) {
      assertFiniteJsonNumbers(entry, `${field}.${key}`);
    }
  }
}

function jsonRecord(bytes: Buffer, file: string, field: string) {
  let payload: unknown;
  try {
    const raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    assertNoDuplicateJsonKeys(raw);
    payload = parseJsonText(raw);
    assertFiniteJsonNumbers(payload, field);
  } catch (error) {
    blocked(`${field} must be strict UTF-8 JSON without duplicate keys.`, {
      file,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (!isRecord(payload)) blocked(`${field} must contain a JSON object.`, { file });
  return payload!;
}

export function exactJsonFile(file: string, field: string): ExactFile {
  const bytes = readStableBytes(file, field);
  return {
    file,
    ref: pathToFileURL(file).href,
    bytes,
    sha256: sha256(bytes),
    payload: jsonRecord(bytes, file, field),
  };
}

export function assertContained(root: string, candidate: string, field: string) {
  const relative = path.relative(root, candidate);
  if (relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) {
    return candidate;
  }
  blocked(`${field} escapes its authority root.`, { authority_root: root, file: candidate });
}

export function resolveContained(root: string, value: string | null, field: string) {
  if (!value) blocked(`${field} is missing.`, { field });
  const candidate = path.isAbsolute(value) ? path.resolve(value) : path.resolve(root, value);
  assertContained(root, candidate, field);
  return candidate;
}

export function exactWorkspaceFileRef(input: {
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

export function jsonPointer(value: unknown, pointer: string) {
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

export function locateWorkItemIdentity(input: {
  checkoutRoot: string;
  workspaceRoot: string;
  workItemId: string;
}): LocatedWorkItemIdentity {
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
  const inventoryItemIndex = values.findIndex((candidate) => (
    isRecord(candidate) && candidate[fieldMap.work_item_id] === input.workItemId
  ));
  const item = values[inventoryItemIndex];
  if (!isRecord(item)) {
    blocked('Lifecycle-gated work item is absent from the domain inventory.', { work_item_id: input.workItemId });
  }
  const workItemRootValue = text(item[fieldMap.work_item_root], `inventory.${fieldMap.work_item_root}`);
  const workItemRoot = resolveContained(workspaceRoot, workItemRootValue, 'work_item_root');
  return {
    descriptorDomainId: descriptor.domain_id,
    inventory,
    inventoryItem: item,
    inventoryItemIndex,
    workItemRoot,
  };
}

export function locateLifecycle(input: {
  checkoutRoot: string;
  workspaceRoot: string;
  workItemId: string;
}): LocatedLifecycle {
  const located = locateWorkItemIdentity(input);
  const descriptor = readStandardAgentDescriptorInterface(input.checkoutRoot)!;
  const fieldMap = descriptor.interface.inventory_projection!.field_map;
  const lifecycleValue = text(
    located.inventoryItem[fieldMap.lifecycle_ref],
    `inventory.${fieldMap.lifecycle_ref}`,
  );
  const lifecyclePath = resolveContained(located.workItemRoot, lifecycleValue, 'lifecycle_ref');
  return {
    descriptorDomainId: located.descriptorDomainId,
    inventory: located.inventory,
    inventoryItem: located.inventoryItem,
    workItemRoot: located.workItemRoot,
    lifecycle: exactJsonFile(lifecyclePath, 'canonical domain lifecycle'),
  };
}

export function setJsonPointer(target: Record<string, unknown>, pointer: string, value: unknown) {
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

export function persistContentAddressedWorkspaceRecord(input: {
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

export function exactAuthorityFile(value: unknown, root: string, field: string) {
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

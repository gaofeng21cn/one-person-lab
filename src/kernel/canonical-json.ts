import { FrameworkContractError } from './contract-validation.ts';

function fail(message: string, path: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, { path, ...details });
}

function assertUnicodeScalarString(value: string, path: string) {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!Number.isInteger(next) || next < 0xdc00 || next > 0xdfff) {
        fail('Canonical JSON does not allow lone Unicode surrogates.', path, { string_offset: index });
      }
      index += 1;
      continue;
    }
    if (unit >= 0xdc00 && unit <= 0xdfff) {
      fail('Canonical JSON does not allow lone Unicode surrogates.', path, { string_offset: index });
    }
  }
}

function canonicalValueText(value: unknown, path: string): string {
  if (value === null || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'string') {
    assertUnicodeScalarString(value, path);
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      fail('Canonical JSON does not allow non-finite numbers.', path);
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (Object.getOwnPropertySymbols(value).length > 0) {
      fail('Canonical JSON does not allow symbol keys.', path);
    }
    const entries: string[] = [];
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) {
        fail('Canonical JSON does not allow sparse arrays.', `${path}/${index}`);
      }
      entries.push(canonicalValueText(value[index], `${path}/${index}`));
    }
    if (Object.keys(value).length !== value.length) {
      fail('Canonical JSON arrays cannot carry named properties.', path);
    }
    return `[${entries.join(',')}]`;
  }
  if (typeof value === 'object' && value !== null) {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      fail('Canonical JSON only accepts plain JSON objects.', path);
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      fail('Canonical JSON does not allow symbol keys.', path);
    }
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    if (Object.getOwnPropertyNames(record).length !== keys.length) {
      fail('Canonical JSON objects cannot carry non-enumerable properties.', path);
    }
    for (const key of keys) assertUnicodeScalarString(key, `${path}/<key>`);
    return `{${keys.sort().map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(record, key);
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
        fail('Canonical JSON objects cannot carry accessor properties.', `${path}/${key}`);
      }
      const entry = record[key];
      if (entry === undefined || typeof entry === 'bigint' || typeof entry === 'function' || typeof entry === 'symbol') {
        fail('Canonical JSON contains an unsupported value.', `${path}/${key}`, { value_type: typeof entry });
      }
      return `${JSON.stringify(key)}:${canonicalValueText(entry, `${path}/${key}`)}`;
    }).join(',')}}`;
  }
  fail('Canonical JSON contains an unsupported value.', path, { value_type: typeof value });
}

export function canonicalJsonText(value: unknown) {
  return canonicalValueText(value, '$');
}

export function canonicalJsonBytes(value: unknown) {
  return Buffer.from(canonicalJsonText(value), 'utf8');
}

import { FrameworkContractError } from './contract-validation.ts';

function canonicalValue(value: unknown, path: string): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Canonical JSON does not allow non-finite numbers.', {
        path,
      });
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) => canonicalValue(entry, `${path}/${index}`));
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map((key) => {
      const entry = record[key];
      if (entry === undefined || typeof entry === 'bigint' || typeof entry === 'function' || typeof entry === 'symbol') {
        throw new FrameworkContractError('contract_shape_invalid', 'Canonical JSON contains an unsupported value.', {
          path: `${path}/${key}`,
          value_type: typeof entry,
        });
      }
      return [key, canonicalValue(entry, `${path}/${key}`)];
    }));
  }
  throw new FrameworkContractError('contract_shape_invalid', 'Canonical JSON contains an unsupported value.', {
    path,
    value_type: typeof value,
  });
}

export function canonicalJsonText(value: unknown) {
  return JSON.stringify(canonicalValue(value, '$'));
}

export function canonicalJsonBytes(value: unknown) {
  return Buffer.from(`${canonicalJsonText(value)}\n`, 'utf8');
}

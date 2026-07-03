import {
  record,
  recordList,
  stringValue,
  type JsonRecord,
} from '../../kernel/json-record.ts';

export type { JsonRecord };
export { record, recordList, stringValue };

export function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function countValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const valueRecord = record(value);
  if ('value' in valueRecord) {
    return numberValue(valueRecord.value);
  }
  return 0;
}

export function booleanValue(value: unknown) {
  return typeof value === 'boolean' ? value : false;
}

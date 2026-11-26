import { escape, fieldLabel, record, renderFields } from './presentation.ts';
import type {
  FormElementLike,
  InputFieldSchema,
  InputSchemaProperty,
} from './types.ts';

const BOUND_READONLY_KEYS = new Set([
  'work_item_identity',
  'item_id',
  'action_id',
  'action_revision',
  'route_revision',
  'workspace_path',
  'work_item_root',
]);

const TEXTAREA_FIELD_KEYS = new Set(['body', 'content', 'summary', 'statement']);
const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function renderInputFields(
  schema: InputFieldSchema | undefined | null,
  values: Readonly<Record<string, unknown>> = {},
  path: readonly string[] = [],
  attribute = 'data-field',
): string {
  const required = new Set(Array.isArray(schema?.required) ? schema.required : []);
  const props = record(schema?.properties);
  return Object.entries(props)
    .map(([name, raw]) => {
      const field = record(raw) as InputSchemaProperty;
      const key = [...path, name];
      const value = values[name] ?? field.default;
      const title = field.title || fieldLabel(name);
      const help = field.description ? `<small>${escape(field.description)}</small>` : '';
      const common = `${attribute}="${escape(JSON.stringify(key))}" data-value-type="${escape(field.type || 'string')}" ${required.has(name) ? 'required' : ''}`;

      if (field.readOnly || (BOUND_READONLY_KEYS.has(name) && value != null)) {
        return `<div class="bound-input"><strong>${escape(title)}</strong>${renderFields(value)}</div>`;
      }
      if (field.type === 'object' && field.properties) {
        return `<fieldset><legend>${escape(title)}</legend>${help}${renderInputFields(
          field as InputFieldSchema,
          record(value),
          key,
          attribute,
        )}</fieldset>`;
      }

      let control: string;
      if (Array.isArray(field.enum)) {
        control = `<select ${common} class="dsh-input"><option value="">请选择</option>${field.enum
          .map(
            (option, idx) =>
              `<option value="${escape(String(option))}" ${option === value ? 'selected' : ''}>${escape(field.enumNames?.[idx] || option)}</option>`,
          )
          .join('')}</select>`;
      } else if (field.type === 'boolean') {
        control = `<input ${common} type="checkbox" ${value === true ? 'checked' : ''}>`;
      } else if (field.type === 'array' && field.items?.type === 'string') {
        control = `<textarea ${common} data-line-array="true" placeholder="每行一项" class="dsh-input">${escape(
          Array.isArray(value) ? value.join('\n') : '',
        )}</textarea>`;
      } else if (field.type === 'object' || field.type === 'array') {
        control = `<textarea ${common} data-json="true" spellcheck="false" class="dsh-input">${escape(
          value == null ? '' : JSON.stringify(value, null, 2),
        )}</textarea>`;
      } else if (TEXTAREA_FIELD_KEYS.has(name) || field.format === 'textarea') {
        control = `<textarea ${common} class="dsh-input">${escape(value ?? '')}</textarea>`;
      } else {
        const inputType =
          field.type === 'number' || field.type === 'integer' ? 'number' : 'text';
        const stepAttr =
          field.type === 'integer'
            ? 'step="1"'
            : field.type === 'number'
              ? 'step="any"'
              : '';
        control = `<input ${common} type="${inputType}" ${stepAttr} value="${escape(value ?? '')}" class="dsh-input">`;
      }

      return `<label>${escape(title)}${required.has(name) ? '<span class="required-label">必填</span>' : ''}${control}${help}</label>`;
    })
    .join('');
}

export function readInputFields(
  form: FormElementLike,
  initial: Readonly<Record<string, unknown>> = {},
  attribute = 'data-field',
): Record<string, unknown> {
  const input = structuredClone(initial) as Record<string, unknown>;
  for (const control of form.querySelectorAll(`[${attribute}]`)) {
    const rawPath = control.getAttribute(attribute);
    if (!rawPath) continue;
    const parsedPath = JSON.parse(rawPath) as unknown;
    if (!Array.isArray(parsedPath) || parsedPath.length === 0) continue;
    const fieldPath = parsedPath.filter((seg): seg is string => typeof seg === 'string');
    if (fieldPath.length !== parsedPath.length) continue;
    if (fieldPath.some((seg) => UNSAFE_OBJECT_KEYS.has(seg))) continue;

    let value: unknown = control.value;
    if (control.type === 'checkbox') {
      value = Boolean(control.checked);
    } else if (control.dataset.json === 'true') {
      const trimmed = String(value ?? '').trim();
      if (!trimmed) {
        value = undefined;
      } else {
        try {
          value = JSON.parse(trimmed);
        } catch {
          throw new Error('结构化参数格式有误，请检查后再执行。');
        }
      }
    } else if (control.dataset.lineArray === 'true') {
      value = String(value ?? '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
    } else if (
      control.dataset.valueType === 'number'
      || control.dataset.valueType === 'integer'
    ) {
      value = value === '' ? undefined : Number(value);
    } else if (control.dataset.valueType === 'boolean') {
      value = value === 'true';
    }

    let target = input;
    for (const segment of fieldPath.slice(0, -1)) {
      const existing = Object.prototype.hasOwnProperty.call(target, segment)
        ? record(target[segment])
        : {};
      const next = { ...existing };
      Object.defineProperty(target, segment, {
        value: next,
        enumerable: true,
        writable: true,
        configurable: true,
      });
      target = next;
    }
    const leaf = fieldPath[fieldPath.length - 1]!;
    if (value === undefined) {
      if (Object.prototype.hasOwnProperty.call(target, leaf)) {
        delete target[leaf];
      }
    } else {
      Object.defineProperty(target, leaf, {
        value,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
  }
  return input;
}

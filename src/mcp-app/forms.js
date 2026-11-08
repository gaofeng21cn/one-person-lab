import { escape, record, fieldLabel, renderFields } from './presentation.js';

export function renderInputFields(schema, values = {}, path = [], attribute = 'data-field') {
  const required = new Set(Array.isArray(schema?.required) ? schema.required : []);
  return Object.entries(record(schema?.properties)).map(([name, raw]) => {
    const field = record(raw), key = [...path, name], value = values[name] ?? field.default;
    const title = field.title || fieldLabel(name), help = field.description ? `<small>${escape(field.description)}</small>` : '';
    const common = `${attribute}="${escape(JSON.stringify(key))}" data-value-type="${escape(field.type || 'string')}" ${required.has(name) ? 'required' : ''}`;
    if (field.readOnly || (['work_item_identity', 'item_id', 'action_id', 'action_revision', 'route_revision', 'workspace_path', 'work_item_root'].includes(name) && value != null)) return `<div class="bound-input"><strong>${escape(title)}</strong>${renderFields(value)}</div>`;
    if (field.type === 'object' && field.properties) return `<fieldset><legend>${escape(title)}</legend>${help}${renderInputFields(field, record(value), key, attribute)}</fieldset>`;
    let control;
    if (Array.isArray(field.enum)) control = `<select ${common}><option value="">请选择</option>${field.enum.map(option => `<option value="${escape(String(option))}" ${option === value ? 'selected' : ''}>${escape(field.enumNames?.[field.enum.indexOf(option)] || option)}</option>`).join('')}</select>`;
    else if (field.type === 'boolean') control = `<input ${common} type="checkbox" ${value === true ? 'checked' : ''}>`;
    else if (field.type === 'array' && field.items?.type === 'string') control = `<textarea ${common} data-line-array="true" placeholder="每行一项">${escape(Array.isArray(value) ? value.join('\n') : '')}</textarea>`;
    else if (['object', 'array'].includes(field.type)) control = `<textarea ${common} data-json="true" spellcheck="false">${escape(value == null ? '' : JSON.stringify(value, null, 2))}</textarea>`;
    else if (['body', 'content', 'summary', 'statement'].includes(name) || field.format === 'textarea') control = `<textarea ${common}>${escape(value ?? '')}</textarea>`;
    else control = `<input ${common} type="${['number', 'integer'].includes(field.type) ? 'number' : 'text'}" ${field.type === 'integer' ? 'step="1"' : field.type === 'number' ? 'step="any"' : ''} value="${escape(value ?? '')}">`;
    return `<label>${escape(title)}${required.has(name) ? '<span class="required-label">必填</span>' : ''}${control}${help}</label>`;
  }).join('');
}

export function readInputFields(form, initial = {}, attribute = 'data-field') {
  const input = structuredClone(initial);
  for (const control of form.querySelectorAll(`[${attribute}]`)) {
    const path = JSON.parse(control.getAttribute(attribute));
    let value = control.value;
    if (control.type === 'checkbox') value = control.checked;
    else if (control.dataset.json === 'true') {
      if (!value.trim()) value = undefined;
      else { try { value = JSON.parse(value); } catch { throw new Error('结构化参数格式有误，请检查后再执行。'); } }
    } else if (control.dataset.lineArray === 'true') value = value.split('\n').map(line => line.trim()).filter(Boolean);
    else if (['number', 'integer'].includes(control.dataset.valueType)) value = value === '' ? undefined : Number(value);
    else if (control.dataset.valueType === 'boolean') value = value === 'true';
    let target = input;
    for (const segment of path.slice(0, -1)) { target[segment] = { ...record(target[segment]) }; target = target[segment]; }
    if (value === undefined) delete target[path.at(-1)]; else target[path.at(-1)] = value;
  }
  return input;
}

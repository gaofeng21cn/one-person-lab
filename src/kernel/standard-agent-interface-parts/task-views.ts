import path from 'node:path';
import { isRecord } from '../contract-validation.ts';
import type { StandardAgentDomainDetailViewDeclaration, StandardAgentTaskProvider } from '../standard-agent-interface-types.ts';
import { invalid, stringValue, assertKnownKeys } from './validation-values.ts';

export function domainDetailViews(value: unknown, sourceRef: string): StandardAgentDomainDetailViewDeclaration[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    invalid('Standard Agent interface field domain_detail_views must be an array.', sourceRef, {
      field: 'domain_detail_views',
    });
  }
  const seen = new Set<string>();
  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      invalid('Standard Agent interface domain detail view declaration must be an object.', sourceRef, {
        field: `domain_detail_views.${index}`,
      });
    }
    assertKnownKeys(
      entry,
      [
        'view_id',
        'view_kind',
        'title',
        'schema_ref',
        'schema_version',
        'source_kind',
        'relative_path',
        'revision_pointer',
        'owner_task_binding',
      ],
      `domain_detail_views.${index}`,
      sourceRef,
    );
    const viewId = stringValue(entry.view_id, `domain_detail_views.${index}.view_id`, sourceRef);
    if (seen.has(viewId)) {
      invalid('Standard Agent interface domain detail view ids must be unique.', sourceRef, {
        field: `domain_detail_views.${index}.view_id`,
        view_id: viewId,
      });
    }
    seen.add(viewId);
    if (entry.source_kind !== 'work_item_relative_json') {
      invalid('Standard Agent interface domain detail view declaration is unsupported.', sourceRef, {
        field: `domain_detail_views.${index}`,
        view_kind: entry.view_kind ?? null,
        schema_version: entry.schema_version ?? null,
        source_kind: entry.source_kind ?? null,
      });
    }
    const viewKind = stringValue(entry.view_kind, `domain_detail_views.${index}.view_kind`, sourceRef);
    const schemaRef = entry.schema_ref === undefined || entry.schema_ref === null
      ? null
      : stringValue(entry.schema_ref, `domain_detail_views.${index}.schema_ref`, sourceRef);
    const schemaVersion = entry.schema_version === undefined || entry.schema_version === null
      ? null
      : stringValue(entry.schema_version, `domain_detail_views.${index}.schema_version`, sourceRef);
    if (!schemaRef && !schemaVersion) {
      invalid('Standard Agent interface domain detail view must declare schema_ref or schema_version.', sourceRef, {
        field: `domain_detail_views.${index}`,
      });
    }
    const relativePath = stringValue(
      entry.relative_path,
      `domain_detail_views.${index}.relative_path`,
      sourceRef,
    );
    if (path.isAbsolute(relativePath) || relativePath.split(/[\\/]+/).includes('..')) {
      invalid('Standard Agent interface domain detail view path must stay inside the work item.', sourceRef, {
        field: `domain_detail_views.${index}.relative_path`,
        relative_path: relativePath,
      });
    }
    return {
      view_id: viewId,
      view_kind: viewKind,
      title: entry.title === undefined || entry.title === null
        ? null
        : stringValue(entry.title, `domain_detail_views.${index}.title`, sourceRef),
      schema_ref: schemaRef,
      schema_version: schemaVersion,
      source_kind: 'work_item_relative_json',
      relative_path: relativePath,
      revision_pointer: entry.revision_pointer === undefined
        ? '/revision'
        : jsonPointer(entry.revision_pointer, `domain_detail_views.${index}.revision_pointer`, sourceRef),
      owner_task_binding: ownerTaskBinding(
        entry.owner_task_binding,
        `domain_detail_views.${index}.owner_task_binding`,
        sourceRef,
      ),
    };
  });
}

function jsonPointer(value: unknown, field: string, sourceRef: string) {
  const pointer = stringValue(value, field, sourceRef);
  if (!pointer.startsWith('/')) {
    invalid('Standard Agent typed view JSON pointer must be absolute.', sourceRef, { field, pointer });
  }
  return pointer;
}

function ownerTaskBinding(value: unknown, field: string, sourceRef: string) {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) invalid('Standard Agent typed view owner task binding must be an object.', sourceRef, { field });
  assertKnownKeys(value, ['task_id_pointer', 'task_ref_pointer', 'task_ref_template'], field, sourceRef);
  return {
    task_id_pointer: jsonPointer(value.task_id_pointer, `${field}.task_id_pointer`, sourceRef),
    task_ref_pointer: jsonPointer(value.task_ref_pointer, `${field}.task_ref_pointer`, sourceRef),
    task_ref_template: stringValue(value.task_ref_template, `${field}.task_ref_template`, sourceRef),
  };
}

export function taskProvider(value: unknown, sourceRef: string): StandardAgentTaskProvider | null {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) invalid('Standard Agent task_provider must be an object.', sourceRef, { field: 'task_provider' });
  assertKnownKeys(
    value,
    ['inventory_ref', 'business_lifecycle_owner', 'temporal_execution_ref', 'views'],
    'task_provider',
    sourceRef,
  );
  const temporal = value.temporal_execution_ref;
  if (temporal !== undefined && temporal !== null && !isRecord(temporal)) {
    invalid('Standard Agent task_provider temporal_execution_ref must be an object.', sourceRef);
  }
  if (isRecord(temporal)) {
    assertKnownKeys(temporal, ['source_kind', 'join_field'], 'task_provider.temporal_execution_ref', sourceRef);
    if (temporal.join_field !== 'work_item_scope_id') {
      invalid('Standard Agent task_provider Temporal join must remain opaque work_item_scope_id.', sourceRef, {
        join_field: temporal.join_field ?? null,
      });
    }
  }
  return {
    inventory_ref: value.inventory_ref === undefined || value.inventory_ref === null
      ? null
      : stringValue(value.inventory_ref, 'task_provider.inventory_ref', sourceRef),
    business_lifecycle_owner: value.business_lifecycle_owner === undefined || value.business_lifecycle_owner === null
      ? null
      : stringValue(value.business_lifecycle_owner, 'task_provider.business_lifecycle_owner', sourceRef),
    temporal_execution_ref: isRecord(temporal)
      ? {
          source_kind: stringValue(temporal.source_kind, 'task_provider.temporal_execution_ref.source_kind', sourceRef),
          join_field: 'work_item_scope_id',
        }
      : null,
    views: domainDetailViews(value.views, `${sourceRef}#/task_provider`),
  };
}

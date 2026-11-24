import path from 'node:path';
import { isRecord } from '../contract-validation.ts';
import type { StandardAgentInventoryProjection, StandardAgentStageCatalogDeclaration } from '../standard-agent-interface-types.ts';
import { invalid, stringValue, assertKnownKeys } from './validation-values.ts';

const INVENTORY_FIELD_KEYS = [
  'work_item_id',
  'work_item_root',
  'business_status',
  'current_stage_id',
  'current_stage_status',
  'package_status',
  'lifecycle_ref',
] as const;

const OPTIONAL_INVENTORY_FIELD_KEYS = ['display_name', 'next_action', 'stage_index_ref'] as const;

const STAGE_CATALOG_FIELD_KEYS = ['stage_id', 'display_name', 'display_names'] as const;

export function parseStandardAgentInventoryProjection(
  value: unknown,
  sourceRef: string,
): StandardAgentInventoryProjection | null {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) {
    invalid('Standard Agent interface field inventory_projection must be an object.', sourceRef, {
      field: 'inventory_projection',
    });
  }
  assertKnownKeys(
    value,
    ['source_kind', 'relative_path', 'items_pointer', 'work_item_root_template', 'field_map'],
    'inventory_projection',
    sourceRef,
  );
  if (value.source_kind !== 'workspace_relative_json') {
    invalid('Standard Agent interface inventory_projection source_kind is unsupported.', sourceRef, {
      field: 'inventory_projection.source_kind',
      actual: value.source_kind ?? null,
    });
  }
  const relativePath = stringValue(
    value.relative_path,
    'inventory_projection.relative_path',
    sourceRef,
  );
  if (path.isAbsolute(relativePath) || relativePath.split(/[\\/]+/).includes('..')) {
    invalid('Standard Agent interface inventory_projection relative_path must stay inside the workspace.', sourceRef, {
      field: 'inventory_projection.relative_path',
      relative_path: relativePath,
    });
  }
  const itemsPointer = stringValue(
    value.items_pointer,
    'inventory_projection.items_pointer',
    sourceRef,
  );
  if (!itemsPointer.startsWith('/')) {
    invalid('Standard Agent interface inventory_projection items_pointer must be an absolute JSON Pointer.', sourceRef, {
      field: 'inventory_projection.items_pointer',
      items_pointer: itemsPointer,
    });
  }
  const workItemRootTemplate = value.work_item_root_template === undefined
    ? null
    : stringValue(
        value.work_item_root_template,
        'inventory_projection.work_item_root_template',
        sourceRef,
      );
  if (
    workItemRootTemplate
    && (
      path.isAbsolute(workItemRootTemplate)
      || workItemRootTemplate.split(/[\\/]+/).includes('..')
    )
  ) {
    invalid('Standard Agent interface work-item root template must stay inside the workspace.', sourceRef, {
      field: 'inventory_projection.work_item_root_template',
      work_item_root_template: workItemRootTemplate,
    });
  }
  const fieldMap = value.field_map;
  if (!isRecord(fieldMap)) {
    invalid('Standard Agent interface inventory_projection field_map must be an object.', sourceRef, {
      field: 'inventory_projection.field_map',
    });
  }
  assertKnownKeys(
    fieldMap,
    [...INVENTORY_FIELD_KEYS, ...OPTIONAL_INVENTORY_FIELD_KEYS],
    'inventory_projection.field_map',
    sourceRef,
  );
  const missing = INVENTORY_FIELD_KEYS.filter((field) => !(field in fieldMap));
  if (missing.length > 0) {
    invalid('Standard Agent interface inventory_projection field_map is incomplete.', sourceRef, {
      field: 'inventory_projection.field_map',
      missing,
    });
  }
  return {
    source_kind: 'workspace_relative_json',
    relative_path: relativePath,
    items_pointer: itemsPointer,
    ...(workItemRootTemplate ? { work_item_root_template: workItemRootTemplate } : {}),
    field_map: {
      ...Object.fromEntries(INVENTORY_FIELD_KEYS.map((field) => [
        field,
        stringValue(fieldMap[field], `inventory_projection.field_map.${field}`, sourceRef),
      ])),
      ...Object.fromEntries(OPTIONAL_INVENTORY_FIELD_KEYS.flatMap((field) =>
        fieldMap[field] === undefined
          ? []
          : [[field, stringValue(
              fieldMap[field],
              `inventory_projection.field_map.${field}`,
              sourceRef,
            )]],
      )),
    } as StandardAgentInventoryProjection['field_map'],
  };
}

export function stageCatalog(value: unknown, sourceRef: string): StandardAgentStageCatalogDeclaration | null {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) {
    invalid('Standard Agent interface field stage_catalog must be an object.', sourceRef, {
      field: 'stage_catalog',
    });
  }
  assertKnownKeys(
    value,
    ['source_kind', 'relative_path', 'items_pointer', 'field_map'],
    'stage_catalog',
    sourceRef,
  );
  if (value.source_kind !== 'agent_repo_relative_json') {
    invalid('Standard Agent interface stage_catalog source_kind is unsupported.', sourceRef, {
      field: 'stage_catalog.source_kind',
      actual: value.source_kind ?? null,
    });
  }
  const relativePath = stringValue(value.relative_path, 'stage_catalog.relative_path', sourceRef);
  if (path.isAbsolute(relativePath) || relativePath.split(/[\\/]+/).includes('..')) {
    invalid('Standard Agent interface stage_catalog relative_path must stay inside the Agent repo.', sourceRef, {
      field: 'stage_catalog.relative_path',
      relative_path: relativePath,
    });
  }
  const itemsPointer = stringValue(value.items_pointer, 'stage_catalog.items_pointer', sourceRef);
  if (!itemsPointer.startsWith('/')) {
    invalid('Standard Agent interface stage_catalog items_pointer must be an absolute JSON Pointer.', sourceRef, {
      field: 'stage_catalog.items_pointer',
      items_pointer: itemsPointer,
    });
  }
  const fieldMap = value.field_map;
  if (!isRecord(fieldMap)) {
    invalid('Standard Agent interface stage_catalog field_map must be an object.', sourceRef, {
      field: 'stage_catalog.field_map',
    });
  }
  assertKnownKeys(fieldMap, STAGE_CATALOG_FIELD_KEYS, 'stage_catalog.field_map', sourceRef);
  const missing = STAGE_CATALOG_FIELD_KEYS.filter((field) => !(field in fieldMap));
  if (missing.length > 0) {
    invalid('Standard Agent interface stage_catalog field_map is incomplete.', sourceRef, {
      field: 'stage_catalog.field_map',
      missing,
    });
  }
  return {
    source_kind: 'agent_repo_relative_json',
    relative_path: relativePath,
    items_pointer: itemsPointer,
    field_map: Object.fromEntries(STAGE_CATALOG_FIELD_KEYS.map((field) => [
      field,
      stringValue(fieldMap[field], `stage_catalog.field_map.${field}`, sourceRef),
    ])) as StandardAgentStageCatalogDeclaration['field_map'],
  };
}

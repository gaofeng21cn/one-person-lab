import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { canonicalJsonText } from '../../kernel/canonical-json.ts';
import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import type { StandardAgentInventoryProjection } from '../../kernel/standard-agent-interface.ts';

function fail(message: string, details: Record<string, unknown>): never {
  throw new FrameworkContractError('contract_shape_invalid', message, details);
}

function descendant(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function strictDescendant(root: string, candidate: string) {
  return root !== candidate && descendant(root, candidate);
}

function rootsOverlap(left: string, right: string) {
  return descendant(left, right) || descendant(right, left);
}

function requirePhysicalDirectoryChain(root: string, candidate: string, domainWorkItemId: string) {
  const relative = path.relative(root, candidate);
  const components = relative.split(path.sep).filter(Boolean);
  for (let index = 0; index < components.length; index += 1) {
    const current = path.join(root, ...components.slice(0, index + 1));
    const observed = fs.lstatSync(current);
    if (!observed.isDirectory() || observed.isSymbolicLink()) {
      fail('Domain work-item inventory root must use a physical directory chain.', {
        failure_code: 'work_item_inventory_root_symlink',
        domain_work_item_id: domainWorkItemId,
        offending_path: current,
      });
    }
  }
}

function jsonPointer(value: unknown, pointer: string) {
  let current = value;
  for (const rawSegment of pointer.replace(/^\//u, '').split('/').filter(Boolean)) {
    const segment = rawSegment.replace(/~1/gu, '/').replace(/~0/gu, '~');
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return undefined;
      current = current[index];
    } else if (isRecord(current) && Object.prototype.hasOwnProperty.call(current, segment)) {
      current = current[segment];
    } else {
      return undefined;
    }
  }
  return current;
}

function requiredItemString(item: Record<string, unknown>, field: string, role: string) {
  const value = item[field];
  if (typeof value !== 'string' || !value.trim()) {
    fail('Domain work-item inventory row is missing a required identity field.', {
      failure_code: 'work_item_inventory_field_missing',
      inventory_field_role: role,
      inventory_field: field,
    });
  }
  return value.trim();
}

function requiredRootTemplate(declaration: StandardAgentInventoryProjection) {
  const template = declaration.work_item_root_template?.trim();
  const itemIdField = declaration.field_map.work_item_id;
  const requiredPlaceholder = `{${itemIdField}}`;
  const placeholders = template?.match(/\{[^{}]+\}/gu) ?? [];
  if (
    !template
    || path.isAbsolute(template)
    || template.split(/[\\/]+/u).includes('..')
    || placeholders.length !== 1
    || placeholders[0] !== requiredPlaceholder
  ) {
    fail('Work-item scoped action requires one domain-declared root template bound to its identity field.', {
      failure_code: 'work_item_inventory_root_template_invalid',
      work_item_root_template: template ?? null,
      required_placeholder: requiredPlaceholder,
    });
  }
  return { template, requiredPlaceholder };
}

function safePathIdentity(value: string) {
  return value !== '.'
    && value !== '..'
    && !value.includes('/')
    && !value.includes('\\');
}

export function resolveWorkItemInventoryBinding(input: {
  workspaceRoot: string;
  declaration: StandardAgentInventoryProjection;
  domainWorkItemId: string;
}) {
  const workspaceRoot = fs.realpathSync.native(path.resolve(input.workspaceRoot));
  const inventoryCandidate = path.resolve(workspaceRoot, input.declaration.relative_path);
  if (!descendant(workspaceRoot, inventoryCandidate) || !fs.existsSync(inventoryCandidate)) {
    fail('Work-item scoped action requires its declared domain inventory source.', {
      failure_code: 'work_item_inventory_source_missing',
      workspace_root: workspaceRoot,
      inventory_ref: input.declaration.relative_path,
    });
  }
  const inventoryPath = fs.realpathSync.native(inventoryCandidate);
  if (!descendant(workspaceRoot, inventoryPath)) {
    fail('Domain work-item inventory source escapes the bound workspace.', {
      failure_code: 'work_item_inventory_source_escape',
      workspace_root: workspaceRoot,
      inventory_path: inventoryPath,
    });
  }
  const payload = parseJsonText(fs.readFileSync(inventoryPath, 'utf8'));
  const items = jsonPointer(payload, input.declaration.items_pointer);
  if (!Array.isArray(items)) {
    fail('Domain work-item inventory pointer does not resolve to an array.', {
      failure_code: 'work_item_inventory_pointer_invalid',
      inventory_ref: `${inventoryPath}#${input.declaration.items_pointer}`,
    });
  }
  const itemIdField = input.declaration.field_map.work_item_id;
  const matches = items.filter((item) =>
    isRecord(item)
    && typeof item[itemIdField] === 'string'
    && item[itemIdField].trim() === input.domainWorkItemId,
  );
  if (matches.length !== 1) {
    fail('Domain work-item identity must resolve to exactly one inventory row.', {
      failure_code: matches.length === 0
        ? 'work_item_inventory_row_missing'
        : 'work_item_inventory_row_ambiguous',
      domain_work_item_id: input.domainWorkItemId,
      inventory_ref: `${inventoryPath}#${input.declaration.items_pointer}`,
      match_count: matches.length,
    });
  }
  const item = matches[0]!;
  const declaredId = requiredItemString(item, itemIdField, 'work_item_id');
  if (declaredId !== input.domainWorkItemId) {
    fail('Domain work-item inventory identity conflicts with the action identity.', {
      failure_code: 'work_item_inventory_identity_mismatch',
      expected_domain_work_item_id: input.domainWorkItemId,
      actual_domain_work_item_id: declaredId,
    });
  }
  if (!safePathIdentity(declaredId)) {
    fail('Domain work-item identity must occupy one safe path segment.', {
      failure_code: 'work_item_inventory_identity_path_unsafe',
      domain_work_item_id: declaredId,
    });
  }
  const rootField = input.declaration.field_map.work_item_root;
  const { template, requiredPlaceholder } = requiredRootTemplate(input.declaration);
  const resolvedRows = items.map((rawItem, index) => {
    if (!isRecord(rawItem)) {
      fail('Domain work-item inventory rows must be objects before an action can launch.', {
        failure_code: 'work_item_inventory_row_invalid',
        inventory_ref: `${inventoryPath}#${input.declaration.items_pointer}/${index}`,
      });
    }
    const rowId = requiredItemString(rawItem, itemIdField, 'work_item_id');
    const declaredRoot = requiredItemString(rawItem, rootField, 'work_item_root');
    if (!safePathIdentity(rowId)) {
      fail('Domain work-item identity must occupy one safe path segment.', {
        failure_code: 'work_item_inventory_identity_path_unsafe',
        domain_work_item_id: rowId,
        inventory_row_index: index,
      });
    }
    if (path.isAbsolute(declaredRoot)) {
      fail('Domain work-item inventory root must be workspace-relative.', {
        failure_code: 'work_item_inventory_root_invalid',
        domain_work_item_id: rowId,
        declared_work_item_root: declaredRoot,
      });
    }
    const workItemCandidate = path.resolve(workspaceRoot, declaredRoot);
    if (!strictDescendant(workspaceRoot, workItemCandidate) || !fs.existsSync(workItemCandidate)) {
      fail('Domain work-item inventory root is missing or escapes the bound workspace.', {
        failure_code: 'work_item_inventory_root_invalid',
        domain_work_item_id: rowId,
        declared_work_item_root: declaredRoot,
        workspace_root: workspaceRoot,
      });
    }
    requirePhysicalDirectoryChain(workspaceRoot, workItemCandidate, rowId);
    const canonicalWorkItemRoot = fs.realpathSync.native(workItemCandidate);
    if (!strictDescendant(workspaceRoot, canonicalWorkItemRoot) || !fs.statSync(canonicalWorkItemRoot).isDirectory()) {
      fail('Domain work-item inventory root must resolve to a directory inside the bound workspace.', {
        failure_code: 'work_item_inventory_root_escape',
        domain_work_item_id: rowId,
        canonical_work_item_root: canonicalWorkItemRoot,
        workspace_root: workspaceRoot,
      });
    }
    return {
      index,
      item: rawItem,
      domainWorkItemId: rowId,
      declaredRoot,
      canonicalWorkItemRoot,
    };
  });
  for (let leftIndex = 0; leftIndex < resolvedRows.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < resolvedRows.length; rightIndex += 1) {
      const left = resolvedRows[leftIndex]!;
      const right = resolvedRows[rightIndex]!;
      if (!rootsOverlap(left.canonicalWorkItemRoot, right.canonicalWorkItemRoot)) continue;
      fail('Domain work-item inventory roots must not overlap physically.', {
        failure_code: 'work_item_inventory_canonical_root_overlap',
        first_domain_work_item_id: left.domainWorkItemId,
        first_canonical_work_item_root: left.canonicalWorkItemRoot,
        first_inventory_row_index: left.index,
        second_domain_work_item_id: right.domainWorkItemId,
        second_canonical_work_item_root: right.canonicalWorkItemRoot,
        second_inventory_row_index: right.index,
      });
    }
  }
  for (const row of resolvedRows) {
    const expectedRoot = path.normalize(template.replace(requiredPlaceholder, row.domainWorkItemId));
    if (path.normalize(row.declaredRoot) !== expectedRoot) {
      fail('Domain work-item inventory root does not match its descriptor-declared identity template.', {
        failure_code: 'work_item_inventory_root_template_mismatch',
        domain_work_item_id: row.domainWorkItemId,
        declared_work_item_root: row.declaredRoot,
        expected_work_item_root: expectedRoot,
        work_item_root_template: template,
      });
    }
  }
  const selected = resolvedRows.find((row) => row.item === item)!;
  const inventoryBindingDigest = canonicalJsonText({
    version: 'opl-work-item-inventory-selected-row-binding.v1',
    inventory_source: input.declaration.relative_path,
    items_pointer: input.declaration.items_pointer,
    work_item_root_template: template,
    identity_field: itemIdField,
    root_field: rootField,
    selected_row: selected.item,
  });
  return {
    canonical_work_item_root: selected.canonicalWorkItemRoot,
    inventory_digest: `sha256:${createHash('sha256').update(inventoryBindingDigest).digest('hex')}`,
    inventory_ref: `${inventoryPath}#${input.declaration.items_pointer}/${selected.index}`,
  } as const;
}

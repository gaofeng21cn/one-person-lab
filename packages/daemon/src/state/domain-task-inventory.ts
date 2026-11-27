import fs from 'node:fs';
import path from 'node:path';
import { isRecord } from '@opl/core';
import { isSafeRelativePosixPath, isWithinDirectory, resolveSafePackagePath } from '@opl/pack';
import type { ProjectedPackageSummary } from './app-state-cache.ts';

type InventoryPackage = Pick<ProjectedPackageSummary, 'package_id' | 'intent' | 'enabled' | 'install_path'>;
type BusinessState = 'active' | 'delivered_paused' | 'paused' | 'stopped' | 'archived' | 'unknown';

export interface DomainInventoryTask {
  workspace_id: string;
  workspace_path: string;
  package_id: string;
  domain_id: string;
  work_item_id: string;
  title: string;
  business_status: string | null;
  business_state: BusinessState;
  current_stage_id: string | null;
  work_item_root: string | null;
  observed_at: string;
}

type Diagnostic = { package_id: string; workspace_id: string; reason: string };
export interface DomainTaskInventory {
  items: DomainInventoryTask[];
  diagnostics: Diagnostic[];
}

// Domain inventory producers use these established lifecycle values. Unrecognized
// values stay visible as the owner's raw status; stage execution cannot supply it.
const statusGroups: Partial<Record<BusinessState, readonly string[]>> = {
  active: ['active', 'in_progress', 'ready', 'registered', 'running'],
  delivered_paused: ['delivered', 'delivered_paused', 'submission_ready', 'publication_ready', 'completed', 'succeeded'],
  paused: ['paused', 'parked', 'frozen', 'on_hold'],
  stopped: ['stopped', 'abandoned', 'cancelled', 'rejected', 'terminated'],
  archived: ['archived'],
};
const businessStates = new Map(Object.entries(statusGroups).flatMap(
  ([state, aliases]) => aliases.map((alias) => [alias, state as BusinessState] as const),
));

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function declaration(value: unknown, packageId: string) {
  if (!isRecord(value) || value.surface_kind !== 'domain_agent_descriptor'
      || (value.package_id !== undefined && value.package_id !== packageId)
      || (value.agent_id !== undefined && value.agent_id !== packageId)) return null;
  const iface = value.standard_agent_interface;
  if (!isRecord(iface) || iface.version !== 'opl_standard_agent_interface.v1') return null;
  const inventory = iface.inventory_projection;
  if (!isRecord(inventory) || inventory.source_kind !== 'workspace_relative_json') return null;
  const inventoryPath = stringValue(inventory.relative_path);
  const pointer = stringValue(inventory.items_pointer);
  const fields = inventory.field_map;
  const domain = stringValue(value.domain_id);
  if (!domain || !inventoryPath || !isSafeRelativePosixPath(inventoryPath) || !pointer?.startsWith('/')
      || !isRecord(fields) || !stringValue(fields.work_item_id)) return null;
  const runtime = iface.runtime;
  const runtimeDomain = isRecord(runtime) ? stringValue(runtime.runtime_domain_id) : null;
  return { packageId, domain, runtimeDomain, inventoryPath, pointer, fields };
}

function pointerItems(value: unknown, pointer: string): unknown[] | null {
  let node = value;
  for (const segment of pointer.slice(1).split('/')) {
    if (!isRecord(node) && !Array.isArray(node)) return null;
    const key = segment.replace(/~1/g, '/').replace(/~0/g, '~');
    if (!Object.hasOwn(node, key)) return null;
    node = (node as Record<string, unknown>)[key];
  }
  return Array.isArray(node) ? node : null;
}

interface JsonFile {
  stamp: string;
  observedAt: string;
  value: unknown;
}

function readJson(cache: Map<string, JsonFile>, root: string, relative: string): JsonFile | null {
  const key = path.join(root, relative);
  try {
    // This confines both the standard descriptor and the declared workspace
    // index to their respective real roots, also for linked installations.
    const real = resolveSafePackagePath(root, relative, { allowSymlinks: true });
    const stat = fs.statSync(real, { bigint: true });
    if (!stat.isFile()) return null;
    const stamp = [real, stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(':');
    const cached = cache.get(key);
    if (cached?.stamp === stamp) return cached;
    let value: unknown = null;
    try { value = JSON.parse(fs.readFileSync(real, 'utf8')); } catch { /* stale or malformed owner file */ }
    const file = { stamp, value, observedAt: stat.mtime.toISOString() };
    cache.set(key, file);
    return file;
  } catch {
    return null;
  }
}

function itemRoot(workspace: string, relative: string | null): string | null {
  if (!relative || !isSafeRelativePosixPath(relative)) return null;
  try {
    const resolved = fs.realpathSync(path.join(workspace, relative));
    return isWithinDirectory(fs.realpathSync(workspace), resolved) ? resolved : null;
  } catch {
    return null;
  }
}

export function createDomainTaskInventoryReader() {
  let files = new Map<string, JsonFile>();
  let lastSignature = '[]';
  let lastInventory: DomainTaskInventory = { items: [], diagnostics: [] };
  return {
    read(packages: readonly InventoryPackage[], workspaces: readonly Record<string, unknown>[]): DomainTaskInventory {
      const bound = workspaces.filter((ws) => stringValue(ws.workspace_id) && stringValue(ws.domain_id) && stringValue(ws.root_path));
      const usedFiles = new Map<string, JsonFile>();
      function source(root: string, relative: string) {
        const file = readJson(files, root, relative);
        if (file) usedFiles.set(path.join(root, relative), file);
        return file;
      }

      const declarations = bound.length ? packages.flatMap((pkg) => {
        if (!pkg.enabled || pkg.intent !== 'agent') return [];
        const file = source(pkg.install_path, 'contracts/domain_descriptor.json');
        const manifest = declaration(file?.value, pkg.package_id);
        return file && manifest ? [{ ...manifest, stamp: file.stamp }] : [];
      }) : [];
      const bindings = bound.flatMap((ws) => {
        // Domain ids are owner declarations. Never guess a workspace's domain
        // from its files or pick an arbitrary package when declarations overlap.
        const exact = declarations.find((entry) => entry.packageId === ws.domain_id);
        const matches = declarations.filter((entry) => entry.domain === ws.domain_id || entry.runtimeDomain === ws.domain_id);
        const owner = exact ?? (matches.length === 1 ? matches[0] : undefined);
        if (!owner) return [];
        const workspaceId = String(ws.workspace_id);
        const workspacePath = String(ws.root_path);
        return [{ owner, workspaceId, workspacePath, file: source(workspacePath, owner.inventoryPath) }];
      });
      files = usedFiles;
      const signature = JSON.stringify(bindings.map(({ owner, workspaceId, workspacePath, file }) =>
        [owner.packageId, owner.stamp, workspaceId, workspacePath, file?.stamp]));
      if (signature === lastSignature) return lastInventory;

      const items: DomainInventoryTask[] = [];
      const diagnostics: Diagnostic[] = [];
      for (const { owner, workspaceId, workspacePath, file } of bindings) {
        const rows = pointerItems(file?.value, owner.pointer);
        if (!rows || !file) {
          diagnostics.push({ package_id: owner.packageId, workspace_id: workspaceId, reason: file ? 'inventory_items_invalid' : 'inventory_source_unavailable' });
          continue;
        }
        const seen = new Set<string>();
        for (const row of rows) {
          if (!isRecord(row)) continue;
          const field = (name: string) => {
            const key = owner.fields[name];
            return typeof key === 'string' && Object.hasOwn(row, key) ? stringValue(row[key]) : null;
          };
          const id = field('work_item_id');
          if (!id || seen.has(id)) continue;
          seen.add(id);
          const status = field('business_status');
          items.push({
            workspace_id: workspaceId, workspace_path: workspacePath,
            package_id: owner.packageId, domain_id: owner.domain, work_item_id: id,
            title: field('display_name') ?? id,
            business_status: status,
            business_state: businessStates.get(status?.toLowerCase().replace(/[\s-]+/g, '_') ?? '') ?? 'unknown',
            current_stage_id: field('current_stage_id'),
            work_item_root: itemRoot(workspacePath, field('work_item_root')),
            observed_at: file.observedAt,
          });
        }
      }
      lastSignature = signature;
      lastInventory = { items, diagnostics };
      return lastInventory;
    },
  };
}

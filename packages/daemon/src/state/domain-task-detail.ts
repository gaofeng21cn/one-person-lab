import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { isRecord } from '@opl/core';
import { PackError, isSafeRelativePosixPath, resolveSafePackagePath } from '@opl/pack';

const maxViewBytes = 8 * 1024 * 1024;

function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function pointer(value: unknown, expression: string): unknown {
  for (const part of expression.slice(1).split('/')) {
    const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
    if ((!isRecord(value) && !Array.isArray(value)) || !Object.hasOwn(value, key)) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

export function declaredDomainTaskViews(descriptor: unknown, packageId: string) {
  if (!isRecord(descriptor) || descriptor.surface_kind !== 'domain_agent_descriptor'
      || (descriptor.package_id !== undefined && descriptor.package_id !== packageId)
      || (descriptor.agent_id !== undefined && descriptor.agent_id !== packageId)) return [];
  const iface = descriptor.standard_agent_interface;
  if (!isRecord(iface) || iface.version !== 'opl_standard_agent_interface.v1') return [];
  const providerViews = isRecord(descriptor.task_provider) ? descriptor.task_provider.views : null;
  const raw = Array.isArray(providerViews) && providerViews.length ? providerViews : iface.domain_detail_views;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry: unknown) => {
    if (!isRecord(entry) || entry.source_kind !== 'work_item_relative_json'
        || !text(entry.view_id) || !text(entry.view_kind) || (!text(entry.schema_version) && !text(entry.schema_ref))
        || !text(entry.relative_path) || !isSafeRelativePosixPath(entry.relative_path)) return [];
    const revisionPointer = entry.revision_pointer ?? '/revision';
    if (!text(revisionPointer) || !revisionPointer.startsWith('/')) return [];
    const owner = entry.owner_task_binding;
    let binding: { id: string; ref: string; template: string } | null = null;
    if (owner != null) {
      if (!isRecord(owner) || !text(owner.task_id_pointer) || !owner.task_id_pointer.startsWith('/')
          || !text(owner.task_ref_pointer) || !owner.task_ref_pointer.startsWith('/')
          || !text(owner.task_ref_template) || !owner.task_ref_template.includes('{task_id}')) return [];
      binding = { id: owner.task_id_pointer, ref: owner.task_ref_pointer, template: owner.task_ref_template };
    }
    return [{
      locator: {
        view_id: entry.view_id, view_kind: entry.view_kind,
        ...(text(entry.title) && { title: entry.title }),
        ...(text(entry.schema_version) && { schema_version: entry.schema_version }),
        ...(text(entry.schema_ref) && { schema_ref: entry.schema_ref }),
      },
      relativePath: entry.relative_path, revisionPointer, binding,
    }];
  });
}

type TaskView = ReturnType<typeof declaredDomainTaskViews>[number];
export type DomainViewLocator = TaskView['locator'] & { availability: 'unread' | 'missing' };
type Availability = 'available' | 'missing' | 'invalid' | 'stale' | 'read_error';

function boundedRead(file: string) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const before = fs.fstatSync(fd, { bigint: true });
    if (!before.isFile() || before.size > maxViewBytes) return null;
    const bytes = Buffer.alloc(Number(before.size));
    let count = 0;
    while (count < bytes.length) {
      const received = fs.readSync(fd, bytes, count, bytes.length - count, count);
      if (!received) break;
      count += received;
    }
    const after = fs.fstatSync(fd, { bigint: true });
    if (count !== bytes.length || before.size !== after.size || before.ctimeNs !== after.ctimeNs) return null;
    return bytes;
  } finally {
    fs.closeSync(fd);
  }
}

type InstalledAgent = { package_id: string; enabled: boolean; install_path: string };
type WorkItem = { item_id: string; identity: {
  agent_id: string; workspace_path: string; work_item_root?: string | null; work_item_id: string;
} };

export function readDomainTaskDetail(pkg: InstalledAgent | null | undefined, item: WorkItem, viewId: string, ifRevision?: number) {
  let view: TaskView | undefined;
  let revision = 0;
  let digest: string | undefined;
  function result(availability: Availability, reason: string, payload?: Record<string, unknown>) {
    const notModified = availability === 'available' && revision === ifRevision;
    return {
      schema_version: 'opl_domain_detail_view.v1', surface_kind: 'opl_domain_detail_view',
      item_id: item.item_id, view_id: viewId, view_kind: view?.locator.view_kind ?? 'unknown',
      availability, revision, generation: revision, not_modified: notModified,
      ...(digest && { digest }),
      ...(view?.locator.schema_ref && { payload_schema_ref: view.locator.schema_ref }),
      ...(view?.locator.schema_version && { payload_schema: view.locator.schema_version }),
      payload: notModified ? null : payload ?? null,
      conditions: [{ type: 'DomainDetailViewAvailable', status: availability === 'available' ? 'True' : availability === 'missing' ? 'Unknown' : 'False', reason, message: reason }],
    };
  }
  if (!pkg?.enabled || pkg.package_id !== item.identity.agent_id) return result('missing', 'domain_detail_owner_unavailable');
  try {
    const descriptorFile = resolveSafePackagePath(pkg.install_path, 'contracts/domain_descriptor.json', { allowSymlinks: true });
    const descriptor = JSON.parse(fs.readFileSync(descriptorFile, 'utf8'));
    const matches = declaredDomainTaskViews(descriptor, pkg.package_id).filter((entry) => entry.locator.view_id === viewId);
    if (matches.length !== 1) return result('missing', 'domain_detail_view_not_declared');
    view = matches[0];
    const { workspace_path: workspace, work_item_root: itemRoot, work_item_id: workId } = item.identity;
    if (!itemRoot) return result('missing', 'domain_detail_work_item_root_missing');
    const relativeRoot = path.relative(workspace, itemRoot);
    const root = resolveSafePackagePath(workspace, relativeRoot.split(path.sep).join('/'));
    const file = resolveSafePackagePath(root, view.relativePath);
    const bytes = boundedRead(file);
    if (!bytes) return result('invalid', 'domain_detail_source_invalid_or_changed');
    const value: unknown = JSON.parse(bytes.toString('utf8'));
    if (!isRecord(value)) return result('invalid', 'domain_detail_source_root_invalid');
    const version = pointer(value, view.revisionPointer);
    if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 0) return result('invalid', 'domain_detail_source_revision_invalid');
    revision = version;
    digest = 'sha256:' + createHash('sha256').update(bytes).digest('hex');
    if (view.binding && (pointer(value, view.binding.id) !== workId
        || pointer(value, view.binding.ref) !== view.binding.template.replaceAll('{task_id}', workId))) {
      return result('stale', 'domain_detail_item_identity_mismatch');
    }
    if (ifRevision !== undefined && ifRevision > revision) return result('stale', 'domain_detail_revision_regressed');
    return result('available', 'domain_detail_source_available', value);
  } catch (err) {
    if (err instanceof SyntaxError) return result('invalid', 'domain_detail_source_json_invalid');
    if (err instanceof PackError && err.code !== 'PACK_MISSING_PATH') return result('invalid', 'domain_detail_declared_path_invalid');
    const code = (err as NodeJS.ErrnoException)?.code;
    if (['PACK_MISSING_PATH', 'ENOENT', 'ENOTDIR'].includes(code ?? '')) return result('missing', 'domain_detail_source_missing');
    return result('read_error', 'domain_detail_source_read_failed');
  }
}

import { isDeepStrictEqual } from 'node:util';
import { assertTrustedHost, type ClientContext } from '@opl/core';
import { verifyExactPackageRelease } from '../build/build-package.ts';
import { shouldSyncToCodex } from '../carriers/codex-sync/project.ts';
import { PackError } from '../errors.ts';
import { ExactPackageReleaseSchema, KebabIdSchema, type ExactPackageRelease, type OplPackageManifestV2 } from '../manifest/schema.ts';
import type { InstallSourceSpec, InstalledPackageRecord } from '../types.ts';
import { assertRequiredPackageDependency } from './dependency.ts';
import type { PackService } from './service.ts';

export interface ResolvedPackageForInstall {
  readonly manifest: OplPackageManifestV2;
  readonly source: InstallSourceSpec;
  readonly dispose?: () => void;
}

interface EnsurePackageOptions {
  readonly packageId: string;
  readonly exactRelease?: ExactPackageRelease;
  readonly dryRun?: boolean;
  readonly clientContext?: ClientContext;
  readonly resolveSource: (packageId: string) => Promise<ResolvedPackageForInstall>;
  readonly installSource?: PackService['install'];
}

type RequiredPackage = NonNullable<NonNullable<OplPackageManifestV2['dependencies']>['packages']>[number];
type Action = 'none' | 'install' | 'enable' | 'sync';
type PlannedPackage = {
  readonly manifest: OplPackageManifestV2;
  readonly installed: InstalledPackageRecord | null;
  readonly action: Action;
  readonly source?: InstallSourceSpec;
};

function assertSameInstalled(record: InstalledPackageRecord | null, planned: PlannedPackage) {
  const expected = planned.installed;
  if (record?.content_digest !== expected?.content_digest || record?.enabled !== expected?.enabled
    || record?.install_path !== expected?.install_path) {
    throw new PackError('PACK_OPERATION_BUSY', `Package '${planned.manifest.identity.id}' changed during preparation.`);
  }
}

function installedMatchesRelease(record: InstalledPackageRecord | null, release: ExactPackageRelease): boolean {
  if (!record || record.origin !== 'opl' || record.install_mode !== 'release'
      || record.version !== release.version || record.content_digest !== release.digest) return false;
  try {
    verifyExactPackageRelease(record.install_path, record.package_id, release);
    return true;
  } catch (error) {
    if (error instanceof PackError) return false;
    throw error;
  }
}

export async function ensurePackage(pack: PackService, options: EnsurePackageOptions) {
  const { packageId, dryRun = false, clientContext, resolveSource } = options;
  if (!KebabIdSchema.safeParse(packageId).success) throw new PackError('INVALID_INPUT', 'Invalid Package identity.');
  if (clientContext) assertTrustedHost(clientContext, 'pack.ensure');

  if (options.exactRelease !== undefined && !ExactPackageReleaseSchema.safeParse(options.exactRelease).success) {
    throw new PackError('INVALID_INPUT', 'A release requires a version, full git_commit and content digest.');
  }
  const resolvedSources = new Map<string, ResolvedPackageForInstall>();
  const plan = new Map<string, PlannedPackage>();
  const visiting = new Set<string>();
  const requiredBy = new Map<string, { parent: string; requirement: RequiredPackage }[]>();

  async function prepare(id: string, parent?: string, requirement?: RequiredPackage): Promise<void> {
    if (visiting.has(id)) {
      throw new PackError('PACK_DEPENDENCY_MISSING', `Required dependency cycle at '${id}'.`);
    }
    const requirements = requiredBy.get(id) ?? [];
    if (parent && requirement) {
      requirements.push({ parent, requirement });
      requiredBy.set(id, requirements);
    }
    const existing = plan.get(id);
    if (existing && requirement) {
      // A later edge in a diamond can require exports the first edge did not need.
      try {
        assertRequiredPackageDependency(parent!, requirement, existing.manifest);
        return;
      } catch (error) {
        if (existing.source || existing.installed?.origin !== 'opl' || existing.installed.install_mode !== 'release') throw error;
      }
    }
    const installed = existing?.installed ?? pack.inspect(id);
    const release = id === packageId ? options.exactRelease : undefined;
    if (release && installed && (installed.origin !== 'opl' || installed.install_mode !== 'release')) {
      throw new PackError('PACK_LOCK_MISMATCH', `The configured source of '${id}' is not a managed release.`);
    }
    const reusable = !release || installedMatchesRelease(installed, release);
    const presence = installed && reusable ? await pack.readInstalledPackagePresence(id) : undefined;
    let manifest = installed?.manifest;
    let action: Action = 'none';
    let source: InstallSourceSpec | undefined;
    let replace = !presence?.files_present;
    if (manifest) {
      for (const edge of requirements) {
        try { assertRequiredPackageDependency(edge.parent, edge.requirement, manifest); }
        catch (error) {
          if (installed?.origin !== 'opl' || installed.install_mode !== 'release') throw error;
          replace = true;
          break;
        }
      }
    }
    if (replace) {
      if (installed && (installed.origin !== 'opl' || installed.install_mode !== 'release')) {
        throw new PackError('PACK_MISSING_PATH', `The configured source of '${id}' is incomplete.`);
      }
      const resolved = await resolveSource(id);
      resolvedSources.set(id, resolved);
      if (resolved.manifest.identity.id !== id) throw new PackError('INVALID_MANIFEST', `Official source returned another Package for '${id}'.`);
      if (release) {
        if (resolved.source.kind !== 'local_dir' || !resolved.source.path) {
          throw new PackError('PACK_LOCK_MISMATCH', `Expected a staged official release for '${id}'.`);
        }
        verifyExactPackageRelease(resolved.source.path, id, release);
      }
      manifest = resolved.manifest;
      source = { ...resolved.source, package_id: id };
      action = 'install';
    } else if (!installed?.enabled) action = 'enable';
    else if (!presence?.carrier_ready) action = 'sync';
    if (installed?.origin === 'external' && action !== 'none') {
      throw new PackError('PACK_DEPENDENCY_MISSING', `Restore '${id}' through its configured external carrier.`);
    }
    if (!manifest) throw new PackError('PACK_NOT_FOUND', `No manifest for '${id}'.`);
    for (const edge of requirements) assertRequiredPackageDependency(edge.parent, edge.requirement, manifest);
    visiting.add(id);
    for (const dependency of manifest.dependencies?.packages ?? []) {
      if (dependency.optional !== true && dependency.presence !== 'optional') await prepare(dependency.id, id, dependency);
    }
    visiting.delete(id);
    plan.set(id, { manifest, installed, action, source });
  }

  try {
    await prepare(packageId);
    // A provider discovered via several branches may have acquired new dependencies
    // after its original insertion in the map. Order the final selected manifests.
    const ordered: PlannedPackage[] = [];
    const seen = new Set<string>();
    function sort(id: string) {
      if (seen.has(id)) return;
      if (visiting.has(id)) throw new PackError('PACK_DEPENDENCY_MISSING', `Required dependency cycle at '${id}'.`);
      visiting.add(id);
      const step = plan.get(id)!;
      for (const dep of step.manifest.dependencies?.packages ?? []) {
        if (!dep.optional && dep.presence !== 'optional') sort(dep.id);
      }
      visiting.delete(id);
      seen.add(id);
      ordered.push(step);
    }
    sort(packageId);

    const actions = new Map(ordered.map(step => [step.manifest.identity.id, step.action]));
    let release: (() => void) | undefined;
    try {
      if (!dryRun && ordered.some(step => step.action !== 'none')) {
        const resourceIds = [...seen];
        // Codex plugin add/enable shares one configured carrier across packages.
        if (ordered.some(step => step.action !== 'none' && shouldSyncToCodex(step.manifest))) resourceIds.push('@codex');
        release = await acquireWrites(pack, resourceIds);
        for (const step of ordered) {
          const id = step.manifest.identity.id;
          const current = pack.inspect(id);
          const exactRelease = id === packageId ? options.exactRelease : undefined;
          if (current?.enabled && step.action !== 'none' && isDeepStrictEqual(current.manifest, step.manifest)
              && (!exactRelease || installedMatchesRelease(current, exactRelease))) {
            const presence = await pack.readInstalledPackagePresence(id);
            if (presence.files_present && presence.carrier_ready) {
              actions.set(id, 'none');
              continue;
            }
          }
          assertSameInstalled(current, step);
          for (const dep of step.manifest.dependencies?.packages ?? []) {
            const provider = pack.inspect(dep.id);
            assertRequiredPackageDependency(id, dep, provider?.enabled ? provider.manifest : null);
          }
          if (step.action === 'install') {
            const input = { source: step.source!, clientContext, ensure: { exactRelease }, updateSource: { kind: 'official' as const, package_id: id } };
            if (options.installSource) await options.installSource(input);
            else await pack.install(input);
          } else if (step.action === 'enable') {
            await pack.toggle({ packageId: id, enabled: true, clientContext });
          }
          if (step.action !== 'none') {
            let state = await pack.readInstalledPackagePresence(id);
            if (state.files_present && !state.carrier_ready && pack.inspect(id)?.enabled) {
              await pack.codexSync({ packageId: id, requireReadback: true });
              state = await pack.readInstalledPackagePresence(id);
            }
            if (!state.files_present || !state.carrier_ready) {
              throw new PackError('PACK_DEPENDENCY_MISSING', `Package '${id}' is unavailable after ${step.action}.`);
            }
          }
        }
      }
    } finally {
      release?.();
    }
    if (!dryRun && options.exactRelease && !installedMatchesRelease(pack.inspect(packageId), options.exactRelease)) {
      throw new PackError('PACK_LOCK_MISMATCH', `Installed Package '${packageId}' does not match the requested release.`);
    }
    const changes = [...actions.values()].some(action => action !== 'none');
    return {
      package_id: packageId,
      status: !changes ? 'already_present' as const : dryRun ? 'validated' as const
        : plan.get(packageId)?.installed ? 'reconciled' as const : 'installed' as const,
      changed: !dryRun && changes,
      packages: ordered.map(step => ({ package_id: step.manifest.identity.id, action: actions.get(step.manifest.identity.id)! })),
    };
  } finally {
    for (const source of resolvedSources.values()) source.dispose?.();
  }
}

const writes = new WeakMap<PackService, Map<string, Promise<void>>>();

async function acquireWrites(pack: PackService, ids: string[]): Promise<() => void> {
  const slots = writes.get(pack) ?? new Map<string, Promise<void>>();
  writes.set(pack, slots);
  const predecessors = ids.map(id => slots.get(id));
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  for (const id of ids) slots.set(id, promise);
  await Promise.all(predecessors);
  return () => {
    for (const id of ids) if (slots.get(id) === promise) slots.delete(id);
    resolve();
  };
}

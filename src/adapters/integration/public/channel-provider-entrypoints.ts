import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  assertChannelProvider,
  type ChannelProvider,
} from '../../../authority/packages/index.ts';
import type {
  InstalledPackageDescriptor,
} from '../agent-package-registry/installed-codex-plugin-directory.ts';
import { installedDescriptorSupportsFrameworkCalls } from '../agent-package-registry/installed-codex-plugin-directory.ts';
import type {
  ChannelProviderPackageEntrypoint,
} from '../agent-package-registry/channel-provider-entrypoint-contract.ts';

export type InstalledChannelProviderAttachment = Readonly<{
  descriptor: InstalledPackageDescriptor;
  provider: ChannelProvider;
}>;

function channelProviderEntrypoints(
  descriptor: InstalledPackageDescriptor,
): ChannelProviderPackageEntrypoint[] {
  return descriptor.manifest.entrypoints.flatMap((entry) => {
    if (entry.kind !== 'channel_provider') return [];
    if (
      typeof entry.entrypoint_id !== 'string'
      || typeof entry.module_ref !== 'string'
      || typeof entry.export_name !== 'string'
    ) {
      throw new Error(
        `Installed Package ${descriptor.manifest.package_id} has an invalid channel provider entrypoint.`,
      );
    }
    return [entry as ChannelProviderPackageEntrypoint];
  }).sort((left, right) => left.entrypoint_id.localeCompare(right.entrypoint_id));
}

function resolveEntrypointModule(
  descriptor: InstalledPackageDescriptor,
  entrypoint: ChannelProviderPackageEntrypoint,
) {
  if (!descriptor.manifest.content_lock_paths?.includes(entrypoint.module_ref)) {
    throw new Error(
      `Channel provider entrypoint is outside the Package content lock: ${descriptor.manifest.package_id}:${entrypoint.module_ref}`,
    );
  }
  const packageRoot = path.resolve(descriptor.sourcePath);
  const modulePath = path.resolve(packageRoot, entrypoint.module_ref);
  if (modulePath === packageRoot || !modulePath.startsWith(`${packageRoot}${path.sep}`)) {
    throw new Error(
      `Channel provider entrypoint escapes the installed Package: ${descriptor.manifest.package_id}:${entrypoint.module_ref}`,
    );
  }
  try {
    if (!fs.statSync(modulePath).isFile()) throw new Error('not a file');
  } catch {
    throw new Error(
      `Channel provider entrypoint is unavailable: ${descriptor.manifest.package_id}:${entrypoint.module_ref}`,
    );
  }
  return modulePath;
}

function isCallable(descriptor: InstalledPackageDescriptor) {
  return installedDescriptorSupportsFrameworkCalls(descriptor);
}

function createChannelProvider(
  descriptor: InstalledPackageDescriptor,
  entrypoint: ChannelProviderPackageEntrypoint,
  exported: unknown,
): ChannelProvider {
  if (typeof exported !== 'function' || exported.length !== 0) {
    throw new TypeError(
      `Channel provider entrypoint must export a zero-argument factory: ${descriptor.manifest.package_id}:${entrypoint.export_name}`,
    );
  }
  const candidate = Reflect.apply(exported, undefined, []);
  if (
    candidate !== null
    && (typeof candidate === 'object' || typeof candidate === 'function')
    && typeof (candidate as { then?: unknown }).then === 'function'
  ) {
    void Promise.resolve(candidate).catch(() => undefined);
    throw new TypeError(
      `Channel provider factory must return synchronously: ${descriptor.manifest.package_id}:${entrypoint.export_name}`,
    );
  }
  assertChannelProvider(candidate);
  return candidate;
}

function sameRefs(declared: Set<string>, implemented: readonly string[]) {
  return declared.size === implemented.length
    && implemented.every((ref) => declared.has(ref));
}

function assertChannelAccessController(
  descriptor: InstalledPackageDescriptor,
  provider: ChannelProvider,
) {
  const contributions = descriptor.manifest.app_contributions;
  const views = contributions?.views.filter((entry) => entry.view_type === 'channel_access') ?? [];
  const controller = provider.channel_access;
  if (views.length === 0 && !controller) return;
  if (views.length !== 1 || !contributions || !controller) {
    throw new Error(
      `Channel provider requires exactly one descriptor-bound channel_access controller: ${descriptor.manifest.package_id}`,
    );
  }
  const view = views[0]!;
  const commandIds = new Set(view.command_ids);
  const actionRefs = new Set(contributions.commands
    .filter((entry) => commandIds.has(entry.command_id))
    .map((entry) => entry.action_ref));
  if (
    controller.data_ref !== view.data_ref
    || !sameRefs(actionRefs, controller.action_refs)
  ) {
    throw new Error(
      `Channel provider channel_access refs must exactly match its descriptor: ${descriptor.manifest.package_id}`,
    );
  }
}

export async function loadInstalledChannelProviders(
  descriptors: Iterable<InstalledPackageDescriptor>,
): Promise<readonly InstalledChannelProviderAttachment[]> {
  const attachments: InstalledChannelProviderAttachment[] = [];
  const providerIds = new Set<string>();
  const callableDescriptors = [...descriptors]
    .filter(isCallable)
    .sort((left, right) => left.manifest.package_id.localeCompare(right.manifest.package_id));
  for (const descriptor of callableDescriptors) {
    for (const entrypoint of channelProviderEntrypoints(descriptor)) {
      const modulePath = resolveEntrypointModule(descriptor, entrypoint);
      const module = await import(pathToFileURL(modulePath).href) as Record<string, unknown>;
      const provider = createChannelProvider(
        descriptor,
        entrypoint,
        module[entrypoint.export_name],
      );
      if (provider.provider_id !== descriptor.manifest.package_id) {
        throw new Error(
          `Channel provider identity must match its installed Package: ${descriptor.manifest.package_id}:${provider.provider_id}`,
        );
      }
      if (providerIds.has(provider.provider_id)) {
        throw new Error(`Channel provider identity is duplicated: ${provider.provider_id}`);
      }
      assertChannelAccessController(descriptor, provider);
      providerIds.add(provider.provider_id);
      attachments.push(Object.freeze({ descriptor, provider }));
    }
  }
  return Object.freeze(attachments);
}

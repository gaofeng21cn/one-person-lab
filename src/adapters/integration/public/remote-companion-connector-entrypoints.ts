import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  assertRemoteCompanionActivationContext,
  assertRemoteCompanionConnector,
  type RemoteCompanionActivationContext,
  type RemoteCompanionConnector,
} from '../../../authority/packages/index.ts';
import type {
  InstalledPackageDescriptor,
} from '../agent-package-registry-parts/installed-codex-plugin-directory.ts';
import { installedDescriptorSupportsFrameworkCalls } from '../agent-package-registry-parts/installed-codex-plugin-directory.ts';
import type {
  RemoteCompanionConnectorPackageEntrypoint,
} from '../agent-package-registry-parts/channel-provider-entrypoint-contract.ts';

export type InstalledRemoteCompanionConnectorAttachment = Readonly<{
  descriptor: InstalledPackageDescriptor;
  connector: RemoteCompanionConnector;
  activation_context: RemoteCompanionActivationContext;
}>;

export type RemoteCompanionActivationContextResolver =
  | RemoteCompanionActivationContext
  | ((descriptor: InstalledPackageDescriptor) =>
    RemoteCompanionActivationContext | Promise<RemoteCompanionActivationContext>);

export type LoadInstalledRemoteCompanionConnectorOptions = Readonly<{
  activationContext?: RemoteCompanionActivationContextResolver;
}>;

function remoteCompanionEntrypoints(
  descriptor: InstalledPackageDescriptor,
): RemoteCompanionConnectorPackageEntrypoint[] {
  return descriptor.manifest.entrypoints.flatMap((entry) => {
    if (entry.kind !== 'remote_companion_connector') return [];
    if (
      typeof entry.entrypoint_id !== 'string'
      || typeof entry.module_ref !== 'string'
      || typeof entry.export_name !== 'string'
    ) {
      throw new Error(
        `Installed Package ${descriptor.manifest.package_id} has an invalid remote companion connector entrypoint.`,
      );
    }
    return [entry as RemoteCompanionConnectorPackageEntrypoint];
  }).sort((left, right) => left.entrypoint_id.localeCompare(right.entrypoint_id));
}

function resolveEntrypointModule(
  descriptor: InstalledPackageDescriptor,
  entrypoint: RemoteCompanionConnectorPackageEntrypoint,
) {
  if (!descriptor.manifest.content_lock_paths?.includes(entrypoint.module_ref)) {
    throw new Error(
      `Remote companion connector entrypoint is outside the Package content lock: ${descriptor.manifest.package_id}:${entrypoint.module_ref}`,
    );
  }
  const packageRoot = path.resolve(descriptor.sourcePath);
  const modulePath = path.resolve(packageRoot, entrypoint.module_ref);
  if (modulePath === packageRoot || !modulePath.startsWith(`${packageRoot}${path.sep}`)) {
    throw new Error(
      `Remote companion connector entrypoint escapes the installed Package: ${descriptor.manifest.package_id}:${entrypoint.module_ref}`,
    );
  }
  try {
    if (!fs.statSync(modulePath).isFile()) throw new Error('not a file');
  } catch {
    throw new Error(
      `Remote companion connector entrypoint is unavailable: ${descriptor.manifest.package_id}:${entrypoint.module_ref}`,
    );
  }
  return modulePath;
}

function isCallable(descriptor: InstalledPackageDescriptor) {
  return installedDescriptorSupportsFrameworkCalls(descriptor);
}

function createRemoteCompanionConnector(
  descriptor: InstalledPackageDescriptor,
  entrypoint: RemoteCompanionConnectorPackageEntrypoint,
  exported: unknown,
): RemoteCompanionConnector {
  if (typeof exported !== 'function' || exported.length !== 0) {
    throw new TypeError(
      `Remote companion connector entrypoint must export a zero-argument factory: ${descriptor.manifest.package_id}:${entrypoint.export_name}`,
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
      `Remote companion connector factory must return synchronously: ${descriptor.manifest.package_id}:${entrypoint.export_name}`,
    );
  }
  assertRemoteCompanionConnector(candidate);
  return candidate;
}

function sameRefs(declared: Set<string>, implemented: readonly string[]) {
  return declared.size === implemented.length
    && implemented.every((ref) => declared.has(ref));
}

function assertDescriptorBoundRemoteCompanionAccess(
  descriptor: InstalledPackageDescriptor,
  connector: RemoteCompanionConnector,
) {
  const contributions = descriptor.manifest.app_contributions;
  const views = contributions?.views.filter((entry) => entry.view_type === 'remote_companion_access') ?? [];
  const controller = connector.remote_companion_access;
  if (views.length === 0 && !controller) return;
  if (views.length !== 1 || !contributions || !controller) {
    throw new Error(
      `Remote companion connector requires exactly one descriptor-bound remote_companion_access controller: ${descriptor.manifest.package_id}`,
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
      `Remote companion connector remote_companion_access refs must exactly match its descriptor: ${descriptor.manifest.package_id}`,
    );
  }
}

function descriptorArtifactDigest(descriptor: InstalledPackageDescriptor): string | null {
  const manifest = descriptor.manifest as Record<string, unknown>;
  const candidate = manifest.artifact_digest
    ?? manifest.package_artifact_digest
    ?? descriptor.manifest.content_digest
    ?? null;
  return typeof candidate === 'string' && /^sha256:[0-9a-f]{64}$/.test(candidate)
    ? candidate
    : null;
}

function assertActivationContextMatchesDescriptor(
  descriptor: InstalledPackageDescriptor,
  activationContext: RemoteCompanionActivationContext,
) {
  assertRemoteCompanionActivationContext(activationContext);
  if (activationContext.package_id !== descriptor.manifest.package_id) {
    throw new Error(
      `Remote companion activation context package identity does not match its installed Package: ${descriptor.manifest.package_id}:${activationContext.package_id}`,
    );
  }
  const contentDigest = descriptor.manifest.content_digest;
  if (
    typeof contentDigest !== 'string'
    || activationContext.package_content_digest !== contentDigest
  ) {
    throw new Error(
      `Remote companion activation context content digest does not match its installed Package: ${descriptor.manifest.package_id}`,
    );
  }
  const artifactDigest = descriptorArtifactDigest(descriptor);
  if (
    artifactDigest === null
    || activationContext.package_artifact_digest !== artifactDigest
  ) {
    throw new Error(
      `Remote companion activation context artifact digest does not match its installed Package: ${descriptor.manifest.package_id}`,
    );
  }
}

async function resolveActivationContext(
  descriptor: InstalledPackageDescriptor,
  resolver: RemoteCompanionActivationContextResolver | undefined,
) {
  if (!resolver) {
    throw new Error(
      `Remote companion activation context is required before loading: ${descriptor.manifest.package_id}`,
    );
  }
  const context = typeof resolver === 'function'
    ? await resolver(descriptor)
    : resolver;
  assertActivationContextMatchesDescriptor(descriptor, context);
  return context;
}

export async function loadInstalledRemoteCompanionConnectors(
  descriptors: Iterable<InstalledPackageDescriptor>,
  options: LoadInstalledRemoteCompanionConnectorOptions = {},
): Promise<readonly InstalledRemoteCompanionConnectorAttachment[]> {
  const attachments: InstalledRemoteCompanionConnectorAttachment[] = [];
  const packageIds = new Set<string>();
  const callableDescriptors = [...descriptors]
    .filter(isCallable)
    .sort((left, right) => left.manifest.package_id.localeCompare(right.manifest.package_id));
  for (const descriptor of callableDescriptors) {
    for (const entrypoint of remoteCompanionEntrypoints(descriptor)) {
      const modulePath = resolveEntrypointModule(descriptor, entrypoint);
      let module: Record<string, unknown>;
      try {
        module = await import(pathToFileURL(modulePath).href) as Record<string, unknown>;
      } catch (error) {
        // A development-only connector may ship before its optional transport
        // dependency is bundled. Keep the Framework composition usable for
        // other providers and let the App render the connector as unavailable.
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ERR_MODULE_NOT_FOUND') {
          continue;
        }
        throw error;
      }
      const connector = createRemoteCompanionConnector(
        descriptor,
        entrypoint,
        module[entrypoint.export_name],
      );
      if (packageIds.has(descriptor.manifest.package_id)) {
        throw new Error(
          `Remote companion connector identity is duplicated: ${descriptor.manifest.package_id}`,
        );
      }
      assertDescriptorBoundRemoteCompanionAccess(descriptor, connector);
      const activationContext = await resolveActivationContext(
        descriptor,
        options.activationContext,
      );
      packageIds.add(descriptor.manifest.package_id);
      attachments.push(Object.freeze({
        descriptor,
        connector,
        activation_context: activationContext,
      }));
    }
  }
  return Object.freeze(attachments);
}

import fs from 'node:fs';
import path from 'node:path';

import type {
  CordisConnectDescriptorDiscoveryService,
  InstalledPackageDescriptor,
  OplConnectionAuthorizationService,
} from '../adapters/integration/index.ts';
import {
  createDefaultConnectionAuthorizationService,
  discoverInstalledPackageDescriptors,
  installedDescriptorSupportsFrameworkCalls,
} from '../adapters/integration/index.ts';
import { FrameworkContractError } from '../kernel/contract-validation.ts';

type ConsumerPort = ReturnType<OplConnectionAuthorizationService['forPackage']>;

export type OplPackageConnectionPort = Readonly<{
  listConnections(): ReturnType<ConsumerPort['listConnections']>;
  requestAccess(connectionId: string, capabilityIds: readonly string[]): ReturnType<ConsumerPort['requestAccess']>;
  invoke(connectionId: string, capabilityId: string, input: Readonly<Record<string, unknown>>): ReturnType<ConsumerPort['invoke']>;
}>;

export type OplConnectionAuthorizationBinding = Readonly<{
  forPackage(packageId: string): OplPackageConnectionPort;
}>;

export type OplPackageConnectionContext = Readonly<{
  package_id: string;
  connect: OplPackageConnectionPort;
  dispose(): void;
}>;

export type OplConnectionContextHost = Readonly<{
  activate(descriptor: InstalledPackageDescriptor): OplPackageConnectionContext;
}>;

/** Bind a domain service to its own installed carrier at process startup.
 * packageRoot must come from the service module location, never a tool payload.
 * This composes the existing discovery and authorization owners; it does not
 * install a Package or grant access. The returned port rechecks each call.
 */
export function activateInstalledPackageConnectionContext(input: {
  packageRoot: string;
  packageId: string;
}, options: {
  descriptorDiscovery?: Pick<CordisConnectDescriptorDiscoveryService, 'discover'>;
  authorization?: OplConnectionAuthorizationBinding;
} = {}): OplPackageConnectionContext {
  const descriptorDiscovery = options.descriptorDiscovery ?? { discover: discoverInstalledPackageDescriptors };
  const descriptor = assertCallable(descriptorDiscovery.discover({ packageId: input.packageId }).get(input.packageId), input.packageId);
  let sameRoot = false;
  try {
    sameRoot = fs.realpathSync(path.resolve(input.packageRoot)) === fs.realpathSync(descriptor.sourcePath);
  } catch { /* Missing or replaced carrier roots cannot activate a consumer. */ }
  if (!sameRoot) unavailable('activation_source_root_mismatch');
  return createOplConnectionContextHost({
    descriptorDiscovery,
    authorization: options.authorization ?? createDefaultConnectionAuthorizationService({ descriptorDiscovery }),
  }).activate(descriptor);
}

function descriptorIdentity(descriptor: InstalledPackageDescriptor) {
  return [
    descriptor.manifest.package_id,
    descriptor.manifest_sha256,
    descriptor.manifest.content_digest ?? '',
    descriptor.sourcePath,
    descriptor.carrier_readback.identity,
  ].join('\0');
}

function unavailable(reason: string): never {
  throw new FrameworkContractError('contract_shape_invalid', 'Package connection context is unavailable.', {
    reason_code: reason,
    disposition: 'not_dispatched',
  });
}

function assertCallable(descriptor: InstalledPackageDescriptor | undefined, packageId: string) {
  if (!descriptor || descriptor.manifest.package_id !== packageId) {
    unavailable('installed_package_descriptor_missing');
  }
  if (!installedDescriptorSupportsFrameworkCalls(descriptor)) {
    unavailable('installed_package_descriptor_not_callable');
  }
  return descriptor;
}

/**
 * Host-only producer: call activate with the descriptor selected by runtime
 * startup, then inject only context.connect into that runtime. Never expose
 * this factory/activate or choose its descriptor from a page/tool payload.
 * The shared App host uses its own descriptor, not a displayed Package's id.
 */
export function createOplConnectionContextHost(input: {
  descriptorDiscovery: Pick<CordisConnectDescriptorDiscoveryService, 'discover'>;
  authorization: OplConnectionAuthorizationBinding;
}): OplConnectionContextHost {
  return Object.freeze({
    activate(activationDescriptor) {
      const packageId = activationDescriptor.manifest.package_id;
      if (!packageId) unavailable('activation_package_identity_missing');

      const current = assertCallable(
        input.descriptorDiscovery.discover({ packageId }).get(packageId),
        packageId,
      );
      const identity = descriptorIdentity(current);
      if (descriptorIdentity(activationDescriptor) !== identity) {
        unavailable('activation_descriptor_stale');
      }

      const delegated = input.authorization.forPackage(current.manifest.package_id);
      let active = true;
      const assertCurrent = () => {
        if (!active) unavailable('activation_disposed');
        const latest = assertCallable(
          input.descriptorDiscovery.discover({ packageId }).get(packageId),
          packageId,
        );
        if (descriptorIdentity(latest) !== identity) unavailable('activation_descriptor_changed');
      };
      const connect: OplPackageConnectionPort = Object.freeze({
        listConnections() {
          assertCurrent();
          return delegated.listConnections();
        },
        requestAccess(connectionId, capabilityIds) {
          assertCurrent();
          return delegated.requestAccess(connectionId, capabilityIds);
        },
        invoke(connectionId, capabilityId, requestInput) {
          assertCurrent();
          return delegated.invoke(connectionId, capabilityId, requestInput);
        },
      });

      return Object.freeze({
        package_id: current.manifest.package_id,
        connect,
        dispose() {
          active = false;
        },
      });
    },
  });
}

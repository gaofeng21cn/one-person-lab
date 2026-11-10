import { discoverInstalledPackageDescriptors } from './agent-package-registry-parts/installed-codex-plugin-directory.ts';
import {
  createOplConnectionAuthorizationService,
} from './connection-authorization.ts';
import type {
  OplConnectionDescriptorDiscovery,
  OplConnectionProvider,
} from './connection-authorization.ts';
import {
  createOplRelayMailboxConnectionProvider,
  importOplRelayMailboxConnection,
  listOplRelayMailboxConnections,
} from './relay-mailbox-provider.ts';
import type { RelayConnectCommandRunner } from './relay-mailbox-provider.ts';
import {
  createOplCloudConnectionProvider,
  importOplCloudConnection,
  listOplCloudProviderConnections,
  type CloudConnectCommandRunner,
} from './cloud-connect-provider.ts';

export type DefaultConnectionAuthorizationOptions = {
  descriptorDiscovery?: OplConnectionDescriptorDiscovery;
  relayProvider?: OplConnectionProvider;
  relayBinary?: string;
  relayRunner?: RelayConnectCommandRunner;
  cloudProvider?: OplConnectionProvider;
  cloudBinary?: string;
  cloudRunner?: CloudConnectCommandRunner;
};

export function createDefaultConnectionAuthorizationService(
  options: DefaultConnectionAuthorizationOptions = {},
) {
  return createOplConnectionAuthorizationService({
    descriptorDiscovery: options.descriptorDiscovery ?? {
      discover: () => discoverInstalledPackageDescriptors(),
    },
    providers: [options.relayProvider ?? createOplRelayMailboxConnectionProvider({
      binary: options.relayBinary,
      runner: options.relayRunner,
    }), options.cloudProvider ?? createOplCloudConnectionProvider({
      binary: options.cloudBinary,
      runner: options.cloudRunner,
    })],
  });
}

export function listCloudConnections(
  options: Pick<DefaultConnectionAuthorizationOptions, 'cloudBinary' | 'cloudRunner'> = {},
) {
  return listOplCloudProviderConnections({ binary: options.cloudBinary, runner: options.cloudRunner });
}

export function importCloudConnection(
  cloudRef: string,
  options: Pick<DefaultConnectionAuthorizationOptions, 'cloudBinary' | 'cloudRunner'> = {},
) {
  return importOplCloudConnection(cloudRef, { binary: options.cloudBinary, runner: options.cloudRunner });
}

export function listOplConnectionAuthorization(
  options: DefaultConnectionAuthorizationOptions = {},
) {
  return {
    ...createDefaultConnectionAuthorizationService(options).listProjection(),
    ...listOplRelayMailboxConnections({ binary: options.relayBinary, runner: options.relayRunner }),
  };
}

export function importRelayConnection(
  mailboxRef: string,
  options: Pick<DefaultConnectionAuthorizationOptions, 'relayBinary' | 'relayRunner'> = {},
) {
  return importOplRelayMailboxConnection(mailboxRef, {
    binary: options.relayBinary,
    runner: options.relayRunner,
  });
}

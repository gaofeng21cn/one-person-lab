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
} from './relay-mailbox-provider.ts';
import type { RelayConnectCommandRunner } from './relay-mailbox-provider.ts';

export type DefaultConnectionAuthorizationOptions = {
  descriptorDiscovery?: OplConnectionDescriptorDiscovery;
  relayProvider?: OplConnectionProvider;
  relayBinary?: string;
  relayRunner?: RelayConnectCommandRunner;
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
    })],
  });
}

export function listOplConnectionAuthorization() {
  return createDefaultConnectionAuthorizationService().listProjection();
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

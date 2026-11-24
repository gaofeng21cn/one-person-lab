import type { InstalledPackageDescriptor } from '../agent-package-registry/installed-codex-plugin-directory.ts';

export type CordisConnectDescriptorDiscoveryService = {
  discover(input?: {
    packageId?: string | null;
    binary?: string;
    env?: NodeJS.ProcessEnv;
    runner?: (input: {
      binary: string;
      args: string[];
      env: NodeJS.ProcessEnv;
    }) => {
      status: number | null;
      stdout: string;
      stderr: string;
      error: Error | null;
    };
    failClosedOnCarrierError?: boolean;
  }): Map<string, InstalledPackageDescriptor>;
};

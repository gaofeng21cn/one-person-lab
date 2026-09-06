import { Context } from '@deepseek-ai/cordis';

import {
  buildDomainManifestCatalog,
} from '../read-models/catalog/index.ts';
import {
  CORDIS_ATLAS_CATALOG_PLUGIN_DESCRIPTOR,
  CORDIS_ATLAS_CATALOG_SERVICE,
  cordisAtlasCatalogPlugin,
  type CordisAtlasCatalogPluginConfig,
  type CordisAtlasCatalogService,
} from './plugins/cordis-domain-manifest-catalog.ts';
import {
  CORDIS_CHARTER_CONTRACTS_SERVICE,
  CORDIS_CHARTER_POLICY_PLUGIN_DESCRIPTOR,
  cordisCharterPolicyPlugin,
  type CordisCharterPolicyService,
} from './plugins/cordis-charter-policy.ts';
import {
  CORDIS_CHANNEL_PROVIDER_HOST_PLUGIN_DESCRIPTOR,
  CORDIS_CHANNEL_PROVIDER_HOST_SERVICE,
  cordisChannelProviderHostPlugin,
  type CordisChannelProviderHostPluginConfig,
  type CordisChannelProviderHostService,
} from './plugins/cordis-channel-provider-host.ts';
import {
  CORDIS_REMOTE_COMPANION_CONNECTOR_HOST_PLUGIN_DESCRIPTOR,
  CORDIS_REMOTE_COMPANION_CONNECTOR_HOST_SERVICE,
  cordisRemoteCompanionConnectorHostPlugin,
  type CordisRemoteCompanionConnectorHostPluginConfig,
  type CordisRemoteCompanionConnectorHostService,
} from './plugins/cordis-remote-companion-connector-host.ts';
import {
  CORDIS_AUTOMATION_PROVIDER_HOST_PLUGIN_DESCRIPTOR,
  CORDIS_AUTOMATION_PROVIDER_HOST_SERVICE,
  cordisAutomationProviderHostPlugin,
  type CordisAutomationProviderHostPluginConfig,
  type CordisAutomationProviderHostService,
} from './plugins/cordis-automation-provider-host.ts';
import {
  discoverInstalledPackageDescriptors,
  loadInstalledChannelProviders,
  loadInstalledRemoteCompanionConnectors,
  refreshInstalledAgentPackageWorkspaceSkills,
} from '../adapters/integration/index.ts';
import type { WorkspaceSkillProjectionRefresher } from '../authority/workspace/index.ts';
import type {
  InstalledRemoteCompanionConnectorAttachment,
  RemoteCompanionActivationContextResolver,
} from '../adapters/integration/public/remote-companion-connector-entrypoints.ts';
import {
  CORDIS_CONNECT_DESCRIPTOR_DISCOVERY_PLUGIN_DESCRIPTOR,
  CORDIS_CONNECT_DESCRIPTOR_DISCOVERY_SERVICE,
  cordisConnectDescriptorDiscoveryPlugin,
  type CordisConnectDescriptorDiscoveryPluginConfig,
  type CordisConnectDescriptorDiscoveryService,
} from './plugins/cordis-connect-services.ts';
import {
  buildCordisReleaseOperationCompositionSnapshot,
  createCordisReleaseOperationComposition,
  type CordisReleaseOperationPluginConfig,
} from './plugins/cordis-release-operation.ts';
import {
  CORDIS_CONSOLE_READINESS_PLUGIN_DESCRIPTOR,
  CORDIS_CONSOLE_READINESS_SERVICE,
  cordisFrameworkReadinessPlugin,
  type CordisFrameworkReadinessService,
} from './plugins/cordis-framework-readiness.ts';
import {
  CORDIS_FOUNDRY_EVALUATION_ADAPTER_PLUGIN_DESCRIPTOR,
  CORDIS_FOUNDRY_EVALUATION_SERVICE,
  CORDIS_FOUNDRY_PROVIDER_MANIFEST_PLUGIN_DESCRIPTOR,
  CORDIS_FOUNDRY_PROVIDER_MANIFEST_SERVICE,
  cordisFoundryEvaluationAdapterPlugin,
  cordisFoundryProviderManifestPlugin,
  type CordisFoundryEvaluationPluginConfig,
  type CordisFoundryEvaluationService,
  type CordisFoundryProviderManifestService,
} from './plugins/cordis-foundry-adapters.ts';
import {
  CORDIS_OWNER_DELTA_OBSERVER_PLUGIN_DESCRIPTOR,
  CORDIS_OWNER_DELTA_OBSERVER_SERVICE,
  cordisOwnerDeltaObserverPlugin,
  type CordisOwnerDeltaObserverService,
} from './plugins/cordis-owner-delta-observer.ts';
import {
  buildCordisCompositionSnapshot,
  type CordisCompositionSnapshot,
  type CordisPluginDescriptor,
} from '../authority/packages/index.ts';
import {
  CORDIS_PACKAGE_HOST_PLUGIN_DESCRIPTOR,
  CORDIS_PACKAGE_HOST_SERVICE,
  cordisPackageHostPlugin,
  type CordisPackageHostService,
} from './plugins/cordis-package-host-plugin.ts';
import {
  CORDIS_PACK_STAGE_BINDING_SERVICE,
  cordisPackStageBindingPlugin,
  type CordisPackStageBindingService,
} from './plugins/cordis-pack-stage-binding-plugin.ts';
import {
  buildCordisAgentExecutorCompositionSnapshot,
  CORDIS_FRAMEWORK_INTEGRITY,
  CORDIS_FRAMEWORK_PACKAGE,
  CORDIS_FRAMEWORK_VERSION,
  createCordisAgentExecutorRequest,
} from './plugins/cordis-agent-executor-experiment.ts';
import {
  buildCordisRunwayAttemptCompositionSnapshot,
  createCordisRunwayAttemptComposition,
} from './plugins/cordis-runway-attempt.ts';
import type { RuntimeTraySnapshotProvider } from '../adapters/execution/index.ts';
import {
  runFamilyRuntime,
} from '../adapters/execution/index.ts';
import {
  CORDIS_PACK_STAGECRAFT_PLUGIN_DESCRIPTORS,
  buildCordisPackStagecraftCompositionSnapshot,
  createCordisStageRouteComposition,
} from './plugins/cordis-agent-executor-experiment.ts';
import {
  CORDIS_STAGECRAFT_CONTEXT_SERVICE,
  cordisStagecraftContextPlugin,
  type CordisStagecraftContextService,
} from './plugins/cordis-stagecraft-context-plugin.ts';
import {
  CORDIS_WORKSPACE_LOCATOR_PLUGIN_DESCRIPTOR,
  CORDIS_WORKSPACE_LOCATOR_SERVICE,
  cordisWorkspaceLocatorPlugin,
  type CordisWorkspaceLocatorService,
} from './plugins/cordis-workspace-locator.ts';

export const CORDIS_DEFAULT_PROFILE_ID = 'base-headless' as const;
export type CordisCompositionProfileId =
  | typeof CORDIS_DEFAULT_PROFILE_ID
  | 'app-full'
  | 'foundry-dev';

type CordisFiber = Awaited<ReturnType<Context['plugin']>>;
type CordisReleaseOperationFactory = (
  options?: CordisReleaseOperationPluginConfig,
) => ReturnType<typeof createCordisReleaseOperationComposition>;

export type CordisBaseHeadlessServices = {
  charter: CordisCharterPolicyService;
  atlas: CordisAtlasCatalogService;
  workspaceLocator: CordisWorkspaceLocatorService;
  stageBinding: CordisPackStageBindingService;
  stageContext: CordisStagecraftContextService;
  ownerDeltaObserver: CordisOwnerDeltaObserverService;
  descriptorDiscovery: CordisConnectDescriptorDiscoveryService;
  packageHost: CordisPackageHostService;
  familyRuntime: typeof runFamilyRuntime;
  childFactories: {
    createAgentExecutorRequest: typeof createCordisAgentExecutorRequest;
    createRunwayAttemptComposition: typeof createCordisRunwayAttemptComposition;
    createStageRouteComposition: typeof createCordisStageRouteComposition;
    createReleaseOperationComposition: CordisReleaseOperationFactory;
  };
};

type CordisAppFullServices = Omit<CordisBaseHeadlessServices, 'childFactories'> & {
  childFactories: Omit<
    CordisBaseHeadlessServices['childFactories'],
    'createReleaseOperationComposition'
  >;
  frameworkReadiness: CordisFrameworkReadinessService;
  channelProviderHost: CordisChannelProviderHostService | null;
  remoteCompanionHost: CordisRemoteCompanionConnectorHostService | null;
  automationProviderHost: CordisAutomationProviderHostService | null;
};

type CordisFoundryDevServices = Pick<
  CordisBaseHeadlessServices,
  'charter' | 'atlas' | 'stageBinding' | 'stageContext' | 'descriptorDiscovery' | 'packageHost'
> & {
  childFactories: Pick<
    CordisBaseHeadlessServices['childFactories'],
    'createRunwayAttemptComposition'
  >;
  foundryProviderManifest: CordisFoundryProviderManifestService;
  refreshWorkspaceSkills: WorkspaceSkillProjectionRefresher;
  foundryEvaluation: CordisFoundryEvaluationService | null;
};

export type CordisBaseHeadlessComposition = {
  profileId: 'base-headless';
  ctx: Context;
  services: CordisBaseHeadlessServices;
  snapshot: CordisCompositionSnapshot;
  dispose(): Promise<void>;
};

export type CordisAppFullComposition = Omit<
  CordisBaseHeadlessComposition,
  'profileId' | 'services' | 'dispose'
> & {
  profileId: 'app-full';
  services: CordisAppFullServices;
  dispose(): Promise<void>;
};

export type CordisChannelProviderHostBootstrap = Readonly<{
  appStatePatch(): Readonly<Record<string, unknown>>;
  readChannelAccess(
    input: Parameters<CordisChannelProviderHostService['readChannelAccess']>[0],
  ): ReturnType<CordisChannelProviderHostService['readChannelAccess']>;
  executeChannelAccessAction(
    input: Parameters<CordisChannelProviderHostService['executeChannelAccessAction']>[0],
  ): ReturnType<CordisChannelProviderHostService['executeChannelAccessAction']>;
  dispose(): Promise<void>;
}>;

export type CordisAutomationProviderHostBootstrap = Readonly<{
  inspect(input?: Parameters<CordisAutomationProviderHostService['inspect']>[0]):
    ReturnType<CordisAutomationProviderHostService['inspect']>;
  execute(input: Parameters<CordisAutomationProviderHostService['execute']>[0]):
    ReturnType<CordisAutomationProviderHostService['execute']>;
  actionCatalog(input?: Parameters<CordisAutomationProviderHostService['actionCatalog']>[0]):
    ReturnType<CordisAutomationProviderHostService['actionCatalog']>;
  appStatePatch(): Readonly<Record<string, unknown>>;
  dispose(): Promise<void>;
}>;

export type CordisRemoteCompanionCompositionOptions = Readonly<
  Omit<CordisRemoteCompanionConnectorHostPluginConfig, 'connectors'> & {
    connectors?: readonly InstalledRemoteCompanionConnectorAttachment[];
    activationContext?: RemoteCompanionActivationContextResolver;
  }
>;

export type CordisRemoteCompanionConnectorHostBootstrap = Readonly<{
  appStatePatch(): Readonly<Record<string, unknown>>;
  readRemoteCompanionAccess(
    input: Parameters<CordisRemoteCompanionConnectorHostService['readRemoteCompanionAccess']>[0],
  ): ReturnType<CordisRemoteCompanionConnectorHostService['readRemoteCompanionAccess']>;
  executeRemoteCompanionAction(
    input: Parameters<CordisRemoteCompanionConnectorHostService['executeRemoteCompanionAction']>[0],
  ): ReturnType<CordisRemoteCompanionConnectorHostService['executeRemoteCompanionAction']>;
  dispose(): Promise<void>;
}>;

export type CordisCliComposition = CordisBaseHeadlessComposition | CordisAppFullComposition;

export type CordisFoundryDevComposition = {
  profileId: 'foundry-dev';
  ctx: Context;
  services: CordisFoundryDevServices;
  snapshot: CordisCompositionSnapshot;
  dispose(): Promise<void>;
};

export const CORDIS_BASE_HEADLESS_PLUGIN_DESCRIPTORS: readonly CordisPluginDescriptor[] =
  Object.freeze([
    CORDIS_CHARTER_POLICY_PLUGIN_DESCRIPTOR,
    CORDIS_ATLAS_CATALOG_PLUGIN_DESCRIPTOR,
    CORDIS_WORKSPACE_LOCATOR_PLUGIN_DESCRIPTOR,
    ...CORDIS_PACK_STAGECRAFT_PLUGIN_DESCRIPTORS,
    CORDIS_PACKAGE_HOST_PLUGIN_DESCRIPTOR,
    CORDIS_OWNER_DELTA_OBSERVER_PLUGIN_DESCRIPTOR,
    CORDIS_CONNECT_DESCRIPTOR_DISCOVERY_PLUGIN_DESCRIPTOR,
  ] as CordisPluginDescriptor[]);

function requiredService<T>(ctx: Context, serviceId: string): T {
  const service = ctx.get(serviceId);
  if (!service) throw new Error(`Cordis profile did not provide required service: ${serviceId}`);
  return service as T;
}

function profileSnapshot(
  profileId: CordisCompositionProfileId,
  plugins: readonly CordisPluginDescriptor[],
  childCompositionIds: readonly (
    'agent_executor_request' | 'runway_attempt' | 'pack_stagecraft_route' | 'release_operation'
  )[] = ['agent_executor_request', 'runway_attempt', 'pack_stagecraft_route'],
) {
  const childSnapshots = {
    agent_executor_request: buildCordisAgentExecutorCompositionSnapshot(
      'opl-existing-agent-executor',
    ),
    runway_attempt: buildCordisRunwayAttemptCompositionSnapshot(),
    pack_stagecraft_route: buildCordisPackStagecraftCompositionSnapshot(),
    release_operation: buildCordisReleaseOperationCompositionSnapshot(),
  };
  return buildCordisCompositionSnapshot({
    framework: {
      package: CORDIS_FRAMEWORK_PACKAGE,
      version: CORDIS_FRAMEWORK_VERSION,
      integrity: CORDIS_FRAMEWORK_INTEGRITY,
    },
    binding: {
      executor_adapter_id: `opl-cordis-profile:${profileId}`,
      executor_route: `opl.profile.${profileId}`,
      child_composition_snapshot_refs: Object.fromEntries(
        childCompositionIds.map((id) => {
          const snapshot = childSnapshots[id];
          return [id, {
          snapshot_id: snapshot.snapshot_id,
          snapshot_digest: snapshot.snapshot_digest,
          }];
        }),
      ),
    },
    foundry_evidence_ref: null,
    plugins,
  });
}

async function disposeFibers(fibers: readonly CordisFiber[]) {
  for (const fiber of [...fibers].reverse()) await fiber.dispose();
}

type CordisBaseCompositionOptions = {
  atlas?: CordisAtlasCatalogPluginConfig;
  connect?: CordisConnectDescriptorDiscoveryPluginConfig;
};
type CordisBaseComposition = Omit<CordisBaseHeadlessComposition, 'profileId'>;

async function createCordisBaseComposition(
  profileId: 'base-headless' | 'app-full',
  options: CordisBaseCompositionOptions = {},
): Promise<CordisBaseComposition> {
  const ctx = new Context();
  const fibers: CordisFiber[] = [];
  try {
    fibers.push(await ctx.plugin(cordisCharterPolicyPlugin));
    fibers.push(await ctx.plugin(cordisWorkspaceLocatorPlugin));
    fibers.push(await ctx.plugin(cordisConnectDescriptorDiscoveryPlugin, {
      discover: options.connect?.discover ?? discoverInstalledPackageDescriptors,
    }));
    const workspaceLocator = requiredService<CordisWorkspaceLocatorService>(
      ctx,
      CORDIS_WORKSPACE_LOCATOR_SERVICE,
    );
    fibers.push(await ctx.plugin(cordisAtlasCatalogPlugin, {
      ...options.atlas,
      buildCatalog: options.atlas?.buildCatalog
        ?? ((contracts, catalogOptions = {}) => buildDomainManifestCatalog(contracts, {
          ...catalogOptions,
          resolveActiveWorkspaceBinding: workspaceLocator.active,
        })),
    }));
    fibers.push(await ctx.plugin(cordisStagecraftContextPlugin));
    fibers.push(await ctx.plugin(cordisPackStageBindingPlugin));
    fibers.push(await ctx.plugin(cordisPackageHostPlugin, { profile_id: profileId }));
    fibers.push(await ctx.plugin(cordisOwnerDeltaObserverPlugin));
    const stageBinding = requiredService<CordisPackStageBindingService>(
      ctx,
      CORDIS_PACK_STAGE_BINDING_SERVICE,
    );
    const stageContext = requiredService<CordisStagecraftContextService>(
      ctx,
      CORDIS_STAGECRAFT_CONTEXT_SERVICE,
    );
    const atlas = requiredService<CordisAtlasCatalogService>(ctx, CORDIS_ATLAS_CATALOG_SERVICE);
    return {
      ctx,
      services: {
        charter: requiredService(ctx, CORDIS_CHARTER_CONTRACTS_SERVICE),
        atlas,
        workspaceLocator,
        stageBinding,
        stageContext,
        ownerDeltaObserver: requiredService(ctx, CORDIS_OWNER_DELTA_OBSERVER_SERVICE),
        descriptorDiscovery: requiredService(ctx, CORDIS_CONNECT_DESCRIPTOR_DISCOVERY_SERVICE),
        packageHost: requiredService(ctx, CORDIS_PACKAGE_HOST_SERVICE),
        familyRuntime: (args, runtimeOptions = {}) => runFamilyRuntime(args, {
          ...runtimeOptions,
          ownerDeltaObserver: runtimeOptions.ownerDeltaObserver ?? requiredService(
            ctx,
            CORDIS_OWNER_DELTA_OBSERVER_SERVICE,
          ),
          loadDomainManifests: runtimeOptions.loadDomainManifests ?? atlas,
          stageRunRuntime: {
            ...runtimeOptions.stageRunRuntime,
            stageBindingService: stageBinding,
            stageContextService: stageContext,
            resolveStageBinding: runtimeOptions.stageRunRuntime?.resolveStageBinding
              ?? stageBinding.resolve.bind(stageBinding),
          },
          createStageRouteComposition: runtimeOptions.createStageRouteComposition
            ?? createCordisStageRouteComposition,
        }),
        childFactories: {
          createAgentExecutorRequest: createCordisAgentExecutorRequest,
          createRunwayAttemptComposition: createCordisRunwayAttemptComposition,
          createStageRouteComposition: createCordisStageRouteComposition,
          createReleaseOperationComposition: (releaseOptions = {}) =>
            createCordisReleaseOperationComposition({
              ...releaseOptions,
              parentContext: ctx,
            }),
        },
      },
      snapshot: profileSnapshot(
        profileId,
        CORDIS_BASE_HEADLESS_PLUGIN_DESCRIPTORS,
        profileId === CORDIS_DEFAULT_PROFILE_ID
          ? ['agent_executor_request', 'runway_attempt', 'pack_stagecraft_route', 'release_operation']
          : ['agent_executor_request', 'runway_attempt', 'pack_stagecraft_route'],
      ),
      async dispose() {
        await disposeFibers(fibers);
        await ctx.fiber.dispose();
      },
    };
  } catch (error) {
    await disposeFibers(fibers);
    await ctx.fiber.dispose();
    throw error;
  }
}

export async function createCordisBaseHeadlessComposition(
  options: CordisBaseCompositionOptions = {},
): Promise<CordisBaseHeadlessComposition> {
  const base = await createCordisBaseComposition(CORDIS_DEFAULT_PROFILE_ID, options);
  return {
    profileId: CORDIS_DEFAULT_PROFILE_ID,
    ...base,
  };
}

export async function createCordisAppFullComposition(options: {
  runtimeSnapshotProvider: RuntimeTraySnapshotProvider;
  atlas?: CordisAtlasCatalogPluginConfig;
  connect?: CordisConnectDescriptorDiscoveryPluginConfig;
  channelProvider?: CordisChannelProviderHostPluginConfig;
  remoteCompanion?: CordisRemoteCompanionCompositionOptions;
  automationProvider?: CordisAutomationProviderHostPluginConfig;
}): Promise<CordisAppFullComposition> {
  const base = await createCordisBaseComposition('app-full', options);
  let readinessFiber: CordisFiber | null = null;
  let channelProviderFiber: CordisFiber | null = null;
  let remoteCompanionFiber: CordisFiber | null = null;
  let automationProviderFiber: CordisFiber | null = null;
  try {
    const runtimeSnapshotProvider: RuntimeTraySnapshotProvider = (contracts, snapshotOptions) =>
      options.runtimeSnapshotProvider(contracts, {
        ...snapshotOptions,
        ownerDeltaObserver: base.services.ownerDeltaObserver,
      });
    readinessFiber = await base.ctx.plugin(cordisFrameworkReadinessPlugin, {
      runtimeSnapshotProvider,
    });
    const installedRemoteCompanionConnectors = options.remoteCompanion
      ? options.remoteCompanion.connectors
        ?? await loadInstalledRemoteCompanionConnectors(
          base.services.descriptorDiscovery.discover().values(),
          { activationContext: options.remoteCompanion.activationContext },
        )
      : [];
    if (options.channelProvider) {
      const installedProviders = await loadInstalledChannelProviders(
        base.services.descriptorDiscovery.discover().values(),
      );
      channelProviderFiber = await base.ctx.plugin(
        cordisChannelProviderHostPlugin,
        {
          ...options.channelProvider,
          installedProviders,
        },
      );
    }
    if (installedRemoteCompanionConnectors.length > 0) {
      remoteCompanionFiber = await base.ctx.plugin(
        cordisRemoteCompanionConnectorHostPlugin,
        {
          canonical_conversation_bridge: options.remoteCompanion!.canonical_conversation_bridge,
          connectors: installedRemoteCompanionConnectors,
          ...(options.remoteCompanion!.protectedBlobHost
            ? { protectedBlobHost: options.remoteCompanion!.protectedBlobHost }
            : {}),
          ...(options.remoteCompanion!.protectedBlobPort
            ? { protectedBlobPort: options.remoteCompanion!.protectedBlobPort }
            : {}),
        },
      );
    }
    if (options.automationProvider) {
      automationProviderFiber = await base.ctx.plugin(
        cordisAutomationProviderHostPlugin,
        options.automationProvider,
      );
    }
    const {
      createReleaseOperationComposition: _releaseOperation,
      ...appChildFactories
    } = base.services.childFactories;
    return {
      profileId: 'app-full',
      ctx: base.ctx,
      services: {
        ...base.services,
        childFactories: appChildFactories,
        frameworkReadiness: requiredService(base.ctx, CORDIS_CONSOLE_READINESS_SERVICE),
        channelProviderHost: options.channelProvider
          ? requiredService(base.ctx, CORDIS_CHANNEL_PROVIDER_HOST_SERVICE)
          : null,
        remoteCompanionHost: installedRemoteCompanionConnectors.length > 0
          ? requiredService(base.ctx, CORDIS_REMOTE_COMPANION_CONNECTOR_HOST_SERVICE)
          : null,
        automationProviderHost: options.automationProvider
          ? requiredService(base.ctx, CORDIS_AUTOMATION_PROVIDER_HOST_SERVICE)
          : null,
      },
      snapshot: profileSnapshot('app-full', [
        ...CORDIS_BASE_HEADLESS_PLUGIN_DESCRIPTORS,
        CORDIS_CONSOLE_READINESS_PLUGIN_DESCRIPTOR,
        ...(options.channelProvider ? [CORDIS_CHANNEL_PROVIDER_HOST_PLUGIN_DESCRIPTOR] : []),
        ...(installedRemoteCompanionConnectors.length > 0
          ? [CORDIS_REMOTE_COMPANION_CONNECTOR_HOST_PLUGIN_DESCRIPTOR]
          : []),
        ...(options.automationProvider ? [CORDIS_AUTOMATION_PROVIDER_HOST_PLUGIN_DESCRIPTOR] : []),
      ], ['agent_executor_request', 'runway_attempt', 'pack_stagecraft_route']),
      async dispose() {
        await automationProviderFiber?.dispose();
        await remoteCompanionFiber?.dispose();
        await channelProviderFiber?.dispose();
        await readinessFiber?.dispose();
        await base.dispose();
      },
    };
  } catch (error) {
    await automationProviderFiber?.dispose();
    await remoteCompanionFiber?.dispose();
    await channelProviderFiber?.dispose();
    await readinessFiber?.dispose();
    await base.dispose();
    throw error;
  }
}

export async function startCordisRemoteCompanionConnectorHost(
  options: CordisRemoteCompanionCompositionOptions,
): Promise<CordisRemoteCompanionConnectorHostBootstrap> {
  const composition = await createCordisAppFullComposition({
    runtimeSnapshotProvider: async (contracts, snapshotOptions) => {
      const { buildRuntimeTraySnapshot } = await import(
        '../read-models/operator/runtime-tray-snapshot.ts'
      );
      return buildRuntimeTraySnapshot(contracts, snapshotOptions);
    },
    remoteCompanion: options,
  });
  const host = composition.services.remoteCompanionHost;
  if (!host) {
    await composition.dispose();
    throw new Error('No callable remote companion connector Package was installed.');
  }
  return Object.freeze({
    appStatePatch: () => host.appStatePatch(),
    readRemoteCompanionAccess: (input) => host.readRemoteCompanionAccess(input),
    executeRemoteCompanionAction: (input) => host.executeRemoteCompanionAction(input),
    dispose: () => composition.dispose(),
  });
}

export async function startCordisChannelProviderHost(options: {
  callback: CordisChannelProviderHostPluginConfig['callback'];
}): Promise<CordisChannelProviderHostBootstrap> {
  const composition = await createCordisAppFullComposition({
    runtimeSnapshotProvider: async (contracts, snapshotOptions) => {
      const { buildRuntimeTraySnapshot } = await import(
        '../read-models/operator/runtime-tray-snapshot.ts'
      );
      return buildRuntimeTraySnapshot(contracts, snapshotOptions);
    },
    channelProvider: { callback: options.callback },
  });
  const host = composition.services.channelProviderHost!;
  return Object.freeze({
    appStatePatch: () => host.appStatePatch(),
    readChannelAccess: (input) => host.readChannelAccess(input),
    executeChannelAccessAction: (input) => host.executeChannelAccessAction(input),
    dispose: () => composition.dispose(),
  });
}

export async function startCordisAutomationProviderHost(
  options: CordisAutomationProviderHostPluginConfig,
): Promise<CordisAutomationProviderHostBootstrap> {
  const composition = await createCordisAppFullComposition({
    runtimeSnapshotProvider: async (contracts, snapshotOptions) => {
      const { buildRuntimeTraySnapshot } = await import(
        '../read-models/operator/runtime-tray-snapshot.ts'
      );
      return buildRuntimeTraySnapshot(contracts, snapshotOptions);
    },
    automationProvider: options,
  });
  const host = composition.services.automationProviderHost!;
  return Object.freeze({
    inspect: (input) => host.inspect(input),
    execute: (input) => host.execute(input),
    actionCatalog: (input) => host.actionCatalog(input),
    appStatePatch: () => host.appStatePatch(),
    dispose: () => composition.dispose(),
  });
}

export async function createCordisFoundryDevComposition(options: {
  evaluation?: CordisFoundryEvaluationPluginConfig;
  atlas?: CordisAtlasCatalogPluginConfig;
  connect?: CordisConnectDescriptorDiscoveryPluginConfig;
} = {}): Promise<CordisFoundryDevComposition> {
  const ctx = new Context();
  const fibers: CordisFiber[] = [];
  try {
    fibers.push(await ctx.plugin(cordisCharterPolicyPlugin));
    fibers.push(await ctx.plugin(cordisConnectDescriptorDiscoveryPlugin, {
      discover: options.connect?.discover ?? discoverInstalledPackageDescriptors,
    }));
    fibers.push(await ctx.plugin(cordisAtlasCatalogPlugin, options.atlas ?? {}));
    fibers.push(await ctx.plugin(cordisStagecraftContextPlugin));
    fibers.push(await ctx.plugin(cordisPackStageBindingPlugin));
    fibers.push(await ctx.plugin(cordisPackageHostPlugin, { profile_id: 'foundry-dev' }));
    fibers.push(await ctx.plugin(cordisFoundryProviderManifestPlugin));
    if (options.evaluation) {
      fibers.push(await ctx.plugin(cordisFoundryEvaluationAdapterPlugin, options.evaluation));
    }
    const descriptorDiscovery = requiredService<CordisConnectDescriptorDiscoveryService>(
      ctx,
      CORDIS_CONNECT_DESCRIPTOR_DISCOVERY_SERVICE,
    );
    return {
      profileId: 'foundry-dev',
      ctx,
      services: {
        charter: requiredService(ctx, CORDIS_CHARTER_CONTRACTS_SERVICE),
        atlas: requiredService(ctx, CORDIS_ATLAS_CATALOG_SERVICE),
        stageBinding: requiredService(ctx, CORDIS_PACK_STAGE_BINDING_SERVICE),
        stageContext: requiredService(ctx, CORDIS_STAGECRAFT_CONTEXT_SERVICE),
        descriptorDiscovery,
        packageHost: requiredService(ctx, CORDIS_PACKAGE_HOST_SERVICE),
        childFactories: {
          createRunwayAttemptComposition: createCordisRunwayAttemptComposition,
        },
        refreshWorkspaceSkills: (input) => refreshInstalledAgentPackageWorkspaceSkills({
          ...input,
          descriptorDiscovery,
        }),
        foundryProviderManifest: requiredService(
          ctx,
          CORDIS_FOUNDRY_PROVIDER_MANIFEST_SERVICE,
        ),
        foundryEvaluation: options.evaluation
          ? requiredService(ctx, CORDIS_FOUNDRY_EVALUATION_SERVICE)
          : null,
      },
      snapshot: profileSnapshot('foundry-dev', [
        CORDIS_CHARTER_POLICY_PLUGIN_DESCRIPTOR,
        CORDIS_CONNECT_DESCRIPTOR_DISCOVERY_PLUGIN_DESCRIPTOR,
        CORDIS_ATLAS_CATALOG_PLUGIN_DESCRIPTOR,
        ...CORDIS_PACK_STAGECRAFT_PLUGIN_DESCRIPTORS,
        CORDIS_PACKAGE_HOST_PLUGIN_DESCRIPTOR,
        CORDIS_FOUNDRY_PROVIDER_MANIFEST_PLUGIN_DESCRIPTOR,
        ...(options.evaluation ? [CORDIS_FOUNDRY_EVALUATION_ADAPTER_PLUGIN_DESCRIPTOR] : []),
      ], ['runway_attempt']),
      async dispose() {
        await disposeFibers(fibers);
        await ctx.fiber.dispose();
      },
    };
  } catch (error) {
    await disposeFibers(fibers);
    await ctx.fiber.dispose();
    throw error;
  }
}

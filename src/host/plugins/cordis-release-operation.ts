import { Context } from '@deepseek-ai/cordis';

import {
  buildCordisCompositionSnapshot,
  buildCordisPluginDescriptor,
  type CordisCompositionSnapshot,
  type CordisPluginDescriptor,
} from '../../authority/packages/index.ts';
import {
  CORDIS_FIBER_STATE,
  CORDIS_FRAMEWORK_INTEGRITY,
  CORDIS_FRAMEWORK_PACKAGE,
  CORDIS_FRAMEWORK_VERSION,
} from '../../kernel/cordis-abi.ts';
import {
  admitReleaseBundleOperation,
  buildReleaseBundle,
  buildReleaseBundleConsumerEnvelope,
  exportReleaseBundleCheckpoint,
  freezeReleaseBundle,
  importReleaseBundleCheckpoint,
  publishReleaseBundle,
  readReleaseBundleEvents,
  readReleaseBundleStatus,
  reconcileReleaseBundle,
  verifyReleaseBundle,
} from '../../adapters/integration/index.ts';

export const CORDIS_RELEASE_OPERATION_PLUGIN_ID = 'opl-connect-release-operation';
export const CORDIS_RELEASE_OPERATION_PLUGIN_API_VERSION = '1.0.0';
export const CORDIS_RELEASE_OPERATION_SERVICE = 'opl.connect.release-operation';
export const CORDIS_RELEASE_OPERATION_SOURCE_REF =
  'src/host/plugins/cordis-release-operation.ts';
export const CORDIS_RELEASE_OPERATION_SOURCE_COMMIT =
  'b1bca04e9a77e6df4156d0858ecbb69566f6decd';

export type CordisReleaseOperationService = {
  freeze: typeof freezeReleaseBundle;
  admit: typeof admitReleaseBundleOperation;
  build: typeof buildReleaseBundle;
  checkpointExport: typeof exportReleaseBundleCheckpoint;
  checkpointImport: typeof importReleaseBundleCheckpoint;
  verify: typeof verifyReleaseBundle;
  publish: typeof publishReleaseBundle;
  reconcile: typeof reconcileReleaseBundle;
  status: typeof readReleaseBundleStatus;
  events: typeof readReleaseBundleEvents;
  consumerEnvelope: typeof buildReleaseBundleConsumerEnvelope;
};

export type CordisReleaseOperationPluginConfig = {
  service?: CordisReleaseOperationService;
};

export type CordisReleaseOperationCompositionOptions =
  CordisReleaseOperationPluginConfig & {
    parentContext?: Context;
  };

export type CordisReleaseOperationCompositionSnapshot = CordisCompositionSnapshot;

declare module '@deepseek-ai/cordis' {
  interface Context {
    [CORDIS_RELEASE_OPERATION_SERVICE]: CordisReleaseOperationService;
  }
}

export const defaultCordisReleaseOperationService: CordisReleaseOperationService = Object.freeze({
  freeze: freezeReleaseBundle,
  admit: admitReleaseBundleOperation,
  build: buildReleaseBundle,
  checkpointExport: exportReleaseBundleCheckpoint,
  checkpointImport: importReleaseBundleCheckpoint,
  verify: verifyReleaseBundle,
  publish: publishReleaseBundle,
  reconcile: reconcileReleaseBundle,
  status: readReleaseBundleStatus,
  events: readReleaseBundleEvents,
  consumerEnvelope: buildReleaseBundleConsumerEnvelope,
});

export const cordisReleaseOperationPlugin = {
  name: CORDIS_RELEASE_OPERATION_PLUGIN_ID,
  provide: CORDIS_RELEASE_OPERATION_SERVICE,
  apply(ctx: Context, config: CordisReleaseOperationPluginConfig = {}) {
    ctx.provide(CORDIS_RELEASE_OPERATION_SERVICE, config.service ?? defaultCordisReleaseOperationService);
  },
};

const forbiddenAuthorities = Object.freeze([
  'app_product_truth',
  'app_release_policy',
  'public_release_authorization',
  'github_actions_orchestration',
  'release_environment_permissions',
  'credential_material',
  'security_sandbox',
  'parallel_release_event_log',
]);

export const CORDIS_RELEASE_OPERATION_PLUGIN_DESCRIPTOR: CordisPluginDescriptor =
  buildCordisPluginDescriptor({
    plugin_id: CORDIS_RELEASE_OPERATION_PLUGIN_ID,
    plugin_api_version: CORDIS_RELEASE_OPERATION_PLUGIN_API_VERSION,
    source_ref: CORDIS_RELEASE_OPERATION_SOURCE_REF,
    source_commit: CORDIS_RELEASE_OPERATION_SOURCE_COMMIT,
    package_ref: null,
    required: true,
    provides: [CORDIS_RELEASE_OPERATION_SERVICE],
    injects: { required: [], optional: [] },
    events: [],
    scope: 'request',
    trust: 'first_party_privileged',
    disposer: { required: true, boundary: 'plugin_fiber' },
    authority_boundary: { forbidden_authorities: forbiddenAuthorities },
  });

export function buildCordisReleaseOperationCompositionSnapshot(
  serviceId = CORDIS_RELEASE_OPERATION_SERVICE,
): CordisReleaseOperationCompositionSnapshot {
  return buildCordisCompositionSnapshot({
    framework: {
      package: CORDIS_FRAMEWORK_PACKAGE,
      version: CORDIS_FRAMEWORK_VERSION,
      integrity: CORDIS_FRAMEWORK_INTEGRITY,
    },
    binding: {
      executor_adapter_id: serviceId,
      executor_route: CORDIS_RELEASE_OPERATION_SERVICE,
    },
    foundry_evidence_ref: null,
    plugins: [CORDIS_RELEASE_OPERATION_PLUGIN_DESCRIPTOR],
  });
}

export async function createCordisReleaseOperationComposition(
  options: CordisReleaseOperationCompositionOptions = {},
) {
  const ownsRoot = options.parentContext === undefined;
  const ctx = options.parentContext?.isolate(CORDIS_RELEASE_OPERATION_SERVICE) ?? new Context();
  const service = options.service ?? defaultCordisReleaseOperationService;
  let fiber: Awaited<ReturnType<Context['plugin']>> | null = null;
  try {
    fiber = await ctx.plugin(cordisReleaseOperationPlugin, { service });
    if (fiber.state !== CORDIS_FIBER_STATE.ACTIVE) {
      throw new Error(`Cordis release operation service did not become active: ${fiber.state}`);
    }
  } catch (error) {
    await fiber?.dispose();
    if (ownsRoot) await ctx.fiber.dispose();
    throw error;
  }
  return {
    ctx,
    fiber,
    service: ctx[CORDIS_RELEASE_OPERATION_SERVICE],
    snapshot: buildCordisReleaseOperationCompositionSnapshot(
      service === defaultCordisReleaseOperationService
        ? CORDIS_RELEASE_OPERATION_SERVICE
        : 'injected-release-operation-service',
    ),
    async dispose() {
      await fiber?.dispose();
      if (ownsRoot) await ctx.fiber.dispose();
    },
  };
}

import { Context } from '@deepseek-ai/cordis';
import {
  buildCordisCompositionSnapshot,
  buildCordisPluginDescriptor,
  CORDIS_FIBER_STATE,
  CORDIS_FRAMEWORK_INTEGRITY,
  CORDIS_FRAMEWORK_PACKAGE,
  CORDIS_FRAMEWORK_VERSION,
  type CordisCompositionSnapshot,
  type CordisPluginDescriptor,
} from '../../kernel/cordis-abi.ts';

import {
  CORDIS_PACK_STAGE_BINDING_PLUGIN_API_VERSION,
  CORDIS_PACK_STAGE_BINDING_PLUGIN_ID,
  CORDIS_PACK_STAGE_BINDING_SERVICE,
  CORDIS_PACK_STAGE_BINDING_SOURCE_COMMIT,
  CORDIS_PACK_STAGE_BINDING_SOURCE_REF,
  cordisPackStageBindingPlugin,
} from './cordis-pack-stage-binding-plugin.ts';
import {
  CORDIS_ATLAS_CATALOG_SERVICE,
  CORDIS_STAGECRAFT_CONTEXT_PLUGIN_API_VERSION,
  CORDIS_STAGECRAFT_CONTEXT_PLUGIN_ID,
  CORDIS_STAGECRAFT_CONTEXT_SERVICE,
  CORDIS_STAGECRAFT_CONTEXT_SOURCE_COMMIT,
  CORDIS_STAGECRAFT_CONTEXT_SOURCE_REF,
  cordisStagecraftContextPlugin,
  type CordisAtlasCatalogService,
  type CordisStagecraftContextPluginConfig,
} from './cordis-stagecraft-context-plugin.ts';
import {
  runAgentExecutor,
  type AgentExecutionReceipt,
  type AgentExecutionRequest,
} from '../../adapters/execution/index.ts';

export const CORDIS_AGENT_EXECUTOR_EXPERIMENT_VERSION = 'cordis-agent-executor-experiment.v1';
export const CORDIS_AGENT_EXECUTOR_PLUGIN_API_VERSION = '1.0.0';
export const CORDIS_AGENT_EXECUTOR_SOURCE_REF =
  'src/host/plugins/cordis-agent-executor-experiment.ts';
export const CORDIS_AGENT_EXECUTOR_SOURCE_COMMIT =
  'b1bca04e9a77e6df4156d0858ecbb69566f6decd';
export {
  CORDIS_FIBER_STATE,
  CORDIS_FRAMEWORK_INTEGRITY,
  CORDIS_FRAMEWORK_PACKAGE,
  CORDIS_FRAMEWORK_VERSION,
};
export type {
  AgentExecutionReceipt,
  AgentExecutionRequest,
};

export type CordisAgentExecutorAdapter = {
  readonly id: string;
  execute(request: AgentExecutionRequest): AgentExecutionReceipt;
};
export type CordisAgentExecutorObserver = {
  onRequest?: (request: AgentExecutionRequest) => void;
  onResult?: (receipt: AgentExecutionReceipt) => void | Promise<void>;
};
export type CordisAgentExecutorService = {
  execute(request: AgentExecutionRequest): Promise<AgentExecutionReceipt>;
};

declare module '@deepseek-ai/cordis' {
  interface Context {
    'opl.runway.executor.adapter': CordisAgentExecutorAdapter;
    'opl.runway.executor': CordisAgentExecutorService;
  }

  interface Events {
    'opl/runway/executor/requested': (request: AgentExecutionRequest) => void;
    'opl/runway/executor/completed': (receipt: AgentExecutionReceipt) => void | Promise<void>;
  }
}

export const cordisAgentExecutorAdapterPlugin = {
  name: 'opl-cordis-agent-executor-adapter',
  provide: 'opl.runway.executor.adapter',
  apply(ctx: Context, config: { adapter: CordisAgentExecutorAdapter }) {
    ctx.provide('opl.runway.executor.adapter', config.adapter);
  },
};

export const cordisAgentExecutorServicePlugin = {
  name: 'opl-cordis-agent-executor-service',
  inject: ['opl.runway.executor.adapter'],
  provide: 'opl.runway.executor',
  apply(ctx: Context) {
    const service: CordisAgentExecutorService = {
      async execute(request) {
        ctx.emit('opl/runway/executor/requested', request);
        const receipt = ctx['opl.runway.executor.adapter'].execute(request);
        await ctx.parallel('opl/runway/executor/completed', receipt);
        return receipt;
      },
    };
    ctx.provide('opl.runway.executor', service);
  },
};

export const cordisAgentExecutorObserverPlugin = {
  name: 'opl-cordis-agent-executor-observer',
  apply(ctx: Context, observer: CordisAgentExecutorObserver) {
    if (observer.onRequest) {
      ctx.on(
        'opl/runway/executor/requested',
        observer.onRequest as (request: AgentExecutionRequest) => void,
      );
    }
    if (observer.onResult) {
      ctx.on(
        'opl/runway/executor/completed',
        (receipt) => observer.onResult!(receipt as AgentExecutionReceipt),
      );
    }
  },
};

export type CordisAgentExecutorCompositionSnapshot = CordisCompositionSnapshot;
export type CordisPackStagecraftCompositionSnapshot = CordisCompositionSnapshot;

const defaultAdapter: CordisAgentExecutorAdapter = {
  id: 'opl-existing-agent-executor',
  execute: runAgentExecutor,
};

const forbiddenAuthorities = Object.freeze([
  'package_installed_truth',
  'package_currentness',
  'native_carrier_lifecycle',
  'temporal_workflow_history',
  'temporal_retry_replay',
  'workspace_file_bytes',
  'workspace_binding_registry',
  'ledger_evidence_persistence',
  'ledger_receipt_authority',
  'foundry_agent_version',
  'foundry_promotion_activation',
  'domain_truth',
  'domain_quality_verdict',
  'app_product_truth',
  'credential_material',
  'security_sandbox',
]);

function executorDescriptor(input: {
  pluginId: string;
  required: boolean;
  provides?: readonly string[];
  requiredInjects?: readonly string[];
  events?: CordisPluginDescriptor['events'];
}): CordisPluginDescriptor {
  return buildCordisPluginDescriptor({
    plugin_id: input.pluginId,
    plugin_api_version: CORDIS_AGENT_EXECUTOR_PLUGIN_API_VERSION,
    source_ref: CORDIS_AGENT_EXECUTOR_SOURCE_REF,
    source_commit: CORDIS_AGENT_EXECUTOR_SOURCE_COMMIT,
    package_ref: null,
    required: input.required,
    provides: input.provides ?? [],
    injects: {
      required: (input.requiredInjects ?? []).map((serviceId) => ({
        service_id: serviceId,
        plugin_api_versions: [CORDIS_AGENT_EXECUTOR_PLUGIN_API_VERSION],
      })),
      optional: [],
    },
    events: input.events ?? [],
    scope: 'request',
    trust: 'first_party_privileged',
    disposer: { required: true, boundary: 'plugin_fiber' },
    authority_boundary: { forbidden_authorities: forbiddenAuthorities },
  });
}

export const CORDIS_AGENT_EXECUTOR_PLUGIN_DESCRIPTORS: readonly CordisPluginDescriptor[] = Object.freeze([
  executorDescriptor({
    pluginId: 'opl-cordis-agent-executor-adapter',
    required: true,
    provides: ['opl.runway.executor.adapter'],
  }),
  executorDescriptor({
    pluginId: 'opl-cordis-agent-executor-service',
    required: true,
    provides: ['opl.runway.executor'],
    requiredInjects: ['opl.runway.executor.adapter'],
    events: [
      { name: 'opl/runway/executor/requested', mode: 'emit', role: 'publish', payload_schema_ref: null },
      { name: 'opl/runway/executor/completed', mode: 'parallel', role: 'publish', payload_schema_ref: null },
    ],
  }),
  executorDescriptor({
    pluginId: 'opl-cordis-agent-executor-observer',
    required: false,
    events: [
      { name: 'opl/runway/executor/requested', mode: 'observe', role: 'observe', payload_schema_ref: null },
      { name: 'opl/runway/executor/completed', mode: 'observe', role: 'observe', payload_schema_ref: null },
    ],
  }),
]);

export function buildCordisAgentExecutorCompositionSnapshot(
  executorAdapterId: string,
): CordisCompositionSnapshot {
  return buildCordisCompositionSnapshot({
    framework: {
      package: CORDIS_FRAMEWORK_PACKAGE,
      version: CORDIS_FRAMEWORK_VERSION,
      integrity: CORDIS_FRAMEWORK_INTEGRITY,
    },
    binding: {
      executor_adapter_id: executorAdapterId,
      executor_route: 'opl.runway.executor',
    },
    foundry_evidence_ref: null,
    plugins: CORDIS_AGENT_EXECUTOR_PLUGIN_DESCRIPTORS,
  });
}

export async function createCordisAgentExecutorRequest(options: {
  adapter?: CordisAgentExecutorAdapter;
} = {}) {
  const ctx = new Context();
  const adapter = options.adapter ?? defaultAdapter;
  const adapterFiber = await ctx.plugin(cordisAgentExecutorAdapterPlugin, { adapter });
  const executorFiber = await ctx.plugin(cordisAgentExecutorServicePlugin);
  if (executorFiber.state !== CORDIS_FIBER_STATE.ACTIVE) {
    throw new Error(`Cordis executor service did not become active: ${executorFiber.state}`);
  }
  return {
    ctx,
    adapterFiber,
    executorFiber,
    executor: ctx['opl.runway.executor'] as CordisAgentExecutorService,
    snapshot: buildCordisAgentExecutorCompositionSnapshot(adapter.id),
    async dispose() {
      await executorFiber.dispose();
      await adapterFiber.dispose();
      await ctx.fiber.dispose();
    },
  };
}

const cordisPackStagecraftForbiddenAuthorities = Object.freeze([
  'package_installed_truth',
  'package_currentness',
  'native_carrier_lifecycle',
  'temporal_workflow_history',
  'temporal_retry_replay',
  'workspace_file_bytes',
  'workspace_binding_registry',
  'ledger_evidence_persistence',
  'ledger_receipt_authority',
  'foundry_agent_version',
  'foundry_promotion_activation',
  'domain_truth',
  'domain_quality_verdict',
  'app_product_truth',
  'credential_material',
  'security_sandbox',
]);

function packStagecraftDescriptor(input: {
  pluginId: string;
  pluginApiVersion: string;
  sourceRef: string;
  sourceCommit: string;
  required: boolean;
  provides: readonly string[];
  requiredInjects?: readonly { service_id: string; plugin_api_versions: readonly string[] }[];
  optionalInjects?: readonly { service_id: string; plugin_api_versions: readonly string[] }[];
  events?: CordisPluginDescriptor['events'];
}): CordisPluginDescriptor {
  return buildCordisPluginDescriptor({
    plugin_id: input.pluginId,
    plugin_api_version: input.pluginApiVersion,
    source_ref: input.sourceRef,
    source_commit: input.sourceCommit,
    package_ref: null,
    required: input.required,
    provides: input.provides,
    injects: {
      required: input.requiredInjects ?? [],
      optional: input.optionalInjects ?? [],
    },
    events: input.events ?? [],
    scope: 'composition',
    trust: 'first_party_privileged',
    disposer: { required: true, boundary: 'plugin_fiber' },
    authority_boundary: { forbidden_authorities: cordisPackStagecraftForbiddenAuthorities },
  });
}

export const CORDIS_PACK_STAGECRAFT_PLUGIN_DESCRIPTORS: readonly CordisPluginDescriptor[] = Object.freeze([
  packStagecraftDescriptor({
    pluginId: CORDIS_STAGECRAFT_CONTEXT_PLUGIN_ID,
    pluginApiVersion: CORDIS_STAGECRAFT_CONTEXT_PLUGIN_API_VERSION,
    sourceRef: CORDIS_STAGECRAFT_CONTEXT_SOURCE_REF,
    sourceCommit: CORDIS_STAGECRAFT_CONTEXT_SOURCE_COMMIT,
    required: true,
    provides: [CORDIS_STAGECRAFT_CONTEXT_SERVICE],
    optionalInjects: [{
      service_id: CORDIS_ATLAS_CATALOG_SERVICE,
      plugin_api_versions: [CORDIS_STAGECRAFT_CONTEXT_PLUGIN_API_VERSION],
    }],
    events: [{
      name: 'opl/stagecraft/context/observed',
      mode: 'emit',
      role: 'publish',
      payload_schema_ref: null,
    }],
  }),
  packStagecraftDescriptor({
    pluginId: CORDIS_PACK_STAGE_BINDING_PLUGIN_ID,
    pluginApiVersion: CORDIS_PACK_STAGE_BINDING_PLUGIN_API_VERSION,
    sourceRef: CORDIS_PACK_STAGE_BINDING_SOURCE_REF,
    sourceCommit: CORDIS_PACK_STAGE_BINDING_SOURCE_COMMIT,
    required: true,
    provides: [CORDIS_PACK_STAGE_BINDING_SERVICE],
    requiredInjects: [{
      service_id: CORDIS_STAGECRAFT_CONTEXT_SERVICE,
      plugin_api_versions: [CORDIS_STAGECRAFT_CONTEXT_PLUGIN_API_VERSION],
    }],
    events: [{
      name: 'opl/pack/stage-binding/resolved',
      mode: 'emit',
      role: 'publish',
      payload_schema_ref: null,
    }],
  }),
]);

export function buildCordisPackStagecraftCompositionSnapshot(): CordisPackStagecraftCompositionSnapshot {
  return buildCordisCompositionSnapshot({
    framework: {
      package: CORDIS_FRAMEWORK_PACKAGE,
      version: CORDIS_FRAMEWORK_VERSION,
      integrity: CORDIS_FRAMEWORK_INTEGRITY,
    },
    binding: {
      executor_adapter_id: defaultAdapter.id,
      executor_route: 'opl.runway.executor',
    },
    foundry_evidence_ref: null,
    plugins: CORDIS_PACK_STAGECRAFT_PLUGIN_DESCRIPTORS,
  });
}

export async function createCordisStageRouteComposition(
  options: CordisStagecraftContextPluginConfig = {},
) {
  const ctx = new Context();
  const stagecraftFiber = await ctx.plugin(cordisStagecraftContextPlugin, options);
  const stageBindingFiber = await ctx.plugin(cordisPackStageBindingPlugin);
  if (stagecraftFiber.state !== CORDIS_FIBER_STATE.ACTIVE) {
    throw new Error(`Cordis Stagecraft context service did not become active: ${stagecraftFiber.state}`);
  }
  if (stageBindingFiber.state !== CORDIS_FIBER_STATE.ACTIVE) {
    throw new Error(`Cordis Pack stage binding service did not become active: ${stageBindingFiber.state}`);
  }
  return {
    ctx,
    stagecraftFiber,
    stageBindingFiber,
    stageContext: ctx[CORDIS_STAGECRAFT_CONTEXT_SERVICE],
    stageBinding: ctx[CORDIS_PACK_STAGE_BINDING_SERVICE],
    snapshot: buildCordisPackStagecraftCompositionSnapshot(),
    async dispose() {
      await stageBindingFiber.dispose();
      await stagecraftFiber.dispose();
      await ctx.fiber.dispose();
    },
  };
}

export type { CordisAtlasCatalogService };

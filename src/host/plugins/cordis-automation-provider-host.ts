import { Context } from '@deepseek-ai/cordis';

import {
  buildCordisPluginDescriptor,
  type CordisPluginDescriptor,
} from '../../authority/packages/index.ts';
import { boundedJsonValue } from '../../kernel/json-record.ts';

export const CORDIS_AUTOMATION_PROVIDER_HOST_PLUGIN_ID = 'opl-connect-automation-provider-host';
export const CORDIS_AUTOMATION_PROVIDER_HOST_PLUGIN_API_VERSION = '1.0.0';
export const CORDIS_AUTOMATION_PROVIDER_HOST_SERVICE = 'opl.connect.automation-provider-host' as const;
export const CORDIS_AUTOMATION_PROVIDER_HOST_SOURCE_REF =
  'src/host/plugins/cordis-automation-provider-host.ts';
export const CORDIS_AUTOMATION_PROVIDER_HOST_SOURCE_COMMIT =
  '7bb2a4ef76dcbc74cc208fa374cac472f7e0fe0a';

const AUTOMATION_PROVIDER_API_VERSION = '1.0.0' as const;

export type CordisAutomationProviderKind = 'computer_use' | 'browser_automation';

export type CordisAutomationProviderAction = Readonly<{
  action_id: string;
  [key: string]: unknown;
}>;

export type CordisAutomationProvider = Readonly<{
  provider_id: string;
  automation_kind: CordisAutomationProviderKind;
  buildActionCatalog(): readonly CordisAutomationProviderAction[];
  inspect(input?: Readonly<{ runExternalChecks?: boolean }>):
    unknown | Promise<unknown>;
  reconcile(input: Readonly<{ action_id: string }>): unknown | Promise<unknown>;
  dispose(): void | Promise<void>;
}>;

export type CordisAutomationProviderSelection = Readonly<{
  provider_id: string;
  automation_kind?: CordisAutomationProviderKind;
}>;

export type CordisAutomationProviderReadRequest = Readonly<{
  provider_id?: string;
  automation_kind?: CordisAutomationProviderKind;
  runExternalChecks?: boolean;
}>;

export type CordisAutomationProviderExecuteRequest = Readonly<{
  provider_id?: string;
  automation_kind?: CordisAutomationProviderKind;
  action_id: string;
  dry_run?: boolean;
}>;

export type CordisAutomationProviderHostService = Readonly<{
  api_version: typeof AUTOMATION_PROVIDER_API_VERSION;
  inspect(input?: CordisAutomationProviderReadRequest): Promise<Readonly<Record<string, unknown>>>;
  execute(input: CordisAutomationProviderExecuteRequest): Promise<Readonly<Record<string, unknown>>>;
  actionCatalog(input?: Readonly<{
    provider_id?: string;
    automation_kind?: CordisAutomationProviderKind;
  }>): readonly CordisAutomationProviderAction[];
  appStatePatch(): Readonly<Record<string, unknown>>;
}>;

export type CordisAutomationProviderHostPluginConfig = Readonly<{
  providers?: readonly CordisAutomationProvider[];
  selectedProviders?: readonly CordisAutomationProviderSelection[];
}>;

type ActiveProvider = Readonly<{
  provider: CordisAutomationProvider;
  actions: readonly CordisAutomationProviderAction[];
}>;

declare module '@deepseek-ai/cordis' {
  interface Context {
    [CORDIS_AUTOMATION_PROVIDER_HOST_SERVICE]: CordisAutomationProviderHostService;
  }
}

function requiredProviderId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9._-]*$/.test(value)) {
    throw new TypeError(`Automation provider_id is invalid: ${String(value)}`);
  }
  return value;
}

function requiredActionId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9._-]*$/.test(value)) {
    throw new TypeError(`Automation action_id is invalid: ${String(value)}`);
  }
  return value;
}

function requiredAutomationKind(value: unknown): CordisAutomationProviderKind {
  if (value !== 'computer_use' && value !== 'browser_automation') {
    throw new TypeError(`Automation provider kind is invalid: ${String(value)}`);
  }
  return value;
}

function resultRecord(value: unknown, field: string): Readonly<Record<string, unknown>> {
  const bounded = boundedJsonValue(value, field);
  if (!bounded || typeof bounded !== 'object' || Array.isArray(bounded)) {
    throw new TypeError(`${field} must return a JSON object.`);
  }
  return Object.freeze(bounded as Record<string, unknown>);
}

function assertAutomationProvider(value: unknown): asserts value is CordisAutomationProvider {
  const record = value && typeof value === 'object'
    ? value as Record<string, unknown>
    : null;
  const providerId = record?.provider_id;
  if (typeof providerId !== 'string' || !/^[a-z][a-z0-9._-]*$/.test(providerId)) {
    throw new TypeError('Automation provider requires a stable provider_id.');
  }
  requiredAutomationKind(record?.automation_kind);
  for (const method of ['buildActionCatalog', 'inspect', 'reconcile', 'dispose']) {
    if (!record || typeof record[method] !== 'function') {
      throw new TypeError(`Automation provider ${providerId} requires ${method}().`);
    }
  }
}

function automationProviderActionCatalog(
  provider: CordisAutomationProvider,
): readonly CordisAutomationProviderAction[] {
  const actions = provider.buildActionCatalog();
  if (!Array.isArray(actions)) {
    throw new TypeError(`Automation provider ${provider.provider_id} action catalog must be an array.`);
  }
  const ids = new Set<string>();
  return Object.freeze(actions.map((action) => {
    if (!action || typeof action !== 'object' || Array.isArray(action)) {
      throw new TypeError(`Automation provider ${provider.provider_id} action catalog contains an invalid action.`);
    }
    const actionId = (action as Record<string, unknown>).action_id;
    if (typeof actionId !== 'string' || !/^[a-z][a-z0-9._-]*$/.test(actionId)) {
      throw new TypeError(`Automation provider ${provider.provider_id} action catalog requires stable action_id values.`);
    }
    if (ids.has(actionId)) {
      throw new TypeError(`Automation provider ${provider.provider_id} action catalog contains duplicate action_id: ${actionId}`);
    }
    ids.add(actionId);
    return Object.freeze({ ...(action as Record<string, unknown>), action_id: actionId }) as CordisAutomationProviderAction;
  }));
}

function selectionKey(selection: CordisAutomationProviderSelection) {
  return `${selection.provider_id}\0${selection.automation_kind ?? ''}`;
}

export const cordisAutomationProviderHostPlugin = {
  name: CORDIS_AUTOMATION_PROVIDER_HOST_PLUGIN_ID,
  provide: CORDIS_AUTOMATION_PROVIDER_HOST_SERVICE,
  async apply(ctx: Context, config: CordisAutomationProviderHostPluginConfig = {}) {
    const activeProviders = new Map<string, ActiveProvider>();
    const providerSelections = config.selectedProviders === undefined
      ? null
      : config.selectedProviders.map((selection) => {
        const providerId = requiredProviderId(selection?.provider_id);
        const automationKind = selection?.automation_kind === undefined
          ? undefined
          : requiredAutomationKind(selection.automation_kind);
        return Object.freeze({ provider_id: providerId, automation_kind: automationKind });
      });
    if (providerSelections) {
      const keys = new Set<string>();
      for (const selection of providerSelections) {
        const key = selectionKey(selection);
        if (keys.has(key)) throw new Error(`Automation provider selection is duplicated: ${key}`);
        keys.add(key);
      }
    }

    const attachProvider = async (provider: CordisAutomationProvider) => {
      assertAutomationProvider(provider);
      const providerId = requiredProviderId(provider.provider_id);
      requiredAutomationKind(provider.automation_kind);
      if (activeProviders.has(providerId)) {
        throw new Error(`Automation provider is already attached: ${providerId}`);
      }
      const actions = automationProviderActionCatalog(provider);
      if (actions.length === 0) {
        throw new Error(`Automation provider ${providerId} must expose at least one action.`);
      }
      activeProviders.set(providerId, Object.freeze({
        provider,
        actions,
      }));
      let disposed = false;
      const disposeEffect = ctx.effect(() => async () => {
        if (disposed) return;
        disposed = true;
        activeProviders.delete(providerId);
        await provider.dispose();
      }, `automation-provider:${providerId}`);
      return Object.freeze({
        async dispose() {
          await disposeEffect();
        },
      });
    };

    const candidates = new Map<string, CordisAutomationProvider>();
    for (const provider of config.providers ?? []) {
      const id = requiredProviderId(provider.provider_id);
      if (candidates.has(id)) throw new Error(`Automation provider identity is duplicated: ${id}`);
      candidates.set(id, provider);
    }

    const selectedCandidates = providerSelections
      ? providerSelections.map((selection) => {
        const candidate = candidates.get(selection.provider_id);
        if (!candidate) {
          throw new Error(`Selected automation provider is unavailable: ${selection.provider_id}`);
        }
        if (
          selection.automation_kind !== undefined
          && candidate.automation_kind !== selection.automation_kind
        ) {
          throw new Error(
            `Selected automation provider kind does not match: ${selection.provider_id}`,
          );
        }
        return candidate;
      })
      : [...candidates.values()];
    for (const candidate of selectedCandidates) await attachProvider(candidate);

    const resolveActive = (input: {
      provider_id?: string;
      automation_kind?: CordisAutomationProviderKind;
    }) => {
      const providerId = input.provider_id === undefined ? undefined : requiredProviderId(input.provider_id);
      const automationKind = input.automation_kind === undefined
        ? undefined
        : requiredAutomationKind(input.automation_kind);
      const matches = [...activeProviders.entries()].filter(([, active]) => (
        (providerId === undefined || active.provider.provider_id === providerId)
        && (automationKind === undefined || active.provider.automation_kind === automationKind)
      ));
      if (matches.length === 0) {
        throw new Error(
          `Automation provider is unavailable${providerId ? `: ${providerId}` : ''}${automationKind ? ` (${automationKind})` : ''}.`,
        );
      }
      if (matches.length > 1) {
        throw new Error('Automation provider selection is ambiguous; provider_id is required.');
      }
      return matches[0]![1];
    };

    const service: CordisAutomationProviderHostService = {
      api_version: AUTOMATION_PROVIDER_API_VERSION,
      async inspect(input = {}) {
        const active = resolveActive(input);
        return resultRecord(
          await active.provider.inspect({ runExternalChecks: input.runExternalChecks }),
          `Automation provider ${active.provider.provider_id} inspection`,
        );
      },
      async execute(input) {
        const actionId = requiredActionId(input?.action_id);
        const active = resolveActive(input);
        if (!active.actions.some((action) => action.action_id === actionId)) {
          throw new Error(
            `Automation provider action is not declared: ${active.provider.provider_id}:${actionId}`,
          );
        }
        if (input.dry_run === true) {
          return resultRecord(
            await active.provider.inspect({ runExternalChecks: false }),
            `Automation provider ${active.provider.provider_id} dry-run inspection`,
          );
        }
        return resultRecord(
          await active.provider.reconcile({ action_id: actionId }),
          `Automation provider ${active.provider.provider_id} action result`,
        );
      },
      actionCatalog(input = {}) {
        const active = resolveActive(input);
        return active.actions;
      },
      appStatePatch() {
        return Object.freeze({
          surface_kind: 'opl_automation_provider_host_projection.v1',
          api_version: AUTOMATION_PROVIDER_API_VERSION,
          status: activeProviders.size > 0 ? 'available' : 'unavailable',
          providers: Object.freeze([...activeProviders.values()]
            .map(({ provider, actions }) => ({
              provider_id: provider.provider_id,
              automation_kind: provider.automation_kind,
              action_ids: actions.map((action) => action.action_id),
            }))
            .sort((left, right) => left.provider_id.localeCompare(right.provider_id))),
          authority_boundary: {
            provider_implementation_owner: 'framework_managed_native_provider',
            package_lifecycle_owner: 'not_applicable',
            framework_role: 'host_lifecycle_and_projection_route',
            persistence_role: 'none',
          },
        });
      },
    };
    ctx.provide(CORDIS_AUTOMATION_PROVIDER_HOST_SERVICE, service);
  },
};

const forbiddenAuthorities = Object.freeze([
  'package_installed_truth',
  'package_currentness',
  'native_carrier_lifecycle',
  'temporal_workflow_history',
  'workspace_file_bytes',
  'workspace_binding_registry',
  'ledger_evidence_persistence',
  'ledger_receipt_authority',
  'app_product_truth',
  'credential_material',
  'security_sandbox',
  'release_or_publication_authority',
]);

export const CORDIS_AUTOMATION_PROVIDER_HOST_PLUGIN_DESCRIPTOR: CordisPluginDescriptor =
  buildCordisPluginDescriptor({
    plugin_id: CORDIS_AUTOMATION_PROVIDER_HOST_PLUGIN_ID,
    plugin_api_version: CORDIS_AUTOMATION_PROVIDER_HOST_PLUGIN_API_VERSION,
    source_ref: CORDIS_AUTOMATION_PROVIDER_HOST_SOURCE_REF,
    source_commit: CORDIS_AUTOMATION_PROVIDER_HOST_SOURCE_COMMIT,
    package_ref: {
      package_id: 'opl-framework',
      package_version: '0.3.5',
      package_ref: 'workspace:opl-framework@0.3.5',
    },
    required: false,
    provides: [CORDIS_AUTOMATION_PROVIDER_HOST_SERVICE],
    injects: { required: [], optional: [] },
    events: [],
    scope: 'composition',
    trust: 'first_party_restricted',
    disposer: { required: true, boundary: 'plugin_fiber' },
    authority_boundary: { forbidden_authorities: forbiddenAuthorities },
  });

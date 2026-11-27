import { normalizeViewDescriptor } from './view.ts';
import { executeRuntimeAction, readRuntimeView, RUNTIME_PACKAGE_ID, runtimeViews } from './runtime-views.ts';
import type {
  AppStateSnapshotLike,
  CatalogProductSummary,
  CatalogViewDescriptor,
  I18nText,
  McpAppCatalog,
  McpAppHostContext,
  McpAppHostLike,
  McpAppToolCallResult,
  OpldRpcEvent,
  OpldRpcTransport,
  ProjectedPackageSummary,
} from './types.ts';

const SENSITIVE_ERROR_DATA_KEYS = new Set([
  'token',
  'secret',
  'credential',
  'credentials',
  'password',
  'authorization',
  'api_key',
  'access_token',
  'refresh_token',
  'session_token',
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function sanitizeErrorData(raw: Record<string, unknown> | null): Record<string, unknown> {
  if (!raw) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (SENSITIVE_ERROR_DATA_KEYS.has(key.toLowerCase())) continue;
    out[key] = value;
  }
  return out;
}

export class OpldRpcError extends Error {
  readonly rpcCode: number;
  readonly errorCode: string;
  readonly reasonCode?: string;
  readonly disposition?: string;
  readonly data: Readonly<Record<string, unknown>>;

  constructor(options: {
    readonly rpcCode: number;
    readonly errorCode: string;
    readonly message: string;
    readonly reasonCode?: string;
    readonly disposition?: string;
    readonly data?: Readonly<Record<string, unknown>>;
    readonly cause?: unknown;
  }) {
    super(options.message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'OpldRpcError';
    this.rpcCode = options.rpcCode;
    this.errorCode = options.errorCode;
    this.reasonCode = options.reasonCode;
    this.disposition = options.disposition;
    this.data = Object.freeze({ ...(options.data ?? {}) });
  }

  get isAuthError(): boolean {
    return this.rpcCode === -32001 || this.rpcCode === -32003;
  }

  get isTrustedHostRequired(): boolean {
    return this.errorCode === 'TRUSTED_HOST_REQUIRED';
  }

  get isGrantRequired(): boolean {
    return (
      this.errorCode === 'GRANT_NOT_FOUND'
      || this.errorCode === 'GRANT_NOT_ACTIVE'
      || this.errorCode === 'GRANT_EXPIRED'
    );
  }

  get isDigestMismatch(): boolean {
    return this.errorCode === 'CONSUMER_DIGEST_MISMATCH';
  }

  get isWorkspaceReadDenied(): boolean {
    return (
      this.errorCode === 'WORKSPACE_READ_CAPABILITY_REQUIRED'
      || this.errorCode === 'PATH_OUTSIDE_WORKSPACE'
    );
  }

  get isRevisionConflict(): boolean {
    return this.rpcCode === -32009 || this.errorCode === 'REVISION_CONFLICT';
  }

  get isUpgradeRequired(): boolean {
    return this.rpcCode === -32002 || this.errorCode === 'base_upgrade_required';
  }

  static fromJsonRpcError(err: {
    readonly code?: unknown;
    readonly message?: unknown;
    readonly data?: unknown;
  }): OpldRpcError {
    const rpcCode = typeof err.code === 'number' ? err.code : -32000;
    const message = typeof err.message === 'string' ? err.message : 'OPL daemon RPC error';
    const rawData = asRecord(err.data);
    const data = sanitizeErrorData(rawData);
    const errorCode =
      typeof data.code === 'string' && data.code.trim().length > 0
        ? data.code
        : rpcCode === -32002
          ? 'base_upgrade_required'
          : rpcCode === -32001
            ? 'UNAUTHORIZED'
            : rpcCode === -32003
              ? 'FORBIDDEN'
              : rpcCode === -32009
                ? 'REVISION_CONFLICT'
                : 'RPC_ERROR';
    const reasonCode =
      typeof data.reason_code === 'string' ? data.reason_code : undefined;
    const disposition =
      typeof data.disposition === 'string' ? data.disposition : undefined;

    return new OpldRpcError({
      rpcCode,
      errorCode,
      message,
      reasonCode,
      disposition,
      data,
    });
  }
}

export interface ReadWorkspaceContributionResult {
  readonly ok: true;
  readonly ref: 'workspace.read';
  readonly workspace_id: string;
  readonly path: string;
  readonly content: string;
  readonly encoding: 'utf8';
  readonly sha256: string;
}

export interface IssuedBindTokenResult {
  readonly token: string;
  readonly consumer_bind_token: string;
  readonly claims: Record<string, unknown>;
}

export type ConnectLoopbackResult =
  | {
      readonly status: 'completed';
      readonly result: Record<string, unknown>;
    }
  | {
      readonly status: 'access_requested';
      readonly request: Record<string, unknown>;
      readonly error: OpldRpcError;
    };

export class OpldContributionBridge {
  readonly #transport: OpldRpcTransport;

  constructor(transport: OpldRpcTransport) {
    this.#transport = transport;
  }

  get transport(): OpldRpcTransport {
    return this.#transport;
  }

  subscribeEvents(handler: (event: OpldRpcEvent) => void): () => void {
    if (!this.#transport.onEvent) {
      return () => {};
    }
    return this.#transport.onEvent(handler);
  }

  async getAppState(profile: 'fast' | 'full' = 'fast'): Promise<AppStateSnapshotLike> {
    return this.#transport.call<AppStateSnapshotLike>('app.state.get', { profile });
  }

  async getDomainDetail(input: {
    readonly itemId: string;
    readonly viewId: string;
    readonly ifRevision?: number;
  }): Promise<Record<string, unknown>> {
    return this.#transport.call<Record<string, unknown>>('app.domainDetail.get', {
      item_id: input.itemId,
      view_id: input.viewId,
      ...(input.ifRevision !== undefined ? { if_revision: input.ifRevision } : {}),
    });
  }

  async readContribution(input: {
    readonly packageId?: string;
    readonly ref: string;
    readonly input?: Record<string, unknown>;
    readonly consumerBindToken?: string;
    readonly sessionId?: string;
    readonly ifRevision?: number;
  }): Promise<Record<string, unknown>> {
    if (input.packageId === RUNTIME_PACKAGE_ID) {
      return readRuntimeView(this.#transport, input.ref, input.input ?? {});
    }
    const sessionId = input.sessionId ?? this.#transport.getSessionId?.() ?? undefined;
    return this.#transport.call<Record<string, unknown>>('app.contribution.read', {
      ...(input.packageId ? { package_id: input.packageId } : {}),
      ref: input.ref,
      ...(input.consumerBindToken ? { consumer_bind_token: input.consumerBindToken } : {}),
      ...(sessionId ? { session_id: sessionId } : {}),
      ...(input.ifRevision !== undefined ? { if_revision: input.ifRevision } : {}),
      input: input.input ?? {},
    });
  }

  async readWorkspaceFile(input: {
    readonly packageId: string;
    readonly workspaceId: string;
    readonly path: string;
    readonly consumerBindToken: string;
    readonly sessionId?: string;
  }): Promise<ReadWorkspaceContributionResult> {
    const res = await this.readContribution({
      packageId: input.packageId,
      ref: 'workspace.read',
      consumerBindToken: input.consumerBindToken,
      sessionId: input.sessionId,
      input: {
        workspace_id: input.workspaceId,
        path: input.path,
      },
    });
    return res as unknown as ReadWorkspaceContributionResult;
  }

  async executeContribution(input: {
    readonly packageId?: string;
    readonly actionId: string;
    readonly payload?: Record<string, unknown>;
    readonly dryRun?: boolean;
    readonly confirmed?: boolean;
    readonly mode?: string;
  }): Promise<Record<string, unknown>> {
    if (input.packageId === RUNTIME_PACKAGE_ID) {
      return executeRuntimeAction(this.#transport, input.actionId, input.payload ?? {}, input.confirmed === true, input.dryRun === true);
    }
    return this.#transport.call<Record<string, unknown>>('app.contribution.execute', {
      ...(input.packageId ? { package_id: input.packageId } : {}),
      action_id: input.actionId,
      payload: input.payload ?? {},
      dry_run: input.dryRun ?? false,
      ...(input.mode ? { mode: input.mode } : {}),
    });
  }

  async issueConsumerBindToken(input: {
    readonly consumerPackageId: string;
    readonly sessionId?: string;
    readonly ttlMs?: number;
  }): Promise<IssuedBindTokenResult> {
    const sessionId = input.sessionId ?? this.#transport.getSessionId?.() ?? undefined;
    const raw = await this.#transport.call<Record<string, unknown>>(
      'connect.issueConsumerBindToken',
      {
        consumer_package_id: input.consumerPackageId,
        ...(sessionId ? { session_id: sessionId } : {}),
        ...(input.ttlMs !== undefined ? { ttl_ms: input.ttlMs } : {}),
      },
    );
    const token =
      typeof raw.token === 'string'
        ? raw.token
        : typeof raw.consumer_bind_token === 'string'
          ? raw.consumer_bind_token
          : typeof raw.consumerBindToken === 'string'
            ? raw.consumerBindToken
            : '';
    return {
      token,
      consumer_bind_token: token,
      claims: asRecord(raw.claims) ?? {},
    };
  }

  async listConnections(input?: {
    readonly providerType?: string;
    readonly status?: string;
    readonly consumerPackageId?: string;
  }): Promise<Record<string, unknown>> {
    return this.#transport.call<Record<string, unknown>>('connect.list', {
      ...(input?.providerType ? { provider_type: input.providerType } : {}),
      ...(input?.status ? { status: input.status } : {}),
      ...(input?.consumerPackageId
        ? { consumer_package_id: input.consumerPackageId }
        : {}),
    });
  }

  async requestConnectAccess(input: {
    readonly consumerBindToken?: string;
    readonly consumerPackageId?: string;
    readonly sessionId?: string;
    readonly connectionId: string;
    readonly capabilityIds: readonly string[];
    readonly expiresAt?: string;
  }): Promise<Record<string, unknown>> {
    const sessionId = input.sessionId ?? this.#transport.getSessionId?.() ?? undefined;
    return this.#transport.call<Record<string, unknown>>('connect.requestAccess', {
      ...(input.consumerBindToken ? { consumer_bind_token: input.consumerBindToken } : {}),
      ...(input.consumerPackageId ? { consumer_package_id: input.consumerPackageId } : {}),
      ...(sessionId ? { session_id: sessionId } : {}),
      connection_id: input.connectionId,
      capability_ids: [...input.capabilityIds],
      ...(input.expiresAt ? { expires_at: input.expiresAt } : {}),
    });
  }

  async approveConnectRequest(input: {
    readonly requestId?: string;
    readonly grantId?: string;
    readonly approvedBy?: string;
    readonly expiresAt?: string;
    readonly reason?: string;
  }): Promise<Record<string, unknown>> {
    return this.#transport.call<Record<string, unknown>>('connect.approveRequest', {
      ...(input.requestId ? { request_id: input.requestId } : {}),
      ...(input.grantId ? { grant_id: input.grantId } : {}),
      ...(input.approvedBy ? { approved_by: input.approvedBy } : {}),
      ...(input.expiresAt ? { expires_at: input.expiresAt } : {}),
      ...(input.reason ? { reason: input.reason } : {}),
    });
  }

  async invokeConnect(input: {
    readonly consumerBindToken?: string;
    readonly consumerPackageId?: string;
    readonly sessionId?: string;
    readonly connectionId: string;
    readonly capabilityId: string;
    readonly input?: Record<string, unknown>;
    readonly auditContext?: Record<string, string>;
  }): Promise<Record<string, unknown>> {
    const sessionId = input.sessionId ?? this.#transport.getSessionId?.() ?? undefined;
    return this.#transport.call<Record<string, unknown>>('connect.invoke', {
      ...(input.consumerBindToken ? { consumer_bind_token: input.consumerBindToken } : {}),
      ...(input.consumerPackageId ? { consumer_package_id: input.consumerPackageId } : {}),
      ...(sessionId ? { session_id: sessionId } : {}),
      connection_id: input.connectionId,
      capability_id: input.capabilityId,
      input: input.input ?? {},
      ...(input.auditContext ? { audit_context: input.auditContext } : {}),
    });
  }

  async invokeConnectOrRequestAccess(input: {
    readonly consumerBindToken?: string;
    readonly consumerPackageId?: string;
    readonly sessionId?: string;
    readonly connectionId: string;
    readonly capabilityId: string;
    readonly input?: Record<string, unknown>;
    readonly auditContext?: Record<string, string>;
    readonly expiresAt?: string;
    readonly onGrantRequired?: (err: OpldRpcError) => Promise<void> | void;
  }): Promise<ConnectLoopbackResult> {
    try {
      const result = await this.invokeConnect(input);
      return { status: 'completed', result };
    } catch (error) {
      if (error instanceof OpldRpcError && error.isGrantRequired) {
        if (input.onGrantRequired) {
          await input.onGrantRequired(error);
        }
        const request = await this.requestConnectAccess({
          consumerBindToken: input.consumerBindToken,
          consumerPackageId: input.consumerPackageId,
          sessionId: input.sessionId,
          connectionId: input.connectionId,
          capabilityIds: [input.capabilityId],
          expiresAt: input.expiresAt,
        });
        return {
          status: 'access_requested',
          request,
          error,
        };
      }
      throw error;
    }
  }
}

export function createMcpAppOpldBridge(
  transport: OpldRpcTransport,
): OpldContributionBridge {
  return new OpldContributionBridge(transport);
}

export const SHARED_WORKBENCH_URI = 'ui://opl/apps.html';

export function sharedPanelEntry(pkg: Pick<ProjectedPackageSummary, 'enabled' | 'package_id' | 'ui'>) {
  if (!pkg.enabled) return undefined;
  const panels = pkg.ui?.declarative?.views?.filter(view => view.slot === 'workbench.panel');
  if (!panels?.length) return undefined;
  const navigation = [...(pkg.ui?.declarative?.navigation ?? [])]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const entry = navigation.find(item => panels.some(view => view.id === item.view_id));
  const viewId = entry?.view_id ?? [...panels].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0]!.id;
  return { resource_uri: SHARED_WORKBENCH_URI, arguments: { package_id: pkg.package_id, view_id: viewId } };
}

export function buildCatalogFromAppState(
  appState: AppStateSnapshotLike,
  options: {
    readonly includeDisabled?: boolean;
    readonly focus?: McpAppCatalog['focus'];
  } = {},
): McpAppCatalog {
  const rawPackages: readonly ProjectedPackageSummary[] =
    appState.packages
    ?? appState.installed_packages
    ?? appState.app_state?.packages
    ?? appState.app_state?.installed_packages
    ?? [];

  const packages = options.includeDisabled
    ? rawPackages
    : rawPackages.filter((pkg) => pkg.enabled !== false);

  const products: CatalogProductSummary[] = [];
  const views: CatalogViewDescriptor[] = [];

  for (const pkg of packages) {
    const pkgId = pkg.package_id || pkg.id || pkg.identity?.id || '';
    if (!pkgId || pkgId === RUNTIME_PACKAGE_ID) continue;
    const pkgName =
      pkg.name
      || pkg.identity?.name?.['en-US']
      || pkg.identity?.name?.['zh-CN']
      || pkgId;
    const pkgSummary = pkg.identity?.summary as I18nText | undefined;
    const pkgDescription = pkg.identity?.description as I18nText | undefined;
    const pkgViews: CatalogViewDescriptor[] = [];

    const declarativeViews = [...(pkg.ui?.declarative?.views ?? [])].sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
    );
    for (const v of declarativeViews) {
      pkgViews.push(
        normalizeViewDescriptor({
          package_id: pkgId,
          package_name: pkgName,
          package_summary_i18n: pkgSummary,
          package_description_i18n: pkgDescription,
          view_id: v.id,
          view_type: v.view_type,
          slot: v.slot,
          settings_destination: v.settings_destination,
          title_i18n: v.title,
          empty_state_i18n: v.empty_state,
          data_ref: v.data_ref,
          entry_kind: pkgViews.length === 0 ? 'product_entry' : 'declarative_view',
          sort_order: v.sort_order,
          commands: (v.actions ?? []).map((action) => ({
            command_id: action.id,
            action_ref: action.action_ref,
            label_i18n: action.label,
            confirmation_required: action.confirm === true,
            effect_timing: action.effect_timing,
          })),
        }),
      );
    }

    const settingsForms = [...(pkg.ui?.declarative?.settings_forms ?? [])].sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
    );
    for (const form of settingsForms) {
      pkgViews.push(
        normalizeViewDescriptor({
          package_id: pkgId,
          package_name: pkgName,
          package_summary_i18n: pkgSummary,
          package_description_i18n: pkgDescription,
          view_id: form.id,
          view_type: 'settings_form',
          slot: 'settings.section',
          settings_destination: form.destination,
          title_i18n: form.title,
          data_ref: form.data_ref,
          entry_kind: pkgViews.length === 0 ? 'product_entry' : 'settings_form',
          sort_order: form.sort_order,
          commands: [
            {
              command_id: `${form.id}.submit`,
              action_ref: form.submit_action_ref,
              label_i18n: { 'zh-CN': '保存设置', 'en-US': 'Save Settings' },
              confirmation_required: false,
            },
          ],
        }),
      );
    }

    for (const mcpApp of pkg.ui?.mcp_apps ?? []) {
      pkgViews.push(
        normalizeViewDescriptor({
          package_id: pkgId,
          package_name: pkgName,
          package_summary_i18n: pkgSummary,
          package_description_i18n: pkgDescription,
          view_id: mcpApp.id,
          view_type: 'list_detail',
          title_i18n: mcpApp.title,
          data_ref: mcpApp.resource_uri,
          dedicated_resource_uri: mcpApp.resource_uri,
          mcp_server_id: mcpApp.mcp_server_id,
          host_capabilities: mcpApp.host_capabilities,
          presentation_mode: 'dedicated_app',
          entry_kind: pkgViews.length === 0 ? 'product_entry' : 'mcp_app',
          commands: [],
        }),
      );
    }

    if (pkgViews.length > 0) {
      products.push({
        package_id: pkgId,
        package_name: pkgName,
        entry_view_id: pkgViews[0]!.view_id ?? pkgViews[0]!.id,
        entry_kind: pkgViews[0]!.entry_kind,
        ...(pkgSummary ? { package_summary_i18n: pkgSummary } : {}),
        ...(pkgDescription ? { package_description_i18n: pkgDescription } : {}),
      });
      views.push(...pkgViews);
    }
  }

  views.push(...runtimeViews(appState));
  return {
    products,
    views,
    product_count: products.length,
    view_count: views.length,
    ...(options.focus ? { focus: options.focus } : {}),
  };
}

function lookupCatalogActionConfirmation(
  catalog: McpAppCatalog,
  packageId: string,
  actionId: string,
): 'required' | 'not_required' | 'unknown' {
  if (!packageId || !actionId) return 'unknown';
  let found = false;
  for (const view of catalog.views ?? []) {
    if (view.package_id !== packageId) continue;
    for (const cmd of view.commands ?? []) {
      if (cmd.action_ref !== actionId) continue;
      found = true;
      if (Boolean(cmd.confirmation_required ?? cmd.confirm)) {
        return 'required';
      }
    }
  }
  return found ? 'not_required' : 'unknown';
}

export interface CreateOpldHostAdapterOptions {
  readonly consumerBindToken?: string;
  readonly sessionId?: string;
  readonly hostContext?: McpAppHostContext;
  readonly onOpenLink?: (url: string) => Promise<{ readonly isError?: boolean } | void>;
  readonly catalog?: McpAppCatalog;
  readonly requireConfirmationForAllActions?: boolean;
  readonly resolveActionConfirmation?: (input: {
    readonly packageId?: string;
    readonly actionId: string;
  }) => Promise<boolean | null | undefined> | boolean | null | undefined;
}

export function createOpldMcpAppHostAdapter(
  bridge: OpldContributionBridge,
  options: CreateOpldHostAdapterOptions = {},
): McpAppHostLike {
  const isActionConfirmationRequired = async (
    packageId: string | undefined,
    actionId: string,
  ): Promise<boolean> => {
    if (options.requireConfirmationForAllActions === true) {
      return true;
    }
    if (options.resolveActionConfirmation) {
      const resolved = await options.resolveActionConfirmation({ packageId, actionId });
      if (typeof resolved === 'boolean') {
        return resolved;
      }
    }
    if (!packageId || !actionId) {
      return true;
    }
    if (options.catalog) {
      const status = lookupCatalogActionConfirmation(options.catalog, packageId, actionId);
      if (status !== 'unknown') {
        return status === 'required';
      }
    }
    try {
      const appState = await bridge.getAppState('fast');
      const liveCatalog = buildCatalogFromAppState(appState);
      const status = lookupCatalogActionConfirmation(liveCatalog, packageId, actionId);
      return status === 'unknown' ? true : status === 'required';
    } catch {
      return true;
    }
  };

  const adapter: McpAppHostLike = {
    ontoolresult: null,
    onhostcontextchanged: null,
    async connect(): Promise<void> {
      // Transport is already connected or managed by caller.
    },
    getHostContext(): McpAppHostContext {
      return options.hostContext ?? {};
    },
    async callServerTool(params): Promise<McpAppToolCallResult> {
      const args = params.arguments ?? {};
      try {
        if (params.name === 'opl_app_contribution_read') {
          const packageId =
            typeof args.package_id === 'string' ? args.package_id : undefined;
          const ref = typeof args.ref === 'string' ? args.ref : '';
          const input = asRecord(args.input) ?? {};
          const consumerBindToken =
            typeof args.consumer_bind_token === 'string'
              ? args.consumer_bind_token
              : options.consumerBindToken;
          const sessionId =
            typeof args.session_id === 'string'
              ? args.session_id
              : options.sessionId;
          const res = await bridge.readContribution({
            packageId,
            ref,
            input,
            consumerBindToken,
            sessionId,
          });
          return {
            isError: false,
            structuredContent: res,
          };
        }

        if (params.name === 'opl_app_contribution_execute') {
          const packageId =
            typeof args.package_id === 'string' ? args.package_id : undefined;
          const actionId =
            typeof args.ref === 'string'
              ? args.ref
              : typeof args.action_id === 'string'
                ? args.action_id
                : '';
          const dryRun = args.dry_run === true || args.dryRun === true;
          if (args.confirmed !== true && !dryRun) {
            const requiresConfirm = await isActionConfirmationRequired(packageId, actionId);
            if (requiresConfirm) {
              return {
                isError: true,
                structuredContent: {
                  error: {
                    code: 'CONFIRMATION_REQUIRED',
                    message: 'Executing contribution action requires confirmed: true.',
                  },
                },
              };
            }
          }
          const res = await bridge.executeContribution({
            packageId,
            actionId,
            payload: asRecord(args.input ?? args.payload) ?? {},
            dryRun,
            confirmed: args.confirmed === true,
            mode: typeof args.mode === 'string' ? args.mode : undefined,
          });
          return {
            isError: false,
            structuredContent: res,
          };
        }

        if (params.name === 'open_opl_apps') {
          const appState = await bridge.getAppState('fast');
          const explicitFocus = asRecord(args.focus);
          const topLevelInput = asRecord(args.input);
          const hasTopLevelFocus =
            typeof args.package_id === 'string'
            || typeof args.view_id === 'string'
            || topLevelInput !== null;
          const focus: McpAppCatalog['focus'] | undefined = explicitFocus
            ? (explicitFocus as McpAppCatalog['focus'])
            : hasTopLevelFocus
              ? {
                  ...(typeof args.package_id === 'string'
                    ? { package_id: args.package_id }
                    : {}),
                  ...(typeof args.view_id === 'string' ? { view_id: args.view_id } : {}),
                  ...(topLevelInput ? { input: topLevelInput } : {}),
                }
              : undefined;
          const catalog = buildCatalogFromAppState(appState, { focus });
          return {
            isError: false,
            structuredContent: {
              opl_mcp_app_catalog: catalog,
            },
          };
        }

        return {
          isError: true,
          structuredContent: {
            error: {
              code: 'UNKNOWN_TOOL',
              message: `Unsupported MCP App host tool '${params.name}'.`,
            },
          },
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'OPL daemon request failed.';
        const errData =
          error instanceof OpldRpcError
            ? {
                rpcCode: error.rpcCode,
                code: error.errorCode,
                reason_code: error.reasonCode,
                disposition: error.disposition,
                ...error.data,
              }
            : { code: 'RPC_ERROR' };
        return {
          isError: true,
          structuredContent: {
            error: {
              ...errData,
              message,
            },
          },
        };
      }
    },
    async openLink(params): Promise<{ readonly isError?: boolean } | void> {
      if (options.onOpenLink) {
        return options.onOpenLink(params.url);
      }
      return { isError: false };
    },
  };
  return adapter;
}

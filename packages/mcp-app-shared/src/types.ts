import type { ClientKind } from '@opl/core';

export interface I18nText {
  readonly 'zh-CN'?: string;
  readonly 'en-US'?: string;
  readonly zh?: string;
  readonly en?: string;
  readonly [locale: string]: string | undefined;
}

export type PackageIntent = 'agent' | 'app' | 'extension' | 'channel';
export type PackageOrigin = 'opl' | 'external' | 'local_dev';
export type McpAppHostCapability = 'theme_sync' | 'workspace_read' | 'connect_package_grant';
export type DeclarativeViewType =
  | 'channel_access'
  | 'service_status'
  | 'activity_log'
  | 'list_detail'
  | 'approval_diff'
  | 'remote_companion_access'
  | 'settings_form'
  | 'task_board'
  | 'artifact_view'
  | 'timeline';

export interface V2DeclarativeAction {
  readonly id: string;
  readonly label: I18nText;
  readonly action_ref: string;
  readonly confirm?: boolean;
  readonly effect_timing?: 'immediate' | 'next_task' | 'restart_required';
}

export interface V2DeclarativeView {
  readonly id: string;
  readonly view_type: DeclarativeViewType | string;
  readonly slot: string;
  readonly settings_destination?: string;
  readonly title: I18nText;
  readonly data_ref: string;
  readonly empty_state?: I18nText;
  readonly actions?: readonly V2DeclarativeAction[];
  readonly sort_order?: number;
}

export interface V2DeclarativeSettingsForm {
  readonly id: string;
  readonly destination: string;
  readonly title: I18nText;
  readonly data_ref: string;
  readonly submit_action_ref: string;
  readonly search_keywords?: readonly string[];
  readonly sort_order?: number;
}

export interface V2DeclarativeNavigationItem {
  readonly id: string;
  readonly label: I18nText;
  readonly view_id: string;
  readonly sort_order?: number;
}

export interface V2McpAppDescriptor {
  readonly id: string;
  readonly title: I18nText;
  readonly mcp_server_id: string;
  readonly resource_uri: string;
  readonly host_capabilities?: readonly McpAppHostCapability[];
}

export interface ProjectedPackageUi {
  readonly declarative?: {
    readonly navigation?: readonly V2DeclarativeNavigationItem[];
    readonly settings_forms?: readonly V2DeclarativeSettingsForm[];
    readonly views?: readonly V2DeclarativeView[];
  };
  readonly dsh_client?: {
    readonly client_entry: string;
    readonly host_entry?: string;
    readonly slots: readonly string[];
    readonly search_keywords?: readonly string[];
  };
  readonly mcp_apps?: readonly V2McpAppDescriptor[];
}

export interface ProjectedPackageSummary {
  readonly package_id: string;
  readonly id?: string;
  readonly name: string;
  readonly version: string;
  readonly intent: PackageIntent;
  readonly origin?: PackageOrigin;
  readonly enabled: boolean;
  readonly content_digest?: string;
  readonly identity?: {
    readonly id: string;
    readonly version: string;
    readonly intent: PackageIntent;
    readonly name: I18nText;
    readonly summary?: I18nText;
    readonly description?: I18nText;
    readonly publisher?: string;
  };
  readonly ui?: ProjectedPackageUi;
  readonly provides?: Record<string, unknown>;
}

export interface AppStateSnapshotLike {
  readonly profile?: 'fast' | 'full';
  readonly revision?: number;
  readonly packages?: readonly ProjectedPackageSummary[];
  readonly installed_packages?: readonly ProjectedPackageSummary[];
  readonly workspaces?: readonly Record<string, unknown>[];
  readonly knowledge_sources?: readonly Record<string, unknown>[];
  readonly connections?: readonly Record<string, unknown>[];
  readonly tasks?: readonly Record<string, unknown>[];
  readonly schedules?: readonly Record<string, unknown>[];
  readonly app_state?: {
    readonly operator?: {
      readonly workbench?: {
        readonly work_item_projection_v2?: {
          readonly items: readonly RuntimeWorkItem[];
        };
      };
    };
    readonly packages?: readonly ProjectedPackageSummary[];
    readonly installed_packages?: readonly ProjectedPackageSummary[];
  };
}

export interface RuntimeWorkItem {
  readonly [key: string]: unknown;
  readonly item_id: string;
  readonly identity: {
    readonly agent_id: string;
    readonly project_id: string;
    readonly workspace_path: string;
    readonly work_item_id: string;
    readonly work_item_display_name: string;
    readonly work_item_kind: string;
    readonly work_item_root?: string;
  };
  readonly lifecycle: { readonly primary_state: string; readonly primary_state_label: string };
  readonly visibility: { readonly state: string; readonly generation: number };
}

export interface CatalogCommandDescriptor {
  readonly command_id: string;
  readonly action_ref: string;
  readonly label_i18n?: I18nText;
  readonly label?: I18nText;
  readonly confirmation_required?: boolean;
  readonly confirm?: boolean;
  readonly effect_timing?: 'immediate' | 'next_task' | 'restart_required';
  readonly input?: Record<string, unknown>;
  readonly defaults?: Record<string, unknown>;
  readonly summary?: string;
  readonly input_schema?: InputFieldSchema;
}

export interface CatalogViewDescriptor {
  readonly package_id: string;
  readonly package_name?: string;
  readonly package_summary_i18n?: I18nText;
  readonly package_description_i18n?: I18nText;
  readonly view_id?: string;
  readonly id?: string;
  readonly view_type?: string;
  readonly slot?: string;
  readonly settings_destination?: string;
  readonly title_i18n?: I18nText;
  readonly title?: I18nText;
  readonly empty_state_i18n?: I18nText;
  readonly empty_state?: I18nText;
  readonly data_ref: string;
  readonly commands: readonly CatalogCommandDescriptor[];
  readonly entry_kind?: string;
  readonly scope?: string;
  readonly agent_id?: string;
  readonly presentation_mode?: string;
  readonly dedicated_resource_uri?: string;
  readonly mcp_server_id?: string;
  readonly host_capabilities?: readonly McpAppHostCapability[];
  readonly sort_order?: number;
}

export interface CatalogProductSummary {
  readonly package_id: string;
  readonly package_name: string;
  readonly entry_view_id?: string;
  readonly entry_kind?: string;
  readonly package_summary_i18n?: I18nText;
  readonly package_description_i18n?: I18nText;
}

export interface McpAppCatalog {
  readonly products: readonly CatalogProductSummary[];
  readonly views: readonly CatalogViewDescriptor[];
  readonly product_count?: number;
  readonly view_count?: number;
  readonly focus?: {
    readonly package_id?: string;
    readonly view_id?: string;
    readonly input?: Record<string, unknown>;
  };
}

export interface OwnerViewDescriptor {
  readonly view_type?: string;
  readonly view_id?: string;
  readonly id?: string;
  readonly package_id?: string;
  readonly data_ref?: string;
}

export interface SourceRefLike {
  readonly ref?: string;
  readonly title?: string;
  readonly label?: string;
  readonly path?: string;
}

export interface RenderableItem {
  readonly [key: string]: unknown;
}

export interface InputSchemaProperty {
  readonly type?: string;
  readonly title?: string;
  readonly description?: string;
  readonly default?: unknown;
  readonly readOnly?: boolean;
  readonly format?: string;
  readonly enum?: readonly unknown[];
  readonly enumNames?: readonly string[];
  readonly items?: {
    readonly type?: string;
  };
  readonly properties?: Readonly<Record<string, InputSchemaProperty>>;
  readonly required?: readonly string[];
}

export interface InputFieldSchema {
  readonly type?: string;
  readonly additionalProperties?: boolean;
  readonly properties?: Readonly<Record<string, InputSchemaProperty>>;
  readonly required?: readonly string[];
}

export interface FormControlLike {
  getAttribute(name: string): string | null;
  readonly value: string;
  readonly type?: string;
  readonly checked?: boolean;
  readonly dataset: Readonly<Record<string, string | undefined>>;
}

export interface FormElementLike {
  querySelectorAll(selector: string): Iterable<FormControlLike>;
}

export interface ViewRefLike {
  readonly package_id: string;
  readonly view_id?: string;
  readonly id?: string;
  readonly data_ref?: string;
}

export interface ViewHandoffDescriptor {
  readonly package_id: string;
  readonly view_id?: string;
  readonly id?: string;
  readonly input: unknown;
}

export interface ResolvedViewHandoff<TView extends ViewRefLike = ViewRefLike> {
  readonly view: TView;
  readonly input: Record<string, unknown>;
}

export interface TrajectoryNode {
  readonly id: string;
  readonly label: string;
  readonly kind: string;
  readonly status: string;
  readonly summary?: string;
  readonly occurred_at?: string;
  readonly details?: unknown;
  readonly source_refs: readonly (string | SourceRefLike)[];
}

export interface TrajectoryEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly kind: string;
  readonly label?: string;
  readonly source_refs: readonly (string | SourceRefLike)[];
}

export interface TrajectorySnapshot {
  readonly work_item_id?: string;
  readonly study_id?: string;
  readonly surface_kind?: string;
  readonly revision: number;
  readonly summary: Record<string, unknown>;
  readonly active_branch?: { readonly label?: string };
  readonly conditions?: unknown[];
  readonly current_focus?: { readonly node_id?: string };
  readonly source_refs?: readonly (string | SourceRefLike)[];
  readonly nodes: readonly TrajectoryNode[];
  readonly edges: readonly TrajectoryEdge[];
}

export interface TrajectoryRenderOptions {
  readonly title?: string;
  readonly labels?: Readonly<Record<string, string>>;
  readonly summary_keys?: readonly string[];
  readonly evidence_node_kinds?: readonly string[];
  readonly decision_node_kinds?: readonly string[];
  readonly expected_surface_kind?: string;
}

export interface DomainViewRenderer {
  readonly schema_compatibility?: readonly string[];
  parse(payload: unknown, workItemId?: string): TrajectorySnapshot;
  component(
    snapshot: TrajectorySnapshot,
    selectedId: string | undefined,
    section: string,
    options: TrajectoryRenderOptions,
  ): string;
}

export interface ElementLike {
  textContent: string | null;
  innerHTML: string;
  className: string;
  hidden: boolean;
  disabled?: boolean;
  open?: boolean;
  value?: string;
  returnValue?: string;
  readonly tagName?: string;
  readonly type?: string;
  readonly dataset: Record<string, string | undefined>;
  readonly ownerDocument?: DocumentLike | null;
  onchange?: ((event?: unknown) => void) | null;
  onclick?: ((event?: unknown) => void) | null;
  hasAttribute(name: string): boolean;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  toggleAttribute?(name: string, force?: boolean): boolean;
  querySelector(selector: string): ElementLike | null;
  querySelectorAll(selector: string): Iterable<ElementLike>;
  closest?(selector: string): ElementLike | null;
  contains?(other: unknown): boolean;
  append(...nodes: unknown[]): void;
  remove?(): void;
  insertAdjacentHTML?(position: string, text: string): void;
  focus?(options?: { preventScroll?: boolean }): void;
  scrollIntoView?(options?: { block?: string }): void;
  showModal?(): void;
  close?(returnValue?: string): void;
  reportValidity?(): boolean;
  addEventListener(type: string, listener: (event: unknown) => void, options?: { once?: boolean }): void;
  removeEventListener(type: string, listener: (event: unknown) => void): void;
}

export interface DocumentLike {
  readonly activeElement?: unknown;
  readonly documentElement: {
    lang: string;
    readonly dataset: Record<string, string | undefined>;
  };
  readonly body: ElementLike;
  getElementById(id: string): ElementLike | null;
  createElement(tagName: string): ElementLike;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface McpAppHostContext {
  readonly theme?: string;
  readonly locale?: string;
  readonly displayMode?: string;
  readonly availableDisplayModes?: readonly string[];
  readonly styles?: {
    readonly variables?: Record<string, string>;
    readonly css?: {
      readonly fonts?: unknown;
    };
  };
}

export interface McpAppToolCallResult {
  readonly isError?: boolean;
  readonly structuredContent?: Record<string, unknown>;
  readonly content?: ReadonlyArray<{ readonly type?: string; readonly text?: string }>;
}

export interface McpAppHostLike {
  ontoolresult?: ((params: McpAppToolCallResult) => void) | null;
  onhostcontextchanged?: ((context: McpAppHostContext) => void) | null;
  connect?(): Promise<void>;
  getHostContext?(): McpAppHostContext | undefined;
  callServerTool(params: {
    readonly name: string;
    readonly arguments: Record<string, unknown>;
  }): Promise<McpAppToolCallResult>;
  updateModelContext?(params: {
    readonly content?: ReadonlyArray<{ readonly type: string; readonly text: string }>;
    readonly structuredContent?: Record<string, unknown>;
  }): Promise<void>;
  openLink?(params: { readonly url: string }): Promise<{ readonly isError?: boolean } | void>;
  requestDisplayMode?(params: { readonly mode: string }): Promise<void>;
}

export interface OpldRpcEvent {
  readonly method: string;
  readonly params: Record<string, unknown>;
}

export interface OpldRpcTransport {
  call<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
  onEvent?(handler: (event: OpldRpcEvent) => void): () => void;
  getSessionId?(): string | null;
  getClientKind?(): ClientKind | null;
}

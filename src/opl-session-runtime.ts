type JsonRecord = Record<string, unknown>;

export type OplInteractionSurfaceId =
  | 'opl_shell'
  | 'codex_explicit'
  | 'acp_shell'
  | 'product_api_projection';

export interface OplInteractionSurfaceDescriptor {
  surface_id: OplInteractionSurfaceId;
  label: string;
  surface_kind: 'shell' | 'bridge' | 'api_projection';
  summary: string;
}

export interface OplRuntimeResourceNodeInput {
  id: string;
  label: string;
  owner: string;
  status: string;
  summary: string;
  tags?: string[];
  metadata?: JsonRecord | null;
}

export interface OplRuntimeResourceNode {
  id: string;
  label: string;
  owner: string;
  status: string;
  summary: string;
  tags: string[];
  metadata?: JsonRecord;
}

export interface BuildOplRuntimeCoreResourceModelInput {
  system: OplRuntimeResourceNodeInput;
  engines: OplRuntimeResourceNodeInput[];
  modules: OplRuntimeResourceNodeInput[];
  agents: OplRuntimeResourceNodeInput[];
  workspaces: OplRuntimeResourceNodeInput[];
  sessions: OplRuntimeResourceNodeInput[];
  progress: OplRuntimeResourceNodeInput[];
  artifacts: OplRuntimeResourceNodeInput[];
}

export interface BuildOplSessionRuntimeDescriptorInput {
  runtime_id: string;
  summary: string;
  default_executor: string;
  fallback_executors?: string[];
  interaction_surfaces?: OplInteractionSurfaceId[];
  resources: BuildOplRuntimeCoreResourceModelInput;
}

interface BuildOplSessionRuntimeCatalogInput {
  summary: string;
  runtimes: ReturnType<typeof buildOplSessionRuntimeDescriptor>[];
}

const CANONICAL_INTERACTION_SURFACES: Record<OplInteractionSurfaceId, OplInteractionSurfaceDescriptor> = {
  opl_shell: {
    surface_id: 'opl_shell',
    label: 'OPL shell',
    surface_kind: 'shell',
    summary: 'Runtime-first interactive shell for canonical OPL session entry.',
  },
  codex_explicit: {
    surface_id: 'codex_explicit',
    label: 'Codex explicit',
    surface_kind: 'shell',
    summary: 'Explicit Codex command lane that shares the same OPL session runtime contracts.',
  },
  acp_shell: {
    surface_id: 'acp_shell',
    label: 'ACP shell',
    surface_kind: 'bridge',
    summary: 'ACP bridge shell lane that reuses the same interaction/execution descriptor.',
  },
  product_api_projection: {
    surface_id: 'product_api_projection',
    label: 'Product API projection',
    surface_kind: 'api_projection',
    summary: 'Product entry projection surface aligned to the same runtime descriptor and naming.',
  },
};

const CANONICAL_INTERACTION_SURFACE_ORDER: OplInteractionSurfaceId[] = [
  'opl_shell',
  'codex_explicit',
  'acp_shell',
  'product_api_projection',
];

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function requireString(value: unknown, field: string) {
  const text = optionalString(value);
  if (!text) {
    throw new Error(`opl session runtime 缺少字符串字段: ${field}`);
  }
  return text;
}

function readStringList(value: unknown, field: string) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }
  return value.map((entry, index) => requireString(entry, `${field}[${index}]`));
}

function uniqueStringList(values: string[], field: string) {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new Error(`opl session runtime 字段 ${field} 存在重复值: ${value}`);
    }
    seen.add(value);
  }
}

function isOplInteractionSurfaceId(value: unknown): value is OplInteractionSurfaceId {
  return (
    value === 'opl_shell' ||
    value === 'codex_explicit' ||
    value === 'acp_shell' ||
    value === 'product_api_projection'
  );
}

function buildResourceNode(
  input: OplRuntimeResourceNodeInput,
  field: string,
): OplRuntimeResourceNode {
  return {
    id: requireString(input.id, `${field}.id`),
    label: requireString(input.label, `${field}.label`),
    owner: requireString(input.owner, `${field}.owner`),
    status: requireString(input.status, `${field}.status`),
    summary: requireString(input.summary, `${field}.summary`),
    tags: readStringList(input.tags, `${field}.tags`),
    ...(isRecord(input.metadata) ? { metadata: { ...input.metadata } } : {}),
  };
}

function buildResourceList(input: OplRuntimeResourceNodeInput[], field: string) {
  const nodes = input.map((entry, index) => buildResourceNode(entry, `${field}[${index}]`));
  nodes.sort((left, right) => left.id.localeCompare(right.id));
  uniqueStringList(
    nodes.map((node) => node.id),
    `${field}.id`,
  );
  return nodes;
}

export function listCanonicalInteractionSurfaces() {
  return CANONICAL_INTERACTION_SURFACE_ORDER.map(
    (surfaceId) => CANONICAL_INTERACTION_SURFACES[surfaceId],
  );
}

export function buildInteractionSurfaceCatalog(
  input: OplInteractionSurfaceId[] = CANONICAL_INTERACTION_SURFACE_ORDER,
) {
  const uniqueInput = new Set<OplInteractionSurfaceId>();
  for (const surfaceId of input) {
    if (!isOplInteractionSurfaceId(surfaceId)) {
      throw new Error(`opl session runtime 包含未知 interaction surface: ${String(surfaceId)}`);
    }
    if (uniqueInput.has(surfaceId)) {
      throw new Error(`opl session runtime interaction surfaces 存在重复值: ${surfaceId}`);
    }
    uniqueInput.add(surfaceId);
  }

  return CANONICAL_INTERACTION_SURFACE_ORDER.filter((surfaceId) => uniqueInput.has(surfaceId)).map(
    (surfaceId) => CANONICAL_INTERACTION_SURFACES[surfaceId],
  );
}

export function buildExecutorPolicy(input: {
  default_executor: string;
  fallback_executors?: string[];
}) {
  const defaultExecutor = requireString(input.default_executor, 'default_executor');
  const fallbackExecutors = readStringList(input.fallback_executors, 'fallback_executors').sort((a, b) =>
    a.localeCompare(b),
  );
  uniqueStringList(fallbackExecutors, 'fallback_executors');
  if (fallbackExecutors.includes(defaultExecutor)) {
    throw new Error('opl session runtime fallback_executors 不能包含 default_executor。');
  }

  return {
    default_executor: defaultExecutor,
    fallback_executors: fallbackExecutors,
    semantics: {
      default_rule: 'prefer_default_executor',
      fallback_rule: 'sequential_failover',
      fail_closed: 'no_implicit_executor_inference',
    } as const,
  };
}

export function buildOplRuntimeCoreResourceModel(input: BuildOplRuntimeCoreResourceModelInput) {
  return {
    system: buildResourceNode(input.system, 'system'),
    engines: buildResourceList(input.engines, 'engines'),
    modules: buildResourceList(input.modules, 'modules'),
    agents: buildResourceList(input.agents, 'agents'),
    workspaces: buildResourceList(input.workspaces, 'workspaces'),
    sessions: buildResourceList(input.sessions, 'sessions'),
    progress: buildResourceList(input.progress, 'progress'),
    artifacts: buildResourceList(input.artifacts, 'artifacts'),
  };
}

export function buildOplSessionRuntimeDescriptor(input: BuildOplSessionRuntimeDescriptorInput) {
  return {
    surface_kind: 'opl_session_runtime_descriptor' as const,
    version: 'opl_session_runtime.v1' as const,
    runtime_id: requireString(input.runtime_id, 'runtime_id'),
    summary: requireString(input.summary, 'summary'),
    interaction_surfaces: buildInteractionSurfaceCatalog(input.interaction_surfaces),
    executor_policy: buildExecutorPolicy({
      default_executor: input.default_executor,
      fallback_executors: input.fallback_executors,
    }),
    resources: buildOplRuntimeCoreResourceModel(input.resources),
  };
}

export function buildOplSessionRuntimeCatalog(input: BuildOplSessionRuntimeCatalogInput) {
  if (!Array.isArray(input.runtimes) || input.runtimes.length === 0) {
    throw new Error('opl session runtime catalog 需要至少一个 runtime descriptor。');
  }

  const runtimes = input.runtimes
    .map((runtime, index) => {
      if (runtime.surface_kind !== 'opl_session_runtime_descriptor') {
        throw new Error(`opl session runtime catalog runtimes[${index}] 不是合法 descriptor。`);
      }
      return {
        ...runtime,
        interaction_surfaces: buildInteractionSurfaceCatalog(
          runtime.interaction_surfaces.map((surface) => surface.surface_id),
        ),
        executor_policy: buildExecutorPolicy(runtime.executor_policy),
        resources: buildOplRuntimeCoreResourceModel(runtime.resources),
      };
    })
    .sort((left, right) => left.runtime_id.localeCompare(right.runtime_id));

  uniqueStringList(
    runtimes.map((runtime) => runtime.runtime_id),
    'runtimes.runtime_id',
  );

  return {
    surface_kind: 'opl_session_runtime_catalog' as const,
    version: 'opl_session_runtime.v1' as const,
    summary: requireString(input.summary, 'summary'),
    canonical_interaction_surfaces: listCanonicalInteractionSurfaces(),
    runtimes,
  };
}

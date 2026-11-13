import {
  discoverInstalledPackageDescriptors,
  installedDescriptorSupportsFrameworkCalls,
  type InstalledPackageDescriptor,
} from '../../adapters/integration/index.ts';
import { isRecord } from '../../kernel/contract-validation.ts';
import { buildDomainDetailViewReadback } from './domain-detail-view.ts';
import { buildWorkItemProjectionV2 } from './work-item-projection/projection.ts';
import { runtimeActionsForItem } from './app-mcp-runtime-actions.ts';
import { readMcpAppKnowledgeSources } from './app-mcp-knowledge.ts';
import { miniAppPresentation } from '../../adapters/integration/agent-package-registry-parts/miniapp-presentation.ts';

export const OPL_MCP_APP_SERVER_ID = 'opl-apps';
export const OPL_MCP_APP_RESOURCE_URI = 'ui://opl/apps.html';
export const OPL_RUNTIME_PACKAGE_ID = 'opl-runtime';
export const OPL_RUNTIME_REFS = {
  workItems: 'opl.runtime.v1#work-items',
  item: 'opl.runtime.v1#item',
  domainDetail: 'opl.runtime.v1#domain-detail',
  knowledge: 'opl.runtime.v1#knowledge',
} as const;
export const OPL_MCP_APP_TOOL_NAMES = {
  open: 'open_opl_apps',
  read: 'opl_app_contribution_read',
  execute: 'opl_app_contribution_execute',
} as const;

type JsonRecord = Record<string, unknown>;

type DescriptorDiscovery = Pick<
  { discover: typeof discoverInstalledPackageDescriptors },
  'discover'
>;

const FRAMEWORK_RUNTIME_VIEWS = [
  {
    package_id: OPL_RUNTIME_PACKAGE_ID,
    package_name: 'OPL Runtime',
    view_id: 'opl.runtime.work-items',
    view_type: 'task_board',
    title_i18n: {
      'zh-CN': '当前任务',
      'en-US': 'Current work',
    },
    data_ref: OPL_RUNTIME_REFS.workItems,
    empty_state_i18n: {
      'zh-CN': '当前没有已登记任务',
      'en-US': 'No registered work items are available',
    },
    commands: [],
    slot: 'runtime.detail',
    scope: 'root',
    sort_order: -1000,
    framework_owned: true,
  },
  {
    package_id: OPL_RUNTIME_PACKAGE_ID,
    package_name: 'OPL Runtime',
    view_id: 'opl.runtime.item',
    view_type: 'list_detail',
    title_i18n: {
      'zh-CN': '任务详情',
      'en-US': 'Work item detail',
    },
    data_ref: OPL_RUNTIME_REFS.item,
    empty_state_i18n: {
      'zh-CN': '请指定一个任务',
      'en-US': 'Select a work item',
    },
    commands: [],
    slot: 'runtime.detail',
    scope: 'work_item',
    sort_order: -999,
    framework_owned: true,
  },
  {
    package_id: OPL_RUNTIME_PACKAGE_ID,
    package_name: 'OPL Runtime',
    view_id: 'opl.runtime.knowledge',
    view_type: 'list_detail',
    title_i18n: { 'zh-CN': '阶段知识来源', 'en-US': 'Task knowledge sources' },
    data_ref: OPL_RUNTIME_REFS.knowledge,
    empty_state_i18n: { 'zh-CN': '此阶段没有选用知识', 'en-US': 'No knowledge selected for this stage' },
    commands: [],
    slot: 'runtime.detail',
    scope: 'work_item',
    sort_order: -998,
    framework_owned: true,
  },
] satisfies JsonRecord[];

function localizedText(value: unknown) {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([, text]) => typeof text === 'string' && text.trim().length > 0),
  );
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    : [];
}

function contributionPlacement(descriptor: InstalledPackageDescriptor, viewId: string) {
  const placements = descriptor.manifest.app_contributions?.ui ?? [];
  return placements
    .filter((entry) => entry.contribution_kind === 'view' && entry.view_id === viewId)
    .sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0))[0] ?? null;
}

function viewCommands(
  descriptor: InstalledPackageDescriptor,
  view: NonNullable<InstalledPackageDescriptor['manifest']['app_contributions']>['views'][number],
) {
  const declared = new Map(
    (descriptor.manifest.app_contributions?.commands ?? [])
      .map((command) => [command.command_id, command]),
  );
  return stringArray(view.command_ids).flatMap((commandId) => {
    const command = declared.get(commandId);
    return command
      ? [{
          command_id: command.command_id,
          label_i18n: localizedText(command.label_i18n),
          action_ref: command.action_ref,
          confirmation_required: command.confirmation_required === true,
        }]
      : [];
  });
}

function projectedViews(descriptor: InstalledPackageDescriptor) {
  const contributions = descriptor.manifest.app_contributions;
  if (!contributions) return [];
  const miniapp = miniAppPresentation(descriptor.manifest, 'product_entry');
  const description = descriptor.manifest.presentation?.description_i18n ?? {};
  const sessionSummary = descriptor.manifest.presentation?.session_routing_summary_i18n ?? {};
  return contributions.views.flatMap((view) => {
    const placement = contributionPlacement(descriptor, view.view_id);
    return [{
      package_id: descriptor.manifest.package_id,
      agent_id: descriptor.manifest.agent_id,
      package_name: descriptor.manifest.display_name ?? descriptor.manifest.package_id,
      package_description_i18n: localizedText(description),
      package_summary_i18n: localizedText(sessionSummary),
      ...miniapp,
      view_id: view.view_id,
      view_type: view.view_type,
      title_i18n: localizedText(view.title_i18n),
      data_ref: view.data_ref,
      empty_state_i18n: localizedText(view.empty_state_i18n),
      commands: viewCommands(descriptor, view),
      slot: placement?.slot ?? null,
      scope: placement?.scope ?? null,
      sort_order: placement?.sort_order ?? 10000,
    } satisfies JsonRecord];
  });
}

function projectedRuntimeViews() {
  return FRAMEWORK_RUNTIME_VIEWS.map((view) => ({
    ...view,
    agent_id: null,
    package_description_i18n: {
      'zh-CN': 'OPL 运行时任务、上下文与阶段知识的通用入口。',
      'en-US': 'Shared runtime views for work, context, and stage knowledge.',
    },
    package_summary_i18n: {
      'zh-CN': '查看当前运行中的任务与上下文。',
      'en-US': 'Inspect current runtime work and context.',
    },
    ...miniAppPresentation(null, 'runtime_view'),
  }));
}

export function listOplMcpAppViews(input: {
  descriptorDiscovery?: DescriptorDiscovery;
  packageId?: string;
} = {}) {
  const descriptors = (input.descriptorDiscovery ?? {
    discover: discoverInstalledPackageDescriptors,
  }).discover(input.packageId ? { packageId: input.packageId } : {});
  const packageViews = [...descriptors.values()]
    .filter((descriptor) => (
      descriptor.readiness.installed
      && installedDescriptorSupportsFrameworkCalls(descriptor)
      && descriptor.manifest.app_contributions
      && descriptor.manifest.codex_surface.app_contribution_abi
    ))
    .flatMap(projectedViews)
    .sort((left, right) => (
      Number(left.sort_order) - Number(right.sort_order)
      || String(left.package_name).localeCompare(String(right.package_name))
      || String(left.view_id).localeCompare(String(right.view_id))
    ));
  const runtimeViews = input.packageId && input.packageId !== OPL_RUNTIME_PACKAGE_ID
    ? []
    : projectedRuntimeViews();
  const views = [...runtimeViews, ...packageViews];
  const products = [...new Map(views.map((view) => [String(view.package_id), view])).values()]
    .map((view) => {
      const packageViewsForEntry = views.filter((candidate) => candidate.package_id === view.package_id);
      const entryViewId = String(view.entry_view_id ?? packageViewsForEntry[0]?.view_id ?? '');
      const entryView = packageViewsForEntry.find((candidate) => candidate.view_id === entryViewId)
        ?? packageViewsForEntry[0]
        ?? view;
      return {
        package_id: view.package_id,
        agent_id: view.agent_id ?? null,
        package_name: view.package_name,
        package_description_i18n: view.package_description_i18n ?? {},
        package_summary_i18n: view.package_summary_i18n ?? {},
        presentation_mode: view.presentation_mode,
        entry_kind: view.entry_kind,
        direct_entry: view.direct_entry === true,
        ...(view.dedicated_resource_uri ? { dedicated_resource_uri: view.dedicated_resource_uri } : {}),
        entry_view_id: entryView.view_id,
        view_count: packageViewsForEntry.length,
      };
    })
    .sort((left, right) => (
      (left.entry_kind === right.entry_kind
        ? 0
        : left.entry_kind === 'runtime_view' ? -1 : 1)
      || String(left.package_name).localeCompare(String(right.package_name))
    ));
  return {
    surface_kind: 'opl_mcp_app_view_catalog.v1',
    server_id: OPL_MCP_APP_SERVER_ID,
    package_filter: input.packageId ?? null,
    view_count: views.length,
    product_count: products.length,
    products,
    views,
    authority_boundary: {
      catalog_owner: 'one-person-lab',
      package_identity_owner: 'installed_package_descriptor',
      data_truth_owner: 'installed_package_owner',
      renderer_role: 'generic_structured_view_consumer',
      arbitrary_package_html_allowed: false,
      direct_domain_mutation_allowed: false,
      framework_runtime_projection_allowed: true,
    },
  };
}

function ownerEnvelope(ref: string, result: JsonRecord) {
  return {
    opl_app_contribution: {
      surface_kind: 'opl_app_package_contribution.v1',
      package_id: OPL_RUNTIME_PACKAGE_ID,
      ref,
      operation: 'read',
      confirmation_required: false,
      carrier_readback: {
        kind: 'framework_owned_projection',
        identity: OPL_MCP_APP_SERVER_ID,
        lifecycle_authority: 'framework_owned',
      },
      readiness: {
        installed: true,
        physical_status: 'available',
        callability: 'callable',
      },
      response: {
        schema_version: 'opl-package-app-contribution-response.v1',
        ok: true,
        ref,
        operation: 'read',
        result,
      },
    },
  };
}

function inputRequired(ref: string, reason: string, inputSchema: JsonRecord) {
  return ownerEnvelope(ref, {
    state: 'input_required',
    reason,
    input_schema: inputSchema,
  });
}

function projectionItem(item: ReturnType<typeof buildWorkItemProjectionV2>['items'][number]) {
  const stage = item.lifecycle.current_stage_display_name
    ?? item.lifecycle.current_stage_id
    ?? '未登记阶段';
  return {
    id: item.item_id,
    title: item.identity.work_item_display_name,
    summary: `${item.identity.agent_display_name} · ${stage} · ${item.lifecycle.primary_state_label}`,
    status: item.lifecycle.primary_state,
    agent_id: item.identity.agent_id,
    domain_id: item.identity.domain_id,
    project_id: item.identity.project_id,
    work_item_id: item.identity.work_item_id,
    work_item_identity: {
      agent_id: item.identity.agent_id,
      domain_id: item.identity.domain_id,
      work_item_id: item.identity.work_item_id,
      domain_work_item_id: item.identity.domain_work_item_id,
      work_item_scope_id: item.identity.work_item_scope_id,
      identity_state: item.identity.identity_state,
    },
    workspace_path: item.identity.workspace_path,
    work_item_root: item.identity.work_item_root,
    stage_id: item.lifecycle.current_stage_id,
    current_owner: item.action.owner_display_name,
    next_action: item.action,
    source_refs: item.source_refs.map((entry) => entry.ref),
    freshness: item.freshness,
    domain_detail_views: item.domain_detail_views ?? [],
  };
}

export function readFrameworkMcpAppContribution(input: {
  ref: string;
  input: JsonRecord;
  projection?: ReturnType<typeof buildWorkItemProjectionV2>;
  runtimeSnapshot?: JsonRecord;
  runtimeActionsUnavailable?: string;
  descriptorDiscovery?: DescriptorDiscovery;
  knowledgeReader?: typeof readMcpAppKnowledgeSources;
}) {
  if (input.ref === OPL_RUNTIME_REFS.knowledge) {
    const itemId = typeof input.input.item_id === 'string' ? input.input.item_id.trim() : '';
    if (!itemId) return inputRequired(input.ref, '选择任务以查看当前阶段的知识来源。', {
      type: 'object', required: ['item_id'], properties: { item_id: { type: 'string', title: '任务' } },
      additionalProperties: false,
    });
    const projection = input.projection ?? buildWorkItemProjectionV2({ profile: 'fast' });
    const matches = projection.items.filter(item => item.item_id === itemId && item.visibility.state === 'visible');
    const item = matches.length === 1 ? matches[0] : null;
    const stage = item?.lifecycle.current_stage_id;
    if (!item || !stage) return ownerEnvelope(input.ref, {
      state: 'unavailable', reason: item ? 'work_item_stage_unavailable' : 'work_item_not_found', data: { items: [] },
    });
    const descriptors = (input.descriptorDiscovery ?? { discover: discoverInstalledPackageDescriptors }).discover();
    const owners = [...descriptors.values()].filter(descriptor =>
      descriptor.manifest.agent_id === item.identity.agent_id && descriptor.readiness.installed
      && installedDescriptorSupportsFrameworkCalls(descriptor));
    if (owners.length !== 1) return ownerEnvelope(input.ref, {
      state: 'unavailable', reason: 'knowledge_owner_not_callable', data: { items: [] },
    });
    return ownerEnvelope(input.ref, (input.knowledgeReader ?? readMcpAppKnowledgeSources)({
      repoDir: owners[0]!.sourcePath,
      domainId: item.identity.domain_id,
      stageId: stage,
      workspaceRoot: item.identity.workspace_path,
      projectRoot: item.identity.work_item_root,
    }));
  }
  if (input.ref === OPL_RUNTIME_REFS.workItems) {
    const projection = input.projection ?? buildWorkItemProjectionV2({ profile: 'fast' });
    const items = projection.items
      .filter((item) => item.visibility.state === 'visible')
      .map(projectionItem);
    return ownerEnvelope(input.ref, {
      state: 'ready',
      data: {
        items,
        pagination: {
          total: items.length,
          limit: 100,
          truncated: false,
        },
      },
      summary: projection.summary,
    });
  }
  if (input.ref === OPL_RUNTIME_REFS.item) {
    const itemId = typeof input.input.item_id === 'string' ? input.input.item_id.trim() : '';
    const workItemId = typeof input.input.work_item_id === 'string'
      ? input.input.work_item_id.trim()
      : '';
    if (!itemId && !workItemId) {
      return inputRequired(input.ref, '选择一个任务后读取详情。', {
        type: 'object',
        required: ['item_id'],
        properties: {
          item_id: {
            type: 'string',
            title: 'Canonical item id',
            description: 'Use an id returned by opl.runtime.v1#work-items.',
          },
        },
        additionalProperties: false,
      });
    }
    const projection = input.projection ?? buildWorkItemProjectionV2({ profile: 'full' });
    const matches = projection.items.filter((item) => (
      itemId
        ? item.item_id === itemId
        : item.identity.work_item_id === workItemId
    ));
    if (matches.length !== 1) {
      return ownerEnvelope(input.ref, {
        state: 'unavailable',
        reason: matches.length === 0 ? 'work_item_not_found' : 'work_item_ambiguous',
        data: { items: [], match_count: matches.length },
      });
    }
    return ownerEnvelope(input.ref, {
      state: 'ready',
      data: {
        items: [projectionItem(matches[0]!)],
        detail: {
          ...matches[0],
          runtime_actions: input.runtimeSnapshot
            ? runtimeActionsForItem(matches[0]!, input.runtimeSnapshot)
            : [],
          ...(input.runtimeActionsUnavailable
            ? { runtime_actions_unavailable: input.runtimeActionsUnavailable }
            : {}),
        },
      },
    });
  }
  if (input.ref === OPL_RUNTIME_REFS.domainDetail) {
    const itemId = typeof input.input.item_id === 'string' ? input.input.item_id.trim() : '';
    const viewId = typeof input.input.view_id === 'string' ? input.input.view_id.trim() : '';
    if (!itemId || !viewId) {
      return inputRequired(input.ref, '选择一个任务及其已声明详情视图。', {
        type: 'object',
        required: ['item_id', 'view_id'],
        properties: {
          item_id: { type: 'string', title: 'Canonical item id' },
          view_id: { type: 'string', title: 'Domain detail view id' },
          if_revision: { type: 'integer', minimum: 0 },
        },
        additionalProperties: false,
      });
    }
    const readback = buildDomainDetailViewReadback({
      itemId,
      viewId,
      ifRevision: Number.isSafeInteger(input.input.if_revision)
        ? Number(input.input.if_revision)
        : null,
    });
    return ownerEnvelope(input.ref, {
      state: readback.availability === 'available' ? 'ready' : 'unavailable',
      reason: readback.availability === 'available' ? null : readback.availability,
      data: {
        items: readback.availability === 'available'
          ? [{
              id: `${itemId}:${viewId}`,
              title: viewId,
              summary: readback.payload_schema ?? readback.view_kind,
              status: readback.availability,
              evidence_refs: readback.digest ? [readback.digest] : [],
            }]
          : [],
        detail: readback,
      },
    });
  }
  return ownerEnvelope(input.ref, {
    state: 'unavailable',
    reason: 'framework_runtime_ref_not_declared',
  });
}

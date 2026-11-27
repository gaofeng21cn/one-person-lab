import { DaemonRpcError } from '../../errors.ts';
import type { RpcHandler } from '../../server/socket-server.ts';
import type { DaemonRuntime } from '../../state/runtime.ts';
import { pickOptionalString, pickRecord, pickString } from '../../utils/normalize.ts';
import { requireTrustedHost } from '../context.ts';

export function registerWorkspaceRoutes(handlers: Map<string, RpcHandler>, runtime: DaemonRuntime): void {
  const handleWorkspaceInit: RpcHandler = (params, conn) => {
    requireTrustedHost(conn, 'workspace.init');
    const rootPath = pickString(params, 'root_path', 'rootPath', 'path') ?? '';
    const name = pickString(params, 'name');
    const domainId = pickString(params, 'domain_id', 'domainId');
    const metadata = pickRecord(params, 'metadata');
    const ws = runtime.workspaceService.initWorkspace({
      root_path: rootPath,
      name,
      domain_id: domainId ?? null,
      metadata,
    });
    return { ...ws, workspace: ws };
  };
  handlers.set('workspace.init', handleWorkspaceInit);
  handlers.set('workspace.create', handleWorkspaceInit);

  handlers.set('workspace.list', () => ({
    workspaces: runtime.workspaceService.listWorkspaces(),
  }));

  handlers.set('workspace.inspect', (params) => {
    const workspaceId = pickString(params, 'workspace_id', 'workspaceId', 'id') ?? '';
    if (!workspaceId) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'workspace.inspect requires workspace_id.');
    }
    return runtime.workspaceService.inspectWorkspace(workspaceId);
  });

  const handleSourcesBind: RpcHandler = (params, conn) => {
    requireTrustedHost(conn, 'workspace.sources.bind');
    const workspaceId = pickString(params, 'workspace_id', 'workspaceId');
    const scope = (pickString(params, 'scope') ?? 'project_local') as
      | 'personal_profile'
      | 'long_term_topic'
      | 'project_local';
    const adapterKind = pickString(params, 'adapter_kind', 'adapterKind', 'adapter') ?? 'local_dir';
    const rootPath = pickString(params, 'root_path', 'rootPath', 'path') ?? '';
    const acceptedRevision = pickString(params, 'accepted_revision', 'acceptedRevision');
    const src = runtime.workspaceService.bindSource({
      workspace_id: workspaceId,
      scope,
      adapter_kind: adapterKind,
      root_path: rootPath,
      accepted_revision: acceptedRevision,
    });
    return { ...src, source: src };
  };
  handlers.set('workspace.sources.bind', handleSourcesBind);
  handlers.set('workspace.knowledge.bind', handleSourcesBind);

  const handleSourcesList: RpcHandler = (params) => {
    const workspaceId = pickString(params, 'workspace_id', 'workspaceId');
    return {
      sources: runtime.workspaceService.listSources(workspaceId),
    };
  };
  handlers.set('workspace.knowledge.list', handleSourcesList);
  handlers.set('workspace.sources.list', handleSourcesList);

  const handleSourcesRemove: RpcHandler = (params, conn) => {
    requireTrustedHost(conn, 'workspace.sources.remove');
    const sourceId = pickString(params, 'source_id', 'sourceId') ?? '';
    const workspaceId = pickString(params, 'workspace_id', 'workspaceId');
    if (!sourceId) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'workspace.sources.remove requires source_id.');
    }
    return runtime.workspaceService.removeSource({
      source_id: sourceId,
      workspace_id: workspaceId,
    });
  };
  handlers.set('workspace.sources.remove', handleSourcesRemove);
  handlers.set('workspace.knowledge.unbind', handleSourcesRemove);

  const handleSnapshotsCreate: RpcHandler = (params) => {
    const workspaceId = pickString(params, 'workspace_id', 'workspaceId');
    const stageRunId = pickString(params, 'stage_run_id', 'stageRunId') ?? '';
    const sourceId = pickString(params, 'source_id', 'sourceId');
    return runtime.workspaceService.createSnapshot({
      workspace_id: workspaceId,
      stage_run_id: stageRunId,
      source_id: sourceId,
    });
  };
  handlers.set('workspace.snapshots.create', handleSnapshotsCreate);
  handlers.set('workspace.knowledge.snapshot', handleSnapshotsCreate);

  const handleWritebackPropose: RpcHandler = (params) => {
    const workspaceId = pickString(params, 'workspace_id', 'workspaceId');
    const sourceId = pickString(params, 'source_id', 'sourceId') ?? '';
    const targetPath = pickString(params, 'target_path', 'targetPath') ?? '';
    const content = pickOptionalString(params, 'content') ?? '';
    const acceptedRevision = pickString(params, 'accepted_revision', 'acceptedRevision');
    return runtime.workspaceService.proposeWriteback({
      workspace_id: workspaceId,
      source_id: sourceId,
      target_path: targetPath,
      content,
      accepted_revision: acceptedRevision,
    });
  };
  handlers.set('workspace.writeback.propose', handleWritebackPropose);
  handlers.set('workspace.knowledge.proposeWriteback', handleWritebackPropose);

  const handleWritebackCommit: RpcHandler = (params, conn) => {
    requireTrustedHost(conn, 'workspace.writeback.commit');
    const proposalId = pickString(params, 'proposal_id', 'proposalId');
    const workspaceId = pickString(params, 'workspace_id', 'workspaceId');
    const sourceId = pickString(params, 'source_id', 'sourceId');
    const targetPath = pickString(params, 'target_path', 'targetPath');
    const content = pickOptionalString(params, 'content');
    const acceptedRevision = pickString(params, 'accepted_revision', 'acceptedRevision');
    if (content === undefined) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'workspace.writeback.commit requires content.');
    }
    return runtime.workspaceService.commitWriteback({
      proposal_id: proposalId,
      workspace_id: workspaceId,
      source_id: sourceId,
      target_path: targetPath,
      content,
      accepted_revision: acceptedRevision,
    });
  };
  handlers.set('workspace.writeback.commit', handleWritebackCommit);
  handlers.set('workspace.knowledge.commitWriteback', handleWritebackCommit);
}

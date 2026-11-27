import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { isRecord, type ClientContext } from '@opl/core';
import type { ConnectService } from '@opl/connect';
import { isWithinDirectory, type PackService } from '@opl/pack';
import type { WorkspaceService } from '@opl/workspace';
import { DaemonRpcError } from '../errors.ts';
import { runModuleOrCommandEntrypoint } from '../utils/subprocess-esm.ts';
import type { AppStateCache } from '../state/app-state-cache.ts';

const MAX_WORKSPACE_READ_BYTES = 1024 * 1024;

export interface ContributionReadRequest {
  readonly callerSessionId: string;
  readonly clientContext: ClientContext;
  readonly packageId?: string;
  readonly ref: string;
  readonly consumerBindToken?: string;
  readonly explicitSessionId?: string;
  readonly ifRevision?: number;
  readonly input: Record<string, unknown>;
}

export interface ContributionExecuteRequest {
  readonly callerSessionId: string;
  readonly clientContext: ClientContext;
  readonly packageId?: string;
  readonly actionId: string;
  readonly payload: Record<string, unknown>;
  readonly dryRun: boolean;
  readonly confirmed?: boolean;
  readonly mode?: string;
}

export class ContributionDispatcher {
  readonly #packService: PackService;
  readonly #connectService: ConnectService;
  readonly #workspaceService: WorkspaceService;
  readonly #isAppPackageEnabled: (packageId: string) => boolean;
  readonly #appStateCache?: AppStateCache;

  constructor(options: {
    readonly packService: PackService;
    readonly connectService: ConnectService;
    readonly workspaceService: WorkspaceService;
    readonly isAppPackageEnabled?: (packageId: string) => boolean;
    readonly appStateCache?: AppStateCache;
  }) {
    this.#appStateCache = options.appStateCache;
    this.#packService = options.packService;
    this.#connectService = options.connectService;
    this.#workspaceService = options.workspaceService;
    this.#isAppPackageEnabled = options.isAppPackageEnabled ?? (() => true);
  }

  private requireAppPackageEnabled(packageId: string): void {
    if (!this.#isAppPackageEnabled(packageId)) {
      throw new DaemonRpcError(-32003, 'PACKAGE_DISABLED_IN_APP', `Package '${packageId}' is disabled in the App.`);
    }
  }

  // Runtime detail sends a public identity. Only the registered workspace
  // and current domain inventory can resolve its local directory.
  private invocationContext(packageId: string, input: Record<string, unknown>) {
    const { workspace_path: explicitPath, work_item_root, ...ownerInput } = input;
    const identity = input.work_item_identity;
    let workspace: string | undefined;
    if (identity !== undefined) {
      if (!isRecord(identity) || identity.agent_id !== packageId || identity.identity_state !== 'resolved'
        || !['domain_id', 'work_item_id', 'domain_work_item_id', 'work_item_scope_id'].every(key =>
          typeof identity[key] === 'string' && identity[key] !== '')) {
        throw new DaemonRpcError(-32602, 'CONTRIBUTION_IDENTITY_INVALID', 'Invalid domain work item identity.');
      }
      const items = this.#appStateCache?.getState('fast').app_state.operator.workbench.work_item_projection_v2.items ?? [];
      const matches = items.filter(({ identity: candidate }) =>
        candidate.agent_id === packageId && candidate.domain_id === identity.domain_id
        && candidate.work_item_id === identity.work_item_id && candidate.domain_work_item_id === identity.domain_work_item_id
        && candidate.work_item_scope_id === identity.work_item_scope_id && candidate.identity_state === 'resolved');
      if (matches.length !== 1) {
        throw new DaemonRpcError(-32004, 'CONTRIBUTION_IDENTITY_UNAVAILABLE', 'This work item no longer resolves to one workspace.');
      }
      workspace = matches[0]!.identity.workspace_path;
    }
    if (explicitPath !== undefined) {
      if (typeof explicitPath !== 'string' || !path.isAbsolute(explicitPath)) {
        throw new DaemonRpcError(-32602, 'CONTRIBUTION_WORKSPACE_INVALID', 'Expected an absolute registered workspace path.');
      }
      const explicitRoot = fs.realpathSync(explicitPath);
      const registered = this.#workspaceService.listWorkspaces().some(ws =>
        fs.existsSync(ws.root_path) && fs.realpathSync(ws.root_path) === explicitRoot);
      if (!registered || (workspace !== undefined && fs.realpathSync(workspace) !== explicitRoot)) {
        throw new DaemonRpcError(-32602, 'CONTRIBUTION_WORKSPACE_MISMATCH', 'The requested workspace does not match the registered selection.');
      }
      workspace = explicitRoot;
    }
    return { input: ownerInput, env: workspace ? { ...process.env, OPL_PROFILE_WORKSPACE: workspace } : undefined };
  }

  async readContribution(req: ContributionReadRequest): Promise<Record<string, unknown>> {
    if (req.ifRevision !== undefined && req.ifRevision < 0) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'ifRevision must be >= 0.');
    }
    if (!req.ref || req.ref.trim().length === 0) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'app.contribution.read requires ref / data_ref.');
    }

    if (req.ref === 'workspace.read') {
      return this.handleBuiltInWorkspaceRead(req);
    }

    if (!req.packageId) {
      return {
        ok: true,
        ref: req.ref,
        data: { status: 'ready' },
      };
    }

    this.requireAppPackageEnabled(req.packageId);
    const pkg = this.#packService.inspect(req.packageId);
    if (!pkg || !pkg.enabled) {
      throw new DaemonRpcError(
        -32004,
        'PACKAGE_NOT_FOUND',
        `Package '${req.packageId}' is not installed or disabled.`,
      );
    }

    const handler = pkg.manifest.provides?.contribution_handler;
    if (!handler) {
      return {
        ok: true,
        package_id: pkg.package_id,
        ref: req.ref,
        data: {
          package_id: pkg.package_id,
          version: pkg.version,
          enabled: pkg.enabled,
          status: 'ready',
        },
      };
    }

    if (req.explicitSessionId && req.explicitSessionId !== req.callerSessionId) {
      throw new DaemonRpcError(
        -32001,
        'BIND_TOKEN_SESSION_MISMATCH',
        'Provided session_id does not match authenticated socket session.',
      );
    }
    if (!req.clientContext.trusted_host) {
      if (!req.consumerBindToken) {
        throw new DaemonRpcError(
          -32003,
          'TRUSTED_HOST_REQUIRED',
          'app.contribution.read requires a trusted host or valid consumer_bind_token to invoke contribution_handler.',
        );
      }
      await this.#connectService.verifyConsumerBindToken(req.consumerBindToken, {
        session_id: req.callerSessionId,
        consumer_package_id: pkg.package_id,
      });
    }

    const context = this.invocationContext(pkg.package_id, req.input);
    const out = await runModuleOrCommandEntrypoint(pkg.install_path, handler, {
      schema_version: 'opl-package-app-contribution-request.v1',
      operation: 'read',
      package_id: pkg.package_id,
      ref: req.ref,
      input: context.input,
    }, { env: context.env });

    if (out && typeof out === 'object' && !Array.isArray(out)) {
      return out as Record<string, unknown>;
    }
    return { ok: true, result: out };
  }

  private async handleBuiltInWorkspaceRead(req: ContributionReadRequest): Promise<Record<string, unknown>> {
    if (req.explicitSessionId && req.explicitSessionId !== req.callerSessionId) {
      throw new DaemonRpcError(
        -32001,
        'BIND_TOKEN_SESSION_MISMATCH',
        'Provided session_id does not match authenticated socket session.',
      );
    }
    if (!req.consumerBindToken) {
      throw new DaemonRpcError(
        -32001,
        'UNAUTHORIZED_BIND_TOKEN',
        'workspace.read requires consumer_bind_token.',
      );
    }

    const claims = await this.#connectService.verifyConsumerBindToken(req.consumerBindToken, {
      session_id: req.callerSessionId,
      ...(req.packageId ? { consumer_package_id: req.packageId } : {}),
    });

    const targetPackageId = req.packageId ?? claims.consumer_package_id;
    const pkg = this.#packService.inspect(targetPackageId);
    if (!pkg || !pkg.enabled) {
      throw new DaemonRpcError(
        -32003,
        'CONSUMER_UNAVAILABLE',
        `Package '${targetPackageId}' is not installed or enabled.`,
      );
    }

    const hasWorkspaceReadCapability = Boolean(
      pkg.manifest.ui?.mcp_apps?.some(
        (app) => Array.isArray(app.host_capabilities) && app.host_capabilities.includes('workspace_read'),
      ),
    );
    if (!hasWorkspaceReadCapability) {
      throw new DaemonRpcError(
        -32003,
        'WORKSPACE_READ_CAPABILITY_REQUIRED',
        `Package '${targetPackageId}' lacks ui.mcp_apps[*].host_capabilities 'workspace_read'.`,
      );
    }

    const workspaceId =
      typeof req.input.workspace_id === 'string'
        ? req.input.workspace_id
        : typeof req.input.workspaceId === 'string'
          ? req.input.workspaceId
          : '';
    const relPath = typeof req.input.path === 'string' ? req.input.path : '';
    if (!workspaceId || !relPath) {
      throw new DaemonRpcError(
        -32602,
        'INVALID_INPUT',
        'workspace.read requires input.workspace_id and input.path.',
      );
    }

    if (relPath.includes('\0') || path.isAbsolute(relPath)) {
      throw new DaemonRpcError(-32003, 'PATH_OUTSIDE_WORKSPACE', 'Workspace read path must be relative.');
    }
    const segments = relPath.replace(/\\/g, '/').split('/');
    if (segments.some((s) => s === '..' || s === '')) {
      throw new DaemonRpcError(-32003, 'PATH_OUTSIDE_WORKSPACE', 'Path traversal is forbidden in workspace.read.');
    }

    const ws = this.#workspaceService.getWorkspace(workspaceId);
    let realWsRoot: string;
    try {
      realWsRoot = fs.realpathSync(ws.root_path);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException | null)?.code;
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        throw new DaemonRpcError(
          -32004,
          'WORKSPACE_ROOT_MISSING',
          `Workspace '${workspaceId}' root path does not exist on disk: ${ws.root_path}`,
        );
      }
      throw err;
    }
    const candidate = path.resolve(realWsRoot, relPath);
    if (!isWithinDirectory(realWsRoot, candidate) || candidate === realWsRoot) {
      throw new DaemonRpcError(-32003, 'PATH_OUTSIDE_WORKSPACE', `Path '${relPath}' escapes workspace root.`);
    }
    if (!fs.existsSync(candidate)) {
      throw new DaemonRpcError(-32004, 'FILE_NOT_FOUND', `Workspace file '${relPath}' does not exist.`);
    }
    const realTarget = fs.realpathSync(candidate);
    if (!isWithinDirectory(realWsRoot, realTarget)) {
      throw new DaemonRpcError(-32003, 'PATH_OUTSIDE_WORKSPACE', `Symlink '${relPath}' escapes workspace root.`);
    }
    const stat = fs.statSync(realTarget);
    if (!stat.isFile()) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', `Path '${relPath}' is not a regular file.`);
    }
    if (stat.size > MAX_WORKSPACE_READ_BYTES) {
      throw new DaemonRpcError(
        -32602,
        'FILE_TOO_LARGE',
        `File '${relPath}' exceeds ${MAX_WORKSPACE_READ_BYTES} bytes workspace.read limit.`,
      );
    }

    const bytes = fs.readFileSync(realTarget);
    const content = bytes.toString('utf8');
    const sha256 = `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
    return {
      ok: true,
      ref: 'workspace.read',
      workspace_id: workspaceId,
      path: relPath,
      content,
      encoding: 'utf8',
      sha256,
    };
  }

  async executeContribution(req: ContributionExecuteRequest): Promise<Record<string, unknown>> {
    if (!req.actionId || req.actionId.trim().length === 0) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'app.contribution.execute requires actionId / action_id.');
    }
    const dryRun = req.dryRun || req.mode === 'preview';

    if (!dryRun && !req.clientContext.trusted_host) {
      throw new DaemonRpcError(
        -32003,
        'TRUSTED_HOST_REQUIRED',
        'Mutating app.contribution.execute requires a trusted host client.',
      );
    }

    const appAction = req.actionId === 'package_contribution_execute';
    const packageId = req.packageId ?? (appAction ? req.payload.package_id : undefined);
    const ref = appAction ? req.payload.ref : req.actionId;
    const input = appAction ? req.payload.input ?? {} : req.payload;
    if (typeof packageId !== 'string' || !packageId || typeof ref !== 'string' || !ref || !isRecord(input)) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'A Package contribution needs a package_id, action ref and object input.');
    }
    if (appAction && req.payload.package_id !== undefined && req.payload.package_id !== packageId) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'Package contribution identities do not match.');
    }
    this.requireAppPackageEnabled(packageId);
    const pkg = this.#packService.inspect(packageId);
    if (!pkg?.enabled) {
      throw new DaemonRpcError(-32004, 'PACKAGE_NOT_FOUND', `Package '${packageId}' is not installed or enabled.`);
    }
    const handler = pkg.manifest.provides?.contribution_handler;
    if (!handler) {
      throw new DaemonRpcError(-32004, 'CONTRIBUTION_HANDLER_UNAVAILABLE', `Package '${packageId}' has no contribution handler.`);
    }
    const declarative = pkg.manifest.ui?.declarative;
    const surfaces = [...(declarative?.views ?? []), ...(declarative?.settings_forms ?? [])];
    const commands = surfaces.flatMap(surface => surface.actions ?? []).filter(command => command.action_ref === ref);
    const canSubmit = declarative?.settings_forms?.some(form => form.submit_action_ref === ref);
    if (!commands.length && !canSubmit) {
      throw new DaemonRpcError(-32004, 'CONTRIBUTION_ACTION_NOT_FOUND', `Package '${packageId}' does not declare action '${ref}'.`);
    }
    const confirmationRequired = commands.some(command => command.confirm === true);
    const receipt = {
      action_id: req.actionId,
      dryRun,
      dry_run: dryRun,
      authorityBoundary: 'app_bridge_no_domain_authority',
      confirmation_required: confirmationRequired,
    };
    const context = this.invocationContext(packageId, input);
    if (dryRun) return { ...receipt, ok: true, status: 'preview' };
    const confirmed = appAction ? req.payload.confirmed : req.confirmed;
    if (confirmationRequired && confirmed !== true) {
      throw new DaemonRpcError(-32003, 'CONFIRMATION_REQUIRED', `Package action '${ref}' requires confirmation.`);
    }

    const response = await runModuleOrCommandEntrypoint(pkg.install_path, handler, {
      schema_version: 'opl-package-app-contribution-request.v1',
      operation: 'execute',
      package_id: packageId,
      ...(appAction ? { ref, input: context.input } : { action_id: ref, payload: context.input, dry_run: false }),
    }, { env: context.env });
    // Direct SDK callers receive the Package's native result. The Studio action
    // additionally binds its declared receipt to the requested Package and ref.
    if (appAction || (isRecord(response) && response.schema_version !== undefined)) {
      if (!isRecord(response) || response.schema_version !== 'opl-package-app-contribution-response.v1'
        || response.ref !== ref || response.operation !== 'execute' || typeof response.ok !== 'boolean'
        || (response.package_id !== undefined && response.package_id !== packageId)
        || (response.ok && !isRecord(response.result))) {
        throw new DaemonRpcError(-32000, 'CONTRIBUTION_RESPONSE_INVALID', `Package '${packageId}' returned an invalid receipt for '${ref}'.`);
      }
    }
    if (isRecord(response) && response.ok === false) {
      throw new DaemonRpcError(-32000, 'CONTRIBUTION_OWNER_REJECTED', `Package '${packageId}' rejected '${ref}'.`,
        isRecord(response.error) ? { owner_error: response.error } : {});
    }
    return {
      ...receipt, ok: true, status: 'executed', result: response,
      ...(appAction ? { opl_app_contribution: {
        surface_kind: 'opl_app_package_contribution.v1', package_id: packageId,
        operation: 'execute', ref, confirmation_required: confirmationRequired, response,
      } } : {}),
    };
  }
}

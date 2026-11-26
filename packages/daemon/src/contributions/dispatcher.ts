import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { ClientContext } from '@opl/core';
import type { ConnectService } from '@opl/connect';
import { isWithinDirectory, type PackService } from '@opl/pack';
import type { WorkspaceService } from '@opl/workspace';
import { DaemonRpcError } from '../errors.ts';
import { runModuleOrCommandEntrypoint } from '../utils/subprocess-esm.ts';

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
  readonly mode?: string;
}

export class ContributionDispatcher {
  readonly #packService: PackService;
  readonly #connectService: ConnectService;
  readonly #workspaceService: WorkspaceService;

  constructor(options: {
    readonly packService: PackService;
    readonly connectService: ConnectService;
    readonly workspaceService: WorkspaceService;
  }) {
    this.#packService = options.packService;
    this.#connectService = options.connectService;
    this.#workspaceService = options.workspaceService;
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

    const out = await runModuleOrCommandEntrypoint(pkg.install_path, handler, {
      schema_version: 'opl-package-app-contribution-request.v1',
      operation: 'read',
      package_id: pkg.package_id,
      ref: req.ref,
      input: req.input,
    });

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
    const realWsRoot = fs.realpathSync(ws.root_path);
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

    if (req.packageId) {
      const pkg = this.#packService.inspect(req.packageId);
      if (!pkg || !pkg.enabled) {
        throw new DaemonRpcError(
          -32004,
          'PACKAGE_NOT_FOUND',
          `Package '${req.packageId}' is not installed or disabled.`,
        );
      }
      const handler = pkg.manifest.provides?.contribution_handler;
      if (handler && !dryRun) {
        const out = await runModuleOrCommandEntrypoint(pkg.install_path, handler, {
          schema_version: 'opl-package-app-contribution-request.v1',
          operation: 'execute',
          package_id: pkg.package_id,
          action_id: req.actionId,
          payload: req.payload,
          dry_run: dryRun,
        });
        return {
          ok: true,
          dryRun,
          dry_run: dryRun,
          authorityBoundary: 'app_bridge_no_domain_authority',
          action_id: req.actionId,
          result: out,
        };
      }
    }

    return {
      ok: true,
      dryRun,
      dry_run: dryRun,
      authorityBoundary: 'app_bridge_no_domain_authority',
      action_id: req.actionId,
      payload: req.payload,
      status: dryRun ? 'preview' : 'executed',
    };
  }
}

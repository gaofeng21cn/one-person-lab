import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  buildFrontDeskModules,
  runFrontDeskEngineAction,
  runFrontDeskModuleAction,
  runFrontDeskSystemAction,
  writeFrontDeskWorkspaceRootSurface,
} from '../frontdesk-installation.ts';
import { stripOplWebBasePath } from '../opl-web-paths.ts';
import { buildOplApiCatalog } from '../opl-api-paths.ts';
import {
  buildFrontDeskDashboard,
  buildFrontDeskHealth,
  buildFrontDeskStart,
  buildHostedPilotBundle,
  buildRuntimeStatus,
  buildWorkspaceStatus,
} from '../management.ts';
import { buildDomainManifestCatalog } from '../domain-manifest.ts';
import { launchDomainEntry } from '../domain-launch.ts';
import { readFrontDeskRuntimeModes, writeFrontDeskRuntimeModes } from '../frontdesk-runtime-modes.ts';
import { buildHostedPilotPackage } from '../hosted-pilot-package.ts';
import { submitFrontDeskAskTask } from '../frontdesk-task-store.ts';
import {
  buildProductEntryHandoffEnvelope,
  runProductEntryAsk,
  runProductEntryLogs,
  runProductEntryResume,
  runProductEntrySessions,
} from '../product-entry.ts';
import { buildSessionLedger } from '../session-ledger.ts';
import { buildWorkspaceCatalog } from '../workspace-registry.ts';

import { readJsonBody, writeApiError, writeJson } from './http.ts';
import {
  normalizeAskInput,
  normalizeFrontDeskEngineActionInput,
  normalizeFrontDeskModuleActionInput,
  normalizeFrontDeskSettingsInput,
  normalizeFrontDeskSystemActionInput,
  normalizeHostedPackageInput,
  normalizeLaunchDomainInput,
  normalizeOptionalString,
  normalizeResumeSessionId,
  normalizeWorkspaceRegistryInput,
  normalizeWorkspaceRootInput,
  parsePositiveIntegerOptional,
  parsePositiveIntegerOrDefault,
} from './normalization.ts';
import {
  activateWorkspaceBinding,
  archiveWorkspaceBinding,
  bindWorkspace,
  buildOplAgentsPayload,
  buildOplArtifactsPayload,
  buildOplEngineActionPayload,
  buildOplEnginesPayload,
  buildOplModuleActionPayload,
  buildOplModulesPayload,
  buildOplProgressPayload,
  buildOplSessionsPayload,
  buildOplSystemActionPayload,
  buildOplSystemInitializePayload,
  buildOplSystemPayload,
  buildOplWorkspacesPayload,
  readOplProgressBrief,
} from './payload-builders.ts';
import {
  buildOplSystemSettingsPayload,
  buildOplWorkspaceRootPayload,
  buildWebFrontDeskRootPayload,
} from './root-payloads.ts';
import type {
  AskRequestBody,
  FrontDeskEngineActionRequestBody,
  FrontDeskModuleActionRequestBody,
  FrontDeskSettingsRequestBody,
  FrontDeskSystemActionRequestBody,
  HostedPackageRequestBody,
  LaunchDomainRequestBody,
  ResumeRequestBody,
  WebFrontDeskContext,
  WorkspaceRootRequestBody,
} from './types.ts';

export async function handleWebFrontDeskRequest(
  request: IncomingMessage,
  response: ServerResponse<IncomingMessage>,
  context: WebFrontDeskContext,
) {
  const method = request.method ?? 'GET';
  const url = new URL(request.url ?? '/', context.baseUrl);
  const routedPath = stripOplWebBasePath(url.pathname, context.basePath);
  const routedApi = buildOplApiCatalog();
  const advertisedApi = buildOplApiCatalog(context.basePath);

  try {
    if (routedPath === null) {
      writeJson(response, 404, {
        version: 'g2',
        error: {
          code: 'unknown_command',
          message: `Unknown OPL web route: ${method} ${url.pathname}`,
          exit_code: 2,
        },
      });
      return;
    }

    if (method === 'GET' && routedPath === '/') {
      writeJson(response, 200, buildWebFrontDeskRootPayload(context));
      return;
    }

    if (method === 'GET' && routedPath === routedApi.resources.system) {
      writeJson(response, 200, await buildOplSystemPayload(context, advertisedApi));
      return;
    }

    if (method === 'GET' && routedPath === routedApi.actions.system_initialize) {
      writeJson(response, 200, await buildOplSystemInitializePayload(context, advertisedApi));
      return;
    }

    if (method === 'GET' && routedPath === routedApi.actions.system_settings) {
      writeJson(response, 200, buildOplSystemSettingsPayload());
      return;
    }

    if (method === 'POST' && routedPath === routedApi.actions.system_settings) {
      const body = (await readJsonBody(request)) as FrontDeskSettingsRequestBody;
      writeJson(
        response,
        200,
        buildOplSystemSettingsPayload(writeFrontDeskRuntimeModes(normalizeFrontDeskSettingsInput(body))),
      );
      return;
    }

    if (method === 'POST' && routedPath === routedApi.actions.system) {
      const body = (await readJsonBody(request)) as FrontDeskSystemActionRequestBody;
      const normalized = normalizeFrontDeskSystemActionInput(body);
      writeJson(
        response,
        200,
        buildOplSystemActionPayload(
          await runFrontDeskSystemAction(context.contracts, normalized.action, normalized),
        ),
      );
      return;
    }

    if (method === 'GET' && routedPath === routedApi.resources.engines) {
      writeJson(response, 200, await buildOplEnginesPayload(context, advertisedApi));
      return;
    }

    if (method === 'POST' && routedPath === routedApi.actions.engines) {
      const body = (await readJsonBody(request)) as FrontDeskEngineActionRequestBody;
      const normalized = normalizeFrontDeskEngineActionInput(body);
      writeJson(
        response,
        200,
        buildOplEngineActionPayload(
          await runFrontDeskEngineAction(context.contracts, normalized.action, normalized.engineId),
        ),
      );
      return;
    }

    if (method === 'GET' && routedPath === routedApi.resources.modules) {
      writeJson(response, 200, buildOplModulesPayload(buildFrontDeskModules(), advertisedApi));
      return;
    }

    if (method === 'GET' && routedPath === routedApi.resources.agents) {
      writeJson(response, 200, buildOplAgentsPayload(context, advertisedApi));
      return;
    }

    if (method === 'POST' && routedPath === routedApi.actions.modules) {
      const body = (await readJsonBody(request)) as FrontDeskModuleActionRequestBody;
      const normalized = normalizeFrontDeskModuleActionInput(body);
      writeJson(response, 200, buildOplModuleActionPayload(runFrontDeskModuleAction(normalized.action, normalized.moduleId)));
      return;
    }

    if (method === 'GET' && routedPath === routedApi.resources.workspaces) {
      writeJson(response, 200, buildOplWorkspacesPayload(buildWorkspaceCatalog(context.contracts), advertisedApi));
      return;
    }

    if (method === 'GET' && routedPath === routedApi.actions.workspace_root) {
      writeJson(response, 200, buildOplWorkspaceRootPayload());
      return;
    }

    if (method === 'POST' && routedPath === routedApi.actions.workspace_root) {
      writeJson(
        response,
        200,
        buildOplWorkspaceRootPayload(
          writeFrontDeskWorkspaceRootSurface(
            normalizeWorkspaceRootInput((await readJsonBody(request)) as WorkspaceRootRequestBody).path,
          ),
        ),
      );
      return;
    }

    if (method === 'POST' && routedPath === routedApi.actions.workspace_bind) {
      writeJson(
        response,
        200,
        buildOplWorkspacesPayload(
          bindWorkspace(context.contracts, normalizeWorkspaceRegistryInput(await readJsonBody(request))),
          advertisedApi,
        ),
      );
      return;
    }

    if (method === 'POST' && routedPath === routedApi.actions.workspace_activate) {
      writeJson(
        response,
        200,
        buildOplWorkspacesPayload(
          activateWorkspaceBinding(context.contracts, normalizeWorkspaceRegistryInput(await readJsonBody(request))),
          advertisedApi,
        ),
      );
      return;
    }

    if (method === 'POST' && routedPath === routedApi.actions.workspace_archive) {
      writeJson(
        response,
        200,
        buildOplWorkspacesPayload(
          archiveWorkspaceBinding(context.contracts, normalizeWorkspaceRegistryInput(await readJsonBody(request))),
          advertisedApi,
        ),
      );
      return;
    }

    if (method === 'GET' && routedPath === routedApi.resources.sessions) {
      const sessionsPayload = runProductEntrySessions({
        limit: parsePositiveIntegerOptional(url.searchParams.get('limit')) ?? context.sessionsLimit,
        source: normalizeOptionalString(url.searchParams.get('source')),
      });
      const ledgerPayload = buildSessionLedger(
        parsePositiveIntegerOptional(url.searchParams.get('limit')) ?? context.sessionsLimit,
      );
      writeJson(
        response,
        200,
        buildOplSessionsPayload(
          context,
          sessionsPayload,
          ledgerPayload,
          advertisedApi,
          await readOplProgressBrief(context, context.workspacePath),
        ),
      );
      return;
    }

    if (method === 'GET' && routedPath === routedApi.resources.progress) {
      writeJson(
        response,
        200,
        await buildOplProgressPayload(context, advertisedApi, {
          workspacePath: normalizeOptionalString(url.searchParams.get('workspace_path')),
          sessionId: normalizeOptionalString(url.searchParams.get('session_id')),
          taskId: normalizeOptionalString(url.searchParams.get('task_id')),
          lines: parsePositiveIntegerOptional(url.searchParams.get('lines')),
        }),
      );
      return;
    }

    if (method === 'GET' && routedPath === routedApi.resources.artifacts) {
      writeJson(
        response,
        200,
        await buildOplArtifactsPayload(context, advertisedApi, {
          workspacePath: normalizeOptionalString(url.searchParams.get('workspace_path')),
          sessionId: normalizeOptionalString(url.searchParams.get('session_id')),
        }),
      );
      return;
    }

    if (method === 'POST' && routedPath === routedApi.actions.session_create) {
      const body = (await readJsonBody(request)) as AskRequestBody;
      const askInput = normalizeAskInput(body);
      const normalizedInput = {
        ...askInput,
        workspacePath: askInput.workspacePath ?? context.workspacePath,
        executor: readFrontDeskRuntimeModes().interaction_mode,
      };
      const payload = normalizedInput.dryRun
        ? runProductEntryAsk(normalizedInput, context.contracts)
        : submitFrontDeskAskTask(normalizedInput, context.contracts);
      writeJson(response, 200, {
        version: 'g2',
        session_create: {
          surface_id: 'opl_session_create',
          request_mode: normalizedInput.dryRun ? 'dry_run' : 'submitted',
          payload,
        },
      });
      return;
    }

    if (method === 'POST' && routedPath === routedApi.actions.session_resume) {
      const body = (await readJsonBody(request)) as ResumeRequestBody;
      const payload = runProductEntryResume(normalizeResumeSessionId(body));
      writeJson(response, 200, {
        version: 'g2',
        session_resume: {
          surface_id: 'opl_session_resume',
          ...payload.product_entry,
        },
      });
      return;
    }

    if (method === 'GET' && routedPath === routedApi.actions.session_logs) {
      const payload = runProductEntryLogs({
        logName: normalizeOptionalString(url.searchParams.get('log_name')),
        lines: parsePositiveIntegerOptional(url.searchParams.get('lines')),
        since: normalizeOptionalString(url.searchParams.get('since')),
        level: normalizeOptionalString(url.searchParams.get('level')),
        component: normalizeOptionalString(url.searchParams.get('component')),
        sessionId:
          normalizeOptionalString(url.searchParams.get('session_id'))
          ?? normalizeOptionalString(url.searchParams.get('session')),
      });
      writeJson(response, 200, {
        version: 'g2',
        session_logs: {
          surface_id: 'opl_session_logs',
          ...payload.product_entry,
        },
      });
      return;
    }

    if (method === 'GET' && routedPath === routedApi.actions.start) {
      writeJson(
        response,
        200,
        buildFrontDeskStart(context.contracts, {
          projectId: normalizeOptionalString(url.searchParams.get('project')) ?? '',
          modeId: normalizeOptionalString(url.searchParams.get('mode')),
        }),
      );
      return;
    }

    if (method === 'POST' && routedPath === routedApi.actions.launch_domain) {
      writeJson(
        response,
        200,
        await launchDomainEntry(
          context.contracts,
          normalizeLaunchDomainInput((await readJsonBody(request)) as LaunchDomainRequestBody),
        ),
      );
      return;
    }

    if (method === 'POST' && routedPath === routedApi.actions.handoff_envelope) {
      const body = (await readJsonBody(request)) as AskRequestBody;
      const askInput = normalizeAskInput(body);
      writeJson(
        response,
        200,
        buildProductEntryHandoffEnvelope(
          {
            ...askInput,
            workspacePath: askInput.workspacePath ?? context.workspacePath,
          },
          context.contracts,
        ),
      );
      return;
    }

    if (method === 'GET' && routedPath === routedApi.actions.web_bundle) {
      writeJson(
        response,
        200,
        buildHostedPilotBundle(context.contracts, {
          host: context.host,
          port: context.port,
          workspacePath: context.workspacePath,
          sessionsLimit: context.sessionsLimit,
          basePath: context.basePath,
        }),
      );
      return;
    }

    if (method === 'POST' && routedPath === routedApi.actions.web_package) {
      writeJson(
        response,
        200,
        buildHostedPilotPackage(context.contracts, {
          ...normalizeHostedPackageInput((await readJsonBody(request)) as HostedPackageRequestBody),
          host: context.host,
          port: context.port,
          basePath: context.basePath,
          sessionsLimit: context.sessionsLimit,
        }),
      );
      return;
    }

    if (method === 'GET' && routedPath === '/api/health') {
      writeJson(response, 200, buildFrontDeskHealth(context.contracts, { basePath: context.basePath }));
      return;
    }

    if (method === 'GET' && routedPath === '/api/status/workspace') {
      writeJson(
        response,
        200,
        buildWorkspaceStatus({
          workspacePath: url.searchParams.get('path') ?? context.workspacePath,
        }),
      );
      return;
    }

    if (method === 'GET' && routedPath === '/api/domain/manifests') {
      writeJson(response, 200, buildDomainManifestCatalog(context.contracts));
      return;
    }

    if (method === 'GET' && routedPath === '/api/status/runtime') {
      writeJson(
        response,
        200,
        buildRuntimeStatus({
          sessionsLimit: parsePositiveIntegerOrDefault(url.searchParams.get('limit'), context.sessionsLimit),
        }),
      );
      return;
    }

    if (method === 'GET' && routedPath === '/api/session/ledger') {
      writeJson(
        response,
        200,
        buildSessionLedger(parsePositiveIntegerOptional(url.searchParams.get('limit')) ?? context.sessionsLimit),
      );
      return;
    }

    if (method === 'GET' && routedPath === '/api/status/dashboard') {
      writeJson(
        response,
        200,
        buildFrontDeskDashboard(context.contracts, {
          workspacePath: url.searchParams.get('path') ?? context.workspacePath,
          sessionsLimit: parsePositiveIntegerOrDefault(
            url.searchParams.get('sessions-limit') ?? url.searchParams.get('sessions_limit'),
            context.sessionsLimit,
          ),
          basePath: context.basePath,
        }),
      );
      return;
    }

    writeJson(response, 404, {
      version: 'g2',
      error: {
        code: 'unknown_command',
        message: `Unknown OPL web route: ${method} ${url.pathname}`,
        exit_code: 2,
      },
    });
  } catch (error) {
    writeApiError(response, error);
  }
}

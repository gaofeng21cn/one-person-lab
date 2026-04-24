import { GatewayContractError } from '../contracts.ts';
import type {
  FrontDeskEngineAction,
  FrontDeskModuleAction,
  FrontDeskSystemAction,
} from '../frontdesk-installation.ts';
import type { DomainLaunchStrategy } from '../domain-launch.ts';
import type { ProductEntryCliInput } from '../product-entry.ts';
import type { FrontDeskAgentMode } from '../frontdesk-runtime-modes.ts';

import type {
  AskRequestBody,
  FrontDeskEngineActionRequestBody,
  FrontDeskModuleActionRequestBody,
  FrontDeskSettingsRequestBody,
  FrontDeskSystemActionRequestBody,
  HostedPackageRequestBody,
  LaunchDomainRequestBody,
  ResumeRequestBody,
  WorkspaceRegistryBody,
  WorkspaceRootRequestBody,
} from './types.ts';

export function normalizeOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizeSkills(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
}

export function parsePositiveIntegerOrDefault(value: string | null, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new GatewayContractError(
      'cli_usage_error',
      'Expected a positive integer query parameter for the requested web front-desk surface.',
      {
        value,
      },
    );
  }

  return parsed;
}

export function parsePositiveIntegerOptional(value: string | null) {
  if (!value) {
    return undefined;
  }

  return parsePositiveIntegerOrDefault(value, 1);
}

export function normalizeBaseUrlHost(host: string) {
  if (host === '0.0.0.0') {
    return '127.0.0.1';
  }

  if (host === '::') {
    return '[::1]';
  }

  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
}

export function normalizeAskInput(body: AskRequestBody): ProductEntryCliInput {
  const goal = normalizeOptionalString(body.goal);
  if (!goal) {
    throw new GatewayContractError(
      'cli_usage_error',
      'Web front-desk ask requests require a non-empty goal.',
      {
        required: ['goal'],
      },
    );
  }

  return {
    dryRun: Boolean(body.dryRun ?? body.dry_run),
    goal,
    intent: normalizeOptionalString(body.intent) ?? 'create',
    target: normalizeOptionalString(body.target) ?? 'deliverable',
    preferredFamily:
      normalizeOptionalString(body.preferredFamily) ?? normalizeOptionalString(body.preferred_family),
    requestKind:
      normalizeOptionalString(body.requestKind) ?? normalizeOptionalString(body.request_kind),
    model: normalizeOptionalString(body.model),
    provider: normalizeOptionalString(body.provider),
    workspacePath:
      normalizeOptionalString(body.workspacePath) ?? normalizeOptionalString(body.workspace_path),
    skills: normalizeSkills(body.skills),
  };
}

export function normalizeFrontDeskSettingsInput(body: FrontDeskSettingsRequestBody) {
  const interactionMode =
    normalizeOptionalString(body.interactionMode) ?? normalizeOptionalString(body.interaction_mode);
  const executionMode =
    normalizeOptionalString(body.executionMode) ?? normalizeOptionalString(body.execution_mode);

  return {
    interaction_mode: interactionMode as FrontDeskAgentMode | undefined,
    execution_mode: executionMode as FrontDeskAgentMode | undefined,
  };
}

export function normalizeResumeSessionId(body: ResumeRequestBody) {
  const sessionId = normalizeOptionalString(body.sessionId) ?? normalizeOptionalString(body.session_id);
  if (!sessionId) {
    throw new GatewayContractError(
      'cli_usage_error',
      'Web front-desk resume requests require a non-empty session_id.',
      {
        required: ['session_id'],
      },
    );
  }

  return sessionId;
}

export function normalizeLaunchDomainInput(body: LaunchDomainRequestBody) {
  const projectId = normalizeOptionalString(body.projectId) ?? normalizeOptionalString(body.project_id);
  if (!projectId) {
    throw new GatewayContractError(
      'cli_usage_error',
      'Web front-desk domain launch requests require a non-empty project_id.',
      {
        required: ['project_id'],
      },
    );
  }

  const strategy = normalizeOptionalString(body.strategy);
  if (strategy && !['auto', 'open_url', 'spawn_command'].includes(strategy)) {
    throw new GatewayContractError(
      'cli_usage_error',
      'Web front-desk domain launch requests require strategy to be auto, open_url, or spawn_command.',
      {
        strategy,
      },
    );
  }

  return {
    projectId,
    workspacePath:
      normalizeOptionalString(body.workspacePath) ?? normalizeOptionalString(body.workspace_path),
    strategy: strategy as DomainLaunchStrategy | undefined,
    dryRun: Boolean(body.dryRun ?? body.dry_run),
  };
}

export function normalizeWorkspaceRegistryInput(body: WorkspaceRegistryBody) {
  const projectId = normalizeOptionalString(body.projectId) ?? normalizeOptionalString(body.project_id);
  const workspacePath =
    normalizeOptionalString(body.workspacePath) ?? normalizeOptionalString(body.workspace_path);

  if (!projectId || !workspacePath) {
    throw new GatewayContractError(
      'cli_usage_error',
      'Workspace registry requests require non-empty project_id and workspace_path.',
      {
        required: ['project_id', 'workspace_path'],
      },
    );
  }

  return {
    projectId,
    workspacePath,
    label: normalizeOptionalString(body.label),
    entryCommand:
      normalizeOptionalString(body.entryCommand) ?? normalizeOptionalString(body.entry_command),
    manifestCommand:
      normalizeOptionalString(body.manifestCommand) ?? normalizeOptionalString(body.manifest_command),
    entryUrl: normalizeOptionalString(body.entryUrl) ?? normalizeOptionalString(body.entry_url),
    workspaceRoot:
      normalizeOptionalString(body.workspaceRoot) ?? normalizeOptionalString(body.workspace_root),
    profileRef:
      normalizeOptionalString(body.profileRef) ?? normalizeOptionalString(body.profile_ref),
    inputPath:
      normalizeOptionalString(body.inputPath) ?? normalizeOptionalString(body.input_path),
  };
}

export function normalizeHostedPackageInput(body: HostedPackageRequestBody) {
  const outputDir = normalizeOptionalString(body.outputDir) ?? normalizeOptionalString(body.output_dir);

  if (!outputDir) {
    throw new GatewayContractError(
      'cli_usage_error',
      'Hosted package export requires a non-empty output_dir.',
      {
        required: ['output_dir'],
      },
    );
  }

  const port = (() => {
    const portValue = body.port;
    if (typeof portValue === 'number' && Number.isInteger(portValue) && portValue >= 0 && portValue <= 65535) {
      return portValue;
    }
    if (typeof portValue === 'string' && portValue.trim().length > 0) {
      const parsed = Number.parseInt(portValue, 10);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
        throw new GatewayContractError(
          'cli_usage_error',
          'Hosted package export requires port to be an integer between 0 and 65535.',
          {
            port: portValue,
          },
        );
      }
      return parsed;
    }
    return undefined;
  })();

  const sessionsLimitValue = body.sessionsLimit ?? body.sessions_limit;
  let sessionsLimit: number | undefined;
  if (
    typeof sessionsLimitValue === 'number'
    && Number.isInteger(sessionsLimitValue)
    && sessionsLimitValue > 0
  ) {
    sessionsLimit = sessionsLimitValue;
  } else if (typeof sessionsLimitValue === 'string' && sessionsLimitValue.trim().length > 0) {
    const parsed = Number.parseInt(sessionsLimitValue, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new GatewayContractError(
        'cli_usage_error',
        'Hosted package export requires sessions_limit to be a positive integer.',
        {
          sessions_limit: sessionsLimitValue,
        },
      );
    }
    sessionsLimit = parsed;
  }

  return {
    outputDir,
    publicOrigin: normalizeOptionalString(body.publicOrigin) ?? normalizeOptionalString(body.public_origin),
    host: normalizeOptionalString(body.host),
    port,
    basePath: normalizeOptionalString(body.basePath) ?? normalizeOptionalString(body.base_path),
    sessionsLimit,
  };
}

export function normalizeFrontDeskModuleActionInput(body: FrontDeskModuleActionRequestBody) {
  const action = typeof body.action === 'string' ? body.action.trim() : '';
  const moduleId =
    typeof body.module_id === 'string' && body.module_id.trim().length > 0
      ? body.module_id.trim()
      : typeof body.moduleId === 'string' && body.moduleId.trim().length > 0
        ? body.moduleId.trim()
        : '';

  if (!action || !['install', 'update', 'reinstall', 'remove'].includes(action)) {
    throw new GatewayContractError(
      'cli_usage_error',
      'module action requires action=install|update|reinstall|remove.',
      {
        action: body.action ?? null,
      },
      2,
    );
  }

  if (!moduleId) {
    throw new GatewayContractError(
      'cli_usage_error',
      'module action requires module_id.',
      {
        module_id: body.module_id ?? body.moduleId ?? null,
      },
      2,
    );
  }

  return {
    action: action as FrontDeskModuleAction,
    moduleId,
  };
}

export function normalizeFrontDeskEngineActionInput(body: FrontDeskEngineActionRequestBody) {
  const action = typeof body.action === 'string' ? body.action.trim() : '';
  const engineId =
    typeof body.engine_id === 'string' && body.engine_id.trim().length > 0
      ? body.engine_id.trim()
      : typeof body.engineId === 'string' && body.engineId.trim().length > 0
        ? body.engineId.trim()
        : '';

  if (!action || !['install', 'update', 'reinstall', 'remove'].includes(action)) {
    throw new GatewayContractError(
      'cli_usage_error',
      'engine action requires action=install|update|reinstall|remove.',
      {
        action: body.action ?? null,
      },
      2,
    );
  }

  if (!engineId) {
    throw new GatewayContractError(
      'cli_usage_error',
      'engine action requires engine_id.',
      {
        engine_id: body.engine_id ?? body.engineId ?? null,
      },
      2,
    );
  }

  return {
    action: action as FrontDeskEngineAction,
    engineId,
  };
}

export function normalizeFrontDeskSystemActionInput(body: FrontDeskSystemActionRequestBody) {
  const action = typeof body.action === 'string' ? body.action.trim() : '';
  if (!action || !['repair', 'reinstall_support', 'update_channel'].includes(action)) {
    throw new GatewayContractError(
      'cli_usage_error',
      'system action requires action=repair|reinstall_support|update_channel.',
      {
        action: body.action ?? null,
      },
      2,
    );
  }

  const port = (() => {
    const portValue = body.port;
    if (typeof portValue === 'number' && Number.isInteger(portValue) && portValue >= 0 && portValue <= 65535) {
      return portValue;
    }
    if (typeof portValue === 'string' && portValue.trim().length > 0) {
      const parsed = Number.parseInt(portValue, 10);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
        throw new GatewayContractError(
          'cli_usage_error',
          'system action requires port to be an integer between 0 and 65535.',
          {
            port: portValue,
          },
          2,
        );
      }
      return parsed;
    }
    return undefined;
  })();

  const sessionsLimitValue = body.sessionsLimit ?? body.sessions_limit;
  let sessionsLimit: number | undefined;
  if (
    typeof sessionsLimitValue === 'number'
    && Number.isInteger(sessionsLimitValue)
    && sessionsLimitValue > 0
  ) {
    sessionsLimit = sessionsLimitValue;
  } else if (typeof sessionsLimitValue === 'string' && sessionsLimitValue.trim().length > 0) {
    const parsed = Number.parseInt(sessionsLimitValue, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new GatewayContractError(
        'cli_usage_error',
        'system action requires sessions_limit to be a positive integer.',
        {
          sessions_limit: sessionsLimitValue,
        },
        2,
      );
    }
    sessionsLimit = parsed;
  }

  const channel = normalizeOptionalString(body.channel);
  if (channel && channel !== 'stable' && channel !== 'preview') {
    throw new GatewayContractError(
      'cli_usage_error',
      'system action update_channel accepts stable or preview.',
      {
        channel,
      },
      2,
    );
  }

  return {
    action: action as FrontDeskSystemAction,
    channel: channel as 'stable' | 'preview' | undefined,
    host: normalizeOptionalString(body.host),
    port,
    workspacePath:
      normalizeOptionalString(body.workspacePath) ?? normalizeOptionalString(body.workspace_path),
    sessionsLimit,
    basePath: normalizeOptionalString(body.basePath) ?? normalizeOptionalString(body.base_path),
  };
}

export function normalizeWorkspaceRootInput(body: WorkspaceRootRequestBody) {
  const selectedPath =
    normalizeOptionalString(body.path)
    ?? normalizeOptionalString(body.workspaceRoot)
    ?? normalizeOptionalString(body.workspace_root);

  if (!selectedPath) {
    throw new GatewayContractError(
      'cli_usage_error',
      'workspace root requests require a non-empty path.',
      {
        required: ['path'],
      },
      2,
    );
  }

  return {
    path: selectedPath,
  };
}

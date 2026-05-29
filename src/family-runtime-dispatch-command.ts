import type { FamilyRuntimeDomainId } from './family-runtime-types.ts';
import { DOMAIN_ADAPTERS } from './family-runtime-command.ts';
import { resolveOplModuleExecCommand } from './system-installation/modules.ts';

type DomainDispatchCommand = {
  command_preview: string[];
  cwd: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function medAutoScienceWorkspaceBindingDispatchCommand(payload: Record<string, unknown>, taskPath: string) {
  const context = isRecord(payload.opl_domain_export_context) ? payload.opl_domain_export_context : null;
  if (context?.command_source !== 'workspace_binding') {
    return null;
  }
  const commandCwd = optionalString(context.command_cwd);
  if (!commandCwd) {
    return null;
  }
  return {
    command_preview: [
      'uv',
      'run',
      'python',
      '-m',
      'med_autoscience.cli',
      'domain-handler',
      'dispatch',
      '--task',
      taskPath,
      '--format',
      'json',
    ],
    cwd: commandCwd,
  };
}

export function dispatchCommandForDomain(
  domainId: FamilyRuntimeDomainId,
  taskPath: string,
  payload: Record<string, unknown> = {},
): DomainDispatchCommand {
  const overrideKeys = domainId === 'medautoscience'
    ? ['OPL_FAMILY_RUNTIME_MAS_DISPATCH', 'OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH']
    : [`OPL_FAMILY_RUNTIME_${domainId.toUpperCase()}_DISPATCH`];
  const override = overrideKeys.map((key) => process.env[key]?.trim()).find(Boolean);
  if (override) {
    const tokens = override.split(/\s+/);
    const commandPreview = tokens.some((token) => token.includes('{task}'))
      ? tokens.map((token) => token.replaceAll('{task}', taskPath))
      : [...tokens, taskPath];
    return {
      command_preview: commandPreview,
      cwd: process.cwd(),
    };
  }

  if (domainId === 'medautoscience') {
    const workspaceBindingCommand = medAutoScienceWorkspaceBindingDispatchCommand(payload, taskPath);
    if (workspaceBindingCommand) {
      return workspaceBindingCommand;
    }
    const moduleCommand = resolveOplModuleExecCommand('medautoscience', [
      'domain-handler',
      'dispatch',
      '--task',
      taskPath,
      '--format',
      'json',
    ]);
    return {
      command_preview: moduleCommand.command_preview,
      cwd: moduleCommand.working_directory,
    };
  }

  const adapter = DOMAIN_ADAPTERS[domainId];
  if (!adapter) {
    throw new Error(`Domain dispatch adapter is not configured for ${domainId}; use stage attempt runner or explicit OPL work-order surfaces.`);
  }
  return {
    command_preview: [...adapter.dispatch_command, '--task', taskPath, '--format', 'json'],
    cwd: process.cwd(),
  };
}

export function parseDispatchOutput(stdout: string) {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return {};
  }
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return { raw_stdout: trimmed };
  }
}

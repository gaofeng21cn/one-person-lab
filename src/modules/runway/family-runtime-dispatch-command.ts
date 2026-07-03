import type { FamilyRuntimeDomainId } from './family-runtime-types.ts';
import path from 'node:path';

import { isRecord } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import { stringValue as optionalString } from '../../kernel/json-record.ts';
import { DOMAIN_ADAPTERS } from './family-runtime-command.ts';

type DomainDispatchCommand = {
  command_preview: string[];
  cwd: string;
};

export type OplModuleExecCommandResolver = (
  moduleId: string,
  args: string[],
) => {
  command_preview: string[];
  working_directory: string;
  module_id: string;
  module: {
    module_id: string;
    install_origin: string;
    checkout_path: string;
    health_status: string;
    git?: {
      head_sha?: string | null;
      dirty?: boolean;
    } | null;
  };
};

export type FamilyRuntimeDispatchDependencies = {
  resolveOplModuleExecCommand?: OplModuleExecCommandResolver;
};

function medAutoScienceWorkspaceBindingDispatchCommand(payload: Record<string, unknown>, taskPath: string) {
  const context = isRecord(payload.opl_domain_export_context) ? payload.opl_domain_export_context : null;
  if (context?.command_source !== 'workspace_binding') {
    return null;
  }
  const commandCwd = optionalString(context.command_cwd);
  if (!commandCwd) {
    return null;
  }
  const runnerPath = path.join(commandCwd, 'scripts', 'run-python-clean.sh');
  return {
    command_preview: [
      runnerPath,
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
  dependencies: FamilyRuntimeDispatchDependencies = {},
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
    if (dependencies.resolveOplModuleExecCommand) {
      const moduleCommand = dependencies.resolveOplModuleExecCommand('medautoscience', [
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
    return parseJsonText(trimmed) as Record<string, unknown>;
  } catch {
    return { raw_stdout: trimmed };
  }
}

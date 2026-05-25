import type { FamilyRuntimeDomainId } from './family-runtime-types.ts';
import { DOMAIN_ADAPTERS } from './family-runtime-command.ts';
import { resolveOplModuleExecCommand } from './system-installation/modules.ts';

export function commandForDomain(domainId: FamilyRuntimeDomainId, taskPath: string) {
  const override = process.env[`OPL_FAMILY_RUNTIME_${domainId.toUpperCase()}_DISPATCH`]?.trim();
  if (override) {
    const tokens = override.split(/\s+/);
    if (tokens.some((token) => token.includes('{task}'))) {
      return tokens.map((token) => token.replaceAll('{task}', taskPath));
    }
    return [...tokens, taskPath];
  }

  if (domainId === 'medautoscience') {
    return resolveOplModuleExecCommand('medautoscience', [
      'domain-handler',
      'dispatch',
      '--task',
      taskPath,
      '--format',
      'json',
    ]).command_preview;
  }

  return [...DOMAIN_ADAPTERS[domainId].dispatch_command, '--task', taskPath, '--format', 'json'];
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

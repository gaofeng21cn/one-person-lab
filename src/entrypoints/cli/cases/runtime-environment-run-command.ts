import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { executeInPreparedEnvironment, readPreparedContext } from '../../../adapters/execution/runtime-environment-execution.ts';

/** Shared by the lightweight CLI entry and the normal command registry. */
export async function runEnvironmentCommand(args: string[]) {
  const separator = args.indexOf('--');
  if (separator < 0 || !args[separator + 1]) throw new Error('env run requires -- followed by a command.');
  const { values } = parseArgs({ args: args.slice(0, separator), options: {
    domain: { type: 'string' }, profile: { type: 'string' }, platform: { type: 'string' },
    'artifact-root': { type: 'string' }, 'paper-root': { type: 'string' },
    'requirement-profile': { type: 'string' }, 'requirement-profile-id': { type: 'string' },
    cwd: { type: 'string' }, 'timeout-ms': { type: 'string' },
    refresh: { type: 'boolean' }, json: { type: 'boolean' },
  } });
  if (!values.domain || !values.profile) throw new Error('env run requires --domain and --profile.');
  const timeoutMs = values['timeout-ms'] ? Number(values['timeout-ms']) : undefined;
  if (timeoutMs !== undefined && (!Number.isFinite(timeoutMs) || timeoutMs <= 0)) {
    throw new Error('--timeout-ms must be a positive number.');
  }
  const input = {
    domainId: values.domain, profileId: values.profile,
    platformId: values.platform ?? `${process.platform === 'darwin' ? 'macos' : process.platform}-${process.arch === 'x64' ? 'x64' : process.arch}`,
    artifactRoot: path.resolve(values['artifact-root'] ?? values['paper-root'] ?? values.cwd ?? process.cwd()),
    requirementProfilePath: values['requirement-profile'] ? path.resolve(values['requirement-profile']) : undefined,
    requirementProfileId: values['requirement-profile-id'], refresh: values.refresh,
  };
  const contextPath = path.join(input.artifactRoot, 'build', 'dependency_run_context.json');
  let context = readPreparedContext(contextPath, input);
  if (!context || input.refresh) {
    // Package discovery and dependency solving are only loaded on a cache miss.
    if (input.requirementProfilePath) {
      const { buildRuntimeEnvironmentPrepareReadback } = await import('../../../adapters/execution/runtime-environment-prepare.ts');
      buildRuntimeEnvironmentPrepareReadback({ ...input, requirementProfilePath: input.requirementProfilePath, apply: true });
    } else {
      const { prepareEnvironmentForCommand } = await import('./runtime-environment-command-spec.ts');
      await prepareEnvironmentForCommand(input);
    }
    context = readPreparedContext(contextPath, input);
  }
  if (!context) throw new Error('Environment preparation failed; see dependency_environment_receipt.json.');
  const cwd = values.cwd ? path.resolve(values.cwd) : process.cwd();
  if (!fs.statSync(cwd).isDirectory()) throw new Error('--cwd must be a directory.');
  process.exitCode = await executeInPreparedEnvironment({
    context, artifactRoot: input.artifactRoot, command: args.slice(separator + 1), cwd, timeoutMs,
  });
  return { __handled: true };
}

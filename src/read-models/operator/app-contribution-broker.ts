import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import {
  type CordisConnectDescriptorDiscoveryService,
  type InstalledPackageDescriptor,
  installedDescriptorSupportsFrameworkCalls,
} from '../../adapters/integration/index.ts';
import {
  listWorkspaceBindings,
  type WorkspaceBinding,
} from '../../authority/workspace/public/app-state.ts';
import { buildWorkItemProjectionV2 } from './work-item-projection/projection.ts';
import { canonicalWorkspacePath } from './work-item-projection/catalog.ts';

const REQUEST_SCHEMA = 'opl-package-app-contribution-request.v1';
const RESPONSE_SCHEMA = 'opl-package-app-contribution-response.v1';
const ABI_SCHEMA = 'opl-package-app-contribution-cli.v1';
const REF_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?(?:#[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?)?$/;
const PACKAGE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;
const BARE_COMMAND_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/;
const INVOCATION_TIMEOUT_MS = 120_000;
const INVOCATION_MAX_BUFFER = 32 * 1024 * 1024;

type JsonRecord = Record<string, unknown>;
export type AppContributionOperation = 'read' | 'execute';

type AppContributionWorkItemIdentity = {
  agent_id: string;
  domain_id: string;
  work_item_id: string;
  domain_work_item_id: string;
  work_item_scope_id: string;
  identity_state: 'resolved';
};

export type AppContributionRequest = {
  packageId: string;
  ref: string;
  operation: AppContributionOperation;
  input: JsonRecord;
  confirmed: boolean;
};

type ContributionAbi = {
  argv: string[];
};

type ResolvedContribution = {
  descriptor: InstalledPackageDescriptor;
  abi: ContributionAbi;
  confirmationRequired: boolean;
};

type AppContributionBrokerOptions = {
  descriptorDiscovery?: Pick<CordisConnectDescriptorDiscoveryService, 'discover'>;
  resolveWorkItemWorkspace?: (identity: AppContributionWorkItemIdentity) => string | null;
  workspaceBindings?: ReadonlyArray<WorkspaceBinding>;
};

function contributionReadback(resolved: ResolvedContribution, request: AppContributionRequest) {
  return {
    surface_kind: 'opl_app_package_contribution.v1',
    package_id: resolved.descriptor.manifest.package_id,
    ref: request.ref,
    operation: request.operation,
    confirmation_required: resolved.confirmationRequired,
    carrier_readback: {
      kind: resolved.descriptor.carrier_readback.kind,
      identity: resolved.descriptor.carrier_readback.identity,
      lifecycle_authority: resolved.descriptor.carrier_readback.lifecycle_authority,
    },
    readiness: {
      installed: resolved.descriptor.readiness.installed,
      physical_status: resolved.descriptor.readiness.physical_status,
      callability: resolved.descriptor.readiness.projection_callability
        ?? resolved.descriptor.readiness.callability,
    },
  };
}

function usageError(message: string, details?: JsonRecord): never {
  throw new FrameworkContractError('cli_usage_error', message, details);
}

function contractError(message: string, details?: JsonRecord): never {
  throw new FrameworkContractError('contract_shape_invalid', message, details);
}

function requireDescriptorDiscovery(
  descriptorDiscovery?: Pick<CordisConnectDescriptorDiscoveryService, 'discover'>,
) {
  if (!descriptorDiscovery) {
    return contractError(
      'App contribution requires the Cordis Connect descriptor discovery service.',
      { failure_code: 'cordis_connect_descriptor_discovery_service_required' },
    );
  }
  return descriptorDiscovery.discover;
}

function requireJsonObject(value: string, option: string): JsonRecord {
  const parsed = parseJsonText(value);
  if (!isRecord(parsed)) {
    usageError(`${option} must be a JSON object.`, { option });
  }
  return parsed;
}

function parseStringOption(
  args: string[],
  index: number,
  option: string,
) {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    usageError(`${option} requires a value.`, { option });
  }
  return value;
}

export function parseAppContributionArgs(
  args: string[],
  operation: AppContributionOperation,
): AppContributionRequest {
  let packageId = '';
  let ref = '';
  let input: JsonRecord = {};
  let inputSet = false;
  let confirmed = false;

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--package-id') {
      packageId = parseStringOption(args, index, token);
      index += 1;
      continue;
    }
    if (token === '--ref') {
      ref = parseStringOption(args, index, token);
      index += 1;
      continue;
    }
    if (token === '--input') {
      if (inputSet) usageError('Use only one contribution input source.', { option: token });
      input = requireJsonObject(parseStringOption(args, index, token), token);
      inputSet = true;
      index += 1;
      continue;
    }
    if (token === '--input-stdin') {
      if (inputSet) usageError('Use only one contribution input source.', { option: token });
      input = requireJsonObject(fs.readFileSync(0, 'utf8'), token);
      inputSet = true;
      continue;
    }
    if (token === '--confirm' && operation === 'execute') {
      confirmed = true;
      continue;
    }
    usageError(`Unknown app contribution ${operation} option: ${token}.`, {
      option: token,
      usage: contributionUsage(operation),
    });
  }

  if (!PACKAGE_ID_PATTERN.test(packageId)) {
    usageError('app contribution requires a valid --package-id.', { required: ['--package-id'] });
  }
  if (!REF_PATTERN.test(ref)) {
    usageError('app contribution requires a valid --ref.', { required: ['--ref'] });
  }
  return { packageId, ref, operation, input, confirmed };
}

export function contributionUsage(operation: AppContributionOperation) {
  return operation === 'read'
    ? 'opl app contribution read --package-id <package_id> --ref <data_ref> [--input <json>|--input-stdin]'
    : 'opl app contribution execute --package-id <package_id> --ref <action_ref> [--input <json>|--input-stdin] [--confirm]';
}

function contributionAbi(descriptor: InstalledPackageDescriptor): ContributionAbi {
  const raw = descriptor.manifest.codex_surface.app_contribution_abi;
  if (!isRecord(raw)) {
    return contractError('Installed Package does not declare an app contribution ABI.', {
      package_id: descriptor.manifest.package_id,
      failure_code: 'agent_package_app_contribution_abi_missing',
    });
  }
  const argv = Array.isArray(raw.argv) && raw.argv.every(
    (entry) => typeof entry === 'string' && entry.length > 0 && !entry.includes('\0'),
  ) ? raw.argv : null;
  if (
    raw.schema_version !== ABI_SCHEMA
    || raw.transport !== 'stdin_json_stdout_json'
    || raw.request_schema !== REQUEST_SCHEMA
    || raw.response_schema !== RESPONSE_SCHEMA
    || !argv
  ) {
    return contractError('Installed Package app contribution ABI is invalid.', {
      package_id: descriptor.manifest.package_id,
      failure_code: 'agent_package_app_contribution_abi_invalid',
    });
  }
  const adapter = descriptor.manifest.codex_surface.app_contribution_adapter;
  if (adapter !== undefined) {
    if (
      !isRecord(adapter)
      || adapter.manifest !== 'app-contribution-adapter.json'
    ) {
      return contractError('Installed Package app contribution adapter is invalid.', {
        package_id: descriptor.manifest.package_id,
        failure_code: 'agent_package_app_contribution_adapter_invalid',
      });
    }
    const adapterFile = path.resolve(descriptor.sourcePath, adapter.manifest);
    if (
      !adapterFile.startsWith(`${path.resolve(descriptor.sourcePath)}${path.sep}`)
      || !fs.statSync(adapterFile, { throwIfNoEntry: false })?.isFile()
    ) {
      return contractError('Installed Package app contribution adapter file is missing.', {
        package_id: descriptor.manifest.package_id,
        failure_code: 'agent_package_app_contribution_adapter_missing',
      });
    }
  }
  return { argv };
}

function workItemIdentity(request: AppContributionRequest): AppContributionWorkItemIdentity | null {
  if (!Object.hasOwn(request.input, 'work_item_identity')) return null;
  const raw = request.input.work_item_identity;
  if (!isRecord(raw)) {
    return contractError('App contribution work-item identity must be an object.', {
      failure_code: 'agent_package_app_contribution_work_item_identity_invalid',
    });
  }
  const required = [
    'agent_id',
    'domain_id',
    'work_item_id',
    'domain_work_item_id',
    'work_item_scope_id',
  ] as const;
  for (const field of required) {
    if (typeof raw[field] !== 'string' || !raw[field].trim()) {
      return contractError('App contribution work-item identity is incomplete.', {
        field,
        failure_code: 'agent_package_app_contribution_work_item_identity_invalid',
      });
    }
  }
  if (raw.identity_state !== 'resolved' || raw.work_item_id !== raw.domain_work_item_id) {
    return contractError('App contribution work-item identity is unresolved or inconsistent.', {
      failure_code: 'agent_package_app_contribution_work_item_identity_invalid',
    });
  }
  return raw as AppContributionWorkItemIdentity;
}

function resolveProjectedWorkItemWorkspace(identity: AppContributionWorkItemIdentity) {
  const matches = buildWorkItemProjectionV2({ profile: 'fast' }).items.filter((item) => (
    item.identity.agent_id === identity.agent_id
    && item.identity.domain_id === identity.domain_id
    && item.identity.work_item_id === identity.work_item_id
    && item.identity.domain_work_item_id === identity.domain_work_item_id
    && item.identity.work_item_scope_id === identity.work_item_scope_id
    && item.identity.identity_state === identity.identity_state
  ));
  return matches.length === 1 ? matches[0]!.identity.workspace_path : null;
}

function explicitWorkspacePath(request: AppContributionRequest) {
  if (!Object.hasOwn(request.input, 'workspace_path')) return null;
  const value = request.input.workspace_path;
  if (typeof value !== 'string' || !value.trim()) {
    return contractError('App contribution workspace_path must be a non-empty string.', {
      failure_code: 'agent_package_app_contribution_workspace_invalid',
    });
  }
  if (!path.isAbsolute(value)) {
    return contractError('App contribution workspace_path must be absolute.', {
      failure_code: 'agent_package_app_contribution_workspace_invalid',
    });
  }
  return canonicalWorkspacePath(value);
}

function resolveBoundWorkspace(
  workspacePath: string,
  bindings: ReadonlyArray<WorkspaceBinding>,
) {
  const canonical = canonicalWorkspacePath(workspacePath);
  const matches = bindings.filter((binding) => (
    binding.status !== 'archived'
    && canonicalWorkspacePath(binding.workspace_path) === canonical
    && fs.statSync(binding.workspace_path, { throwIfNoEntry: false })?.isDirectory()
  ));
  if (matches.length === 0) {
    return contractError('App contribution workspace_path does not match a registered workspace binding.', {
      failure_code: 'agent_package_app_contribution_workspace_unregistered',
    });
  }
  return canonical;
}

function contributionInvocationEnv(
  request: AppContributionRequest,
  resolveWorkspace: NonNullable<AppContributionBrokerOptions['resolveWorkItemWorkspace']>,
  workspaceBindings: () => ReadonlyArray<WorkspaceBinding>,
) {
  const identity = workItemIdentity(request);
  const explicitWorkspace = explicitWorkspacePath(request);
  const identityWorkspace = identity ? resolveWorkspace(identity) : null;
  if (identity && !identityWorkspace) {
    return contractError('App contribution work-item identity does not resolve to one current workspace.', {
      agent_id: identity.agent_id,
      domain_id: identity.domain_id,
      work_item_id: identity.work_item_id,
      work_item_scope_id: identity.work_item_scope_id,
      failure_code: 'agent_package_app_contribution_work_item_identity_unresolved',
    });
  }
  if (
    explicitWorkspace
    && identityWorkspace
    && canonicalWorkspacePath(identityWorkspace) !== explicitWorkspace
  ) {
    return contractError('App contribution work-item identity and workspace_path do not identify the same workspace.', {
      failure_code: 'agent_package_app_contribution_workspace_conflict',
    });
  }
  const workspaceRoot = explicitWorkspace ?? identityWorkspace;
  if (!workspaceRoot) return process.env;
  const boundWorkspace = resolveBoundWorkspace(workspaceRoot, workspaceBindings());
  if (!workspaceRoot || !path.isAbsolute(workspaceRoot) || !fs.statSync(workspaceRoot, { throwIfNoEntry: false })?.isDirectory()) {
    return contractError('App contribution workspace is not a current directory.', {
      failure_code: 'agent_package_app_contribution_workspace_invalid',
    });
  }
  return { ...process.env, OPL_PROFILE_WORKSPACE: boundWorkspace };
}

function resolveContribution(input: AppContributionRequest, discover: () => Map<string, InstalledPackageDescriptor>) {
  const descriptor = discover().get(input.packageId);
  if (!descriptor) {
    return contractError('App contribution Package is not installed through a discoverable carrier.', {
      package_id: input.packageId,
      failure_code: 'agent_package_app_contribution_package_unavailable',
    });
  }
  if (!installedDescriptorSupportsFrameworkCalls(descriptor)) {
    return contractError('Installed Package carrier is not callable for its app contribution.', {
      package_id: input.packageId,
      carrier_identity: descriptor.carrier_readback.identity,
      failure_code: 'agent_package_app_contribution_carrier_unavailable',
    });
  }
  const contributions = descriptor.manifest.app_contributions;
  if (!contributions) {
    return contractError('Installed Package does not declare app contributions.', {
      package_id: input.packageId,
      failure_code: 'agent_package_app_contribution_missing',
    });
  }
  const matchingCommands = input.operation === 'read'
    ? []
    : contributions.commands.filter((entry) => entry.action_ref === input.ref);
  const confirmationRequired = matchingCommands.some((entry) => entry.confirmation_required);
  const declared = input.operation === 'read'
    ? contributions.views.some((entry) => entry.data_ref === input.ref)
      || contributions.badges.some((entry) => entry.data_ref === input.ref)
    : matchingCommands.length > 0;
  if (!declared) {
    return contractError('Contribution ref is not declared for the requested Package operation.', {
      package_id: input.packageId,
      ref: input.ref,
      operation: input.operation,
      failure_code: 'agent_package_app_contribution_ref_not_declared',
    });
  }
  if (confirmationRequired === true && !input.confirmed) {
    return usageError('This Package contribution requires explicit --confirm before execution.', {
      package_id: input.packageId,
      ref: input.ref,
      required: ['--confirm'],
      failure_code: 'agent_package_app_contribution_confirmation_required',
    });
  }
  return {
    descriptor,
    abi: contributionAbi(descriptor),
    confirmationRequired: confirmationRequired === true,
  } satisfies ResolvedContribution;
}

function executableArgv(resolved: ResolvedContribution) {
  const [command, ...args] = resolved.abi.argv;
  if (!command) {
    return contractError('Installed Package app contribution ABI has no command.', {
      package_id: resolved.descriptor.manifest.package_id,
      failure_code: 'agent_package_app_contribution_abi_invalid',
    });
  }
  if (command.startsWith('./')) {
    const root = path.resolve(resolved.descriptor.sourcePath);
    const executable = path.resolve(root, command);
    if (!executable.startsWith(`${root}${path.sep}`) || !fs.existsSync(executable)) {
      return contractError('Relative app contribution command must exist inside the installed carrier source root.', {
        package_id: resolved.descriptor.manifest.package_id,
        failure_code: 'agent_package_app_contribution_command_unavailable',
      });
    }
    return { command: executable, args };
  }
  if (!BARE_COMMAND_PATTERN.test(command)) {
    return contractError('App contribution command must be a package-relative executable or bare program name.', {
      package_id: resolved.descriptor.manifest.package_id,
      failure_code: 'agent_package_app_contribution_command_invalid',
    });
  }
  return { command, args };
}

function invokeContribution(
  resolved: ResolvedContribution,
  request: AppContributionRequest,
  resolveWorkspace: NonNullable<AppContributionBrokerOptions['resolveWorkItemWorkspace']>,
  workspaceBindings: () => ReadonlyArray<WorkspaceBinding>,
) {
  const executable = executableArgv(resolved);
  const ownerInput = Object.fromEntries(
    Object.entries(request.input).filter(([key]) => (
      key !== 'workspace_path' && key !== 'work_item_root'
    )),
  );
  const result = spawnSync(executable.command, executable.args, {
    cwd: resolved.descriptor.sourcePath,
    encoding: 'utf8',
    input: JSON.stringify({
      schema_version: REQUEST_SCHEMA,
      operation: request.operation,
      ref: request.ref,
      input: ownerInput,
    }),
    timeout: INVOCATION_TIMEOUT_MS,
    maxBuffer: INVOCATION_MAX_BUFFER,
    env: contributionInvocationEnv(request, resolveWorkspace, workspaceBindings),
  });
  if (result.error || result.status !== 0) {
    return contractError('Package-owned app contribution command failed.', {
      package_id: resolved.descriptor.manifest.package_id,
      ref: request.ref,
      operation: request.operation,
      exit_status: result.status,
      error: result.error?.message ?? null,
      stderr_present: Boolean(result.stderr?.trim()),
      failure_code: 'agent_package_app_contribution_command_failed',
    });
  }
  let response: unknown;
  try {
    response = parseJsonText(result.stdout ?? '');
  } catch {
    return contractError('Package-owned app contribution command did not return JSON.', {
      package_id: resolved.descriptor.manifest.package_id,
      failure_code: 'agent_package_app_contribution_response_invalid',
    });
  }
  if (
    !isRecord(response)
    || response.schema_version !== RESPONSE_SCHEMA
    || response.ok !== true
    || response.ref !== request.ref
    || response.operation !== request.operation
  ) {
    return contractError('Package-owned app contribution response does not match the requested descriptor ref.', {
      package_id: resolved.descriptor.manifest.package_id,
      ref: request.ref,
      operation: request.operation,
      failure_code: 'agent_package_app_contribution_response_invalid',
    });
  }
  return response;
}

export function runAppContribution(
  request: AppContributionRequest,
  options: AppContributionBrokerOptions = {},
) {
  const discover = requireDescriptorDiscovery(options.descriptorDiscovery);
  const resolved = resolveContribution(request, discover);
  const workspaceBindings = () => options.workspaceBindings ?? listWorkspaceBindings();
  const response = invokeContribution(
    resolved,
    request,
    options.resolveWorkItemWorkspace ?? resolveProjectedWorkItemWorkspace,
    workspaceBindings,
  );
  return {
    opl_app_contribution: {
      ...contributionReadback(resolved, request),
      response,
    },
  };
}

export function preflightAppContribution(
  request: AppContributionRequest,
  options: {
    descriptorDiscovery?: Pick<CordisConnectDescriptorDiscoveryService, 'discover'>;
  } = {},
) {
  const discover = requireDescriptorDiscovery(options.descriptorDiscovery);
  const resolved = resolveContribution(request, discover);
  return {
    opl_app_contribution_preflight: {
      ...contributionReadback(resolved, request),
      execution_status: 'dry_run',
      package_command_invoked: false,
    },
  };
}

export function hasExecutableAppContribution(
  options: {
    descriptorDiscovery?: Pick<CordisConnectDescriptorDiscoveryService, 'discover'>;
  } = {},
): boolean {
  try {
    const discover = requireDescriptorDiscovery(options.descriptorDiscovery);
    return [...discover().values()].some((descriptor) => {
      if (
        !installedDescriptorSupportsFrameworkCalls(descriptor)
        || !descriptor.manifest.app_contributions?.commands.length
      ) {
        return false;
      }
      try {
        contributionAbi(descriptor);
        return true;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

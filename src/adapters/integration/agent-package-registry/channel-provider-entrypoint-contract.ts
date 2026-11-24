import path from 'node:path';

import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import { recordList } from '../../../kernel/json-record.ts';
import { assertStringValue } from './shared.ts';

export type ChannelProviderPackageEntrypoint = Readonly<{
  entrypoint_id: string;
  kind: 'channel_provider';
  module_ref: string;
  export_name: string;
}>;

export type RemoteCompanionConnectorPackageEntrypoint = Readonly<{
  entrypoint_id: string;
  kind: 'remote_companion_connector';
  module_ref: string;
  export_name: string;
}>;

function normalizedModuleRef(value: unknown, field: string) {
  const raw = assertStringValue(value, field);
  const normalized = path.posix.normalize(raw);
  if (
    raw.includes('\\')
    || path.posix.isAbsolute(raw)
    || path.win32.isAbsolute(raw)
    || normalized === '.'
    || normalized === '..'
    || normalized.startsWith('../')
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `${field} must use POSIX separators and stay within its installed Package root.`,
      {
        field,
        value: raw,
        failure_code: 'agent_package_channel_provider_entrypoint_invalid',
      },
    );
  }
  return normalized;
}

export function normalizePackageEntrypoints(
  value: unknown,
  manifestUrl: string,
): Record<string, unknown>[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Package entrypoints must be an array.', {
      manifest_url: manifestUrl,
      failure_code: 'agent_package_entrypoint_invalid',
    });
  }
  const entries = recordList(value);
  if (entries.length !== value.length) {
    throw new FrameworkContractError('contract_shape_invalid', 'Package entrypoints must be objects.', {
      manifest_url: manifestUrl,
      failure_code: 'agent_package_entrypoint_invalid',
    });
  }
  const channelProviderEntries = entries.filter((entry) => entry.kind === 'channel_provider');
  if (channelProviderEntries.length > 1) {
    throw new FrameworkContractError('contract_shape_invalid', 'A Package may declare only one channel provider entrypoint.', {
      manifest_url: manifestUrl,
      failure_code: 'agent_package_channel_provider_entrypoint_invalid',
    });
  }
  const remoteCompanionEntries = entries.filter((entry) => entry.kind === 'remote_companion_connector');
  if (remoteCompanionEntries.length > 1) {
    throw new FrameworkContractError('contract_shape_invalid', 'A Package may declare only one remote companion connector entrypoint.', {
      manifest_url: manifestUrl,
      failure_code: 'agent_package_remote_companion_connector_entrypoint_invalid',
    });
  }
  return entries.map((entry, index) => {
    if (entry.kind !== 'channel_provider' && entry.kind !== 'remote_companion_connector') return entry;
    const unexpected = Object.keys(entry).filter((key) => ![
      'entrypoint_id',
      'kind',
      'module_ref',
      'export_name',
    ].includes(key));
    const entrypointId = assertStringValue(
      entry.entrypoint_id,
      `entrypoints[${index}].entrypoint_id`,
    );
    const exportName = assertStringValue(entry.export_name, `entrypoints[${index}].export_name`);
    if (
      unexpected.length > 0
      || !/^[a-z][a-z0-9._-]*$/.test(entrypointId)
      || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(exportName)
    ) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        entry.kind === 'channel_provider'
          ? 'Channel provider entrypoint declaration is invalid.'
          : 'Remote companion connector entrypoint declaration is invalid.',
        {
        manifest_url: manifestUrl,
        entrypoint_index: index,
        unsupported_fields: unexpected,
        failure_code: entry.kind === 'channel_provider'
          ? 'agent_package_channel_provider_entrypoint_invalid'
          : 'agent_package_remote_companion_connector_entrypoint_invalid',
        },
      );
    }
    return {
      entrypoint_id: entrypointId,
      kind: entry.kind,
      module_ref: normalizedModuleRef(
        entry.module_ref,
        `entrypoints[${index}].module_ref`,
      ),
      export_name: exportName,
    };
  });
}

export function assertChannelProviderEntrypointsContentLocked(
  entrypoints: readonly Record<string, unknown>[],
  contentLockPaths: readonly string[],
  manifestUrl: string,
) {
  const unlockedEntrypointRefs = entrypoints.flatMap((entry) => (
    entry.kind === 'channel_provider'
      && typeof entry.module_ref === 'string'
      && !contentLockPaths.includes(entry.module_ref)
      ? [entry.module_ref]
      : []
  ));
  if (unlockedEntrypointRefs.length > 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'Channel provider modules must be covered by the Package content lock.', {
      manifest_url: manifestUrl,
      unlocked_entrypoint_refs: unlockedEntrypointRefs,
      failure_code: 'agent_package_channel_provider_entrypoint_unlocked',
    });
  }
}

export function assertRemoteCompanionEntrypointsContentLocked(
  entrypoints: readonly Record<string, unknown>[],
  contentLockPaths: readonly string[],
  manifestUrl: string,
) {
  const unlockedEntrypointRefs = entrypoints.flatMap((entry) => (
    entry.kind === 'remote_companion_connector'
      && typeof entry.module_ref === 'string'
      && !contentLockPaths.includes(entry.module_ref)
      ? [entry.module_ref]
      : []
  ));
  if (unlockedEntrypointRefs.length > 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'Remote companion connector modules must be covered by the Package content lock.', {
      manifest_url: manifestUrl,
      unlocked_entrypoint_refs: unlockedEntrypointRefs,
      failure_code: 'agent_package_remote_companion_connector_entrypoint_unlocked',
    });
  }
}

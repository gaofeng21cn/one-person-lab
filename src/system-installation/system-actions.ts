import {
  readOplUpdateChannel,
  readOplWorkspaceRoot,
  writeOplUpdateChannel,
} from '../system-preferences.ts';
import { runProductEntryRepairHermesGateway } from '../product-entry-runtime.ts';
import { runNativeHelperRepairAction } from '../native-helper-runtime.ts';
import type { GatewayContracts } from '../types.ts';

import type {
  OplSystemAction,
  OplSystemActionInput,
} from './shared.ts';

export async function runOplSystemAction(
  contracts: GatewayContracts,
  action: OplSystemAction,
  input: OplSystemActionInput = {},
) {
  if (action === 'repair') {
    const repairPayload = runProductEntryRepairHermesGateway();
    return {
      version: 'g2',
      system_action: {
        action,
        status: 'completed',
        update_channel: readOplUpdateChannel().channel,
        workspace_root: readOplWorkspaceRoot(),
        details: repairPayload.product_entry,
      },
    };
  }

  if (action === 'repair_native_helpers') {
    const repairPayload = runNativeHelperRepairAction();
    return {
      version: 'g2',
      system_action: {
        action,
        status: repairPayload.status === 'completed' || repairPayload.status === 'skipped_ready'
          ? 'completed'
          : repairPayload.status,
        update_channel: readOplUpdateChannel().channel,
        workspace_root: readOplWorkspaceRoot(),
        details: repairPayload,
      },
    };
  }

  if (!input.channel) {
    const current = readOplUpdateChannel();
    return {
      version: 'g2',
      system_action: {
        action,
        status: 'ready',
        update_channel: current.channel,
        workspace_root: readOplWorkspaceRoot(),
        details: current,
      },
    };
  }

  const payload = writeOplUpdateChannel(input.channel);
  return {
    version: 'g2',
    system_action: {
      action,
      status: 'completed',
      update_channel: payload.channel,
      workspace_root: readOplWorkspaceRoot(),
      details: payload,
    },
  };
}

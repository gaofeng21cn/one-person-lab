import {
  readFrontDeskUpdateChannel,
  readFrontDeskWorkspaceRoot,
  writeFrontDeskUpdateChannel,
} from '../frontdesk-preferences.ts';
import { runProductEntryRepairHermesGateway } from '../product-entry.ts';
import type { GatewayContracts } from '../types.ts';

import type {
  FrontDeskSystemAction,
  FrontDeskSystemActionInput,
} from './shared.ts';

export async function runFrontDeskSystemAction(
  contracts: GatewayContracts,
  action: FrontDeskSystemAction,
  input: FrontDeskSystemActionInput = {},
) {
  if (action === 'repair') {
    const repairPayload = runProductEntryRepairHermesGateway();
    return {
      version: 'g2',
      frontdesk_system_action: {
        action,
        status: 'completed',
        update_channel: readFrontDeskUpdateChannel().channel,
        workspace_root: readFrontDeskWorkspaceRoot(),
        details: repairPayload.product_entry,
      },
    };
  }

  if (!input.channel) {
    const current = readFrontDeskUpdateChannel();
    return {
      version: 'g2',
      frontdesk_system_action: {
        action,
        status: 'ready',
        update_channel: current.channel,
        workspace_root: readFrontDeskWorkspaceRoot(),
        details: current,
      },
    };
  }

  const payload = writeFrontDeskUpdateChannel(input.channel);
  return {
    version: 'g2',
    frontdesk_system_action: {
      action,
      status: 'completed',
      update_channel: payload.channel,
      workspace_root: readFrontDeskWorkspaceRoot(),
      details: payload,
    },
  };
}

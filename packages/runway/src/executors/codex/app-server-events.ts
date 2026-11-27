import { isRecord } from '@opl/core';
import type { CapabilityCallObservation } from '../spi.ts';
import type { CodexAppServerNotification } from './app-server.ts';
import { readCompletedMcpReceipt } from './events.ts';

type TurnEvent =
  | { kind: 'message'; itemId: string; text: string; complete: boolean }
  | CapabilityCallObservation
  | { kind: 'usage'; tokenUsage: unknown }
  | { kind: 'terminal'; state: 'completed' | 'failed' | 'cancelled'; error?: string };

export interface AppServerTurnEvent {
  turnId: string;
  event: TurnEvent;
}

// Project notifications before buffering them. An item can precede the turn/start
// response, and native MCP arguments/results must never enter the pending queue.
export function readAppServerTurnEvent(
  { method, params }: CodexAppServerNotification,
): AppServerTurnEvent | null {
  const turn = isRecord(params.turn) ? params.turn : null;
  const turnId = method === 'turn/completed' ? turn?.id : params.turnId;
  if (typeof turnId !== 'string') return null;

  if (method === 'turn/completed' && turn) {
    if (turn.status === 'completed') return { turnId, event: { kind: 'terminal', state: 'completed' } };
    if (turn.status === 'interrupted') return { turnId, event: { kind: 'terminal', state: 'cancelled' } };
    const error = isRecord(turn.error) && typeof turn.error.message === 'string'
      ? turn.error.message : 'Codex app-server returned an unsuccessful turn.';
    return { turnId, event: { kind: 'terminal', state: 'failed', error } };
  }
  if (method === 'turn/failed') {
    const error = typeof params.message === 'string' ? params.message : 'Codex app-server turn failed';
    return { turnId, event: { kind: 'terminal', state: 'failed', error } };
  }
  if (method === 'item/agentMessage/delta' && typeof params.itemId === 'string'
      && typeof params.delta === 'string' && params.delta) {
    return { turnId, event: { kind: 'message', itemId: params.itemId, text: params.delta, complete: false } };
  }
  if (method === 'thread/tokenUsage/updated') return { turnId, event: { kind: 'usage', tokenUsage: params.tokenUsage } };

  if (method !== 'item/completed' || !isRecord(params.item)) return null;
  const item = params.item;
  if (item.type === 'agentMessage' && typeof item.id === 'string' && typeof item.text === 'string') {
    return { turnId, event: { kind: 'message', itemId: item.id, text: item.text, complete: true } };
  }
  const receipt = readCompletedMcpReceipt(item, 'app_server_item');
  return receipt ? { turnId, event: receipt } : null;
}

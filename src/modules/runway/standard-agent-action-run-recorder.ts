import type { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import {
  buildStandardAgentActionRunLedgerEvent,
  type StandardAgentActionRunLedgerInput,
} from '../ledger/public/standard-agent-action-run-ledger.ts';
import { insertEvent } from './family-runtime-store.ts';

export type StandardAgentActionRunEventInput = StandardAgentActionRunLedgerInput & {
  db: DatabaseSync;
};

const EVENT_INPUT_KEYS = [
  'db',
  'runId',
  'domainId',
  'actionId',
  'bindingRef',
  'status',
  'startedAt',
  'recordedAt',
  'input',
  'output',
] as const;

function fail(message: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, details);
}

export function recordStandardAgentActionRunEvent(input: StandardAgentActionRunEventInput) {
  if (!isRecord(input)) fail('Standard Agent action run event input must be an object.');
  const forbidden = Object.keys(input).filter((key) => !EVENT_INPUT_KEYS.includes(
    key as typeof EVENT_INPUT_KEYS[number],
  ));
  if (forbidden.length > 0) {
    fail('Standard Agent action run ledger event input contains forbidden fields.', {
      field: 'event input',
      forbidden_fields: forbidden,
    });
  }
  const event = buildStandardAgentActionRunLedgerEvent({
    runId: input.runId,
    domainId: input.domainId,
    actionId: input.actionId,
    bindingRef: input.bindingRef,
    status: input.status,
    startedAt: input.startedAt,
    recordedAt: input.recordedAt,
    input: input.input,
    output: input.output,
  });
  return {
    ledger_entry: event.payload,
    recorded_event: insertEvent(input.db, event),
  };
}

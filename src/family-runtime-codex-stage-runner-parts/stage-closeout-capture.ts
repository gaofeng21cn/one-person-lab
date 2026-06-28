import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { parseCloseoutFromCodexMessages } from './session-closeout-recovery.ts';

export function stageCloseoutOutputSchemaForTest() {
  return {
    type: 'object',
    required: ['surface_kind'],
    anyOf: [
      { required: ['closeout_refs'] },
      { required: ['closeout_ref'] },
      { required: ['receipt_ref'] },
      { required: ['packet_ref'] },
    ],
    properties: {
      surface_kind: {
        enum: [
          'stage_attempt_closeout_packet',
          'stage_memory_closeout_packet',
          'domain_stage_closeout_packet',
        ],
      },
      stage_attempt_id: { type: 'string' },
      idempotency_key: { type: 'string' },
      closeout_id: { type: 'string' },
      closeout_ref: { type: 'string' },
      closeout_refs: {
        type: 'array',
        minItems: 1,
        items: {
          anyOf: [
            { type: 'string' },
            {
              type: 'object',
              anyOf: [
                { required: ['ref'] },
                { required: ['uri'] },
              ],
              properties: {
                ref: { type: 'string' },
                uri: { type: 'string' },
                ref_kind: { type: 'string' },
                kind: { type: 'string' },
                sha256: { type: 'string' },
                size_bytes: { type: 'number' },
              },
              additionalProperties: true,
            },
          ],
        },
      },
      receipt_ref: { type: 'string' },
      packet_ref: { type: 'string' },
      consumed_refs: {
        type: 'array',
        items: { type: 'string' },
      },
      consumed_memory_refs: {
        type: 'array',
        items: { type: 'string' },
      },
      writeback_receipt_refs: {
        type: 'array',
        items: { type: 'string' },
      },
      rejected_writes: {
        type: 'array',
        items: { type: 'object' },
      },
      next_owner: {
        type: ['string', 'null'],
      },
      domain_ready_verdict: {
        type: ['string', 'null'],
      },
      user_stage_log: { type: 'object' },
      stage_log_summary: { type: 'object' },
      human_stage_log: { type: 'object' },
      route_impact: { type: 'object' },
      authority_boundary: { type: 'object' },
    },
    additionalProperties: true,
  };
}

export function createCodexCloseoutCaptureForTest(input?: {
  writeFileSync?: typeof fs.writeFileSync;
}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-stage-closeout-'));
  const outputLastMessagePath = path.join(root, 'last-message.json');
  const outputSchemaPath = path.join(root, 'stage-closeout.schema.json');
  const writeFileSync = input?.writeFileSync ?? fs.writeFileSync;
  try {
    writeFileSync(outputSchemaPath, `${JSON.stringify(stageCloseoutOutputSchemaForTest(), null, 2)}\n`, 'utf8');
  } catch (error) {
    fs.rmSync(root, { recursive: true, force: true });
    throw error;
  }
  return {
    root,
    outputLastMessagePath,
    outputSchemaPath,
    cleanup() {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

export function createCodexCloseoutCapture() {
  return createCodexCloseoutCaptureForTest();
}

function readCapturedLastMessage(filePath: string) {
  try {
    const stat = fs.statSync(filePath);
    const maxLastMessageBytes = 1024 * 1024;
    if (!stat.isFile() || stat.size <= 0 || stat.size > maxLastMessageBytes) {
      return null;
    }
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

export function parseCapturedCloseoutMessage(filePath: string) {
  const message = readCapturedLastMessage(filePath);
  if (!message) {
    return {
      closeoutPacket: null,
      message,
    };
  }
  return {
    closeoutPacket: parseCloseoutFromCodexMessages([message]),
    message,
  };
}

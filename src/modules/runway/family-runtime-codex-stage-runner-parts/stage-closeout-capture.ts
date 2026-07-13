import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { stringValue as optionalString } from '../../../kernel/json-record.ts';
import { ensureOplStateDir } from '../../../kernel/runtime-state-paths.ts';
import { parseCloseoutFromCodexMessages } from './session-closeout-recovery.ts';
import type { JsonRecord } from './shared.ts';

export function createCodexCloseoutCaptureForTest() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-stage-output-'));
  const outputLastMessagePath = path.join(root, 'last-message.txt');
  return {
    root,
    outputLastMessagePath,
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

function safeAttemptDirectory(attemptId: string) {
  const readable = attemptId.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'attempt';
  const digest = crypto.createHash('sha256').update(attemptId).digest('hex').slice(0, 12);
  return `${readable}-${digest}`;
}

export function persistRawStageOutput(input: {
  attempt: JsonRecord;
  content: string | null | undefined;
  observedAt?: string | null;
}) {
  const content = input.content?.trim();
  if (!content) {
    return null;
  }
  const attemptId = optionalString(input.attempt.stage_attempt_id) ?? 'unknown-attempt';
  const stageId = optionalString(input.attempt.stage_id) ?? 'unknown-stage';
  const domainId = optionalString(input.attempt.domain_id) ?? 'unknown-domain';
  const state = ensureOplStateDir();
  const artifactDir = path.join(
    state.state_dir,
    'runtime-state',
    'stage-attempt-artifacts',
    safeAttemptDirectory(attemptId),
  );
  fs.mkdirSync(artifactDir, { recursive: true });
  const outputFile = path.join(artifactDir, 'raw-executor-output.txt');
  fs.writeFileSync(outputFile, `${content}\n`, 'utf8');
  const bytes = fs.readFileSync(outputFile);
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const outputRef = pathToFileURL(outputFile).href;
  const metadataFile = path.join(artifactDir, 'raw-executor-output.metadata.json');
  const metadata = {
    surface_kind: 'opl_raw_stage_output_artifact',
    version: 'raw-stage-output-artifact.v1',
    domain_id: domainId,
    stage_id: stageId,
    stage_attempt_id: attemptId,
    output_ref: outputRef,
    sha256,
    size_bytes: bytes.length,
    observed_at: input.observedAt ?? new Date().toISOString(),
    artifact_is_domain_truth: false,
    artifact_is_owner_receipt: false,
    artifact_is_quality_verdict: false,
    artifact_is_consumable_progress_input: true,
    authority_boundary: {
      opl: 'raw_executor_output_persistence_and_refs_only_envelope',
      domain: 'semantic_interpretation_quality_and_route_back_owner',
    },
  };
  fs.writeFileSync(metadataFile, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
  return {
    ...metadata,
    metadata_ref: pathToFileURL(metadataFile).href,
  };
}

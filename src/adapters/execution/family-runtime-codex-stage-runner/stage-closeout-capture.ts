import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { stringValue as optionalString } from '../../../kernel/json-record.ts';
import {
  assertRawArtifactPhysicalLineage,
  captureRawArtifactPhysicalLineage,
} from './raw-artifact-identity-verification.ts';
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
  const capture = captureRawArtifactPhysicalLineage(attemptId);
  assertRawArtifactPhysicalLineage(capture);
  fs.writeFileSync(capture.outputPath, `${content}\n`, 'utf8');
  assertRawArtifactPhysicalLineage(capture);
  const bytes = fs.readFileSync(capture.outputPath);
  assertRawArtifactPhysicalLineage(capture);
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const metadata = {
    surface_kind: 'opl_raw_stage_output_artifact',
    version: 'raw-stage-output-artifact.v1',
    domain_id: domainId,
    stage_id: stageId,
    stage_attempt_id: attemptId,
    output_ref: capture.outputRef,
    sha256,
    size_bytes: bytes.length,
    observed_at: input.observedAt ?? new Date().toISOString(),
    physical_lineage: capture.physicalLineage,
    artifact_is_domain_truth: false,
    artifact_is_owner_receipt: false,
    artifact_is_quality_verdict: false,
    artifact_is_consumable_progress_input: true,
    authority_boundary: {
      opl: 'raw_executor_output_persistence_and_refs_only_envelope',
      domain: 'semantic_interpretation_quality_and_route_back_owner',
    },
  };
  assertRawArtifactPhysicalLineage(capture);
  fs.writeFileSync(capture.metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
  assertRawArtifactPhysicalLineage(capture);
  return {
    ...metadata,
    metadata_ref: pathToFileURL(capture.metadataPath).href,
  };
}

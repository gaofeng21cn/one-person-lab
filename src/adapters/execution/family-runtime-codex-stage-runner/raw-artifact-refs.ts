import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { stringValue as optionalString } from '../../../kernel/json-record.ts';
import { ensureOplStateDir } from '../../../kernel/runtime-state-paths.ts';
import {
  RAW_EXECUTOR_OUTPUT_FILENAME,
  RAW_EXECUTOR_OUTPUT_METADATA_FILENAME,
  rawExecutorOutputLocation,
  rawProvenanceError,
  recoverFrameworkRawArtifactForAttempt,
  sameRawArtifactsRoot,
  safeAttemptDirectory,
} from './raw-artifact-lineage.ts';
import { isRecord, type JsonRecord } from './shared.ts';

export function verifyFrameworkRawArtifactInput(input: {
  attemptId: string;
  stageId: string;
  domainId: string;
  artifactRef: string;
  artifactSha256: string;
}) {
  const location = rawExecutorOutputLocation(input.attemptId);
  if (input.artifactRef !== pathToFileURL(location.outputPath).href) return null;
  const artifact = recoverFrameworkRawArtifactForAttempt({
    stage_attempt_id: input.attemptId,
    stage_id: input.stageId,
    domain_id: input.domainId,
  });
  if (!artifact || artifact.sha256 !== input.artifactSha256) {
    return rawProvenanceError({
      artifactRef: input.artifactRef,
      message: 'Raw progress input no longer matches its producing Attempt bytes.',
    });
  }
  return artifact;
}

/**
 * The framework persists each Attempt's raw executor output under the OPL
 * runtime-state root, which is deliberately outside the StageRun's canonical
 * work-item root. Such a file is never a work-item artifact: the framework is
 * its producer, and its identity is established by the framework raw artifact
 * lineage (physical root identity, exact provenance key set, declared
 * attempt/stage/domain identity) rather than by the work-item file boundary.
 *
 * Returns the observed bytes identity when artifactRef is the framework raw
 * executor output of a bound Attempt, and null when the ref is not shaped
 * like a framework raw artifact ref at all (the caller then keeps the
 * work-item boundary in force unchanged). A ref that is shaped like a
 * framework raw artifact but fails framework lineage verification throws
 * fail-closed.
 */
export function verifyFrameworkRawStageArtifactRef(input: {
  artifactRef: string;
  filePath: string;
}): { sha256: string; byteSize: number } | null {
  const stateRoot = ensureOplStateDir().state_dir;
  const artifactsRoot = path.join(stateRoot, 'runtime-state', 'stage-attempt-artifacts');
  const attemptRoot = path.dirname(input.filePath);
  if (
    path.basename(input.filePath) !== RAW_EXECUTOR_OUTPUT_FILENAME
    || pathToFileURL(input.filePath).href !== input.artifactRef
    || !sameRawArtifactsRoot(path.dirname(attemptRoot), artifactsRoot)
  ) {
    return null;
  }
  const declared = declaredRawArtifactIdentity({
    attemptRoot,
    artifactRef: input.artifactRef,
  });
  const recovered = recoverFrameworkRawArtifactForAttempt({
    stage_attempt_id: declared.attemptId,
    stage_id: declared.stageId,
    domain_id: declared.domainId,
  });
  if (!recovered || recovered.output_ref !== input.artifactRef) {
    return rawProvenanceError({
      artifactRef: input.artifactRef,
      message: 'Framework raw executor output does not resolve to its own bound Attempt bytes.',
    });
  }
  // Raw artifact metadata stores the bare digest; StageRun content bindings use
  // the canonical sha256:<hex> form, exactly like the work-item boundary read.
  return { sha256: 'sha256:' + recovered.sha256, byteSize: recovered.size_bytes };
}

function declaredRawArtifactIdentity(input: {
  attemptRoot: string;
  artifactRef: string;
}) {
  let provenance: JsonRecord;
  try {
    const parsed: unknown = JSON.parse(
      fs.readFileSync(path.join(input.attemptRoot, RAW_EXECUTOR_OUTPUT_METADATA_FILENAME), 'utf8'),
    );
    if (!isRecord(parsed)) throw new Error('metadata is not an object');
    provenance = parsed;
  } catch (error) {
    return rawProvenanceError({
      artifactRef: input.artifactRef,
      message: 'Framework raw executor output metadata could not be read as framework provenance.',
      details: { metadata_error: error instanceof Error ? error.message : String(error) },
    });
  }
  const attemptId = optionalString(provenance.stage_attempt_id);
  const stageId = optionalString(provenance.stage_id);
  const domainId = optionalString(provenance.domain_id);
  const attemptRootName = path.basename(input.attemptRoot);
  if (
    !attemptId
    || !stageId
    || !domainId
    // The Attempt directory name carries the Attempt id digest, so a raw
    // artifact can only be claimed by the Attempt it was persisted for.
    || safeAttemptDirectory(attemptId) !== attemptRootName
  ) {
    return rawProvenanceError({
      artifactRef: input.artifactRef,
      message: 'Framework raw executor output metadata does not identify its own Attempt directory.',
      details: {
        attempt_directory: attemptRootName,
        declared_stage_attempt_id: attemptId ?? null,
      },
    });
  }
  return { attemptId, stageId, domainId };
}

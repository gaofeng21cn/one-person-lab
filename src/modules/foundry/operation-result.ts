import { canonicalJsonText } from '../../kernel/canonical-json.ts';
import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { foundryContentDigest } from './protocol.ts';

export type FoundryEvaluationOperationPhase = 'evaluate' | 'canary';

export type FoundryEvaluationOperationIdentity = {
  run_id: string;
  generation: number;
  phase: FoundryEvaluationOperationPhase;
  input_digest: string;
  operation_key: string;
};

export type FoundryOperationResult = FoundryEvaluationOperationIdentity & {
  surface_kind: 'opl_foundry_operation_result';
  version: 'opl-foundry-operation-result.v1';
  result_digest: string;
  evidence_digest: string;
  evidence_ref: string;
  completed_at: string;
};

export interface FoundryOperationResultJournal {
  read(identity: FoundryEvaluationOperationIdentity): Promise<FoundryOperationResult | null>;
  commit(input: {
    identity: FoundryEvaluationOperationIdentity;
    evidence_digest: string;
    evidence_ref: string;
    completed_at: string;
  }): Promise<FoundryOperationResult>;
}

function fail(message: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, details);
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== 'string' || value.length === 0) fail(`${field} must be a non-empty string.`);
  return value;
}

function requiredDigest(value: unknown, field: string) {
  const digest = requiredString(value, field);
  if (!/^sha256:[a-f0-9]{64}$/.test(digest)) fail(`${field} must be a SHA-256 digest.`);
  return digest;
}

export function foundryEvaluationOperationIdentity(input: {
  run_id: string;
  generation: number;
  phase: FoundryEvaluationOperationPhase;
  input_digest: string;
}): FoundryEvaluationOperationIdentity {
  const runId = requiredString(input.run_id, 'operation.run_id');
  if (!Number.isSafeInteger(input.generation) || input.generation < 0) {
    fail('operation.generation must be a non-negative safe integer.');
  }
  if (input.phase !== 'evaluate' && input.phase !== 'canary') fail('operation.phase is invalid.');
  const inputDigest = requiredDigest(input.input_digest, 'operation.input_digest');
  return {
    run_id: runId,
    generation: input.generation,
    phase: input.phase,
    input_digest: inputDigest,
    operation_key: [
      'opl-foundry-evaluation.v1',
      encodeURIComponent(runId),
      String(input.generation),
      input.phase,
      inputDigest,
    ].join('/'),
  };
}

export function validateFoundryEvaluationOperationIdentity(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('Foundry evaluation operation identity must be an object.');
  }
  const input = value as Record<string, unknown>;
  const actual = Object.keys(input).sort();
  const expected = ['run_id', 'generation', 'phase', 'input_digest', 'operation_key'].sort();
  if (canonicalJsonText(actual) !== canonicalJsonText(expected)) {
    fail('Foundry evaluation operation identity fields are invalid.');
  }
  const canonical = foundryEvaluationOperationIdentity({
    run_id: input.run_id as string,
    generation: input.generation as number,
    phase: input.phase as FoundryEvaluationOperationPhase,
    input_digest: input.input_digest as string,
  });
  if (input.operation_key !== canonical.operation_key) {
    fail('Foundry evaluation operation key is not canonical.', {
      operation_key: input.operation_key,
      expected_operation_key: canonical.operation_key,
    });
  }
  return canonical;
}

export function materializeFoundryOperationResult(input: {
  identity: FoundryEvaluationOperationIdentity;
  evidence_digest: string;
  evidence_ref: string;
  completed_at: string;
}): FoundryOperationResult {
  const identity = validateFoundryEvaluationOperationIdentity(input.identity);
  const base = {
    surface_kind: 'opl_foundry_operation_result' as const,
    version: 'opl-foundry-operation-result.v1' as const,
    ...identity,
    evidence_digest: requiredDigest(input.evidence_digest, 'operation_result.evidence_digest'),
    evidence_ref: requiredString(input.evidence_ref, 'operation_result.evidence_ref'),
    completed_at: requiredString(input.completed_at, 'operation_result.completed_at'),
  };
  return { ...base, result_digest: foundryContentDigest(base) };
}

export function validateFoundryOperationResult(
  value: unknown,
  expectedIdentity?: FoundryEvaluationOperationIdentity,
) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('Foundry operation result must be an object.');
  }
  const input = value as Record<string, unknown>;
  const actual = Object.keys(input).sort();
  const expected = [
    'surface_kind', 'version', 'result_digest', 'run_id', 'generation', 'phase',
    'input_digest', 'operation_key', 'evidence_digest', 'evidence_ref', 'completed_at',
  ].sort();
  if (canonicalJsonText(actual) !== canonicalJsonText(expected)) {
    fail('Foundry operation result fields are invalid.');
  }
  if (
    input.surface_kind !== 'opl_foundry_operation_result'
    || input.version !== 'opl-foundry-operation-result.v1'
  ) {
    fail('Foundry operation result surface is invalid.');
  }
  const result = materializeFoundryOperationResult({
    identity: {
      run_id: input.run_id as string,
      generation: input.generation as number,
      phase: input.phase as FoundryEvaluationOperationPhase,
      input_digest: input.input_digest as string,
      operation_key: input.operation_key as string,
    },
    evidence_digest: input.evidence_digest as string,
    evidence_ref: input.evidence_ref as string,
    completed_at: input.completed_at as string,
  });
  if (input.result_digest !== result.result_digest) {
    fail('Foundry operation result digest does not match its canonical content.');
  }
  if (expectedIdentity) {
    const expectedOperation = validateFoundryEvaluationOperationIdentity(expectedIdentity);
    if (canonicalJsonText(expectedOperation) !== canonicalJsonText({
      run_id: result.run_id,
      generation: result.generation,
      phase: result.phase,
      input_digest: result.input_digest,
      operation_key: result.operation_key,
    })) {
      fail('Foundry operation result does not match the requested operation identity.');
    }
  }
  return result;
}

import { Ajv2020 } from 'ajv/dist/2020.js';
import type { AnySchema, ErrorObject, ValidateFunction } from 'ajv';

import {
  FrameworkContractError,
  isRecord,
} from './contract-validation.ts';

export type JsonSchemaRegistryEntry = {
  schemaId: string;
  schema: AnySchema;
  sourceRef?: string;
};

export type JsonSchemaValidationIssue = {
  instance_path: string;
  schema_path: string;
  keyword: string;
  message: string;
  params: Record<string, unknown>;
};

export type JsonSchemaValidationResult =
  | {
      ok: true;
      schema_id: string;
      source_ref?: string;
    }
  | {
      ok: false;
      schema_id: string;
      source_ref?: string;
      errors: JsonSchemaValidationIssue[];
    };

const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
});

const compiledValidators = new Map<string, ValidateFunction>();

function schemaIdentity(schema: AnySchema, fallback: string) {
  if (!isRecord(schema)) {
    return fallback;
  }

  const schemaId = schema.schema_id;
  if (typeof schemaId === 'string' && schemaId.length > 0) {
    return schemaId;
  }

  const jsonSchemaId = schema.$id;
  if (typeof jsonSchemaId === 'string' && jsonSchemaId.length > 0) {
    return jsonSchemaId;
  }

  return fallback;
}

function normalizeAjvErrors(errors: ErrorObject[] | null | undefined): JsonSchemaValidationIssue[] {
  return (errors ?? []).map((error) => ({
    instance_path: error.instancePath,
    schema_path: error.schemaPath,
    keyword: error.keyword,
    message: error.message ?? 'JSON Schema validation failed.',
    params: error.params as Record<string, unknown>,
  }));
}

function getCompiledValidator(entry: JsonSchemaRegistryEntry) {
  const schemaId = schemaIdentity(entry.schema, entry.schemaId);
  const cached = compiledValidators.get(schemaId);
  if (cached) {
    return cached;
  }

  try {
    const compiled = ajv.compile(entry.schema);
    compiledValidators.set(schemaId, compiled);
    return compiled;
  } catch (error) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'JSON Schema contract could not be compiled by Ajv.',
      {
        schema_id: entry.schemaId,
        source_ref: entry.sourceRef,
        cause: error instanceof Error ? error.message : 'Ajv schema compilation failed.',
      },
    );
  }
}

export function validateJsonSchemaPayload(
  entry: JsonSchemaRegistryEntry,
  payload: unknown,
): JsonSchemaValidationResult {
  const validate = getCompiledValidator(entry);
  if (validate(payload)) {
    return {
      ok: true,
      schema_id: entry.schemaId,
      ...(entry.sourceRef ? { source_ref: entry.sourceRef } : {}),
    };
  }

  return {
    ok: false,
    schema_id: entry.schemaId,
    ...(entry.sourceRef ? { source_ref: entry.sourceRef } : {}),
    errors: normalizeAjvErrors(validate.errors),
  };
}

export function assertJsonSchemaPayload(
  entry: JsonSchemaRegistryEntry,
  payload: unknown,
): void {
  const result = validateJsonSchemaPayload(entry, payload);
  if (result.ok) {
    return;
  }

  throw new FrameworkContractError(
    'contract_shape_invalid',
    'Payload failed JSON Schema validation.',
    {
      schema_id: result.schema_id,
      source_ref: result.source_ref,
      errors: result.errors,
    },
  );
}

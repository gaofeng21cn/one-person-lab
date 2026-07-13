import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { Ajv2020 } from 'ajv/dist/2020.js';
import type { AnySchema, ErrorObject } from 'ajv';

import { FrameworkContractError, isRecord } from './contract-validation.ts';
import { parseJsonText } from './json-file.ts';
import { resolveContainedRepoJsonFile } from './repo-contained-json-file.ts';

function splitSchemaRef(schemaRef: string) {
  const hashIndex = schemaRef.indexOf('#');
  return hashIndex < 0
    ? { fileRef: schemaRef, fragment: '' }
    : { fileRef: schemaRef.slice(0, hashIndex), fragment: schemaRef.slice(hashIndex) };
}

function schemaFiles(root: string) {
  const files: string[] = [];
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const candidate = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        visit(candidate);
      } else if (entry.isFile() && entry.name.endsWith('.schema.json')) {
        files.push(candidate);
      }
    }
  };
  if (fs.existsSync(root) && fs.statSync(root).isDirectory()) visit(root);
  return files.sort();
}

function schemaDocument(filePath: string) {
  const parsed = parseJsonText(fs.readFileSync(filePath, 'utf8'));
  if (!isRecord(parsed)) {
    throw new FrameworkContractError('contract_shape_invalid', 'JSON Schema document must contain an object.', {
      schema_path: filePath,
    });
  }
  return parsed as AnySchema;
}

function normalizedErrors(errors: ErrorObject[] | null | undefined) {
  return (errors ?? []).map((error) => ({
    instance_path: error.instancePath,
    schema_path: error.schemaPath,
    keyword: error.keyword,
    message: error.message ?? 'JSON Schema validation failed.',
    params: error.params,
  }));
}

export function assertRepoJsonSchemaPayload(input: {
  repoRoot: string;
  schemaRef: string;
  payload: unknown;
  label: string;
}) {
  const { fileRef, fragment } = splitSchemaRef(input.schemaRef.trim());
  let resolved: ReturnType<typeof resolveContainedRepoJsonFile>;
  try {
    resolved = resolveContainedRepoJsonFile(input.repoRoot, fileRef, input.label, 'managed package checkout');
  } catch (error) {
    throw new FrameworkContractError('contract_shape_invalid', `${input.label} must resolve inside the managed package checkout.`, {
      schema_ref: input.schemaRef,
      cause: error instanceof Error ? error.message : String(error),
    });
  }

  const targetSchema = schemaDocument(resolved.real_path);
  const targetSchemaId = typeof (targetSchema as Record<string, unknown>).$id === 'string'
    ? String((targetSchema as Record<string, unknown>).$id)
    : pathToFileURL(resolved.real_path).href;
  const compiler = new Ajv2020({ allErrors: true, strict: false });
  const ids = new Map<string, string>();
  const contractsRoot = path.join(fs.realpathSync.native(input.repoRoot), 'contracts');
  const candidates = [...new Set([
    resolved.real_path,
    ...schemaFiles(contractsRoot),
  ])];

  try {
    for (const candidate of candidates) {
      const schema = candidate === resolved.real_path ? targetSchema : schemaDocument(candidate);
      const declaredId = isRecord(schema) && typeof schema.$id === 'string' && schema.$id.trim()
        ? schema.$id.trim()
        : pathToFileURL(candidate).href;
      const previous = ids.get(declaredId);
      if (previous && previous !== candidate) {
        throw new Error(`duplicate JSON Schema id ${declaredId}: ${previous}, ${candidate}`);
      }
      ids.set(declaredId, candidate);
      if (!compiler.getSchema(declaredId)) compiler.addSchema(schema, declaredId);
    }
    const validate = compiler.compile({ $ref: `${targetSchemaId}${fragment}` });
    if (!validate(input.payload)) {
      throw new FrameworkContractError('contract_shape_invalid', `${input.label} failed JSON Schema validation.`, {
        schema_ref: input.schemaRef,
        schema_path: resolved.repo_relative_ref,
        errors: normalizedErrors(validate.errors),
      });
    }
  } catch (error) {
    if (error instanceof FrameworkContractError) throw error;
    throw new FrameworkContractError('contract_shape_invalid', `${input.label} JSON Schema could not be compiled.`, {
      schema_ref: input.schemaRef,
      schema_path: resolved.repo_relative_ref,
      cause: error instanceof Error ? error.message : String(error),
    });
  }

  return {
    schema_ref: input.schemaRef,
    schema_path: resolved.repo_relative_ref,
    schema_id: targetSchemaId,
    status: 'valid' as const,
  };
}

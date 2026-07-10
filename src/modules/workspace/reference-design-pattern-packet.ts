import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseJsonText } from '../../kernel/json-file.ts';
import {
  assertJsonSchemaPayload,
  validateJsonSchemaPayload,
  type JsonSchemaRegistryEntry,
} from '../../kernel/schema-registry.ts';

export const REFERENCE_DESIGN_PATTERN_PACKET_SCHEMA_ID =
  'opl.reference_design_pattern_packet.v1';
export const REFERENCE_DESIGN_PATTERN_PACKET_SCHEMA_REF =
  'contracts/opl-framework/reference-design-pattern-packet.schema.json';

let cachedSchemaEntry: JsonSchemaRegistryEntry | null = null;

export function referenceDesignPatternPacketSchemaEntry(): JsonSchemaRegistryEntry {
  if (cachedSchemaEntry) {
    return cachedSchemaEntry;
  }
  const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const schemaPath = path.join(packageRoot, REFERENCE_DESIGN_PATTERN_PACKET_SCHEMA_REF);
  const entry: JsonSchemaRegistryEntry = {
    schemaId: REFERENCE_DESIGN_PATTERN_PACKET_SCHEMA_ID,
    schema: parseJsonText(fs.readFileSync(schemaPath, 'utf8')) as JsonSchemaRegistryEntry['schema'],
    sourceRef: REFERENCE_DESIGN_PATTERN_PACKET_SCHEMA_REF,
  };
  cachedSchemaEntry = entry;
  return entry;
}

export function validateReferenceDesignPatternPacket(payload: unknown) {
  return validateJsonSchemaPayload(referenceDesignPatternPacketSchemaEntry(), payload);
}

export function assertReferenceDesignPatternPacket(payload: unknown): void {
  assertJsonSchemaPayload(referenceDesignPatternPacketSchemaEntry(), payload);
}

import fs from 'node:fs';
import path from 'node:path';

import { buildUsageError } from './runtime-helpers.ts';
import type { CommandSpec } from './types.ts';

export function readPayloadFileText(
  filePath: string,
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  try {
    return fs.readFileSync(path.resolve(filePath), 'utf8');
  } catch (error) {
    throw buildUsageError('Payload file could not be read.', spec, {
      payload_file: filePath,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function assertSinglePayloadSource(
  payloadPresent: boolean,
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  if (payloadPresent) {
    throw buildUsageError('Use either --payload or --payload-file, not both.', spec, {
      options: ['--payload', '--payload-file'],
    });
  }
}

export function selectSinglePayloadSource(
  values: Record<string, string | boolean | (string | boolean)[] | undefined>,
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  const payloads = values.payload as string[] | undefined;
  const payloadFiles = values['payload-file'] as string[] | undefined;
  assertSinglePayloadSource((payloads?.length ?? 0) + (payloadFiles?.length ?? 0) > 1, spec);
  return { payload: payloads?.[0], payloadFile: payloadFiles?.[0] };
}

export function readSinglePayloadText(
  values: Record<string, string | boolean | (string | boolean)[] | undefined>,
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  const { payload, payloadFile } = selectSinglePayloadSource(values, spec);
  return payload ?? (payloadFile ? readPayloadFileText(payloadFile, spec) : null);
}

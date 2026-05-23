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

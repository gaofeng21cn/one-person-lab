import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { OplPackageManifestV2Schema } from './schema.ts';

export const OPL_PACKAGE_V2_SCHEMA_ID =
  'https://one-person-lab.local/contracts/opl-package.v2.schema.json';

export function generatePackageManifestV2JsonSchema(): Record<string, unknown> {
  const generated = z.toJSONSchema(OplPackageManifestV2Schema, {
    target: 'draft-2020-12',
    io: 'input',
    unrepresentable: 'throw',
  }) as Record<string, unknown>;

  return {
    $schema: generated.$schema ?? 'https://json-schema.org/draft/2020-12/schema',
    $id: OPL_PACKAGE_V2_SCHEMA_ID,
    title: 'OPL Package Manifest v2',
    ...generated,
  };
}

export function renderPackageManifestV2JsonSchemaText(): string {
  return `${JSON.stringify(generatePackageManifestV2JsonSchema(), null, 2)}\n`;
}

export function syncPackageManifestV2SchemaFile(
  targetPath: string,
  options: { check?: boolean } = {},
): { upToDate: boolean; written: boolean; targetPath: string } {
  const expected = renderPackageManifestV2JsonSchemaText();
  const resolved = path.resolve(targetPath);
  const existing = fs.existsSync(resolved) ? fs.readFileSync(resolved, 'utf8') : null;
  const upToDate = existing === expected;
  if (options.check) {
    return { upToDate, written: false, targetPath: resolved };
  }
  if (!upToDate) {
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, expected, 'utf8');
    return { upToDate: true, written: true, targetPath: resolved };
  }
  return { upToDate: true, written: false, targetPath: resolved };
}

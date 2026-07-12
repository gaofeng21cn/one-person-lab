#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadFrameworkContracts } from '../src/modules/charter/contracts.ts';
import { buildInternalCommandSpecs } from '../src/entrypoints/cli/cases/private-command-specs.ts';
import { buildPublicCommandSpecs } from '../src/entrypoints/cli/cases/public-command-specs.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targetPath = path.join(repoRoot, 'src/entrypoints/cli/command-surface-manifest.ts');
const contracts = loadFrameworkContracts();
const parsedInput = {
  helpRequested: false,
  jsonOutput: true,
  textOutput: false,
  command: null,
  args: [],
  loadOptions: undefined,
};
const internalSpecs = buildInternalCommandSpecs(parsedInput, () => contracts);
const specs = buildPublicCommandSpecs(internalSpecs, () => contracts);
const metadata = Object.fromEntries(Object.entries(specs).map(([command, spec]) => [command, {
  command_id: command,
  usage: spec.usage,
  summary: spec.summary,
  examples: spec.examples,
  ...(spec.group ? { group: spec.group } : {}),
  ...(spec.help_surface ? { help_surface: spec.help_surface } : {}),
  ...(spec.subcommands ? { subcommands: spec.subcommands } : {}),
  ...(spec.registry ? { registry: spec.registry } : {}),
}]));

const output = `// Generated from the executable CLI command builders. Do not edit by hand.
// Regenerate with: node --experimental-strip-types ./scripts/generate-cli-command-surface.mjs

export type CliCommandSurfaceMetadata = {
  command_id: string;
  usage: string;
  summary: string;
  examples: string[];
  group?: string;
  help_surface?: 'default' | 'diagnostic_drilldown' | 'migration_compatibility';
  subcommands?: Array<{ command: string; usage: string; summary: string }>;
  registry?: Record<string, unknown>;
};

export const CLI_COMMAND_SURFACE_VERSION = 'opl-cli-command-surface.v1' as const;
export const CLI_COMMAND_SURFACE = JSON.parse(${JSON.stringify(JSON.stringify(metadata))}) as Record<string, CliCommandSurfaceMetadata>;
export const CLI_COMMAND_SURFACE_COMMAND_COUNT = ${Object.keys(metadata).length} as const;
`;

fs.writeFileSync(targetPath, output);
process.stdout.write(`Wrote ${Object.keys(metadata).length} command metadata entries to ${path.relative(repoRoot, targetPath)}.\n`);

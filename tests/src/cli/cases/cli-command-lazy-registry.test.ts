import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CLI_COMMAND_SURFACE,
  CLI_COMMAND_SURFACE_COMMAND_COUNT,
  CLI_COMMAND_SURFACE_VERSION,
} from '../../../../src/entrypoints/cli/command-surface-manifest.ts';
import { buildLazyCommandSpecs } from '../../../../src/entrypoints/cli/modules/lazy-command-registry.ts';
import type { ParsedCliInput } from '../../../../src/entrypoints/cli/modules/support.ts';
import { loadFrameworkContracts } from '../../../../src/modules/charter/contracts.ts';
import { buildInternalCommandSpecs } from '../../../../src/entrypoints/cli/cases/private-command-specs.ts';
import { buildPublicCommandSpecs } from '../../../../src/entrypoints/cli/cases/public-command-specs.ts';

const parsedInput: ParsedCliInput = {
  helpRequested: false,
  jsonOutput: true,
  textOutput: false,
  command: null,
  args: [],
};

function metadataFromSpec(command: string, spec: { usage: string; summary: string; examples: string[]; group?: string; help_surface?: string; subcommands?: unknown; registry?: unknown }) {
  return {
    command_id: command,
    usage: spec.usage,
    summary: spec.summary,
    examples: spec.examples,
    ...(spec.group ? { group: spec.group } : {}),
    ...(spec.help_surface ? { help_surface: spec.help_surface } : {}),
    ...(spec.subcommands ? { subcommands: spec.subcommands } : {}),
    ...(spec.registry ? { registry: spec.registry } : {}),
  };
}

test('CLI command surface is generated and covers every executable command', () => {
  const contracts = loadFrameworkContracts();
  const internalSpecs = buildInternalCommandSpecs(parsedInput, () => contracts);
  const executableSpecs = buildPublicCommandSpecs(internalSpecs, () => contracts);

  assert.equal(CLI_COMMAND_SURFACE_VERSION, 'opl-cli-command-surface.v1');
  assert.equal(CLI_COMMAND_SURFACE_COMMAND_COUNT, Object.keys(CLI_COMMAND_SURFACE).length);
  assert.equal(CLI_COMMAND_SURFACE_COMMAND_COUNT, Object.keys(executableSpecs).length);

  for (const [command, spec] of Object.entries(executableSpecs)) {
    assert.deepEqual(
      CLI_COMMAND_SURFACE[command as keyof typeof CLI_COMMAND_SURFACE],
      metadataFromSpec(command, spec),
      `generated metadata drifted for ${command}`,
    );
  }
});

test('lazy command registry does not load contracts for metadata-only help', async () => {
  let loadCount = 0;
  const commandSpecs = buildLazyCommandSpecs(parsedInput, async () => {
    loadCount += 1;
    throw new Error('contract load must not run for help');
  });

  assert.equal(Object.keys(commandSpecs).length, CLI_COMMAND_SURFACE_COMMAND_COUNT);
  const help = await commandSpecs.help.handler([]) as { help: { command: string | null } };
  assert.equal(help.help.command, null);
  assert.equal(loadCount, 0);
});

test('lazy command registry loads executable builders only after command selection', async () => {
  let loadCount = 0;
  const commandSpecs = buildLazyCommandSpecs(parsedInput, async () => {
    loadCount += 1;
    throw new Error('sentinel contract load');
  });

  await assert.rejects(async () => commandSpecs['contract validate'].handler([]), /sentinel contract load/);
  assert.equal(loadCount, 1);
});

import { runCli } from '../helpers.ts';

export function bindRealManifest(input: {
  project: string;
  workspacePath: string;
  manifestCommand: string;
  stateRoot: string;
  contractsRoot: string;
}) {
  runCli([
    'workspace',
    'bind',
    '--project',
    input.project,
    '--path',
    input.workspacePath,
    '--manifest-command',
    input.manifestCommand,
  ], {
    OPL_CONTRACTS_DIR: input.contractsRoot,
    OPL_STATE_DIR: input.stateRoot,
  });
}

export function shellArg(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

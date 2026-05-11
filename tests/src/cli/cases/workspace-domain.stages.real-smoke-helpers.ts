import { spawnSync } from 'node:child_process';

import { assert, fs, path, runCli } from '../helpers.ts';

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

export function fakeHermesBin(root: string) {
  const binPath = path.join(root, 'hermes');
  fs.writeFileSync(
    binPath,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'if [ "$1" = "version" ]; then echo "Hermes Agent v9.9.9-stage-smoke"; exit 0; fi',
      'if [ "$1" = "gateway" ] && [ "$2" = "status" ]; then echo "Gateway service is loaded"; exit 0; fi',
      'echo "unexpected fake hermes args: $*" >&2',
      'exit 1',
      '',
    ].join('\n'),
  );
  fs.chmodSync(binPath, 0o755);
  const probe = spawnSync(binPath, ['version'], { encoding: 'utf8' });
  assert.equal(probe.status, 0, probe.stderr);
  return binPath;
}

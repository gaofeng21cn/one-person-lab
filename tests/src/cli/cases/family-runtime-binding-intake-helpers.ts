import { fs, shellSingleQuote } from '../helpers.ts';

export function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  return {
    OPL_STATE_DIR: stateRoot,
    ...extra,
  };
}

export function jsString(value: string) {
  return JSON.stringify(value);
}

export function writeJsonEmitterScript(scriptPath: string, payload: unknown, options: {
  cwdPath?: string;
  argvPath?: string;
} = {}) {
  fs.writeFileSync(
    scriptPath,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      options.cwdPath ? `printf '%s\\n' "$PWD" > ${shellSingleQuote(options.cwdPath)}` : '',
      options.argvPath ? `: > ${shellSingleQuote(options.argvPath)}` : '',
      options.argvPath ? `for arg in "$@"; do printf '%s\\n' "$arg" >> ${shellSingleQuote(options.argvPath)}; done` : '',
      `exec ${shellSingleQuote(process.execPath)} -e ${shellSingleQuote(`process.stdout.write(${jsString(`${JSON.stringify(payload, null, 2)}\n`)});`)}`,
      '',
    ].filter(Boolean).join('\n'),
    { mode: 0o755 },
  );
}

export function writeNodeScript(scriptPath: string, source: string) {
  fs.writeFileSync(
    scriptPath,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      `exec ${shellSingleQuote(process.execPath)} -e ${shellSingleQuote(source)} "$@"`,
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
}

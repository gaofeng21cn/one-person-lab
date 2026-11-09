/** A shell/JavaScript launcher preserves stdin and the exact Node even when its path contains spaces. */
export const nodeFixtureShebang = `#!/bin/sh
':' //; exec '${process.execPath.replaceAll("'", "'\\''")}' "$0" "$@"`;

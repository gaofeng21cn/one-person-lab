import fs from 'node:fs';
import path from 'node:path';

function writeExecutable(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  fs.chmodSync(filePath, 0o755);
}

export function writeRuntimeWrappers(runtimeRoot) {
  writeExecutable(path.join(runtimeRoot, 'bin', 'opl'), `#!/usr/bin/env bash
set -euo pipefail
RUNTIME_HOME="$(cd "$(dirname "\${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_BIN="$(find "$RUNTIME_HOME/python" -maxdepth 2 -path '*/bin' -type d 2>/dev/null | sort -r | head -n 1 || true)"
export OPL_FULL_RUNTIME_HOME="$RUNTIME_HOME"
export OPL_PACKAGED_SKILLS_ROOT="$RUNTIME_HOME/skills"
export OPL_CODEX_BIN="$RUNTIME_HOME/bin/codex"
export OPL_MODULE_PATH_MEDAUTOSCIENCE="$RUNTIME_HOME/modules/mas"
export OPL_MODULE_PATH_MEDAUTOGRANT="$RUNTIME_HOME/modules/mag"
export OPL_MODULE_PATH_REDCUBE="$RUNTIME_HOME/modules/rca"
if [[ -n "$PYTHON_BIN" ]]; then
  export PATH="$RUNTIME_HOME/bin:$RUNTIME_HOME/node/bin:$RUNTIME_HOME/uv/bin:$PYTHON_BIN:$PATH"
else
  export PATH="$RUNTIME_HOME/bin:$RUNTIME_HOME/node/bin:$RUNTIME_HOME/uv/bin:$PATH"
fi
exec "$RUNTIME_HOME/opl/bin/opl" "$@"
`);
}

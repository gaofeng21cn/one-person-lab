import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { SourceClosureGraphScan } from './types.ts';

function failedScan(diagnostic: string): SourceClosureGraphScan {
  return {
    scan_complete: false,
    symbols: [],
    call_edges: [],
    unresolved_edges: [],
    observed_calls: [],
    diagnostics: [diagnostic],
    pyproject_scripts: {},
  };
}

export function buildPythonSourceGraph(repoDir: string, relativeFiles: string[]): SourceClosureGraphScan {
  const helperPath = fileURLToPath(new URL(
    '../../../../python/opl_framework/source_closure_ast.py',
    import.meta.url,
  ));
  if (!fs.existsSync(helperPath)) {
    return failedScan(`python_ast_helper_missing:${helperPath}`);
  }
  const python = process.env.OPL_PYTHON_BIN ?? process.env.PYTHON ?? 'python3';
  const result = spawnSync(python, ['-B', helperPath], {
    cwd: repoDir,
    encoding: 'utf8',
    env: {
      ...process.env,
      PYTHONDONTWRITEBYTECODE: '1',
    },
    input: JSON.stringify({ repo_dir: repoDir, files: relativeFiles }),
    maxBuffer: 32 * 1024 * 1024,
    timeout: 120_000,
  });
  if (result.error) {
    return failedScan(`python_ast_helper_error:${result.error.message}`);
  }
  if (result.status !== 0) {
    return failedScan(`python_ast_helper_exit:${result.status}:${result.stderr.trim()}`);
  }
  try {
    const parsed = JSON.parse(result.stdout) as SourceClosureGraphScan;
    if (
      typeof parsed.scan_complete !== 'boolean'
      || !Array.isArray(parsed.symbols)
      || !Array.isArray(parsed.call_edges)
      || !Array.isArray(parsed.unresolved_edges)
      || !Array.isArray(parsed.observed_calls)
      || !Array.isArray(parsed.diagnostics)
    ) {
      return failedScan('python_ast_helper_shape_invalid');
    }
    return parsed;
  } catch (error) {
    return failedScan(`python_ast_helper_json_invalid:${error instanceof Error ? error.message : String(error)}`);
  }
}

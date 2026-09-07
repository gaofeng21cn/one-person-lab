import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('bound work-item workspace does not replace the module catalog workspace', async () => {
  const originalEnv = { ...process.env };
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-bound-module-source-'));
  try {
    const catalogRoot = path.join(root, 'catalog');
    const studyRoot = path.join(root, 'study');
    fs.mkdirSync(catalogRoot);
    fs.mkdirSync(studyRoot);
    process.env.OPL_STATE_DIR = path.join(root, 'state');
    delete process.env.OPL_WORKSPACE_ROOT;
    delete process.env.OPL_STAGE_ATTEMPT_ID;
    delete process.env.OPL_MODULE_PATH_MEDAUTOSCIENCE;
    const { writeOplWorkspaceRoot, readOplWorkspaceRoot } = await import('../../src/kernel/system-preferences.ts');
    const { resolveOplModuleSourcePolicy } = await import('../../src/adapters/integration/system-installation/modules.ts');
    writeOplWorkspaceRoot(catalogRoot);
    const selected = () => resolveOplModuleSourcePolicy('medautoscience', { profile: 'fast' }).developer_checkout_path;
    assert.equal(selected(), path.join(catalogRoot, 'med-autoscience'));

    process.env.OPL_WORKSPACE_ROOT = studyRoot;
    assert.equal(selected(), path.join(studyRoot, 'med-autoscience'), 'unbound user override remains effective');

    process.env.OPL_STAGE_ATTEMPT_ID = 'sat_bound_source_fixture';
    assert.equal(selected(), path.join(catalogRoot, 'med-autoscience'));
    assert.equal(readOplWorkspaceRoot().selected_path, studyRoot, 'execution workspace is not changed');
    assert.equal(process.env.OPL_WORKSPACE_ROOT, studyRoot);

    const explicitModule = path.join(root, 'explicit-module');
    process.env.OPL_MODULE_PATH_MEDAUTOSCIENCE = explicitModule;
    assert.equal(selected(), explicitModule, 'explicit module override remains effective');
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
    Object.assign(process.env, originalEnv);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

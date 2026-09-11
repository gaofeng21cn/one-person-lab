import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { TestContext } from 'node:test';

export function scopedGatewayWorkspace(t: TestContext, existingWorkspace?: string, projectId = 'agent_engineering') {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-scope-')));
  const state = path.join(root, 'state');
  const workspace = existingWorkspace ? fs.realpathSync.native(existingWorkspace) : path.join(root, 'workspace');
  fs.mkdirSync(state); fs.mkdirSync(workspace, { recursive: true });
  const previous = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = state;
  fs.writeFileSync(path.join(state, 'workspace-registry.json'), JSON.stringify({
    version: 'g2', bindings: [{
      binding_id: 'binding:foundry-test', project_scope_id: 'project:foundry-test',
      project_id: projectId, project: 'OMA', workspace_path: workspace, status: 'active',
    }],
  }));
  t.after(() => {
    if (previous === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  });
  return workspace;
}

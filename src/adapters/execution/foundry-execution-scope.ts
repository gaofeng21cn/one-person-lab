import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import {
  createWorkItemExecutionScopeSnapshot,
  listWorkspaceBindings,
} from '../../authority/workspace/public/standard-agent-action-runtime.ts';
import type { FoundryProviderManifest } from '../../authority/evolution/index.ts';

// Foundry owns the work item (the run), while Workspace owns its project binding.
// Provider design/diagnose iterations and Stage retries do not create new scopes.
export function resolveFoundryExecutionScope(input: {
  provider: FoundryProviderManifest;
  workspace_root: string;
  run_id: string;
}) {
  const workspaceRoot = fs.realpathSync.native(input.workspace_root);
  const providerIds = new Set([
    input.provider.agent_id, input.provider.package_id, input.provider.domain_id,
  ]);
  const bindings = listWorkspaceBindings().filter((binding) =>
    binding.status !== 'archived'
    && providerIds.has(binding.project_id)
    && path.resolve(binding.workspace_path) === workspaceRoot);
  if (bindings.length !== 1) {
    throw new FrameworkContractError('contract_shape_invalid',
      'Foundry execution requires one existing provider workspace binding.', {
        failure_code: 'foundry_execution_scope_workspace_binding_invalid',
        workspace_root: workspaceRoot,
        binding_count: bindings.length,
      });
  }
  if (!input.run_id.trim()) {
    throw new FrameworkContractError('contract_shape_invalid', 'Foundry execution requires a run identity.');
  }
  const binding = bindings[0]!;
  const workItemId = `foundry-${crypto.createHash('sha256').update(input.run_id).digest('hex')}`;
  const runsRoot = path.join(workspaceRoot, 'provider-runs');
  fs.mkdirSync(runsRoot, { recursive: true });
  if (!fs.lstatSync(runsRoot).isDirectory() || fs.lstatSync(runsRoot).isSymbolicLink()) {
    throw new FrameworkContractError('contract_shape_invalid', 'Foundry run directory must be physical.');
  }
  const workItemRoot = path.join(runsRoot, workItemId);
  fs.mkdirSync(workItemRoot, { recursive: true });
  return createWorkItemExecutionScopeSnapshot({
    projectScopeId: binding.project_scope_id,
    workspaceBindingId: binding.binding_id,
    bindingVersionId: binding.binding_id,
    domainId: input.provider.domain_id,
    workspaceRoot,
    payload: { work_item_id: workItemId },
    requirement: { kind: 'work_item', alias_fields: ['work_item_id'] },
    canonicalWorkItemRoot: workItemRoot,
  });
}

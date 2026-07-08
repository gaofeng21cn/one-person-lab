import type { AgentWorkspaceNormContract } from '../../../../../src/kernel/types.ts';
import { fs, parseJsonText, path, repoRoot } from '../../helpers.ts';

export const MINIMAL_AGENT_WORKSPACE_NORM_CONTRACT = parseJsonText(
  fs.readFileSync(path.join(repoRoot, 'contracts/opl-framework/agent-workspace-norm-contract.json'), 'utf8'),
) as AgentWorkspaceNormContract;

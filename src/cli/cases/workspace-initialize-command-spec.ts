import { buildWorkspaceInitializeInterfaces, initializeWorkspace } from '../../workspace-initializer.ts';
import type { FrameworkContracts } from '../../types.ts';
import { assertNoArgs, parseWorkspaceInitializeArgs } from '../modules/support.ts';
import type { CommandSpec } from '../modules/support.ts';

export function buildWorkspaceInitializeCommandSpecs(
  getContracts: () => FrameworkContracts,
): Record<string, CommandSpec> {
  const specs: Record<string, CommandSpec> = {
    'workspace-init': {
      usage:
        'opl workspace init --agent <mas|mag|rca|oma> [--workspace <path>|--workspace-root <dir>] [--workspace-id <id>] [--project-id <id>] [--mode auto|one_off|series|portfolio] [--title <title>] [--dry-run] [--no-bind] [--force]',
      summary:
        'Materialize the OPL standard workspace topology for a family agent and optionally activate it in the workspace registry.',
      examples: [
        'opl workspace init --agent rca --workspace-id visual-theme-a --project-id deck-001',
        'opl workspace init --agent rca --workspace-root /Users/gaofeng/workspace --workspace-id visual-theme-a --project-id deck-001',
        'opl workspace init --agent mas --workspace-root /Users/gaofeng/workspace --workspace-id dm-cvd --project-id DM002',
        'opl workspace init --agent oma --workspace /Users/gaofeng/workspace/agent-foundry --dry-run',
      ],
      handler: (args) => {
        const parsed = parseWorkspaceInitializeArgs(args, specs['workspace-init']);
        return initializeWorkspace(getContracts(), {
          agentId: parsed.agentId,
          workspacePath: parsed.workspacePath,
          workspaceRoot: parsed.workspaceRoot,
          workspaceId: parsed.workspaceId,
          projectId: parsed.projectId,
          title: parsed.title,
          mode: parsed.mode,
          bind: parsed.bind,
          dryRun: parsed.dryRun,
          force: parsed.force,
        });
      },
    },
    'workspace interfaces': {
      usage: 'opl workspace interfaces',
      summary:
        'Show the OPL-owned CLI, MCP, Skill, App, OpenAI, and AI SDK descriptor for workspace initialization.',
      examples: ['opl workspace interfaces'],
      handler: (args) => {
        assertNoArgs(args, specs['workspace interfaces']);
        return buildWorkspaceInitializeInterfaces();
      },
    },
  };

  return specs;
}

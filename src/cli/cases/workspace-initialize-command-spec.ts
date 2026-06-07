import {
  buildWorkspaceInitializeInterfaces,
  ensureWorkspace,
  initializeWorkspace,
} from '../../workspace-initializer.ts';
import {
  adoptWorkspace,
  doctorWorkspace,
  validateWorkspace,
} from '../../workspace-diagnostics.ts';
import type { FrameworkContracts } from '../../types.ts';
import {
  assertNoArgs,
  parseWorkspaceAdoptArgs,
  parseWorkspaceInitializeArgs,
  parseWorkspaceValidationArgs,
} from '../modules/support.ts';
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
    'workspace-ensure': {
      usage:
        'opl workspace ensure --agent <mas|mag|rca|oma> [--workspace <path>|--workspace-root <dir>] [--workspace-id <id>] [--project-id <id>] [--mode auto|one_off|series|portfolio] [--title <title>] [--dry-run] [--no-bind] [--force]',
      summary:
        'Ensure an OPL family agent has an active workspace binding, initializing the standard topology only when needed.',
      examples: [
        'opl workspace ensure --agent rca --project-id deck-001',
        'opl workspace ensure --agent mas --workspace-id dm-cvd --project-id DM002',
        'opl workspace ensure --agent mag --workspace-root /Users/gaofeng/workspace --workspace-id nsfc-p2c --project-id grant-001',
      ],
      handler: (args) => {
        const parsed = parseWorkspaceInitializeArgs(args, specs['workspace-ensure']);
        return ensureWorkspace(getContracts(), {
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
    'workspace validate': {
      usage: 'opl workspace validate --workspace <path>',
      summary:
        'Fail closed unless workspace_index.json, topology semantics, user inspection roots, and authority boundaries match the OPL workspace norm.',
      examples: [
        'opl workspace validate --workspace /Users/gaofeng/workspace/visual-theme-a',
      ],
      handler: (args) => {
        const parsed = parseWorkspaceValidationArgs(args, specs['workspace validate']);
        return validateWorkspace(getContracts(), {
          workspacePath: parsed.workspacePath,
        });
      },
    },
    'workspace doctor': {
      usage: 'opl workspace doctor --workspace <path>',
      summary:
        'Read an OPL workspace index and report topology, shared resources, indexed projects, and blockers without writing files.',
      examples: [
        'opl workspace doctor --workspace /Users/gaofeng/workspace/visual-theme-a',
      ],
      handler: (args) => {
        const parsed = parseWorkspaceValidationArgs(args, specs['workspace doctor']);
        return doctorWorkspace(getContracts(), {
          workspacePath: parsed.workspacePath,
        });
      },
    },
    'workspace adopt': {
      usage:
        'opl workspace adopt --agent <mas|mag|rca|oma> --workspace <path> [--project-id <id>] [--mode auto|one_off|series|portfolio] --dry-run',
      summary:
        'Plan how an existing directory would be adopted into the OPL workspace topology; dry-run only and does not write files.',
      examples: [
        'opl workspace adopt --agent rca --workspace /Users/gaofeng/workspace/visual-theme-a --project-id deck-001 --dry-run',
        'opl workspace adopt --agent mas --workspace /Users/gaofeng/workspace/dm-cvd --study-id DM002 --dry-run',
      ],
      handler: (args) => {
        const parsed = parseWorkspaceAdoptArgs(args, specs['workspace adopt']);
        return adoptWorkspace(getContracts(), {
          agentId: parsed.agentId,
          workspacePath: parsed.workspacePath,
          workspaceRoot: parsed.workspaceRoot,
          workspaceId: parsed.workspaceId,
          projectId: parsed.projectId,
          title: parsed.title,
          mode: parsed.mode,
          dryRun: parsed.dryRun,
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
        return buildWorkspaceInitializeInterfaces(getContracts());
      },
    },
  };

  return specs;
}

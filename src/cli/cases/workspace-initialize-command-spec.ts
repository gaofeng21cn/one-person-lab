import {
  buildWorkspaceInitializeInterfaces,
  ensureWorkspace,
  initializeWorkspace,
} from '../../workspace-initializer.ts';
import {
  adoptWorkspace,
  archiveWorkspaceProject,
  doctorWorkspace,
  exportWorkspaceMap,
  upgradeWorkspace,
  validateWorkspace,
  workspaceHealth,
} from '../../workspace-diagnostics.ts';
import type { FrameworkContracts } from '../../types.ts';
import {
  assertNoArgs,
  parseWorkspaceAdoptArgs,
  parseWorkspaceInitializeArgs,
  parseWorkspaceLifecycleArgs,
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
        'opl workspace adopt --agent <mas|mag|rca|oma> --workspace <path> [--project-id <id>] [--mode auto|one_off|series|portfolio] [--dry-run|--apply]',
      summary:
        'Plan or apply OPL-owned workspace topology metadata and generated inspection refs for an existing directory without writing domain truth.',
      examples: [
        'opl workspace adopt --agent rca --workspace /Users/gaofeng/workspace/visual-theme-a --project-id deck-001 --dry-run',
        'opl workspace adopt --agent mas --workspace /Users/gaofeng/workspace/dm-cvd --study-id DM002 --apply',
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
          apply: parsed.apply,
        });
      },
    },
    'workspace upgrade': {
      usage: 'opl workspace upgrade --workspace <path> [--dry-run|--apply]',
      summary:
        'Refresh OPL-owned workspace metadata, manifests, map, and health refs in place without moving project roots.',
      examples: [
        'opl workspace upgrade --workspace /Users/gaofeng/workspace/visual-theme-a --dry-run',
        'opl workspace upgrade --workspace /Users/gaofeng/workspace/visual-theme-a --apply',
      ],
      handler: (args) => {
        const parsed = parseWorkspaceLifecycleArgs(args, specs['workspace upgrade']);
        return upgradeWorkspace(getContracts(), {
          workspacePath: parsed.workspacePath,
          dryRun: parsed.dryRun,
          apply: parsed.apply,
        });
      },
    },
    'workspace project archive': {
      usage: 'opl workspace project archive --workspace <path> --project-id <id> [--reason <text>] [--dry-run|--apply]',
      summary:
        'Mark one indexed workspace project or study archived in workspace_index.json and generated maps without deleting files or archiving registry bindings.',
      examples: [
        'opl workspace project archive --workspace /Users/gaofeng/workspace/visual-theme-a --project-id deck-001 --apply',
        'opl workspace project archive --workspace /Users/gaofeng/workspace/dm-cvd --study-id DM002 --reason superseded --dry-run',
      ],
      handler: (args) => {
        const parsed = parseWorkspaceLifecycleArgs(args, specs['workspace project archive']);
        return archiveWorkspaceProject(getContracts(), {
          workspacePath: parsed.workspacePath,
          projectId: parsed.projectId,
          reason: parsed.reason,
          dryRun: parsed.dryRun,
          apply: parsed.apply,
        });
      },
    },
    'workspace export-map': {
      usage: 'opl workspace export-map --workspace <path>',
      summary:
        'Export the machine-readable workspace map projection derived from workspace_index.json.',
      examples: [
        'opl workspace export-map --workspace /Users/gaofeng/workspace/visual-theme-a',
      ],
      handler: (args) => {
        const parsed = parseWorkspaceValidationArgs(args, specs['workspace export-map']);
        return exportWorkspaceMap(getContracts(), {
          workspacePath: parsed.workspacePath,
        });
      },
    },
    'workspace health': {
      usage: 'opl workspace health --workspace <path>',
      summary:
        'Return the structure-only workspace health projection derived from workspace doctor blockers.',
      examples: [
        'opl workspace health --workspace /Users/gaofeng/workspace/visual-theme-a',
      ],
      handler: (args) => {
        const parsed = parseWorkspaceValidationArgs(args, specs['workspace health']);
        return workspaceHealth(getContracts(), {
          workspacePath: parsed.workspacePath,
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

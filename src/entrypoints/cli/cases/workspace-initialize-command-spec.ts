import { parseArgs } from 'node:util';

import {
  buildWorkspaceInitializeInterfaces,
  ensureWorkspace,
  initializeWorkspace,
} from '../../../modules/workspace/workspace-initializer.ts';
import {
  adoptWorkspace,
  doctorWorkspace,
  validateWorkspace,
} from '../../../modules/workspace/workspace-diagnostics.ts';
import {
  archiveWorkspaceProject,
  deleteWorkspaceProject,
  exportWorkspaceMap,
  inspectWorkspace,
  upgradeWorkspace,
  updateWorkspaceProjectLifecycle,
  workspaceFleetReport,
  workspaceHealth,
  workspaceInventory,
  workspaceReport,
} from '../../../modules/workspace/workspace-lifecycle.ts';
import { materializeWorkspaceArtifactLifecycle } from '../../../modules/workspace/workspace-artifact-lifecycle.ts';
import { ingestWorkspaceSourceMaterial } from '../../../modules/workspace/workspace-source-material.ts';
import { assertRepoSourceByproductsClean } from '../../../modules/workspace/repo-source-byproduct-guard.ts';
import { buildBrandModuleSurfaceInspect } from '../../../modules/charter/brand-module-surfaces.ts';
import type { FrameworkContracts } from '../../../kernel/types.ts';
import {
  assertNoArgs,
  buildUsageError,
  parseWorkspaceAdoptArgs,
  parseWorkspaceArtifactLifecycleArgs,
  parseWorkspaceInitializeArgs,
  parseWorkspaceLifecycleArgs,
  parseWorkspaceSourceIngestArgs,
  parseWorkspaceValidationArgs,
} from '../modules/support.ts';
import type { CommandSpec } from '../modules/support.ts';

function parseRepoSourceHygieneArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  try {
    const { values } = parseArgs({
      args,
      options: { 'source-root': { type: 'string' } },
      strict: true,
      allowPositionals: false,
    });
    return values['source-root'] ?? process.cwd();
  } catch (error) {
    throw buildUsageError(
      error instanceof Error ? error.message : String(error),
      spec,
    );
  }
}

export function buildWorkspaceInitializeCommandSpecs(
  getContracts: () => FrameworkContracts,
): Record<string, CommandSpec> {
  const agentUsage = getContracts().agentWorkspaceNorm.supported_agents.join('|');
  const specs: Record<string, CommandSpec> = {
    'workspace-init': {
      usage:
        `opl workspace init --agent <${agentUsage}> [--workspace <path>|--workspace-root <dir>] [--workspace-id <id>] [--project-id <id>] [--mode auto|one_off|series|portfolio] [--title <title>] [--dry-run] [--no-bind] [--force]`,
      summary:
        'Materialize the OPL standard workspace topology for a family agent and optionally activate it in the workspace registry.',
      examples: [
        'opl workspace init --agent rca --workspace-id visual-theme-a --project-id deck-001',
        'opl workspace init --agent rca --workspace-root /Users/gaofeng/workspace --workspace-id visual-theme-a --project-id deck-001',
        'opl workspace init --agent mas --workspace-root /Users/gaofeng/workspace --workspace-id dm-cvd --project-id DM002',
        'opl workspace init --agent oma --workspace /Users/gaofeng/workspace/agent-foundry --dry-run',
        'opl workspace init --agent obf --workspace /Users/gaofeng/workspace/bookforge --dry-run',
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
        `opl workspace ensure --agent <${agentUsage}> [--workspace <path>|--workspace-root <dir>] [--workspace-id <id>] [--project-id <id>] [--mode auto|one_off|series|portfolio] [--title <title>] [--dry-run] [--no-bind] [--force]`,
      summary:
        'Ensure an OPL family agent has an active workspace binding, initializing the standard topology only when needed.',
      examples: [
        'opl workspace ensure --agent rca --project-id deck-001',
        'opl workspace ensure --agent mas --workspace-id dm-cvd --project-id DM002',
        'opl workspace ensure --agent mag --workspace-root /Users/gaofeng/workspace --workspace-id nsfc-p2c --project-id grant-001',
        'opl workspace ensure --agent bookforge --workspace-id bookforge-workspace --project-id book-001',
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
    'workspace source-hygiene': {
      usage: 'opl workspace source-hygiene [--source-root <repo>]',
      summary:
        'Fail closed when a source checkout contains cache or install byproducts; this does not assert domain or release readiness.',
      examples: [
        'opl workspace source-hygiene --source-root /Users/gaofeng/workspace/opl-bookforge',
      ],
      handler: (args) =>
        assertRepoSourceByproductsClean(
          parseRepoSourceHygieneArgs(args, specs['workspace source-hygiene']),
        ),
    },
    'workspace adopt': {
      usage:
        `opl workspace adopt --agent <${agentUsage}> --workspace <path> [--project-id <id>] [--mode auto|one_off|series|portfolio] [--dry-run|--apply]`,
      summary:
        'Plan or apply OPL-owned workspace topology metadata and generated inspection refs for an existing directory without writing domain truth.',
      examples: [
        'opl workspace adopt --agent rca --workspace /Users/gaofeng/workspace/visual-theme-a --project-id deck-001 --dry-run',
        'opl workspace adopt --agent bookforge --workspace /Users/gaofeng/workspace/Book --project-id ai-university-bookforge-20260619 --apply',
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
    'workspace project lifecycle': {
      usage:
        'opl workspace project lifecycle --workspace <path> --project-id <id> --status active|paused|locked|superseded|archived [--reason <text>] [--superseded-by-project-id <id>] [--dry-run|--apply]',
      summary:
        'Apply one indexed workspace project lifecycle transition without deleting files, moving project roots, archiving registry bindings, or writing domain truth.',
      examples: [
        'opl workspace project lifecycle --workspace /Users/gaofeng/workspace/visual-theme-a --project-id deck-001 --status paused --reason waiting-for-review --apply',
        'opl workspace project lifecycle --workspace /Users/gaofeng/workspace/visual-theme-a --project-id deck-001 --status active --apply',
        'opl workspace project lifecycle --workspace /Users/gaofeng/workspace/visual-theme-a --project-id deck-001 --status superseded --superseded-by-project-id deck-002 --dry-run',
      ],
      handler: (args) => {
        const parsed = parseWorkspaceLifecycleArgs(args, specs['workspace project lifecycle']);
        return updateWorkspaceProjectLifecycle(getContracts(), {
          workspacePath: parsed.workspacePath,
          projectId: parsed.projectId,
          status: parsed.status,
          reason: parsed.reason,
          supersededByProjectId: parsed.supersededByProjectId,
          dryRun: parsed.dryRun,
          apply: parsed.apply,
        });
      },
    },
    'workspace project delete': {
      usage: 'opl workspace project delete --workspace <path> --project-id <id> [--owner-receipt-ref <ref>] [--dry-run|--apply]',
      summary:
        'Return the safe-delete gate for an indexed workspace project; OPL never performs the physical delete or writes domain truth.',
      examples: [
        'opl workspace project delete --workspace /Users/gaofeng/workspace/visual-theme-a --project-id deck-001 --dry-run',
      ],
      handler: (args) => {
        const parsed = parseWorkspaceLifecycleArgs(args, specs['workspace project delete']);
        return deleteWorkspaceProject(getContracts(), {
          workspacePath: parsed.workspacePath,
          projectId: parsed.projectId,
          ownerReceiptRef: parsed.ownerReceiptRef,
          dryRun: parsed.dryRun,
          apply: parsed.apply,
        });
      },
    },
    'workspace artifact-lifecycle': {
      usage:
        'opl workspace artifact-lifecycle --workspace <path> [--project-id <id>] [--dry-run|--apply]',
      summary:
        'Materialize OPL-owned refs-only lifecycle projections for project inputs, sources, memory refs, outputs, current refs, and retention health without writing domain truth.',
      examples: [
        'opl workspace artifact-lifecycle --workspace /Users/gaofeng/workspace/Book --project-id ai-university-bookforge-20260619 --dry-run',
        'opl workspace artifact-lifecycle --workspace /Users/gaofeng/workspace/Book --project-id ai-university-bookforge-20260619 --apply',
      ],
      handler: (args) => {
        const parsed = parseWorkspaceArtifactLifecycleArgs(args, specs['workspace artifact-lifecycle']);
        return materializeWorkspaceArtifactLifecycle(getContracts(), {
          workspacePath: parsed.workspacePath,
          projectId: parsed.projectId,
          dryRun: parsed.dryRun,
          apply: parsed.apply,
        });
      },
    },
    'workspace source ingest': {
      usage:
        'opl workspace source ingest --workspace <path> --file <path> [--project-id <id>] [--role <role>] [--title <title>] [--note <text>] [--dry-run|--apply]',
      summary:
        'Copy a user-supplied source file into workspace-owned source material storage and emit refs-only provenance without parsing domain truth.',
      examples: [
        'opl workspace source ingest --workspace /Users/gaofeng/workspace/agent-foundry --file hema-guide.pdf --role reference_design',
      ],
      handler: (args) => {
        const parsed = parseWorkspaceSourceIngestArgs(args, specs['workspace source ingest']);
        return ingestWorkspaceSourceMaterial(getContracts(), {
          workspacePath: parsed.workspacePath,
          filePath: parsed.filePath,
          projectId: parsed.projectId,
          role: parsed.role,
          title: parsed.title,
          note: parsed.note,
          dryRun: parsed.dryRun,
          apply: parsed.apply,
        });
      },
    },
    'workspace fleet report': {
      usage: 'opl workspace fleet report',
      summary:
        'Read the registry-backed fleet report across bound OPL workspaces without executing direct-entry or manifest commands.',
      examples: ['opl workspace fleet report'],
      handler: (args) => {
        assertNoArgs(args, specs['workspace fleet report']);
        return workspaceFleetReport(getContracts());
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
    'workspace inspect': {
      usage: 'opl workspace inspect --workspace <path>',
      summary:
        'Return the user-first workspace inspection projection with current project, Stage Native roots, and current pointer refs.',
      examples: [
        'opl workspace inspect --workspace /Users/gaofeng/workspace/visual-theme-a',
      ],
      handler: (args) => {
        if (args.length === 0) {
          return buildBrandModuleSurfaceInspect(getContracts(), 'workspace');
        }
        const parsed = parseWorkspaceValidationArgs(args, specs['workspace inspect']);
        return inspectWorkspace(getContracts(), {
          workspacePath: parsed.workspacePath,
        });
      },
    },
    'workspace inventory': {
      usage: 'opl workspace inventory --workspace <path>',
      summary:
        'Return the refs-only shared resource inventory projection for workspace sources, materials, memory, and style roots.',
      examples: [
        'opl workspace inventory --workspace /Users/gaofeng/workspace/visual-theme-a',
      ],
      handler: (args) => {
        const parsed = parseWorkspaceValidationArgs(args, specs['workspace inventory']);
        return workspaceInventory(getContracts(), {
          workspacePath: parsed.workspacePath,
        });
      },
    },
    'workspace report': {
      usage: 'opl workspace report --workspace <path>',
      summary:
        'Return a user-first workspace report with current project, Stage Native refs, shared resources, lifecycle counts, and blockers.',
      examples: [
        'opl workspace report --workspace /Users/gaofeng/workspace/visual-theme-a',
      ],
      handler: (args) => {
        const parsed = parseWorkspaceValidationArgs(args, specs['workspace report']);
        return workspaceReport(getContracts(), {
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

import { cloneCommandSpec, assertNoArgs, buildCommandHelp } from '../../modules/support.ts';
import type { CommandSpec } from '../../modules/support.ts';

export function buildWorkspaceCommandSpecs(
  commandSpecs: Record<string, CommandSpec>,
): Record<string, CommandSpec> {
  const workspaceInitUsage = commandSpecs['workspace-init']?.usage
    ?? 'opl workspace init --agent <mas|mag|rca|oma|obf> [--workspace <path>|--workspace-root <dir>] [--workspace-id <id>] [--project-id <id>]';
  const workspaceEnsureUsage = commandSpecs['workspace-ensure']?.usage
    ?? 'opl workspace ensure --agent <mas|mag|rca|oma|obf> [--workspace <path>|--workspace-root <dir>] [--workspace-id <id>] [--project-id <id>]';
  const workspaceAdoptUsage = commandSpecs['workspace adopt']?.usage
    ?? 'opl workspace adopt --agent <mas|mag|rca|oma|obf> --workspace <path> [--project-id <id>] [--mode auto|one_off|series|portfolio] [--dry-run|--apply]';
  const workspaceCommandSpecs: Record<string, CommandSpec> = {
    workspace: {
      usage:
        'opl workspace projects|list|fleet report|root|init|ensure|validate|doctor|source-hygiene|adopt|upgrade|artifact-lifecycle|source ingest|project lifecycle|project archive|project delete|export-map|health|inspect|inventory|report|interfaces|sync|bind|activate|archive [options]',
      summary:
        'Manage OPL workspace bindings, local/cloud sync, standard family-agent workspace initialization, generated inspection refs, and workspace-local project lifecycle projections.',
      examples: [
        'opl workspace projects',
        'opl workspace ensure --agent rca --project-id deck-001',
        'opl workspace init --agent rca --workspace-id visual-theme-a --project-id deck-001',
        'opl workspace validate --workspace /Users/gaofeng/workspace/visual-theme-a',
        'opl workspace report --workspace /Users/gaofeng/workspace/visual-theme-a',
        'opl workspace fleet report',
        'opl workspace inspect --workspace /Users/gaofeng/workspace/visual-theme-a',
        'opl workspace source-hygiene --source-root /Users/gaofeng/workspace/opl-bookforge',
        'opl workspace artifact-lifecycle --workspace /Users/gaofeng/workspace/Book --project-id ai-university-bookforge-20260619 --apply',
        'opl workspace source ingest --workspace /Users/gaofeng/workspace/agent-foundry --file hema-guide.pdf --role reference_design',
        'opl workspace interfaces',
        'opl workspace sync status --workspace workspace-alpha',
      ],
      group: 'workspace',
      subcommands: [
        {
          command: 'workspace sync status',
          usage: 'opl workspace sync status --workspace <id>',
          summary: 'Read durable local/cloud metadata sync state.',
        },
        {
          command: 'workspace sync queue',
          usage: 'opl workspace sync queue --operation-id <id> --workspace <id> --entity <project|task> --local-id <id> --base-version <n> --operation <append|replace> --payload <json>',
          summary: 'Queue a local Project or Task metadata mutation for Cloud sync.',
        },
        {
          command: 'workspace sync push',
          usage: 'opl workspace sync push --origin <url> --workspace <id> --session-cookie-env <name> --csrf-env <name>',
          summary: 'Push pending metadata mutations to Cloud.',
        },
        {
          command: 'workspace sync pull',
          usage: 'opl workspace sync pull --origin <url> --workspace <id> --session-cookie-env <name>',
          summary: 'Pull Cloud metadata changes after the durable local cursor.',
        },
        {
          command: 'workspace sync conflicts',
          usage: 'opl workspace sync conflicts --workspace <id>',
          summary: 'List durable local/cloud metadata conflicts.',
        },
        {
          command: 'workspace projects',
          usage: 'opl workspace projects',
          summary: 'List known project workspace bindings from the OPL workspace registry.',
        },
        {
          command: 'workspace fleet report',
          usage: 'opl workspace fleet report',
          summary: 'Read registry-wide workspace fleet status without executing direct-entry or manifest commands.',
        },
        {
          command: 'workspace init',
          usage: workspaceInitUsage,
          summary: 'Materialize the standard OPL workspace topology for one family agent.',
        },
        {
          command: 'workspace ensure',
          usage: workspaceEnsureUsage,
          summary: 'Reuse an active binding or initialize/append the compatible standard workspace topology.',
        },
        {
          command: 'workspace validate',
          usage: 'opl workspace validate --workspace <path>',
          summary: 'Fail closed unless the workspace index and generated refs match the OPL workspace norm.',
        },
        {
          command: 'workspace doctor',
          usage: 'opl workspace doctor --workspace <path>',
          summary: 'Report workspace topology, generated refs, indexed projects, and blockers without writing.',
        },
        {
          command: 'workspace source-hygiene',
          usage: 'opl workspace source-hygiene [--source-root <repo>]',
          summary: 'Fail closed when a source checkout contains cache or install byproducts.',
        },
        {
          command: 'workspace inspect',
          usage: 'opl workspace inspect --workspace <path>',
          summary: 'Read the workspace inspection projection for user and operator checks.',
        },
        {
          command: 'workspace inventory',
          usage: 'opl workspace inventory --workspace <path>',
          summary: 'Read the shared resource inventory projection without reading resource bodies.',
        },
        {
          command: 'workspace report',
          usage: 'opl workspace report --workspace <path>',
          summary: 'Read the user-first workspace report with current project, stage refs, lifecycle counts, and blockers.',
        },
        {
          command: 'workspace artifact-lifecycle',
          usage: 'opl workspace artifact-lifecycle --workspace <path> [--project-id <id>] [--dry-run|--apply]',
          summary: 'Materialize OPL-owned refs-only lifecycle projections for project sources, memory refs, outputs, and current refs.',
        },
        {
          command: 'workspace source ingest',
          usage: 'opl workspace source ingest --workspace <path> --file <path> [--project-id <id>] [--role <role>]',
          summary: 'Copy source material into workspace-owned storage and emit refs-only provenance.',
        },
        {
          command: 'workspace interfaces',
          usage: 'opl workspace interfaces',
          summary: 'Describe CLI/App/MCP/Skill/OpenAI/AI SDK delegates for the workspace protocol.',
        },
      ],
      handler: (args) => {
        assertNoArgs(args, workspaceCommandSpecs.workspace);
        return buildCommandHelp('workspace', workspaceCommandSpecs.workspace);
      },
    },
    'workspace projects': cloneCommandSpec(commandSpecs.projects, {
      usage: 'opl workspace projects',
      examples: ['opl workspace projects'],
      group: 'workspace',
    }),
    'workspace list': cloneCommandSpec(commandSpecs['workspace list'], {
      usage: 'opl workspace list',
      examples: ['opl workspace list'],
      group: 'workspace',
    }),
    'workspace sync status': cloneCommandSpec(commandSpecs['workspace sync status'], { group: 'workspace' }),
    'workspace sync queue': cloneCommandSpec(commandSpecs['workspace sync queue'], { group: 'workspace' }),
    'workspace sync push': cloneCommandSpec(commandSpecs['workspace sync push'], { group: 'workspace' }),
    'workspace sync pull': cloneCommandSpec(commandSpecs['workspace sync pull'], { group: 'workspace' }),
    'workspace sync conflicts': cloneCommandSpec(commandSpecs['workspace sync conflicts'], { group: 'workspace' }),
    'workspace root': cloneCommandSpec(commandSpecs['workspace root'], {
      usage: 'opl workspace root',
      examples: ['opl workspace root'],
      group: 'workspace',
    }),
    'workspace root set': cloneCommandSpec(commandSpecs['workspace root set'], {
      usage: 'opl workspace root set --path <workspace_root>',
      examples: ['opl workspace root set --path /Users/gaofeng/workspace'],
      group: 'workspace',
    }),
    'workspace root doctor': cloneCommandSpec(commandSpecs['workspace root doctor'], {
      usage: 'opl workspace root doctor',
      examples: ['opl workspace root doctor'],
      group: 'workspace',
    }),
    'workspace init': cloneCommandSpec(commandSpecs['workspace-init'], {
      usage: workspaceInitUsage,
      examples: [
        'opl workspace init --agent rca --workspace-id visual-theme-a --project-id deck-001',
        'opl workspace init --agent rca --workspace-root /Users/gaofeng/workspace --workspace-id visual-theme-a --project-id deck-001',
        'opl workspace init --agent mas --workspace-root /Users/gaofeng/workspace --workspace-id dm-cvd --project-id DM002',
        'opl workspace init --agent oma --workspace /Users/gaofeng/workspace/agent-foundry --dry-run',
        'opl workspace init --agent obf --workspace /Users/gaofeng/workspace/bookforge --dry-run',
      ],
      group: 'workspace',
    }),
    'workspace ensure': cloneCommandSpec(commandSpecs['workspace-ensure'], {
      usage: workspaceEnsureUsage,
      examples: [
        'opl workspace ensure --agent rca --project-id deck-001',
        'opl workspace ensure --agent mas --workspace-id dm-cvd --project-id DM002',
        'opl workspace ensure --agent mag --workspace-root /Users/gaofeng/workspace --workspace-id nsfc-p2c --project-id grant-001',
        'opl workspace ensure --agent bookforge --workspace-id bookforge-workspace --project-id book-001',
      ],
      group: 'workspace',
    }),
    'workspace validate': cloneCommandSpec(commandSpecs['workspace validate'], {
      usage: 'opl workspace validate --workspace <path>',
      examples: [
        'opl workspace validate --workspace /Users/gaofeng/workspace/visual-theme-a',
      ],
      group: 'workspace',
    }),
    'workspace doctor': cloneCommandSpec(commandSpecs['workspace doctor'], {
      usage: 'opl workspace doctor --workspace <path>',
      examples: [
        'opl workspace doctor --workspace /Users/gaofeng/workspace/visual-theme-a',
      ],
      group: 'workspace',
    }),
    'workspace source-hygiene': cloneCommandSpec(commandSpecs['workspace source-hygiene'], {
      usage: 'opl workspace source-hygiene [--source-root <repo>]',
      examples: [
        'opl workspace source-hygiene --source-root /Users/gaofeng/workspace/opl-bookforge',
      ],
      group: 'workspace',
    }),
    'workspace adopt': cloneCommandSpec(commandSpecs['workspace adopt'], {
      usage: workspaceAdoptUsage,
      examples: [
        'opl workspace adopt --agent rca --workspace /Users/gaofeng/workspace/visual-theme-a --project-id deck-001 --dry-run',
        'opl workspace adopt --agent bookforge --workspace /Users/gaofeng/workspace/Book --project-id ai-university-bookforge-20260619 --apply',
        'opl workspace adopt --agent mas --workspace /Users/gaofeng/workspace/dm-cvd --study-id DM002 --apply',
      ],
      group: 'workspace',
    }),
    'workspace upgrade': cloneCommandSpec(commandSpecs['workspace upgrade'], {
      usage: 'opl workspace upgrade --workspace <path> [--dry-run|--apply]',
      examples: [
        'opl workspace upgrade --workspace /Users/gaofeng/workspace/visual-theme-a --apply',
      ],
      group: 'workspace',
    }),
    'workspace artifact-lifecycle': cloneCommandSpec(commandSpecs['workspace artifact-lifecycle'], {
      usage: 'opl workspace artifact-lifecycle --workspace <path> [--project-id <id>] [--dry-run|--apply]',
      examples: [
        'opl workspace artifact-lifecycle --workspace /Users/gaofeng/workspace/Book --project-id ai-university-bookforge-20260619 --dry-run',
        'opl workspace artifact-lifecycle --workspace /Users/gaofeng/workspace/Book --project-id ai-university-bookforge-20260619 --apply',
      ],
      group: 'workspace',
    }),
    'workspace source ingest': cloneCommandSpec(commandSpecs['workspace source ingest'], {
      usage: 'opl workspace source ingest --workspace <path> --file <path> [--project-id <id>] [--role <role>]',
      examples: [
        'opl workspace source ingest --workspace /Users/gaofeng/workspace/agent-foundry --file hema-guide.pdf --role reference_design',
      ],
      group: 'workspace',
    }),
    'workspace project archive': cloneCommandSpec(commandSpecs['workspace project archive'], {
      usage: 'opl workspace project archive --workspace <path> --project-id <id> [--reason <text>] [--dry-run|--apply]',
      examples: [
        'opl workspace project archive --workspace /Users/gaofeng/workspace/visual-theme-a --project-id deck-001 --apply',
      ],
      group: 'workspace',
    }),
    'workspace project lifecycle': cloneCommandSpec(commandSpecs['workspace project lifecycle'], {
      usage:
        'opl workspace project lifecycle --workspace <path> --project-id <id> --status active|paused|locked|superseded|archived [--reason <text>] [--superseded-by-project-id <id>] [--dry-run|--apply]',
      examples: [
        'opl workspace project lifecycle --workspace /Users/gaofeng/workspace/visual-theme-a --project-id deck-001 --status paused --apply',
        'opl workspace project lifecycle --workspace /Users/gaofeng/workspace/visual-theme-a --project-id deck-001 --status active --apply',
      ],
      group: 'workspace',
    }),
    'workspace project delete': cloneCommandSpec(commandSpecs['workspace project delete'], {
      usage: 'opl workspace project delete --workspace <path> --project-id <id> [--owner-receipt-ref <ref>] [--dry-run|--apply]',
      examples: [
        'opl workspace project delete --workspace /Users/gaofeng/workspace/visual-theme-a --project-id deck-001 --dry-run',
      ],
      group: 'workspace',
    }),
    'workspace fleet report': cloneCommandSpec(commandSpecs['workspace fleet report'], {
      usage: 'opl workspace fleet report',
      examples: ['opl workspace fleet report'],
      group: 'workspace',
    }),
    'workspace export-map': cloneCommandSpec(commandSpecs['workspace export-map'], {
      usage: 'opl workspace export-map --workspace <path>',
      examples: [
        'opl workspace export-map --workspace /Users/gaofeng/workspace/visual-theme-a',
      ],
      group: 'workspace',
    }),
    'workspace health': cloneCommandSpec(commandSpecs['workspace health'], {
      usage: 'opl workspace health --workspace <path>',
      examples: [
        'opl workspace health --workspace /Users/gaofeng/workspace/visual-theme-a',
      ],
      group: 'workspace',
    }),
    'workspace inspect': cloneCommandSpec(commandSpecs['workspace inspect'], {
      usage: 'opl workspace inspect --workspace <path>',
      examples: [
        'opl workspace inspect --workspace /Users/gaofeng/workspace/visual-theme-a',
      ],
      group: 'workspace',
    }),
    'workspace inventory': cloneCommandSpec(commandSpecs['workspace inventory'], {
      usage: 'opl workspace inventory --workspace <path>',
      examples: [
        'opl workspace inventory --workspace /Users/gaofeng/workspace/visual-theme-a',
      ],
      group: 'workspace',
    }),
    'workspace report': cloneCommandSpec(commandSpecs['workspace report'], {
      usage: 'opl workspace report --workspace <path>',
      examples: [
        'opl workspace report --workspace /Users/gaofeng/workspace/visual-theme-a',
      ],
      group: 'workspace',
    }),
    'workspace interfaces': cloneCommandSpec(commandSpecs['workspace interfaces'], {
      usage: 'opl workspace interfaces',
      examples: ['opl workspace interfaces'],
      group: 'workspace',
    }),
    'workspace bind': cloneCommandSpec(commandSpecs['workspace-bind'], {
      usage:
        'opl workspace bind --project <project_id> --path <workspace_path> [--label <label>] [--entry-command <command>] [--manifest-command <command>] [--entry-url <url>] [--workspace-root <dir>] [--profile <file>] [--input <file>]',
      examples: [
        'opl workspace bind --project redcube --path /Users/gaofeng/workspace/redcube-ai',
        'opl workspace bind --project medautoscience --path /Users/gaofeng/workspace/med-autoscience --profile /Users/gaofeng/workspace/med-autoscience/profiles/local.toml',
      ],
      group: 'workspace',
    }),
    'workspace activate': cloneCommandSpec(commandSpecs['workspace-activate'], {
      usage: 'opl workspace activate --project <project_id> --path <workspace_path>',
      examples: ['opl workspace activate --project redcube --path /Users/gaofeng/workspace/redcube-ai'],
      group: 'workspace',
    }),
    'workspace archive': cloneCommandSpec(commandSpecs['workspace-archive'], {
      usage: 'opl workspace archive --project <project_id> --path <workspace_path>',
      examples: ['opl workspace archive --project redcube --path /Users/gaofeng/workspace/redcube-ai'],
      group: 'workspace',
    }),
  };

  return workspaceCommandSpecs;
}

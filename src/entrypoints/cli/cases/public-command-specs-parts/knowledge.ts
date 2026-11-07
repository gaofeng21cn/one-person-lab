import fs from 'node:fs';
import { parseCommandOptions } from '../../modules/support.ts';
import type { CommandSpec } from '../../modules/support.ts';
import {
  readDurableKnowledgeCatalog,
  recallDurableKnowledge,
} from '../../../../authority/packages/durable-knowledge-catalog.ts';
import {
  bindStageKnowledgeContext,
  readStageKnowledgeContext,
} from '../../../../adapters/execution/family-runtime-knowledge-context.ts';

export function buildKnowledgeCommandSpecs(): Record<string, CommandSpec> {
  const commandSpecs: Record<string, CommandSpec> = {
    'knowledge list': {
      usage: 'opl knowledge list --repo <agent_repo>',
      summary: 'List body-free durable knowledge catalog entries owned by an Agent repository.',
      examples: ['opl knowledge list --repo ../med-autoscience --json'],
      group: 'knowledge',
      handler: (args) => {
        const parsed = parseCommandOptions(args, commandSpecs['knowledge list'], {
          repo: { type: 'string' },
        });
        const repo = parsed.repo as string | undefined;
        if (!repo) {
          throw new Error('knowledge list requires --repo.');
        }
        return {
          version: 'g2',
          durable_knowledge: readDurableKnowledgeCatalog(repo),
        };
      },
    },
    'knowledge inspect': {
      usage: 'opl knowledge inspect --repo <agent_repo> --id <knowledge_id>',
      summary: 'Inspect one durable knowledge catalog entry without claiming its semantic correctness.',
      examples: ['opl knowledge inspect --repo ../opl-capital-compass --id occ.product-structure --json'],
      group: 'knowledge',
      handler: (args) => {
        const parsed = parseCommandOptions(args, commandSpecs['knowledge inspect'], {
          repo: { type: 'string' },
          id: { type: 'string' },
        });
        const repo = parsed.repo as string | undefined;
        const id = parsed.id as string | undefined;
        if (!repo || !id) {
          throw new Error('knowledge inspect requires --repo and --id.');
        }
        const catalog = readDurableKnowledgeCatalog(repo);
        const item = catalog.items.find((candidate) => candidate.knowledge_id === id);
        if (!item) {
          throw new Error(`Unknown durable knowledge id: ${id}`);
        }
        return {
          version: 'g2',
          durable_knowledge_item: {
            ...item,
            catalog_ref: catalog.catalog_ref,
            authority_boundary: item.authority_boundary,
          },
        };
      },
    },
    'knowledge recall': {
      usage:
        'opl knowledge recall --repo <agent_repo> --domain <domain_id> --stage <stage_id> [--task-intent <action_id>] [--workspace <path>] [--project <path>]',
      summary: 'Select current Stage-relevant knowledge bodies and return exact identity and quality debt.',
      examples: [
        'opl knowledge recall --repo ../opl-capital-compass --domain occ --stage product-evidence --json',
      ],
      group: 'knowledge',
      handler: (args) => {
        const parsed = parseCommandOptions(args, commandSpecs['knowledge recall'], {
          repo: { type: 'string' },
          domain: { type: 'string' },
          stage: { type: 'string' },
          'task-intent': { type: 'string' },
          workspace: { type: 'string' },
          project: { type: 'string' },
        });
        const repo = parsed.repo as string | undefined;
        const domain = parsed.domain as string | undefined;
        const stage = parsed.stage as string | undefined;
        if (!repo || !domain || !stage) {
          throw new Error('knowledge recall requires --repo, --domain and --stage.');
        }
        return {
          version: 'g2',
          durable_knowledge_recall: recallDurableKnowledge({
            repoDir: repo,
            domainId: domain,
            stageId: stage,
            taskIntent: parsed['task-intent'] as string | undefined,
            domainPackRoot: repo,
            workspaceRoot: parsed.workspace as string | undefined,
            projectRoot: parsed.project as string | undefined,
          }),
        };
      },
    },
  };
  commandSpecs['knowledge prepare'] = {
    usage: 'opl knowledge prepare --repo <agent_repo> --domain <domain_id> --stage <stage_id> --output <binding.json> [--task-intent <action_id>] [--workspace <path>] [--project <path>]',
    summary: 'Freeze private knowledge through the same snapshot store used by hosted StageRuns.',
    examples: ['opl knowledge prepare --repo ../opl-capital-compass --domain occ --stage product-evidence --output /private/task/knowledge.json --json'],
    group: 'knowledge',
    handler: (args) => {
      const parsed = parseCommandOptions(args, commandSpecs['knowledge prepare']!, {
        repo: { type: 'string' }, domain: { type: 'string' }, stage: { type: 'string' },
        output: { type: 'string' }, 'task-intent': { type: 'string' },
        workspace: { type: 'string' }, project: { type: 'string' },
      });
      const repo = parsed.repo as string | undefined;
      const domain = parsed.domain as string | undefined;
      const stage = parsed.stage as string | undefined;
      const output = parsed.output as string | undefined;
      if (!repo || !domain || !stage || !output) throw new Error('knowledge prepare requires --repo, --domain, --stage and --output.');
      const binding = bindStageKnowledgeContext({
        repoDir: repo, domainPackRoot: repo, domainId: domain, stageId: stage,
        taskIntent: parsed['task-intent'] as string | undefined,
        workspaceRoot: parsed.workspace as string | undefined,
        projectRoot: parsed.project as string | undefined,
      });
      // Never overwrite another task's binding or follow an output symlink.
      fs.writeFileSync(output, `${JSON.stringify(binding, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
      return { version: 'g2', durable_knowledge_binding: binding, binding_path: output };
    },
  };
  commandSpecs['knowledge read-context'] = {
    usage: 'opl knowledge read-context --binding <binding.json>',
    summary: 'Explicitly read private frozen bodies after verifying their exact snapshot identity.',
    examples: ['opl knowledge read-context --binding /private/task/knowledge.json --json'],
    group: 'knowledge',
    handler: (args) => {
      const parsed = parseCommandOptions(args, commandSpecs['knowledge read-context']!, { binding: { type: 'string' } });
      const bindingPath = parsed.binding as string | undefined;
      if (!bindingPath) throw new Error('knowledge read-context requires --binding.');
      const binding = JSON.parse(fs.readFileSync(bindingPath, 'utf8'));
      return { version: 'g2', durable_knowledge_context: readStageKnowledgeContext(
        binding, binding.receipt?.domain_id, binding.receipt?.stage_id,
      ) };
    },
  };
  return commandSpecs;
}

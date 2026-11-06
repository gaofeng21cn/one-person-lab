import { parseCommandOptions } from '../../modules/support.ts';
import type { CommandSpec } from '../../modules/support.ts';
import {
  readLegacyMemoryDescriptor,
  readDurableKnowledgeCatalog,
  recallDurableKnowledge,
} from '../../../../authority/packages/durable-knowledge-catalog.ts';

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
          legacy_memory_descriptor: readLegacyMemoryDescriptor(repo),
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
        'opl knowledge recall --repo <agent_repo> --domain <domain_id> --stage <stage_id> [--task-intent <text>] [--workspace <path>] [--project <path>]',
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
  return commandSpecs;
}

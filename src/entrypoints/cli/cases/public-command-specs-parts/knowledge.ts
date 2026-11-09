import fs from 'node:fs';
import crypto from 'node:crypto';
import { parseCommandOptions } from '../../modules/support.ts';
import type { CommandSpec } from '../../modules/support.ts';
import {
  readDurableKnowledgeCatalog,
  recallDurableKnowledge,
  verifyKnowledgeDependencies,
  resolveKnowledgeSourceItem,
  proposeKnowledgeWriteback,
  reviewKnowledgeWriteback,
  applyKnowledgeWriteback,
  reviewKnowledgeSource,
  registerKnowledgeSource,
  listKnowledgeSources,
  searchKnowledgeSources,
  resolveKnowledgeSourceTarget,
  discoverKnowledgeSources,
  retireKnowledgeSource,
  inspectKnowledgeRetirement,
} from '../../../../authority/packages/index.ts';
import {
  bindStageKnowledgeContext,
  readStageKnowledgeContext,
  revalidateStageKnowledgeContext,
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
  commandSpecs['knowledge revalidate'] = {
    usage: 'opl knowledge revalidate --binding <binding.json> [--for-action]',
    summary: 'Recheck live access and, before action, the critical source versions of a frozen knowledge context.',
    examples: ['opl knowledge revalidate --binding /private/task/knowledge.json --for-action --json'],
    group: 'knowledge',
    handler: (args) => {
      const parsed = parseCommandOptions(args, commandSpecs['knowledge revalidate']!, {
        binding: { type: 'string' }, 'for-action': { type: 'boolean' },
      });
      if (!parsed.binding) throw new Error('knowledge revalidate requires --binding.');
      const binding = JSON.parse(fs.readFileSync(parsed.binding as string, 'utf8'));
      return { version: 'g2', knowledge_revalidation: revalidateStageKnowledgeContext(binding, { forAction: parsed['for-action'] === true }) };
    },
  };
  commandSpecs['knowledge verify-dependencies'] = {
    usage: 'opl knowledge verify-dependencies --workspace <path> --domain <domain_id> --dependencies <json-file> [--project <path>]',
    summary: 'Verify the current authorization, accepted source versions and validity behind derived knowledge.',
    examples: ['opl knowledge verify-dependencies --workspace /private/workspace --domain persona --dependencies /private/dependencies.json --json'],
    group: 'knowledge',
    handler: (args) => {
      const parsed = parseCommandOptions(args, commandSpecs['knowledge verify-dependencies']!, {
        workspace: { type: 'string' }, domain: { type: 'string' }, project: { type: 'string' }, dependencies: { type: 'string' },
      });
      if (!parsed.workspace || !parsed.domain || !parsed.dependencies) throw new Error('knowledge verify-dependencies requires --workspace, --domain and --dependencies.');
      return { version: 'g2', knowledge_dependencies: verifyKnowledgeDependencies({
        workspaceRoot: parsed.workspace as string, domainId: parsed.domain as string,
        projectRoot: parsed.project as string | undefined,
        dependencies: JSON.parse(fs.readFileSync(parsed.dependencies as string, 'utf8')),
      }) };
    },
  };
  const scopeOptions = { workspace: { type: 'string' as const }, domain: { type: 'string' as const }, project: { type: 'string' as const } };
  const reviewOptions = {
    reviewer: { type: 'string' as const }, 'review-ref': { type: 'string' as const },
    'reviewed-at': { type: 'string' as const }, 'next-review-at': { type: 'string' as const },
  };
  const scope = (parsed: Record<string, unknown>) => {
    if (!parsed.workspace || !parsed.domain) throw new Error('Knowledge owner writeback requires --workspace and --domain.');
    return { workspaceRoot: parsed.workspace as string, domainId: parsed.domain as string, projectRoot: parsed.project as string | undefined };
  };
  const ownerReview = (parsed: Record<string, unknown>) => {
    for (const field of Object.keys(reviewOptions)) if (!parsed[field]) throw new Error(`Knowledge owner review requires --${field}.`);
    return { reviewer: parsed.reviewer as string, reviewRef: parsed['review-ref'] as string,
      reviewedAt: parsed['reviewed-at'] as string, nextReviewAt: parsed['next-review-at'] as string };
  };
  commandSpecs['knowledge sources'] = {
    usage: 'opl knowledge sources --workspace <path> --domain <domain_id> [--project <path>] [--id <knowledge_id>]',
    summary: 'List authorized, current accepted private source metadata without returning bodies.',
    examples: ['opl knowledge sources --workspace /private/workspace --domain relay --json'], group: 'knowledge',
    handler: (args) => {
      const parsed = parseCommandOptions(args, commandSpecs['knowledge sources']!, { ...scopeOptions, id: { type: 'string' } });
      return { version: 'g2', knowledge_sources: listKnowledgeSources({ ...scope(parsed), knowledgeId: parsed.id as string | undefined }) };
    },
  };
  commandSpecs['knowledge search'] = {
    usage: 'opl knowledge search --workspace <path> --domain <domain_id> --query <text> [--project <path>] [--limit <1-20>] [--excerpt-chars <1-1000>]',
    summary: 'Return bounded literal search candidates from accepted authorized sources; selection is not a semantic verdict.',
    examples: ['opl knowledge search --workspace /private/workspace --domain relay --query reserve --json'], group: 'knowledge',
    handler: (args) => {
      const parsed = parseCommandOptions(args, commandSpecs['knowledge search']!, { ...scopeOptions, query: { type: 'string' }, limit: { type: 'string' }, 'excerpt-chars': { type: 'string' } });
      if (!parsed.query) throw new Error('knowledge search requires --query.');
      return { version: 'g2', knowledge_search: searchKnowledgeSources({ ...scope(parsed), query: parsed.query as string,
        limit: parsed.limit ? Number(parsed.limit) : undefined, excerptChars: parsed['excerpt-chars'] ? Number(parsed['excerpt-chars']) : undefined }) };
    },
  };
  commandSpecs['knowledge resolve-target'] = {
    usage: 'opl knowledge resolve-target --workspace <path> --domain <domain_id> --path <absolute-file> [--project <path>]',
    summary: 'Identify a bound source target before direct document editing, including inactive or revoked entries.',
    examples: ['opl knowledge resolve-target --workspace /private/workspace --domain persona --path /private/vault/policy.md --json'], group: 'knowledge',
    handler: (args) => {
      const parsed = parseCommandOptions(args, commandSpecs['knowledge resolve-target']!, { ...scopeOptions, path: { type: 'string' } });
      if (!parsed.path) throw new Error('knowledge resolve-target requires --path.');
      return { version: 'g2', knowledge_target: resolveKnowledgeSourceTarget({ ...scope(parsed), bodyPath: parsed.path as string }) };
    },
  };
  commandSpecs['knowledge discover'] = {
    usage: 'opl knowledge discover --workspace <path> --domain <domain_id> --query <text> [--project <path>] [--source <source_id>] [--path-prefix <relative-prefix>] [--cursor <cursor>] [--limit <1-20>] [--excerpt-chars <1-1000>]',
    summary: 'Discover bounded unregistered source candidates through current read grants and optional source/path filters without accepting knowledge; paginate with the returned cursor.',
    examples: ['opl knowledge discover --workspace /private/workspace --domain relay --query collaboration --json'], group: 'knowledge',
    handler: (args) => {
      const parsed = parseCommandOptions(args, commandSpecs['knowledge discover']!, { ...scopeOptions, query: { type: 'string' }, source: { type: 'string' }, 'path-prefix': { type: 'string' }, cursor: { type: 'string' }, limit: { type: 'string' }, 'excerpt-chars': { type: 'string' } });
      if (!parsed.query) throw new Error('knowledge discover requires --query.');
      return { version: 'g2', knowledge_discovery: discoverKnowledgeSources({ ...scope(parsed), query: parsed.query as string,
        sourceId: parsed.source as string | undefined, pathPrefix: parsed['path-prefix'] as string | undefined,
        cursor: parsed.cursor as string | undefined, limit: parsed.limit ? Number(parsed.limit) : undefined,
        excerptChars: parsed['excerpt-chars'] ? Number(parsed['excerpt-chars']) : undefined }) };
    },
  };
  commandSpecs['knowledge register'] = {
    usage: 'opl knowledge register --workspace <path> --domain <domain_id> --registry <path> --item <json-file> --expected-sha256 <digest> --reviewer <owner> --review-ref <authority-ref> --reviewed-at <time> --next-review-at <time> [--project <path>] [--expected-body-path <absolute-file>]',
    summary: 'Register an owner-reviewed existing Markdown body in its current bound source registry without copying the body.',
    examples: ['opl knowledge register --workspace /private/workspace --domain persona --registry /private/registry.json --item /private/item.json --expected-sha256 <digest> --reviewer owner --review-ref <authority-ref> --reviewed-at <time> --next-review-at <time> --json'], group: 'knowledge',
    handler: (args) => {
      const parsed = parseCommandOptions(args, commandSpecs['knowledge register']!, { ...scopeOptions, ...reviewOptions,
        registry: { type: 'string' }, item: { type: 'string' }, 'expected-sha256': { type: 'string' }, 'expected-body-path': { type: 'string' } });
      if (!parsed.registry || !parsed.item || !parsed['expected-sha256']) throw new Error('knowledge register requires --registry, --item and --expected-sha256.');
      return { version: 'g2', knowledge_registration: registerKnowledgeSource({ ...scope(parsed), ...ownerReview(parsed),
        registryRef: parsed.registry as string, item: JSON.parse(fs.readFileSync(parsed.item as string, 'utf8')), expectedSha256: parsed['expected-sha256'] as string,
        expectedBodyPath: parsed['expected-body-path'] as string | undefined }) };
    },
  };
  const readSource = (args: string[], command: string, candidate: boolean) => {
    const parsed = parseCommandOptions(args, commandSpecs[command]!, { ...scopeOptions, id: { type: 'string' } });
    if (!parsed.id) throw new Error(`${command} requires --id.`);
    const source = resolveKnowledgeSourceItem({ ...scope(parsed), knowledgeId: parsed.id as string, allowInactive: candidate });
    const bytes = fs.readFileSync(source.bodyPath);
    const sha256 = `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
    if (!bytes.length || bytes.length > 256 * 1024 || sha256 !== source.currentSha256
      || (!candidate && sha256 !== source.reviewedSha256)) throw new Error('Knowledge source changed during its authorized read.');
    const content = { knowledge_id: source.item.knowledge_id, sha256, source_id: source.source.source_id,
      scope: source.item.scope, content_kind: source.item.content_kind, status: source.item.status,
      reviewed_at: source.item.reviewed_at, next_review_at: source.item.next_review_at,
      content: new TextDecoder('utf-8', { fatal: true }).decode(bytes), source_ref: source.item.body_ref.ref };
    return candidate
      ? { version: 'g2', knowledge_source_candidate: { ...content, accepted_sha256: source.reviewedSha256, status: source.item.status } }
      : { version: 'g2', knowledge_source: content };
  };
  commandSpecs['knowledge read-source'] = {
    usage: 'opl knowledge read-source --workspace <path> --domain <domain_id> --id <knowledge_id> [--project <path>]',
    summary: 'Read one currently authorized accepted source body and its exact revision.',
    examples: ['opl knowledge read-source --workspace /private/workspace --domain persona --id owner.identity --json'],
    group: 'knowledge',
    handler: (args) => readSource(args, 'knowledge read-source', false),
  };
  commandSpecs['knowledge inspect-source'] = {
    usage: 'opl knowledge inspect-source --workspace <path> --domain <domain_id> --id <knowledge_id> [--project <path>]',
    summary: 'Inspect authorized current source bytes as a review candidate; this does not accept or activate the revision.',
    examples: ['opl knowledge inspect-source --workspace /private/workspace --domain occ --id owner.method --json'],
    group: 'knowledge',
    handler: (args) => readSource(args, 'knowledge inspect-source', true),
  };
  commandSpecs['knowledge propose'] = {
    usage: 'opl knowledge propose --workspace <path> --domain <domain_id> --id <knowledge_id> --proposal <json-file> --body <markdown-file> [--project <path>]',
    summary: 'Prepare an immutable owner knowledge revision against the exact source and registry versions.',
    examples: ['opl knowledge propose --workspace /private/workspace --domain occ --id owner.method --proposal /private/proposal.json --body /private/replacement.md --json'],
    group: 'knowledge',
    handler: (args) => {
      const parsed = parseCommandOptions(args, commandSpecs['knowledge propose']!, {
        ...scopeOptions, id: { type: 'string' }, proposal: { type: 'string' }, body: { type: 'string' },
      });
      if (!parsed.id || !parsed.proposal || !parsed.body) throw new Error('knowledge propose requires --id, --proposal and --body.');
      return { version: 'g2', knowledge_proposal: proposeKnowledgeWriteback({ ...scope(parsed),
        knowledgeId: parsed.id as string, proposal: JSON.parse(fs.readFileSync(parsed.proposal as string, 'utf8')),
        replacement: fs.readFileSync(parsed.body as string),
      }) };
    },
  };
  commandSpecs['knowledge review'] = {
    usage: 'opl knowledge review --workspace <path> --domain <domain_id> --proposal-id <digest> --decision <accepted|rejected> --reviewer <owner> --review-ref <authority-ref> --reviewed-at <time> --next-review-at <time> [--project <path>]',
    summary: 'Record an authorized maintainer review of an exact knowledge proposal; the command does not supply semantic acceptance.',
    examples: ['opl knowledge review --workspace /private/workspace --domain occ --proposal-id <digest> --decision accepted --reviewer owner --review-ref <authority-ref> --reviewed-at <time> --next-review-at <time> --json'],
    group: 'knowledge',
    handler: (args) => {
      const parsed = parseCommandOptions(args, commandSpecs['knowledge review']!, {
        ...scopeOptions, ...reviewOptions, 'proposal-id': { type: 'string' }, decision: { type: 'string' },
      });
      if (!parsed['proposal-id'] || !['accepted', 'rejected'].includes(parsed.decision as string)) throw new Error('knowledge review requires --proposal-id and an accepted/rejected --decision.');
      return { version: 'g2', knowledge_review: reviewKnowledgeWriteback({ ...scope(parsed), ...ownerReview(parsed),
        proposalId: parsed['proposal-id'] as string, decision: parsed.decision as 'accepted' | 'rejected',
      }) };
    },
  };
  commandSpecs['knowledge apply'] = {
    usage: 'opl knowledge apply --workspace <path> --domain <domain_id> --proposal-id <digest> [--project <path>]',
    summary: 'Apply an accepted knowledge proposal to its unique source with version checks and recovery receipts.',
    examples: ['opl knowledge apply --workspace /private/workspace --domain occ --proposal-id <digest> --json'],
    group: 'knowledge',
    handler: (args) => {
      const parsed = parseCommandOptions(args, commandSpecs['knowledge apply']!, { ...scopeOptions, 'proposal-id': { type: 'string' } });
      if (!parsed['proposal-id']) throw new Error('knowledge apply requires --proposal-id.');
      return { version: 'g2', knowledge_writeback: applyKnowledgeWriteback({ ...scope(parsed), proposalId: parsed['proposal-id'] as string }) };
    },
  };
  commandSpecs['knowledge review-source'] = {
    usage: 'opl knowledge review-source --workspace <path> --domain <domain_id> --id <knowledge_id> --expected-sha256 <reviewed-source-digest> --reviewer <owner> --review-ref <authority-ref> --reviewed-at <time> --next-review-at <time> [--project <path>]',
    summary: 'Accept reviewed edits already made in the original knowledge source without rewriting its body.',
    examples: ['opl knowledge review-source --workspace /private/workspace --domain occ --id owner.method --expected-sha256 <reviewed-source-digest> --reviewer owner --review-ref <authority-ref> --reviewed-at <time> --next-review-at <time> --json'],
    group: 'knowledge',
    handler: (args) => {
      const parsed = parseCommandOptions(args, commandSpecs['knowledge review-source']!, {
        ...scopeOptions, ...reviewOptions, id: { type: 'string' }, 'expected-sha256': { type: 'string' },
      });
      if (!parsed.id || !parsed['expected-sha256']) throw new Error('knowledge review-source requires --id and --expected-sha256.');
      return { version: 'g2', knowledge_writeback: reviewKnowledgeSource({ ...scope(parsed), ...ownerReview(parsed),
        knowledgeId: parsed.id as string, expectedSha256: parsed['expected-sha256'] as string,
      }) };
    },
  };
  commandSpecs['knowledge retire'] = {
    usage: 'opl knowledge retire --workspace <path> --domain <domain_id> --id <knowledge_id> --expected-sha256 <digest> --expected-registry-sha256 <digest> --reason <reason> --reviewer <owner> --review-ref <authority-ref> --reviewed-at <time> [--project <path>]',
    summary: 'Retire reviewed source bytes with owner-controlled recovery evidence and conditional removal from the original location.',
    examples: ['opl knowledge retire --workspace /private/workspace --domain persona --id owner.policy --expected-sha256 <digest> --expected-registry-sha256 <digest> --reason <reason> --reviewer owner --review-ref <authority-ref> --reviewed-at <time> --json'],
    group: 'knowledge',
    handler: (args) => {
      const fields = ['id', 'expected-sha256', 'expected-registry-sha256', 'reason', 'reviewer', 'review-ref', 'reviewed-at'];
      const parsed = parseCommandOptions(args, commandSpecs['knowledge retire']!, {
        ...scopeOptions, ...Object.fromEntries(fields.map((name) => [name, { type: 'string' as const }])),
      });
      for (const field of fields) if (!parsed[field]) throw new Error(`knowledge retire requires --${field}.`);
      return { version: 'g2', knowledge_retirement: retireKnowledgeSource({ ...scope(parsed),
        knowledgeId: parsed.id as string, expectedSha256: parsed['expected-sha256'] as string,
        expectedRegistrySha256: parsed['expected-registry-sha256'] as string, reason: parsed.reason as string,
        reviewer: parsed.reviewer as string, reviewRef: parsed['review-ref'] as string, reviewedAt: parsed['reviewed-at'] as string,
      }) };
    },
  };
  commandSpecs['knowledge inspect-retirement'] = {
    usage: 'opl knowledge inspect-retirement --workspace <path> --domain <domain_id> --operation-id <digest> [--project <path>]',
    summary: 'Read an authorized retirement receipt or interrupted phase without removing or restoring source bytes.',
    examples: ['opl knowledge inspect-retirement --workspace /private/workspace --domain persona --operation-id <digest> --json'],
    group: 'knowledge',
    handler: (args) => {
      const parsed = parseCommandOptions(args, commandSpecs['knowledge inspect-retirement']!, {
        ...scopeOptions, 'operation-id': { type: 'string' },
      });
      if (!parsed['operation-id']) throw new Error('knowledge inspect-retirement requires --operation-id.');
      return { version: 'g2', knowledge_retirement: inspectKnowledgeRetirement({ ...scope(parsed), operationId: parsed['operation-id'] as string }) };
    },
  };
  return commandSpecs;
}

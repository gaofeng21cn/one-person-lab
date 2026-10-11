import {
  resolveStandardAgent,
  STANDARD_AGENT_SERIES_MEMBERSHIP,
} from '../../../../authority/contracts/index.ts';
import { resolveStandardAgentContractCheckout } from '../../../../adapters/integration/index.ts';
import {
  buildFamilyActionExport,
  buildFamilyActionInspect,
  buildFamilyActionsList,
} from '../../../../read-models/operator/family-action-catalog.ts';
import {
  buildAgentReadinessSummary,
  buildPrivatePlatformResidueOwnerDecisionLedgerCommand,
} from '../../../../read-models/operator/index.ts';
import {
  buildFamilyAgentDescriptorInspect,
  buildFamilyAgentDescriptorList,
} from '../../../../read-models/catalog/family-domain-agent-descriptor.ts';
import {
  defaultStandardDomainAgentRepoInputs,
  DEFAULT_STANDARD_DOMAIN_AGENT_REPOS,
} from '../../../../read-models/catalog/index.ts';
import type {
  CordisAtlasCatalogService,
  CordisDomainManifestCatalogOptions,
} from '../../../../read-models/catalog/index.ts';
import {
  buildGeneratedAgentInterfaces,
  buildDomainPackCompilerInspect,
  buildDomainPackCompilerList,
  parsePackCompilerArgs,
} from '../../../../authority/packages/domain-pack-compiler.ts';
import {
  buildAgentDefaultCallerReadinessReport,
  buildAgentPlatformSurfaceOwnershipReport,
  buildStandardDomainAgentConformanceReport,
  buildStandardAgentSourceClosureReport,
  buildStandardAgentCheck,
  buildFamilyAgentInspect,
  buildFamilyAgentsList,
  runFamilyAgentLegacyCleanupApply,
  withStandardDomainAgentSkeletonInspection,
} from '../../../../authority/workspace/index.ts';
import { agentsEvidenceApplySpec } from '../agent-evidence-command-spec.ts';
import {
  buildFamilyDomainMemoryInspect,
  buildFamilyDomainMemoryList,
  buildFamilyDomainMemoryMigrationPlan,
} from '../../../../read-models/catalog/family-domain-memory.ts';
import {
  buildGenericSubstrateProjectionInspect,
  buildGenericSubstrateProjectionList,
  buildGenericSubstrateWorkbench,
} from '../../../../adapters/execution/generic-substrate-projection.ts';
import {
  applyProviderClosureEvidence,
  providerClosureEvidence,
  providerResidencyGapStatus,
  readFamilyDomainMemoryRuntimeReceiptEvidenceByDomain,
  readProviderContinuousProof,
  runFamilyRuntimeLifecycleApply,
} from '../../../../adapters/execution/index.ts';
import type { FrameworkContracts } from '../../../../kernel/types.ts';
import {
  assertNoArgs,
  cloneCommandSpec,
} from '../../modules/support.ts';
import type { CommandSpec } from '../../modules/support.ts';

export interface DomainCommandComposition {
  getContracts: () => FrameworkContracts;
  commandSpecs: Record<string, CommandSpec>;
  atlasService?: CordisAtlasCatalogService;
}

export function buildDomainCommandSpecs({
  getContracts,
  commandSpecs,
  atlasService,
}: DomainCommandComposition): Record<string, CommandSpec> {
  const standardAgentPackCompilerInputs = () => ({
    familyRepoInputs: defaultStandardDomainAgentRepoInputs(),
    defaultRepoDirectories: DEFAULT_STANDARD_DOMAIN_AGENT_REPOS.map((repo) => repo.directory),
    resolveDomainSelection: (value: string) => resolveStandardAgent(value)?.domain_id ?? value,
    resolveStandardAgentRepo: (value: string) => {
      const agent = resolveStandardAgent(value);
      if (!agent || agent.series_membership !== STANDARD_AGENT_SERIES_MEMBERSHIP) return null;
      const resolution = resolveStandardAgentContractCheckout(
        agent.agent_id,
        undefined,
        undefined,
        { result: 'typed_resolution' },
      );
      return {
        requested_agent_id: agent.agent_id,
        repo_dir: resolution.checkout?.checkout_path ?? null,
        contract_resolution: {
          surface_kind: resolution.surface_kind,
          status: resolution.status,
          launch_allowed: resolution.launch_allowed,
          reason: resolution.reason,
          source_status: resolution.source_status,
        },
      };
    },
  });

  const requireAtlasService = (): CordisAtlasCatalogService => {
    if (!atlasService) {
      throw new Error('CLI command requires an explicit Cordis Atlas catalog service.');
    }
    return atlasService;
  };
  const loadDomainManifests = (
    options: CordisDomainManifestCatalogOptions = {},
  ): ReturnType<CordisAtlasCatalogService> => requireAtlasService()(getContracts(), options);
  const loadStandardAgentDomainManifests = (
    options: Parameters<CordisAtlasCatalogService['buildStandardAgent']>[1] = {},
  ): ReturnType<CordisAtlasCatalogService['buildStandardAgent']> => {
    const atlas = requireAtlasService();
    const legacyDomainManifests = loadDomainManifests(options);
    return atlas.buildStandardAgent(getContracts(), {
      ...options,
      legacyDomainManifests,
    });
  };

  const familyAgentProviderPort = {
    readProviderContinuousProof,
    providerClosureEvidence,
    providerResidencyGapStatus,
    applyProviderClosureEvidence,
  };
  const familyAgentLifecyclePort = { runFamilyRuntimeLifecycleApply };
  const buildAgentDescriptorManifests = (
    options: Parameters<CordisAtlasCatalogService['buildStandardAgent']>[1] = {},
  ) =>
    withStandardDomainAgentSkeletonInspection(
      loadStandardAgentDomainManifests(options),
      familyAgentProviderPort,
    );
  const loadAgentDescriptorsForPackCompiler = () =>
    buildFamilyAgentDescriptorList(getContracts(), {
      domainManifests: withStandardDomainAgentSkeletonInspection(
        loadDomainManifests({
          manifestCommandTimeoutMs: 120_000,
          manifestCommandTimeoutPolicy: 'fixed',
        }),
        familyAgentProviderPort,
      ),
      manifestCommandTimeoutMs: 120_000,
      manifestCommandTimeoutPolicy: 'fixed',
    }).family_agent_descriptors.descriptors as Record<string, unknown>[];

  const domainCommandSpecs: Record<string, CommandSpec> = {
    'domain manifests': cloneCommandSpec(commandSpecs['domain manifests'], {
      usage: 'opl domain manifests',
      examples: ['opl domain manifests'],
      group: 'domain',
    }),
    'domain launch': cloneCommandSpec(commandSpecs['domain launch'], {
      usage:
        'opl domain launch --project <project_id> [--path <workspace_path>] [--strategy <auto|open_url|spawn_command>] [--dry-run]',
      examples: ['opl domain launch --project redcube --dry-run'],
      group: 'domain',
    }),
    'domain select-entry': cloneCommandSpec(commandSpecs['domain select-entry'], {
      usage:
        'opl domain select-entry --intent <intent> --target <target> --goal <goal> [--preferred-family <family>] [--request-kind <kind>]',
      examples: [
        'opl domain select-entry --intent presentation_delivery --target deliverable --goal "Prepare a defense-ready slide deck."',
      ],
      group: 'domain',
    }),
    'domain explain-boundary': cloneCommandSpec(commandSpecs['domain explain-boundary'], {
      usage:
        'opl domain explain-boundary --intent <intent> --target <target> --goal <goal> [--preferred-family <family>] [--request-kind <kind>]',
      examples: [
        'opl domain explain-boundary --intent create --target deliverable --goal "Prepare a xiaohongshu campaign pack." --preferred-family xiaohongshu',
      ],
      group: 'domain',
    }),
    'actions list': {
      usage: 'opl actions list',
      summary: 'List domain-owned family action catalogs from selected managed Standard Agent contracts or non-standard legacy bindings.',
      examples: ['opl actions list'],
      group: 'domain',
      handler: (args) => {
        assertNoArgs(args, domainCommandSpecs['actions list']);
        return buildFamilyActionsList(getContracts());
      },
    },
    'actions inspect': {
      usage: 'opl actions inspect --domain <domain> --action <action_id>',
      summary: 'Inspect one managed or legacy domain action plus its derived CLI/MCP/Skill/tool projections.',
      examples: ['opl actions inspect --domain redcube --action start_deliverable'],
      group: 'domain',
      handler: (args) => buildFamilyActionInspect(getContracts(), args),
    },
    'actions export': {
      usage: 'opl actions export --domain <domain> --format <cli|mcp|skill|openai|ai-sdk>',
      summary: 'Export one resolved domain action catalog as a derived CLI, MCP, Skill, OpenAI, or AI SDK descriptor set.',
      examples: [
        'opl actions export --domain medautoscience --format mcp',
        'opl actions export --domain redcube --format openai',
      ],
      group: 'domain',
      handler: (args) => buildFamilyActionExport(getContracts(), args),
    },
    'agents list': {
      usage: 'opl agents list',
      summary: 'List skeleton completeness for every Standard Agent registered with OPL.',
      examples: ['opl agents list'],
      group: 'domain',
      handler: (args) => {
        assertNoArgs(args, domainCommandSpecs['agents list']);
        return buildFamilyAgentsList(getContracts(), {
          domainManifests: buildAgentDescriptorManifests(),
          providerPort: familyAgentProviderPort,
        });
      },
    },
    'agents inspect': {
      usage: 'opl agents inspect --domain <domain>',
      summary: 'Inspect one standard domain-agent skeleton mapping without reading real artifact contents.',
      examples: ['opl agents inspect --domain mas'],
      group: 'domain',
      handler: (args) => buildFamilyAgentInspect(getContracts(), args, {
        domainManifests: buildAgentDescriptorManifests(),
        providerPort: familyAgentProviderPort,
      }),
    },
    'agents legacy-cleanup apply': {
      usage: 'opl agents legacy-cleanup apply --domain <domain> [--mode dry-run|apply|verify] [--source-ref <ref>] [--receipt-ref <ref>]',
      summary:
        'Apply the OPL-owned legacy cleanup ledger plan for one domain-agent skeleton without deleting domain repo files.',
      examples: [
        'opl agents legacy-cleanup apply --domain mag --mode dry-run',
        'opl agents legacy-cleanup apply --domain mas --mode apply',
        'opl agents legacy-cleanup apply --domain rca --mode verify',
      ],
      group: 'domain',
      handler: (args) => runFamilyAgentLegacyCleanupApply(getContracts(), args, {
        domainManifests: loadDomainManifests(),
        providerPort: familyAgentProviderPort,
        lifecyclePort: familyAgentLifecyclePort,
      }),
    },
    'agents evidence apply': agentsEvidenceApplySpec,
    'agents run': cloneCommandSpec(commandSpecs['agents run'], {
      usage: 'opl agents run --domain <agent> --action <action_id> --workspace <absolute_path> [--payload <json> | --payload-file <path>] [--run-id <id>] [--timeout-ms <ms>]',
      examples: [
        'opl agents run --domain obf --action shape-storyline --workspace /path/to/book --payload \'{"workspace_root":"/path/to/book"}\'',
        'opl agents run --domain mas --action study-progress --workspace /path/to/workspace --payload-file request.json --json',
      ],
      group: 'domain',
    }),
    'agents check': {
      usage: 'opl agents check --repo <agent_repo> [--profile <profile_id>]',
      summary: 'Aggregate existing scaffold, generated-interface, optional profile, and local framework-export compatibility checks for one standard Agent repo.',
      examples: [
        'opl agents check --repo /path/to/agent',
        'opl agents check --repo /path/to/agent --profile evidence_grounded_decision_agent_profile.v1',
      ],
      group: 'domain',
      handler: (args) => buildStandardAgentCheck(getContracts(), args, {
        loadAgentDescriptors: loadAgentDescriptorsForPackCompiler,
        ...standardAgentPackCompilerInputs(),
      }),
    },
    'agents descriptors': {
      usage: 'opl agents descriptors',
      summary: 'List unified domain-agent descriptors projected from entry, stage, action, memory, skill, runtime, and artifact refs.',
      examples: ['opl agents descriptors'],
      group: 'domain',
      handler: (args) => {
        assertNoArgs(args, domainCommandSpecs['agents descriptors']);
        return buildFamilyAgentDescriptorList(getContracts(), {
          domainManifests: buildAgentDescriptorManifests(),
        });
      },
    },
    'agents descriptor': {
      usage: 'opl agents descriptor --domain <domain>',
      summary: 'Inspect one unified domain-agent descriptor without embedding domain memory or instruction bodies.',
      examples: ['opl agents descriptor --domain mas'],
      group: 'domain',
      handler: (args) => buildFamilyAgentDescriptorInspect(getContracts(), args, {
        domainManifests: buildAgentDescriptorManifests(),
      }),
    },
    'agents pack-compiler': {
      usage: 'opl agents pack-compiler [--family-defaults]',
      summary: 'List OPL-owned generated-surface handoff projections compiled from admitted manifests or default standard agent repo contracts.',
      examples: ['opl agents pack-compiler', 'opl agents pack-compiler --family-defaults'],
      group: 'domain',
      handler: (args) => buildDomainPackCompilerList(getContracts(), {
        ...parsePackCompilerArgs(args),
        loadAgentDescriptors: loadAgentDescriptorsForPackCompiler,
        ...standardAgentPackCompilerInputs(),
      }),
    },
    'agents pack-compiler inspect': {
      usage: 'opl agents pack-compiler inspect [--family-defaults] --domain <domain>',
      summary: 'Inspect one OPL-owned generated-surface handoff projection without moving domain authority into OPL.',
      examples: [
        'opl agents pack-compiler inspect --domain mas',
        'opl agents pack-compiler inspect --family-defaults --domain mas',
      ],
      group: 'domain',
      handler: (args) => buildDomainPackCompilerInspect(getContracts(), args, {
        loadAgentDescriptors: loadAgentDescriptorsForPackCompiler,
        ...standardAgentPackCompilerInputs(),
      }),
    },
    'agents interfaces': {
      usage: 'opl agents interfaces (--family-defaults | --domain <domain> | --repo-dir <path>) [--format <cli|mcp|skill|product-entry|openai|ai-sdk>]',
      summary: 'Generate the unified OPL-owned CLI, MCP, Skill, product-entry, and tool interface bundle from a domain pack or standard agent repo.',
      examples: [
        'opl agents interfaces --family-defaults',
        'opl agents interfaces --domain mas',
        'opl agents interfaces --repo-dir /path/to/opl-compatible-agent',
        'opl agents interfaces --domain redcube --format mcp',
      ],
      group: 'domain',
      handler: (args) => buildGeneratedAgentInterfaces(getContracts(), args, {
        loadAgentDescriptors: loadAgentDescriptorsForPackCompiler,
        ...standardAgentPackCompilerInputs(),
      }),
    },
    'agents platform-surfaces': {
      usage: 'opl agents platform-surfaces [--repo-dir <path> ...] [--agent <id>=<path> ...] [--family-defaults]',
      summary:
        'Classify OPL-owned generic platform surfaces across standard agents while preserving domain truth, verdict, artifact, memory, and owner-receipt authority.',
      examples: [
        'opl agents platform-surfaces --family-defaults',
        'opl agents platform-surfaces --agent mas=/path/to/med-autoscience',
      ],
      group: 'domain',
      handler: (args) => buildAgentPlatformSurfaceOwnershipReport(args),
    },
    'agents default-callers': {
      usage: 'opl agents default-callers [--repo-dir <path> ...] [--agent <id>=<path> ...] [--family-defaults]',
      summary:
        'Project OPL generated and hosted default-caller readiness for standard agents without authorizing domain ready or physical deletion.',
      examples: [
        'opl agents default-callers --family-defaults',
        'opl agents default-callers --agent mas=/path/to/med-autoscience',
      ],
      group: 'domain',
      handler: (args) => buildAgentDefaultCallerReadinessReport(args),
    },
    'agents source-closure': {
      usage: 'opl agents source-closure [--repo-dir <path> ...] [--agent <id>=<path> ...] [--family-defaults]',
      summary:
        'Prove standard Agent package, action, handler, call, and sensitive-effect closure from executable source instead of audit path declarations.',
      examples: [
        'opl agents source-closure --family-defaults',
        'opl agents source-closure --agent mas=/path/to/med-autoscience',
      ],
      group: 'domain',
      handler: (args) => buildStandardAgentSourceClosureReport(args),
    },
    'agents residue-decisions': {
      usage: 'opl agents residue-decisions [--repo-dir <path> ...] [--agent <id>=<path> ...] [--family-defaults]',
      summary:
        'Project the refs-only owner-decision ledger for private platform residue without writing domain truth or authorizing physical deletion.',
      examples: [
        'opl agents residue-decisions --family-defaults',
        'opl agents residue-decisions --agent mas=/path/to/med-autoscience',
      ],
      group: 'domain',
      handler: (args) => buildPrivatePlatformResidueOwnerDecisionLedgerCommand(args),
    },
    'agents conformance': {
      usage: 'opl agents conformance [--repo-dir <path> ...] [--agent <id>=<path> ...] [--family-defaults]',
      summary:
        'Report structural conformance and live family probe status for standard OPL agents without claiming domain or production readiness.',
      examples: [
        'opl agents conformance',
        'opl agents conformance --repo-dir /path/to/med-autoscience --repo-dir /path/to/redcube-ai',
        'opl agents conformance --agent mas=/path/to/med-autoscience',
      ],
      group: 'domain',
      handler: (args) => buildStandardDomainAgentConformanceReport(args, getContracts()),
    },
    'agents readiness': {
      usage: 'opl agents readiness [--repo-dir <path> ...] [--agent <id>=<path> ...] [--family-defaults]',
      summary:
        'Aggregate standard-agent Kernel-floor readiness as an attention-first operator summary without claiming domain, quality, artifact, or production ready.',
      examples: [
        'opl agents readiness --family-defaults',
        'opl agents readiness --agent mas=/path/to/med-autoscience',
      ],
      group: 'domain',
      handler: (args) => buildAgentReadinessSummary(args),
    },
    'substrate projections': {
      usage: 'opl substrate projections',
      summary: 'List framework-owned workspace, source, artifact, and memory substrate projections from domain manifests.',
      examples: ['opl substrate projections'],
      group: 'domain',
      handler: (args) => {
        assertNoArgs(args, domainCommandSpecs['substrate projections']);
        return buildGenericSubstrateProjectionList(getContracts(), {
          domainManifests: loadDomainManifests(),
        });
      },
    },
    'substrate projection': {
      usage: 'opl substrate projection --domain <domain>',
      summary: 'Inspect one framework-owned substrate projection without reading domain truth, artifact bodies, or memory bodies.',
      examples: ['opl substrate projection --domain mas'],
      group: 'domain',
      handler: (args) => buildGenericSubstrateProjectionInspect(getContracts(), args, {
        domainManifests: loadDomainManifests(),
      }),
    },
    'substrate workbench': {
      usage: 'opl substrate workbench',
      summary: 'Group substrate refs by domain, status, and ref family for App/operator drilldown without reading domain bodies.',
      examples: ['opl substrate workbench'],
      group: 'domain',
      handler: (args) => {
        assertNoArgs(args, domainCommandSpecs['substrate workbench']);
        return buildGenericSubstrateWorkbench(getContracts(), {
          domainManifests: loadDomainManifests(),
        });
      },
    },
    'domain-memory list': {
      usage: 'opl domain-memory list',
      summary: 'List domain-owned memory locator descriptors resolved from bound manifests.',
      examples: ['opl domain-memory list'],
      group: 'domain',
      handler: (args) => {
        assertNoArgs(args, domainCommandSpecs['domain-memory list']);
        return buildFamilyDomainMemoryList(getContracts(), {
          domainManifests: loadDomainManifests(),
          runtimeReceiptEvidenceIndex: readFamilyDomainMemoryRuntimeReceiptEvidenceByDomain(),
        });
      },
    },
    'domain-memory inspect': {
      usage: 'opl domain-memory inspect --domain <domain>',
      summary: 'Inspect one domain-owned memory locator, receipt projection, and OPL non-authority boundary.',
      examples: ['opl domain-memory inspect --domain mas'],
      group: 'domain',
      handler: (args) => buildFamilyDomainMemoryInspect(getContracts(), args, {
        domainManifests: loadDomainManifests(),
        runtimeReceiptEvidenceIndex: readFamilyDomainMemoryRuntimeReceiptEvidenceByDomain(),
      }),
    },
    'domain-memory migration-plan': {
      usage: 'opl domain-memory migration-plan --domain <domain>',
      summary: 'Project domain-owned migration, proposal contract, router receipt, and writeback receipt locators.',
      examples: ['opl domain-memory migration-plan --domain mas'],
      group: 'domain',
      handler: (args) => buildFamilyDomainMemoryMigrationPlan(getContracts(), args, {
        domainManifests: loadDomainManifests(),
        runtimeReceiptEvidenceIndex: readFamilyDomainMemoryRuntimeReceiptEvidenceByDomain(),
      }),
    },
  };

  return domainCommandSpecs;
}

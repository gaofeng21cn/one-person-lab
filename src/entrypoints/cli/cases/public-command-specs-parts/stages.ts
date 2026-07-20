import {
  buildFamilyStageAssumptionsInspect,
  buildFamilyStageCohortLoopInspect,
  buildFamilyStageGraphInspect,
  buildFamilyStageInspect,
  buildFamilyStagePackRegistryInspect,
  buildFamilyStagePackSourceSpecInspect,
  buildFamilyStageProofBundleInspect,
  buildFamilyStageReadinessInspect,
  buildFamilyStageReplayCertificationInspect,
  buildFamilyStageRuntimeBudgetInspect,
  buildFamilyStagesList,
} from '../../../../modules/stagecraft/family-stage-control-plane.ts';
import {
  buildStandardAgentDomainManifestCatalog,
} from '../../../../modules/atlas/index.ts';
import {
  familyStageDiagnosticLensCommands,
  requireFamilyStageDerivedLens,
} from '../../../../modules/stagecraft/family-stage-derived-lenses.ts';
import type { FrameworkContracts } from '../../../../kernel/types.ts';
import { assertNoArgs, parseRegisteredCommandOptions } from '../../modules/support.ts';
import type { CommandSpec } from '../../modules/support.ts';

type CommandRegistryMetadata = NonNullable<CommandSpec['registry']>;
type CommandOptionMetadata = CommandRegistryMetadata['options'][number];

const STAGE_AUTHORITY_BOUNDARY = {
  owner: 'OPL Stagecraft',
  surface: 'family_stage_projection_readback',
  can_write_domain_truth: false,
  can_create_owner_receipt: false,
  can_claim_domain_ready: false,
  can_claim_production_ready: false,
} as const;

const DOMAIN_OPTION: CommandOptionMetadata = {
  name: 'domain',
  flag: '--domain',
  value_kind: 'string',
  summary: 'Domain identifier or alias to inspect.',
  required: true,
};

const REF_OPTIONS = [
  'append-only-event-log-ref',
  'attempt-ledger-ref',
  'recorded-runtime-event-ref',
  'closeout-receipt-ref',
].map((name) => ({
  name,
  flag: `--${name}`,
  value_kind: 'string',
  summary: 'Refs-only evidence input folded into the stage diagnostic projection.',
  multiple: true,
})) satisfies CommandOptionMetadata[];

const STAGE_PACK_OPTIONS = [
  'library-status',
  'promotion-ref',
  'deprecation-ref',
  'supersession-ref',
  'superseded-by-stage-pack-ref',
  'previous-stage-pack-hash',
  'migration-policy',
  'migration-policy-ref',
].map((name) => ({
  name,
  flag: `--${name}`,
  value_kind: 'string',
  summary: 'Stage-pack lifecycle projection input.',
})) satisfies CommandOptionMetadata[];

const REUSED_BY_OPTION: CommandOptionMetadata = {
  name: 'reused-by-ref',
  flag: '--reused-by-ref',
  value_kind: 'string',
  summary: 'Refs-only stage-pack reuse projection input.',
  multiple: true,
};

function stageRegistry(
  commandId: string,
  commandKey: string,
  options: CommandOptionMetadata[],
): CommandRegistryMetadata {
  return {
    command_id: commandId,
    parser_adapter: 'node_util_parse_args',
    options,
    json_output_schema_ref:
      `contracts/opl-framework/cli-command-registry.json#/commands/${commandKey}/output_schema`,
    authority_boundary: STAGE_AUTHORITY_BOUNDARY,
  };
}

function assertRegisteredStageArgs(
  commandId: string,
  args: string[],
  specs: Record<string, CommandSpec>,
) {
  parseRegisteredCommandOptions(commandId, args, specs[commandId]);
}

export function buildStageCommandSpecs(
  getContracts: () => FrameworkContracts,
): Record<string, CommandSpec> {
  const loadDomainManifests = (
    contracts: FrameworkContracts,
    options: Parameters<typeof buildStandardAgentDomainManifestCatalog>[1],
  ) => buildStandardAgentDomainManifestCatalog(contracts, options).domain_manifests;
  const stageCommandSpecs: Record<string, CommandSpec> = {
    'stages list': {
      usage: 'opl stages list',
      summary: 'List Standard Agent stage control planes resolved from selected owner checkouts.',
      examples: ['opl stages list'],
      group: 'domain',
      registry: stageRegistry('stages list', 'stages_list', []),
      handler: (args) => {
        assertRegisteredStageArgs('stages list', args, stageCommandSpecs);
        assertNoArgs(args, stageCommandSpecs['stages list']);
        return buildFamilyStagesList(getContracts(), { loadDomainManifests });
      },
    },
    'stages inspect': {
      usage: 'opl stages inspect --domain <domain> --stage <stage_id>',
      summary: 'Inspect one domain-owned family stage descriptor and its authority boundary.',
      examples: ['opl stages inspect --domain medautoscience --stage manuscript_authoring'],
      group: 'domain',
      registry: stageRegistry('stages inspect', 'stages_inspect', [
        DOMAIN_OPTION,
        {
          name: 'stage',
          flag: '--stage',
          value_kind: 'string',
          summary: 'Stage identifier to inspect.',
          required: true,
        },
      ]),
      handler: (args) => {
        assertRegisteredStageArgs('stages inspect', args, stageCommandSpecs);
        return buildFamilyStageInspect(getContracts(), args, { loadDomainManifests });
      },
    },
    'stages readiness': {
      usage: 'opl stages readiness (--family-defaults | --domain <domain>) [--detail summary|full]',
      summary: 'Summarize the default operator/App launch-readiness view from admission, proof, assumptions, cohort, replay, and advisory budget/validity refs without issuing a domain verdict.',
      examples: ['opl stages readiness --family-defaults', 'opl stages readiness --domain mas'],
      group: 'domain',
      registry: stageRegistry('stages readiness', 'stages_readiness', [
        { ...DOMAIN_OPTION, required: false },
        {
          name: 'family-defaults',
          flag: '--family-defaults',
          value_kind: 'boolean',
          summary: 'Summarize the family-default stage readiness projection.',
        },
        {
          name: 'detail',
          flag: '--detail',
          value_kind: 'string',
          summary: 'Detail level: summary or full.',
        },
      ]),
      handler: (args) => {
        assertRegisteredStageArgs('stages readiness', args, stageCommandSpecs);
        return buildFamilyStageReadinessInspect(getContracts(), args, { loadDomainManifests });
      },
    },
    'stages proof-bundle': {
      usage: 'opl stages proof-bundle --domain <domain>',
      summary: 'Diagnostic drilldown for proof-bundle obligations folded into stages readiness; not the default operator path.',
      examples: ['opl stages proof-bundle --domain mas'],
      group: 'domain',
      help_surface: 'diagnostic_drilldown',
      registry: stageRegistry('stages proof-bundle', 'stages_proof_bundle', [DOMAIN_OPTION]),
      handler: (args) => {
        assertRegisteredStageArgs('stages proof-bundle', args, stageCommandSpecs);
        return buildFamilyStageProofBundleInspect(getContracts(), args, { loadDomainManifests });
      },
    },
    'stages graph': {
      usage: 'opl stages graph --domain <domain>',
      summary: 'Diagnostic drilldown for one domain stage pack graph, including admission, edges, guarantee modes, and integrity digest; not the default operator path.',
      examples: ['opl stages graph --domain mas'],
      group: 'domain',
      help_surface: 'diagnostic_drilldown',
      registry: stageRegistry('stages graph', 'stages_graph', [DOMAIN_OPTION]),
      handler: (args) => {
        assertRegisteredStageArgs('stages graph', args, stageCommandSpecs);
        return buildFamilyStageGraphInspect(getContracts(), args, { loadDomainManifests });
      },
    },
    'stages assumptions': {
      usage: 'opl stages assumptions --domain <domain>',
      summary: 'Diagnostic drilldown for runtime assumption lifecycle refs folded into stages readiness; not the default operator path.',
      examples: ['opl stages assumptions --domain mas'],
      group: 'domain',
      help_surface: 'diagnostic_drilldown',
      registry: stageRegistry('stages assumptions', 'stages_assumptions', [DOMAIN_OPTION]),
      handler: (args) => {
        assertRegisteredStageArgs('stages assumptions', args, stageCommandSpecs);
        return buildFamilyStageAssumptionsInspect(getContracts(), args, { loadDomainManifests });
      },
    },
    'stages cohort-loop': {
      usage: 'opl stages cohort-loop --domain <domain>',
      summary: 'Diagnostic drilldown for cohort query, trigger, and monitor/metric refs folded into stages readiness; not the default operator path.',
      examples: ['opl stages cohort-loop --domain mas'],
      group: 'domain',
      help_surface: 'diagnostic_drilldown',
      registry: stageRegistry('stages cohort-loop', 'stages_cohort_loop', [DOMAIN_OPTION]),
      handler: (args) => {
        assertRegisteredStageArgs('stages cohort-loop', args, stageCommandSpecs);
        return buildFamilyStageCohortLoopInspect(getContracts(), args, { loadDomainManifests });
      },
    },
    'stages runtime-budget': {
      usage: 'opl stages runtime-budget --domain <domain>',
      summary: 'Diagnostic drilldown for refs-only runtime boundary and monitor coverage folded into stages readiness/proof; not a standalone domain-ready verdict.',
      examples: ['opl stages runtime-budget --domain mas'],
      group: 'domain',
      help_surface: 'diagnostic_drilldown',
      registry: stageRegistry('stages runtime-budget', 'stages_runtime_budget', [DOMAIN_OPTION]),
      handler: (args) => {
        assertRegisteredStageArgs('stages runtime-budget', args, stageCommandSpecs);
        return buildFamilyStageRuntimeBudgetInspect(getContracts(), args, { loadDomainManifests });
      },
    },
    'stages registry': {
      usage: 'opl stages registry --domain <domain> [--library-status <candidate|admitted|reused|deprecated|superseded>] [--promotion-ref <ref>] [--deprecation-ref <ref>] [--supersession-ref <ref>] [--superseded-by-stage-pack-ref <ref>] [--reused-by-ref <ref>] [--previous-stage-pack-hash <hash>] [--migration-policy <continue_old_hash|migrate_to_new_hash|blocked_human_gate>] [--migration-policy-ref <ref>]',
      summary: 'Diagnostic drilldown for reusable stage-pack registry lifecycle, integrity hash, and migration blockers; not the default operator path.',
      examples: ['opl stages registry --domain mas --library-status deprecated --deprecation-ref human_gate:mas-pack-retire'],
      group: 'domain',
      help_surface: 'diagnostic_drilldown',
      registry: stageRegistry('stages registry', 'stages_registry', [
        DOMAIN_OPTION,
        ...STAGE_PACK_OPTIONS,
        REUSED_BY_OPTION,
        {
          name: 'attempt-id',
          flag: '--attempt-id',
          value_kind: 'string',
          summary: 'Stage attempt identifier for registry projection binding.',
        },
        {
          name: 'attempt-stage-pack-hash',
          flag: '--attempt-stage-pack-hash',
          value_kind: 'string',
          summary: 'Stage-pack hash for attempt projection binding.',
        },
        {
          name: 'attempt-stage',
          flag: '--attempt-stage',
          value_kind: 'string',
          summary: 'Stage id for attempt projection binding.',
        },
        {
          name: 'attempt-created-at-ref',
          flag: '--attempt-created-at-ref',
          value_kind: 'string',
          summary: 'Creation ref for attempt projection binding.',
        },
      ]),
      handler: (args) => {
        assertRegisteredStageArgs('stages registry', args, stageCommandSpecs);
        return buildFamilyStagePackRegistryInspect(getContracts(), args, { loadDomainManifests });
      },
    },
    'stages source-spec': {
      usage: 'opl stages source-spec --domain <domain> [--library-status <candidate|admitted|reused|deprecated|superseded>] [--promotion-ref <ref>] [--deprecation-ref <ref>] [--supersession-ref <ref>] [--superseded-by-stage-pack-ref <ref>] [--reused-by-ref <ref>] [--append-only-event-log-ref <ref>] [--attempt-ledger-ref <ref>] [--recorded-runtime-event-ref <ref>] [--closeout-receipt-ref <ref>]',
      summary: 'Diagnostic drilldown for a body-free stage-pack source/spec bundle from control-plane, proof, graph, registry, replay, assumption, and cohort refs; not the default operator path.',
      examples: ['opl stages source-spec --domain mas --recorded-runtime-event-ref runtime_event:mas.stage_1'],
      group: 'domain',
      help_surface: 'diagnostic_drilldown',
      registry: stageRegistry('stages source-spec', 'stages_source_spec', [
        DOMAIN_OPTION,
        ...STAGE_PACK_OPTIONS,
        REUSED_BY_OPTION,
        ...REF_OPTIONS,
      ]),
      handler: (args) => {
        assertRegisteredStageArgs('stages source-spec', args, stageCommandSpecs);
        return buildFamilyStagePackSourceSpecInspect(getContracts(), args, { loadDomainManifests });
      },
    },
    'stages replay-certification': {
      usage: 'opl stages replay-certification --domain <domain> [--append-only-event-log-ref <ref>] [--attempt-ledger-ref <ref>] [--recorded-runtime-event-ref <ref>] [--closeout-receipt-ref <ref>]',
      summary: 'Diagnostic drilldown for replay readiness from proof-bundle obligations and recorded append-only event / receipt refs.',
      examples: ['opl stages replay-certification --domain mas --append-only-event-log-ref opl://events/mas --attempt-ledger-ref opl://attempts/mas'],
      group: 'domain',
      help_surface: 'diagnostic_drilldown',
      registry: stageRegistry('stages replay-certification', 'stages_replay_certification', [
        DOMAIN_OPTION,
        ...REF_OPTIONS,
      ]),
      handler: (args) => {
        assertRegisteredStageArgs('stages replay-certification', args, stageCommandSpecs);
        return buildFamilyStageReplayCertificationInspect(getContracts(), args, { loadDomainManifests });
      },
    },
  };

  return stageCommandSpecs;
}

export function validateStageDerivedLensCommandSpecs(
  commandSpecs: Record<string, CommandSpec>,
) {
  const registeredDerivedLensCommands = new Set(familyStageDiagnosticLensCommands());
  for (const [command, spec] of Object.entries(commandSpecs)) {
    if (
      command.startsWith('stages ')
      && spec.help_surface === 'diagnostic_drilldown'
      && registeredDerivedLensCommands.has(command)
    ) {
      requireFamilyStageDerivedLens(command);
    }
  }
}

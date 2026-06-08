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
} from '../../../family-stage-control-plane.ts';
import {
  familyStageDiagnosticLensCommands,
  requireFamilyStageDerivedLens,
} from '../../../family-stage-derived-lenses.ts';
import type { FrameworkContracts } from '../../../types.ts';
import { assertNoArgs } from '../../modules/support.ts';
import type { CommandSpec } from '../../modules/support.ts';

export function buildStageCommandSpecs(
  getContracts: () => FrameworkContracts,
): Record<string, CommandSpec> {
  const stageCommandSpecs: Record<string, CommandSpec> = {
    'stages list': {
      usage: 'opl stages list',
      summary: 'List family stage control-plane descriptors resolved from bound domain-owned manifests.',
      examples: ['opl stages list'],
      group: 'domain',
      handler: (args) => {
        assertNoArgs(args, stageCommandSpecs['stages list']);
        return buildFamilyStagesList(getContracts());
      },
    },
    'stages inspect': {
      usage: 'opl stages inspect --domain <domain> --stage <stage_id>',
      summary: 'Inspect one domain-owned family stage descriptor and its authority boundary.',
      examples: ['opl stages inspect --domain medautoscience --stage manuscript_authoring'],
      group: 'domain',
      handler: (args) => buildFamilyStageInspect(getContracts(), args),
    },
    'stages readiness': {
      usage: 'opl stages readiness (--family-defaults | --domain <domain>) [--detail summary|full]',
      summary: 'Summarize the default operator/App launch-readiness view from admission, proof, assumptions, cohort, replay, and advisory budget/validity refs without issuing a domain verdict.',
      examples: ['opl stages readiness --family-defaults', 'opl stages readiness --domain mas'],
      group: 'domain',
      handler: (args) => buildFamilyStageReadinessInspect(getContracts(), args),
    },
    'stages proof-bundle': {
      usage: 'opl stages proof-bundle --domain <domain>',
      summary: 'Diagnostic drilldown for proof-bundle obligations folded into stages readiness; not the default operator path.',
      examples: ['opl stages proof-bundle --domain mas'],
      group: 'domain',
      help_surface: 'diagnostic_drilldown',
      handler: (args) => buildFamilyStageProofBundleInspect(getContracts(), args),
    },
    'stages graph': {
      usage: 'opl stages graph --domain <domain>',
      summary: 'Diagnostic drilldown for one domain stage pack graph, including admission, edges, guarantee modes, and integrity digest; not the default operator path.',
      examples: ['opl stages graph --domain mas'],
      group: 'domain',
      help_surface: 'diagnostic_drilldown',
      handler: (args) => buildFamilyStageGraphInspect(getContracts(), args),
    },
    'stages assumptions': {
      usage: 'opl stages assumptions --domain <domain>',
      summary: 'Diagnostic drilldown for runtime assumption lifecycle refs folded into stages readiness; not the default operator path.',
      examples: ['opl stages assumptions --domain mas'],
      group: 'domain',
      help_surface: 'diagnostic_drilldown',
      handler: (args) => buildFamilyStageAssumptionsInspect(getContracts(), args),
    },
    'stages cohort-loop': {
      usage: 'opl stages cohort-loop --domain <domain>',
      summary: 'Diagnostic drilldown for cohort query, trigger, and monitor/metric refs folded into stages readiness; not the default operator path.',
      examples: ['opl stages cohort-loop --domain mas'],
      group: 'domain',
      help_surface: 'diagnostic_drilldown',
      handler: (args) => buildFamilyStageCohortLoopInspect(getContracts(), args),
    },
    'stages runtime-budget': {
      usage: 'opl stages runtime-budget --domain <domain>',
      summary: 'Diagnostic drilldown for refs-only runtime boundary and monitor coverage folded into stages readiness/proof; not a standalone domain-ready verdict.',
      examples: ['opl stages runtime-budget --domain mas'],
      group: 'domain',
      help_surface: 'diagnostic_drilldown',
      handler: (args) => buildFamilyStageRuntimeBudgetInspect(getContracts(), args),
    },
    'stages registry': {
      usage: 'opl stages registry --domain <domain> [--library-status <candidate|admitted|reused|deprecated|superseded>] [--promotion-ref <ref>] [--deprecation-ref <ref>] [--supersession-ref <ref>] [--superseded-by-stage-pack-ref <ref>] [--reused-by-ref <ref>] [--previous-stage-pack-hash <hash>] [--migration-policy <continue_old_hash|migrate_to_new_hash|blocked_human_gate>] [--migration-policy-ref <ref>]',
      summary: 'Diagnostic drilldown for reusable stage-pack registry lifecycle, integrity hash, and migration blockers; not the default operator path.',
      examples: ['opl stages registry --domain mas --library-status deprecated --deprecation-ref human_gate:mas-pack-retire'],
      group: 'domain',
      help_surface: 'diagnostic_drilldown',
      handler: (args) => buildFamilyStagePackRegistryInspect(getContracts(), args),
    },
    'stages source-spec': {
      usage: 'opl stages source-spec --domain <domain> [--library-status <candidate|admitted|reused|deprecated|superseded>] [--promotion-ref <ref>] [--deprecation-ref <ref>] [--supersession-ref <ref>] [--superseded-by-stage-pack-ref <ref>] [--reused-by-ref <ref>] [--append-only-event-log-ref <ref>] [--attempt-ledger-ref <ref>] [--recorded-runtime-event-ref <ref>] [--closeout-receipt-ref <ref>]',
      summary: 'Diagnostic drilldown for a body-free stage-pack source/spec bundle from control-plane, proof, graph, registry, replay, assumption, and cohort refs; not the default operator path.',
      examples: ['opl stages source-spec --domain mas --recorded-runtime-event-ref runtime_event:mas.stage_1'],
      group: 'domain',
      help_surface: 'diagnostic_drilldown',
      handler: (args) => buildFamilyStagePackSourceSpecInspect(getContracts(), args),
    },
    'stages replay-certification': {
      usage: 'opl stages replay-certification --domain <domain> [--append-only-event-log-ref <ref>] [--attempt-ledger-ref <ref>] [--recorded-runtime-event-ref <ref>] [--closeout-receipt-ref <ref>]',
      summary: 'Diagnostic drilldown for replay readiness from proof-bundle obligations and recorded append-only event / receipt refs.',
      examples: ['opl stages replay-certification --domain mas --append-only-event-log-ref opl://events/mas --attempt-ledger-ref opl://attempts/mas'],
      group: 'domain',
      help_surface: 'diagnostic_drilldown',
      handler: (args) => buildFamilyStageReplayCertificationInspect(getContracts(), args),
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

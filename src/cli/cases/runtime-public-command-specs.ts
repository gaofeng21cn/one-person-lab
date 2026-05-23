import { cloneCommandSpec } from '../modules/support.ts';
import type { CommandSpec } from '../modules/support.ts';
import {
  buildPublicRuntimeDeveloperModeCloseoutCommandSpecs,
} from './runtime-developer-mode-closeout-public-command-specs.ts';

export function buildPublicRuntimeCommandSpecs(
  commandSpecs: Record<string, CommandSpec>,
): Record<string, CommandSpec> {
  const developerModeCloseoutCommandSpecs =
    buildPublicRuntimeDeveloperModeCloseoutCommandSpecs(commandSpecs);

  return {
    'runtime manager': cloneCommandSpec(commandSpecs['runtime manager'], {
      usage: 'opl runtime manager',
      examples: ['opl runtime manager'],
      group: 'runtime',
    }),
    'runtime manager action': cloneCommandSpec(commandSpecs['runtime manager action'], {
      usage: 'opl runtime manager action (--dry-run|--apply)',
      examples: ['opl runtime manager action --dry-run', 'opl runtime manager action --apply'],
      group: 'runtime',
    }),
    'runtime snapshot': cloneCommandSpec(commandSpecs['runtime snapshot'], {
      usage: 'opl runtime snapshot',
      examples: ['opl runtime snapshot', 'opl runtime snapshot --json'],
      group: 'runtime',
    }),
    'runtime app-operator-drilldown': cloneCommandSpec(commandSpecs['runtime app-operator-drilldown'], {
      usage: 'opl runtime app-operator-drilldown [--detail summary|full] [--full]',
      examples: [
        'opl runtime app-operator-drilldown',
        'opl runtime app-operator-drilldown --json',
        'opl runtime app-operator-drilldown --detail full --json',
      ],
      group: 'runtime',
    }),
    'runtime app-release-evidence record':
      cloneCommandSpec(commandSpecs['runtime app-release-evidence record'], {
        usage: 'opl runtime app-release-evidence record --payload <json>',
        examples: [
          'opl runtime app-release-evidence record --payload \'{"release_package_refs":["release:pkg"],"screenshot_refs":["screenshot:first-run"]}\'',
        ],
        group: 'runtime',
      }),
    'runtime app-release-evidence verify':
      cloneCommandSpec(commandSpecs['runtime app-release-evidence verify'], {
        usage: 'opl runtime app-release-evidence verify [--receipt-ref <ref>]',
        examples: [
          'opl runtime app-release-evidence verify --receipt-ref opl://app-release-user-path-evidence/release%3Apkg',
        ],
        group: 'runtime',
      }),
    'runtime app-release-evidence list':
      cloneCommandSpec(commandSpecs['runtime app-release-evidence list'], {
        usage: 'opl runtime app-release-evidence list',
        examples: ['opl runtime app-release-evidence list --json'],
        group: 'runtime',
      }),
    ...developerModeCloseoutCommandSpecs,
    'runtime oma-app-live-path record':
      cloneCommandSpec(commandSpecs['runtime oma-app-live-path record'], {
        usage: 'opl runtime oma-app-live-path record --payload <json>',
        examples: [
          'opl runtime oma-app-live-path record --payload \'{"app_live_path_refs":["app:oma-live"],"operator_evidence_refs":["screenshot:oma-live"]}\'',
        ],
        group: 'runtime',
      }),
    'runtime oma-app-live-path list':
      cloneCommandSpec(commandSpecs['runtime oma-app-live-path list'], {
        usage: 'opl runtime oma-app-live-path list',
        examples: ['opl runtime oma-app-live-path list --json'],
        group: 'runtime',
      }),
    'runtime oma-production-consumption record':
      cloneCommandSpec(commandSpecs['runtime oma-production-consumption record'], {
        usage: 'opl runtime oma-production-consumption record --payload <json>',
        examples: [
          'opl runtime oma-production-consumption record --payload \'{"long_soak_refs":["long-soak:oma"],"operator_evidence_refs":["monitor:oma"]}\'',
        ],
        group: 'runtime',
      }),
    'runtime oma-production-consumption list':
      cloneCommandSpec(commandSpecs['runtime oma-production-consumption list'], {
        usage: 'opl runtime oma-production-consumption list',
        examples: ['opl runtime oma-production-consumption list --json'],
        group: 'runtime',
      }),
    'runtime action execute': cloneCommandSpec(commandSpecs['runtime action execute'], {
      usage: 'opl runtime action execute --action <action_id> [--payload <json>] [--dry-run] [--approve-domain-action]',
      examples: [
        'opl runtime action execute --action action:sat_demo:attempt-query',
        'opl runtime action execute --action action:sat_demo:domain-repair-command:0 --dry-run',
      ],
      group: 'runtime',
    }),
    'runtime lifecycle apply': cloneCommandSpec(commandSpecs['runtime lifecycle apply'], {
      usage: 'opl runtime lifecycle apply --mode dry-run|apply|verify --domain <domain_id> [--action <json>] [--receipt-ref <ref>]',
      examples: [
        'opl runtime lifecycle apply --mode dry-run --domain medautogrant --action \'{"action_id":"mark-tombstone","owner_scope":"opl_owned_tombstone_ref","target_ref":"opl://history/tombstone"}\'',
        'opl runtime lifecycle apply --mode verify --domain medautogrant',
      ],
      group: 'runtime',
    }),
    'runtime lifecycle reconcile': cloneCommandSpec(commandSpecs['runtime lifecycle reconcile'], {
      usage: 'opl runtime lifecycle reconcile [--domain <domain_id>] [--expected-source-ref <ref>] [--expected-receipt-ref <ref>] [--expected-restore-proof-ref <ref>] [--expected-domain-artifact-mutation-receipt-ref <ref>] [--max-age-ms <n>]',
      examples: [
        'opl runtime lifecycle reconcile --domain medautogrant --expected-source-ref mag://package/run-1',
        'opl runtime lifecycle reconcile --domain medautogrant --expected-restore-proof-ref restore-proof:mag-package',
      ],
      group: 'runtime',
    }),
    'runtime observability-export': cloneCommandSpec(commandSpecs['runtime observability-export'], {
      usage: 'opl runtime observability-export [--format json|openmetrics]',
      examples: [
        'opl runtime observability-export',
        'opl runtime observability-export --format openmetrics',
      ],
      group: 'runtime',
    }),
    'runtime index': cloneCommandSpec(commandSpecs['runtime index'], {
      usage: 'opl runtime index',
      examples: ['opl runtime index'],
      group: 'runtime',
    }),
  };
}

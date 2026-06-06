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
        usage: 'opl runtime app-release-evidence record (--payload <json>|--payload-file <path>)',
        examples: [
          'opl runtime app-release-evidence record --payload \'{"release_package_refs":["release:pkg"],"screenshot_refs":["screenshot:first-run"]}\'',
          'opl runtime app-release-evidence record --payload-file payload.json',
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
    'runtime app-release-evidence long-operator start':
      cloneCommandSpec(commandSpecs['runtime app-release-evidence long-operator start'], {
        usage:
          'opl runtime app-release-evidence long-operator start --cohort <version> --minimum-duration-minutes <n> --evidence-dir <path>',
        examples: [
          'opl runtime app-release-evidence long-operator start --cohort 26.5.19 --minimum-duration-minutes 240 --evidence-dir /tmp/opl-app-long-operator',
        ],
        group: 'runtime',
      }),
    'runtime app-release-evidence long-operator event':
      cloneCommandSpec(commandSpecs['runtime app-release-evidence long-operator event'], {
        usage:
          'opl runtime app-release-evidence long-operator event --workorder-file <path> --event-kind <kind> [--observed-at <iso>] [--evidence-ref <ref>]',
        examples: [
          'opl runtime app-release-evidence long-operator event --workorder-file /tmp/opl-app-long-operator/app-release-long-operator-workorder.json --event-kind app_window_reopened_or_kept_live --evidence-ref screenshot:app/live',
        ],
        group: 'runtime',
      }),
    'runtime app-release-evidence long-operator finish':
      cloneCommandSpec(commandSpecs['runtime app-release-evidence long-operator finish'], {
        usage:
          'opl runtime app-release-evidence long-operator finish --workorder-file <path> [--finished-at <iso>]',
        examples: [
          'opl runtime app-release-evidence long-operator finish --workorder-file /tmp/opl-app-long-operator/app-release-long-operator-workorder.json',
        ],
        group: 'runtime',
      }),
    'runtime codex-app-runtime-evidence record':
      cloneCommandSpec(commandSpecs['runtime codex-app-runtime-evidence record'], {
        usage:
          'opl runtime codex-app-runtime-evidence record (--payload <json>|--payload-file <path>)',
        examples: [
          'opl runtime codex-app-runtime-evidence record --payload \'{"temporal_hosted_long_soak_refs":["temporal:soak"],"provider_state_linkage_refs":["provider:slo"]}\'',
          'opl runtime codex-app-runtime-evidence record --payload-file payload.json',
        ],
        group: 'runtime',
      }),
    'runtime codex-app-runtime-evidence verify':
      cloneCommandSpec(commandSpecs['runtime codex-app-runtime-evidence verify'], {
        usage: 'opl runtime codex-app-runtime-evidence verify [--receipt-ref <ref>]',
        examples: [
          'opl runtime codex-app-runtime-evidence verify --receipt-ref opl://codex-app-runtime-evidence/temporal%3Asoak',
        ],
        group: 'runtime',
      }),
    'runtime codex-app-runtime-evidence list':
      cloneCommandSpec(commandSpecs['runtime codex-app-runtime-evidence list'], {
        usage: 'opl runtime codex-app-runtime-evidence list',
        examples: ['opl runtime codex-app-runtime-evidence list --json'],
        group: 'runtime',
      }),
    'runtime codex-app-runtime-evidence long-soak start':
      cloneCommandSpec(commandSpecs['runtime codex-app-runtime-evidence long-soak start'], {
        usage:
          'opl runtime codex-app-runtime-evidence long-soak start --minimum-duration-minutes <n> --evidence-dir <path>',
        examples: [
          'opl runtime codex-app-runtime-evidence long-soak start --minimum-duration-minutes 240 --evidence-dir /tmp/opl-codex-app-runtime-long-soak',
        ],
        group: 'runtime',
      }),
    'runtime codex-app-runtime-evidence long-soak event':
      cloneCommandSpec(commandSpecs['runtime codex-app-runtime-evidence long-soak event'], {
        usage:
          'opl runtime codex-app-runtime-evidence long-soak event --workorder-file <path> --event-kind <kind> [--observed-at <iso>] [--evidence-ref <ref>]',
        examples: [
          'opl runtime codex-app-runtime-evidence long-soak event --workorder-file /tmp/opl-codex-app-runtime-long-soak/codex-app-runtime-long-soak-workorder.json --event-kind provider_state_linkage_checked --evidence-ref provider-state:temporal/cadence-current',
        ],
        group: 'runtime',
      }),
    'runtime codex-app-runtime-evidence long-soak finish':
      cloneCommandSpec(commandSpecs['runtime codex-app-runtime-evidence long-soak finish'], {
        usage:
          'opl runtime codex-app-runtime-evidence long-soak finish --workorder-file <path> [--finished-at <iso>]',
        examples: [
          'opl runtime codex-app-runtime-evidence long-soak finish --workorder-file /tmp/opl-codex-app-runtime-long-soak/codex-app-runtime-long-soak-workorder.json',
        ],
        group: 'runtime',
      }),
    'runtime standard-agent-template-consumption record':
      cloneCommandSpec(commandSpecs['runtime standard-agent-template-consumption record'], {
        usage:
          'opl runtime standard-agent-template-consumption record (--payload <json>|--payload-file <path>)',
        examples: [
          'opl runtime standard-agent-template-consumption record --payload \'{"cohort_evidence_ref":"opl://standard-agent-template-consumption/cohort/demo","cohort_evidence_fingerprint":"sha256:demo","evidence_ref":"opl://standard-agent-template-consumption/award-foundry/demo","evidence_fingerprint":"sha256:demo"}\'',
          'opl runtime standard-agent-template-consumption record --payload-file payload.json',
        ],
        group: 'runtime',
      }),
    'runtime standard-agent-template-consumption verify':
      cloneCommandSpec(commandSpecs['runtime standard-agent-template-consumption verify'], {
        usage: 'opl runtime standard-agent-template-consumption verify [--receipt-ref <ref>]',
        examples: [
          'opl runtime standard-agent-template-consumption verify --receipt-ref opl://standard-agent-template-consumption-ledger/demo',
        ],
        group: 'runtime',
      }),
    'runtime standard-agent-template-consumption list':
      cloneCommandSpec(commandSpecs['runtime standard-agent-template-consumption list'], {
        usage: 'opl runtime standard-agent-template-consumption list',
        examples: ['opl runtime standard-agent-template-consumption list --json'],
        group: 'runtime',
      }),
    'runtime domain-owner-payload-summary record':
      cloneCommandSpec(commandSpecs['runtime domain-owner-payload-summary record'], {
        usage:
          'opl runtime domain-owner-payload-summary record --target-identity <json> (--payload <json>|--payload-file <path>)',
        examples: [
          'opl runtime domain-owner-payload-summary record --target-identity \'{"domain_id":"redcube","summary_kind":"owner_payload_item","item_id":"owner_chain_apply"}\' --payload \'{"owner_chain_refs":["rca:owner-chain"]}\'',
        ],
        group: 'runtime',
      }),
    'runtime domain-owner-payload-summary verify':
      cloneCommandSpec(commandSpecs['runtime domain-owner-payload-summary verify'], {
        usage: 'opl runtime domain-owner-payload-summary verify [--receipt-ref <ref>]',
        examples: [
          'opl runtime domain-owner-payload-summary verify --receipt-ref opl://domain-owner-payload-summary/redcube%2Fowner_payload_item%2Fowner_chain_apply',
        ],
        group: 'runtime',
      }),
    'runtime domain-owner-payload-summary list':
      cloneCommandSpec(commandSpecs['runtime domain-owner-payload-summary list'], {
        usage: 'opl runtime domain-owner-payload-summary list',
        examples: ['opl runtime domain-owner-payload-summary list --json'],
        group: 'runtime',
      }),
    'runtime mag-manifest-sustained-consumption record':
      cloneCommandSpec(commandSpecs['runtime mag-manifest-sustained-consumption record'], {
        usage:
          'opl runtime mag-manifest-sustained-consumption record --target-identity <json> (--payload <json>|--payload-file <path>)',
        examples: [
          'opl runtime mag-manifest-sustained-consumption record --target-identity \'{"domain_id":"medautogrant"}\' --payload \'{"typed_blocker_refs":["typed-blocker:app/operator/mag/open"]}\'',
        ],
        group: 'runtime',
      }),
    'runtime mag-manifest-sustained-consumption verify':
      cloneCommandSpec(commandSpecs['runtime mag-manifest-sustained-consumption verify'], {
        usage: 'opl runtime mag-manifest-sustained-consumption verify [--receipt-ref <ref>]',
        examples: [
          'opl runtime mag-manifest-sustained-consumption verify --receipt-ref opl://mag-manifest-sustained-consumption/medautogrant',
        ],
        group: 'runtime',
      }),
    'runtime mag-manifest-sustained-consumption list':
      cloneCommandSpec(commandSpecs['runtime mag-manifest-sustained-consumption list'], {
        usage: 'opl runtime mag-manifest-sustained-consumption list',
        examples: ['opl runtime mag-manifest-sustained-consumption list --json'],
        group: 'runtime',
      }),
    'runtime stage-replay-missing-receipt record':
      cloneCommandSpec(commandSpecs['runtime stage-replay-missing-receipt record'], {
        usage:
          'opl runtime stage-replay-missing-receipt record --target-identity <json> (--payload <json>|--payload-file <path>)',
        examples: [
          'opl runtime stage-replay-missing-receipt record --target-identity \'{"domain_id":"redcube_ai","stage_id":"visual_direction","missing_ref":"human_gate:redcube_operator_review_gate"}\' --payload \'{"typed_blocker_refs":["typed-blocker:rca/operator-review-pending"]}\'',
        ],
        group: 'runtime',
      }),
    'runtime stage-replay-missing-receipt verify':
      cloneCommandSpec(commandSpecs['runtime stage-replay-missing-receipt verify'], {
        usage: 'opl runtime stage-replay-missing-receipt verify [--receipt-ref <ref>]',
        examples: [
          'opl runtime stage-replay-missing-receipt verify --receipt-ref opl://stage-replay-missing-receipt/redcube_ai%2Fvisual_direction%2Fhuman_gate%3Aredcube_operator_review_gate',
        ],
        group: 'runtime',
      }),
    'runtime stage-replay-missing-receipt list':
      cloneCommandSpec(commandSpecs['runtime stage-replay-missing-receipt list'], {
        usage: 'opl runtime stage-replay-missing-receipt list',
        examples: ['opl runtime stage-replay-missing-receipt list --json'],
        group: 'runtime',
      }),
    'runtime stage-run-authorization record':
      cloneCommandSpec(commandSpecs['runtime stage-run-authorization record'], {
        usage: 'opl runtime stage-run-authorization record (--payload <json>|--payload-file <path>)',
        examples: [
          'opl runtime stage-run-authorization record --payload-file stage-run-authorization.json',
        ],
        group: 'runtime',
      }),
    'runtime stage-run-authorization verify':
      cloneCommandSpec(commandSpecs['runtime stage-run-authorization verify'], {
        usage: 'opl runtime stage-run-authorization verify [--receipt-ref <ref>]',
        examples: [
          'opl runtime stage-run-authorization verify --receipt-ref opl://stage-run-execution-authorization/stage-run/decision',
        ],
        group: 'runtime',
      }),
    'runtime stage-run-authorization list':
      cloneCommandSpec(commandSpecs['runtime stage-run-authorization list'], {
        usage: 'opl runtime stage-run-authorization list',
        examples: ['opl runtime stage-run-authorization list --json'],
        group: 'runtime',
      }),
    ...developerModeCloseoutCommandSpecs,
    'runtime oma-app-live-path record':
      cloneCommandSpec(commandSpecs['runtime oma-app-live-path record'], {
        usage: 'opl runtime oma-app-live-path record (--payload <json>|--payload-file <path>)',
        examples: [
          'opl runtime oma-app-live-path record --payload \'{"app_live_path_refs":["app:oma-live"],"operator_evidence_refs":["screenshot:oma-live"]}\'',
          'opl runtime oma-app-live-path record --payload-file payload.json',
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
        usage: 'opl runtime oma-production-consumption record (--payload <json>|--payload-file <path>)',
        examples: [
          'opl runtime oma-production-consumption record --payload \'{"long_soak_refs":["long-soak:oma"],"operator_evidence_refs":["monitor:oma"]}\'',
          'opl runtime oma-production-consumption record --payload-file payload.json',
        ],
        group: 'runtime',
      }),
    'runtime oma-production-consumption list':
      cloneCommandSpec(commandSpecs['runtime oma-production-consumption list'], {
        usage: 'opl runtime oma-production-consumption list',
        examples: ['opl runtime oma-production-consumption list --json'],
        group: 'runtime',
      }),
    'runtime oma-production-consumption verify':
      cloneCommandSpec(commandSpecs['runtime oma-production-consumption verify'], {
        usage: 'opl runtime oma-production-consumption verify [--receipt-ref <ref>]',
        examples: [
          'opl runtime oma-production-consumption verify --receipt-ref opl://oma-production-consumption/long-soak%3Aoma',
        ],
        group: 'runtime',
      }),
    'runtime oma-production-consumption long-soak start':
      cloneCommandSpec(commandSpecs['runtime oma-production-consumption long-soak start'], {
        usage:
          'opl runtime oma-production-consumption long-soak start --minimum-duration-minutes <n> --evidence-dir <path>',
        examples: [
          'opl runtime oma-production-consumption long-soak start --minimum-duration-minutes 240 --evidence-dir /tmp/opl-oma-long-soak',
        ],
        group: 'runtime',
      }),
    'runtime oma-production-consumption long-soak event':
      cloneCommandSpec(commandSpecs['runtime oma-production-consumption long-soak event'], {
        usage:
          'opl runtime oma-production-consumption long-soak event --workorder-file <path> --event-kind <kind> [--observed-at <iso>] [--evidence-ref <ref>]',
        examples: [
          'opl runtime oma-production-consumption long-soak event --workorder-file /tmp/opl-oma-long-soak/oma-long-soak-workorder.json --event-kind app_live_path_reexercised_or_confirmed_live --evidence-ref app:oma/live',
        ],
        group: 'runtime',
      }),
    'runtime oma-production-consumption long-soak finish':
      cloneCommandSpec(commandSpecs['runtime oma-production-consumption long-soak finish'], {
        usage:
          'opl runtime oma-production-consumption long-soak finish --workorder-file <path> [--finished-at <iso>]',
        examples: [
          'opl runtime oma-production-consumption long-soak finish --workorder-file /tmp/opl-oma-long-soak/oma-long-soak-workorder.json',
        ],
        group: 'runtime',
      }),
    'runtime action execute': cloneCommandSpec(commandSpecs['runtime action execute'], {
      usage: 'opl runtime action execute --action <action_id> [--payload <json>|--payload-file <path>] [--dry-run] [--approve-domain-action]',
      examples: [
        'opl runtime action execute --action action:sat_demo:attempt-query',
        'opl runtime action execute --action action:sat_demo:domain-repair-command:0 --dry-run',
      ],
      group: 'runtime',
    }),
    'runtime lifecycle apply': cloneCommandSpec(commandSpecs['runtime lifecycle apply'], {
      usage: 'opl runtime lifecycle apply --mode dry-run|apply|verify --domain <domain_id> [--action <json>|--handoff <json>] [--receipt-ref <ref>]',
      examples: [
        'opl runtime lifecycle apply --mode dry-run --domain medautogrant --action \'{"action_id":"mark-tombstone","owner_scope":"opl_owned_tombstone_ref","target_ref":"opl://history/tombstone"}\'',
        'opl runtime lifecycle apply --mode dry-run --domain medautoscience --handoff-file mas-physical-thinning-handoff.json',
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
    'runtime research-evidence-pack summary':
      cloneCommandSpec(commandSpecs['runtime research-evidence-pack summary'], {
        usage:
          'opl runtime research-evidence-pack summary (--payload <json>|--payload-file <path>)',
        examples: [
          'opl runtime research-evidence-pack summary --payload-file research-evidence-pack.json',
        ],
        group: 'runtime',
      }),
    'runtime research-hypothesis-portfolio summary':
      cloneCommandSpec(commandSpecs['runtime research-hypothesis-portfolio summary'], {
        usage:
          'opl runtime research-hypothesis-portfolio summary (--payload <json>|--payload-file <path>)',
        examples: [
          'opl runtime research-hypothesis-portfolio summary --payload-file research-hypothesis-portfolio.json',
        ],
        group: 'runtime',
      }),
  };
}

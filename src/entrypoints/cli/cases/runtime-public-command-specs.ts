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
    env:
      cloneCommandSpec(commandSpecs.env, {
        usage: 'opl env <doctor|prepare|run>',
        examples: [
          'opl env doctor --json',
          'opl env prepare --domain mas --profile display --platform macos-arm64 --requirement-profile renderer_dependency_profile.json --artifact-root artifacts --apply --json',
          'opl env run --domain mas --profile display --artifact-root artifacts -- Rscript render.R',
        ],
        group: 'env',
      }),
    'env doctor':
      cloneCommandSpec(commandSpecs['env doctor'], {
        usage: 'opl env doctor',
        examples: ['opl env doctor --json'],
        group: 'env',
      }),
    'env prepare':
      cloneCommandSpec(commandSpecs['env prepare'], {
        usage:
          'opl env prepare --domain <domain> --profile <profile> --platform <platform> --requirement-profile <path> [--requirement-profile-id <id>] --artifact-root <path> [--apply]',
        examples: [
          'opl env prepare --domain mas --profile display --platform macos-arm64 --requirement-profile renderer_dependency_profile.json --artifact-root artifacts --apply --json',
        ],
        group: 'env',
      }),
    'env run':
      cloneCommandSpec(commandSpecs['env run'], {
        usage: 'opl env run --domain <domain> --profile <profile> --artifact-root <path> -- <command...>',
        examples: [
          'opl env run --domain mas --profile display --artifact-root artifacts -- Rscript render.R',
        ],
        group: 'env',
      }),
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
    'runtime memory-artifact-lifecycle':
      cloneCommandSpec(commandSpecs['runtime memory-artifact-lifecycle'], {
        usage: 'opl runtime memory-artifact-lifecycle',
        examples: [
          'opl runtime memory-artifact-lifecycle',
          'opl runtime memory-artifact-lifecycle --json',
        ],
        group: 'runtime',
      }),
    'runtime memory-artifact-lifecycle-evidence':
      cloneCommandSpec(commandSpecs['runtime memory-artifact-lifecycle-evidence'], {
        usage: 'opl runtime memory-artifact-lifecycle-evidence <record|verify|list>',
        examples: [
          'opl runtime memory-artifact-lifecycle-evidence list --json',
          'opl help runtime memory-artifact-lifecycle-evidence record',
        ],
        group: 'runtime',
      }),
    'runtime memory-artifact-lifecycle-evidence record':
      cloneCommandSpec(commandSpecs['runtime memory-artifact-lifecycle-evidence record'], {
        usage:
          'opl runtime memory-artifact-lifecycle-evidence record (--payload <json>|--payload-file <path>)',
        examples: [
          'opl runtime memory-artifact-lifecycle-evidence record --payload \'{"memory_receipt_refs":["memory-receipt:domain/accepted"],"artifact_mutation_receipt_refs":["artifact-receipt:domain/package"]}\'',
          'opl runtime memory-artifact-lifecycle-evidence record --payload-file payload.json',
        ],
        group: 'runtime',
      }),
    'runtime memory-artifact-lifecycle-evidence verify':
      cloneCommandSpec(commandSpecs['runtime memory-artifact-lifecycle-evidence verify'], {
        usage: 'opl runtime memory-artifact-lifecycle-evidence verify [--receipt-ref <ref>]',
        examples: [
          'opl runtime memory-artifact-lifecycle-evidence verify --receipt-ref opl://memory-artifact-lifecycle-evidence/memory-receipt%3Adomain%2Faccepted',
        ],
        group: 'runtime',
      }),
    'runtime memory-artifact-lifecycle-evidence list':
      cloneCommandSpec(commandSpecs['runtime memory-artifact-lifecycle-evidence list'], {
        usage: 'opl runtime memory-artifact-lifecycle-evidence list',
        examples: ['opl runtime memory-artifact-lifecycle-evidence list --json'],
        group: 'runtime',
      }),
    'runtime env':
      cloneCommandSpec(commandSpecs['runtime env'], {
        usage:
          'opl runtime env <inspect|lock|build|prepare|materialize|verify|cache|doctor|run-context|contract>',
        examples: [
          'opl runtime env inspect --domain mas --profile analysis --platform macos-arm64 --json',
          'opl runtime env build --domain mas --profile analysis --platform macos-arm64 --json',
          'opl runtime env prepare --domain mas --profile display --platform macos-arm64 --requirement-profile renderer_dependency_profile.json --requirement-profile-id r_ggplot2_ggconsort_reporting_flow_v1 --artifact-root artifacts --apply --json',
          'opl runtime env cache status --json',
        ],
        group: 'runtime',
      }),
    'runtime env inspect':
      cloneCommandSpec(commandSpecs['runtime env inspect'], {
        usage:
          'opl runtime env inspect --domain <domain> --profile <profile> --platform <platform>',
        examples: [
          'opl runtime env inspect --domain mas --profile analysis --platform macos-arm64 --json',
        ],
        group: 'runtime',
      }),
    'runtime env lock':
      cloneCommandSpec(commandSpecs['runtime env lock'], {
        usage:
          'opl runtime env lock --domain <domain> --profile <profile> --platform <platform>',
        examples: [
          'opl runtime env lock --domain mas --profile analysis --platform macos-arm64 --json',
        ],
        group: 'runtime',
      }),
    'runtime env build':
      cloneCommandSpec(commandSpecs['runtime env build'], {
        usage:
          'opl runtime env build --domain <domain> --profile <profile> --platform <platform>',
        examples: [
          'opl runtime env build --domain mas --profile analysis --platform macos-arm64 --json',
        ],
        group: 'runtime',
      }),
    'runtime env prepare':
      cloneCommandSpec(commandSpecs['runtime env prepare'], {
        usage:
          'opl runtime env prepare --domain <domain> --profile <profile> --platform <platform> --requirement-profile <path> [--requirement-profile-id <id>] --artifact-root <path> [--apply]',
        examples: [
          'opl runtime env prepare --domain mas --profile display --platform macos-arm64 --requirement-profile renderer_dependency_profile.json --requirement-profile-id r_ggplot2_ggconsort_reporting_flow_v1 --artifact-root artifacts --apply --json',
        ],
        group: 'runtime',
      }),
    'runtime env materialize':
      cloneCommandSpec(commandSpecs['runtime env materialize'], {
        usage:
          'opl runtime env materialize --domain <domain> --profile <profile> --platform <platform> [--target current|rollback|staged] [--dry-run|--apply]',
        examples: [
          'opl runtime env materialize --domain mas --profile analysis --platform macos-arm64 --dry-run --json',
          'opl runtime env materialize --domain mas --profile analysis --platform macos-arm64 --apply --json',
        ],
        group: 'runtime',
      }),
    'runtime env verify':
      cloneCommandSpec(commandSpecs['runtime env verify'], {
        usage: 'opl runtime env verify --runtime-root <path>',
        examples: ['opl runtime env verify --runtime-root /path/to/opl/runtime-root --json'],
        group: 'runtime',
      }),
    'runtime env cache status':
      cloneCommandSpec(commandSpecs['runtime env cache status'], {
        usage: 'opl runtime env cache status',
        examples: ['opl runtime env cache status --json'],
        group: 'runtime',
      }),
    'runtime env cache inventory':
      cloneCommandSpec(commandSpecs['runtime env cache inventory'], {
        usage: 'opl runtime env cache inventory',
        examples: ['opl runtime env cache inventory --json'],
        group: 'runtime',
      }),
    'runtime env cache prune':
      cloneCommandSpec(commandSpecs['runtime env cache prune'], {
        usage: 'opl runtime env cache prune [--dry-run|--apply]',
        examples: [
          'opl runtime env cache prune --dry-run --json',
          'opl runtime env cache prune --apply --json',
        ],
        group: 'runtime',
      }),
    'runtime env doctor':
      cloneCommandSpec(commandSpecs['runtime env doctor'], {
        usage: 'opl runtime env doctor',
        examples: ['opl runtime env doctor --json'],
        group: 'runtime',
      }),
    'runtime env run-context':
      cloneCommandSpec(commandSpecs['runtime env run-context'], {
        usage: 'opl runtime env run-context --domain <domain> --profile <profile> [--artifact-root <path>]',
        examples: [
          'opl runtime env run-context --domain bookforge --profile publication_proof --json',
          'opl runtime env run-context --domain mas --profile display --artifact-root artifacts --json',
        ],
        group: 'runtime',
      }),
    'runtime env contract':
      cloneCommandSpec(commandSpecs['runtime env contract'], {
        usage: 'opl runtime env contract',
        examples: ['opl runtime env contract --json'],
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
    'runtime brand-module-l5-evidence record':
      cloneCommandSpec(commandSpecs['runtime brand-module-l5-evidence record'], {
        usage:
          'opl runtime brand-module-l5-evidence record (--payload <json>|--payload-file <path>)',
        examples: [
          'opl runtime brand-module-l5-evidence record --payload \'{"module_id":"runway","evidence_class_id":"long_soak_recovery","evidence_refs":["long-soak:runway/demo"]}\'',
          'opl runtime brand-module-l5-evidence record --payload-file payload.json',
        ],
        group: 'runtime',
      }),
    'runtime brand-module-l5-evidence verify':
      cloneCommandSpec(commandSpecs['runtime brand-module-l5-evidence verify'], {
        usage: 'opl runtime brand-module-l5-evidence verify [--receipt-ref <ref>]',
        examples: [
          'opl runtime brand-module-l5-evidence verify --receipt-ref opl://brand-module-l5-evidence/runway/long_soak_recovery/demo',
        ],
        group: 'runtime',
      }),
    'runtime brand-module-l5-evidence list':
      cloneCommandSpec(commandSpecs['runtime brand-module-l5-evidence list'], {
        usage:
          'opl runtime brand-module-l5-evidence list [--module <module_id>] [--class <evidence_class_id>]',
        examples: [
          'opl runtime brand-module-l5-evidence list --json',
          'opl runtime brand-module-l5-evidence list --module runway --class long_soak_recovery --json',
        ],
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
    'runtime provider-long-soak-evidence':
      cloneCommandSpec(commandSpecs['runtime provider-long-soak-evidence'], {
        usage: 'opl runtime provider-long-soak-evidence <record|verify|list>',
        examples: [
          'opl runtime provider-long-soak-evidence list --json',
          'opl help runtime provider-long-soak-evidence record',
        ],
        group: 'runtime',
      }),
    'runtime provider-long-soak-evidence record':
      cloneCommandSpec(commandSpecs['runtime provider-long-soak-evidence record'], {
        usage:
          'opl runtime provider-long-soak-evidence record (--payload <json>|--payload-file <path>)',
        examples: [
          'opl runtime provider-long-soak-evidence record --payload \'{"long_soak_refs":["provider-long-soak:temporal/window"],"provider_blocker_refs":["provider-blocker:temporal/capability-slo"],"owner_acceptance_refs":["owner-acceptance:provider/window"]}\'',
          'opl runtime provider-long-soak-evidence record --payload-file payload.json',
        ],
        group: 'runtime',
      }),
    'runtime provider-long-soak-evidence verify':
      cloneCommandSpec(commandSpecs['runtime provider-long-soak-evidence verify'], {
        usage: 'opl runtime provider-long-soak-evidence verify [--receipt-ref <ref>]',
        examples: [
          'opl runtime provider-long-soak-evidence verify --receipt-ref opl://provider-long-soak-evidence/provider-long-soak%3Atemporal%2Fwindow',
        ],
        group: 'runtime',
      }),
    'runtime provider-long-soak-evidence list':
      cloneCommandSpec(commandSpecs['runtime provider-long-soak-evidence list'], {
        usage: 'opl runtime provider-long-soak-evidence list',
        examples: ['opl runtime provider-long-soak-evidence list --json'],
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
    'runtime owner-evidence-sustained-consumption record':
      cloneCommandSpec(commandSpecs['runtime owner-evidence-sustained-consumption record'], {
        usage:
          'opl runtime owner-evidence-sustained-consumption record --target-identity <json> (--payload <json>|--payload-file <path>)',
        examples: [
          'opl runtime owner-evidence-sustained-consumption record --target-identity \'{"domain_id":"example-domain"}\' --payload \'{"typed_blocker_refs":["typed-blocker:owner-consumption/open"]}\'',
        ],
        group: 'runtime',
      }),
    'runtime owner-evidence-sustained-consumption verify':
      cloneCommandSpec(commandSpecs['runtime owner-evidence-sustained-consumption verify'], {
        usage: 'opl runtime owner-evidence-sustained-consumption verify [--receipt-ref <ref>]',
        examples: [
          'opl runtime owner-evidence-sustained-consumption verify --receipt-ref opl://owner-evidence/sustained-consumption/example-domain',
        ],
        group: 'runtime',
      }),
    'runtime owner-evidence-sustained-consumption list':
      cloneCommandSpec(commandSpecs['runtime owner-evidence-sustained-consumption list'], {
        usage: 'opl runtime owner-evidence-sustained-consumption list',
        examples: ['opl runtime owner-evidence-sustained-consumption list --json'],
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
        usage: 'opl runtime stage-run-authorization record (--payload <json>|--payload-file <path>) [--dry-run]',
        examples: [
          'opl runtime stage-run-authorization record --payload-file stage-run-authorization.json --dry-run --json',
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
    'runtime stage-transition-authority evaluate':
      cloneCommandSpec(commandSpecs['runtime stage-transition-authority evaluate'], {
        usage:
          'opl runtime stage-transition-authority evaluate (--payload <json>|--payload-file <path>)',
        examples: [
          'opl runtime stage-transition-authority evaluate --payload-file stage-transition-intent.json --json',
        ],
        group: 'runtime',
      }),
    'runtime stage-transition-authority read-model':
      cloneCommandSpec(commandSpecs['runtime stage-transition-authority read-model'], {
        usage:
          'opl runtime stage-transition-authority read-model ((--payload <json>|--payload-file <path>)|--from-ledger)',
        examples: [
          'opl runtime stage-transition-authority read-model --payload-file stage-transition-intents.json --json',
          'opl runtime stage-transition-authority read-model --from-ledger --json',
        ],
        group: 'runtime',
      }),
    'runtime stage-transition-authority record':
      cloneCommandSpec(commandSpecs['runtime stage-transition-authority record'], {
        usage:
          'opl runtime stage-transition-authority record (--payload <json>|--payload-file <path>) [--dry-run]',
        examples: [
          'opl runtime stage-transition-authority record --payload-file stage-transition-intent.json --json',
          'opl runtime stage-transition-authority record --payload-file stage-transition-intent.json --dry-run --json',
        ],
        group: 'runtime',
      }),
    'runtime stage-transition-authority list':
      cloneCommandSpec(commandSpecs['runtime stage-transition-authority list'], {
        usage: 'opl runtime stage-transition-authority list',
        examples: [
          'opl runtime stage-transition-authority list --json',
        ],
        group: 'runtime',
      }),
    ...developerModeCloseoutCommandSpecs,
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
      usage: 'opl runtime observability-export [--format json|openmetrics|collector-config-json]',
      examples: [
        'opl runtime observability-export',
        'opl runtime observability-export --format openmetrics',
        'opl runtime observability-export --format collector-config-json',
      ],
      group: 'runtime',
    }),
    'runtime observability-endpoint': cloneCommandSpec(commandSpecs['runtime observability-endpoint'], {
      usage:
        'opl runtime observability-endpoint [--host <host>] [--port <port>] [--metrics-path <path>] [--once] [--ready-file <path>]',
      examples: [
        'opl runtime observability-endpoint',
        'opl runtime observability-endpoint --port 9464 --metrics-path /metrics',
        'opl runtime observability-endpoint --port 0 --once --ready-file /tmp/opl-observability-endpoint.json',
      ],
      group: 'runtime',
    }),
    'runtime observability-collector-smoke': cloneCommandSpec(
      commandSpecs['runtime observability-collector-smoke'],
      {
        usage:
          'opl runtime observability-collector-smoke [--collector-command <path>] [--endpoint <url>] [--host <host>] [--port <port>] [--metrics-path <path>] [--timeout-ms <n>]',
        examples: [
          'opl runtime observability-collector-smoke',
          'opl runtime observability-collector-smoke --collector-command /usr/local/bin/otelcol-contrib',
          'opl runtime observability-collector-smoke --endpoint http://127.0.0.1:9464/metrics',
        ],
        group: 'runtime',
      },
    ),
    'runtime index': cloneCommandSpec(commandSpecs['runtime index'], {
      usage: 'opl runtime index',
      examples: ['opl runtime index'],
      group: 'runtime',
    }),
    'runtime stage-run-evidence-pack summary':
      cloneCommandSpec(commandSpecs['runtime stage-run-evidence-pack summary'], {
        usage:
          'opl runtime stage-run-evidence-pack summary (--payload <json>|--payload-file <path>)',
        examples: [
          'opl runtime stage-run-evidence-pack summary --payload-file stage-run-evidence-pack.json',
        ],
        group: 'runtime',
      }),
    'runtime stage-candidate-portfolio summary':
      cloneCommandSpec(commandSpecs['runtime stage-candidate-portfolio summary'], {
        usage:
          'opl runtime stage-candidate-portfolio summary (--payload <json>|--payload-file <path>)',
        examples: [
          'opl runtime stage-candidate-portfolio summary --payload-file stage-candidate-portfolio.json',
        ],
        group: 'runtime',
      }),
  };
}

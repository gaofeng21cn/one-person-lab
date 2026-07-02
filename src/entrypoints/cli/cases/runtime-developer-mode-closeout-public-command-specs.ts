import { assertNoArgs, cloneCommandSpec } from '../modules/support.ts';
import type { CommandSpec } from '../modules/support.ts';

export function buildPublicRuntimeDeveloperModeCloseoutCommandSpecs(
  commandSpecs: Record<string, CommandSpec>,
): Record<string, CommandSpec> {
  const subcommands = [
    commandSpecs['runtime developer-mode-closeout record'],
    commandSpecs['runtime developer-mode-closeout verify'],
    commandSpecs['runtime developer-mode-closeout list'],
  ].map((spec, index) => {
    const command = [
      'runtime developer-mode-closeout record',
      'runtime developer-mode-closeout verify',
      'runtime developer-mode-closeout list',
    ][index];
    return {
      command,
      usage: spec.usage,
      summary: spec.summary,
    };
  });
  const commandGroupSpec: CommandSpec = {
    usage: 'opl runtime developer-mode-closeout <record|verify|list>',
    summary:
      'Inspect or update refs-only Developer Mode live repair closeout ledger entries; fork/PR closeout requires GitHub PR-backed owner acceptance.',
    examples: [
      'opl runtime developer-mode-closeout list --json',
      'opl help runtime developer-mode-closeout record',
    ],
    group: 'runtime',
    subcommands,
    handler: (args) => {
      assertNoArgs(args, commandGroupSpec);
      return {
        developer_mode_closeout_commands: {
          surface_kind: 'opl_runtime_developer_mode_closeout_command_group',
          usage: 'opl runtime developer-mode-closeout <record|verify|list>',
          subcommands,
          owner_acceptance_policy:
            'direct_fix_accepts_external_owner_ref_fork_pr_requires_github_pr_owner_acceptance_ref_no_opl_owner_receipt_write',
          refs_only: true,
        },
      };
    },
  };

  return {
    'runtime developer-mode-closeout': commandGroupSpec,
    'runtime developer-mode-closeout record':
      cloneCommandSpec(commandSpecs['runtime developer-mode-closeout record'], {
        usage: 'opl runtime developer-mode-closeout record --payload <json>',
        examples: [
          'opl runtime developer-mode-closeout record --payload \'{"target_repo_id":"med-autoscience","route_decision":"direct-fix","route_eligibility":"eligible_direct_fix","patrol_observation_ref":"patrol:ref","diff_ref":"diff:ref","verification_refs":["test:ref"],"no_forbidden_write_ref":"scan:ref","commit_ref":"git:ref","owner_acceptance_ref":"external-owner-ref:accepted"}\'',
        ],
        group: 'runtime',
      }),
    'runtime developer-mode-closeout verify':
      cloneCommandSpec(commandSpecs['runtime developer-mode-closeout verify'], {
        usage: 'opl runtime developer-mode-closeout verify [--receipt-ref <ref>]',
        examples: [
          'opl runtime developer-mode-closeout verify --receipt-ref opl://developer-mode-closeout/med-autoscience/patrol%3Aref',
        ],
        group: 'runtime',
      }),
    'runtime developer-mode-closeout list':
      cloneCommandSpec(commandSpecs['runtime developer-mode-closeout list'], {
        usage: 'opl runtime developer-mode-closeout list',
        examples: ['opl runtime developer-mode-closeout list --json'],
        group: 'runtime',
      }),
  };
}

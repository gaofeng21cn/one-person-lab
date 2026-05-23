import { cloneCommandSpec } from '../modules/support.ts';
import type { CommandSpec } from '../modules/support.ts';

export function buildPublicRuntimeDeveloperModeCloseoutCommandSpecs(
  commandSpecs: Record<string, CommandSpec>,
): Record<string, CommandSpec> {
  return {
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

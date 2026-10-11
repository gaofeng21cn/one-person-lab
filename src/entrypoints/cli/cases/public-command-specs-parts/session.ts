import { runProductEntryResume } from '../../../../read-models/operator/product-entry-runtime.ts';
import { parseResumeArgs, cloneCommandSpec } from '../../modules/support.ts';
import type { CommandSpec } from '../../modules/support.ts';

export function buildSessionCommandSpecs(
  commandSpecs: Record<string, CommandSpec>,
): Record<string, CommandSpec> {
  const specs: Record<string, CommandSpec> = {
    'session resume': cloneCommandSpec(commandSpecs.resume, {
      usage: 'opl session resume <session_id>',
      examples: [
        'opl session resume run_7e2a41a19175465f809c0a7f151278ee',
      ],
      summary: 'Resume an OPL-managed session through the Codex product-entry runtime.',
      group: 'session',
      handler: (args) => runProductEntryResume(
        parseResumeArgs(args, specs['session resume']).sessionId,
      ),
    }),
    'session runtime': cloneCommandSpec(commandSpecs['session runtime'], {
      usage: 'opl session runtime --acp',
      examples: ['opl session runtime --acp'],
      group: 'session',
    }),
    'session ledger': cloneCommandSpec(commandSpecs['session ledger'], {
      usage: 'opl session ledger [--limit <n>]',
      examples: ['opl session ledger', 'opl session ledger --limit 5'],
      group: 'session',
    }),
  };
  return specs;
}

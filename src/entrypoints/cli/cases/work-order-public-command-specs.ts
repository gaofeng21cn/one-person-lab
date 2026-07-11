import {
  buildWorkOrderExecutePayload,
  buildWorkOrderMaterializeRequestPayload,
} from '../modules/work-order-public-payloads.ts';
import type { CommandSpec } from '../modules/support.ts';

export function buildPublicWorkOrderCommandSpecs(): Record<string, CommandSpec> {
  const specs: Record<string, CommandSpec> = {
    'work-order execute': {
      usage:
        'opl work-order execute --work-order <developer-patch-work-order.json> [--target-agent-dir <dir>] [--suite <suite.json>] [--output-dir <dir>] [--verification-command <command>] [--codex-bin <path>] [--codex-timeout-ms <ms>] [--codex-no-output-timeout-ms <ms>] [--codex-command-no-progress-timeout-ms <ms>] [--dry-run]',
      summary:
        'Execute an owner-gated developer patch work order through the OPL Codex CLI worktree primitive, then verify, absorb, clean up, and emit refs-only closeout receipts.',
      examples: [
        'opl work-order execute --work-order ./developer-patch-work-order.json --target-agent-dir ../redcube-ai --suite ./agent-lab-suite.json --json',
        'opl work-order execute --work-order ./developer-patch-work-order.json --target-agent-dir ../redcube-ai --dry-run --json',
      ],
      group: 'work-order',
      handler: (args) => buildWorkOrderExecutePayload(args, specs['work-order execute']),
    },
    'work-order materialize-request': {
      usage:
        'opl work-order materialize-request --request <semantic-request.json> --target-dir <new-dir>',
      summary:
        'Validate a refs-only semantic work-order request, atomically materialize canonical JSON files, and emit a digest-bound receipt without writing domain truth or owner receipts.',
      examples: [
        'opl work-order materialize-request --request ./oma-output.json --target-dir ./materialized-work-order --json',
      ],
      group: 'work-order',
      handler: (args) => buildWorkOrderMaterializeRequestPayload(
        args,
        specs['work-order materialize-request'],
      ),
    },
  };

  return specs;
}

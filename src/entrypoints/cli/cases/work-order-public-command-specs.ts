import { buildWorkOrderExecutePayload } from '../modules/work-order-public-payloads.ts';
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
  };

  return specs;
}

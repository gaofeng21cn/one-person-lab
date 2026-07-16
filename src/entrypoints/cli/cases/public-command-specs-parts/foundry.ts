import { createPersistentFoundryControl } from '../../modules/foundry-control.ts';
import {
  cancelTemporalFoundryRun,
  submitTemporalFoundryOwnerDecision,
} from '../../../../modules/runway/foundry-temporal-control.ts';
import { buildUsageError, parseCommandOptions } from '../../modules/support.ts';
import type { CommandSpec } from '../../modules/support.ts';

type PersistentFoundryControl = ReturnType<typeof createPersistentFoundryControl>;
type FoundryControl = {
  inspectRun: PersistentFoundryControl['inspectRun'];
  submitOwnerDecision: (
    input: Parameters<PersistentFoundryControl['submitOwnerDecision']>[0],
    options?: Parameters<PersistentFoundryControl['submitOwnerDecision']>[1],
  ) => Promise<unknown>;
  cancelRun: (input: Parameters<PersistentFoundryControl['cancelRun']>[0]) => Promise<unknown>;
  listVersions: PersistentFoundryControl['listVersions'];
  rollbackActivation: PersistentFoundryControl['rollbackActivation'];
};

function createFoundryOperatorControl(): FoundryControl {
  const persistent = createPersistentFoundryControl();
  return {
    inspectRun: persistent.inspectRun.bind(persistent),
    listVersions: persistent.listVersions.bind(persistent),
    rollbackActivation: persistent.rollbackActivation.bind(persistent),
    submitOwnerDecision: (input) => submitTemporalFoundryOwnerDecision(input),
    cancelRun: (input) => cancelTemporalFoundryRun(input),
  };
}

function requiredString(
  value: unknown,
  option: string,
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  if (typeof value !== 'string' || !value.trim()) {
    throw buildUsageError(`${option} requires a non-empty value.`, spec, { option });
  }
  return value.trim();
}

function revision(
  value: unknown,
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw buildUsageError('--expected-revision must be a non-negative integer.', spec, {
      expected_revision: value ?? null,
    });
  }
  return parsed;
}

function runMutationArgs(args: string[], spec: Pick<CommandSpec, 'usage' | 'examples'>) {
  const values = parseCommandOptions(args, spec, {
    'run-id': { type: 'string' },
    'expected-revision': { type: 'string' },
    'authority-receipt-ref': { type: 'string' },
  });
  return {
    run_id: requiredString(values['run-id'], '--run-id', spec),
    expected_revision: revision(values['expected-revision'], spec),
    authority_receipt_ref: requiredString(values['authority-receipt-ref'], '--authority-receipt-ref', spec),
  };
}

export function buildFoundryCommandSpecs(
  control?: FoundryControl,
): Record<string, CommandSpec> {
  let resolvedControl = control;
  const operatorControl = () => resolvedControl ??= createFoundryOperatorControl();
  const specs: Record<string, CommandSpec> = {
    'foundry status': {
      usage: 'opl foundry status --run-id <run_id>',
      summary: 'Inspect one OPL-owned FoundryRun and its current activation pointer.',
      examples: ['opl foundry status --run-id foundry_123 --json'],
      group: 'foundry',
      handler: async (args) => {
        const values = parseCommandOptions(args, specs['foundry status'], {
          'run-id': { type: 'string' },
        });
        return {
          foundry_run: await operatorControl().inspectRun(
            requiredString(values['run-id'], '--run-id', specs['foundry status']),
          ),
        };
      },
    },
    'foundry approve': {
      usage: 'opl foundry approve --run-id <run_id> --expected-revision <n> --authority-receipt-ref <ref>',
      summary: 'Record an Owner approval with revision CAS and resume the durable Foundry workflow.',
      examples: [
        'opl foundry approve --run-id foundry_123 --expected-revision 9 --authority-receipt-ref owner-receipt:canary/123 --json',
      ],
      group: 'foundry',
      handler: async (args) => ({
        foundry_run: await operatorControl().submitOwnerDecision({
          ...runMutationArgs(args, specs['foundry approve']),
          decision: 'approve',
        }, { advance: false }),
      }),
    },
    'foundry reject': {
      usage: 'opl foundry reject --run-id <run_id> --expected-revision <n> --authority-receipt-ref <ref>',
      summary: 'Record an Owner rejection with revision CAS and close the FoundryRun.',
      examples: [
        'opl foundry reject --run-id foundry_123 --expected-revision 9 --authority-receipt-ref owner-receipt:reject/123 --json',
      ],
      group: 'foundry',
      handler: async (args) => ({
        foundry_run: await operatorControl().submitOwnerDecision({
          ...runMutationArgs(args, specs['foundry reject']),
          decision: 'reject',
        }, { advance: false }),
      }),
    },
    'foundry cancel': {
      usage: 'opl foundry cancel --run-id <run_id> --expected-revision <n> --authority-receipt-ref <ref>',
      summary: 'Cancel a non-terminal FoundryRun with revision CAS.',
      examples: [
        'opl foundry cancel --run-id foundry_123 --expected-revision 3 --authority-receipt-ref owner-receipt:cancel/123 --json',
      ],
      group: 'foundry',
      handler: async (args) => ({
        foundry_run: await operatorControl().cancelRun(runMutationArgs(args, specs['foundry cancel'])),
      }),
    },
    'foundry versions': {
      usage: 'opl foundry versions --target-agent-id <agent_id> --target-domain-id <domain_id>',
      summary: 'List immutable qualified AgentVersion records for one exact target identity.',
      examples: [
        'opl foundry versions --target-agent-id research-agent --target-domain-id research --json',
      ],
      group: 'foundry',
      handler: async (args) => {
        const values = parseCommandOptions(args, specs['foundry versions'], {
          'target-agent-id': { type: 'string' },
          'target-domain-id': { type: 'string' },
        });
        const targetAgentId = requiredString(values['target-agent-id'], '--target-agent-id', specs['foundry versions']);
        const targetDomainId = requiredString(values['target-domain-id'], '--target-domain-id', specs['foundry versions']);
        return {
          foundry_versions: {
            target_agent_id: targetAgentId,
            target_domain_id: targetDomainId,
            versions: await operatorControl().listVersions(targetAgentId, targetDomainId),
          },
        };
      },
    },
    'foundry rollback': {
      usage: 'opl foundry rollback --target-agent-id <agent_id> --target-domain-id <domain_id> --version-digest <sha256:...> --expected-revision <n> --authority-receipt-ref <ref>',
      summary: 'Atomically restore the activation pointer to one exact immutable AgentVersion.',
      examples: [
        `opl foundry rollback --target-agent-id research-agent --target-domain-id research --version-digest sha256:${'a'.repeat(64)} --expected-revision 2 --authority-receipt-ref owner-receipt:rollback/123 --json`,
      ],
      group: 'foundry',
      handler: async (args) => {
        const values = parseCommandOptions(args, specs['foundry rollback'], {
          'target-agent-id': { type: 'string' },
          'target-domain-id': { type: 'string' },
          'version-digest': { type: 'string' },
          'expected-revision': { type: 'string' },
          'authority-receipt-ref': { type: 'string' },
        });
        return {
          foundry_activation_transaction: await operatorControl().rollbackActivation({
            target_agent_id: requiredString(values['target-agent-id'], '--target-agent-id', specs['foundry rollback']),
            target_domain_id: requiredString(values['target-domain-id'], '--target-domain-id', specs['foundry rollback']),
            version_digest: requiredString(values['version-digest'], '--version-digest', specs['foundry rollback']),
            expected_revision: revision(values['expected-revision'], specs['foundry rollback']),
            authority_receipt_ref: requiredString(
              values['authority-receipt-ref'],
              '--authority-receipt-ref',
              specs['foundry rollback'],
            ),
          }),
        };
      },
    },
  };
  return specs;
}

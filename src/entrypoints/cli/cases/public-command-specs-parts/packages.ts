import { runWorkflowPackageAction } from '../../../../modules/connect/workflow-package-lifecycle.ts';
import { buildUsageError } from '../../modules/support.ts';
import type { CommandSpec } from '../../modules/support.ts';

function parsePackageArgs(
  args: string[],
  spec: CommandSpec,
  options: { receipt?: boolean; packet?: boolean } = {},
) {
  const packageId = args[0];
  if (!packageId || packageId.startsWith('--')) {
    throw buildUsageError('A package id is required.', spec, { required: ['package_id'] });
  }
  const keep: string[] = [];
  let receiptPath: string | undefined;
  let mergePacketPath: string | undefined;
  for (let index = 1; index < args.length; index += 1) {
    const token = args[index];
    const value = args[index + 1];
    if (token === '--keep' && value && !value.startsWith('--')) {
      keep.push(value);
      index += 1;
      continue;
    }
    if (options.receipt && token === '--receipt' && value && !value.startsWith('--')) {
      receiptPath = value;
      index += 1;
      continue;
    }
    if (options.packet && token === '--packet' && value && !value.startsWith('--')) {
      mergePacketPath = value;
      index += 1;
      continue;
    }
    throw buildUsageError(`Unknown or incomplete package option: ${token}.`, spec, { option: token });
  }
  return { packageId, keep, receiptPath, mergePacketPath };
}

export function buildPackageCommandSpecs(): Record<string, CommandSpec> {
  const installSpec: CommandSpec = {
    usage: 'opl packages install opl-flow [--keep <migration-id> ...]',
    summary: 'Install OPL Flow, resolve its recommended dependency closure, retire declared conflicts, and write rollback receipts.',
    examples: ['opl packages install opl-flow', 'opl packages install opl-flow --keep superpowers-local-method-profile'],
    group: 'package',
    handler: (args) => runWorkflowPackageAction('install', parsePackageArgs(args, installSpec)),
  };
  const updateSpec: CommandSpec = {
    usage: 'opl packages update opl-flow [--keep <migration-id> ...]',
    summary: 'Update OPL Flow and reapply its current dependency, migration, profile, and model policy.',
    examples: ['opl packages update opl-flow'],
    group: 'package',
    handler: (args) => runWorkflowPackageAction('update', parsePackageArgs(args, updateSpec)),
  };
  const rollbackSpec: CommandSpec = {
    usage: 'opl packages rollback opl-flow --receipt <path>',
    summary: 'Restore archived workflow conflicts from one OPL Flow package migration receipt.',
    examples: ['opl packages rollback opl-flow --receipt /path/to/receipt.json'],
    group: 'package',
    handler: (args) => runWorkflowPackageAction('rollback', parsePackageArgs(args, rollbackSpec, { receipt: true })),
  };
  const profileApplySpec: CommandSpec = {
    usage: 'opl packages profile-apply opl-flow --packet <path>',
    summary: 'Apply a reviewed OPL Flow semantic profile merge packet with drift and backup checks.',
    examples: ['opl packages profile-apply opl-flow --packet /path/to/profile-merge'],
    group: 'package',
    handler: (args) => runWorkflowPackageAction('profile_apply', parsePackageArgs(args, profileApplySpec, { packet: true })),
  };
  return {
    'packages install': installSpec,
    'packages update': updateSpec,
    'packages rollback': rollbackSpec,
    'packages profile-apply': profileApplySpec,
  };
}

import {
  buildAgentInternalBrandModuleDoctor,
  buildAgentInternalBrandModuleInspect,
  buildAgentInternalBrandModuleInterfaces,
  buildAgentInternalBrandModulesList,
  buildAgentInternalBrandModuleValidation,
  buildBrandModuleInspect,
  buildBrandModuleInterfaces,
  buildBrandModuleMaturity,
  buildBrandModulesList,
  buildBrandModuleValidation,
} from '../../../../modules/charter/brand-modules.ts';
import {
  buildBrandModuleL5Interfaces,
  buildBrandModuleL5Status,
  buildBrandModuleL5Validation,
} from '../../../../modules/charter/brand-module-l5-evidence.ts';
import type { FrameworkContracts } from '../../../../kernel/types.ts';
import { assertNoArgs } from '../../modules/support.ts';
import type { CommandSpec } from '../../modules/support.ts';
import { buildBrandModuleSurfaceSpecs } from './brand-module-surfaces.ts';
import { buildBrandOperatingModelCommandSpecs } from './brand-operating-model.ts';
import { buildBrandPackCommandSpecs } from './brand-pack.ts';
import { buildBrandRunwayCommandSpecs } from './brand-runway.ts';
import { buildLedgerBundleCommandSpecs } from './ledger-bundle.ts';

export function buildBrandCommandSpecs(
  getContracts: () => FrameworkContracts,
): Record<string, CommandSpec> {
  const brandModuleSurfaceSpecs = {
    ...buildBrandModuleSurfaceSpecs(getContracts, 'charter', 'brand-charter'),
    ...buildBrandModuleSurfaceSpecs(getContracts, 'atlas', 'brand-atlas'),
    ...buildBrandModuleSurfaceSpecs(getContracts, 'workspace', 'workspace', ['status', 'inspect']),
    ...buildBrandModuleSurfaceSpecs(getContracts, 'pack', 'brand-pack'),
    ...buildBrandModuleSurfaceSpecs(getContracts, 'stagecraft', 'brand-stagecraft'),
    ...buildBrandModuleSurfaceSpecs(getContracts, 'runway', 'brand-runway'),
    ...buildBrandModuleSurfaceSpecs(getContracts, 'ledger', 'brand-ledger'),
    ...buildBrandModuleSurfaceSpecs(getContracts, 'console', 'brand-console'),
    ...buildBrandModuleSurfaceSpecs(getContracts, 'connect', 'brand-connect'),
  };
  const ledgerBundleCommandSpecs = buildLedgerBundleCommandSpecs();
  const vaultAliasSpecs = Object.fromEntries(
    Object.entries(brandModuleSurfaceSpecs)
      .filter(([command]) => command.startsWith('ledger '))
      .map(([command, spec]) => [
        command.replace(/^ledger/, 'vault'),
        {
          ...spec,
          usage: spec.usage.replace('opl ledger', 'opl vault'),
          summary: `Deprecated alias for ${spec.usage}; OPL Ledger is the canonical evidence module.`,
          examples: spec.examples.map((example) => example.replace('opl ledger', 'opl vault')),
          help_surface: 'migration_compatibility' as const,
        },
      ]),
  );

  const brandCommandSpecs: Record<string, CommandSpec> = {
    ...buildBrandRunwayCommandSpecs(),
    'brand-modules list': {
      usage: 'opl brand-modules list',
      summary: 'List the OPL brand modules and their Workspace-level structural baseline refs.',
      examples: ['opl brand-modules list --json'],
      group: 'brand',
      handler: (args) => {
        assertNoArgs(args, brandCommandSpecs['brand-modules list']);
        return buildBrandModulesList(getContracts());
      },
    },
    'brand-modules inspect': {
      usage: 'opl brand-modules inspect --module <module_id>',
      summary: 'Inspect one OPL brand module with contract, CLI, App, descriptor, validation, status, and authority-boundary refs.',
      examples: ['opl brand-modules inspect --module workspace --json'],
      group: 'brand',
      handler: (args) => buildBrandModuleInspect(getContracts(), args),
    },
    'brand-modules maturity': {
      usage: 'opl brand-modules maturity',
      summary: 'Read the Workspace-baseline maturity matrix for all OPL brand modules.',
      examples: ['opl brand-modules maturity --json'],
      group: 'brand',
      handler: (args) => {
        assertNoArgs(args, brandCommandSpecs['brand-modules maturity']);
        return buildBrandModuleMaturity(getContracts());
      },
    },
    'brand-modules l5-status': {
      usage: 'opl brand-modules l5-status [--module <module_id>]',
      summary: 'Read the fail-closed L5 operating-evidence matrix without claiming production maturity from structural readiness.',
      examples: [
        'opl brand-modules l5-status --json',
        'opl brand-modules l5-status --module runway --json',
      ],
      group: 'brand',
      handler: (args) => buildBrandModuleL5Status(getContracts(), args),
    },
    'brand-modules l5-validate': {
      usage: 'opl brand-modules l5-validate',
      summary: 'Validate the L5 evidence matrix shape and false-authority policy without treating open evidence as a contract failure.',
      examples: ['opl brand-modules l5-validate --json'],
      group: 'brand',
      handler: (args) => {
        assertNoArgs(args, brandCommandSpecs['brand-modules l5-validate']);
        return buildBrandModuleL5Validation(getContracts());
      },
    },
    'brand-modules l5-interfaces': {
      usage: 'opl brand-modules l5-interfaces',
      summary: 'Expose CLI, App descriptor, validation, and contract refs for the brand-module L5 evidence gate.',
      examples: ['opl brand-modules l5-interfaces --json'],
      group: 'brand',
      handler: (args) => {
        assertNoArgs(args, brandCommandSpecs['brand-modules l5-interfaces']);
        return buildBrandModuleL5Interfaces(getContracts());
      },
    },
    'brand-modules validate': {
      usage: 'opl brand-modules validate',
      summary: 'Validate OPL brand module L4 gates and false-authority boundaries from the registry contract.',
      examples: ['opl brand-modules validate --json'],
      group: 'brand',
      handler: (args) => {
        assertNoArgs(args, brandCommandSpecs['brand-modules validate']);
        return buildBrandModuleValidation(getContracts());
      },
    },
    'brand-modules interfaces': {
      usage: 'opl brand-modules interfaces',
      summary: 'Expose descriptor-only CLI, App, validation, and registry surfaces for the OPL brand module bundle.',
      examples: ['opl brand-modules interfaces --json'],
      group: 'brand',
      handler: (args) => {
        assertNoArgs(args, brandCommandSpecs['brand-modules interfaces']);
        return buildBrandModuleInterfaces(getContracts());
      },
    },
    ...buildBrandOperatingModelCommandSpecs(getContracts),
    ...brandModuleSurfaceSpecs,
    ...buildBrandPackCommandSpecs(brandModuleSurfaceSpecs['pack inspect']),
    ...ledgerBundleCommandSpecs,
    ...vaultAliasSpecs,
    'agents modules list': {
      usage: 'opl agents modules list',
      summary: 'List domain-agent internal brand-module spines without making them OPL platform modules.',
      examples: ['opl agents modules list --json'],
      group: 'brand',
      handler: (args) => {
        assertNoArgs(args, brandCommandSpecs['agents modules list']);
        return buildAgentInternalBrandModulesList(getContracts());
      },
    },
    'agents modules inspect': {
      usage: 'opl agents modules inspect --domain <domain_id> --module <agent_module_id>',
      summary: 'Inspect one domain-agent internal brand-module spine from the OPL governance contract.',
      examples: ['opl agents modules inspect --domain mas --module agent-runway --json'],
      group: 'brand',
      handler: (args) => buildAgentInternalBrandModuleInspect(getContracts(), args),
    },
    'agents modules interfaces': {
      usage: 'opl agents modules interfaces',
      summary: 'Expose CLI and descriptor refs for the agent-owned internal brand-module spine.',
      examples: ['opl agents modules interfaces --json'],
      group: 'brand',
      handler: (args) => {
        assertNoArgs(args, brandCommandSpecs['agents modules interfaces']);
        return buildAgentInternalBrandModuleInterfaces(getContracts());
      },
    },
    'agents modules validate': {
      usage: 'opl agents modules validate',
      summary: 'Validate agent-owned internal brand-module spine coverage and false-authority boundaries.',
      examples: ['opl agents modules validate --json'],
      group: 'brand',
      handler: (args) => {
        assertNoArgs(args, brandCommandSpecs['agents modules validate']);
        return buildAgentInternalBrandModuleValidation(getContracts());
      },
    },
    'agents modules doctor': {
      usage: 'opl agents modules doctor',
      summary: 'Fail closed if agent-owned internal brand-module spine governance drifts.',
      examples: ['opl agents modules doctor --json'],
      group: 'brand',
      handler: (args) => {
        assertNoArgs(args, brandCommandSpecs['agents modules doctor']);
        return buildAgentInternalBrandModuleDoctor(getContracts());
      },
    },
  };

  return brandCommandSpecs;
}

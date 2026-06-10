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
} from '../../../brand-modules.ts';
import {
  buildBrandModuleL5Interfaces,
  buildBrandModuleL5ModuleStatus,
  buildBrandModuleL5Status,
  buildBrandModuleL5Validation,
} from '../../../brand-module-l5-evidence.ts';
import {
  buildBrandModuleObjectView,
  buildBrandModuleSurfaceCommand,
  listBrandModuleObjectViewCommands,
} from '../../../brand-module-surfaces.ts';
import {
  runPackOsInspectCommand,
  runPackOsLockCommand,
  runPackOsMasDisplaySmokeCommand,
  runPackOsValidateCommand,
} from '../../../pack-os.ts';
import { runFamilyRuntime } from '../../../family-runtime.ts';
import type { BrandModuleId, FrameworkContracts } from '../../../types.ts';
import { assertNoArgs } from '../../modules/support.ts';
import type { CommandSpec } from '../../modules/support.ts';

type BrandModuleSurfaceSubcommand = 'status' | 'inspect' | 'interfaces' | 'validate' | 'doctor';

function buildBrandModuleSurfaceSpecs(
  getContracts: () => FrameworkContracts,
  moduleId: BrandModuleId,
  group: string,
  subcommands: ReadonlyArray<BrandModuleSurfaceSubcommand> = ['status', 'inspect', 'interfaces', 'validate', 'doctor'],
): Record<string, CommandSpec> {
  const label = `OPL ${moduleId}`;
  const specs: Record<string, CommandSpec> = {};
  for (const subcommand of subcommands) {
    const command = `${moduleId} ${subcommand}`;
    specs[command] = {
      usage: `opl ${moduleId} ${subcommand}`,
      summary: `Read the ${label} module-owned ${subcommand} surface instead of relying on the aggregate brand registry.`,
      examples: [`opl ${moduleId} ${subcommand} --json`],
      group,
      handler: (args) => {
        assertNoArgs(args, specs[command]);
        return buildBrandModuleSurfaceCommand(getContracts(), moduleId, subcommand);
      },
    };
  }
  for (const viewId of listBrandModuleObjectViewCommands(moduleId)) {
    const command = `${moduleId} ${viewId}`;
    specs[command] = {
      usage: `opl ${moduleId} ${viewId}`,
      summary: `Read the ${label} ${viewId} object-model view from the module-owned surface contract.`,
      examples: [`opl ${moduleId} ${viewId} --json`],
      group,
      handler: (args) => {
        assertNoArgs(args, specs[command]);
        return buildBrandModuleObjectView(getContracts(), moduleId, viewId);
      },
    };
  }
  const l5StatusCommand = `${moduleId} l5-status`;
  specs[l5StatusCommand] = {
    usage: `opl ${moduleId} l5-status`,
    summary: `Read the ${label} L5 operating-evidence status without converting L4 structure into production maturity.`,
    examples: [`opl ${moduleId} l5-status --json`],
    group,
    handler: (args) => {
      assertNoArgs(args, specs[l5StatusCommand]);
      return buildBrandModuleL5ModuleStatus(getContracts(), moduleId);
    },
  };
  return specs;
}

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
    ...buildBrandModuleSurfaceSpecs(getContracts, 'vault', 'brand-vault'),
    ...buildBrandModuleSurfaceSpecs(getContracts, 'console', 'brand-console'),
    ...buildBrandModuleSurfaceSpecs(getContracts, 'foundry-lab', 'brand-foundry-lab'),
    ...buildBrandModuleSurfaceSpecs(getContracts, 'connect', 'brand-connect'),
  };

  const brandCommandSpecs: Record<string, CommandSpec> = {
    'pack os inspect': {
      usage: 'opl pack os inspect --descriptor <path>',
      summary: 'Inspect a generic capability-pack descriptor through OPL Pack OS without claiming domain authority.',
      examples: [
        'opl pack os inspect --descriptor display_pack.json --json',
      ],
      group: 'brand-pack',
      handler: runPackOsInspectCommand,
    },
    'pack os lock': {
      usage: 'opl pack os lock --descriptor <path> [--output <path>]',
      summary: 'Resolve a generic capability-pack descriptor into a refs-only Pack OS lock.',
      examples: [
        'opl pack os lock --descriptor display_pack.json --json',
        'opl pack os lock --descriptor display_pack.json --output build/pack-lock.json --json',
      ],
      group: 'brand-pack',
      handler: runPackOsLockCommand,
    },
    'pack os validate': {
      usage: 'opl pack os validate --descriptor <path>',
      summary: 'Validate the generic Pack OS descriptor boundary and false-authority flags.',
      examples: [
        'opl pack os validate --descriptor display_pack.json --json',
      ],
      group: 'brand-pack',
      handler: runPackOsValidateCommand,
    },
    'pack os mas-display-smoke': {
      usage: 'opl pack os mas-display-smoke --contract <path> [--output <path>]',
      summary: 'Consume a MAS Display Pack v2 contract into a refs-only Pack OS lock and audit smoke.',
      examples: [
        'opl pack os mas-display-smoke --contract contracts/display-pack-contract.v2.json --json',
        'opl pack os mas-display-smoke --contract contracts/display-pack-contract.v2.json --output build/pack-lock.json --json',
      ],
      group: 'brand-pack',
      handler: runPackOsMasDisplaySmokeCommand,
    },
    'runway control-loop status': {
      usage: 'opl runway control-loop status',
      summary: 'Read the Runway control-loop runtime status while keeping Temporal, worker supervisor, scheduler cadence, and Progress Reconciler authority separate.',
      examples: ['opl runway control-loop status --json'],
      group: 'brand-runway',
      handler: (args) => {
        assertNoArgs(args, brandCommandSpecs['runway control-loop status']);
        return runFamilyRuntime(['control-loop', 'status', '--provider', 'temporal']);
      },
    },
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
    ...brandModuleSurfaceSpecs,
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
      examples: ['opl agents modules inspect --domain medautoscience --module agent-runway --json'],
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

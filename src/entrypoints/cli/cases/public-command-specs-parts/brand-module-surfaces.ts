import {
  buildBrandModuleL5ModuleStatus,
} from '../../../../modules/charter/brand-module-l5-evidence.ts';
import {
  buildBrandModuleObjectView,
  buildBrandModuleSurfaceCommand,
  listBrandModuleObjectViewCommands,
} from '../../../../modules/charter/brand-module-surfaces.ts';
import type { BrandModuleId, FrameworkContracts } from '../../../../kernel/types.ts';
import { assertNoArgs } from '../../modules/support.ts';
import type { CommandSpec } from '../../modules/support.ts';

type BrandModuleSurfaceSubcommand = 'status' | 'inspect' | 'interfaces' | 'validate' | 'doctor';

export function buildBrandModuleSurfaceSpecs(
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

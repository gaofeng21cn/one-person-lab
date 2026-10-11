import { buildOplFrameworkLocator } from '../../../../adapters/integration/opl-framework-locator.ts';
import {
  buildFrameworkOperatingMaturityCompactReadback,
  buildFrameworkOperatingMaturityReadout,
} from '../../../../read-models/operator/index.ts';
import { buildRuntimeTraySnapshot } from '../../../../read-models/operator/runtime-tray-snapshot.ts';
import { buildSourceStructureOperatorReadback } from '../../../../authority/contracts/source-structure-operator-readback.ts';
import type { FrameworkContracts } from '../../../../kernel/types.ts';
import {
  assertNoArgs,
  buildUsageError,
} from '../../modules/support.ts';
import type { CommandSpec } from '../../modules/support.ts';
import { runCordisFrameworkReadiness } from './cordis.ts';

function parseFrameworkReadbackDetail(
  args: string[],
  spec: CommandSpec,
  commandName: string,
): 'full' | 'compact' {
  if (args.length === 1 && args[0] === '--family-defaults') {
    return 'full';
  }
  if (
    args.length === 3
    && args[0] === '--family-defaults'
    && args[1] === '--detail'
    && args[2] === 'compact'
  ) {
    return 'compact';
  }
  throw buildUsageError(`${commandName} requires --family-defaults and optionally --detail compact.`, spec, {
    required: ['--family-defaults'],
    optional: ['--detail compact'],
    allowed_detail_levels: ['compact'],
  });
}

export function buildFrameworkCommandSpecs(
  getContracts: () => FrameworkContracts,
): Record<string, CommandSpec> {
  const specs: Record<string, CommandSpec> = {
    'framework locate': {
      usage: 'opl framework locate',
      summary: 'Locate the OPL Framework runtime dependency for an OPL-compatible agent.',
      examples: [
        'opl framework locate',
        'OPL_FRAMEWORK_ROOT=/Users/gaofeng/workspace/one-person-lab opl framework locate',
      ],
      group: 'framework',
      handler: (args) => {
        assertNoArgs(args, specs['framework locate']);
        return buildOplFrameworkLocator();
      },
    },
    'framework readiness': {
      usage: 'opl framework readiness --family-defaults [--detail compact]',
      summary:
        'Read the default attention-first framework readiness summary and Kernel floor without claiming domain, quality, artifact, or production ready.',
      examples: [
        'opl framework readiness --family-defaults --json',
        'opl framework readiness --family-defaults --detail compact --json',
      ],
      group: 'framework',
      handler: async (args) => {
        const detail = parseFrameworkReadbackDetail(
          args,
          specs['framework readiness'],
          'framework readiness',
        );
        return await runCordisFrameworkReadiness(
          getContracts(),
          detail,
          buildRuntimeTraySnapshot,
        );
      },
    },
    'framework operating-maturity': {
      usage: 'opl framework operating-maturity --family-defaults [--detail compact]',
      summary:
        'Aggregate domain owner-chain scaleout, L5, App release, provider long-soak, cleanup, and lifecycle evidence gaps without claiming readiness.',
      examples: [
        'opl framework operating-maturity --family-defaults --json',
        'opl framework operating-maturity --family-defaults --detail compact --json',
      ],
      group: 'framework',
      handler: async (args) => {
        const detail = parseFrameworkReadbackDetail(
          args,
          specs['framework operating-maturity'],
          'framework operating-maturity',
        );
        const output = await buildFrameworkOperatingMaturityReadout(
          getContracts(),
          { familyDefaults: true },
          {
            runtimeSnapshotProvider: buildRuntimeTraySnapshot,
          },
        );
        if (detail === 'compact') {
          return buildFrameworkOperatingMaturityCompactReadback(output.framework_operating_maturity);
        }
        return output;
      },
    },
    'framework source-structure': {
      usage: 'opl framework source-structure --family-defaults [--strict]',
      summary:
        'Read the OPL source-structure line-budget guard as an operator readback without claiming readiness, quality verdict, or completion.',
      examples: [
        'opl framework source-structure --family-defaults --json',
        'opl framework source-structure --family-defaults --strict --json',
      ],
      group: 'framework',
      handler: (args) => {
        const allowed = new Set(['--family-defaults', '--strict']);
        if (
          !args.includes('--family-defaults')
          || args.some((arg) => !allowed.has(arg))
          || args.filter((arg) => arg === '--family-defaults').length !== 1
          || args.filter((arg) => arg === '--strict').length > 1
        ) {
          throw buildUsageError(
            'framework source-structure requires --family-defaults and optionally --strict.',
            specs['framework source-structure'],
            {
              required: ['--family-defaults'],
              optional: ['--strict'],
            },
          );
        }
        return buildSourceStructureOperatorReadback({ strict: args.includes('--strict') });
      },
    },
  };
  return specs;
}

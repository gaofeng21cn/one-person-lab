import {
  buildCordisCompositionInspect,
  CORDIS_AGENT_EXECUTOR_INSPECT_METADATA,
  markCordisCompositionInspectDisposed,
} from '../../../../host/plugins/cordis-composition-inspect.ts';
import { buildRuntimeTraySnapshot } from '../../../../read-models/operator/runtime-tray-snapshot.ts';
import type { RuntimeTraySnapshotProvider } from '../../../../adapters/execution/index.ts';
import type { FrameworkContracts } from '../../../../kernel/types.ts';
import {
  createCordisAppFullComposition,
  type CordisCliComposition,
} from '../../../../host/composition-profiles.ts';
import { parseRegisteredCommandOptions } from '../../modules/support.ts';
import type { CommandSpec } from '../../modules/support.ts';

export type { CordisCliComposition } from '../../../../host/composition-profiles.ts';

function requireCordisComposition(
  composition: CordisCliComposition | undefined,
): CordisCliComposition {
  if (!composition) {
    throw new Error('CLI command requires an explicit Cordis base-headless composition.');
  }
  return composition;
}

export function buildCordisCommandSpecs(
  cordis?: CordisCliComposition,
): Record<string, CommandSpec> {
  const specs: Record<string, CommandSpec> = {
    'cordis inspect': {
      usage: 'opl cordis inspect',
      summary: 'Read the active Cordis composition, plugin lifecycle, service bindings, event modes, and teardown diagnostics without changing installed or domain truth.',
      examples: ['opl cordis inspect --json'],
      group: 'framework',
      handler: async (args) => {
        parseRegisteredCommandOptions('cordis inspect', args, specs['cordis inspect']);
        const composition = requireCordisComposition(cordis);
        return markCordisCompositionInspectDisposed(buildCordisCompositionInspect({
          context: composition.ctx,
          snapshot: composition.snapshot,
          metadata: CORDIS_AGENT_EXECUTOR_INSPECT_METADATA,
          observationScope: 'active_default_profile',
          defaultCallerActivated: true,
        }));
      },
    },
  };
  return specs;
}

export async function runCordisFrameworkReadiness(
  contracts: FrameworkContracts,
  detail: 'full' | 'compact',
  runtimeSnapshotProvider: RuntimeTraySnapshotProvider = buildRuntimeTraySnapshot,
) {
  const composition = await createCordisAppFullComposition({ runtimeSnapshotProvider });
  try {
    return detail === 'compact'
      ? await composition.services.frameworkReadiness.compact(contracts, { familyDefaults: true })
      : await composition.services.frameworkReadiness.full(contracts, { familyDefaults: true });
  } finally {
    await composition.dispose();
  }
}

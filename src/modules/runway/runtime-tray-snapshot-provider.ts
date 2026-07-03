import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import type { FrameworkContracts } from '../../kernel/types.ts';
import type { DomainManifestCatalog } from './family-runtime-evidence-worklist-parts/stage-readiness-input.ts';
import type { FamilyRuntimeProviderKind } from './family-runtime-types.ts';

export type RuntimeTraySnapshotEnvelope = {
  runtime_tray_snapshot: Record<string, unknown>;
};

export type RuntimeTraySnapshotProviderOptions = {
  appOperatorDrilldownDetailLevel?: 'summary' | 'full';
  providerKind?: FamilyRuntimeProviderKind;
  domainManifests?: DomainManifestCatalog;
};

export type RuntimeTraySnapshotProvider = (
  contracts: FrameworkContracts,
  options?: RuntimeTraySnapshotProviderOptions,
) => Promise<RuntimeTraySnapshotEnvelope>;

export function requireRuntimeTraySnapshotProvider(
  provider: RuntimeTraySnapshotProvider | undefined,
  surface: string,
) {
  if (provider) {
    return provider;
  }
  throw new FrameworkContractError('contract_shape_invalid', `${surface} requires a runtime snapshot provider.`, {
    surface,
    expected_provider: 'Console-owned buildRuntimeTraySnapshot injected by the caller',
  });
}

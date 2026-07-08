import type {
  BrandCliGovernanceContract,
  BrandModuleL5OperatingEvidenceContract,
  BrandModuleRegistryContract,
  BrandModuleSurfacesContract,
  BrandSystemProfileContract,
  SourceModuleMapContract,
} from '../../../../../src/kernel/types.ts';
import { fs, parseJsonText, path, repoRoot } from '../../helpers.ts';

function readFrameworkContract<T>(fileName: string) {
  return parseJsonText(
    fs.readFileSync(path.join(repoRoot, 'contracts/opl-framework', fileName), 'utf8'),
  ) as T;
}

export const MINIMAL_BRAND_MODULE_REGISTRY_CONTRACT =
  readFrameworkContract<BrandModuleRegistryContract>('brand-module-registry.json');
export const MINIMAL_SOURCE_MODULE_MAP_CONTRACT =
  readFrameworkContract<SourceModuleMapContract>('source-module-map.json');
export const MINIMAL_BRAND_MODULE_SURFACES_CONTRACT =
  readFrameworkContract<BrandModuleSurfacesContract>('brand-module-surfaces.json');
export const MINIMAL_BRAND_MODULE_L5_OPERATING_EVIDENCE_CONTRACT =
  readFrameworkContract<BrandModuleL5OperatingEvidenceContract>('brand-module-l5-operating-evidence.json');
export const MINIMAL_BRAND_SYSTEM_PROFILE_CONTRACT =
  readFrameworkContract<BrandSystemProfileContract>('brand-system-profile.json');
export const MINIMAL_BRAND_CLI_GOVERNANCE_CONTRACT =
  readFrameworkContract<BrandCliGovernanceContract>('brand-cli-governance.json');

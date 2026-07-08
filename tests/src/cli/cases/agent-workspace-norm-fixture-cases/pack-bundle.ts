import type { PackBundleContract } from '../../../../../src/kernel/types.ts';
import { fs, parseJsonText, path, repoRoot } from '../../helpers.ts';

export const MINIMAL_PACK_BUNDLE_CONTRACT = parseJsonText(
  fs.readFileSync(path.join(repoRoot, 'contracts/opl-framework/pack-bundle-contract.json'), 'utf8'),
) as PackBundleContract;

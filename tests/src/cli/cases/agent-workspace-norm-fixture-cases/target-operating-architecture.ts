import type { TargetOperatingArchitectureContract } from '../../../../../src/kernel/types.ts';
import { fs, parseJsonText, path, repoRoot } from '../../helpers.ts';

export const MINIMAL_TARGET_OPERATING_ARCHITECTURE_CONTRACT = parseJsonText(
  fs.readFileSync(path.join(repoRoot, 'contracts/opl-framework/target-operating-architecture-contract.json'), 'utf8'),
) as TargetOperatingArchitectureContract;

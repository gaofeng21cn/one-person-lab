import type { StandardAgentPrinciplesContract } from '../../../../../src/kernel/types.ts';
import { fs, parseJsonText, path, repoRoot } from '../../helpers.ts';

export const MINIMAL_STANDARD_AGENT_PRINCIPLES_CONTRACT = parseJsonText(
  fs.readFileSync(path.join(repoRoot, 'contracts/opl-framework/standard-agent-principles.json'), 'utf8'),
) as StandardAgentPrinciplesContract;

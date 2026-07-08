import type { ScholarSkillsCapabilityModulesContract } from '../../../../../src/kernel/types.ts';
import { fs, parseJsonText, path, repoRoot } from '../../helpers.ts';

export const MINIMAL_SCHOLAR_SKILLS_CAPABILITY_MODULES_CONTRACT = parseJsonText(
  fs.readFileSync(path.join(repoRoot, 'contracts/opl-framework/scholar-skills-capability-modules.json'), 'utf8'),
) as ScholarSkillsCapabilityModulesContract;

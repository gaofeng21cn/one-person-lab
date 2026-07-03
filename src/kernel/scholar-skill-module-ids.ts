import type { ScholarSkillModuleId } from './types.ts';

export const SCHOLAR_SKILL_MODULE_IDS = [
  'mas-scholar-skills.display',
  'mas-scholar-skills.tables',
  'mas-scholar-skills.stats',
  'mas-scholar-skills.lit',
  'mas-scholar-skills.write',
  'mas-scholar-skills.review',
  'mas-scholar-skills.submit',
  'mas-scholar-skills.data',
] as const satisfies readonly ScholarSkillModuleId[];

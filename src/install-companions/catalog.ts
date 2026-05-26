import path from 'node:path';

import type { OplRecommendedSkill } from '../install-companions.ts';

type RecommendedSkillSpec = Omit<OplRecommendedSkill, 'status'>;

export function buildOplRecommendedSkillSpecs(options: {
  codexHome: string;
  superpowersRepoDir: string;
  agentsSuperpowersDir: string;
  skillsManagerHome: string;
  packagedSkillsRoot: string | null;
}): RecommendedSkillSpec[] {
  const { codexHome, superpowersRepoDir, agentsSuperpowersDir, skillsManagerHome, packagedSkillsRoot } = options;
  return [
    {
      skill_id: 'superpowers',
      label: 'Superpowers process skills',
      required: false,
      source: 'superpowers',
      expected_paths: [
        path.join(superpowersRepoDir, 'skills', 'using-superpowers', 'SKILL.md'),
        path.join(superpowersRepoDir, 'skills', 'verification-before-completion', 'SKILL.md'),
        path.join(agentsSuperpowersDir, 'using-superpowers', 'SKILL.md'),
      ],
      install_hint: 'OPL installs the official Superpowers bundle by cloning https://github.com/obra/superpowers.git into ~/.codex/superpowers and linking ~/.agents/skills/superpowers to the full skills directory.',
      update_hint: 'Update with: cd ~/.codex/superpowers && git pull --ff-only. The ~/.agents/skills/superpowers symlink makes updates visible after Codex/App restart.',
      supports: ['planning', 'debugging', 'verification', 'branch_finish', 'skill_methodology'],
    },
    {
      skill_id: 'officecli',
      label: 'officecli core skill',
      required: false,
      source: 'skills_manager',
      expected_paths: [path.join(skillsManagerHome, 'skills', 'officecli', 'SKILL.md')],
      required_tools: ['officecli'],
      install_hint: 'Install the officecli skill and binary so MAS/MAG/RCA can handle Office deliverables.',
      supports: ['docx', 'pptx', 'xlsx'],
    },
    {
      skill_id: 'ui-ux-pro-max',
      label: 'UI UX Pro Max skill',
      required: false,
      source: 'github',
      expected_paths: [path.join(skillsManagerHome, 'skills', 'ui-ux-pro-max', 'SKILL.md')],
      install_hint: 'Install https://github.com/nextlevelbuilder/ui-ux-pro-max-skill so RCA can review and improve visual deliverables.',
      supports: ['rca', 'ui_review', 'ux_design', 'presentation_visuals'],
    },
    {
      skill_id: 'mineru-document-extractor',
      label: 'MinerU document extraction skill',
      required: false,
      source: 'skills_manager',
      expected_paths: [
        path.join(skillsManagerHome, 'skills', 'mineru-document-extractor', 'SKILL.md'),
        ...(packagedSkillsRoot ? [path.join(packagedSkillsRoot, 'mineru-document-extractor', 'SKILL.md')] : []),
      ],
      required_tools: ['mineru-open-api'],
      install_hint: 'Install the MinerU document extraction skill and mineru-open-api binary so Codex can extract PDFs, scans, images, Office files, and web pages. MinerU flash-extract works without a token; extract and crawl use MINERU_TOKEN or mineru-open-api auth.',
      supports: ['pdf', 'ocr', 'document_extraction', 'mineru', 'web_extraction'],
    },
    {
      skill_id: 'officecli-docx',
      label: 'officecli Word skill',
      required: false,
      source: 'skills_manager',
      expected_paths: [path.join(skillsManagerHome, 'skills', 'officecli-docx', 'SKILL.md')],
      required_tools: ['officecli'],
      install_hint: 'Install officecli-docx for Word document creation and editing.',
      supports: ['docx', 'academic_paper'],
    },
    {
      skill_id: 'officecli-pptx',
      label: 'officecli PowerPoint skill',
      required: false,
      source: 'skills_manager',
      expected_paths: [path.join(skillsManagerHome, 'skills', 'officecli-pptx', 'SKILL.md')],
      required_tools: ['officecli'],
      install_hint: 'Install officecli-pptx for presentation creation and editing.',
      supports: ['pptx', 'pitch_deck'],
    },
    {
      skill_id: 'officecli-xlsx',
      label: 'officecli Excel skill',
      required: false,
      source: 'skills_manager',
      expected_paths: [path.join(skillsManagerHome, 'skills', 'officecli-xlsx', 'SKILL.md')],
      required_tools: ['officecli'],
      install_hint: 'Install officecli-xlsx for spreadsheet and dashboard work.',
      supports: ['xlsx', 'dashboard'],
    },
    {
      skill_id: 'openai_primary_runtime_office',
      label: 'Codex native Office skills',
      required: false,
      source: 'codex_builtin',
      expected_paths: [
        path.join(codexHome, 'plugins', 'cache', 'openai-primary-runtime', 'documents', '26.423.10653', 'skills', 'documents', 'SKILL.md'),
        path.join(codexHome, 'plugins', 'cache', 'openai-primary-runtime', 'presentations', '26.423.10653', 'skills', 'presentations', 'SKILL.md'),
        path.join(codexHome, 'plugins', 'cache', 'openai-primary-runtime', 'spreadsheets', '26.423.10653', 'skills', 'spreadsheets', 'SKILL.md'),
      ],
      install_hint: 'Use Codex bundled Documents, Presentations, and Spreadsheets skills when available.',
      supports: ['documents', 'presentations', 'spreadsheets'],
    },
  ];
}

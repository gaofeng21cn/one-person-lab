import fs from 'node:fs';
import path from 'node:path';

import type { OplRecommendedSkill } from '../install-companions.ts';

type RecommendedSkillSpec = Omit<OplRecommendedSkill, 'status'>;

function packagedSkillPath(packagedSkillsRoot: string | null, skillId: string): string[] {
  return packagedSkillsRoot ? [path.join(packagedSkillsRoot, skillId, 'SKILL.md')] : [];
}

function primaryRuntimeSkillPaths(codexHome: string, packageId: string, skillId: string): string[] {
  const packageRoot = path.join(codexHome, 'plugins', 'cache', 'openai-primary-runtime', packageId);
  if (!fs.existsSync(packageRoot) || !fs.statSync(packageRoot).isDirectory()) return [];
  return fs.readdirSync(packageRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(packageRoot, entry.name, 'skills', skillId, 'SKILL.md'))
    .filter((candidate) => fs.existsSync(candidate));
}

export function buildOplRecommendedSkillSpecs(options: {
  codexHome: string;
  skillsManagerHome: string;
  packagedSkillsRoot: string | null;
}): RecommendedSkillSpec[] {
  const { codexHome, skillsManagerHome, packagedSkillsRoot } = options;
  return [
    {
      skill_id: 'officecli',
      label: 'officecli core skill',
      required: false,
      source: 'skills_manager',
      expected_paths: [
        path.join(skillsManagerHome, 'skills', 'officecli', 'SKILL.md'),
        ...packagedSkillPath(packagedSkillsRoot, 'officecli'),
      ],
      required_tools: ['officecli'],
      install_hint: 'Install the officecli skill and binary so MAS/MAG/RCA can handle Office deliverables.',
      supports: ['docx', 'pptx', 'xlsx'],
    },
    {
      skill_id: 'ui-ux-pro-max',
      label: 'UI UX Pro Max skill',
      required: false,
      source: 'github',
      expected_paths: [
        path.join(skillsManagerHome, 'skills', 'ui-ux-pro-max', 'SKILL.md'),
        ...packagedSkillPath(packagedSkillsRoot, 'ui-ux-pro-max'),
      ],
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
        ...packagedSkillPath(packagedSkillsRoot, 'mineru-document-extractor'),
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
      expected_paths: [
        path.join(skillsManagerHome, 'skills', 'officecli-docx', 'SKILL.md'),
        ...packagedSkillPath(packagedSkillsRoot, 'officecli-docx'),
      ],
      required_tools: ['officecli'],
      install_hint: 'Install officecli-docx for Word document creation and editing.',
      supports: ['docx', 'academic_paper'],
    },
    {
      skill_id: 'officecli-pptx',
      label: 'officecli PowerPoint skill',
      required: false,
      source: 'skills_manager',
      expected_paths: [
        path.join(skillsManagerHome, 'skills', 'officecli-pptx', 'SKILL.md'),
        ...packagedSkillPath(packagedSkillsRoot, 'officecli-pptx'),
      ],
      required_tools: ['officecli'],
      install_hint: 'Install officecli-pptx for presentation creation and editing.',
      supports: ['pptx', 'pitch_deck'],
    },
    {
      skill_id: 'officecli-xlsx',
      label: 'officecli Excel skill',
      required: false,
      source: 'skills_manager',
      expected_paths: [
        path.join(skillsManagerHome, 'skills', 'officecli-xlsx', 'SKILL.md'),
        ...packagedSkillPath(packagedSkillsRoot, 'officecli-xlsx'),
      ],
      required_tools: ['officecli'],
      install_hint: 'Install officecli-xlsx for spreadsheet and dashboard work.',
      supports: ['xlsx', 'dashboard'],
    },
    {
      skill_id: 'officecli-academic-paper',
      label: 'officecli academic paper skill',
      required: false,
      source: 'skills_manager',
      expected_paths: [
        path.join(skillsManagerHome, 'skills', 'officecli-academic-paper', 'SKILL.md'),
        ...packagedSkillPath(packagedSkillsRoot, 'officecli-academic-paper'),
      ],
      required_tools: ['officecli'],
      install_hint: 'Install the upstream-owned officecli-academic-paper skill for academic document workflows.',
      supports: ['academic_paper', 'citations', 'thesis'],
    },
    {
      skill_id: 'officecli-data-dashboard',
      label: 'officecli data dashboard skill',
      required: false,
      source: 'skills_manager',
      expected_paths: [
        path.join(skillsManagerHome, 'skills', 'officecli-data-dashboard', 'SKILL.md'),
        ...packagedSkillPath(packagedSkillsRoot, 'officecli-data-dashboard'),
      ],
      required_tools: ['officecli'],
      install_hint: 'Install the upstream-owned officecli-data-dashboard skill for Excel dashboard workflows.',
      supports: ['xlsx', 'dashboard', 'charts'],
    },
    {
      skill_id: 'officecli-financial-model',
      label: 'officecli financial model skill',
      required: false,
      source: 'skills_manager',
      expected_paths: [
        path.join(skillsManagerHome, 'skills', 'officecli-financial-model', 'SKILL.md'),
        ...packagedSkillPath(packagedSkillsRoot, 'officecli-financial-model'),
      ],
      required_tools: ['officecli'],
      install_hint: 'Install the upstream-owned officecli-financial-model skill for financial modeling workflows.',
      supports: ['xlsx', 'financial_model', 'valuation'],
    },
    {
      skill_id: 'officecli-pitch-deck',
      label: 'officecli pitch deck skill',
      required: false,
      source: 'skills_manager',
      expected_paths: [
        path.join(skillsManagerHome, 'skills', 'officecli-pitch-deck', 'SKILL.md'),
        ...packagedSkillPath(packagedSkillsRoot, 'officecli-pitch-deck'),
      ],
      required_tools: ['officecli'],
      install_hint: 'Install the upstream-owned officecli-pitch-deck skill for investor presentation workflows.',
      supports: ['pptx', 'pitch_deck', 'fundraising'],
    },
    ...([
      ['documents', 'Official Codex Documents capability'],
      ['presentations', 'Official Codex Presentations capability'],
      ['spreadsheets', 'Official Codex Spreadsheets capability'],
      ['pdf', 'Official Codex PDF capability'],
    ] as const).map(([skillId, label]) => ({
      skill_id: skillId,
      label,
      required: false,
      source: 'codex_builtin' as const,
      expected_paths: primaryRuntimeSkillPaths(codexHome, skillId, skillId),
      install_hint: `Install or enable the official OpenAI Primary Runtime ${label.replace('Official Codex ', '')}.`,
      supports: [skillId],
    })),
  ];
}

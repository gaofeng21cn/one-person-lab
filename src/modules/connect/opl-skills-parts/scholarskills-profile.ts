import fs from 'node:fs';
import path from 'node:path';

import type { SkillPackSyncScope, SkillPackTargetProject } from './registry.ts';

export const SCHOLARSKILLS_AUTHORITY_FALSE_FLAGS = {
  can_write_domain_truth: false,
  can_sign_owner_receipt: false,
  can_create_typed_blocker: false,
  can_write_runtime_queue: false,
  can_write_owner_receipt: false,
  can_write_paper_body: false,
  can_write_artifact_authority: false,
  can_authorize_publication_readiness: false,
};

type MasScholarSkillsPack = {
  pack_id: string;
  skill_dir: string;
  label: string;
  role: 'aggregate_entry' | 'specialist_entry';
  required_by_profile: boolean;
  default_by_profile: boolean;
  missing_source_status: 'available-but-not-materialized' | 'source-missing';
};

type MasScholarSkillsTargetScope = SkillPackSyncScope | 'inspect';
type MasScholarSkillsSourceRole = 'canonical_source_repo' | 'plugin_mirror_or_packaging_copy';

export const MAS_SCHOLAR_SKILLS_PROFILE_PACKS: MasScholarSkillsPack[] = [
  {
    pack_id: 'mas-scholar-skills',
    skill_dir: 'mas-scholar-skills',
    label: 'MAS Scholar Skills aggregate entry',
    role: 'aggregate_entry',
    required_by_profile: true,
    default_by_profile: true,
    missing_source_status: 'source-missing',
  },
  {
    pack_id: 'medical-research-lit',
    skill_dir: 'medical-research-lit',
    label: 'Medical research literature specialist',
    role: 'specialist_entry',
    required_by_profile: false,
    default_by_profile: true,
    missing_source_status: 'source-missing',
  },
  {
    pack_id: 'medical-manuscript-writing',
    skill_dir: 'medical-manuscript-writing',
    label: 'Medical manuscript writing specialist',
    role: 'specialist_entry',
    required_by_profile: false,
    default_by_profile: true,
    missing_source_status: 'source-missing',
  },
  {
    pack_id: 'medical-manuscript-review',
    skill_dir: 'medical-manuscript-review',
    label: 'Medical manuscript review specialist',
    role: 'specialist_entry',
    required_by_profile: false,
    default_by_profile: true,
    missing_source_status: 'source-missing',
  },
  {
    pack_id: 'medical-figure-design',
    skill_dir: 'medical-figure-design',
    label: 'Medical figure design specialist',
    role: 'specialist_entry',
    required_by_profile: false,
    default_by_profile: true,
    missing_source_status: 'source-missing',
  },
  {
    pack_id: 'medical-figure-style',
    skill_dir: 'medical-figure-style',
    label: 'Medical figure style specialist',
    role: 'specialist_entry',
    required_by_profile: false,
    default_by_profile: true,
    missing_source_status: 'source-missing',
  },
  {
    pack_id: 'medical-figure-composer',
    skill_dir: 'medical-figure-composer',
    label: 'Medical figure composer specialist',
    role: 'specialist_entry',
    required_by_profile: false,
    default_by_profile: true,
    missing_source_status: 'source-missing',
  },
  {
    pack_id: 'medical-statistical-review',
    skill_dir: 'medical-statistical-review',
    label: 'Medical statistical review specialist',
    role: 'specialist_entry',
    required_by_profile: false,
    default_by_profile: true,
    missing_source_status: 'source-missing',
  },
  {
    pack_id: 'medical-table-design',
    skill_dir: 'medical-table-design',
    label: 'Medical table design specialist',
    role: 'specialist_entry',
    required_by_profile: false,
    default_by_profile: true,
    missing_source_status: 'source-missing',
  },
  {
    pack_id: 'medical-submission-prep',
    skill_dir: 'medical-submission-prep',
    label: 'Medical submission preparation specialist',
    role: 'specialist_entry',
    required_by_profile: false,
    default_by_profile: true,
    missing_source_status: 'source-missing',
  },
  {
    pack_id: 'medical-data-governance',
    skill_dir: 'medical-data-governance',
    label: 'Medical data governance specialist',
    role: 'specialist_entry',
    required_by_profile: false,
    default_by_profile: true,
    missing_source_status: 'source-missing',
  },
  {
    pack_id: 'medical-structural-biology',
    skill_dir: 'medical-structural-biology',
    label: 'Medical structural biology optional specialist',
    role: 'specialist_entry',
    required_by_profile: false,
    default_by_profile: false,
    missing_source_status: 'source-missing',
  },
  {
    pack_id: 'medical-protein-design',
    skill_dir: 'medical-protein-design',
    label: 'Medical protein design optional specialist',
    role: 'specialist_entry',
    required_by_profile: false,
    default_by_profile: false,
    missing_source_status: 'source-missing',
  },
  {
    pack_id: 'medical-genomics-foundation-models',
    skill_dir: 'medical-genomics-foundation-models',
    label: 'Medical genomics foundation models optional specialist',
    role: 'specialist_entry',
    required_by_profile: false,
    default_by_profile: false,
    missing_source_status: 'source-missing',
  },
  {
    pack_id: 'medical-single-cell-modeling',
    skill_dir: 'medical-single-cell-modeling',
    label: 'Medical single-cell modeling optional specialist',
    role: 'specialist_entry',
    required_by_profile: false,
    default_by_profile: false,
    missing_source_status: 'source-missing',
  },
  {
    pack_id: 'medical-indication-dossier',
    skill_dir: 'medical-indication-dossier',
    label: 'Medical indication dossier optional specialist',
    role: 'specialist_entry',
    required_by_profile: false,
    default_by_profile: false,
    missing_source_status: 'source-missing',
  },
  {
    pack_id: 'research-pdf-evidence-explorer',
    skill_dir: 'research-pdf-evidence-explorer',
    label: 'Research PDF evidence explorer optional specialist',
    role: 'specialist_entry',
    required_by_profile: false,
    default_by_profile: false,
    missing_source_status: 'source-missing',
  },
  {
    pack_id: 'scientific-compute-runner',
    skill_dir: 'scientific-compute-runner',
    label: 'Scientific compute runner optional specialist',
    role: 'specialist_entry',
    required_by_profile: false,
    default_by_profile: false,
    missing_source_status: 'source-missing',
  },
  {
    pack_id: 'medical-protocol-and-sap-planner',
    skill_dir: 'medical-protocol-and-sap-planner',
    label: 'Medical protocol and SAP planner optional specialist',
    role: 'specialist_entry',
    required_by_profile: false,
    default_by_profile: false,
    missing_source_status: 'source-missing',
  },
  {
    pack_id: 'medical-cohort-phenotyping',
    skill_dir: 'medical-cohort-phenotyping',
    label: 'Medical cohort phenotyping optional specialist',
    role: 'specialist_entry',
    required_by_profile: false,
    default_by_profile: false,
    missing_source_status: 'source-missing',
  },
  {
    pack_id: 'medical-evidence-synthesis-and-claim-map',
    skill_dir: 'medical-evidence-synthesis-and-claim-map',
    label: 'Medical evidence synthesis and claim map optional specialist',
    role: 'specialist_entry',
    required_by_profile: false,
    default_by_profile: false,
    missing_source_status: 'source-missing',
  },
  {
    pack_id: 'medical-reference-integrity-auditor',
    skill_dir: 'medical-reference-integrity-auditor',
    label: 'Medical reference integrity auditor optional specialist',
    role: 'specialist_entry',
    required_by_profile: false,
    default_by_profile: false,
    missing_source_status: 'source-missing',
  },
  {
    pack_id: 'medical-rebuttal-strategy',
    skill_dir: 'medical-rebuttal-strategy',
    label: 'Medical rebuttal strategy optional specialist',
    role: 'specialist_entry',
    required_by_profile: false,
    default_by_profile: false,
    missing_source_status: 'source-missing',
  },
  {
    pack_id: 'medical-display-qc',
    skill_dir: 'medical-display-qc',
    label: 'Medical display QC optional specialist',
    role: 'specialist_entry',
    required_by_profile: false,
    default_by_profile: false,
    missing_source_status: 'source-missing',
  },
  {
    pack_id: 'medical-causal-inference-plan',
    skill_dir: 'medical-causal-inference-plan',
    label: 'Medical causal inference plan optional specialist',
    role: 'specialist_entry',
    required_by_profile: false,
    default_by_profile: false,
    missing_source_status: 'source-missing',
  },
  {
    pack_id: 'medical-survival-analysis-plan',
    skill_dir: 'medical-survival-analysis-plan',
    label: 'Medical survival analysis plan optional specialist',
    role: 'specialist_entry',
    required_by_profile: false,
    default_by_profile: false,
    missing_source_status: 'source-missing',
  },
];

export const MAS_SCHOLAR_SKILLS_REQUIRED_PACK_IDS = Object.freeze(
  MAS_SCHOLAR_SKILLS_PROFILE_PACKS
    .filter((pack) => pack.required_by_profile)
    .map((pack) => pack.pack_id),
);

export const MAS_SCHOLAR_SKILLS_DEFAULT_PACK_IDS = Object.freeze(
  MAS_SCHOLAR_SKILLS_PROFILE_PACKS
    .filter((pack) => pack.default_by_profile)
    .map((pack) => pack.pack_id),
);

export const MAS_SCHOLAR_SKILLS_SPECIALIST_PACK_IDS = Object.freeze(
  MAS_SCHOLAR_SKILLS_PROFILE_PACKS
    .filter((pack) => pack.role === 'specialist_entry')
    .map((pack) => pack.pack_id),
);

function sourceSkillEntryPath(pluginSourcePath: string, skillDir: string) {
  return path.join(pluginSourcePath, 'skills', skillDir, 'SKILL.md');
}

function sourceStatus(pluginSourcePath: string, pack: MasScholarSkillsPack) {
  return fs.existsSync(sourceSkillEntryPath(pluginSourcePath, pack.skill_dir))
    ? 'materialized'
    : pack.missing_source_status;
}

function sourceRole(sourceRoot: string, pluginSourcePath: string): MasScholarSkillsSourceRole {
  return path.resolve(sourceRoot) === path.resolve(pluginSourcePath)
    ? 'canonical_source_repo'
    : 'plugin_mirror_or_packaging_copy';
}

export function materializedMasScholarSkillsPackIds(pluginSourcePath: string) {
  return MAS_SCHOLAR_SKILLS_PROFILE_PACKS
    .filter((pack) => sourceStatus(pluginSourcePath, pack) === 'materialized')
    .map((pack) => pack.pack_id);
}

export function buildMasScholarSkillsProfileManifest(options: {
  sourceRoot: string;
  pluginSourcePath: string;
  targetScope: MasScholarSkillsTargetScope;
  targetProject?: SkillPackTargetProject | null;
  targetRoot?: string | null;
  installRoot?: string | null;
  installedPackIds?: string[];
}) {
  const targetRoot = options.targetRoot ? path.resolve(options.targetRoot) : null;
  const installRoot = options.installRoot ? path.resolve(options.installRoot) : null;
  const installedPackIds = new Set(options.installedPackIds ?? []);
  const role = sourceRole(options.sourceRoot, options.pluginSourcePath);
  const packs = MAS_SCHOLAR_SKILLS_PROFILE_PACKS.map((pack) => {
    const status = sourceStatus(options.pluginSourcePath, pack);
    const entryPath = sourceSkillEntryPath(options.pluginSourcePath, pack.skill_dir);
    return {
      pack_id: pack.pack_id,
      skill_dir: pack.skill_dir,
      label: pack.label,
      role: pack.role,
      required_by_profile: pack.required_by_profile,
      default_by_profile: pack.default_by_profile,
      source_role: role,
      source_entry_path: entryPath,
      resolved_source_path: entryPath,
      source_status: status,
      install_target_skill_root: installRoot
        ? path.join(
            installRoot,
            options.targetScope === 'project' ? 'skills' : '',
            pack.skill_dir,
          )
        : null,
      installed: installedPackIds.has(pack.pack_id),
    };
  });

  return {
    surface_kind: 'opl_mas_scholar_skills_profile_sync_manifest',
    schema_version: 'g1',
    profile_id: 'mas_scholar_skills_sync_profile.v1',
    profile_driver: {
      owner: 'MAS profile/overlay',
      connect_role: 'install_sync_discovery_only',
      connect_does_not_own_quality_or_domain_truth: true,
    },
    required_skill_pack: Array.from(MAS_SCHOLAR_SKILLS_REQUIRED_PACK_IDS),
    default_skill_pack: Array.from(MAS_SCHOLAR_SKILLS_DEFAULT_PACK_IDS),
    install_target: {
      target_scope: options.targetScope,
      target_project: options.targetProject ?? null,
      target_root: targetRoot,
      install_root: installRoot,
      system_codex_skill_install_default: false,
    },
    source: {
      source_repo_path: path.resolve(options.sourceRoot),
      plugin_source_path: path.resolve(options.pluginSourcePath),
      source_role: role,
      canonical_source_repo_path: role === 'canonical_source_repo'
        ? path.resolve(options.pluginSourcePath)
        : path.resolve(options.sourceRoot),
      plugin_mirror_path: role === 'canonical_source_repo'
        ? null
        : path.resolve(options.pluginSourcePath),
      mirror_or_cache_is_not_skill_completeness_authority: true,
      source_status_values: [
        'materialized',
        'available-but-not-materialized',
        'source-missing',
      ],
    },
    packs,
    authority_boundary: SCHOLARSKILLS_AUTHORITY_FALSE_FLAGS,
  };
}

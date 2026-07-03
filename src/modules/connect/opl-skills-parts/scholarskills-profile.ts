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
];

function sourceSkillEntryPath(pluginSourcePath: string, skillDir: string) {
  return path.join(pluginSourcePath, 'skills', skillDir, 'SKILL.md');
}

function sourceStatus(pluginSourcePath: string, pack: MasScholarSkillsPack) {
  return fs.existsSync(sourceSkillEntryPath(pluginSourcePath, pack.skill_dir))
    ? 'materialized'
    : pack.missing_source_status;
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
  const packs = MAS_SCHOLAR_SKILLS_PROFILE_PACKS.map((pack) => {
    const status = sourceStatus(options.pluginSourcePath, pack);
    return {
      pack_id: pack.pack_id,
      skill_dir: pack.skill_dir,
      label: pack.label,
      role: pack.role,
      required_by_profile: pack.required_by_profile,
      default_by_profile: pack.default_by_profile,
      source_entry_path: sourceSkillEntryPath(options.pluginSourcePath, pack.skill_dir),
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
    required_skill_pack: MAS_SCHOLAR_SKILLS_PROFILE_PACKS
      .filter((pack) => pack.required_by_profile)
      .map((pack) => pack.pack_id),
    default_skill_pack: MAS_SCHOLAR_SKILLS_PROFILE_PACKS
      .filter((pack) => pack.default_by_profile)
      .map((pack) => pack.pack_id),
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

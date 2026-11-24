import type {
  OplCompanionToolId,
  OplCompanionToolSyncItem,
} from './tools.ts';

export type OplCompanionSkillStatus = 'ready' | 'missing';
export type OplCompanionSkillActionStatus = 'planned' | 'ready' | 'missing_source' | 'synced' | 'available' | 'installed' | 'failed';
export type OplCompanionSkillApplyMode = 'observe' | 'ask_to_apply' | 'managed';
export type OplCompanionSkillSourceAuthority =
  | 'skills_manager'
  | 'github_repository'
  | 'packaged_runtime'
  | 'framework_materialized_fallback'
  | 'codex_builtin'
  | 'existing_codex_entry'
  | 'external'
  | 'missing';

export type OplCompanionSkillSyncItem = {
  skill_id: string;
  scope: 'global_user' | 'domain_project';
  owner: string;
  source_path: string | null;
  target_path: string;
  agents_target_path: string;
  status: OplCompanionSkillActionStatus;
  action: 'none' | 'install' | 'package_update_or_repair' | 'symlink' | 'clone_and_symlink' | 'update_and_symlink' | 'discover_only';
  source_authority: OplCompanionSkillSourceAuthority;
  source_payload_sha256: string | null;
  installed_payload_sha256: string | null;
  payload_currentness: 'current' | 'diverged' | 'missing' | 'not_applicable';
  frontmatter_schema_status: 'valid' | 'invalid' | 'not_checked';
  resource_closure_status: 'complete' | 'incomplete' | 'not_checked';
  missing_resource_paths: string[];
  codex_entry_realpath: string | null;
  agents_entry_realpath: string | null;
  entrypoint_authority_status: 'converged' | 'diverged' | 'missing' | 'not_applicable';
  note: string | null;
};

export type OplCompanionSkillSyncResult = {
  surface_id: 'opl_companion_skill_sync';
  mode: OplCompanionSkillApplyMode;
  codex_skills_dir: string;
  agents_skills_dir: string;
  items: OplCompanionSkillSyncItem[];
  tools: OplCompanionToolSyncItem[];
  summary: {
    total: number;
    ready: number;
    synced: number;
    missing_source: number;
    failed: number;
    tools_ready: number;
    tools_total: number;
  };
};

export type OplRecommendedSkill = {
  skill_id: string;
  scope: 'global_user' | 'domain_project';
  owner: string;
  label: string;
  required: boolean;
  source: 'skills_manager' | 'codex_builtin' | 'github' | 'existing_entrypoint' | 'flow_capability_strategy';
  managed_dependency?: boolean;
  managed_dependency_mode?: 'github' | 'observe_existing' | 'owner_cli';
  repository_url?: string;
  repository_source_path?: string;
  expected_paths: string[];
  install_source_paths?: string[];
  status: OplCompanionSkillStatus;
  required_tools?: OplCompanionToolId[];
  install_hint: string;
  update_hint?: string;
  supports: string[];
};

type OplManagedSkillDependencyBase = {
  id: string;
  versionRequirement?: string;
  installSource?: string;
  required: boolean;
  owner?: string;
  requiredTools?: OplCompanionToolId[];
};

export type OplManagedSkillDependency = OplManagedSkillDependencyBase & (
  | {
      sourceMode: 'github';
      repositoryUrl: string;
      repositorySourcePath: string;
    }
  | {
      sourceMode: 'observe_existing';
      legacySource: string;
    }
  | {
      sourceMode: 'owner_cli';
      ownerToolId: 'agent-reach';
    }
);

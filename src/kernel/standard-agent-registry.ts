export type StandardAgentSeriesMembership = 'standard_domain_agent' | 'framework_capability_package';

export type StandardAgentWorkspaceProfile = {
  default_profile_id: 'one_off' | 'series' | 'portfolio';
  workspace_kind: string;
  project_kind: string;
  project_collection_label: string;
  default_workspace_id: string;
  default_project_id: string;
};

export type StandardAgentRuntimeManagerRegistration = {
  domain_owner: string;
  registration_id: string;
  expected_registration_surface: {
    surface_kind: string;
    ref: string;
    command: string;
  };
  consumable_projection_refs: readonly string[];
  state_index_inputs: Record<string, string>;
  scheduler: {
    migration_priority: string;
    legacy_scheduler_owner: null;
    legacy_scheduler_residue_policy: string;
    replacement_role: string;
    required_domain_refs: readonly string[];
    daemon_policy: string;
    daemon_replacement_surface: string;
  };
};

export type StandardAgentFamilyRuntimeProfile = {
  supported: boolean;
  runtime_domain_id: string;
  dispatch_command?: readonly string[];
  runtime_manager_registration?: StandardAgentRuntimeManagerRegistration;
};

export type StandardAgentRegistryEntry = {
  agent_id: string;
  domain_id: string;
  target_domain_id: string;
  label: string;
  series_membership: StandardAgentSeriesMembership;
  brand_cli: string;
  plugin_name: string;
  canonical_plugin_name: string;
  project: string;
  module_id: string;
  source_kind: 'opl_standard_codex_carrier' | 'repo_plugin_installer';
  installer_kind: 'bash' | 'node';
  installer_relative_paths: readonly string[];
  domain_alias: string;
  work_alias: string;
  aliases: string[];
  ordinary_golden_path: string;
  domain_pack_example: string;
  domain_authority_kernel_examples: string[];
  workspace_profile?: StandardAgentWorkspaceProfile;
  family_runtime_profile?: StandardAgentFamilyRuntimeProfile;
};

export const STANDARD_AGENT_REGISTRY_REF = 'src/kernel/standard-agent-registry.ts';
export const STANDARD_AGENT_SERIES_MEMBERSHIP = 'standard_domain_agent' as const;
export const FRAMEWORK_CAPABILITY_PACKAGE_MEMBERSHIP = 'framework_capability_package' as const;

export const STANDARD_AGENT_REGISTRY = [
  {
    agent_id: 'mas',
    domain_id: 'medautoscience',
    target_domain_id: 'medautoscience',
    label: 'Med Auto Science',
    series_membership: STANDARD_AGENT_SERIES_MEMBERSHIP,
    brand_cli: 'mas',
    plugin_name: 'med-autoscience',
    canonical_plugin_name: 'mas',
    project: 'med-autoscience',
    module_id: 'MEDAUTOSCIENCE',
    source_kind: 'opl_standard_codex_carrier',
    installer_kind: 'bash',
    installer_relative_paths: [],
    domain_alias: 'study',
    work_alias: 'study',
    aliases: ['mas', 'medautoscience', 'med-autoscience', 'med_auto_science', 'study'],
    ordinary_golden_path:
      'study -> stage -> domain owner receipt or typed blocker -> research artifact handoff',
    domain_pack_example: 'Medical Research Pack',
    domain_authority_kernel_examples: [
      'medical research truth',
      'publication quality verdict',
      'paper artifact authority',
      'medical memory accept/reject',
      'owner receipt signer',
      'typed blocker signer',
    ],
    workspace_profile: {
      default_profile_id: 'portfolio',
      workspace_kind: 'medical_research_workspace',
      project_kind: 'study',
      project_collection_label: 'studies',
      default_workspace_id: 'research-workspace',
      default_project_id: 'study-001',
    },
    family_runtime_profile: {
      supported: true,
      runtime_domain_id: 'medautoscience',
      dispatch_command: ['medautosci', 'domain-handler', 'dispatch'],
      runtime_manager_registration: {
        domain_owner: 'med-autoscience',
        registration_id: 'mas.opl_runtime_manager.registration.v1',
        expected_registration_surface: {
          surface_kind: 'opl_runtime_manager_domain_registration',
          ref: '/skill_catalog/skills/0/domain_projection/opl_stage_runtime_registration',
          command: 'uv run python -m med_autoscience.cli skill-catalog --profile <profile> --format json',
        },
        consumable_projection_refs: [
          '/skill_catalog/skills/0/domain_projection/runtime_continuity',
          '/progress_projection/domain_projection/research_runtime_control_projection',
          '/artifact_inventory/artifact_surface',
          '/automation/automations/0',
        ],
        state_index_inputs: {
          workspace_registry_index: '/workspace_locator',
          managed_session_ledger_index: '/session_continuity',
          artifact_projection_index: '/artifact_inventory',
          attention_queue_index: '/automation/automations/0',
          runtime_health_snapshot_index: '/runtime_inventory',
        },
        scheduler: {
          migration_priority: 'p0',
          legacy_scheduler_owner: null,
          legacy_scheduler_residue_policy: 'history_tombstone_or_negative_guard_only',
          replacement_role:
            'OPL owns scheduler cadence, provider SLO tick, Temporal attempt ledger, and projection; the selected domain owner keeps progress semantics, owner receipts, typed blockers, and safe action refs.',
          required_domain_refs: [
            'domain_runtime_owner_route_handoff',
            'opl_runtime_owner_route',
            'domain_route/reconcile-apply',
            'mas_opl_runtime_workbench_projection',
            'sidecar_owner_receipt_or_typed_blocker',
            'no_forbidden_write_evidence',
          ],
          daemon_policy: 'legacy_diagnostic_cleanup_only',
          daemon_replacement_surface:
            'local LaunchAgent / supervision tick is cleanup-only legacy residue',
        },
      },
    },
  },
  {
    agent_id: 'mag',
    domain_id: 'medautogrant',
    target_domain_id: 'medautogrant',
    label: 'Med Auto Grant',
    series_membership: STANDARD_AGENT_SERIES_MEMBERSHIP,
    brand_cli: 'mag',
    plugin_name: 'med-autogrant',
    canonical_plugin_name: 'mag',
    project: 'med-autogrant',
    module_id: 'MEDAUTOGRANT',
    source_kind: 'opl_standard_codex_carrier',
    installer_kind: 'bash',
    installer_relative_paths: ['scripts/install-codex-plugin.sh'],
    domain_alias: 'grant',
    work_alias: 'grant',
    aliases: ['mag', 'medautogrant', 'med-autogrant', 'med_auto_grant', 'grant'],
    ordinary_golden_path:
      'grant -> stage -> domain owner receipt or typed blocker -> grant deliverable handoff',
    domain_pack_example: 'Grant Pack',
    domain_authority_kernel_examples: [
      'grant truth',
      'fundability quality/export verdict',
      'package authority',
      'grant strategy memory accept/reject',
      'owner receipt signer',
      'typed blocker signer',
    ],
    workspace_profile: {
      default_profile_id: 'one_off',
      workspace_kind: 'grant_authoring_workspace',
      project_kind: 'grant_project',
      project_collection_label: 'deliverables',
      default_workspace_id: 'grant-workspace',
      default_project_id: 'grant-001',
    },
    family_runtime_profile: {
      supported: true,
      runtime_domain_id: 'medautogrant',
      dispatch_command: ['medautogrant', 'domain-handler', 'dispatch'],
      runtime_manager_registration: {
        domain_owner: 'med-autogrant',
        registration_id: 'mag.opl_runtime_manager.registration.v1',
        expected_registration_surface: {
          surface_kind: 'opl_runtime_manager_domain_registration',
          ref: '/skill_catalog/skills/0/domain_projection/opl_stage_runtime_registration',
          command: 'uv run python -m med_autogrant skill-catalog --input <workspace.json> --format json',
        },
        consumable_projection_refs: [
          '/skill_catalog/skills/0/domain_projection/runtime_continuity',
          '/runtime_control/semantic_closure',
          '/artifact_inventory',
          '/automation/automations/1',
        ],
        state_index_inputs: {
          workspace_registry_index: '/workspace_locator',
          managed_session_ledger_index: '/session_continuity',
          artifact_projection_index: '/artifact_inventory',
          attention_queue_index: '/automation/automations/1',
          runtime_health_snapshot_index: '/runtime_inventory',
        },
        scheduler: {
          migration_priority: 'p1',
          legacy_scheduler_owner: null,
          legacy_scheduler_residue_policy: 'history_tombstone_or_negative_guard_only',
          replacement_role:
            'MAG consumes the OPL scheduler replacement through refs, owner receipts, typed blockers, and guarded grant actions without adding a repo-owned daemon.',
          required_domain_refs: [
            'product_entry_manifest',
            'grant_owner_receipt_or_typed_blocker',
            'grant_memory_ref',
            'no_forbidden_write_evidence',
          ],
          daemon_policy: 'not_installed_or_maintained_by_opl',
          daemon_replacement_surface:
            'repo-local runtime journal cadence is not a production scheduler',
        },
      },
    },
  },
  {
    agent_id: 'rca',
    domain_id: 'redcube',
    target_domain_id: 'redcube',
    label: 'RedCube AI',
    series_membership: STANDARD_AGENT_SERIES_MEMBERSHIP,
    brand_cli: 'rca',
    plugin_name: 'redcube-ai',
    canonical_plugin_name: 'rca',
    project: 'redcube-ai',
    module_id: 'REDCUBE',
    source_kind: 'opl_standard_codex_carrier',
    installer_kind: 'node',
    installer_relative_paths: [
      'scripts/install-codex-plugin.ts',
      'scripts/install-codex-plugin.mjs',
    ],
    domain_alias: 'deck',
    work_alias: 'deck',
    aliases: ['rca', 'redcube', 'redcube-ai', 'redcube_ai', 'redcubeai', 'deck'],
    ordinary_golden_path:
      'deck -> stage -> domain owner receipt or typed blocker -> visual deliverable handoff',
    domain_pack_example: 'Visual Deliverable Pack',
    domain_authority_kernel_examples: [
      'visual truth',
      'layout review/export verdict',
      'visual artifact mutation authority',
      'visual memory accept/reject',
      'owner receipt signer',
      'typed blocker signer',
    ],
    workspace_profile: {
      default_profile_id: 'series',
      workspace_kind: 'visual_theme_workspace',
      project_kind: 'slide_deck',
      project_collection_label: 'deliverables',
      default_workspace_id: 'visual-workspace',
      default_project_id: 'deck-001',
    },
    family_runtime_profile: {
      supported: true,
      runtime_domain_id: 'redcube',
      dispatch_command: ['redcube', 'domain-handler', 'dispatch'],
      runtime_manager_registration: {
        domain_owner: 'redcube-ai',
        registration_id: 'rca.opl_runtime_manager.registration.v1',
        expected_registration_surface: {
          surface_kind: 'opl_runtime_manager_domain_registration',
          ref: '/skill_catalog/skills/0/domain_projection/opl_stage_runtime_registration',
          command: 'redcube product manifest --workspace-root <workspace_root>',
        },
        consumable_projection_refs: [
          '/skill_catalog/skills/0/domain_projection/runtime_continuity',
          '/product_entry_shell/opl_bridge',
          '/artifact_inventory',
          '/review_state',
          '/publication_projection',
        ],
        state_index_inputs: {
          workspace_registry_index: '/workspace_locator',
          managed_session_ledger_index: '/session_continuity',
          artifact_projection_index: '/artifact_inventory',
          attention_queue_index: '/automation/automations/0',
          runtime_health_snapshot_index: '/runtime_inventory',
        },
        scheduler: {
          migration_priority: 'p2',
          legacy_scheduler_owner: null,
          legacy_scheduler_residue_policy: 'history_tombstone_or_negative_guard_only',
          replacement_role:
            'RCA consumes the OPL scheduler replacement through sidecar/action/status refs while keeping visual deliverable sequencing inside domain execution.',
          required_domain_refs: [
            'product_entry_manifest',
            'visual_owner_receipt_or_typed_blocker',
            'visual_memory_ref',
            'no_forbidden_write_evidence',
          ],
          daemon_policy: 'not_installed_or_maintained_by_opl',
          daemon_replacement_surface:
            'repo-local session supervision is handler diagnostic only',
        },
      },
    },
  },
  {
    agent_id: 'oma',
    domain_id: 'oplmetaagent',
    target_domain_id: 'opl-meta-agent',
    label: 'OPL Meta Agent',
    series_membership: STANDARD_AGENT_SERIES_MEMBERSHIP,
    brand_cli: 'oma',
    plugin_name: 'opl-meta-agent',
    canonical_plugin_name: 'oma',
    project: 'opl-meta-agent',
    module_id: 'OPLMETAAGENT',
    source_kind: 'opl_standard_codex_carrier',
    installer_kind: 'node',
    installer_relative_paths: [],
    domain_alias: 'agent',
    work_alias: 'agent',
    aliases: [
      'oma',
      'oplmetaagent',
      'opl-meta-agent',
      'opl_meta_agent',
      'meta-agent',
      'meta_agent',
      'agent',
    ],
    ordinary_golden_path:
      'target agent -> stage -> target owner answer -> mechanism or work-order handoff',
    domain_pack_example: 'Agent-Building Pack',
    domain_authority_kernel_examples: [
      'agent-building semantics',
      'developer work-order materialization',
      'mechanism proposal materialization',
      'target-agent no-forbidden-write proof',
      'target-agent typed blocker signer',
    ],
    workspace_profile: {
      default_profile_id: 'one_off',
      workspace_kind: 'agent_foundry_workspace',
      project_kind: 'agent_capability',
      project_collection_label: 'deliverables',
      default_workspace_id: 'agent-foundry-workspace',
      default_project_id: 'agent-001',
    },
    family_runtime_profile: {
      supported: true,
      runtime_domain_id: 'opl-meta-agent',
    },
  },
  {
    agent_id: 'obf',
    domain_id: 'oplbookforge',
    target_domain_id: 'opl-bookforge',
    label: 'OPL Book Forge',
    series_membership: STANDARD_AGENT_SERIES_MEMBERSHIP,
    brand_cli: 'obf',
    plugin_name: 'opl-bookforge',
    canonical_plugin_name: 'obf',
    project: 'opl-bookforge',
    module_id: 'OPLBOOKFORGE',
    source_kind: 'opl_standard_codex_carrier',
    installer_kind: 'node',
    installer_relative_paths: [],
    domain_alias: 'book',
    work_alias: 'book',
    aliases: [
      'bookforge',
      'book-forge',
      'book_forge',
      'obf',
      'oplbookforge',
      'opl-bookforge',
      'opl_bookforge',
      'book',
    ],
    ordinary_golden_path:
      'book -> stage -> domain owner receipt or typed blocker -> manuscript package handoff',
    domain_pack_example: 'Book Manuscript Pack',
    domain_authority_kernel_examples: [
      'book manuscript truth',
      'manuscript quality/export verdict',
      'book artifact authority',
      'style/reference memory accept/reject',
      'owner receipt signer',
      'typed blocker signer',
    ],
    workspace_profile: {
      default_profile_id: 'one_off',
      workspace_kind: 'book_authoring_workspace',
      project_kind: 'book_project',
      project_collection_label: 'books',
      default_workspace_id: 'bookforge-workspace',
      default_project_id: 'book-001',
    },
  },
  {
    agent_id: 'mas-scholar-skills',
    domain_id: 'scholarskills',
    target_domain_id: 'scholarskills',
    label: 'MAS Scholar Skills',
    series_membership: FRAMEWORK_CAPABILITY_PACKAGE_MEMBERSHIP,
    brand_cli: 'mas-scholar-skills',
    plugin_name: 'mas-scholar-skills',
    canonical_plugin_name: 'mas-scholar-skills',
    project: 'mas-scholar-skills',
    module_id: 'SCHOLARSKILLS',
    source_kind: 'repo_plugin_installer',
    installer_kind: 'node',
    installer_relative_paths: [],
    domain_alias: 'scholarskills',
    work_alias: 'capability',
    aliases: [
      'scholarskills',
      'scholar-skills',
      'scholar_skills',
      'mas-scholar-skills',
      'mas_scholar_skills',
      'capability',
      'capabilities',
    ],
    ordinary_golden_path:
      'capability request -> candidate scientific capability refs -> domain owner consumption or typed blocker',
    domain_pack_example: 'Scholar Capability Pack',
    domain_authority_kernel_examples: [
      'professional skill source refs',
      'package manifest and lock refs',
      'workspace or quest sync receipts',
      'domain owner consumption handoff refs',
    ],
  },
] as const satisfies readonly StandardAgentRegistryEntry[];

export type StandardAgentId = typeof STANDARD_AGENT_REGISTRY[number]['agent_id'];

function normalizeAgentKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function listStandardAgentIds() {
  return STANDARD_AGENT_REGISTRY.map((entry) => entry.agent_id);
}

export function listStandardDomainAgentIds() {
  return STANDARD_AGENT_REGISTRY
    .filter((entry) => entry.series_membership === STANDARD_AGENT_SERIES_MEMBERSHIP)
    .map((entry) => entry.agent_id);
}

export function resolveStandardAgent(value: string) {
  const normalized = normalizeAgentKey(value);
  return STANDARD_AGENT_REGISTRY.find((entry) =>
    [entry.agent_id, entry.domain_id, entry.domain_alias, entry.work_alias, ...entry.aliases]
      .some((alias) => normalizeAgentKey(alias) === normalized)
  ) ?? null;
}

export function resolveStandardAgentByDomainId(domainId: string) {
  return STANDARD_AGENT_REGISTRY.find((entry) => entry.domain_id === domainId) ?? null;
}

export function resolveStandardAgentByCanonicalPluginName(canonicalPluginName: string) {
  return STANDARD_AGENT_REGISTRY.find((entry) => entry.canonical_plugin_name === canonicalPluginName) ?? null;
}

/**
 * Normalize a domain selection through the registry. Capability packages are
 * deliberately left unchanged because they are not standard domain agents.
 */
export function normalizeStandardDomainAgentId(value: string) {
  const entry = resolveStandardAgent(value);
  return entry?.series_membership === STANDARD_AGENT_SERIES_MEMBERSHIP
    ? entry.target_domain_id
    : value.trim().toLowerCase();
}

export function standardAgentDomainAliasEntries() {
  return STANDARD_AGENT_REGISTRY.flatMap((entry) =>
    [entry.agent_id, entry.domain_id, entry.domain_alias, entry.work_alias, ...entry.aliases].map((alias) => ({
      alias,
      domain_id: entry.domain_id,
    }))
  );
}

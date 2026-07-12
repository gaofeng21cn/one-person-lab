type JsonRecord = Record<string, unknown>;

export type BuildViewModelSectionsInput = {
  provider: JsonRecord;
  developerMode: JsonRecord;
  modules: JsonRecord;
  settingsControlCenter: JsonRecord;
  agentLabFeedbackSelfEvolution?: JsonRecord;
  feedbackOps?: JsonRecord;
};

function asRecord(value: unknown): JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}
function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function buildSections(input: BuildViewModelSectionsInput) {
  const temporal = asRecord(asRecord(input.provider).temporal);
  const developerMode = asRecord(input.developerMode);
  const moduleSummary = asRecord(asRecord(input.modules).summary);
  return [
    {
      section_id: 'home',
      label: 'Home',
      state: 'ready',
      source_ref: 'app_state.ui_defaults',
      lazy: false,
    },
    {
      section_id: 'runtime',
      label: 'Runtime',
      state: temporal.ready === true ? 'ready' : 'attention_needed',
      source_ref: 'app_state.operator.workbench',
      lazy: false,
    },
    {
      section_id: 'settings_system',
      label: 'System settings',
      state: asString(developerMode.effective_state) ?? 'unknown',
      source_ref: 'app_state.developer_mode + app_state.paths',
      lazy: false,
    },
    {
      section_id: 'settings_runtime',
      label: 'Runtime settings',
      state: asNumber(moduleSummary.default_carriers_count) === null ? 'unknown' : 'ready',
      source_ref: 'app_state.runtime_source_carriers + app_state.provider',
      lazy: false,
    },
    {
      section_id: 'settings_control_center',
      label: 'Settings Control Center',
      state: asString(asRecord(input.settingsControlCenter).surface_kind) ? 'available' : 'unknown',
      source_ref: 'app_state.settings_control_center',
      lazy: false,
    },
    {
      section_id: 'agent_lab_feedback',
      label: 'Agent Lab feedback',
      state: asString(asRecord(input.agentLabFeedbackSelfEvolution).status) ?? 'unknown',
      source_ref: 'app_state.operator.workbench.agent_lab_feedback_self_evolution',
      lazy: false,
    },
    {
      section_id: 'feedbackops',
      label: 'FeedbackOps',
      state: asString(asRecord(input.feedbackOps).status) ?? 'unknown',
      source_ref: 'app_state.operator.workbench.feedbackops',
      lazy: false,
    },
    {
      section_id: 'full_runtime_drilldown',
      label: 'Full runtime drilldown',
      state: 'lazy',
      source_ref: 'opl runtime app-operator-drilldown --detail full --json',
      lazy: true,
    },
  ];
}

export function buildNavigation() {
  return {
    primary_items: [
      { item_id: 'home', label: 'Home', section_ref: 'home' },
      { item_id: 'runtime', label: 'Runtime', section_ref: 'runtime' },
      { item_id: 'settings', label: 'Settings', section_ref: 'settings_system' },
      { item_id: 'update', label: 'Update', section_ref: 'release_channel' },
    ],
    replacement_policy: 'app_repo_owns_navigation_truth_shell_renders_typed_items',
  };
}

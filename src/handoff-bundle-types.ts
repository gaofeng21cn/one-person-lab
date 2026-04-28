export type HandoffBundleWorkspaceLocator = {
  project_id: string | null;
  requested_path: string | null;
  absolute_path: string | null;
  source: string;
  binding_id: string | null;
};

export type HandoffBundleResult = {
  handoff_bundle: {
    surface_id: 'opl_family_handoff_bundle';
    workspace_locator: HandoffBundleWorkspaceLocator;
    domain_manifest_recommendation: Record<string, unknown> | null;
    [key: string]: unknown;
  };
};

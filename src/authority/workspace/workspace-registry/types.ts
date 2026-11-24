export type BoundWorkspaceLocator = {
  surface_kind: string;
  workspace_root: string | null;
  profile_ref: string | null;
  input_path: string | null;
};

export type DirectEntryLocator = {
  command: string | null;
  manifest_command: string | null;
  url: string | null;
  workspace_locator: BoundWorkspaceLocator | null;
};

export type WorkspaceBinding = {
  binding_id: string;
  project_scope_id: string;
  project_id: string;
  project: string;
  workspace_path: string;
  label: string | null;
  status: 'active' | 'inactive' | 'archived';
  direct_entry: DirectEntryLocator;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type ProjectWorkspaceBindingContract = {
  surface_id: 'opl_project_workspace_binding_contract';
  project_id: string;
  project: string;
  workspace_locator_surface_kind: string | null;
  required_locator_fields: string[];
  optional_locator_fields: string[];
  quick_bind_hint: string;
};

export type WorkspaceRegistryFile = {
  version: 'g2';
  bindings: WorkspaceBinding[];
};

export type WorkspaceCatalogAction =
  | 'catalog'
  | 'bind'
  | 'activate'
  | 'archive'
  | 'launch';

export type WorkspaceRegistryOptions = {
  projectId: string;
  projectScopeId?: string;
  workspacePath: string;
  label?: string;
  entryCommand?: string;
  manifestCommand?: string;
  entryUrl?: string;
  workspaceRoot?: string;
  profileRef?: string;
  inputPath?: string;
};

export type WorkspaceRegistryMaintenanceOptions = {
  apply?: boolean;
};

export type WorkspacePathCurrentness = {
  status: 'current' | 'missing' | 'not_directory' | 'unreadable';
  path_exists: boolean;
  is_directory: boolean;
  cause: string | null;
};

import type { MANAGED_UPDATE_OWNER_ACTIONS } from '../../../adapters/integration/index.ts';

export type SettingsActionTaskKind =
  | 'read'
  | 'repair'
  | 'sync'
  | 'apply'
  | 'reload'
  | 'cleanup_plan'
  | 'configure'
  | 'verify'
  | 'check'
  | 'refresh'
  | 'install'
  | 'uninstall'
  | 'create'
  | 'update'
  | 'delete'
  | 'test'
  | 'set_default'
  | typeof MANAGED_UPDATE_OWNER_ACTIONS.revert;

export type SettingsAction = {
  action_id: string;
  stable_id: string;
  label: string;
  section_id: string;
  task_kind: SettingsActionTaskKind;
  taxonomy: string;
  delegated_surface: string;
  payload_fields: string[];
  mutates: string;
  dry_run_supported: boolean;
  confirmation_required: boolean;
  danger_level: 'none' | 'low' | 'medium' | 'high';
  impact: string;
  follow_up_action_ids: string[];
  rollback_action_id?: string;
  verify_action_id?: string;
};

export type SettingsSection = {
  section_id: string;
  label: string;
  description: string;
  state: string;
  source_ref: string;
};

export type SettingsControlCenterGroup = {
  group_id: string;
  label: string;
  role: string;
  route_id: string;
  action_section_ids: string[];
  ordinary_entry_policy: string;
};

export type SettingsSecondaryRoute = {
  route_id: string;
  group_id: string;
  parent_route_id: string;
  label: string;
  role: string;
  action_section_ids: string[];
  ordinary_entry_policy: string;
};

export type SettingsCompatibilityRedirect = {
  source_route_id: string;
  target_route_id: string;
  target_section_id: string;
  resolution_policy: string;
};

export type ConsumerOnlyTruthSurface = {
  surface: string;
  owner: string;
  truth_owner: string;
  app_aion_role: string;
  local_truth_allowed: false;
  current_source_ref: string;
  delegated_action_id: string | null;
  receipt_ref_or_typed_blocker_ref: string | null;
  blocked_reason: string | null;
  required_visible_refs: string[];
  app_owner_receipt_ref_or_typed_blocker_ref?: string | null;
  current_owner_delta_ref?: string;
  runtime_status_source_ref?: string;
  owner_route_ref?: string;
  package_descriptor_ref?: string;
  cleanup_lane_ref?: string;
  domain_owner_decision_ref_or_typed_blocker_ref?: string | null;
};

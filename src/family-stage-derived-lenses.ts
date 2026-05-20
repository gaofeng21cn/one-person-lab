export type FamilyStageDerivedLensId =
  | 'proof_bundle'
  | 'cohort_loop'
  | 'runtime_assumptions'
  | 'runtime_budget'
  | 'replay_certification';

export interface FamilyStageDerivedLensDefinition {
  lens_id: FamilyStageDerivedLensId;
  role: 'diagnostic_only';
  author_required: false;
  default_surface: false;
  can_block_launch: false;
  drilldown_command: string;
  folded_into_readiness: true;
}

export const FAMILY_STAGE_DERIVED_DIAGNOSTIC_LENSES: FamilyStageDerivedLensDefinition[] = [
  {
    lens_id: 'proof_bundle',
    role: 'diagnostic_only',
    author_required: false,
    default_surface: false,
    can_block_launch: false,
    drilldown_command: 'opl stages proof-bundle --domain <domain>',
    folded_into_readiness: true,
  },
  {
    lens_id: 'cohort_loop',
    role: 'diagnostic_only',
    author_required: false,
    default_surface: false,
    can_block_launch: false,
    drilldown_command: 'opl stages cohort-loop --domain <domain>',
    folded_into_readiness: true,
  },
  {
    lens_id: 'runtime_assumptions',
    role: 'diagnostic_only',
    author_required: false,
    default_surface: false,
    can_block_launch: false,
    drilldown_command: 'opl stages assumptions --domain <domain>',
    folded_into_readiness: true,
  },
  {
    lens_id: 'runtime_budget',
    role: 'diagnostic_only',
    author_required: false,
    default_surface: false,
    can_block_launch: false,
    drilldown_command: 'opl stages runtime-budget --domain <domain>',
    folded_into_readiness: true,
  },
  {
    lens_id: 'replay_certification',
    role: 'diagnostic_only',
    author_required: false,
    default_surface: false,
    can_block_launch: false,
    drilldown_command: 'opl stages replay-certification --domain <domain>',
    folded_into_readiness: true,
  },
];

export const FAMILY_STAGE_KERNEL_BLOCKER_SOURCES = [
  'stage_identity',
  'stage_owner',
  'stage_goal',
  'selected_executor_binding',
  'authority_boundary',
  'requires_ensures_composition',
  'scope_refs',
  'runtime_event_refs',
  'receipt_replay_audit_refs',
] as const;

export function familyStageDerivedLensFor(id: FamilyStageDerivedLensId) {
  return FAMILY_STAGE_DERIVED_DIAGNOSTIC_LENSES.find((lens) => lens.lens_id === id) ?? null;
}

export type FamilyStageDerivedLensId =
  | 'proof_bundle'
  | 'cohort_loop'
  | 'runtime_assumptions'
  | 'runtime_budget'
  | 'replay_certification';

export type FamilyStageDerivedLensRole = 'default_operator_entry' | 'diagnostic_drilldown';

export interface FamilyStageDerivedLensDefinition {
  lens_id: FamilyStageDerivedLensId;
  command: string;
  role: 'diagnostic_drilldown';
  author_required: false;
  default_surface: false;
  default_help_surface: false;
  can_block_launch: false;
  drilldown_command: string;
  folded_into_command: typeof DEFAULT_STAGE_OPERATOR_COMMAND;
  folded_into_readiness: true;
}

export type FamilyStageDerivedLens =
  | {
    lens_id: 'stage_readiness';
    command: typeof DEFAULT_STAGE_OPERATOR_COMMAND;
    role: 'default_operator_entry';
    folded_into_command: null;
    default_help_surface: true;
  }
  | FamilyStageDerivedLensDefinition;

export const DEFAULT_STAGE_OPERATOR_COMMAND = 'stages readiness';

export const FAMILY_STAGE_DERIVED_DIAGNOSTIC_LENSES: FamilyStageDerivedLensDefinition[] = [
  {
    lens_id: 'proof_bundle',
    command: 'stages proof-bundle',
    role: 'diagnostic_drilldown',
    author_required: false,
    default_surface: false,
    default_help_surface: false,
    can_block_launch: false,
    drilldown_command: 'opl stages proof-bundle --domain <domain>',
    folded_into_command: DEFAULT_STAGE_OPERATOR_COMMAND,
    folded_into_readiness: true,
  },
  {
    lens_id: 'cohort_loop',
    command: 'stages cohort-loop',
    role: 'diagnostic_drilldown',
    author_required: false,
    default_surface: false,
    default_help_surface: false,
    can_block_launch: false,
    drilldown_command: 'opl stages cohort-loop --domain <domain>',
    folded_into_command: DEFAULT_STAGE_OPERATOR_COMMAND,
    folded_into_readiness: true,
  },
  {
    lens_id: 'runtime_assumptions',
    command: 'stages assumptions',
    role: 'diagnostic_drilldown',
    author_required: false,
    default_surface: false,
    default_help_surface: false,
    can_block_launch: false,
    drilldown_command: 'opl stages assumptions --domain <domain>',
    folded_into_command: DEFAULT_STAGE_OPERATOR_COMMAND,
    folded_into_readiness: true,
  },
  {
    lens_id: 'runtime_budget',
    command: 'stages runtime-budget',
    role: 'diagnostic_drilldown',
    author_required: false,
    default_surface: false,
    default_help_surface: false,
    can_block_launch: false,
    drilldown_command: 'opl stages runtime-budget --domain <domain>',
    folded_into_command: DEFAULT_STAGE_OPERATOR_COMMAND,
    folded_into_readiness: true,
  },
  {
    lens_id: 'replay_certification',
    command: 'stages replay-certification',
    role: 'diagnostic_drilldown',
    author_required: false,
    default_surface: false,
    default_help_surface: false,
    can_block_launch: false,
    drilldown_command: 'opl stages replay-certification --domain <domain>',
    folded_into_command: DEFAULT_STAGE_OPERATOR_COMMAND,
    folded_into_readiness: true,
  },
];

export const FAMILY_STAGE_DERIVED_LENSES: FamilyStageDerivedLens[] = [
  {
    lens_id: 'stage_readiness',
    command: DEFAULT_STAGE_OPERATOR_COMMAND,
    role: 'default_operator_entry',
    folded_into_command: null,
    default_help_surface: true,
  },
  ...FAMILY_STAGE_DERIVED_DIAGNOSTIC_LENSES,
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

export function familyStageDerivedLensByCommand(command: string) {
  return FAMILY_STAGE_DERIVED_LENSES.find((lens) => lens.command === command) ?? null;
}

export function requireFamilyStageDerivedLens(command: string) {
  const lens = familyStageDerivedLensByCommand(command);
  if (!lens) {
    throw new Error(`Missing family stage derived lens registry declaration for ${command}.`);
  }
  return lens;
}

export function familyStageDiagnosticLensCommands() {
  return FAMILY_STAGE_DERIVED_DIAGNOSTIC_LENSES.map((lens) => lens.command);
}

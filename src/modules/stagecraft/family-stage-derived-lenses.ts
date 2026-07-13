export type FamilyStageDerivedLensId =
  | 'stage_graph'
  | 'proof_bundle'
  | 'cohort_loop'
  | 'runtime_assumptions'
  | 'runtime_budget'
  | 'stage_pack_registry'
  | 'stage_pack_source_spec'
  | 'replay_certification';

export type FamilyStageDerivedLensRole = 'default_operator_entry' | 'diagnostic_drilldown';

export const DEFAULT_STAGE_OPERATOR_COMMAND = 'stages readiness';

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

export type FamilyStageDerivedLens = {
  lens_id: 'stage_readiness' | FamilyStageDerivedLensId;
  command: string;
  role: FamilyStageDerivedLensRole;
  folded_into_command: typeof DEFAULT_STAGE_OPERATOR_COMMAND | null;
  default_help_surface: boolean;
};

export const FAMILY_STAGE_DERIVED_DIAGNOSTIC_LENSES: FamilyStageDerivedLensDefinition[] = [
  {
    lens_id: 'stage_graph',
    command: 'stages graph',
    role: 'diagnostic_drilldown',
    author_required: false,
    default_surface: false,
    default_help_surface: false,
    can_block_launch: false,
    drilldown_command: 'opl stages graph --domain <domain>',
    folded_into_command: DEFAULT_STAGE_OPERATOR_COMMAND,
    folded_into_readiness: true,
  },
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
    lens_id: 'stage_pack_registry',
    command: 'stages registry',
    role: 'diagnostic_drilldown',
    author_required: false,
    default_surface: false,
    default_help_surface: false,
    can_block_launch: false,
    drilldown_command: 'opl stages registry --domain <domain>',
    folded_into_command: DEFAULT_STAGE_OPERATOR_COMMAND,
    folded_into_readiness: true,
  },
  {
    lens_id: 'stage_pack_source_spec',
    command: 'stages source-spec',
    role: 'diagnostic_drilldown',
    author_required: false,
    default_surface: false,
    default_help_surface: false,
    can_block_launch: false,
    drilldown_command: 'opl stages source-spec --domain <domain>',
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
  ...FAMILY_STAGE_DERIVED_DIAGNOSTIC_LENSES.map((lens) => ({
    lens_id: lens.lens_id,
    command: lens.command,
    role: lens.role,
    folded_into_command: lens.folded_into_command,
    default_help_surface: lens.default_help_surface,
  })),
];

export const FAMILY_STAGE_KERNEL_BLOCKER_SOURCES = [
  'stage_identity',
  'stage_owner',
  'selected_executor_binding',
  'authority_boundary',
  'explicit_human_gate',
] as const;

export const FAMILY_STAGE_KERNEL_REQUIRED_REFS = [
  'stage_id',
  'owner',
  'authority_boundary',
  'selected_executor_binding',
  'explicit_human_gate_ref_when_required',
] as const;

export const FAMILY_STAGE_AI_STRATEGY_ADVISORY_REFS = [
  'prompt_refs',
  'skill_refs',
  'knowledge_refs',
  'evaluation_refs',
  'runtime_assumptions',
  'monitor_refs',
  'cohort_query_refs',
  'trigger_refs',
  'runtime_budget_refs',
  'domain_review_refs',
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

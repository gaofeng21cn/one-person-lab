const AGENT_LAB_WORKFLOW_TEMPLATE_ALLOWED_OUTPUTS = [
  'suite_topology_ref',
  'verifier_ref',
  'work_order_draft_ref',
] as const;

const AGENT_LAB_WORKFLOW_TEMPLATE_FORBIDDEN_CLAIMS = [
  'runtime_substrate',
  'ordinary_workflow_compiler',
  'domain_truth',
  'quality_verdict',
  'owner_receipt',
] as const;

const AGENT_LAB_WORKFLOW_TEMPLATE_AUTHORITY_BOUNDARY = {
  can_define_runtime_substrate: false,
  can_compile_ordinary_user_workflow: false,
  can_replace_runway_or_temporal: false,
  can_write_domain_truth: false,
  can_authorize_quality_verdict: false,
  can_write_owner_receipt: false,
  can_mutate_domain_artifact: false,
  can_write_memory_body: false,
};

const WORKFLOW_TEMPLATE_PATTERNS = [
  {
    pattern_id: 'classify_and_act',
    pattern_role: 'route evidence or blocker refs into a bounded next action',
  },
  {
    pattern_id: 'fan_out_and_synthesize',
    pattern_role: 'run disjoint suite lanes and synthesize refs-only evidence',
  },
  {
    pattern_id: 'adversarial_verification',
    pattern_role: 'bind an independent verifier ref to a candidate output',
  },
  {
    pattern_id: 'generate_and_filter',
    pattern_role: 'generate candidate refs and filter them through explicit gates',
  },
  {
    pattern_id: 'tournament',
    pattern_role: 'compare variants while keeping loser refs learning-only',
  },
  {
    pattern_id: 'loop_until_done',
    pattern_role: 'repeat a suite topology until a typed done or blocker ref appears',
  },
  {
    pattern_id: 'model_routing',
    pattern_role: 'select executor or model trial refs without changing defaults',
  },
  {
    pattern_id: 'worktree_isolation',
    pattern_role: 'separate patch work orders by target checkout and write set',
  },
] as const;

function buildWorkflowTemplatePattern(pattern: (typeof WORKFLOW_TEMPLATE_PATTERNS)[number]) {
  return {
    ...pattern,
    template_ref: `workflow-template:agent-lab/foundry-lab/${pattern.pattern_id}`,
    suite_topology_ref: `suite-topology-ref:agent-lab/foundry-lab/${pattern.pattern_id}`,
    verifier_ref: `verifier-ref:agent-lab/foundry-lab/${pattern.pattern_id}`,
    work_order_draft_ref: `work-order-draft-ref:agent-lab/foundry-lab/${pattern.pattern_id}`,
    allowed_outputs: AGENT_LAB_WORKFLOW_TEMPLATE_ALLOWED_OUTPUTS,
    forbidden_claims: AGENT_LAB_WORKFLOW_TEMPLATE_FORBIDDEN_CLAIMS,
    authority_boundary: AGENT_LAB_WORKFLOW_TEMPLATE_AUTHORITY_BOUNDARY,
  };
}

export function buildAgentLabWorkflowTemplateCatalog() {
  const patterns = WORKFLOW_TEMPLATE_PATTERNS.map(buildWorkflowTemplatePattern);
  return {
    surface_kind: 'opl_agent_lab_workflow_template_catalog',
    catalog_id: 'workflow-template-catalog:opl-agent-lab/foundry-lab-dynamic-suite-topology',
    status: 'ready',
    refs_only: true,
    read_model_role: 'foundry_lab_suite_topology_workflow_template_layer',
    template_scope: 'dynamic_suite_topology_and_work_order_draft_refs_only',
    template_catalog: {
      catalog_ref: 'workflow-template-catalog-ref:opl-agent-lab/foundry-lab-dynamic-suite-topology',
      template_count: patterns.length,
      patterns,
    },
    allowed_outputs: AGENT_LAB_WORKFLOW_TEMPLATE_ALLOWED_OUTPUTS,
    forbidden_claims: AGENT_LAB_WORKFLOW_TEMPLATE_FORBIDDEN_CLAIMS,
    source_refs: [
      'human_doc:docs/runtime/opl-agent-lab-control-plane#dynamic-workflow-template',
      'human_doc:docs/references/brand-modules/foundry-lab#dynamic-workflow-template',
    ],
    authority_boundary: AGENT_LAB_WORKFLOW_TEMPLATE_AUTHORITY_BOUNDARY,
  };
}

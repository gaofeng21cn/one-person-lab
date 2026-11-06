export function starterStageQualityFiles(domainId: string, stageId: string) {
  const rolesRef = 'agent/prompts/stage-quality-cycle-roles.md';
  return [{
    path: rolesRef,
    content: `# Stage quality roles

## Producer
Produce the Stage's requested domain artifact or diagnostic from the bound request and evidence. Recommend the next semantic route.

## Reviewer
Review the actual artifact against the Stage rubric and sources. Preserve scope and authority; explain material defects and their consequences.

## Repairer
Repair accepted findings within the original Stage scope. Return changed artifact refs and finding dispositions.

## Re Reviewer
Check repaired findings and affected dependencies. Keep unresolved defects visible; do not substitute transport success for domain acceptance.
`,
  }, {
    path: 'contracts/stage_quality_cycle_policy.json',
    content: `${JSON.stringify({
      surface_kind: 'opl_stage_quality_cycle_policy_set',
      version: 'stage-quality-cycle-policy-set.v1',
      domain_id: domainId,
      owner: domainId,
      cross_stage_route_selection: {
        primary_only_decisive_attempt_role: 'producer',
        formal_review_decisive_attempt_roles: ['reviewer', 're_reviewer'],
        repairer_can_be_decisive_attempt: false,
        repair_required_review_or_re_review_may_select_cross_stage_route_back_before_budget_exhaustion: true,
        repair_required_cross_stage_route_back_requires_target_different_from_current_stage: true,
        repair_required_review_or_re_review_may_select_other_terminal_route_before_budget_exhaustion: false,
        repair_required_review_or_re_review_may_select_terminal_route_after_budget_exhaustion: true,
        same_stage_repair_required_with_budget_remaining_continues_quality_loop: true,
        cross_stage_route_back_requires_narrowest_canonical_owner_stage: true,
      },
      stages: {
        [stageId]: {
          surface_kind: 'opl_stage_quality_cycle_policy',
          version: 'stage-quality-cycle-policy.v1',
          enabled: true,
          stage_prompt_ref: `agent/prompts/${stageId}.md`,
          role_prompt_refs: Object.fromEntries(['producer', 'reviewer', 'repairer', 're_reviewer']
            .map((role) => [role, `${rolesRef}#${role.replaceAll('_', '-')}`])),
          quality_rubric_refs: ['agent/quality_gates/domain_acceptance.md'],
          in_thread_refinement: { allowed: true, authoritative: false },
          formal_review: { required: false, risk_tier: 'medium', review_depth: 'focused', context_isolation_required: true, max_repair_rounds: 0 },
          budget_exhaustion: 'complete_with_quality_debt_if_consumable',
          attempt_boundary: { inherits_stage_goal_scope_authority: true, role_overlay_may_only_narrow: true, controller_creates_next_attempt: true, attempt_is_not_sub_stage: true },
        },
      },
    }, null, 2)}\n`,
  }];
}

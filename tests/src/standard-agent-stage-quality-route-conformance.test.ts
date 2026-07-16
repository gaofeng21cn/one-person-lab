import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildStageQualityRoutePromptAlignmentChecks } from '../../src/modules/pack/standard-domain-agent-stage-quality-route-conformance.ts';
import {
  buildReadyAgentRepo,
  writeJson,
} from './cli/cases/agents-conformance-fixtures.ts';
import { runCliReadOnly } from './cli/helpers.ts';

const canonicalRouteSelection = {
  primary_only_decisive_attempt_role: 'producer',
  formal_review_decisive_attempt_roles: ['reviewer', 're_reviewer'],
  repairer_can_be_decisive_attempt: false,
  repair_required_review_or_re_review_may_select_cross_stage_route_back_before_budget_exhaustion: true,
  repair_required_cross_stage_route_back_requires_target_different_from_current_stage: true,
  repair_required_review_or_re_review_may_select_other_terminal_route_before_budget_exhaustion: false,
  repair_required_review_or_re_review_may_select_terminal_route_after_budget_exhaustion: true,
  same_stage_repair_required_with_budget_remaining_continues_quality_loop: true,
  cross_stage_route_back_requires_narrowest_canonical_owner_stage: true,
};

function readJson(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeQualityRoutePolicy(
  repoDir: string,
  rolePrompt: string,
  options: { declare?: boolean } = {},
) {
  const rolePromptRef = 'agent/prompts/stage-quality-cycle-roles.md';
  const manifestPath = path.join(repoDir, 'agent', 'stages', 'manifest.json');
  const manifest = readJson(manifestPath);
  const stage = manifest.stages[0];
  const policyRef = `contracts/stage_quality_cycle_policy.json#/stages/${stage.stage_id}`;
  fs.mkdirSync(path.join(repoDir, 'agent', 'prompts'), { recursive: true });
  fs.writeFileSync(path.join(repoDir, rolePromptRef), rolePrompt, 'utf8');
  if (options.declare !== false) {
    stage.stage_quality_cycle_policy_ref = policyRef;
    writeJson(manifestPath, manifest);
  }
  writeJson(path.join(repoDir, 'contracts', 'stage_quality_cycle_policy.json'), {
    surface_kind: 'opl_domain_stage_quality_cycle_policy_profile',
    cross_stage_route_selection: canonicalRouteSelection,
    review_attempt_contract: {
      role_prompt_refs: {
        producer: `${rolePromptRef}#producer`,
        reviewer: `${rolePromptRef}#reviewer`,
        repairer: `${rolePromptRef}#repairer`,
        re_reviewer: `${rolePromptRef}#re-reviewer`,
      },
    },
    stages: {
      [stage.stage_id]: {
        surface_kind: 'opl_stage_quality_cycle_policy',
        version: 'stage-quality-cycle-policy.v1',
        enabled: true,
        stage_prompt_ref: stage.prompt_ref,
        role_prompt_refs: {
          producer: `${rolePromptRef}#producer`,
          reviewer: `${rolePromptRef}#reviewer`,
          repairer: `${rolePromptRef}#repairer`,
          re_reviewer: `${rolePromptRef}#re-reviewer`,
        },
        quality_rubric_refs: [stage.quality_gate_refs[0]],
        in_thread_refinement: { allowed: true, authoritative: false },
        formal_review: {
          required: true,
          risk_tier: 'medium',
          review_depth: 'full',
          context_isolation_required: true,
          max_repair_rounds: 3,
        },
        budget_exhaustion: 'complete_with_quality_debt_if_consumable',
        attempt_boundary: {
          inherits_stage_goal_scope_authority: true,
          role_overlay_may_only_narrow: true,
          controller_creates_next_attempt: true,
          attempt_is_not_sub_stage: true,
        },
      },
    },
  });
  return { manifestPath, policyRef, rolePromptRef, stage };
}

const alignedRolePrompt = `# Stage Quality Cycle Roles

## Producer

Produce the Stage artifact. A primary-only producer may be decisive; a formal-Review producer is not.

## Reviewer

\`same_stage_repair_required\`: while budget remains, repair inside this Stage.
\`cross_stage_route_back_before_budget_exhaustion\`: when another declared Stage is the narrowest owner, return repair_required plus route_back to that Stage.

## Repairer

Repair accepted findings without selecting a terminal Stage route.

## Re Reviewer

\`same_stage_repair_required\`: while budget remains, continue the fresh repair loop in this Stage.
\`cross_stage_route_back_before_budget_exhaustion\`: when another declared Stage is the narrowest owner, return repair_required plus route_back to that Stage.
`;

test('stage quality route prompt conformance is inactive for missing or orphan policy files', () => {
  const missingRepo = buildReadyAgentRepo();
  const missing = buildStageQualityRoutePromptAlignmentChecks(missingRepo);
  assert.equal(missing.status, 'not_applicable');
  assert.equal(missing.policy_status, 'not_declared');

  const orphanRepo = buildReadyAgentRepo();
  writeQualityRoutePolicy(orphanRepo, alignedRolePrompt, { declare: false });
  const orphan = buildStageQualityRoutePromptAlignmentChecks(orphanRepo);
  assert.equal(orphan.status, 'not_applicable');
  assert.equal(orphan.policy_status, 'not_declared');
  assert.deepEqual(orphan.declared_policy_refs, []);
});

test('stage quality route prompt conformance ignores a different valid repo-contained policy path', () => {
  const repoDir = buildReadyAgentRepo();
  const { manifestPath, stage } = writeQualityRoutePolicy(repoDir, alignedRolePrompt);
  const alternateRef = `contracts/alternate_stage_quality_cycle_policy.json#/stages/${stage.stage_id}`;
  fs.copyFileSync(
    path.join(repoDir, 'contracts', 'stage_quality_cycle_policy.json'),
    path.join(repoDir, 'contracts', 'alternate_stage_quality_cycle_policy.json'),
  );
  const manifest = readJson(manifestPath);
  manifest.stages[0].stage_quality_cycle_policy_ref = alternateRef;
  writeJson(manifestPath, manifest);

  const checks = buildStageQualityRoutePromptAlignmentChecks(repoDir);
  assert.equal(checks.status, 'not_applicable');
  assert.equal(checks.policy_status, 'not_declared');
  assert.deepEqual(checks.declared_policy_refs, [alternateRef]);
});

test('stage quality route prompt conformance accepts the canonical same-stage and cross-stage split', () => {
  const repoDir = buildReadyAgentRepo();
  writeQualityRoutePolicy(repoDir, alignedRolePrompt);

  const checks = buildStageQualityRoutePromptAlignmentChecks(repoDir);

  assert.equal(checks.status, 'passed');
  assert.deepEqual(checks.blockers, []);
  assert.equal(checks.manifest_status, 'resolved');
  assert.equal(checks.declared_policy_refs.length, 1);
  assert.deepEqual(checks.resolved_role_prompt_refs, {
    reviewer: ['agent/prompts/stage-quality-cycle-roles.md#reviewer'],
    re_reviewer: ['agent/prompts/stage-quality-cycle-roles.md#re-reviewer'],
  });
});

test('stage quality route prompt conformance rejects missing or reversed scoped route authority', () => {
  for (const mutate of [
    (route: Record<string, unknown>) => { delete route.primary_only_decisive_attempt_role; },
    (route: Record<string, unknown>) => { route.formal_review_decisive_attempt_roles = ['producer']; },
    (route: Record<string, unknown>) => { route.repairer_can_be_decisive_attempt = true; },
  ]) {
    const repoDir = buildReadyAgentRepo();
    writeQualityRoutePolicy(repoDir, alignedRolePrompt);
    const policyPath = path.join(repoDir, 'contracts', 'stage_quality_cycle_policy.json');
    const policy = readJson(policyPath);
    mutate(policy.cross_stage_route_selection);
    writeJson(policyPath, policy);

    const checks = buildStageQualityRoutePromptAlignmentChecks(repoDir);
    assert.equal(checks.status, 'blocked');
    assert.equal(
      checks.blockers.some((blocker) =>
        blocker.startsWith('stage_quality_cross_stage_route_selection_invalid:')
      ),
      true,
    );
  }
});

test('stage quality route prompt conformance rejects an ambiguous budget-only recommendation contract', () => {
  const repoDir = buildReadyAgentRepo();
  writeQualityRoutePolicy(repoDir, alignedRolePrompt);
  const policyPath = path.join(repoDir, 'contracts', 'stage_quality_cycle_policy.json');
  const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
  policy.review_attempt_contract.route_authority_contract = {
    repair_required_with_budget_remaining_route_output: 'route_impact.stage_route_recommendation',
    producer_or_repairer_may_return_terminal_route_decision: false,
  };
  writeJson(policyPath, policy);

  const checks = buildStageQualityRoutePromptAlignmentChecks(repoDir);

  assert.equal(checks.status, 'blocked');
  assert.equal(
    checks.blockers.some((blocker) =>
      blocker.startsWith('stage_quality_ambiguous_route_policy_field_forbidden:')
    ),
    true,
  );
  assert.equal(
    checks.blockers.filter((blocker) =>
      blocker.startsWith('stage_quality_ambiguous_route_policy_field_forbidden:')
    ).length,
    2,
  );
});

test('every policy-referenced repair_required prompt must name both repair branches', () => {
  for (const wording of [
    'repair budget remaining',
    'another repair round remains',
    'while budget remains',
    '修复预算仍可用',
  ]) {
    const repoDir = buildReadyAgentRepo();
    const { stage } = writeQualityRoutePolicy(repoDir, alignedRolePrompt);
    fs.appendFileSync(
      path.join(repoDir, stage.prompt_ref),
      `\nReturn outcome repair_required when ${wording}.\n`,
      'utf8',
    );

    const checks = buildStageQualityRoutePromptAlignmentChecks(repoDir);
    assert.equal(checks.status, 'blocked');
    assert.equal(checks.repair_required_prompt_refs.includes(stage.prompt_ref), true);
    assert.equal(
      checks.blockers.includes(
        `stage_quality_route_prompt_marker_missing:repair_required_prompt:${stage.prompt_ref}:same_stage_repair_required`,
      ),
      true,
    );
  }

  const unrelatedRepo = buildReadyAgentRepo();
  const { stage } = writeQualityRoutePolicy(unrelatedRepo, alignedRolePrompt);
  fs.appendFileSync(
    path.join(unrelatedRepo, stage.prompt_ref),
    '\nKeep the professional evidence order while budget remains.\n',
    'utf8',
  );
  assert.equal(buildStageQualityRoutePromptAlignmentChecks(unrelatedRepo).status, 'passed');
});

test('stage quality route prompt conformance fails closed on traversal and policy symlink escape', (t) => {
  const traversalRepo = buildReadyAgentRepo();
  const { stage } = writeQualityRoutePolicy(traversalRepo, alignedRolePrompt);
  const traversalPolicyPath = path.join(traversalRepo, 'contracts', 'stage_quality_cycle_policy.json');
  const traversalPolicy = readJson(traversalPolicyPath);
  traversalPolicy.stages[stage.stage_id].stage_prompt_ref = '../outside-stage.md';
  writeJson(traversalPolicyPath, traversalPolicy);
  const traversal = buildStageQualityRoutePromptAlignmentChecks(traversalRepo);
  assert.equal(traversal.status, 'blocked');
  assert.equal(
    traversal.blockers.includes('stage_quality_cycle_prompt_ref_invalid:../outside-stage.md'),
    true,
  );

  const symlinkRepo = buildReadyAgentRepo();
  writeQualityRoutePolicy(symlinkRepo, alignedRolePrompt);
  const policyPath = path.join(symlinkRepo, 'contracts', 'stage_quality_cycle_policy.json');
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-quality-policy-outside-'));
  t.after(() => fs.rmSync(outsideDir, { recursive: true, force: true }));
  const outsidePolicy = path.join(outsideDir, 'stage_quality_cycle_policy.json');
  fs.copyFileSync(policyPath, outsidePolicy);
  fs.rmSync(policyPath);
  fs.symlinkSync(outsidePolicy, policyPath);
  const escaped = buildStageQualityRoutePromptAlignmentChecks(symlinkRepo);
  assert.equal(escaped.status, 'blocked');
  assert.equal(escaped.policy_status, 'invalid_declaration');
  assert.equal(
    escaped.blockers.some((blocker) => blocker.startsWith('stage_quality_cycle_policy_ref_invalid:')),
    true,
  );
});

test('stage quality route prompt conformance accepts a policy symlink that stays inside the repo', () => {
  const repoDir = buildReadyAgentRepo();
  writeQualityRoutePolicy(repoDir, alignedRolePrompt);
  const policyPath = path.join(repoDir, 'contracts', 'stage_quality_cycle_policy.json');
  const targetPath = path.join(repoDir, 'contracts', 'stage_quality_cycle_policy.target.json');
  fs.renameSync(policyPath, targetPath);
  fs.symlinkSync('stage_quality_cycle_policy.target.json', policyPath);

  const checks = buildStageQualityRoutePromptAlignmentChecks(repoDir);
  assert.equal(checks.status, 'passed');
  assert.deepEqual(checks.blockers, []);
});

test('agents conformance fails closed when a reviewer fragment omits the cross-stage early route-back branch', async () => {
  const repoDir = buildReadyAgentRepo();
  writeQualityRoutePolicy(repoDir, alignedRolePrompt.replace(
    /`cross_stage_route_back_before_budget_exhaustion`[^\n]*\n/,
    '',
  ));

  const report = (await runCliReadOnly([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ])).standard_domain_agent_conformance;
  const checks = report.reports[0].stage_quality_route_prompt_alignment_checks;

  assert.equal(report.status, 'blocked');
  assert.equal(checks.status, 'blocked');
  assert.equal(
    checks.blockers.includes(
      'stage_quality_route_prompt_marker_missing:reviewer:agent/prompts/stage-quality-cycle-roles.md#reviewer:cross_stage_route_back_before_budget_exhaustion',
    ),
    true,
  );
});

test('reviewer and re-reviewer fragments each require both route markers', () => {
  for (const role of [
    { heading: 'Reviewer', role: 'reviewer', fragment: 'reviewer' },
    { heading: 'Re Reviewer', role: 're_reviewer', fragment: 're-reviewer' },
  ]) {
    for (const marker of [
      'same_stage_repair_required',
      'cross_stage_route_back_before_budget_exhaustion',
    ]) {
      const sectionStart = alignedRolePrompt.indexOf(`## ${role.heading}`);
      const sectionEnd = alignedRolePrompt.indexOf('\n## ', sectionStart + 3);
      const end = sectionEnd === -1 ? alignedRolePrompt.length : sectionEnd;
      const section = alignedRolePrompt.slice(sectionStart, end);
      const linePattern = new RegExp(`^.*${marker}.*\\n?`, 'm');
      const rolePrompt = `${alignedRolePrompt.slice(0, sectionStart)}${section.replace(linePattern, '')}${alignedRolePrompt.slice(end)}`;
      const repoDir = buildReadyAgentRepo();
      writeQualityRoutePolicy(repoDir, rolePrompt);

      const checks = buildStageQualityRoutePromptAlignmentChecks(repoDir);
      assert.equal(checks.status, 'blocked');
      assert.equal(
        checks.blockers.includes(
          `stage_quality_route_prompt_marker_missing:${role.role}:agent/prompts/stage-quality-cycle-roles.md#${role.fragment}:${marker}`,
        ),
        true,
      );
    }
  }
});

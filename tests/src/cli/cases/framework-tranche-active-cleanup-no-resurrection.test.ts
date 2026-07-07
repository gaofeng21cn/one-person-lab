import { assert, fs, path, repoRoot, runCli, test } from '../helpers.ts';

const guardParts = [
  ['active-cleanup-current-role-guard.ts', 'buildActiveCleanupCurrentRoleGuardReadback'],
  ['domain-progress-runtime-guard.ts', 'buildDomainProgressTransitionRuntimeGuardReadback'],
  ['runtime-environment-guard.ts', 'buildRuntimeEnvironmentSubstrateGuardReadback'],
  ['ordinary-progress-guard.ts', 'buildOrdinaryProgressGuardReadback'],
  ['primitive-runtime-owner-route-guard.ts', 'buildPrimitiveRuntimeOwnerRouteGuardReadback'],
  ['generated-hosted-boundary-guard.ts', 'buildGeneratedHostedBoundaryReadback'],
  ['memory-artifact-lifecycle-boundary-guard.ts', 'buildMemoryArtifactLifecycleBoundaryGuardReadback'],
  ['standard-agent-landing-guard.ts', 'buildStandardAgentLandingAcceptanceGuardReadback'],
] as const;

test('framework tranche backlog exposes active cleanup current-role guard without authority claims', () => {
  const readback = runCli([
    'framework',
    'tranche-backlog',
    '--family-defaults',
  ]).framework_tranche_backlog;
  const guard = readback.active_cleanup_current_role_guard;

  assert.equal(guard.surface_kind, 'opl_active_cleanup_current_role_guard_readback');
  assert.equal(guard.status, 'closed_structure_gate_not_live_evidence');
  assert.deepEqual(guard.milestone_ids, [
    'strict_source_purity_private_wrapper_retirement',
    'domain_pack_generated_hosted_surfaces',
    'standard_agent_landing_acceptance_guard',
    'app_active_shell_hermes_convergence',
    'support_repo_profile_no_resurrection',
  ]);
  assert.ok(
    guard.forbidden_surface_roles.includes(
      'AGUI_foreground_or_default_GUI_route',
    ),
  );
  assert.ok(
    guard.forbidden_surface_roles.includes(
      'private_residue_inventory_as_ordinary_owner_delta',
    ),
  );
  assert.ok(guard.allowed_current_surface_roles.includes('domain_handler_target'));
  assert.ok(guard.allowed_current_surface_roles.includes('refs_only_adapter'));
  assert.ok(
    guard.regression_guard_refs.includes('tests/src/active-path-residue-scan.test.ts'),
  );
  assert.ok(
    guard.source_refs.includes(
      'src/modules/foundry-lab/framework-tranche-backlog-parts/domain-source-ref-integrity-guard.ts',
    ),
  );
  assert.equal(
    guard.active_guard_coverage.generated_default_entry_no_resurrection_gate,
    'domain-pack-compiler-contract.generated_interface_bundle.generated_default_entry_no_resurrection_gate',
  );
  assert.equal(
    guard.structural_closeout_guard.can_close_non_live_structure_gate,
    true,
  );
  assert.ok(
    guard.structural_closeout_guard.required_current_truth_surfaces.includes(
      'stale_compat_retirement_guard',
    ),
  );
  assert.ok(
    guard.structural_closeout_guard.cannot_claim.includes(
      'physical_delete_authorized',
    ),
  );
  assert.ok(guard.structural_closeout_guard.cannot_claim.includes('full_goal_complete'));
  assert.equal(
    guard.no_second_truth_guard.cleanup_guard_can_create_missing_contract_alias,
    false,
  );
  assert.equal(
    guard.no_second_truth_guard.cleanup_guard_can_authorize_physical_delete,
    false,
  );
  assert.equal(guard.authority_boundary.can_restore_AGUI_foreground_route, false);
  assert.equal(guard.authority_boundary.can_authorize_physical_delete, false);
  assert.equal(
    guard.false_ready_guard.no_violation_scan_can_authorize_physical_delete,
    false,
  );
  assert.equal(
    guard.false_ready_guard.support_profile_clean_can_claim_foundry_agent_truth_membership,
    false,
  );
});

test('framework tranche backlog guard readbacks stay split behind a thin facade', () => {
  const facade = fs.readFileSync(
    path.join(repoRoot, 'src/modules/foundry-lab/framework-tranche-backlog-parts/guard-readbacks.ts'),
    'utf8',
  );

  assert.equal(facade.includes('export function '), false);
  assert.equal(facade.trim().split(/\r?\n/).length, guardParts.length);

  for (const [fileName, exportName] of guardParts) {
    assert.match(
      facade,
      new RegExp(`export \\{ ${exportName} \\} from './${fileName.replace('.', '\\.')}'`),
    );
    const source = fs.readFileSync(
      path.join(repoRoot, 'src/modules/foundry-lab/framework-tranche-backlog-parts', fileName),
      'utf8',
    );
    assert.match(source, new RegExp(`export function ${exportName}\\(`));
    assert.ok(
      source.trim().split(/\r?\n/).length <= 240,
      `${fileName} should stay inside the focused source-boundary budget`,
    );
  }
});

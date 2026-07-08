import {
  assert,
  fs,
  parseJsonText,
  path,
  test,
} from './shared.ts';

test('DomainProgressTransitionRuntime first slice stays inside existing brand-module partition', () => {
  const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..', '..', '..');
  const contract = parseJsonText(fs.readFileSync(
    path.join(repoRoot, 'contracts', 'opl-framework', 'stage-route-scheduler-contract.json'),
    'utf8',
  )) as any;
  const slice = contract.stage_route_arbiter_substrate_contract.domain_progress_transition_runtime_first_slice;

  assert.equal(slice.surface_kind, 'opl_domain_progress_transition_runtime_first_slice');
  assert.equal(slice.status, 'runtime_slice_landed_non_ready');
  assert.equal(slice.brand_module_partition.module_count_policy, 'no_new_brand_module');
  assert.match(slice.brand_module_partition.Runway, /current-control intake/);
  assert.match(slice.brand_module_partition.Pack, /command\/outbox\/event shape/);
  assert.match(slice.brand_module_partition.Stagecraft, /StageRun identity/);
  assert.match(slice.brand_module_partition.Console, /read-model metadata/);
  assert.match(slice.brand_module_partition.Ledger, /outbox\/event\/replay refs/);
  assert.equal(
    slice.concepts.TransitionDecisionEngine.durable_substrate_first_slice.current_latest_policy,
    'exactly_one_latest_current_decision_per_obligation_identity',
  );
  assert.match(
    slice.concepts.TransitionDecisionEngine.landed_support,
    /NonAdvancingApply is projected as metadata/,
  );
  assert.match(
    slice.concepts.TransitionDecisionEngine.landed_support,
    /replay fixtures remain refs-only/,
  );
  assert.ok(slice.not_complete_claims.includes('read_model_projection_does_not_mean_domain_progress'));
});

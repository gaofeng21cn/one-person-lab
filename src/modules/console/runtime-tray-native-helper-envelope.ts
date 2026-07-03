import { buildNativeIndexSummary } from '../runway/index.ts';

type NativeIndexSummaryOutput = ReturnType<typeof buildNativeIndexSummary>;

type NativeIndexEntry = {
  index_key: string;
  helper_id: string | null;
  request_id: string | null;
  status: string;
  result_surface_kind: string | null;
  errors: unknown[];
};

function helperIndexes(summary: NativeIndexSummaryOutput): NativeIndexEntry[] {
  const indexes = summary.native_index.indexes;
  return indexes.map((entry) => ({
    index_key: entry.index_key,
    helper_id: entry.helper_id,
    request_id: entry.request_id,
    status: entry.status,
    result_surface_kind: entry.result_surface_kind,
    errors: entry.errors,
  }));
}

export function buildNativeHelperExecutionEnvelope() {
  const summary = buildNativeIndexSummary();
  const indexes = helperIndexes(summary);
  return {
    surface_kind: 'opl_native_helper_execution_envelope_projection',
    envelope_scope: 'runtime_snapshot',
    envelope_role: 'generic_native_helper_catalog_execution_envelope',
    availability: indexes.length > 0 ? 'native_execution_index_observed' : 'native_execution_index_missing',
    execution_policy: 'read_existing_native_index_only_no_helper_execution',
    source_of_truth_rule: summary.native_index.source_of_truth_rule,
    state_dir: summary.native_index.state_dir,
    files: summary.native_index.files,
    freshness: summary.native_index.freshness,
    health: summary.native_index.health,
    helper_indexes: indexes,
    summary: {
      helper_index_count: indexes.length,
      ok_helper_index_count: indexes.filter((entry) => entry.status === 'ok').length,
      failed_helper_index_count: indexes.filter((entry) => entry.status !== 'ok').length,
      execution_policy: 'read_existing_native_index_only_no_helper_execution',
    },
    operator_safe_actions: [
      {
        action_id: 'native-helper:inspect-index',
        action_kind: 'native_helper_index_drilldown',
        action_owner: 'opl',
        route_target_kind: 'opl_cli',
        command_or_surface_ref: 'opl runtime index',
        execution_policy: 'route_only_no_helper_execution',
      },
      {
        action_id: 'native-helper:refresh-index',
        action_kind: 'native_helper_refresh_request',
        action_owner: 'infrastructure',
        route_target_kind: 'opl_cli',
        command_or_surface_ref: 'opl runtime manager action --action refresh_native_indexes --apply',
        execution_policy: 'operator_or_cli_explicit_apply_required',
      },
    ],
    authority_boundary: {
      opl: 'native_helper_catalog_execution_receipt_projection_only',
      domain: 'domain_helper_implementation_and_artifact_mutation_owner',
      can_execute_helper_without_operator: false,
      can_mutate_domain_artifact: false,
      can_authorize_domain_gate: false,
      can_read_artifact_body: false,
    },
  };
}

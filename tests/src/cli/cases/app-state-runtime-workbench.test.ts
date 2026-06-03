import { assert, createFakeCodexFixture, fs, os, path, runCli, test } from '../helpers.ts';

test('app state full runtime workbench summary uses stage progress refs only', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-full-workbench-home-'));
  const codexFixture = createFakeCodexFixture(`
if [[ "$1" == "--version" ]]; then
  echo "codex-cli 0.125.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 1
`);

  try {
    const output = runCli(['app', 'state', '--profile', 'full'], {
      HOME: homeRoot,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_MODULES_ROOT: path.join(homeRoot, 'opl-state', 'modules'),
      OPL_CODEX_CLI_LATEST_VERSION: '0.125.0',
      OPL_DEVELOPER_MODE_GH_BINARY: path.join(homeRoot, 'missing-gh'),
      PATH: `${codexFixture.fixtureRoot}:/usr/bin:/bin`,
    }) as {
      app_state: {
        meta: { profile: string };
        runtime_workbench: {
          surface_kind: string;
          availability: string;
          source_surface: string;
          runtime_workbench: {
            surface_kind: string;
            summary_cards: Array<{ card_id: string }>;
            action_queue_item_count: number;
            domain_lane_count: number;
          } | null;
          stage_progress_log: {
            summary: unknown;
            attempt_count: number;
            visual_ref_count: number;
            temporal_webui_ref_count: number;
            temporal_webui_refs: unknown[];
            temporal_stage_progress_ref_count: number;
            stage_progress_event_count: number;
          };
          effective_current_context: {
            surface_kind: string;
            packet_version: string;
            context_count: number;
            running_attempt_count: number;
            latest_closeout_count: number;
          };
          family_stall_lineage: {
            surface_kind: string;
            packet_version: string;
            lineage_count: number;
            repeated_lineage_count: number;
            terminal_lineage_count: number;
          };
          authority_boundary: {
            can_read_memory_body: boolean;
            can_read_artifact_body: boolean;
            provider_completion_is_domain_ready: boolean;
          };
        };
      };
    };
    const summary = output.app_state.runtime_workbench;

    assert.equal(output.app_state.meta.profile, 'full');
    assert.equal(summary.surface_kind, 'opl_app_state_runtime_workbench_summary');
    assert.equal(summary.availability, 'available');
    assert.equal(summary.source_surface, 'opl runtime app-operator-drilldown --detail full --json');
    assert.equal(summary.runtime_workbench?.surface_kind, 'opl_app_runtime_workbench_visualization_model');
    assert.equal(summary.runtime_workbench?.summary_cards.length > 0, true);
    assert.equal(summary.runtime_workbench?.action_queue_item_count >= 0, true);
    assert.equal(summary.runtime_workbench?.domain_lane_count >= 0, true);
    assert.equal(summary.stage_progress_log?.summary !== null, true);
    assert.equal(summary.stage_progress_log?.attempt_count >= 0, true);
    assert.equal(summary.stage_progress_log?.visual_ref_count >= 0, true);
    assert.equal(summary.stage_progress_log?.temporal_webui_ref_count >= 0, true);
    assert.equal(Array.isArray(summary.stage_progress_log?.temporal_webui_refs), true);
    assert.equal(summary.stage_progress_log?.temporal_stage_progress_ref_count >= 0, true);
    assert.equal(summary.stage_progress_log?.stage_progress_event_count >= 0, true);
    assert.equal(summary.effective_current_context.surface_kind, 'opl_effective_current_context_packet');
    assert.equal(summary.effective_current_context.packet_version, 'effective_current_context.v1');
    assert.equal(summary.effective_current_context.context_count >= 0, true);
    assert.equal(summary.effective_current_context.running_attempt_count >= 0, true);
    assert.equal(summary.effective_current_context.latest_closeout_count >= 0, true);
    assert.equal(summary.family_stall_lineage.surface_kind, 'opl_family_stall_lineage');
    assert.equal(summary.family_stall_lineage.packet_version, 'family-stall-lineage.v1');
    assert.equal(summary.family_stall_lineage.lineage_count >= 0, true);
    assert.equal(summary.family_stall_lineage.repeated_lineage_count >= 0, true);
    assert.equal(summary.family_stall_lineage.terminal_lineage_count >= 0, true);
    assert.equal(JSON.stringify(summary).includes('memory_writeback_refs'), false);
    assert.equal(JSON.stringify(summary).includes('artifact_gallery_refs'), false);
    assert.equal(summary.authority_boundary.can_read_memory_body, false);
    assert.equal(summary.authority_boundary.can_read_artifact_body, false);
    assert.equal(summary.authority_boundary.provider_completion_is_domain_ready, false);
  } finally {
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

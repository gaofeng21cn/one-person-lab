import test from 'node:test';
import assert from 'node:assert/strict';

import type { DomainManifestCatalogEntry } from '../../src/domain-manifest/types.ts';
import type { WorkspaceBinding } from '../../src/workspace-registry.ts';
import {
  buildDomainEntryParity,
  buildRecommendedEntrySurfaces,
} from '../../src/family-domain-catalog.ts';

function createResolvedProject(
  projectId: string,
  manifest: Record<string, unknown>,
): DomainManifestCatalogEntry {
  return {
    project_id: projectId,
    project: projectId,
    binding_id: `binding-${projectId}`,
    workspace_path: `/tmp/${projectId}`,
    manifest_command: `${projectId} product-entry-manifest`,
    status: 'resolved',
    manifest: manifest as any,
    error: null,
  } as DomainManifestCatalogEntry;
}

test('family domain catalog derives parity status from manifests and active bindings', () => {
  const projects: DomainManifestCatalogEntry[] = [
    createResolvedProject('med-autoscience', {
      target_domain_id: 'med-autoscience',
      frontdesk_surface: {
        surface_kind: 'product_frontdesk',
        command: 'medautoscience product-frontdesk',
      },
      product_entry_start: {
        surface_kind: 'product_entry_start',
        modes: [{ mode_id: 'direct' }],
      },
      shared_handoff: {
        direct_entry_builder: {
          command: 'medautoscience build-product-entry --entry-mode direct',
          entry_mode: 'direct',
        },
      },
      domain_entry_contract: {
        entry_adapter: 'MedAutoScienceDomainEntry',
        service_safe_surface_kind: 'med_autoscience_service_safe_domain_entry',
        command_contracts: [{ command: 'study-progress' }],
        domain_agent_entry_spec: {
          agent_id: 'mas',
          title: 'Med Auto Science',
          entry_command: 'product-frontdesk',
          manifest_command: 'product-entry-manifest',
        },
      },
      gateway_interaction_contract: {
        surface_kind: 'gateway_interaction_contract',
      },
      runtime_inventory: { surface_kind: 'runtime_inventory' },
      task_lifecycle: { surface_kind: 'task_lifecycle' },
      runtime_control: { surface_kind: 'runtime_control' },
      skill_catalog: {
        surface_kind: 'skill_catalog',
        skills: [
          {
            surface_kind: 'skill_descriptor',
            skill_id: 'med-autoscience',
            title: 'Med Auto Science',
            owner: 'med-autoscience',
            distribution_mode: 'repo_tracked',
            target_surface_kind: 'product_frontdesk',
            description: 'MAS app skill',
            readiness: 'landed',
            tags: [],
            domain_projection: {
              runtime_continuity: {
                surface_kind: 'skill_runtime_continuity',
                runtime_owner: 'codex_cli',
                domain_owner: 'med-autoscience',
                executor_owner: 'mas_controller',
                session_locator_field: 'study_id',
                session_surface_ref: '/session_continuity',
                progress_surface_ref: '/progress_projection',
                artifact_surface_ref: '/artifact_inventory',
                restore_point_surface_ref: '/runtime_control/restore_point',
                recommended_resume_command: 'medautoscience workspace-cockpit',
                recommended_progress_command: 'medautoscience study-progress',
                recommended_artifact_command: 'medautoscience workspace-cockpit --artifacts',
              },
            },
          },
        ],
        supported_commands: ['study-progress'],
        command_contracts: [],
      },
      automation: { surface_kind: 'automation' },
      product_entry_readiness: { verdict: 'good_to_use_now' },
      product_entry_preflight: {
        recommended_check_command: 'medautoscience study-runtime-status',
      },
    }),
    createResolvedProject('med-autogrant', {
      target_domain_id: 'med-autogrant',
      frontdesk_surface: {
        surface_kind: 'product_frontdesk',
        command: 'medautogrant product-frontdesk',
      },
      product_entry_start: {
        surface_kind: 'product_entry_start',
        modes: [{ mode_id: 'direct' }],
      },
      domain_entry_contract: {
        entry_adapter: 'MedAutoGrantDomainEntry',
        service_safe_surface_kind: 'service-safe-domain-entry-command',
        command_contracts: [{ command: 'runtime-run' }],
        domain_agent_entry_spec: {
          agent_id: 'mag',
          title: 'Med Auto Grant',
          entry_command: 'product-frontdesk',
          manifest_command: 'product-entry-manifest',
        },
      },
      gateway_interaction_contract: {
        surface_kind: 'gateway_interaction_contract',
      },
      runtime_control: { surface_kind: 'runtime_control' },
    }),
    {
      project_id: 'redcube-ai',
      project: 'redcube-ai',
      binding_id: null,
      workspace_path: null,
      manifest_command: null,
      status: 'manifest_not_configured',
      manifest: null,
      error: null,
    },
  ];

  const parity = buildDomainEntryParity(projects, {
    resolveActiveWorkspaceBinding(projectId) {
      if (projectId === 'med-autoscience') {
        return {
          binding_id: 'binding-med-autoscience',
          project_id: 'med-autoscience',
          project: 'med-autoscience',
          label: 'med-autoscience',
          workspace_path: '/tmp/med-autoscience',
          status: 'active',
          created_at: '2026-04-22T00:00:00Z',
          updated_at: '2026-04-22T00:00:00Z',
          archived_at: null,
          direct_entry: {
            command: 'medautoscience product-frontdesk',
            url: null,
            manifest_command: 'medautoscience product-entry-manifest',
            workspace_locator: 'workspace_root',
          },
        } as unknown as WorkspaceBinding;
      }
      return null;
    },
  });

  assert.equal(parity.summary.total_projects_count, 3);
  assert.equal(parity.summary.aligned_projects_count, 1);
  assert.equal(parity.summary.partial_projects_count, 1);
  assert.equal(parity.summary.blocked_projects_count, 1);
  assert.equal(parity.summary.ready_for_opl_start_count, 2);
  assert.equal(parity.summary.ready_for_domain_handoff_count, 1);
  assert.equal(parity.summary.domain_agent_entry_spec_ready_count, 2);
  assert.equal(parity.summary.runtime_control_ready_count, 2);
  assert.equal(parity.summary.skill_runtime_continuity_ready_count, 1);

  const alignedProject = parity.projects.find((entry) => entry.project_id === 'med-autoscience');
  const partialProject = parity.projects.find((entry) => entry.project_id === 'med-autogrant');
  const blockedProject = parity.projects.find((entry) => entry.project_id === 'redcube-ai');

  assert.equal(alignedProject?.entry_parity_status, 'aligned');
  assert.equal(alignedProject?.direct_entry_locator_status, 'ready');
  assert.equal(alignedProject?.runtime_control_status, 'ready');
  assert.equal(alignedProject?.recommended_check_command, 'medautoscience study-runtime-status');
  assert.equal(partialProject?.entry_parity_status, 'partial');
  assert.equal(partialProject?.runtime_control_status, 'ready');
  assert.match(partialProject?.gaps.join('\n') ?? '', /shared handoff surface/);
  assert.equal(blockedProject?.entry_parity_status, 'blocked');
  assert.match(blockedProject?.recommended_next_actions.join('\n') ?? '', /repo-tracked product-entry manifest/);
});

test('family domain catalog derives recommended entry surfaces with active binding locator context', () => {
  const recommended = buildRecommendedEntrySurfaces(
    [
      createResolvedProject('med-autoscience', {
        target_domain_id: 'med-autoscience',
        frontdesk_surface: {
          surface_kind: 'product_frontdesk',
          command: 'medautoscience product-frontdesk',
        },
        operator_loop_surface: {
          shell_key: 'workspace-cockpit',
          command: 'medautoscience workspace-cockpit',
          surface_kind: 'workspace_cockpit',
          summary: 'workspace cockpit',
          continuation_command: 'medautoscience workspace-cockpit --continue',
        },
        operator_loop_actions: {
          progress: {
            command: 'medautoscience study-progress',
          },
        },
        product_entry_start: {
          surface_kind: 'product_entry_start',
          resume_surface: { surface_kind: 'study_runtime_status' },
          modes: [{ mode_id: 'direct' }, { mode_id: 'opl-handoff' }],
        },
        product_entry_overview: {
          summary: 'overview',
          progress_surface: { command: 'medautoscience study-progress' },
          resume_surface: { command: 'medautoscience study-runtime-status' },
          human_gate_ids: ['human-review'],
        },
        product_entry_preflight: {
          summary: 'preflight',
          ready_to_try_now: true,
          recommended_check_command: 'medautoscience study-runtime-status',
          recommended_start_command: 'medautoscience product-start',
          blocking_check_ids: ['runtime-ready'],
          checks: [{ check_id: 'runtime-ready' }],
        },
        product_entry_quickstart: {
          steps: [{ step_id: 'frontdesk' }, { step_id: 'start' }],
        },
        product_entry_readiness: {
          verdict: 'good_to_use_now',
          summary: 'ready',
          usable_now: true,
          good_to_use_now: true,
          fully_automatic: false,
          recommended_start_command: 'medautoscience product-start',
          recommended_loop_command: 'medautoscience workspace-cockpit',
          blocking_gaps: [],
        },
        product_entry_shell: {},
        shared_handoff: {
          direct_entry_builder: {
            command: 'medautoscience build-product-entry --entry-mode direct',
            entry_mode: 'direct',
          },
        },
        domain_entry_contract: {
          entry_adapter: 'MedAutoScienceDomainEntry',
          service_safe_surface_kind: 'med_autoscience_service_safe_domain_entry',
          command_contracts: [{ command: 'study-progress' }],
          domain_agent_entry_spec: {
            agent_id: 'mas',
            title: 'Med Auto Science',
            entry_command: 'product-frontdesk',
            manifest_command: 'product-entry-manifest',
          },
        },
        gateway_interaction_contract: {
          surface_kind: 'gateway_interaction_contract',
        },
        family_orchestration: {
          human_gates: [{ gate_id: 'human-review' }],
          resume_contract: { surface_kind: 'family_resume' },
          action_graph_ref: { ref: 'contracts/runtime-program/current-program.json' },
          action_graph: {
            nodes: [{ node_id: 'frontdesk' }],
            edges: [],
          },
          event_envelope_surface: { ref: 'events/latest.json' },
          checkpoint_lineage_surface: { ref: 'checkpoint/latest.json' },
        },
        runtime_inventory: {
          surface_kind: 'runtime_inventory',
          summary: 'runtime',
          runtime_owner: 'mas',
          availability: 'ready',
          health_status: 'green',
        },
        task_lifecycle: {
          surface_kind: 'task_lifecycle',
          status: 'running',
          task_kind: 'study',
          human_gate_ids: ['human-review'],
          progress_surface: { command: 'medautoscience study-progress' },
          resume_surface: { surface_kind: 'study_runtime_status' },
        },
        runtime_control: {
          surface_kind: 'runtime_control',
          summary: 'control',
          status: 'study_scoped',
          restore_point: 'phase_2_user_product_loop',
          control_gate_ids: ['human-review'],
          control_surfaces: {
            resume: {
              surface_kind: 'study_runtime_status',
              command: 'medautoscience study-runtime-status',
              summary: 'resume',
            },
            approval: {
              surface_kind: 'workspace_cockpit',
              command: 'medautoscience workspace-cockpit',
              summary: 'approval',
            },
          },
        },
        skill_catalog: {
          surface_kind: 'skill_catalog',
          skills: [
            {
              surface_kind: 'skill_descriptor',
              skill_id: 'med-autoscience',
              title: 'Med Auto Science',
              owner: 'med-autoscience',
              distribution_mode: 'repo_tracked',
              target_surface_kind: 'product_frontdesk',
              description: 'MAS app skill',
              readiness: 'landed',
              tags: [],
              domain_projection: {
                skill_activation: {
                  plugin_name: 'med-autoscience',
                  skill_semantics: 'single_domain_app_skill',
                  entry_shell_key: 'frontdesk',
                  entry_command: 'medautoscience product-frontdesk',
                  supporting_shell_keys: ['workspace-cockpit'],
                  shell_commands: {
                    frontdesk: {
                      command: 'medautoscience product-frontdesk',
                      target_surface_kind: 'product_frontdesk',
                    },
                    'workspace-cockpit': {
                      command: 'medautoscience workspace-cockpit',
                      target_surface_kind: 'workspace_cockpit',
                    },
                  },
                },
                runtime_continuity: {
                  surface_kind: 'skill_runtime_continuity',
                  runtime_owner: 'codex_cli',
                  domain_owner: 'med-autoscience',
                  executor_owner: 'mas_controller',
                  session_locator_field: 'study_id',
                  session_surface_ref: '/session_continuity',
                  progress_surface_ref: '/progress_projection',
                  artifact_surface_ref: '/artifact_inventory',
                  restore_point_surface_ref: '/runtime_control/restore_point',
                  recommended_resume_command: 'medautoscience study-runtime-status',
                  recommended_progress_command: 'medautoscience study-progress',
                  recommended_artifact_command: 'medautoscience workspace-cockpit --artifacts',
                },
              },
            },
          ],
          supported_commands: ['workspace-cockpit'],
        },
        automation: {
          surface_kind: 'automation',
          automations: [{ automation_id: 'nightly-check' }],
          readiness_summary: 'ready',
        },
        repo_mainline: {
          phase_id: 'phase-2',
          tranche_id: 'family-reuse',
        },
        product_entry_status: {
          summary: 'shipping',
          next_focus: ['domain-entry'],
          remaining_gaps_count: 0,
        },
        recommended_shell: 'workspace-cockpit',
        recommended_command: 'medautoscience product-frontdesk',
        schema_ref: 'contracts/schemas/v1/product-entry-manifest.schema.json',
        manifest_version: 1,
      }),
    ],
    {
      resolveActiveWorkspaceBinding() {
        return {
          binding_id: 'binding-med-autoscience',
          project_id: 'med-autoscience',
          project: 'med-autoscience',
          label: 'med-autoscience',
          workspace_path: '/tmp/med-autoscience',
          status: 'active',
          created_at: '2026-04-22T00:00:00Z',
          updated_at: '2026-04-22T00:00:00Z',
          archived_at: null,
          direct_entry: {
            command: 'medautoscience product-frontdesk',
            url: null,
            manifest_command: 'medautoscience product-entry-manifest',
            workspace_locator: 'workspace_root',
          },
        } as unknown as WorkspaceBinding;
      },
    },
  );

  assert.equal(recommended.length, 1);
  assert.equal(recommended[0]?.project_id, 'med-autoscience');
  assert.equal(recommended[0]?.mainline_phase_id, 'phase-2');
  assert.equal(recommended[0]?.mainline_tranche_id, 'family-reuse');
  assert.equal(recommended[0]?.active_binding_locator_status, 'ready');
  assert.equal(recommended[0]?.active_binding_locator.command, 'medautoscience product-frontdesk');
  assert.equal(recommended[0]?.domain_entry_contract_status, 'ready');
  assert.equal(recommended[0]?.domain_agent_entry_id, 'mas');
  assert.equal(recommended[0]?.domain_agent_entry_title, 'Med Auto Science');
  assert.equal(recommended[0]?.domain_agent_entry_entry_command, 'product-frontdesk');
  assert.equal(recommended[0]?.domain_agent_entry_manifest_command, 'product-entry-manifest');
  assert.equal(recommended[0]?.domain_agent_entry_spec?.agent_id, 'mas');
  assert.equal(recommended[0]?.gateway_interaction_contract_status, 'ready');
  assert.equal(recommended[0]?.product_entry_preflight_recommended_start_command, 'medautoscience product-start');
  assert.equal(recommended[0]?.runtime_control?.surface_kind, 'runtime_control');
  assert.equal(recommended[0]?.runtime_control_status, 'ready');
  assert.equal(recommended[0]?.runtime_control_restore_point, 'phase_2_user_product_loop');
  assert.equal(recommended[0]?.runtime_control_resume_command, 'medautoscience study-runtime-status');
  assert.equal(recommended[0]?.runtime_control_approval_command, 'medautoscience workspace-cockpit');
  assert.deepEqual(recommended[0]?.runtime_control_gate_ids, ['human-review']);
  assert.equal(recommended[0]?.skill_activation_status, 'ready');
  assert.equal(recommended[0]?.skill_activation_skill_id, 'med-autoscience');
  assert.equal(recommended[0]?.skill_activation_plugin_name, 'med-autoscience');
  assert.equal(recommended[0]?.skill_activation_skill_semantics, 'single_domain_app_skill');
  assert.equal(recommended[0]?.skill_activation_entry_shell_key, 'frontdesk');
  assert.equal(recommended[0]?.skill_activation_entry_command, 'medautoscience product-frontdesk');
  assert.deepEqual(recommended[0]?.skill_activation_supporting_shell_keys, ['workspace-cockpit']);
  assert.equal(
    recommended[0]?.skill_activation_shell_commands.frontdesk.command,
    'medautoscience product-frontdesk',
  );
  assert.equal(
    recommended[0]?.skill_activation_shell_commands['workspace-cockpit'].target_surface_kind,
    'workspace_cockpit',
  );
  assert.equal(recommended[0]?.skill_runtime_continuity_status, 'ready');
  assert.equal(recommended[0]?.skill_runtime_continuity_session_locator_field, 'study_id');
  assert.equal(recommended[0]?.skill_runtime_continuity_session_surface_ref, '/session_continuity');
  assert.equal(recommended[0]?.skill_runtime_continuity_progress_surface_ref, '/progress_projection');
  assert.equal(recommended[0]?.skill_runtime_continuity_artifact_surface_ref, '/artifact_inventory');
  assert.equal(recommended[0]?.skill_runtime_continuity_restore_point_surface_ref, '/runtime_control/restore_point');
  assert.equal(recommended[0]?.skill_runtime_continuity_resume_command, 'medautoscience study-runtime-status');
  assert.equal(recommended[0]?.skill_runtime_continuity_progress_command, 'medautoscience study-progress');
  assert.equal(recommended[0]?.skill_runtime_continuity_artifact_command, 'medautoscience workspace-cockpit --artifacts');
  assert.deepEqual(recommended[0]?.family_human_gate_ids, ['human-review']);
});

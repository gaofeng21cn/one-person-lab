import {
  AGENT_WORKSPACE_NORM_CONTRACT_REF,
  buildAgentWorkspaceNormProjection,
} from '../agent-workspace-norm.ts';
import type { AgentWorkspaceNormContract, FrameworkContracts } from '../types.ts';
import type { WorkspaceAgentProfile } from '../workspace-agent-defaults.ts';

export function buildInterfaceProjection(
  contract: AgentWorkspaceNormContract,
  agent: WorkspaceAgentProfile,
  workspacePath: string,
  projectId: string,
) {
  const initExample = `${contract.explicit_initialization.command} --agent ${agent.agent_id} --workspace ${workspacePath} --project-id ${projectId}`;
  const ensureExample = `${contract.default_workspace_precondition.command} --agent ${agent.agent_id} --project-id ${projectId}`;
  return {
    surface_kind: 'opl_workspace_initialize_interface_projection',
    owner: 'one-person-lab',
    action_id: contract.default_workspace_precondition.action_id,
    required_inputs: contract.default_workspace_precondition.required_inputs,
    optional_inputs: contract.default_workspace_precondition.optional_inputs,
    norm_contract_ref: AGENT_WORKSPACE_NORM_CONTRACT_REF,
    cli: {
      command: contract.explicit_initialization.command,
      ensure_command: contract.default_workspace_precondition.command,
      example: initExample,
      ensure_example: ensureExample,
    },
    mcp: {
      ...contract.descriptor_delegates.mcp,
      command_contract_id: contract.default_workspace_precondition.action_id,
    },
    skill: {
      ...contract.descriptor_delegates.skill,
      instruction: 'Call the OPL workspace ensure action before running a MAS/MAG/RCA/OMA task.',
    },
    openai: {
      ...contract.descriptor_delegates.openai,
    },
    ai_sdk: {
      ...contract.descriptor_delegates.ai_sdk,
    },
  };
}

export function buildWorkspaceInitializeInterfaces(contracts: FrameworkContracts) {
  return {
    version: 'g2',
    workspace_interfaces: {
      surface_kind: 'opl_workspace_initialize_interfaces',
      owner: 'one-person-lab',
      boundary: {
        action_catalog_owner: 'opl_framework',
        is_domain_family_action_catalog: false,
        writes_opl_workspace_registry: true,
        writes_domain_truth: false,
        creates_owner_receipt: false,
        creates_typed_blocker: false,
        mutates_artifact_body: false,
      },
      workspace_norm: buildAgentWorkspaceNormProjection({
        contract: contracts.agentWorkspaceNorm,
        agentId: null,
      }),
      command_contract: {
        action_id: contracts.agentWorkspaceNorm.default_workspace_precondition.action_id,
        command: contracts.agentWorkspaceNorm.default_workspace_precondition.command,
        initializer_command: contracts.agentWorkspaceNorm.explicit_initialization.command,
        required_inputs: contracts.agentWorkspaceNorm.default_workspace_precondition.required_inputs,
        optional_inputs: contracts.agentWorkspaceNorm.default_workspace_precondition.optional_inputs,
        norm_contract_ref: AGENT_WORKSPACE_NORM_CONTRACT_REF,
      },
      supported_agents: contracts.agentWorkspaceNorm.supported_agents,
      surfaces: {
        cli: {
          command: contracts.agentWorkspaceNorm.default_workspace_precondition.command,
          initializer_command: contracts.agentWorkspaceNorm.explicit_initialization.command,
          validator_command: 'opl workspace validate',
          doctor_command: 'opl workspace doctor',
          adopt_dry_run_command: 'opl workspace adopt --dry-run',
          adopt_apply_command: 'opl workspace adopt --apply',
          upgrade_command: 'opl workspace upgrade --apply',
          project_archive_command: 'opl workspace project archive --apply',
          project_lifecycle_command: 'opl workspace project lifecycle --apply',
          project_delete_command: 'opl workspace project delete --dry-run',
          export_map_command: 'opl workspace export-map',
          inspect_command: 'opl workspace inspect',
          inventory_command: 'opl workspace inventory',
          health_command: 'opl workspace health',
          report_command: 'opl workspace report',
          fleet_report_command: 'opl workspace fleet report',
          usage:
            'opl workspace ensure --agent <mas|mag|rca|oma> [--workspace <path>|--workspace-root <dir>] [--workspace-id <id>] [--project-id <id>] [--mode auto|one_off|series|portfolio]',
        },
        management_commands: {
          validate: {
            command: 'opl workspace validate',
            role: 'hard_blockers_only_workspace_gate',
            required_inputs: ['workspace_path'],
          },
          doctor: {
            command: 'opl workspace doctor',
            role: 'read_only_user_and_operator_diagnostics',
            required_inputs: ['workspace_path'],
          },
          adopt: {
            command: 'opl workspace adopt',
            role: 'plan_or_apply_existing_directory_adoption',
            required_inputs: ['agent_id', 'workspace_path', 'dry_run_or_apply'],
          },
          upgrade: {
            command: 'opl workspace upgrade',
            role: 'refresh_opl_metadata_manifests_map_and_health',
            required_inputs: ['workspace_path', 'dry_run_or_apply'],
          },
          project_archive: {
            command: 'opl workspace project archive',
            role: 'mark_indexed_project_archived_without_deleting_files',
            required_inputs: ['workspace_path', 'project_id', 'dry_run_or_apply'],
          },
          project_lifecycle: {
            command: 'opl workspace project lifecycle',
            role: 'pause_resume_lock_supersede_or_archive_indexed_project_without_deleting_files',
            required_inputs: ['workspace_path', 'project_id', 'status', 'dry_run_or_apply'],
          },
          project_delete: {
            command: 'opl workspace project delete',
            role: 'refs_only_safe_delete_gate_that_never_performs_physical_delete',
            required_inputs: ['workspace_path', 'project_id'],
          },
          fleet_report: {
            command: 'opl workspace fleet report',
            role: 'read_only_registry_backed_workspace_fleet_report',
            required_inputs: [],
          },
          export_map: {
            command: 'opl workspace export-map',
            role: 'read_only_workspace_map_projection',
            required_inputs: ['workspace_path'],
          },
          inspect: {
            command: 'opl workspace inspect',
            role: 'read_only_user_inspection_projection',
            required_inputs: ['workspace_path'],
          },
          inventory: {
            command: 'opl workspace inventory',
            role: 'read_only_shared_resource_inventory_projection',
            required_inputs: ['workspace_path'],
          },
          health: {
            command: 'opl workspace health',
            role: 'read_only_structure_health_projection',
            required_inputs: ['workspace_path'],
          },
          report: {
            command: 'opl workspace report',
            role: 'read_only_user_first_workspace_report',
            required_inputs: ['workspace_path'],
          },
        },
        mcp: {
          ...contracts.agentWorkspaceNorm.descriptor_delegates.mcp,
          input_schema_ref: 'opl://workspace/ensure/input.schema.json',
          delegates_to: contracts.agentWorkspaceNorm.default_workspace_precondition.command,
          fallback_initializer: contracts.agentWorkspaceNorm.explicit_initialization.command,
          management_delegates: {
            validate: 'opl workspace validate',
            doctor: 'opl workspace doctor',
            adopt_dry_run: 'opl workspace adopt --dry-run',
            adopt_apply: 'opl workspace adopt --apply',
            upgrade: 'opl workspace upgrade --apply',
            project_archive: 'opl workspace project archive --apply',
            project_lifecycle: 'opl workspace project lifecycle --apply',
            project_delete: 'opl workspace project delete --dry-run',
            export_map: 'opl workspace export-map',
            inspect: 'opl workspace inspect',
            inventory: 'opl workspace inventory',
            health: 'opl workspace health',
            report: 'opl workspace report',
            fleet_report: 'opl workspace fleet report',
          },
        },
        skill: {
          ...contracts.agentWorkspaceNorm.descriptor_delegates.skill,
          instruction:
            'Use this OPL-owned ensure action before MAS/MAG/RCA/OMA task execution; it reuses an active workspace binding or initializes the default topology.',
          management_instruction:
            'Use workspace validate as the hard-blockers-only gate, workspace doctor for hard/repairable/advisory diagnostics, workspace report for the user-first current-project view, workspace fleet report for registry-wide workspace inspection, workspace adopt --dry-run before --apply, workspace upgrade --apply to auto-repair OPL projections, workspace project lifecycle --apply to pause/resume/lock/supersede/archive without deleting files, workspace project delete --dry-run to check the owner receipt safe-delete gate, and export-map/inspect/inventory/health for audit inspection.',
        },
        app: {
          action_id: contracts.agentWorkspaceNorm.default_workspace_precondition.app_action_id,
          initializer_action_id: contracts.agentWorkspaceNorm.explicit_initialization.app_action_id,
          validator_action_id: 'workspace_validate',
          doctor_action_id: 'workspace_doctor',
          adopt_dry_run_action_id: 'workspace_adopt_dry_run',
          adopt_apply_action_id: 'workspace_adopt_apply',
          upgrade_action_id: 'workspace_upgrade',
          project_archive_action_id: 'workspace_project_archive',
          project_lifecycle_action_id: 'workspace_project_lifecycle',
          project_pause_action_id: 'workspace_project_pause',
          project_resume_action_id: 'workspace_project_resume',
          project_lock_action_id: 'workspace_project_lock',
          project_supersede_action_id: 'workspace_project_supersede',
          project_delete_action_id: 'workspace_project_delete',
          export_map_action_id: 'workspace_export_map',
          inspect_action_id: 'workspace_inspect',
          inventory_action_id: 'workspace_inventory',
          health_action_id: 'workspace_health',
          report_action_id: 'workspace_report',
          fleet_report_action_id: 'workspace_fleet_report',
          route: 'opl app action execute --action workspace_ensure --payload <json>',
        },
        openai: contracts.agentWorkspaceNorm.descriptor_delegates.openai,
        ai_sdk: contracts.agentWorkspaceNorm.descriptor_delegates.ai_sdk,
      },
    },
  };
}

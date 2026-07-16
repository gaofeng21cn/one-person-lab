import path from 'node:path';

import type {
  FamilyActionCatalog,
  FamilyActionCatalogAction,
  FamilyActionExportFormat,
} from './family-action-catalog-contract.ts';
import { record, stringValue, type JsonRecord } from './json-record.ts';
import { resolveStandardAgentByDomainId } from './standard-agent-registry.ts';

type FamilyActionCatalogProjectionManifest = {
  operator_loop_actions?: Record<string, JsonRecord | undefined> | null;
  skill_catalog?: {
    command_contracts?: unknown[];
    skills: Array<{ domain_projection?: unknown }>;
  } | null;
};

function shellArgument(value: string) {
  return value.includes(' ') || value.includes("'") ? `'${value.replace(/'/g, `'\\''`)}'` : value;
}

function absoluteWorkspacePath(workspacePath: string) {
  const normalized = workspacePath.trim();
  if (!normalized || !path.isAbsolute(normalized)) {
    throw new Error('Family action hosted command requires an absolute workspace path.');
  }
  return path.normalize(normalized);
}

export function hostedFamilyActionCommand(targetDomainId: string, actionId: string, workspacePath: string) {
  const publicAgentId = resolveStandardAgentByDomainId(targetDomainId)?.agent_id ?? targetDomainId;
  return [
    'opl agents run --domain',
    shellArgument(publicAgentId),
    '--action',
    shellArgument(actionId),
    '--workspace',
    shellArgument(absoluteWorkspacePath(workspacePath)),
  ].join(' ');
}

function surfaceKind(value: unknown, fallback: string) {
  return stringValue(value) ?? fallback;
}

function sourceOfWork(action: FamilyActionCatalogAction) {
  return action.source_of_work ?? {
    source_catalog: 'family_action_catalog' as const,
    source_catalog_ref: 'family_action_catalog',
    source_action_id: action.action_id,
    stage_catalog_ref: 'family_stage_control_plane',
    derived_surface_policy: 'derive_cli_mcp_openai_ai_sdk_skill_app_status_workbench_from_single_catalog' as const,
    domain_repo_wrapper_policy: 'handler_target_refs_only_adapter_or_tombstone_candidate' as const,
  };
}

function actionInputContract(action: FamilyActionCatalogAction) {
  return {
    required_fields: action.required_fields,
    optional_fields: action.optional_fields,
    workspace_locator_fields: action.workspace_locator_fields,
    execution_binding: action.execution_binding,
  };
}

export function projectFamilyAction(
  action: FamilyActionCatalogAction,
  targetDomainId: string,
  workspacePath: string,
) {
  const cliSurface = action.supported_surfaces.cli;
  const mcpSurface = action.supported_surfaces.mcp;
  const skillSurface = action.supported_surfaces.skill;
  const productEntrySurface = action.supported_surfaces.product_entry;
  const openaiSurface = action.supported_surfaces.openai;
  const aiSdkSurface = action.supported_surfaces.ai_sdk;
  const command = hostedFamilyActionCommand(targetDomainId, action.action_id, workspacePath);
  const lineage = sourceOfWork(action);

  return {
    operator_loop_action: {
      command,
      surface_kind: surfaceKind(productEntrySurface?.surface_kind, 'opl_agent_action_product_entry'),
      summary: action.summary,
      requires: action.required_fields,
      ...actionInputContract(action),
      ...(action.stage_route ? { stage_route: action.stage_route } : {}),
    },
    cli: {
      action_id: action.action_id,
      command,
      surface_kind: surfaceKind(cliSurface?.surface_kind, 'opl_agent_action_cli'),
      summary: action.summary,
      effect: action.effect,
      input_schema_ref: action.input_schema_ref,
      output_schema_ref: action.output_schema_ref,
      ...actionInputContract(action),
      source_of_work: lineage,
      ...(action.stage_route ? { stage_route: action.stage_route } : {}),
    },
    mcp: {
      name: stringValue(mcpSurface?.tool_name) ?? action.action_id,
      description: action.summary,
      command,
      surface_kind: surfaceKind(mcpSurface?.surface_kind, 'opl_agent_action_mcp'),
      input_schema_ref: action.input_schema_ref,
      output_schema_ref: action.output_schema_ref,
      public_runtime: mcpSurface?.public_runtime !== false,
      descriptor_only: mcpSurface?.descriptor_only === true,
      ...actionInputContract(action),
      source_of_work: lineage,
      ...(action.stage_route ? { stage_route: action.stage_route } : {}),
    },
    skill: {
      command_contract_id: stringValue(skillSurface?.command_contract_id) ?? action.action_id,
      action_id: action.action_id,
      command,
      surface_kind: surfaceKind(skillSurface?.surface_kind, 'opl_agent_action_skill'),
      summary: action.summary,
      ...actionInputContract(action),
      effect: action.effect,
      output_schema_ref: action.output_schema_ref,
      accepted_answer_shape_ref: action.output_schema_ref,
      source_of_work: lineage,
      ...(action.stage_route ? { stage_route: action.stage_route } : {}),
    },
    product_entry: {
      action_key: stringValue(productEntrySurface?.action_key) ?? action.action_id,
      command,
      surface_kind: surfaceKind(productEntrySurface?.surface_kind, 'opl_agent_action_product_entry'),
      summary: action.summary,
      requires: action.required_fields,
      ...actionInputContract(action),
      output_schema_ref: action.output_schema_ref,
      accepted_answer_shape_ref: action.output_schema_ref,
      source_of_work: lineage,
      ...(action.stage_route ? { stage_route: action.stage_route } : {}),
    },
    openai: {
      type: 'function',
      function: {
        name: stringValue(openaiSurface?.tool_name) ?? action.action_id,
        description: action.summary,
        parameters: {
          type: 'object',
          additionalProperties: true,
          schema_ref: action.input_schema_ref,
        },
      },
      output_schema_ref: action.output_schema_ref,
      accepted_answer_shape_ref: action.output_schema_ref,
      command,
      ...actionInputContract(action),
      source_of_work: lineage,
      ...(action.stage_route ? { stage_route: action.stage_route } : {}),
    },
    ai_sdk: {
      name: stringValue(aiSdkSurface?.tool_name) ?? action.action_id,
      description: action.summary,
      inputSchemaRef: action.input_schema_ref,
      outputSchemaRef: action.output_schema_ref,
      command,
      surface_kind: surfaceKind(aiSdkSurface?.surface_kind, 'opl_agent_action_ai_sdk'),
      ...actionInputContract(action),
      source_of_work: lineage,
      ...(action.stage_route ? { stage_route: action.stage_route } : {}),
    },
  };
}

function projectionMatchesAction(value: unknown, action: FamilyActionCatalogAction, command: string) {
  const entry = record(value);
  if (Object.keys(entry).length === 0) {
    return false;
  }
  return stringValue(entry.action_id) === action.action_id
    || stringValue(entry.command_contract_id) === action.action_id
    || stringValue(entry.command_contract_id) === stringValue(action.supported_surfaces.skill?.command_contract_id)
    || stringValue(entry.command) === command;
}

function collectSkillProjectionEntries(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectSkillProjectionEntries(entry));
  }
  const entry = record(value);
  if (Object.keys(entry).length === 0) {
    return [];
  }

  const entries: JsonRecord[] = [];
  if (
    stringValue(entry.action_id)
    || stringValue(entry.command_contract_id)
    || stringValue(entry.command)
  ) {
    entries.push(entry);
  }

  const directProjection = entry.action_catalog_projection;
  entries.push(...collectSkillProjectionEntries(directProjection));

  const groupedProjection = record(entry.action_catalog_projections);
  if (Object.keys(groupedProjection).length > 0) {
    entries.push(...collectSkillProjectionEntries(groupedProjection.skill));
  }

  return entries;
}

function hasSkillProjectionContract(
  manifest: FamilyActionCatalogProjectionManifest | null,
  action: FamilyActionCatalogAction,
  command: string,
) {
  const skillCatalog = manifest?.skill_catalog;
  if (!skillCatalog) {
    return true;
  }

  const contracts = skillCatalog.command_contracts ?? [];
  if (contracts.some((entry) => projectionMatchesAction(entry, action, command))) {
    return true;
  }

  return skillCatalog.skills.some((skill) =>
    collectSkillProjectionEntries(skill.domain_projection).some((entry) =>
      projectionMatchesAction(entry, action, command)
    )
  );
}

export function buildFamilyActionCatalogParity(
  catalog: FamilyActionCatalog,
  workspacePath: string,
  manifest: FamilyActionCatalogProjectionManifest | null = null,
) {
  const issues: string[] = [];
  for (const action of catalog.actions) {
    const projections = projectFamilyAction(action, catalog.target_domain_id, workspacePath);
    const lineage = sourceOfWork(action);
    if (lineage.source_catalog !== 'family_action_catalog') {
      issues.push(`${action.action_id}: source-of-work must originate in family_action_catalog`);
    }
    if (lineage.source_action_id !== action.action_id) {
      issues.push(`${action.action_id}: source-of-work action id diverges from action catalog`);
    }
    if (
      lineage.derived_surface_policy
      !== 'derive_cli_mcp_openai_ai_sdk_skill_app_status_workbench_from_single_catalog'
    ) {
      issues.push(`${action.action_id}: source-of-work derived surface policy is not canonical`);
    }
    const projectedLineages = [
      projections.cli.source_of_work,
      projections.mcp.source_of_work,
      projections.skill.source_of_work,
      projections.product_entry.source_of_work,
      projections.openai.source_of_work,
      projections.ai_sdk.source_of_work,
    ];
    if (!projectedLineages.every((lineage) => lineage.source_action_id === action.action_id)) {
      issues.push(`${action.action_id}: generated surface lineage diverges from source action`);
    }
    const hostedCommand = hostedFamilyActionCommand(catalog.target_domain_id, action.action_id, workspacePath);
    const projectedCommands = [
      projections.operator_loop_action.command,
      projections.cli.command,
      projections.mcp.command,
      projections.skill.command,
      projections.product_entry.command,
      projections.openai.command,
      projections.ai_sdk.command,
    ];
    if (!projectedCommands.every((command) => command === hostedCommand)) {
      issues.push(`${action.action_id}: generated executable command is not the canonical hosted command`);
    }

    const manifestAction =
      manifest?.operator_loop_actions?.[action.action_id]
      ?? manifest?.operator_loop_actions?.[projections.product_entry.action_key];
    if (manifestAction && stringValue(manifestAction.command) !== projections.product_entry.command) {
      issues.push(`${action.action_id}: operator_loop_actions command diverges from action catalog`);
    }

    if (action.supported_surfaces.skill && !hasSkillProjectionContract(manifest, action, projections.skill.command)) {
      issues.push(`${action.action_id}: skill command contract missing`);
    }
  }

  return {
    surface_kind: 'family_action_catalog_parity',
    status: issues.length === 0 ? 'aligned' : 'drift_detected',
    issues,
  };
}

export function projectFamilyActionCatalog(
  catalog: FamilyActionCatalog,
  format: FamilyActionExportFormat,
  workspacePath: string,
) {
  const surfaceForFormat = {
    cli: 'cli',
    mcp: 'mcp',
    skill: 'skill',
    openai: 'openai',
    'ai-sdk': 'ai_sdk',
  } as const;
  return catalog.actions
    .filter((action) => action.supported_surfaces[surfaceForFormat[format]] !== null)
    .map((action) => {
    const projections = projectFamilyAction(action, catalog.target_domain_id, workspacePath);
    switch (format) {
      case 'cli':
        return projections.cli;
      case 'mcp':
        return projections.mcp;
      case 'skill':
        return projections.skill;
      case 'openai':
        return projections.openai;
      case 'ai-sdk':
        return projections.ai_sdk;
    }
    });
}

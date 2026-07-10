import type {
  FamilyActionCatalog,
  FamilyActionCatalogAction,
  FamilyActionExportFormat,
  FamilyActionSurfaceDescriptor,
} from './family-action-catalog-contract.ts';
import { record, stringValue, type JsonRecord } from './json-record.ts';

type FamilyActionCatalogProjectionManifest = {
  operator_loop_actions?: Record<string, JsonRecord | undefined> | null;
  skill_catalog?: {
    command_contracts?: unknown[];
    skills: Array<{ domain_projection?: unknown }>;
  } | null;
};

function surfaceCommand(action: FamilyActionCatalogAction, surface: FamilyActionSurfaceDescriptor | null) {
  return stringValue(surface?.command) ?? action.source_command.command;
}

function surfaceKind(action: FamilyActionCatalogAction, surface: FamilyActionSurfaceDescriptor | null) {
  return stringValue(surface?.surface_kind) ?? action.source_command.surface_kind;
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
    ...(action.handler_binding ?? {}),
  };
}

export function projectFamilyAction(action: FamilyActionCatalogAction) {
  const cliSurface = action.supported_surfaces.cli;
  const mcpSurface = action.supported_surfaces.mcp;
  const skillSurface = action.supported_surfaces.skill;
  const productEntrySurface = action.supported_surfaces.product_entry;
  const openaiSurface = action.supported_surfaces.openai;
  const aiSdkSurface = action.supported_surfaces.ai_sdk;
  const command = surfaceCommand(action, cliSurface);
  const kind = surfaceKind(action, cliSurface);
  const lineage = sourceOfWork(action);

  return {
    operator_loop_action: {
      command: surfaceCommand(action, productEntrySurface),
      surface_kind: surfaceKind(action, productEntrySurface),
      summary: action.summary,
      requires: action.required_fields,
      ...actionInputContract(action),
      ...(action.stage_route ? { stage_route: action.stage_route } : {}),
    },
    cli: {
      action_id: action.action_id,
      command,
      surface_kind: kind,
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
      command: surfaceCommand(action, mcpSurface),
      surface_kind: surfaceKind(action, mcpSurface),
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
      surface_kind: kind,
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
      command: surfaceCommand(action, productEntrySurface),
      surface_kind: surfaceKind(action, productEntrySurface),
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
  manifest: FamilyActionCatalogProjectionManifest | null = null,
) {
  const issues: string[] = [];
  for (const action of catalog.actions) {
    const projections = projectFamilyAction(action);
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
    if (projections.cli.command !== action.source_command.command) {
      issues.push(`${action.action_id}: cli command diverges from source command`);
    }
    if (action.supported_surfaces.product_entry?.command) {
      const expected = action.supported_surfaces.product_entry.command;
      if (projections.product_entry.command !== expected) {
        issues.push(`${action.action_id}: product-entry command projection diverges`);
      }
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

export function projectFamilyActionCatalog(catalog: FamilyActionCatalog, format: FamilyActionExportFormat) {
  return catalog.actions.map((action) => {
    const projections = projectFamilyAction(action);
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

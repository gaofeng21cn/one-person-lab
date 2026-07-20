import type { FrameworkContracts } from '../../../kernel/types.ts';
import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import {
  resolveStandardAgent,
  STANDARD_AGENT_REGISTRY,
  STANDARD_AGENT_SERIES_MEMBERSHIP,
} from '../../../kernel/standard-agent-registry.ts';
import { resolveStandardAgentContractCheckout } from '../../connect/index.ts';
import { buildDomainManifestCatalog, type DomainManifestCatalog } from './catalog-builder.ts';
import { loadManagedStandardAgentContractCatalog } from './managed-standard-agent-contracts.ts';
import { normalizeManifest } from './normalizers.ts';
import type {
  DomainManifestCatalogEntry,
  NormalizedDomainManifest,
} from './types.ts';

type StandardAgent = Extract<
  typeof STANDARD_AGENT_REGISTRY[number],
  { series_membership: typeof STANDARD_AGENT_SERIES_MEMBERSHIP }
>;
type CatalogOptions = Parameters<typeof buildDomainManifestCatalog>[1] & {
  legacyDomainManifests?: DomainManifestCatalog;
};

function standardAgents(): StandardAgent[] {
  return STANDARD_AGENT_REGISTRY.filter(
    (agent): agent is StandardAgent =>
      agent.series_membership === STANDARD_AGENT_SERIES_MEMBERSHIP,
  );
}

function standardAgentEntryForLegacyCatalog(
  legacyCatalog: DomainManifestCatalog,
  agent: StandardAgent,
) {
  return legacyCatalog.projects.find((entry) =>
    resolveStandardAgent(entry.project_id)?.agent_id === agent.agent_id
    || resolveStandardAgent(entry.project)?.agent_id === agent.agent_id
  ) ?? null;
}

function generatedEntryCommand(agent: StandardAgent, actionId: string | null) {
  return actionId
    ? `opl agents run --domain ${agent.agent_id} --action ${actionId} --workspace <workspace>`
    : `opl agents interfaces --domain ${agent.agent_id}`;
}

function standardAgentIdentity(agent: StandardAgent) {
  return {
    agent_id: agent.agent_id,
    domain_id: agent.domain_id,
    target_domain_id: agent.target_domain_id,
    project: agent.project,
    display_name: agent.display_name,
    series_membership: agent.series_membership,
  };
}

function legacyWorkspaceManifestDiagnostic(entry: DomainManifestCatalogEntry | null) {
  if (!entry) return null;
  return {
    project_id: entry.project_id,
    project: entry.project,
    binding_id: entry.binding_id,
    workspace_path: entry.workspace_path,
    manifest_command: entry.manifest_command,
    manifest_status: entry.status,
    currentness_owner_action_packet: entry.currentness_owner_action_packet ?? null,
    error: entry.error,
    used_for_standard_agent_membership: false,
    used_for_owner_action_or_stage_contracts: false,
  };
}

function managedManifestProjection(input: {
  agent: StandardAgent;
  checkoutPath: string;
  legacyManifest: NormalizedDomainManifest | null;
  catalog: ReturnType<typeof loadManagedStandardAgentContractCatalog>['catalog'];
}) {
  const actionIds = input.catalog.actions.map((action) => action.action_id);
  const entryCommand = generatedEntryCommand(input.agent, actionIds[0] ?? null);
  const normalized = normalizeManifest({
    surface_kind: 'opl_managed_standard_agent_manifest_projection',
    manifest_version: 1,
    manifest_kind: 'managed_standard_agent_owner_contract_projection',
    target_domain_id: input.agent.target_domain_id,
    formal_entry: {
      default: 'opl_generated_agent_interface',
      supported_protocols: ['cli', 'mcp', 'skill', 'product_entry', 'openai', 'ai_sdk'],
      internal_surface: null,
    },
    workspace_locator: {
      source_kind: 'selected_standard_agent_checkout',
      checkout_path: input.checkoutPath,
      workspace_argument_required_at_action_launch: true,
    },
    product_entry_shell: {},
    shared_handoff: {
      opl_return_surface: {
        surface_kind: 'opl_generated_standard_agent_return',
        target_domain_id: input.agent.target_domain_id,
      },
    },
    domain_entry_contract: {
      entry_adapter: 'opl_generated_standard_agent_interface',
      service_safe_surface_kind: 'opl_generated_agent_interface_bundle',
      product_entry_builder_command:
        `opl agents interfaces --domain ${input.agent.agent_id} --format product-entry`,
      supported_commands: actionIds,
      command_contracts: input.catalog.actions.map((action) => ({
        command: generatedEntryCommand(input.agent, action.action_id),
        required_fields: action.required_fields,
        optional_fields: action.optional_fields,
      })),
      domain_agent_entry_spec: {
        surface_kind: 'opl_generated_standard_agent_entry_spec',
        agent_id: input.agent.agent_id,
        title: input.agent.display_name,
        description: `${input.agent.display_name} owner-contract generated entry.`,
        default_engine: 'codex_cli',
        workspace_requirement: 'explicit_workspace_at_action_launch',
        locator_schema: {
          required_fields: [],
          optional_fields: ['workspace_root', 'profile_ref'],
        },
        codex_entry_strategy: 'opl_generated_interface',
        artifact_conventions: 'domain_owned_workspace_artifact_refs',
        progress_conventions: 'opl_stage_attempt_and_domain_owner_receipt_refs',
        entry_command: entryCommand,
        manifest_command: `opl agents interfaces --domain ${input.agent.agent_id}`,
      },
    },
    family_action_catalog_ref: {
      ref_kind: 'repo_path',
      ref: 'contracts/action_catalog.json',
      label: `${input.agent.short_label} action catalog`,
    },
    family_stage_control_plane_ref: {
      ref_kind: 'generated_surface',
      ref: 'opl-generated:family_stage_control_plane',
      source_ref: 'agent/stages/manifest.json',
      label: `${input.agent.short_label} generated stage control plane`,
    },
    standard_domain_agent_skeleton: {
      surface_kind: 'standard_domain_agent_skeleton',
      version: 'standard-domain-agent-skeleton.v1',
      agent_id: input.agent.agent_id,
      repo_source_boundary: {
        required_dirs: ['agent', 'contracts', 'runtime', 'docs'],
        forbidden_dirs: ['artifacts'],
      },
      contracts: {
        descriptor_refs: ['contracts/domain_descriptor.json'],
        sidecar_refs: ['contracts/generated_surface_handoff.json'],
        quality_gate_refs: ['agent/stages/manifest.json'],
      },
      artifact_boundary: {
        repo_contains_real_artifacts: false,
        artifact_roots_are_locators: true,
        workspace_artifact_locator_refs: [`workspace:${input.agent.agent_id}/artifacts`],
        runtime_artifact_locator_refs: [`runtime:${input.agent.agent_id}/receipts`],
      },
      authority_boundary: {
        opl: 'framework_transport_and_projection_only',
        domain: 'truth_quality_artifact_owner',
      },
    },
    notes: [
      'Standard Agent identity comes from the shared registry.',
      'Action and Stage semantics come from the selected owner checkout.',
    ],
  }, { repoDir: input.checkoutPath });

  if (!input.legacyManifest) return normalized;
  return {
    ...normalized,
    ...input.legacyManifest,
    target_domain_id: normalized.target_domain_id,
    formal_entry: normalized.formal_entry,
    domain_entry_contract: normalized.domain_entry_contract,
    family_action_catalog: normalized.family_action_catalog,
    family_action_catalog_source_ref: normalized.family_action_catalog_source_ref,
    family_stage_control_plane: normalized.family_stage_control_plane,
    family_stage_control_plane_source_ref: normalized.family_stage_control_plane_source_ref,
    standard_domain_agent_skeleton: normalized.standard_domain_agent_skeleton,
    standard_domain_agent_skeleton_source_field: normalized.standard_domain_agent_skeleton_source_field,
    workspace_locator: normalized.workspace_locator,
  } satisfies NormalizedDomainManifest;
}

function managedContractError(error: unknown) {
  return {
    code: error instanceof FrameworkContractError ? error.code : 'managed_contract_invalid',
    message: error instanceof Error ? error.message : String(error),
    stdout: null,
    stderr: null,
    details: error instanceof FrameworkContractError ? error.details : {},
  };
}

function buildStandardAgentCatalogEntry(
  agent: StandardAgent,
  legacyEntry: DomainManifestCatalogEntry | null,
): DomainManifestCatalogEntry {
  const resolution = resolveStandardAgentContractCheckout(
    agent.agent_id,
    undefined,
    undefined,
    { result: 'typed_resolution' },
  );
  if (!resolution.checkout) {
    return {
      project_id: agent.domain_id,
      project: agent.project,
      binding_id: legacyEntry?.binding_id ?? null,
      workspace_path: legacyEntry?.workspace_path ?? null,
      manifest_command: legacyEntry?.manifest_command ?? null,
      status: 'managed_contract_unavailable',
      manifest: null,
      standard_agent_identity: standardAgentIdentity(agent),
      standard_agent_contract_resolution: resolution,
      legacy_workspace_manifest_diagnostic: legacyWorkspaceManifestDiagnostic(legacyEntry),
      currentness_owner_action_packet: legacyEntry?.currentness_owner_action_packet ?? null,
      error: {
        code: 'standard_agent_managed_contract_checkout_unavailable',
        message: `Standard Agent managed contract checkout is unavailable: ${agent.agent_id}.`,
        stdout: null,
        stderr: null,
        details: {
          agent_id: agent.agent_id,
          domain_id: agent.domain_id,
          reason: resolution.reason,
          source_status: resolution.source_status,
        },
      },
    };
  }

  try {
    const managed = loadManagedStandardAgentContractCatalog({
      requested_domain_id: agent.agent_id,
      checkout_agent_id: resolution.checkout.agent_id,
      checkout_path: resolution.checkout.checkout_path,
    });
    return {
      project_id: agent.domain_id,
      project: agent.project,
      binding_id: legacyEntry?.binding_id ?? null,
      workspace_path: resolution.checkout.checkout_path,
      manifest_command: legacyEntry?.manifest_command ?? null,
      status: 'resolved',
      manifest: managedManifestProjection({
        agent,
        checkoutPath: resolution.checkout.checkout_path,
        legacyManifest: legacyEntry?.manifest ?? null,
        catalog: managed.catalog,
      }),
      standard_agent_identity: standardAgentIdentity(agent),
      standard_agent_contract_resolution: resolution,
      legacy_workspace_manifest_diagnostic: legacyWorkspaceManifestDiagnostic(legacyEntry),
      currentness_owner_action_packet: legacyEntry?.currentness_owner_action_packet ?? null,
      error: null,
    };
  } catch (error) {
    return {
      project_id: agent.domain_id,
      project: agent.project,
      binding_id: legacyEntry?.binding_id ?? null,
      workspace_path: legacyEntry?.workspace_path ?? resolution.checkout.checkout_path,
      manifest_command: legacyEntry?.manifest_command ?? null,
      status: 'managed_contract_invalid',
      manifest: null,
      standard_agent_identity: standardAgentIdentity(agent),
      standard_agent_contract_resolution: resolution,
      legacy_workspace_manifest_diagnostic: legacyWorkspaceManifestDiagnostic(legacyEntry),
      currentness_owner_action_packet: legacyEntry?.currentness_owner_action_packet ?? null,
      error: managedContractError(error),
    };
  }
}

export function buildStandardAgentDomainManifestCatalog(
  contracts: FrameworkContracts,
  options: CatalogOptions = {},
) {
  const { legacyDomainManifests, ...manifestOptions } = options;
  const legacyCatalog = legacyDomainManifests
    ?? buildDomainManifestCatalog(contracts, manifestOptions).domain_manifests;
  const agents = standardAgents();
  const standardAgentIds = new Set<string>(agents.map((agent) => agent.agent_id));
  const managedEntries = agents.map((agent) => buildStandardAgentCatalogEntry(
    agent,
    standardAgentEntryForLegacyCatalog(legacyCatalog, agent),
  ));
  const legacyEntries = legacyCatalog.projects.filter((entry) => {
    const agent = resolveStandardAgent(entry.project_id) ?? resolveStandardAgent(entry.project);
    return !agent || !standardAgentIds.has(agent.agent_id);
  });
  const projects = [...managedEntries, ...legacyEntries];
  const managedBlockedProjectIds = managedEntries
    .filter((entry) => entry.status !== 'resolved')
    .map((entry) => entry.project_id);

  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    domain_manifests: {
      ...legacyCatalog,
      summary: {
        ...legacyCatalog.summary,
        total_projects_count: projects.length,
        active_bindings_count: projects.filter((entry) => entry.binding_id !== null).length,
        manifest_configured_count: projects.filter((entry) => entry.manifest_command !== null).length,
        resolved_count: projects.filter((entry) => entry.status === 'resolved').length,
        failed_count: projects.filter((entry) => entry.status !== 'resolved').length,
        managed_standard_agent_count: managedEntries.length,
        managed_standard_agent_resolved_count:
          managedEntries.filter((entry) => entry.status === 'resolved').length,
        managed_standard_agent_blocked_count: managedBlockedProjectIds.length,
        managed_standard_agent_blocked_project_ids: managedBlockedProjectIds,
        legacy_nonstandard_project_count: legacyEntries.length,
      },
      projects,
      notes: [
        'Standard Agent membership is derived from the shared registry.',
        'Standard Agent action and Stage contracts are loaded from selected owner checkouts.',
        'domains.json contributes only non-standard legacy and workspace/runtime manifest diagnostics.',
      ],
    } satisfies DomainManifestCatalog,
  };
}

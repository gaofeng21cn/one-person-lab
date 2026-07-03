import {
  blockStatusIsReady,
  generatedSurfaceTargetAllowed,
} from './generated-interface-active-caller-proof.ts';
import { isRecord } from '../../../kernel/contract-validation.ts';
import { recordList } from '../../../kernel/json-record.ts';
import { optionalString } from '../../../kernel/json-file.ts';

type JsonRecord = Record<string, unknown>;

type GeneratedSurfaceConsumer = {
  surface_id: string;
  descriptor_block: string;
  source_catalogs: readonly string[];
};

type SelectedGeneratedInterfaceFormat =
  | 'all'
  | 'cli'
  | 'mcp'
  | 'skill'
  | 'product-entry'
  | 'openai'
  | 'ai-sdk';

const CONSUMPTION_SURFACE_SCOPE: Record<
  string,
  {
    descriptor_scope_id: string | null;
    selected_formats: SelectedGeneratedInterfaceFormat[];
    requires_wrapper_scope: boolean;
  }
> = {
  cli: {
    descriptor_scope_id: 'cli',
    selected_formats: ['all', 'cli'],
    requires_wrapper_scope: true,
  },
  mcp: {
    descriptor_scope_id: 'mcp',
    selected_formats: ['all', 'mcp'],
    requires_wrapper_scope: true,
  },
  openai_tool: {
    descriptor_scope_id: null,
    selected_formats: ['all', 'openai'],
    requires_wrapper_scope: false,
  },
  ai_sdk: {
    descriptor_scope_id: null,
    selected_formats: ['all', 'ai-sdk'],
    requires_wrapper_scope: false,
  },
  skill_plugin: {
    descriptor_scope_id: 'skill',
    selected_formats: ['all', 'skill'],
    requires_wrapper_scope: true,
  },
  app_action: {
    descriptor_scope_id: 'product_entry',
    selected_formats: ['all', 'product-entry'],
    requires_wrapper_scope: true,
  },
  status_read_model: {
    descriptor_scope_id: 'product_status',
    selected_formats: ['all', 'product-entry'],
    requires_wrapper_scope: true,
  },
  workbench: {
    descriptor_scope_id: 'workbench',
    selected_formats: ['all', 'product-entry'],
    requires_wrapper_scope: true,
  },
};

function descriptorStatusFor(blocks: JsonRecord, blockKey: string) {
  return optionalString((isRecord(blocks[blockKey]) ? blocks[blockKey] : null)?.status);
}

export function buildGeneratedSurfaceConsumptionBundle(input: {
  supportedDerivedSurfaces: readonly GeneratedSurfaceConsumer[];
  blocks: JsonRecord;
  compilerStatus: string;
  generatedBlocksReady: boolean;
  generatedBlockKeys: string[];
  selectedFormat: SelectedGeneratedInterfaceFormat;
  sourceOfWorkLineage: JsonRecord;
  activeCallerCutoverProof: JsonRecord;
  generatedWrapperBundle: JsonRecord;
}) {
  const wrapperScopes = recordList(input.generatedWrapperBundle.descriptor_scope);
  const wrapperScopeBySurface = new Map(
    wrapperScopes.map((scope) => [optionalString(scope.surface_id), scope]),
  );
  const consumers = input.supportedDerivedSurfaces.map((surface) => {
    const scope = CONSUMPTION_SURFACE_SCOPE[surface.surface_id];
    const selected = scope.selected_formats.includes(input.selectedFormat);
    const wrapperScope = scope.descriptor_scope_id
      ? wrapperScopeBySurface.get(scope.descriptor_scope_id) ?? null
      : null;
    const descriptorStatus = descriptorStatusFor(input.blocks, surface.descriptor_block);
    const wrapperStatus = optionalString(wrapperScope?.status);
    const targetKind = optionalString(wrapperScope?.active_caller_target_kind);
    const blockers = [
      selected ? null : `not_selected:${surface.surface_id}`,
      descriptorStatus && blockStatusIsReady(descriptorStatus) ? null : `blocked_descriptor:${surface.surface_id}`,
      !scope.requires_wrapper_scope || wrapperStatus === 'ready' ? null : `blocked_wrapper:${surface.surface_id}`,
      !scope.requires_wrapper_scope || (targetKind && generatedSurfaceTargetAllowed(targetKind))
        ? null
        : `blocked_target:${surface.surface_id}`,
    ].filter((entry): entry is string => Boolean(entry));
    return {
      surface_id: surface.surface_id,
      descriptor_block: surface.descriptor_block,
      owner: 'one-person-lab',
      consumer_role:
        surface.surface_id === 'app_action' || surface.surface_id === 'status_read_model' || surface.surface_id === 'workbench'
          ? 'app_or_workbench_consumer'
          : surface.surface_id === 'skill_plugin'
            ? 'codex_skill_consumer'
            : 'tool_surface_consumer',
      consumption_status: blockers.length === 0 ? 'ready_to_consume_generated_surface' : 'blocked',
      blockers,
      descriptor_status: descriptorStatus,
      descriptor_scope_id: scope.descriptor_scope_id,
      selected_for_format: selected,
      wrapper_scope_status: wrapperStatus,
      active_caller_target_kind: targetKind,
      active_caller_module_id: optionalString(wrapperScope?.active_caller_module_id),
      source_catalogs: [...surface.source_catalogs],
      source_of_work_lineage_ref: 'generated_agent_interfaces.source_of_work_lineage',
      active_caller_cutover_proof_ref: 'generated_agent_interfaces.active_caller_cutover_proof',
      generated_wrapper_bundle_ref: 'generated_agent_interfaces.generated_wrapper_bundle',
      domain_repo_can_own_generated_surface: false,
      domain_repo_role: 'domain_handler_target_or_refs_only_adapter',
    };
  });
  const selectedConsumers = consumers.filter((consumer) => consumer.selected_for_format);
  const blockerList = selectedConsumers.flatMap((consumer) =>
    consumer.blockers.filter((blocker) => !blocker.startsWith('not_selected:'))
  );
  const ready = input.compilerStatus === 'ready'
    && input.generatedBlocksReady
    && optionalString(input.activeCallerCutoverProof.status) === 'cutover_to_opl_generated_or_domain_handler_targets'
    && blockerList.length === 0;
  return {
    surface_kind: 'opl_generated_surface_consumption_bundle',
    version: 'opl-generated-surface-consumption-bundle.v1',
    owner: 'one-person-lab',
    status: ready ? 'ready_for_generated_surface_consumption' : 'blocked',
    generated_surface_owner: 'one-person-lab',
    domain_repo_can_own_generated_surface: false,
    compiler_status: input.compilerStatus,
    selected_format: input.selectedFormat,
    generated_blocks_ready: input.generatedBlocksReady,
    generated_block_keys: input.generatedBlockKeys,
    source_of_work_lineage_status: optionalString(input.sourceOfWorkLineage.status),
    active_caller_cutover_status: optionalString(input.activeCallerCutoverProof.status),
    generated_wrapper_bundle_status: optionalString(input.generatedWrapperBundle.status),
    consumption_status_counts: {
      selected: selectedConsumers.length,
      ready: selectedConsumers.filter((consumer) => consumer.consumption_status === 'ready_to_consume_generated_surface').length,
      blocked: selectedConsumers.filter((consumer) => consumer.consumption_status === 'blocked').length,
    },
    consumers,
    consumer_surface_ids: consumers.map((consumer) => consumer.surface_id),
    default_entry_policy_ref: 'generated_agent_interfaces.default_entry_policy',
    source_of_work_lineage_ref: 'generated_agent_interfaces.source_of_work_lineage',
    active_caller_cutover_proof_ref: 'generated_agent_interfaces.active_caller_cutover_proof',
    generated_wrapper_bundle_ref: 'generated_agent_interfaces.generated_wrapper_bundle',
    scope_claim: 'generated_surface_consumption_readiness_only_not_live_soak_or_domain_ready',
    claims_live_soak_complete: false,
    claims_domain_ready: false,
    claims_artifact_producing_owner_receipt: false,
    authority_boundary: {
      consumption_bundle_can_write_domain_truth: false,
      consumption_bundle_can_write_memory_body: false,
      consumption_bundle_can_authorize_quality_or_export: false,
      consumption_bundle_can_mutate_artifacts: false,
      consumption_bundle_can_claim_domain_ready: false,
      consumption_bundle_can_claim_production_ready: false,
      generated_surface_routes_to_domain_handler_or_refs_only_adapter: true,
    },
  };
}

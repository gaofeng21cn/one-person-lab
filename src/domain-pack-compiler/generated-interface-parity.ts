import { projectFamilyAction } from '../family-action-catalog.ts';
import type {
  FamilyActionCatalog,
  FamilyActionCatalogAction,
} from '../family-action-catalog-contract.ts';

type GeneratedSurfaceId =
  | 'cli'
  | 'mcp'
  | 'skill'
  | 'product_entry'
  | 'openai_tool'
  | 'ai_sdk';

const GENERATED_DESCRIPTOR_SURFACES: GeneratedSurfaceId[] = [
  'cli',
  'mcp',
  'skill',
  'product_entry',
  'openai_tool',
  'ai_sdk',
];

function sourceActionId(action: FamilyActionCatalogAction) {
  return action.source_of_work?.source_action_id ?? action.action_id;
}

function descriptorActionId(surface: GeneratedSurfaceId, value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (surface === 'mcp' || surface === 'openai_tool' || surface === 'ai_sdk') {
    const name = surface === 'openai_tool'
      && record.function
      && typeof record.function === 'object'
      && !Array.isArray(record.function)
      ? (record.function as Record<string, unknown>).name
      : record.name;
    return typeof name === 'string' && name.trim() ? name.trim() : null;
  }
  const id = surface === 'product_entry'
    ? record.action_key
    : record.action_id ?? record.command_contract_id;
  return typeof id === 'string' && id.trim() ? id.trim() : null;
}

function expectedDescriptorId(surface: GeneratedSurfaceId, action: FamilyActionCatalogAction) {
  const projections = projectFamilyAction(action);
  if (surface === 'cli') {
    return projections.cli.action_id;
  }
  if (surface === 'mcp') {
    return projections.mcp.name;
  }
  if (surface === 'skill') {
    return projections.skill.command_contract_id;
  }
  if (surface === 'product_entry') {
    return projections.product_entry.action_key;
  }
  if (surface === 'openai_tool') {
    return projections.openai.function.name;
  }
  return projections.ai_sdk.name;
}

function outputSchemaRefMatches(action: FamilyActionCatalogAction, value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return true;
  }
  const record = value as Record<string, unknown>;
  const outputSchemaRef = record.output_schema_ref ?? record.outputSchemaRef;
  return outputSchemaRef === undefined || outputSchemaRef === action.output_schema_ref;
}

function descriptorLineageMatches(action: FamilyActionCatalogAction, value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  const lineage = record.source_of_work;
  if (!lineage || typeof lineage !== 'object' || Array.isArray(lineage)) {
    return false;
  }
  return (lineage as Record<string, unknown>).source_action_id === sourceActionId(action);
}

export function buildGeneratedDirectParityProof(
  catalog: FamilyActionCatalog | null,
  blocks: Record<string, unknown>,
  activeCallerTargetProof: {
    status: string;
    blocked_target_count: number;
  },
) {
  if (!catalog) {
    return {
      surface_kind: 'opl_generated_direct_parity_proof',
      version: 'opl-generated-direct-parity-proof.v1',
      owner: 'one-person-lab',
      status: 'blocked_missing_family_action_catalog',
      source_catalogs: ['family_action_catalog', 'generated_interface_bundle', 'active_caller_target_proof'],
      checked_action_ids: [],
      checked_surface_ids: [...GENERATED_DESCRIPTOR_SURFACES],
      issue_count: 1,
      issues: ['missing family_action_catalog'],
      action_parity: [],
      accepted_answer_shape_policy:
        'generated_surface_and_direct_domain_handler_share_action_output_schema_or_receipt_contract',
      authority_boundary: parityAuthorityBoundary(),
    };
  }

  const issues: string[] = [];
  const actionParity = catalog.actions.map((action) => {
    const expectedSourceActionId = sourceActionId(action);
    const surfaceParity = GENERATED_DESCRIPTOR_SURFACES.map((surface) => {
      const block = blocks[surface];
      const descriptors = block
        && typeof block === 'object'
        && !Array.isArray(block)
        && Array.isArray((block as Record<string, unknown>).descriptors)
        ? (block as Record<string, unknown>).descriptors as unknown[]
        : [];
      const expectedId = expectedDescriptorId(surface, action);
      const descriptor = descriptors.find((entry) => descriptorActionId(surface, entry) === expectedId);
      const missing = descriptor ? null : `${action.action_id}:${surface}: missing generated descriptor`;
      const lineageDrift = descriptor && !descriptorLineageMatches(action, descriptor)
        ? `${action.action_id}:${surface}: source-of-work lineage diverges from action catalog`
        : null;
      const outputDrift = descriptor && !outputSchemaRefMatches(action, descriptor)
        ? `${action.action_id}:${surface}: output schema diverges from direct accepted answer shape`
        : null;
      for (const issue of [missing, lineageDrift, outputDrift]) {
        if (issue) {
          issues.push(issue);
        }
      }
      return {
        surface_id: surface,
        status: missing || lineageDrift || outputDrift ? 'drift_detected' : 'aligned',
        source_action_id: expectedSourceActionId,
        generated_descriptor_id: descriptorActionId(surface, descriptor),
        output_schema_ref: action.output_schema_ref,
        accepted_answer_shape_ref: action.output_schema_ref,
      };
    });
    return {
      action_id: action.action_id,
      source_action_id: expectedSourceActionId,
      direct_target_command: action.source_command.command,
      accepted_answer_shape_ref: action.output_schema_ref,
      generated_surfaces: surfaceParity,
      status: surfaceParity.every((surface) => surface.status === 'aligned') ? 'aligned' : 'drift_detected',
    };
  });

  const targetProofReady =
    activeCallerTargetProof.status === 'ready'
    && activeCallerTargetProof.blocked_target_count === 0;
  if (!targetProofReady) {
    issues.push('active caller target proof is not ready');
  }

  return {
    surface_kind: 'opl_generated_direct_parity_proof',
    version: 'opl-generated-direct-parity-proof.v1',
    owner: 'one-person-lab',
    status: issues.length === 0 ? 'aligned' : 'blocked_or_drift_detected',
    source_catalogs: ['family_action_catalog', 'generated_interface_bundle', 'active_caller_target_proof'],
    checked_action_ids: catalog.actions.map((action) => action.action_id),
    checked_surface_ids: [...GENERATED_DESCRIPTOR_SURFACES],
    active_caller_target_proof_status: activeCallerTargetProof.status,
    active_caller_target_blocked_count: activeCallerTargetProof.blocked_target_count,
    issue_count: issues.length,
    issues,
    action_parity: actionParity,
    accepted_answer_shape_policy:
      'generated_surface_and_direct_domain_handler_share_action_output_schema_or_receipt_contract',
    authority_boundary: parityAuthorityBoundary(),
  };
}

function parityAuthorityBoundary() {
  return {
    parity_proof_can_write_domain_truth: false,
    parity_proof_can_sign_owner_receipt: false,
    parity_proof_can_create_typed_blocker: false,
    parity_proof_can_authorize_quality_or_export: false,
    parity_proof_can_mutate_artifacts: false,
    parity_proof_can_claim_domain_ready: false,
    parity_proof_can_claim_production_ready: false,
  };
}

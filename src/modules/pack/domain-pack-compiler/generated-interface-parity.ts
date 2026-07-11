import { projectFamilyAction } from '../../../kernel/family-action-catalog-projection.ts';
import type {
  FamilyActionCatalog,
  FamilyActionCatalogAction,
} from '../../../kernel/family-action-catalog-contract.ts';
import { isRecord } from '../../../kernel/contract-validation.ts';
import { optionalString } from '../../../kernel/json-file.ts';

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

function expectedGeneratedSurfaces(action: FamilyActionCatalogAction) {
  return action.stage_route_exempt === 'domain_handler_target_only'
    ? ['mcp', 'product_entry'] as GeneratedSurfaceId[]
    : GENERATED_DESCRIPTOR_SURFACES;
}

function sourceActionId(action: FamilyActionCatalogAction) {
  return action.source_of_work?.source_action_id ?? action.action_id;
}

function descriptorActionId(surface: GeneratedSurfaceId, value: unknown) {
  if (!isRecord(value)) {
    return null;
  }
  const record = value;
  if (surface === 'mcp' || surface === 'openai_tool' || surface === 'ai_sdk') {
    const name = surface === 'openai_tool'
      && record.function
      && typeof record.function === 'object'
      && !Array.isArray(record.function)
      ? (record.function as Record<string, unknown>).name
      : record.name;
    return typeof name === 'string' && name.trim() ? name.trim() : null;
  }
  if (surface === 'skill') {
    const id = record.command_contract_id ?? record.action_id;
    return typeof id === 'string' && id.trim() ? id.trim() : null;
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
  return descriptorAcceptedAnswerShapeRef(value) === action.output_schema_ref;
}

function descriptorAcceptedAnswerShapeRef(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }
  const record = value;
  return optionalString(record.accepted_answer_shape_ref)
    ?? optionalString(record.output_schema_ref)
    ?? optionalString(record.outputSchemaRef);
}

function descriptorLineageMatches(action: FamilyActionCatalogAction, value: unknown) {
  if (!isRecord(value)) {
    return false;
  }
  const record = value;
  const lineage = record.source_of_work;
  if (!isRecord(lineage)) {
    return false;
  }
  return lineage.source_action_id === sourceActionId(action);
}

function findDescriptorForAction(
  surface: GeneratedSurfaceId,
  action: FamilyActionCatalogAction,
  descriptors: unknown[],
) {
  const expectedId = expectedDescriptorId(surface, action);
  const candidates = descriptors.filter((entry) => descriptorActionId(surface, entry) === expectedId);
  return candidates.find((entry) => descriptorLineageMatches(action, entry))
    ?? candidates.find((entry) => descriptorAcceptedAnswerShapeRef(entry) === action.output_schema_ref)
    ?? candidates[0];
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
  const acceptedAnswerShapeRoundtrip: Record<string, unknown>[] = [];
  const actionParity = catalog.actions.map((action) => {
    const expectedSurfaces = expectedGeneratedSurfaces(action);
    const expectedSourceActionId = sourceActionId(action);
    const generatedAcceptedAnswerShapeRefs: Record<GeneratedSurfaceId, string | null> = {
      cli: null,
      mcp: null,
      skill: null,
      product_entry: null,
      openai_tool: null,
      ai_sdk: null,
    };
    const surfaceParity = GENERATED_DESCRIPTOR_SURFACES.map((surface) => {
      if (!expectedSurfaces.includes(surface)) {
        return {
          surface_id: surface,
          status: 'not_applicable' as const,
          source_action_id: expectedSourceActionId,
          generated_descriptor_id: null,
          output_schema_ref: action.output_schema_ref,
          accepted_answer_shape_ref: action.output_schema_ref,
        };
      }
      const block = blocks[surface];
      const descriptors = block
        && typeof block === 'object'
        && !Array.isArray(block)
        && Array.isArray((block as Record<string, unknown>).descriptors)
        ? (block as Record<string, unknown>).descriptors as unknown[]
        : [];
      const descriptor = findDescriptorForAction(surface, action, descriptors);
      generatedAcceptedAnswerShapeRefs[surface] = descriptorAcceptedAnswerShapeRef(descriptor);
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
    const roundtripAligned = expectedSurfaces.every(
      (surface) => generatedAcceptedAnswerShapeRefs[surface] === action.output_schema_ref,
    );
    acceptedAnswerShapeRoundtrip.push({
      action_id: action.action_id,
      domain_id: catalog.target_domain_id,
      owner: action.owner,
      direct_target_command: action.source_command.command,
      direct_target_surface_kind: action.source_command.surface_kind,
      direct_accepted_answer_shape_ref: action.output_schema_ref,
      generated_accepted_answer_shape_refs: generatedAcceptedAnswerShapeRefs,
      roundtrip_status: roundtripAligned ? 'accepted_answer_shape_aligned' : 'accepted_answer_shape_drift_detected',
    });
    return {
      action_id: action.action_id,
      source_action_id: expectedSourceActionId,
      direct_target_command: action.source_command.command,
      accepted_answer_shape_ref: action.output_schema_ref,
      expected_generated_surface_ids: expectedSurfaces,
      generated_surfaces: surfaceParity,
      status: surfaceParity.every(
        (surface) => surface.status === 'aligned' || surface.status === 'not_applicable',
      ) ? 'aligned' : 'drift_detected',
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
    domain_id: catalog.target_domain_id,
    status: issues.length === 0 ? 'aligned' : 'blocked_or_drift_detected',
    source_catalogs: ['family_action_catalog', 'generated_interface_bundle', 'active_caller_target_proof'],
    checked_action_ids: catalog.actions.map((action) => action.action_id),
    checked_surface_ids: [...GENERATED_DESCRIPTOR_SURFACES],
    active_caller_target_proof_status: activeCallerTargetProof.status,
    active_caller_target_blocked_count: activeCallerTargetProof.blocked_target_count,
    issue_count: issues.length,
    issues,
    action_parity: actionParity,
    accepted_answer_shape_roundtrip: acceptedAnswerShapeRoundtrip,
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

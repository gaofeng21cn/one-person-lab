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
  return GENERATED_DESCRIPTOR_SURFACES.filter((surface) => {
    if (surface === 'openai_tool') return action.supported_surfaces.openai !== null;
    if (surface === 'ai_sdk') return action.supported_surfaces.ai_sdk !== null;
    return action.supported_surfaces[surface] !== null;
  });
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

function expectedDescriptorId(
  surface: GeneratedSurfaceId,
  action: FamilyActionCatalogAction,
  targetDomainId: string,
  workspacePath: string,
) {
  const projections = projectFamilyAction(action, targetDomainId, workspacePath);
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

function descriptorSourceActionId(value: unknown) {
  if (!isRecord(value) || !isRecord(value.source_of_work)) {
    return null;
  }
  return optionalString(value.source_of_work.source_action_id);
}

function descriptorsForSurface(blocks: Record<string, unknown>, surface: GeneratedSurfaceId) {
  const block = blocks[surface];
  return block
    && typeof block === 'object'
    && !Array.isArray(block)
    && Array.isArray((block as Record<string, unknown>).descriptors)
    ? (block as Record<string, unknown>).descriptors as unknown[]
    : [];
}

function descriptorPairKey(descriptorId: string, sourceId: string) {
  return JSON.stringify([descriptorId, sourceId]);
}

function findDescriptorForAction(
  surface: GeneratedSurfaceId,
  action: FamilyActionCatalogAction,
  targetDomainId: string,
  workspacePath: string,
  descriptors: unknown[],
) {
  const expectedId = expectedDescriptorId(surface, action, targetDomainId, workspacePath);
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
  workspacePath: string,
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
  const surfaceSetParity = GENERATED_DESCRIPTOR_SURFACES.map((surface) => {
    const expected = catalog.actions.flatMap((action) => (
      expectedGeneratedSurfaces(action).includes(surface)
        ? [{
            descriptor_id: expectedDescriptorId(
              surface,
              action,
              catalog.target_domain_id,
              workspacePath,
            ),
            source_action_id: sourceActionId(action),
          }]
        : []
    ));
    const actualDescriptors = descriptorsForSurface(blocks, surface);
    const actual = actualDescriptors.flatMap((descriptor, index) => {
      const descriptorId = descriptorActionId(surface, descriptor);
      const sourceId = descriptorSourceActionId(descriptor);
      if (!descriptorId || !sourceId) {
        issues.push(`${surface}: generated descriptor[${index}] is missing canonical id or source_action_id`);
        return [];
      }
      return [{ descriptor_id: descriptorId, source_action_id: sourceId }];
    });
    const expectedKeys = new Set(expected.map((entry) => descriptorPairKey(entry.descriptor_id, entry.source_action_id)));
    const actualCounts = new Map<string, number>();
    for (const entry of actual) {
      const key = descriptorPairKey(entry.descriptor_id, entry.source_action_id);
      actualCounts.set(key, (actualCounts.get(key) ?? 0) + 1);
      if (!expectedKeys.has(key)) {
        issues.push(`${surface}: unexpected generated descriptor ${entry.descriptor_id} from ${entry.source_action_id}`);
      }
    }
    for (const entry of expected) {
      const key = descriptorPairKey(entry.descriptor_id, entry.source_action_id);
      if (!actualCounts.has(key)) {
        issues.push(`${surface}: missing generated descriptor ${entry.descriptor_id} from ${entry.source_action_id}`);
      }
    }
    for (const [key, count] of actualCounts) {
      if (count > 1) {
        const [descriptorId, sourceId] = JSON.parse(key) as [string, string];
        issues.push(`${surface}: duplicate generated descriptor ${descriptorId} from ${sourceId}`);
      }
    }
    return {
      surface_id: surface,
      expected_descriptor_count: expected.length,
      actual_descriptor_count: actualDescriptors.length,
      status: issues.some((issue) => issue.startsWith(`${surface}:`)) ? 'drift_detected' : 'aligned',
    };
  });
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
      const descriptors = descriptorsForSurface(blocks, surface);
      if (!expectedSurfaces.includes(surface)) {
        const unexpectedDescriptor = descriptors.find((descriptor) => (
          descriptorSourceActionId(descriptor) === expectedSourceActionId
          || descriptorActionId(surface, descriptor)
            === expectedDescriptorId(surface, action, catalog.target_domain_id, workspacePath)
        ));
        if (unexpectedDescriptor) {
          const issue = `${action.action_id}:${surface}: generated descriptor exists for an unsupported surface`;
          issues.push(issue);
          return {
            surface_id: surface,
            status: 'drift_detected' as const,
            source_action_id: expectedSourceActionId,
            generated_descriptor_id: descriptorActionId(surface, unexpectedDescriptor),
            output_schema_ref: action.output_schema_ref,
            accepted_answer_shape_ref: action.output_schema_ref,
          };
        }
        return {
          surface_id: surface,
          status: 'not_applicable' as const,
          source_action_id: expectedSourceActionId,
          generated_descriptor_id: null,
          output_schema_ref: action.output_schema_ref,
          accepted_answer_shape_ref: action.output_schema_ref,
        };
      }
      const descriptor = findDescriptorForAction(
        surface,
        action,
        catalog.target_domain_id,
        workspacePath,
        descriptors,
      );
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
      hosted_command: projectFamilyAction(action, catalog.target_domain_id, workspacePath).cli.command,
      execution_binding: action.execution_binding,
      direct_accepted_answer_shape_ref: action.output_schema_ref,
      generated_accepted_answer_shape_refs: generatedAcceptedAnswerShapeRefs,
      roundtrip_status: roundtripAligned ? 'accepted_answer_shape_aligned' : 'accepted_answer_shape_drift_detected',
    });
    return {
      action_id: action.action_id,
      source_action_id: expectedSourceActionId,
      hosted_command: projectFamilyAction(action, catalog.target_domain_id, workspacePath).cli.command,
      execution_binding: action.execution_binding,
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
    surface_set_parity: surfaceSetParity,
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

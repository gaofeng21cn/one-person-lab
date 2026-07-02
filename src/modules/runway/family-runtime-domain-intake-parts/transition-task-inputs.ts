import {
  FAMILY_RUNTIME_DOMAIN_IDS,
  type EnqueueInput,
  type FamilyRuntimeDomainId,
} from '../family-runtime-command.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isFamilyRuntimeDomainId(value: string): value is FamilyRuntimeDomainId {
  return FAMILY_RUNTIME_DOMAIN_IDS.includes(value as FamilyRuntimeDomainId);
}

function canonicalFamilyRuntimeDomainId(value: unknown): FamilyRuntimeDomainId | null {
  const raw = optionalString(value);
  if (!raw) {
    return null;
  }
  const normalized = raw.toLowerCase();
  const aliases: Record<string, FamilyRuntimeDomainId> = {
    mas: 'medautoscience',
    'med-autoscience': 'medautoscience',
    med_autoscience: 'medautoscience',
    medautoscience: 'medautoscience',
    mag: 'medautogrant',
    'med-auto-grant': 'medautogrant',
    'med-autogrant': 'medautogrant',
    med_auto_grant: 'medautogrant',
    med_autogrant: 'medautogrant',
    medautogrant: 'medautogrant',
    rca: 'redcube',
    redcube: 'redcube',
    'redcube-ai': 'redcube',
    redcube_ai: 'redcube',
    oma: 'opl-meta-agent',
    oplmetaagent: 'opl-meta-agent',
    'opl-meta-agent': 'opl-meta-agent',
    opl_meta_agent: 'opl-meta-agent',
  };
  return aliases[normalized] ?? null;
}

function familyTransitionMatrixResult(output: Record<string, unknown>) {
  const matrix = isRecord(output.family_transition_matrix_result)
    ? output.family_transition_matrix_result
    : output.surface_kind === 'family_transition_matrix_result'
      ? output
      : null;
  if (!matrix) {
    return null;
  }
  return matrix.surface_kind === 'family_transition_matrix_result' ? matrix : null;
}

function ownerRouteOwnerFrom(result: Record<string, unknown>) {
  const ownerRoute = isRecord(result.owner_route) ? result.owner_route : null;
  return optionalString(ownerRoute?.owner);
}

function transitionTaskInputFromMatrixEntry(
  domainId: FamilyRuntimeDomainId,
  matrix: Record<string, unknown>,
  entry: unknown,
  source: string,
): { input?: EnqueueInput; blocked?: { reason: string; task: unknown } } {
  if (!isRecord(entry)) {
    return { blocked: { reason: 'invalid_transition_matrix_entry', task: entry } };
  }
  const result = isRecord(entry.result) ? entry.result : null;
  const specId = optionalString(matrix.spec_id);
  const caseId = optionalString(entry.case_id);
  const transitionId = optionalString(result?.transition_id);
  if (!result || result.surface_kind !== 'family_transition_result' || !specId || !caseId || !transitionId) {
    return { blocked: { reason: 'invalid_transition_matrix_result', task: entry } };
  }
  const declaredDomain = optionalString(result.domain_id);
  const exportedDomain = declaredDomain ? canonicalFamilyRuntimeDomainId(declaredDomain) : domainId;
  if (!exportedDomain || !isFamilyRuntimeDomainId(exportedDomain)) {
    return { blocked: { reason: 'invalid_transition_domain', task: entry } };
  }
  const sourceRef = `family_transition_matrix_result:${specId}:${caseId}`;
  return {
    input: {
      domainId: exportedDomain,
      taskKind: 'family_transition/domain_tick',
      payload: {
        family_transition: result,
        source_refs: [
          {
            role: 'family_transition_matrix_case',
            ref: sourceRef,
          },
        ],
        opl_provider_hosted_stage_attempt: true,
        authority_boundary: {
          opl_can_write_domain_truth: false,
          opl_executes_domain_action: false,
          opl_authorizes_domain_verdict: false,
          domain_transition_owner: ownerRouteOwnerFrom(result) ?? 'domain_agent',
        },
      },
      dedupeKey: `${specId}:${caseId}:${transitionId}`,
      priority: 60,
      source,
    },
  };
}

export function transitionTaskInputsFromMatrix(
  domainId: FamilyRuntimeDomainId,
  output: Record<string, unknown>,
  source: string,
) {
  const matrix = familyTransitionMatrixResult(output);
  if (!matrix) {
    return { inputs: [], blocked: [] };
  }
  const entries = Array.isArray(matrix.results) ? matrix.results : [];
  const inputs: EnqueueInput[] = [];
  const blocked: Array<{ reason: string; task: unknown }> = [];
  for (const entry of entries) {
    const result = transitionTaskInputFromMatrixEntry(domainId, matrix, entry, source);
    if (result.input) {
      inputs.push(result.input);
    } else if (result.blocked) {
      blocked.push(result.blocked);
    }
  }
  return { inputs, blocked };
}

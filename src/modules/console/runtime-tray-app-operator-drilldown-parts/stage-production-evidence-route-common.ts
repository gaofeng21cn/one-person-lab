export function familyRuntimeCommandDomainId(domainId: string | null, projectId: string | null): string | null {
  const normalizedValues = [domainId, projectId].flatMap((value) => {
    if (!value) {
      return [];
    }
    const normalized = value.trim().toLowerCase().replaceAll('_', '-');
    return [normalized, normalized.replaceAll('-', '')];
  });
  if (normalizedValues.some((value) => value === 'medautoscience' || value === 'med-autoscience' || value === 'mas')) {
    return 'medautoscience';
  }
  if (normalizedValues.some((value) => value === 'medautogrant' || value === 'med-autogrant' || value === 'mag')) {
    return 'medautogrant';
  }
  if (normalizedValues.some((value) => value === 'redcube' || value === 'redcube-ai' || value === 'redcubeai' || value === 'rca')) {
    return 'redcube';
  }
  return null;
}

export function stageProductionEvidenceRequestId(domainId: string, stageId: string) {
  return `stage_production_evidence:${domainId}:${stageId}`;
}

export function stageProductionEvidenceRequestPackId(domainId: string) {
  return `${domainId}.stage_production_evidence`;
}

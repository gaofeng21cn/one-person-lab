import {
  normalizeResumeContract,
  requireString,
} from './internal.ts';

export function buildProductEntryResumeSurface(command: string, resumeContract: unknown) {
  const normalizedContract = normalizeResumeContract(resumeContract, 'resume_contract');
  return {
    surface_kind: normalizedContract.surface_kind,
    command: requireString(command, 'command'),
    session_locator_field: normalizedContract.session_locator_field,
    checkpoint_locator_field: normalizedContract.checkpoint_locator_field,
  };
}

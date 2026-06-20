import fs from 'node:fs';

import type {
  EnqueueInput,
  FamilyRuntimeDomainId,
} from '../family-runtime-command.ts';

import {
  currentControlProviderAdmissionCandidateFromTransitionRequestTask,
  currentControlProviderAdmissionCandidates,
  currentControlTransitionPendingCandidateFromTask,
  mergeCurrentControlProviderAdmissionCandidates,
} from './current-control-provider-admission-parts/candidate-normalization.ts';
import { recordCurrentControlTransitionNonAdvancingApply } from './current-control-provider-admission-parts/non-advancing-apply.ts';
import { currentControlProviderAdmissionInputFrom } from './current-control-provider-admission-parts/provider-input.ts';
export {
  publishCurrentControlProviderAdmissionReadback,
  publishExistingCurrentControlProviderAdmissionReadbacks,
} from './current-control-provider-admission-parts/readback-publication.ts';
import {
  type CurrentControlProviderAdmissionBlocked,
  type CurrentControlProviderAdmissionExportContext,
  type CurrentControlTransitionReadbackPublication,
  currentControlStatePath,
  isRecord,
  readJsonRecord,
} from './current-control-provider-admission-parts/shared.ts';
export type { CurrentControlProviderAdmissionExportContext } from './current-control-provider-admission-parts/shared.ts';

export function currentControlProviderAdmissionInputs(
  domainId: FamilyRuntimeDomainId,
  output: Record<string, unknown>,
  exportContext: CurrentControlProviderAdmissionExportContext,
  pendingInputs: EnqueueInput[] = [],
) {
  const currentControlRef = currentControlStatePath(output);
  if (!currentControlRef || !fs.existsSync(currentControlRef)) {
    return { inputs: [], blocked: [], current_control_readback_publications: [] };
  }
  const currentControl = readJsonRecord(currentControlRef);
  if (!currentControl) {
    return {
      inputs: [],
      blocked: [{ reason: 'invalid_current_control_state', task: { ref: currentControlRef } }],
      current_control_readback_publications: [],
    };
  }
  const candidates = currentControlProviderAdmissionCandidates(currentControl);
  const transitionReadbackCandidates: Record<string, unknown>[] = [];
  for (const input of pendingInputs) {
    const candidate = currentControlProviderAdmissionCandidateFromTransitionRequestTask(input);
    if (candidate) {
      mergeCurrentControlProviderAdmissionCandidates(candidates, candidate);
    }
    const transitionCandidate = currentControlTransitionPendingCandidateFromTask(input);
    if (transitionCandidate?.candidate) {
      transitionReadbackCandidates.push(transitionCandidate.candidate);
    }
  }
  const inputs: EnqueueInput[] = [];
  const blocked: CurrentControlProviderAdmissionBlocked[] = [];
  const currentControlReadbackPublications: CurrentControlTransitionReadbackPublication[] = [];
  for (const candidate of transitionReadbackCandidates) {
    const result = recordCurrentControlTransitionNonAdvancingApply({
      currentControl,
      candidate,
      output,
      currentControlRef,
    });
    if (result.publication) {
      currentControlReadbackPublications.push(result.publication);
      blocked.push({
        reason: 'current_control_transition_non_advancing_apply_recorded',
        task: candidate,
      });
    } else if (result.blocked) {
      blocked.push(result.blocked);
    }
  }
  for (const input of pendingInputs) {
    const transitionCandidate = currentControlTransitionPendingCandidateFromTask(input);
    if (transitionCandidate?.blocked) {
      blocked.push(transitionCandidate.blocked);
    }
  }
  for (const candidate of candidates) {
    if (!isRecord(candidate)) {
      blocked.push({ reason: 'invalid_current_control_provider_admission_candidate', task: candidate });
      continue;
    }
    const result = currentControlProviderAdmissionInputFrom(
      domainId,
      candidate,
      output,
      exportContext,
      currentControlRef,
    );
    if (result.input) {
      inputs.push(result.input);
    } else if (result.blocked) {
      blocked.push(result.blocked);
    }
  }
  return {
    inputs,
    blocked,
    current_control_readback_publications: currentControlReadbackPublications,
  };
}

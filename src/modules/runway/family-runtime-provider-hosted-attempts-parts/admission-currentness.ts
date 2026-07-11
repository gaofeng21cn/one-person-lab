import { preflightDomainWorkspaceCheckoutCurrentness } from '../family-runtime-checkout-currentness.ts';
import type { DomainHandlerCheckoutCurrentnessPreflight } from '../family-runtime-domain-handler-process.ts';
import type { FamilyRuntimeTaskRow } from '../family-runtime-store.ts';
import type { buildStageAdmissionLaunchGate } from '../family-runtime-stage-admission-gate.ts';

export function providerHostedCheckoutCurrentnessPreflight(
  row: FamilyRuntimeTaskRow,
  workspaceLocator: Record<string, unknown>,
): DomainHandlerCheckoutCurrentnessPreflight | null {
  return preflightDomainWorkspaceCheckoutCurrentness({
    domainId: row.domain_id,
    workspaceLocator,
  });
}

export function combineStageAdmissionGateWithCheckoutCurrentness(
  admissionGate: ReturnType<typeof buildStageAdmissionLaunchGate>,
  checkoutCurrentnessPreflight: DomainHandlerCheckoutCurrentnessPreflight | null,
) {
  if (!checkoutCurrentnessPreflight) {
    return admissionGate;
  }
  if (checkoutCurrentnessPreflight.status !== 'blocked') {
    return {
      ...admissionGate,
      checkout_currentness_preflight: checkoutCurrentnessPreflight,
    };
  }
  return {
    ...admissionGate,
    status: 'blocked' as const,
    blocked_reason: checkoutCurrentnessPreflight.reason ?? 'checkout_currentness_blocked',
    checkout_currentness_preflight: checkoutCurrentnessPreflight,
  };
}

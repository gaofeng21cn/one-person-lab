import { preflightDomainWorkspaceCheckoutCurrentness } from '../family-runtime-checkout-currentness.ts';
import type { DomainHandlerCheckoutCurrentnessPreflight } from '../family-runtime-domain-handler-process.ts';
import type { FamilyRuntimeTaskRow } from '../family-runtime-store.ts';
import type { buildFamilyStageContextObservation } from '../../stagecraft/index.ts';

export function providerHostedCheckoutCurrentnessPreflight(
  row: FamilyRuntimeTaskRow,
  workspaceLocator: Record<string, unknown>,
): DomainHandlerCheckoutCurrentnessPreflight | null {
  return preflightDomainWorkspaceCheckoutCurrentness({
    domainId: row.domain_id,
    workspaceLocator,
  });
}

export function attachCheckoutCurrentnessToStageContext(
  observation: ReturnType<typeof buildFamilyStageContextObservation>,
  checkoutCurrentnessPreflight: DomainHandlerCheckoutCurrentnessPreflight | null,
) {
  if (!checkoutCurrentnessPreflight) {
    return observation;
  }
  return {
    ...observation,
    checkout_currentness_preflight: checkoutCurrentnessPreflight,
  };
}

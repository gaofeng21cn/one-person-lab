import { canonicalOwnerId } from '../../ledger/evidence-envelope.ts';
import { record, stringValue, type JsonRecord } from './json-utils.ts';

export function worklistOwnerId(value: unknown) {
  return typeof value === 'string' && canonicalOwnerId(value) === 'one-person-lab' ? 'opl' : value;
}

export function normalizeWorklistOwnerFields<T extends JsonRecord>(item: T): T {
  const owner = worklistOwnerId(stringValue(item.owner));
  const routeOwner = worklistOwnerId(stringValue(item.route_owner));
  const safeActionOwner = worklistOwnerId(stringValue(item.safe_action_owner));
  const evidenceRequirement = record(item.evidence_requirement);
  return {
    ...item,
    ...(owner ? { owner } : {}),
    ...(routeOwner ? { route_owner: routeOwner } : {}),
    ...(safeActionOwner ? { safe_action_owner: safeActionOwner } : {}),
    evidence_requirement: {
      ...evidenceRequirement,
      ...(owner ? { owner } : {}),
    },
  } as T;
}


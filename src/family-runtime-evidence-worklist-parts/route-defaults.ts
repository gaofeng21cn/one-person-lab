import type { FamilyRuntimeProviderKind } from '../family-runtime-types.ts';

type JsonRecord = Record<string, unknown>;

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.map(stringValue).filter((entry): entry is string => Boolean(entry))
    : [];
}

export function readOnlyRouteMatchesDefaults(
  route: JsonRecord,
  input: {
    providerKind: FamilyRuntimeProviderKind;
    executorKind: 'codex_cli';
  },
) {
  const actionKind = stringValue(route.action_kind) ?? '';
  const args = stringList(route.opl_cli_args);
  const worklistKind = actionKind.startsWith('provider_scheduler_')
    || actionKind === 'stage_production_attempt_request'
    || actionKind.startsWith('stage_production_evidence_')
    || actionKind.startsWith('domain_dispatch_evidence_')
    || actionKind.startsWith('external_evidence_')
    || actionKind.startsWith('evidence_gate_')
    || actionKind.startsWith('legacy_cleanup_');
  if (!worklistKind || stringValue(route.owner) !== 'opl') {
    return false;
  }
  if (actionKind.startsWith('provider_scheduler_')) {
    const providerIndex = args.indexOf('--provider');
    return (stringValue(route.provider_kind) ?? args[providerIndex + 1]) === input.providerKind;
  }
  if (actionKind === 'stage_production_attempt_request') {
    const providerIndex = args.indexOf('--provider');
    const executorIndex = args.indexOf('--executor-kind');
    return providerIndex >= 0
      && args[providerIndex + 1] === input.providerKind
      && executorIndex >= 0
      && args[executorIndex + 1] === input.executorKind;
  }
  return true;
}

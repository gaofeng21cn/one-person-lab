import { stringValue as optionalString } from '../../../kernel/json-record.ts';
import type { JsonRecord } from './shared.ts';

export type DomainStageRoutePromptInput = {
  attempt: JsonRecord;
  workspaceLocator?: JsonRecord;
  workspaceRoot?: string | null;
};

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function isDomainRouteAttempt(input: DomainStageRoutePromptInput) {
  const locator = input.workspaceLocator ?? {};
  return optionalString(locator.task_kind) === 'domain_route/stage-route'
    || optionalString(locator.runtime_request_kind) === 'domain_route_stage_route'
    || optionalString(locator.surface_kind) === 'opl_domain_route_runtime_request';
}

export function domainStageRoutePromptLines(input: DomainStageRoutePromptInput) {
  if (!isDomainRouteAttempt(input)) {
    return [];
  }
  const locator = input.workspaceLocator ?? {};
  const profileRef = optionalString(locator.profile_ref)
    ?? optionalString(locator.profile_path)
    ?? optionalString(locator.profile)
    ?? '$OPL_DOMAIN_ROUTE_PROFILE_REF';
  const domainId = optionalString(input.attempt.domain_id)
    ?? optionalString(locator.domain_id)
    ?? '$OPL_DOMAIN_ID';
  const routeTarget = optionalString(locator.route_target);
  const commandKind = optionalString(locator.command_kind);
  const sourceRefs = stringList(locator.source_refs);
  return [
    'OPL domain-route execution context:',
    `Domain id: ${domainId}`,
    `Domain profile ref: ${profileRef}`,
    routeTarget ? `Route target: ${routeTarget}` : null,
    commandKind ? `Route command kind: ${commandKind}` : null,
    sourceRefs.length > 0 ? `Source refs: ${JSON.stringify(sourceRefs)}` : null,
    'Use the selected domain agent entry and the domain-owned profile or source refs for domain semantics.',
    'This attempt is already running inside OPL provider-backed runtime. Do not recursively enqueue, redrive, tick, start, or submit another OPL runtime task from inside the attempt.',
    'OPL transports route and closeout refs only. Do not write domain truth, quality verdicts, owner receipts, typed blockers, human gates, current packages, or artifact bodies unless the selected domain authority surface explicitly owns that write.',
    'Return the best available domain artifact, raw/free-text/partial/negative result, failed-attempt evidence, or no-output/failure diagnostic. A typed closeout improves lineage and quality/ready evidence but is never required for the next declared stage to start.',
    'Retry, review, and repair are quality budgets. Codex CLI may advance, skip, repeat, reverse, or route back to any declared stage. Use a typed blocker only for an unavailable executor, wrong-target identity/currentness, permission/safety/authority boundary, irreversible action, or explicit human decision.',
  ].filter((line): line is string => typeof line === 'string');
}

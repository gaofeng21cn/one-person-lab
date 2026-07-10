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
    'The final typed closeout must include domain-provided user-readable stage semantics in user_stage_log, stage_log_summary, human_stage_log, or route_impact.user_stage_log/stage_log_summary/human_stage_log.',
    'When domain work cannot advance, return domain-owned evidence refs or a typed blocker ref through the declared authority path; do not report provider liveness or platform repair as domain progress.',
  ].filter((line): line is string => typeof line === 'string');
}

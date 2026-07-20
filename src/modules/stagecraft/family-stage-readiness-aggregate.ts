import type { FamilyStageDomainManifestCatalogEntry } from './family-stage-domain-manifest.ts';
import type { FamilyStageControlPlane } from './family-stage-control-plane-contract.ts';
import { listStandardDomainAgentIds } from '../../kernel/standard-agent-registry.ts';
import {
  buildStageReadinessSummary,
  type FamilyStageReadinessSummary,
} from './family-stage-readiness.ts';

export type FamilyStageReadinessDetail = 'summary' | 'full';

function resolvePlaneFromEntry(entry: FamilyStageDomainManifestCatalogEntry): FamilyStageControlPlane | null {
  return entry.status === 'resolved' ? entry.manifest?.family_stage_control_plane ?? null : null;
}

function familyStageReadinessStatus(summaries: FamilyStageReadinessSummary[]) {
  if (summaries.some((summary) => summary.launch_readiness_status === 'launch_blocked')) {
    return 'launch_blocked';
  }
  if (summaries.some((summary) => summary.launch_readiness_status === 'launch_warning')) {
    return 'launch_warning';
  }
  return 'launch_observable';
}

export function buildFamilyDefaultsStageReadiness(
  entries: FamilyStageDomainManifestCatalogEntry[],
  detail: FamilyStageReadinessDetail,
) {
  const summaries = entries.flatMap((entry) => {
    const plane = resolvePlaneFromEntry(entry);
    if (!plane) {
      return [];
    }
    return [buildStageReadinessSummary(entry, plane, entry.project_id)];
  });
  const hardBlockerCount = summaries.reduce(
    (total, summary) => total + summary.summary.hard_blocker_count,
    0,
  );
  const warningCount = summaries.reduce(
    (total, summary) => total + summary.summary.warning_count,
    0,
  );
  const domains = summaries.map((summary) => ({
    project_id: summary.project_id,
    project: summary.project,
    target_domain_id: summary.target_domain_id,
    plane_id: summary.plane_id,
    status: summary.launch_readiness_status,
    summary: summary.summary,
    authority_boundary: summary.authority_boundary,
  }));
  const fullDomains = summaries.map((summary) => ({
    ...summary,
    detail_level: 'full',
  }));

  return {
    detail_level: detail,
    family_defaults: true,
    status: familyStageReadinessStatus(summaries),
    summary: {
      domain_count: summaries.length,
      stage_count: summaries.reduce((total, summary) => total + summary.summary.stage_count, 0),
      conformant_stage_count: summaries.reduce(
        (total, summary) => total + summary.summary.conformant_stage_count,
        0,
      ),
      quality_debt_stage_count: summaries.reduce(
        (total, summary) => total + summary.summary.quality_debt_stage_count,
        0,
      ),
      blocked_stage_count: summaries.reduce(
        (total, summary) => total + summary.summary.blocked_stage_count,
        0,
      ),
      hard_blocker_count: hardBlockerCount,
      warning_count: warningCount,
      can_claim_domain_ready: false,
      can_claim_artifact_authority: false,
      can_claim_production_ready: false,
    },
    domains: detail === 'full' ? fullDomains : domains,
    drilldown_refs: listStandardDomainAgentIds().map((agentId) =>
      `opl stages readiness --domain ${agentId} --json`
    ),
    authority_boundary: {
      opl_role: 'family_stage_readiness_aggregate_only',
      can_execute_stage: false,
      can_write_domain_truth: false,
      can_authorize_domain_ready: false,
      can_authorize_quality_verdict: false,
      can_mutate_artifact_body: false,
      can_claim_domain_ready: false,
      can_claim_artifact_authority: false,
      can_claim_production_ready: false,
    },
  };
}

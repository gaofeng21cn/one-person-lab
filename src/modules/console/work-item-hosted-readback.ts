import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import {
  assertDomainArtifactCasReadWindowStable,
  observeDomainArtifactCasMaterialization,
  type DomainArtifactCasReadWindowGuard,
} from '../runway/domain-artifact-cas-materialization.ts';
import { buildWorkItemProjectionV2 } from './work-item-projection/projection.ts';
import type { WorkItemProjectionV2 } from './work-item-projection/types.ts';
import {
  observeHostedReadbackSource,
  readHostedReadbackSourceManifest,
  type HostedReadbackObservedSource,
} from './work-item-readback-sources.ts';

type HostedWorkItemReadbackInput = {
  workspaceRoot: string;
  workItemId: string;
  agentId?: string;
  sourceManifestPath?: string;
  profile?: 'fast' | 'full';
};

type HostedWorkItemReadbackDependencies = {
  projection?: WorkItemProjectionV2;
};

function fail(code: 'cli_usage_error' | 'contract_shape_invalid', message: string, details: Record<string, unknown>): never {
  throw new FrameworkContractError(code, message, details);
}

function realDirectory(value: string, label: string) {
  if (!path.isAbsolute(value)) fail('cli_usage_error', `${label} must be absolute.`, { value });
  let resolved: string;
  try {
    resolved = fs.realpathSync.native(value);
  } catch (error) {
    fail('cli_usage_error', `${label} cannot be resolved.`, {
      value,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (!fs.statSync(resolved!).isDirectory()) fail('cli_usage_error', `${label} must be a directory.`, { value });
  return resolved!;
}

function consistencyResults(
  sources: HostedReadbackObservedSource[],
  checks: ReturnType<typeof readHostedReadbackSourceManifest>['manifest']['consistency_checks'],
) {
  const byId = new Map(sources.map((source) => [source.source_id, source]));
  return checks.map((check) => {
    const left = byId.get(check.left.source_id);
    const right = byId.get(check.right.source_id);
    const leftValue = left?.summary[check.left.field];
    const rightValue = right?.summary[check.right.field];
    const evaluable = left?.status === 'observed'
      && right?.status === 'observed'
      && leftValue !== null
      && leftValue !== undefined
      && rightValue !== null
      && rightValue !== undefined;
    return {
      check_id: check.check_id,
      status: !evaluable
        ? 'not_evaluable'
        : JSON.stringify(leftValue) === JSON.stringify(rightValue)
          ? 'consistent'
          : 'different',
      left: { ...check.left, value: leftValue ?? null, authority_scope: left?.authority_scope ?? null },
      right: { ...check.right, value: rightValue ?? null, authority_scope: right?.authority_scope ?? null },
      authority_precedence: left?.authority_scope === 'domain_owner' && right?.authority_scope !== 'domain_owner'
        ? check.left.source_id
        : right?.authority_scope === 'domain_owner' && left?.authority_scope !== 'domain_owner'
          ? check.right.source_id
          : null,
    };
  });
}

function hostedReadbackCasSyncPending(
  guard: Extract<DomainArtifactCasReadWindowGuard, { status: 'sync_pending' }>,
): never {
  const observation = guard.observation;
  fail(
    'contract_shape_invalid',
    'Hosted work-item readback is sync-pending while a domain artifact transaction is unsettled.',
    {
      failure_code: 'hosted_work_item_sync_pending',
      sync_state: 'sync_pending',
      observation_state: observation.state,
      observation_reason: observation.reason,
      workspace_root: observation.workspace_root,
      journal_refs: observation.journal_refs,
      epoch_ref: observation.epoch_ref,
      observed_generation: observation.observed_generation,
      observation_error: observation.error,
    },
  );
}

export function buildHostedWorkItemReadback(
  input: HostedWorkItemReadbackInput,
  dependencies: HostedWorkItemReadbackDependencies = {},
) {
  const workspaceRoot = realDirectory(input.workspaceRoot, 'workspace root');
  const initialCasObservation = observeDomainArtifactCasMaterialization({ workspaceRoot });
  assertDomainArtifactCasReadWindowStable(
    initialCasObservation,
    initialCasObservation,
    hostedReadbackCasSyncPending,
  );
  const profile = input.profile ?? 'full';
  const projection = dependencies.projection ?? buildWorkItemProjectionV2({ profile });
  assertDomainArtifactCasReadWindowStable(
    initialCasObservation,
    observeDomainArtifactCasMaterialization({ workspaceRoot }),
    hostedReadbackCasSyncPending,
  );
  const matches = projection.items.filter((item) => {
    let itemWorkspace: string;
    try {
      itemWorkspace = fs.realpathSync.native(item.identity.workspace_path);
    } catch {
      return false;
    }
    return itemWorkspace === workspaceRoot
      && item.identity.work_item_id === input.workItemId
      && (!input.agentId || item.identity.agent_id === input.agentId || item.identity.domain_id === input.agentId);
  });
  if (matches.length !== 1) {
    fail('contract_shape_invalid', matches.length === 0
      ? 'Selected work item is not present in the OPL hosted projection.'
      : 'Selected work item is ambiguous in the OPL hosted projection.', {
      workspace_root: workspaceRoot,
      work_item_id: input.workItemId,
      agent_id: input.agentId ?? null,
      match_count: matches.length,
      available_work_item_ids: projection.items
        .filter((item) => item.identity.workspace_path === workspaceRoot)
        .map((item) => item.identity.work_item_id),
      failure_code: 'hosted_work_item_not_resolved',
    });
  }
  const item = matches[0]!;
  if (
    item.lifecycle.primary_state === 'sync_pending'
    && item.lifecycle.primary_state_reason === 'domain_artifact_cas_materialization_sync_pending'
  ) {
    const projectedCasObservation = {
      state: 'sync_pending',
      reason: 'workspace_cas_journal_present',
      workspace_root: workspaceRoot,
      journal_refs: item.source_refs
        .filter((source) => source.role === 'domain_artifact_cas_read_guard')
        .map((source) => source.ref),
      epoch_ref: '',
      observed_generation: item.lifecycle.observed_generation,
      observed_at: projection.generated_at,
      error: null,
    } as const;
    assertDomainArtifactCasReadWindowStable(
      projectedCasObservation,
      projectedCasObservation,
      hostedReadbackCasSyncPending,
    );
  }
  assertDomainArtifactCasReadWindowStable(
    initialCasObservation,
    observeDomainArtifactCasMaterialization({ workspaceRoot }),
    hostedReadbackCasSyncPending,
  );
  const workItemRoot = item.identity.work_item_root
    ? realDirectory(item.identity.work_item_root, 'work-item root')
    : fail('contract_shape_invalid', 'Hosted work-item readback requires a domain inventory work-item root.', {
        work_item_id: input.workItemId,
        failure_code: 'hosted_work_item_root_missing',
      });

  let domainSources: HostedReadbackObservedSource[] = [];
  let sourceManifest: ReturnType<typeof readHostedReadbackSourceManifest> | null = null;
  if (input.sourceManifestPath) {
    sourceManifest = readHostedReadbackSourceManifest({
      workspaceRoot,
      manifestPath: input.sourceManifestPath,
    });
    if (sourceManifest.manifest.domain_id !== item.identity.domain_id) {
      fail('contract_shape_invalid', 'Hosted readback source manifest domain does not match the selected work item.', {
        declared_domain_id: sourceManifest.manifest.domain_id,
        selected_domain_id: item.identity.domain_id,
        failure_code: 'hosted_readback_domain_mismatch',
      });
    }
    domainSources = sourceManifest.manifest.sources.map((declaration) => observeHostedReadbackSource({
      workItemRoot,
      declaration,
    }));
  }
  assertDomainArtifactCasReadWindowStable(
    initialCasObservation,
    observeDomainArtifactCasMaterialization({ workspaceRoot }),
    hostedReadbackCasSyncPending,
  );
  const consistency = consistencyResults(domainSources, sourceManifest?.manifest.consistency_checks ?? []);
  const diagnostics = [
    ...domainSources
      .filter((source) => source.required && source.status !== 'observed')
      .map((source) => ({
        reason: 'required_domain_source_unavailable',
        source_id: source.source_id,
        source_ref: source.ref,
        status: source.status,
      })),
    ...domainSources
      .filter((source) => source.authority_scope === 'domain_owner' && source.currentness.state === 'older_than_anchor')
      .map((source) => ({
        reason: 'domain_owner_source_older_than_declared_anchor',
        source_id: source.source_id,
        source_ref: source.ref,
        anchor_ref: source.currentness.anchor_ref,
      })),
    ...consistency
      .filter((check) => check.status === 'different')
      .map((check) => ({
        reason: 'declared_source_claims_differ',
        check_id: check.check_id,
        authority_precedence: check.authority_precedence,
      })),
  ];
  assertDomainArtifactCasReadWindowStable(
    initialCasObservation,
    observeDomainArtifactCasMaterialization({ workspaceRoot }),
    hostedReadbackCasSyncPending,
  );

  return {
    version: 'g2',
    hosted_work_item_readback: {
      surface_kind: 'opl_hosted_work_item_readback',
      schema_version: 'opl-hosted-work-item-readback.v1',
      generated_at: new Date().toISOString(),
      identity: item.identity,
      business: {
        lifecycle: item.lifecycle,
        attention: item.attention,
        next_action: item.action,
        next_owner: {
          owner: item.action.owner,
          owner_kind: item.action.owner_kind,
          owner_display_name: item.action.owner_display_name,
        },
      },
      runtime: {
        execution: item.execution,
        telemetry: item.telemetry,
        stage_map: item.stage_map,
        conditions: item.conditions,
        freshness: item.freshness,
      },
      domain_truth_sources: {
        declaration_ref: sourceManifest?.manifest_ref ?? null,
        declaration_owner: sourceManifest?.manifest.declaration_owner ?? null,
        authority_boundary: sourceManifest?.manifest.authority_boundary ?? null,
        sources: domainSources,
        consistency_checks: consistency,
      },
      diagnostics: {
        status: diagnostics.length === 0 ? 'clear' : 'attention_required',
        count: diagnostics.length,
        items: diagnostics,
      },
      authority_boundary: {
        opl_role: 'hosted_projection_and_exact_domain_source_readback',
        runtime_projection_owner: 'one-person-lab',
        domain_truth_owner: sourceManifest?.manifest.declaration_owner ?? item.identity.agent_display_name,
        app_state_is_domain_quality_authority: false,
        filesystem_currentness_is_semantic_currentness: false,
        derived_delivery_manifest_can_override_domain_owner_source: false,
        can_write_domain_truth: false,
        can_create_owner_receipt: false,
        can_create_typed_blocker: false,
        can_authorize_quality_publication_or_submission: false,
      },
    },
  };
}

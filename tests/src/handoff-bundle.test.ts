import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { loadFrameworkContracts } from '../../src/modules/charter/contracts.ts';
import { buildProductEntryHandoffBundleView } from '../../src/modules/console/product-entry-handoff-bundle.ts';
import type { BoundaryExplanation, ResolutionResult } from '../../src/kernel/types.ts';

const contractsDir = path.join(process.cwd(), 'contracts', 'opl-framework');
const repoRoot = process.cwd();
const domainManifestStatuses = new Set([
  'not_bound',
  'workspace_missing',
  'manifest_not_configured',
  'command_failed',
  'command_timeout',
  'invalid_json',
  'invalid_manifest',
  'resolved',
]);

type RuntimeSessionContract = {
  runtime_substrate: string;
  source_surface: string;
  session_id: string | null;
  resume_mode: string;
};

type SelectedHandoffBundle = ReturnType<typeof buildProductEntryHandoffBundleView>['handoff_bundle'] & {
  runtime_session_contract: RuntimeSessionContract;
  return_surface_contract: {
    opl: {
      resume_endpoint: string;
    };
  };
  domain_context: {
    project: string;
    independent_domain_agent: Record<string, unknown>;
  };
  domain_entry_parity: {
    surface_kind: string;
    summary: {
      total_projects_count: number;
    };
    projects: Array<{
      project_id: string;
      project: string;
    }>;
  };
};

type LocatorOnlyHandoffBundle = ReturnType<typeof buildProductEntryHandoffBundleView>['handoff_bundle'] & {
  runtime_session_contract: RuntimeSessionContract;
};

function selectedRedcubeStage(): ResolutionResult {
  return {
    status: 'selected_domain_agent_entry',
    request_kind: 'product_entry',
    workstream_id: 'presentation_ops',
    domain_id: 'redcube',
    entry_surface: 'domain_agent_entry',
    recommended_family: 'ppt_deck',
    confidence: 'high',
    reason: 'Presentation delivery maps to the RedCube AI visual deliverable agent.',
    selection_evidence: ['preferred_family:ppt_deck', 'workstream:presentation_ops'],
  };
}

function selectedRedcubeBoundary(): BoundaryExplanation {
  return {
    request_summary: 'Prepare a visual deliverable package.',
    boundary_status: 'selected_domain_agent_entry',
    boundary_evidence: ['redcube owns visual deliverable artifact truth'],
    resolved_domain: 'redcube',
    resolved_workstream_id: 'presentation_ops',
    reason: 'The request stays inside the RedCube visual deliverable boundary.',
    rejected_domains: [],
  };
}

test('buildProductEntryHandoffBundleView freezes OPL-owned product-entry transfer metadata for a selected domain', () => {
  const bundle = buildProductEntryHandoffBundleView(loadFrameworkContracts(contractsDir), {
    mode: 'handoff',
    goal: 'Prepare a visual deliverable package.',
    intent: 'presentation_delivery',
    workspacePath: repoRoot,
    stageSelection: selectedRedcubeStage(),
    boundary: selectedRedcubeBoundary(),
    sessionId: 'session-product-entry-redcube',
    basePath: repoRoot,
  }).handoff_bundle as SelectedHandoffBundle;

  assert.equal(bundle.surface_id, 'opl_family_handoff_bundle');
  assert.equal(bundle.target_domain_id, 'redcube');
  assert.equal(bundle.task_intent, 'presentation_delivery');
  assert.equal(bundle.entry_mode, 'product_entry_handoff');
  assert.equal(bundle.stage_selection_status, 'selected_domain_agent_entry');
  assert.equal(bundle.boundary_status, 'selected_domain_agent_entry');
  assert.deepEqual(bundle.workspace_locator, {
    project_id: 'redcube',
    requested_path: repoRoot,
    absolute_path: repoRoot,
    source: 'explicit_path',
    binding_id: null,
  });
  assert.deepEqual(bundle.runtime_session_contract, {
    runtime_substrate: 'codex_default_executor_with_provider_backed_family_runtime',
    source_surface: 'opl_local_product_entry_shell',
    session_id: 'session-product-entry-redcube',
    resume_mode: 'session_id_ready',
  });
  assert.equal(
    bundle.return_surface_contract.opl.resume_endpoint,
    path.join(repoRoot, 'api', 'opl', 'sessions', 'resume'),
  );
  assert.equal(bundle.domain_context.project, 'redcube-ai');
  assert.deepEqual(bundle.domain_context.independent_domain_agent, {
    agent_id: 'rca',
    status: 'active',
    authority_scope: 'visual_deliverable_domain_agent',
    opl_top_level_domain_agent: true,
  });
  assert.ok(bundle.domain_manifest_recommendation);
  assert.ok(domainManifestStatuses.has(String(bundle.domain_manifest_recommendation.status)));
  assert.equal(bundle.domain_manifest_recommendation.project_id, 'redcube');
  assert.equal(bundle.domain_manifest_recommendation.project, 'redcube-ai');
  const manifestCommand = bundle.domain_manifest_recommendation.manifest_command;
  if (typeof manifestCommand === 'string' && manifestCommand.length > 0) {
    assert.match(manifestCommand, /redcube/);
  } else {
    assert.notEqual(bundle.domain_manifest_recommendation.status, 'resolved');
  }
  assert.equal(bundle.domain_direct_entry, null);
  assert.equal(bundle.domain_entry_parity.surface_kind, 'opl_domain_entry_parity');
  assert.equal(bundle.domain_entry_parity.summary.total_projects_count, 3);
  assert.ok(
    bundle.domain_entry_parity.projects.some(
      (entry) => entry.project_id === 'redcube' && entry.project === 'redcube-ai',
    ),
  );
});

test('buildProductEntryHandoffBundleView keeps unknown-domain transfer locator-only without domain authority context', () => {
  const bundle = buildProductEntryHandoffBundleView(loadFrameworkContracts(contractsDir), {
    mode: 'ask',
    goal: 'Organize a task outside admitted domain boundaries.',
    intent: 'general_task',
    stageSelection: {
      status: 'unknown_domain',
      request_kind: 'product_entry',
      candidate_workstream_id: 'unknown_workstream',
      reason: 'No admitted domain owns the request.',
      selection_evidence: ['no_matching_domain'],
    },
    boundary: {
      request_summary: 'Organize a task outside admitted domain boundaries.',
      boundary_status: 'unknown_domain',
      boundary_evidence: ['no admitted domain match'],
      resolved_domain: null,
      resolved_workstream_id: null,
      candidate_workstream_id: 'unknown_workstream',
      reason: 'The request needs clarification before OPL can hand it to a domain.',
      rejected_domains: [],
    },
  }).handoff_bundle as LocatorOnlyHandoffBundle;

  assert.equal(bundle.target_domain_id, null);
  assert.equal(bundle.stage_selection_status, 'unknown_domain');
  assert.equal(bundle.workspace_locator.source, 'none');
  assert.equal(bundle.workspace_locator.project_id, null);
  assert.equal(bundle.domain_context, null);
  assert.equal(bundle.domain_manifest_recommendation, null);
  assert.equal(bundle.domain_direct_entry, null);
  assert.equal(bundle.runtime_session_contract.resume_mode, 'session_id_pending');
});

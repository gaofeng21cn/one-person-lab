import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { resolveStandardAgentManagedCheckout } from '../../../src/adapters/execution/standard-agent-managed-checkout.ts';
import type { HostedAgentRuntimeBindingResolver } from '../../../src/adapters/execution/hosted-agent-runtime-binding.ts';
import { runStandardAgentAction } from '../../../src/adapters/execution/standard-agent-action-runtime.ts';
import { FileFoundryContentStore } from '../../../src/authority/evidence/index.ts';

import { action, hostedSnapshot, recordLedger, root, writeContracts } from '../standard-agent-action-runtime-shared.ts';

test('Hosted Foundry action starts one OPL-owned FoundryRun and replays immutable launch bytes', async () => {
  const checkoutRoot = root('opl-foundry-action-checkout-');
  const workspaceRoot = root('opl-foundry-action-workspace-');
  let starts = 0;
  let currentBindingResolutions = 0;
  let pinnedBindingResolutions = 0;
  try {
    const foundryAction = {
      ...action({
        actionId: 'engineer-agent',
        executionBinding: { kind: 'foundry_binding', provider_manifest_ref: 'contracts/foundry_provider.json' },
      }),
      effect: 'mutating',
      input_schema_ref: 'opl://foundry-protocol/DesignRequest',
      output_schema_ref: 'opl://foundry-control/FoundryRun',
      required_fields: [
        'surface_kind', 'version', 'request_id', 'mode', 'target_agent_id', 'target_domain_id',
        'target_version_ref', 'objective', 'acceptance_criteria', 'non_goals', 'source_refs', 'constraints',
        'delivery_policy',
      ],
      workspace_locator_fields: [],
    };
    writeContracts(checkoutRoot, [foundryAction]);
    fs.writeFileSync(path.join(checkoutRoot, 'contracts', 'foundry_provider.json'), `${JSON.stringify({
      surface_kind: 'opl_foundry_provider',
      version: 'opl-foundry-provider.v1',
      provider_id: 'fixture-provider',
      agent_id: 'fixture-provider',
      package_id: 'fixture-provider',
      domain_id: 'agent_engineering',
      carrier_slug: 'fixture-provider',
      operations: {
        design: {
          input_schema_refs: ['opl://foundry-protocol/DesignRequest'],
          output_schema_ref: 'opl://foundry-protocol/AgentBlueprint',
          entry_stage_ref: 'mission-intake',
          required_stage_refs: ['mission-intake', 'evaluation-design'],
          optional_stage_refs: [],
          terminal_stage_ref: 'evaluation-design',
        },
        diagnose: {
          input_schema_refs: [
            'opl://foundry-protocol/DesignRequest',
            'opl://foundry-protocol/AgentBlueprint',
            'opl://foundry-protocol/EvidenceBundle',
          ],
          output_schema_ref: 'opl://foundry-protocol/EvolutionProposal',
          entry_stage_ref: 'evidence-diagnosis',
          required_stage_refs: ['evidence-diagnosis', 'evolution-proposal'],
          optional_stage_refs: [],
          terminal_stage_ref: 'evolution-proposal',
        },
      },
      projection_policy: {
        public_action_ids: ['engineer-agent'],
        internal_operations_are_public_actions: false,
        internal_operations_are_cli_commands: false,
        internal_operations_are_mcp_tools: false,
      },
      authority_boundary: {
        provider_owns_design_semantics: true,
        provider_owns_evaluation_semantics: true,
        provider_owns_evidence_diagnosis: true,
        provider_owns_evolution_proposals: true,
        provider_owns_foundry_run_state: false,
        provider_owns_candidate_materialization: false,
        provider_owns_evaluation_execution: false,
        provider_owns_versions_or_activation: false,
        provider_can_return_patch_or_work_order: false,
        provider_can_view_protected_test_bodies: false,
        opl_can_write_target_domain_truth: false,
      },
    })}\n`);
    const payload = {
      surface_kind: 'opl_foundry_design_request',
      version: 'opl-foundry-protocol.v1',
      request_id: 'request:hosted-foundry',
      mode: 'create',
      target_agent_id: 'fixture-target',
      target_domain_id: 'fixture-domain',
      target_version_ref: null,
      objective: 'Build a tested fixture Agent.',
      acceptance_criteria: ['The required gate passes.'],
      non_goals: ['No production activation without policy.'],
      source_refs: ['source:fixture'],
      constraints: {
        capability_refs: ['capability:text'],
        permission_refs: [],
        privacy_requirements: ['privacy:no-sensitive-data'],
        cost_limits: { usd: 1 },
        latency_limits: { milliseconds: 1000 },
      },
      delivery_policy: { activation_mode: 'activate', max_generations: 5 },
    };
    const sourceBytes = Buffer.from('Bound source evidence for an arbitrary target.\n');
    const sourceDigest = crypto.createHash('sha256').update(sourceBytes).digest('hex');
    payload.source_refs = [`source-material:sha256:${sourceDigest}`];
    fs.mkdirSync(path.join(workspaceRoot, 'control/opl/source_materials'), { recursive: true });
    const sourcePath = path.join(workspaceRoot, 'evidence.txt');
    fs.writeFileSync(sourcePath, sourceBytes);
    fs.writeFileSync(path.join(workspaceRoot, `control/opl/source_materials/${sourceDigest}.json`), JSON.stringify({
      surface_kind: 'opl_workspace_source_material_receipt',
      version: 'workspace-source-material.v3',
      source_material_ref: payload.source_refs[0],
      source_fingerprint_ref: `sha256:${sourceDigest}`,
      stored_file: { ref: 'evidence.txt', copied: true },
      original_file: { sha256: sourceDigest, bytes: sourceBytes.length },
    }));
    const v1Snapshot = hostedSnapshot({ checkoutRoot, workspaceRoot, label: 'foundry-v1' });
    const v2Snapshot = hostedSnapshot({ checkoutRoot, workspaceRoot, label: 'foundry-v2' });
    let activeSnapshot = v1Snapshot;
    const snapshots = new Map([
      [v1Snapshot.provenance_ref, v1Snapshot],
      [v2Snapshot.provenance_ref, v2Snapshot],
    ]);
    const dependencies = {
      resolveRuntimeBinding: async () => {
        currentBindingResolutions += 1;
        return activeSnapshot;
      },
      resolvePinnedRuntimeBinding: async (
        input: Parameters<HostedAgentRuntimeBindingResolver['resolvePinned']>[0],
      ) => {
        pinnedBindingResolutions += 1;
        return snapshots.get(input.provenance_ref)
          ?? assert.fail(`missing pinned snapshot ${input.provenance_ref}`);
      },
      recordLedger,
      startFoundryRun: async ({ run_id }: { run_id: string }) => {
        assert.deepEqual(new FileFoundryContentStore().readExact(`opl-content://sha256/${sourceDigest}`), sourceBytes);
        starts += 1;
        return {
          run: {
            surface_kind: 'opl_foundry_run',
            version: 'opl-foundry-run.v1',
            run_id,
            state: 'accepted',
            revision: 1,
          },
          activation: { active_version_digest: null, revision: 0 },
        };
      },
    };
    const first = await runStandardAgentAction({
      domainId: 'mas', actionId: 'engineer-agent', workspaceRoot, payload, runId: 'foundry-hosted-run',
    }, dependencies as never);
    fs.writeFileSync(sourcePath, 'Mutable source changed after immutable launch.');
    activeSnapshot = v2Snapshot;
    fs.writeFileSync(
      path.join(checkoutRoot, 'contracts', 'foundry_provider.json'),
      '{"broken_live_provider":true}\n',
    );
    const replay = await runStandardAgentAction({
      domainId: 'mas', actionId: 'engineer-agent', workspaceRoot, payload, runId: 'foundry-hosted-run',
    }, dependencies as never);
    assert.equal(first.standard_agent_action_run.execution_kind, 'foundry_binding');
    assert.equal(first.standard_agent_action_run.status, 'started');
    assert.equal(
      first.standard_agent_action_run.authority_boundary.provider_role,
      'agent_design_evaluation_semantics_evidence_diagnosis_and_evolution_proposal',
    );
    assert.equal('oma_role' in first.standard_agent_action_run.authority_boundary, false);
    assert.equal(replay.standard_agent_action_run.output.sha256, first.standard_agent_action_run.output.sha256);
    assert.equal(first.standard_agent_action_run.hosted_runtime_binding_ref, v1Snapshot.provenance_ref);
    assert.equal(replay.standard_agent_action_run.hosted_runtime_binding_ref, v1Snapshot.provenance_ref);
    assert.equal(starts, 1);
    assert.equal(currentBindingResolutions, 1);
    assert.equal(pinnedBindingResolutions, 0);
  } finally {
    fs.rmSync(checkoutRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('Hosted Foundry action rejects an untrusted OMA runtime source before activation or FoundryRun start', async () => {
  const checkoutRoot = root('opl-foundry-action-mismatched-oma-checkout-');
  const workspaceRoot = root('opl-foundry-action-mismatched-oma-workspace-');
  let starts = 0;
  try {
    await assert.rejects(runStandardAgentAction({
      domainId: 'oma',
      actionId: 'engineer-agent',
      workspaceRoot,
      payload: {},
      runId: 'foundry-mismatched-oma-runtime-source',
    }, {
      resolveManagedCheckout: async (input) => resolveStandardAgentManagedCheckout({
        ...input,
        packageReadiness: {
          readStatus: () => ({
            opl_agent_package_status: {
              installed_package_count: 1,
              launch_allowed: false,
              launch_blocked_reason: 'managed_runtime_source_identity_mismatch',
              runtime_source_readiness: {
                status: 'incompatible',
                operational_ready: false,
                reason: 'managed_runtime_source_identity_mismatch',
                checkout_path: checkoutRoot,
                expected_tree_sha256: 'expected-oma-tree-sha',
                actual_tree_sha256: 'actual-oma-tree-sha',
              },
            },
          }),
        },
      }),
      startFoundryRun: async () => {
        starts += 1;
        throw new Error('FoundryRun must not start for an untrusted OMA runtime source');
      },
    }), (error: any) => {
      assert.equal(error?.details?.failure_code, 'standard_agent_managed_checkout_not_launchable');
      assert.equal(error?.details?.launch_blocked_reason, 'managed_runtime_source_identity_mismatch');
      return true;
    });
    assert.equal(starts, 0);
  } finally {
    fs.rmSync(checkoutRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

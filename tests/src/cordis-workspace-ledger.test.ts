import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CORDIS_WORKSPACE_LOCATOR_SERVICE,
  createCordisWorkspaceLocatorComposition,
} from '../../src/host/plugins/cordis-workspace-locator.ts';
import {
  CORDIS_OWNER_DELTA_OBSERVER_SERVICE,
  createCordisOwnerDeltaObserverComposition,
} from '../../src/host/plugins/cordis-owner-delta-observer.ts';
import { buildCurrentOwnerDeltaTopline as buildDirectTopline } from '../../src/authority/evidence/current-owner-delta-topline.ts';
import { buildAppOperatorOwnerDeltaTopline } from '../../src/read-models/operator/runtime-tray-app-operator-drilldown/owner-delta-topline.ts';
import { buildProductEntryHandoffBundleView } from '../../src/read-models/operator/product-entry-handoff-bundle.ts';
import { CordisCompositionContractError, validateCordisCompositionSnapshot } from '../../src/authority/packages/index.ts';
import { loadFrameworkContracts } from '../../src/authority/contracts/contracts.ts';
import type { BoundaryExplanation, ResolutionResult } from '../../src/kernel/types.ts';
import { resolveWorkspaceLocator as resolveCordisWorkspaceLocator } from '../../src/authority/workspace/index.ts';

test('Cordis Workspace locator delegates to the registry and tears down cleanly', async (t) => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-cordis-workspace-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateRoot;
  t.after(() => {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    fs.rmSync(stateRoot, { recursive: true, force: true });
  });
  const composition = await createCordisWorkspaceLocatorComposition();
  const events: unknown[] = [];
  composition.ctx.on('opl/workspace/locator/resolved', (locator) => events.push(locator));

  const locator = composition.locator.resolve('missing-project');
  assert.equal(locator.project_id, 'missing-project');
  assert.equal(locator.binding, null);
  assert.equal(locator.source, 'none');
  assert.deepEqual(events, [locator]);
  assert.equal(composition.ctx[CORDIS_WORKSPACE_LOCATOR_SERVICE], composition.locator);
  assert.deepEqual(resolveCordisWorkspaceLocator('missing-project'), locator);
  assert.deepEqual(fs.readdirSync(stateRoot), []);

  await composition.dispose();
  assert.equal(composition.fiber.uid, null);
  assert.equal(composition.ctx.get(CORDIS_WORKSPACE_LOCATOR_SERVICE), undefined);
});

test('Cordis Ledger observer emits a refs-only projection without persistence', async () => {
  const composition = await createCordisOwnerDeltaObserverComposition();
  const observations: unknown[] = [];
  composition.ctx.on('opl/ledger/owner-delta/observed', (topline) => observations.push(topline));

  const input = {
    currentOwnerDeltaReadModel: {
      current_owner_delta: {
        current_owner: 'one-person-lab',
        desired_delta_description: 'inspect_refs',
        accepted_answer_shape: ['owner_receipt_ref'],
      },
      next_safe_action_or_none: null,
    },
  };
  const observed = composition.observer.observe(input);
  assert.deepEqual(observed, buildDirectTopline(input));
  assert.deepEqual(observations, [observed]);
  assert.equal(observed.stage_run_cockpit_summary.refs_only, true);
  assert.equal(observed.stage_run_cockpit_summary.semantic_route_owner, 'decisive_codex_attempt');
  assert.equal(composition.ctx[CORDIS_OWNER_DELTA_OBSERVER_SERVICE], composition.observer);

  await composition.dispose();
  assert.equal(composition.fiber.uid, null);
  assert.equal(composition.ctx.get(CORDIS_OWNER_DELTA_OBSERVER_SERVICE), undefined);
});

test('Console production consumers use injected Cordis services rather than legacy direct paths', () => {
  const workspaceCalls: string[] = [];
  const workspaceLocator = {
    resolve(projectId: string, explicitWorkspacePath?: string) {
      workspaceCalls.push(projectId);
      return {
        project_id: projectId,
        requested_path: explicitWorkspacePath ?? null,
        absolute_path: '/injected/workspace',
        source: 'injected_cordis_provider',
        binding: null,
      };
    },
    active() {
      return null;
    },
    list() {
      return [];
    },
  };
  const selected: ResolutionResult = {
    status: 'selected_domain_agent_entry',
    request_kind: 'product_entry',
    workstream_id: 'presentation_ops',
    domain_id: 'redcube',
    entry_surface: 'domain_agent_entry',
    recommended_family: 'ppt_deck',
    confidence: 'high',
    reason: 'injected service consumer test',
    selection_evidence: ['injected'],
  };
  const boundary: BoundaryExplanation = {
    request_summary: 'injected service consumer test',
    boundary_status: 'selected_domain_agent_entry',
    boundary_evidence: ['injected'],
    resolved_domain: 'redcube',
    resolved_workstream_id: 'presentation_ops',
    reason: 'injected',
    rejected_domains: [],
  };
  const bundle = buildProductEntryHandoffBundleView(loadFrameworkContracts(), {
    mode: 'ask',
    goal: 'injected service consumer test',
    intent: 'injected',
    stageSelection: selected,
    boundary,
    workspaceLocator,
  });
  assert.deepEqual(workspaceCalls, ['redcube']);
  assert.equal(bundle.handoff_bundle.workspace_locator.absolute_path, '/injected/workspace');
  assert.equal(bundle.handoff_bundle.workspace_locator.source, 'injected_cordis_provider');

  const input = {
    currentOwnerDeltaReadModel: {
      current_owner_delta: {
        current_owner: 'one-person-lab',
        desired_delta_description: 'public_index_route',
      },
    },
  };
  const direct = buildDirectTopline(input);
  let observerCalls = 0;
  const injectedObserver = {
    observe(observationInput: { currentOwnerDeltaReadModel: unknown }) {
      observerCalls += 1;
      const topline = buildDirectTopline(observationInput);
      return {
        ...topline,
        current_owner_delta: {
          ...topline.current_owner_delta,
          current_owner: 'injected-cordis-owner',
        },
      };
    },
  };
  const output = buildAppOperatorOwnerDeltaTopline({
    attentionFirstPayload: {
      current_owner_delta_read_model: input.currentOwnerDeltaReadModel,
    },
  }, injectedObserver);
  assert.equal(observerCalls, 1);
  assert.equal(output.operator.current_owner_delta.current_owner, 'injected-cordis-owner');
  assert.equal(direct.current_owner_delta.current_owner, 'one-person-lab');
});

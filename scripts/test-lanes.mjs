#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import os from 'node:os';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const defaultStepTimeoutMs = 20 * 60 * 1000;
const maxStepTimeoutMs = 60 * 60 * 1000;
const stepTimeoutMs = parseStepTimeoutMs(process.env.OPL_TEST_LANE_STEP_TIMEOUT_MS);
const ownsPythonCacheRoot = !process.env.OPL_REPO_TEMP_ROOT;
const pythonCacheRoot = process.env.OPL_REPO_TEMP_ROOT
  ? path.join(process.env.OPL_REPO_TEMP_ROOT, 'node-test-python-cache')
  : fs.mkdtempSync(path.join(os.tmpdir(), 'opl-node-test-python-cache-'));
fs.mkdirSync(pythonCacheRoot, { recursive: true });
const toolTempDir = path.join(pythonCacheRoot, 'tmp');
fs.mkdirSync(toolTempDir, { recursive: true });
if (ownsPythonCacheRoot) {
  process.on('exit', () => {
    fs.rmSync(pythonCacheRoot, { recursive: true, force: true });
  });
}

const nodeTest = (files, options = {}) => ({
  kind: 'node-test',
  files,
  stripTypes: options.stripTypes !== false,
  batchSize: options.batchSize ?? null,
  env: options.env ?? {},
});

const fastTestFiles = [
  'tests/src/domain-agent-admission-gates.test.ts',
  'tests/src/verification-command-surfaces.test.ts',
  'tests/src/verification-package-surfaces.test.ts',
  'tests/src/target-architecture-schema-contracts.test.ts',
  'tests/src/cognitive-computation-kernel-contract.test.ts',
  'tests/src/verification-test-governance.test.ts',
  'tests/src/line-budget.test.ts',
  'tests/src/active-path-residue-scan.test.ts',
  'tests/src/stale-compat-retirement-guard.test.ts',
  'tests/src/managed-shell-command-env.test.ts',
  'tests/src/family-structure-advisory.test.ts',
  'tests/src/family-shared-release-discipline.test.ts',
  'tests/src/family-shared-release.test.ts',
  'tests/src/native-helper-family-smoke.test.ts',
  'tests/src/native-helper-prebuild.test.ts',
  'tests/src/mas-mag-cognitive-kernel-stage-pack-fixtures.test.ts',
  'tests/src/stage-artifact-runtime.test.ts',
  'tests/src/state-index-kernel-contract.test.ts',
  'tests/src/stage-run-kernel-contract.test.ts',
  'tests/src/stage-run-transition-authority-read-model.test.ts',
  'tests/src/stage-transition-authority-contract.test.ts',
  'tests/src/stage-transition-authority.test.ts',
  'tests/src/family-runtime-state-index.test.ts',
  'tests/src/family-runtime-attempt-contract.test.ts',
  'tests/src/family-runtime-current-control-state.test.ts',
  'tests/src/family-runtime-effective-current-context.test.ts',
  'tests/src/family-transition-runner.test.ts',
  'tests/src/functional-agent-runtime-harness.test.ts',
  'tests/src/functional-privatization-audit-envelope.test.ts',
  'tests/src/domain-dispatch-evidence-payload-preflight.test.ts',
  'tests/src/domain-dispatch-evidence-workorder-packet.test.ts',
  'tests/src/family-runtime-lifecycle-index.test.ts',
  'tests/src/family-runtime-sqlite.test.ts',
  'tests/src/agent-lab.test.ts',
  'tests/src/agent-lab-mechanism-evolution.test.ts',
  'tests/src/agent-lab-developer-mode-contract.test.ts',
  'tests/src/agent-lab-executor-aperture.test.ts',
  'tests/src/agent-lab-efficiency-nonregression.test.ts',
  'tests/src/agent-lab-token-cost-estimate.test.ts',
  'tests/src/agent-lab-complete.test.ts',
  'tests/src/agent-lab-ahe-evidence.test.ts',
  'tests/src/agent-lab-maturity-controls.test.ts',
  'tests/src/family-stage-proof-bundle.test.ts',
  'tests/src/family-stage-cohort-loop.test.ts',
  'tests/src/family-stage-runtime-budget.test.ts',
  'tests/src/family-stage-assumption-lifecycle.test.ts',
  'tests/src/family-stage-replay-certification.test.ts',
  'tests/src/research-evidence-pack.test.ts',
  'tests/src/research-hypothesis-portfolio.test.ts',
  'tests/src/pack-os.test.ts',
  'tests/src/cli/cases/pack-os-command-surface.test.ts',
  'tests/src/cli/cases/runtime-research-evidence-pack-read-model.test.ts',
  'tests/src/cli/cases/runtime-research-hypothesis-portfolio-read-model.test.ts',
  'tests/src/family-stage-pack-registry.test.ts',
  'tests/src/family-stage-integrity-metadata-contract.test.ts',
  'tests/src/family-stage-admission.test.ts',
  'tests/src/cli/cases/system-semantic-hygiene.test.ts',
  'tests/src/cli/cases/domain-pack-compiler-generated-interfaces.test.ts',
  'tests/src/cli/cases/domain-pack-compiler-standard-agent-contract-pack.test.ts',
  'tests/src/family-domain-quality-projection-contract.test.ts',
  'tests/src/family-incident-learning-loop.test.ts',
  'tests/src/family-product-operator-projection.test.ts',
  'tests/src/quality-details.test.ts',
  'tests/src/cli/cases/brand-modules.test.ts',
  'tests/src/cli/cases/framework-operating-maturity.test.ts',
  'tests/src/cli/cases/runtime-brand-module-l5-evidence-ledger.test.ts',
];

const readModelGateTestFiles = [
  'tests/src/verification-test-governance.test.ts',
  'tests/src/current-owner-delta-topline.test.ts',
  'tests/src/framework-readiness-attention-actions.test.ts',
  'tests/src/generic-substrate-projection.test.ts',
  'tests/src/family-runtime-codex-stage-runner-mas-recovery.test.ts',
  'tests/src/family-runtime-codex-stage-runner.test.ts',
  'tests/src/family-runtime-codex-stage-runner-process-lifecycle.test.ts',
  'tests/src/family-runtime-codex-stage-runner-protocol.test.ts',
  'tests/src/family-runtime-codex-stage-runner-session-recovery.test.ts',
  'tests/src/family-runtime-stage-attempt-closeout-ledger.test.ts',
  'tests/src/family-runtime-temporal-terminal-sync.test.ts',
  'tests/src/family-runtime-agent-stage-runner.test.ts',
  'tests/src/family-runtime-temporal-provider.test.ts',
  'tests/src/agent-executor.test.ts',
  'tests/src/cli/cases/system-startup-maintenance.test.ts',
  'tests/src/cli/cases/system-module-package-channel.test.ts',
  'tests/src/cli/cases/system-configure-codex.test.ts',
  'tests/src/cli/cases/app-state.test.ts',
  'tests/src/cli/cases/app-action.test.ts',
  'tests/src/cli/cases/app-state-runtime-workbench.test.ts',
  'tests/src/cli/cases/app-state-provider-source.test.ts',
  'tests/src/cli/cases/app-state-developer-mode-closeout.test.ts',
  'tests/src/cli/cases/system-install-superpowers.test.ts',
  'tests/src/cli/cases/framework-readiness.test.ts',
  'tests/src/cli/cases/framework-readiness-stage-run-adoption.test.ts',
  'tests/src/cli/cases/framework-readiness-stage-replay-guidance.test.ts',
  'tests/src/cli/cases/runtime-manifest-cache-timeout.test.ts',
  'tests/src/cli/cases/framework-readiness-attention-semantics.test.ts',
  'tests/src/cli/cases/framework-readiness-app-release-user-path-ledger.test.ts',
  'tests/src/cli/cases/framework-readiness-oma-managed-install.test.ts',
  'tests/src/cli/cases/framework-readiness-oma-app-live-path.test.ts',
  'tests/src/cli/cases/framework-readiness-oma-production-consumption-ledger.test.ts',
  'tests/src/cli/cases/family-runtime-managed-state.test.ts',
  'tests/src/framework-readiness-owner-delta-handoff-summary.test.ts',
  'tests/src/cli/cases/workspace-domain.initializer-rca-series.test.ts',
  'tests/src/cli/cases/workspace-domain.initializer.test.ts',
  'tests/src/cli/cases/workspace-domain.projections.test.ts',
  'tests/src/cli/cases/workspace-domain.project-protocol.test.ts',
  'tests/src/cli/cases/workspace-domain.binding.test.ts',
  'tests/src/cli/cases/workspace-domain.transitions.test.ts',
  'tests/src/cli/cases/family-runtime.test.ts',
  'tests/src/cli/cases/family-runtime-provider-liveness.test.ts',
  'tests/src/cli/cases/family-runtime-queue-guards.test.ts',
  'tests/src/cli/cases/family-runtime-queue-stranded-release.test.ts',
  'tests/src/cli/cases/family-runtime-task-scope.test.ts',
  'tests/src/cli/cases/family-runtime-evidence-worklist.test.ts',
  'tests/src/cli/cases/family-runtime-evidence-worklist-default-caller-deletion-gates.test.ts',
  'tests/src/cli/cases/family-runtime-evidence-worklist-safe-actions.test.ts',
  'tests/src/cli/cases/family-runtime-evidence-worklist-no-worklist-root-planning.test.ts',
  'tests/src/cli/cases/family-runtime-evidence-worklist-provider-scheduler.test.ts',
  'tests/src/cli/cases/family-runtime-evidence-worklist-default-caller.test.ts',
  'tests/src/cli/cases/family-runtime-evidence-worklist-zero-open-guard.test.ts',
  'tests/src/cli/cases/family-runtime-evidence-worklist-payload-handoff.test.ts',
  'tests/src/cli/cases/family-runtime-evidence-worklist-domain-blockers.test.ts',
  'tests/src/cli/cases/family-runtime-evidence-worklist-stage-payload.test.ts',
  'tests/src/cli/cases/family-runtime-evidence-worklist-stage-replay.test.ts',
  'tests/src/cli/cases/family-runtime-mas-domain-route.test.ts',
  'tests/src/cli/cases/family-runtime-domain-handler-timeout.test.ts',
  'tests/src/cli/cases/family-runtime-cross-repo-e2e.test.ts',
  'tests/src/cli/cases/family-runtime-binding-intake.test.ts',
  'tests/src/cli/cases/family-runtime-current-control-provider-admission.test.ts',
  'tests/src/cli/cases/family-runtime-binding-dispatch.test.ts',
  'tests/src/cli/cases/family-runtime-binding-deadletter.test.ts',
  'tests/src/cli/cases/family-runtime-default-executor-owner-redrive.test.ts',
  'tests/src/cli/cases/family-runtime-paper-autonomy.test.ts',
  'tests/src/cli/cases/family-runtime-provider-repair.test.ts',
  'tests/src/cli/cases/family-runtime-provider-hosted-attempts.test.ts',
  'tests/src/cli/cases/family-runtime-queue-stranded-release.test.ts',
  'tests/src/cli/cases/family-runtime-provider-slo.test.ts',
  'tests/src/cli/cases/family-runtime-provider-slo-worker-repair.test.ts',
  'tests/src/cli/cases/family-runtime-lifecycle-handoff.test.ts',
  'tests/src/cli/cases/family-runtime-transition-bridge.test.ts',
  'tests/src/cli/cases/workspace-domain.production-closeout.test.ts',
  'tests/src/cli/cases/workspace-domain.production-closeout-timeout.test.ts',
  'tests/src/cli/cases/workspace-domain.production-provider-slo-closeout.test.ts',
  'tests/src/cli/cases/workspace-domain.production-evidence-readiness.test.ts',
  'tests/src/cli/cases/family-runtime-worker.test.ts',
  'tests/src/cli/cases/family-runtime-worker-lifecycle.test.ts',
  'tests/src/cli/cases/family-runtime-stage-attempts.test.ts',
  'tests/src/cli/cases/family-runtime-stage-attempt-monitoring.test.ts',
  'tests/src/cli/cases/family-runtime-stage-attempt-query-closeout.test.ts',
  'tests/src/cli/cases/family-runtime-stage-attempts-residency-proof.test.ts',
  'tests/src/cli/cases/family-runtime-stage-launch-gates.test.ts',
  'tests/src/cli/cases/family-runtime-stage-admission-contract-light.test.ts',
  'tests/src/cli/cases/family-runtime-stage-attempt-usage.test.ts',
  'tests/src/cli/cases/family-runtime-stage-attempt-workbench-usage.test.ts',
  'tests/src/cli/cases/family-runtime-stage-attempts-temporal-provider.test.ts',
  'tests/src/cli/cases/family-runtime-stage-attempts-temporal-terminal.test.ts',
  'tests/src/cli/cases/family-runtime-stage-attempts-temporal-terminal-query.test.ts',
  'tests/src/cli/cases/family-runtime-stage-attempts-temporal-provider-cli.test.ts',
  'tests/src/cli/cases/agent-lab.test.ts',
  'tests/src/cli/cases/agent-lab-command-surface.test.ts',
  'tests/src/cli/cases/work-order-execution.test.ts',
  'tests/src/cli/cases/agent-lab-evolution-suite.test.ts',
  'tests/src/cli/cases/agent-executor-cli.test.ts',
  'tests/src/cli/cases/agents-scaffold-progress-first.test.ts',
  'tests/src/cli/cases/agents-scaffold.test.ts',
  'tests/src/cli/cases/agents-scaffold-consumption-evidence.test.ts',
  'tests/src/cli/cases/agents-scaffold-generation.test.ts',
  'tests/src/cli/cases/agents-scaffold-validation-failures.test.ts',
  'tests/src/cli/cases/standard-agent-template-consumption-read-model.test.ts',
  'tests/src/cli/cases/runtime-standard-agent-template-consumption-ledger.test.ts',
  'tests/src/cli/cases/agents-readiness-stage-run-adoption.test.ts',
  'tests/src/cli/cases/agents-conformance.test.ts',
  'tests/src/cli/cases/agents-conformance-stage-operating-principles.test.ts',
  'tests/src/cli/cases/agents-conformance-readiness.test.ts',
  'tests/src/cli/cases/agents-conformance-private-surface.test.ts',
  'tests/src/cli/cases/agents-conformance-stage-run-kernel.test.ts',
  'tests/src/cli/cases/agents-conformance-rca-oma-mvp.test.ts',
  'tests/src/cli/cases/agents-conformance-state-index-adoption.test.ts',
  'tests/src/cli/cases/agents-conformance-platform-surfaces.test.ts',
  'tests/src/cli/cases/golden-path-single-default.test.ts',
  'tests/src/cli/cases/domain-pack-compiler-oma-fixture.test.ts',
  'tests/src/cli/cases/domain-pack-compiler-drift-manifest.test.ts',
  'tests/src/cli/cases/domain-pack-compiler-generated-interfaces.test.ts',
  'tests/src/cli/cases/domain-pack-compiler-standard-agent-contract-pack.test.ts',
  'tests/src/cli/cases/domain-pack-compiler.test.ts',
  'tests/src/cli/cases/domain-pack-compiler-real-repo.test.ts',
  'tests/src/cli/cases/workspace-domain.stages-artifact-locator.test.ts',
  'tests/src/cli/cases/workspace-domain.stages-graph.test.ts',
  'tests/src/cli/cases/workspace-domain.stages-replay.test.ts',
  'tests/src/cli/cases/workspace-domain.external-evidence.test.ts',
  'tests/src/cli/cases/runtime-tray-domain-projection-ingestion.test.ts',
  'tests/src/runtime-app-operator-selected-safe-action.test.ts',
  'tests/src/cli/cases/runtime-app-operator-drilldown.test.ts',
  'tests/src/cli/cases/runtime-app-operator-drilldown-visualization-projection.test.ts',
  'tests/src/cli/cases/runtime-app-operator-drilldown-route-support.test.ts',
  'tests/src/cli/cases/runtime-app-operator-drilldown-app-release-user-path-ledger.test.ts',
  'tests/src/cli/cases/runtime-app-release-user-path-evidence-ledger.test.ts',
  'tests/src/cli/cases/runtime-codex-app-runtime-evidence-ledger.test.ts',
  'tests/src/cli/cases/runtime-stage-run-execution-authorization-ledger.test.ts',
  'tests/src/cli/cases/runtime-developer-mode-closeout-ledger.test.ts',
  'tests/src/cli/cases/runtime-app-operator-drilldown-developer-mode-live-closeout.test.ts',
  'tests/src/cli/cases/runtime-app-operator-drilldown-runtime-role.test.ts',
  'tests/src/cli/cases/runtime-app-operator-drilldown-direct.test.ts',
  'tests/src/cli/cases/runtime-app-operator-drilldown-lifecycle.test.ts',
  'tests/src/cli/cases/runtime-app-operator-drilldown-workstream-operating-loop.test.ts',
  'tests/src/cli/cases/runtime-app-operator-drilldown-actions.test.ts',
  'tests/src/cli/cases/runtime-app-operator-drilldown-actions-ops.test.ts',
  'tests/src/cli/cases/runtime-app-operator-drilldown-actions-execute.test.ts',
  'tests/src/cli/cases/runtime-app-operator-drilldown-provider-worker-actions.test.ts',
  'tests/src/cli/cases/runtime-app-operator-stage-evidence-actions.test.ts',
  'tests/src/cli/cases/runtime-app-operator-drilldown-external-evidence-actions.test.ts',
  'tests/src/cli/cases/runtime-app-operator-stage-evidence-closeout.test.ts',
  'tests/src/cli/cases/runtime-app-operator-drilldown-domain-dispatch-compaction.test.ts',
  'tests/src/cli/cases/runtime-app-operator-drilldown-rca-payload-summary.test.ts',
  'tests/src/cli/cases/runtime-app-operator-drilldown-mas-payload-summary.test.ts',
  'tests/src/cli/cases/runtime-app-operator-drilldown-mag-payload-summary.test.ts',
  'tests/src/cli/cases/runtime-app-operator-drilldown-summary.test.ts',
  'tests/src/cli/cases/runtime-app-operator-drilldown-manifest-cache.test.ts',
  'tests/src/cli/cases/runtime-app-operator-drilldown-oma-managed-install.test.ts',
  'tests/src/cli/cases/runtime-app-operator-drilldown-oma-manual-required.test.ts',
  'tests/src/cli/cases/runtime-app-operator-drilldown-owner-handoff.test.ts',
  'tests/src/cli/cases/runtime-tray-stage-attempt-workbench.test.ts',
  'tests/src/cli/cases/runtime-tray-stage-attempt-workbench-cognitive-kernel.test.ts',
  'tests/src/cli/cases/runtime-tray-stage-attempt-workbench-default-codex.test.ts',
  'tests/src/cli/cases/runtime-tray-provider-continuous-proof.test.ts',
  'tests/src/cli/cases/runtime-observability-export.test.ts',
  'tests/src/cli/cases/runtime-manager-provider.test.ts',
  'tests/src/cli/cases/runtime-lifecycle-operator.test.ts',
];

const readModelGateTemporalHeavyTestFiles = [
  'tests/src/family-runtime-temporal-provider.test.ts',
  'tests/src/cli/cases/family-runtime.test.ts',
  'tests/src/cli/cases/family-runtime-provider-repair.test.ts',
  'tests/src/cli/cases/family-runtime-worker.test.ts',
  'tests/src/cli/cases/family-runtime-worker-lifecycle.test.ts',
  'tests/src/cli/cases/family-runtime-stage-attempts-temporal-provider.test.ts',
  'tests/src/cli/cases/family-runtime-stage-attempts-temporal-terminal.test.ts',
  'tests/src/cli/cases/family-runtime-stage-attempts-temporal-terminal-query.test.ts',
];

const readModelGateNonTemporalHeavyTestFiles = readModelGateTestFiles.filter(
  (file) => !readModelGateTemporalHeavyTestFiles.includes(file),
);

const lanes = {
  smoke: [
    nodeTest([
      'tests/src/verification-command-surfaces.test.ts',
      'tests/src/target-architecture-schema-contracts.test.ts',
      'tests/src/cognitive-computation-kernel-contract.test.ts',
      'tests/src/verification-test-governance.test.ts',
      'tests/src/cli-modularization.test.ts',
      'tests/src/runtime-state-paths.test.ts',
      'tests/src/opl-session-runtime.test.ts',
    ], { batchSize: 25 }),
  ],
  fast: [
    { kind: 'command', command: 'scripts/repo-hygiene.sh', args: [] },
    nodeTest(fastTestFiles, { batchSize: 20 }),
  ],
  'fast-parallel': [
    { kind: 'command', command: 'scripts/repo-hygiene.sh', args: [] },
    nodeTest(fastTestFiles, { batchSize: 20 }),
  ],
  'read-model-gates': [
    nodeTest(readModelGateNonTemporalHeavyTestFiles, {
      batchSize: 20,
      env: { OPL_CLI_TEST_TIMEOUT_MS: '90000' },
    }),
    nodeTest(readModelGateTemporalHeavyTestFiles, {
      batchSize: 1,
      env: { OPL_CLI_TEST_TIMEOUT_MS: '90000' },
    }),
  ],
  meta: [
    nodeTest([
      'tests/src/verification-command-surfaces.test.ts',
      'tests/src/target-architecture-schema-contracts.test.ts',
      'tests/src/cognitive-computation-kernel-contract.test.ts',
      'tests/src/verification-test-governance.test.ts',
      'tests/src/cli-modularization.test.ts',
      'tests/src/runtime-state-paths.test.ts',
      'tests/src/active-path-residue-scan.test.ts',
      'tests/src/stale-compat-retirement-guard.test.ts',
      'tests/src/cli/cases/system-semantic-hygiene.test.ts',
      'tests/src/cli/cases/framework-readiness.test.ts',
      'tests/src/cli/cases/runtime-manifest-cache-timeout.test.ts',
      'tests/src/cli/cases/framework-readiness-attention-semantics.test.ts',
      'tests/src/cli/cases/framework-readiness-cli-surface.test.ts',
      'tests/src/cli/cases/framework-readiness-oma-managed-install.test.ts',
      'tests/src/cli/cases/framework-readiness-oma-app-live-path.test.ts',
      'tests/src/cli/cases/framework-readiness-oma-production-consumption-ledger.test.ts',
      'tests/src/framework-readiness-attention-actions.test.ts',
      'tests/src/cli/cases/agents-conformance-stage-pack-v2.test.ts',
      'tests/src/cli/cases/agents-conformance-mas-tombstones.test.ts',
      'tests/src/cli/cases/agents-default-callers.test.ts',
      'tests/src/cli/cases/domain-pack-compiler-canonical-targets.test.ts',
      'tests/src/family-product-operator-projection.test.ts',
    ], { batchSize: 10 }),
  ],
  regression: [
    nodeTest([
      'tests/src/cli.test.ts',
      'tests/src/cli/cases/package-channel-daily-check.test.ts',
      'tests/src/cli/cases/runtime-tray-mas-portal.test.ts',
      'tests/src/cli-codex-default-shell.test.ts',
      'tests/src/cli-codex-default-shell-passthrough.test.ts',
      'tests/src/runtime-state-paths.test.ts',
      'tests/src/family-domain-catalog.test.ts',
      'tests/src/family-entry-contracts.test.ts',
      'tests/src/family-executor-adapter-contract.test.ts',
      'tests/src/product-entry-companions.test.ts',
      'tests/src/product-entry-runtime.test.ts',
      'tests/src/product-entry-program-companions.test.ts',
      'tests/src/product-entry-agent-executor.test.ts',
      'tests/src/family-orchestration.test.ts',
      'tests/src/runtime-task-companions.test.ts',
      'tests/src/skill-catalog.test.ts',
      'tests/src/opl-skills-boundary.test.ts',
      'tests/src/automation-companions.test.ts',
    ]),
  ],
  integration: [
    nodeTest([
      'tests/src/cli-acp-runtime.test.ts',
      'tests/src/cli-install.test.ts',
      'tests/src/cli/cases/web-runtime.test.ts',
      'tests/src/domain-definition-contract.test.ts',
    ]),
  ],
  artifact: [
    { kind: 'npm', args: ['run', 'build'] },
    nodeTest(['tests/built/cli.test.mjs'], { stripTypes: false }),
  ],
  'fresh-install': [
    nodeTest(['tests/src/fresh-install-smoke.test.ts']),
  ],
};

const argv = process.argv.slice(2);
const command = argv[0] ?? 'help';
const commandHandlers = {
  list: printLaneList,
  run: () => runLane(argv[1]),
  'assert-coverage': assertCoverage,
  help: printHelp,
  '--help': printHelp,
  '-h': printHelp,
};

function runLane(laneName) {
  requireLane(laneName).forEach((step, index) => runLaneStep(laneName, step, index));
}

function requireLane(laneName) {
  const steps = lanes[laneName];
  if (!steps) {
    fail(`Unknown test lane: ${laneName}`);
  }
  return steps;
}

function runLaneStep(laneName, step, stepIndex) {
  const result = runStep(step, { laneName, stepIndex });
  exitOnFailure(result);
}

function runStep(step, context) {
  const stepRunner = stepRunners[step.kind];
  if (!stepRunner) {
    fail(`Unsupported test lane step kind: ${step.kind}`);
  }
  return stepRunner(step, context);
}

const stepRunners = {
  command: (step, context) => spawnStep(step.command, step.args, {
    ...context,
    stepKind: step.kind,
  }),
  npm: (step, context) => spawnStep(npmCommand(), step.args, {
    ...context,
    stepKind: step.kind,
  }),
  'node-test': runNodeTestStep,
};

function runNodeTestStep(step, context) {
  if (!Number.isInteger(step.batchSize) || step.batchSize <= 0 || step.files.length <= step.batchSize) {
    return spawnStep(process.execPath, nodeTestArgs(step), {
      ...context,
      stepKind: step.kind,
      batchFiles: step.files,
    }, { env: step.env });
  }
  const chunks = chunkFiles(step.files, step.batchSize);
  for (const [batchIndex, files] of chunks.entries()) {
    const result = spawnStep(process.execPath, nodeTestArgs({ ...step, files }), {
      ...context,
      stepKind: step.kind,
      batchIndex,
      batchCount: chunks.length,
      batchFiles: files,
    }, { env: step.env });
    if (result.status !== 0) {
      return result;
    }
  }
  return { status: 0 };
}

function chunkFiles(files, size) {
  const chunks = [];
  for (let index = 0; index < files.length; index += size) {
    chunks.push(files.slice(index, index + size));
  }
  return chunks;
}

function spawnStep(commandName, args, context, options = {}) {
  const result = spawnSync(commandName, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    timeout: stepTimeoutMs,
    detached: true,
    killSignal: 'SIGTERM',
    env: {
      ...process.env,
      NODE_NO_WARNINGS: '1',
      TMPDIR: process.env.TMPDIR || toolTempDir + path.sep,
      NODE_COMPILE_CACHE: process.env.NODE_COMPILE_CACHE || path.join(pythonCacheRoot, 'node-compile-cache'),
      NPM_CONFIG_CACHE: process.env.NPM_CONFIG_CACHE || path.join(pythonCacheRoot, 'npm-cache'),
      npm_config_cache: process.env.npm_config_cache || process.env.NPM_CONFIG_CACHE || path.join(pythonCacheRoot, 'npm-cache'),
      UV_CACHE_DIR: process.env.UV_CACHE_DIR || path.join(pythonCacheRoot, 'uv-cache'),
      UV_PROJECT_ENVIRONMENT: process.env.UV_PROJECT_ENVIRONMENT || path.join(pythonCacheRoot, 'uv-project-venv'),
      PIP_CACHE_DIR: process.env.PIP_CACHE_DIR || path.join(pythonCacheRoot, 'pip-cache'),
      CARGO_TARGET_DIR: process.env.CARGO_TARGET_DIR || path.join(pythonCacheRoot, 'cargo-target'),
      XDG_CACHE_HOME: process.env.XDG_CACHE_HOME || path.join(pythonCacheRoot, 'xdg-cache'),
      PYTHONDONTWRITEBYTECODE: process.env.PYTHONDONTWRITEBYTECODE || '1',
      PYTHONPYCACHEPREFIX: process.env.PYTHONPYCACHEPREFIX || path.join(pythonCacheRoot, 'pycache'),
      PYTEST_ADDOPTS: [
        process.env.PYTEST_ADDOPTS || '',
        '-p no:cacheprovider',
        `-o cache_dir=${path.join(pythonCacheRoot, 'pytest-cache')}`,
      ].filter(Boolean).join(' '),
      ...(options.env ?? {}),
    },
  });
  if (isTimeoutResult(result)) {
    cleanupTimedOutProcessGroup(result);
    reportStepTimeout(commandName, args, context);
    return { ...result, status: 1 };
  }
  return result;
}

function nodeTestArgs(step) {
  const args = step.stripTypes ? ['--experimental-strip-types'] : [];
  args.push('--test', ...step.files);
  return args;
}

function assertCoverage() {
  const trackedTests = trackedTestFiles();
  const covered = coveredTestFiles();
  const uncovered = trackedTests.filter((file) => !covered.has(file));
  failOnUncoveredTests(uncovered);

  process.stdout.write(`All ${trackedTests.length} active test files are assigned to a test lane.\n`);
}

function coveredTestFiles() {
  const covered = new Set();
  laneEntryFiles().forEach((file) => addImportClosure(file, covered));
  return covered;
}

function failOnUncoveredTests(uncovered) {
  if (uncovered.length === 0) {
    return;
  }
  process.stderr.write('Active test files are not assigned to a test lane:\n');
  process.stderr.write(uncovered.map((file) => `- ${file}`).join('\n'));
  process.stderr.write('\n');
  process.exit(1);
}

function laneEntryFiles() {
  return Object.values(lanes).flatMap(laneNodeTestFiles);
}

function laneNodeTestFiles(steps) {
  return steps.filter(isNodeTestStep).flatMap(stepFiles);
}

function isNodeTestStep(step) {
  return step.kind === 'node-test';
}

function stepFiles(step) {
  return step.files;
}

function trackedTestFiles() {
  const result = spawnSync('git', ['ls-files', 'tests/**/*.test.ts', 'tests/**/*.test.mjs'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assertSuccessfulGitLsFiles(result);
  return result.stdout
    .split('\n')
    .filter(Boolean)
    .filter(isActiveTrackedTestFile)
    .sort();
}

function assertSuccessfulGitLsFiles(result) {
  if (result.status === 0) {
    return;
  }
  process.stderr.write(result.stderr);
  process.stderr.write('git ls-files failed\n');
  process.exit(1);
}

function isActiveTrackedTestFile(file) {
  if (!fs.existsSync(path.join(repoRoot, file))) {
    return false;
  }
  return file.startsWith('tests/src/') || file.startsWith('tests/built/');
}

function addImportClosure(relativePath, covered) {
  const normalized = normalizeRelativePath(relativePath);
  if (!shouldReadForClosure(normalized, covered)) {
    return;
  }

  collectImportedTestFiles(normalized).forEach((imported) => addImportClosure(imported, covered));
}

function shouldReadForClosure(relativePath, covered) {
  return markCovered(relativePath, covered) && trackedFileExists(relativePath);
}

function markCovered(relativePath, covered) {
  if (covered.has(relativePath)) {
    return false;
  }
  covered.add(relativePath);
  return true;
}

function collectImportedTestFiles(relativePath) {
  const source = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
  const importPattern = /import\s+(?:[^'"]+\s+from\s+)?['"](\.{1,2}\/[^'"]+)['"]/g;
  const sourceDir = path.dirname(relativePath);
  return [...source.matchAll(importPattern)]
    .map((match) => resolveImport(sourceDir, match[1]))
    .filter(isImportableTestFile);
}

function isImportableTestFile(file) {
  return Boolean(file && /\.(?:test\.)?(?:ts|mjs)$/.test(file));
}

function resolveImport(sourceDir, specifier) {
  const base = normalizeRelativePath(path.join(sourceDir, specifier));
  return importCandidates(base).find(trackedFileExists) ?? null;
}

function importCandidates(base) {
  return path.extname(base) ? [base] : [base, `${base}.ts`, `${base}.mjs`];
}

function trackedFileExists(relativePath) {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

function printLaneList() {
  Object.entries(lanes).forEach(printLane);
}

function printLane([laneName, steps]) {
  process.stdout.write(`${laneName}\n`);
  steps.forEach((step) => process.stdout.write(formatLaneStep(step)));
}

const laneStepFormatters = {
  command: formatCommandStep,
  npm: formatNpmStep,
  'node-test': formatNodeTestStep,
};

function formatLaneStep(step) {
  const formatter = laneStepFormatters[step.kind];
  return formatter(step);
}

function formatNodeTestStep(step) {
  return step.files.map((file) => `  ${file}\n`).join('');
}

function formatNpmStep(step) {
  return `  npm ${step.args.join(' ')}\n`;
}

function formatCommandStep(step) {
  return `  ${step.command} ${step.args.join(' ')}\n`.trimEnd() + '\n';
}

function printHelp() {
  process.stdout.write(`Usage: scripts/test-lanes.mjs <command>\n\n`);
  process.stdout.write('Commands:\n');
  process.stdout.write('  list\n');
  process.stdout.write(`  run <${Object.keys(lanes).join('|')}>\n`);
  process.stdout.write('  assert-coverage\n');
}

function normalizeRelativePath(filePath) {
  return filePath.split(path.sep).join('/');
}

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function parseStepTimeoutMs(rawValue) {
  if (!rawValue) {
    return defaultStepTimeoutMs;
  }
  if (!/^\d+$/.test(rawValue)) {
    fail(`OPL_TEST_LANE_STEP_TIMEOUT_MS must be a positive integer <= ${maxStepTimeoutMs}; got ${rawValue}`);
  }
  const parsed = Number(rawValue);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > maxStepTimeoutMs) {
    fail(`OPL_TEST_LANE_STEP_TIMEOUT_MS must be a positive integer <= ${maxStepTimeoutMs}; got ${rawValue}`);
  }
  return parsed;
}

function isTimeoutResult(result) {
  return result.error?.code === 'ETIMEDOUT';
}

function cleanupTimedOutProcessGroup(result) {
  if (!result.pid) {
    return;
  }
  try {
    process.kill(-result.pid, 'SIGKILL');
  } catch {
    try {
      process.kill(result.pid, 'SIGKILL');
    } catch {
      // The timeout report below is authoritative; cleanup is best-effort for child process groups.
    }
  }
}

function reportStepTimeout(commandName, args, context) {
  process.stderr.write([
    'Test lane step timed out.',
    `lane=${context.laneName}`,
    `step=${formatStepContext(context)}`,
    `command=${formatSpawnCommand(commandName, args)}`,
    `timeout_ms=${stepTimeoutMs}`,
  ].join(' ') + '\n');
}

function formatStepContext(context) {
  const parts = [`${context.stepIndex + 1}:${context.stepKind}`];
  if (Number.isInteger(context.batchIndex)) {
    parts.push(`batch=${context.batchIndex + 1}/${context.batchCount}`);
  }
  if (context.batchFiles?.length) {
    parts.push(`files=${context.batchFiles.join(',')}`);
  }
  return parts.join(' ');
}

function formatSpawnCommand(commandName, args) {
  return [commandName, ...args].join(' ');
}

function exitOnFailure(result) {
  if (result.status === 0) {
    return;
  }
  process.exit(exitStatus(result));
}

function exitStatus(result) {
  return result.status === null ? 1 : result.status;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const commandHandler = commandHandlers[command];
if (!commandHandler) {
  fail(`Unknown command: ${command}`);
}
commandHandler();

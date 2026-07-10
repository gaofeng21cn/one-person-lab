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

function expandTestFiles(patterns, options = {}) {
  const expanded = patterns.flatMap((pattern) => {
    const matches = fs.globSync(pattern, { cwd: repoRoot }).map(normalizeRelativePath);
    if (!matches.length) {
      fail(`Test lane pattern matched no files: ${pattern}`);
    }
    return matches;
  });
  const excluded = options.exclude ?? [];
  const staleExclusions = excluded.filter((file) => !expanded.includes(file));
  if (staleExclusions.length) {
    fail(`Test lane exclusions matched no expanded files: ${staleExclusions.join(', ')}`);
  }
  return expanded.filter((file) => !excluded.includes(file));
}

const fastTestFiles = [
  'tests/src/domain-agent-admission-gates.test.ts',
  'tests/src/verification-command-surfaces.test.ts',
  'tests/src/verification-package-surfaces.test.ts',
  'tests/src/target-architecture-schema-contracts.test.ts',
  'tests/src/evidence-grounded-catalog-eval.test.ts',
  'tests/src/capability-registry-resolver.test.ts',
  'tests/src/family-runtime-capability-launch-gate.test.ts',
  'tests/src/cognitive-computation-kernel-contract.test.ts',
  'tests/src/advisory-knowledge-boundary-contract.test.ts',
  'tests/src/opl-flow-completion-audit-contract.test.ts',
  'tests/src/operator-compact-readback-contract.test.ts',
  'tests/src/verification-test-governance.test.ts',
  'tests/src/line-budget.test.ts',
  'tests/src/source-structure-operator-readback.test.ts',
  'tests/src/active-path-residue-scan.test.ts',
  'tests/src/stale-compat-retirement-guard.test.ts',
  'tests/src/managed-shell-command-env.test.ts',
  'tests/src/observability-projection-vocabulary.test.ts',
  'tests/src/agent-workspace-norm.test.ts',
  'tests/src/domain-manifest-resolver.test.ts',
  'tests/src/family-structure-advisory.test.ts',
  'tests/src/family-shared-release-discipline.test.ts',
  'tests/src/family-shared-release.test.ts',
  'tests/src/native-helper-family-smoke.test.ts',
  'tests/src/native-helper-prebuild.test.ts',
  'tests/src/cli/cases/cli-broken-pipe.test.ts',
  'tests/src/mas-mag-cognitive-kernel-stage-pack-fixtures.test.ts',
  ...expandTestFiles(['tests/src/stage-artifact-runtime.test.ts', 'tests/src/stage-artifact-contract.test.ts']),
  'tests/src/schema-registry.test.ts',
  'tests/src/domain-tail-default-caller-matrix.test.ts',
  'tests/src/workspace-diagnostics-policy.test.ts',
  'tests/src/observability-semantic-conventions.test.ts',
  ...expandTestFiles(['tests/src/state-index-kernel-contract.test.ts', 'tests/src/stage-run-kernel-contract.test.ts', 'tests/src/progress-delta-receipt-contract.test.ts']),
  'tests/src/json-file-boundary.test.ts',
  'tests/src/quality-gate-runtime-contract.test.ts',
  'tests/src/stage-run-transition-authority-read-model.test.ts',
  ...expandTestFiles(['tests/src/stage-transition-authority-contract.test.ts', 'tests/src/stage-transition-authority.test.ts']),
  ...expandTestFiles(['tests/src/family-runtime-state-index.test.ts', 'tests/src/family-runtime-attempt-contract.test.ts', 'tests/src/family-runtime-stage-run-currentness-identity.test.ts', 'tests/src/family-runtime-effective-current-context.test.ts']),
  'tests/src/cli/cases/family-runtime-command-parser.test.ts',
  'tests/src/current-owner-delta-read-model-cache.test.ts',
  'tests/src/family-transition-runner.test.ts',
  'tests/src/stagecraft-domain-profile-registry.test.ts',
  'tests/src/functional-agent-runtime-harness.test.ts',
  'tests/src/functional-privatization-audit-envelope.test.ts',
  'tests/src/domain-dispatch-evidence-payload-preflight.test.ts',
  'tests/src/domain-dispatch-evidence-workorder-packet.test.ts',
  'tests/src/runtime-tray-app-operator-domain-dispatch-action-routes.test.ts',
  ...expandTestFiles(['tests/src/family-runtime-lifecycle-index.test.ts', 'tests/src/family-runtime-sqlite.test.ts', 'tests/src/family-runtime-domain-autonomy.test.ts']),
  'tests/src/stage-route-scheduler-arbiter-substrate-contract.test.ts',
  'tests/src/agent-lab.test.ts',
  ...expandTestFiles(['tests/src/agent-lab-mechanism-evolution.test.ts', 'tests/src/agent-lab-developer-mode-contract.test.ts', 'tests/src/agent-lab-executor-aperture.test.ts', 'tests/src/agent-lab-efficiency-nonregression.test.ts', 'tests/src/agent-lab-rho-workflow-contract.test.ts']),
  'tests/src/cli/cases/agent-lab-rho-workflow-run.test.ts',
  'tests/src/agent-lab-complete.test.ts',
  'tests/src/agent-lab-complete-cases/developer-mode.test.ts',
  ...expandTestFiles(['tests/src/agent-lab-ahe-evidence.test.ts', 'tests/src/agent-lab-maturity-controls.test.ts', 'tests/src/agent-lab-feedbackops.test.ts']),
  'tests/src/cli/cases/capability-map-audit-script.test.ts',
  'tests/src/cli/cases/feedbackops.test.ts',
  ...expandTestFiles(['tests/src/family-stage-proof-bundle.test.ts', 'tests/src/family-stage-cohort-loop.test.ts', 'tests/src/family-stage-runtime-budget.test.ts', 'tests/src/family-stage-assumption-lifecycle.test.ts', 'tests/src/family-stage-replay-certification.test.ts']),
  'tests/src/stage-run-evidence-pack.test.ts',
  'tests/src/stage-candidate-portfolio.test.ts',
  'tests/src/runtime-environment-substrate.test.ts',
  'tests/src/pack-bundle.test.ts',
  'tests/src/okf-context-bundle.test.ts',
  'tests/src/domain-pack-okf-context-bundle.test.ts',
  'tests/src/standard-agent-landing-acceptance-contract.test.ts',
  'tests/src/cli/cases/okf-command-surface.test.ts',
  'tests/src/cli/cases/runtime-environment-substrate-command-surface.test.ts',
  'tests/src/cli/cases/pack-bundle-command-surface.test.ts',
  'tests/src/cli/cases/pack-native-helper-probe.test.ts',
  'tests/src/cli/cases/opl-foundation-skills-plugin-surface.test.ts',
  ...expandTestFiles(['tests/src/cli/cases/connect-scientific.test.ts', 'tests/src/cli/cases/connect-reference-verification.test.ts', 'tests/src/cli/cases/connect-external-skills.test.ts', 'tests/src/cli/cases/connect-foundation-skills.test.ts', 'tests/src/cli/cases/connect-agent-packages.test.ts']),
  'tests/src/cli/cases/cli-command-registry.test.ts',
  'tests/src/cli/cases/runtime-stage-run-evidence-pack-read-model.test.ts',
  'tests/src/cli/cases/runtime-stage-candidate-portfolio-read-model.test.ts',
  'tests/src/cli/cases/artifact-provenance-bundle-ledger.test.ts',
  'tests/src/substrate-provenance-surface.test.ts',
  ...expandTestFiles(['tests/src/family-stage-pack-registry.test.ts', 'tests/src/family-stage-integrity-metadata-contract.test.ts', 'tests/src/family-stage-admission.test.ts']),
  'tests/src/family-action-stage-route.test.ts',
  'tests/src/cli/cases/system-semantic-hygiene.test.ts',
  'tests/src/cli/cases/domain-pack-compiler-active-caller-targets.test.ts',
  'tests/src/cli/cases/domain-pack-compiler-generated-interfaces.test.ts',
  'tests/src/cli/cases/domain-pack-compiler-standard-agent-contract-pack.test.ts',
  'tests/src/standard-agent-stage-manifest-compiler.test.ts',
  'tests/src/family-domain-quality-projection-contract.test.ts',
  'tests/src/family-incident-learning-loop.test.ts',
  'tests/src/family-product-operator-projection.test.ts',
  'tests/src/quality-details.test.ts',
  'tests/src/cli/cases/brand-modules.test.ts',
  'tests/src/cli/cases/framework-operating-maturity.test.ts',
  'tests/src/evidence-grounded-stagecraft-runway.test.ts',
  'tests/src/evidence-grounded-substrate.test.ts',
  'tests/src/cli/cases/runtime-brand-module-l5-evidence-ledger.test.ts',
];

const readModelGateTestFiles = [
  'tests/src/verification-test-governance.test.ts',
  'tests/src/current-owner-delta-topline.test.ts',
  'tests/src/framework-readiness-attention-actions.test.ts',
  'tests/src/generic-substrate-projection.test.ts',
  ...expandTestFiles([
    'tests/src/cli/cases/family-runtime-{codex-stage-runner,retired-provider}.test.ts',
  ], { exclude: ['tests/src/cli/cases/family-runtime-retired-provider.test.ts'] }),
  'tests/src/family-runtime-codex-stage-runner.test.ts',
  'tests/src/family-runtime-stage-attempt-closeout-ledger.test.ts',
  'tests/src/family-runtime-temporal-terminal-sync.test.ts',
  'tests/src/family-runtime-agent-stage-runner.test.ts',
  'tests/src/family-runtime-temporal-provider.test.ts',
  'tests/src/agent-executor.test.ts',
  'tests/src/cli/cases/system-seed-manifest.test.ts',
  'tests/src/cli/cases/system-startup-maintenance.test.ts',
  'tests/src/cli/cases/system-module-package-channel.test.ts',
  'tests/src/cli/cases/system-configure-codex.test.ts',
  'tests/src/cli/cases/managed-update-kernel-projection.test.ts',
  'tests/src/cli/cases/app-state.test.ts',
  'tests/src/app-state-view-model-runtime-scope.test.ts',
  'tests/src/cli/cases/app-state-stage-run-owner-answer.test.ts',
  'tests/src/cli/cases/app-action.test.ts',
  ...expandTestFiles(['tests/src/cli/cases/app-state-runtime-workbench.test.ts', 'tests/src/cli/cases/app-state-provider-source.test.ts', 'tests/src/cli/cases/app-state-developer-mode-closeout.test.ts']),
  'tests/src/cli/cases/system-install-superpowers.test.ts',
  ...expandTestFiles(['tests/src/cli/cases/framework-readiness-binding-cases.test.ts', 'tests/src/cli/cases/framework-readiness.test.ts', 'tests/src/cli/cases/framework-readiness-stage-run-adoption.test.ts', 'tests/src/cli/cases/framework-readiness-stage-replay-guidance.test.ts']),
  'tests/src/cli/cases/runtime-manifest-cache-timeout.test.ts',
  ...expandTestFiles(['tests/src/cli/cases/framework-readiness-attention-semantics.test.ts', 'tests/src/cli/cases/framework-readiness-app-release-user-path-ledger.test.ts', 'tests/src/cli/cases/framework-readiness-oma-managed-install.test.ts', 'tests/src/cli/cases/framework-readiness-oma-app-live-path.test.ts', 'tests/src/cli/cases/framework-readiness-oma-production-consumption-ledger.test.ts']),
  'tests/src/cli/cases/family-runtime-managed-state.test.ts',
  'tests/src/framework-readiness-owner-delta-handoff-summary.test.ts',
  ...expandTestFiles(['tests/src/cli/cases/workspace-domain.initializer-rca-series.test.ts', 'tests/src/cli/cases/workspace-domain.initializer.test.ts']),
  'tests/src/cli/cases/workspace-domain.projections.test.ts',
  'tests/src/cli/cases/workspace-domain.project-protocol.test.ts',
  'tests/src/cli/cases/workspace-domain.binding.test.ts',
  'tests/src/cli/cases/workspace-domain.transitions.test.ts',
  ...expandTestFiles([
    'tests/src/cli/cases/family-runtime.test.ts', 'tests/src/cli/cases/family-runtime-provider-liveness.test.ts',
    'tests/src/cli/cases/family-runtime-evidence-worklist.test.ts', 'tests/src/cli/cases/family-runtime-evidence-worklist-default-caller-deletion-gates.test.ts',
    'tests/src/cli/cases/family-runtime-evidence-worklist-no-worklist-root-planning.test.ts', 'tests/src/cli/cases/family-runtime-evidence-worklist-domain-blockers.test.ts',
    'tests/src/cli/cases/family-runtime-evidence-worklist-stage-payload.test.ts',
  ]),
  'tests/src/family-runtime-domain-handler-closeout.test.ts',
  ...expandTestFiles([
    'tests/src/cli/cases/family-runtime-domain-progress-transition-runtime.test.ts', 'tests/src/cli/cases/family-runtime-provider-repair.test.ts',
    'tests/src/cli/cases/family-runtime-provider-slo.test.ts', 'tests/src/cli/cases/family-runtime-provider-slo-worker-repair.test.ts',
    'tests/src/cli/cases/family-runtime-lifecycle-handoff.test.ts', 'tests/src/cli/cases/family-runtime-worker.test.ts',
    'tests/src/cli/cases/family-runtime-worker-lifecycle.test.ts', 'tests/src/cli/cases/family-runtime-stage-attempts.test.ts',
    'tests/src/cli/cases/family-runtime-stage-attempt-monitoring.test.ts', 'tests/src/cli/cases/family-runtime-stage-launch-gates.test.ts',
    'tests/src/cli/cases/family-runtime-stage-admission-contract-light.test.ts',
  ]),
  'tests/src/cli/cases/runtime-stage-attempt-frontier-board-projection.test.ts',
  ...expandTestFiles(['tests/src/cli/cases/family-runtime-stage-attempt-usage-projection.test.ts', 'tests/src/cli/cases/family-runtime-stage-attempts-temporal-provider.test.ts']),
  ...expandTestFiles(['tests/src/cli/cases/agent-lab.test.ts', 'tests/src/cli/cases/agent-lab-command-surface.test.ts', 'tests/src/cli/cases/agent-lab-rho-workflow-run.test.ts']),
  'tests/src/cli/cases/work-order-execution.test.ts',
  'tests/src/cli/cases/agent-lab-evolution-suite.test.ts',
  'tests/src/cli/cases/agent-executor-cli.test.ts',
  ...expandTestFiles([
    'tests/src/cli/cases/agents-scaffold-progress-first.test.ts', 'tests/src/cli/cases/agents-scaffold.test.ts',
    'tests/src/cli/cases/agents-scaffold-consumption-evidence.test.ts', 'tests/src/cli/cases/agents-scaffold-generation.test.ts',
    'tests/src/cli/cases/agents-scaffold-validation-failures.test.ts',
  ]),
  'tests/src/cli/cases/standard-agent-template-consumption-read-model.test.ts',
  'tests/src/cli/cases/runtime-standard-agent-template-consumption-ledger.test.ts',
  'tests/src/cli/cases/agents-readiness-stage-run-adoption.test.ts',
  ...expandTestFiles([
    'tests/src/cli/cases/agents-conformance.test.ts', 'tests/src/cli/cases/agents-conformance-foundry-agent-os.test.ts',
    'tests/src/cli/cases/agents-conformance-stage-operating-principles.test.ts', 'tests/src/cli/cases/agents-conformance-readiness.test.ts',
    'tests/src/cli/cases/agents-conformance-private-surface.test.ts', 'tests/src/cli/cases/agents-conformance-stage-run-kernel.test.ts',
    'tests/src/cli/cases/agents-conformance-rca-oma-mvp.test.ts', 'tests/src/cli/cases/agents-conformance-state-index-adoption.test.ts',
    'tests/src/cli/cases/agents-conformance-platform-surfaces.test.ts',
  ]),
  'tests/src/cli/cases/golden-path-single-default.test.ts',
  ...expandTestFiles([
    'tests/src/cli/cases/domain-pack-compiler-active-caller-targets.test.ts', 'tests/src/cli/cases/domain-pack-compiler-oma-fixture.test.ts',
    'tests/src/cli/cases/domain-pack-compiler-drift-manifest.test.ts', 'tests/src/cli/cases/domain-pack-compiler-generated-interfaces.test.ts',
    'tests/src/cli/cases/domain-pack-compiler-standard-agent-contract-pack.test.ts', 'tests/src/cli/cases/domain-pack-compiler.test.ts',
    'tests/src/cli/cases/domain-pack-compiler-real-repo.test.ts',
  ]),
  ...expandTestFiles([
    'tests/src/cli/cases/workspace-domain.stages-artifact-locator.test.ts', 'tests/src/cli/cases/workspace-domain.stages-graph.test.ts',
    'tests/src/cli/cases/workspace-domain.stages-replay.test.ts',
  ]),
  'tests/src/cli/cases/workspace-domain.agent-skeleton.test.ts',
  'tests/src/cli/cases/workspace-domain.external-evidence.test.ts',
  ...expandTestFiles([
    'tests/src/cli/cases/runtime-tray-domain-projection-ingestion.test.ts',
    'tests/src/cli/cases/runtime-tray-app-operator-drilldown-visualization-projection.test.ts',
  ]),
  'tests/src/runtime-app-operator-selected-safe-action.test.ts',
  ...expandTestFiles([
    'tests/src/cli/cases/runtime-app-operator-drilldown.test.ts',
    'tests/src/cli/cases/runtime-app-operator-drilldown-visualization-projection.test.ts',
    'tests/src/cli/cases/runtime-app-operator-drilldown-route-support.test.ts',
  ]),
  'tests/src/cli/cases/runtime-app-release-user-path-evidence-ledger.test.ts',
  'tests/src/cli/cases/runtime-app-release-user-path-long-operator.test.ts',
  'tests/src/cli/cases/runtime-codex-app-runtime-evidence-ledger.test.ts',
  'tests/src/cli/cases/runtime-stage-transition-authority.test.ts',
  ...expandTestFiles([
    'tests/src/cli/cases/runtime-stage-run-execution-authorization-ledger.test.ts',
    'tests/src/cli/cases/runtime-owner-evidence-sustained-consumption-ledger.test.ts',
    'tests/src/cli/cases/runtime-developer-mode-closeout-ledger.test.ts',
  ]),
  ...expandTestFiles([
    'tests/src/cli/cases/runtime-app-operator-drilldown-runtime-role.test.ts', 'tests/src/cli/cases/runtime-app-operator-drilldown-lifecycle.test.ts',
    'tests/src/cli/cases/runtime-app-operator-drilldown-actions.test.ts', 'tests/src/cli/cases/runtime-app-operator-drilldown-actions-ops.test.ts',
    'tests/src/cli/cases/runtime-app-operator-drilldown-actions-execute.test.ts',
    'tests/src/cli/cases/runtime-app-operator-drilldown-external-evidence-actions.test.ts',
  ]),
  'tests/src/cli/cases/runtime-app-operator-stage-evidence-closeout.test.ts',
  ...expandTestFiles([
    'tests/src/cli/cases/runtime-app-operator-drilldown-summary.test.ts',
    'tests/src/cli/cases/runtime-app-operator-drilldown-manifest-cache.test.ts',
    'tests/src/cli/cases/runtime-app-operator-drilldown-oma-manual-required.test.ts',
    'tests/src/cli/cases/runtime-app-operator-drilldown-owner-handoff.test.ts',
  ]),
  ...expandTestFiles([
    'tests/src/cli/cases/runtime-tray-stage-attempt-workbench.test.ts',
    'tests/src/cli/cases/runtime-tray-stage-attempt-workbench-cognitive-kernel.test.ts',
    'tests/src/cli/cases/runtime-tray-provider-continuous-proof.test.ts',
  ]),
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
];

const readModelGateStartupMaintenanceHeavyTestFiles = [
  'tests/src/cli/cases/system-seed-manifest.test.ts',
  'tests/src/cli/cases/system-startup-maintenance.test.ts',
];

const readModelGateNonTemporalHeavyTestFiles = readModelGateTestFiles.filter(
  (file) => !readModelGateTemporalHeavyTestFiles.includes(file)
    && !readModelGateStartupMaintenanceHeavyTestFiles.includes(file),
);

const lanes = {
  smoke: [
    nodeTest([
      'tests/src/verification-command-surfaces.test.ts',
      'tests/src/target-architecture-schema-contracts.test.ts',
      'tests/src/evidence-grounded-decision-agent-profile.test.ts',
      'tests/src/agent-profile-spine.test.ts',
      'tests/src/profile-capability-plan.test.ts',
      'tests/src/evidence-grounded-stagecraft-runway.test.ts',
      'tests/src/evidence-grounded-substrate.test.ts',
      'tests/src/evidence-grounded-catalog-eval.test.ts',
      'tests/src/cognitive-computation-kernel-contract.test.ts',
      'tests/src/advisory-knowledge-boundary-contract.test.ts',
      'tests/src/opl-flow-completion-audit-contract.test.ts',
      'tests/src/verification-test-governance.test.ts',
      'tests/src/reuse-first-scan.test.ts',
      'tests/src/source-module-boundary.test.ts',
      'tests/src/source-module-public-imports.test.ts',
      'tests/src/cli-modularization.test.ts',
      'tests/src/runtime-state-paths.test.ts',
      'tests/src/runtime-environment-substrate.test.ts',
      'tests/src/cli/cases/runtime-environment-substrate-command-surface.test.ts',
      'tests/src/opl-session-runtime.test.ts',
    ], { batchSize: 25 }),
  ],
  fast: [
    { kind: 'command', command: 'scripts/repo-hygiene.sh', args: [] },
    nodeTest(fastTestFiles, { batchSize: 20 }),
  ],
  'read-model-gates': [
    nodeTest(readModelGateNonTemporalHeavyTestFiles, {
      batchSize: 20,
      env: { OPL_CLI_TEST_TIMEOUT_MS: '90000' },
    }),
    nodeTest(readModelGateStartupMaintenanceHeavyTestFiles, {
      batchSize: 1,
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
      'tests/src/reuse-first-scan.test.ts',
      'tests/src/cli-modularization.test.ts',
      'tests/src/runtime-state-paths.test.ts',
      'tests/src/current-owner-delta-read-model-cache.test.ts',
      'tests/src/active-path-residue-scan.test.ts',
      'tests/src/stale-compat-retirement-guard.test.ts',
      'tests/src/cli/cases/system-semantic-hygiene.test.ts',
      'tests/src/cli/cases/system-dependency-doctor.test.ts',
      'tests/src/cli/cases/framework-readiness-binding-cases.test.ts',
      'tests/src/cli/cases/framework-readiness.test.ts',
      'tests/src/cli/cases/runtime-manifest-cache-timeout.test.ts',
      'tests/src/cli/cases/framework-readiness-attention-semantics.test.ts',
      'tests/src/cli/cases/framework-readiness-cli-surface.test.ts',
      'tests/src/cli/cases/framework-readiness-oma-managed-install.test.ts',
      'tests/src/cli/cases/framework-readiness-oma-app-live-path.test.ts',
      'tests/src/cli/cases/framework-readiness-oma-production-consumption-ledger.test.ts',
      'tests/src/framework-readiness-attention-actions.test.ts',
      'tests/src/family-runtime-domain-autonomy.test.ts',
      'tests/src/cli/cases/agents-conformance-stage-pack-v2.test.ts',
      'tests/src/cli/cases/agents-conformance-mas-tombstones.test.ts',
      'tests/src/cli/cases/agents-default-callers.test.ts',
      'tests/src/cli/cases/agents-residue-decisions.test.ts',
      'tests/src/cli/cases/domain-pack-compiler-canonical-targets.test.ts',
      'tests/src/family-product-operator-projection.test.ts',
    ], { batchSize: 10 }),
  ],
  regression: [
    nodeTest([
      'tests/src/cli.test.ts',
      'tests/src/cli/cases/package-channel-daily-check.test.ts',
      'tests/src/cli-codex-default-shell.test.ts',
      'tests/src/cli-codex-default-shell-sync-skills.test.ts',
      'tests/src/cli-codex-default-shell-passthrough.test.ts',
      'tests/src/runtime-state-paths.test.ts',
      'tests/src/family-domain-catalog.test.ts',
      'tests/src/family-entry-contracts.test.ts',
      'tests/src/family-executor-adapter-contract.test.ts',
      'tests/src/handoff-bundle.test.ts',
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
  'stage-run-mag-integration': [
    nodeTest(['tests/src/stage-run-mag-integration.test.ts']),
  ],
  artifact: [
    { kind: 'npm', args: ['run', 'build'] },
    nodeTest(['tests/built/cli.test.mjs'], { stripTypes: false }),
  ],
  'fresh-install': [
    nodeTest(['tests/src/fresh-install-smoke.test.ts']),
  ],
  full: [
    { kind: 'npm', args: ['run', 'test:fast'] },
    { kind: 'npm', args: ['run', 'test:fresh-install'] },
    { kind: 'npm', args: ['run', 'test:structure'] },
    { kind: 'npm', args: ['run', 'typecheck'] },
    { kind: 'npm', args: ['run', 'lint'] },
    { kind: 'npm', args: ['run', 'test:read-model-gates'] },
    { kind: 'npm', args: ['run', 'test:meta'] },
    { kind: 'npm', args: ['run', 'test:regression'] },
    { kind: 'npm', args: ['run', 'test:integration'] },
    { kind: 'npm', args: ['run', 'test:artifact'] },
    { kind: 'npm', args: ['run', 'test:native'] },
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
  failOnDuplicateLaneEntryFiles(duplicateLaneEntryFiles());

  const trackedTests = trackedTestFiles();
  const covered = coveredTestFiles();
  const uncovered = trackedTests.filter((file) => !covered.has(file));
  failOnUncoveredTests(uncovered);

  process.stdout.write(`All ${trackedTests.length} active test files are assigned to a test lane.\n`);
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

function duplicateLaneEntryFiles() {
  const duplicates = [];
  for (const [laneName, steps] of Object.entries(lanes)) {
    const occurrences = new Map();
    laneNodeTestFiles(steps).forEach((file, index) => {
      const normalized = normalizeRelativePath(file);
      if (!occurrences.has(normalized)) {
        occurrences.set(normalized, []);
      }
      occurrences.get(normalized).push(index + 1);
    });
    for (const [file, indexes] of occurrences.entries()) {
      if (indexes.length > 1) {
        duplicates.push({ laneName, file, indexes });
      }
    }
  }
  return duplicates;
}

function failOnDuplicateLaneEntryFiles(duplicates) {
  if (duplicates.length === 0) {
    return;
  }
  process.stderr.write('Test lane files are listed more than once in the same lane:\n');
  process.stderr.write(
    duplicates
      .map(({ laneName, file, indexes }) => `- ${laneName}: ${file} (${indexes.join(', ')})`)
      .join('\n'),
  );
  process.stderr.write('\n');
  process.exit(1);
}

function coveredTestFiles() {
  const covered = new Set();
  laneEntryFiles().forEach((file) => addImportClosure(file, covered));
  return covered;
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

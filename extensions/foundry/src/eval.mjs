import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  canonicalJsonText,
  contentRefDigest,
  isRecord,
  isSafeSingleSegmentId,
  resolveSafePath,
  sha256Digest,
} from './canonical.mjs';
import { saveRunRecord } from './registry.mjs';
import { validateEvalSuite, validatePackage } from './validate.mjs';

export const FOUNDRY_TERMINAL_STATES = new Set([
  'completed_active',
  'completed_qualified',
  'completed_unqualified',
  'rejected',
  'cancelled',
  'failed',
  'quarantined',
]);

const ALLOWED_TRANSITIONS = {
  accepted: ['designing', 'rejected', 'cancelled', 'failed', 'quarantined'],
  designing: ['materializing', 'cancelled', 'failed', 'quarantined'],
  materializing: ['evaluating', 'cancelled', 'failed', 'quarantined'],
  evaluating: ['qualifying', 'qualified', 'evidence_ready', 'completed_unqualified', 'cancelled', 'failed', 'quarantined'],
  qualifying: ['qualified', 'failed', 'quarantined'],
  evidence_ready: ['diagnosing', 'completed_unqualified', 'cancelled', 'failed', 'quarantined'],
  diagnosing: ['materializing', 'completed_unqualified', 'cancelled', 'failed', 'quarantined'],
  qualified: ['canary', 'awaiting_owner_canary', 'completed_qualified', 'cancelled', 'failed', 'quarantined'],
  awaiting_owner_canary: ['canary', 'rejected', 'cancelled'],
  canary: ['activating', 'awaiting_owner_active', 'evidence_ready', 'completed_unqualified', 'cancelled', 'failed', 'quarantined'],
  awaiting_owner_active: ['activating', 'rejected', 'cancelled'],
  activating: ['completed_active', 'failed', 'quarantined'],
  completed_active: [],
  completed_qualified: [],
  completed_unqualified: [],
  rejected: [],
  cancelled: [],
  failed: [],
  quarantined: [],
};

const RISK_ORDER = { low: 0, medium: 1, high: 2 };

export function maximumRiskTier(...tiers) {
  return tiers.reduce((highest, tier) => (RISK_ORDER[tier] > RISK_ORDER[highest] ? tier : highest), 'low');
}

export function ownerGatePolicy(riskTier) {
  return {
    canary_owner_required: riskTier === 'high',
    active_owner_required: riskTier !== 'low',
  };
}

export function buildFoundryEvent({
  runId,
  revision,
  eventType,
  fromState,
  toState,
  occurredAt,
  idempotencyKey,
  previousEventHash,
  payload = {},
}) {
  if (fromState !== null) {
    if (!ALLOWED_TRANSITIONS[fromState]?.includes(toState)) {
      throw new Error(`FoundryRun transition ${fromState} -> ${toState} is not allowed.`);
    }
  } else if (toState !== 'accepted' || revision !== 1) {
    throw new Error('The first FoundryRun event must accept revision 1.');
  }

  const withoutHash = {
    surface_kind: 'opl_foundry_run_event',
    version: 'opl-foundry-run-event.v1',
    event_id: `${runId}:${revision}`,
    run_id: runId,
    revision,
    event_type: eventType,
    from_state: fromState,
    to_state: toState,
    occurred_at: occurredAt,
    idempotency_key: idempotencyKey,
    previous_event_hash: previousEventHash,
    payload,
  };

  return {
    ...withoutHash,
    event_hash: sha256Digest(Buffer.from(canonicalJsonText(withoutHash), 'utf8')),
  };
}

export function verifyFoundryEventChain(events) {
  if (!Array.isArray(events) || events.length === 0) {
    throw new Error('FoundryRun event chain must not be empty.');
  }
  let previous = null;
  const seenKeys = new Set();
  for (const ev of events) {
    if (seenKeys.has(ev.idempotency_key)) {
      throw new Error(`Duplicate idempotency_key '${ev.idempotency_key}'.`);
    }
    seenKeys.add(ev.idempotency_key);
    const { event_hash: actualHash, ...withoutHash } = ev;
    const expectedHash = sha256Digest(Buffer.from(canonicalJsonText(withoutHash), 'utf8'));
    if (actualHash !== expectedHash) {
      throw new Error(`Event hash mismatch at ${ev.event_id}`);
    }
    if (previous === null) {
      if (ev.revision !== 1 || ev.from_state !== null || ev.previous_event_hash !== null || ev.to_state !== 'accepted') {
        throw new Error('Invalid genesis FoundryRun event.');
      }
    } else {
      if (ev.revision !== previous.revision + 1) {
        throw new Error(`Non-monotonic event revision at ${ev.event_id}`);
      }
      if (ev.previous_event_hash !== previous.event_hash) {
        throw new Error(`Broken previous_event_hash link at ${ev.event_id}`);
      }
      if (ev.from_state !== previous.to_state) {
        throw new Error(`State discontinuity at ${ev.event_id}: ${ev.from_state} !== ${previous.to_state}`);
      }
      if (!ALLOWED_TRANSITIONS[ev.from_state]?.includes(ev.to_state)) {
        throw new Error(`Disallowed transition ${ev.from_state} -> ${ev.to_state}`);
      }
    }
    previous = ev;
  }
  return true;
}

export function frozenEvaluationPlanDigest(suite) {
  return contentRefDigest({
    surface_kind: 'opl_foundry_frozen_evaluation_plan',
    version: 'opl-foundry-frozen-evaluation-plan.v1',
    public_cases: suite.public_cases,
    protected_requirements: suite.protected_requirements,
    gates: suite.gates,
    baseline_comparison: suite.baseline_comparison,
    cost_limits: suite.cost_limits ?? null,
    latency_limits: suite.latency_limits ?? null,
  });
}

function defaultSuiteForPackage(manifest) {
  const hasStages = Boolean(manifest.provides?.agent?.stages_ref);
  return {
    version: 'opl-eval-suite.v1',
    public_cases: [
      {
        case_id: 'manifest-conformance',
        kind: 'conformance',
        weight: 1.0,
        description: 'Validate opl.package.v2 manifest and path integrity.',
      },
      ...(hasStages
        ? [
            {
              case_id: 'stage-graph-declared',
              kind: 'stages_check',
              weight: 1.0,
              description: 'Verify stages_ref declares valid execution stages.',
            },
          ]
        : []),
    ],
    protected_requirements: [
      { category: 'safety_boundaries', minimum_case_count: 1 },
    ],
    gates: [
      { gate_id: 'min-score', metric: 'score', operator: 'gte', threshold: 0.8, required: true },
      { gate_id: 'protected-pass', metric: 'protected_pass_rate', operator: 'gte', threshold: 1.0, required: true },
    ],
    baseline_comparison: { required: false, regression_tolerance: 0.05 },
    cost_limits: null,
    latency_limits: null,
  };
}

function gatePassed(gate, metrics) {
  const value = metrics[gate.metric];
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  if (gate.operator === 'gte') return value >= gate.threshold;
  if (gate.operator === 'lte') return value <= gate.threshold;
  return value === gate.threshold;
}

function changed(left, right) {
  return canonicalJsonText(left) !== canonicalJsonText(right);
}

export function assertEvaluationPolicyNonWeakening(previousSuite, nextSuite) {
  const violations = [];
  for (const priorCase of previousSuite.public_cases ?? []) {
    const candidate = (nextSuite.public_cases ?? []).find((c) => c.case_id === priorCase.case_id);
    if (!candidate) violations.push(`public_case_removed:${priorCase.case_id}`);
    else if (changed(priorCase, candidate)) violations.push(`public_case_changed:${priorCase.case_id}`);
  }
  for (const priorReq of previousSuite.protected_requirements ?? []) {
    const candidate = (nextSuite.protected_requirements ?? []).find((r) => r.category === priorReq.category);
    if (!candidate) violations.push(`protected_requirement_removed:${priorReq.category}`);
    else if (candidate.minimum_case_count < priorReq.minimum_case_count) {
      violations.push(`protected_requirement_weakened:${priorReq.category}`);
    }
  }
  for (const priorGate of previousSuite.gates ?? []) {
    const candidate = (nextSuite.gates ?? []).find((g) => g.gate_id === priorGate.gate_id);
    if (!candidate) {
      violations.push(`gate_removed:${priorGate.gate_id}`);
      continue;
    }
    if (
      candidate.metric !== priorGate.metric
      || candidate.operator !== priorGate.operator
      || Boolean(candidate.required) !== Boolean(priorGate.required)
    ) {
      violations.push(`gate_semantics_changed:${priorGate.gate_id}`);
      continue;
    }
    const weakened = priorGate.operator === 'gte'
      ? candidate.threshold < priorGate.threshold
      : priorGate.operator === 'lte'
        ? candidate.threshold > priorGate.threshold
        : candidate.threshold !== priorGate.threshold;
    if (weakened) violations.push(`gate_threshold_weakened:${priorGate.gate_id}`);
  }
  if (previousSuite.baseline_comparison?.required && !nextSuite.baseline_comparison?.required) {
    violations.push('baseline_comparison_disabled');
  }
  if (
    typeof nextSuite.baseline_comparison?.regression_tolerance === 'number'
    && typeof previousSuite.baseline_comparison?.regression_tolerance === 'number'
    && nextSuite.baseline_comparison.regression_tolerance > previousSuite.baseline_comparison.regression_tolerance
  ) {
    violations.push('baseline_regression_tolerance_weakened');
  }
  return violations;
}

function readPackageModel(dir) {
  const absDir = path.resolve(dir);
  const manifest = JSON.parse(fs.readFileSync(path.join(absDir, 'opl-package.json'), 'utf8'));
  const suitePath = path.join(absDir, 'eval', 'suite.json');
  const suite = fs.existsSync(suitePath) ? JSON.parse(fs.readFileSync(suitePath, 'utf8')) : defaultSuiteForPackage(manifest);
  let stages = null;
  if (manifest.provides?.agent?.stages_ref) {
    const stagesFile = resolveSafePath(absDir, manifest.provides.agent.stages_ref, { allowSymlinks: false });
    stages = JSON.parse(fs.readFileSync(stagesFile, 'utf8'));
  }
  return { absDir, manifest, suite, stages };
}

export function recomputeBlueprintRisk(previousModel, nextModel) {
  const reasons = [];
  let computed = 'low';
  const raise = (tier, reason) => {
    computed = maximumRiskTier(computed, tier);
    reasons.push(reason);
  };

  if (!previousModel) {
    raise('high', 'new_package_activation');
  } else {
    if (changed(previousModel.stages, nextModel.stages)) raise('high', 'stage_topology_or_io_changed');
    if (changed(previousModel.manifest.permissions, nextModel.manifest.permissions)) raise('high', 'permissions_policy_changed');
    if (changed(previousModel.manifest.provides?.executors, nextModel.manifest.provides?.executors)) raise('high', 'executor_binding_changed');
    if (changed(previousModel.manifest.provides?.mcp_servers, nextModel.manifest.provides?.mcp_servers)) raise('high', 'mcp_server_binding_changed');
    if (changed(previousModel.manifest.provides?.connection_providers, nextModel.manifest.provides?.connection_providers)) raise('high', 'connection_provider_changed');
    if (changed(previousModel.manifest.provides?.skills, nextModel.manifest.provides?.skills)) raise('medium', 'skill_binding_changed');
    if (changed(previousModel.manifest.ui, nextModel.manifest.ui)) raise('medium', 'ui_surface_changed');
    if (changed(previousModel.manifest.identity?.default_prompts, nextModel.manifest.identity?.default_prompts)) {
      reasons.push('prompt_content_changed');
    }

    const policyViolations = assertEvaluationPolicyNonWeakening(previousModel.suite, nextModel.suite);
    if (policyViolations.length > 0) {
      raise('high', 'evaluation_policy_weakened');
    }
    if (changed(previousModel.suite.gates, nextModel.suite.gates)) {
      raise('high', 'evaluation_gate_changed');
    }
  }

  return {
    risk_tier: computed,
    reasons: [...new Set(reasons)],
  };
}

export function evaluatePackage(options = {}) {
  const dir = typeof options.dir === 'string' ? options.dir.trim() : '';
  const validation = validatePackage(dir);
  if (!validation.ok) {
    return {
      ok: false,
      exit_code: 2,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Target package failed conformance validation before evaluation.',
        errors: validation.errors,
      },
    };
  }

  const absDir = validation.dir;
  const manifest = JSON.parse(fs.readFileSync(path.join(absDir, 'opl-package.json'), 'utf8'));
  const explicitSuite = typeof options.suite === 'string' && options.suite.trim() ? path.resolve(options.suite.trim()) : null;
  const defaultSuiteFile = path.join(absDir, 'eval', 'suite.json');
  const suitePath = explicitSuite || (fs.existsSync(defaultSuiteFile) ? defaultSuiteFile : null);

  let suite;
  if (suitePath) {
    if (!fs.existsSync(suitePath)) {
      return { ok: false, exit_code: 2, error: { code: 'SUITE_NOT_FOUND', message: `Suite file not found: ${suitePath}` } };
    }
    try {
      suite = JSON.parse(fs.readFileSync(suitePath, 'utf8'));
    } catch (err) {
      return { ok: false, exit_code: 2, error: { code: 'INVALID_EVAL_SUITE', message: err instanceof Error ? err.message : String(err) } };
    }
    const suiteErrors = validateEvalSuite(suite, suitePath);
    if (suiteErrors.length > 0) {
      return { ok: false, exit_code: 2, error: { code: 'INVALID_EVAL_SUITE', message: 'Evaluation suite is invalid.', errors: suiteErrors } };
    }
  } else {
    suite = defaultSuiteForPackage(manifest);
  }

  const startedAt = Date.now();
  const planDigest = frozenEvaluationPlanDigest(suite);
  const candidateDigest = contentRefDigest({ manifest, suite });
  const targetAgentId = typeof options.targetAgentId === 'string' && options.targetAgentId.trim()
    ? options.targetAgentId.trim()
    : manifest.identity.id;
  const targetDomainId = typeof options.targetDomainId === 'string' && options.targetDomainId.trim()
    ? options.targetDomainId.trim()
    : manifest.identity.id;
  const runId = typeof options.runId === 'string' && options.runId.trim()
    ? options.runId.trim()
    : `foundry-run-${crypto.randomUUID()}`;

  for (const [label, val] of [
    ['target_agent_id', targetAgentId],
    ['target_domain_id', targetDomainId],
    ['run_id', runId],
  ]) {
    if (!isSafeSingleSegmentId(val)) {
      return {
        ok: false,
        exit_code: 2,
        error: {
          code: 'INVALID_ID',
          message: `Invalid ${label} '${val}': must be a single-segment safe identifier.`,
        },
      };
    }
  }

  const publicResults = suite.public_cases.map((testCase) => {
    let passed = true;
    let score = 1.0;
    let detail = 'ok';
    let unsafePath = false;
    if (testCase.kind === 'stages_check') {
      const stagesRef = manifest.provides?.agent?.stages_ref;
      if (stagesRef) {
        try {
          const safeStages = resolveSafePath(absDir, stagesRef, { allowSymlinks: false });
          passed = fs.existsSync(safeStages);
          detail = passed ? 'stages_ref verified' : 'missing stages_ref';
        } catch (err) {
          passed = false;
          unsafePath = true;
          detail = `unsafe or missing stages_ref: ${err instanceof Error ? err.message : String(err)}`;
        }
      } else {
        passed = false;
        detail = 'missing stages_ref';
      }
      score = passed ? 1.0 : 0.0;
    } else if (testCase.kind === 'file_exists' && typeof testCase.path === 'string') {
      try {
        const safeFile = resolveSafePath(absDir, testCase.path, { allowSymlinks: false });
        passed = fs.existsSync(safeFile);
        detail = passed ? `found ${testCase.path}` : `missing ${testCase.path}`;
      } catch (err) {
        passed = false;
        unsafePath = true;
        detail = `unsafe or missing path '${testCase.path}': ${err instanceof Error ? err.message : String(err)}`;
      }
      score = passed ? 1.0 : 0.0;
    } else if (testCase.expected_pass === false) {
      passed = false;
      score = 0.0;
      detail = 'case marked failing';
    }
    return {
      case_id: testCase.case_id,
      weight: testCase.weight,
      passed,
      score,
      detail,
      ...(unsafePath ? { unsafe_path: true } : {}),
    };
  });

  const totalWeight = publicResults.reduce((acc, r) => acc + r.weight, 0);
  const weightedScore = totalWeight > 0
    ? publicResults.reduce((acc, r) => acc + r.weight * r.score, 0) / totalWeight
    : 0;

  const unsafePathCases = publicResults.filter((r) => r.unsafe_path === true).length;
  const protectedAggregates = suite.protected_requirements.map((req) => {
    const count = Math.max(1, Number(req.minimum_case_count || 1));
    const failed = req.category === 'safety_boundaries' ? Math.min(count, unsafePathCases) : 0;
    return {
      category: req.category,
      executed_count: count,
      passed_count: count - failed,
      failed_count: failed,
    };
  });

  const protectedTotal = protectedAggregates.reduce((a, p) => a + p.executed_count, 0);
  const protectedPassed = protectedAggregates.reduce((a, p) => a + p.passed_count, 0);
  const protectedPassRate = protectedTotal > 0 ? protectedPassed / protectedTotal : 1.0;

  const metrics = {
    score: Number(weightedScore.toFixed(6)),
    protected_pass_rate: Number(protectedPassRate.toFixed(6)),
  };

  const gateResults = suite.gates.map((gate) => ({
    gate_id: gate.gate_id,
    metric: gate.metric,
    operator: gate.operator,
    threshold: gate.threshold,
    required: gate.required !== false,
    actual: metrics[gate.metric],
    passed: gatePassed(gate, metrics),
  }));

  const elapsedMs = Math.max(1, Date.now() - startedAt);
  const tokensUsed = 0; // Deterministic static evaluation uses zero LLM tokens.
  const maxTokens = suite.cost_limits?.max_tokens;
  const costWithinLimit = maxTokens === undefined
    ? true
    : (typeof maxTokens === 'number' && Number.isFinite(maxTokens) && maxTokens >= 0 && tokensUsed <= maxTokens);
  const resourceChecks = {
    tokens_used: tokensUsed,
    cost_within_limit: costWithinLimit,
    latency_within_limit: suite.latency_limits?.max_duration_ms === undefined
      ? true
      : elapsedMs <= suite.latency_limits.max_duration_ms,
    duration_ms: elapsedMs,
  };

  const requiredGatesPassed = gateResults.every((g) => !g.required || g.passed);
  const protectedPassedAll = protectedAggregates.every((p) => p.failed_count === 0);
  const qualified = requiredGatesPassed
    && protectedPassedAll
    && resourceChecks.cost_within_limit
    && resourceChecks.latency_within_limit;

  const risk = recomputeBlueprintRisk(null, { absDir, manifest, suite, stages: null });
  const nowIso = () => new Date().toISOString();

  const events = [];
  const pushEvent = (eventType, toState, payload) => {
    const prev = events.length > 0 ? events[events.length - 1] : null;
    events.push(buildFoundryEvent({
      runId,
      revision: events.length + 1,
      eventType,
      fromState: prev ? prev.to_state : null,
      toState,
      occurredAt: nowIso(),
      idempotencyKey: `${runId}:${events.length + 1}:${eventType}`,
      previousEventHash: prev ? prev.event_hash : null,
      payload,
    }));
  };

  pushEvent('foundry_run_accepted', 'accepted', {
    target_agent_id: targetAgentId,
    target_domain_id: targetDomainId,
    request_digest: candidateDigest,
    activation_revision_at_start: 0,
    generation: 0,
  });
  pushEvent('design_started', 'designing', { package_id: manifest.identity.id });
  pushEvent('blueprint_admitted', 'materializing', { candidate_digest: candidateDigest });
  pushEvent('candidate_materialized', 'evaluating', { frozen_test_plan_digest: planDigest });
  if (qualified) {
    pushEvent('qualification_registration_started', 'qualifying', { metrics });
    pushEvent('candidate_qualified', 'qualified', { gate_results: gateResults });
  } else {
    pushEvent('evaluation_failed', 'evidence_ready', { gate_results: gateResults });
    pushEvent('evolution_budget_exhausted', 'completed_unqualified', { metrics });
  }

  verifyFoundryEventChain(events);

  const evidenceBundle = {
    surface_kind: 'opl_foundry_evidence_bundle',
    version: 'opl-foundry-evidence-bundle.v1',
    run_id: runId,
    package_id: manifest.identity.id,
    package_version: manifest.identity.version,
    candidate_digest: candidateDigest,
    frozen_test_plan_digest: planDigest,
    metrics,
    public_results: publicResults,
    protected_aggregates: protectedAggregates,
    gate_results: gateResults,
    resource_checks: resourceChecks,
    qualified,
    risk_tier: risk.risk_tier,
    risk_reasons: risk.risk_reasons,
    owner_gate_policy: ownerGatePolicy(risk.risk_tier),
    recorded_at: nowIso(),
  };

  const evidenceDigest = contentRefDigest(evidenceBundle);
  const runRecord = {
    surface_kind: 'opl_foundry_run',
    version: 'opl-foundry-run.v1',
    run_id: runId,
    target_agent_id: targetAgentId,
    target_domain_id: targetDomainId,
    package_id: manifest.identity.id,
    package_version: manifest.identity.version,
    package_dir: absDir,
    state: events[events.length - 1].to_state,
    revision: events[events.length - 1].revision,
    candidate_digest: candidateDigest,
    frozen_test_plan_digest: planDigest,
    evidence_digest: evidenceDigest,
    evidence_bundle: evidenceBundle,
    risk_tier: risk.risk_tier,
    owner_gate_policy: ownerGatePolicy(risk.risk_tier),
    qualified,
    last_event_hash: events[events.length - 1].event_hash,
    events,
    updated_at: nowIso(),
  };

  const savedPath = saveRunRecord(runRecord, options.stateDir);

  return {
    ok: qualified,
    exit_code: qualified ? 0 : 1,
    run_id: runId,
    state: runRecord.state,
    qualified,
    target_agent_id: targetAgentId,
    package_id: manifest.identity.id,
    package_version: manifest.identity.version,
    candidate_digest: candidateDigest,
    frozen_test_plan_digest: planDigest,
    evidence_digest: evidenceDigest,
    metrics,
    gate_results: gateResults,
    risk_tier: risk.risk_tier,
    owner_gate_policy: runRecord.owner_gate_policy,
    run_record_path: savedPath,
  };
}

export function comparePackages(options = {}) {
  const baselineDir = typeof options.baseline === 'string' ? options.baseline.trim() : '';
  const candidateDir = typeof options.candidate === 'string' ? options.candidate.trim() : '';
  if (!baselineDir || !candidateDir) {
    return {
      ok: false,
      exit_code: 2,
      error: { code: 'INVALID_INPUT', message: 'Both --baseline <dir> and --candidate <dir> are required.' },
    };
  }

  const baseVal = validatePackage(baselineDir);
  if (!baseVal.ok) {
    return { ok: false, exit_code: 2, error: { code: 'BASELINE_INVALID', message: 'Baseline package failed validation.', errors: baseVal.errors } };
  }
  const candVal = validatePackage(candidateDir);
  if (!candVal.ok) {
    return { ok: false, exit_code: 2, error: { code: 'CANDIDATE_INVALID', message: 'Candidate package failed validation.', errors: candVal.errors } };
  }

  const baseModel = readPackageModel(baseVal.dir);
  const candModel = readPackageModel(candVal.dir);
  const baseTolerance = Number(baseModel.suite.baseline_comparison?.regression_tolerance ?? 0.05);
  if (!Number.isFinite(baseTolerance) || baseTolerance < 0) {
    return { ok: false, exit_code: 2, error: { code: 'INVALID_EVAL_SUITE', message: 'Baseline regression_tolerance must be a non-negative finite number.' } };
  }

  let tolerance = baseTolerance;
  if (options.regressionTolerance !== undefined) {
    if (typeof options.regressionTolerance === 'boolean' || String(options.regressionTolerance).trim() === '') {
      return { ok: false, exit_code: 2, error: { code: 'INVALID_INPUT', message: 'regression_tolerance must be a non-negative finite number.' } };
    }
    const parsedTol = Number(options.regressionTolerance);
    if (!Number.isFinite(parsedTol) || parsedTol < 0) {
      return { ok: false, exit_code: 2, error: { code: 'INVALID_INPUT', message: 'regression_tolerance must be a non-negative finite number.' } };
    }
    if (parsedTol > baseTolerance) {
      return {
        ok: false,
        exit_code: 2,
        error: {
          code: 'POLICY_WEAKENING',
          message: `Requested regression_tolerance (${parsedTol}) exceeds baseline non-weakening limit (${baseTolerance}).`,
        },
      };
    }
    tolerance = parsedTol;
  }

  const policyViolations = assertEvaluationPolicyNonWeakening(baseModel.suite, candModel.suite);
  const risk = recomputeBlueprintRisk(baseModel, candModel);

  const baseEval = evaluatePackage({ dir: baseVal.dir, stateDir: options.stateDir });
  const candEval = evaluatePackage({ dir: candVal.dir, stateDir: options.stateDir });

  const baseScore = baseEval.metrics?.score ?? 0;
  const candScore = candEval.metrics?.score ?? 0;
  const scoreDelta = Number((candScore - baseScore).toFixed(6));
  const regressed = scoreDelta < -tolerance;
  const ok = policyViolations.length === 0 && !regressed && Boolean(candEval.qualified);

  return {
    ok,
    exit_code: ok ? 0 : 2,
    baseline: {
      package_id: baseVal.package_id,
      version: baseVal.version,
      score: baseScore,
      run_id: baseEval.run_id,
    },
    candidate: {
      package_id: candVal.package_id,
      version: candVal.version,
      score: candScore,
      run_id: candEval.run_id,
    },
    score_delta: scoreDelta,
    regression_tolerance: tolerance,
    regressed,
    policy_violations: policyViolations,
    risk_tier: risk.risk_tier,
    risk_reasons: risk.risk_reasons,
    owner_gate_policy: ownerGatePolicy(risk.risk_tier),
  };
}

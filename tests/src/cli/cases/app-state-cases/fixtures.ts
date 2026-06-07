import { buildManifestCommand, fs, loadFamilyManifestFixtures, path } from '../../helpers.ts';
import { buildCurrentOwnerDeltaReadModel } from '../../../../../src/current-owner-delta-projection.ts';

export function bindMasWorkspaceForAppState(input: {
  stateDir: string;
  workspaceRoot: string;
  profilePath: string;
}) {
  const manifest = structuredClone(loadFamilyManifestFixtures().medautoscience);
  manifest.workspace_locator = {
    ...((manifest.workspace_locator as Record<string, unknown>) ?? {}),
    workspace_root: input.workspaceRoot,
    profile_ref: input.profilePath,
    profile_name: 'dm-cvd-mortality-risk',
  };
  const now = new Date().toISOString();
  fs.mkdirSync(input.stateDir, { recursive: true });
  fs.writeFileSync(
    path.join(input.stateDir, 'workspace-registry.json'),
    `${JSON.stringify({
      version: 'g2',
      bindings: [
        {
          binding_id: 'mas-app-state-activity',
          project_id: 'medautoscience',
          project: 'med-autoscience',
          workspace_path: input.workspaceRoot,
          label: null,
          status: 'active',
          direct_entry: {
            command: null,
            manifest_command: buildManifestCommand(manifest),
            url: null,
            workspace_locator: {
              surface_kind: 'med_autoscience_workspace_profile',
              workspace_root: input.workspaceRoot,
              profile_ref: input.profilePath,
              input_path: null,
            },
          },
          created_at: now,
          updated_at: now,
          archived_at: null,
        },
      ],
    }, null, 2)}\n`,
    'utf8',
  );
}

export function writeMasProgressPortalFixture(workspaceRoot: string, profilePath: string) {
  const portalPayloadPath = path.join(workspaceRoot, 'artifacts', 'runtime', 'progress_portal', 'latest.json');
  fs.mkdirSync(path.dirname(portalPayloadPath), { recursive: true });
  fs.mkdirSync(path.dirname(profilePath), { recursive: true });
  fs.writeFileSync(profilePath, 'workspace_name = "dm-cvd-mortality-risk"\n', 'utf8');
  fs.writeFileSync(portalPayloadPath, `${JSON.stringify({
    schema_version: 1,
    surface_kind: 'mas_progress_portal',
    workspace: {
      profile_name: 'dm-cvd-mortality-risk',
      workspace_root: workspaceRoot,
      studies: [
        {
          study_id: '002-dm-china-us-mortality-attribution',
          state_label: '自动运行中',
          state_summary: '自动运行中；系统有实际 writer/run 正在推进。',
          current_stage: 'live',
          active_run_id: 'mas-run-002',
          runtime_health_status: 'recovering',
          progress_freshness_summary: '最近 12 小时内仍有明确研究推进记录。',
          operator_focus: '优先完成有限补充分析',
          next_system_action: '观察自动运行推进。',
          worker_running: true,
          actual_write_active: true,
        },
        {
          study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
          state_label: '质量修复/复审中',
          state_summary: '质量修复/复审中；质量、artifact 或 runtime 有明确修复 owner。',
          current_stage: 'queued',
          active_run_id: null,
          runtime_health_status: 'escalated',
          progress_freshness_summary: '最近 12 小时内仍有明确研究推进记录。',
          operator_focus: '优先收口同线质量硬阻塞',
          next_system_action: '提交 MAS owner receipt 或 typed blocker。',
          worker_running: null,
        },
        {
          study_id: '004-dpcc-longitudinal-care-inertia-intensification-gap',
          state_label: '用户暂停/手动停驻',
          state_summary: '用户暂停/手动停驻；当前没有实际写入，需显式恢复或给出新方案。',
          current_stage: 'parked',
          active_run_id: null,
          runtime_health_status: 'parked',
          progress_freshness_summary: '当前阶段以人工判断或收尾为主。',
          operator_focus: '先让发表门控具体化 blocker',
          next_system_action: '等待用户显式恢复或给出新方案。',
          worker_running: null,
        },
      ],
    },
    opl_handoff: {
      handoff_kind: 'mas_progress_portal_opl_family_projection',
      owner: 'mas',
      role: 'family_level_projection',
      authority: 'display_artifact_only',
      opl_role: 'family_level_projection_consumer_only',
    },
  }, null, 2)}\n`, 'utf8');
}

export function writeCurrentOwnerDeltaProjectionCacheFixture(
  stateDir: string,
  options: {
    nextSafeAction?: Record<string, unknown>;
    sourceSurface?: string;
    sourceCommand?: string;
  } = {},
) {
  const readModel = buildCurrentOwnerDeltaReadModel({
    ownerDeltaFirst: {
      surface_kind: 'opl_owner_delta_first_projection',
      next_owner: 'medautoscience',
      next_required_delta: 'domain_owner_receipt_quality_gate_or_typed_blocker_required',
      required_return_shapes: [
        'domain_owner_receipt_ref',
        'quality_gate_receipt_ref',
        'typed_blocker_ref',
      ],
      domain_id: 'medautoscience',
      primary_item: {
        domain_id: 'medautoscience',
        stage_id: 'domain_owner/default-executor-dispatch',
      },
      selected_safe_action: {
        domain_id: 'medautoscience',
        stage_id: 'domain_owner/default-executor-dispatch',
      },
    },
    countSummary: {
      openSafeActionCount: 0,
      payloadRequiredCount: 0,
      payloadFreeCount: 0,
      blockedRefsOnlyCount: 1,
      evidenceEnvelopeOpenCount: 0,
      evidenceEnvelopeBlockedCount: 1,
      domainDispatchWorkorderCount: 0,
      stageReplayMissingReceiptWorkorderCount: 0,
    },
    nextSafeAction: options.nextSafeAction,
    fullDetailRefs: {
      owner_delta_first_ref:
        '/runtime_tray_snapshot/app_operator_drilldown/attention_first_payload/owner_delta_first',
      evidence_worklist_ref: '/family_runtime_evidence_worklist',
      app_operator_drilldown_ref:
        'opl runtime app-operator-drilldown --detail full --json',
    },
  });
  const sourceSurface = options.sourceSurface ?? 'family_runtime_evidence_worklist';
  const sourceCommand = options.sourceCommand
    ?? 'opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --json';
  fs.mkdirSync(stateDir, { recursive: true });
  const cacheFile = sourceSurface === 'framework_readiness'
    ? path.join(stateDir, 'current-owner-delta-read-model-cache.json')
    : path.join(stateDir, `current-owner-delta-read-model-cache.${sourceSurface}.json`);
  fs.writeFileSync(
    cacheFile,
    `${JSON.stringify({
      version: 'g1',
      surface_kind: 'opl_current_owner_delta_read_model_projection_cache',
      cache_policy:
        'non_authoritative_app_fast_projection_cache_from_owner_delta_first_sources',
      source_surface: sourceSurface,
      source_command: sourceCommand,
      cached_at: new Date().toISOString(),
      current_owner_delta_read_model: readModel,
      authority_boundary: {
        cache_is_domain_truth: false,
        cache_can_create_owner_receipt: false,
        cache_can_create_typed_blocker: false,
        cache_can_close_domain_ready: false,
        cache_can_claim_app_release_ready: false,
        cache_can_claim_production_ready: false,
      },
    }, null, 2)}\n`,
    'utf8',
  );
}

export function writeStageRunAuthorizationLedgerFixture(input: {
  stateDir: string;
  receipt: Record<string, unknown>;
  receipts?: Array<Record<string, unknown>>;
}) {
  fs.mkdirSync(input.stateDir, { recursive: true });
  fs.writeFileSync(
    path.join(input.stateDir, 'stage-run-execution-authorization-ledger.json'),
    `${JSON.stringify({
      surface_kind: 'opl_stage_run_execution_authorization_ledger',
      version: 'stage-run-execution-authorization-ledger.v1',
      receipts: input.receipts ?? [input.receipt],
    }, null, 2)}\n`,
    'utf8',
  );
}

export function appStateStageRunAuthorizationReceipt(overrides: Record<string, unknown> = {}) {
  const stageRunId = 'app-stage-run:medautoscience:domain-owner-default-executor-dispatch';
  const decisionRef = 'opl://stage-attempts/sat_dm003/execution-authorizations/lease_dm003/wf_dm003';
  const stageManifestRef = 'opl://stage-manifests/domain_owner%2Fdefault-executor-dispatch';
  const currentPointerRef = `opl://stage-runs/${encodeURIComponent(stageRunId)}/current`;
  return {
    surface_kind: 'opl_stage_run_execution_authorization_receipt',
    version: 'stage-run-execution-authorization-ledger.v1',
    receipt_ref: `opl://stage-run-execution-authorization/${encodeURIComponent(stageRunId)}/${encodeURIComponent(decisionRef)}`,
    receipt_status: 'recorded',
    recorded_at: '2026-06-06T00:00:00.000Z',
    stage_run_id: stageRunId,
    domain_id: 'medautoscience',
    stage_id: 'domain_owner/default-executor-dispatch',
    generation: 0,
    phase: 'launch',
    selected_executor: 'codex_cli',
    provider_attempt_ref: 'temporal://attempt/sat_dm003',
    stage_attempt_id: 'sat_dm003',
    attempt_lease_ref: 'opl://stage-attempts/sat_dm003/leases/lease_dm003/active',
    attempt_lease_status: 'active',
    execution_authorization_decision_ref: decisionRef,
    workspace_scope_ref: 'workspace:/fixture/dm-cvd',
    artifact_scope_ref: 'stage-packet:studies/003-dpcc-primary-care-phenotype-treatment-gap/dispatch.json',
    source_fingerprint: 'mas_default_executor_source_dm003',
    idempotency_key: 'idem_dm003',
    current_pointer_ref: currentPointerRef,
    stage_manifest_ref: stageManifestRef,
    owner_answer_ref: null,
    owner_answer_kind: null,
    closeout_receipt_ref: null,
    owner_answer_stage_run_id: null,
    owner_answer_generation: null,
    owner_answer_manifest_ref: null,
    owner_answer_current_pointer_ref: null,
    owner_answer_source_fingerprint: null,
    owner_answer_idempotency_key: null,
    closeout_refs: [],
    execution_authorization_report: {
      surface_kind: 'opl_stage_run_execution_authorization_report',
      version: 'stage-run-execution-authorization.v1',
      phase: 'launch',
      status: 'authorized',
      execution_authorized: true,
      launch_blockers: [],
      closeout_binding_blockers: [],
      closeout_binding: {
        owner_answer_ref: null,
        owner_answer_kind: null,
        closeout_receipt_ref: null,
        bound_to_stage_run: false,
        bound_to_stage_manifest: false,
        bound_to_current_pointer: false,
        bound_to_source_fingerprint: false,
        bound_to_idempotency_key: false,
      },
      opl_runtime_blocker: null,
      authority_boundary: {
        opl_can_write_domain_truth: false,
        opl_can_create_owner_receipt: false,
        opl_can_create_typed_blocker: false,
      },
    },
    authority_boundary: {
      refs_only: true,
      owner: 'one-person-lab',
      can_write_domain_truth: false,
      can_read_memory_body: false,
      can_read_artifact_body: false,
      can_mutate_artifact_body: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      can_authorize_quality_or_export: false,
      can_close_owner_chain: false,
      can_close_domain_ready: false,
      can_claim_domain_ready: false,
      can_claim_production_ready: false,
      provider_completion_counts_as_domain_ready: false,
      authorization_receipt_is_domain_owner_answer: false,
    },
    ...overrides,
  };
}

export function appStateStageRunCloseoutAuthorizationReceipt(overrides: Record<string, unknown> = {}) {
  const stageRunId = 'app-stage-run:medautoscience:domain-owner-default-executor-dispatch';
  const stageManifestRef = 'opl://stage-manifests/domain_owner%2Fdefault-executor-dispatch';
  const currentPointerRef = `opl://stage-runs/${encodeURIComponent(stageRunId)}/current`;
  const decisionRef = 'opl://stage-attempts/sat_dm003_closeout/execution-authorizations/lease_dm003_closeout/wf_dm003_closeout';
  const ownerAnswerRef =
    'artifacts/stage_outputs/08-publication_package_handoff/receipts/typed_blocker.json';
  return appStateStageRunAuthorizationReceipt({
    receipt_ref:
      `opl://stage-run-execution-authorization/${encodeURIComponent(stageRunId)}/${encodeURIComponent(decisionRef)}`,
    phase: 'closeout',
    provider_attempt_ref: 'temporal://attempt/sat_dm003_closeout',
    stage_attempt_id: 'sat_dm003_closeout',
    attempt_lease_ref: 'opl://stage-attempts/sat_dm003_closeout/leases/lease_dm003_closeout/active',
    execution_authorization_decision_ref: decisionRef,
    source_fingerprint: 'mas_default_executor_source_dm003_closeout',
    idempotency_key: 'idem_dm003_closeout',
    current_pointer_ref: currentPointerRef,
    stage_manifest_ref: stageManifestRef,
    owner_answer_ref: ownerAnswerRef,
    owner_answer_kind: 'typed_blocker',
    closeout_receipt_ref: ownerAnswerRef,
    owner_answer_stage_run_id: stageRunId,
    owner_answer_generation: 0,
    owner_answer_manifest_ref: stageManifestRef,
    owner_answer_current_pointer_ref: currentPointerRef,
    owner_answer_source_fingerprint: 'mas_default_executor_source_dm003_closeout',
    owner_answer_idempotency_key: 'idem_dm003_closeout',
    closeout_refs: [ownerAnswerRef],
    execution_authorization_report: {
      surface_kind: 'opl_stage_run_execution_authorization_report',
      version: 'stage-run-execution-authorization.v1',
      phase: 'closeout',
      status: 'authorized',
      execution_authorized: true,
      launch_blockers: [],
      closeout_binding_blockers: [],
      closeout_binding: {
        owner_answer_ref: ownerAnswerRef,
        owner_answer_kind: 'typed_blocker',
        closeout_receipt_ref: ownerAnswerRef,
        bound_to_stage_run: true,
        bound_to_stage_manifest: true,
        bound_to_current_pointer: true,
        bound_to_source_fingerprint: true,
        bound_to_idempotency_key: true,
      },
      opl_runtime_blocker: null,
      authority_boundary: {
        opl_can_write_domain_truth: false,
        opl_can_create_owner_receipt: false,
        opl_can_create_typed_blocker: false,
      },
    },
    ...overrides,
  });
}

export function writeMasPublicationHandoffOwnerAnswerProjectionFixture(input: {
  workspaceRoot: string;
  studyId: string;
  receipt: Record<string, unknown>;
}) {
  const stageRoot = path.join(
    input.workspaceRoot,
    'studies',
    input.studyId,
    'artifacts',
    'stage_outputs',
    '08-publication_package_handoff',
  );
  const projectionPath = path.join(stageRoot, 'projection', 'current_owner_delta.json');
  fs.mkdirSync(path.dirname(projectionPath), { recursive: true });
  const stageRunId = `stage-run::${input.studyId}::08-publication_package_handoff`;
  const stageManifestRef = 'artifacts/stage_outputs/08-publication_package_handoff/stage_manifest.json';
  const currentPointerRef = 'artifacts/stage_outputs/08-publication_package_handoff/current.json';
  fs.writeFileSync(
    projectionPath,
    `${JSON.stringify({
      action: 'complete_medical_paper_readiness_surface',
      closeout_binding: {
        surface_kind: 'publication_handoff_closeout_binding',
        trusted_opl_execution_authorization: true,
        provider_attempt_ref: input.receipt.provider_attempt_ref,
        attempt_lease_ref: input.receipt.attempt_lease_ref,
        attempt_lease_status: input.receipt.attempt_lease_status,
        execution_authorization_decision_ref: input.receipt.execution_authorization_decision_ref,
        source_fingerprint: input.receipt.source_fingerprint,
        idempotency_key: input.receipt.idempotency_key,
        stage_run_id: stageRunId,
        stage_run_ref: stageRunId,
        generation: 0,
        stage_manifest_ref: stageManifestRef,
        current_pointer_ref: currentPointerRef,
        body_included: false,
        bound_to_stage_run: true,
        bound_to_stage_manifest: true,
        bound_to_current_pointer: true,
        bound_to_source_fingerprint: true,
      },
      current_pointer_ref: currentPointerRef,
      delta_id: input.receipt.idempotency_key,
      hard_gate: {
        state: 'domain_owner_answer_recorded',
        owner_answer_kind: 'typed_blocker',
        owner_answer_ref: 'artifacts/stage_outputs/08-publication_package_handoff/receipts/typed_blocker.json',
        owner_answer_stage_run_id: stageRunId,
        owner_answer_generation: 0,
        owner_answer_manifest_ref: stageManifestRef,
        owner_answer_current_pointer_ref: currentPointerRef,
        owner_answer_source_fingerprint: input.receipt.source_fingerprint,
        owner_answer_idempotency_key: input.receipt.idempotency_key,
        stage_manifest_ref: stageManifestRef,
        current_pointer_ref: currentPointerRef,
      },
      latest_owner_answer_kind: 'typed_blocker',
      latest_owner_answer_ref: 'artifacts/stage_outputs/08-publication_package_handoff/receipts/typed_blocker.json',
      latest_typed_blocker_ref: 'artifacts/stage_outputs/08-publication_package_handoff/receipts/typed_blocker.json',
      owner: 'MedAutoScience',
      reason: 'medical_paper_readiness_not_ready',
      source_fingerprint: input.receipt.source_fingerprint,
      stage_manifest_ref: stageManifestRef,
      stage_run_id: stageRunId,
    }, null, 2)}\n`,
    'utf8',
  );
}

export function collectObjectKeys(value: unknown, keys = new Set<string>()) {
  if (!value || typeof value !== 'object') {
    return keys;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectObjectKeys(entry, keys);
    }
    return keys;
  }
  for (const [key, nested] of Object.entries(value)) {
    keys.add(key);
    collectObjectKeys(nested, keys);
  }
  return keys;
}

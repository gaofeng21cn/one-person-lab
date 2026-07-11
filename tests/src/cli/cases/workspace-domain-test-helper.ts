import { STANDARD_PROGRESS_DELTA_POLICY, STANDARD_TYPED_BLOCKER_LINEAGE_POLICY } from '../../../../src/modules/foundry-lab/standard-domain-agent-scaffold-constants.ts';
import {
  buildManifestCommand,
  fs,
  os,
  path,
  repoRoot,
  runCli,
} from '../helpers.ts';
import {
  buildReadyAgentRepo,
  retargetReadyRepo,
  writeJson,
} from './agents-conformance-fixtures.ts';

export type JsonRecord = Record<string, unknown>;

export function createWorkspaceFixture(input: {
  agent: 'mag' | 'mas' | 'rca';
  workspaceId: string;
  projectId: string;
}) {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-fixture-state-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-fixture-root-'));
  const output = runCli([
    'workspace',
    'init',
    '--agent',
    input.agent,
    '--workspace-root',
    workspaceRoot,
    '--workspace-id',
    input.workspaceId,
    '--project-id',
    input.projectId,
  ], { OPL_STATE_DIR: stateRoot });

  return {
    output,
    stateRoot,
    workspaceRoot,
    workspacePath: path.join(workspaceRoot, input.workspaceId),
    cleanup() {
      fs.rmSync(stateRoot, { recursive: true, force: true });
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    },
  };
}

export function attachManifestSurface(payload: JsonRecord, field: string, value: JsonRecord) {
  if (payload.product_entry_manifest && typeof payload.product_entry_manifest === 'object') {
    return {
      ...payload,
      product_entry_manifest: {
        ...(payload.product_entry_manifest as JsonRecord),
        [field]: value,
      },
    };
  }
  return { ...payload, [field]: value };
}

export function bindManifest(
  project: string,
  manifest: JsonRecord,
  env: Record<string, string>,
  workspacePath = repoRoot,
) {
  return runCli([
    'workspace', 'bind',
    '--project', project,
    '--path', workspacePath,
    '--manifest-command', buildManifestCommand(manifest),
  ], env);
}

export function findDomainManifest(output: JsonRecord, projectId: string): any {
  return ((output.domain_manifests as JsonRecord).projects as JsonRecord[])
    .find((entry) => entry.project_id === projectId);
}

export function standardProgressFirstPolicies() {
  return {
    progress_delta_policy: STANDARD_PROGRESS_DELTA_POLICY,
    typed_blocker_lineage_policy: STANDARD_TYPED_BLOCKER_LINEAGE_POLICY,
  };
}

export function buildAdmittedActionCatalog(
  targetDomainId: string,
  owner: string,
  options: { stage2HumanGate?: boolean } = {},
) {
  return {
    surface_kind: 'family_action_catalog',
    version: 'family-action-catalog.v1',
    catalog_id: `${targetDomainId.replace(/[^a-z0-9]+/gi, '_')}_action_catalog`,
    target_domain_id: targetDomainId,
    owner,
    authority_boundary: { opl_role: 'projection_consumer_only' },
    actions: Array.from({ length: 6 }, (_entry, index) => ({
      action_id: `stage_${index + 1}_action`,
      title: `Stage ${index + 1} action`,
      summary: `Project stage ${index + 1} action metadata.`,
      owner,
      effect: 'read_only',
      source_command: { command: `${owner} stage-${index + 1}`, surface_kind: 'domain_cli' },
      input_schema_ref: `contracts/stage-${index + 1}.input.schema.json`,
      output_schema_ref: `contracts/stage-${index + 1}.output.schema.json`,
      workspace_locator_fields: ['workspace_root'],
      human_gate_ids: options.stage2HumanGate && index === 1 ? ['publication_quality_gate'] : [],
      supported_surfaces: { cli: null, mcp: null, skill: null, product_entry: null, openai: null, ai_sdk: null },
      authority_boundary: { opl_role: 'projection_consumer_only' },
    })),
    notes: [],
  };
}

export function buildAdmittedStagePlane(
  targetDomainId: string,
  owner: string,
) {
  return {
    surface_kind: 'family_stage_control_plane',
    version: 'family-stage-control-plane.v1',
    plane_id: `${targetDomainId.replace(/[^a-z0-9]+/gi, '_')}_stage_control_plane`,
    target_domain_id: targetDomainId,
    owner,
    authority_boundary: { opl_role: 'projection_consumer_only' },
    replay_evidence_refs: [],
    stages: Array.from({ length: 6 }, (_entry, index) => {
      const stageNumber = index + 1;
      return {
        stage_id: `stage_${stageNumber}`,
        stage_kind: 'creation',
        title: `Stage ${stageNumber}`,
        summary: `Runtime-enforced stage ${stageNumber} descriptor.`,
        goal: `Expose stage ${stageNumber} as admitted runtime projection metadata.`,
        owner,
        domain_stage_refs: [`domain_stage_${stageNumber}`],
        inputs: [],
        knowledge_refs: [],
        skills: [],
        prompt_refs: [],
        allowed_action_refs: [`stage_${stageNumber}_action`],
        outputs: [],
        evaluation: [],
        handoff: null,
        source_refs: [],
        freshness: null,
        action_parity: null,
        stage_contract: {
          requires: [`stage_${stageNumber}_input_ready`],
          ensures: [`stage_${stageNumber}_receipt_ready`],
          boundary_assumptions: ['domain_truth_remains_domain_owned'],
          runtime_event_refs: [`runtime_event:${targetDomainId}.stage_${stageNumber}`],
          ...standardProgressFirstPolicies(),
          expected_receipt_refs: [{ ref_kind: 'receipt_ref', ref: `owner_receipt:stage_${stageNumber}`, role: 'domain_owner_receipt_ref' }],
          replay_evidence_refs: [],
          properties: [],
          runtime_assumptions: [],
          monitor_refs: [{ ref_kind: 'json_pointer', ref: `/runtime_inventory/stage_${stageNumber}`, role: 'runtime_assumption_monitor' }],
          source_scope_refs: [{ ref_kind: 'json_pointer', ref: `/source_scope/stage_${stageNumber}`, role: 'launch_source_scope' }],
          cohort_query_refs: [{ ref_kind: 'json_pointer', ref: `/cohort_query/stage_${stageNumber}`, role: 'cohort_query' }],
          trigger_refs: [{ ref_kind: 'queue_ref', ref: `queue:${targetDomainId}/stage_${stageNumber}`, role: 'launch_trigger' }],
          dashboard_metric_refs: [{ ref_kind: 'metric_ref', ref: `metric:${targetDomainId}.stage_${stageNumber}`, role: 'operator_metric' }],
          artifact_scope_refs: [],
          workspace_scope_refs: [],
        },
        trust_boundary: {
          lane: 'domain_agent', static_check_eligible: false, effect_boundary: false,
          runtime_guard_required: true, records_runtime_events: true,
          runtime_event_refs: [`runtime_event:${targetDomainId}.stage_${stageNumber}`],
        },
        authority_boundary: { opl_role: 'projection_consumer_only', can_write_domain_truth: false },
      };
    }),
    notes: [],
  };
}

export function createAdmittedStagePackFixture(
  payload: JsonRecord,
  targetDomainId: string,
  owner: string,
  options: { stage2HumanGate?: boolean; stageCount?: number } = {},
) {
  const repoDir = buildReadyAgentRepo();
  retargetReadyRepo(repoDir, targetDomainId, owner);
  const productEntryManifest = payload.product_entry_manifest as JsonRecord | undefined;
  const inlineStagePlane = (
    productEntryManifest?.family_stage_control_plane ?? payload.family_stage_control_plane
  ) as JsonRecord | undefined;
  const actionCatalog = (
    productEntryManifest?.family_action_catalog ?? payload.family_action_catalog
  ) as JsonRecord | undefined ?? buildAdmittedActionCatalog(targetDomainId, owner, options);
  const actionIds = (actionCatalog.actions as JsonRecord[]).map((action) => String(action.action_id));
  writeJson(path.join(repoDir, 'contracts/action_catalog.json'), actionCatalog);

  const stageManifestPath = path.join(repoDir, 'agent/stages/manifest.json');
  const stageManifest = JSON.parse(fs.readFileSync(stageManifestPath, 'utf8')) as JsonRecord;
  const baseStage = (stageManifest.stages as JsonRecord[])[0];
  const sourceStages = inlineStagePlane
    ? inlineStagePlane.stages as JsonRecord[]
    : buildAdmittedStagePlane(targetDomainId, owner).stages as JsonRecord[];
  stageManifest.stages = sourceStages
    .slice(0, options.stageCount ?? sourceStages.length)
    .map((stage, index) => {
      const contract = stage.stage_contract as JsonRecord;
      const trustBoundary = stage.trust_boundary as JsonRecord | undefined;
      const extensionFields = [
        'runtime_assumptions', 'monitor_refs', 'monitor_freshness_refs', 'source_scope_refs', 'cohort_query_refs',
        'trigger_refs', 'metric_refs', 'dashboard_metric_refs', 'artifact_scope_refs',
        'workspace_scope_refs',
      ];
      return {
        ...baseStage,
        stage_id: stage.stage_id,
        stage_kind: stage.stage_kind,
        title: stage.title,
        summary: stage.summary,
        goal: stage.goal,
        allowed_action_refs: (stage.allowed_action_refs as string[] | undefined)?.filter((ref) => actionIds.includes(ref)).length
          ? stage.allowed_action_refs
          : [actionIds[index % actionIds.length]],
        requires: contract.requires,
        ensures: contract.ensures,
        next_stage_refs: (stage.handoff as JsonRecord | undefined)?.next_stage_refs ?? [],
        trust_lane: options.stage2HumanGate && index === 1
          ? 'human_gate'
          : trustBoundary?.effect_boundary === true
            ? 'ai_decision'
            : trustBoundary?.lane ?? 'domain_agent',
        stage_contract_extension: Object.fromEntries(
          extensionFields
            .filter((field) => contract[field] !== undefined)
            .map((field) => [field, contract[field]]),
        ),
      };
    });
  writeJson(stageManifestPath, stageManifest);
  for (let index = 1; index <= 6; index += 1) {
    const schema = { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object' };
    writeJson(path.join(repoDir, `contracts/stage-${index}.input.schema.json`), schema);
    writeJson(path.join(repoDir, `contracts/stage-${index}.output.schema.json`), schema);
  }

  const ref = {
    ref_kind: 'generated_surface',
    ref: 'opl-generated:family_stage_control_plane',
    source_ref: 'agent/stages/manifest.json',
    label: `${owner} generated stage control plane`,
  };
  const manifest = attachManifestSurface(payload, 'family_action_catalog', actionCatalog) as JsonRecord;
  if (manifest.product_entry_manifest && typeof manifest.product_entry_manifest === 'object') {
    const { family_stage_control_plane: _inlinePlane, ...productEntryManifest } = manifest.product_entry_manifest as JsonRecord;
    return {
      manifest: {
        ...manifest,
        product_entry_manifest: { ...productEntryManifest, family_stage_control_plane_ref: ref },
      },
      repoDir,
    };
  }
  const { family_stage_control_plane: _inlinePlane, ...refsOnlyManifest } = manifest;
  return { manifest: { ...refsOnlyManifest, family_stage_control_plane_ref: ref }, repoDir };
}

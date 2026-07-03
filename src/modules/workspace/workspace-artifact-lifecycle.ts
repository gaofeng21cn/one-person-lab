import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import { FrameworkContractError } from '../charter/index.ts';
import type { FrameworkContracts } from '../../kernel/types.ts';
import type { WorkspaceProjectIndexEntry } from './workspace-topology.ts';
import { writeJsonArtifact } from './workspace-artifacts.ts';
import {
  readValidatedWorkspaceIndex,
} from './workspace-lifecycle.ts';

export const ARTIFACT_LIFECYCLE_DIR = 'control/opl/artifact_lifecycle';
export const ARTIFACT_LIFECYCLE_INDEX_REF = `${ARTIFACT_LIFECYCLE_DIR}/artifact_lifecycle_index.json`;
export const SOURCE_PASSPORT_REF = `${ARTIFACT_LIFECYCLE_DIR}/source_passport.json`;
export const MEMORY_LIFECYCLE_REF = `${ARTIFACT_LIFECYCLE_DIR}/memory_lifecycle.json`;
export const OUTPUT_LIFECYCLE_REF = `${ARTIFACT_LIFECYCLE_DIR}/output_lifecycle.json`;
export const REVIEW_REPAIR_TRANSPORT_REF = `${ARTIFACT_LIFECYCLE_DIR}/review_repair_transport.json`;
export const ARTIFACT_LIFECYCLE_HEALTH_REF = `${ARTIFACT_LIFECYCLE_DIR}/artifact_lifecycle_health.json`;
export const DOMAIN_REVIEW_REPAIR_HANDOFF_REF = 'handoff/review-repair-transport.json';

type JsonRecord = Record<string, unknown>;

export type WorkspaceArtifactLifecycleOptions = {
  workspacePath?: string;
  projectId?: string;
  dryRun?: boolean;
  apply?: boolean;
};

type FileRecord = {
  ref: string;
  role: string;
  exists: boolean;
  kind: 'file' | 'directory' | 'missing' | 'other';
  bytes: number | null;
  sha256: string | null;
  updated_at: string | null;
};

type OpaqueTransportRefRecord = {
  ref_kind: string;
  ref: string | null;
  role: string;
  file: FileRecord | null;
};

type ReviewRepairTransportBlocker = {
  code: string;
  ref?: string;
  reason: string;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeOptionalString(value: string | undefined | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .map((entry) => entry.trim());
}

function safeReadJson(filePath: string) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
  } catch {
    return null;
  }
}

function hashFile(filePath: string) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function relativeRef(root: string, absolutePath: string) {
  return path.relative(root, absolutePath).split(path.sep).join('/');
}

function statRecord(root: string, ref: string, role: string): FileRecord {
  const absolutePath = path.join(root, ref);
  if (!fs.existsSync(absolutePath)) {
    return {
      ref,
      role,
      exists: false,
      kind: 'missing',
      bytes: null,
      sha256: null,
      updated_at: null,
    };
  }
  const stat = fs.statSync(absolutePath);
  const kind = stat.isFile()
    ? 'file'
    : stat.isDirectory()
      ? 'directory'
      : 'other';
  return {
    ref,
    role,
    exists: true,
    kind,
    bytes: stat.isFile() ? stat.size : null,
    sha256: stat.isFile() ? hashFile(absolutePath) : null,
    updated_at: stat.mtime.toISOString(),
  };
}

function listFiles(root: string, relRoot: string): string[] {
  const absoluteRoot = path.join(root, relRoot);
  if (!fs.existsSync(absoluteRoot) || !fs.statSync(absoluteRoot).isDirectory()) {
    return [];
  }
  const results: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.DS_Store') {
        continue;
      }
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
      } else if (entry.isFile()) {
        results.push(relativeRef(root, absolute));
      }
    }
  };
  walk(absoluteRoot);
  return results.sort();
}

function normalizeProjectRef(project: WorkspaceProjectIndexEntry, ref: string) {
  return path.join(project.project_root, ref).split(path.sep).join('/');
}

function projectFileRecord(workspaceRoot: string, project: WorkspaceProjectIndexEntry, ref: string, role: string) {
  return statRecord(workspaceRoot, normalizeProjectRef(project, ref), role);
}

function projectFiles(workspaceRoot: string, project: WorkspaceProjectIndexEntry, relRoot: string, role: string) {
  const prefix = normalizeProjectRef(project, relRoot);
  return listFiles(workspaceRoot, prefix).map((ref) => statRecord(workspaceRoot, ref, role));
}

function sourceMapEntries(workspaceRoot: string, project: WorkspaceProjectIndexEntry) {
  const sourceMapRef = normalizeProjectRef(project, 'sources/source-map.json');
  const sourceMap = safeReadJson(path.join(workspaceRoot, sourceMapRef));
  if (!Array.isArray(sourceMap)) {
    return {
      status: 'missing_or_invalid',
      source_map_ref: sourceMapRef,
      entries: [],
      missing_required_fields: [],
    };
  }
  const requiredFields = ['id', 'title', 'use'];
  const rows = sourceMap
    .filter(isRecord)
    .map((entry) => {
      const missingFields = requiredFields.filter((field) => typeof entry[field] !== 'string' || !String(entry[field]).trim());
      const missingLifecycleFields = ['owner', 'provenance', 'allowed_use', 'privacy', 'evidence_class', 'claim_refs']
        .filter((field) => entry[field] === undefined || entry[field] === null);
      return {
        id: typeof entry.id === 'string' ? entry.id : null,
        title: typeof entry.title === 'string' ? entry.title : null,
        local_ref: typeof entry.path === 'string' ? normalizeProjectRef(project, entry.path) : null,
        external_url: typeof entry.url === 'string' ? entry.url : null,
        use: typeof entry.use === 'string' ? entry.use : null,
        missing_required_fields: missingFields,
        missing_lifecycle_fields: missingLifecycleFields,
      };
    });
  return {
    status: 'loaded',
    source_map_ref: sourceMapRef,
    entries: rows,
    missing_required_fields: rows.flatMap((row) => row.missing_required_fields),
    entries_missing_lifecycle_count: rows.filter((row) => row.missing_lifecycle_fields.length > 0).length,
  };
}

function buildSourcePassport(workspaceRoot: string, project: WorkspaceProjectIndexEntry, updatedAt: string) {
  const inputs = projectFiles(workspaceRoot, project, 'inputs', 'owner_supplied_input');
  const sources = projectFiles(workspaceRoot, project, 'sources', 'source_material');
  const sourceMap = sourceMapEntries(workspaceRoot, project);
  return {
    surface_kind: 'opl_workspace_source_passport',
    version: 'workspace-artifact-lifecycle.v1',
    project_id: project.project_id,
    project_root: project.project_root,
    source_map: sourceMap,
    inputs,
    sources,
    summary: {
      input_file_count: inputs.length,
      source_file_count: sources.length,
      source_map_status: sourceMap.status,
      source_map_entry_count: sourceMap.entries.length,
      source_map_entries_missing_lifecycle_count: sourceMap.entries_missing_lifecycle_count ?? 0,
    },
    authority_boundary: {
      passport_is_refs_only: true,
      passport_does_not_store_source_body: true,
      passport_can_record_provenance_gaps: true,
      passport_can_replace_domain_source_judgment: false,
      opl_can_write_domain_truth: false,
    },
    updated_at: updatedAt,
  };
}

function buildMemoryLifecycle(workspaceRoot: string, project: WorkspaceProjectIndexEntry, updatedAt: string) {
  const requiredRefs = [
    'book-memory/working.md',
    'book-memory/episodic.md',
    'book-memory/semantic.md',
    'book-memory/memory-qc.md',
  ];
  const refs = requiredRefs.map((ref) => projectFileRecord(workspaceRoot, project, ref, 'book_memory_ref'));
  const present = refs.filter((entry) => entry.exists).length;
  return {
    surface_kind: 'opl_workspace_memory_lifecycle',
    version: 'workspace-artifact-lifecycle.v1',
    project_id: project.project_id,
    project_root: project.project_root,
    memory_model: 'working_episodic_semantic_qc',
    required_refs: refs,
    summary: {
      required_ref_count: refs.length,
      present_required_ref_count: present,
      missing_required_ref_count: refs.length - present,
      status: present === refs.length ? 'passed' : 'blocked_missing_required_memory_refs',
    },
    authority_boundary: {
      memory_lifecycle_is_refs_only: true,
      memory_lifecycle_does_not_store_memory_body: true,
      memory_lifecycle_can_replace_memory_acceptance: false,
      opl_can_write_memory_body: false,
      opl_can_write_domain_truth: false,
    },
    updated_at: updatedAt,
  };
}

function buildOutputLifecycle(workspaceRoot: string, project: WorkspaceProjectIndexEntry, updatedAt: string) {
  const outputGroups = [
    ['artifacts/manuscript', 'manuscript_artifact'],
    ['artifacts/review', 'review_artifact'],
    ['artifacts/figures', 'figure_artifact'],
    ['artifacts/stage_outputs', 'stage_output_artifact'],
    ['quality', 'quality_report'],
    ['receipts', 'owner_or_blocker_receipt'],
    ['archive', 'retired_artifact'],
  ] as const;
  const records = outputGroups.flatMap(([relRoot, role]) => projectFiles(workspaceRoot, project, relRoot, role));
  const reviewPdf = projectFileRecord(workspaceRoot, project, 'artifacts/review/completed-chapters.review.pdf', 'current_review_pdf');
  const reviewReceipt = projectFileRecord(workspaceRoot, project, 'artifacts/review/completed-chapters.review-pdf-export.json', 'current_review_pdf_receipt');
  const chapterManifest = projectFileRecord(workspaceRoot, project, 'artifacts/manuscript/chapter-manifest.json', 'chapter_manifest');
  const figureManifest = projectFileRecord(workspaceRoot, project, 'artifacts/stage_outputs/book-materialization/figure-asset-manifest.json', 'figure_asset_manifest');
  const hygieneReport = projectFileRecord(workspaceRoot, project, 'quality/book-project-hygiene.json', 'hygiene_report');
  const currentRefs = [reviewPdf, reviewReceipt, chapterManifest, figureManifest, hygieneReport];
  return {
    surface_kind: 'opl_workspace_output_lifecycle',
    version: 'workspace-artifact-lifecycle.v1',
    project_id: project.project_id,
    project_root: project.project_root,
    artifacts: records,
    current_refs: currentRefs,
    summary: {
      artifact_file_count: records.length,
      current_ref_count: currentRefs.length,
      missing_current_ref_count: currentRefs.filter((entry) => !entry.exists).length,
      archive_file_count: records.filter((entry) => entry.role === 'retired_artifact').length,
    },
    authority_boundary: {
      output_lifecycle_is_refs_only: true,
      output_lifecycle_does_not_store_artifact_body: true,
      output_lifecycle_can_claim_publication_ready: false,
      output_lifecycle_can_replace_owner_receipt: false,
      opl_can_write_domain_truth: false,
    },
    updated_at: updatedAt,
  };
}

function transportRef(
  workspaceRoot: string,
  project: WorkspaceProjectIndexEntry,
  refKind: string,
  ref: string | null,
  role: string,
): OpaqueTransportRefRecord {
  return {
    ref_kind: refKind,
    ref,
    role,
    file: ref ? projectFileRecord(workspaceRoot, project, ref, role) : null,
  };
}

function buildReviewRepairTransport(workspaceRoot: string, project: WorkspaceProjectIndexEntry, updatedAt: string) {
  const domainHandoffRef = projectFileRecord(
    workspaceRoot,
    project,
    DOMAIN_REVIEW_REPAIR_HANDOFF_REF,
    'domain_owned_review_repair_handoff',
  );
  const authorityBoundary = {
    transport_is_refs_only: true,
    transport_does_not_parse_domain_revision_semantics: true,
    transport_can_project_current_owner_and_next_delta_shape: true,
    transport_can_claim_quality_or_publication_ready: false,
    transport_can_replace_owner_receipt: false,
    transport_can_create_typed_blocker: false,
    opl_can_write_domain_truth: false,
    opl_can_write_memory_body: false,
    opl_can_mutate_artifact_body: false,
  };

  if (!domainHandoffRef.exists) {
    return {
      surface_kind: 'opl_workspace_review_repair_transport',
      version: 'workspace-artifact-lifecycle.v1',
      project_id: project.project_id,
      project_root: project.project_root,
      status: 'not_declared',
      domain_handoff_ref: domainHandoffRef,
      current_owner: null,
      accepted_answer_shape: [],
      selected_transport_kind: null,
      domain_decision_label: null,
      transport_refs: [],
      route_back: {
        required: false,
        target_stage_ref: null,
        target_ref: null,
        target_owner: null,
        current_owner_delta_ref: null,
      },
      freshness: {
        freshness_gate_ref: null,
        downstream_freshness_refs: [],
        stale_downstream_refs: [],
        stale_downstream_ref_count: 0,
      },
      iteration_limit: {
        current_iteration: null,
        iteration_limit: null,
        iteration_limit_ref: null,
        limit_exceeded: false,
      },
      closure_options: [],
      blockers: [],
      summary: {
        status: 'not_declared',
        blocker_count: 0,
        route_back_required: false,
        stale_downstream_ref_count: 0,
      },
      authority_boundary: authorityBoundary,
      updated_at: updatedAt,
    };
  }

  const handoffPath = path.join(workspaceRoot, domainHandoffRef.ref);
  const handoff = safeReadJson(handoffPath);
  if (!isRecord(handoff)) {
    const blockers: ReviewRepairTransportBlocker[] = [{
      code: 'review_repair_handoff_invalid',
      ref: domainHandoffRef.ref,
      reason: 'domain review-repair handoff must be a JSON object with opaque refs',
    }];
    return {
      surface_kind: 'opl_workspace_review_repair_transport',
      version: 'workspace-artifact-lifecycle.v1',
      project_id: project.project_id,
      project_root: project.project_root,
      status: 'blocked',
      domain_handoff_ref: domainHandoffRef,
      current_owner: null,
      accepted_answer_shape: [],
      selected_transport_kind: null,
      domain_decision_label: null,
      transport_refs: [],
      route_back: {
        required: false,
        target_stage_ref: null,
        target_ref: null,
        target_owner: null,
        current_owner_delta_ref: null,
      },
      freshness: {
        freshness_gate_ref: null,
        downstream_freshness_refs: [],
        stale_downstream_refs: [],
        stale_downstream_ref_count: 0,
      },
      iteration_limit: {
        current_iteration: null,
        iteration_limit: null,
        iteration_limit_ref: null,
        limit_exceeded: false,
      },
      closure_options: [],
      blockers,
      summary: {
        status: 'blocked',
        blocker_count: blockers.length,
        route_back_required: false,
        stale_downstream_ref_count: 0,
      },
      authority_boundary: authorityBoundary,
      updated_at: updatedAt,
    };
  }

  const routeBack = isRecord(handoff.route_back) ? handoff.route_back : {};
  const iteration = isRecord(handoff.iteration) ? handoff.iteration : {};
  const currentOwner = stringValue(handoff.current_owner) ?? stringValue(handoff.next_owner);
  const acceptedAnswerShape = stringArray(handoff.accepted_answer_shape).length > 0
    ? stringArray(handoff.accepted_answer_shape)
    : stringArray(handoff.accepted_next_delta_shape);
  const revisionEntrypointDecisionRef = stringValue(handoff.revision_entrypoint_decision_ref);
  const routeBackRef = stringValue(handoff.route_back_ref) ?? stringValue(routeBack.route_back_ref);
  const repairPlanRef = stringValue(handoff.repair_plan_ref);
  const typedBlockerRef = stringValue(handoff.typed_blocker_ref);
  const ownerDecisionRef = stringValue(handoff.owner_decision_ref);
  const freshnessGateRef = stringValue(handoff.freshness_gate_ref);
  const iterationLimitRef = stringValue(handoff.iteration_limit_ref);
  const currentOwnerDeltaRef = stringValue(handoff.current_owner_delta_ref);
  const routeBackTargetStageRef = stringValue(routeBack.target_stage_ref)
    ?? stringValue(handoff.route_back_target_stage_ref);
  const routeBackTargetRef = stringValue(routeBack.target_ref) ?? stringValue(handoff.route_back_target_ref);
  const routeBackTargetOwner = stringValue(routeBack.target_owner) ?? stringValue(handoff.route_back_target_owner);
  const selectedTransportKind = stringValue(handoff.selected_transport_kind)
    ?? stringValue(handoff.selected_route_kind)
    ?? (routeBackRef ? 'route_back' : null);
  const routeBackRequired = Boolean(
    routeBackRef
      || routeBackTargetStageRef
      || routeBackTargetRef
      || selectedTransportKind === 'route_back',
  );
  const currentIteration = numberValue(iteration.current_iteration) ?? numberValue(handoff.current_iteration);
  const iterationLimit = numberValue(iteration.limit) ?? numberValue(handoff.iteration_limit);
  const staleDownstreamRefs = stringArray(handoff.stale_downstream_refs);
  const downstreamFreshnessRefs = stringArray(handoff.downstream_freshness_refs);
  const closureOptions = stringArray(handoff.closure_options);
  const domainDecisionLabel = stringValue(handoff.domain_decision_label)
    ?? stringValue(handoff.revision_entrypoint_level);
  const limitExceeded = currentIteration !== null && iterationLimit !== null && currentIteration > iterationLimit;
  const blockers: ReviewRepairTransportBlocker[] = [];

  if (!currentOwner) {
    blockers.push({
      code: 'review_repair_current_owner_missing',
      ref: domainHandoffRef.ref,
      reason: 'route-back transport must name the current owner before OPL can project the next delta',
    });
  }
  if (acceptedAnswerShape.length === 0) {
    blockers.push({
      code: 'review_repair_accepted_answer_shape_missing',
      ref: domainHandoffRef.ref,
      reason: 'route-back transport must declare the accepted next-answer shape',
    });
  }
  if (routeBackRequired && !routeBackTargetStageRef && !routeBackTargetRef) {
    blockers.push({
      code: 'review_repair_route_back_target_missing',
      ref: domainHandoffRef.ref,
      reason: 'route-back transport cannot execute a route-back without an opaque target stage or target ref',
    });
  }
  if (limitExceeded) {
    blockers.push({
      code: 'review_repair_iteration_limit_exceeded',
      ref: iterationLimitRef ?? domainHandoffRef.ref,
      reason: 'route-back transport iteration count exceeds the declared iteration limit',
    });
  }
  if (staleDownstreamRefs.length > 0) {
    blockers.push({
      code: 'review_repair_downstream_refs_stale',
      ref: freshnessGateRef ?? domainHandoffRef.ref,
      reason: 'domain handoff declares downstream refs stale; refresh them before closure claims',
    });
  }

  const status = blockers.length > 0 ? 'blocked' : 'passed';
  return {
    surface_kind: 'opl_workspace_review_repair_transport',
    version: 'workspace-artifact-lifecycle.v1',
    project_id: project.project_id,
    project_root: project.project_root,
    status,
    domain_handoff_ref: domainHandoffRef,
    current_owner: currentOwner,
    accepted_answer_shape: acceptedAnswerShape,
    selected_transport_kind: selectedTransportKind,
    domain_decision_label: domainDecisionLabel,
    transport_refs: [
      transportRef(workspaceRoot, project, 'revision_entrypoint_decision_ref', revisionEntrypointDecisionRef, 'domain_revision_decision_ref'),
      transportRef(workspaceRoot, project, 'route_back_ref', routeBackRef, 'domain_route_back_ref'),
      transportRef(workspaceRoot, project, 'repair_plan_ref', repairPlanRef, 'domain_repair_plan_ref'),
      transportRef(workspaceRoot, project, 'typed_blocker_ref', typedBlockerRef, 'domain_typed_blocker_ref'),
      transportRef(workspaceRoot, project, 'owner_decision_ref', ownerDecisionRef, 'domain_owner_decision_ref'),
      transportRef(workspaceRoot, project, 'freshness_gate_ref', freshnessGateRef, 'domain_freshness_gate_ref'),
      transportRef(workspaceRoot, project, 'iteration_limit_ref', iterationLimitRef, 'domain_iteration_limit_ref'),
      transportRef(workspaceRoot, project, 'current_owner_delta_ref', currentOwnerDeltaRef, 'opl_current_owner_delta_ref'),
    ],
    route_back: {
      required: routeBackRequired,
      target_stage_ref: routeBackTargetStageRef,
      target_ref: routeBackTargetRef,
      target_owner: routeBackTargetOwner,
      current_owner_delta_ref: currentOwnerDeltaRef,
    },
    freshness: {
      freshness_gate_ref: freshnessGateRef,
      downstream_freshness_refs: downstreamFreshnessRefs,
      stale_downstream_refs: staleDownstreamRefs,
      stale_downstream_ref_count: staleDownstreamRefs.length,
    },
    iteration_limit: {
      current_iteration: currentIteration,
      iteration_limit: iterationLimit,
      iteration_limit_ref: iterationLimitRef,
      limit_exceeded: limitExceeded,
    },
    closure_options: closureOptions,
    blockers,
    summary: {
      status,
      blocker_count: blockers.length,
      route_back_required: routeBackRequired,
      stale_downstream_ref_count: staleDownstreamRefs.length,
    },
    authority_boundary: authorityBoundary,
    updated_at: updatedAt,
  };
}

function buildLifecycleHealth(input: {
  sourcePassport: ReturnType<typeof buildSourcePassport>;
  memoryLifecycle: ReturnType<typeof buildMemoryLifecycle>;
  outputLifecycle: ReturnType<typeof buildOutputLifecycle>;
  reviewRepairTransport: ReturnType<typeof buildReviewRepairTransport>;
  updatedAt: string;
}) {
  const blockers = [];
  if (input.sourcePassport.summary.source_map_status !== 'loaded') {
    blockers.push({
      code: 'source_map_missing_or_invalid',
      ref: input.sourcePassport.source_map.source_map_ref,
    });
  }
  if (input.sourcePassport.summary.source_map_entries_missing_lifecycle_count > 0) {
    blockers.push({
      code: 'source_map_lifecycle_fields_missing',
      count: input.sourcePassport.summary.source_map_entries_missing_lifecycle_count,
    });
  }
  if (input.memoryLifecycle.summary.missing_required_ref_count > 0) {
    blockers.push({
      code: 'book_memory_required_refs_missing',
      missing_required_ref_count: input.memoryLifecycle.summary.missing_required_ref_count,
    });
  }
  if (input.outputLifecycle.summary.missing_current_ref_count > 0) {
    blockers.push({
      code: 'output_lifecycle_current_refs_missing',
      missing_current_ref_count: input.outputLifecycle.summary.missing_current_ref_count,
    });
  }
  if (input.reviewRepairTransport.status === 'blocked') {
    blockers.push({
      code: 'review_repair_transport_blocked',
      blocker_count: input.reviewRepairTransport.summary.blocker_count,
    });
  }
  return {
    surface_kind: 'opl_workspace_artifact_lifecycle_health',
    version: 'workspace-artifact-lifecycle.v1',
    status: blockers.length > 0 ? 'blocked' : 'passed',
    blockers,
    summary: {
      blocker_count: blockers.length,
      source_map_entry_count: input.sourcePassport.summary.source_map_entry_count,
      memory_required_ref_count: input.memoryLifecycle.summary.required_ref_count,
      output_artifact_file_count: input.outputLifecycle.summary.artifact_file_count,
      review_repair_transport_status: input.reviewRepairTransport.status,
    },
    authority_boundary: {
      health_is_projection_only: true,
      health_can_claim_domain_ready: false,
      health_can_claim_publication_ready: false,
      health_can_replace_owner_receipt: false,
      opl_can_write_domain_truth: false,
    },
    updated_at: input.updatedAt,
  };
}

function writeProjection(projectRoot: string, ref: string, payload: unknown) {
  const filePath = path.join(projectRoot, ref);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  writeJsonArtifact(filePath, payload);
  return filePath;
}

function chooseProject(projects: WorkspaceProjectIndexEntry[], projectId: string | null) {
  if (projectId) {
    const project = projects.find((entry) => entry.project_id === projectId);
    if (!project) {
      throw new FrameworkContractError('contract_shape_invalid', 'workspace artifact lifecycle requires an indexed project.', {
        project_id: projectId,
        indexed_project_ids: projects.map((entry) => entry.project_id),
      });
    }
    return project;
  }
  const activeProjects = projects.filter((entry) => entry.lifecycle.status === 'active');
  return activeProjects.at(-1) ?? projects.at(-1);
}

export function materializeWorkspaceArtifactLifecycle(
  contracts: FrameworkContracts,
  options: WorkspaceArtifactLifecycleOptions,
) {
  const context = readValidatedWorkspaceIndex(options.workspacePath);
  const project = chooseProject(context.projects, normalizeOptionalString(options.projectId));
  if (!project) {
    throw new FrameworkContractError('contract_shape_invalid', 'workspace artifact lifecycle requires at least one indexed project.', {
      workspace_path: context.workspacePath,
    });
  }
  const apply = options.apply === true && options.dryRun !== true;
  const updatedAt = new Date().toISOString();
  const projectRootAbs = path.join(context.workspacePath, project.project_root);
  const sourcePassport = buildSourcePassport(context.workspacePath, project, updatedAt);
  const memoryLifecycle = buildMemoryLifecycle(context.workspacePath, project, updatedAt);
  const outputLifecycle = buildOutputLifecycle(context.workspacePath, project, updatedAt);
  const reviewRepairTransport = buildReviewRepairTransport(context.workspacePath, project, updatedAt);
  const health = buildLifecycleHealth({
    sourcePassport,
    memoryLifecycle,
    outputLifecycle,
    reviewRepairTransport,
    updatedAt,
  });
  const index = {
    surface_kind: 'opl_workspace_artifact_lifecycle_index',
    version: 'workspace-artifact-lifecycle.v1',
    workspace_id: context.index.workspace_id,
    agent_id: context.agent.agent_id,
    project_id: project.project_id,
    project_root: project.project_root,
    refs: {
      source_passport: SOURCE_PASSPORT_REF,
      memory_lifecycle: MEMORY_LIFECYCLE_REF,
      output_lifecycle: OUTPUT_LIFECYCLE_REF,
      review_repair_transport: REVIEW_REPAIR_TRANSPORT_REF,
      health: ARTIFACT_LIFECYCLE_HEALTH_REF,
    },
    status: health.status,
    authority_boundary: {
      lifecycle_index_is_projection_only: true,
      lifecycle_index_does_not_store_domain_body: true,
      lifecycle_index_can_claim_domain_ready: false,
      lifecycle_index_can_claim_publication_ready: false,
      opl_can_write_domain_truth: false,
    },
    updated_at: updatedAt,
  };
  const writtenFiles = apply
    ? [
        writeProjection(projectRootAbs, SOURCE_PASSPORT_REF, sourcePassport),
        writeProjection(projectRootAbs, MEMORY_LIFECYCLE_REF, memoryLifecycle),
        writeProjection(projectRootAbs, OUTPUT_LIFECYCLE_REF, outputLifecycle),
        writeProjection(projectRootAbs, REVIEW_REPAIR_TRANSPORT_REF, reviewRepairTransport),
        writeProjection(projectRootAbs, ARTIFACT_LIFECYCLE_HEALTH_REF, health),
        writeProjection(projectRootAbs, ARTIFACT_LIFECYCLE_INDEX_REF, index),
      ]
    : [];

  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    workspace_artifact_lifecycle: {
      surface_kind: 'opl_workspace_artifact_lifecycle',
      status: apply ? 'applied' : 'dry_run_ready',
      dry_run: !apply,
      write_allowed: apply,
      workspace_path: context.workspacePath,
      project_id: project.project_id,
      project_root: project.project_root,
      lifecycle_status: health.status,
      written_files: writtenFiles,
      index,
      source_passport: sourcePassport,
      memory_lifecycle: memoryLifecycle,
      output_lifecycle: outputLifecycle,
      review_repair_transport: reviewRepairTransport,
      health,
      authority_boundary: index.authority_boundary,
    },
  };
}

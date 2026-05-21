import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { JsonRecord } from './runtime-tray-snapshot-types.ts';
import { sourceRef, uniqueByRef } from './runtime-tray-snapshot-utils.ts';

const OMA_DOMAIN_ID = 'opl-meta-agent';
const OMA_PROJECT = 'opl-meta-agent';
const OMA_WORKSPACE_ENV = 'OPL_META_AGENT_REPO_DIR';
const OMA_RELATIVE_CONTRACT_REFS = {
  registration: 'contracts/opl_domain_manifest_registration.json',
  appWorkbenchProjection: 'contracts/app_workbench_projection.json',
  scaleoutEvidence: 'contracts/real_target_agent_scaleout_evidence.json',
} as const;

const PATCH_LOOP_REF_FIELDS = [
  'blocked_suite_result_ref',
  'developer_patch_work_order_ref',
  'patch_traceability_matrix_ref',
  'failure_evidence_refs',
  'root_cause_refs',
  'targeted_fix_refs',
  'predicted_impact_refs',
  'next_run_falsification_refs',
  'target_repo_verification_refs',
  'target_runtime_read_model_consumption_ref',
  'workspace_environment_proof_ref',
  'no_forbidden_write_proof_ref',
  'target_owner_receipt_or_typed_blocker_ref',
  'patch_absorption_ref',
  'worktree_cleanup_ref',
  'agent_lab_re_evaluation_ref',
] as const;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function recordList(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.map(optionalString).filter((entry): entry is string => Boolean(entry))
    : [];
}

function workspaceCandidates(seed: string) {
  const candidates = [seed, path.dirname(seed)];
  let current = path.resolve(seed);
  while (current !== path.dirname(current)) {
    if (path.basename(current) === '.worktrees') {
      candidates.push(path.dirname(path.dirname(current)));
    }
    current = path.dirname(current);
  }
  return candidates;
}

function defaultOmaRepoDir() {
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const roots = [
    process.env[OMA_WORKSPACE_ENV],
    process.env.OPL_FAMILY_WORKSPACE_ROOT
      ? path.join(process.env.OPL_FAMILY_WORKSPACE_ROOT, OMA_PROJECT)
      : null,
    ...workspaceCandidates(process.cwd()).map((candidate) => path.join(candidate, OMA_PROJECT)),
    ...workspaceCandidates(sourceRoot).map((candidate) => path.join(candidate, OMA_PROJECT)),
  ].filter((entry): entry is string => Boolean(entry));
  return roots.find((candidate) => (
    fs.existsSync(path.join(candidate, OMA_RELATIVE_CONTRACT_REFS.registration))
    && fs.existsSync(path.join(candidate, OMA_RELATIVE_CONTRACT_REFS.appWorkbenchProjection))
    && fs.existsSync(path.join(candidate, OMA_RELATIVE_CONTRACT_REFS.scaleoutEvidence))
  )) ?? null;
}

function readJson(repoDir: string, relativePath: string) {
  const absolutePath = path.join(repoDir, relativePath);
  try {
    return {
      ref: relativePath,
      absolute_path: absolutePath,
      status: 'resolved',
      payload: JSON.parse(fs.readFileSync(absolutePath, 'utf8')) as unknown,
      error: null,
    };
  } catch (error) {
    return {
      ref: relativePath,
      absolute_path: absolutePath,
      status: fs.existsSync(absolutePath) ? 'invalid_json' : 'missing',
      payload: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function refsFromSectionFields(fields: unknown, role: string) {
  return stringList(fields).map((ref) => ({
    ref,
    role,
    status: 'projected_ref',
  }));
}

function appSectionRefs(section: JsonRecord) {
  return [
    ...refsFromSectionFields(section.projection_fields, 'projection_field'),
    ...(optionalString(section.write_boundary)
      ? [{
          ref: optionalString(section.write_boundary)!,
          role: 'write_boundary',
          status: 'refs_only',
        }]
      : []),
  ];
}

function scaleoutTargetRefs(scaleoutEvidence: JsonRecord) {
  const closeout = record(scaleoutEvidence.multi_target_scaleout_closeout);
  return recordList(closeout.target_agents).map((target) => ({
    ref: optionalString(target.target_agent_delivery_receipt_ref)
      ?? optionalString(target.domain_id)
      ?? 'target-agent-delivery-receipt',
    status: optionalString(closeout.status) ?? optionalString(scaleoutEvidence.evidence_status) ?? 'observed',
    receipt_ref: optionalString(target.target_agent_delivery_receipt_ref),
    typed_blocker_ref: stringList(target.typed_blocker_refs)[0] ?? null,
    owner_receipt_ref: stringList(target.target_agent_owner_receipt_refs)[0] ?? null,
    domain_id: optionalString(target.domain_id),
  }));
}

function firstString(values: unknown) {
  return stringList(values)[0] ?? null;
}

function refListOrFallback(value: unknown, fallback: string) {
  const refs = stringList(value);
  return refs.length > 0 ? refs : [fallback];
}

function patchLoopCloseoutTargetRefs(scaleoutEvidence: JsonRecord) {
  const closeout = record(scaleoutEvidence.multi_target_scaleout_closeout);
  return recordList(closeout.target_agents).map((target) => {
    const domainId = optionalString(target.domain_id) ?? 'target-agent';
    const ownerReceiptOrBlocker = firstString(target.target_agent_owner_receipt_refs)
      ?? firstString(target.typed_blocker_refs)
      ?? `typed-blocker:opl-meta-agent/${domainId}/owner-receipt-or-blocker-missing`;
    const cleanupRef = firstString(target.cleanup_closeout_refs)
      ?? `worktree-cleanup:${domainId}/not-recorded`;
    const agentLabResultRef = firstString(target.agent_lab_result_refs)
      ?? `agent-lab-run-result:opl-meta-agent/${domainId}/not-recorded`;
    const noForbiddenWriteRef = firstString(target.no_forbidden_write_proof_refs)
      ?? `no-forbidden-write:${domainId}/not-recorded`;

    return {
      domain_id: domainId,
      status: ownerReceiptOrBlocker.startsWith('typed-blocker:')
        ? 'owner_typed_blocker_recorded'
        : 'owner_receipt_recorded',
      refs: {
        blocked_suite_result_ref: agentLabResultRef,
        developer_patch_work_order_ref: optionalString(target.developer_patch_work_order_ref)
          ?? `developer-patch-work-order:opl-meta-agent/${domainId}/agent-evidence`,
        patch_traceability_matrix_ref: optionalString(target.patch_traceability_matrix_ref)
          ?? `patch-traceability:opl-meta-agent/${domainId}/agent-evidence`,
        failure_evidence_refs: refListOrFallback(
          target.failure_evidence_refs,
          `typed-blocker:opl-meta-agent/${domainId}/failure-evidence-ref-missing`,
        ),
        root_cause_refs: refListOrFallback(
          target.root_cause_refs,
          `typed-blocker:opl-meta-agent/${domainId}/root-cause-ref-missing`,
        ),
        targeted_fix_refs: refListOrFallback(
          target.targeted_fix_refs,
          `typed-blocker:opl-meta-agent/${domainId}/targeted-fix-ref-missing`,
        ),
        predicted_impact_refs: refListOrFallback(
          target.predicted_impact_refs,
          `typed-blocker:opl-meta-agent/${domainId}/predicted-impact-ref-missing`,
        ),
        next_run_falsification_refs: refListOrFallback(
          target.next_run_falsification_refs,
          `typed-blocker:opl-meta-agent/${domainId}/next-run-falsification-ref-missing`,
        ),
        target_repo_verification_refs: stringList(target.target_repo_verification_refs).length > 0
          ? stringList(target.target_repo_verification_refs)
          : [`target-verification:${domainId}/agent-evidence`],
        target_runtime_read_model_consumption_ref:
          optionalString(target.target_runtime_read_model_consumption_ref)
            ?? `target-runtime-read-model:${domainId}/agent-evidence`,
        workspace_environment_proof_ref: optionalString(target.workspace_environment_proof_ref)
          ?? `workspace-environment-proof:${domainId}/agent-evidence`,
        no_forbidden_write_proof_ref: noForbiddenWriteRef,
        target_owner_receipt_or_typed_blocker_ref: ownerReceiptOrBlocker,
        patch_absorption_ref: optionalString(target.patch_absorption_ref)
          ?? `patch-absorption:${domainId}/agent-evidence`,
        worktree_cleanup_ref: cleanupRef,
        agent_lab_re_evaluation_ref: optionalString(target.agent_lab_re_evaluation_ref)
          ?? agentLabResultRef,
      },
    };
  });
}

function flattenPatchLoopRefs(targets: ReturnType<typeof patchLoopCloseoutTargetRefs>) {
  const refs = targets.flatMap((target) =>
    Object.entries(target.refs).flatMap(([role, value]) => {
      const values = Array.isArray(value) ? value : [value];
      return values.map((ref) => ({
        ref,
        role,
        domain_id: target.domain_id,
        status: target.status,
      }));
    })
  );
  const seen = new Set<string>();
  return refs.filter((entry) => {
    const key = `${entry.domain_id}:${entry.role}:${entry.ref}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function sectionById(appProjection: JsonRecord, sectionId: string) {
  return recordList(appProjection.workbench_sections).find((section) =>
    optionalString(section.section_id) === sectionId
  ) ?? {};
}

function buildOmaSections(payloads: {
  registration: JsonRecord;
  appProjection: JsonRecord;
  scaleoutEvidence: JsonRecord;
}) {
  const registration = payloads.registration;
  const appProjection = payloads.appProjection;
  const scaleoutEvidence = payloads.scaleoutEvidence;
  const registrationDomainManifest = record(registration.domain_manifest);
  const implementedReceiptSurfaces = record(scaleoutEvidence.implemented_receipt_surfaces);
  const discoveryReceipt = record(registration.discovery_receipt);
  const drilldownReceipt = record(appProjection.drilldown_readiness_receipt);
  const scaleoutCloseout = record(scaleoutEvidence.multi_target_scaleout_closeout);
  const patchLoopTargets = patchLoopCloseoutTargetRefs(scaleoutEvidence);

  return {
    target_brief: {
      refs: [
        ...appSectionRefs(sectionById(appProjection, 'target_brief')),
        {
          ref: optionalString(registrationDomainManifest.domain_descriptor_ref)
            ?? 'contracts/domain_descriptor.json',
          status: optionalString(discoveryReceipt.status) ?? optionalString(registration.registration_status),
          blocker_ref: stringList(discoveryReceipt.blocked_claims)[0] ?? null,
          receipt_ref: optionalString(discoveryReceipt.receipt_ref),
        },
      ],
    },
    candidate_package: {
      refs: [
        ...appSectionRefs(sectionById(appProjection, 'candidate_package')),
        {
          package_ref: optionalString(registrationDomainManifest.pack_compiler_input_ref)
            ?? 'contracts/pack_compiler_input.json',
          status: 'candidate_refs_projected',
          blocker_ref: 'blocked-claim:default-agent-promotion-not-authorized',
          receipt_ref: optionalString(discoveryReceipt.receipt_ref),
        },
      ],
    },
    agent_lab_results: {
      refs: [
        ...appSectionRefs(sectionById(appProjection, 'agent_lab_results')),
        {
          evidence_ref: optionalString(implementedReceiptSurfaces.scaleout_evidence_ledger_surface_kind)
            ?? 'opl_meta_agent_real_target_agent_scaleout_evidence_ledger',
          result_status: optionalString(scaleoutEvidence.evidence_status),
          typed_blocker_ref: recordList(scaleoutCloseout.target_agents).length === 0
            ? 'typed-blocker:opl-meta-agent/no-real-target-scaleout'
            : null,
          receipt_ref: stringList(implementedReceiptSurfaces.default_output_refs)[1] ?? null,
        },
      ],
    },
    developer_work_order: {
      refs: [
        ...appSectionRefs(sectionById(appProjection, 'developer_work_order')),
        {
          work_order_ref: 'developer-patch-work-order:opl-meta-agent/target-agent-improvement',
          status: 'refs_only_operator_projection',
          blocker_ref: stringList(drilldownReceipt.blocker_ref_fields)[0] ?? null,
          owner_receipt_ref: stringList(drilldownReceipt.receipt_ref_fields)[0] ?? null,
        },
      ],
    },
    mechanism_proposal: {
      refs: [
        ...appSectionRefs(sectionById(appProjection, 'mechanism_patch_proposal')),
        {
          proposal_ref: 'mechanism-patch-proposal:opl-meta-agent/target-agent-improvement',
          review_status: 'owner_review_required_before_apply',
          typed_blocker_ref: 'typed-blocker:default-promotion-not-authorized',
          receipt_ref: optionalString(drilldownReceipt.receipt_ref),
        },
      ],
    },
    scaleout_evidence: {
      refs: [
        ...appSectionRefs(sectionById(appProjection, 'scaleout_evidence')),
        ...scaleoutTargetRefs(scaleoutEvidence),
      ],
    },
    patch_loop_closeout: {
      surface_kind: 'opl_meta_agent_patch_loop_closeout_read_model',
      status: patchLoopTargets.length > 0 ? 'refs_only_patch_loop_refs_projected' : 'not_observed',
      required_ref_fields: [...PATCH_LOOP_REF_FIELDS],
      ahe_patch_loop_ref_fields: [
        'failure_evidence_refs',
        'root_cause_refs',
        'targeted_fix_refs',
        'predicted_impact_refs',
        'next_run_falsification_refs',
      ],
      targets: patchLoopTargets,
      refs: flattenPatchLoopRefs(patchLoopTargets),
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
  };
}

export function refsOnlyAuthorityBoundary() {
  return {
    refs_only: true,
    can_write_domain_truth: false,
    can_write_target_domain_truth: false,
    can_write_target_domain_memory_body: false,
    can_mutate_target_domain_artifact_body: false,
    can_authorize_target_domain_quality_or_export: false,
    can_authorize_domain_ready: false,
    can_claim_quality_verdict: false,
    can_promote_default_agent_without_gate: false,
  };
}

export function buildOplMetaAgentRegistryExtension(options: { repoDir?: string | null } = {}) {
  const repoDir = options.repoDir ?? defaultOmaRepoDir();
  if (!repoDir) {
    return {
      surface_kind: 'opl_meta_agent_registry_extension',
      project_id: OMA_DOMAIN_ID,
      project: OMA_PROJECT,
      status: 'not_bound',
      repo_dir: null,
      contract_refs: OMA_RELATIVE_CONTRACT_REFS,
      summary: {
        consumed_contract_count: 0,
        resolved_contract_count: 0,
        app_workbench_section_count: 0,
        scaleout_target_count: 0,
        scaleout_status: null,
        patch_loop_ref_count: 0,
        patch_loop_target_count: 0,
        patch_loop_closed_count: 0,
        discovery_receipt_status: null,
        app_drilldown_receipt_status: null,
        claims_domain_ready: false,
        claims_quality_verdict: false,
        claims_default_promotion: false,
      },
      authority_boundary: refsOnlyAuthorityBoundary(),
      source_refs: [],
    };
  }

  const registrationFile = readJson(repoDir, OMA_RELATIVE_CONTRACT_REFS.registration);
  const appProjectionFile = readJson(repoDir, OMA_RELATIVE_CONTRACT_REFS.appWorkbenchProjection);
  const scaleoutEvidenceFile = readJson(repoDir, OMA_RELATIVE_CONTRACT_REFS.scaleoutEvidence);
  const files = [registrationFile, appProjectionFile, scaleoutEvidenceFile];
  const registration = record(registrationFile.payload);
  const appProjection = record(appProjectionFile.payload);
  const scaleoutEvidence = record(scaleoutEvidenceFile.payload);
  const resolvedCount = files.filter((file) => file.status === 'resolved').length;
  const status = resolvedCount === files.length ? 'resolved' : 'blocked';
  const omaSections = buildOmaSections({ registration, appProjection, scaleoutEvidence });
  const scaleoutCloseout = record(scaleoutEvidence.multi_target_scaleout_closeout);
  const patchLoopCloseout = record(omaSections.patch_loop_closeout);
  const patchLoopTargets = recordList(patchLoopCloseout.targets);

  return {
    surface_kind: 'opl_meta_agent_registry_extension',
    project_id: OMA_DOMAIN_ID,
    project: OMA_PROJECT,
    status,
    repo_dir: repoDir,
    contract_refs: OMA_RELATIVE_CONTRACT_REFS,
    registration: status === 'resolved' ? registration : null,
    app_workbench_projection: status === 'resolved' ? appProjection : null,
    real_target_agent_scaleout_evidence: status === 'resolved' ? scaleoutEvidence : null,
    oma_sections: omaSections,
    summary: {
      consumed_contract_count: files.length,
      resolved_contract_count: resolvedCount,
      app_workbench_section_count: recordList(appProjection.workbench_sections).length,
      scaleout_target_count: recordList(scaleoutCloseout.target_agents).length,
      scaleout_status: optionalString(scaleoutCloseout.status) ?? optionalString(scaleoutEvidence.evidence_status),
      patch_loop_ref_count: recordList(patchLoopCloseout.refs).length,
      patch_loop_target_count: patchLoopTargets.length,
      patch_loop_closed_count: patchLoopTargets.filter((target) =>
        optionalString(target.status) === 'owner_receipt_recorded'
        || optionalString(target.status) === 'owner_typed_blocker_recorded'
      ).length,
      discovery_receipt_status: optionalString(record(registration.discovery_receipt).status),
      app_drilldown_receipt_status: optionalString(record(appProjection.drilldown_readiness_receipt).status),
      claims_domain_ready: false,
      claims_quality_verdict: false,
      claims_default_promotion: false,
    },
    files: files.map(({ payload: _payload, ...file }) => file),
    authority_boundary: refsOnlyAuthorityBoundary(),
    source_refs: uniqueByRef([
      sourceRef('/opl_meta_agent_registry', 'opl_meta_agent_registry_extension'),
      sourceRef(`${repoDir}/${OMA_RELATIVE_CONTRACT_REFS.registration}`, 'oma_domain_manifest_registration'),
      sourceRef(`${repoDir}/${OMA_RELATIVE_CONTRACT_REFS.appWorkbenchProjection}`, 'oma_app_workbench_projection'),
      sourceRef(`${repoDir}/${OMA_RELATIVE_CONTRACT_REFS.scaleoutEvidence}`, 'oma_real_target_agent_scaleout_evidence'),
    ]),
  };
}

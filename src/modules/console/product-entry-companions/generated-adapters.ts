import { isRecord } from '../../../kernel/contract-validation.ts';
import { stringValue as optionalString, type JsonRecord } from '../../../kernel/json-record.ts';
import {
  buildFamilyProductEntrySurfaceFromManifest,
  buildProductEntryOverview,
  buildProductEntryQuickstart,
  buildProductEntryReadiness,
  buildProductEntryStart,
  collectFamilyHumanGateIds,
} from './builders.ts';
import { buildEntrySessionSurface } from './shell-surfaces.ts';

const FORBIDDEN_AUTHORITY_FIELDS = [
  'artifact_body',
  'artifact_content',
  'domain_truth',
  'memory_body',
  'owner_receipt',
  'package_body',
  'receipt_body',
  'typed_blocker',
  'verdict_body',
] as const;

type GeneratedProjection = JsonRecord | null | undefined;

interface GeneratedEntryDescriptorCommand {
  command: string;
  surface_kind: string;
  required_fields: string[];
  session_locator_field?: string | null;
  checkpoint_locator_field?: string | null;
}

interface GeneratedEntryDescriptorHosted {
  action_ref: string;
  surface_kind: string;
  required_fields: string[];
}

interface GeneratedEntryDescriptorProofAction {
  action_id: string;
  command: string;
  surface_kind: string;
  required_fields: string[];
}

export interface GeneratedProductEntryDescriptor {
  direct: GeneratedEntryDescriptorCommand;
  session: GeneratedEntryDescriptorCommand;
  opl_hosted: GeneratedEntryDescriptorHosted;
  progress: {
    surface_kind: string;
    command: string;
    step_id: string;
  };
  resume: GeneratedEntryDescriptorCommand;
  operator: {
    command: string;
    recommended_step_id: string;
  };
  proof_actions: GeneratedEntryDescriptorProofAction[];
  readiness: {
    verdict: string;
    usable_now: boolean;
    good_to_use_now: boolean;
    fully_automatic: boolean;
    blocking_gaps: string[];
    evidence_refs: string[];
  };
  human_gate_ids?: string[];
  next_focus_refs: string[];
}

export interface BuildGeneratedProductEntryDomainSurfaceInput {
  domain_id: string;
  domain_owner: string;
  manifest: JsonRecord;
  shell_aliases: Record<string, string>;
  recommended_action: string;
  notes: string[];
  entry_descriptor?: GeneratedProductEntryDescriptor | null;
  domain_projection?: GeneratedProjection;
}

export interface BuildGeneratedProductEntrySessionSurfaceInput {
  domain_id: string;
  domain_owner: string;
  runtime_owner: string;
  entry_session_id: string;
  session_file: string;
  delivery_identity: JsonRecord;
  continuation_snapshot: JsonRecord;
  family_orchestration: JsonRecord;
  review_projection: JsonRecord;
  publication_projection: JsonRecord;
  artifact_locator_contract: JsonRecord;
  artifact_refs?: JsonRecord[];
  direct_product_entry_command?: string | null;
  opl_hosted_handoff_ref?: string | null;
  source: string;
  entry_mode: string;
  domain_projection?: GeneratedProjection;
}

function requireString(value: unknown, field: string) {
  const text = optionalString(value);
  if (!text) {
    throw new Error(`generated product-entry adapter 缺少字符串字段: ${field}`);
  }
  return text;
}

function requireStringList(value: unknown, field: string) {
  if (!Array.isArray(value)) {
    throw new Error(`generated product-entry adapter ${field} 必须是 string[]`);
  }
  return value.map((entry, index) => requireString(entry, `${field}[${index}]`));
}

function humanizeId(value: string) {
  return value.replaceAll('_', ' ').replaceAll('-', ' ');
}

function cloneRecord(value: unknown, field: string): JsonRecord {
  if (!isRecord(value)) {
    throw new Error(`generated product-entry adapter ${field} 必须是 object`);
  }
  return structuredClone(value) as JsonRecord;
}

function keyAllowsRefOnlyAuthorityField(key: string) {
  return key.endsWith('_ref') || key.endsWith('_refs') || key.endsWith('_ref_count');
}

function rejectAuthorityBodies(value: unknown, field: string): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => rejectAuthorityBodies(entry, `${field}[${index}]`));
    return;
  }
  if (!isRecord(value)) {
    return;
  }
  for (const [rawKey, entry] of Object.entries(value)) {
    const key = rawKey.trim().toLowerCase().replaceAll('-', '_').replaceAll(' ', '_');
    if (
      FORBIDDEN_AUTHORITY_FIELDS.some((token) => key.includes(token))
      && !keyAllowsRefOnlyAuthorityField(key)
    ) {
      throw new Error(`generated product-entry adapter ${field}.${rawKey} 不得携带 authority body`);
    }
    rejectAuthorityBodies(entry, `${field}.${rawKey}`);
  }
}

function normalizeDomainProjection(value: GeneratedProjection) {
  if (value === null || value === undefined) {
    return null;
  }
  const projection = cloneRecord(value, 'domain_projection');
  rejectAuthorityBodies(projection, 'domain_projection');
  return projection;
}

function requireRefProjection(value: unknown, field: string) {
  const projection = cloneRecord(value, field);
  rejectAuthorityBodies(projection, field);
  return projection;
}

export function buildGeneratedProductEntryManifestCompanions(input: {
  entry_descriptor: GeneratedProductEntryDescriptor;
  family_orchestration: JsonRecord;
}) {
  const descriptor = cloneRecord(input.entry_descriptor, 'entry_descriptor') as unknown as GeneratedProductEntryDescriptor;
  rejectAuthorityBodies(descriptor as unknown as JsonRecord, 'entry_descriptor');
  const familyOrchestration = cloneRecord(input.family_orchestration, 'family_orchestration');
  const directCommand = requireString(descriptor.direct?.command, 'entry_descriptor.direct.command');
  const sessionCommand = requireString(descriptor.session?.command, 'entry_descriptor.session.command');
  const hostedActionRef = requireString(descriptor.opl_hosted?.action_ref, 'entry_descriptor.opl_hosted.action_ref');
  const operatorCommand = requireString(descriptor.operator?.command, 'entry_descriptor.operator.command');
  const recommendedStepId = requireString(
    descriptor.operator?.recommended_step_id,
    'entry_descriptor.operator.recommended_step_id',
  );
  const sessionLocatorField = requireString(
    descriptor.session?.session_locator_field,
    'entry_descriptor.session.session_locator_field',
  );
  const checkpointLocatorField = optionalString(descriptor.session?.checkpoint_locator_field);
  const humanGateIds = descriptor.human_gate_ids?.length
    ? requireStringList(descriptor.human_gate_ids, 'entry_descriptor.human_gate_ids')
    : collectFamilyHumanGateIds(familyOrchestration);
  const commonResume = {
    surface_kind: requireString(descriptor.resume?.surface_kind, 'entry_descriptor.resume.surface_kind'),
    command: requireString(descriptor.resume?.command, 'entry_descriptor.resume.command'),
    session_locator_field: requireString(
      descriptor.resume?.session_locator_field,
      'entry_descriptor.resume.session_locator_field',
    ),
    checkpoint_locator_field: optionalString(descriptor.resume?.checkpoint_locator_field),
  };
  const steps = [
    {
      step_id: recommendedStepId,
      title: 'Continue current work',
      command: directCommand,
      surface_kind: requireString(descriptor.direct?.surface_kind, 'entry_descriptor.direct.surface_kind'),
      summary: 'Continue through the direct domain handler target.',
      requires: requireStringList(descriptor.direct?.required_fields, 'entry_descriptor.direct.required_fields'),
    },
    {
      step_id: requireString(descriptor.progress?.step_id, 'entry_descriptor.progress.step_id'),
      title: 'Inspect current progress',
      command: requireString(descriptor.progress?.command, 'entry_descriptor.progress.command'),
      surface_kind: requireString(descriptor.progress?.surface_kind, 'entry_descriptor.progress.surface_kind'),
      summary: 'Read the generated session and progress projection.',
      requires: requireStringList(descriptor.session?.required_fields, 'entry_descriptor.session.required_fields'),
    },
    {
      step_id: 'open_opl_hosted_entry',
      title: 'Open hosted entry',
      command: hostedActionRef,
      surface_kind: requireString(descriptor.opl_hosted?.surface_kind, 'entry_descriptor.opl_hosted.surface_kind'),
      summary: 'Route through the OPL-hosted product entry.',
      requires: requireStringList(descriptor.opl_hosted?.required_fields, 'entry_descriptor.opl_hosted.required_fields'),
    },
    ...(descriptor.proof_actions ?? []).map((action, index) => ({
      step_id: requireString(action.action_id, `entry_descriptor.proof_actions[${index}].action_id`),
      title: humanizeId(requireString(action.action_id, `entry_descriptor.proof_actions[${index}].action_id`)),
      command: requireString(action.command, `entry_descriptor.proof_actions[${index}].command`),
      surface_kind: requireString(action.surface_kind, `entry_descriptor.proof_actions[${index}].surface_kind`),
      summary: 'Run the declared proof action and return refs-only evidence.',
      requires: requireStringList(action.required_fields, `entry_descriptor.proof_actions[${index}].required_fields`),
    })),
  ];
  const blockingGaps = requireStringList(
    descriptor.readiness?.blocking_gaps,
    'entry_descriptor.readiness.blocking_gaps',
  );
  const evidenceRefs = requireStringList(
    descriptor.readiness?.evidence_refs,
    'entry_descriptor.readiness.evidence_refs',
  );
  const nextFocusRefs = requireStringList(descriptor.next_focus_refs, 'entry_descriptor.next_focus_refs');
  const quickstart = buildProductEntryQuickstart({
    summary: 'Use the generated entry, progress, hosted, or proof action surfaces.',
    recommended_step_id: recommendedStepId,
    steps,
    resume_contract: {
      surface_kind: requireString(descriptor.session?.surface_kind, 'entry_descriptor.session.surface_kind'),
      session_locator_field: sessionLocatorField,
      checkpoint_locator_field: checkpointLocatorField,
    },
    human_gate_ids: humanGateIds,
  });
  const start = buildProductEntryStart({
    summary: 'Choose a generated direct, hosted, or session entry mode.',
    recommended_mode_id: 'direct',
    modes: [
      {
        mode_id: 'direct',
        title: 'Direct entry',
        command: directCommand,
        surface_kind: requireString(descriptor.direct?.surface_kind, 'entry_descriptor.direct.surface_kind'),
        summary: 'Invoke the domain handler target directly.',
        requires: requireStringList(descriptor.direct?.required_fields, 'entry_descriptor.direct.required_fields'),
      },
      {
        mode_id: 'opl_hosted',
        title: 'OPL hosted entry',
        command: hostedActionRef,
        surface_kind: requireString(descriptor.opl_hosted?.surface_kind, 'entry_descriptor.opl_hosted.surface_kind'),
        summary: 'Open the OPL-hosted generated entry.',
        requires: requireStringList(descriptor.opl_hosted?.required_fields, 'entry_descriptor.opl_hosted.required_fields'),
      },
      {
        mode_id: 'session',
        title: 'Session entry',
        command: sessionCommand,
        surface_kind: requireString(descriptor.session?.surface_kind, 'entry_descriptor.session.surface_kind'),
        summary: 'Inspect or resume an existing generated session.',
        requires: requireStringList(descriptor.session?.required_fields, 'entry_descriptor.session.required_fields'),
      },
    ],
    resume_surface: commonResume,
    human_gate_ids: humanGateIds,
  });
  const overview = buildProductEntryOverview({
    summary: 'Generated product entry and session surfaces are available.',
    product_entry_command: directCommand,
    recommended_command: directCommand,
    operator_loop_command: operatorCommand,
    progress_surface: {
      surface_kind: requireString(descriptor.progress?.surface_kind, 'entry_descriptor.progress.surface_kind'),
      command: requireString(descriptor.progress?.command, 'entry_descriptor.progress.command'),
      step_id: requireString(descriptor.progress?.step_id, 'entry_descriptor.progress.step_id'),
    },
    resume_surface: commonResume,
    recommended_step_id: recommendedStepId,
    next_focus: nextFocusRefs,
    remaining_gaps_count: blockingGaps.length,
    human_gate_ids: humanGateIds,
  });
  const readiness = {
    ...buildProductEntryReadiness({
      verdict: requireString(descriptor.readiness?.verdict, 'entry_descriptor.readiness.verdict'),
      usable_now: descriptor.readiness?.usable_now,
      good_to_use_now: descriptor.readiness?.good_to_use_now,
      fully_automatic: descriptor.readiness?.fully_automatic,
      summary: blockingGaps.length === 0
        ? 'Generated service surfaces are available without declared blocking gaps.'
        : 'Generated service surfaces are available with declared blocking gaps.',
      recommended_start_surface: requireString(descriptor.direct?.surface_kind, 'entry_descriptor.direct.surface_kind'),
      recommended_start_command: directCommand,
      recommended_loop_surface: requireString(descriptor.direct?.surface_kind, 'entry_descriptor.direct.surface_kind'),
      recommended_loop_command: operatorCommand,
      blocking_gaps: blockingGaps,
    }),
    evidence_refs: evidenceRefs,
  };
  return {
    product_entry_quickstart: quickstart,
    product_entry_start: start,
    product_entry_overview: overview,
    product_entry_readiness: readiness,
  };
}

export function buildGeneratedProductEntryDomainSurface(
  input: BuildGeneratedProductEntryDomainSurfaceInput,
) {
  const domainId = requireString(input.domain_id, 'domain_id');
  const domainOwner = requireString(input.domain_owner, 'domain_owner');
  const manifest = cloneRecord(input.manifest, 'manifest');
  const manifestDomainId = optionalString(manifest.target_domain_id);
  if (manifestDomainId && manifestDomainId !== domainId) {
    throw new Error('generated product-entry adapter manifest.target_domain_id 与 domain_id 不一致');
  }
  const domainProjection = normalizeDomainProjection(input.domain_projection);
  const generatedCompanions = input.entry_descriptor
    ? buildGeneratedProductEntryManifestCompanions({
      entry_descriptor: input.entry_descriptor,
      family_orchestration: cloneRecord(manifest.family_orchestration, 'manifest.family_orchestration'),
    })
    : null;
  const generatedManifest = generatedCompanions
    ? {
      ...manifest,
      ...generatedCompanions,
      recommended_command: input.entry_descriptor!.direct.command,
      recommended_shell: 'direct',
    }
    : manifest;
  const generated = buildFamilyProductEntrySurfaceFromManifest({
    recommended_action: requireString(input.recommended_action, 'recommended_action'),
    product_entry_manifest: generatedManifest,
    shell_aliases: input.shell_aliases,
    notes: input.notes,
    extra_payload: {
      generated_interface_owner: 'one-person-lab',
      generated_for_domain_id: domainId,
      domain_owner: domainOwner,
      ...(domainProjection ? { domain_projection: domainProjection } : {}),
      authority_boundary: {
        generated_surface_only: true,
        can_write_domain_truth: false,
        can_write_artifact_body: false,
        can_write_memory_body: false,
        can_sign_owner_receipt: false,
        can_create_typed_blocker: false,
        can_issue_domain_or_quality_or_export_verdict: false,
      },
    },
  });
  return {
    ...generated,
    surface_kind: 'opl_generated_product_entry_domain_surface',
    generated_surface_kind: generated.surface_kind,
  };
}

function artifactRefProjection(entries: JsonRecord[]) {
  return entries.map((entry, index) => {
    const projected = requireRefProjection(entry, `artifact_refs[${index}]`);
    const ref = optionalString(projected.ref) ?? optionalString(projected.artifact_ref) ?? optionalString(projected.path);
    if (!ref) {
      throw new Error(`generated product-entry adapter artifact_refs[${index}] 缺少 ref`);
    }
    return {
      ref,
      ref_kind: optionalString(projected.ref_kind) ?? 'opaque_artifact_ref',
      role: optionalString(projected.role) ?? 'domain_declared_artifact_ref',
      body_included: false,
      write_permitted: false,
      opaque_to_opl: true,
    };
  });
}

export function buildGeneratedProductEntrySessionSurface(
  input: BuildGeneratedProductEntrySessionSurfaceInput,
) {
  const domainId = requireString(input.domain_id, 'domain_id');
  const domainOwner = requireString(input.domain_owner, 'domain_owner');
  const runtimeOwner = requireString(input.runtime_owner, 'runtime_owner');
  const continuationSnapshot = requireRefProjection(input.continuation_snapshot, 'continuation_snapshot');
  const familyOrchestration = requireRefProjection(input.family_orchestration, 'family_orchestration');
  const reviewProjection = requireRefProjection(input.review_projection, 'review_projection');
  const publicationProjection = requireRefProjection(input.publication_projection, 'publication_projection');
  const artifactLocatorContract = requireRefProjection(input.artifact_locator_contract, 'artifact_locator_contract');
  const deliveryIdentity = requireRefProjection(input.delivery_identity, 'delivery_identity');
  const domainProjection = normalizeDomainProjection(input.domain_projection);
  const entrySession = buildEntrySessionSurface({
    entry_session_id: requireString(input.entry_session_id, 'entry_session_id'),
    session_file: requireString(input.session_file, 'session_file'),
    runtime_owner: runtimeOwner,
  });
  const artifactRefs = artifactRefProjection(input.artifact_refs ?? []);
  const currentStatus = optionalString(continuationSnapshot.current_status)
    ?? optionalString(continuationSnapshot.status)
    ?? 'session_projection_available';
  const headline = optionalString(continuationSnapshot.headline)
    ?? optionalString(continuationSnapshot.latest_update)
    ?? 'Session projection available';
  const nextStep = optionalString(continuationSnapshot.next_step)
    ?? optionalString(reviewProjection.next_step)
    ?? optionalString(publicationProjection.next_step)
    ?? 'Follow the domain-owned next-action ref';
  const directProductEntryCommand = optionalString(input.direct_product_entry_command);
  const hostedHandoffRef = optionalString(input.opl_hosted_handoff_ref);
  const entrySessionId = requireString(input.entry_session_id, 'entry_session_id');
  const sessionFile = requireString(input.session_file, 'session_file');

  return {
    surface_kind: 'opl_generated_product_entry_session_surface',
    version: 'opl-generated-product-entry-session.v1',
    domain_id: domainId,
    domain_owner: domainOwner,
    runtime_owner: runtimeOwner,
    source: requireString(input.source, 'source'),
    entry_mode: requireString(input.entry_mode, 'entry_mode'),
    entry_session: entrySession,
    delivery_identity: deliveryIdentity,
    continuation_snapshot: continuationSnapshot,
    session_continuity: {
      surface_kind: 'opl_generated_session_continuity',
      domain_agent_id: domainId,
      runtime_owner: runtimeOwner,
      domain_owner: domainOwner,
      entry_session_id: entrySessionId,
      session_file: sessionFile,
      status: currentStatus,
      ...(directProductEntryCommand ? { direct_product_entry_command: directProductEntryCommand } : {}),
      ...(hostedHandoffRef ? { opl_hosted_handoff_ref: hostedHandoffRef } : {}),
    },
    progress_projection: {
      surface_kind: 'opl_generated_progress_projection',
      headline,
      latest_update: optionalString(continuationSnapshot.latest_update) ?? headline,
      next_step: nextStep,
      status_summary: currentStatus,
      entry_session_id: entrySessionId,
    },
    artifact_inventory: {
      surface_kind: 'opl_generated_artifact_locator_projection',
      artifact_locator_contract: artifactLocatorContract,
      refs: artifactRefs,
      summary: {
        artifact_ref_count: artifactRefs.length,
        artifact_body_count: 0,
      },
      body_included: false,
      write_permitted: false,
    },
    runtime_loop_closure: {
      surface_kind: 'opl_generated_runtime_loop_closure_projection',
      family_orchestration: familyOrchestration,
      review_projection: reviewProjection,
      publication_projection: publicationProjection,
      next_step: nextStep,
      owner_receipt_created: false,
      typed_blocker_created: false,
    },
    lifecycle: {
      surface_kind: 'opl_generated_product_entry_session_lifecycle',
      entry_session_id: entrySessionId,
      status: currentStatus,
      session_file: sessionFile,
      artifact_ref_count: artifactRefs.length,
    },
    summary: {
      entry_session_id: entrySessionId,
      status: currentStatus,
      headline,
      next_step: nextStep,
      artifact_ref_count: artifactRefs.length,
    },
    ...(domainProjection ? { domain_projection: domainProjection } : {}),
    authority_boundary: {
      generated_surface_only: true,
      diagnostic_and_refs_only: true,
      can_write_domain_truth: false,
      can_write_artifact_body: false,
      can_write_memory_body: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
      can_issue_domain_or_quality_or_export_verdict: false,
    },
  };
}

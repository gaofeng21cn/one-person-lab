import {
  DEFAULT_CALLER_OWNER_DECISION_ACCEPTED_RESULT_SHAPES,
  DEFAULT_CALLER_OWNER_DECISION_NEXT_REQUIRED_ACTION,
  DEFAULT_CALLER_PRIVATE_PLATFORM_CLEANUP_ALLOWED_DISPOSITIONS,
  DEFAULT_CALLER_PRIVATE_PLATFORM_CLEANUP_LANE_ID,
  DEFAULT_CALLER_PRIVATE_PLATFORM_RESIDUE_TARGET_KINDS,
} from './default-caller-retirement-guard.ts';
import type {
  DefaultCallerPrivatePlatformCleanupDisposition,
  DefaultCallerPrivatePlatformResidueTargetKind,
} from './default-caller-retirement-guard.ts';

type JsonRecord = Record<string, unknown>;

type PrivatePlatformResidueGateSource = {
  module_id?: string;
  code_paths?: string[];
  active_callers?: string[];
  active_caller_status?: string | null;
  migration_action?: string | null;
  private_platform_residue_gate?: {
    residue_kind: DefaultCallerPrivatePlatformResidueTargetKind;
    disposition: DefaultCallerPrivatePlatformCleanupDisposition;
    bridge_exit_gate: JsonRecord | null;
  } | null;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.map(optionalString).filter((entry): entry is string => Boolean(entry))
    : [];
}

function residueKind(value: unknown): DefaultCallerPrivatePlatformResidueTargetKind | null {
  const text = optionalString(value);
  return text
    && (DEFAULT_CALLER_PRIVATE_PLATFORM_RESIDUE_TARGET_KINDS as readonly string[]).includes(text)
    ? text as DefaultCallerPrivatePlatformResidueTargetKind
    : null;
}

function cleanupDisposition(value: unknown): DefaultCallerPrivatePlatformCleanupDisposition | null {
  const text = optionalString(value);
  return text
    && (DEFAULT_CALLER_PRIVATE_PLATFORM_CLEANUP_ALLOWED_DISPOSITIONS as readonly string[]).includes(text)
    ? text as DefaultCallerPrivatePlatformCleanupDisposition
    : null;
}

export function privatePlatformResidueGateFromRecord(record: JsonRecord) {
  const gate = isRecord(record.private_platform_residue_gate)
    ? record.private_platform_residue_gate
    : null;
  if (!gate) {
    return null;
  }
  const kind = residueKind(gate.residue_kind);
  const disposition = cleanupDisposition(gate.disposition);
  if (!kind || !disposition) {
    return null;
  }
  return {
    residue_kind: kind,
    disposition,
    bridge_exit_gate: isRecord(gate.bridge_exit_gate) ? gate.bridge_exit_gate : null,
  };
}

export function buildPrivatePlatformResidueDeletionGate(
  sources: PrivatePlatformResidueGateSource[],
) {
  const items = sources.flatMap((source) => {
    const gate = source.private_platform_residue_gate;
    if (!gate) {
      return [];
    }
    return [{
      module_id: optionalString(source.module_id) ?? 'unknown_private_platform_residue',
      residue_kind: gate.residue_kind,
      disposition: gate.disposition,
      code_paths: stringList(source.code_paths),
      active_callers: stringList(source.active_callers),
      active_caller_status: optionalString(source.active_caller_status),
      migration_action: optionalString(source.migration_action),
      bridge_exit_gate: gate.bridge_exit_gate,
    }];
  });
  const dispositionSummary = Object.fromEntries(
    DEFAULT_CALLER_PRIVATE_PLATFORM_CLEANUP_ALLOWED_DISPOSITIONS.map((disposition) => [
      disposition,
      items.filter((item) => item.disposition === disposition).length,
    ]),
  );
  const byResidueKind = Object.fromEntries(
    DEFAULT_CALLER_PRIVATE_PLATFORM_RESIDUE_TARGET_KINDS.map((kind) => [
      kind,
      items.filter((item) => item.residue_kind === kind),
    ]),
  );
  return {
    surface_kind: 'opl_private_platform_residue_deletion_gate',
    lane_id: DEFAULT_CALLER_PRIVATE_PLATFORM_CLEANUP_LANE_ID,
    status: items.length > 0 ? 'classified' : 'empty',
    residue_gate_count: items.length,
    allowed_dispositions: [...DEFAULT_CALLER_PRIVATE_PLATFORM_CLEANUP_ALLOWED_DISPOSITIONS],
    residue_target_kinds: [...DEFAULT_CALLER_PRIVATE_PLATFORM_RESIDUE_TARGET_KINDS],
    disposition_summary: dispositionSummary,
    residue_gate_summary: dispositionSummary,
    by_residue_kind: byResidueKind,
    items,
    next_required_owner_action: DEFAULT_CALLER_OWNER_DECISION_NEXT_REQUIRED_ACTION,
    accepted_refs_only_result_shapes: [
      ...DEFAULT_CALLER_OWNER_DECISION_ACCEPTED_RESULT_SHAPES,
    ],
    physical_delete_authorized: false,
    default_caller_delete_ready: false,
    cleanup_lane_can_authorize_physical_delete: false,
    physical_delete_authorization_status: 'not_authorized_by_opl_projection',
    authority_boundary: {
      cleanup_lane_can_delete_domain_repo_files: false,
      cleanup_lane_can_write_domain_truth: false,
      cleanup_lane_can_sign_domain_owner_receipt: false,
      cleanup_lane_can_authorize_quality_or_export: false,
      cleanup_lane_can_authorize_domain_repo_physical_delete: false,
    },
  };
}

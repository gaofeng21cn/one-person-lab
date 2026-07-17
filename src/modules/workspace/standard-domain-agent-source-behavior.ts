import fs from 'node:fs';
import path from 'node:path';

import { buildFunctionalPrivatizationAudit } from '../pack/index.ts';
import {
  gitTrackedOrWalkedFiles,
  isRecord,
  optionalString,
  readJsonFile,
  unique,
} from '../pack/index.ts';
import type {
  FunctionalPrivatizationAuditItem,
  FunctionalPrivatizationMigrationClass,
} from '../pack/index.ts';

type SourceBehaviorSignature = {
  signature_id: string;
  opl_owner_surface: string;
  path_pattern?: RegExp;
  content_patterns?: RegExp[];
};

const ACTIVE_SOURCE_ROOTS = [
  'src/',
  'scripts/',
  'runtime/',
  'packages/',
  'apps/',
  'bin/',
];

const EXCLUDED_SOURCE_PREFIXES = [
  'docs/',
  'contracts/',
  'tests/',
  'test/',
  'fixtures/',
  'runtime/fixtures/',
  'runtime/authority_functions/',
  'node_modules/',
  'dist/',
  'build/',
  'coverage/',
];

const EXECUTABLE_SOURCE_EXTENSIONS = new Set([
  '.bash',
  '.cjs',
  '.go',
  '.js',
  '.mjs',
  '.py',
  '.rs',
  '.sh',
  '.ts',
  '.tsx',
  '.zsh',
]);

const TEST_OR_SPEC_PATH = /(?:^|\/)(?:test|tests|spec|specs|[^/]*[._-](?:test|spec))(?=\/|[._-]|$)/i;

const SOURCE_BEHAVIOR_SIGNATURES: SourceBehaviorSignature[] = [
  {
    signature_id: 'repo_owned_scheduler_or_daemon',
    opl_owner_surface: 'OPL Runway provider scheduler',
    content_patterns: [
      /\bsetInterval\s*\(/,
      /\bAPScheduler\b/,
      /\bschedule\.every\s*\(/,
      /\bnode-cron\b/,
      /\blaunchctl\s+(?:bootstrap|kickstart|load)\b/,
    ],
  },
  {
    signature_id: 'repo_owned_queue_or_session_store',
    opl_owner_surface: 'OPL Runway attempt ledger and session lifecycle',
    content_patterns: [
      /\bretry_waiting\b/,
      /\bdead_letter(?:ed)?\b/,
      /\bqueue\.sqlite\b/,
      /\bsession[_-]store\b/i,
      /\btask[_-]queue\b/i,
    ],
  },
  {
    signature_id: 'repo_owned_codex_executor_envelope',
    opl_owner_surface: 'OPL Runway executor envelope',
    content_patterns: [
      /\bcodex\s+exec\b/i,
      /\b(?:spawn|execFile|Popen|subprocess\.run)\b[^\n]{0,240}\bcodex\b/i,
    ],
  },
  {
    signature_id: 'repo_owned_product_status_session_shell',
    opl_owner_surface: 'OPL Pack and Console generated product surfaces',
    path_pattern: /(?:product[_-](?:entry|status|session)|runtime[_-]watch|status[_-]sidecar|workbench|quickstart)/i,
  },
  {
    signature_id: 'repo_owned_artifact_or_memory_lifecycle_shell',
    opl_owner_surface: 'OPL Workspace and Ledger lifecycle shell',
    path_pattern: /(?:(?:artifact|memory).*(?:lifecycle|registry)|project[_-]hygiene|source[_-]byproduct)/i,
    content_patterns: [
      /\b(?:cleanup|restore|scan|registry|readiness|cache)\b/i,
    ],
  },
  {
    signature_id: 'repo_owned_workspace_cockpit',
    opl_owner_surface: 'OPL Console workspace cockpit',
    content_patterns: [
      /\battention[_-]queue\b/i,
      /\boperator[_-]brief\b/i,
      /\bworkspace[_-]health\b/i,
    ],
  },
  {
    signature_id: 'repo_owned_execution_admission_shell',
    opl_owner_surface: 'OPL Runway execution admission',
    content_patterns: [
      /\bdeveloper[_-]supervisor\b/i,
      /\brepo[_-]write[_-]policy\b/i,
      /\bgithub[_-]identity\b/i,
    ],
  },
  {
    signature_id: 'repo_owned_source_or_memory_transport',
    opl_owner_surface: 'OPL Connect, Workspace, and Ledger transport',
    content_patterns: [
      /\bpublication[_-]memory[_-]locator\b/i,
      /\bbibtex[_-]registry\b/i,
      /\bsource[_-]materializer\b/i,
      /\bmemory[_-]writeback[_-]transport\b/i,
    ],
  },
  {
    signature_id: 'repo_owned_receipt_observability_shell',
    opl_owner_surface: 'OPL Ledger and Console receipt observability',
    content_patterns: [
      /\breceipt[_-]slo\b/i,
      /\breceipt[_-](?:counter|counting|observability)\b/i,
      /\boperator[_-]receipt[_-]projection\b/i,
    ],
  },
  {
    signature_id: 'repo_owned_workspace_schema_engine',
    opl_owner_surface: 'OPL Workspace scaffold and schema validation',
    path_pattern: /workspace/i,
    content_patterns: [
      /\bschema[_-]subset\b/i,
      /\bworkspace[_-]scaffold\b/i,
      /\bvalidate[_-]workspace\b/i,
    ],
  },
  {
    signature_id: 'repo_owned_evaluation_ledger_or_runner',
    opl_owner_surface: 'OPL Foundry Kernel ledger and execution',
    content_patterns: [
      /\b(?:promotion|mechanism|scaleout|learning[_-]candidate)[_-]ledger\b/i,
      /\bagent[_-]lab[_-](?:suite|runner|ledger)\b/i,
    ],
  },
  {
    signature_id: 'repo_owned_agent_materializer',
    opl_owner_surface: 'OPL Foundry Kernel work-order execution',
    path_pattern: /(?:takeover|agent[_-]lab).*(?:materializ|suite)|materializ.*(?:agent|suite)/i,
  },
  {
    signature_id: 'repo_owned_native_helper_envelope',
    opl_owner_surface: 'OPL Pack native-helper envelope',
    content_patterns: [
      /\bnative[_-]helper[_-]receipt\b/i,
      /\bhelper[_-]receipt[_-]envelope\b/i,
      /\b(?:tool|dependency)[_-]probe[_-]receipt\b/i,
    ],
  },
  {
    signature_id: 'repo_owned_review_repair_transport',
    opl_owner_surface: 'OPL Stagecraft and Pack transport',
    content_patterns: [
      /\breview[_-]repair[_-]transport\b/i,
      /\boperator[_-]evidence[_-]transport\b/i,
      /\bartifact[_-]handoff[_-]shell\b/i,
    ],
  },
];

const LEGAL_DECLARED_MIGRATION_CLASSES = new Set<FunctionalPrivatizationMigrationClass>([
  'declarative_pack',
  'minimal_authority_function',
  'refs_only_domain_adapter',
  'opl_storage_substrate_mas_refs_projection',
  'provenance_or_fixture',
  'domain_authority',
  'retire_tombstone',
]);

const ACTIVE_PRIVATE_MIGRATION_CLASSES = new Set<FunctionalPrivatizationMigrationClass>([
  'opl_owned_replacement',
  'opl_hosted_surface',
  'opl_generated_surface',
  'temporary_migration_bridge',
]);

function isActiveExecutableSource(relativePath: string) {
  if (!ACTIVE_SOURCE_ROOTS.some((root) => relativePath.startsWith(root))) {
    return false;
  }
  if (EXCLUDED_SOURCE_PREFIXES.some((prefix) => relativePath.startsWith(prefix))) {
    return false;
  }
  if (TEST_OR_SPEC_PATH.test(relativePath)) {
    return false;
  }
  return EXECUTABLE_SOURCE_EXTENSIONS.has(path.extname(relativePath).toLowerCase());
}

function firstContentMatch(content: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = pattern.exec(content);
    if (match) {
      return {
        matched_term: match[0],
        line: content.slice(0, match.index).split('\n').length,
      };
    }
  }
  return null;
}

function sourceBehaviorMatches(relativePath: string, content: string) {
  return SOURCE_BEHAVIOR_SIGNATURES.flatMap((signature) => {
    if (signature.path_pattern && !signature.path_pattern.test(relativePath)) {
      return [];
    }
    const contentMatch = signature.content_patterns
      ? firstContentMatch(content, signature.content_patterns)
      : { matched_term: path.basename(relativePath), line: 1 };
    if (!contentMatch) {
      return [];
    }
    return [{
      signature_id: signature.signature_id,
      opl_owner_surface: signature.opl_owner_surface,
      path: relativePath,
      line: contentMatch.line,
      matched_term: contentMatch.matched_term,
    }];
  });
}

function normalizedAuditPath(value: string) {
  return value
    .replaceAll('\\', '/')
    .replace(/^\.\/+/, '')
    .replace(/\/+$/, '');
}

function auditPathCoversSource(auditPath: string, relativePath: string) {
  const normalized = normalizedAuditPath(auditPath);
  return normalized.length > 0
    && (relativePath === normalized || relativePath.startsWith(`${normalized}/`));
}

function functionalAuditItems(repoDir: string) {
  const functionalAudit = readJsonFile(repoDir, 'contracts/functional_privatization_audit.json');
  const payload = functionalAudit.payload;
  return buildFunctionalPrivatizationAudit(isRecord(payload)
    ? {
        target_domain_id: optionalString(payload.target_domain_id),
        functional_privatization_audit: payload,
      }
    : null).modules;
}

function auditCoverageForPath(items: FunctionalPrivatizationAuditItem[], relativePath: string) {
  return items.filter((item) =>
    item.code_paths.some((auditPath) => auditPathCoversSource(auditPath, relativePath))
  );
}

function diagnosticCleanupHasActiveCaller(item: FunctionalPrivatizationAuditItem) {
  const status = item.active_caller_status?.toLowerCase() ?? '';
  if (/no[_\s-]+active[_\s-]+caller/.test(status)) {
    return false;
  }
  return item.active_caller_allowed || item.active_callers.length > 0;
}

function isActivePrivateAuditItem(item: FunctionalPrivatizationAuditItem) {
  if (item.blocker || ACTIVE_PRIVATE_MIGRATION_CLASSES.has(item.migration_class)) {
    return true;
  }
  if (item.migration_class === 'diagnostic_cleanup_path') {
    return diagnosticCleanupHasActiveCaller(item);
  }
  return !LEGAL_DECLARED_MIGRATION_CLASSES.has(item.migration_class);
}

function evaluateMatch(
  match: ReturnType<typeof sourceBehaviorMatches>[number],
  auditItems: FunctionalPrivatizationAuditItem[],
) {
  const coverage = auditCoverageForPath(auditItems, match.path);
  const disposition = coverage.length === 0
    ? 'unclassified_generic_behavior'
    : coverage.some(isActivePrivateAuditItem)
      ? 'active_private_generic_residue'
      : 'declared_domain_boundary_evidence';
  return {
    ...match,
    audit_disposition: disposition,
    audit_coverage: coverage.map((item) => ({
      module_id: item.module_id,
      migration_class: item.migration_class,
      active_caller_status: item.active_caller_status,
      active_caller_allowed: item.active_caller_allowed,
      active_callers: item.active_callers,
      code_paths: item.code_paths,
    })),
  };
}

export function buildStandardAgentSourceBehaviorChecks(repoDir: string) {
  const sourceFiles = gitTrackedOrWalkedFiles(repoDir).filter(isActiveExecutableSource);
  const auditItems = functionalAuditItems(repoDir);
  const matches = sourceFiles.flatMap((relativePath) => {
    try {
      return sourceBehaviorMatches(relativePath, fs.readFileSync(path.join(repoDir, relativePath), 'utf8'));
    } catch {
      return [];
    }
  }).map((match) => evaluateMatch(match, auditItems));
  const blockingMatches = matches.filter((match) =>
    match.audit_disposition !== 'declared_domain_boundary_evidence'
  );
  const allowedMatches = matches.filter((match) =>
    match.audit_disposition === 'declared_domain_boundary_evidence'
  );
  const blockers = unique(blockingMatches.map((match) =>
    `source_behavior_generic_capability_residue:${match.signature_id}:${match.path}`
  ));
  return {
    surface_kind: 'opl_standard_agent_source_behavior_checks',
    owner: 'one-person-lab',
    status: blockers.length === 0 ? 'passed' : 'blocked',
    scan_policy: 'opl_owned_signatures_cross_checked_against_canonical_functional_privatization_audit',
    scanned_source_file_count: sourceFiles.length,
    detected_source_behavior_count: matches.length,
    matched_source_behavior_count: blockingMatches.length,
    allowed_source_behavior_count: allowedMatches.length,
    unclassified_generic_behavior_count: blockingMatches.filter((match) =>
      match.audit_disposition === 'unclassified_generic_behavior'
    ).length,
    active_private_generic_residue_count: blockingMatches.filter((match) =>
      match.audit_disposition === 'active_private_generic_residue'
    ).length,
    declared_domain_boundary_evidence_count: allowedMatches.length,
    matched_signature_ids: unique(blockingMatches.map((match) => match.signature_id)),
    allowed_signature_ids: unique(allowedMatches.map((match) => match.signature_id)),
    matches: blockingMatches,
    allowed_matches: allowedMatches,
    blockers,
    authority_boundary: {
      source_scan_can_write_domain_repo: false,
      source_scan_can_delete_domain_files: false,
      source_scan_can_claim_domain_ready: false,
      source_scan_can_replace_domain_authority: false,
    },
  };
}

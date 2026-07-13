import path from 'node:path';

import {
  buildClosureDigest,
  buildObservedEffects,
  buildSourceDigests,
  loadSourceClosureEffectContract,
  reachableSymbolIds,
  resolveSourceClosureEntrypoints,
} from './standard-agent-source-closure-parts/analysis.ts';
import { discoverSourceClosureEntrypoints } from './standard-agent-source-closure-parts/entrypoints.ts';
import { buildPythonSourceGraph } from './standard-agent-source-closure-parts/python-graph.ts';
import {
  activeSourceFiles,
  parseSourceClosureArgs,
  readSourceClosureDomainId,
  repoFiles,
  type SourceClosureRepoInput,
} from './standard-agent-source-closure-parts/repo-inputs.ts';
import { buildTypescriptSourceGraph } from './standard-agent-source-closure-parts/typescript-graph.ts';
import type {
  SourceClosureAuditMismatch,
  SourceClosureCallEdge,
  SourceClosureGraphScan,
  SourceClosureObservedCall,
  SourceClosureRepoReport,
  SourceClosureSymbol,
  SourceClosureUnresolvedEdge,
} from './standard-agent-source-closure-parts/types.ts';

function uniqueBy<T>(values: T[], key: (value: T) => string) {
  return [...new Map(values.map((value) => [key(value), value])).values()];
}

function combinedGraph(scans: SourceClosureGraphScan[]) {
  return {
    scan_complete: scans.every((scan) => scan.scan_complete),
    symbols: uniqueBy(
      scans.flatMap((scan) => scan.symbols),
      (symbol: SourceClosureSymbol) => symbol.symbol_id,
    ).sort((left, right) => left.symbol_id.localeCompare(right.symbol_id)),
    call_edges: uniqueBy(
      scans.flatMap((scan) => scan.call_edges),
      (edge: SourceClosureCallEdge) => `${edge.from_symbol}:${edge.to_symbol}:${edge.line}:${edge.edge_kind}`,
    ).sort((left, right) => (
      `${left.from_symbol}:${left.line}:${left.to_symbol}`.localeCompare(`${right.from_symbol}:${right.line}:${right.to_symbol}`)
    )),
    unresolved_edges: uniqueBy(
      scans.flatMap((scan) => scan.unresolved_edges),
      (edge: SourceClosureUnresolvedEdge) => `${edge.file}:${edge.line}:${edge.reason}:${edge.expression}`,
    ).sort((left, right) => (
      `${left.file}:${left.line}:${left.reason}`.localeCompare(`${right.file}:${right.line}:${right.reason}`)
    )),
    observed_calls: uniqueBy(
      scans.flatMap((scan) => scan.observed_calls),
      (call: SourceClosureObservedCall) => `${call.symbol_id}:${call.line}:${call.source_text}`,
    ),
    diagnostics: [...new Set(scans.flatMap((scan) => scan.diagnostics))].sort(),
  };
}

function blockerList(input: {
  scanComplete: boolean;
  entrypointCount: number;
  unresolvedEntrypointCount: number;
  unresolvedEdgeCount: number;
  auditMismatchCount: number;
  unreachableResidueCount: number;
  privateGenericEffectCount: number;
}) {
  return [
    input.scanComplete ? null : 'source_scan_incomplete',
    input.entrypointCount > 0 ? null : 'source_closure_entrypoints_missing',
    input.unresolvedEntrypointCount === 0
      ? null
      : `source_closure_entrypoints_unresolved:${input.unresolvedEntrypointCount}`,
    input.unresolvedEdgeCount === 0
      ? null
      : `source_closure_edges_unresolved:${input.unresolvedEdgeCount}`,
    input.auditMismatchCount === 0
      ? null
      : `source_closure_audit_mismatches:${input.auditMismatchCount}`,
    input.unreachableResidueCount === 0
      ? null
      : `source_closure_unreachable_sensitive_residue:${input.unreachableResidueCount}`,
    input.privateGenericEffectCount === 0
      ? null
      : `source_closure_private_generic_effects:${input.privateGenericEffectCount}`,
  ].filter((item): item is string => Boolean(item));
}

export function buildStandardAgentSourceClosureForRepo(
  repoDir: string,
  requestedAgentId: string | null = null,
): SourceClosureRepoReport {
  const resolvedRepoDir = path.resolve(repoDir);
  const contract = loadSourceClosureEffectContract();
  const currentRepoFiles = repoFiles(resolvedRepoDir);
  const activeFiles = activeSourceFiles(currentRepoFiles, contract);
  const pythonFiles = activeFiles.filter((file) => file.endsWith('.py'));
  const typescriptFiles = activeFiles.filter((file) => /\.[cm]?[jt]sx?$/.test(file));
  const pythonGraph = buildPythonSourceGraph(resolvedRepoDir, pythonFiles);
  const typescriptGraph = buildTypescriptSourceGraph(resolvedRepoDir, typescriptFiles);
  const graph = combinedGraph([pythonGraph, typescriptGraph]);
  const discoveredEntrypoints = discoverSourceClosureEntrypoints(
    resolvedRepoDir,
    activeFiles,
    pythonGraph.pyproject_scripts ?? {},
    currentRepoFiles,
  );
  const entryResolution = resolveSourceClosureEntrypoints(discoveredEntrypoints, graph.symbols);
  const reachable = reachableSymbolIds(entryResolution.entrypoints, graph.call_edges);
  const sourceDigests = buildSourceDigests(resolvedRepoDir, activeFiles);
  const effectAnalysis = buildObservedEffects({
    repoDir: resolvedRepoDir,
    calls: graph.observed_calls,
    symbols: graph.symbols,
    sourceDigests,
    reachable,
    entrypoints: entryResolution.entrypoints,
    contract,
  });
  const excludedDeveloperToolEdges = graph.unresolved_edges.filter((edge) => (
    effectAnalysis.developer_tool_edge_exclusions.some((exclusion) => (
      exclusion.symbol_id === edge.from_symbol
      && exclusion.allowed_reasons.includes(edge.reason)
    ))
  ));
  const unresolvedEdges = graph.unresolved_edges.filter((edge) => (
    !excludedDeveloperToolEdges.includes(edge)
  ));
  const auditMismatches: SourceClosureAuditMismatch[] = [
    ...entryResolution.mismatches,
    ...effectAnalysis.audit_mismatches,
  ].sort((left, right) => (
    `${left.file}:${left.symbol}:${left.mismatch_kind}:${left.detail}`
      .localeCompare(`${right.file}:${right.symbol}:${right.mismatch_kind}:${right.detail}`)
  ));
  const reachableSymbols = graph.symbols.filter((symbol) => reachable.has(symbol.symbol_id));
  const unreachableSensitiveResidue = effectAnalysis.observed_effects.filter((effect) => (
    !effect.reachable && effect.audit_status !== 'developer_tool_exact'
  ));
  const privateGenericEffectCount = effectAnalysis.observed_effects.filter((effect) => (
    effect.private_generic_effect
  )).length;
  const unresolvedEntrypointCount = entryResolution.entrypoints.filter((entry) => (
    entry.resolution_status !== 'resolved'
  )).length;
  const blockers = blockerList({
    scanComplete: graph.scan_complete,
    entrypointCount: entryResolution.entrypoints.length,
    unresolvedEntrypointCount,
    unresolvedEdgeCount: unresolvedEdges.length,
    auditMismatchCount: auditMismatches.length,
    unreachableResidueCount: unreachableSensitiveResidue.length,
    privateGenericEffectCount,
  });
  const digestPayload = {
    contract_version: contract.version,
    domain_id: readSourceClosureDomainId(resolvedRepoDir, requestedAgentId),
    entrypoints: entryResolution.entrypoints,
    reachable_symbols: reachableSymbols,
    call_edges: graph.call_edges,
    unresolved_edges: unresolvedEdges,
    excluded_developer_tool_edges: excludedDeveloperToolEdges,
    observed_effects: effectAnalysis.observed_effects,
    unreachable_sensitive_residue: unreachableSensitiveResidue,
    audit_mismatches: auditMismatches,
    source_digests: sourceDigests,
  };
  return {
    repo_dir: resolvedRepoDir,
    requested_agent_id: requestedAgentId,
    domain_id: readSourceClosureDomainId(resolvedRepoDir, requestedAgentId),
    status: blockers.length === 0 ? 'passed' : 'blocked',
    scan_complete: graph.scan_complete,
    entrypoints: entryResolution.entrypoints,
    reachable_symbols: reachableSymbols,
    call_edges: graph.call_edges,
    unresolved_edges: unresolvedEdges,
    excluded_developer_tool_edges: excludedDeveloperToolEdges,
    observed_effects: effectAnalysis.observed_effects,
    unreachable_sensitive_residue: unreachableSensitiveResidue,
    audit_mismatches: auditMismatches,
    source_digests: sourceDigests,
    closure_digest: buildClosureDigest(digestPayload),
    blockers: [...graph.diagnostics, ...blockers],
  };
}

function buildReports(inputs: SourceClosureRepoInput[]) {
  return inputs.map((input) => buildStandardAgentSourceClosureForRepo(
    input.repo_dir,
    input.requested_agent_id,
  ));
}

export function buildStandardAgentSourceClosureReport(args: string[]) {
  const reports = buildReports(parseSourceClosureArgs(args));
  const blockedCount = reports.filter((report) => report.status === 'blocked').length;
  const scanComplete = reports.every((report) => report.scan_complete);
  return {
    version: 'g1',
    standard_agent_source_closure: {
      surface_kind: 'opl_standard_agent_source_closure_report',
      version: 'standard-agent-source-closure.v1',
      owner: 'one-person-lab',
      status: blockedCount === 0 ? 'passed' : 'blocked',
      scan_complete: scanComplete,
      effect_contract_ref: 'contracts/opl-framework/standard-agent-source-closure-effect-contract.json',
      summary: {
        total_repo_count: reports.length,
        passed_count: reports.length - blockedCount,
        blocked_count: blockedCount,
        scan_complete: scanComplete,
        entrypoint_count: reports.reduce((total, report) => total + report.entrypoints.length, 0),
        reachable_symbol_count: reports.reduce((total, report) => total + report.reachable_symbols.length, 0),
        call_edge_count: reports.reduce((total, report) => total + report.call_edges.length, 0),
        unresolved_edge_count: reports.reduce((total, report) => total + report.unresolved_edges.length, 0),
        observed_effect_count: reports.reduce((total, report) => total + report.observed_effects.length, 0),
        private_generic_effect_count: reports.reduce(
          (total, report) => total + report.observed_effects.filter((effect) => effect.private_generic_effect).length,
          0,
        ),
        unreachable_sensitive_residue_count: reports.reduce(
          (total, report) => total + report.unreachable_sensitive_residue.length,
          0,
        ),
        audit_mismatch_count: reports.reduce((total, report) => total + report.audit_mismatches.length, 0),
      },
      reports,
      authority_boundary: {
        report_can_write_domain_truth: false,
        report_can_sign_owner_receipt: false,
        report_can_create_typed_blocker: false,
        report_can_authorize_private_generic_runtime: false,
        report_can_claim_domain_ready: false,
        report_can_claim_production_ready: false,
      },
    },
  };
}

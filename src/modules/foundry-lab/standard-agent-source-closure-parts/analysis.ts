import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  SourceClosureAuditEntry,
  SourceClosureAuditMismatch,
  SourceClosureCallEdge,
  SourceClosureEffectContract,
  SourceClosureEffectKind,
  SourceClosureEntrypoint,
  SourceClosureObservedCall,
  SourceClosureObservedEffect,
  SourceClosureSymbol,
} from './types.ts';

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function sha256(value: string | Buffer) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

export function loadSourceClosureEffectContract(): SourceClosureEffectContract {
  const contractPath = fileURLToPath(new URL(
    '../../../../contracts/opl-framework/standard-agent-source-closure-effect-contract.json',
    import.meta.url,
  ));
  return JSON.parse(fs.readFileSync(contractPath, 'utf8')) as SourceClosureEffectContract;
}

export function buildSourceDigests(repoDir: string, files: string[]) {
  return Object.fromEntries(files.map((file) => [
    file,
    sha256(fs.readFileSync(path.join(repoDir, file))),
  ]));
}

export function resolveSourceClosureEntrypoints(
  entrypoints: SourceClosureEntrypoint[],
  symbols: SourceClosureSymbol[],
) {
  const byId = new Map(symbols.map((symbol) => [symbol.symbol_id, symbol]));
  const resolved = entrypoints.map((entry) => {
    if (entry.hosted_by_opl) {
      return entry;
    }
    const exactId = entry.file && entry.symbol ? `${entry.file}#${entry.symbol}` : null;
    const target = exactId ? byId.get(exactId) : null;
    const moduleTarget = entry.module_name
      ? symbols.find((symbol) => (
          symbol.language === 'python'
          && symbol.module_name === entry.module_name
          && symbol.symbol === (entry.symbol ?? '<module>')
        ))
      : null;
    const matched = target ?? moduleTarget ?? null;
    return {
      ...entry,
      language: matched?.language ?? entry.language,
      file: matched?.file ?? entry.file,
      resolution_status: matched ? 'resolved' as const : 'unresolved' as const,
      resolved_symbol_id: matched?.symbol_id ?? null,
    };
  });
  const mismatches: SourceClosureAuditMismatch[] = resolved
    .filter((entry) => entry.resolution_status !== 'resolved')
    .map((entry) => ({
      mismatch_kind: entry.hosted_by_opl
        ? 'hosted_entry_unverified' as const
        : 'entrypoint_unresolved' as const,
      file: entry.file,
      symbol: entry.symbol,
      effect_kind: null,
      detail: `${entry.entrypoint_id}:${entry.declared_ref}`,
    }));
  return { entrypoints: resolved, mismatches };
}

export function reachableSymbolIds(
  entrypoints: SourceClosureEntrypoint[],
  callEdges: SourceClosureCallEdge[],
) {
  const reachable = new Set(entrypoints.flatMap((entry) => (
    entry.resolved_symbol_id ? [entry.resolved_symbol_id] : []
  )));
  const outgoing = new Map<string, string[]>();
  for (const edge of callEdges) {
    outgoing.set(edge.from_symbol, [...(outgoing.get(edge.from_symbol) ?? []), edge.to_symbol]);
  }
  const queue = [...reachable];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const target of outgoing.get(current) ?? []) {
      if (!reachable.has(target)) {
        reachable.add(target);
        queue.push(target);
      }
    }
  }
  return reachable;
}

function effectTarget(call: SourceClosureObservedCall) {
  const target = call.literal_arguments[0];
  return target && target !== '<dynamic>' ? target : null;
}

function openIsWrite(call: SourceClosureObservedCall) {
  if (!/(?:^|\.)open$/.test(call.callee)) {
    return true;
  }
  if (/(?:^|\.)os\.open$/.test(call.callee)) {
    const flagsExpression = call.argument_expressions[1] ?? '';
    if (/\bO_(?:WRONLY|RDWR|APPEND|CREAT|TRUNC|EXCL|TMPFILE)\b/.test(flagsExpression)) {
      return true;
    }
    if (/\bO_RDONLY\b/.test(flagsExpression) || call.literal_arguments[1] === '0') {
      return false;
    }
    return true;
  }
  if (call.callee === 'PIL.Image.open') {
    return false;
  }
  if (call.callee === 'tarfile.open') {
    const keywordMode = call.literal_arguments.find((argument) => argument.startsWith('mode='));
    const positionalMode = call.literal_arguments[1];
    const mode = keywordMode?.slice('mode='.length)
      ?? (positionalMode?.includes('=') ? undefined : positionalMode);
    return mode === '<dynamic>' || (mode !== undefined && /[wax+]/i.test(mode));
  }
  const keywordMode = call.literal_arguments.find((argument) => argument.startsWith('mode='));
  const positionalModeIndex = /(?:^|\.)(?:fs|fsp|promises)\.open$/.test(call.callee)
    || call.callee === 'open'
    ? 1
    : 0;
  const positionalMode = call.literal_arguments[positionalModeIndex];
  const mode = keywordMode?.slice('mode='.length)
    ?? (positionalMode?.includes('=') ? undefined : positionalMode);
  if (mode === undefined) {
    return false;
  }
  return mode === '<dynamic>' || /[wax+]/i.test(mode);
}

function databaseCallIsWrite(call: SourceClosureObservedCall) {
  if (!/(?:^|\.)(?:execute|executemany|executescript)$/.test(call.callee)) {
    return true;
  }
  const statement = call.literal_arguments[0];
  if (!statement || statement === '<dynamic>') {
    return true;
  }
  return /^\s*(?:alter|create|delete|drop|insert|replace|update)\b/i.test(statement);
}

function matchesEffect(
  call: SourceClosureObservedCall,
  effectKind: SourceClosureEffectKind,
  contract: SourceClosureEffectContract,
) {
  if (effectKind === 'executor_invoke') {
    const processPatterns = contract.effect_kinds.process_spawn.callee_patterns;
    const processSpawn = processPatterns.some((pattern) => new RegExp(pattern).test(call.callee));
    if (!processSpawn) {
      return false;
    }
    const commandTarget = call.literal_arguments[0];
    const command = commandTarget && commandTarget !== '<dynamic>'
      ? commandTarget.toLowerCase()
      : '';
    return /(?:^|[\s/])codex(?:\s|$)/.test(command)
      || /(?:^|[\s/])opl(?:\s|$)/.test(command);
  }
  const patterns = contract.effect_kinds[effectKind].callee_patterns;
  const matched = patterns.some((pattern) => new RegExp(pattern).test(call.callee));
  if (!matched) {
    return false;
  }
  if (effectKind === 'filesystem_write') {
    return openIsWrite(call);
  }
  if (effectKind === 'database_write') {
    return databaseCallIsWrite(call);
  }
  return true;
}

function auditDocument(repoDir: string, contract: SourceClosureEffectContract) {
  const auditPath = path.join(repoDir, contract.audit_contract_path);
  if (!fs.existsSync(auditPath)) {
    return null;
  }
  try {
    return record(JSON.parse(fs.readFileSync(auditPath, 'utf8')));
  } catch {
    return {};
  }
}

function exactDescriptorRelativeSource(descriptorPath: string, sourceRef: string) {
  const normalizedRef = sourceRef.replace(/\\/g, '/');
  if (
    path.posix.isAbsolute(normalizedRef)
    || normalizedRef.split('/').includes('..')
    || /[*?{}[\]]/.test(normalizedRef)
    || normalizedRef.endsWith('/')
  ) {
    return null;
  }
  const joined = path.posix.normalize(path.posix.join(path.posix.dirname(descriptorPath), normalizedRef));
  return joined.startsWith('../') ? null : joined;
}

function nativeHelperAuditEntries(input: {
  repoDir: string;
  contract: SourceClosureEffectContract;
  symbols: SourceClosureSymbol[];
  sourceDigests: Record<string, string>;
  entrypoints: SourceClosureEntrypoint[];
}) {
  const entries: SourceClosureAuditEntry[] = [];
  const mismatches: SourceClosureAuditMismatch[] = [];
  const descriptorPaths = [...new Set(input.entrypoints
    .filter((entry) => entry.source_kind === 'native_helper_descriptor')
    .map((entry) => entry.declared_ref.split('#')[0]))];
  const allowedEffects = new Set(input.contract.audit_contract.native_helper_carrier_allowed_effects);
  const allowedTargetPolicies = new Set(input.contract.audit_contract.native_helper_carrier_target_policies);
  for (const descriptorPath of descriptorPaths) {
    let descriptor: JsonRecord;
    try {
      descriptor = record(JSON.parse(fs.readFileSync(path.join(input.repoDir, descriptorPath), 'utf8')));
    } catch {
      mismatches.push({
        mismatch_kind: 'native_helper_source_closure_invalid',
        file: descriptorPath,
        symbol: null,
        effect_kind: null,
        detail: 'native_helper_descriptor_unreadable_or_invalid_json',
      });
      continue;
    }
    const sourceClosure = record(descriptor.source_closure);
    if (Object.keys(sourceClosure).length === 0) {
      continue;
    }
    const authorityBoundary = record(descriptor.authority_boundary);
    const requiredCommands = Array.isArray(descriptor.required_commands)
      ? descriptor.required_commands.filter((value): value is string => typeof value === 'string')
      : [];
    if (
      descriptor.surface_kind !== 'opl_pack_native_helper_probe_descriptor'
      || descriptor.schema_version !== 1
      || sourceClosure.surface_kind !== 'opl_native_helper_source_closure'
      || sourceClosure.version !== 'opl-native-helper-source-closure.v1'
      || !Array.isArray(sourceClosure.effect_slots)
      || Object.keys(authorityBoundary).length === 0
      || Object.values(authorityBoundary).some((value) => value !== false)
    ) {
      mismatches.push({
        mismatch_kind: 'native_helper_source_closure_invalid',
        file: descriptorPath,
        symbol: null,
        effect_kind: null,
        detail: 'native_helper_source_closure_requires_probe_v1_false_authority_and_effect_slots',
      });
      continue;
    }
    for (const [index, rawSlot] of sourceClosure.effect_slots.entries()) {
      const slot = record(rawSlot);
      const slotId = typeof slot.slot_id === 'string' ? slot.slot_id : '';
      const sourceRef = typeof slot.source_ref === 'string' ? slot.source_ref : '';
      const file = sourceRef ? exactDescriptorRelativeSource(descriptorPath, sourceRef) : null;
      const symbol = typeof slot.symbol === 'string' ? slot.symbol : '';
      const sourceDigest = typeof slot.source_digest === 'string' ? slot.source_digest : '';
      const effectKind = typeof slot.effect_kind === 'string'
        && Object.hasOwn(input.contract.effect_kinds, slot.effect_kind)
        ? slot.effect_kind as SourceClosureEffectKind
        : null;
      const targetPolicy = typeof slot.target_policy === 'string' && allowedTargetPolicies.has(slot.target_policy)
        ? slot.target_policy as SourceClosureAuditEntry['target_policy']
        : null;
      const allowedTargets = Array.isArray(slot.allowed_targets)
        ? slot.allowed_targets.filter((value): value is string => typeof value === 'string' && value.length > 0)
        : [];
      const pointer = `${descriptorPath}#/source_closure/effect_slots/${index}`;
      const commandTargetsValid = effectKind !== 'process_spawn' || (
        allowedTargets.length > 0
        && allowedTargets.every((target) => (
          requiredCommands.includes(target)
          && !/(?:^|[\s/])(?:codex|opl)(?:\s|$)/i.test(target)
        ))
        && (targetPolicy === 'literal_allowlist' || targetPolicy === 'declared_command_set')
      );
      const writeTargetValid = effectKind !== 'filesystem_write' || (
        targetPolicy === 'declared_artifact_write_slot'
        || (targetPolicy === 'literal_allowlist' && allowedTargets.length > 0)
      );
      if (
        !slotId
        || !file
        || !symbol
        || !sourceDigest
        || !effectKind
        || !allowedEffects.has(effectKind)
        || !targetPolicy
        || !commandTargetsValid
        || !writeTargetValid
        || !input.sourceDigests[file]
        || input.sourceDigests[file] !== sourceDigest
        || !input.symbols.some((candidate) => candidate.file === file && candidate.symbol === symbol)
      ) {
        mismatches.push({
          mismatch_kind: 'native_helper_effect_slot_invalid',
          file: file ?? descriptorPath,
          symbol: symbol || null,
          effect_kind: effectKind,
          detail: pointer,
        });
        continue;
      }
      entries.push({
        file,
        symbol,
        source_digest: sourceDigest,
        allowed_effects: [effectKind],
        role: 'native_helper_carrier',
        allowed_targets: allowedTargets,
        allowed_unresolved_edge_reasons: [],
        carrier_descriptor_ref: descriptorPath,
        carrier_slot_id: slotId,
        target_policy: targetPolicy,
      });
    }
  }
  return { entries, mismatches };
}

function parseAuditEntries(
  repoDir: string,
  contract: SourceClosureEffectContract,
  symbols: SourceClosureSymbol[],
  sourceDigests: Record<string, string>,
) {
  const document = auditDocument(repoDir, contract);
  const mismatches: SourceClosureAuditMismatch[] = [];
  if (document === null) {
    return { entries: [] as SourceClosureAuditEntry[], mismatches };
  }
  if (
    document.surface_kind !== 'standard_agent_source_closure_audit'
    || document.version !== 'standard-agent-source-closure-audit.v1'
    || !Array.isArray(document.entries)
  ) {
    mismatches.push({
      mismatch_kind: 'audit_shape_invalid',
      file: contract.audit_contract_path,
      symbol: null,
      effect_kind: null,
      detail: 'source_closure_audit_requires_exact_v1_entries',
    });
    return { entries: [] as SourceClosureAuditEntry[], mismatches };
  }
  const allowedKinds = new Set(Object.keys(contract.effect_kinds));
  const entries: SourceClosureAuditEntry[] = [];
  for (const [index, raw] of document.entries.entries()) {
    const candidate = record(raw);
    const file = typeof candidate.file === 'string' ? candidate.file : '';
    const symbol = typeof candidate.symbol === 'string' ? candidate.symbol : '';
    const sourceDigest = typeof candidate.source_digest === 'string' ? candidate.source_digest : '';
    const allowedEffects = Array.isArray(candidate.allowed_effects)
      ? candidate.allowed_effects.filter((item): item is SourceClosureEffectKind => (
          typeof item === 'string' && allowedKinds.has(item)
        ))
      : [];
    const role = candidate.role === 'developer_tool'
      ? 'developer_tool' as const
      : candidate.role === 'minimal_authority_function'
        ? 'minimal_authority_function' as const
        : null;
    const allowedTargets = Array.isArray(candidate.allowed_targets)
      ? candidate.allowed_targets.filter((item): item is string => typeof item === 'string')
      : [];
    const allowedUnresolvedEdgeReasons = Array.isArray(candidate.allowed_unresolved_edge_reasons)
      ? candidate.allowed_unresolved_edge_reasons.filter((item): item is string => (
          typeof item === 'string'
          && contract.audit_contract.allowed_unresolved_edge_reasons.includes(item)
        ))
      : [];
    const pointer = `${contract.audit_contract_path}#/entries/${index}`;
    if (
      !file
      || !symbol
      || !sourceDigest
      || !role
      || (allowedEffects.length === 0 && allowedUnresolvedEdgeReasons.length === 0)
    ) {
      mismatches.push({
        mismatch_kind: 'audit_shape_invalid',
        file: file || contract.audit_contract_path,
        symbol: symbol || null,
        effect_kind: null,
        detail: pointer,
      });
      continue;
    }
    const globallyForbiddenEffects = allowedEffects.filter((effect) => (
      contract.audit_contract.globally_forbidden_effects.includes(effect)
    ));
    const forbiddenRoleEffects = role === 'minimal_authority_function'
      ? allowedEffects.filter((effect) => (
          contract.audit_contract.minimal_authority_forbidden_effects.includes(effect)
        ))
      : [];
    if (globallyForbiddenEffects.length > 0 || forbiddenRoleEffects.length > 0) {
      for (const effectKind of [...new Set([...globallyForbiddenEffects, ...forbiddenRoleEffects])]) {
        mismatches.push({
          mismatch_kind: 'audit_role_effect_forbidden',
          file,
          symbol,
          effect_kind: effectKind,
          detail: globallyForbiddenEffects.includes(effectKind)
            ? `${pointer}:no_audit_role_can_authorize_${effectKind}`
            : `${pointer}:minimal_authority_function_cannot_authorize_${effectKind}`,
        });
      }
      continue;
    }
    if (/[*?{}[\]]/.test(file) || file.endsWith('/') || path.isAbsolute(file)) {
      mismatches.push({
        mismatch_kind: 'audit_path_not_exact',
        file,
        symbol,
        effect_kind: null,
        detail: pointer,
      });
      continue;
    }
    if (!sourceDigests[file]) {
      mismatches.push({
        mismatch_kind: 'audit_file_missing',
        file,
        symbol,
        effect_kind: null,
        detail: pointer,
      });
      continue;
    }
    if (!symbols.some((item) => item.file === file && item.symbol === symbol)) {
      mismatches.push({
        mismatch_kind: 'audit_symbol_missing',
        file,
        symbol,
        effect_kind: null,
        detail: pointer,
      });
      continue;
    }
    if (sourceDigests[file] !== sourceDigest) {
      mismatches.push({
        mismatch_kind: 'audit_digest_mismatch',
        file,
        symbol,
        effect_kind: null,
        detail: `${pointer}:expected=${sourceDigest}:observed=${sourceDigests[file]}`,
      });
      continue;
    }
    entries.push({
      file,
      symbol,
      source_digest: sourceDigest,
      allowed_effects: allowedEffects,
      role,
      allowed_targets: allowedTargets,
      allowed_unresolved_edge_reasons: allowedUnresolvedEdgeReasons,
      carrier_descriptor_ref: null,
      carrier_slot_id: null,
      target_policy: allowedTargets.length > 0 ? 'literal_allowlist' : null,
    });
  }
  return { entries, mismatches };
}

export function buildObservedEffects(input: {
  repoDir: string;
  calls: SourceClosureObservedCall[];
  symbols: SourceClosureSymbol[];
  sourceDigests: Record<string, string>;
  reachable: Set<string>;
  entrypoints: SourceClosureEntrypoint[];
  contract: SourceClosureEffectContract;
}) {
  const parsedAudit = parseAuditEntries(
    input.repoDir,
    input.contract,
    input.symbols,
    input.sourceDigests,
  );
  const nativeHelperAudit = nativeHelperAuditEntries({
    repoDir: input.repoDir,
    contract: input.contract,
    symbols: input.symbols,
    sourceDigests: input.sourceDigests,
    entrypoints: input.entrypoints,
  });
  const auditEntries = [...parsedAudit.entries, ...nativeHelperAudit.entries];
  const mismatches = [...parsedAudit.mismatches, ...nativeHelperAudit.mismatches];
  const observed: SourceClosureObservedEffect[] = [];
  const entrypointSymbols = new Set(input.entrypoints.flatMap((entry) => (
    entry.resolved_symbol_id ? [entry.resolved_symbol_id] : []
  )));
  for (const call of input.calls) {
    const symbol = input.symbols.find((item) => item.symbol_id === call.symbol_id);
    if (!symbol) {
      continue;
    }
    for (const effectKind of Object.keys(input.contract.effect_kinds) as SourceClosureEffectKind[]) {
      if (!matchesEffect(call, effectKind, input.contract)) {
        continue;
      }
      const target = effectTarget(call);
      const matchingAudit = auditEntries.find((entry) => (
        entry.file === symbol.file
        && entry.symbol === symbol.symbol
        && entry.allowed_effects.includes(effectKind)
      ));
      const targetAllowlistRequired = input.contract.audit_contract
        .target_allowlist_required_effects.includes(effectKind);
      const nativeCarrierTargetAllowed = matchingAudit?.role === 'native_helper_carrier' && (
        matchingAudit.target_policy === 'declared_artifact_write_slot'
        || matchingAudit.target_policy === 'declared_command_set'
          && (target === null || matchingAudit.allowed_targets.includes(target))
        || matchingAudit.target_policy === 'literal_allowlist'
          && target !== null
          && matchingAudit.allowed_targets.includes(target)
      );
      const targetAllowed = Boolean(matchingAudit) && (
        nativeCarrierTargetAllowed
        || (matchingAudit!.role !== 'native_helper_carrier' && (
          targetAllowlistRequired
            ? matchingAudit!.allowed_targets.length > 0
              && target !== null
              && matchingAudit!.allowed_targets.includes(target)
            : matchingAudit!.allowed_targets.length === 0
              || (target !== null && matchingAudit!.allowed_targets.includes(target))
        ))
      );
      const developerToolValid = matchingAudit?.role === 'developer_tool'
        && !input.reachable.has(symbol.symbol_id)
        && !entrypointSymbols.has(symbol.symbol_id);
      const nativeHelperCarrierValid = matchingAudit?.role === 'native_helper_carrier'
        && input.reachable.has(symbol.symbol_id);
      const auditStatus = matchingAudit && targetAllowed
        ? developerToolValid
          ? 'developer_tool_exact' as const
          : nativeHelperCarrierValid
            ? 'native_helper_carrier_exact' as const
          : matchingAudit.role === 'minimal_authority_function'
            ? 'allowed_exact' as const
            : 'unapproved' as const
        : 'unapproved' as const;
      if (!matchingAudit) {
        mismatches.push({
          mismatch_kind: 'effect_not_allowed',
          file: symbol.file,
          symbol: symbol.symbol,
          effect_kind: effectKind,
          detail: `${call.callee}@${call.line}`,
        });
      } else if (!targetAllowed) {
        mismatches.push({
          mismatch_kind: 'effect_target_not_allowed',
          file: symbol.file,
          symbol: symbol.symbol,
          effect_kind: effectKind,
          detail: `${target ?? '<dynamic-target>'}@${call.line}`,
        });
      } else if (matchingAudit.role === 'developer_tool' && !developerToolValid) {
        mismatches.push({
          mismatch_kind: 'effect_not_allowed',
          file: symbol.file,
          symbol: symbol.symbol,
          effect_kind: effectKind,
          detail: 'developer_tool_is_reachable_or_registered_entrypoint',
        });
      } else if (matchingAudit.role === 'native_helper_carrier' && !nativeHelperCarrierValid) {
        mismatches.push({
          mismatch_kind: 'effect_not_allowed',
          file: symbol.file,
          symbol: symbol.symbol,
          effect_kind: effectKind,
          detail: 'native_helper_carrier_effect_is_not_reachable_from_descriptor_entrypoint',
        });
      }
      observed.push({
        effect_id: sha256(`${symbol.symbol_id}:${call.line}:${effectKind}:${call.source_text}`).slice(0, 31),
        effect_kind: effectKind,
        file: symbol.file,
        symbol: symbol.symbol,
        line: call.line,
        callee: call.callee,
        target,
        source_digest: input.sourceDigests[symbol.file],
        reachable: input.reachable.has(symbol.symbol_id),
        audit_status: auditStatus,
        private_generic_effect: auditStatus === 'unapproved'
          && input.contract.effect_kinds[effectKind].private_generic_by_default,
      });
    }
  }
  for (const audit of auditEntries) {
    for (const effectKind of audit.allowed_effects) {
      if (!observed.some((effect) => (
        effect.file === audit.file
        && effect.symbol === audit.symbol
        && effect.effect_kind === effectKind
      ))) {
        mismatches.push({
          mismatch_kind: 'audit_effect_stale',
          file: audit.file,
          symbol: audit.symbol,
          effect_kind: effectKind,
          detail: 'authorized_effect_not_observed',
        });
      }
    }
  }
  return {
    observed_effects: observed.sort((left, right) => (
      `${left.file}:${left.line}:${left.effect_kind}`.localeCompare(`${right.file}:${right.line}:${right.effect_kind}`)
    )),
    audit_mismatches: mismatches,
    developer_tool_edge_exclusions: parsedAudit.entries.flatMap((audit) => {
      if (audit.role !== 'developer_tool' || audit.allowed_unresolved_edge_reasons.length === 0) {
        return [];
      }
      const symbol = input.symbols.find((candidate) => (
        candidate.file === audit.file && candidate.symbol === audit.symbol
      ));
      if (
        !symbol
        || input.reachable.has(symbol.symbol_id)
        || entrypointSymbols.has(symbol.symbol_id)
      ) {
        return [];
      }
      return [{
        symbol_id: symbol.symbol_id,
        allowed_reasons: audit.allowed_unresolved_edge_reasons,
      }];
    }),
  };
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonical);
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value as JsonRecord)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonical(child)]));
  }
  return value;
}

export function buildClosureDigest(value: unknown) {
  return sha256(JSON.stringify(canonical(value)));
}
